import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runAppleEmbedding } from "../evals/retrieval/apple-embedding.mjs";
import {
  ALGORITHMS,
  evaluateAtThreshold,
  hasOnlySafeCandidateKeys,
  rankCandidates,
  selectCandidates,
  tuneThreshold,
  validateDataset
} from "../evals/retrieval/retrieval.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/retrieval/golden.v1.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/retrieval/fixture-index.v1.json"), "utf8"));

test("frozen retrieval dataset has 40 design and 20 blind cases", () => {
  assert.equal(validateDataset(dataset, fixture), dataset);
  assert.equal(dataset.cases.length, 60);
  assert.equal(dataset.cases.filter((item) => item.split === "DESIGN").length, 40);
  assert.equal(dataset.cases.filter((item) => item.split === "BLIND").length, 20);
  assert.equal(new Set(dataset.cases.map((item) => item.case_id)).size, 60);
});

test("candidate projection exposes only the G5 safe metadata whitelist", () => {
  const ranking = rankCandidates({
    query: "怎样验证 Codex 已读取项目规则？",
    fixture,
    algorithm: "char_ngram"
  });
  const candidates = selectCandidates(ranking, 0, 3);
  assert.equal(candidates.length, 3);
  for (const candidate of candidates) {
    assert.equal(hasOnlySafeCandidateKeys(candidate), true);
    assert.deepEqual(Object.keys(candidate).sort(), ["card_id", "public_question", "scope_hint"]);
    assert.equal("score" in candidate, false);
    assert.equal("retrieval_aliases" in candidate, false);
    assert.equal("answer" in candidate, false);
  }
});

test("DENY precondition bypasses retrieval even for an exact semantic match", () => {
  const item = dataset.cases.find((candidate) => candidate.case_id === "RET-D-039");
  const explosive = new Map();
  explosive.set(item.case_id, [{
    card_id: "FIX-CODEX-AGENTS",
    public_question: "should never project",
    scope_hint: "should never project",
    score: 1
  }]);
  const metrics = evaluateAtThreshold([item], explosive, 0, 3);
  assert.equal(metrics.deny_bypass_rate, 1);
  assert.equal(metrics.rows[0].retrieval_invoked, false);
  assert.deepEqual(metrics.rows[0].selected_candidate_ids, []);
});

test("threshold selection is unaffected by blind labels", () => {
  const design = dataset.cases.filter((item) => item.split === "DESIGN");
  const makeRankings = () => new Map(design
    .filter((item) => item.precondition === "ELIGIBLE")
    .map((item) => [item.case_id, rankCandidates({ query: item.query, fixture, algorithm: "char_ngram" })]));
  const original = tuneThreshold(design, makeRankings());
  const mutatedDataset = structuredClone(dataset);
  for (const item of mutatedDataset.cases.filter((candidate) => candidate.split === "BLIND")) {
    item.expected_status = "MISS";
    item.expected_candidates = [];
    item.precondition = "ELIGIBLE";
  }
  const mutatedDesign = mutatedDataset.cases.filter((item) => item.split === "DESIGN");
  const mutated = tuneThreshold(mutatedDesign, makeRankings());
  assert.equal(mutated.threshold, original.threshold);
  assert.equal(mutated.metrics.candidate_hit_at_3, original.metrics.candidate_hit_at_3);
});

test("all declared lexical algorithms rank the exact AGENTS fixture first", () => {
  for (const algorithm of ALGORITHMS.filter((name) => !name.includes("embedding") && name !== "hybrid")) {
    const ranking = rankCandidates({
      query: "写进 AGENTS.md 的规则，怎样确认在 Codex 中生效？",
      fixture,
      algorithm
    });
    assert.equal(ranking[0].card_id, "FIX-CODEX-AGENTS");
  }
});

test("explicit README identifier cannot retrieve AGENTS-only candidates", () => {
  for (const algorithm of ["char_ngram", "bm25"]) {
    const ranking = rankCandidates({
      query: "怎样确认 README.md 的规则在 Codex 中生效？",
      fixture,
      algorithm
    });
    assert.equal(ranking.every((candidate) => candidate.score === 0), true);
  }
});

test("BM25 design-only threshold clears negatives and covers the frozen positive gate", () => {
  const design = dataset.cases.filter((item) => item.split === "DESIGN");
  const rankings = new Map(design
    .filter((item) => item.precondition === "ELIGIBLE")
    .map((item) => [item.case_id, rankCandidates({ query: item.query, fixture, algorithm: "bm25" })]));
  const tuned = tuneThreshold(design, rankings);
  assert.equal(tuned.metrics.miss_false_positive_count, 0);
  assert.equal(tuned.metrics.hard_negative_false_positive_count, 0);
  assert.equal(tuned.metrics.candidate_hit_at_3, 1);
  assert.equal(tuned.metrics.clarify_full_coverage_at_3, 0.75);
});

test("Apple sentence embedding is reported honestly and has a valid shape when available", () => {
  const result = runAppleEmbedding(["怎样确认 AGENTS.md 生效？"], fixture);
  assert.equal(typeof result.available, "boolean");
  if (!result.available) {
    assert.equal(typeof result.reason, "string");
    return;
  }
  assert.equal(result.rows.length, 1);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), fixture.cards.map((card) => card.card_id).sort());
  for (const score of Object.values(result.rows[0])) assert.ok(score >= 0 && score <= 1);
});
