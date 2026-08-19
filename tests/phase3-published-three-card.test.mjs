import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runRegression } from "../evals/phase3/run-published-three-card-regression.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

const index = readJson("knowledge/archive/index.json");
const receipt = readJson("evals/phase3/G12_PUBLICATION_RECEIPT.json");
const fixture = readJson("evals/phase3/published-retrieval-fixture.v1.json");
const dataset = readJson("evals/phase3/published-three-card-regression.v1.json");
const frozenReport = readJson("evals/phase3/published-three-card-report.v1.json");
const candidates = new Map([
  ["AIHD-PC-000002", readJson("evals/phase3/candidates/AIHD-PC-000002.candidate.json")],
  ["AIHD-PC-000003", readJson("evals/phase3/candidates/AIHD-PC-000003.candidate.json")]
]);

test("G12 receipt records three individually approved revisions and full human QA", () => {
  assert.equal(receipt.owner_decision, "APPROVED");
  assert.equal(receipt.human_qa_policy, "ALL_CARDS_100_PERCENT");
  assert.deepEqual(receipt.cards.map((card) => [card.card_id, card.revision]), [
    ["AIHD-PC-000001", "1.1.0"],
    ["AIHD-PC-000002", "1.0.0"],
    ["AIHD-PC-000003", "1.0.0"]
  ]);
  assert.equal(receipt.cards.every((card) =>
    card.human_qa === "PASS" &&
    card.editorial === "APPROVED" &&
    card.verification === "PASS" &&
    card.privacy_gate === "PASS" &&
    card.publication === "READY"
  ), true);
});

test("public index preserves the three G12-approved card revisions and hashes", () => {
  const approvedIds = new Set(receipt.cards.map((card) => card.card_id));
  const g12Entries = index.cards.filter((entry) => approvedIds.has(entry.card_id));
  assert.deepEqual(g12Entries.map((entry) => entry.card_id), receipt.cards.map((card) => card.card_id));
  for (const entry of g12Entries) {
    const text = readText(`knowledge/archive/${entry.file}`);
    const card = JSON.parse(text);
    const approved = receipt.cards.find((item) => item.card_id === card.card_id);
    assert.equal(card.revision, entry.revision);
    assert.equal(card.revision, approved.revision);
    assert.equal(sha256(text), entry.content_sha256);
    assert.equal(sha256(text), approved.content_sha256);
  }
});

for (const cardId of ["AIHD-PC-000002", "AIHD-PC-000003"]) {
  test(`${cardId} published content preserves the G12-approved candidate fields`, () => {
    const card = readJson(`knowledge/archive/cards/${cardId}.json`);
    const publicFields = Object.fromEntries(Object.entries(card).filter(([key]) =>
      !["editorial", "verification", "privacy_gate", "publication"].includes(key)
    ));
    assert.deepEqual(publicFields, candidates.get(cardId).proposed_public_fields);
  });
}

test("published retrieval fixture is an exact safe projection of the three actual cards", () => {
  assert.equal(fixture.cards.length, 3);
  for (const item of fixture.cards) {
    const card = readJson(`knowledge/archive/cards/${item.public_card_id}.json`);
    assert.equal(item.fixture_origin, "published_public_card");
    assert.equal(item.public_question, card.question);
    assert.equal(item.scope_hint, card.scope_hint);
    assert.deepEqual(item.retrieval_aliases, card.aliases);
  }
});

test("published three-card observed acceptance regression passes every frozen gate", () => {
  const report = runRegression(dataset, fixture);
  assert.equal(report.qualified, true);
  assert.equal(report.metrics.failed_case_ids.length, 0);
  assert.equal(report.metrics.passed_count, 15);
  assert.equal(report.metrics.candidate_target_hit_rate, 1);
  assert.equal(report.metrics.exact_required_rate, 1);
  assert.equal(report.metrics.clarify_full_coverage_rate, 1);
  assert.equal(report.metrics.miss_false_positive_count, 0);
  assert.equal(report.metrics.hard_negative_false_positive_count, 0);
  assert.equal(report.metrics.pre_recall_bypass_rate, 1);
  assert.equal(report.metrics.safe_output_rate, 1);
  assert.equal(report.metrics.cross_domain_false_positive_count, 0);
  assert.deepEqual(frozenReport.metrics, report.metrics);
  assert.equal(frozenReport.qualified, report.qualified);
});

test("allowed Codex over-recall remains visible for downstream applicability adjudication", () => {
  const report = runRegression(dataset, fixture);
  const row = report.rows.find((item) => item.case_id === "REAL-R09");
  assert.deepEqual(row.selected_public_card_ids, ["AIHD-PC-000002", "AIHD-PC-000001"]);
  assert.equal(row.target_covered, true);
  assert.equal(row.exact_set, false);
  assert.equal(row.passed, true);
});
