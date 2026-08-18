import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runRegression } from "../evals/phase6/run-published-eight-card-regression.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function queryPublicPack(query) {
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts/query-public-card.mjs"), "--query", query], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

const receipt = readJson("evals/phase6/PHASE6_PUBLICATION_RECEIPT.json");
const index = readJson("knowledge/public/index.json");
const dataset = readJson("evals/phase6/published-eight-card-regression.v1.json");
const frozenReport = readJson("evals/phase6/published-eight-card-report.v1.json");

test("Phase 6 receipt records four individually approved revisions and 100 percent human QA", () => {
  assert.equal(receipt.status, "PHASE6_OWNER_APPROVED_LOCAL_EIGHT_CARD_PACK_COMPLETE");
  assert.equal(receipt.owner_decision.status, "APPROVED_PER_CARD_PUBLICATION");
  assert.equal(receipt.owner_decision.human_qa_policy, "ALL_CARDS_100_PERCENT");
  assert.deepEqual(receipt.cards.map((card) => [card.card_id, card.revision]), [
    ["AIHD-PC-000005", "1.0.0"],
    ["AIHD-PC-000006", "1.0.0"],
    ["AIHD-PC-000007", "1.0.0"],
    ["AIHD-PC-000008", "1.0.0"]
  ]);
  assert.equal(receipt.cards.every((card) =>
    card.human_qa === "PASS" &&
    card.editorial === "APPROVED" &&
    card.verification === "PASS" &&
    card.privacy_gate === "PASS" &&
    card.publication === "READY" &&
    card.owner_publication_decision === "APPROVED" &&
    card.source_public_fields_equal === true
  ), true);
});

test("formal public index binds exactly eight approved card revisions and bytes", () => {
  assert.deepEqual(index.cards.map((entry) => entry.card_id), [
    "AIHD-PC-000001",
    "AIHD-PC-000002",
    "AIHD-PC-000003",
    "AIHD-PC-000004",
    "AIHD-PC-000005",
    "AIHD-PC-000006",
    "AIHD-PC-000007",
    "AIHD-PC-000008"
  ]);
  assert.equal(sha256(readText("knowledge/public/index.json")), receipt.formal_index.sha256);
  for (const approved of receipt.cards) {
    const entry = index.cards.find((item) => item.card_id === approved.card_id);
    const text = readText(`knowledge/public/${entry.file}`);
    const card = JSON.parse(text);
    assert.equal(card.revision, approved.revision);
    assert.equal(entry.content_sha256, approved.public_content_sha256);
    assert.equal(sha256(text), entry.content_sha256);
    assert.equal(card.editorial, "APPROVED");
    assert.equal(card.verification, "PASS");
    assert.equal(card.privacy_gate, "PASS");
    assert.equal(card.publication, "READY");
  }
});

test("formal loader allows every indexed question and alias and keeps unrelated input MISS", () => {
  let checks = 0;
  for (const entry of index.cards) {
    for (const query of [entry.question, ...entry.aliases]) {
      const output = queryPublicPack(query);
      assert.equal(output.status, "ALLOW");
      assert.equal(output.reason_code, "OK");
      assert.equal(output.card.card_id, entry.card_id);
      checks += 1;
    }
  }
  assert.equal(checks, 41);
  assert.deepEqual(queryPublicPack("今天天气怎么样？"), { status: "MISS", reason_code: "NO_MATCH" });
});

test("published eight-card observed regression passes all 25 cases without over-recall", () => {
  const report = runRegression(dataset, index);
  assert.equal(report.qualified, true);
  assert.equal(report.metrics.passed_count, 25);
  assert.equal(report.metrics.target_hit, 24);
  assert.equal(report.metrics.exact_single_target, 24);
  assert.equal(report.metrics.over_recall, 0);
  assert.equal(report.metrics.miss_false_positive, 0);
  assert.deepEqual(report.metrics.failed_case_ids, []);
  assert.deepEqual(frozenReport.metrics, report.metrics);
  assert.equal(frozenReport.qualified, report.qualified);
});

test("release allowlist carries all eight cards while historical G14 evidence stays historical", () => {
  const manifest = readJson("release-files.v1.json");
  const cardFiles = manifest.files.filter((item) => item.startsWith("knowledge/public/cards/"));
  assert.equal(manifest.files.length, 31);
  assert.deepEqual(cardFiles, index.cards.map((entry) => `knowledge/public/${entry.file}`));
  assert.equal(sha256(readText("release-files.v1.json")), receipt.release_allowlist.manifest_sha256);
  assert.equal(receipt.release_allowlist.historical_g14_28_file_artifact_unchanged, true);
});

test("Phase 6 publication stops before push, PR, merge, tag, or release", () => {
  assert.deepEqual(receipt.boundary, {
    local_branch_only: true,
    pushed: false,
    pull_request_created: false,
    merged: false,
    tag_or_release_created: false,
    community_coverage_proven: false,
    user_effect_proven: false
  });
});
