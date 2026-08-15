# ai-native-helpdesk v0.2.3-trial

> ⚠️ **TRIAL 版本 / 尚未在真实群内验证过完整流程**
> 设计稿：https://feishu.cn/docx/DQqBdlPHPoktjNxe8flcSSC0nBf
> 知识库形态：https://feishu.cn/docx/YhrUd3qApoXPdWxe9TDcUorknFb

## 这是什么

AI Native 群高频问答的**薄入口 Skill**。

只做 3 件事：
1. 守门（识别红线 / 隐私 / 不可逆 / 动态事实）
2. 判模（识别主路由 = good-question / thinking / action / knowledge / safety）
3. 加载对应子 Skill contract（按需 `read_file`）

## 这是不是什么

- ❌ **不是**全量加载的诊断框架
- ❌ **不是**一次性回答所有问题
- ❌ **不是**个人 Agent 记忆库
- ❌ **不是**已核验的知识库

## 目录结构

```
ai-native-helpdesk/
├── SKILL.md                    # 总导航（默认全量加载）
├── contracts/                  # 子 Skill contract（按需 read_file）
│   ├── good-question.md
│   ├── thinking.md
│   ├── action.md
│   ├── knowledge.md
│   └── safety.md
└── README.md                   # 本文件
```

## 使用方式

### 入口触发

当用户在 AI Native 群提问时，调用：

```bash
read_file ~/.agents/skills/ai-native-helpdesk/SKILL.md
```

### 子 Skill 加载

按 SKILL.md 判模结果，加载对应 contract：

```bash
read_file ~/.agents/skills/ai-native-helpdesk/contracts/good-question.md
read_file ~/.agents/skills/ai-native-helpdesk/contracts/thinking.md
read_file ~/.agents/skills/ai-native-helpdesk/contracts/action.md
read_file ~/.agents/skills/ai-native-helpdesk/contracts/knowledge.md
read_file ~/.agents/skills/ai-native-helpdesk/contracts/safety.md
```

### 关键规则

**fail-closed**：contract 文件缺失 → 明确告知模块不可用，**禁止模拟**。

**输出所有权唯一**：入口只路由 + 一句话理由；子 Skill 给完整回答 + 一个最小下一步。

## 已知缺陷（trial 阶段暴露过）

- ❌ 问题域识别不够细（第一次用户问"养龙虾审美"，我没识别出是"私人助手"问题域）
- ❌ 9 标签阻塞识别只实现了 5 个核心标签（其余 NOT_IMPLEMENTED）
- ❌ 留档治理 5 档状态只实现了 2 档（候选 / 已核验）
- ❌ 运行时动态事实自动核验未实现
- ❌ v0.3 知识库（飞书 Bitable）尚未创建

## 修订记录

| 版本 | 状态 | 改动 |
|---|---|---|
| v0.1 / v0.2 / v0.2.1 / v0.2.2 | 已废弃 | 见飞书文档 |
| **v0.2.3-trial** | **TRIAL** | 砍版 + 5 子 Skill contract + fail-closed |

## v0.3 待办

- [ ] 知识库（Bitable）实际创建 + 数据沉淀
- [ ] 9 标签阻塞识别全表
- [ ] 5 档 FAQ 状态跑通完整流程
- [ ] 典型案例库（已脱敏）
- [ ] 运行时动态事实自动核验
- [ ] Codex 群聊记录批量扫描整合

---

*v0.2.3-trial = 砍版先做，不假装成熟。*
*真问题进来后，下一版自然升级到 v0.3。*