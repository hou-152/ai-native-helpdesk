# 受控阶段进度

## Phase 5 本地工程验收与 G14 停点（2026-08-18）

- `c8ace8a25a7e8663d41816f97e60304f6f763201` 完成运行路径解耦、标准 Apache 2.0、28 文件 release allowlist，以及显式 target／state 的 install、verify、uninstall 和 rollback。
- 最终字节从与源码无关的 cwd 安装到含空格的隔离路径；`AIHD-PC-000001 v1.1.0`、`AIHD-PC-000004 v1.0.0` 均为 `ALLOW`，模型权重训练近邻保持 `MISS / NO_MATCH`。
- fresh uninstall 后目标消失，安装包移动到可恢复目录，state 为 0600 普通文件；pre-existing target rollback 恢复 sentinel 原始字节。
- 反向门覆盖安装卡片 byte drift、目标软链、state 软链，以及旧目标已备份后注入 state 写入失败的自动恢复。
- 全量测试 192／192 PASS；0 fail／cancelled／skipped／todo。Linux、Windows 和其他 Node major 保持 `NOT_VERIFIED`。
- 当前状态：`ENGINEERING_ACCEPTANCE_PASS_AWAITING_G14`。没有触达社区、传递试跑包、push、开 PR 或 merge；G14 决策包只推荐 1 次、1 人、先同意后试跑的最小范围。

## G13b 第四张卡正式投影（2026-08-18）

- Owner 已批准 `AC-G13A-20260818-001 → AIHD-PC-000004 v1.0.0` 作为 `NEW_CARD` 正式发布；无修订、无撤回。
- 正式卡与 G13b 候选 byte-identical；正式 index 扩为 4 项并绑定 revision、content hash、question、aliases 和 scope。
- 标准问题与公开安全 alias 的正式 loader 均返回 `ALLOW`；模型权重训练近邻与无关问题保持 `MISS`。
- 私密账本追加正式 publication／index／ALLOW 三个事件；共 10 个事件，`real_loop_complete = true`、`serving_eligible = true`。
- 全量测试 184／184 PASS；0 fail／cancelled／skipped／todo。
- 当前状态：`G13B_APPROVED_LOCAL_FORMAL_LOOP_COMPLETE / PHASE5_READY`；尚未 push、开 PR、merge 或触达外部社区。

## G13a 真实反馈隔离闭环（2026-08-18）

- G13a 授权的 1 用户／1 问题已经实际运行；正式三卡查询为 `MISS / NO_MATCH`，因此按合同记录最小化 `DEMAND_GAP`。
- 同一真实用户随后正向采用回答路径，记录为 `ADOPTED`；没有声明已经执行或产生客观效果。
- 生成 1 个 `ANSWER_CANDIDATE`，完成人工提炼与 staging 四门预审；候选正文、原问句、反馈原文和私密 ledger 均留在公开仓库外。
- 隔离候选 pack 的 index 结构复验通过，后续 loader 实际返回 `ALLOW`；正式公共包对同义查询仍为 `MISS`。
- ledger 7 个事件、1 条 chain，hash 链复验通过；`isolated_real_loop_complete = true`，正式 `real_loop_complete = false`。
- 当前状态：`AWAITING_G13B_OWNER_DECISION`。正式 PublicCard／index 未改变，Phase 5、push、PR、merge 和外部社区触达均未开始。

## G13a 受控真实反馈采集授权（2026-08-18）

- Owner 已授权 Phase 4B 使用 1 个真实用户的 1 个真实 AI／Agent／OpenClaw 问题运行当前 Helpdesk；当前 Owner 可以作为该用户。
- 新增 G13a 执行包和机器可读授权收据；v0.3.2 修复 Phase 4／5 启动死锁，但不降低真实证据门。
- 必须先收到明确纳入本轮的 Helpdesk turn，再实际运行正式三卡查询；只有真实 `MISS` 才能记录 `DEMAND_GAP`。
- 当前工程讨论、测试 fixture、Owner 批准和模型自评没有被追溯改写为反馈；目前没有实际查询、私密 ledger 事件或 `ANSWER_CANDIDATE`。
- 复核发现旧 ledger 只有 Owner 正式批准后才能产生 index／ALLOW，与 G13b 前隔离完整 rehearsal 冲突；现新增 3 类 staging 事件与独立状态，隔离 ALLOW 不再污染正式发布／服务状态。
- staging 正反测试覆盖：真实反馈链可完成隔离 rehearsal、失败门不得索引、不得伪造 G13b 或移除隔离、反馈更正会撤销 staged ALLOW；Phase 4 定向测试增至 23 项。
- 本段是采集前授权状态；后续真实隔离闭环已经完成，当前状态见上方新段落。G13b、Phase 5 与外部社区触达仍未开启。

## Phase 4 MISS 反馈回路（2026-08-18）

- `ad83908753412231ee1790dbf4abec3f2d80e664` 在实现前冻结 11 类事件、反馈等级、hash-chain、状态回滚、文件白名单与无真实反馈停止条件。
- `4a77398f0d28f1dc316bee3840fdf8553921f1e4` 实现事件 schema、追加式账本与首轮正反测试；`54ccc1419d73149a730525f466cefd3799662568` 阻断回滚后的静默重新索引和软链事件输入。
- 新增公开仓库外受控使用的追加式 ledger；事件顺序绑定上一 hash，更正只能新增 `CORRECTION`，CLI 不回显 payload。
- `ACKNOWLEDGED`、无反馈模型答案、原回答直灌、客观效果漂白和无人工提炼均不能生成有效候选。
- 新卡完整虚构机制链、既有卡修订、撤回、验证失败、过期、索引失败、反馈更正、篡改与跨链引用均有正反测试。
- Phase 4 定向测试 19／19 PASS；全量测试 174／174 PASS，0 fail／cancelled／skipped／todo。
- 授权项目收据中没有可复跑的真实 `ADOPTED / OUTCOME_REPORTED` 反馈；没有生成真实 `ANSWER_CANDIDATE`，也没有修改正式三卡或 index。
- 本段记录 G13a 之前的停止状态；后续授权和当前状态见上方 G13a 段落。

## G12 正式三卡投影（2026-08-18）

- Owner 已批准 schema B、QA rubric、首批 000001／000002／000003，并逐卡批准 000001 v1.1.0、000002 v1.0.0、000003 v1.0.0 发布。
- 当前本地功能分支的正式公共 index 包含 3 张卡；index 与 G12 收据同时绑定 revision、完整文件 SHA-256 和安全 scope。
- 000002／000003 的正式正文逐字段保持已批准候选投影；历史 `PENDING_G12` 收据保持不可变，仍然返回 `HOLD`。
- 真实三卡观察回归为 15／15 PASS：需精确集合、歧义覆盖、预召回绕过和安全输出均为 100%；MISS、hard-negative 和跨域假阳性均为 0。
- `REAL-R09` 保留一条可见宽召回：000002 目标卡命中时也召回 000001；该路径必须在 loader 前经过 applicability 裁决，不声称 exact-set 成功。
- 当前状态只表示本地正式公共包通过；尚未 push、建立 PR、合并远端 `main` 或完成真实社区端到端验证。
- G12 后置条件已完成，可以进入 Phase 4。

## Phase 3 schema B 与知识生产（2026-08-18）

- Owner 已按推荐通过 G11，本地分支从 `441fffadc0771172d6e305ab4d576ebc058cbf51` 进入 `codex/phase3-knowledge-production`。
- `c384a664633736ff54a5adfc6aa7cb1023397c4c` 先冻结执行包、首批 3 张清单、100% 人工 QA、负向门和 G12 停点。
- PublicCard schema 已迁移到 B／`0.4`：新增安全 scope、判断框架、常见错误、行动原则和验证方法；index 新增 revision、完整文件 hash 和 scope 绑定。
- 普通 Candidate 与 `MISS` 反馈使用两条独立生产门；单次 MISS、ACKNOWLEDGED、未获批 Candidate、未人工提炼和机器结构 PASS 均不能自动晋级。
- 首批候选固定为 000001 schema 迁移、000002 Codex 权限边界、000003 OpenClaw Gateway 健康检查；两张新卡只用公开官方来源，当前均为 `PENDING_G12`。
- 正式公共 index 保持 1 张卡；候选投影在 G12 前确定性返回 `HOLD`。
- 全量测试当前为 `144／144 PASS`，0 fail／cancelled／skipped／todo。候选三卡测试是本地 candidate projection 证据，不是已发布真实三卡验收。
- 本段保留 G12 前历史状态。Owner 后续已通过 G12，实际投影和回归结果见上方新段落。

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
