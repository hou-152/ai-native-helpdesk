---
name: public-card
description: PublicCard 的确定性发布门合同。knowledge 路由只允许通过本合同加载已公开卡片。
---

# contracts/public-card

## 目的

先判状态，再向模型暴露正文。私密候选、群聊证据和审核材料永远不进入本仓库；本仓库只接收已经生成的公开投影。

## 唯一加载路径

将当前 `SKILL.md` 所在目录视为 Skill 根目录，并从该目录运行：

```bash
node scripts/query-public-card.mjs --query "<用户问题>"
```

需要社区本地知识包时，只能由调用者显式增加：

```bash
node scripts/query-public-card.mjs \
  --query "<用户问题>" \
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

schema B（`0.4`）要求每张卡同时提供经过审查的 `scope_hint`、`judgment_framework`、`common_mistakes`、`action_principles` 和 `verification_method`。这些字段补足判断与验证，结构存在仍不等于内容正确。

index 必须绑定卡片的 `revision`、完整文件 `content_sha256` 和经审核的 `scope_hint`。revision、hash、question、aliases 或 scope_hint 任一漂移都返回 `DENY`；候选召回分数不能跳过这一步。

## 三种结果

| 状态 | 含义 | knowledge 路由动作 |
|---|---|---|
| `ALLOW` | 唯一命中且全部检查通过 | 只使用脚本返回的安全卡字段 |
| `MISS` | 公共包和显式社区包均未命中 | 回到普通事实检索与核验 |
| `DENY` | 坏包、坏卡、冲突、越界或状态未通过 | 明确知识卡不可用；不读取、不模拟、不回退成该卡答案 |

`DENY` 只返回稳定原因码，不返回 query、路径、异常正文或被拒卡片内容。

## 公共包与社区包

- 公共包位于 `knowledge/public/`，跟随 Skill 分发。
- 社区包由运行环境显式传入，不能默认读取用户资料。
- 同一规范化问题命中多张卡时一律 `DENY / QUERY_CONFLICT`，不设置静默覆盖顺序。
- 当前功能分支的正式公共索引精确包含 4 张逐卡批准卡：G12 批准的前三张和 G13b 批准的 000004。远端 `main` 仍只有原试运行卡；功能分支四卡可用不等于 `main` 已发布、完整知识库上线或社区验收完成。

## 隐私能力边界

程序可以拒绝私密字段、成员／消息／线程标识、本机路径、凭证模式、显式群聊引文标记和未知字段，但不能仅靠文本证明一段普通句子从未逐字取自私域语料。语义级脱敏仍必须由人工 `privacy_gate = PASS` 承担；机器通过不能替代人工批准。

## 失败规则

- 脚本、schema 或 index 缺失：`DENY`，禁止模拟。
- 显式社区包缺失或损坏：`DENY`，禁止悄悄忽略。
- 动态事实：即使 `ALLOW`，仍按 knowledge 合同复核当前官方来源。
- `PENDING_G12` 候选或人工 QA 未完成：不得复制到公共包，不得合成四门通过状态。
- 任何拒绝结果出现正文、canary、绝对路径或凭证：视为隐私门实现失败。
