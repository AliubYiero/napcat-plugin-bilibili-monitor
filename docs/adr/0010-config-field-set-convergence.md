# ADR 0010: 配置字段集收敛

日期: 2026-10-20
状态: 已采纳

## 背景

原配置包含: `enabled` (插件级启停)、`debug`、`commandPrefix`、`adminUsers`、`groupConfigs` (群级开关)、`pushTypes`、轮询间隔等。随着模板化改造 (ADR 0009) 与权限/会话模型定型, 其中若干字段的归属发生了变化: 插件启停其实是宿主职责, 指令前缀在本插件中是固定语义, 群级开关改由会话配置承载。

保留这些字段会带来两个问题: 一是配置面出现"谁的职责"含糊的地带 (如 `enabled` 与宿主启停并存), 二是默认值语义需要在两处 (配置文件 + 数据文件) 分别声明。

## 决策

**配置字段集固定为以下 6 项, 不含插件全局启停与指令前缀:**

| 配置项 | kind | 说明 |
| --- | --- | --- |
| `adminUsers` | `stringList` | 超级管理员 QQ 号 |
| `triggerModes` | `multiSelect` | 指令触发方式 (`prefix` / `atBot`, 相互独立, 空数组 = 不触发) |
| `pollIntervalSeconds` | `number` | 直播状态轮询间隔 |
| `dynPollIntervalSeconds` | `number` | 动态轮询间隔 |
| `pushTypes` | `multiSelect` | 需要推送的变化类型 (空数组合法 = 不推送) |
| `mentionGroupSize` | `number` | 开播 @全体成员每组 @ 的人数 |

配套决定:

- **插件全局启停不进配置**: 由 NapCat 宿主负责。旧配置中的 `enabled: false` 在迁移时只告警, 不代为实现启停。
- **指令前缀是内部常量** `COMMAND_PREFIX = '#bili'`, 不可配置; 旧 `commandPrefix` 在迁移时忽略并告警。
- **会话级开关移出配置**: 由 `bilibiliSessionConfig.json` 承载 (见 ADR 0006), 旧 `groupConfigs` 在迁移时转换为会话配置。
- **`debug` 弃用**; 旧 `adminUser` (单数) 迁移为 `adminUsers` 数组。
- 迁移一次性完成并留备份 `<configFileName>.YYYYMMDDHHmmss.bak`; 不支持/已弃用的键只告警不静默丢弃信息。

## 理由

- **职责清晰**: 启停与指令前缀是本插件"不打算做成可配"的部分, 留在配置里只会制造歧义。
- **默认值单源**: 会话默认值语义集中在会话配置 (ADR 0006), 配置项不再重复声明。
- **最小配置面**: 6 项全部是用户真有选择空间的字段, 每一项都能在 WebUI / 原生面板直观呈现。

## 后果

- 新增/修改配置项只改 `shared/src/config.ts` 的 `FIELDS` 一处 (见 config-pattern.md), 其余由描述符派生。
- 旧配置文件升级路径由 `configMigration.ts` 保证; 弃用键在日志中可见, 用户可自行清理。
- 想恢复某个已移除的配置项 (如可配置前缀) 需要修订本 ADR, 并同步接收层触发判定逻辑。
