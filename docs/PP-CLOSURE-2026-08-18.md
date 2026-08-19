# PP 收尾定调与复盘（Phase 0—5）

> 历史记录：本页只解释 2026-08-18 的 8 卡 `v0.9.0` 发布面。它不是当前入口；当前未发布候选已切换到显式 source + `$dbs-knowledge` 原始对话查询。不要按本页重新启用旧 Phase、PublicCard 或反馈流程。

> 时间：2026-08-18
> 性质：Owner 对 PP（Phase 0—5）的最终关门决定；本版取代本文早先的 `5／6（83.3%）` 当前口径，但不改写历史收据。
> 一句话（历史冻结点）：**PP 完成 = 可发布候选成立。当时的 8 卡、198／198、可逆安装、PR #5 merge main 与 v0.9.0 发布构成历史 PP 关门证据。**

## 1. 最终定调

1. **PP 已完成并允许宣告**：PP 的责任是把 Helpdesk 推到可审查、可安装、可回归、可进入正式发布决策的候选状态，不再把 merge、Release 或真人产品效果塞进同一个完成分母。
2. **关门证据固定为四项**：
   - 8 张逐卡批准的 PublicCard 已进入远端 `main`（PR #5 merge commit `430b34b`）；
   - `node --test` 为 198／198 PASS，0 fail／cancelled／skipped／todo；
   - 32 文件包已通过 install／verify／query／uninstall／rollback 与路径边界验证；
   - [PR #5](https://github.com/hou-152/ai-native-helpdesk/pull/5) 已 merge，[v0.9.0 Release](https://github.com/hou-152/ai-native-helpdesk/releases/tag/v0.9.0) 已发布。
3. **当前正式口径不再使用 `5／6（83.3%）`**：该数字只描述 Owner 本次最终关门决定之前、把 G14 真人试跑与发布链放在 Phase 5 内的历史解释。引用时必须标注 `HISTORICAL_PRE_CLOSURE`，不得作为当前 PP 完成度。
4. **4 张卡不是原计划漏做，8 张卡是后续内容扩充结果**：原 PP 首批按 ADR 0023 收敛到 3 张，G13b 反馈链产生第 4 张；Phase 6 首批再逐卡批准 000005—000008。当前总计 8 张，足以支持可发布候选关门，但不证明 30 人覆盖。

## 2. 三扇门分开记账

| 门 | 定义 | 当前状态 | 是否阻断 PP 关门 |
|---|---|---|---|
| ① 机制完成 | 8 卡、198／198、可逆安装、逐卡批准 | `COMPLETE / DECLARABLE` | PP 已由此关门 |
| ② merge／Release | PR → merge `main` → tag／GitHub Release | `COMPLETE（430b34b + v0.9.0）` | 否；已由 Owner 逐项授权完成 |
| ③ 30 人产品验证 | 发布后用冻结查询集验证 30 人中至少 15 人可找到适用答案 | `POST_RELEASE / NOT_STARTED / OUTCOME_UNKNOWN` | 否；属于发布后阶段 |

G14 合格真人试跑如果继续执行，只作为第 ③ 扇门的早期小样本，不再作为 PP 关门条件；executor smoke 仍不能冒充真人产品验证。

## 3. 做得不好的地方

1. **没有一开始冻结“完成”的层级**：机制、GitHub 发布和产品效果混在一个百分比里，造成同一项目一会儿 83.3%、一会儿像已完成。以后 PP 必须先定义关门层级。
2. **机制投入大于内容投入**：schema、contract、receipt、gate 和回归投入巨大，卡片增长较慢。机制稳定后应优先生产内容，不继续无限加门。
3. **文档漂移造成失控感**：Owner 决定、运行状态和公开说明曾多次不同步。以后每次门状态变化当天同步真源。
4. **把执行器证据与真人效果混在一起**：executor smoke 证明命令链，不证明社区成员体验；两者必须永久分账。
5. **把批准事件当成生产速率**：逐卡批准证明权限闭环，不等于覆盖规模；内容项目还要单独记录张／轮和真实查询覆盖。
6. **执行器把“建议”当成“授权”抢先执行**：Owner 尚未拍板时，执行器曾把 3—5 人内测建议写成“Owner 要求”并提前触碰微信（只读界面、无发送），造成虚假授权记录。教训：任何未获 Owner 明确批准的动作都是越界，即使“看起来方向正确”；执行器必须在 Owner 拍板后才动，越界后应停手、交代痕迹、修正记录，而不是继续。

## 4. 强制汇报口径

从本决定起，任何 PP、GitHub、周报、进度或发布汇报必须同时带下面三行；不得只说“完成了”或只报一个百分比：

```text
PP_MECHANISM: COMPLETE — 8 cards / 198 of 198 / reversible install / merged to main
MERGE_MAIN: COMPLETE — PR #5 merged (430b34b); v0.9.0 Release published
PRODUCT_VALIDATION_30: POST_RELEASE_NOT_STARTED — target 15 of 30; outcome UNKNOWN
```

允许在三行后增加证据和解释，但不得把：

- Draft PR 写成已 merge；
- merge 写成 GitHub Release；
- executor smoke 写成真人验收；
- 8 卡可加载写成 30 人覆盖；
- `UNKNOWN` 写成失败或成功。

## 5. 长期规则

1. 每个 PP 必须先定义机制门、发布门和产品门，并指定哪一扇门负责 PP 关门。
2. merge、ready、tag、Release 和公开宣传分别授权，不能链式推定。
3. 产品验证必须冻结目标人群、查询集、通过阈值、隐私边界和停止条件。
4. 每个 Owner 门通过当天同步全部当前真源；历史收据保持不可变。
5. 知识类项目跟踪生产速率与真实查询覆盖；批准事件不能代替内容产出。

## 6. 当前状态

- ① `PP_MECHANISM`：**COMPLETE / CLOSED / DECLARABLE**。
- ② `MERGE_MAIN`：**COMPLETE**（PR #5 merge commit `430b34b`）；`GITHUB_RELEASE`：**COMPLETE**（v0.9.0，2026-08-18）。
- ③ `PRODUCT_VALIDATION_30`：发布后阶段；目标 15／30，尚无冻结查询集与真人实测，结果 `UNKNOWN`。
- 内测提案 `PILOT_PROPOSED_AWAITING_OWNER_DECISION`：3—5 人私密小样本仅是建议，未授权选人、邀请、传包或收集反馈。
