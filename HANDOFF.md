# HANDOFF — 单词盒子 WordBox（鸿蒙 7 · 出国旅游 · 每天 10 分钟 AI 对话学单词）

> 交接时间：2026-11-09 14:15 ｜ 状态：**已完成**（2026-11-09 14:30 收尾：TEST_REPORT.md 429 行、DELIVERY_SUMMARY.md 已补，任务全部完成，团队已 TeamDelete）
> 交付根目录：`C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery/`
>
> **本文件为历史交接记录，任务已结束，仅供追溯。最终结论见 `wordbox-harmony-delivery/DELIVERY_SUMMARY.md`。**

## 1. 任务目标

从 0 到 1 交付一款**鸿蒙 7（HarmonyOS NEXT / API 12+）原生移动 App**「单词盒子」，面向**准备出国旅游的人**，核心是**每天 10 分钟通过 AI 旅行情景对话学单词**，含艾宾浩斯复习曲线、生词本、每日打卡、打卡日历、学习统计。

用户要求 5 类交付物，全部以「工程目录 + Markdown 文档」形式：
1. 完整 PRD（目标 / 用户故事 / 竞品分析 / 功能优先级 / 待确认问题）
2. 系统架构设计（选型 / 模块 / 数据结构 / 接口 / 时序图）
3. 任务拆解清单（依赖排序 / 每文件逻辑分析 / 共享知识 / API Spec）
4. 可运行工程代码（前端页面 + 本地存储 + AI 对话对接层）
5. 完整单元/集成测试用例 + 测试报告
6. 最终一份项目交付说明

## 2. 已完成工作

- **PRD v1.1（579 行）**：3 个正交目标、5 个出境游用户故事、7 竞品 + Mermaid 象限图、P0 12 项 / P1 5 项 / P2 5 项、9 张 ASCII 线框、Q1~Q13 决议、NFR、覆盖核对表。四轮用户决议变更已全部合入。
- **ARCHITECTURE.md（1732 行）**：技术选型、三轨分层图、完整目录树、TS interface、全部 Service 签名、SM-2 公式+伪代码、Storage Key 双分区规约、3 张时序图、类图、状态机流程图、9 条 OAQ。
- **TASK_BREAKDOWN.md（630 行）**：package.json 片段、L0~L8 逐文件清单（108 文件，含逻辑分析与验收要点）、依赖图、完整 API Spec、Shared Knowledge 常量与 ArkTS 兼容规约。
- **工程代码（已落盘并跑通）**：
  - 轨 A 内核 `core/src/`：**32 文件 / 5245 行**
  - 轨 B 鸿蒙 `harmony/entry/src/main/ets/`：**49 文件 / 7407 行**（含 `core/` 机械镜像 32 个 `.ets`）
  - 轨 C 预览 `preview/` 15 文件 1420 行 + `adapters/preview/` 4 文件 323 行
  - 脚本 `scripts/`：`sync-core.mjs` / `check-core-sync.mjs` / `gen-core-manifest.mjs`
  - `README.md` 252 行（三轨说明 + 环境要求 + 运行命令）
  - `dist/` 已有 Vite 构建产物
- **测试**：`tests/` **22 文件 / 3816 行**（12 单测 + 5 集成 + helpers + `_smoke`），实跑 **211 passed / 17 files**。
- **团队流程**：已按 SOP 完成 产品经理→架构师→工程师 三阶段；QA 已写完测试并实跑通过。

## 3. 关键决策

- **Q1 AI = 鸿蒙端侧推理**（非云侧 API）：`OnDeviceAI`(主) / `ScriptedAI`(降级) / `MockAI`(测试)，`CloudAI` 不实现仅预留；数据零出端、无 AI 网络请求。放弃云 API 是因为用户明确选端侧，且出境无网场景更贴合。
- **Q2 账号 = 华为账号 + 可选游客**：游客**不提供进度统计**，仅登录态可看打卡日历/学习统计。放弃「纯游客+账号延后」是因为用户要求直接接入华为账号。
- **Q10 = 解释 A**：游客数据**照常本地落盘**，仅 F-07/F-08 **页面门禁不展示**；门禁放**数据读取层**而非 UI 隐藏。这样不破坏打卡/统计/日历数据源零误差一致。
- **Q11 = 登录后弹窗由用户选择是否合并**：仅在检测到游客进度时弹；初稿「不做迁移合并」已作废。
- **Q13 = 滑动窗口**：游客数据仅保留 `[today-6, today]` 共 7 个自然日；合并**只合并窗口内**进度。放弃「固定首 7 天有效期」是因为任意时点登录都应有最近 7 天可合并，语义稳定且可纯函数化。
- **登录引导频次**：D1~D4 不弹 / D5 弹 1 次 / D6 不弹 / D7 弹 1 次 / **D8 起未登录每天弹 1 次直到登录** / 每天最多 1 次 / 三动作 `去登录`·`暂不`·`不再提示`（`neverPrompt=true` 永久关闭**类型 A**，不影响类型 B）。
- **OAQ-1 裁决：`SM2_SECOND_INTERVAL_DAYS = 6`**（经典 SM-2，序列 `1→6→15→38`）。理由：PRD F-04 验收写「1/6/…」且是 SuperMemo 标准定义；原任务书沿用参考件的 3 属疏漏，已全库同步并要求测试断言基于常量推导。
- **三轨同源架构**：`core/src` 为唯一事实源；H5 预览用 Vite alias **直接 import 同一份源码**（零拷贝）；鸿蒙侧 `ets/core` 由脚本**机械镜像 + 哈希校验**（`check:core-sync`），从机制上杜绝三套实现漂移。放弃「三端各写一套」是因为必然漂移且无法在无 SDK 环境验证。
- **测试可行性**：因本机无 DevEco Studio / 鸿蒙 SDK，测试对象锁定纯 TS 内核（设计上即可测），鸿蒙轨只做结构静态校验，H5 轨做可运行性验证——三类验证**分开如实标注，不混入 Vitest 数字**。

## 4. 修改过的文件

| 文件/目录 | 状态 | 说明 |
|---|---|---|
| `PRD.md` | 新增 | 579 行，v1.1，Q1~Q13 全部决议定稿 |
| `ARCHITECTURE.md` | 新增 | 1732 行，含 OAQ-1 裁决与 3 张时序图 |
| `TASK_BREAKDOWN.md` | 新增 | 630 行，108 文件清单 + API Spec |
| `README.md` | 新增 | 252 行，三轨说明与运行命令 |
| `core/src/**` | 新增 | 32 个 `.ts`，内核唯一事实源 |
| `harmony/**` | 新增 | DevEco 工程结构 + 49 个 `.ets`（含 32 个内核镜像） |
| `preview/**`、`adapters/preview/**` | 新增 | Vite H5 预览，5 页面 + 账号页 + 两类弹窗 + FakeClock 面板 |
| `tests/**` | 新增 | 22 文件 / 3816 行 / 211 用例 |
| `scripts/**`、`core-manifest.json` | 新增 | 内核同步与哈希校验 |
| `docs/*.mermaid` | 新增 | 时序图、类图抽取件 |
| `dist/**` | 生成 | Vite 构建产物（证明 build 可过） |

> 说明：本工作区**不是 git 仓库**（`git status` 报 `not a git repository`），故无 commit/diff 记录，改动以上表文件系统实况为准。

## 5. 验证结果

实际运行并核对的项：
- `npx vitest run --reporter=basic` → **Test Files 16 passed (16) / Tests 199 passed (199)**
- `npx vitest run --coverage` → **Test Files 17 passed (17) / Tests 211 passed (211)**；覆盖率 **Stmts 93.29% / Branch 81.57% / Funcs 88.08% / Lines 93.29%**（`src/data` 100%、`src/services` 93.53%）
- `npx tsc --noEmit -p tsconfig.json` → 退出码 **0**
- `npx tsc --noEmit -p tsconfig.preview.json` → 退出码 **0**
- `node scripts/check-core-sync.mjs` → `OK — 32 core/src files, 32 mirrored .ets files, manifest current`
- 两次测试运行均出现 **2 个 `EPERM` unhandled error**（写 `%TEMP%` 下 ssr 缓存文件被沙箱拒绝），**不是用例失败**，用例仍全绿；如换终端可能不复现。
- 未验证：H5 五页面**未在浏览器目视验收**（仅确认 `dist/` 构建产物存在与 `npm run dev` 脚本可用）；鸿蒙轨**未编译**（无 SDK）；`D1→D8` FakeClock 演示未人工走查。

## 6. 未解决问题

- **`TEST_REPORT.md` 缺失**：QA 已写完测试并实跑通过，但尚未落盘测试报告文件。
- **`DELIVERY_SUMMARY.md` 缺失**：用户明确要求「最终汇总一份项目交付说明」，尚未生成。
- 鸿蒙轨未编译验证（环境无 DevEco Studio / SDK），交付时须如实标注「只落盘、未编译」。
- 测试运行中的 2 个 `EPERM` unhandled error（沙箱临时目录写入被拒），未定位到具体代码路径，判断为环境问题，可选清理。
- 团队 `software-wordbox-harmony` 仍在运行（5 名成员 idle/paused），未做 shutdown 与 TeamDelete。

## 7. 下一步操作

1. **让 QA 落盘 `TEST_REPORT.md`**：把已实跑数据（211/211、覆盖率 93.29%/81.57%/88.08%/93.29%、typecheck 双通过、core-sync 32/32）写进报告，按 QA 模板含概览表、覆盖率表、用例清单、关键结论、实跑命令输出、智能路由判定（应为 `NoOne`）、遗留项。
2. **汇编 `DELIVERY_SUMMARY.md`**：交付物清单、全部文件路径、技术亮点、运行方式、质量门禁结果、已知限制（鸿蒙未编译 / H5 未目视）、下一步建议。
3. （建议）`npm run dev` 在浏览器打开走查 5 页面与 D1→D8 演示，补一份目视验收记录。
4. `present_files` 展示 PRD / ARCHITECTURE / TASK_BREAKDOWN / TEST_REPORT / DELIVERY_SUMMARY。
5. 团队收尾：对 5 名成员 `shutdown_request`，待 `shutdown_response` 后 `TeamDelete`。

## 8. 运行命令

```bash
cd C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery

npm test                  # 全量测试（vitest run）
npm run test:unit         # 单测
npm run test:integration  # 集成测试
npm run test:coverage     # 覆盖率
npm run typecheck         # 内核 + 预览双类型检查
node scripts/check-core-sync.mjs   # 校验 harmony 镜像与 core 一致

npm run dev               # 启动 H5 预览（Vite，默认 5173）
npm run build             # 构建到 dist/
```

## 9. 环境要求与注意事项

- Node.js **>= 22**（实测 Node 22.22.2 / npm 10.9.7）；依赖仅 devDependencies：typescript / vitest / @vitest/coverage-v8 / vite，**已 `npm install` 完成**（`node_modules/` 存在）。
- 轨 B 需 DevEco Studio（API 12 / HarmonyOS 5.0.0(12)），**本机未安装**，只能落盘不能编译。
- **不要在 `harmony/entry/src/main/ets/core/` 里手改代码**——它是 `core/src` 的机械镜像，改内核后必须 `npm run sync:core`，`check:core-sync` 不一致即视为构建失败。
- 常量唯一来源 `core/src/models/constants.ts`：`DAILY_GOAL_SECONDS=600`、`GUEST_RETENTION_DAYS=7`、`LOGIN_PROMPT_DAYS=[5,7]`、`PROMPT_DAILY_AFTER_DAY=7`、`SM2_SECOND_INTERVAL_DAYS=6`、`SM2_INITIAL_EF=2.5`、`SM2_MIN_EF=1.3`。禁止在别处硬编码。
- 日期口径两套易踩坑：`Clock.todayYMD()` 用**本地年月日**（日切）；`addDays/diffDays/dayIndexOf/windowFrom` 用 **UTC 日序号**（免疫 DST 与跨月）。混用会导致跨月/DST 用例失败。
- `core/src` 内**禁止**出现 `any` / DOM / Node 专有 API / `@ohos.*` / `fetch` / `Date.now()`（Service 内），否则 FakeClock 与 MemoryStorage 无法接管，测试会失真。
- 两处弹窗严格分离：类型 A = 游客态登录引导（D5/D7/D8+）；类型 B = 登录成功后合并选择（仅 `onAuthSucceeded` / `MigrationService.detect()` 可产出）。`neverPrompt` 只被类型 A 读取。
- 辅助任务书（含全部硬业务规则）在 `C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/.workbuddy/reference/`：`PM_FINAL_BRIEF.md`、`ARCHITECT_FINAL_BRIEF.md`、`ENGINEER_FINAL_BRIEF.md`、`QA_FINAL_BRIEF.md`。
