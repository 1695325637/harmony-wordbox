# QA 工程师最终任务书（QA_FINAL_BRIEF）

> **本文件是唯一有效指令**，由交付总监下发。所有产出只回传 `team-lead`，禁止直接给其他成员发消息。
> 被测工程根目录：`C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/wordbox-harmony-delivery/`
> 上游：`PRD.md`（v1.1）、`ARCHITECTURE.md`、`TASK_BREAKDOWN.md`、`ENGINEER_FINAL_BRIEF.md`

---

## 1. 任务目标与硬门禁

用户要求「**完整的单元/集成测试用例及测试报告**」。因此：

1. **测试报告必须是真实实跑结果**，禁止虚构用例数、通过率或覆盖率。所有数字必须来自本机 `npm test` / `npm run test:coverage` 的实际输出。
2. 当前环境：Node 22.22.2 + npm 10.9.7，无 DevEco Studio / 鸿蒙 SDK / 真机。因此测试对象为**纯 TypeScript 领域内核**（三轨架构中的轨 A），这是设计上就要求可测的部分；鸿蒙 ArkTS 工程只做结构静态校验（文件存在性、配置完整性），H5 预览做可运行性检查。
3. 若 `npm install` 因网络不可用失败，必须如实记录并给出可执行的降级方案（如使用零依赖测试运行器），**不得编造通过结果**。
4. 你是**独立第二层验证**：工程师自跑过一次测试，你不要只重跑他的用例，要**补边界与错误路径**。

---

## 2. 必须编写的测试文件（`tests/` 下）

### 2.1 单元测试
| 文件 | 至少覆盖 |
|------|---------|
| `tests/unit/models.test.ts` | Word / StudyRecord / CheckIn / ChatMessage / AccountSession / GuestPromptState 的工厂函数与默认值、字段完整性 |
| `tests/unit/dateUtils.test.ts` | `formatYMD` 补零、`startOfDay`/`endOfDay` 相差 24h-1ms、`parseYMD`↔`formatYMD` 对称、`dateRange` 含端点、`addDaysYMD` 跨月/跨年/闰年、`daysBetween` 正负零 |
| `tests/unit/EbbinghausScheduler.test.ts` | `initRecord` EF=2.5 / status=new；quality<3 重置 repetition=0、interval=1、EF 下降；EF 下限 1.3；第 1 次通过 interval=1、第 2 次 interval=6、第 3 次 ≈ prev×EF；quality=5 使 EF 上升；连续高分 interval≥30 → mastered；`getTodayQueue` 空/到期/未到期/mastered 过滤/newCap 默认值；断更>7 天降级重排；纯函数不可变（原对象不被修改） |
| `tests/unit/StorageService.test.ts` | 不存在 key 返回 null、set/get 序列化、remove、keys、clear、损坏 JSON 不抛错、内存实现与 localStorage 实现行为一致、StorageKeys 命名规约 |
| `tests/unit/AIService.test.ts` | `buildSystemPrompt` 空/多词/旅行场景角色注入；`parseQuality` 正常 0~5 / 大小写空格 / 缺失默认 3 / 越界默认 3；`stripQualityTag`；`MockAIService`；`ScriptedAIService` 顺序与循环、每场景≥3 套脚本；`OnDeviceAI` 模型未就绪 / 推理超时 / 低内存时降级 `ScriptedAI` 且返回可用内容；UI 层不绑实现的静态检查 |
| `tests/unit/CheckInService.test.ts` | `recordStudy` 累加秒数、达 **600s** 翻转 completed、未达不打卡、同日不重复、负数/异常参数抛错；`getStreak` 今日完成+前 3 天=4、今日未完成昨日完成=1、无记录=0、中间断点只计到断点；`getCheckInsInRange` 含端点与参数校验 |
| `tests/unit/StatsService.test.ts` | 空数据全零且数组长度正确、词状态分类统计、7/30/90 三窗口、打卡区间每日学词数与累计秒数、非法 days 抛错、**与 F-06 数据源误差 0** |
| `tests/unit/AccountService.test.ts` | `guest`/`authenticated` 会话态持久化与恢复、登录/登出、授权失败退回游客态、游客进度存在性探测（有/无）、`guest:` 与 `user:{uid}:` 分区互不串读 |
| `tests/unit/RetentionService.test.ts` | `isWithinWindow` D1/D7/D8 边界、`[today-6, today]` 恰 7 天、**跨月**、**闰年**；`filterWithinWindow` 正确过滤；`pruneOutsideWindow` **幂等**（重复执行结果一致）、不误删窗口内数据；`GUEST_RETENTION_DAYS=7` 常量生效 |
| `tests/unit/LoginPromptPolicy.test.ts` | `shouldPromptLogin` 全分支：**D1~D4 不弹 / D5 弹 / D6 不弹 / D7 弹 / D8+ 未登录每天弹 / 已登录不弹 / 空窗口不弹**；每日最多 1 次（`lastPromptDate` 同日不重弹、跨日重置）；`暂不` 当日不再弹次日继续；`不再提示` 设 `neverPrompt=true` 后**往后所有日期都不弹**；`不再提示` **不影响类型 B 合并选择弹窗**；返回「是否弹 + 弹窗类型」正确；FakeClock 驱动全部日期 |
| `tests/unit/MigrationService.test.ts` | 合并幂等（重复执行无重复词条/时长/打卡）；**合并前先按 7 天窗口过滤**，窗口外数据不合并/不回灌/不计入统计重算；冲突规则：同日打卡取较大值不重复累计、同词 StudyRecord 取较新且**不得回退到更差状态**、生词本按词条去重；合并后连续天数与统计重算误差 0；选择「不合并」时窗口内游客数据不删除、可再次合并；离线可完成 |

### 2.2 集成测试
| 文件 | 至少覆盖 |
|------|---------|
| `tests/integration/learningFlow.test.ts` | 播种 8 场景词库 → 取今日队列 → `ScriptedAI` 情景对话 → `[[QUALITY:n]]` 解析 → 调度回写 → 持久化 → **600s 打卡** → 连续天数 → 统计；MemoryStorage + MockAI + FakeClock 全链路无外部依赖 |
| `tests/integration/offlineFallback.test.ts` | 端侧模型未就绪 / 推理超时 / 低内存三类降级均不阻断 600s 打卡闭环；断网下词库/复习/打卡/统计可用 |
| `tests/integration/guestLifecycle.test.ts` | **D1→D8 FakeClock 全流程**：游客学习落盘 → D5 弹引导 → D6 不弹 → D7 弹 → D8 起每日弹（每天一次）→ 窗口外数据被清理 → `暂不` 当日不再弹 → `不再提示` 后永久不弹；游客态 F-07/F-08 **读取层门禁**不返回进度数据 |
| `tests/integration/loginAndMerge.test.ts` | 游客积累进度 → 模拟华为账号登录成功（类型 A → 授权 → 类型 B）→ 用户选择合并 → 仅带入 7 天窗口内进度 → 统计解锁且数据正确；选择「不合并」→ 窗口内数据保留、统计仍为账号态数据 → 之后再次发起合并成功；`不再提示` 不影响类型 B |
| `tests/integration/harmonyProject.test.ts` | 鸿蒙工程结构静态校验：`AppScope/app.json5`、`build-profile.json5`、`oh-package.json5`、`entry/src/main/module.json5`、`EntryAbility.ets`、5+ 页面 `.ets` 存在且非空；H5 预览 `index.html` 与入口存在；README 含运行命令 |

> 用例总数目标 **≥ 60 个**（参考件基线为 59/59 通过、覆盖率 90%+）。核心领域逻辑（Scheduler / RetentionService / LoginPromptPolicy / MigrationService / models / dateUtils）**语句覆盖率目标 100%**。

---

## 3. 测试约定

- 使用 `MemoryStorageAdapter` / `MockAIService` / `ScriptedAIService` / `FakeClock`（可注入 `clock: () => number`），保证确定性、无网络、无真机依赖
- 所有日期按**本地时间 00:00 日切**，`YYYY-MM-DD` 字符串；时间戳用 unix ms
- 每个 `describe` 用中文描述业务语义，`it` 写清输入与期望
- 断言要检查**对象不可变性**（纯函数不得修改入参）
- 禁止用 `any` 绕过类型；禁止 `it.skip` / `test.todo` 占位凑数

---

## 4. 实跑与修复流程（最多 2 轮）

1. `npm install` → `npm test` → `npm run test:coverage`，**保存真实输出**
2. **智能路由判定**（每轮测试后必须给出）：
   - 源码有 Bug → 判定 `Engineer`，把**具体错误信息 + 失败用例名 + 文件行号 + 期望/实际值**回传给 team-lead，由主理人转交工程师修复；不要自己改源码
   - 测试代码有 Bug → 判定 `QA`，自行修复测试并重跑
   - 全部通过 → 判定 `NoOne`，进入报告
3. 第 1 轮发现问题 → 反馈修复；第 2 轮回归验证。2 轮仍不过则出具报告并明确标注遗留问题，不得隐瞒。

---

## 5. 测试报告 `TEST_REPORT.md`（落盘到工程根目录）

必须包含：
1. **测试概览表**：套件数、用例数、通过/失败/跳过、执行时长、框架版本、被测代码范围、最终状态
2. **真实覆盖率表**（来自 `test:coverage` 实际输出，按文件列出 Stmts/Branch/Funcs/Lines）；若无法采集覆盖率须如实说明原因
3. **测试用例清单**：按文件分组，逐条列出用例名与结果
4. **关键验证结论**：SM-2 算法、600s 打卡、7 天滑动窗口、D5/D7/D8+ 弹窗状态机、`不再提示` 永久性、两类弹窗分离、合并幂等与窗口前置过滤、读取层门禁、端侧三类降级
5. **实跑命令与实际输出摘录**（贴真实终端输出片段）
6. **QA 智能路由判定**：`Engineer` / `QA` / `NoOne` + 理由
7. **遗留问题与改进建议**（非阻塞项）
8. 结论：MVP 是否可交付

---

## 6. 交付方式

1. 在 `tests/unit/` 与 `tests/integration/` 下写完所有测试文件，补齐/修正 `package.json` 测试脚本与测试框架配置（如缺失）
2. 实际执行测试并保存输出，按第 4 节做智能路由判定
3. 落盘 `TEST_REPORT.md`
4. 用 **SendMessage 只回传给 `team-lead`**：真实用例数与通过率、覆盖率、文件路径清单、路由判定、发现的问题与修复情况、遗留风险
5. 用 TaskUpdate 把任务 #4 标记 completed，保持待命等待 shutdown_request


---

## 7. 分阶段执行（交付总监补充，优先级最高）

本轮与工程师**并行**开工，`core/src` 源码此刻可能尚不存在。请严格分两阶段：

- **阶段 A（本轮）**：写完 `tests/unit/` 与 `tests/integration/` 下全部测试文件、测试配置与 `package.json` 测试脚本。**不要因为 import 暂时找不到模块就放弃、删用例或改用 stub**；按 `ARCHITECTURE.md` / `TASK_BREAKDOWN.md` 已固化的接口签名编写即可。完成后 SendMessage 回传「测试文件已就绪 + 文件清单 + 用例数」，**不要提前编造任何测试结果或通过率**。
- **阶段 B（等 team-lead 的 `代码已就绪` 通知）**：再执行 `npm install && npm test`、做智能路由判定、最多 2 轮回归、落盘 `TEST_REPORT.md`，并回传真实数据。

**OAQ-1 已裁决**：`SM2_SECOND_INTERVAL_DAYS = 6`（经典 SM-2，与 PRD F-04 一致），间隔序列 `1→6→15→38`。调度测试断言必须**基于 `constants.ts` 的常量推导**，禁止硬编码序列数字；测试报告须写明该取值。
