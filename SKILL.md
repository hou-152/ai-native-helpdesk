---
name: ai-native-helpdesk
description: 面向 AI／Agent／OpenClaw 社区的薄入口 Helpdesk Skill。负责守门、判模、按需加载合同，并在 knowledge 路由调用用户显式挂载的私域知识库。
version: 1.0.0
status: KNOWLEDGE_SOURCE_MIGRATION / NOT_RELEASED / PRODUCT_VALIDATION_UNKNOWN
author: 减
license: Apache-2.0
---

# ai-native-helpdesk v1.0.0-private-source

> 当前运行面已从“发布标准答案”改为“定位私域原始对话并回答当下问题”。旧 8 卡发布面、v0.9.0 tag 和 GitHub Release 已撤销；Git 历史未重写。本版本尚未发布。

运行时把本文件所在目录作为唯一 Skill 根目录。所有合同只相对于该目录按需读取；不得猜测用户目录、私域知识库路径或宿主的全局 Skill 路径。

## 这是什么

这是面向 AI／Agent／OpenClaw 社区的薄入口，只做 5 件事：

1. 守门：先处理安全、隐私、不可逆和动态事实风险。
2. 判模：每轮选择 1 个主路由。
3. 按需加载对应 contract。
4. knowledge 路由调用宿主可发现的 `$dbs-knowledge`，从用户显式授权的私域知识库定位原始对话。
5. 根据证据给出回答和 1 个最小下一步，证据不足时保留 `HOLD`／`UNKNOWN`。

## 这不是什么

- 不是公开标准答案库，当前运行包不含知识卡、公共索引或卡片 loader。
- 不是群聊原文导出器，不向公开 Git、普通日志或无关用户暴露原文、成员信息和消息标识。
- 不是召回、制卡、发布和反馈增长流水线。
- 不是个人 Agent 记忆，也不是全量加载的诊断框架。
- 不是用机器 `PASS` 代替用户问题已解决的产品效果证明。

## 依赖与知识源

- `$dbs-knowledge` 是外部 Agent Skill 合同，不是 CLI，也不随本包复制；其许可证和发布节奏由上游拥有。本候选验证所依据的上游锚点为 `dontbesilent2025/dbskill@7e770e54aaaa8f43cac344b536d3adce095ead8f`（tag `v2.18.24`）。
- 调用者必须显式提供私域知识库根目录和读取权限，或让当前项目的知识库导航明确指向它。
- 禁止把本机默认路径、环境变量、当前目录或历史聊天猜成知识源。
- `$dbs-knowledge` 不可发现、知识源未提供、权限不足或导航无法读取时，返回 `SOURCE_UNAVAILABLE`；不得模拟调用或改用模型记忆冒充知识库。

公开包不假设 `$dbs-knowledge` 有 shell 命令、固定 API、输入 schema 或固定安装路径。上游只约定知识库导航与原始文件调用链；本候选的宿主 wrapper 在调用前自行核验本轮查询、显式 `source_root`、读取权限和风险标签，再把实际结果归一化为本候选内部的 `HIT`、`MISS`、`SOURCE_UNAVAILABLE`、`HOLD`、`VERIFY`、`ESCALATE`、`STOP` 或 `UNKNOWN`。这些状态不是上游 Skill 的返回 API；wrapper 不可用时按 `SOURCE_UNAVAILABLE` 处理。

## 主路由

| 用户问题类型 | 主路由 | 加载合同 |
|---|---|---|
| 缺失语境会改变答案／边界／风险／下一步 | good-question | `contracts/good-question.md` |
| 有假设／逻辑／原因要分析 | thinking | `contracts/thinking.md` |
| 知道该做但做不动 | action | `contracts/action.md` |
| 查询 AI／Agent／OpenClaw 事实或历史处理经验 | knowledge | `contracts/knowledge.md` |
| 触发安全红线 | safety | `contracts/safety.md` |

混合信号可以记录多个标签，但本轮只执行 1 个主路由。用户补充信息后，从守门重新开始，不静默沿用旧裁决。

默认直接回答。只有能明确指出一个缺失事实会改变处理路径时，才加载 good-question；通过追问门后只问 1 个区分问题。同一歧义允许换一种具体问法 1 次，再不知道就保留 `UNKNOWN`。

## 守门

每次触发依次检查：

1. 安全红线：迫近的自伤、他伤或违法实施意图直接转 safety。
2. 隐私红线：出现他人身份、私密原话、成员／消息标识或凭证时，先停止外发并最小化、脱敏。
3. 不可逆行动：删除、转账、全量发送、覆盖生产数据等必须暂停确认。
4. 动态事实：当前价格、政策、版本、官方号码和运行状态必须在同一回合核验当前权威来源；历史对话不能替代。
5. 个人信息保存：必须获得用户对目的和范围的明确同意。

优先级：安全 > 隐私 > 不可逆 > 动态事实 > 个人信息。高优先级门未通过时，不进入普通 knowledge 查询。

## 合同加载 fail-closed

入口只按需读取对应 contract。合同不存在或读取失败时：

- 禁止根据入口摘要模拟合同输出。
- 明确告知该模块暂不可用。
- 不跨到另一个模块假装完成。

入口只负责路由和一句理由；被加载的 contract 负责完整回答和一个最小下一步。

## knowledge 调用链

knowledge 路由必须按下面顺序执行，详细规则见 `contracts/knowledge.md`：

```text
显式知识源与权限
→ 调用 $dbs-knowledge
→ 先读 SOURCE_OF_TRUTH.md
→ 按导航指定的派生文件定位候选
→ 按同一来源标识回读导航指定的原始文件和必要上下文
→ 区分原始事实、跨消息归纳、模型推测和未知
→ 回答与最小下一步
```

派生文件命中只证明“找到候选位置”，不能直接成为答案。来源 hash 漂移、原始记录缺失、删除正文、附件不可读、线程不完整或来源冲突时，停止该分支并返回 `HOLD`／`UNKNOWN`。

本公开仓库没有宿主适配器实现；合成测试只验证合同顺序和 fail-closed 边界，不证明每个 Agent 宿主都能实际调用外部 Skill。部署时必须用宿主支持的 Skill 调用机制完成一次 fresh-session 读回，并单独记录结果。

## MISS 与最小实验

`MISS` 只表示本次知识源没有找到可复核的相关对话，不表示问题没有答案。

只有同时满足以下条件，才可以把“试试就知道了”改写成一个最小实验：

- 风险低；
- 动作可逆；
- 结果可观察；
- 不涉及隐私、凭证、安全、动态事实或生产不可逆操作；
- 写清成功信号、停止条件和恢复方法。

其他 `MISS` 根据实际风险进入 `VERIFY`、`ESCALATE`、`STOP` 或 `UNKNOWN`，不得给无保护的试错建议。

## 回答中的证据边界

回答必须自然地区分：

- 原始来源直接支持的事实；
- 跨多条消息形成的归纳；
- 模型基于来源做出的推测；
- 当前仍缺失或冲突的信息。

只读取和摘取解决当前问题所需的最小内容。默认不输出私域绝对路径、成员信息、消息／线程标识或大段逐字原文；需要引用时先脱敏并缩到必要片段。

## 失败规则

| 场景 | 动作 |
|---|---|
| Contract 缺失 | 明确不可用，不模拟 |
| `$dbs-knowledge` 不可发现 | `SOURCE_UNAVAILABLE`，不模拟调用 |
| 知识源未显式提供或权限不足 | `SOURCE_UNAVAILABLE`，不猜路径 |
| 导航、manifest 或 hash 失配 | `HOLD`，停止读取派生答案 |
| 定位命中但原始消息／上下文不可复核 | `HOLD / UNKNOWN` |
| `MISS` 且满足低风险最小实验条件 | 给 1 个带观察、停止和恢复方法的实验 |
| `MISS` 但涉及动态／高风险事实 | `VERIFY / ESCALATE / UNKNOWN` |
| 隐私门未通过 | 不外发原查询，先安全重述 |
| 不可逆行动未确认 | `STOP` |
| 多个主路由 | 本轮只执行 1 个 |
| 同一歧义重述后仍不知道 | `UNKNOWN`，停止追问 |

## 当前状态

- 当前运行包的 active PublicCard 数量为 `0`；旧卡、索引、loader、Phase 1–4 代码和运行测试不进入 release manifest。
- 退役文件保留在执行控制面的日期化 `.trash` 回收目录，便于 30 天内审计和恢复；该目录不进入 Git，也不随安装包分发。
- v0.9.0 的 8 卡当前发布面、tag 和 GitHub Release 已撤销；Git 历史未重写。
- 本版本只证明新合同和安装边界；社区端到端与用户问题解决效果仍为 `UNKNOWN`。

## 修订记录

| 版本 | 状态 | 改动 |
|---|---|---|
| v0.1–v0.8 | 历史 | 薄入口、PublicCard 与 Phase 1–4 机制迭代 |
| v0.9.0 | 已撤销 | 8 张 PublicCard、tag 和 GitHub Release 已从当前公开面删除；Git 历史未重写 |
| v1.0.0-private-source | 未发布 | active PublicCard 归零；knowledge 改为调用显式私域知识源并回读原始对话 |
