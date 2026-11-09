# 项目记忆（MEMORY.md）

## 当前任务

✅ 已完成：2026-11-09 「单词盒子」鸿蒙 7 App 0→1 交付（6 份文档 + 108 工程文件 + 231/231 测试全绿，覆盖率 94.14%）。详见 `wordbox-harmony-delivery/DELIVERY_SUMMARY.md`。

## 常驻约定

- 交付根目录：`wordbox-harmony-delivery/`（工作区根 `C:/Users/wuyanying/WorkBuddy/2026-11-09-10-16-04/`）
- 三轨同源：`core/src` 是唯一事实源；`harmony/.../ets/core/` 是机械镜像（改内核后必须 `npm run sync:core`，禁止手改镜像）
- 常量唯一来源 `core/src/models/constants.ts`；`SM2_SECOND_INTERVAL_DAYS=6`（经典 SM-2，OAQ-1 已裁决）
- 测试必须串行：`npm test` 已固化 `--no-file-parallelism --maxWorkers=1`（本沙箱并行会随机漏收集 + EPERM）
- 本机 `curl` 走代理，访问本地服务须 `--noproxy '*'`；Vite 只监听 IPv6 `[::1]`，用 `http://localhost:PORT`
- 本工作区**不是 git 仓库**，无 commit 记录
