# v0.3 发布门进度

## v0.3.0 历史开工回执

- 目标：只让四门精确通过的 PublicCard 正文进入模型。
- 顺序：冻结基线 → 建 schema／门禁 → 接入 Skill → 测试 → 反向验证 → 推送功能分支。
- 基线：`main@5b6e492ff0938cac03212762943e57f1e01d12c9`，8 个跟踪文件，工作树干净。
- 实现边界：只建门和空公开知识包，不发布任何真实知识卡。
- 最大风险：先读后判导致被拒正文或敏感 canary 泄露。
- 次要风险：社区包路径越界、同问题多卡冲突、文档绕过加载器。

## v0.3.0 历史完成回执

- 任务 0：基线、Node `v24.15.0` 和 4 个保护文件 SHA 核对通过。
- 任务 1：严格 schema、空公共索引和“先判状态、后暴露正文”脚本完成。
- 任务 2：README、入口与 knowledge contract 已接入唯一加载路径，版本为 `0.3.0-gate-trial`。
- 任务 3：canonical `node --check` 通过；`node --test` 为 61／61，fail／cancelled／skipped／todo 均为 0。
- 独立终审：白名单、保护 SHA、0 张真实卡、路径／隐私／schema／状态门均通过；未发现新的可复现高风险阻断项。

## v0.3.0 历史等价镜像反向证明

- 方法：用 `rsync -a --exclude=.git` 复制当前工作树到新建系统临时目录；`diff -qr --exclude=.git` exit 0。
- 关键文件在 canonical 与镜像中的 SHA-256 分别相同：脚本 `e7d598625a8daaea1ace51d66b57bf5d842ebc6c0ab0574a9ddd7dd58d82bd78`；schema `40779ff9c0a97d0fbb574d9d2951f002b0eeb36b6d6775a1993a4287282e31a2`；测试 `855dae20bca585a7b9da6ff8953a90e80a8b8b199390b318e981f5abb7570a10`；空索引 `87b2650aa05656a31e54d1a49740cf00421dc3124aae16f85ec8ad22950c6132`。
- 破坏前镜像：exit 0；61 tests／61 pass，其余全 0。
- 唯一破坏：把 `card[key] !== expectedValue` 改为 `key !== "editorial" && card[key] !== expectedValue`，仅放宽 editorial 门。
- 破坏后镜像：exit 1；预定测试 `non-exact gate editorial is denied` 变红；60 pass／1 fail，其余全 0；不是语法、导入、路径或 fixture 故障。
- 镜像已移出活动临时目录并放入系统废纸篓，可恢复；canonical 未被破坏。

## v0.3.0 历史 Git 交付边界

- 变更只允许进入 `codex/v0.3-publication-gate`；禁止直接推送或合并 `main`。
- 本文件不自写提交 SHA 或远端 SHA，避免回执修改自身；最终一致性由仓库外的 `git ls-remote --heads` 结果证明。
- 首次推送被 GitHub Push Protection 拒绝：合成测试使用了完整供应商 token 形状。它不是真凭证，但仍已换成明确的非供应商 fixture；交付分支从原 `main` 生成干净历史，不绕过保护。

## 2026-08-18 v0.3.1 gate suggestions trial

> `v0.3.1-gate-suggestions-trial` 是本次工作标签；`SKILL.md` 的有效版本仍为 `0.3.0-gate-trial`。

### 开工回执

- 真源：公开仓库 `hou-152/ai-native-helpdesk` 的 `main@2667fdc30599700310fd3f9ca47c7e1d590b0e70`；本地与远端一致，工作树干净，开放 PR 为 0。
- 基线：Node `v24.15.0`；`node --test` 为 64／64，fail／cancelled／skipped／todo 均为 0。
- 基线 SHA-256：脚本 `e7d598625a8daaea1ace51d66b57bf5d842ebc6c0ab0574a9ddd7dd58d82bd78`；schema `40779ff9c0a97d0fbb574d9d2951f002b0eeb36b6d6775a1993a4287282e31a2`；门禁测试 `855dae20bca585a7b9da6ff8953a90e80a8b8b199390b318e981f5abb7570a10`；公共索引 `1505e8a7c8c8015d74dbfd0f580f376c238f92b27dcb037a1b0b9641483d222e`。
- 实现边界：严格精确匹配仍是唯一 `ALLOW` 路径；候选提示只来自 common 索引（默认仓库公共包），保持 `MISS`，不含卡片正文，不读取显式 community 包候选；覆盖 `--common-pack` 时由调用者承担索引元数据公开性。
- 不做：不改 schema、不改首张 PublicCard、不加入系统时间派生字段、不把候选自动改写成精确查询、不修改有效 Skill 版本。

### 对抗性审计裁决

- 原补丁 `HOLD`：目标问句与最近 alias 的 Jaccard 最高只有 `0.4 < 0.6`，无法产生承诺的候选。
- 原正向测试使用无关合成 fixture，且条件式断言不能证明候选存在；临时镜像实跑为 67 tests／65 pass／2 fail。
- 原 `last_verified_age_days` 会打破 PublicCard 白名单；UTC 日期还会在上海零点后产生日期年龄偏差，因此从本次范围删除。
- 原文档要求自动按候选 question 重查，但响应没有 question，且会把模糊 `MISS` 人工升级为 exact `ALLOW`；修正为“用户明确补充后才重新走门”。
- `retrieval-trial` 容易把主路由、全文搜索和门内候选定位混为一谈；交付分支改为 `codex/v0.3.1-gate-suggestions-trial`。

### 实现与验证回执

- 实现：保留 exact `Map.get()` 权威路径；fallback 对 common 索引做 NFKC／Unicode 小写分词、汉字子串与标识符精确匹配，并用一对一最大匹配避免多个 query token 重复借用同一 term token。
- 阈值：query 为 2—16 个 token；query 覆盖率至少 `2/3`、term 覆盖率至少 `1/2`；同卡去重后按 query 分数降序、term 覆盖降序、`card_id` 升序稳定排序，最多 3 条；对外仍只暴露 query `score`。
- 输出：`MISS + NO_MATCH + suggestions[{card_id, score}]`；无候选时保持原两键 `MISS`；exact `ALLOW` 的 `card` 仍严格等于 schema 白名单字段。
- 测试：`node --check scripts/query-public-card.mjs`、`git diff --check` 通过；canonical `node --test` 为 72／72，fail／cancelled／skipped／todo 均为 0。
- 实测：`AGENTS.md 没生效` 返回唯一 `AIHD-PC-000001` 候选；`README.md 没生效`、`规则 项目规则`、`法律 遵守 已经` 和无关天气均为纯 `MISS`；精确 question 仍为 `ALLOW`。
- 正文边界：新增“索引可产生候选但卡片文件缺失”测试，仍返回 `MISS + suggestions` 且无 `card`，证明候选路径不读取正文；显式 community 包只做 exact，不产生候选。
- 最终 SHA-256：脚本 `91ca050639837426c137137e4dc40b253b31c5f84459f60584dacfaf7c65443f`；门禁测试 `06422ad7da10c5e21c3766c5b7508ab737040ba3e824f91e427509db4ea332f2`；live-pack 测试 `0b126765fe2fc86a0081809099c0abaee2f8b432d36b2c63d4b96068e03ad4f1`。
- 保护文件未改：schema `40779ff9c0a97d0fbb574d9d2951f002b0eeb36b6d6775a1993a4287282e31a2`；公共索引 `1505e8a7c8c8015d74dbfd0f580f376c238f92b27dcb037a1b0b9641483d222e`；首张 PublicCard `554b405263740ce1110a6e46f53d0e5a8c283172b8a2d49c3ed1b437e1dc6295`。
- 等价镜像：三份镜像在故障注入前均与 canonical `diff -qr --exclude=.git` exit 0；镜像基线 72／72 全绿。
- query 误提示反证：镜像只把 query 覆盖阈值放宽到 `0.0` 后，预定测试 `fallback requires corroborating query tokens` 变红；71 pass／1 fail，其余全 0。
- term 误提示反证：另一镜像只把 term 覆盖阈值放宽到 `0.0` 后，预定测试 `fallback requires enough coverage of the indexed term` 变红；71 pass／1 fail，其余全 0。
- 漏提示反证：第三份镜像把 query 覆盖阈值收紧到 `1.1` 后，正向算法、两项稳定排序、缺失正文和 live-pack 候选 5 个预定测试变红；67 pass／5 fail，其余全 0。
- 已知保守边界：纯中文连续口语通常只形成 1 个 token，第一版可能不提示而回到普通检索；本次优先降低误提示，不把候选机制扩成中文语义检索。

### v0.3.1 Git 交付边界

- 本次变更只进入 `codex/v0.3.1-gate-suggestions-trial`，禁止直接推送或合并 `main`。
- 提交只包含本次脚本、测试和三层职责／发布边界文档；不提交临时镜像、日志或 PR 草稿。
- 本文件不自写最终提交 SHA；最终一致性由仓库外的远端分支和 GitHub PR 读回证明。
