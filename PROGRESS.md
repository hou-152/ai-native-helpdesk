# PROGRESS

## 2026-08-22：支持 skills CLI 默认发现全部 7 个 skill

- T1 结论：`skills@1.5.23` 遇到有效的仓库根 `SKILL.md` 时，默认立即停止发现；只有 `--full-depth` 才继续扫描 `skills/`。源码见 [skills.ts](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/skills.ts#L230-L304)。因此没有通用 `SKILLS.md` 清单可替代目录迁移。
- 修复：主入口迁至 `skills/ai-native-helpdesk/SKILL.md`；6 个现有子 skill 保持原内容与同级布局。发布 manifest、npm 包白名单、可逆安装器测试和文档均同步到 `skills/<name>/SKILL.md`。
- 验证：在本地分支运行 `npx --yes skills@1.5.23 add /Users/housibo/Projects/ai-native-helpdesk --list`，输出 `Found 7 skills`；隔离项目内以 `--copy --skill '*' --agent openclaw --agent codex` 安装后，OpenClaw 与 Codex 各列出完整 7 项，主 skill 目录只含 `SKILL.md`。
- 边界：未 npm 发布、未 push；GitHub 仓库路径的最终 `skills add ... --list` 读回须在远端包含本提交后执行。`--host auto` 未实现，因为 CLI 已提供自动检测与 `--agent`。

## 2026-08-22：修复 npm 发布包缺失 skills/ 目录

- 现场：按 README 方式 A 执行 `npx --yes github:hou-152/ai-native-helpdesk install`，安装器确定性失败，`reason_code=RELEASE_FILE_UNAVAILABLE`。
- 根因：`package.json` 的 `files` 白名单缺少 `"skills/"`，`npm pack` 只带 10 个文件；`release-files.v1.json` 要求的 6 个 `skills/*/SKILL.md` 全部不在包里，manifest 加载阶段即 fail-closed。
- 修复：`package.json` 的 `files` 追加 `"skills/"`（一行，manifest 与安装器未改动）。
- 验证：`npm pack --dry-run` 现含全部 6 个 `skills/*/SKILL.md`（共 16 个文件）；`node --test` 为 `21/21 PASS`，fail／cancelled／skipped／todo 均为 `0`。
- 交付边界：修复仅本地 commit，未 push；远端 `main` 在 push 前仍带此缺陷，npx 路径需修复进入远端后才可用。

## 2026-08-20：撤销旧 8 卡公开面

- Owner 已明确授权删除当前树中的 8 张卡、公共 index、旧 loader、相关生产／反馈／发布机制，并删除 `v0.9.0` tag 与 GitHub Release。
- 清理从实时远端 `main@9e58180cbc741f8292efd6bd8b074402fb7364d0` 开始，合并已验证的私域原始对话迁移实现；不采用该基线的 BM25 候选池路线。
- 当前源树与 release manifest 的 active PublicCard、archive 卡、公共 index、旧 loader 和候选池入口均为 `0`。
- `v0.9.0` tag 与 GitHub Release 已删除；本次不重写 Git 历史，不 force-push。
- 全局安装的 `dbs-knowledge/SKILL.md` 是外部依赖，不属于卡片删除目标，本次未修改。

## 2026-08-20：私域原始对话迁移

- 目标：把 active knowledge 路由从 PublicCard 标准答案改为“显式私域源 → `$dbs-knowledge` → SOT → locator → raw/context → 回答”，同时保留安全、隐私、不可逆、动态事实和未知停点。
- 基线：独立 worktree 从 `origin/main@4c066af7e81cc929e33ec17fd97eb9ce50b746e5` 创建，branch 为 `codex/knowledge-source-migration`；原 PR #7 checkout 未修改。
- 远端基线归档在正确临时 cwd 实跑 `node --test`：`198/198 PASS`，fail／cancelled／skipped／todo 均为 `0`。此前在错误 cwd 得到的 `219/219` 已废弃，那是 PR #7 候选结果。
- 当时的执行边界是保留 tag／Release 与 Git 历史；该边界随后被 Owner 的撤销决定取代。最终仍保留 Git 历史，但删除 tag、Release 和当前树中的 8 卡发布面。
- 依赖：全局安装命令 exit `0`，共安装 32 个 dbskill；当前 `dbs-knowledge` Skill SHA-256 为 `4360d13e548f0361bef63fc396769d88812e696edb138dfae8df8890c5df478c`，对应上游 tag `v2.18.24`／commit `7e770e54aaaa8f43cac344b536d3adce095ead8f`，正文不复制进本仓库。
- fresh session（宿主现场证据）：实际触发 `$dbs-knowledge`，只读探针得到 `hit_probe=HIT`、`miss_probe=MISS`、source／hash／context gate 均 `PASS`、`write_status=NO_WRITE`；没有记录或输出私域正文和标识。该证据不等于公开包在所有宿主端到端可执行。
- 已退役：PublicCard 合同、8 卡、index、loader、Phase 1–4 代码／schema／测试与评测材料已移入本机迁移 worktree 的日期化 `.trash`；清理前 `9e58180` 完整树另有 30 天恢复副本。两者都不提交公开 Git，也不进入新 manifest。
- 已改合同：入口和 knowledge 合同要求显式 source／permission，固定执行 SOT → 完整性 → locator → raw/context；`MISS` 只在低风险、可逆、可观察且有恢复方法时给最小实验。
- 已改安装面：release manifest 只保留许可证、README、入口、5 个合同、安装文档和安装器；active card／index／loader 路径为 `0`。
- 当前最大风险：宿主 wrapper 不是本仓库代码；`HIT`／`MISS` 等是候选内部归一化状态，不是上游 Skill API。脱敏测试只证明调用顺序和 fail-closed 边界，不证明每个宿主的端到端调用、私域内容正确或用户效果。
- 全量验证：`node --test` 为 `21/21 PASS`，fail／cancelled／skipped／todo 均为 `0`；测试数减少来自明确退役旧能力，退役测试留在本机回收目录，没有使用 skip／todo 或放宽断言。
- 反向验证：等价镜像先与 canonical `diff -qr` 一致且 `21/21 PASS`；只重新加入旧 `query-public-card.mjs` 后为 `20 PASS / 1 FAIL`，唯一失败精确命中 `active source tree contains no retired runtime files outside local trash`；canonical 未修改，恢复侧重跑 `21/21 PASS`。
- 真实覆盖安装：先从 `4c066af7e81cc929e33ec17fd97eb9ce50b746e5` 安装旧 8 卡包，读回 `8` 卡／`1` loader／`32` 个 state entry；再用迁移实现覆盖，verify 为 `OK`，active 为 `0` 卡／`0` loader／manifest `10` 文件／state `11` entry，backup 仍有 `8` 卡；rollback 后旧包 `32` entry 和 `8` 卡恢复。
- 残留扫描：active source tree 与 release manifest 都没有卡片、index 或 loader 文件；旧 PP 发布页面已从当前树删除；公开 release 文档没有固定用户路径、私域原文或成员／消息标识。

## 残余未知

- 本仓库与目标宿主的端到端适配仍为 `NOT_VERIFIED`。
- 私域内容正确性、社区端到端和用户问题是否解决仍为 `UNKNOWN`。
