#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { evaluateAtThreshold, validateDataset } from "../retrieval.mjs";
import {
  V2_ALGORITHMS,
  buildRankings,
  calibrateObserved,
  holdoutGate
} from "./retrieval-v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const V1_DATASET = path.join(HERE, "../golden.v1.json");
const FIXTURE = path.join(HERE, "../fixture-index.v1.json");
const V1_CONFIG = path.join(HERE, "../frozen-config.json");
const V1_BLIND_REPORT = path.join(HERE, "../blind-report.json");
const V1_RETRIEVAL = path.join(HERE, "../retrieval.mjs");
const V1_RUNNER = path.join(HERE, "../run-eval.mjs");
const SPEC = path.join(HERE, "holdout-spec.v2.json");
const HOLDOUT = path.join(HERE, "holdout.v2.json");
const CONFIG = path.join(HERE, "frozen-config.v2.json");

const PROTECTED_HASHES = Object.freeze({
  "evals/retrieval/golden.v1.json": "7b37a9a301b6b570e7c87578694df5dbef90b3720e62fb6b1dbdd0531965b51c",
  "evals/retrieval/fixture-index.v1.json": "3c00560b888b013621d54c7ee55a977e3c5b2a9bcb9464b190a06aa4aada06fe",
  "evals/retrieval/frozen-config.json": "8e1575a2ef277cb5a328d0f6f76447eeb927e6db54122452ca7d18a4c5bab235",
  "evals/retrieval/blind-report.json": "43a45e08970a343ead846013e40f734fc183dcdbf5f355b3050bbe9877fce47b",
  "evals/retrieval/retrieval.mjs": "e451c4ece1b28c4a92fd718033c14bbd701ae27413cbb89b474271d4dec93fdf",
  "evals/retrieval/run-eval.mjs": "d68176eb433d9b0392558896aecac9c1c514dac17e5dbf9befd89996f7c606c2"
});

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--stage" || !["observed", "holdout"].includes(argv[1])) {
    throw new Error("USAGE: --stage observed|holdout");
  }
  return argv[1];
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function parseJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error("GIT_HEAD_UNAVAILABLE");
  return result.stdout.trim();
}

function verifyProtected() {
  for (const [relativePath, expected] of Object.entries(PROTECTED_HASHES)) {
    if (sha256(path.join(REPO_ROOT, relativePath)) !== expected) {
      throw new Error(`V1_PROTECTED_HASH_DRIFT:${relativePath}`);
    }
  }
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
    hard_negative_false_positive_count: metrics.hard_negative_false_positive_count,
    deny_bypass_rate: round(metrics.deny_bypass_rate),
    safe_output_rate: round(metrics.safe_output_rate),
    passed_count: metrics.passed_count,
    failed_case_ids: metrics.failed_case_ids,
    rows: metrics.rows
  };
}

function validateHoldout(dataset, fixture) {
  if (
    dataset?.schema_version !== "2.0" ||
    dataset?.dataset_id !== "aihd-retrieval-holdout-v2" ||
    !Array.isArray(dataset.cases) ||
    dataset.cases.length !== 30
  ) {
    throw new Error("V2_HOLDOUT_INVALID");
  }
  const cardIds = new Set(fixture.cards.map((card) => card.card_id));
  const caseIds = new Set();
  for (const item of dataset.cases) {
    if (!/^RET-V2-B-\d{3}$/.test(item.case_id) || caseIds.has(item.case_id) || item.split !== "HOLDOUT") {
      throw new Error("V2_HOLDOUT_CASE_INVALID");
    }
    caseIds.add(item.case_id);
    for (const cardId of item.expected_candidates) if (!cardIds.has(cardId)) throw new Error("V2_HOLDOUT_CARD_INVALID");
    const deny = item.expected_status === "DENY";
    if (deny !== item.precondition.startsWith("DENY_")) throw new Error("V2_HOLDOUT_PRECONDITION_INVALID");
  }
  const counts = Object.fromEntries(["CANDIDATE", "CLARIFY", "MISS", "DENY"].map((status) => [
    status,
    dataset.cases.filter((item) => item.expected_status === status).length
  ]));
  if (counts.CANDIDATE !== 15 || counts.CLARIFY !== 6 || counts.MISS !== 6 || counts.DENY !== 3) {
    throw new Error("V2_HOLDOUT_DISTRIBUTION_INVALID");
  }
  return dataset;
}

function runObserved(dataset, fixture) {
  if (fs.existsSync(HOLDOUT)) throw new Error("V2_HOLDOUT_ALREADY_GENERATED");
  const algorithms = {};
  const thresholds = {};
  for (const algorithm of V2_ALGORITHMS) {
    const rankings = buildRankings(dataset.cases, fixture, algorithm);
    const calibrated = calibrateObserved(dataset.cases, rankings);
    algorithms[algorithm] = {
      qualified: calibrated.qualified,
      threshold: round(calibrated.threshold),
      positive_floor: round(calibrated.positive_floor),
      negative_ceiling: round(calibrated.negative_ceiling),
      separation: round(calibrated.separation),
      positive_floor_rows: calibrated.positive_floor_rows,
      negative_ceiling_rows: calibrated.negative_ceiling_rows,
      metrics: summarizeMetrics(calibrated.metrics)
    };
    thresholds[algorithm] = {
      qualified: calibrated.qualified,
      threshold: calibrated.threshold,
      positive_floor: calibrated.positive_floor,
      negative_ceiling: calibrated.negative_ceiling,
      separation: calibrated.separation
    };
  }
  const report = {
    schema_version: "2.0",
    stage: "OBSERVED_REGRESSION",
    case_count: dataset.cases.length,
    protected_hashes: PROTECTED_HASHES,
    holdout_present: false,
    algorithms
  };
  const config = {
    schema_version: "2.0",
    protocol_commit: "1182bd632f27752a15a22fbff7549b348f9eb27d",
    fixture_sha256: sha256(FIXTURE),
    observed_dataset_sha256: sha256(V1_DATASET),
    holdout_spec_sha256: sha256(SPEC),
    threshold_rule: "MIDPOINT_WITH_MINIMUM_0.05_SEPARATION",
    top_k: 3,
    thresholds
  };
  writeJson(path.join(HERE, "observed-report.v2.json"), report);
  writeJson(CONFIG, config);
  return { report, config };
}

function frontRunner(entries) {
  const simplicity = new Map(V2_ALGORITHMS.map((name, index) => [name, index]));
  const passing = entries.filter((entry) => entry.observed_qualified && entry.holdout_gate_passed);
  passing.sort((left, right) =>
    right.metrics.clarify_full_coverage_at_3 - left.metrics.clarify_full_coverage_at_3 ||
    right.metrics.candidate_hit_at_3 - left.metrics.candidate_hit_at_3 ||
    right.metrics.candidate_exact_set_rate - left.metrics.candidate_exact_set_rate ||
    simplicity.get(left.algorithm) - simplicity.get(right.algorithm)
  );
  return passing[0]?.algorithm ?? null;
}

function runHoldout(dataset, fixture) {
  if (!fs.existsSync(CONFIG)) throw new Error("V2_FROZEN_CONFIG_REQUIRED");
  const config = parseJson(CONFIG);
  if (config.holdout_spec_sha256 !== sha256(SPEC)) throw new Error("V2_HOLDOUT_SPEC_DRIFT");
  if (dataset.generation?.spec_sha256 !== sha256(SPEC)) throw new Error("V2_HOLDOUT_SPEC_MISMATCH");
  if (dataset.generation?.implementation_commit !== currentHead()) throw new Error("V2_IMPLEMENTATION_COMMIT_NOT_HEAD");
  const algorithms = {};
  const entries = [];
  for (const algorithm of V2_ALGORITHMS) {
    const frozen = config.thresholds?.[algorithm];
    if (!frozen) throw new Error(`V2_THRESHOLD_MISSING:${algorithm}`);
    const rankings = buildRankings(dataset.cases, fixture, algorithm);
    const metrics = evaluateAtThreshold(dataset.cases, rankings, frozen.threshold, config.top_k);
    const entry = {
      algorithm,
      observed_qualified: frozen.qualified,
      threshold: frozen.threshold,
      holdout_gate_passed: frozen.qualified && holdoutGate(metrics),
      metrics: summarizeMetrics(metrics)
    };
    algorithms[algorithm] = entry;
    entries.push(entry);
  }
  const report = {
    schema_version: "2.0",
    stage: "HOLDOUT",
    case_count: dataset.cases.length,
    implementation_commit: dataset.generation.implementation_commit,
    holdout_sha256: sha256(HOLDOUT),
    config_sha256: sha256(CONFIG),
    spec_sha256: sha256(SPEC),
    protected_hashes: PROTECTED_HASHES,
    algorithms,
    mechanical_front_runner: frontRunner(entries),
    evidence_boundary: "commit_seeded_prospective_synthetic_holdout",
    owner_gate: "G10_REVIEW_REQUIRED"
  };
  writeJson(path.join(HERE, "holdout-report.v2.json"), report);
  return report;
}

function main() {
  const stage = parseArguments(process.argv.slice(2));
  verifyProtected();
  const fixture = parseJson(FIXTURE);
  const v1Dataset = parseJson(V1_DATASET);
  validateDataset(v1Dataset, fixture);
  const result = stage === "observed"
    ? runObserved(v1Dataset, fixture)
    : runHoldout(validateHoldout(parseJson(HOLDOUT), fixture), fixture);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
