#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { hasOnlySafeCandidateKeys } from "../retrieval/retrieval.mjs";
import { rankCandidatesV2, safeCandidatesFor } from "../retrieval/v2/retrieval-v2.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PHASE6_DIR = path.dirname(SCRIPT_PATH);
const REPO_ROOT = path.resolve(PHASE6_DIR, "../..");
const DEFAULT_DATASET = path.join(PHASE6_DIR, "published-eight-card-regression.v1.json");
const DEFAULT_INDEX = path.join(REPO_ROOT, "knowledge/public/index.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((item) => expected.has(item));
}

export function buildFixture(index) {
  if (index?.schema_version !== "0.4" || !Array.isArray(index.cards) || index.cards.length !== 8) {
    throw new Error("EIGHT_CARD_INDEX_REQUIRED");
  }
  return {
    schema_version: "1.0",
    fixture_id: "aihd-phase6-published-eight-card-fixture-v1",
    claim_boundary: "safe_metadata_projection_of_local_branch_public_index",
    cards: index.cards.map((entry) => ({
      card_id: entry.card_id,
      public_card_id: entry.card_id,
      public_question: entry.question,
      retrieval_aliases: entry.aliases,
      scope_hint: entry.scope_hint,
      fixture_origin: "published_public_card"
    }))
  };
}

export function runRegression(dataset, index) {
  if (
    dataset?.schema_version !== "1.0" ||
    dataset?.dataset_id !== "aihd-phase6-published-eight-card-regression-v1" ||
    !Array.isArray(dataset.cases) ||
    dataset.cases.length !== 25
  ) {
    throw new Error("PHASE6_REGRESSION_DATASET_INVALID");
  }

  const fixture = buildFixture(index);
  const rows = dataset.cases.map((item) => {
    const ranking = rankCandidatesV2({ query: item.query, fixture, algorithm: dataset.algorithm });
    const candidates = safeCandidatesFor(ranking, dataset.threshold);
    const selected = candidates.map((candidate) => candidate.card_id);
    const hasTarget = item.expected_public_card_ids.every((cardId) => selected.includes(cardId));
    const exactSet = sameSet(selected, item.expected_public_card_ids);
    const expectedMiss = item.expected_public_card_ids.length === 0;
    const passed = expectedMiss ? selected.length === 0 : hasTarget && exactSet && selected.length === 1;
    return {
      case_id: item.case_id,
      expected_public_card_ids: item.expected_public_card_ids,
      selected_public_card_ids: selected,
      target_covered: hasTarget,
      exact_set: exactSet,
      safe_output: candidates.every(hasOnlySafeCandidateKeys),
      passed
    };
  });

  const targets = rows.filter((row) => row.expected_public_card_ids.length === 1);
  const misses = rows.filter((row) => row.expected_public_card_ids.length === 0);
  const safeCount = rows.filter((row) => row.safe_output).length;
  const metrics = {
    total_cases: rows.length,
    target_cases: targets.length,
    target_hit: targets.filter((row) => row.target_covered).length,
    exact_single_target: targets.filter((row) => row.exact_set && row.selected_public_card_ids.length === 1).length,
    over_recall: targets.filter((row) => row.selected_public_card_ids.length > 1).length,
    miss_false_positive: misses.filter((row) => row.selected_public_card_ids.length > 0).length,
    safe_output_rate: rows.length === 0 ? null : safeCount / rows.length,
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
    claim_boundary: dataset.claim_boundary,
    qualified,
    metrics,
    rows
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const report = runRegression(readJson(DEFAULT_DATASET), readJson(DEFAULT_INDEX));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
