import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

const receipt = readJson("evals/phase4/G13B_PUBLICATION_RECEIPT.json");
const index = readJson("knowledge/public/index.json");
const cardText = readText("knowledge/public/cards/AIHD-PC-000004.json");
const card = JSON.parse(cardText);

test("G13b receipt binds the exact approved new-card revision and formal loop", () => {
  assert.equal(receipt.status, "G13B_APPROVED_LOCAL_FORMAL_LOOP_COMPLETE");
  assert.equal(receipt.owner_decision.status, "APPROVED");
  assert.equal(receipt.owner_decision.asset_action, "NEW_CARD");
  assert.equal(receipt.card.card_id, "AIHD-PC-000004");
  assert.equal(receipt.card.revision, "1.0.0");
  assert.equal(receipt.card.candidate_formal_byte_equal, true);
  assert.equal(receipt.ledger.real_loop_complete, true);
  assert.equal(receipt.ledger.serving_eligible, true);
  assert.equal(receipt.boundary.community_trial_started, false);
});

test("current index preserves AIHD-PC-000004 while the G13b four-card receipt stays immutable", () => {
  const entry = index.cards.find((item) => item.card_id === "AIHD-PC-000004");
  assert.ok(entry);
  assert.equal(entry.revision, card.revision);
  assert.equal(entry.content_sha256, sha256(cardText));
  assert.equal(entry.question, card.question);
  assert.deepEqual(entry.aliases, card.aliases);
  assert.equal(entry.scope_hint, card.scope_hint);
  assert.equal(receipt.formal_index.card_count, 4);
  assert.equal(receipt.formal_index.sha256, "792301b0219db84d80e6eefae8e10fd7323a53f61fbdb4437ef24215b11c6b31");
  assert.notEqual(receipt.formal_index.sha256, sha256(readText("knowledge/public/index.json")));
});

test("the formal card retains all four exact publication gates", () => {
  assert.equal(card.editorial, "APPROVED");
  assert.equal(card.verification, "PASS");
  assert.equal(card.privacy_gate, "PASS");
  assert.equal(card.publication, "READY");
});
