import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_POLICY_PATH,
  TURN_DESTINATIONS,
  evaluateTurn,
  evaluateTurnWithPolicyFile,
  loadPolicy
} from "../scripts/helpdesk-turn-contract.mjs";

const NOW = new Date("2026-08-18T02:00:00.000Z");
const TURN_STARTED_AT = "2026-08-18T01:30:00.000Z";
const POLICY = loadPolicy(DEFAULT_POLICY_PATH, NOW);
const CLI_PATH = fileURLToPath(new URL("../scripts/helpdesk-turn-contract.mjs", import.meta.url));
const REPO_ROOT = path.resolve(path.dirname(CLI_PATH), "..");

function sha256(relativePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO_ROOT, relativePath))).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function modelClaim(overrides = {}) {
  return {
    claim_id: "claim-model-1",
    text: "这是基于当前信息形成的低风险推理。",
    risk: "LOW",
    dynamic: false,
    versioned: false,
    definitive: true,
    source_kind: "MODEL_REASONING",
    card_id: null,
    evidence: [],
    ...overrides
  };
}

function externalClaim(overrides = {}) {
  return {
    claim_id: "claim-external-1",
    text: "这条事实来自本轮核验的官方文档。",
    risk: "LOW",
    dynamic: false,
    versioned: false,
    definitive: true,
    source_kind: "EXTERNAL_VERIFIED",
    card_id: null,
    evidence: [
      {
        source_id: "OPENAI_OFFICIAL_DOCS",
        url: "https://developers.openai.com/codex/guides/agents-md",
        retrieved_at: "2026-08-18T01:45:00.000Z",
        version: null
      }
    ],
    ...overrides
  };
}

function publicCardClaim(overrides = {}) {
  return {
    claim_id: "claim-card-1",
    text: "这条结论来自公共知识卡。",
    risk: "LOW",
    dynamic: false,
    versioned: false,
    definitive: true,
    source_kind: "PUBLIC_CARD",
    card_id: "AIHD-PC-000001",
    evidence: [],
    ...overrides
  };
}

function baseTurn() {
  return {
    schema_version: "1.0.0",
    turn_id: "turn-phase2-001",
    turn_started_at: TURN_STARTED_AT,
    safety_gate: "PASS",
    privacy_gate: "PASS",
    retrieval_status: "MISS",
    separate_external_route_authorized: false,
    external_query_sent: false,
    context: {
      missing_changes_path: false,
      candidate_paths_differ: false,
      ambiguity_stage: "NONE",
      unresolved: false,
      previous_question: null,
      question: null
    },
    proposed: {
      destination: "DO",
      destination_detail: "先执行一个可观察的小动作",
      claims: [modelClaim()]
    }
  };
}

test("default path answers directly when missing context would not change the path", () => {
  const result = evaluateTurn(baseTurn(), { now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.equal(result.internal_destination, "DO");
  assert.equal(result.question, null);
  assert.match(result.user_destination, /下一步先做/);
});

test("clarification gate asks exactly one question only when context changes the path", () => {
  const turn = baseTurn();
  turn.context.missing_changes_path = true;
  turn.context.unresolved = true;
  turn.context.question = "你现在使用的是本地运行还是云端运行？";
  turn.proposed.destination = "NEEDS_INPUT";
  turn.proposed.destination_detail = "补充运行环境";
  turn.proposed.claims = [];
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.equal(result.question, turn.context.question);

  turn.context.question = "你在本地吗？还是在云端吗？";
  const packedQuestions = evaluateTurn(turn, { now: NOW });
  assert.equal(packedQuestions.contract_status, "FAIL_CLOSED");
  assert.deepEqual(packedQuestions.reason_codes, ["CLARIFICATION_EXACTLY_ONE_REQUIRED"]);

  turn.context.question = null;
  const neverAsked = evaluateTurn(turn, { now: NOW });
  assert.equal(neverAsked.contract_status, "FAIL_CLOSED");
  assert.deepEqual(neverAsked.reason_codes, ["CLARIFICATION_EXACTLY_ONE_REQUIRED"]);
});

test("routine clarification fails when missing context does not change the path", () => {
  const turn = baseTurn();
  turn.context.question = "你还想补充更多背景吗？";
  turn.proposed.destination = "NEEDS_INPUT";
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "FAIL_CLOSED");
  assert.deepEqual(result.reason_codes, ["CLARIFICATION_NOT_JUSTIFIED"]);
});

test("candidate wording differences do not trigger a question when treatment paths agree", () => {
  const turn = baseTurn();
  turn.retrieval_status = "CLARIFY";
  turn.context.unresolved = true;
  turn.context.candidate_paths_differ = false;
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.equal(result.question, null);
});

test("different candidate paths require one discriminating question", () => {
  const turn = baseTurn();
  turn.retrieval_status = "CLARIFY";
  turn.context.unresolved = true;
  turn.context.candidate_paths_differ = true;
  turn.context.question = "规则是没有被读取，还是已读取但执行仍被拒绝？";
  turn.proposed.destination = "NEEDS_INPUT";
  turn.proposed.destination_detail = "区分两条处理路径";
  turn.proposed.claims = [];
  assert.equal(evaluateTurn(turn, { now: NOW }).contract_status, "CONTRACT_PASS");
});

test("an unknown answer permits one genuinely different reframe", () => {
  const turn = baseTurn();
  turn.context.missing_changes_path = true;
  turn.context.unresolved = true;
  turn.context.ambiguity_stage = "INITIAL_ASKED";
  turn.context.previous_question = "你是在本地还是云端运行？";
  turn.context.question = "如果断网后仍能运行，它更接近本地环境吗？";
  turn.proposed.destination = "NEEDS_INPUT";
  turn.proposed.destination_detail = "换成可观察场景再区分一次";
  turn.proposed.claims = [];
  assert.equal(evaluateTurn(turn, { now: NOW }).contract_status, "CONTRACT_PASS");

  turn.context.question = turn.context.previous_question;
  const repeated = evaluateTurn(turn, { now: NOW });
  assert.equal(repeated.contract_status, "FAIL_CLOSED");
  assert.deepEqual(repeated.reason_codes, ["CLARIFICATION_REFRAME_REQUIRED"]);
});

test("the second unknown stops questioning and preserves UNKNOWN", () => {
  const turn = baseTurn();
  turn.context.missing_changes_path = true;
  turn.context.unresolved = true;
  turn.context.ambiguity_stage = "REFRAME_ASKED";
  turn.context.previous_question = "如果断网后仍能运行，它更接近本地环境吗？";
  turn.proposed.destination = "UNKNOWN";
  turn.proposed.destination_detail = "两次区分后仍没有足够事实";
  turn.proposed.claims = [];
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.equal(result.internal_destination, "UNKNOWN");
  assert.equal(result.question, null);

  turn.context.question = "要不要再猜一次？";
  const overAsked = evaluateTurn(turn, { now: NOW });
  assert.equal(overAsked.contract_status, "FAIL_CLOSED");
  assert.deepEqual(overAsked.reason_codes, ["CLARIFICATION_LIMIT_EXCEEDED"]);
});

test("all eight internal destinations produce natural-language user destinations", () => {
  for (const destination of TURN_DESTINATIONS) {
    const turn = baseTurn();
    turn.proposed.destination = destination;
    turn.proposed.destination_detail = "按当前证据选择这个下一状态";
    if (destination === "NEEDS_INPUT") {
      turn.context.unresolved = true;
      turn.context.missing_changes_path = true;
      turn.context.question = "你能补充会改变处理路径的运行环境吗？";
      turn.proposed.claims = [];
    }
    const result = evaluateTurn(turn, { now: NOW });
    assert.equal(result.contract_status, "CONTRACT_PASS", destination);
    assert.equal(result.internal_destination, destination);
    assert.equal(TURN_DESTINATIONS.some((label) => result.user_destination.includes(label)), false, destination);
  }
});

test("machine labels are rejected from user-facing destination detail", () => {
  const turn = baseTurn();
  turn.proposed.destination_detail = "DO：执行这个动作";
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "FAIL_CLOSED");
  assert.deepEqual(result.reason_codes, ["MACHINE_LABEL_IN_USER_TEXT"]);
});

test("MISS may use a fresh allowlisted stable external source", () => {
  const turn = baseTurn();
  turn.separate_external_route_authorized = true;
  turn.external_query_sent = true;
  turn.proposed.destination = "VERIFY";
  turn.proposed.destination_detail = "按刚核验的官方文档复现一次";
  turn.proposed.claims = [externalClaim()];
  const result = evaluateTurn(turn, { policy: POLICY, now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.deepEqual(result.provenance_notices, ["其中有结论来自本轮或有效期内核验的获准官方来源。"]);
});

test("external evidence is rejected unless the independent route was authorized", () => {
  const turn = baseTurn();
  turn.proposed.claims = [externalClaim()];
  const result = evaluateTurn(turn, { policy: POLICY, now: NOW });
  assert.equal(result.contract_status, "FAIL_CLOSED");
  assert.deepEqual(result.reason_codes, ["EXTERNAL_ROUTE_NOT_AUTHORIZED"]);
});

test("dynamic and high-risk external claims require evidence from the same turn", () => {
  const turn = baseTurn();
  turn.separate_external_route_authorized = true;
  turn.external_query_sent = true;
  turn.proposed.destination = "VERIFY";
  turn.proposed.destination_detail = "按本轮官方证据复核配置";
  turn.proposed.claims = [externalClaim({ risk: "HIGH", dynamic: true })];
  assert.equal(evaluateTurn(turn, { policy: POLICY, now: NOW }).contract_status, "CONTRACT_PASS");

  turn.proposed.claims[0].evidence[0].retrieved_at = "2026-08-18T01:00:00.000Z";
  const staleTurn = evaluateTurn(turn, { policy: POLICY, now: NOW });
  assert.equal(staleTurn.contract_status, "FAIL_CLOSED");
  assert.deepEqual(staleTurn.reason_codes, ["EXTERNAL_SAME_TURN_VERIFICATION_REQUIRED"]);
});

test("combined answers keep claim-level provenance instead of whitening the whole answer", () => {
  const turn = baseTurn();
  turn.separate_external_route_authorized = true;
  turn.proposed.claims = [publicCardClaim(), externalClaim(), modelClaim({ claim_id: "claim-model-2" })];
  const result = evaluateTurn(turn, { policy: POLICY, now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.deepEqual(result.claims.map((claim) => claim.source_kind), [
    "PUBLIC_CARD",
    "EXTERNAL_VERIFIED",
    "MODEL_REASONING"
  ]);
  assert.equal(result.provenance_notices.length, 3);
});

test("non-allowlisted and inactive sources fail closed", () => {
  const turn = baseTurn();
  turn.separate_external_route_authorized = true;
  turn.proposed.claims = [externalClaim()];
  turn.proposed.claims[0].evidence[0].url = "https://example.com/unapproved";
  assert.deepEqual(evaluateTurn(turn, { policy: POLICY, now: NOW }).reason_codes, ["EXTERNAL_URL_NOT_ALLOWLISTED"]);

  const inactivePolicy = clone(POLICY);
  inactivePolicy.sources[0].status = "INACTIVE";
  turn.proposed.claims[0].evidence[0].url = "https://developers.openai.com/codex/guides/agents-md";
  assert.deepEqual(evaluateTurn(turn, { policy: inactivePolicy, now: NOW }).reason_codes, ["EXTERNAL_SOURCE_INACTIVE"]);
});

test("expired evidence, future evidence, and missing version bindings fail closed", () => {
  const turn = baseTurn();
  turn.separate_external_route_authorized = true;
  turn.proposed.claims = [externalClaim()];
  turn.proposed.claims[0].evidence[0].retrieved_at = "2026-07-01T00:00:00.000Z";
  assert.deepEqual(evaluateTurn(turn, { policy: POLICY, now: NOW }).reason_codes, ["EXTERNAL_EVIDENCE_EXPIRED"]);

  turn.proposed.claims[0].evidence[0].retrieved_at = "2026-08-18T03:00:00.000Z";
  assert.deepEqual(evaluateTurn(turn, { policy: POLICY, now: NOW }).reason_codes, ["EXTERNAL_EVIDENCE_FROM_FUTURE"]);

  turn.proposed.claims[0].evidence[0].retrieved_at = "2026-08-18T01:45:00.000Z";
  turn.proposed.claims[0].versioned = true;
  assert.deepEqual(evaluateTurn(turn, { policy: POLICY, now: NOW }).reason_codes, ["EXTERNAL_VERSION_BINDING_REQUIRED"]);
});

test("high-risk or dynamic model reasoning cannot make a definitive claim", () => {
  for (const overrides of [{ risk: "HIGH" }, { dynamic: true }]) {
    const turn = baseTurn();
    turn.proposed.claims = [modelClaim(overrides)];
    const result = evaluateTurn(turn, { now: NOW });
    assert.equal(result.contract_status, "FAIL_CLOSED");
    assert.deepEqual(result.reason_codes, ["MODEL_REASONING_DEFINITIVE_FORBIDDEN"]);
  }
  const turn = baseTurn();
  turn.proposed.claims = [modelClaim({ risk: "HIGH", definitive: false })];
  turn.proposed.destination = "VERIFY";
  turn.proposed.destination_detail = "先由有权限者核验高风险判断";
  assert.equal(evaluateTurn(turn, { now: NOW }).contract_status, "CONTRACT_PASS");

  turn.proposed.destination = "DO";
  assert.deepEqual(evaluateTurn(turn, { now: NOW }).reason_codes, ["MODEL_REASONING_DESTINATION_INVALID"]);
});

test("DENY cannot automatically fall back but a separately gated route can", () => {
  const denied = baseTurn();
  denied.retrieval_status = "DENY";
  denied.external_query_sent = true;
  denied.proposed.claims = [externalClaim()];
  const automatic = evaluateTurn(denied, { policy: POLICY, now: NOW });
  assert.equal(automatic.contract_status, "FAIL_CLOSED");
  assert.deepEqual(automatic.reason_codes, ["DENY_AUTOMATIC_FALLBACK_FORBIDDEN"]);

  denied.separate_external_route_authorized = true;
  assert.equal(evaluateTurn(denied, { policy: POLICY, now: NOW }).contract_status, "CONTRACT_PASS");
});

test("privacy denial prevents the original query from leaving the boundary", () => {
  const turn = baseTurn();
  turn.privacy_gate = "QUERY_PRIVACY_DENY";
  turn.separate_external_route_authorized = true;
  turn.external_query_sent = true;
  turn.proposed.destination = "NEEDS_INPUT";
  turn.proposed.destination_detail = "移除敏感信息后重述";
  turn.proposed.claims = [];
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "FAIL_CLOSED");
  assert.deepEqual(result.reason_codes, ["PRIVACY_QUERY_MUST_NOT_LEAVE"]);
  assert.equal(result.internal_destination, "NEEDS_INPUT");
});

test("privacy denial can pass only as one safe restatement question with no external evidence", () => {
  const turn = baseTurn();
  turn.privacy_gate = "QUERY_PRIVACY_DENY";
  turn.proposed.destination = "NEEDS_INPUT";
  turn.proposed.destination_detail = "移除敏感信息后重述";
  turn.proposed.claims = [];
  turn.context.question = "你能移除凭证和他人身份后重新描述问题吗？";
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.equal(result.internal_destination, "NEEDS_INPUT");
});

test("safety escalation takes precedence over ordinary clarification", () => {
  const turn = baseTurn();
  turn.safety_gate = "ESCALATE";
  turn.context.unresolved = true;
  turn.context.missing_changes_path = true;
  turn.proposed.destination = "ESCALATE";
  turn.proposed.destination_detail = "交给具备专业资格的人处理";
  turn.proposed.claims = [];
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "CONTRACT_PASS");
  assert.equal(result.internal_destination, "ESCALATE");
});

test("missing, malformed, duplicate-key, and expired policies fail closed", () => {
  const turn = baseTurn();
  turn.separate_external_route_authorized = true;
  turn.proposed.claims = [externalClaim()];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "aihd-phase2-"));
  try {
    assert.deepEqual(
      evaluateTurnWithPolicyFile(turn, { policyPath: path.join(temporary, "missing.json"), now: NOW }).reason_codes,
      ["POLICY_MISSING"]
    );

    const malformedPath = path.join(temporary, "malformed.json");
    fs.writeFileSync(malformedPath, "{not-json", "utf8");
    assert.deepEqual(evaluateTurnWithPolicyFile(turn, { policyPath: malformedPath, now: NOW }).reason_codes, ["POLICY_MALFORMED"]);

    const duplicatePath = path.join(temporary, "duplicate.json");
    fs.writeFileSync(duplicatePath, '{"schema_version":"1.0.0","schema_version":"1.0.0"}', "utf8");
    assert.deepEqual(evaluateTurnWithPolicyFile(turn, { policyPath: duplicatePath, now: NOW }).reason_codes, ["POLICY_MALFORMED"]);

    const expiredPath = path.join(temporary, "expired.json");
    const expired = clone(POLICY);
    expired.expires_at = "2026-08-18T01:59:59.000Z";
    fs.writeFileSync(expiredPath, JSON.stringify(expired), "utf8");
    assert.deepEqual(evaluateTurnWithPolicyFile(turn, { policyPath: expiredPath, now: NOW }).reason_codes, ["POLICY_EXPIRED"]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("an overall source label cannot replace claim-level provenance", () => {
  const turn = baseTurn();
  turn.proposed.overall_source_kind = "PUBLIC_CARD";
  const result = evaluateTurn(turn, { now: NOW });
  assert.equal(result.contract_status, "FAIL_CLOSED");
  assert.deepEqual(result.reason_codes, ["TURN_PROPOSED_SHAPE_INVALID"]);
});

test("CLI emits one contract result and uses exit status to expose fail-closed", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "aihd-phase2-cli-"));
  try {
    const inputPath = path.join(temporary, "turn.json");
    fs.writeFileSync(inputPath, JSON.stringify(baseTurn()), "utf8");
    const pass = spawnSync(process.execPath, [CLI_PATH, "--input", inputPath, "--now", NOW.toISOString()], {
      encoding: "utf8"
    });
    assert.equal(pass.status, 0);
    assert.equal(JSON.parse(pass.stdout).contract_status, "CONTRACT_PASS");

    const external = baseTurn();
    external.separate_external_route_authorized = true;
    external.proposed.claims = [externalClaim()];
    fs.writeFileSync(inputPath, JSON.stringify(external), "utf8");
    const blocked = spawnSync(process.execPath, [
      CLI_PATH,
      "--input",
      inputPath,
      "--policy",
      path.join(temporary, "missing.json"),
      "--now",
      NOW.toISOString()
    ], { encoding: "utf8" });
    assert.equal(blocked.status, 65);
    assert.deepEqual(JSON.parse(blocked.stdout).reason_codes, ["POLICY_MISSING"]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("Phase 2 policy, schemas, and implementation stay byte-bound to the reviewed contract", () => {
  assert.deepEqual({
    policy: sha256("policies/external-sources.v1.json"),
    policySchema: sha256("schemas/external-source-policy.schema.json"),
    turnSchema: sha256("schemas/helpdesk-turn-contract.schema.json"),
    implementation: sha256("scripts/helpdesk-turn-contract.mjs")
  }, {
    policy: "56bed9938193c7a567f212b81e86f440c84bfe33bb47be450efdd0bfdc52599c",
    policySchema: "e20dc3cfa1079930060f31477230ffdaf896da7fa797ff04abf202aca966f2b2",
    turnSchema: "3bbdd955537f01239c0452e81c9400edb143e9cbc52749c8638fe4ba1e5d0230",
    implementation: "a393972cf6f21cfea8a49bbcdfca0a0f987f170eecfa13154956f42b2af1175f"
  });
});
