# Phase 7 真实问题发现

本目录只保存 Phase 7 的公开聚合证据。Owner 输入的原问句、来源截图、逐题候选、回答正文和人工判断都留在公开仓库外；本目录不得成为私域问题数据集。

## 当前快照

- 证据层：`A_OWNER_DISCOVERY + A_REAL_QUESTION_DISCOVERY`。
- Owner 集：9 个 `OWNER_TYPED` 问题，仍不追溯冒充外部用户问题。
- 微信发现集：从 2 个本地只读导出的会话源、2,702 条消息中冻结 10 个群内原问句，来自 9 位不同发言者；姓名、成员 ID、群名和原文均不进入公开仓库。
- 两集合计 19 题；当前 8 卡 loader：`ALLOW 0 / MISS 19 / DENY 0`。
- 冻结 BM25：10／19 出现候选，9／19 无候选；Owner 集候选适用性已审（`NONE_CONFIRMED_APPLICABLE`），微信集候选适用性仍为 `UNKNOWN`。
- Owner 集三项判断（2026-08-19 完成，编码 A）：直接可用 2／9，有启发 5／9，会继续追问 7／9；P7-Q03、P7-Q07 无信号。
- P7-Q08、P7-Q09 标记 `OUT_OF_SCOPE`（超出 AI／Agent／OpenClaw 知识包）。
- 提炼候选：`AIHD-PC-000009`（来自 P7-Q01）已生成，状态 `PENDING_G12`，生产门返回 `HOLD / CANDIDATE_AUTHORIZATION_REQUIRED`，未索引、不可触发 `ALLOW`。
- 微信集 10 题逐题审阅：`PENDING`（等待 Owner）。
- 外部独立用户：0／30；产品效果仍为 `UNKNOWN`。

Owner 集聚合结果见 [`PILOT_BASELINE_RECEIPT.v1.json`](PILOT_BASELINE_RECEIPT.v1.json)（基线，不改写）与 [`PILOT_BASELINE_RECEIPT.v2.json`](PILOT_BASELINE_RECEIPT.v2.json)（Owner 审阅完成）；微信发现集聚合结果见 [`WECHAT_DISCOVERY_RECEIPT.v1.json`](WECHAT_DISCOVERY_RECEIPT.v1.json)。

## 判读边界

- `MISS` 只表示没有规范化精确命中 question／alias，不表示外部回答无用。
- BM25 候选只证明词面召回，不证明语义适用，也不能触发 `ALLOW` 或读取卡片正文。
- Owner 觉得 `MISS` 回退答案有启发，只能支持“薄入口＋外部来源／模型推理可能有价值”，不能支持 PublicCard 覆盖。
- 群标题、成员栏和人数标签不等于题目来源、参与者同意或独立用户数。
- 本地导出能把消息绑定到会话源和发言者，但“9 位发言者”仍不等于“9 位验证参与者”：当前没有同意、实际使用、答案判断或结果反馈。
- 任意真实 `DENY` 都先停下排查完整性，不用百分比阈值掩盖。

## Owner 审阅

逐题审阅必须在私密副本中填写：

1. 候选卡是否语义适用；
2. 回答是否直接可用；
3. 回答是否有启发；
4. 如果自己是提问者，是否会继续追问。

公开仓库只接收聚合计数和私密审阅文件 hash。没有 Owner 回执时，上述结果保持 `UNKNOWN`。

## 复验

每个私密问题都从 Skill 根目录原样运行：

```bash
node scripts/query-public-card.mjs --query "<私密问题原文>"
```

任何后续修复都必须先保留本收据，再生成新 revision；不得回写首轮结果。
