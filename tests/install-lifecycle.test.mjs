import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { install } from "../scripts/manage-install.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_INSTALLER = path.join(REPO_ROOT, "scripts", "manage-install.mjs");
const EXPECTED_RELEASE_FILES = Object.freeze([
  "LICENSE",
  "README.md",
  "SKILL.md",
  "contracts/action.md",
  "contracts/good-question.md",
  "contracts/knowledge.md",
  "contracts/safety.md",
  "contracts/thinking.md",
  "docs/INSTALL.md",
  "docs/TUTORIAL.md",
  "scripts/install-deps.mjs",
  "scripts/manage-install.mjs"
]);
const RETIRED_PATH_PATTERNS = Object.freeze([
  /(?:^|\/)knowledge\/(?:public|archive)(?:\/|$)/,
  /(?:^|\/)query-(?:public-card|candidates)\.mjs$/,
  /(?:^|\/)public-card\.md$/,
  /(?:^|\/)public-card\.schema\.json$/,
  /(?:^|\/)feedback-ledger\.mjs$/,
  /(?:^|\/)knowledge-production\.mjs$/,
  /(?:^|\/)helpdesk-turn-contract\.mjs$/,
  /(?:^|\/)retrieval(?:\/|[-.])/
]);

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

function parseOutput(result) {
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function tempCase(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aihd private source "));
  const unrelated = path.join(root, "unrelated cwd");
  fs.mkdirSync(unrelated);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, unrelated };
}

function walkFiles(root, current = root, output = []) {
  for (const name of fs.readdirSync(current).sort()) {
    const absolutePath = path.join(current, name);
    const stat = fs.lstatSync(absolutePath);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) walkFiles(root, absolutePath, output);
    else if (stat.isFile()) output.push(path.relative(root, absolutePath).split(path.sep).join("/"));
  }
  return output;
}

function walkActiveSource(root, current = root, output = []) {
  for (const name of fs.readdirSync(current).sort()) {
    if (current === root && new Set([".git", ".trash"]).has(name)) continue;
    const absolutePath = path.join(current, name);
    const stat = fs.lstatSync(absolutePath);
    assert.equal(stat.isSymbolicLink(), false);
    if (stat.isDirectory()) walkActiveSource(root, absolutePath, output);
    else if (stat.isFile()) output.push(path.relative(root, absolutePath).split(path.sep).join("/"));
  }
  return output;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function snapshotTree(root) {
  return Object.fromEntries(walkFiles(root).map((relativePath) => [
    relativePath,
    {
      bytes: fs.statSync(path.join(root, relativePath)).size,
      sha256: sha256(path.join(root, relativePath))
    }
  ]));
}

function installFresh({ root, unrelated }, name = "installed skill") {
  const target = path.join(root, name);
  const state = path.join(root, `${name} state.json`);
  const result = run(SOURCE_INSTALLER, [
    "install",
    "--source", REPO_ROOT,
    "--target", target,
    "--state", state
  ], unrelated);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(parseOutput(result).status, "INSTALLED");
  return { target, state };
}

function createLegacyEightCardTarget(target) {
  fs.mkdirSync(path.join(target, "knowledge", "public", "cards"), { recursive: true });
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(target, "contracts"), { recursive: true });
  for (let index = 1; index <= 8; index += 1) {
    const cardId = `AIHD-PC-${String(index).padStart(6, "0")}`;
    fs.writeFileSync(
      path.join(target, "knowledge", "public", "cards", `${cardId}.json`),
      `{"card_id":"${cardId}","legacy":true}\n`
    );
  }
  fs.writeFileSync(path.join(target, "knowledge", "public", "index.json"), "{\"cards\":8}\n");
  fs.writeFileSync(path.join(target, "scripts", "query-public-card.mjs"), "legacy loader\n");
  fs.writeFileSync(path.join(target, "contracts", "public-card.md"), "legacy contract\n");
}

test("fresh spaced-path install verifies a thin package with zero active card-stack files", (t) => {
  const fixture = tempCase(t);
  const { target, state } = installFresh(fixture);
  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");

  const verified = run(installedInstaller, ["verify", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(verified.status, 0, verified.stdout);
  assert.equal(parseOutput(verified).status, "VERIFIED");

  const manifest = JSON.parse(fs.readFileSync(path.join(target, "release-files.v1.json"), "utf8"));
  assert.deepEqual(manifest.files, EXPECTED_RELEASE_FILES);
  const installedFiles = walkFiles(target);
  assert.deepEqual(installedFiles, ["release-files.v1.json", ...EXPECTED_RELEASE_FILES].sort());
  for (const relativePath of installedFiles) {
    assert.equal(RETIRED_PATH_PATTERNS.some((pattern) => pattern.test(relativePath)), false, relativePath);
  }

  const skill = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
  const knowledge = fs.readFileSync(path.join(target, "contracts", "knowledge.md"), "utf8");
  assert.match(skill, /\$dbs-knowledge/);
  assert.match(knowledge, /SOURCE_UNAVAILABLE/);
  assert.match(knowledge, /SOURCE_OF_TRUTH\.md/);

  const uninstalled = run(installedInstaller, ["uninstall", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(uninstalled.status, 0, uninstalled.stdout);
  const uninstallOutput = parseOutput(uninstalled);
  assert.equal(uninstallOutput.status, "UNINSTALLED");
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.statSync(uninstallOutput.recoverable_copy).isDirectory(), true);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).status, "UNINSTALLED");
});

test("install over a legacy eight-card target removes the active stack and rollback restores it byte-identically", (t) => {
  const fixture = tempCase(t);
  const target = path.join(fixture.root, "legacy eight-card target");
  const state = path.join(fixture.root, "migration state.json");
  createLegacyEightCardTarget(target);
  const legacySnapshot = snapshotTree(target);
  assert.equal(Object.keys(legacySnapshot).filter((item) => item.includes("/cards/")).length, 8);

  const installed = run(SOURCE_INSTALLER, [
    "install",
    "--source", REPO_ROOT,
    "--target", target,
    "--state", state
  ], fixture.unrelated);
  assert.equal(installed.status, 0, installed.stdout);

  const installState = JSON.parse(fs.readFileSync(state, "utf8"));
  assert.equal(installState.previous_target.existed, true);
  assert.deepEqual(snapshotTree(installState.previous_target.backup), legacySnapshot);
  assert.equal(fs.existsSync(path.join(target, "knowledge", "public")), false);
  assert.equal(fs.existsSync(path.join(target, "scripts", "query-public-card.mjs")), false);
  assert.equal(fs.existsSync(path.join(target, "contracts", "public-card.md")), false);

  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");
  const verified = run(installedInstaller, ["verify", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(verified.status, 0, verified.stdout);

  const rolledBack = run(installedInstaller, ["rollback", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(rolledBack.status, 0, rolledBack.stdout);
  assert.equal(parseOutput(rolledBack).status, "ROLLED_BACK");
  assert.deepEqual(snapshotTree(target), legacySnapshot);
});

test("failure after backing up a pre-existing target restores the old target", (t) => {
  const fixture = tempCase(t);
  const target = path.join(fixture.root, "restore on install failure");
  const state = path.join(fixture.root, "injected failure state.json");
  const sentinel = Buffer.from("restore these exact bytes\n", "utf8");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "sentinel.txt"), sentinel);

  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function injectedWriteFailure(file, ...args) {
    if (path.basename(String(file)).startsWith(`${path.basename(state)}.tmp-`)) {
      throw new Error("INJECTED_STATE_WRITE_FAILURE");
    }
    return originalWriteFileSync.call(this, file, ...args);
  };
  try {
    assert.throws(
      () => install({ source: REPO_ROOT, target, state }),
      /INJECTED_STATE_WRITE_FAILURE/
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  assert.deepEqual(fs.readFileSync(path.join(target, "sentinel.txt")), sentinel);
  assert.equal(fs.existsSync(state), false);
  assert.equal(
    fs.readdirSync(fixture.root).some((name) => name.startsWith("restore on install failure.backup-")),
    false
  );
});

test("verify fails closed after an installed contract drifts", (t) => {
  const fixture = tempCase(t);
  const { target, state } = installFresh(fixture, "tamper target");
  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");
  fs.appendFileSync(path.join(target, "contracts", "knowledge.md"), "\n");

  const result = run(installedInstaller, ["verify", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(result.status, 65);
  assert.deepEqual(parseOutput(result), { status: "FAIL_CLOSED", reason_code: "INSTALL_BYTE_DRIFT" });
});

test("verify rejects a reintroduced legacy loader as file-set drift", (t) => {
  const fixture = tempCase(t);
  const { target, state } = installFresh(fixture, "legacy drift target");
  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");
  fs.writeFileSync(path.join(target, "scripts", "query-public-card.mjs"), "reintroduced\n");

  const result = run(installedInstaller, ["verify", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(result.status, 65);
  assert.deepEqual(parseOutput(result), { status: "FAIL_CLOSED", reason_code: "INSTALL_FILE_SET_DRIFT" });
});

test("release manifest is sorted and excludes private, development, and retired runtime paths", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "release-files.v1.json"), "utf8"));
  assert.deepEqual(manifest.files, EXPECTED_RELEASE_FILES);
  assert.deepEqual(manifest.files, [...manifest.files].sort());
  for (const item of manifest.files) {
    assert.equal(/^(?:\.git|\.internal|\.trash|evals|evidence|memory|node_modules|tests)(?:\/|$)/.test(item), false);
    assert.equal(/(?:^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:log|sqlite|jsonl|ndjson))$/.test(item), false);
    assert.equal(RETIRED_PATH_PATTERNS.some((pattern) => pattern.test(item)), false, item);
  }
  assert.equal(manifest.files.filter((item) => /^knowledge\/(?:public|archive)\//.test(item)).length, 0);
});

test("active source tree contains no retired runtime files outside local trash", () => {
  const activeFiles = walkActiveSource(REPO_ROOT);
  for (const relativePath of activeFiles) {
    assert.equal(RETIRED_PATH_PATTERNS.some((pattern) => pattern.test(relativePath)), false, relativePath);
  }
});

test("release preserves Apache-2.0 while treating dbs-knowledge as an unbundled dependency", () => {
  const skill = fs.readFileSync(path.join(REPO_ROOT, "SKILL.md"), "utf8");
  const license = fs.readFileSync(path.join(REPO_ROOT, "LICENSE"), "utf8");
  assert.match(skill, /^license: Apache-2\.0$/m);
  assert.match(skill, /外部 Agent Skill 合同/);
  assert.match(skill, /不随本包复制/);
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);

  for (const relativePath of EXPECTED_RELEASE_FILES.filter((item) => item.endsWith(".md"))) {
    const text = fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
    assert.equal(text.includes("~/.agents/skills"), false, relativePath);
    assert.equal(text.includes("/Users/"), false, relativePath);
  }
});

test("install refuses a symlink target without modifying the linked directory", (t) => {
  const fixture = tempCase(t);
  const realTarget = path.join(fixture.root, "real target");
  const linkedTarget = path.join(fixture.root, "linked target");
  const state = path.join(fixture.root, "symlink state.json");
  fs.mkdirSync(realTarget);
  fs.writeFileSync(path.join(realTarget, "sentinel.txt"), "unchanged\n");
  fs.symlinkSync(realTarget, linkedTarget);

  const result = run(SOURCE_INSTALLER, [
    "install",
    "--source", REPO_ROOT,
    "--target", linkedTarget,
    "--state", state
  ], fixture.unrelated);
  assert.equal(result.status, 65);
  assert.deepEqual(parseOutput(result), { status: "FAIL_CLOSED", reason_code: "EXISTING_TARGET_UNSAFE" });
  assert.equal(fs.readFileSync(path.join(realTarget, "sentinel.txt"), "utf8"), "unchanged\n");
  assert.equal(fs.existsSync(state), false);
});

test("install refuses a symlink state without modifying its destination", (t) => {
  const fixture = tempCase(t);
  const target = path.join(fixture.root, "state symlink target");
  const realState = path.join(fixture.root, "real state.json");
  const linkedState = path.join(fixture.root, "linked state.json");
  fs.writeFileSync(realState, "unchanged state destination\n");
  fs.symlinkSync(realState, linkedState);

  const result = run(SOURCE_INSTALLER, [
    "install",
    "--source", REPO_ROOT,
    "--target", target,
    "--state", linkedState
  ], fixture.unrelated);
  assert.equal(result.status, 65);
  assert.deepEqual(parseOutput(result), { status: "FAIL_CLOSED", reason_code: "STATE_PATH_UNSAFE" });
  assert.equal(fs.readFileSync(realState, "utf8"), "unchanged state destination\n");
  assert.equal(fs.existsSync(target), false);
});
