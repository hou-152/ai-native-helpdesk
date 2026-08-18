#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "knowledge-production.schema.json");
const EXPECTED_SCHEMA_SHA256 = "dd9ceb2dc494ef541b5e9962c505e941268a7aadba6a5767c11bcb195d1b9548";
const MAX_INPUT_BYTES = 64 * 1024;
const RECORD_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;
const RECORD_KEYS = Object.freeze([
  "schema_version",
  "record_id",
  "source_lane",
  "candidate_authorization",
  "feedback_level",
  "answer_candidate_status",
  "human_distillation",
  "answer_status",
  "applicability_status",
  "next_action_status",
  "verification_method_status",
  "machine_structure",
  "human_qa",
  "editorial",
  "verification",
  "privacy_gate",
  "publication",
  "owner_publication_decision"
]);

const ENUMS = Object.freeze({
  source_lane: ["ORDINARY_AUTHORIZED_CANDIDATE", "MISS_REVIEWED_ANSWER_CANDIDATE"],
  candidate_authorization: ["APPROVED", "PENDING_G12", "HOLD"],
  feedback_level: ["NOT_APPLICABLE", "MISS", "ACKNOWLEDGED", "ADOPTED", "OUTCOME_REPORTED"],
  answer_candidate_status: ["NOT_APPLICABLE", "DRAFT", "APPROVED"],
  human_distillation: ["NOT_APPLICABLE", "PENDING", "PASS"],
  answer_status: ["READY", "MISSING"],
  applicability_status: ["READY", "MISSING"],
  next_action_status: ["READY", "MISSING"],
  verification_method_status: ["READY", "MISSING"],
  machine_structure: ["PASS", "FAIL"],
  human_qa: ["PASS", "PENDING_G12", "FAIL"],
  editorial: ["APPROVED", "HOLD"],
  verification: ["PASS", "HOLD"],
  privacy_gate: ["PASS", "HOLD"],
  publication: ["READY", "HOLD"],
  owner_publication_decision: ["APPROVED", "PENDING_G12", "DENIED"]
});

class ProductionError extends Error {
  constructor(reasonCode, exitCode = 65) {
    super(reasonCode);
    this.reasonCode = reasonCode;
    this.exitCode = exitCode;
  }
}

function deny(reasonCode, exitCode = 65) {
  throw new ProductionError(reasonCode, exitCode);
}

function exactKeys(value, expectedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validateSchemaContract(schema) {
  if (!exactKeys(schema?.properties, RECORD_KEYS)) deny("SCHEMA_CONTRACT_INVALID");
  if (schema.additionalProperties !== false || !Array.isArray(schema.required)) deny("SCHEMA_CONTRACT_INVALID");
  if ([...schema.required].sort().join("\n") !== [...RECORD_KEYS].sort().join("\n")) {
    deny("SCHEMA_CONTRACT_INVALID");
  }
  for (const [field, values] of Object.entries(ENUMS)) {
    const declared = schema.properties[field]?.enum;
    if (!Array.isArray(declared) || [...declared].sort().join("\n") !== [...values].sort().join("\n")) {
      deny("SCHEMA_CONTRACT_INVALID");
    }
  }
}

function validateRecord(record) {
  if (!exactKeys(record, RECORD_KEYS)) deny("RECORD_SCHEMA_INVALID");
  if (record.schema_version !== "1.0" || !RECORD_ID_PATTERN.test(record.record_id)) {
    deny("RECORD_SCHEMA_INVALID");
  }
  for (const [field, values] of Object.entries(ENUMS)) {
    if (!values.includes(record[field])) deny("RECORD_SCHEMA_INVALID");
  }
}

function hold(recordId, reasonCode) {
  return { status: "HOLD", reason_code: reasonCode, record_id: recordId };
}

function evaluateRecord(record, target) {
  validateRecord(record);

  if (record.source_lane === "ORDINARY_AUTHORIZED_CANDIDATE") {
    if (
      record.feedback_level !== "NOT_APPLICABLE" ||
      record.answer_candidate_status !== "NOT_APPLICABLE" ||
      record.human_distillation !== "NOT_APPLICABLE"
    ) {
      return hold(record.record_id, "LANE_STATE_INVALID");
    }
  } else {
    if (!new Set(["ADOPTED", "OUTCOME_REPORTED"]).has(record.feedback_level)) {
      return hold(record.record_id, "MISS_FEEDBACK_NOT_ADOPTED");
    }
    if (record.answer_candidate_status !== "APPROVED") {
      return hold(record.record_id, "ANSWER_CANDIDATE_REVIEW_REQUIRED");
    }
    if (record.human_distillation !== "PASS") {
      return hold(record.record_id, "HUMAN_DISTILLATION_REQUIRED");
    }
  }

  if (record.candidate_authorization !== "APPROVED") {
    return hold(record.record_id, "CANDIDATE_AUTHORIZATION_REQUIRED");
  }

  for (const field of ["answer_status", "applicability_status", "next_action_status", "verification_method_status"]) {
    if (record[field] !== "READY") return hold(record.record_id, "ACTIONABLE_CONTENT_INCOMPLETE");
  }
  if (record.machine_structure !== "PASS") return hold(record.record_id, "MACHINE_STRUCTURE_FAILED");

  if (target === "private-card") {
    return { status: "READY", reason_code: "PRIVATE_CARD_READY", record_id: record.record_id };
  }

  if (record.human_qa !== "PASS") return hold(record.record_id, "HUMAN_QA_REQUIRED");
  if (record.editorial !== "APPROVED") return hold(record.record_id, "EDITORIAL_APPROVAL_REQUIRED");
  if (record.verification !== "PASS") return hold(record.record_id, "VERIFICATION_REQUIRED");
  if (record.privacy_gate !== "PASS") return hold(record.record_id, "PRIVACY_APPROVAL_REQUIRED");
  if (record.publication !== "READY") return hold(record.record_id, "PUBLICATION_GATE_REQUIRED");
  if (record.owner_publication_decision !== "APPROVED") {
    return hold(record.record_id, "OWNER_PUBLICATION_REQUIRED");
  }
  return { status: "READY", reason_code: "PUBLIC_PROJECTION_READY", record_id: record.record_id };
}

function parseArguments(argv) {
  if (argv.length !== 4 || argv[0] !== "--input" || argv[2] !== "--target") deny("ARGUMENT_INVALID", 64);
  if (!["private-card", "public-projection"].includes(argv[3])) deny("ARGUMENT_INVALID", 64);
  return { input: argv[1], target: argv[3] };
}

function readJsonFile(filePath, maxBytes, malformedCode, unavailableCode) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    deny(unavailableCode, 66);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) deny(unavailableCode, 66);
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    deny(unavailableCode, 66);
  }
  try {
    return { value: JSON.parse(text), text };
  } catch {
    deny(malformedCode);
  }
}

function loadSchema() {
  const { value: schema, text } = readJsonFile(
    SCHEMA_PATH,
    MAX_INPUT_BYTES,
    "SCHEMA_JSON_INVALID",
    "SCHEMA_UNAVAILABLE"
  );
  const digest = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  if (digest !== EXPECTED_SCHEMA_SHA256) deny("SCHEMA_CONTRACT_INVALID");
  validateSchemaContract(schema);
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    loadSchema();
    const { value: record } = readJsonFile(
      path.resolve(options.input),
      MAX_INPUT_BYTES,
      "RECORD_JSON_INVALID",
      "RECORD_UNAVAILABLE"
    );
    process.stdout.write(`${JSON.stringify(evaluateRecord(record, options.target))}\n`);
  } catch (error) {
    const reasonCode = error instanceof ProductionError ? error.reasonCode : "INTERNAL_ERROR";
    const exitCode = error instanceof ProductionError ? error.exitCode : 70;
    process.stdout.write(`${JSON.stringify({ status: "DENY", reason_code: reasonCode })}\n`);
    process.exitCode = exitCode;
  }
}

export { RECORD_KEYS, evaluateRecord, validateRecord };

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();
