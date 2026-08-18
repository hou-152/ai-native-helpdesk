import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { install } from "../scripts/manage-install.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_INSTALLER = path.join(REPO_ROOT, "scripts", "manage-install.mjs");

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
}

function parseOutput(result) {
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function tempCase(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aihd phase5 "));
  const unrelated = path.join(root, "unrelated cwd");
  fs.mkdirSync(unrelated);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, unrelated };
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

test("fresh spaced-path install verifies from unrelated cwd and serves the expanded approved pack", (t) => {
  const fixture = tempCase(t);
  const { target, state } = installFresh(fixture);
  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");
  const installedLoader = path.join(target, "scripts", "query-public-card.mjs");

  const verified = run(installedInstaller, ["verify", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(verified.status, 0, verified.stdout);
  assert.equal(parseOutput(verified).status, "VERIFIED");

  for (const [query, cardId] of [
    ["写进 AGENTS.md 的规则，怎样确认在 Codex 中生效？", "AIHD-PC-000001"],
    ["怎样让 OpenClaw Agent 形成受控自迭代闭环？", "AIHD-PC-000004"],
    ["OpenClaw 心跳怎样配置，才能主动检查但不空转或打扰？", "AIHD-PC-000005"],
    ["Compaction 之后怎样读回目标、硬约束和下一步？", "AIHD-PC-000008"]
  ]) {
    const result = run(installedLoader, ["--query", query], fixture.unrelated);
    assert.equal(result.status, 0, result.stdout);
    const output = parseOutput(result);
    assert.equal(output.status, "ALLOW");
    assert.equal(output.card.card_id, cardId);
  }

  const nearby = run(installedLoader, ["--query", "怎样训练 OpenClaw 的模型权重？"], fixture.unrelated);
  assert.equal(nearby.status, 0, nearby.stdout);
  assert.deepEqual(parseOutput(nearby), { status: "MISS", reason_code: "NO_MATCH" });

  const manifest = JSON.parse(fs.readFileSync(path.join(target, "release-files.v1.json"), "utf8"));
  const installedNames = fs.readdirSync(target).sort();
  assert.equal(installedNames.includes("evals"), false);
  assert.equal(installedNames.includes("tests"), false);
  assert.equal(installedNames.includes("evidence"), false);
  assert.equal(manifest.files.some((item) => item.startsWith("evals/") || item.startsWith("tests/")), false);

  const uninstalled = run(installedInstaller, ["uninstall", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(uninstalled.status, 0, uninstalled.stdout);
  const uninstallOutput = parseOutput(uninstalled);
  assert.equal(uninstallOutput.status, "UNINSTALLED");
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.statSync(uninstallOutput.recoverable_copy).isDirectory(), true);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).status, "UNINSTALLED");
});

test("install over a pre-existing target creates a backup and rollback restores it byte-identically", (t) => {
  const fixture = tempCase(t);
  const target = path.join(fixture.root, "pre-existing target");
  const state = path.join(fixture.root, "rollback state.json");
  const sentinel = Buffer.from("previous target bytes\n", "utf8");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "sentinel.txt"), sentinel);

  const installed = run(SOURCE_INSTALLER, [
    "install",
    "--source", REPO_ROOT,
    "--target", target,
    "--state", state
  ], fixture.unrelated);
  assert.equal(installed.status, 0, installed.stdout);
  const installState = JSON.parse(fs.readFileSync(state, "utf8"));
  assert.equal(installState.previous_target.existed, true);
  assert.equal(fs.statSync(installState.previous_target.backup).isDirectory(), true);

  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");
  const rolledBack = run(installedInstaller, ["rollback", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(rolledBack.status, 0, rolledBack.stdout);
  const output = parseOutput(rolledBack);
  assert.equal(output.status, "ROLLED_BACK");
  assert.equal(output.previous_target_restored, true);
  assert.deepEqual(fs.readFileSync(path.join(target, "sentinel.txt")), sentinel);
  assert.equal(fs.statSync(output.recoverable_copy).isDirectory(), true);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).status, "ROLLED_BACK");
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

test("verify fails closed after installed card byte drift", (t) => {
  const fixture = tempCase(t);
  const { target, state } = installFresh(fixture, "tamper target");
  const installedInstaller = path.join(target, "scripts", "manage-install.mjs");
  fs.appendFileSync(path.join(target, "knowledge", "public", "cards", "AIHD-PC-000004.json"), "\n");

  const result = run(installedInstaller, ["verify", "--target", target, "--state", state], fixture.unrelated);
  assert.equal(result.status, 65);
  assert.deepEqual(parseOutput(result), { status: "FAIL_CLOSED", reason_code: "INSTALL_BYTE_DRIFT" });
});

test("release manifest is sorted and excludes private or development-only paths", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "release-files.v1.json"), "utf8"));
  assert.deepEqual(manifest.files, [...manifest.files].sort());
  for (const item of manifest.files) {
    assert.equal(/^(?:\.git|\.internal|evals|evidence|memory|node_modules|tests)(?:\/|$)/.test(item), false);
    assert.equal(/(?:^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:log|sqlite|jsonl|ndjson))$/.test(item), false);
  }
});

test("release declares Apache-2.0 and runtime instructions contain no fixed user skill path", () => {
  const skill = fs.readFileSync(path.join(REPO_ROOT, "SKILL.md"), "utf8");
  const license = fs.readFileSync(path.join(REPO_ROOT, "LICENSE"), "utf8");
  assert.match(skill, /^license: Apache-2\.0$/m);
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);

  for (const relativePath of ["SKILL.md", "README.md", "contracts/knowledge.md", "contracts/public-card.md", "docs/INSTALL.md"]) {
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
