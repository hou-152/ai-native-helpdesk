# ai-native-helpdesk · 使用教程（2W2H）

> 面向使用者（AI Agent / 人）。安装细节见 [TUTORIAL.md](TUTORIAL.md)，本文只讲"这是什么、为什么用、怎么用、要多少投入"。

## What（这是什么）

**ai-native-helpdesk 是一个面向 AI／Agent／OpenClaw 社区的 Helpdesk Skill 导航中心。**

它自己不存答案、不直接处理问题，只做 4 件事：**守门、判模、路由、交接**。

- **守门**：每次必做的安全检查（安全红线 → 隐私 → 不可逆操作 → 动态事实 → 个人信息）
- **判模**：判断你当前最需要什么（诊断／澄清／查事实／因果分析／行动）
- **路由**：把问题交给对应的子 skill 处理
- **交接**：处理完给 1 个最小下一步，你追问时重新路由

装好是一个包、7 个 skill：

| Skill | 干什么 | 什么时候用 |
|---|---|---|
| **ai-native-helpdesk**（主入口） | 守门、判模、路由 | 不知道该问谁、什么问题都从这里进 |
| aihd-diagnosis | 识别"做不动／拖延／反复换方向"等心理动机信号 | 情绪宣泄、行动卡点带心理特征 |
| aihd-good-question | 收敛式追问，问出关键缺失事实 | 缺一个会改变答案的关键信息 |
| aihd-knowledge | 从公开知识库检索真实历史处理经验 | 查"以前怎么处理过、怎么配置、怎么避坑" |
| aihd-thinking | 候选解释 + 验证设计（draft，用户验收） | 问"为什么／怎么回事／是不是 X" |
| aihd-action | 给"可观察、可回滚"的最小下一步 | 知道该做但做不动、要下一步 |
| aihd-safety | 守门红线处理参考（非路由目标） | 触发安全红线时按规则承接／转介／暂停 |

## Why（为什么要用它）

三个痛点，它各给一个解：

1. **不知道该问谁** → 薄入口：所有 AI／Agent／OpenClaw 问题直接丢进来，它判模后路由。
2. **AI 乱答、编造经验** → 知识路由：默认从公开知识库 `ai-native-knowledge-base` 检索原始对话摘录（BM25），**HIT 才带来源回答，MISS 就如实说不知道**，不用模型记忆冒充。
3. **安全边界没人守** → 每次必做守门：安全 > 隐私 > 不可逆 > 动态事实 > 个人信息，红线直接按规则处理，不路由。

一句话：**它是入口和守门人，不是答案库。** 好处是问题不会被错误分类、不会被编造经验带偏、危险操作不会被直接执行。

## How（怎么用，三步）

### 第 1 步：安装（约 10 分钟）

```bash
# 方式 A：行业标准 skills CLI（推荐，自动适配宿主）
npx -y skills add hou-152/ai-native-helpdesk -g --all

# 方式 B：自建可逆安装器（显式路径，可验证/卸载/回滚）
npx --yes github:hou-152/ai-native-helpdesk install \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/private-control/aihd-state.json"
```

前置要求：Node.js ≥ 20；`$dbs-knowledge`（可选增强，私域回读时才需要）。

### 第 2 步：绑定知识源（默认公开库，clone 即用）

```bash
git clone https://github.com/hou-152/ai-native-knowledge-base.git
```

把知识库在本机的路径告诉 skill 即可。不需要私域根目录或读取授权。私域回读是可选增强，需要显式授权 + `SOURCE_OF_TRUTH.md` 可读。

### 第 3 步：直接问

不用记命令、不用判断该用哪个模块，直接说问题：

> "怎样让 OpenClaw Agent 形成受控自迭代闭环？"
> "我反复想做又做不动，怎么办？"
> "社区以前怎么处理过类似的问题？"

它会守门 → 判模 → 路由 → 子 skill 处理 → 给你 1 个最小下一步。

**查询结果四种状态：**

| 结果 | 含义 | 你该做什么 |
|---|---|---|
| `HIT` | 知识库命中（带来源引用） | 基于摘录的回答 + 1 个最小下一步 |
| `MISS` | 没有可复核候选 | 要么低风险最小实验，要么如实说不知道 |
| `SOURCE_UNAVAILABLE` | 知识库／Skill／权限不可用 | 回第 2 步检查 |
| `HOLD` | 完整性门未通过 | 检查知识库完整性收据 |

## How much（投入与产出）

| 维度 | 预期 |
|---|---|
| **时间** | 安装 ~10 分钟；之后即用，无学习成本（不需要记命令） |
| **前置** | Node.js ≥ 20；知识库 clone（公开库即可） |
| **产出** | ① 每次必做的安全守门 ② 正确分类的路由 ③ 带来源的真实经验（不编造）④ 1 个可观察可回滚的最小下一步 |
| **验证** | 机器验证：quick_validate 7/7、security_scan 6/6、node --test 21/21、npm pack 24 文件（CI 固定 checkout v7.0.1 / setup-node v7.0.0） |
| **边界** | 不发布 npm；机器验证 ≠ 真实用户效果（产品验证 0/30）；GitHub 正式 review 待补 |
| **你的成本** | 唯一要做的事：**验收**。thinking 的结论是 draft 不替你下结论；action 的下一步你做之前先确认可回滚 |

## 常见问题

**Q：装完怎么确认没问题？**
`verify` 返回 `VERIFIED / OK` 即安装正确；或跑 `node --test`（21/21）。

**Q：它是不是什么都知道？**
不是。它查知识库，查不到就 MISS／UNKNOWN，不编造。私域内容需要显式授权才能回读。

**Q：会直接执行危险操作吗？**
不会。守门强制检查，安全红线直接按规则承接／转介／暂停确认，不可逆操作先暂停确认。

**Q：和 dbskill 什么关系？**
`$dbs-knowledge` 是外部 Agent Skill 合同（上游 dontbesilent2025/dbskill），不随本包复制；是私域回读的可选依赖，不是必需。
