---
name: knowledge
description: 当用户查询 AI／Agent／OpenClaw 的具体信息或事实时使用；先走 PublicCard 发布门，未命中再普通检索。
---

# contracts/knowledge

## 何时加载

入口 SKILL.md 判模命中“要查具体信息／事实”时加载。

典型信号：

- 用户问“X 是什么”“Y 怎么用”。
- 用户查询产品、配置、版本或官方文档。
- 用户的问题可能命中已发布公共知识卡。

超出 AI／Agent／OpenClaw 社区范围的问题，不使用本 Skill 的知识包。

## 第一步：只通过发布门查询

先读取 `contracts/public-card.md`，再调用：

```bash
node ~/.agents/skills/ai-native-helpdesk/scripts/query-public-card.mjs \
  --query "<用户问题>"
```

调用者明确提供社区知识包时，才增加 `--community-pack "<路径>"`。禁止直接读取 `knowledge/public/` 或社区包中的卡片正文。

### `ALLOW`

- 只使用脚本返回的白名单字段。
- 回答问题，并给一个最小下一步。
- 涉及版本、价格、政策、官方号码等动态事实时，仍需访问当前官方来源复核并标注日期。

### `MISS`

没有已发布卡片命中。可以另起外部回退或使用低风险、非动态的模型推理继续处理，但不得假装知识库命中。外部回退必须重新通过安全／隐私守门，并由 `policies/external-sources.v1.json` 和 `scripts/helpdesk-turn-contract.mjs` 复验来源、时效、风险和逐结论出处。

### `DENY`

知识包、卡片、状态、路径或查询发生冲突。明确告知“知识卡分支暂不可用”，终止该分支；不直接读卡、不模拟卡片内容、不把拒绝原因扩写成答案。`DENY` 不自动进入外部回退；确需另查时必须新建独立路由，重新通过安全／隐私守门，且不得复用被拒正文或敏感 query。

## 外部回退与来源合同

外部检索器负责取得证据；Phase 2 合同负责判断证据能不能支持输出：

1. `QUERY_PRIVACY_DENY` 后不得外发原查询，先请用户安全重述。
2. `EXTERNAL_VERIFIED` 只接受版本化 allowlist 内处于 `ACTIVE` 的官方产品文档、官方仓库／release、标准制定者、监管／政府或专业机构原始材料。
3. 稳定事实不得超过来源的 `stable_max_age_hours`；动态事实使用 `dynamic_max_age_hours`，且必须在同一回合取得。
4. 高风险事实也必须在同一回合核验；版本化技术事实必须记录具体版本。
5. 高风险或动态事实不能由 `MODEL_REASONING` 给出确定性结论，只能验证、升级或保留未知。
6. 策略缺失、过期、不可解析，或来源不在 allowlist／已失效时，fail-closed 到验证、升级或未知。

组合答案按每个关键 claim 保存来源：

- `PUBLIC_CARD`：已通过确定性 loader 的公共知识卡结论，绑定 `card_id`。
- `EXTERNAL_VERIFIED`：获准来源证据，绑定 `source_id`、URL、`retrieved_at` 和必要的版本。
- `MODEL_REASONING`：模型推理，不得伪装成知识库或外部事实。

不得给整段答案设置一个 `overall_source_kind` 来覆盖逐 claim 来源。对用户用自然语言说明哪些结论来自公共卡、本轮官方核验或模型推理。

## 普通信息检索

- 稳定、低风险信息：在允许时效内使用获准来源，区分事实与推断。
- 动态或高风险事实：同一回合访问获准官方来源并记录核验时间。
- 查不到、策略失效或证据不足：写 `UNKNOWN`，给一个最小核验或升级动作。

## 输出所有权

- 完整答案或明确的不可用／未知状态。
- 一个最小下一步。

不分析心理动机，不用未经发布的群聊候选，不把机器检查通过写成用户问题已解决。

## 失败规则

- 发布门文件缺失或运行失败：按 `DENY`，不模拟。
- `MISS`：按外部回退合同继续，不声称知识库命中。
- `DENY`：不自动回退；独立外部路由必须重新守门。
- 策略／来源／时效／风险门失败：不继续确定性结论。
- 用户问“为什么”：需要因果分析时转 thinking。
- 用户说“做不动”：转 action。
- 用户触红线：转 safety。
