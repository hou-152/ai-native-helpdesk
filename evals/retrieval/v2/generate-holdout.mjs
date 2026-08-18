#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const SPEC_PATH = path.join(HERE, "holdout-spec.v2.json");
const OUTPUT_PATH = path.join(HERE, "holdout.v2.json");

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--implementation-commit") {
    throw new Error("USAGE: --implementation-commit <40-hex-sha>");
  }
  const implementationCommit = argv[1];
  if (!/^[0-9a-f]{40}$/.test(implementationCommit)) throw new Error("IMPLEMENTATION_COMMIT_INVALID");
  return implementationCommit;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error("GIT_HEAD_UNAVAILABLE");
  return result.stdout.trim();
}

function makeRandom(seedHex) {
  let state = Number.parseInt(seedHex.slice(0, 8), 16) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function choose(values, random) {
  return values[Math.floor(random() * values.length)];
}

function expand(template, slots, random) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
    const values = slots[key];
    if (!Array.isArray(values) || values.length === 0) throw new Error(`HOLDOUT_SLOT_INVALID:${key}`);
    return choose(values, random);
  });
}

function validateSpec(spec) {
  if (
    spec?.schema_version !== "2.0" ||
    spec?.spec_id !== "aihd-retrieval-holdout-spec-v2" ||
    spec?.seed_namespace !== "AIHD_PHASE1_V2_HOLDOUT_2026-08-18" ||
    !Array.isArray(spec.families)
  ) {
    throw new Error("HOLDOUT_SPEC_INVALID");
  }
  const count = spec.families.reduce((sum, family) => sum + family.count, 0);
  if (count !== spec.expected_case_count || count !== 30) throw new Error("HOLDOUT_SPEC_COUNT_INVALID");
}

function buildCases(spec, random) {
  const queries = new Set();
  const cases = [];
  let sequence = 1;
  for (const family of spec.families) {
    for (let offset = 0; offset < family.count; offset += 1) {
      let query = null;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = expand(choose(family.templates, random), family.slots, random);
        if (!queries.has(candidate)) {
          query = candidate;
          queries.add(candidate);
          break;
        }
      }
      if (!query) throw new Error(`HOLDOUT_QUERY_EXHAUSTED:${family.family_id}`);
      cases.push({
        case_id: `RET-V2-B-${String(sequence).padStart(3, "0")}`,
        split: "HOLDOUT",
        query,
        expected_status: family.expected_status,
        expected_candidates: family.expected_candidates,
        risk_class: family.risk_class,
        precondition: family.precondition,
        provenance: {
          kind: "synthetic_fixture",
          source_ref: `holdout-spec.v2.json#${family.family_id}`,
          privacy: "public_safe"
        },
        rationale: family.rationale,
        tags: family.tags
      });
      sequence += 1;
    }
  }
  return cases;
}

function main() {
  const implementationCommit = parseArguments(process.argv.slice(2));
  if (currentHead() !== implementationCommit) throw new Error("IMPLEMENTATION_COMMIT_NOT_HEAD");
  if (fs.existsSync(OUTPUT_PATH)) throw new Error("HOLDOUT_ALREADY_EXISTS");
  const specBytes = fs.readFileSync(SPEC_PATH);
  const spec = JSON.parse(specBytes.toString("utf8"));
  validateSpec(spec);
  const specSha = sha256(specBytes);
  const seedSha = sha256(`${spec.seed_namespace}\0${implementationCommit}\0${specSha}`);
  const dataset = {
    schema_version: "2.0",
    dataset_id: "aihd-retrieval-holdout-v2",
    generation: {
      namespace: spec.seed_namespace,
      implementation_commit: implementationCommit,
      spec_sha256: specSha,
      seed_sha256: seedSha
    },
    cases: buildCases(spec, makeRandom(seedSha))
  };
  const descriptor = fs.openSync(OUTPUT_PATH, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(dataset, null, 2)}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
  process.stdout.write(`${JSON.stringify({
    output: path.relative(REPO_ROOT, OUTPUT_PATH),
    cases: dataset.cases.length,
    spec_sha256: specSha,
    seed_sha256: seedSha,
    implementation_commit: implementationCommit
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
