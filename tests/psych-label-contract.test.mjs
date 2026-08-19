import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classifyPsychLabel, persistenceDecision } from "../scripts/psych-label.mjs";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_ROOT, "..");
const SKILL = fs.readFileSync(path.join(REPO_ROOT, "SKILL.md"), "utf8");
const CONTRACT = fs.readFileSync(path.join(REPO_ROOT, "contracts", "psych-label.md"), "utf8");
const RELEASE_MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "release-files.v1.json"), "utf8"));

test("Skill entry exposes psych-label as a post-route auxiliary contract", () => {
  assert.match(SKILL, /contracts\/psych-label\.md/);
  assert.match(SKILL, /心理层标注不是主路由/);
  assert.match(SKILL, /无执行阻力线索使用 `NONE`/);
  assert.match(SKILL, /保留式自述但证据不足使用 `SUSPECTED \/ LOW`/);
  assert.match(SKILL, /明确同意/);
  assert.equal(RELEASE_MANIFEST.files.includes("contracts/psych-label.md"), false);
  assert.match(SKILL, /尚未进入 `main` 或 GitHub Release/);
});

test("psych-label contract declares labels, confidence, and five bounded checks", () => {
  for (const label of ["USER_ADMITS", "BEHAVIORAL_CONTRADICTION", "SUSPECTED", "NONE"]) {
    assert.match(CONTRACT, new RegExp(`\\b${label}\\b`));
  }
  for (const confidence of ["HIGH", "MEDIUM", "LOW"]) {
    assert.match(CONTRACT, new RegExp(`\\b${confidence}\\b`));
  }
  for (const criterion of ["时间矛盾", "消费矛盾", "行动矛盾", "方向矛盾", "学习矛盾"]) {
    assert.match(CONTRACT, new RegExp(criterion));
  }
  assert.match(CONTRACT, /同一目标和时间范围/);
  assert.match(CONTRACT, /现实约束/);
});

test("synthetic cases preserve the label boundaries", () => {
  assert.deepEqual(classifyPsychLabel({ explicit_admission: true }), {
    route: "AUXILIARY",
    label: "USER_ADMITS",
    confidence: "HIGH"
  });

  assert.deepEqual(classifyPsychLabel({ hedged_self_attribution: true }), {
    route: "AUXILIARY",
    label: "SUSPECTED",
    confidence: "LOW"
  });

  assert.deepEqual(classifyPsychLabel({}), {
    route: "AUXILIARY",
    label: "NONE",
    confidence: "LOW"
  });

  assert.deepEqual(
    classifyPsychLabel({
      behavioral_contradiction: {
        same_goal: true,
        same_time_range: true,
        criterion_met: true,
        reasonable_constraint: false
      }
    }),
    { route: "AUXILIARY", label: "BEHAVIORAL_CONTRADICTION", confidence: "MEDIUM" }
  );

  assert.deepEqual(
    classifyPsychLabel({
      behavioral_contradiction: {
        same_goal: true,
        same_time_range: true,
        criterion_met: true,
        reasonable_constraint: true
      }
    }),
    { route: "AUXILIARY", label: "NONE", confidence: "LOW" }
  );
});

test("safety takes precedence over the auxiliary label", () => {
  assert.deepEqual(
    classifyPsychLabel({ safety_red_flag: true, explicit_admission: true }),
    { route: "SAFETY", label: null, confidence: null }
  );
});

test("persistence and seven-day follow-up require explicit opt-in", () => {
  assert.deepEqual(persistenceDecision({}), {
    persist: false,
    schedule_follow_up: false,
    reason_code: "NO_EXPLICIT_OPT_IN"
  });
  assert.deepEqual(persistenceDecision({ consent: false }), {
    persist: false,
    schedule_follow_up: false,
    reason_code: "NO_EXPLICIT_OPT_IN"
  });
  assert.deepEqual(persistenceDecision({ consent: true }), {
    persist: true,
    schedule_follow_up: true,
    reason_code: "EXPLICIT_OPT_IN"
  });
  assert.deepEqual(persistenceDecision({ consent: true, revoked: true }), {
    persist: false,
    schedule_follow_up: false,
    reason_code: "CONSENT_REVOKED"
  });
});

test("psych-label contract preserves non-diagnostic and feedback boundaries", () => {
  assert.match(CONTRACT, /不是心理诊断/);
  assert.match(CONTRACT, /默认只完成当回合输出/);
  assert.match(CONTRACT, /用户拒绝、没有回答或撤回/);
  assert.match(CONTRACT, /不把标签写入 PublicCard/);
  assert.match(CONTRACT, /不读取或公开私域原文/);
  assert.match(CONTRACT, /停止本合同并转 `safety`/);
  assert.match(CONTRACT, /这个判断准不准/);
  assert.match(CONTRACT, /7 天/);
  assert.match(CONTRACT, /准确率 = 用户确认准确数/);
});
