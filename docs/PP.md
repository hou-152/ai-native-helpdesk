# AI Native Helpdesk Phase & Plan 当前总览

更新时间：2026-08-18

本页是公开 GitHub 仓库中的唯一 PP 当前控制页。详细机制、历史报告和追加式收据保留在 `evals/` 与 `PROGRESS.md`；它们提供证据，但不与本页争夺“现在推进到哪里”的解释权。

> 收尾定调与复盘（2026-08-18）：PP 0—5 的完成定义是 A（机制验证），B（知识规模化）是下一轮 Phase 6——见 [`docs/PP-CLOSURE-2026-08-18.md`](PP-CLOSURE-2026-08-18.md)。

## 一句话状态

PP 0—5 按原 6 个 Phase 的严格关门口径仍完成 `5／6`，即 `83.3%`：Phase 5 仍缺 G14 真人社区试跑与正式 GitHub 发布链。独立的知识规模化 Phase 6 首批已经完成 4 张新增卡的逐卡人工 QA、8 卡功能分支投影、loader、观察错配、全量回归和 push；[Draft PR #5](https://github.com/hou-152/ai-native-helpdesk/pull/5) 已打开。

## Phase 状态

| Phase | 状态 | 已完成证据 | 剩余动作 |
|---|---|---|---|
| Phase 0 | `COMPLETE` | G0—G9 Owner 决策与边界冻结 | 无 |
| Phase 1 | `COMPLETE` | G10 召回方案、observed／holdout 回归 | 无 |
| Phase 2 | `COMPLETE_LOCAL` | G11 回合合同与外部来源门 | 进入 `main` 后再声明远端能力 |
| Phase 3 | `COMPLETE_LOCAL` | G12 schema B、100% QA、前三卡 | 进入 `main` 后再声明远端能力 |
| Phase 4 | `COMPLETE_LOCAL` | G13a 真实反馈链、G13b 第四卡 | 进入 `main` 后再声明远端能力 |
| Phase 5 | `PARTIAL_RELEASE_PENDING` | Apache 2.0、28 文件包、install／verify／uninstall／rollback、192／192、executor smoke、功能分支 push、Draft PR #5 | G14 合格真人社区试跑未开始；merge `main`、tag／Release 尚未完成 |

Phase 6 不回写原 PP 0—5 的分母。当前状态为 `REMOTE_EIGHT_CARD_PACK_COMPLETE / DRAFT_PR_OPEN`：000005—000008 v1.0.0 已逐卡获批，8 卡 loader 的 41 个 question／alias 全部命中正确卡，25／25 观察错配回归与 198／198 全量测试通过；30 人产品覆盖仍为 `UNKNOWN`。

## 当前 GitHub 层级

```text
远端功能分支：8 卡，已 push
→ G14 真人社区试跑：未开始；executor smoke 不能替代
→ PR #5：DRAFT／OPEN
→ merge main：未完成
→ tag／GitHub Release：未完成
→ 社区正式可用声明：未授权
```

功能分支：`codex/phase5-install-release`

远端 `main` 当前仍只有原试运行卡；远端功能分支已经包含 G12 批准的前三张卡、G13b 批准的第四张卡和 Phase 6 批准的 000005—000008，形成 8 卡包。它尚未进入 PR 或 `main`，不能写成 GitHub 正式发布。

## 当前“能用”与“发布”的准确含义

- `能用`：历史 G14 artifact 在 macOS arm64／Node.js 24 范围已有安装生命周期、两卡 ALLOW、近邻 MISS 和可恢复卸载证据；当前功能分支 8 卡包另通过 32 文件安装、loader 与回归。
- `未证明`：Linux、Windows、其他 Node major、合格真人独立使用和普遍社区效果。
- `已上传 GitHub`：8 卡实现与聚合证据已经进入远端功能分支；尚未进入 `main`。
- `尚未正式发布`：Draft PR #5 已打开，但没有 merge `main`、tag 或 GitHub Release。

## 唯一剩余推进路径

1. 当前停点为 Draft PR #5；文件、提交、mergeability、checks 与 review 以 GitHub PR 页面实时状态为准，空 checks 不表述为“全部通过”。
2. 第二云端执行体的可选测评由 Owner 自行管理；本项目不主动恢复或追踪，也不把它计作 G14 真人证据。
3. 按已批准的 G14-A，指定 1 名可明确同意和撤回的合格真人社区成员，完成固定范围试跑；失败即停。
4. Owner 审阅 PR，并另行决定是否将 Draft 转为 ready 以及是否 merge；两项授权不能互相替代。
5. Owner 明确授权 merge 后，重新运行 loader 与全量回归；tag／GitHub Release 和对外表述另行决定。

## 公开边界

本仓库只上传运行代码、contracts、schema、公开 PublicCard、公开文档、测试和聚合收据。私密身份、原始反馈、ledger、候选正文、群聊、凭证、本机路径和控制面原文不上传 GitHub。
