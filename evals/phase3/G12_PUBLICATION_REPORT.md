# G12 正式三卡投影与错配回归报告

日期：2026-08-18

## 结论

Owner 已批准 schema B、QA rubric、首批 000001／000002／000003 和三张指定 revision 的逐卡发布。本地功能分支已形成三卡正式公共包，确定性 loader 与真实卡错配回归通过，可以进入 Phase 4。

本报告的“发布”只表示卡片已进入当前本地分支的正式公共 index；不表示已经 push、建立 PR、合并到远端 `main`、完成社区试跑或产生用户效果。

## 投影收据

| PublicCard | revision | 完整文件 SHA-256 | G12 四门 |
|---|---:|---|---|
| `AIHD-PC-000001` | `1.1.0` | `ca26a3c3d41768ecc9d7e5b9a85a2fcb9e49244d1e8a089d2762fde5834cec6a` | 通过 |
| `AIHD-PC-000002` | `1.0.0` | `a0bad2ec48760eac38bb1efb48b6e5fc992dd28f16f03cfcb7fd81378a65864e` | 通过 |
| `AIHD-PC-000003` | `1.0.0` | `284483b32305b1e869364c8904f92336602016b2c5d9550ed3a34c29c4ef796a` | 通过 |

000002／000003 的正式正文逐字段保持 G12 候选中的 `proposed_public_fields`；正式投影只增加四门状态。index 绑定 revision、完整文件 hash 和安全 scope。

## 真实卡错配回归

- 数据：15 条观察后验收用例，包括 7 条候选、2 条歧义、4 条 MISS／hard-negative 和 2 条预召回缺语境。
- 结果：15／15 通过；目标命中、需精确集合、歧义全覆盖、预召回绕过和安全输出均为 100%。
- 负向：MISS 假阳性、hard-negative 假阳性和跨域假阳性均为 0。
- 限制：`REAL-R09` 的 Codex 权限问法同时召回 000002 与 000001。该用例只要求覆盖目标卡，并强制在 loader 前做 applicability 裁决；它不计为精确集合成功。

## 停点与授权边界

- Phase 3 的 G12 后置条件已完成，可以进入 Phase 4。
- 本收据不授权 push、PR、merge、第四张卡、192 类私域候选批量晋级或真实社区试跑。
- 回归是 `OBSERVED_ACCEPTANCE_REGRESSION`，不是新盲测，也不证明卡片内容对所有用户正确。
