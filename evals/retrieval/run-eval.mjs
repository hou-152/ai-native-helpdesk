#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runAppleEmbedding } from "./apple-embedding.mjs";
import {
  ALGORITHMS,
  HYBRID_WEIGHTS,
  TOP_K,
  evaluateAtThreshold,
  passesBlindGate,
  rankCandidates,
  tuneThreshold,
  validateDataset
} from "./retrieval.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = path.join(HERE, "golden.v1.json");
const FIXTURE_PATH = path.join(HERE, "fixture-index.v1.json");

function parseArguments(argv) {
  const options = { stage: null, outputDir: HERE };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--stage") options.stage = argv[++index];
    else if (token === "--output-dir") options.outputDir = path.resolve(argv[++index]);
    else throw new Error(`UNKNOWN_ARGUMENT:${token}`);
  }
  if (!new Set(["design", "blind"]).has(options.stage)) throw new Error("STAGE_REQUIRED");
  return options;
}

function parseJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function round(value) {
  return value === null ? null : Number(value.toFixed(12));
}

function summarizeMetrics(metrics) {
  return {
    threshold: round(metrics.threshold),
    counts: metrics.counts,
    candidate_hit_at_3: round(metrics.candidate_hit_at_3),
    candidate_exact_set_rate: round(metrics.candidate_exact_set_rate),
    clarify_full_coverage_at_3: round(metrics.clarify_full_coverage_at_3),
    clarify_exact_set_rate: round(metrics.clarify_exact_set_rate),
    miss_false_positive_count: metrics.miss_false_positive_count,
    miss_false_positive_rate: round(metrics.miss_false_positive_rate),
    hard_negative_false_positive_count: metrics.hard_negative_false_positive_count,
    hard_negative_false_positive_rate: round(metrics.hard_negative_false_positive_rate),
    deny_bypass_rate: round(metrics.deny_bypass_rate),
    safe_output_rate: round(metrics.safe_output_rate),
    passed_count: metrics.passed_count,
    failed_case_ids: metrics.failed_case_ids,
    rows: metrics.rows
  };
}

function buildRankings(cases, fixture, algorithm, embedding) {
  const result = new Map();
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    if (item.precondition !== "ELIGIBLE") continue;
    result.set(item.case_id, rankCandidates({
      query: item.query,
      fixture,
      algorithm,
      embeddingScores: embedding?.rows[index]
    }));
  }
  return result;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function unavailableEntry(reason) {
  return { available: false, reason };
}

function runDesign(dataset, fixture, options) {
  const cases = dataset.cases.filter((item) => item.split === "DESIGN");
  const embedding = runAppleEmbedding(cases.map((item) => item.query), fixture);
  const algorithms = {};
  const thresholds = {};
  for (const algorithm of ALGORITHMS) {
    if (["apple_nl_embedding_zh", "hybrid"].includes(algorithm) && !embedding.available) {
      algorithms[algorithm] = unavailableEntry(embedding.reason);
      thresholds[algorithm] = unavailableEntry(embedding.reason);
      continue;
    }
    const rankings = buildRankings(cases, fixture, algorithm, embedding);
    const tuned = tuneThreshold(cases, rankings, TOP_K);
    const metrics = summarizeMetrics(tuned.metrics);
    algorithms[algorithm] = { available: true, metrics };
    thresholds[algorithm] = {
      available: true,
      threshold: tuned.threshold,
      design_candidate_hit_at_3: metrics.candidate_hit_at_3,
      design_clarify_full_coverage_at_3: metrics.clarify_full_coverage_at_3,
      design_hard_gates_passed:
        metrics.deny_bypass_rate === 1 &&
        metrics.safe_output_rate === 1 &&
        metrics.hard_negative_false_positive_count === 0 &&
        metrics.miss_false_positive_count === 0
    };
  }
  const hashes = { dataset_sha256: sha256(DATASET_PATH), fixture_sha256: sha256(FIXTURE_PATH) };
  const report = {
    schema_version: "1.0",
    stage: "DESIGN",
    dataset_id: dataset.dataset_id,
    case_count: cases.length,
    hashes,
    evidence_boundary: "synthetic_fixture_plus_one_existing_public_card",
    apple_embedding: {
      available: embedding.available,
      implementation: embedding.implementation ?? "apple_nl_embedding_zh",
      distance_conversion: embedding.distance_conversion ?? null,
      reason: embedding.reason ?? null
    },
    algorithms
  };
  const config = {
    schema_version: "1.0",
    dataset_id: dataset.dataset_id,
    hashes,
    top_k: TOP_K,
    hybrid_weights: HYBRID_WEIGHTS,
    threshold_selection: "DESIGN_ONLY_HARD_GATES_THEN_CANDIDATE_CLARIFY_EXACT_HIGHER_THRESHOLD",
    thresholds
  };
  writeJson(path.join(options.outputDir, "design-report.json"), report);
  writeJson(path.join(options.outputDir, "frozen-config.json"), config);
  return { report, config };
}

function mechanicalFrontRunner(entries) {
  const portabilityOrder = new Map([
    ["bm25", 0],
    ["char_ngram", 1],
    ["hybrid", 2],
    ["apple_nl_embedding_zh", 3]
  ]);
  const passing = entries.filter((entry) => entry.available && entry.blind_gate_passed);
  passing.sort((left, right) =>
    right.metrics.candidate_hit_at_3 - left.metrics.candidate_hit_at_3 ||
    right.metrics.clarify_full_coverage_at_3 - left.metrics.clarify_full_coverage_at_3 ||
    right.metrics.candidate_exact_set_rate - left.metrics.candidate_exact_set_rate ||
    portabilityOrder.get(left.algorithm) - portabilityOrder.get(right.algorithm)
  );
  return passing[0]?.algorithm ?? null;
}

function runBlind(dataset, fixture, options) {
  const configPath = path.join(options.outputDir, "frozen-config.json");
  if (!fs.existsSync(configPath)) throw new Error("FROZEN_CONFIG_REQUIRED");
  const config = parseJson(configPath);
  const currentHashes = { dataset_sha256: sha256(DATASET_PATH), fixture_sha256: sha256(FIXTURE_PATH) };
  if (
    config.hashes?.dataset_sha256 !== currentHashes.dataset_sha256 ||
    config.hashes?.fixture_sha256 !== currentHashes.fixture_sha256
  ) {
    throw new Error("FROZEN_INPUT_DRIFT");
  }
  const cases = dataset.cases.filter((item) => item.split === "BLIND");
  const embedding = runAppleEmbedding(cases.map((item) => item.query), fixture);
  const algorithms = {};
  const entries = [];
  for (const algorithm of ALGORITHMS) {
    const frozen = config.thresholds?.[algorithm];
    if (!frozen?.available) {
      algorithms[algorithm] = unavailableEntry(frozen?.reason ?? "NOT_FROZEN");
      entries.push({ algorithm, available: false, blind_gate_passed: false });
      continue;
    }
    if (["apple_nl_embedding_zh", "hybrid"].includes(algorithm) && !embedding.available) {
      algorithms[algorithm] = unavailableEntry(embedding.reason);
      entries.push({ algorithm, available: false, blind_gate_passed: false });
      continue;
    }
    const rankings = buildRankings(cases, fixture, algorithm, embedding);
    const metrics = evaluateAtThreshold(cases, rankings, frozen.threshold, config.top_k);
    const summarized = summarizeMetrics(metrics);
    const entry = {
      algorithm,
      available: true,
      threshold: frozen.threshold,
      blind_gate_passed: passesBlindGate(metrics),
      metrics: summarized
    };
    algorithms[algorithm] = entry;
    entries.push(entry);
  }
  const report = {
    schema_version: "1.0",
    stage: "BLIND",
    dataset_id: dataset.dataset_id,
    case_count: cases.length,
    hashes: currentHashes,
    config_sha256: sha256(configPath),
    evidence_boundary: "synthetic_fixture_plus_one_existing_public_card",
    apple_embedding: {
      available: embedding.available,
      implementation: embedding.implementation ?? "apple_nl_embedding_zh",
      distance_conversion: embedding.distance_conversion ?? null,
      reason: embedding.reason ?? null
    },
    algorithms,
    mechanical_front_runner: mechanicalFrontRunner(entries),
    owner_gate: "G10_REQUIRED"
  };
  writeJson(path.join(options.outputDir, "blind-report.json"), report);
  return report;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const dataset = parseJson(DATASET_PATH);
  const fixture = parseJson(FIXTURE_PATH);
  validateDataset(dataset, fixture);
  const result = options.stage === "design"
    ? runDesign(dataset, fixture, options)
    : runBlind(dataset, fixture, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
