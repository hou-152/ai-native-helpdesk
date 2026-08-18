# AI Native Helpdesk Phase & Plan 当前总览

更新时间：2026-08-18

本页是公开 GitHub 仓库中的唯一 PP 当前控制页。详细机制、历史报告和追加式收据保留在 `evals/` 与 `PROGRESS.md`；它们提供证据，但不与本页争夺“现在推进到哪里”的解释权。

> Owner 最终关门决定：PP 完成 = 可发布候选成立。完整定义与强制三门口径见 [`docs/PP-CLOSURE-2026-08-18.md`](PP-CLOSURE-2026-08-18.md)。

## 一句话状态

**PP 已完成并正式关门**：8 张逐卡批准 PublicCard、198／198 全量回归、可逆安装，并已通过 [PR #5](https://github.com/hou-152/ai-native-helpdesk/pull/5) merge 到远端 `main`。tag／GitHub Release 与 30 人产品验证分别记账，不回退 PP 完成状态。

## Phase 状态

| Phase | 当前 PP 状态 | 关门证据 | PP 内剩余动作 |
|---|---|---|---|
| Phase 0 | `COMPLETE` | G0—G9 Owner 决策与边界冻结 | 无 |
| Phase 1 | `COMPLETE` | G10 召回方案、observed／holdout 回归 | 无 |
| Phase 2 | `COMPLETE` | G11 回合合同与外部来源门 | 无；进入 `main` 属发布门 |
| Phase 3 | `COMPLETE` | G12 schema B、100% QA、前三卡 | 无；进入 `main` 属发布门 |
| Phase 4 | `COMPLETE` | G13a 真实反馈链、G13b 第四卡 | 无；真人效果属产品门 |
| Phase 5 | `COMPLETE_MERGED` | Apache 2.0、可逆安装、8 卡、198／198、PR #5 已 merge `main` | 无；PP 正式关门 |

Phase 6 首批内容扩充不回写原 Phase 0—5 的分母：000005—000008 v1.0.0 已逐卡获批，总 index 为 8；41 个 question／alias 全部命中正确卡，25／25 观察错配回归通过。它支持可发布候选成立，但不证明 30 人覆盖。

## 三扇门

| 门 | 当前状态 | 下一授权或验证 |
|---|---|---|
| ① PP 机制完成 | `COMPLETE / CLOSED / DECLARABLE` | 无；任何汇报可以宣告 PP 完成 |
| ② merge | `COMPLETE (PR #5 → main 430b34b)` | 无；已合并 |
| ②′ tag／GitHub Release | `NOT_STARTED / PENDING_OWNER_AUTHORIZATION` | tag、Release 分别授权 |
| ③ 30 人产品验证 | `POST_RELEASE / NOT_STARTED / OUTCOME_UNKNOWN` | 发布后冻结查询集，验证至少 15／30 可找到适用答案 |

旧 `5／6（83.3%）` 仅为本次 Owner 最终关门之前的 `HISTORICAL_PRE_CLOSURE` 口径，不得再用于当前 PP 完成度。

## 当前 GitHub 层级

```text
PP 可发布候选：COMPLETE
→ 远端功能分支：8 卡
→ PR #5：DRAFT／OPEN
→ merge main：未授权／未完成
→ tag／GitHub Release：未授权／未完成
→ 30 人产品验证：发布后、未开始、结果 UNKNOWN
```

远端 `main` 已通过 PR #5 合并 8 卡（merge commit `430b34b`）。merge 不等于 GitHub Release，8 卡可加载不等于社区产品效果。

## 当前“能用”与“发布”的准确含义

- `可发布候选成立`：8 卡、198／198、32 文件可逆安装、逐卡 Owner 批准。
- `已 merge main`：8 卡实现与聚合证据已通过 PR #5 进入远端 `main`（`430b34b`）。
- `尚未正式发布`：tag 与 GitHub Release 尚未创建；30 人产品验证未开始。
- `产品效果未知`：Linux、Windows、其他 Node major、合格真人独立使用和 30 人覆盖尚未验证。

## 关门后的独立推进线

1. PR #5 的文件、提交、mergeability、checks 与 review 以 GitHub 页面实时状态为准；空 checks 不表述为“全部通过”。
2. Owner 分别决定是否将 Draft 转为 ready、是否 merge、是否 tag／GitHub Release。
3. 发布后另开 30 人产品验证，冻结查询集、通过阈值、隐私边界和停止条件；G14 小样本若继续，只算这一阶段的早期证据。
4. 第二云端执行体仍由 Owner 自行管理，不自动计入真人产品验证。

## 强制汇报格式

```text
PP_MECHANISM: COMPLETE — 8 cards / 198 of 198 / reversible install / merged to main
MERGE_MAIN: COMPLETE — PR #5 merged (430b34b); tag and GitHub Release pending separate Owner authorization
PRODUCT_VALIDATION_30: POST_RELEASE_NOT_STARTED — target 15 of 30; outcome UNKNOWN
```

任何当前汇报必须同时给出三行。不能用一个“完成／未完成”或单一百分比代替三扇门。

## 公开边界

本仓库只上传运行代码、contracts、schema、公开 PublicCard、公开文档、测试和聚合收据。私密身份、原始反馈、ledger、候选正文、群聊、凭证、本机路径和控制面原文不上传 GitHub。
