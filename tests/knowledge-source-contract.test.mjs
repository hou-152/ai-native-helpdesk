import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_TEXT = fs.readFileSync(path.join(REPO_ROOT, "skills", "ai-native-helpdesk", "SKILL.md"), "utf8");
const CONTRACT_TEXT = fs.readFileSync(path.join(REPO_ROOT, "skills", "knowledge", "SKILL.md"), "utf8");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function writeNdjson(file, records) {
  fs.writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, { mode: 0o600 });
}

function createSource(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aihd source fixture "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(root, "SOURCE_OF_TRUTH.md"),
    [
      "# Synthetic knowledge navigation",
      "",
      "- locator: normalized.ndjson",
      "- raw: raw.ndjson",
      "- integrity: manifest.json",
      "- cutoff: 2026-08-20T00:00:00Z",
      ""
    ].join("\n"),
    { mode: 0o600 }
  );

  const raw = [
    {
      fixture_id: "fixture-before",
      thread_key: "fixture-thread",
      deleted: false,
      attachment_complete: true,
      text: "The first message establishes a synthetic setup."
    },
    {
      fixture_id: "fixture-hit",
      thread_key: "fixture-thread",
      deleted: false,
      attachment_complete: true,
      text: "Run one reversible check and inspect its explicit success signal."
    },
    {
      fixture_id: "fixture-after",
      thread_key: "fixture-thread",
      deleted: false,
      attachment_complete: true,
      text: "The follow-up says to stop and restore when the signal is absent."
    }
  ];
  const normalized = [
    {
      fixture_id: "fixture-hit",
      normalized_text: "verify agent setup with reversible check"
    }
  ];

  const rawPath = path.join(root, "raw.ndjson");
  const locatorPath = path.join(root, "normalized.ndjson");
  writeNdjson(rawPath, raw);
  writeNdjson(locatorPath, normalized);

  const manifest = {
    schema_version: "fixture-1",
    snapshot_cutoff: "2026-08-20T00:00:00Z",
    files: {
      "raw.ndjson": sha256(fs.readFileSync(rawPath)),
      "normalized.ndjson": sha256(fs.readFileSync(locatorPath))
    }
  };
  fs.writeFileSync(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return root;
}

function parseNdjson(text) {
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function parseNdjsonOrHold(file) {
  try {
    return { records: parseNdjson(fs.readFileSync(file, "utf8")) };
  } catch {
    return { records: null };
  }
}

function readNavigation(root) {
  const navigationPath = path.join(root, "SOURCE_OF_TRUTH.md");
  if (!fs.existsSync(navigationPath)) return null;
  const text = fs.readFileSync(navigationPath, "utf8");
  const entries = Object.fromEntries(
    [...text.matchAll(/^[-*]\s+(locator|raw|integrity|cutoff):\s*(.+)$/gm)]
      .map((match) => [match[1], match[2].trim()])
  );
  return { navigationPath, entries };
}

function declaredPath(root, relativePath) {
  if (!relativePath || path.posix.isAbsolute(relativePath)) return null;
  const absolutePath = path.resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) return null;
  if (fs.existsSync(absolutePath)) {
    const realRoot = fs.realpathSync(root);
    const realPath = fs.realpathSync(absolutePath);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) return null;
  }
  return absolutePath;
}

function queryFixture(sourceRoot, query) {
  const trace = [];
  if (!sourceRoot || !fs.existsSync(sourceRoot)) {
    return { status: "SOURCE_UNAVAILABLE", reason: "SOURCE_ROOT_UNAVAILABLE", trace };
  }

  const navigation = readNavigation(sourceRoot);
  if (!navigation) {
    return { status: "SOURCE_UNAVAILABLE", reason: "NAVIGATION_UNAVAILABLE", trace };
  }
  if (!navigation.entries.locator || !navigation.entries.raw || !navigation.entries.integrity) {
    return { status: "SOURCE_UNAVAILABLE", reason: "NAVIGATION_INCOMPLETE", trace: ["SOURCE_OF_TRUTH.md"] };
  }
  trace.push("SOURCE_OF_TRUTH.md");

  const manifestPath = declaredPath(sourceRoot, navigation.entries.integrity);
  const locatorPath = declaredPath(sourceRoot, navigation.entries.locator);
  const rawPath = declaredPath(sourceRoot, navigation.entries.raw);
  if (!manifestPath || !locatorPath || !rawPath) {
    return { status: "HOLD", reason: "NAVIGATION_PATH_UNSAFE", trace };
  }
  if (!fs.existsSync(manifestPath)) {
    return { status: "SOURCE_UNAVAILABLE", reason: "INTEGRITY_RECEIPT_UNAVAILABLE", trace };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { status: "HOLD", reason: "INTEGRITY_RECEIPT_INVALID", trace };
  }
  if (!manifest || typeof manifest !== "object" || !manifest.files || typeof manifest.files !== "object") {
    return { status: "HOLD", reason: "INTEGRITY_RECEIPT_INVALID", trace };
  }
  trace.push("manifest.json");

  for (const [relativePath, absolutePath] of [
    [navigation.entries.raw, rawPath],
    [navigation.entries.locator, locatorPath]
  ]) {
    if (!fs.existsSync(absolutePath)) {
      return { status: "SOURCE_UNAVAILABLE", reason: "SOURCE_FILE_UNAVAILABLE", trace };
    }
    if (sha256(fs.readFileSync(absolutePath)) !== manifest.files[relativePath]) {
      return { status: "HOLD", reason: "SOURCE_HASH_DRIFT", trace };
    }
  }

  const locatorResult = parseNdjsonOrHold(locatorPath);
  if (!locatorResult.records) return { status: "HOLD", reason: "LOCATOR_INVALID", trace };
  const locator = locatorResult.records;
  trace.push(navigation.entries.locator);
  const candidate = locator.find((record) => record.normalized_text.includes(query));
  if (!candidate) return { status: "MISS", reason: "NO_CANDIDATE", trace };

  const rawResult = parseNdjsonOrHold(rawPath);
  if (!rawResult.records) return { status: "HOLD", reason: "RAW_INVALID", trace };
  const raw = rawResult.records;
  trace.push(navigation.entries.raw);
  const original = raw.find((record) => record.fixture_id === candidate.fixture_id);
  if (!original || original.deleted || !original.attachment_complete) {
    return { status: "HOLD", reason: "RAW_OR_CONTEXT_INCOMPLETE", trace };
  }
  const context = raw.filter((record) => record.thread_key === original.thread_key && !record.deleted);
  if (context.length < 2) return { status: "HOLD", reason: "RAW_OR_CONTEXT_INCOMPLETE", trace };
  trace.push("thread-context");
  return {
    status: "HIT",
    reason: "RAW_CONTEXT_VERIFIED",
    original,
    context,
    trace
  };
}

function missDecision({
  privacy = false,
  dynamic = false,
  irreversible = false,
  highRisk = false,
  reversible = true,
  observable = true,
  rollback = true
} = {}) {
  if (privacy) return "QUERY_PRIVACY_DENY";
  if (irreversible) return "STOP";
  if (dynamic) return "VERIFY";
  if (highRisk) return "ESCALATE";
  if (reversible && observable && rollback) return "MINIMAL_EXPERIMENT";
  return "UNKNOWN";
}

test("knowledge contract fixes the order SOT -> integrity -> locator -> raw/context", () => {
  const orderedMarkers = [
    "### 1. 先读知识库导航",
    "### 2. 完整性预检",
    "### 3. 导航指定的定位文件只做定位",
    "### 4. 回读导航指定的原始文件与上下文",
    "### 5. 形成回答"
  ];
  let previous = -1;
  for (const marker of orderedMarkers) {
    const current = CONTRACT_TEXT.indexOf(marker);
    assert.notEqual(current, -1, marker);
    assert.equal(current > previous, true, marker);
    previous = current;
  }
  assert.match(SKILL_TEXT, /调用 \$dbs-knowledge/);
  assert.match(SKILL_TEXT, /公开包不假设.*shell 命令/);
  assert.match(CONTRACT_TEXT, /上游.*不提供统一 CLI、API、输入 schema 或状态枚举/);
  assert.match(CONTRACT_TEXT, /wrapper.*归一化为本合同表中的内部结果状态/);
  assert.doesNotMatch(
    CONTRACT_TEXT,
    /query-(?:public-card|candidates)|knowledge\/(?:public|archive)|contracts\/public-card/
  );
});

test("a desensitized HIT reads the locator, exact raw record, and thread context", (t) => {
  const root = createSource(t);
  const result = queryFixture(root, "verify agent setup");
  assert.equal(result.status, "HIT");
  assert.equal(result.reason, "RAW_CONTEXT_VERIFIED");
  assert.equal(result.original.fixture_id, "fixture-hit");
  assert.equal(result.context.length, 3);
  assert.deepEqual(result.trace, [
    "SOURCE_OF_TRUTH.md",
    "manifest.json",
    "normalized.ndjson",
    "raw.ndjson",
    "thread-context"
  ]);
});

test("a locator MISS does not read raw content or pretend to hit", (t) => {
  const root = createSource(t);
  const result = queryFixture(root, "unrelated missing subject");
  assert.deepEqual(result, {
    status: "MISS",
    reason: "NO_CANDIDATE",
    trace: ["SOURCE_OF_TRUTH.md", "manifest.json", "normalized.ndjson"]
  });
});

test("an unavailable source fails closed before any content read", () => {
  const result = queryFixture(null, "anything");
  assert.deepEqual(result, {
    status: "SOURCE_UNAVAILABLE",
    reason: "SOURCE_ROOT_UNAVAILABLE",
    trace: []
  });
});

test("source hash drift returns HOLD before locator parsing or raw readback", (t) => {
  const root = createSource(t);
  fs.appendFileSync(path.join(root, "normalized.ndjson"), "{\"drift\":true}\n");
  const result = queryFixture(root, "verify agent setup");
  assert.deepEqual(result, {
    status: "HOLD",
    reason: "SOURCE_HASH_DRIFT",
    trace: ["SOURCE_OF_TRUTH.md", "manifest.json"]
  });
});

test("navigation-declared paths are used and unsafe paths fail closed", (t) => {
  const root = createSource(t);
  const navigationPath = path.join(root, "SOURCE_OF_TRUTH.md");
  const original = fs.readFileSync(navigationPath, "utf8");
  fs.writeFileSync(navigationPath, original.replace("normalized.ndjson", "../outside.ndjson"));
  const result = queryFixture(root, "verify agent setup");
  assert.deepEqual(result, {
    status: "HOLD",
    reason: "NAVIGATION_PATH_UNSAFE",
    trace: ["SOURCE_OF_TRUTH.md"]
  });
});

test("a symlink escape and malformed integrity receipt both fail closed", (t) => {
  const root = createSource(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "aihd outside fixture "));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const outsideLocator = path.join(outside, "outside.ndjson");
  fs.writeFileSync(outsideLocator, "{}\n");
  fs.symlinkSync(outsideLocator, path.join(root, "linked-locator.ndjson"));
  const navigationPath = path.join(root, "SOURCE_OF_TRUTH.md");
  const original = fs.readFileSync(navigationPath, "utf8");
  fs.writeFileSync(navigationPath, original.replace("normalized.ndjson", "linked-locator.ndjson"));
  assert.deepEqual(queryFixture(root, "anything"), {
    status: "HOLD",
    reason: "NAVIGATION_PATH_UNSAFE",
    trace: ["SOURCE_OF_TRUTH.md"]
  });

  fs.writeFileSync(navigationPath, original);
  fs.writeFileSync(path.join(root, "manifest.json"), "{not-json\n");
  assert.deepEqual(queryFixture(root, "anything"), {
    status: "HOLD",
    reason: "INTEGRITY_RECEIPT_INVALID",
    trace: ["SOURCE_OF_TRUTH.md"]
  });
});

test("a locator hit with no matching raw record remains HOLD", (t) => {
  const root = createSource(t);
  const rawPath = path.join(root, "raw.ndjson");
  const records = parseNdjson(fs.readFileSync(rawPath, "utf8"))
    .filter((record) => record.fixture_id !== "fixture-hit");
  writeNdjson(rawPath, records);
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.files["raw.ndjson"] = sha256(fs.readFileSync(rawPath));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  const result = queryFixture(root, "verify agent setup");
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "RAW_OR_CONTEXT_INCOMPLETE");
  assert.deepEqual(result.trace, [
    "SOURCE_OF_TRUTH.md",
    "manifest.json",
    "normalized.ndjson",
    "raw.ndjson"
  ]);
});

test("malformed receipt shape and source records fail closed", (t) => {
  const root = createSource(t);
  const manifestPath = path.join(root, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ schema_version: "fixture-1" }));
  assert.deepEqual(queryFixture(root, "anything"), {
    status: "HOLD",
    reason: "INTEGRITY_RECEIPT_INVALID",
    trace: ["SOURCE_OF_TRUTH.md"]
  });

  const source = createSource(t);
  const locatorPath = path.join(source, "normalized.ndjson");
  fs.writeFileSync(locatorPath, "{not-json\n");
  const receiptPath = path.join(source, "manifest.json");
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  receipt.files["normalized.ndjson"] = sha256(fs.readFileSync(locatorPath));
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.deepEqual(queryFixture(source, "anything"), {
    status: "HOLD",
    reason: "LOCATOR_INVALID",
    trace: ["SOURCE_OF_TRUTH.md", "manifest.json"]
  });
});

test("privacy, dynamic facts, irreversible actions, and low-risk experiments remain distinct", () => {
  assert.equal(missDecision({ privacy: true }), "QUERY_PRIVACY_DENY");
  assert.equal(missDecision({ dynamic: true }), "VERIFY");
  assert.equal(missDecision({ irreversible: true }), "STOP");
  assert.equal(missDecision({ highRisk: true }), "ESCALATE");
  assert.equal(missDecision(), "MINIMAL_EXPERIMENT");
  assert.equal(missDecision({ rollback: false }), "UNKNOWN");

  for (const required of [
    "QUERY_PRIVACY_DENY",
    "同一回合核验当前官方或权威来源",
    "生产不可逆操作",
    "成功信号、停止条件和恢复方法"
  ]) {
    assert.equal(CONTRACT_TEXT.includes(required), true, required);
  }
});

test("the public contract forbids private identifiers and raw content in release fixtures", () => {
  for (const required of [
    "默认不输出私域绝对路径",
    "消息／线程标识",
    "不把原始消息复制到公开 Git、测试 fixture",
    "不把聊天观点漂白成事实",
    "SOURCE_DECLARED_INTEGRITY"
  ]) {
    assert.equal(CONTRACT_TEXT.includes(required), true, required);
  }
  const fixedUserPath = [path.posix.sep, "Users", path.posix.sep].join("");
  assert.equal(SKILL_TEXT.includes(fixedUserPath), false);
  assert.equal(CONTRACT_TEXT.includes(fixedUserPath), false);
});
