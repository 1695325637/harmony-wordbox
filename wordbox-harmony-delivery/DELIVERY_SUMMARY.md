# 单词盒子 WordBox · 项目交付说明

> 交付日期：2026-11-09 ｜ 版本 v1.0 ｜ 主理人：交付总监（software-company）
> 团队：许清楚（产品经理）· 高见远（架构师）· 寇豆码（工程师）· 严过关（QA 工程师）
> 工程目录：`wordbox-harmony-delivery/`

---

## 一、TL;DR

「单词盒子」是一款**鸿蒙 7（HarmonyOS NEXT / API 12+）原生 App**，面向**准备出国旅游的人**，用**每天 10 分钟的 AI 旅行情景对话**替代机械抽认卡，配合**艾宾浩斯复习曲线、生词本、每日打卡、打卡日历、学习统计**构成完整学习闭环。

本次交付包含 **6 份 Markdown 文档 + 122 个源文件（工程文件合计 221 个）的完整可运行工程**，测试 **18 个套件 / 231 个用例全部通过（0 失败 / 0 跳过）**，语句覆盖率 **94.14%**。

---

## 二、需求覆盖核对（逐条对应你的原始要求）

| 你的要求 | 交付物 | 落点 |
|---|---|---|
| 完整 PRD（目标/用户故事/竞品分析/功能清单与优先级/待确认问题） | `PRD.md` v1.1 · 579 行 | 11 章：3 个正交目标、5 个出境游用户故事、**7 个竞品 + Mermaid 象限图**、P0 12 项 / P1 5 项 / P2 5 项、9 张 ASCII 线框、**Q1~Q13 决议**、NFR |
| 系统架构设计（技术选型/模块划分/核心数据结构/接口定义/时序图） | `ARCHITECTURE.md` · 1732 行 | 技术选型表、三轨分层图、完整目录树、全部 TS interface、全部 Service 签名、SM-2 公式与伪代码、Storage Key 双分区、**3 张 Mermaid 时序图**、类图、状态机流程图、9 条 OAQ |
| 任务拆解清单（依赖排序/每文件逻辑分析/共享知识/API Spec） | `TASK_BREAKDOWN.md` · 630 行 | L0~L8 **108 个文件逐条**（路径/层/依赖/逻辑分析/验收要点）、依赖图、完整 API Spec、Shared Knowledge 常量与 ArkTS 兼容规约 |
| 可运行工程代码（前端页面 + 本地存储 + AI 对话对接层） | `core/src` + `preview` + `harmony` | 32 文件内核 / 32 个 ArkTS 镜像 / 15 文件 H5 预览 / 4 个平台适配；本地存储三实现；AI 三层对接（端侧推理 / 脚本降级 / Mock） |
| 完整单元/集成测试用例及测试报告 | `tests/` + `TEST_REPORT.md` | 18 个套件 / **231 用例全绿**、覆盖率 94.14%、逐条关键结论、路由判定 `NoOne` |
| 最终汇总交付说明 | 本文档 | — |

---

## 三、交付物清单

### 3.1 文档（6 份）

| 文件 | 行数 | 内容 |
|---|---|---|
| `PRD.md` | 579 | 产品需求文档 v1.1（四轮决议变更全部合入） |
| `ARCHITECTURE.md` | 1732 | 系统架构设计 |
| `TASK_BREAKDOWN.md` | 630 | 任务拆解 + API Spec |
| `TEST_REPORT.md` | 429 | 测试报告（真实实跑数据） |
| `README.md` | 252 | 三轨说明 + 环境要求 + 运行命令 |
| `DELIVERY_SUMMARY.md` | 本文 | 项目交付说明 |

辅助：`docs/sequence-diagram.mermaid`（3 张时序图）、`docs/class-diagram.mermaid`（类图）

### 3.2 工程代码（按三轨组织）

| 轨 | 路径 | 规模 | 说明 |
|---|---|---|---|
| **A 领域内核** | `core/src/` | **32 文件 / 5245 行** | 唯一事实源。纯 TS、零平台依赖、ArkTS 严格子集。SM-2 调度、600s 打卡、统计、账号会话、7 天窗口、登录引导状态机、合并冲突与幂等**全部在此且纯函数化** |
| **B 鸿蒙 7 原生** | `harmony/` | **49 文件 / 7407 行** | DevEco 标准结构（AppScope / build-profile / oh-package / module.json5 / EntryAbility）+ 6 页面 + 2 弹窗 + 4 个平台适配（Preferences 存储 / Clock / 端侧推理引擎 / 华为账号）+ 32 个内核 `.ets` 镜像 |
| **C H5 预览** | `preview/` + `adapters/preview/` | **19 文件 / 1743 行** | Vite 6 + 原生 TS，通过 alias **直接 import 同一份内核源码**（零拷贝）；5 页面 + 账号页 + 两类弹窗 + 门禁视图 + **FakeClock 面板（可推进 D1→D8）** |
| 测试 | `tests/` | **22 文件 / 3816 行** | 18 个 `.test.ts`（12 单测 + 5 集成 + 1 冒烟）+ 4 个 helpers |
| 脚本 | `scripts/` | 3 个 | `sync-core`（内核→鸿蒙镜像）、`check-core-sync`（哈希校验）、`gen-manifest` |

**合计 122 个源文件（内核 32 + 预览 19 + 测试 22 + 鸿蒙 49），约 18,200 行代码与测试；连同配置、资源、脚本与文档，工程文件共 221 个。**

---

## 四、关键设计决策（含取舍理由）

| 决策 | 结论 | 为什么 |
|---|---|---|
| **AI 能力** | 鸿蒙**端侧推理**（`OnDeviceAI` 主 / `ScriptedAI` 降级 / `MockAI` 测试），`CloudAI` 不实现仅预留 | 你明确选端侧；且出境游高频无网，端侧天然离线，**对话与学习数据零出端** |
| **账号体系** | 直接接入**华为账号**，可选游客模式 | 你要求接华为账号；游客保留低门槛，但**不给进度统计**，形成登录动机 |
| **游客进度可见性** | 游客**数据照常落盘**，仅打卡日历/统计**页面门禁不展示**；门禁放**数据读取层** | 若游客不落盘，会破坏打卡/日历/统计的数据源一致性；读取层门禁既满足「不展示」又不丢数据 |
| **登录后合并** | 弹窗由**用户自行选择**是否合并游客进度 | 你明确要求；避免「悄悄覆盖账号已有进度」的数据事故 |
| **游客数据留存** | **滑动窗口**：仅保留 `[今天-6, 今天]` 共 7 个自然日；**合并也只合并窗口内** | 任意时点登录都有最近 7 天可合并，语义稳定、可纯函数化、易测 |
| **登录引导频次** | D1~D4 不弹 / D5 弹 1 次 / D6 不弹 / D7 弹 1 次 / **D8 起未登录每天 1 次直到登录**；三动作 `去登录`·`暂不`·`不再提示` | 你逐条指定；`不再提示` 只关登录引导，**不影响**登录成功后的合并弹窗 |
| **SM-2 第 2 次间隔** | `SM2_SECOND_INTERVAL_DAYS = 6`，序列 `1→6→15→38` | 架构师发现与 PRD F-04「1/6/…」冲突，我裁决取经典 SM-2 值（与产品验收基线一致），并收敛为单一常量 |
| **三轨同源** | `core/src` 唯一事实源；H5 用 alias 直连源码；鸿蒙用脚本**机械镜像 + 哈希校验** | 从机制上杜绝「三端各写一套」的漂移；且本机无鸿蒙 SDK，只有内核能真跑测试 |

---

## 五、质量门禁结果

| 门禁 | 结果 | 依据 |
|---|---|---|
| 测试通过率 | ✅ **231 / 231（100%）** | `npm test`，18 文件，8.58s，0 失败 0 跳过 0 unhandled |
| 语句覆盖率 | ✅ **94.14%** | `npm run test:coverage`（Branch 82.64% / Funcs 88.8% / Lines 94.14%） |
| 核心逻辑覆盖 | ✅ `quality` 100 / `stats` 100 / `progressGate` 100 / `migration` 99.72 / `scheduler` 98.65 / `retention` 97.38 / `loginPrompt` 96.95 | 同上 |
| 类型检查 | ✅ 内核 + 预览**双通过** | `tsc --noEmit` 两个 project 均 EXIT 0 |
| 内核镜像一致性 | ✅ **32 core ↔ 32 mirrored**，manifest current | `node scripts/check-core-sync.mjs` |
| H5 预览可运行 | ✅ 服务 200、入口与 9 个关键模块按需编译全部 200 | 实测 `vite` + `curl`（见第七节说明） |
| 代码真实性 | ✅ 无 TODO / stub / 空实现 | 全库检索 + 覆盖率反证（无大面积未覆盖空函数） |
| 源码缺陷 | ✅ **0 个**（QA 路由判定 `NoOne`） | `TEST_REPORT.md` §六 |

---

## 六、如何运行

```bash
cd C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery

npm test                  # 全量测试（已固化串行，稳定 18 文件 / 231 用例）
npm run test:unit         # 12 个单测
npm run test:integration  # 5 个集成测试
npm run test:coverage     # 覆盖率
npm run typecheck         # 内核 + 预览双类型检查
node scripts/check-core-sync.mjs   # 校验鸿蒙镜像与内核一致

npm run dev               # 启动 H5 预览（Vite）
npm run build             # 构建到 dist/
```

**鸿蒙轨**：需用 DevEco Studio（API 12 / HarmonyOS 5.0.0(12)）打开 `harmony/` 目录编译，本机未安装 SDK，故只落盘未编译。

---

## 七、环境注意（会踩的坑，实测记录）

1. **`curl` 走代理**：本机 `http_proxy=127.0.0.1:63269`，访问本地服务须加 `--noproxy '*'`，否则报 502 `upstream connect failed`。
2. **Vite 只监听 IPv6**：`[::1]:port`，用 `http://localhost:PORT` 可访问，`http://127.0.0.1:PORT` 不通。
3. **测试必须串行**：本沙箱下 vitest **并行多 worker 会随机漏收集测试文件**并伴随 `EPERM`（写 `%TEMP%` 的 ssr 缓存被 fs shim 拒绝）。已把 `npm test` / `test:unit` / `test:integration` / `test:coverage` 全部固化为 `--no-file-parallelism --maxWorkers=1`；保留 `npm run test:parallel` 供有可写 `TMPDIR` 的 CI 使用。
4. **不要在 `harmony/entry/src/main/ets/core/` 手改代码**：它是机械镜像，改内核后须 `npm run sync:core`，`check:core-sync` 不一致即视为构建失败。
5. **常量唯一来源** `core/src/models/constants.ts`：`DAILY_GOAL_SECONDS=600`、`GUEST_RETENTION_DAYS=7`、`LOGIN_PROMPT_DAYS=[5,7]`、`PROMPT_DAILY_AFTER_DAY=7`、`SM2_SECOND_INTERVAL_DAYS=6`、`SM2_INITIAL_EF=2.5`、`SM2_MIN_EF=1.3`。禁止别处硬编码。
6. **两套日期口径别混用**：`Clock.todayYMD()` 用本地年月日（日切）；`addDays/diffDays/dayIndexOf/windowFrom` 用 UTC 日序号（免疫 DST 与跨月）。

---

## 八、已知限制（如实说明，不粉饰）

1. **鸿蒙轨未编译验证**：本机无 DevEco Studio / 鸿蒙 SDK，`harmony/` 仅完成结构落盘与内核镜像一致性校验，**未执行 `hvigor` 编译、未上真机**。
2. **H5 预览无自动化 UI 测试**：已验证服务可启动、页面与模块可编译加载，**未做浏览器端点击级 E2E**；`appFacade.ts` 分支覆盖 59.52%，UI 层逻辑靠预览人工走查。
3. **`coverage/html` 未生成**：首轮覆盖率收尾触发沙箱 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，已改用外部 reportsDirectory 规避，文本覆盖率表完整，项目内暂无 HTML 可视化报告。
4. **并行模式用例数抖动**：未加固前曾出现 199 / 209 / 231 三种计数（环境缺陷，非源码缺陷），现已通过串行固化解决。
5. **游客数据策略为 MVP 默认**：Q12（不合并时窗口内数据保留、可再次合并）仍标为「待确认」，当前按默认实现。

---

## 九、下一步建议

1. **补鸿蒙真机编译冒烟**：在有 SDK 的机器上 `DevEco Studio` 打开 `harmony/`，跑通三条链路——**打卡（600s）/ AI 降级（无模型时走 ScriptedAI）/ 登录合并（华为账号授权 → 合并弹窗）**。
2. **补 E2E**：用 Playwright 覆盖「游客学习 → D5/D7 引导 → 不再提示 → 模拟登录 → 合并 → 统计解锁」四步冒烟。
3. **CI 硬化**：加「用例数 ≥ 231」下限断言防回归；CI 配可写 `TMPDIR` 以启用 `test:parallel` 提速。
4. **P1 功能**：场景词书切换、TTS/STT 语音、休息日机制、生词本导入导出、每场景 ≥3 套离线脚本扩充。
5. **词库扩充**：当前内置 8 场景 × 约 30 词 ≈ 240 词，建议按埋点补充高频旅行短语。

---

**交付完成。** 文档与代码均在本目录，`npm test` 可直接复现 231/231 全绿。
