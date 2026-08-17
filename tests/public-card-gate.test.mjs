import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CARD_KEYS } from "../scripts/query-public-card.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "query-public-card.mjs");
const SCHEMA = path.join(REPO_ROOT, "schemas", "public-card.schema.json");
const CARD_ID = "TEST-CARD-0001";
const QUESTION = "怎样完成一次虚构验收？";
const ALIAS = "OpenClaw setup";
const CANARY = "PRIVATE_CANARY_7F6C2A";

function baseCard(overrides = {}) {
  return {
    schema_version: "0.4",
    card_id: CARD_ID,
    domain: "AI_AGENT_OPENCLAW",
    revision: "1.0.0",
    question: QUESTION,
    aliases: [ALIAS],
    scope_hint: "仅用于虚构的公开测试范围。",
    applies_to: ["仅用于虚构测试"],
    not_for: [],
    answer: "这是完全虚构的公开测试答案。",
    judgment_framework: ["判断虚构条件是否满足。"],
    common_mistakes: ["把虚构结果当成真实结果。"],
    action_principles: ["保持测试无副作用。"],
    next_action: "执行一个虚构测试动作。",
    verification_method: "观察虚构测试信号并与预期对照。",
    verification_steps: ["观察虚构测试信号。"],
    public_sources: [
      {
        title: "Synthetic public source",
        url: "https://example.com/docs",
        checked_at: "2026-08-17"
      }
    ],
    supported_versions: ["test-only"],
    last_verified: "2026-08-17",
    editorial: "APPROVED",
    verification: "PASS",
    privacy_gate: "PASS",
    publication: "READY",
    ...overrides
  };
}

function contentSha256(card) {
  return crypto.createHash("sha256").update(JSON.stringify(card), "utf8").digest("hex");
}

function indexEntry(card = baseCard(), overrides = {}) {
  return {
    card_id: card.card_id,
    file: `cards/${card.card_id}.json`,
    revision: card.revision,
    content_sha256: contentSha256(card),
    question: card.question,
    aliases: card.aliases,
    scope_hint: card.scope_hint,
    ...overrides
  };
}

function makeRoot(t, label = "pack") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `aihd-${label}-`));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function makePack(t, options = {}) {
  const root = makeRoot(t, options.label);
  fs.mkdirSync(path.join(root, "cards"), { mode: 0o700 });
  const cards = options.cards ?? [baseCard()];
  const entries = options.entries ?? cards.map((card) => indexEntry(card));
  const indexText = options.indexRaw ?? JSON.stringify({ schema_version: "0.4", cards: entries });
  fs.writeFileSync(path.join(root, "index.json"), indexText, { mode: 0o600 });
  if (!options.skipCards) {
    for (const card of cards) {
      const raw = options.cardRaw ?? JSON.stringify(card);
      fs.writeFileSync(path.join(root, "cards", `${card.card_id}.json`), raw, { mode: 0o600 });
    }
  }
  return root;
}

function makeEmptyPack(t, label = "empty") {
  return makePack(t, { label, cards: [], entries: [] });
}

function runGate({ query = QUESTION, common, communities = [], script = SCRIPT }) {
  const args = [script, "--query", query, "--common-pack", common];
  for (const community of communities) args.push("--community-pack", community);
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH }
  });
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split("\n").length, 1);
  return { ...result, body: JSON.parse(result.stdout) };
}

function assertDeny(result, { reason, hidden = [], roots = [] } = {}) {
  assert.notEqual(result.status, 0);
  assert.equal(result.body.status, "DENY");
  if (reason) assert.equal(result.body.reason_code, reason);
  assert.deepEqual(Object.keys(result.body).sort(), ["reason_code", "status"]);
  const combined = `${result.stdout}${result.stderr}`;
  for (const value of [CANARY, ...hidden, ...roots]) assert.equal(combined.includes(value), false);
}

test("empty public pack returns MISS without a card", (t) => {
  const common = makeEmptyPack(t);
  const result = runGate({ common });
  assert.equal(result.status, 0);
  assert.deepEqual(result.body, { status: "MISS", reason_code: "NO_MATCH" });
});

test("valid public card returns ALLOW and only schema fields", (t) => {
  const common = makePack(t);
  const result = runGate({ common });
  assert.equal(result.status, 0);
  assert.equal(result.body.status, "ALLOW");
  assert.equal(result.body.reason_code, "OK");
  assert.deepEqual(Object.keys(result.body.card).sort(), [...CARD_KEYS].sort());
});

test("query normalization matches a public alias", (t) => {
  const common = makePack(t);
  const result = runGate({ common, query: "  openclaw   SETUP  " });
  assert.equal(result.status, 0);
  assert.equal(result.body.status, "ALLOW");
});

test("valid explicit community pack returns ALLOW", (t) => {
  const common = makeEmptyPack(t, "common");
  const community = makePack(t, { label: "community" });
  const result = runGate({ common, communities: [community] });
  assert.equal(result.status, 0);
  assert.equal(result.body.status, "ALLOW");
});

for (const [field, value] of [
  ["editorial", "HOLD"],
  ["verification", "pass"],
  ["privacy_gate", "PASS "],
  ["publication", "NOT_READY"]
]) {
  test(`non-exact gate ${field} is denied`, (t) => {
    const common = makePack(t, { cards: [baseCard({ [field]: value })] });
    const result = runGate({ common });
    assertDeny(result, { reason: "CARD_GATE_DENY", roots: [common] });
  });
}

test("missing required field is denied", (t) => {
  const card = baseCard();
  delete card.answer;
  const common = makePack(t, { cards: [card] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_SCHEMA_INVALID", roots: [common] });
});

test("card outside the AI Agent OpenClaw domain is denied", (t) => {
  const common = makePack(t, { cards: [baseCard({ domain: "GENERAL_COMMUNITY" })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_DOMAIN_DENY", roots: [common] });
});

test("extra private field is denied without canary leakage", (t) => {
  const card = baseCard({ source_message_id: CANARY });
  const common = makePack(t, { cards: [card] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_SCHEMA_INVALID", roots: [common] });
});

test("local path in an allowed field is denied without leakage", (t) => {
  const privatePath = `/Users/private/${CANARY}`;
  const card = baseCard({ answer: `Do not reveal ${privatePath}` });
  const common = makePack(t, { cards: [card] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privatePath], roots: [common] });
});

test("file URI containing a local user path is denied without leakage", (t) => {
  const privateUri = `file:///Users/private/${CANARY}`;
  const card = baseCard({ answer: `Do not reveal ${privateUri}` });
  const common = makePack(t, { cards: [card] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUri], roots: [common] });
});

for (const privateValue of [
  `.work/${CANARY}.json`,
  `/var/folders/private/${CANARY}`,
  `/root/.ssh/${CANARY}`,
  `token=${CANARY}`
]) {
  test("additional local path or credential form is denied without leakage", (t) => {
    const card = baseCard({ answer: privateValue });
    const common = makePack(t, { cards: [card] });
    const result = runGate({ common });
    assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateValue], roots: [common] });
  });
}

test("credential-shaped text is denied without leakage", (t) => {
  const credential = `sk-${CANARY}1234567890`;
  const card = baseCard({ answer: credential });
  const common = makePack(t, { cards: [card] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [credential], roots: [common] });
});

test("credential query key in a public source URL is denied without leakage", (t) => {
  const privateUrl = `https://example.com/docs?to%6ben=${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

for (const privateUrl of [
  "https://localhost/docs",
  "https://127.0.0.1/docs",
  "https://10.0.0.1/docs",
  "https://192.168.1.1/docs",
  "https://[::1]/docs"
]) {
  test(`local or private public source host is denied: ${privateUrl}`, (t) => {
    const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
    const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
    const result = runGate({ common });
    assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
  });
}

test("ordinary query parameters on a public source remain allowed", (t) => {
  const publicSources = [{
    title: "Synthetic source",
    url: "https://example.com/docs?lang=zh&section=setup",
    checked_at: "2026-08-17"
  }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assert.equal(result.status, 0);
  assert.equal(result.body.status, "ALLOW");
});

test("public source scheme casing rejected by schema is also denied at runtime", (t) => {
  const publicSources = [{ title: "Synthetic source", url: "HTTPS://example.com/docs", checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_SCHEMA_INVALID", roots: [common] });
});

test("percent-encoded local path in a public source is denied without leakage", (t) => {
  const privateUrl = `https://example.com/%252FUsers%252Fprivate%252F${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

test("four-layer encoded local path in a public source is denied without leakage", (t) => {
  const privateUrl = `https://example.com/%2525252FUsers%2525252Fprivate%2525252F${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

test("encoded zero-width character cannot split a sensitive local path", (t) => {
  const privateUrl = `https://example.com/%2FUs%E2%80%8Bers%2Fprivate%2F${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

test("encoded control character cannot split a sensitive local path", (t) => {
  const privateUrl = `https://example.com/%2FUs%00ers%2Fprivate%2F${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

test("percent-encoded local path in an ordinary card field is denied", (t) => {
  const encodedPath = `%2FUsers%2Fprivate%2F${CANARY}`;
  const common = makePack(t, { cards: [baseCard({ answer: encodedPath })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [encodedPath], roots: [common] });
});

test("multi-layer encoded sensitive query key is denied without leakage", (t) => {
  const privateUrl = `https://example.com/docs?%2574oken=${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

test("encoded Feishu docx source path is denied without leakage", (t) => {
  const privateUrl = `https://private.feishu.cn/%64ocx/${CANARY}`;
  const publicSources = [{ title: "Synthetic source", url: privateUrl, checked_at: "2026-08-17" }];
  const common = makePack(t, { cards: [baseCard({ public_sources: publicSources })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateUrl], roots: [common] });
});

test("full-width private identifier is normalized before privacy scanning", (t) => {
  const privateId = "ｏｕ＿ＡＢＣＤＥＦＧＨ１２３４";
  const common = makePack(t, { cards: [baseCard({ answer: `${CANARY} ${privateId}` })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateId], roots: [common] });
});

for (const field of ["question", "answer", "next_action"]) {
  test(`invisible-only ${field} is denied as empty`, (t) => {
    const card = baseCard({ [field]: field === "answer" ? "\u2060" : "\u200b" });
    const entries = field === "question" ? [indexEntry(baseCard())] : undefined;
    const common = makePack(t, { cards: [card], entries });
    const result = runGate({ common });
    assertDeny(result, { reason: "CARD_SCHEMA_INVALID", roots: [common] });
  });
}

test("case-insensitive Windows user path is denied without leakage", (t) => {
  const privatePath = `C:\\users\\private\\${CANARY}.txt`;
  const common = makePack(t, { cards: [baseCard({ answer: privatePath })] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privatePath], roots: [common] });
});

for (const privateFieldText of [
  `raw metadata: {"source_message_id":"${CANARY}"}`,
  `sender_id: ${CANARY}`,
  `original_quote: ${CANARY}`
]) {
  test("private source field name embedded in allowed text is denied without leakage", (t) => {
    const common = makePack(t, { cards: [baseCard({ answer: privateFieldText })] });
    const result = runGate({ common });
    assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateFieldText], roots: [common] });
  });
}

for (const privateId of ["oc_1234567890", "on_1234567890", "msg_1234567890"]) {
  test(`private identifier ${privateId.slice(0, 3)} is denied without leakage`, (t) => {
    const card = baseCard({ answer: `${CANARY} ${privateId}` });
    const common = makePack(t, { cards: [card] });
    const result = runGate({ common });
    assertDeny(result, { reason: "CARD_PRIVACY_DENY", hidden: [privateId], roots: [common] });
  });
}

test("malformed card JSON is denied without raw text leakage", (t) => {
  const raw = `{"card_id":"${CANARY}"`;
  const common = makePack(t, { cardRaw: raw });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_JSON_INVALID", roots: [common] });
});

test("unicode-escaped duplicate JSON key is denied", (t) => {
  const raw = JSON.stringify(baseCard()).replace(
    '"publication":"READY"',
    '"publication":"HOLD","public\\u0061tion":"READY"'
  );
  const common = makePack(t, { cardRaw: raw });
  const result = runGate({ common });
  assertDeny(result, { reason: "JSON_DUPLICATE_KEY", roots: [common] });
});

test("malformed explicit community index denies a valid common match", (t) => {
  const common = makePack(t, { label: "common" });
  const community = makePack(t, { label: "community", indexRaw: `{"${CANARY}":` });
  const result = runGate({ common, communities: [community] });
  assertDeny(result, { reason: "INDEX_JSON_INVALID", roots: [common, community] });
});

test("relative traversal in index is denied", (t) => {
  const card = baseCard();
  const entry = indexEntry(card, { file: `../${CANARY}.json` });
  const common = makePack(t, { cards: [card], entries: [entry] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PATH_INVALID", roots: [common] });
});

test("absolute card path in index is denied without path leakage", (t) => {
  const card = baseCard();
  const outside = path.join(os.tmpdir(), `${CANARY}.json`);
  const entry = indexEntry(card, { file: outside });
  const common = makePack(t, { cards: [card], entries: [entry] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PATH_INVALID", hidden: [outside], roots: [common] });
});

test("leaf symlink outside pack is denied", (t) => {
  const outsideRoot = makeRoot(t, "outside");
  const outside = path.join(outsideRoot, `${CARD_ID}.json`);
  fs.writeFileSync(outside, JSON.stringify(baseCard()), { mode: 0o600 });
  const common = makePack(t, { skipCards: true });
  fs.symlinkSync(outside, path.join(common, "cards", `${CARD_ID}.json`));
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PATH_UNSAFE", roots: [common, outsideRoot] });
});

test("symlinked cards directory outside pack is denied", (t) => {
  const outsideRoot = makeRoot(t, "outside-dir");
  fs.writeFileSync(path.join(outsideRoot, `${CARD_ID}.json`), JSON.stringify(baseCard()), { mode: 0o600 });
  const common = makeRoot(t, "middle-link");
  fs.writeFileSync(
    path.join(common, "index.json"),
    JSON.stringify({ schema_version: "0.4", cards: [indexEntry()] }),
    { mode: 0o600 }
  );
  fs.symlinkSync(outsideRoot, path.join(common, "cards"));
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_PATH_UNSAFE", roots: [common, outsideRoot] });
});

test("common and community query conflict is denied before card output", (t) => {
  const common = makePack(t, { label: "common" });
  const communityCard = baseCard({ card_id: "TEST-CARD-0002", answer: CANARY });
  const community = makePack(t, { label: "community", cards: [communityCard] });
  const result = runGate({ common, communities: [community] });
  assertDeny(result, { reason: "QUERY_CONFLICT", roots: [common, community] });
});

test("same-pack normalized query conflict is denied", (t) => {
  const first = baseCard();
  const second = baseCard({ card_id: "TEST-CARD-0002", aliases: ["Other alias"] });
  const entries = [indexEntry(first), indexEntry(second)];
  const common = makePack(t, { cards: [first, second], entries });
  const result = runGate({ common });
  assertDeny(result, { reason: "INDEX_QUERY_CONFLICT", roots: [common] });
});

test("card id different from indexed filename is denied", (t) => {
  const indexed = baseCard();
  const body = baseCard({ card_id: "TEST-CARD-9999" });
  const common = makePack(t, { cards: [indexed], cardRaw: JSON.stringify(body) });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_ID_MISMATCH", roots: [common] });
});

test("card content drift from the index hash is denied", (t) => {
  const card = baseCard();
  const entry = indexEntry(card, { content_sha256: "0".repeat(64) });
  const common = makePack(t, { cards: [card], entries: [entry] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_INDEX_HASH_MISMATCH", roots: [common] });
});

test("card revision drift from the index is denied", (t) => {
  const card = baseCard();
  const entry = indexEntry(card, { revision: "9.9.9" });
  const common = makePack(t, { cards: [card], entries: [entry] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_INDEX_MISMATCH", roots: [common] });
});

test("audited scope hint drift from the index is denied", (t) => {
  const card = baseCard();
  const entry = indexEntry(card, { scope_hint: "另一个未经审核的范围提示。" });
  const common = makePack(t, { cards: [card], entries: [entry] });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_INDEX_MISMATCH", roots: [common] });
});

test("unindexed malformed card does not break a valid hit", (t) => {
  const common = makePack(t);
  fs.writeFileSync(path.join(common, "cards", "UNINDEXED-BAD.json"), "{broken", { mode: 0o600 });
  const result = runGate({ common });
  assert.equal(result.status, 0);
  assert.equal(result.body.status, "ALLOW");
});

test("invalid UTF-8 card is denied", (t) => {
  const common = makePack(t, { skipCards: true });
  fs.writeFileSync(path.join(common, "cards", `${CARD_ID}.json`), Buffer.from([0xc3, 0x28]), { mode: 0o600 });
  const result = runGate({ common });
  assertDeny(result, { reason: "CARD_JSON_INVALID", roots: [common] });
});

test("symlinked pack root is denied", (t) => {
  const realPack = makePack(t, { label: "real-pack" });
  const linkParent = makeRoot(t, "root-link");
  const linkedPack = path.join(linkParent, "linked-pack");
  fs.symlinkSync(realPack, linkedPack);
  const result = runGate({ common: linkedPack });
  assertDeny(result, { reason: "PACK_PATH_UNSAFE", roots: [realPack, linkedPack] });
});

test("sensitive query is denied and never echoed", (t) => {
  const common = makeEmptyPack(t);
  const query = `/Users/private/${CANARY}`;
  const result = runGate({ common, query });
  assertDeny(result, { reason: "QUERY_PRIVACY_DENY", hidden: [query], roots: [common] });
});

test("CLI invoked through a symlink still emits one fail-closed JSON result", (t) => {
  const common = makeEmptyPack(t);
  const linkRoot = makeRoot(t, "cli-link");
  const linkedScript = path.join(linkRoot, "gate.mjs");
  fs.symlinkSync(SCRIPT, linkedScript);
  const result = spawnSync(process.execPath, [linkedScript, "--query", QUESTION, "--common-pack", common], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH }
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { status: "MISS", reason_code: "NO_MATCH" });
});

test("runtime card key list stays synchronized with JSON schema", () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), [...CARD_KEYS].sort());
  assert.deepEqual(Object.keys(schema.properties).sort(), [...CARD_KEYS].sort());
  assert.equal(schema.properties.editorial.const, "APPROVED");
  assert.equal(schema.properties.verification.const, "PASS");
  assert.equal(schema.properties.privacy_gate.const, "PASS");
  assert.equal(schema.properties.publication.const, "READY");
  assert.equal(schema.properties.domain.const, "AI_AGENT_OPENCLAW");
});

test("runtime denies any drift in the pinned JSON schema", (t) => {
  const mirror = makeRoot(t, "schema-drift");
  const mirrorScripts = path.join(mirror, "scripts");
  const mirrorSchemas = path.join(mirror, "schemas");
  fs.mkdirSync(mirrorScripts, { mode: 0o700 });
  fs.mkdirSync(mirrorSchemas, { mode: 0o700 });
  const mirrorScript = path.join(mirrorScripts, "query-public-card.mjs");
  fs.copyFileSync(SCRIPT, mirrorScript);
  const schema = fs.readFileSync(SCHEMA, "utf8").replace('"maxLength": 12000', '"maxLength": 1');
  fs.writeFileSync(path.join(mirrorSchemas, "public-card.schema.json"), schema, { mode: 0o600 });
  const common = makePack(t);
  const result = runGate({ common, script: mirrorScript });
  assertDeny(result, { reason: "SCHEMA_CONTRACT_INVALID", roots: [common, mirror] });
});
