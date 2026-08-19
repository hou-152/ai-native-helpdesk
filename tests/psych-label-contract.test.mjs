import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONFIDENCES,
  CONSENT_SCOPES,
  CONTRADICTION_CRITERIA,
  LABELS,
  ROUTES,
  classifyPsychLabel,
  formatPsychLabelOutput,
  persistenceDecision
} from "../scripts/psych-label.mjs";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_ROOT, "..");
const SKILL = fs.readFileSync(path.join(REPO_ROOT, "SKILL.md"), "utf8");
const CONTRACT = fs.readFileSync(path.join(REPO_ROOT, "contracts", "psych-label.md"), "utf8");
const RELEASE_MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "release-files.v1.json"), "utf8"));
const LABEL_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas", "psych-label.schema.json"), "utf8")
);
const CONSENT_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas", "psych-label-consent.schema.json"), "utf8")
);

const NOW = "2026-08-20T00:00:00.000Z";

function currentTurnEvidence(overrides = {}) {
  return {
    source: "USER_CURRENT_TURN",
    reference: "turn-001",
    ...overrides
  };
}

function contradiction(criterion, facts, overrides = {}) {
  return {
    criterion,
    same_goal: true,
    same_time_range: true,
    goal_ref: "goal-001",
    time_range_ref: "window-001",
    reasonable_constraint: false,
    facts,
    ...overrides
  };
}

function consent(scopes, overrides = {}) {
  return {
    decision: "GRANTED",
    receipt_ref: "consent-001",
    granted_at: "2026-08-19T00:00:00.000Z",
    expires_at: "2026-08-30T00:00:00.000Z",
    revoked_at: null,
    scopes,
    ...overrides
  };
}

test("Skill entry exposes the fail-closed psych-label candidate boundary", () => {
  assert.match(SKILL, /contracts\/psych-label\.md/);
  assert.match(SKILL, /schemas\/psych-label\.schema\.json/);
  assert.match(SKILL, /main_route_completed=true/);
  assert.match(SKILL, /输入不完整或越界时 fail-closed/);
  assert.match(SKILL, /PSYCH_LABEL_CANDIDATE_UNRELEASED/);
  assert.match(SKILL, /明确同意/);
  assert.equal(RELEASE_MANIFEST.files.includes("contracts/psych-label.md"), false);
  assert.equal(RELEASE_MANIFEST.files.includes("schemas/psych-label.schema.json"), false);
  assert.equal(RELEASE_MANIFEST.files.includes("schemas/psych-label-consent.schema.json"), false);
  assert.equal(RELEASE_MANIFEST.files.includes("scripts/psych-label.mjs"), false);
  assert.match(SKILL, /尚未进入 `main` 或 GitHub Release/);
});

test("schemas close the classifier and consent surfaces", () => {
  assert.equal(LABEL_SCHEMA.additionalProperties, false);
  assert.equal(LABEL_SCHEMA.properties.main_route_completed.const, true);
  assert.equal(LABEL_SCHEMA.$defs.currentTurnEvidence.properties.source.const, "USER_CURRENT_TURN");
  assert.deepEqual(CONSENT_SCHEMA.$defs.consentReceipt.properties.scopes.items.enum, [
    "FEEDBACK_PERSISTENCE",
    "SEVEN_DAY_FOLLOW_UP"
  ]);
  assert.equal(CONSENT_SCHEMA.properties.follow_up_days.const, 7);
});

test("psych-label contract declares labels, confidence, and five code-bound checks", () => {
  for (const label of Object.values(LABELS)) assert.match(CONTRACT, new RegExp(`\\b${label}\\b`));
  for (const confidence of Object.values(CONFIDENCES)) {
    assert.match(CONTRACT, new RegExp(`\\b${confidence}\\b`));
  }
  for (const criterion of Object.values(CONTRADICTION_CRITERIA)) assert.match(CONTRACT, new RegExp(criterion));
  assert.match(CONTRACT, /main_route_completed/);
  assert.match(CONTRACT, /USER_CURRENT_TURN/);
  assert.match(CONTRACT, /DECISION_ONLY/);
  assert.match(CONTRACT, /目的限定/);
});

test("safety takes precedence over every auxiliary gate", () => {
  assert.deepEqual(classifyPsychLabel({ safety_red_flag: true }), {
    route: ROUTES.SAFETY,
    label: null,
    confidence: null,
    reason_code: "SAFETY_RED_FLAG"
  });
});

test("invalid safety flag types fail closed instead of becoming NONE", () => {
  assert.deepEqual(
    classifyPsychLabel({ main_route_completed: true, safety_red_flag: "yes" }),
    {
      route: ROUTES.FAIL_CLOSED,
      label: null,
      confidence: null,
      reason_code: "INVALID_SAFETY_FLAG_TYPE"
    }
  );
});

test("missing or incomplete main route fails closed", () => {
  assert.deepEqual(classifyPsychLabel({}), {
    route: ROUTES.FAIL_CLOSED,
    label: null,
    confidence: null,
    reason_code: "MAIN_ROUTE_NOT_COMPLETED"
  });
  assert.equal(classifyPsychLabel({ main_route_completed: false }).reason_code, "MAIN_ROUTE_NOT_COMPLETED");
  assert.equal(
    classifyPsychLabel({ main_route_completed: true, explicit_admission: true }).reason_code,
    "UNKNOWN_INPUT_FIELD"
  );
});

test("no current-turn evidence after a completed route is NONE", () => {
  assert.deepEqual(classifyPsychLabel({ main_route_completed: true }), {
    route: ROUTES.AUXILIARY,
    label: LABELS.NONE,
    confidence: CONFIDENCES.LOW,
    reason_code: "NO_SUFFICIENT_EVIDENCE",
    evidence_ref: null
  });
});

test("admission and hedged self-attribution require current-turn evidence", () => {
  assert.deepEqual(
    classifyPsychLabel({
      main_route_completed: true,
      evidence: currentTurnEvidence({ explicit_admission: true })
    }),
    {
      route: ROUTES.AUXILIARY,
      label: LABELS.USER_ADMITS,
      confidence: CONFIDENCES.HIGH,
      reason_code: "EXPLICIT_CURRENT_TURN_ADMISSION",
      evidence_ref: "turn-001"
    }
  );

  assert.equal(
    classifyPsychLabel({
      main_route_completed: true,
      evidence: currentTurnEvidence({ hedged_self_attribution: true })
    }).label,
    LABELS.SUSPECTED
  );
  assert.equal(
    classifyPsychLabel({
      main_route_completed: true,
      evidence: { source: "PRIVATE_CORPUS", reference: "turn-001", explicit_admission: true }
    }).route,
    ROUTES.FAIL_CLOSED
  );
});

const criterionCases = [
  [
    CONTRADICTION_CRITERIA.TIME_CONTRADICTION,
    { claims_no_time: true, entertainment_minutes_per_day: 61 }
  ],
  [
    CONTRADICTION_CRITERIA.CONSUMPTION_CONTRADICTION,
    { claims_learning_goal: true, courses_bought: 4, completion_rate_percent: 0 }
  ],
  [
    CONTRADICTION_CRITERIA.ACTION_CONTRADICTION,
    { claims_want_change: true, days_since_related_action: 8 }
  ],
  [
    CONTRADICTION_CRITERIA.DIRECTION_CONTRADICTION,
    { claims_stable_direction: true, direction_durations_days: [13, 10, 7, 12] }
  ],
  [
    CONTRADICTION_CRITERIA.LEARNING_CONTRADICTION,
    { claims_learning: true, activity_counts: { questions: 0, practice: 0, outputs: 0 } }
  ]
];

for (const [criterion, facts] of criterionCases) {
  test(`${criterion} is evaluated from its structured threshold`, () => {
    const result = classifyPsychLabel({
      main_route_completed: true,
      evidence: currentTurnEvidence({ behavioral_contradiction: contradiction(criterion, facts) })
    });
    assert.equal(result.label, LABELS.BEHAVIORAL_CONTRADICTION);
    assert.equal(result.confidence, CONFIDENCES.MEDIUM);
  });
}

test("arbitrary criterion_met input and incomplete bindings cannot create a contradiction", () => {
  const arbitrary = classifyPsychLabel({
    main_route_completed: true,
    evidence: currentTurnEvidence({
      behavioral_contradiction: {
        same_goal: true,
        same_time_range: true,
        criterion_met: true,
        reasonable_constraint: false
      }
    })
  });
  assert.equal(arbitrary.route, ROUTES.FAIL_CLOSED);

  const thresholdNotMet = classifyPsychLabel({
    main_route_completed: true,
    evidence: currentTurnEvidence({
      behavioral_contradiction: contradiction(CONTRADICTION_CRITERIA.TIME_CONTRADICTION, {
        claims_no_time: true,
        entertainment_minutes_per_day: 60
      })
    })
  });
  assert.equal(thresholdNotMet.label, LABELS.NONE);

  const reasonableConstraint = classifyPsychLabel({
    main_route_completed: true,
    evidence: currentTurnEvidence({
      behavioral_contradiction: contradiction(
        CONTRADICTION_CRITERIA.ACTION_CONTRADICTION,
        { claims_want_change: true, days_since_related_action: 8 },
        { reasonable_constraint: true }
      )
    })
  });
  assert.equal(reasonableConstraint.label, LABELS.NONE);
});

test("zero-day direction entries do not satisfy the direction contradiction", () => {
  const result = classifyPsychLabel({
    main_route_completed: true,
    evidence: currentTurnEvidence({
      behavioral_contradiction: contradiction(CONTRADICTION_CRITERIA.DIRECTION_CONTRADICTION, {
        claims_stable_direction: true,
        direction_durations_days: [0, 1, 2, 3]
      })
    })
  });
  assert.equal(result.route, ROUTES.FAIL_CLOSED);
  assert.equal(result.reason_code, "INVALID_CURRENT_TURN_EVIDENCE");
});

test("user-visible output follows the contract and does not add a suggestion to NONE", () => {
  const result = classifyPsychLabel({
    main_route_completed: true,
    evidence: currentTurnEvidence({ explicit_admission: true })
  });
  const output = formatPsychLabelOutput(result, {
    evidence: "用户说：我知道该做但就是不做",
    suggestion: "先选择一个 5 分钟内可完成的动作。"
  });
  assert.match(output, /## 心理层标注/);
  assert.match(output, /USER_ADMITS/);
  assert.match(output, /置信度: HIGH/);
  assert.match(output, /证据：用户说：我知道该做但就是不做/);
  assert.match(output, /建议：先选择一个 5 分钟内可完成的动作/);

  const noneOutput = formatPsychLabelOutput(
    classifyPsychLabel({ main_route_completed: true }),
    { evidence: "当前没有足够证据" }
  );
  assert.match(noneOutput, /NONE/);
  assert.doesNotMatch(noneOutput, /- 建议：/);
});

test("safety and fail-closed results never render a psych label", () => {
  assert.match(
    formatPsychLabelOutput(classifyPsychLabel({ safety_red_flag: true })),
    /已转安全路由/
  );
  assert.match(formatPsychLabelOutput(classifyPsychLabel({})), /MAIN_ROUTE_NOT_COMPLETED/);
});

test("purpose-scoped consent is required and has no side effects", () => {
  const missing = persistenceDecision({});
  assert.equal(missing.persist, false);
  assert.equal(missing.schedule_follow_up, false);
  assert.equal(missing.reason_code, "INVALID_CONSENT_RECEIPT");
  assert.equal(missing.side_effects, "DECISION_ONLY");

  const legacyBoolean = persistenceDecision({ consent: true });
  assert.equal(legacyBoolean.persist, false);
  assert.equal(legacyBoolean.reason_code, "INVALID_CONSENT_RECEIPT");

  const feedbackOnly = persistenceDecision({
    consent: consent([CONSENT_SCOPES.FEEDBACK_PERSISTENCE]),
    now: NOW
  });
  assert.equal(feedbackOnly.persist, true);
  assert.equal(feedbackOnly.schedule_follow_up, false);
  assert.equal(feedbackOnly.follow_up_reason_code, "FOLLOW_UP_SCOPE_NOT_GRANTED");
  assert.equal(feedbackOnly.side_effects, "DECISION_ONLY");

  const bothScopes = persistenceDecision({
    consent: consent([
      CONSENT_SCOPES.FEEDBACK_PERSISTENCE,
      CONSENT_SCOPES.SEVEN_DAY_FOLLOW_UP
    ]),
    follow_up_at: "2026-08-27T00:00:00.000Z",
    follow_up_days: 7,
    now: NOW
  });
  assert.equal(bothScopes.persist, true);
  assert.equal(bothScopes.schedule_follow_up, true);
  assert.equal(bothScopes.follow_up_reason_code, "SEVEN_DAY_SCOPE_GRANTED");

  const millisecondsWithinTolerance = persistenceDecision({
    consent: consent([CONSENT_SCOPES.SEVEN_DAY_FOLLOW_UP]),
    follow_up_at: "2026-08-27T00:00:00.000Z",
    follow_up_days: 7,
    now: "2026-08-20T00:00:00.123Z"
  });
  assert.equal(millisecondsWithinTolerance.persist, false);
  assert.equal(millisecondsWithinTolerance.schedule_follow_up, true);
});

test("expired or revoked consent stops future work and asks the controlled system to revoke follow-up", () => {
  const revoked = persistenceDecision({
    consent: consent([CONSENT_SCOPES.FEEDBACK_PERSISTENCE, CONSENT_SCOPES.SEVEN_DAY_FOLLOW_UP], {
      revoked_at: "2026-08-19T12:00:00.000Z"
    }),
    follow_up_at: "2026-08-27T00:00:00.000Z",
    follow_up_days: 7,
    now: NOW
  });
  assert.equal(revoked.persist, false);
  assert.equal(revoked.schedule_follow_up, false);
  assert.equal(revoked.revoke_existing_follow_up, true);
  assert.equal(revoked.reason_code, "CONSENT_REVOKED");

  const expired = persistenceDecision({
    consent: consent([CONSENT_SCOPES.FEEDBACK_PERSISTENCE, CONSENT_SCOPES.SEVEN_DAY_FOLLOW_UP], {
      granted_at: "2026-08-18T00:00:00.000Z",
      expires_at: "2026-08-19T00:00:00.000Z"
    }),
    follow_up_at: "2026-08-27T00:00:00.000Z",
    follow_up_days: 7,
    now: NOW
  });
  assert.equal(expired.persist, false);
  assert.equal(expired.revoke_existing_follow_up, true);
  assert.equal(expired.reason_code, "CONSENT_EXPIRED");
});

test("psych-label contract preserves privacy, safety, and synthetic-only boundaries", () => {
  assert.match(CONTRACT, /不是心理诊断/);
  assert.match(CONTRACT, /默认只完成当回合输出/);
  assert.match(CONTRACT, /用户拒绝、没有回答/);
  assert.match(CONTRACT, /不把标签写入 PublicCard/);
  assert.match(CONTRACT, /不读取或公开私域原文/);
  assert.match(CONTRACT, /停止本合同并转 `safety`/);
  assert.match(CONTRACT, /这个判断准不准/);
  assert.match(CONTRACT, /7 天/);
  assert.match(CONTRACT, /准确率 = 用户确认准确数/);
  assert.match(CONTRACT, /合成测试只能证明机制边界/);
});
