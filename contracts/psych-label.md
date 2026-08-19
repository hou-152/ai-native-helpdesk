---
name: psych-label
description: 在主路由完成后，对当前用户明确提供的执行阻力信号做轻量、非诊断的辅助标注。
---

# contracts/psych-label

## 定位

本合同只产生辅助信号，不是心理诊断、人格判断、治疗建议或用户画像。它不能替代 `good-question`、`thinking`、`action`、`knowledge` 或 `safety`，也不能改变 PublicCard 发布门、候选晋级门、用户权限或安全边界。

心理层标注是**主路由完成后的可选附加层**。先回应用户当前请求，再决定是否需要标注；不能为了标注而延迟回答、强迫行动或重复追问。

## 输入门与 fail-closed

分类器输入必须满足以下条件：

- `main_route_completed` 必须为 `true`；缺失或为其他值时返回 `FAIL_CLOSED / MAIN_ROUTE_NOT_COMPLETED`，不输出心理标签；
- `safety_red_flag` 若存在必须是布尔值；其他类型返回 `FAIL_CLOSED / INVALID_SAFETY_FLAG_TYPE`，不能静默当作无红线；
- `evidence.source` 必须为 `USER_CURRENT_TURN`，`evidence.reference` 只能是不可逆、无路径的 opaque reference；缺失、越界或未知字段时返回 `FAIL_CLOSED`；
- `safety_red_flag` 优先于其他门；为 `true` 时直接转 `safety`，不执行心理标注；
- `scripts/psych-label.mjs` 只做无副作用的决策和格式化，不写文件、不安排任务；实际 writer／scheduler 若未来接入，必须重新验证同意收据并独立 fail-closed。

输入结构见 [`schemas/psych-label.schema.json`](../schemas/psych-label.schema.json)。同意结构见 [`schemas/psych-label-consent.schema.json`](../schemas/psych-label-consent.schema.json)。

## 何时加载

仅在主路由已经完成，且当前回合至少有一种可回读信号时加载：

- 用户明确承认自己知道该做但没有做、正在逃避或拖延；
- 用户用“可能／好像／有点”等保留措辞描述自己当前的拖延、逃避或执行阻力；这只允许进入 `SUSPECTED`，不能升级为确定性标签；
- 用户同时给出自述、具体行为、时间范围和同一目标，且它们存在可观察的不一致。

以下情况不单独构成证据：语气、沉默、一次失败、泛泛的焦虑／疲惫、第三方转述、模型猜测，以及没有时间范围或目标对应关系的数字。

如果缺失事实会改变主路由，仍按 `good-question` 的一次区分问题规则处理；不能为了心理标注额外盘问。

用户只陈述“我做不动／我可能在拖延”而没有另提请求时，先由 `action` 回应当前执行阻力并给一个非强迫的最小去向，再决定是否追加本标注；不能跳过主路由直接输出标签。

## 标注类型

每一回合只输出一个主标签：

| 标签 | 使用条件 |
|---|---|
| `USER_ADMITS` | 用户原话无保留地直接承认心理卡点，例如“我知道该做但就是不做”“我是在逃避”“我就是拖延”。“可能／好像／有点”等保留表达不属于本类。 |
| `BEHAVIORAL_CONTRADICTION` | 同一目标、同一时间范围内，用户自述与具体行为满足一个已代码化的标准，并且没有已知的合理背景可以解释该不一致。 |
| `SUSPECTED` | 有保留式自述或经当前回合证据支持的行为线索，但证据不足以达到前两类；不能写成确定性结论。 |
| `NONE` | 主路由已完成，但当前没有足够的执行阻力证据。`NONE` 不猜测，也不为了完整而硬标。 |

如果直接承认和行为矛盾同时出现，主标签使用 `BEHAVIORAL_CONTRADICTION`，但当前回合的证据中仍可保留直接承认；不得借优先级删除重要事实。

## 行为矛盾标准

下面的阈值需要同一目标和时间范围支撑，不是脱离语境的诊断规则。每条输入都必须带 `criterion`、`goal_ref`、`time_range_ref`、`same_goal`、`same_time_range` 和 `reasonable_constraint=false`；任何字段缺失或结构不合法都不能晋级。

至少满足一条，并且证据来自当前用户回合，才可使用 `BEHAVIORAL_CONTRADICTION`：

| `criterion` | 代码化最小证据 |
|---|---|
| `TIME_CONTRADICTION` | `claims_no_time=true` 且同一期间每天娱乐／刷手机 `entertainment_minutes_per_day > 60`； |
| `CONSUMPTION_CONTRADICTION` | `claims_learning_goal=true`、`courses_bought > 3` 且 `completion_rate_percent = 0`； |
| `ACTION_CONTRADICTION` | `claims_want_change=true` 且 `days_since_related_action > 7`； |
| `DIRECTION_CONTRADICTION` | `claims_stable_direction=true`，方向持续天数数组长度 `> 3`，且每个 `> 0` 且 `< 14` 天； |
| `LEARNING_CONTRADICTION` | `claims_learning=true`，同一时间范围内 `questions=0`、`practice=0`、`outputs=0`。 |

单独看到一个数字、一次失败或第三方转述，都不足以触发该标签。代码不接受任意 `criterion_met` 布尔值，也不把模型猜测当作事实。

如果用户补充了工作、照护、健康、权限、资源或其他合理约束，重新评估；不能把现实约束归因为意愿问题。

## 置信度

每个标签都带一个置信度：

- `HIGH`：用户原话或可核对行为直接对应标准，时间／目标关系清楚，替代解释很少；
- `MEDIUM`：证据较明确，但仍有合理解释空间；
- `LOW`：只有线索，通常与 `SUSPECTED` 或 `NONE` 一起使用。

`NONE` 使用 `LOW`，表示“没有足够证据”，不表示对不存在心理问题有高把握。

## 输出格式

```text
## 心理层标注
{USER_ADMITS / BEHAVIORAL_CONTRADICTION / SUSPECTED / NONE} (置信度: {HIGH/MEDIUM/LOW})
- 证据：{当前回合可回读证据；没有证据时写“当前没有足够证据”}
- 建议：{仅在非 NONE 时给出一个最小下一步或转介}
```

`FAIL_CLOSED` 或 `SAFETY` 不输出心理标签。非 `NONE` 的末尾可追加一次：

> 这个判断准不准？如果不对，告诉我哪里不对。

如果出现迫近的自伤、他伤或其他安全红线，停止本合同并转 `safety`；不要用心理标签代替专业转介。

## 反馈、同意与跟踪

默认只完成当回合输出：不保存原话、证据引用、标签、反馈，不安排 7 天跟踪。

只有用户明确、单独、目的限定、带有效期且可撤回的同意收据，才允许授权以下两个彼此独立的范围：

- `FEEDBACK_PERSISTENCE`：在公开仓库外的受控位置保存最小化反馈；
- `SEVEN_DAY_FOLLOW_UP`：仅在 `follow_up_at` 落在 7 天窗口（允许 ± 5 分钟容忍范围）、且仍在同意有效期内时安排跟踪。

同意收据至少包含：`decision=GRANTED`、不可逆 `receipt_ref`、`granted_at`、`expires_at`、`revoked_at` 和逐项 `scopes`。`persistenceDecision` 只返回授权决定，`side_effects=DECISION_ONLY`；本候选没有 writer／scheduler，不会因测试或函数调用产生持久化副作用。

用户拒绝、没有回答、收据无效、已过期或撤回时：

- 不写入新的敏感记录；
- 不设置或继续新的 `follow_up_at`；
- 对已有跟踪返回 `revoke_existing_follow_up=true`，由受控系统执行停止／清理；
- 不因未同意而争辩、追问或降低服务质量。

获得明确同意后，记录仍不得保存原始群聊、成员身份、完整回答或不必要的敏感原文；最小字段包括：

- `label_id`、`labeled_at`、主标签、置信度；
- 脱敏后的证据引用或不可逆 hash；
- 用户反馈：确认、否认或未反馈；
- 经独立 `SEVEN_DAY_FOLLOW_UP` 同意的 `follow_up_at` 与后续行动信号。

准确率只按有明确反馈的样本计算：

```text
准确率 = 用户确认准确数 / (用户确认准确数 + 用户否认数)
```

未反馈样本不进入分母，也不被当成准确或错误。反馈用于迭代规则，不用于惩罚用户或模型。

## 停点与不做什么

- 不把标签写入 PublicCard、`KnowledgeCandidate`、发布收据或正式检索索引；
- 不用标签决定 `ALLOW`、`MISS`、`DENY`、用户权限、是否必须行动或是否需要长期跟踪；
- 不把 `SUSPECTED` 改写成“你有某种心理问题”；
- 不读取或公开私域原文来证明标签；证据不足时返回 `NONE`／`UNKNOWN`；
- 同一信号最多提一次；用户否认后不反复争辩或追问；
- 合成测试只能证明机制边界，不能宣称真实准确率、用户接受或产品效果。
