# G13a 真实反馈隔离闭环报告

日期：2026-08-18

状态：`REAL_ISOLATED_LOOP_COMPLETE / AWAITING_G13B`

## 结论

G13a 授权的 1 用户／1 问题受控采集已经实际执行。正式三卡查询返回 `MISS`；私密受控链随后获得同一真实用户的 `ADOPTED`，完成答案候选、人工提炼、四门预审、隔离候选索引和隔离 loader `ALLOW`。

这证明真实反馈驱动的隔离机制链可以闭合，不证明回答已经被用户执行或产生客观效果。正式 PublicCard、正式 index 和正式 serving 状态均未改变；当前必须停在 G13b，等待 Owner 对唯一候选逐项选择批准、修订或撤回。

## 聚合结果

- 合格用户：1。
- 合格问题：1；公开仓库不保存原问句。
- 正式公共查询：`MISS / NO_MATCH`。
- 有效反馈：`ADOPTED`；`objective_effect_claimed = false`。
- 答案候选：1；候选正文与私密来源均不进入公开仓库。
- 人工提炼：`PASS`。
- staging 四门预审：`PASS`。
- staging index：`SUCCESS`。
- staging loader：`ALLOW`。
- ledger：7 个事件、1 条 chain；全局 hash 链复验通过。

机器可读聚合收据见 `G13A_REAL_FEEDBACK_RECEIPT.json`。公开收据只保存数量、状态与不可逆 hash 指针，不保存原始用户文本、候选正文、私密来源或 ledger payload。

## 状态边界

隔离链当前为：

```text
DEMAND_GAP
→ FEEDBACK ADOPTED
→ ANSWER_CANDIDATE
→ HUMAN_DISTILLATION PASS
→ STAGING_DECISION PASS / G13b PENDING
→ STAGING_INDEX_RESULT SUCCESS
→ STAGING_ALLOW_RESULT ALLOW
```

正式状态仍为：

```text
publication_state = NOT_REVIEWED
index_state = NOT_INDEXED
allow_state = NOT_OBSERVED
serving_eligible = false
real_loop_complete = false
```

隔离 `ALLOW` 不能替代 G13b。Owner 批准后仍须新增正式 `PUBLICATION_DECISION`，把指定 revision 投影到正式包，重新生成正式 index，并用正式 loader 再观察一次 `ALLOW`。

## 当前停点

- G13b：`PENDING`。
- PublicCard 新增／修订／撤回：尚无正式决定。
- Phase 5：未开始。
- push／PR／merge：未授权。
- 外部社区触达：未授权；须留到 G14。
