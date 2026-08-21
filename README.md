# ai-native-helpdesk

> 面向 AI／Agent／OpenClaw 社区的薄入口 Helpdesk Skill：先守门、判模、按需加载合同，knowledge 路由调用宿主显式授权的私域知识库，定位原始对话后回答当下问题。

**当前版本：`v1.0.0-private-source`（未发布）**

本版本是一个减法实现：不再随包分发"标准答案"。旧 8 卡公开面（PublicCard、公共 index、卡片 loader）已全部撤销，`v0.9.0` tag 与 GitHub Release 已删除；Git 历史未重写，旧提交仍可追溯。

## 双仓库架构

本项目由两个 GitHub 仓库组成，分工不同：

| 仓库 | 角色 | 内容 |
|------|------|------|
| **[ai-native-helpdesk](https://github.com/hou-152/ai-native-helpdesk)**（本仓库） | 入口 / 路由 / 合同 | 守门、判模、按需加载合同；knowledge 路由调用 `$dbs-knowledge` 定位私域原始对话 |
| **[ai-native-knowledge-base](https://github.com/hou-152/ai-native-knowledge-base)** | 公开数据面 | 脱敏聊天语料（6,032 条）、候选池（2,153 条对话摘录）、管道脚本、知识原子化方法文档 |

`ai-native-knowledge-base` 是本项目公开的数据参考面：发送者 ID 已脱敏，可供群成员检索历史对话、查看知识原子化方法与管道。helpdesk 的 knowledge 路由在私域侧使用 `$dbs-knowledge` 定位原始对话；公开数据面提供可分享、可审计的脱敏版本。

---

## 这是什么

AI／Agent／OpenClaw 社区的成员经常问相似的问题：某个工具怎么配、某个坑怎么过、某个规则为什么没生效。传统做法是攒一个"标准答案库"，但标准答案会过期、会脱离上下文、会掩盖真实来源。

本项目换了一种做法：**不存答案，只做守门和路由**。当用户要查具体事实或历史经验时，它调用宿主已授权的私域知识库（`$dbs-knowledge`），定位到原始对话后回读原文和必要上下文，再回答。

它只做 5 件事：

1. **守门**：先处理安全、隐私、不可逆和动态事实风险。
2. **判模**：每轮选择 1 个主路由。
3. **按需加载对应 contract**：合同文件决定该轮怎么回答。
4. **knowledge 路由**：调用宿主可发现的 `$dbs-knowledge`，从用户显式授权的私域知识库定位原始对话。
5. **回答 + 1 个最小下一步**：证据不足时保留 `HOLD`／`UNKNOWN`，不编造。

## 运行结构

```text
用户问题
→ 安全／隐私／不可逆／动态事实守门
→ 选择 1 个主路由
→ 按需加载 1 个 contract
→ knowledge：调用 $dbs-knowledge
→ 先读 SOURCE_OF_TRUTH.md
→ 按知识库导航定位派生文件
→ 回读导航指定的原始文件＋必要上下文
→ 回答＋1 个最小下一步
```

## 这不是什么

- ❌ 不是公开标准答案库 —— 当前运行包不含知识卡、公共索引或卡片 loader。
- ❌ 不是群聊原文导出器 —— 不向公开 Git、普通日志或无关用户暴露原文、成员信息和消息标识。
- ❌ 不是召回、制卡、发布、反馈增长流水线。
- ❌ 不是个人 Agent 记忆，也不是全量加载的诊断框架。
- ❌ 不是用机器 `PASS` 代替"用户问题已解决"的产品效果证明。

## 依赖

| 依赖 | 说明 |
|---|---|
| Node.js 20+ | 用于安装、验证、卸载和回滚 |
| `$dbs-knowledge` | 外部 Agent Skill 合同，不是 CLI，不随本仓库复制；由宿主自行发现和调用 |
| 私域知识库根目录 | 调用者显式提供，含可读的 `SOURCE_OF_TRUTH.md` 和导航绑定的原始来源 |

本候选验证所依据的上游锚点：`dontbesilent2025/dbskill@7e770e54aaaa8f43cac344b536d3adce095ead8f`（tag `v2.18.24`）。该锚点只用于依赖复核，不代表上游提供固定 API 或状态枚举。

依赖或知识源不可用时，knowledge 路由返回 `SOURCE_UNAVAILABLE`；**不得**猜本机路径、模拟调用或用模型记忆冒充知识库。

## 快速开始

### 方式 A：npx 一键安装（推荐）

无需克隆仓库，npx 直接从 GitHub 拉取并执行安装器：

```bash
npx --yes github:hou-152/ai-native-helpdesk install \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

安装完成后，从与源码无关的工作目录验证：

```bash
npx --yes github:hou-152/ai-native-helpdesk verify \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

卸载与回滚同理：

```bash
npx --yes github:hou-152/ai-native-helpdesk uninstall \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"

npx --yes github:hou-152/ai-native-helpdesk rollback \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

### 方式 B：从源码仓库安装

```bash
# 1. 克隆（或直接使用已有 checkout）
git clone https://github.com/hou-152/ai-native-helpdesk.git
cd ai-native-helpdesk

# 2. 安装到显式目标目录（不假设固定 Skill 目录）
node scripts/manage-install.mjs install \
  --source "/absolute/path/to/ai-native-helpdesk" \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"

# 3. 验证安装完整性（文件集合与字节必须与 state 一致）
node "/absolute/path/to/installed-skill/scripts/manage-install.mjs" verify \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"

# 4. 跑测试（当前源码树）
node --test
```

两种方式等价：npx 方式自动携带正确的包内文件集；源码方式需要显式 `--source`。卸载与回滚命令见 [docs/TUTORIAL.md](docs/TUTORIAL.md)。

### 开箱即用：顺带安装 dbs-knowledge

helpdesk 的 knowledge 路由依赖外部 Agent Skill `$dbs-knowledge`（上游 dbskill）。一条命令拉取安装：

```bash
npx --yes github:hou-152/ai-native-helpdesk install-deps
# 默认装到宿主个人 skills 目录；也可指定目录：
# npx --yes github:hou-152/ai-native-helpdesk install-deps --skills-dir /path/to/skills
```

已安装时会返回 `SKIPPED / ALREADY_INSTALLED`（幂等）。

## 使用（三步）

1. **安装**（一次性）：上面的 npx install（+ install-deps 装依赖）
2. **触发**：显式输入 `/ai-native-helpdesk`，或直接问 AI／Agent／OpenClaw 相关问题（按 description 自动激活）
3. **首次触发** → 出现新手教程 → 描述问题 → 守门 → 判模 → 路由到对应合同 → 回答 + 最小下一步

找不到答案时：`MISS`（知识源没有可复核候选）/ `SOURCE_UNAVAILABLE`（依赖或权限缺失）/ `HOLD`（证据门未通过），**绝不编造**。

三个文档入口：

- [docs/TUTORIAL.md](docs/TUTORIAL.md)：从零逐步教程（前置检查 → 安装 → 验证 → 知识源绑定 → 首次查询 → 覆盖旧版 → 卸载 → 回滚 → FAQ）
- [docs/INSTALL-GUIDE-FOR-AGENT.md](docs/INSTALL-GUIDE-FOR-AGENT.md)：给另一个 Agent 看的安装视角（含 OpenClaw skills 目录方式）
- [docs/INSTALL.md](docs/INSTALL.md)：安装器详细行为（安装、验证、覆盖、卸载、回滚、fail-closed 状态）

## knowledge 结果

| 内部结果 | 含义 |
|---|---|
| `HIT` | 派生文件定位后，已按同一来源标识回读原始消息与必要上下文 |
| `MISS` | 当前知识源没有可复核候选 |
| `SOURCE_UNAVAILABLE` | Skill、路径、权限或导航不可用 |
| `HOLD` | hash、原始记录、附件、线程或冲突门未通过 |
| `VERIFY` | 动态或高风险事实需要当前权威来源核验 |
| `ESCALATE` | 需要专业资格或更高权限 |
| `STOP` | 安全或不可逆门未通过 |
| `UNKNOWN` | 当前证据不足 |

`MISS` 不会统一变成"试试就知道了"。只有风险低、可逆、可观察，且不涉及隐私、凭证、安全、动态事实或生产不可逆操作时，才给一个写明成功信号、停止条件和恢复方法的最小实验。

## 安装包内容

`release-files.v1.json` 是安装白名单。当前只包含：

```text
ai-native-helpdesk/
├── LICENSE
├── README.md
├── SKILL.md
├── contracts/
│   ├── action.md
│   ├── good-question.md
│   ├── knowledge.md
│   ├── safety.md
│   └── thinking.md
├── docs/INSTALL.md
├── docs/TUTORIAL.md
└── scripts/manage-install.mjs
```

安装器只复制白名单文件，不做增量覆盖：目标已存在时先改名为可恢复 backup，再切换新安装。卸载和回滚也都是可逆的，不会直接删除。

## 隐私与来源边界

- 公开包不内置私域绝对路径、私域 hash、消息／成员标识或原始正文。
- 公开数据面（`ai-native-knowledge-base`）只含脱敏语料：发送者已映射为 `USER_NNN`，邮箱／手机号／路径／凭证等 7 类敏感模式 0 残留。
- 派生定位命中只证明找到候选位置，不证明原话正确或问题已经解决。
- 回答区分原始事实、跨消息归纳、模型推测和未知。
- 默认不输出成员身份、消息／线程标识、群名、凭证或大段逐字原文；引用必须脱敏并缩到必要片段。
- 动态事实必须在同一回合核验当前官方或权威来源；历史聊天不能替代。

## 验证

```bash
node --test
```

测试使用运行时生成的脱敏临时语料，不包含真实社区消息、成员信息、消息标识或私域路径。覆盖：`HIT → raw/context`、`MISS`、`SOURCE_UNAVAILABLE`、source hash drift、定位命中但原始记录缺失、隐私／动态事实／不可逆动作／低风险最小实验边界，以及清洁安装、旧 8 卡覆盖、精确文件集 verify、回滚和软链拒绝。

机器测试只证明合同与安装边界，**不**证明私域内容正确、用户接受、已经发布或产生效果。

## LICENSE

本版本保留的代码、contracts 和文档按 Apache License 2.0 提供，见 [LICENSE](LICENSE)。`$dbs-knowledge` 是未打包的外部依赖，适用其上游许可证；本仓库没有复制其正文。

## 项目状态

| 项目 | 状态 |
|---|---|
| 运行面 | `v1.0.0-private-source`（未发布） |
| 旧 8 卡公开面 | `REVOKED`（已撤销并归档回收） |
| active PublicCard | `0` |
| 产品效果 | `UNKNOWN`（30 人验证未开始） |
| 知识包／标签方向 | `FROZEN`（2026-08-20 验证：关键词分类合理率 40-50%，未达 80% 阈值；不上 LLM 方案 B，等真实使用痛点再重启） |

历史边界：`v0.9.0` 已撤销；tag、GitHub Release 和当前树中的 8 卡发布面已删除，Git 历史未重写。更多推进记录见 [PROGRESS.md](PROGRESS.md)。
