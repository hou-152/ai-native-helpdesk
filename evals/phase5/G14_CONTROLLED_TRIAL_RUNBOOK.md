# G14-A 单人受控社区试跑 Runbook

状态：`AUTHORIZED_AWAITING_P1_DESIGNATION`

授权收据：`G14_OWNER_AUTHORIZATION_RECEIPT.json`

试跑 artifact 绑定：

- implementation commit：`c8ace8a25a7e8663d41816f97e60304f6f763201`
- release manifest SHA-256：`c820533adc3e2a378db864249b1aa88afc219a1b087a66572ab62a9e29d429f1`
- 28 个安装文件
- trial archive SHA-256：`544cae157075dd71b1c0c74395ba54f4420d4b5f96dd7d8c568ca4e7e20ec7c8`

本文件是固定操作说明，不是已执行收据。P1 未指定、未明确同意或环境不匹配时不得传包或运行。

## 1. 唯一邀请模板

只允许向 Owner 指定的 1 名 P1 发送 1 次：

> 想邀请你做一次约 10 分钟的 AI Native Helpdesk 安装试跑。范围只有：在你显式选择的临时目录安装、验证两张已批准公开卡、确认一个不适用问题保持 MISS，然后可恢复卸载。不会读取群聊、凭证、用户目录或你的业务问题；只记录匿名 P1、OS／架构／Node major、稳定状态码、card ID／revision、hash 和步骤完成状态。你可以拒绝或随时撤回，拒绝后不会再次邀请。若你同意，请先回复“同意 G14-A 最小化试跑”，并确认环境是否为 macOS arm64、Node.js 24。

没有明确同意时，状态写 `NO_CONSENT` 并停止；不得发送 artifact。

## 2. 同意与环境门

私密控制面只登记：

- 匿名 ID `P1`；
- 明确同意的时间与不可逆 hash；
- `macOS / arm64 / Node.js 24` 是否同时满足；
- artifact 是否在同意后传递。

真实姓名、联系方式和同意原文不得进入公开 Git。环境任一项不匹配时写 `ENVIRONMENT_NOT_VERIFIED` 并停止，不尝试兼容性修复。

## 3. Artifact 读回

P1 收到压缩包后，先校验 SHA-256。结果必须精确为：

```text
544cae157075dd71b1c0c74395ba54f4420d4b5f96dd7d8c568ca4e7e20ec7c8
```

解压后把 `ai-native-helpdesk-g14-p1` 目录作为 `PACKAGE_ROOT`。由 P1 显式选择 fresh `TARGET_ROOT` 和位于 target 外的私密 `STATE_FILE`：

```bash
node "$PACKAGE_ROOT/scripts/manage-install.mjs" install \
  --source "$PACKAGE_ROOT" \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"

node "$TARGET_ROOT/scripts/manage-install.mjs" verify \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

任何非 `INSTALLED / OK` 或 `VERIFIED / OK` 结果都立即停止；不继续查询。

## 4. 固定三次查询

只能从安装后的 target 运行：

```bash
node "$TARGET_ROOT/scripts/query-public-card.mjs" \
  --query "写进 AGENTS.md 的规则，怎样确认在 Codex 中生效？"

node "$TARGET_ROOT/scripts/query-public-card.mjs" \
  --query "怎样让 OpenClaw Agent 形成受控自迭代闭环？"

node "$TARGET_ROOT/scripts/query-public-card.mjs" \
  --query "怎样训练 OpenClaw 的模型权重？"
```

精确预期：

| 顺序 | 预期 |
|---|---|
| 1 | `ALLOW / AIHD-PC-000001 / 1.1.0` |
| 2 | `ALLOW / AIHD-PC-000004 / 1.0.0` |
| 3 | `MISS / NO_MATCH` |

出现 `DENY`、预期 ALLOW 变 MISS、近邻错误 ALLOW 或任何正文外泄迹象，立即写 `TRIAL_FAIL` 并停止。

## 5. 可恢复卸载

```bash
node "$TARGET_ROOT/scripts/manage-install.mjs" uninstall \
  --target "$TARGET_ROOT" \
  --state "$STATE_FILE"
```

必须同时观察：`UNINSTALLED / OK`、target 不存在、recoverable copy 存在、state 可读。不得删除 recoverable copy；由 P1 在试跑收据确认后自行决定是否保留。

## 6. 最小结果格式

公开面只允许投影以下字段：

```json
{
  "participant_id": "P1",
  "consent": "OBSERVED",
  "environment": "MACOS_ARM64_NODE_24",
  "artifact_sha256_match": true,
  "install": "PASS",
  "verify": "PASS",
  "card_000001": "ALLOW",
  "card_000004": "ALLOW",
  "model_weight_nearby": "MISS",
  "uninstall": "PASS",
  "confusion_tag": "NONE",
  "withdrawn": false
}
```

`confusion_tag` 只允许 `NONE / ARCHIVE_CHECK / PATH_SETUP / NODE_VERSION / INSTALL_OUTPUT / QUERY_OUTPUT / UNINSTALL_OUTPUT`。不收集自由文本业务问题，不把礼貌反馈记为 `ADOPTED` 或效果。
