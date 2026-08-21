#!/usr/bin/env node
/**
 * install-deps.mjs — 一键安装 ai-native-helpdesk 的运行时依赖 skill（dbs-knowledge）
 *
 * ai-native-helpdesk 的 knowledge 路由依赖外部 Agent Skill 合同 `$dbs-knowledge`
 * （上游：dontbesilent2025/dbskill 的 skills/dbs-knowledge）。本脚本从上游仓库
 * 拉取该 skill 并安装到宿主 skills 目录，实现 npx 后开箱即用。
 *
 * 用法：
 *   node scripts/install-deps.mjs [--skills-dir <dir>]
 *
 * 默认 skills 目录：~/.agents/skills（OpenClaw personal agent skills）
 * 可用环境变量：AIHD_SKILLS_DIR
 *
 * 本脚本只做只读拉取和文件复制，不修改上游仓库，不执行上游代码。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const UPSTREAM_REPO = "https://github.com/dontbesilent2025/dbskill.git";
const SOURCE_SKILL_REL = path.join("skills", "dbs-knowledge");
const TARGET_SKILL_NAME = "dbs-knowledge";
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), ".agents", "skills");

function fail(reasonCode, message) {
  process.stdout.write(`${JSON.stringify({ status: "FAIL_CLOSED", reason_code: reasonCode, message })}\n`);
  process.exitCode = 64;
}

function parseArgs(argv) {
  const options = { skillsDir: process.env.AIHD_SKILLS_DIR || DEFAULT_SKILLS_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--skills-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail("INVALID_ARGUMENTS", "--skills-dir 需要一个目录路径");
      options.skillsDir = path.resolve(value);
      index += 1;
    } else if (flag === "--help" || flag === "-h") {
      process.stdout.write("用法: node scripts/install-deps.mjs [--skills-dir <dir>]\n");
      process.exit(0);
    } else {
      fail("INVALID_ARGUMENTS", `未知参数: ${flag}`);
    }
  }
  return options;
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 120000 });
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetDir = path.join(options.skillsDir, TARGET_SKILL_NAME);
  const targetSkill = path.join(targetDir, "SKILL.md");

  // 1. 已安装检查：存在且是普通文件时跳过（幂等）
  if (fs.existsSync(targetSkill)) {
    const stat = fs.lstatSync(targetSkill);
    if (!stat.isFile() || stat.isSymbolicLink()) fail("TARGET_UNSAFE", `目标 SKILL.md 不是普通文件: ${targetSkill}`);
    process.stdout.write(
      `${JSON.stringify({ status: "SKIPPED", reason_code: "ALREADY_INSTALLED", skill_dir: targetDir })}\n`
    );
    return;
  }

  // 2. 目标 skills 目录必须是普通目录（非软链）
  if (fs.existsSync(options.skillsDir)) {
    const stat = fs.lstatSync(options.skillsDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("SKILLS_DIR_UNSAFE", `skills 目录不是普通目录: ${options.skillsDir}`);
  } else {
    fs.mkdirSync(options.skillsDir, { recursive: true });
  }

  // 3. 浅克隆上游仓库到临时目录
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aihd-deps-"));
  const cloneDir = path.join(tmpRoot, "dbskill");
  const cloneResult = run("git", ["clone", "--depth", "1", UPSTREAM_REPO, cloneDir], tmpRoot);
  if (cloneResult.status !== 0) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fail("UPSTREAM_CLONE_FAILED", `无法克隆上游仓库: ${UPSTREAM_REPO}`);
  }

  // 4. 校验上游 skill 存在
  const sourceSkillDir = path.join(cloneDir, SOURCE_SKILL_REL);
  const sourceSkill = path.join(sourceSkillDir, "SKILL.md");
  if (!fs.existsSync(sourceSkill)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fail("UPSTREAM_SKILL_MISSING", `上游仓库缺少 ${SOURCE_SKILL_REL}/SKILL.md`);
  }

  // 5. 复制到目标目录
  try {
    fs.cpSync(sourceSkillDir, targetDir, { recursive: true });
  } catch (error) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fail("COPY_FAILED", `复制失败: ${error.message}`);
  }

  // 6. 清理临时目录
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  // 7. 校验安装结果
  if (!fs.existsSync(targetSkill)) {
    fail("INSTALL_UNVERIFIED", `安装后未找到 ${targetSkill}`);
  }

  process.stdout.write(
    `${JSON.stringify({ status: "INSTALLED", reason_code: "OK", skill_dir: targetDir, upstream: UPSTREAM_REPO, source: SOURCE_SKILL_REL })}\n`
  );
}

main();
