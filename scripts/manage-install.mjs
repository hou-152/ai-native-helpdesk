#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_SOURCE = path.resolve(path.dirname(SCRIPT_PATH), "..");
const MANIFEST_NAME = "release-files.v1.json";
const COMMANDS = new Set(["install", "verify", "uninstall", "rollback", "install-deps"]);
const FORBIDDEN_RELEASE_PREFIXES = [
  ".git/",
  ".internal/",
  "evals/",
  "evidence/",
  "memory/",
  "node_modules/",
  "tests/"
];
const HASH_RE = /^[a-f0-9]{64}$/;

class InstallError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "InstallError";
    this.reason_code = reasonCode;
  }
}

function fail(reasonCode) {
  throw new InstallError(reasonCode);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function token() {
  return `${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) fail("INVALID_COMMAND");
  const options = {};
  const allowedKeys = command === "install-deps"
    ? new Set(["skills-dir"])
    : new Set(["source", "target", "state"]);
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || typeof value !== "string" || value.length === 0) fail("INVALID_ARGUMENTS");
    const key = flag.slice(2);
    if (!allowedKeys.has(key) || Object.hasOwn(options, key)) fail("INVALID_ARGUMENTS");
    options[key] = value;
  }
  if (command === "install-deps") return { command, options };
  if (!options.target) fail("TARGET_REQUIRED");
  if (command !== "install" && options.source) fail("SOURCE_ONLY_ALLOWED_FOR_INSTALL");
  return { command, options };
}

function lstatIfExists(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertDirectoryNoSymlink(target, reasonCode) {
  const stat = lstatIfExists(target);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) fail(reasonCode);
}

function assertRegularNoSymlink(target, reasonCode) {
  const stat = lstatIfExists(target);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) fail(reasonCode);
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolveTarget(rawTarget) {
  const target = path.resolve(rawTarget);
  if (target === path.parse(target).root || path.basename(target).length === 0) fail("TARGET_TOO_BROAD");
  const parent = path.dirname(target);
  assertDirectoryNoSymlink(parent, "TARGET_PARENT_UNSAFE");
  const realParent = fs.realpathSync(parent);
  return path.join(realParent, path.basename(target));
}

function resolveState(rawState, target) {
  const state = path.resolve(rawState ?? `${target}.install-state.json`);
  if (isWithin(target, state)) fail("STATE_MUST_BE_OUTSIDE_TARGET");
  const parent = path.dirname(state);
  assertDirectoryNoSymlink(parent, "STATE_PARENT_UNSAFE");
  return path.join(fs.realpathSync(parent), path.basename(state));
}

function resolveSource(rawSource, target) {
  const source = path.resolve(rawSource ?? DEFAULT_SOURCE);
  assertDirectoryNoSymlink(source, "SOURCE_UNSAFE");
  const realSource = fs.realpathSync(source);
  if (isWithin(realSource, target) || isWithin(target, realSource)) fail("SOURCE_TARGET_OVERLAP");
  return realSource;
}

function validateRelativeFile(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((part) => part === "" || part === "." || part === "..") ||
    FORBIDDEN_RELEASE_PREFIXES.some((prefix) => value === prefix.slice(0, -1) || value.startsWith(prefix)) ||
    /(?:^|\/)(?:\.env(?:\.|$)|[^/]+\.(?:log|sqlite|sqlite-[^/]+|jsonl|ndjson))$/.test(value)
  ) {
    fail("RELEASE_FILE_PATH_FORBIDDEN");
  }
}

function loadManifest(source) {
  const manifestPath = path.join(source, MANIFEST_NAME);
  assertRegularNoSymlink(manifestPath, "MANIFEST_UNAVAILABLE");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    fail("MANIFEST_INVALID");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    Object.keys(manifest).sort().join(",") !== "files,schema_version" ||
    manifest.schema_version !== "1.0" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    fail("MANIFEST_INVALID");
  }
  const seen = new Set();
  for (const item of manifest.files) {
    validateRelativeFile(item);
    if (seen.has(item) || item === MANIFEST_NAME) fail("MANIFEST_INVALID");
    seen.add(item);
  }
  const sorted = [...manifest.files].sort();
  if (sorted.some((item, index) => item !== manifest.files[index])) fail("MANIFEST_NOT_SORTED");
  return { manifestPath, files: manifest.files };
}

function sourceEntries(source) {
  const { manifestPath, files } = loadManifest(source);
  const entries = [MANIFEST_NAME, ...files].map((relativePath) => {
    const absolutePath = path.resolve(source, relativePath);
    if (!isWithin(source, absolutePath)) fail("RELEASE_FILE_PATH_FORBIDDEN");
    assertRegularNoSymlink(absolutePath, "RELEASE_FILE_UNAVAILABLE");
    const bytes = fs.readFileSync(absolutePath);
    return { path: relativePath, sha256: sha256(bytes), bytes: bytes.length };
  });
  return {
    entries,
    manifest_sha256: sha256(fs.readFileSync(manifestPath))
  };
}

function walkFiles(root, current = root, result = []) {
  const directory = fs.lstatSync(current);
  if (!directory.isDirectory() || directory.isSymbolicLink()) fail("INSTALL_TREE_UNSAFE");
  for (const name of fs.readdirSync(current).sort()) {
    const absolutePath = path.join(current, name);
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) fail("INSTALL_TREE_SYMLINK_FORBIDDEN");
    if (stat.isDirectory()) {
      walkFiles(root, absolutePath, result);
    } else if (stat.isFile()) {
      result.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    } else {
      fail("INSTALL_TREE_UNSAFE");
    }
  }
  return result;
}

function verifyTree(target, entries) {
  assertDirectoryNoSymlink(target, "TARGET_NOT_INSTALLED");
  const expectedPaths = entries.map((entry) => entry.path).sort();
  const actualPaths = walkFiles(target).sort();
  if (expectedPaths.length !== actualPaths.length || expectedPaths.some((item, index) => item !== actualPaths[index])) {
    fail("INSTALL_FILE_SET_DRIFT");
  }
  for (const entry of entries) {
    const absolutePath = path.join(target, entry.path);
    assertRegularNoSymlink(absolutePath, "INSTALL_TREE_UNSAFE");
    const bytes = fs.readFileSync(absolutePath);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) fail("INSTALL_BYTE_DRIFT");
  }
  return true;
}

function copyRelease(source, staging, entries) {
  fs.mkdirSync(staging, { mode: 0o700 });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.path);
    const targetPath = path.join(staging, entry.path);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o755 });
    fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(targetPath, entry.path === "scripts/manage-install.mjs" ? 0o755 : 0o644);
  }
  verifyTree(staging, entries);
}

function atomicWriteJson(target, value, { replace = false } = {}) {
  const existing = lstatIfExists(target);
  if (existing?.isSymbolicLink() || (existing && !existing.isFile())) fail("STATE_PATH_UNSAFE");
  if (existing && !replace) fail("STATE_ALREADY_EXISTS");
  const temporary = `${target}.tmp-${token()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
  } finally {
    if (lstatIfExists(temporary)) fs.unlinkSync(temporary);
  }
}

function loadState(statePath, target) {
  assertRegularNoSymlink(statePath, "STATE_UNAVAILABLE");
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    fail("STATE_INVALID");
  }
  if (
    !state ||
    state.schema_version !== "1.0" ||
    state.target !== target ||
    !Array.isArray(state.entries) ||
    !state.entries.every((entry) =>
      entry && typeof entry.path === "string" && HASH_RE.test(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0
    )
  ) {
    fail("STATE_INVALID");
  }
  return state;
}

function install(options) {
  const target = resolveTarget(options.target);
  const statePath = resolveState(options.state, target);
  const stateStat = lstatIfExists(statePath);
  if (stateStat?.isSymbolicLink() || (stateStat && !stateStat.isFile())) fail("STATE_PATH_UNSAFE");
  if (stateStat) fail("STATE_ALREADY_EXISTS");
  const source = resolveSource(options.source, target);
  const { entries, manifest_sha256 } = sourceEntries(source);
  const targetStat = lstatIfExists(target);
  if (targetStat && (!targetStat.isDirectory() || targetStat.isSymbolicLink())) fail("EXISTING_TARGET_UNSAFE");

  const staging = `${target}.stage-${token()}`;
  const backup = targetStat ? `${target}.backup-${token()}` : null;
  let targetBackedUp = false;
  let installed = false;
  try {
    copyRelease(source, staging, entries);
    if (backup) {
      fs.renameSync(target, backup);
      targetBackedUp = true;
    }
    fs.renameSync(staging, target);
    installed = true;
    verifyTree(target, entries);
    atomicWriteJson(statePath, {
      schema_version: "1.0",
      status: "INSTALLED",
      installed_at: nowIso(),
      target,
      manifest_sha256,
      entries,
      previous_target: {
        existed: Boolean(backup),
        backup
      },
      lifecycle: []
    });
  } catch (error) {
    if (installed && lstatIfExists(target)) fs.renameSync(target, `${target}.failed-${token()}`);
    if (targetBackedUp && backup && lstatIfExists(backup) && !lstatIfExists(target)) fs.renameSync(backup, target);
    if (lstatIfExists(staging)) fs.rmSync(staging, { recursive: true });
    throw error;
  }
  return {
    status: "INSTALLED",
    reason_code: "OK",
    file_count: entries.length,
    manifest_sha256,
    previous_target_backed_up: Boolean(backup),
    state: statePath
  };
}

function verify(options) {
  const target = resolveTarget(options.target);
  const statePath = resolveState(options.state, target);
  const state = loadState(statePath, target);
  if (state.status !== "INSTALLED") fail("INSTALL_NOT_ACTIVE");
  verifyTree(target, state.entries);
  return {
    status: "VERIFIED",
    reason_code: "OK",
    file_count: state.entries.length,
    manifest_sha256: state.manifest_sha256
  };
}

function deactivate(command, options) {
  const target = resolveTarget(options.target);
  const statePath = resolveState(options.state, target);
  const state = loadState(statePath, target);
  if (state.status !== "INSTALLED") fail("INSTALL_NOT_ACTIVE");
  verifyTree(target, state.entries);

  const displaced = `${target}.${command === "rollback" ? "rolled-back" : "removed"}-${token()}`;
  const backup = state.previous_target?.backup ?? null;
  if (backup) assertDirectoryNoSymlink(backup, "BACKUP_UNAVAILABLE");
  let displacedCurrent = false;
  let restoredBackup = false;
  try {
    fs.renameSync(target, displaced);
    displacedCurrent = true;
    if (backup) {
      fs.renameSync(backup, target);
      restoredBackup = true;
    }
    const nextState = {
      ...state,
      status: command === "rollback" ? "ROLLED_BACK" : "UNINSTALLED",
      lifecycle: [
        ...state.lifecycle,
        {
          action: command.toUpperCase(),
          occurred_at: nowIso(),
          displaced,
          previous_target_restored: restoredBackup
        }
      ]
    };
    atomicWriteJson(statePath, nextState, { replace: true });
  } catch (error) {
    if (restoredBackup && lstatIfExists(target) && backup && !lstatIfExists(backup)) fs.renameSync(target, backup);
    if (displacedCurrent && lstatIfExists(displaced) && !lstatIfExists(target)) fs.renameSync(displaced, target);
    throw error;
  }
  return {
    status: command === "rollback" ? "ROLLED_BACK" : "UNINSTALLED",
    reason_code: "OK",
    previous_target_restored: restoredBackup,
    recoverable_copy: displaced,
    state: statePath
  };
}

function emit(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}

function runInstallDeps(options) {
  const depsScript = path.join(path.dirname(SCRIPT_PATH), "install-deps.mjs");
  if (!fs.existsSync(depsScript)) fail("DEPS_SCRIPT_MISSING");
  const args = options["skills-dir"]
    ? [depsScript, "--skills-dir", options["skills-dir"]]
    : [depsScript];
  const result = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 180000 });
  if (result.status !== 0) fail("DEPS_INSTALL_FAILED");
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail("DEPS_INSTALL_INVALID_OUTPUT");
  }
}

function main() {
  try {
    const { command, options } = parseArgs(process.argv.slice(2));
    const result = command === "install"
      ? install(options)
      : command === "verify"
        ? verify(options)
        : command === "install-deps"
          ? runInstallDeps(options)
          : deactivate(command, options);
    emit(result);
  } catch (error) {
    emit({
      status: "FAIL_CLOSED",
      reason_code: error instanceof InstallError ? error.reason_code : "INTERNAL_ERROR"
    }, error instanceof InstallError ? 65 : 70);
  }
}

function isMainModule() {
  try {
    return process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(SCRIPT_PATH);
  } catch {
    return false;
  }
}

export {
  InstallError,
  deactivate,
  install,
  loadManifest,
  verify,
  verifyTree
};

if (isMainModule()) main();
