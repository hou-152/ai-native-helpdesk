---
name: public-card
description: PublicCard 的确定性发布门合同。knowledge 路由只允许通过本合同加载已公开卡片。
---

# contracts/public-card

## 目的

先判状态，再向模型暴露正文。私密候选、群聊证据和审核材料永远不进入本仓库；本仓库只接收已经生成的公开投影。

## 唯一加载路径

运行：

```bash
node ~/.agents/skills/ai-native-helpdesk/scripts/query-public-card.mjs \
  --query "<用户问题>"
```

需要社区本地知识包时，只能由调用者显式增加：

```bash
--community-pack "<社区知识包目录>"
```

禁止自动扫描当前目录、用户目录、环境变量或个人资料。禁止用 `read_file`、shell 或其他工具直接读取卡片正文来绕过脚本。

## 四道发布门

卡片必须同时精确满足：

```text
editorial = APPROVED
verification = PASS
privacy_gate = PASS
publication = READY
```

缺字段、大小写不同、多余空格、`UNKNOWN`、`HOLD` 或其他值都拒绝。`domain` 必须精确为 `AI_AGENT_OPENCLAW`。PublicCard 还必须通过严格字段、文件名、索引一致性、敏感模式和路径边界检查。

## 三种结果

| 状态 | 含义 | knowledge 路由动作 |
|---|---|---|
| `ALLOW` | 唯一命中且全部检查通过 | 只使用脚本返回的白名单卡字段 |
| `MISS` | 公共包和显式社区包均无精确命中；可能附公共索引候选 | 候选只作提示；否则回到普通事实检索与核验 |
| `DENY` | 坏包、坏卡、冲突、越界或状态未通过 | 明确知识卡不可用；不读取、不模拟、不回退成该卡答案 |

`DENY` 回包只含 `status` 与稳定 `reason_code`，不返回 query、路径、异常正文或被拒卡片内容。

## `MISS` 候选提示边界

- `suggestions` 只来自调用参数中的 common 包索引，不从显式 community 包生成。默认 common 包是仓库公共包；调用者覆盖 `--common-pack` 时，必须自行保证其索引元数据允许暴露。
- 每条候选只含 `card_id` 和 `score`；`score` 是 `0—1000` 的查询词覆盖排序值，不是置信度、正确率、语义质量或发布状态。
- 候选会按卡片去重、稳定排序，最多返回 3 条；响应状态仍是 `MISS`，且绝不含 `card` 或正文。
- 产生候选前会验证固定 schema 和全部已打开包的索引；候选计算只使用 common 索引，不读取候选卡正文，因此不能证明候选卡已通过卡片 schema 和四道发布门。
- 禁止自动把候选 question／alias 改写成新的精确 query。只有用户明确补充或重述问题后，才重新守门、判模并调用发布门。

## 公共包与社区包

- 公共包位于 `knowledge/public/`，跟随 Skill 分发。
- 社区包由运行环境显式传入，不能默认读取用户资料。
- 同一规范化问题命中多张卡时一律 `DENY / QUERY_CONFLICT`，不设置静默覆盖顺序。
- 当前公共索引只有 1 张试运行卡；单卡可用不等于完整知识库上线。

## 隐私能力边界

程序可以拒绝私密字段、成员／消息／线程标识、本机路径、凭证模式、显式群聊引文标记和未知字段，但不能仅靠文本证明一段普通句子从未逐字取自私域语料。语义级脱敏仍必须由人工 `privacy_gate = PASS` 承担；机器通过不能替代人工批准。

## 失败规则

- 脚本、schema 或 index 缺失：`DENY`，禁止模拟。
- 显式社区包缺失或损坏：`DENY`，禁止悄悄忽略。
- 动态事实：即使 `ALLOW`，仍按 knowledge 合同复核当前官方来源。
- 任何拒绝结果出现正文、canary、绝对路径或凭证：视为隐私门实现失败。
