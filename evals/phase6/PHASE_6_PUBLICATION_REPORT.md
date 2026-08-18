# Phase 6 首批四卡本地正式发布报告

时间：2026-08-18 17:03 +08:00

## 结论

- Owner 已逐卡批准 `AIHD-PC-000005`、`AIHD-PC-000006`、`AIHD-PC-000007`、`AIHD-PC-000008` 的 `v1.0.0` revision，并通过 100% 人工 QA。
- 4 张卡已完成本地正式公共投影；index 从 4 张扩为 8 张，逐项绑定 revision、完整文件 SHA-256、question、aliases 与 scope。
- 8 卡正式 loader 对全部 41 个 question／alias 返回正确卡；无关天气问题保持 `MISS / NO_MATCH`。
- 8 卡观察错配回归 25／25 PASS：24 条目标用例精确单卡命中，over-recall 为 0；1 条 MISS 无假阳性。
- release allowlist 当前安装 32 个文件；含空格隔离路径的 install／verify／查询／uninstall 回归通过。
- 全量 `node --test` 为 198／198 PASS；fail／cancelled／skipped／todo 均为 0。

## 卡片

| PublicCard | 主题 | 人工 QA | 四门 | 本地 loader |
|---|---|---|---|---|
| `AIHD-PC-000005 v1.0.0` | Heartbeat 配置与避免打扰 | `PASS` | `APPROVED / PASS / PASS / READY` | `ALLOW` |
| `AIHD-PC-000006 v1.0.0` | USER／MEMORY／日期记忆分层 | `PASS` | `APPROVED / PASS / PASS / READY` | `ALLOW` |
| `AIHD-PC-000007 v1.0.0` | 单／多／子 Agent 选择 | `PASS` | `APPROVED / PASS / PASS / READY` | `ALLOW` |
| `AIHD-PC-000008 v1.0.0` | Compaction／Pruning／任务续接 | `PASS` | `APPROVED / PASS / PASS / READY` | `ALLOW` |

## 证据边界

- 当前结果属于本地功能分支；远端同名 branch 仍停在 `708f753` 的原 4 卡状态，远端 `main` 仍为 1 卡。
- 25 条回归是本轮观察后 QA，不是 blind、真人查询集或 30 人产品覆盖证据。
- 历史 28 文件 G14 artifact 保持冻结；当前 32 文件安装包没有追溯改写历史试跑收据。
- 本轮未 push、未创建 PR、未 merge `main`、未创建 tag／GitHub Release，严格停止在 PR 前。
