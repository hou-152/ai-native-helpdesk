import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const TEST_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_ROOT, "..");
const SKILL = fs.readFileSync(path.join(REPO_ROOT, "SKILL.md"), "utf8");
const CONTRACT = fs.readFileSync(path.join(REPO_ROOT, "contracts", "psych-label.md"), "utf8");

test("Skill entry exposes psych-label as a post-route auxiliary contract", () => {
  assert.match(SKILL, /contracts\/psych-label\.md/);
  assert.match(SKILL, /心理层标注不是主路由/);
  assert.match(SKILL, /不改变主路由、发布门或用户权限/);
});

test("psych-label contract declares the four labels and confidence values", () => {
  for (const label of ["USER_ADMITS", "BEHAVIORAL_CONTRADICTION", "SUSPECTED", "NONE"]) {
    assert.match(CONTRACT, new RegExp(`\\b${label}\\b`));
  }
  for (const confidence of ["HIGH", "MEDIUM", "LOW"]) {
    assert.match(CONTRACT, new RegExp(`\\b${confidence}\\b`));
  }
});

test("psych-label contract keeps all five behavior checks bounded to context", () => {
  for (const criterion of ["时间矛盾", "消费矛盾", "行动矛盾", "方向矛盾", "学习矛盾"]) {
    assert.match(CONTRACT, new RegExp(criterion));
  }
  assert.match(CONTRACT, /同一目标和时间范围/);
  assert.match(CONTRACT, /不是脱离语境的诊断规则/);
});

test("psych-label contract preserves non-diagnostic and fail-closed boundaries", () => {
  assert.match(CONTRACT, /不是心理诊断/);
  assert.match(CONTRACT, /不把标签写入 PublicCard/);
  assert.match(CONTRACT, /不读取或公开私域原文/);
  assert.match(CONTRACT, /停止本合同并转 `safety`/);
});

test("psych-label contract fixes the user-facing output and feedback loop", () => {
  assert.match(CONTRACT, /## 心理层标注/);
  assert.match(CONTRACT, /- 证据：/);
  assert.match(CONTRACT, /- 建议：/);
  assert.match(CONTRACT, /这个判断准不准/);
  assert.match(CONTRACT, /7 天/);
  assert.match(CONTRACT, /准确率 = 用户确认准确数/);
});
