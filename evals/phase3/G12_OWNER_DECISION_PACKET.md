# G12 Owner 决策包

状态：`OWNER_ACTION_REQUIRED`

## 推荐结论

推荐通过 G12，但把通过精确解释为：

1. 批准 PublicCard schema B／`0.4` 与 index revision／hash／scope 绑定；
2. 批准 `AIHD-INTERNAL-CARD-QA-V1`，首批保持 100% 人工 QA；
3. 批准首批实际清单 000001／000002／000003，确认两张新卡不来自当前 192 类私域 HOLD；
4. 批准 000001 revision `1.1.0`；
5. 选择 000002、000003 为 Owner-authorized Candidates，并逐卡批准本候选 revision 的内容、隐私和发布；
6. 授权 G12 后把 000002、000003 生成正式 PublicCard、写入 index，并先完成真实三卡错配回归；只有该回归通过才开始 Phase 4。

不授权 push、开 PR、merge、社区端到端、扩到第 4 张卡或批量晋级 192 类私域问题。

## A. Schema 与生产门

推荐：`APPROVE`。

- schema B 字段：安全 `scope_hint`、判断框架、常见错误、行动原则、验证方法。
- index 完整性：revision、完整文件 SHA-256 和 scope 与卡片绑定。
- 普通路径未获 Candidate 授权即 `HOLD`。
- MISS 路径没有采用／结果反馈、获批答案候选或人工提炼即 `HOLD`。
- public projection 没有人 QA、四门或 Owner 逐卡决定即 `HOLD`。

机器证据：全量 `144／144 PASS`，0 fail／skip；schema 与实现保护 SHA 已登记在 Phase 3 报告。

## B. QA rubric

推荐：`APPROVE`。

Owner 本次需要对 3 张卡逐张覆盖 10 项。Codex 机器预检对下表全部给出 `RECOMMEND_PASS`，但最终值仍由本 G12 回执产生：

| 维度 | 000001 | 000002 | 000003 |
|---|---|---|---|
| 答案正确性 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 适用边界 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 来源可追溯 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 最小下一步 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 验证方法 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 隐私 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 不可公开内容 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| 改义检查 | 推荐 PASS | 推荐 PASS | 推荐 PASS |
| Candidate 授权 | 既有卡；推荐确认 | 推荐批准 | 推荐批准 |
| revision 发布决定 | 推荐批准 `1.1.0` | 推荐批准 `1.0.0` | 推荐批准 `1.0.0` |

任一关键项不通过的默认动作不是缩小抽样，而是整批 `HOLD`、停止生成并 100% 复查。

## C. 逐卡内容决策

### 000001：AGENTS.md 规则生效验证

- 核心边界：只处理普通行为规则的发现、适用和触发；技术权限阻断转 000002。
- 判断框架：发现 → 适用 → 触发 → 正负例证据。
- 最小下一步：只挑一条失效规则，写清触发／范围／动作／证据／失败处理。
- 验证：新运行内做一个应触发正例和一个不应触发对照。
- 来源：OpenAI AGENTS、Rules、Sandbox，`checked_at = 2026-08-18`。
- 推荐：批准 revision `1.1.0`。

完整内容：`knowledge/public/cards/AIHD-PC-000001.json`。

### 000002：规则已读，但命令仍被 Sandbox／Rules／审批阻断

- 核心边界：已确认 AGENTS.md 被读取后，区分自然语言指令、沙箱、审批和 Rules；不协助绕过禁止或管理员策略。
- 判断框架：指令层 → 沙箱层 → 审批层 → Rules 层。
- 最小下一步：只记录一个被拒操作的类别和非敏感阻断原因，先判断属于哪一层。
- 验证：对同一无副作用代表命令核对权限说明与 `codex execpolicy check`；允许正例成功、禁止对照继续被拒才通过。
- 来源：OpenAI AGENTS、Rules、Sandbox，`checked_at = 2026-08-18`；当前 Codex CLI 的 `execpolicy check --help` exit 0。
- 推荐：批准 Candidate、人工 QA 和 revision `1.0.0` 发布。

完整内容：`evals/phase3/candidates/AIHD-PC-000002.candidate.json`。

### 000003：OpenClaw Gateway 服务与 RPC 健康验收

- 核心边界：只读验证服务、连接握手与 RPC；不把安装、重启、凭证分发混入健康检查。
- 判断框架：服务层 → 连接层 → RPC 层 → 必要时通道层。
- 最小下一步：不带 token、password 或自定义 URL，运行 `openclaw gateway status --require-rpc`，只记录退出码和 RPC 是否通过。
- 验证：exit 0 且服务与 RPC 探针同时通过才记为基础验收成功；失败时先只读诊断，不先重启。
- 来源：OpenClaw Gateway CLI 与 health 官方文档，`checked_at = 2026-08-18`；当前 `OpenClaw 2026.7.1-2 (0790d9f)` 实跑 `--require-rpc` exit 0。
- 推荐：批准 Candidate、人工 QA 和 revision `1.0.0` 发布。

完整内容：`evals/phase3/candidates/AIHD-PC-000003.candidate.json`。

## D. 候选错配边界

- 清晰 000001 问法只返回 000001。
- 清晰 Gateway 问法只返回 000003。
- 明确“规则已读但 sandbox 拒绝”仍同时返回 000002 和 000001，因此发布后必须由适用性裁决确认“是否已证明规则被读取”；分数不能直接选卡或读正文。
- 无关问题保持 `MISS`。

推荐接受该结果：召回宁可保留相邻候选，由 scope 做一次区分，也不把 candidate score 伪装成处理结论。

## E. 推荐回执

若以上全部同意，回复：

```text
按推荐通过 G12：批准 schema B、QA rubric 和首批 000001／000002／000003；批准 000001 v1.1.0、000002 v1.0.0、000003 v1.0.0 逐卡发布。先完成正式三卡投影与真实错配回归，通过后进入 Phase 4。
```

若任一卡需要修改，请点名 card_id 和不通过维度；默认触发整批 `HOLD` 与 100% 复查，不自动缩小范围。
