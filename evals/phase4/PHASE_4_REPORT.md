# Phase 4 MISS 反馈回路报告

日期：2026-08-18

状态：`MECHANISM_COMPLETE / G13B_APPROVED_LOCAL_FORMAL_LOOP_COMPLETE`

## 结论

Phase 4 的追加式事件合同、hash-chain 账本、反馈等级门、候选门、卡片状态回滚和 G13b 前 staging／formal 隔离已经实现并通过测试。G13a 后，1 用户／1 问题的真实受控采集实际获得 `MISS → ADOPTED`，并完成候选、人工提炼、四门预审、隔离 index 与隔离 loader `ALLOW`。

Owner 后续已通过 G13b；`AIHD-PC-000004 v1.0.0` 已按精确候选本地正式投影，正式 index／loader 与全量回归通过。Phase 5 后置入口已打开。

## G13a 前历史停点

G13a 前的合规项目收据中没有可复跑的真实 `ADOPTED / OUTCOME_REPORTED`，因此当时的真实晋级闭环没有执行。该停止条件已作为历史收据保留，没有被后续反馈回写或删除。

## 实现

- `ad83908753412231ee1790dbf4abec3f2d80e664`：实现前冻结协议、停止条件和文件白名单。
- `4a77398f0d28f1dc316bee3840fdf8553921f1e4`：实现事件 schema、追加式账本与首轮 18 项测试。
- `54ccc1419d73149a730525f466cefd3799662568`：补上撤回／过期／验证失败后禁止静默重新索引，以及事件输入软链拒绝；定向测试增至 19 项。
- `schemas/feedback-event.schema.json`：冻结 11 类事件以及来源、隐私、反馈、候选、发布和回滚字段。
- `scripts/feedback-ledger.mjs`：只向公开仓库外的受控路径追加 JSON Lines；全局 hash 链绑定顺序；更正只能新增事件；CLI 不回显 payload。
- `tests/feedback-ledger.test.mjs`：覆盖完整虚构机制链、既有卡修订、撤回、验证失败、过期、索引失败、反馈更正、篡改、跨链引用与私密路径边界。

## 反馈与晋级边界

- `THANKS_ONLY → ACKNOWLEDGED`，不能生成 `ANSWER_CANDIDATE`。
- `EXPLICIT_ADOPTION → ADOPTED`，只证明选择路径，不证明执行。
- `SELF_REPORTED_ACTION_AND_RESULT → OUTCOME_REPORTED`，仍禁止声明客观效果。
- 没有用户反馈的模型答案不能生成候选。
- `ANSWER_CANDIDATE` 不允许保存回答正文，只保存控制引用并强制人工提炼。
- human override 必须带 reviewer hash 与 reason code。

## 状态回滚

- `INDEX_RESULT FAIL` 后 `serving_eligible = false`，后续 `ALLOW_RESULT` fail-closed。
- `VERIFICATION_RESULT FAIL` 把已索引 revision 标为 `INDEXED_BUT_BLOCKED`。
- `WITHDRAWAL` 与 `EXPIRY` 保留历史成功，但取消当前 serving eligibility；没有新的发布决定不能靠再次写 index 结果静默复活。
- `CORRECTION` 保留旧反馈等级；若有效等级降到 `ACKNOWLEDGED`，依赖候选与发布链转为 `INVALIDATED_BY_CORRECTION`。
- 既有卡修订必须同时绑定 current revision 和 target revision，索引成功前不静默改写当前状态。

## 验证

- Phase 4 定向测试：19／19 PASS。
- 全量测试：174／174 PASS；0 fail／cancelled／skipped／todo。
- `node --check scripts/feedback-ledger.mjs`：PASS。
- schema JSON 解析：PASS；事件 enum 与实现完全一致。
- 正式三卡与公共 index：Phase 4 未修改。

## G13a 后真实隔离闭环

- 实际正式公共查询：`MISS / NO_MATCH`。
- 同一真实用户后续反馈：`ADOPTED`；没有声明已经执行或产生客观效果。
- 私密 ledger：7 个事件、1 条 chain，hash 链复验通过。
- 候选：1 个；人工提炼与 staging 四门预审通过。
- 隔离候选：index `SUCCESS`，后续 loader `ALLOW`。
- 正式状态：`publication_state = NOT_REVIEWED`、`index_state = NOT_INDEXED`、`serving_eligible = false`。

公开聚合报告与机器收据分别为 `G13A_REAL_FEEDBACK_REPORT.md` 和 `G13A_REAL_FEEDBACK_RECEIPT.json`；原问句、反馈原文、候选正文和私密 ledger 不进入公开仓库。

G13b 清单只有 1 个新卡候选；Owner 已批准该精确 revision，无修订、无撤回。正式链追加 publication／index／ALLOW 后，ledger 共 10 个事件，`real_loop_complete = true`。详细收据与报告见 `G13B_PUBLICATION_RECEIPT.json`、`G13B_PUBLICATION_REPORT.md`。
