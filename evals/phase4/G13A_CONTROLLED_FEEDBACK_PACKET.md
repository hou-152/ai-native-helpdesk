# G13a 一轮受控真实反馈采集执行包

日期：2026-08-18

状态：`G13A_APPROVED / AWAITING_QUALIFIED_HELPDESK_TURN`

## 结论

Owner 已授权 Phase 4B 采集 1 个真实用户的 1 个真实 AI／Agent／OpenClaw 问题，用当前正式 PublicCard 查询路径实际运行一次 Helpdesk。该授权修复了“Phase 4 需要真实反馈、Phase 5 才安排真实试跑”的启动死锁，但不把 Phase 4A 的机制测试、既有工程讨论或 Owner 批准本身改写成真实反馈。

## 授权范围

- 1 个真实用户、1 个真实问题、1 条受控反馈链；当前 Owner 可以作为该用户。
- 先实际运行 `scripts/query-public-card.mjs`，记录 `ALLOW / MISS / DENY`，不得预设结果。
- 只有实际 `MISS` 才追加最小化 `DEMAND_GAP`；查询未运行或非 MISS 时不得补写。
- 只有同一用户随后明确采用，才记 `ADOPTED`；只有用户说明实际动作与结果，才记 `OUTCOME_REPORTED`。
- 私密 evidence envelope 与 hash-chain ledger 必须位于本公开仓库外；本仓库只保存聚合收据和不可逆 hash 指针。
- `ANSWER_CANDIDATE` 仍须人工提炼、来源核验、schema、QA、隐私和四门预审，并提交 G13b 逐项裁决。

## 合格来源

满足以下任一条件：

1. G13a 后新建，并在开头明确纳入本轮采集的 Helpdesk turn；
2. Owner 明确命名一个既有 turn 并授权其作为本轮来源。

当前 Phase 4／5 工程讨论没有被自动纳入，测试 fixture、模型自评、G12／G13a 批准均不是用户反馈。

## 执行链

```text
qualified real question
→ query-public-card actual result
→ if MISS: DEMAND_GAP
→ sourced answer
→ real user follow-up
→ ADOPTED or OUTCOME_REPORTED
→ ANSWER_CANDIDATE
→ human distillation and four gates
→ isolated candidate projection indexed
→ isolated candidate projection later ALLOW
→ G13b itemized decision
```

G13b 前的 `indexed → later ALLOW` 只允许发生在与正式公共 index 隔离的候选投影，用于证明完整机制链。ledger 使用 `STAGING_DECISION → STAGING_INDEX_RESULT → STAGING_ALLOW_RESULT`，并强制 `g13b_status = PENDING`、`isolation = ISOLATED_CANDIDATE`；正式 `publication_state / index_state / allow_state / serving_eligible` 不得因此改变。G13b 通过后仍须另写正式发布决定并重新运行正式 index／loader。若只收到感谢或理解确认，状态停在 `ACKNOWLEDGED`，不得生成候选。若问题命中现有卡或被拒，只保留真实路由结果并回到 Owner，不伪造缺口。

## 未授权事项

G13a 不授权新增／修订／撤回 PublicCard、修改正式 index、push、PR、merge、外部社区触达、Phase 5 社区试跑或 192 类私域候选批量晋级。G13b 与 G14 继续保留各自 Owner 判断。

## 依据

- Owner 指令：授权一轮受控反馈采集，并要求依次完成真实问题、反馈、候选链、G13b、Phase 5 与 G14。
- Phase & Plan：`workspace-lobster2@7c5f469f7f8650cea42665eec4ddaae637552f6b` 的 `docs/ai-native-helpdesk-PP-v0.3.2-final.md`。
- Phase 4A 机制基线：`9b572bc919843847aec501f113949ac9ec70fdb9`。
