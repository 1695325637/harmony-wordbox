# 单词盒子 · 阶段 4 验收测试报告（TEST_REPORT）

- **项目**：单词盒子（WordBox）HarmonyOS 双轨交付 —— Track A 纯 TS 内核 / Track B 鸿蒙镜像 / Track C Vite 预览
- **被测版本**：`core/src/` 32 文件 / 5245 行（工程师全量实现，无 stub）
- **测试代码**：`tests/` 18 个文件（12 单测 + 5 集成 + 1 冒烟 + 4 helpers）
- **执行人**：QA 工程师 严过关（Yan）
- **执行时间**：2026-11-09 14:21（本机真实终端）
- **OAQ-1 裁决口径**：`SM2_SECOND_INTERVAL_DAYS = 6`（经典 SM-2），间隔序列 `1 → 6 → 15 → 38`

> 本报告所有数字均来自本机本次实跑终端输出，无一处推算或编造。实跑日志：`/tmp/wb-test3.log`（verbose）、`/tmp/wb-cov2.log`（coverage）。

---

## 一、测试概览

| 项目 | 值 |
|---|---|
| 测试套件数（文件） | **18 / 18 通过** |
| —— 其中 QA 编写 | 17（12 unit + 5 integration） |
| —— 其中工程师冒烟 | 1（`tests/_smoke.test.ts`） |
| 测试用例总数 | **231** |
| 通过 | **231** |
| 失败 | **0** |
| 跳过（skipped / todo） | **0**（全量静态校验无 `it.skip` / `test.todo` / `it.only`） |
| 未处理错误（unhandled errors） | **0**（串行确定性运行） |
| 执行时长 | **8.55s**（transform 408ms / collect 2.58s / tests 373ms / prepare 2.21s） |
| 覆盖率运行时 | 9.91s（同一 18 文件 / 231 用例） |
| 测试框架版本 | **vitest/2.1.9 win32-x64 node-v22.22.2** |
| 覆盖率引擎 | `@vitest/coverage-v8`（v8 provider） |
| 被测范围 | `core/src/**/*.ts` 全量 32 文件（models / utils / ports / data / adapters / services） |
| 环境 | `environment: node`，`globals: true`，无网络、无真机、无 SDK 依赖 |
| 类型检查 | `tsc --noEmit -p tsconfig.json` → **EXIT 0**；`-p tsconfig.preview.json` → **EXIT 0** |
| 内核同步校验 | `check-core-sync` → **32 core/src ↔ 32 mirrored .ets，manifest current，EXIT 0** |
| **最终状态** | **全绿（231/231），无源码缺陷，MVP 可交付** |

### 关于"套件数"的两个口径（如实说明）

- 交付总监预跑口径为「17 files」，对应 **12 unit + 5 integration = 17 个 QA 套件**；
- 磁盘实际共 **18 个 `.test.ts`**，多出的是工程师自写的 `tests/_smoke.test.ts`（6 用例）；
- 本报告统一按 **18 文件 / 231 用例** 计（含冒烟），QA 自有 17 文件 / 225 用例。

---

## 二、真实覆盖率

### 2.1 分组汇总（按 `core/src` 子目录）

| 目录 | % Stmts | % Branch | % Funcs | % Lines | 说明 |
|---|---|---|---|---|---|
| `src`（`index.ts` kernel 装配） | 100 | 50 | 100 | 100 | 仅 1 行的分支未覆盖（L118 可选端口兜底） |
| `src/models` | 95.87 | 66.66 | 50 | 95.87 | `constants` 100 / `types` 100 / `errors` 91（枚举穷举分支天然不可达） |
| `src/utils` | 82.71 | 91.30 | 89.65 | 82.71 | `date` 96.87 / `id` 95.45 / `collection` 49.29（仅测试辅助函数用到部分） |
| `src/ports` | 91.17 | 76.00 | 96.87 | 91.17 | `codec` 94.73 / `keys` 80.76 / `ports.ts` 0（纯 interface 声明文件，无可执行语句） |
| `src/data` | 100 | 100 | 100 | 100 | 240 条种子词 + 8 场景话术模板全覆盖 |
| `src/adapters` | 72.50 | 92.00 | 50 | 72.50 | `memoryStorage` 87.71 / `systemClock` 34.78（真实时钟不参与测试，统一注入 FakeClock） |
| `src/services` | **94.79** | **82.24** | **91.97** | **94.79** | 全部领域服务，其中 `quality` / `stats` / `progressGate` 达 100 |
| **All files** | **94.14** | **82.64** | **88.80** | **94.14** | —— |

### 2.2 `--coverage` 原始表格（逐字摘录，未做任何修饰）

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   94.14 |    82.64 |    88.8 |   94.14 |
 src               |     100 |       50 |     100 |     100 |
  index.ts         |     100 |       50 |     100 |     100 | 118
 src/adapters      |    72.5 |       92 |      50 |    72.5 |
  memoryStorage.ts |   87.71 |       92 |   81.81 |   87.71 | 30-33,66-68
  systemClock.ts   |   34.78 |      100 |       0 |   34.78 | ...24,27-30,35-36
 src/data          |     100 |      100 |     100 |     100 |
  ...tTemplates.ts |     100 |      100 |     100 |     100 |
  seedWords.ts     |     100 |      100 |     100 |     100 |
 src/models        |   95.87 |    66.66 |      50 |   95.87 |
  constants.ts     |     100 |      100 |     100 |     100 |
  errors.ts        |      91 |    48.38 |      50 |      91 | ...33-135,139-141
  types.ts         |     100 |      100 |     100 |     100 |
 src/ports         |   91.17 |       76 |   96.87 |   91.17 |
  codec.ts         |   94.73 |     62.5 |     100 |   94.73 | 29-30,32-33
  keys.ts          |   80.76 |      100 |   94.11 |   80.76 | 29-33
  ports.ts         |       0 |        0 |       0 |       0 |
 src/services      |   94.79 |    82.24 |   91.97 |   94.79 |
  account.ts       |   97.91 |    83.87 |     100 |   97.91 | 78,80
  aiRouter.ts      |    97.7 |    88.88 |     100 |    97.7 | 65,82
  appFacade.ts     |   87.13 |    59.52 |      88 |   87.13 | ...00-510,546-550
  checkin.ts       |   93.89 |    88.23 |     100 |   93.89 | ...46-147,159-160
  loginPrompt.ts   |   96.95 |     87.5 |     100 |   96.95 | 169-171,177,205
  migration.ts     |   99.72 |    83.33 |     100 |   99.72 | 320
  mockAI.ts        |   85.71 |    89.47 |      70 |   85.71 | 46-47,51-55,58-59
  onDeviceAI.ts    |   91.93 |    77.77 |   66.66 |   91.93 | 28-29,32-34
  progressGate.ts  |     100 |      100 |     100 |     100 |
  prompt.ts        |   93.47 |       80 |     100 |   93.47 | 41-43
  quality.ts       |     100 |      100 |     100 |     100 |
  repository.ts    |   97.02 |    79.12 |   95.83 |   97.02 | ...31-132,248-249
  retention.ts     |   97.38 |       80 |     100 |   97.38 | 173-174,214-215
  scene.ts         |   76.74 |    57.14 |   33.33 |   76.74 | ...39-41,47,58-59
  scheduler.ts     |   98.65 |    98.41 |      90 |   98.65 | 190-191
  scriptedAI.ts    |   95.34 |    91.66 |      80 |   95.34 | 17-18
  stats.ts         |     100 |    84.74 |     100 |     100 | ...10-111,151,172
  wordbook.ts      |    90.4 |       70 |     100 |    90.4 | ...79,82-83,92-94
 src/utils         |   82.71 |     91.3 |   89.65 |   82.71 |
  collection.ts    |   49.29 |    81.81 |      50 |   49.29 | ...46,50-62,66-76
  date.ts          |   96.87 |     96.1 |     100 |   96.87 | 25-26,68-69
  id.ts            |   95.45 |    81.25 |     100 |   95.45 | 41-42
-------------------|---------|----------|---------|---------|-------------------
```

### 2.3 覆盖率口径说明（务实解读，不粉饰）

- **核心领域逻辑目标 100% 的达成情况**：`quality.ts` 100 / `stats.ts` 100（语句行）/ `progressGate.ts` 100；`scheduler.ts` 98.65、`retention.ts` 97.38、`migration.ts` 99.72、`repository.ts` 97.02、`date.ts` 96.87、`loginPrompt.ts` 96.95 —— 未覆盖行均为不可达兜底分支（如 `Date` 相关死代码防御、枚举 `default` 分支）。
- **拉低总分的三处非领域逻辑文件**：`systemClock.ts`（34.78，真实时钟适配器，测试统一注入 `FakeClock` 属设计选择）、`collection.ts`（49.29，仅 `sortBy/uniqBy/maxBy` 被间接调用）、`appFacade.ts`（87.13 / 分支 59.52，H5 预览层 UI 编排分支，非 P0 验收范围）。
- `ports.ts` 0% 是纯 `interface` 声明文件，v8 无执行语句可计，非覆盖缺口。

---

## 三、逐文件用例清单（18 文件 / 231 用例，全部通过）

| # | 测试文件 | 类型 | 用例数 | 结果 | 覆盖主题 |
|---|---|---|---|---|---|
| 1 | `tests/unit/date.test.ts` | unit | 18 | ✅ 18/18 | 纯整数日期算法、跨月/跨年/闰年、窗口、月份工具、OAQ-1 常量断言 |
| 2 | `tests/unit/scheduler.test.ts` | unit | 20 | ✅ 20/20 | SM-2 全语义、间隔序列常量推导、非法 quality 幂等、纯函数不可变、buildDailyQueue |
| 3 | `tests/unit/quality.test.ts` | unit | 13 | ✅ 13/13 | `[[QUALITY:n]]` 解析/越界/缺失→-1、clamp、strip、重复调用恒等 |
| 4 | `tests/unit/aiRouter.test.ts` | unit | 9 | ✅ 9/9 | primary 重试、errorChain 语义、fallback 补标、provider 流转、6 轮不中断 |
| 5 | `tests/unit/checkin.test.ts` | unit | 13 | ✅ 13/13 | 600s 达标、同日不重复、日切 streak、非法参数、写失败、游客不受门禁 |
| 6 | `tests/unit/stats.test.ts` | unit | 9 | ✅ 9/9 | F-20 门禁在读取层、聚合字段、日历三态、重算误差 0 |
| 7 | `tests/unit/wordbook.test.ts` | unit | 10 | ✅ 10/10 | 240 种子词/8×30、搜索过滤、add 建档、去重、remove 级联、写失败 |
| 8 | `tests/unit/account.test.ts` | unit | 14 | ✅ 14/14 | 会话/分区、登录登出刷新、写失败降级、篡改 partition 回落、窗口内进度判定 |
| 9 | `tests/unit/repository.test.ts` | unit | 14 | ✅ 14/14 | 分区隔离、日期索引、batch 原子性/跨分区拒绝、快照只过滤不删除、codec 容错 |
| 10 | `tests/unit/retention.test.ts` | unit | 16 | ✅ 16/16 | 7 天窗口 `[today-6,today]`、prune 幂等、不误删、跨月、闰年、落盘清理 |
| 11 | `tests/unit/loginPrompt.test.ts` | unit | 21 | ✅ 21/21 | `shouldPromptLogin` 8 分支、applyAction、每日一次、类型 A/B 分离 |
| 12 | `tests/unit/migration.test.ts` | unit | 22 | ✅ 22/22 | 冲突规则 6 例 + merge 编排 10 例 + detect/decision 6 例 |
| 13 | `tests/integration/learningFlow.test.ts` | integration | 5 | ✅ 5/5 | 冷启动→6 轮对话→600s 打卡→今日概览全链路 |
| 14 | `tests/integration/aiFallback.test.ts` | integration | 12 | ✅ 12/12 | 4 类端侧降级 + 空回复 + 主路径 + 降级下完整打卡闭环 + 双失败兜底 |
| 15 | `tests/integration/guestLoginMerge.test.ts` | integration | 12 | ✅ 12/12 | 类型 A→认证→类型 B 时序、4 种选择分支、幂等、冲突集成、游客分区保留 |
| 16 | `tests/integration/guestWindowD1toD8.test.ts` | integration | 9 | ✅ 9/9 | D1→D10 逐日引导序列、D5「暂不」、NeverPrompt、窗口滚动、同日幂等 |
| 17 | `tests/integration/gate.test.ts` | integration | 8 | ✅ 8/8 | 门禁只拦读不拦写、全窗口统计拦截、登录解锁、读无副作用 |
| 18 | `tests/_smoke.test.ts` | smoke（工程师） | 6 | ✅ 6/6 | 种子词、SM-2 序列、日期、quality、游客全流程、AI 降级 |
| | **合计** | | **231** | **✅ 231/231** | |

`tests/helpers/`（不计入用例）：`fakeClock.ts`（UTC epoch day，无 DST 偏差）、`memoryStorage.ts`、`fixtures.ts`（零 `Date.now()` 确定性夹具）、`harness.ts`（`createKernel` 装配真实内核 + 注入替身端口）。

---

## 四、关键验证结论（逐条给出依据用例）

### 4.1 SM-2 调度：`SM2_SECOND_INTERVAL_DAYS = 6`，序列 `1 → 6 → 15 → 38`（常量推导）

**结论：✅ 通过**

- 断言方式：`derivedIntervals()` 全部由 `SM2_FIRST_INTERVAL_DAYS` / `SM2_SECOND_INTERVAL_DAYS` / `SM2_INITIAL_EF` 推导，第 3 次 = `round(6 × 2.5)`，第 4 次 = `round(15 × 2.5)`，源码内无任何硬编码序列字面量；`q=4` 时 EF 增量为 0，EF 恒为 2.5，故推导链闭合。
- 依据用例：
  - `SM-2 调度：review 间隔序列（OAQ-1 常量推导） > 第 2 次 q=4 复习 → intervalDays=SM2_SECOND_INTERVAL_DAYS（裁决值 6）、repetitions=2`
  - `… > 第 3 次 q=4 复习 → intervalDays=round(第2次间隔 × SM2_INITIAL_EF)，由常量推导而非硬编码`
  - `… > 第 4 次 q=4 复习 → 间隔 ≥ SM2_MASTERED_INTERVAL_DAYS，status=Mastered，序列完整为常量推导值`
  - `日期工具：dayIndexOf / windowFrom / weekGrid / 月份工具 > OAQ-1 裁决落地：SM2_SECOND_INTERVAL_DAYS 常量取经典 SM-2 值 6`
  - `kernel smoke > SM-2 interval sequence derived from constants (EF stays 2.5 at q=4)`

### 4.2 600 秒打卡阈值、同日不重复、日切

**结论：✅ 通过**

- 依据用例：
  - `打卡服务：600 秒达标闭环 > 首次累计 DAILY_GOAL_SECONDS(600) 秒 → checkedIn=true、activeSeconds=600、checkedInAtMs=clock.nowMs()、streakAfter=1`
  - `… > 同日已打卡后继续累计 → activeSeconds 继续增长，但 checkedInAtMs 不变、streakAfter 不再 +1`
  - `… > 次日再打卡 → streakAfter 递增为 2，连续天数由 rebuildStreak 从同一 CheckIn 数据源计算`
  - `… > 连续打卡中断一天 → longest 保留历史最长，current 归零（以 clock.todayYMD 为准）`
  - `… > 多次分段累计到 600 秒 → 达标当日仅记一次打卡，activeSeconds 为各段之和`
  - `学习闭环… > 分段累计 600 秒达标：3 次 tick 后当日仅打卡一次，重复 tick 不增加连续天数`

### 4.3 7 天滑动窗口 `[today-6, today]`、`pruneOutsideWindow` 幂等、跨月、闰年

**结论：✅ 通过**

- 依据用例：
  - `游客窗口：纯策略… > windowOf(D8) → [D2, D8] 且 days=GUEST_RETENTION_DAYS=7`
  - `… > isWithinWindow 边界：fromYMD 与 toYMD 当天均命中，前一天与后一天均不命中，非法日期不命中`
  - `… > 幂等：对第一次清理后的 kept 再次清理 → removed 为空、changed=false、isIdempotent=true`
  - `… > 全部实体都在窗口内时清理 → changed=false、removed 为空、kept 与输入完全一致（不误删）`
  - `… > 跨月：基准 2026-10-28 的 D1..D8 覆盖 10→11 月切换，窗口 [D2,D8] 内数据不误删`
  - `… > 闰年：覆盖 2028-02-29 的窗口清理正确，02-29 在窗口内不被误删`
  - `游客窗口：RetentionService 落盘清理 > pruneGuestPartition 重复执行 → removedCount=0、idempotent=true（幂等，不误删窗口内）`
  - `D1→D8：7 天滑动窗口 > bootstrap 同日重复 3 次 → 首次清理有删除，后两次 removedCount=0（幂等）且窗口内 7 天数据完整保留`
  - `D1→D8：7 天滑动窗口 > 聊天消息按 createdAtMs 换算的自然日参与窗口过滤，窗口外消息不进快照但不被快照删除`

### 4.4 `shouldPromptLogin` 8 分支

**结论：✅ 通过（8/8 分支逐一断言）**

| 分支 | 判定 | 依据用例 |
|---|---|---|
| 1 已登录 | ✅ | `分支 1 已登录（session.kind=Authenticated）→ 不弹，reason=AUTHENTICATED，dialogType 恒为 A` |
| 2 无游客进度 | ✅ | `分支 2 无游客进度（hasGuestProgress=false 或 firstStudyYMD 为空）→ 不弹，reason=NO_GUEST_DATA` |
| 3 空/退化窗口 | ✅ | `分支 3 空/退化窗口（days<=0 或非法 YMD）→ 不弹，reason=EMPTY_WINDOW` |
| 4 neverPrompt | ✅ | `分支 4 用户已选「不再提示」（neverPrompt=true）→ 不弹，reason=NEVER_PROMPT` |
| 5 当天已弹 | ✅ | `分支 5 当天已弹过（lastPromptDate===todayYMD）→ 不弹，reason=ALREADY_PROMPTED_TODAY` |
| 6 D5/D7 命中 | ✅ | `分支 6 D5 / D7 命中 LOGIN_PROMPT_DAYS → 弹，reason=NONE，dayIndex 正确` |
| 7 D8+ 每日弹 | ✅ | `分支 7 D8 及以后（d>PROMPT_DAILY_AFTER_DAY）仍未登录 → 每天都弹一次` |
| 8 非排期日 | ✅ | `分支 8 D1~D4 / D6 / d=0（今天早于首学日）→ 不弹，reason=NOT_SCHEDULED_DAY` |

- 完整逐日序列：`D1..D12 完整序列断言（由 LOGIN_PROMPT_DAYS 与 PROMPT_DAILY_AFTER_DAY 推导，不硬编码弹窗日）`、`D1~D10 每日有学习数据时，bootstrap 的 dayIndex 与 shouldPrompt 完全符合常量推导序列`
- 每天最多一次：`每天最多 1 次：同日重复 decide 不重弹；跨到下一个可弹日重新弹一次`
- 「暂不」次日继续：`「暂不」次日继续：D5 弹后选 Later，D5 不再弹、D6 不弹、D7 再次弹（跨日重置）`

### 4.5 两类弹窗分离 + 合并八步

**结论：✅ 通过**

- **类型 A / B 严格分离**（`neverPrompt` 只关 A，不关 B）：
  - `dayIndex / buildSummary / 类型 B 分离 > 「不再提示」只关闭类型 A：neverPrompt=true 时 decide 不弹，但 onAuthSucceeded 仍产出类型 B`
  - `D1→D8：登录引导逐日序列 > 「不再提示」后 D8/D9/D12 全部不弹（reason=NEVER_PROMPT），但类型 B 仍可弹出`
  - `游客登录合并… > 「不再提示」只关闭类型 A：先选 NeverPrompt 再登录，类型 B 依然弹出`
- **合并八步**：
  1. 认证校验零写入 → `未登录直接 merge → performed=false、reason=NOT_AUTHENTICATED、零写入，不抛异常`
  2. 窗口快照 + 窗口外计数 → `游客数据全部在窗口外 → performed=false、reason=OUTSIDE_WINDOW_ONLY、skippedOutsideWindowCount>0、零写入账号分区`
  3. 空窗口零写入 → `登录但游客窗口完全为空 → performed=false、reason=NO_GUEST_DATA、零写入`
  4. ledger 幂等 → `幂等：第二次 merge → idempotentHit=true、performed=false、不再重复写入账号分区`
  5. 冲突裁决 → 见下 4.6
  6. 单次批量写 → `存储强制写失败 → merge 返回 fail(STORAGE_BATCH_PARTIAL)，不抛异常且无部分提交`
  7. `rebuildStreak` + 统计重算 → `窗口前置过滤：窗口外 checkIn 不被合并/不回灌账号分区，且不计入统计重算（误差 0）`
  8. 游客分区不删除 → `合并后游客分区不删除：guest:checkins / guest:words / guest:records 依然可读`、`合并后游客分区不删除，且 statistics 由 Gated 拒绝变为解锁`
- **统计重算误差 0**：`统计重算误差 0：merge.after 与再独立调用 recomputeAfterMerge 的关键字段完全一致`、`统计重算误差 0：同一数据集下 recomputeAfterMerge 与登录态 summary(D30) 的关键字段完全一致`

### 4.6 冲突规则（同日打卡不相加 / Record 不回退 / 生词本去重）

**结论：✅ 通过**

- `同日打卡冲突 → activeSeconds 取较大值（不相加）、checkedIn 取 OR、checkedInAtMs 取较早、streakAfter/newWords/reviewedWords 取较大`
- `StudyRecord 冲突取 progressRank 较大者，且 lapses 取较小、totalReviews/correctReviews 取较大`
- `账号记录为 Mastered 时，即使游客 rank 更高也绝不从 Mastered 回退`（集成层复验：`账号 StudyRecord 为 Mastered 时合并不得回退，游客较低进度被丢弃`）
- `生词本去重：账号已有同 text|scene 的词 → 保留账号版本、不写游客版本、conflict=WORD_DEDUP；游客列表内部重复也去重`
- `progressRank 相同 → 取 updatedAtYMD 较新的一方；游客无对应账号记录 → 直接写入`
- 集成层复验：`账号已有同日打卡与同 text|scene 词 → 合并后 activeSeconds 取较大不相加、账号词版本保留`

### 4.7 F-20 门禁落在读取层（游客 `Gated{allowed:false}` 但数据照常落盘）

**结论：✅ 通过**

- `门禁：只拦读取，不拦写入 > 游客态写入 Word / StudyRecord / CheckIn / ChatMessage → 全部落盘成功且能通过 Repository 读回`
- `… > 游客态即便已有大量学习数据，statistics(D7/D30) 仍返回 Gated{allowed:false, reason:Guest, data:undefined}`
- `… > 游客态 todayOverview → streakVisible=false、streak=0、gateHint 非空，但 remainingSeconds 反映真实计时`
- `… > 门禁读取不产生任何写入副作用：反复调用 statistics/calendar 后 storage.size 不变`
- `统计服务：F-20 门禁落在读取层 > 游客态调用 summary(D7) → ok=true 但 Gated.allowed=false、reason=Guest、data=undefined、unlockHint 非空`
- `ProgressGate.require 游客返回 fail(NOT_AUTHENTICATED) 不抛异常；guard 对游客隐藏 data 对登录态透传`

### 4.8 `[[QUALITY:n]]` 缺失 / 越界 → `quality = -1`，不中断计时

**结论：✅ 通过**

- `quality.test.ts`：无标签 / `6` / `99` / `-1` / `3.5` / `abc` / 空 / 未闭合畸形 → 全部 `-1`（共 6 例）
- `AI 路由：primary 成功路径 > primary 成功但回复缺失合法 QUALITY 标签 → parsed.quality=-1（主路径不擅自补标签）`
- `SM-2 调度… > quality 为 -1 / 6 / 3.5 / NaN → 返回输入对象本身（同一引用），不产生状态漂移`
- `学习闭环… > QUALITY 缺失（quality=-1）→ 不回写 StudyRecord、不抛异常、不中断 600s 计时打卡闭环`
- `AI 路由：primary 失败 → Scripted 降级 > fallback 内容不含合法 QUALITY 标签 → 自动追加「[[QUALITY:3]]」，parsed.quality=3，保证调度可回写`

### 4.9 端侧三类降级不阻断 600s 打卡

**结论：✅ 通过**

| 降级场景 | 错误码 | 依据用例 |
|---|---|---|
| 加速器不可用（模型未就绪） | `AI_MODEL_NOT_READY` | `「加速器不可用（模型未就绪）」→ errorChain 记录 E_AI_MODEL_NOT_READY、降级回复合法 QUALITY、attempts=AI_MAX_RETRY+1` |
| loadModel 失败 | `AI_MODEL_NOT_READY` | `「loadModel 失败」→ errorChain 记录 E_AI_MODEL_NOT_READY…` |
| infer 推理超时 | `AI_INFERENCE_TIMEOUT` | `「infer 推理超时」→ errorChain 记录 E_AI_INFERENCE_TIMEOUT…` |
| infer 低内存 | `AI_OUT_OF_MEMORY` | `「infer 低内存」→ errorChain 记录 E_AI_OUT_OF_MEMORY…` |
| 空回复 | `AI_EMPTY_REPLY` | `「infer 返回空回复」→ 归一化为 AI_EMPTY_REPLY 并降级，仍产出合法 QUALITY` |
| 双 provider 全失败 | 内核兜底文案 | `primary 与 fallback 全部失败 → 内核兜底文案仍带合法 QUALITY、调度照常回写、600s 打卡不中断` |

- 闭环复验 4 例：`「…」下完整学习闭环：sendMessage 仍回写调度、tick 600s 仍自动打卡`（4 个场景各 1 例）+ `连续 6 轮端侧全失败 → …最后一轮 tick 600s 打卡成功`
- 每次失败均 `unload()`（`engine.unloadCalls > 0`），错误码全部落入 `errorChain`。

### 4.10 纯函数不可变性（`Object.freeze` 入参）与 `Result<T>` 不抛异常

**结论：✅ 通过**

- `Object.freeze 入参调用 review → 不抛异常、返回全新对象、原对象所有字段保持不变`
- `Object.freeze 入参调用 createRecord / isDue / rebaseAfterGap / progressRank / statusOf → 均不抛异常`
- `Object.freeze 的 words / records 入参调用 buildDailyQueue → 不抛异常且不改变入参数组`
- `Object.freeze 的 LoginPromptInput 调用 shouldPromptLogin → 不抛异常且不 mutate 入参`
- `filterWithinWindow 输入 Object.freeze 的数组 → 返回新数组、不 mutate 入参、只保留窗口内项`
- `parse 对同一字符串重复调用 → 结果恒等（纯函数、无内部状态、不抛异常）`
- `decide / onShown / onAuthSucceeded 全程返回 Result 不抛异常`
- `全流程不抛异常：bootstrap / decide / onShown / detect 均返回 ok=true 的 Result`
- `所有 facade 方法均返回 Result<T> 不抛异常；游客态 statistics 被门禁拦截但学习照常落盘`
- 非法输入全部以 `Result.fail` 表达：`INVALID_DATE` / `INVALID_ARGUMENT` / `STORAGE_WRITE_FAILED` / `STORAGE_BATCH_PARTIAL` / `NOT_AUTHENTICATED` / `STORAGE_READ_FAILED`。

---

## 五、实跑命令与真实输出摘录

### 5.1 全量测试（确定性串行）

```bash
cd C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery
npx vitest run --reporter=verbose --no-file-parallelism --maxWorkers=1 2>&1 | tee /tmp/wb-test3.log
```

```
 ✓ tests/unit/quality.test.ts > … > 缺失 / 越界标签的解析结果 quality=-1 → 满足「不回写调度、不中断计时」判定条件

 Test Files  18 passed (18)
      Tests  231 passed (231)
   Start at  14:21:34
   Duration  8.55s (transform 408ms, setup 0ms, collect 2.58s, tests 373ms, environment 4ms, prepare 2.21s)
```

> 无 `Unhandled Errors` 段落，`Errors` 计数为 0。

### 5.2 覆盖率

```bash
npx vitest run --coverage --coverage.reporter=text \
  --coverage.reportsDirectory=/tmp/wbcov-serial \
  --no-file-parallelism --maxWorkers=1 2>&1 | tee /tmp/wb-cov2.log
```

```
 Test Files  18 passed (18)
      Tests  231 passed (231)
   Start at  14:21:51
   Duration  9.91s (transform 409ms, setup 0ms, collect 2.59s, tests 421ms, environment 5ms, prepare 2.54s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   94.14 |    82.64 |    88.8 |   94.14 |
…
```

### 5.3 类型检查（双轨）

```bash
npx tsc --noEmit -p tsconfig.json            # → MAIN_EXIT=0    （无任何输出）
npx tsc --noEmit -p tsconfig.preview.json    # → PREVIEW_EXIT=0 （无任何输出）
```

### 5.4 内核三轨同步校验

```bash
node scripts/check-core-sync.mjs
```

```
[check:core-sync] OK — 32 core/src files, 32 mirrored .ets files, manifest current.
[check:core-sync] Track A (core), Track B (Harmony mirror) and Track C (Vite alias) share one kernel.
SYNC_EXIT=0
```

### 5.5 框架版本

```bash
npx vitest --version
# vitest/2.1.9 win32-x64 node-v22.22.2
```

### 5.6 并行模式（默认）对照实跑 —— 环境相关，非用例失败

```bash
npx vitest run --reporter=verbose    # 默认多 worker 并行
```

```
 ⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯
 Vitest caught 2 unhandled errors during the test run.
 Error: EPERM: operation not permitted, open 'C:\Users\WUYANY~1\AppData\Local\Temp\K9oI6C862RCMyojx1MMza\ssr\40b9f1f37d5bd759c353e90078138580f67eb091'
  ❯ wrappedPromisesWriteFile .../cli/vendor/shim/node-brokered-fs-shim.cjs:724:20
  ❯ Proxy.fetch node_modules/vitest/dist/chunks/resolveConfig.rBxzbVsl.js:6643:7
  ❯ EventEmitter.onMessage node_modules/vitest/dist/chunks/index.68735LiX.js:91:20

 Test Files  16 passed (16)
      Tests  199 passed (199)
     Errors  2 errors
   Duration  2.42s (transform 1.09s, setup 0ms, collect 7.54s, tests 580ms, environment 5ms, prepare 4.31s)
```

**关键事实（如实记录，不隐瞒不夸大）**：
- 默认并行模式在本沙箱下**会随机漏收集测试文件**：三轮分别得到 `17 文件/209 用例`、`16 文件/199 用例`、`18 文件/231 用例`（含 `--coverage` 的一轮）。漏掉的文件每轮不同（`migration`、`scheduler`、`guestLoginMerge` 都曾缺席），**但缺席文件一旦被收集，用例全部通过**（`migration` 单独跑：`1 file passed / 22 tests passed`）。
- 串行单 worker 连跑两次（普通 + coverage）均稳定 `18/18 文件、231/231 用例、0 error`。
- 因此**本报告的权威数字采用串行确定性结果**；并行模式的偏差归因为沙箱对 `%TEMP%` 写 SSR 缓存（EPERM）导致 worker 侧收集异常，属**执行环境缺陷，非源码缺陷、非测试缺陷**。

---

## 六、QA 智能路由判定

### 判定：**NoOne（全绿，无需回退）**

**理由**：
1. 231 / 231 用例通过，0 失败、0 跳过，0 unhandled error（串行确定性运行）。
2. 未发现任何「断言符合 PRD/设计但实现输出错误」的源码缺陷 —— 不存在判 `Engineer` 的事项。
3. 测试代码自身在编写期间发现并自行修复的问题均已在阶段 A 收口（`as never` / 非空断言 / 异步竞态断言 / 用例名与实现不符等），本次实跑未再出现，不构成阶段 B 的 `QA` 回退。
4. 类型检查双通过 + 内核三轨同步一致，交付面无阻塞。
5. 唯一异常项为**环境级 EPERM**，已在 §5.6 与 §七 说明，不改变用例结论。

---

## 七、遗留问题与已知限制（如实列示）

| # | 项 | 现象 / 影响 | 是否影响验收结论 | 建议 |
|---|---|---|---|---|
| 1 | **`EPERM` unhandled error（并行模式）** | 交付总监预跑见 2 个，本轮我复现 2 个（另一次 1 个）。栈顶为 `writeFile %TEMP%\...\ssr\40b9f1f…` 被沙箱文件系统 shim（`node-brokered-fs-shim.cjs`）拒绝。 | **不影响**。无任何测试失败；串行模式下完全不出现。副作用是并行时随机漏收集文件，导致统计数字偏小。 | CI/验收统一使用 `--no-file-parallelism --maxWorkers=1`；或为 vitest 指定可写的 `TMPDIR`。建议写入工程 `package.json` 的 `test` 脚本。 |
| 2 | **默认并行模式的用例计数不稳定** | 三轮分别 209 / 199 / 231 用例；漏收集文件每轮不同。 | **不影响**（漏收集≠失败，被收集者全通过）。 | 同上；并在 CI 中加「用例数 ≥ 231」的下限断言防回归。 |
| 3 | **覆盖率 `coverage/` 目录清理被沙箱拒绝** | 首轮 `npx vitest run --coverage` 在收尾触发 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，`coverage/.tmp` 删除被拒；报告已改用 `--coverage.reportsDirectory=/tmp/wbcov-serial` 规避。 | **不影响数据**：文本表已完整采集。 | 项目内暂未生成 `coverage/html` 静态报告；如需 HTML 报告，需在放开写权限的终端重跑一次。 |
| 4 | **鸿蒙轨（Track B）未编译** | 无 DevEco Studio / HarmonyOS SDK，`mirror/*.ets` 仅做**结构静态校验**：`check-core-sync` 确认 32 个 `core/src` 文件 ↔ 32 个 `.ets` 镜像、manifest 与 hash 一致。 | **不影响核心逻辑验收**，但**真机运行未经证实**。 | 交付前需在有 SDK 的机器上补一次 `hvigor` 编译 + 真机冒烟（打卡、AI 降级、登录合并三条主链路）。 |
| 5 | **H5 预览（Track C）无自动化 UI 测试** | 本轮为纯领域层 + facade 逻辑测试，无 DOM / 无 E2E、无截图比对。`appFacade.ts` 分支覆盖 59.52%。 | **不影响 P0 领域结论**，但 UI 回归无防护。 | 后续补 Playwright 冒烟（bootstrap → 学习 → 打卡 → 登录合并 4 步）。 |
| 6 | `systemClock.ts` 覆盖率 34.78% | 真实时钟适配器不参与测试（统一注入 `FakeClock`），属**有意的设计选择**，非覆盖漏洞。 | 不影响。 | 可在集成环境加一条 `SystemClock` 与 `date.ts` 口径一致性用例。 |
| 7 | `collection.ts` 覆盖率 49.29%、`scene.ts` 76.74% | 部分工具函数仅被间接路径调用，场景模板出错分支未触发。 | 不影响 P0。 | 低优先级，后续按需补。 |

---

## 八、结论：MVP 是否可交付

### **结论：可交付（Track A 内核 + Track C 预览逻辑层），鸿蒙轨需补一次真机编译冒烟**

支撑依据：

1. **用例全绿**：18 文件 / 231 用例 / 100% 通过 / 0 跳过 / 0 失败（确定性串行实跑）。
2. **覆盖率达标**：全量 `94.14% Stmts / 82.64% Branch / 88.80% Funcs / 94.14% Lines`；核心领域（`scheduler` 98.65、`migration` 99.72、`retention` 97.38、`loginPrompt` 96.95、`quality` 100、`stats` 100）均达或接近 100%。
3. **P0 关键口径全部落地并被用例锁定**：OAQ-1 `SM2_SECOND_INTERVAL_DAYS=6`（`1→6→15→38` 常量推导）、600s 打卡与同日不重复、7 天窗口幂等/跨月/闰年、`shouldPromptLogin` 8 分支、两类弹窗分离、合并八步（窗口前置过滤 / 幂等 / 冲突裁决 / 游客分区不删除 / 统计重算误差 0）、F-20 读取层门禁、`quality=-1` 不中断、端侧三类降级不阻断打卡、纯函数不可变与 `Result<T>` 不抛异常。
4. **工程一致性**：`tsc --noEmit` 内核与预览双通过；`check-core-sync` 32 ↔ 32 与 manifest 一致。
5. **无源码缺陷**：路由判定 `NoOne`，无需回退工程师返工。

**交付前仍需完成的两件非阻塞事项**：
- （必做）在有 HarmonyOS SDK 的环境补一次 `hvigor` 编译 + 真机三链路冒烟（§七 #4）；
- （建议）把 `npm test` 脚本固化为串行参数，消除并行模式下的用例计数抖动与 EPERM 噪声（§七 #1/#2）。

---

**报告生成**：QA 工程师 严过关（Yan） · 2026-11-09 · 全部数据取自本机真实终端输出
