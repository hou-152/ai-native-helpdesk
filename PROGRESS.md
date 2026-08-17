# 受控阶段进度

## Phase 3 schema B 与知识生产（2026-08-18）

- Owner 已按推荐通过 G11，本地分支从 `441fffadc0771172d6e305ab4d576ebc058cbf51` 进入 `codex/phase3-knowledge-production`。
- `c384a664633736ff54a5adfc6aa7cb1023397c4c` 先冻结执行包、首批 3 张清单、100% 人工 QA、负向门和 G12 停点。
- PublicCard schema 已迁移到 B／`0.4`：新增安全 scope、判断框架、常见错误、行动原则和验证方法；index 新增 revision、完整文件 hash 和 scope 绑定。
- 普通 Candidate 与 `MISS` 反馈使用两条独立生产门；单次 MISS、ACKNOWLEDGED、未获批 Candidate、未人工提炼和机器结构 PASS 均不能自动晋级。
- 首批候选固定为 000001 schema 迁移、000002 Codex 权限边界、000003 OpenClaw Gateway 健康检查；两张新卡只用公开官方来源，当前均为 `PENDING_G12`。
- 正式公共 index 保持 1 张卡；候选投影在 G12 前确定性返回 `HOLD`。
- 全量测试当前为 `144／144 PASS`，0 fail／cancelled／skipped／todo。候选三卡测试是本地 candidate projection 证据，不是已发布真实三卡验收。
- 当前停点：准备 G12 包，等待 Owner 对 schema、rubric、实际清单和每张卡做 100% 人工 QA／发布决定；未经 G12 不进入 Phase 4。

## Phase 1 v2 召回复验（2026-08-18）

- Owner 选择 G10-A 后，v1 全部文件保持 byte-identical；旧 BLIND 明确降级为 `OBSERVED_REGRESSION`，没有被重写成新盲测。
- `1182bd6` 先冻结 v2 协议和 commit-seeded holdout 生成规范；`573cc1c` 后冻结算法、阈值和实现，此时还不存在实际 holdout。
- combined 方案在 60 条已观察回归上形成 `0.175681` 正负间隔：单候选 30／30、exact 26／30、歧义 7／7、MISS 假阳性 0／17、DENY 6／6。
- 绑定 `573cc1c` 后生成 30 条唯一 synthetic holdout；combined 首次结果为单候选 15／15、exact 11／15、歧义 6／6、MISS 假阳性 0／6、hard-negative 假阳性 0／5、DENY 3／3。
- 机械 front runner：`bm25_expansion_keyword@0.8449460370411592 / top_k=3`。该段记录当时的 `AWAITING_G10_OWNER_APPROVAL`；后续 G10、G11 已由 Owner 通过。

## Phase 1 召回评测（2026-08-18）

- G0—G9 已由 Owner 通过；Phase 0 已闭环，PR #3／#4 已关闭但未合并。
- 先在 `80732aa` 冻结 60 条黄金集（DESIGN 40／BLIND 20），再在 `7cfe6a8` 提交四种召回实现、设计报告和阈值；之后才执行 BLIND。
- 完整回归为 72／72 PASS；召回只返回 G5 白名单元数据，DENY／注入／隐私／drift 均在召回前 fail-closed。
- BM25 的 BLIND 单候选召回为 9／10，MISS／hard-negative 假阳性均为 0，DENY 旁路 100%；但歧义全覆盖仅 1／3，未达到冻结门槛 2／3。
- v1 状态：`HOLD_AT_G10`。Owner 随后选择 G10-A 并授权 v2；该段保留 v1 历史结果，不代表当前 G10 状态。

## 开工回执

- 目标：只让四门精确通过的 PublicCard 正文进入模型。
- 顺序：冻结基线 → 建 schema／门禁 → 接入 Skill → 测试 → 反向验证 → 推送功能分支。
- 基线：`main@5b6e492ff0938cac03212762943e57f1e01d12c9`，8 个跟踪文件，工作树干净。
- 实现边界：只建门和空公开知识包，不发布任何真实知识卡。
- 最大风险：先读后判导致被拒正文或敏感 canary 泄露。
- 次要风险：社区包路径越界、同问题多卡冲突、文档绕过加载器。

## 已完成

- 任务 0：基线、Node `v24.15.0` 和 4 个保护文件 SHA 核对通过。
- 任务 1：严格 schema、空公共索引和“先判状态、后暴露正文”脚本完成。
- 任务 2：README、入口与 knowledge contract 已接入唯一加载路径，版本为 `0.3.0-gate-trial`。
- 任务 3：canonical `node --check` 通过；`node --test` 为 61／61，fail／cancelled／skipped／todo 均为 0。
- 独立终审：白名单、保护 SHA、0 张真实卡、路径／隐私／schema／状态门均通过；未发现新的可复现高风险阻断项。

## 等价镜像反向证明

- 方法：用 `rsync -a --exclude=.git` 复制当前工作树到新建系统临时目录；`diff -qr --exclude=.git` exit 0。
- 关键文件在 canonical 与镜像中的 SHA-256 分别相同：脚本 `e7d598625a8daaea1ace51d66b57bf5d842ebc6c0ab0574a9ddd7dd58d82bd78`；schema `40779ff9c0a97d0fbb574d9d2951f002b0eeb36b6d6775a1993a4287282e31a2`；测试 `855dae20bca585a7b9da6ff8953a90e80a8b8b199390b318e981f5abb7570a10`；空索引 `87b2650aa05656a31e54d1a49740cf00421dc3124aae16f85ec8ad22950c6132`。
- 破坏前镜像：exit 0；61 tests／61 pass，其余全 0。
- 唯一破坏：把 `card[key] !== expectedValue` 改为 `key !== "editorial" && card[key] !== expectedValue`，仅放宽 editorial 门。
- 破坏后镜像：exit 1；预定测试 `non-exact gate editorial is denied` 变红；60 pass／1 fail，其余全 0；不是语法、导入、路径或 fixture 故障。
- 镜像已移出活动临时目录并放入系统废纸篓，可恢复；canonical 未被破坏。

## Git 交付边界

- 变更只允许进入 `codex/v0.3-publication-gate`；禁止直接推送或合并 `main`。
- 本文件不自写提交 SHA 或远端 SHA，避免回执修改自身；最终一致性由仓库外的 `git ls-remote --heads` 结果证明。
- 首次推送被 GitHub Push Protection 拒绝：合成测试使用了完整供应商 token 形状。它不是真凭证，但仍已换成明确的非供应商 fixture；交付分支从原 `main` 生成干净历史，不绕过保护。
