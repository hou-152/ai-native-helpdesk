---
name: ai-native-helpdesk
description: AI Native 群高频问答的薄入口 Skill。当用户在群内提问、需要引导问题域识别、调用子 Skill 给出最小下一步时使用。
version: 0.2.3-trial
status: TRIAL / 待真实群内验证
author: 减
license: internal
---

# ai-native-helpdesk v0.2.3-trial

> ⚠️ **这是 trial 版本，尚未在真实群内验证过完整流程。**
> 设计稿见 https://feishu.cn/docx/DQqBdlPHPoktjNxe8flcSSC0nBf
> 知识库形态见 https://feishu.cn/docx/YhrUd3qApoXPdWxe9TDcUorknFb

## 这是什么

AI Native 群的**薄入口 Skill**——当用户在群里提问、需要引导问题域、调用子模块给出最小下一步时使用。

**只做 3 件事**：
1. 守门（识别红线 / 隐私 / 不可逆 / 动态事实）
2. 判模（识别主路由 = good-question / thinking / action / knowledge / safety）
3. 加载对应子 Skill contract（按需 `read_file`）

## 这是不是什么

- ❌ **不是**全量加载的诊断框架（参考 DBS 的反面教训）
- ❌ **不是**一次性回答所有问题
- ❌ **不是**个人 Agent 记忆库
- ❌ **不是**已核验的知识库（v0.3 知识库见飞书文档，当前 HOLD）

## 路径根

```
~/.agents/skills/ai-native-helpdesk/
├── SKILL.md                    # 本文件（默认全量加载）
├── contracts/                  # 子 Skill contract（按需 read_file）
│   ├── good-question.md
│   ├── thinking.md
│   ├── action.md
│   ├── knowledge.md
│   └── safety.md
└── README.md                   # 项目说明 + trial 标记
```

## 主路由表

| 用户问题类型 | 主路由 | 加载 contract |
|---|---|---|
| **问题不清楚**（说不清目标/对象/约束） | good-question | `contracts/good-question.md` |
| **有假设/逻辑/事实要分析** | thinking | `contracts/thinking.md` |
| **知道该做但做不动** | action | `contracts/action.md` |
| **要查具体信息/事实** | knowledge | `contracts/knowledge.md` |
| **触红线**（自伤/违法实施意图/不可逆行动迫近） | safety | `contracts/safety.md` |

**混合信号**：可识别多个标签，但**本轮只执行 1 个主 next_route**，其他进入待处理队列。

## 守门（5 项检查）

每次触发都要先跑一遍：

| # | 检查项 | 不通过怎么办 |
|---|---|---|
| 1 | 安全红线（自伤/违法实施意图迫近） | 直接转 safety，**终止其他流程** |
| 2 | 隐私红线（暴露他人姓名/隐私） | 脱敏后才继续 |
| 3 | 不可逆行动（要删库/转账/全量发消息等） | 暂停 + 确认 |
| 4 | 动态事实（行情/政策/官方号码） | 核验当前官方源后才继续 |
| 5 | 个人信息（要保存用户说的话/身份） | 必须用户明确同意 |

**守门优先级**：安全 > 隐私 > 不可逆 > 动态事实 > 个人信息。

**关键原则**：守门**不一律拒绝**：
- 焦虑/普通冲突 → 不算危机 → 继续温和承接
- 违法讨论 → 区分求助 vs 实施意图
- 动态事实 → 核验后可继续
- 个人信息 → 不默认保存

## 加载合同（fail-closed 规则）

### 默认加载

- ✅ 本文件（SKILL.md）—— 每次启动 helpdesk 必读

### 按需加载

加载子 contract **必须用 `read_file <path>`**：

```
read_file ~/.agents/skills/ai-native-helpdesk/contracts/good-question.md
```

### fail-closed（关键）

如果 contract 文件缺失或加载失败：
- ❌ **禁止根据 SKILL.md 摘要模拟子 Skill**
- ✅ **明确告知用户**："模块暂不可用，请换问法或等待修复"
- ✅ **回到入口**，让用户重述问题

**绝不**根据本文件里的子 Skill 描述**模拟子 Skill 的输出**。

## 输出所有权（唯一）

### 入口（SKILL.md）只输出

- 命中哪个子 Skill（路由）
- 一句话理由（为什么是这个子 Skill）
- 加载合同（已 read_file 哪个 contract）

**入口不答下一步**。

### 子 Skill（contract）输出

- 完整的回答（针对该问题的诊断/方案）
- 一个最小下一步（用户可以做的一个动作）

**子 Skill 不再路由**。

## 状态维度

每次输出必须包含三个独立维度：

| 维度 | 取值 | 含义 |
|---|---|---|
| `brief_state` | `NEEDS_INPUT` / `READY` | 问题说明书是否清楚 |
| `task_mode` | `ANSWER` / `ROUTE` / `AUTOMATION_ASSESS` | 当前在做什么 |
| `automation_level` | `AUTO_HIGH` / `AUTO_SEMI` / `AUTO_ASSIST` / `AUTO_NOT_READY` | 自动化程度（仅在 task_mode = AUTOMATION_ASSESS 时输出） |

**关键**：`brief_state = READY` 不允许"半成品"——必须是**可执行的问题说明书**。

## 用户补充信息后

用户补充信息后：
1. 重新跑守门（可能新增红线）
2. 重新判模（可能改路由）
3. 加载对应 contract
4. 输出完整回答 + 一个最小下一步

## 失败规则

| 场景 | 动作 |
|---|---|
| Contract 文件不存在 | 明确告知模块不可用（**不模拟**） |
| 用户问题触红线 | 转 safety，**终止其他流程** |
| 多个主路由同时触发 | 本轮只 1 个主 next_route，其他进队列 |
| 信息不足以判断路由 | good-question 优先（识别问题域）|
| 用户补充信息 | 重新跑守门 + 判模 |

## 修订记录

| 版本 | 状态 | 改动 |
|---|---|---|
| v0.1 / v0.2 / v0.2.1 / v0.2.2 | 已废弃 | 见飞书文档 https://feishu.cn/docx/DQqBdlPHPoktjNxe8flcSSC0nBf |
| **v0.2.3-trial** | **TRIAL / 待真实群内验证** | 砍版 + 5 子 Skill contract + fail-closed |

## v0.3 待办（不在本 trial 内）

- [ ] 知识库（Bitable）实际创建 + 数据沉淀
- [ ] 9 标签阻塞识别全表
- [ ] 5 档 FAQ 状态跑通完整流程
- [ ] 典型案例库（已脱敏）
- [ ] 运行时动态事实自动核验
- [ ] Codex 群聊记录批量扫描整合

---

*v0.2.3-trial = 砍版先做，不假装成熟。*
*真问题进来后，下一版自然升级到 v0.3。*