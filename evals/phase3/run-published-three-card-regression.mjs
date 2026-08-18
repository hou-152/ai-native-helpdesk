#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { hasOnlySafeCandidateKeys } from "../../evals/retrieval/retrieval.mjs";
import { rankCandidatesV2, safeCandidatesFor } from "../../evals/retrieval/v2/retrieval-v2.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PHASE3_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_DATASET = path.join(PHASE3_DIR, "published-three-card-regression.v1.json");
const DEFAULT_FIXTURE = path.join(PHASE3_DIR, "published-retrieval-fixture.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

export function runRegression(dataset, fixture) {
  const fixtureToPublic = new Map(fixture.cards.map((card) => [card.card_id, card.public_card_id]));
  const rows = [];

  for (const item of dataset.cases) {
    if (item.stage === "PRE_RECALL") {
      rows.push({
        case_id: item.case_id,
        stage: item.stage,
        expected_status: item.expected_status,
        predicted_status: "NEEDS_INPUT",
        selected_public_card_ids: [],
        target_covered: true,
        exact_set: true,
        retrieval_invoked: false,
        safe_output: true,
        passed: item.expected_status === "NEEDS_INPUT"
      });
      continue;
    }

    const rawRanking = rankCandidatesV2({
      query: item.query,
      fixture,
      algorithm: dataset.algorithm
    });
    const publicRanking = rawRanking.map((candidate) => ({
      ...candidate,
      card_id: fixtureToPublic.get(candidate.card_id)
    }));
    const candidates = safeCandidatesFor(publicRanking, dataset.threshold);
    const selected = candidates.map((candidate) => candidate.card_id);
    const targetCovered = item.expected_public_card_ids.every((cardId) => selected.includes(cardId));
    const exactSet = sameSet(selected, item.expected_public_card_ids);
    const predictedStatus = selected.length === 0 ? "MISS" : selected.length === 1 ? "CANDIDATE" : "CLARIFY";
    const statusPassed = item.expected_status === "MISS"
      ? selected.length === 0
      : item.expected_status === "CLARIFY"
        ? predictedStatus === "CLARIFY" && targetCovered
        : targetCovered;
    const passed = statusPassed && (!item.exact_set_required || exactSet);

    rows.push({
      case_id: item.case_id,
      stage: item.stage,
      expected_status: item.expected_status,
      predicted_status: predictedStatus,
      selected_public_card_ids: selected,
      target_covered: targetCovered,
      exact_set: exactSet,
      retrieval_invoked: true,
      safe_output: candidates.every(hasOnlySafeCandidateKeys),
      passed
    });
  }

  const recall = rows.filter((row) => row.stage === "RECALL");
  const candidates = recall.filter((_, index) => dataset.cases.filter((item) => item.stage === "RECALL")[index].expected_status === "CANDIDATE");
  const clarifies = recall.filter((_, index) => dataset.cases.filter((item) => item.stage === "RECALL")[index].expected_status === "CLARIFY");
  const misses = recall.filter((_, index) => dataset.cases.filter((item) => item.stage === "RECALL")[index].expected_status === "MISS");
  const exactRequiredIds = new Set(dataset.cases.filter((item) => item.stage === "RECALL" && item.exact_set_required).map((item) => item.case_id));
  const exactRequired = recall.filter((row) => exactRequiredIds.has(row.case_id));
  const hardNegativeIds = new Set(dataset.cases.filter((item) => item.tags.includes("hard-negative")).map((item) => item.case_id));
  const hardNegatives = recall.filter((row) => hardNegativeIds.has(row.case_id));
  const preRecall = rows.filter((row) => row.stage === "PRE_RECALL");
  const codexIds = new Set(dataset.cases.filter((item) => item.tags.includes("codex")).map((item) => item.case_id));
  const openclawIds = new Set(dataset.cases.filter((item) => item.tags.includes("openclaw") && !item.tags.includes("wrong-topic")).map((item) => item.case_id));
  const crossDomainFalsePositiveCount = recall.filter((row) =>
    (codexIds.has(row.case_id) && row.selected_public_card_ids.includes("AIHD-PC-000003")) ||
    (openclawIds.has(row.case_id) && row.selected_public_card_ids.some((id) => id !== "AIHD-PC-000003"))
  ).length;

  const metrics = {
    counts: {
      total: rows.length,
      recall: recall.length,
      candidate: candidates.length,
      clarify: clarifies.length,
      miss: misses.length,
      pre_recall: preRecall.length
    },
    candidate_target_hit_rate: rate(candidates.filter((row) => row.target_covered).length, candidates.length),
    exact_required_rate: rate(exactRequired.filter((row) => row.exact_set).length, exactRequired.length),
    clarify_full_coverage_rate: rate(clarifies.filter((row) => row.target_covered).length, clarifies.length),
    miss_false_positive_count: misses.filter((row) => row.selected_public_card_ids.length > 0).length,
    hard_negative_false_positive_count: hardNegatives.filter((row) => row.selected_public_card_ids.length > 0).length,
    pre_recall_bypass_rate: rate(preRecall.filter((row) => !row.retrieval_invoked).length, preRecall.length),
    safe_output_rate: rate(rows.filter((row) => row.safe_output).length, rows.length),
    cross_domain_false_positive_count: crossDomainFalsePositiveCount,
    passed_count: rows.filter((row) => row.passed).length,
    failed_case_ids: rows.filter((row) => !row.passed).map((row) => row.case_id)
  };
  const qualified = Object.entries(dataset.acceptance).every(([key, expected]) => metrics[key] === expected) &&
    metrics.failed_case_ids.length === 0;

  return {
    schema_version: "1.0",
    dataset_id: dataset.dataset_id,
    fixture_id: fixture.fixture_id,
    evidence_class: dataset.evidence_class,
    algorithm: dataset.algorithm,
    threshold: dataset.threshold,
    top_k: dataset.top_k,
    qualified,
    metrics,
    rows
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const dataset = readJson(DEFAULT_DATASET);
  const fixture = readJson(DEFAULT_FIXTURE);
  process.stdout.write(`${JSON.stringify(runRegression(dataset, fixture), null, 2)}\n`);
}
