# 安装、验证、卸载与回滚

本项目不假设固定的 Skill 目录。调用者必须显式选择安装目标；运行时所有 contracts、schema、policy、script 和 PublicCard 都相对于安装后的 `SKILL.md` 所在目录解析。

## 前提

- Node.js 24 已在本轮 macOS arm64 环境验证；其他操作系统和 Node major 仍为 `NOT_VERIFIED`。
- 源目录包含 `SKILL.md`、`release-files.v1.json` 和 `scripts/manage-install.mjs`。
- 安装目标与状态收据必须位于现有普通目录内，不能是符号链接。
- 状态收据必须位于安装目标之外；它会包含本机目标与 backup 路径，因此不得提交到公开仓库。

以下变量只作示例，必须替换为当前机器上的显式绝对路径：

```bash
SOURCE_ROOT="/absolute/path/to/ai-native-helpdesk-source"
TARGET_ROOT="/absolute/path/chosen-by-the-caller/ai-native-helpdesk"
STATE_FILE="/absolute/path/to/private-control/ai-native-helpdesk-install-state.json"
```

## 安装

```bash
node "$SOURCE_ROOT/scripts/manage-install.mjs" install \
  --source "$SOURCE_ROOT" \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

安装器只复制 `release-files.v1.json` 中的白名单文件。它先在目标同级 staging 目录生成并逐文件校验；目标已存在时先改名为可恢复 backup，再切换新安装。state 已存在、路径为软链、文件集合不符或任一字节 hash 漂移时都 fail-closed。

## 安装读回

从与源码无关的工作目录调用安装后的脚本：

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" verify \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"

node "$TARGET_ROOT/scripts/query-public-card.mjs" \
  --query "怎样让 OpenClaw Agent 形成受控自迭代闭环？"
```

`VERIFIED` 只证明安装包文件集合和字节与安装收据一致。查询 `ALLOW` 只证明指定 PublicCard 通过当前 loader；两者都不证明社区用户问题已解决。

## 卸载

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" uninstall \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

卸载不会删除当前安装。它把安装目录移动到收据返回的 `recoverable_copy`；若安装前已有目标，则同时恢复旧目标。state 更新为 `UNINSTALLED`，保留动作时间、恢复状态和可恢复副本路径。

## 回滚

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" rollback \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

回滚前再次验证当前安装未漂移。验证失败时不会覆盖旧 backup。验证通过后，当前安装移动到 `rolled-back` 可恢复路径；存在旧目标时恢复旧目标并把 state 更新为 `ROLLED_BACK`。

## 失败处置

- `INSTALL_BYTE_DRIFT`／`INSTALL_FILE_SET_DRIFT`：停止，不回滚覆盖，先检查安装目录为何被修改。
- `STATE_ALREADY_EXISTS`：使用新的 state 文件，或先按旧 state 完成回滚／卸载；不得覆盖旧收据。
- `EXISTING_TARGET_UNSAFE`／`INSTALL_TREE_SYMLINK_FORBIDDEN`：停止并选择普通目录；不要绕过软链门。
- 安装过程中失败：安装器恢复旧目标；新 staging 只属于本次临时写入。
- 任何输出出现凭证、私密正文或用户目录扫描迹象：停止使用并保留最小化 reason code，不继续查询。

## 许可边界

公开仓库中的代码、contracts、schema、公开 PublicCard 和文档按 Apache License 2.0 提供。私密群聊、证据、候选正文、安装 state 和本机日志不属于公开 release 包，也不因安装该 Skill 获得再发布授权。
