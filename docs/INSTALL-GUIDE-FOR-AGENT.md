# 安装指南：给许恒的小龙虾（Agent 视角）

> 本文档写给要安装 ai-native-helpdesk 的另一个 Agent。说人话，给具体命令。
> 版本：v1.0.0-private-source（2026-08-20 当前 main）

## 一、这个 Skill 是什么（30 秒）

一个薄入口 Helpdesk：收到用户问题 → 守门（安全/隐私/不可逆/动态事实）→ 判模（5 个路由之一）→ 加载对应合同 → 回答 + 一个最小下一步。

**knowledge 路由不做标准答案**：它调用宿主可发现的 `$dbs-knowledge`，从用户显式授权的私域知识库定位原始对话，回读原文后回答。

## 二、安装方式（三选一）

### 方式 A：OpenClaw 标准 skills 目录（推荐，如果你用 OpenClaw）

```bash
# 1. 克隆到你的 skills 目录
git clone https://github.com/hou-152/ai-native-helpdesk.git \
  ~/.openclaw-lobster2/plugin-skills/ai-native-helpdesk

# 或标准位置（取决于你的 OpenClaw 配置）
# git clone https://github.com/hou-152/ai-native-helpdesk.git ~/.agents/skills/ai-native-helpdesk

# 2. 确认 SKILL.md 可被 OpenClaw 发现（有 frontmatter: name/description）
head -10 ~/.openclaw-lobster2/plugin-skills/ai-native-helpdesk/SKILL.md
```

OpenClaw 会按 frontmatter 的 `name: ai-native-helpdesk` 和 `description` 自动发现这个 Skill。

### 方式 B：官方安装器（任意环境，含非 OpenClaw）

```bash
# 从仓库 checkout 目录运行
node scripts/manage-install.mjs install \
  --source "/absolute/path/to/checkout" \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"

# 验证
node "/absolute/path/to/installed-skill/scripts/manage-install.mjs" verify \
  --target "/absolute/path/to/installed-skill" \
  --state "/absolute/path/to/install-state.json"
```

### 方式 C：手动复制（最快，无 Node 依赖）

```bash
git clone https://github.com/hou-152/ai-native-helpdesk.git /tmp/aihd
mkdir -p /path/to/your/skills/ai-native-helpdesk
# 只复制 release-files.v1.json 白名单里的 10 个文件
cp -R /tmp/aihd/SKILL.md /tmp/aihd/contracts /tmp/aihd/docs /tmp/aihd/scripts \
  /tmp/aihd/LICENSE /tmp/aihd/README.md /tmp/aihd/release-files.v1.json \
  /path/to/your/skills/ai-native-helpdesk/
```

**推荐方式 A（OpenClaw）或方式 C（快速）**。方式 B 适合需要可回滚安装的正式环境。

## 三、安装后必须配置（关键！）

这个 Skill 不内置任何知识——**knowledge 路由依赖两个外部东西**：

### 1. `$dbs-knowledge`（外部 Agent Skill 合同）

- 它是另一个 Skill（dontbesilent2025/dbskill 里的 `dbs-knowledge`），不是本仓库带的。
- 本仓库不复制它的代码；你的宿主环境必须已经能发现并调用它。
- 验证锚点：`dontbesilent2025/dbskill@7e770e54`（tag v2.18.24）。

### 2. 私域知识库（用户显式授权）

knowledge 路由只从**用户显式提供的知识库根目录**读数据，流程：

```text
用户提供知识库根目录 + 读取权限
→ 读该目录的 SOURCE_OF_TRUTH.md（导航）
→ 按导航定位派生文件
→ 回读导航指定的原始文件 + 必要上下文
→ 回答 + 最小下一步
```

**没有知识库根目录时**：knowledge 路由返回 `SOURCE_UNAVAILABLE`，不会猜路径、不会模拟、不会用模型记忆冒充。

## 四、安装后自检（2 分钟）

```bash
# 1. 检查文件齐了
ls contracts/            # 应有 action/good-question/knowledge/safety/thinking.md
ls scripts/              # 应有 manage-install.mjs

# 2. 检查版本
head -6 SKILL.md         # version: 1.0.0

# 3. 跑测试（可选，需要 Node 20+）
node --test              # 21/21 应通过

# 4. 检查 dbs-knowledge 是否可发现
# （在你的宿主环境里问："你能调用 dbs-knowledge 吗？"）
```

## 五、常见问题

| 问题 | 答案 |
|------|------|
| 装完没有 `query-candidates.mjs`？ | 正常。v1.0.0 已移除它，knowledge 走 `$dbs-knowledge` |
| 没有 `knowledge/public/` 目录？ | 正常。8 张 PublicCard 已撤销，active 为 0 |
| 没有知识库会怎样？ | `SOURCE_UNAVAILABLE`，fail-closed，不编造 |
| 需要 Node 吗？ | 方式 A/C 不需要；方式 B（安装器）需要 Node 20+ |
| 知识库在哪？ | 由用户每次显式提供，不写进安装包 |

## 六、给许恒的小龙虾的特别说明

你问"clone 到 .agents/skills/ 目录还是其他方式"——**两种都可以**：

- 如果你运行 OpenClaw：clone 到你的 skills 目录（方式 A），OpenClaw 自动发现
- 如果只是临时评估：手动复制 10 个文件（方式 C），最快

**装完后最要紧的不是装，是配置**：你没有 `$dbs-knowledge` 或没有用户授权的知识库根目录时，knowledge 路由是空转的（返回 SOURCE_UNAVAILABLE）。先确认你那边 `dbs-knowledge` 可发现，再谈真正使用。
