# Phase 4 MISS 反馈回路报告

日期：2026-08-18

状态：`MECHANISM_COMPLETE / REAL_LOOP_HOLD_NO_FEEDBACK`

## 结论

Phase 4 的追加式事件合同、hash-chain 账本、反馈等级门、候选门和卡片状态回滚已经实现并通过测试。合规项目收据中没有可复跑的真实 `ADOPTED / OUTCOME_REPORTED` 反馈，因此真实晋级闭环没有执行，G13 没有开启，也没有新增、修订或撤回任何正式 PublicCard。

这是 Phase & Plan 的预定停止条件，不是用虚构 fixture 补齐数字的理由。Phase 5 不得开始。

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

## 真实反馈与 G13

只读检索了长期真源、项目状态、公开代码／评测收据、领域模型和 Owner 批准的 Phase & Plan；没有读取原始群聊、成员信息、私密 evidence 或未批准候选正文。在这一授权范围内没有找到真实可追溯的有效反馈。

因此本阶段没有：

- 真实 `ANSWER_CANDIDATE`；
- PublicCard 新增／修订／撤回；
- index 变更；
- 可供 Owner 逐项批准的 G13 清单。

后续只有在受控私密 ledger 获得一条真实 `ADOPTED / OUTCOME_REPORTED` 反馈后，才能复跑完整链并提交 G13。缺失反馈不能由 Owner 批准“视同存在”。
