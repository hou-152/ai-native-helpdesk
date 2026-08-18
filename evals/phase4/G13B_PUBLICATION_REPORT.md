# G13b 第四张卡正式投影报告

日期：2026-08-18

状态：`G13B_APPROVED / LOCAL_FORMAL_LOOP_COMPLETE`

## 结论

Owner 已逐项批准 `AC-G13A-20260818-001 → AIHD-PC-000004 v1.0.0` 作为 `NEW_CARD` 正式投影；无修订、无撤回。候选与正式卡 byte-identical，正式 index 已扩为 4 项，正式 loader 对标准问题与公开安全 alias 返回 `ALLOW`。

私密反馈账本已追加正式发布决定、index 成功与 loader `ALLOW` 三个事件；当前共 10 个事件、1 条 chain，hash 链复验通过，`real_loop_complete = true`、`serving_eligible = true`。

这是本地功能分支的正式公共包状态，不等于已 push、已进入远端 `main`、已完成社区试跑或已证明用户执行效果。

## 精确投影

| 项目 | 值 |
|---|---|
| action | `NEW_CARD` |
| card | `AIHD-PC-000004` |
| revision | `1.0.0` |
| content SHA-256 | `7f69a420bb9fa774d935ab289859df508f45241fcb42c206cb5d83a7ce1720c6` |
| candidate／formal | byte-identical |
| four gates | `APPROVED / PASS / PASS / READY` |
| formal index SHA-256 | `792301b0219db84d80e6eefae8e10fd7323a53f61fbdb4437ef24215b11c6b31` |
| formal index count | 4 |
| formal loader | `ALLOW / OK` |

## 回归

- 历史 G12 三卡 revision、hash 与 15 条 observed acceptance regression 保持通过。
- 第四张卡标准问题与公开安全 alias 均 `ALLOW`。
- 模型权重训练近邻保持 `MISS`，没有越过 `not_for`。
- 无关问题保持 `MISS`。
- 全量测试：184／184 PASS；0 fail／cancelled／skipped／todo。

## 状态边界

- 本地 branch：正式四卡包。
- 远端 `main`：仍为 1 张卡。
- push／PR／merge：未授权、未执行。
- 用户执行效果：`UNKNOWN`；本轮只有 `ADOPTED`。
- Phase 5：G13b 后置条件已满足，可以开始。
- 外部社区触达：仍需 G14。
