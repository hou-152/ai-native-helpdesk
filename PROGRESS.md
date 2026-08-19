# PROGRESS

## 2026-08-20：私域原始对话迁移

- 目标：把 active knowledge 路由从 PublicCard 标准答案改为“显式私域源 → `$dbs-knowledge` → SOT → locator → raw/context → 回答”，同时保留安全、隐私、不可逆、动态事实和未知停点。
- 基线：独立 worktree 从 `origin/main@4c066af7e81cc929e33ec17fd97eb9ce50b746e5` 创建，branch 为 `codex/knowledge-source-migration`；原 PR #7 checkout 未修改。
- 远端基线归档在正确临时 cwd 实跑 `node --test`：`198/198 PASS`，fail／cancelled／skipped／todo 均为 `0`。此前在错误 cwd 得到的 `219/219` 已废弃，那是 PR #7 候选结果。
- 历史边界：`v0.9.0` tag／Release、8 张卡和 Git 历史保持不可变；本轮不 push、不开 PR、不 merge、不 tag。
- 依赖：全局安装命令 exit `0`，共安装 32 个 dbskill；当前 `dbs-knowledge` Skill SHA-256 为 `4360d13e548f0361bef63fc396769d88812e696edb138dfae8df8890c5df478c`，对应上游 tag `v2.18.24`／commit `7e770e54aaaa8f43cac344b536d3adce095ead8f`，正文不复制进本仓库。
- fresh session（宿主现场证据）：实际触发 `$dbs-knowledge`，只读探针得到 `hit_probe=HIT`、`miss_probe=MISS`、source／hash／context gate 均 `PASS`、`write_status=NO_WRITE`；没有记录或输出私域正文和标识。该证据不等于公开包在所有宿主端到端可执行。
- 已退役：PublicCard 合同、8 卡、index、loader、Phase 1–4 代码／schema／测试与评测材料已移入本机 `.trash/2026-08-20_publiccard-stack/`；该目录不提交公开 Git，也不进入新 manifest。
- 已改合同：入口和 knowledge 合同要求显式 source／permission，固定执行 SOT → 完整性 → locator → raw/context；`MISS` 只在低风险、可逆、可观察且有恢复方法时给最小实验。
- 已改安装面：release manifest 只保留许可证、README、入口、5 个合同、安装文档和安装器；active card／index／loader 路径为 `0`。
- 当前最大风险：宿主 wrapper 不是本仓库代码；`HIT`／`MISS` 等是候选内部归一化状态，不是上游 Skill API。脱敏测试只证明调用顺序和 fail-closed 边界，不证明每个宿主的端到端调用、私域内容正确或用户效果。
- 全量验证：`node --test` 为 `21/21 PASS`，fail／cancelled／skipped／todo 均为 `0`；测试数减少来自明确退役旧能力，退役测试留在本机回收目录，没有使用 skip／todo 或放宽断言。
- 反向验证：等价镜像先与 canonical `diff -qr` 一致且 `21/21 PASS`；只重新加入旧 `query-public-card.mjs` 后为 `20 PASS / 1 FAIL`，唯一失败精确命中 `active source tree contains no retired runtime files outside local trash`；canonical 未修改，恢复侧重跑 `21/21 PASS`。
- 真实覆盖安装：先从 `origin/main` 安装历史包，读回 `8` 卡／`1` loader／`32` 个 state entry；再用候选覆盖，verify 为 `OK`，active 为 `0` 卡／`0` loader／manifest `10` 文件／state `11` entry，backup 仍有 `8` 卡；rollback 后旧包 `32` entry 和 `8` 卡恢复。
- 残留扫描：active source tree 与 release manifest 都没有卡片、index 或 loader 文件；历史 PP 页面已标为历史；公开 release 文档没有固定用户路径、私域原文或成员／消息标识。

## 待完成

- 控制仓真源同步；
- 两仓白名单审查与本地 commit。
