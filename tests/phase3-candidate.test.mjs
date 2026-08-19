import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateRecord } from "../scripts/knowledge-production.mjs";
import { validateCard } from "../scripts/query-public-card.mjs";
import { hasOnlySafeCandidateKeys } from "../evals/retrieval/retrieval.mjs";
import { rankCandidatesV2, safeCandidatesFor } from "../evals/retrieval/v2/retrieval-v2.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const THRESHOLD = 0.8449460370411592;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

const manifest = readJson("evals/phase3/FIRST_BATCH_MANIFEST.json");
const candidate002 = readJson("evals/phase3/candidates/AIHD-PC-000002.candidate.json");
const candidate003 = readJson("evals/phase3/candidates/AIHD-PC-000003.candidate.json");
const fixture = readJson("evals/phase3/candidate-retrieval-fixture.v1.json");

function projectedCard(candidate) {
  return {
    ...candidate.proposed_public_fields,
    editorial: "APPROVED",
    verification: "PASS",
    privacy_gate: "PASS",
    publication: "READY"
  };
}

function select(query) {
  const ranking = rankCandidatesV2({ query, fixture, algorithm: "bm25_expansion_keyword" });
  return safeCandidatesFor(ranking, THRESHOLD);
}

test("Phase 3 first batch is exactly three cards with full human QA pending", () => {
  assert.equal(manifest.cards.length, 3);
  assert.deepEqual(manifest.cards.map((card) => card.card_id), [
    "AIHD-PC-000001",
    "AIHD-PC-000002",
    "AIHD-PC-000003"
  ]);
  assert.equal(manifest.selection_policy, "ALL_CARDS_100_PERCENT_HUMAN_QA");
  assert.equal(manifest.private_cluster_usage, "NONE");
  assert.equal(manifest.cards.every((card) => card.human_qa === "PENDING_G12"), true);
});

test("formal public index contains all three G12-approved cards", () => {
  const index = readJson("knowledge/archive/index.json");
  const g12Ids = new Set(manifest.cards.map((card) => card.card_id));
  assert.deepEqual(index.cards.filter((card) => g12Ids.has(card.card_id)).map((card) => card.card_id), [
    "AIHD-PC-000001",
    "AIHD-PC-000002",
    "AIHD-PC-000003"
  ]);
});

for (const candidate of [candidate002, candidate003]) {
  test(`${candidate.proposed_public_fields.card_id} is structurally valid only as a simulated projection`, () => {
    const card = projectedCard(candidate);
    assert.doesNotThrow(() => validateCard(
      card,
      card.card_id,
      card.question,
      card.aliases,
      card.revision,
      card.scope_hint
    ));
    assert.equal(candidate.candidate_status, "PENDING_G12");
    assert.equal(candidate.human_qa.verdict, "PENDING_G12");
  });

  test(`${candidate.proposed_public_fields.card_id} preserves its immutable pre-G12 HOLD receipt`, () => {
    const privateResult = evaluateRecord(candidate.production_receipt, "private-card");
    const publicResult = evaluateRecord(candidate.production_receipt, "public-projection");
    assert.equal(privateResult.status, "HOLD");
    assert.equal(publicResult.status, "HOLD");
    assert.equal(privateResult.reason_code, "CANDIDATE_AUTHORIZATION_REQUIRED");
    assert.equal(publicResult.reason_code, "CANDIDATE_AUTHORIZATION_REQUIRED");
  });
}

test("clear AGENTS rule query selects only the rule-discovery card", () => {
  assert.deepEqual(select("写进 AGENTS.md 的规则怎样确认生效").map((item) => item.card_id), ["FIX-CODEX-AGENTS"]);
});

test("clear sandbox query keeps both confusable candidates for applicability adjudication", () => {
  assert.deepEqual(
    select("AGENTS.md 已经读取但命令仍被 sandbox 拒绝").map((item) => item.card_id),
    ["FIX-CODEX-SANDBOX", "FIX-CODEX-AGENTS"]
  );
});

test("explicitly ambiguous Codex query keeps both confusable candidates", () => {
  assert.deepEqual(
    select("AGENTS.md 规则没生效还是 sandbox 拒绝").map((item) => item.card_id),
    ["FIX-CODEX-AGENTS", "FIX-CODEX-SANDBOX"]
  );
});

for (const query of [
  "怎样用 --require-rpc 验证 OpenClaw Gateway",
  "Gateway 显示 running 但连不上怎么办"
]) {
  test(`clear Gateway query selects only the different-topic candidate: ${query}`, () => {
    assert.deepEqual(select(query).map((item) => item.card_id), ["FIX-OPENCLAW-GATEWAY"]);
  });
}

test("unrelated query remains MISS in the candidate fixture", () => {
  assert.deepEqual(select("完全无关的烘焙问题"), []);
});

test("candidate recall exposes only safe pre-load metadata", () => {
  const candidates = select("AGENTS.md 已经读取但命令仍被 sandbox 拒绝");
  assert.equal(candidates.length, 2);
  assert.equal(candidates.every(hasOnlySafeCandidateKeys), true);
  assert.equal(JSON.stringify(candidates).includes("answer"), false);
  assert.equal(JSON.stringify(candidates).includes("public_sources"), false);
});
