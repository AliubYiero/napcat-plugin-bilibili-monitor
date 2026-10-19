# ADR 0009: 迁移到模板三包架构

日期: 2026-10-20
状态: 已采纳

## 背景

本插件原为单包结构: 业务代码全在顶层 `src/` 下, 配置分散在 `types.ts` / `config.ts` / `core/state.ts` 三处手工同步, WebUI 与帮助产物各自为政, 文档范式 (docs/) 与构建/CI 也是一次性的。与此同时维护着一套模板工程 (napcat-plugin-template), 沉淀了可复用的目录骨架、配置单源、帮助产出管线、WebUI 骨架与 CI/发布链路。

两套并存导致同一件事有两份实现与两份纪律: 模板的改进进不来, 插件的经验也沉淀不回模板。

## 决策

**整体采用模板的 `packages/plugin` + `packages/shared` + `packages/webui` 三包 monorepo 布局与范式, 同时完整保留本插件业务与旧数据/指令兼容。**

采用的部分:

| 模板范式 | 本项目落地 |
| --- | --- |
| 三包 monorepo (pnpm workspace) | `packages/plugin` (发布物) / `packages/shared` (单一事实来源) / `packages/webui` |
| 配置单源 FIELDS | `shared/src/config.ts` 派生类型/默认值/清洗/原生面板/WebUI 表单 (见 ADR 0010) |
| 帮助产出管线 (cmds 权威源 → 三类产物) | `scripts/generateHelp/cmds/` → PNG + `helpText.generated.ts` + `helpData.generated.ts` |
| WebUI 页面集与 API 契约 | 页面 `status` / `sessions` / `help`; 无鉴权路由 `getNoAuth` |
| 指令三层链路 | `messageHandler` → `instructionRegistry` / `instructionDispatch` → `handlers/<模块>` |
| 消息发送收敛 | `utils/messageSend.ts` 为唯一发送出口 (原 `handlers/utils.ts`) |
| 本地类型垫片 | `types/napcat-types/` + `src/onebotEvent.ts` (见 ADR 0003) |

有意**不**照搬的部分:

- **会话级配置默认开启**: 模板默认关闭 (`enabled === true`), 本项目默认开启 (`enabled !== false`, 见 ADR 0006)。
- **数据文件版本包裹**: 保留 `{ version: 1, data }` 包裹与 `BaseRecordStore` (模板更轻, 不强制), 以延续旧数据迁移约定 (见 ADR 0007)。
- **业务监控页**: 模板有业务数据面板; 本项目 WebUI 不含直播/动态监控页 (推送在 QQ 侧消费), 只保留状态/会话/帮助。

## 理由

- **一份纪律**: 范式文档、构建脚本、CI/发布链路与模板同源, 改进双向流动。
- **配置单源消除漂移**: 原先四处手工同步是历史 bug 的高发区, FIELDS 单源 + 单测兜底后无此问题。
- **包边界即依赖边界**: `shared` 是唯一跨包事实来源, 前端与后端不再各自定义同名类型。
- **兼容优先**: 迁移以"行为不变"为准绳——旧指令、旧数据文件、旧配置键 (经迁移) 全部保留语义。

## 后果

- 数据文件新增一个: `bilibiliSessionConfig.json` (会话配置, 见 ADR 0006 / 0007), 拓扑总数变为"6 业务文件 + 1 会话配置"。
- 工作目录名称变更: `src/store/<name>Store.ts` (无 `.store` 中缀) 等命名约定以 `AGENTS.md` 为准, 范式文档同步更新。
- 验证手段升级为三段式: `pnpm lint` (biome) + `pnpm check` (typecheck + test) + `pnpm build`, CI 与发版同序。
- WebUI 成为独立构建产物 (单文件 HTML), 不再是后端内嵌模板; 会话 API 完全采用模板形态 (`/sessions*`), 旧的 `/groups*` 路由移除。
- 本决策约束全仓结构, 后续新增功能一律落在对应包内; 想偏离模板范式必须先修订本 ADR。
