---
name: ai-native-helpdesk
description: 面向 AI／Agent／OpenClaw 社区的薄入口 Helpdesk Skill。负责守门、判模、按需加载合同，并只通过确定性发布门读取 PublicCard。
version: 0.3.0-gate-trial
status: GATE_TRIAL / 1 张 PublicCard 试运行 / 待真实社区端到端验证
author: 减
license: internal
---

# ai-native-helpdesk v0.3.0-gate-trial

> 当前已实现 PublicCard 机器发布门，并有 1 张经过单独批准的试运行卡。单卡可用不等于完整知识库上线，也不等于已经完成真实社区端到端验证或解决了用户问题。

## 这是什么

用于 AI／Agent／OpenClaw 相关社区的薄入口 Skill。AI Native 社区可以提供经过筛选的共同知识来源，但任何群聊原文、成员标识和内部审核材料都不得进入公开运行包。

只做 4 件事：

1. 守门：识别安全、隐私、不可逆和动态事实风险。
2. 判模：选择 1 个主路由。
3. 按需加载对应 contract。
4. knowledge 路由只通过确定性脚本查询已发布 PublicCard。

## 这不是什么

- 不是个人 Agent 记忆。
- 不是群聊原文搜索器。
- 不是全量加载的诊断框架。
- 不是已经有内容的成熟知识库。
- 不是用测试通过代替人工发布批准的自动发布器。

## 目录

```text
ai-native-helpdesk/
├── SKILL.md
├── contracts/
│   ├── good-question.md
│   ├── thinking.md
│   ├── action.md
│   ├── knowledge.md
│   ├── public-card.md
│   └── safety.md
├── schemas/public-card.schema.json
├── scripts/query-public-card.mjs
└── knowledge/public/index.json
```

## 主路由

| 用户问题类型 | 主路由 | 加载合同 |
|---|---|---|
| 问题不清楚 | good-question | `contracts/good-question.md` |
| 有假设／逻辑／原因要分析 | thinking | `contracts/thinking.md` |
| 知道该做但做不动 | action | `contracts/action.md` |
| 查询 AI／Agent／OpenClaw 事实 | knowledge | `contracts/knowledge.md` |
| 触发安全红线 | safety | `contracts/safety.md` |

混合信号可以记录多个标签，但本轮只执行 1 个主路由。

## 守门

每次触发依次检查：

1. 安全红线：迫近的自伤、他伤或违法实施意图直接转 safety。
2. 隐私红线：出现他人隐私时先脱敏。
3. 不可逆行动：删除、转账、全量发送等必须暂停确认。
4. 动态事实：当前价格、政策、版本、官方号码必须核验官方来源。
5. 个人信息保存：必须获得用户明确同意。

优先级：安全 > 隐私 > 不可逆 > 动态事实 > 个人信息。

## 合同加载 fail-closed

入口只按需读取对应 contract。合同不存在或读取失败时：

- 禁止根据入口摘要模拟合同输出。
- 明确告知模块暂不可用。
- 不跨到另一个模块假装完成。

入口只负责路由和一句理由；被加载的 contract 负责完整回答与一个最小下一步。

## PublicCard 发布门

knowledge 路由必须先读取 `contracts/public-card.md`，再调用 `scripts/query-public-card.mjs`。禁止直接 `read_file` 任何知识卡正文。

只有四门精确通过才可能返回正文：

```text
editorial = APPROVED
verification = PASS
privacy_gate = PASS
publication = READY
```

- `ALLOW`：使用脚本返回的白名单字段；动态事实仍需当前核验。
- `MISS`：走普通事实检索，不假装命中。
- `DENY`：说明知识卡分支暂不可用，不读取、不模拟、不回退成被拒卡答案。

公共包随 Skill 分发；社区本地包必须由调用者显式给出路径。同一问题命中多卡时拒绝，不设置静默覆盖顺序。

## 状态维度

每次输出仍保持三个独立维度：

| 维度 | 取值 |
|---|---|
| `brief_state` | `NEEDS_INPUT` / `READY` |
| `task_mode` | `ANSWER` / `ROUTE` / `AUTOMATION_ASSESS` |
| `automation_level` | `AUTO_HIGH` / `AUTO_SEMI` / `AUTO_ASSIST` / `AUTO_NOT_READY` |

`brief_state = READY` 必须对应可执行的问题说明书，不能把半成品标成 READY。

## 失败规则

| 场景 | 动作 |
|---|---|
| Contract 缺失 | 明确不可用，不模拟 |
| PublicCard 门返回 `DENY` | 不读正文，不模拟卡片 |
| PublicCard 门返回 `MISS` | 普通事实检索 |
| 多个主路由 | 本轮只执行 1 个 |
| 信息不足 | good-question 优先 |
| 用户补充信息 | 重新守门、判模、加载合同 |

## 主路由执行后的最小回包

下表只做入口摘要；完整输出所有权与失败处理以本轮加载的 contract 为准，入口不得复制一套更宽或互相冲突的规则。

| 主路由 | 最小回包 | 退化处理 |
|---|---|---|
| good-question | 按 5 项检查识别缺口，给 1 个最小下一步 | 信息仍不足则保持 `NEEDS_INPUT`，不猜 |
| thinking | 完成 5 层消解；候选解释带可观察信号 | 事实不足时明确缺口，不编造因果 |
| action | 先响应实际请求，再给最小下一步和 1 个高区分度问题 | 不扩成行动清单或动机诊断 |
| knowledge | `ALLOW` 才使用卡片白名单字段；动态事实另做当前核验 | `MISS` 候选不等于命中；`DENY` 不声称冲突数量、不读正文 |
| safety | 按红线类型承接／拒绝／暂停；危机资源按服务地区运行时核验 | 不使用社区卡，不缓存号码替代当前核验 |

混合信号本轮只执行 1 个主合同；用户补充信息后，必须重新守门、判模并加载合同，不能静默沿用上一轮结果。

## 路由与候选定位不是一回事

1. 入口做主路由分发：在 good-question／thinking／action／knowledge／safety 中选择 1 个合同。
2. 合同拥有完整回答：决定追问、诊断、行动或事实核验的具体规则。
3. 只有 knowledge 路由进入 PublicCard 发布门。门内先验证 schema 与索引，再做精确候选定位；精确命中后才读取并验证卡片正文。
4. 精确定位 `MISS` 时，脚本可以只从 common 索引给出非权威 `suggestions`（默认 common 包为仓库公共包）。它仍是 `MISS`，不含正文，也不是全文搜索、语义检索或自动 `ALLOW`。

入口是否选择 knowledge，与发布门是否精确命中，是两个独立判断。

## 当前状态

- 发布门代码和合成测试：已建立。
- 公开 PublicCard：1 张试运行卡。
- 社区真实端到端验证：未完成。
- 群聊候选、内部证据和审核材料：不属于公开仓库。

## 修订记录

| 版本 | 状态 | 改动 |
|---|---|---|
| v0.1—v0.2.2 | 已废弃 | 历史设计 |
| v0.2.3-trial | TRIAL | 薄入口和 5 个子合同 |
| v0.3.0-gate-trial | GATE_TRIAL | PublicCard schema、确定性发布门、公共／社区包边界 |
| v0.3.1-gate-suggestions-trial | TRIAL 工作标签 | 公共索引候选提示与三层职责澄清；有效 Skill 版本仍为 `0.3.0-gate-trial` |

后续 PublicCard 仍须逐张独立完成内容修正、真实验证、隐私审查和 Owner 发布批准；首张卡通过不能让其他候选自动晋级。
