# AGENTS.md — NapCat Bilibili 监测插件

本文件是本仓库对 AI 编程代理的唯一指令来源。范式体系的正文在 `docs/`, 领域术语在 `CONTEXT.md`; 本文件只做导航、速查与高频片段, 不复制范式细节。

业务: 监听 Bilibili 直播间状态与主播动态, 推送到指定 QQ 会话; 推送内容为 SVG 渲染卡片 (失败回退纯文本)。动态/视频监听需 B 站登录 (私聊扫码)。

技术栈: TypeScript (ESM) + pnpm monorepo。Vite 打包插件后端为 `dist/index.mjs`; React + Vite + Tailwind 构建 WebUI (单文件 HTML)。插件生命周期钩子与 OneBot 11 交互, 类型来自 `napcat-types` (经本地垫片, 见下)。

## 快速导航

| 我要做什么 | 读哪篇 |
| --- | --- |
| 全局约束、强度分级、分层、生命周期铁律、ADR 索引 | [docs/development-pattern.md](docs/development-pattern.md) (总纲) |
| 数据持久化、单例 store、数据文件拓扑、会话级配置承载 | [docs/store-pattern.md](docs/store-pattern.md) |
| 配置字段语义、清洗纪律、运行时读写、配置迁移 | [docs/config-pattern.md](docs/config-pattern.md) |
| 指令接收→分发→执行三层链路、命名空间、生成 JSON 配置 | [docs/instruction-pattern.md](docs/instruction-pattern.md) |
| 发消息、消息段工厂、@全体成员三重前置校验 | [docs/message-send-pattern.md](docs/message-send-pattern.md) |
| 帮助输出: cmds 权威源 → 生成 → 产物 → 变体选择 | [docs/help-output-pattern.md](docs/help-output-pattern.md) |
| WebUI: 页面集与 hash 路由、声明式配置表单、无鉴权 API、样式规范 | [docs/webui-config-pattern.md](docs/webui-config-pattern.md) |
| 领域术语 (含 _Avoid_ 反用词)、默认值语义 | [CONTEXT.md](CONTEXT.md) |
| 难逆转的决策记录 | [docs/adr/](docs/adr/) |

推荐阅读顺序: 总纲 → store → config → instruction → message-send / help-output → webui。

## 仓库结构

```
packages/plugin   插件后端 (发布物)
  src/index.ts                 生命周期入口 (plugin_init / plugin_onmessage / plugin_cleanup / 配置钩子)
  src/config.ts                DEFAULT_CONFIG + buildConfigSchema(ctx, loginStatus) + 面板登录状态块
  src/types.ts                 仅重导出 shared 类型, 不重复定义
  src/onebotEvent.ts           自持 EventType 枚举 (唯一以「值」用的类型)
  src/core/state.ts            pluginState 全局状态单例
  src/core/admin.ts            权限: 四档角色推导 + hasRole 线性比较
  src/core/atAll.ts            @全体成员 能力与配额检查
  src/utils/atBotPrefix.ts     @机器人 触发判定 + CQ 段剥离 (纯函数)
  src/utils/messageSend.ts     全插件唯一发送出口 + 消息段工厂
  src/utils/helpMessage.ts     帮助变体选择 (角色 + 会话类型)
  src/store/                   BaseStore / BaseRecordStore / storeFile + 6 个数据文件 store
  src/store/migration/         runDataMigration (旧数据) 与 configMigration (旧配置)
  src/services/                apiService / sessionConfigService + live|dyn|user 业务
  src/handlers/messageHandler.ts       接收层 (会话门控 → 触发判定 → 切词 → 分发)
  src/handlers/instructionRegistry.ts  指令注册表 (装配层)
  src/handlers/instructionDispatch.ts  分发层 (统一权限/作用域校验)
  src/handlers/{live,dyn,user}/        执行层 handler (live 下有 online/ 中间层)
  src/handlers/help/                   帮助结构化产物 (helpData.generated.ts, 生成物)
  scripts/generateHelp/                帮助生成脚本 (权威源 cmds/)
  types/napcat-types/                  上游类型垫片 (手工抄录, 勿当业务代码改)
  test/                                vitest 单测 (与 src 纯函数/store 模块对应)
packages/webui    React SPA (独立构建, 单文件 HTML)
  src/pages/                           StatusPage (内嵌配置表单) / SessionsPage / HelpPage
  src/components/configFields/         声明式配置表单控件 (含交互式 LoginField)
  src/utils/loginView.ts               登录卡片视图解析 (纯函数)
packages/shared   跨包共享 (单一事实来源)
  src/config.ts             FIELDS / PluginConfig / COMMAND_PREFIX / getDefaultConfig / sanitizeConfig / parseStringList
  src/login.ts              LoginStatus / LoginSessionSnapshot 登录态与扫码会话契约
  src/displayTokens.ts      {{...}} 占位符常量与 resolveDisplayContent
  src/ui.ts                 WebUI 骨架 PAGES / DEFAULT_PAGE
  src/help.ts               帮助面板类型 (与上游渲染服务手工同步)
  src/index.ts              会话类型 SessionType / SessionConfig / ApiResponse
docs/             范式文档体系 + ADR
CONTEXT.md        领域术语表
.example/         NapCat 官方插件开发文档 (外部参考, 勿改)
```

**文件命名约定**: 文件名默认小驼峰; `src/store/` 例外, 保留 `bili` 前缀且类名后缀并进文件名 (`biliLiveMonitorStore.ts` / `sessionConfigStore.ts`); 基类与类型文件按角色命名 (`BaseStore.ts` / `BaseRecordStore.ts` / `storeFile.ts` / `BiliDynamic.type.ts`)。类 / 接口 / type 别名用大驼峰; 生成物保留 `.generated.ts`; 测试保留 `.test.ts`; 目录一律小驼峰 (`configFields/`)。

## 构建 / 验证 / 部署

```bash
pnpm install                 # 安装依赖

pnpm build                   # 构建 webui + plugin (纯构建, 不连调试服务; 输出 packages/plugin/dist)
pnpm test                    # 全部 vitest 单测 (plugin/test 与 webui/test)
pnpm typecheck               # 全部包类型检查 (tsc --noEmit)
pnpm check                   # typecheck + test (提 PR / 发版前的判定命令)
pnpm lint                    # biome check (全仓 TS; 忽略类型垫片、*.generated.ts 与 webui/index.html)
pnpm dev:webui               # WebUI 前端开发服务器 (实时预览)
pnpm help:generate           # 重建帮助产物 (产物入库)

pnpm deploy                  # 构建后热部署 + 重载 (需 NapCat 端启用 napcat-plugin-debug)
pnpm deploy:dev              # dev 部署: 以 <name>-dev 新 id 注册, 不覆盖远程正式插件

# 亦可在 packages/plugin 或 packages/webui 目录内单独执行各自的 build / test / typecheck
```

- 验收一律以 `pnpm lint && pnpm check && pnpm build` 全绿为准 (CI 与 release 亦按此顺序)。
- 热部署插件只在 `--mode deploy` / `--mode deploy-dev` 下挂载; `build` 与部署是独立链路。
- `deploy:dev` 会改写 `dist/package.json` 的 `name`/`plugin`/`version` 为 `-dev` / `[DEV] ` 标注, 使配置与数据目录按 id 隔离。
- 构建产物除 `index.mjs` 与精简 `package.json` 外, 还包含 `webui/` 与 **`assets/`(帮助图片)**; 漏掉 `assets` 的表现是帮助**静默降级成文本**, 故 release 流程对缺件直接失败。

**napcat-types 垫片 (重要)**: `napcat-types` 只发布裸 `.ts` (零 `.d.ts`), 不是可独立编译单元, 直接引入会让 `tsc` 深入第三方源码树并大量报错。故 `packages/plugin/tsconfig.json` 用 `paths` 把 `napcat-types/*` 重定向到本地垫片 `packages/plugin/types/napcat-types/` (0.0.16 的信实副本, OneBot 消息类型族退化为 `any`)。垫片手工抄录, 升级 `napcat-types` 时需对照同名文件手动同步; 插件对 `napcat-types` 无运行时/构建依赖 (唯一以「值」使用的 `EventType` 已自持于 `src/onebotEvent.ts`)。因此**不需要**额外的 `typecheck:test` 噪音过滤脚本, `pnpm typecheck` 即源码零错。

## 硬规则清单 (仅 docs 的「必须」档)

**生命周期与分层** ([总纲](docs/development-pattern.md))
- 【必须】模块加载期 (import 时) 不得触碰 `ctx` / `ctx.dataPath` / `ctx.logger`, 不得文件 IO, 不得调用发送函数。
- 【必须】单例可加载期导出, 但构造期零 IO; 真正的初始化只在 `plugin_init` 之后。
- 【必须】全局状态只能经唯一单例 `pluginState` 访问, 各模块不自行持有 ctx 或逐层传参。
- 【必须】`plugin_init` 启动顺序固定: `init(ctx)` → `runDataMigration()` → `runConfigMigration()` → `loadConfig()` → `await fetchSelfId()` → 初始化动态运行时快照 → 重建配置 UI → 注册 API 路由与 WebUI 页面 (`registerApiRoutes` / `registerWebUI`) → 注册登录态回调 → 启动轮询。
- 【必须】初始化失败的取舍: 迁移与存储失败抛错阻止启动; 轮询 / WebUI / 登录态失败降级继续。
- 【必须】每层只做自己的事 (接收层不认识指令语义、分发层不做业务、store 不含业务规则)。
- 【必须】外部 API 层与业务解耦 (HTTP 封装只管请求/响应, 不做业务判断)。
- 【必须】领域术语以 `CONTEXT.md` 为唯一权威, 新术语定型即写入 (带 _Avoid_)。

**store / 持久化** ([store-pattern](docs/store-pattern.md))
- 【必须】数据文件拓扑固定为 6 个 (见 ADR 0007), **不得自行新增或合并**: `bilibiliCookie.json` / `bilibiliLimits.json` / `bilibiliLiveMonitors.json` / `bilibiliDynMonitors.json` / `bilibiliDynRuntimeData.json` / `bilibiliLiveRoomData.json`, 外加会话配置 `bilibiliSessionConfig.json`。
- 【必须】除 Cookie 外统一 `{ version: 1, data: ... }` 包裹 (逻辑在 `store/storeFile.ts`); 数组型继承 `BaseStore<T>`, 键值型继承 `BaseRecordStore<T>`。
- 【必须】同一份数据文件全进程唯一读写入口; 延迟实例化 (文件只 `export class`, 使用方在方法内 `getInstance()`)。
- 【必须】写入统一走立即持久化方法; 不把 `saveToFile` 改成 `public`。
- 【必须】`find` / `getAll` 返回内部引用, 修改一律走 `set` / `update` / `upsert` 等方法。
- 【必须】迁移模块 (`src/store/migration/`) 只可依赖 `pluginState` 与纯函数 `storeFile`, **严禁 import 任何 store / service** (避免在迁移期实例化 store)。

**会话级配置** ([store-pattern](docs/store-pattern.md) · [config-pattern](docs/config-pattern.md))
- 【必须】会话配置不进配置文件, 由 `bilibiliSessionConfig.json` (键 `type:id`) 承载, 唯一读写入口是 `sessionConfigService`。
- 【必须】**默认开启**: 判定为 `enabled !== false` (缺记录视为启用); `liveMentionAll` 反向判定 `=== true` 且仅群会话有效。
- 【必须】只持久化非默认值 (`enabled === false` / 群 `liveMentionAll === true`), 恢复默认即删除该条记录。
- 【必须】会话门控在消息入口短路 (群与私聊都过门控), 业务层不再重复判定启用状态。

**配置** ([config-pattern](docs/config-pattern.md))
- 【必须】新增/修改配置项只改 `packages/shared/src/config.ts` 的 `FIELDS` 描述符一处 (类型/默认值/清洗/原生面板/WebUI 表单随之派生)。
- 【必须】配置字段集固定为 `adminUsers` / `triggerModes` / `pollIntervalSeconds` / `dynPollIntervalSeconds` / `pushTypes` / `mentionGroupSize`; 不含插件启停与指令前缀 (宿主职责 / 内部常量 `COMMAND_PREFIX = '#bili'`)。仅布局/展示的 `section` / `display` / `login` 不含 key、不落盘、不进 `PluginConfig`。
- 【必须】一切外部输入 (磁盘、WebUI、旧配置迁移) 的配置写回必经 `sanitizeConfig`; `updateConfig` 仅限内部可信调用方。
- 【必须】清洗是纯函数且不抛错: 类型不符回退默认, 数值超区间夹到 `min`/`max` (注意 `0` 会被夹到 `min`, 不是回退默认)。
- 【必须】描述符是 ctx-free 纯数据; 需要 ctx 的 Schema 映射必须参数注入 (`buildConfigSchema(ctx, loginStatus)`), 禁止静态 import 业务模块。
- 【必须】运行时数据 (如 `stats` 与登录状态) 只允许进入 `display` / `login` 展示块, 不得进入可保存配置项。
- 【必须】旧配置迁移一次性完成并留备份 `<configFileName>.YYYYMMDDHHmmss.bak`; 不再支持的键 (`enabled` / `debug` / `commandPrefix` / `groupConfigs` / `adminUser`) 只告警不静默丢弃信息。

**权限** ([instruction-pattern](docs/instruction-pattern.md))
- 【必须】推导而非配置 (除 `adminUsers` 外全部从事件推导); 入口一次性推导 `UserRole`, 下游复用。
- 【必须】线性比较 `hasRole(userRole, required)` (即 `ROLE_LEVEL >=`), 不写档位矩阵。
- 【必须】`getUserRole` 短路顺序 superAdmin → privateUser → admin → user, 一票定档; 非好友私聊降为 user。
- 【必须】`adminUsers` 在 `sanitizeConfig` 一次性解析为 `string[]`, 运行期只做包含检查。

**指令分发** ([instruction-pattern](docs/instruction-pattern.md))
- 【必须】接收层四步顺序固定 (会话门控 → 触发判定 → 切词 → 分发), 整函数包 try/catch。
- 【必须】接收层与 handler 内不做权限校验; 校验时机与失败反馈收敛在分发层。
- 【必须】失败反馈不对称: 权限不足与未知指令静默, 作用域不符回复提示。
- 【必须】`triggerModes` 中 `prefix` 与 `atBot` 相互独立 (空数组 = 不触发); 只剥离开头第一个匹配 `selfId` 的 at 段, 剥离后 `trimStart()`。
- 【必须】`selfId` 取自 `pluginState.selfId`, 不硬编码; CQ 大小写不敏感, `qq` 精确等于 `selfId`。
- 【必须】指令名统一小写后再比对, **注册表键必须全小写**; 新增指令 = 注册表加一行 + handler 独立文件。
- 【必须】`scopeRules` 按参数个数匹配**第一条**命中规则, 未命中即静默 (形态须枚举完备, 同一 `args` 不可写两条)。
- 【必须】命名空间支持三级收敛 (`live → online → add`), 三级/二级/一级共用同一校验终点。

**消息发送** ([message-send-pattern](docs/message-send-pattern.md))
- 【必须】所有发送走 `src/utils/messageSend.ts` 的发送工具, 禁止业务代码直接 `ctx.actions.call('send_msg' | ...)`。
- 【必须】范围内容器消息段一律用 `createXxxMessage` 工厂构造, 禁止手写字面量 (范围外类型须过 `OB11MessageData` 类型检查)。
- 【必须】发送函数统一返回 `Promise<boolean>`, 内部 try/catch、失败记日志、不抛出。
- 【必须】混合字符串与消息段时统一升级为消息段数组。
- 【必须】@全体成员 三项前置检查缺一不可, 顺序固定: 会话类型 → 发起人 admin → 机器人 `can_at_all` 与配额。

**帮助输出** ([help-output-pattern](docs/help-output-pattern.md))
- 【必须】内容有唯一权威源 `scripts/generateHelp/cmds/`, 产物一律由脚本生成 (文件头标注禁止手改); 变体按「角色 + 会话类型」决定。
- 【必须】三类产物: 图片 `src/assets/{cmdId}-{Role}.png`、文本 `src/handlers/<模块>/helpText.generated.ts`、结构化 `src/handlers/help/helpData.generated.ts` (供 `GET /help`); 三者均提交入库。
- 【必须】图片优先、文本回退; `isAdmin`/`isSuperAdmin` 互斥, `onlyPrivate`/`onlyGroup` 互斥。
- 【必须】权限过滤: User 看无标记, Admin 看无标记 + `isAdmin`, SuperAdmin 看全部。
- 【必须】`HelpVariant` 与 PNG 文件名、`HELP_TEXT_MAP` 键一一对应。

**WebUI / API** ([config-pattern](docs/config-pattern.md))
- 【必须】页面集固定为 `status`(内嵌配置表单) / `sessions` / `help`, 骨架元信息单源在 `shared/src/ui.ts`, URL 用 hash 且为当前页唯一真相源。
- 【必须】插件自带 WebUI 页面调用无鉴权路由 (`router.getNoAuth` / `postNoAuth`)。
- 【必须】`POST /config` 走 `pluginState.updateConfig` (内部已清洗); 会话启停走 `sessionConfigService`; 帮助面板直接返回生成产物。
- 【必须】登录卡 (`login` kind) 通过无鉴权路由消费 `/login/*`; 二维码图片走 `GET /login/qrcode/image` (`no-store`), 不在前端内联 base64。登录入口仍是指令 `#bili user login`, WebUI 不提供独立登录页。

## 代码片段

**状态与日志**
```ts
import { pluginState } from '../core/state';

pluginState.config.triggerModes;      // 读配置
pluginState.logger.info('处理消息');  // 日志 (等价 ctx.logger)
const ctx = pluginState.ctx;          // init 后可用, 未初始化访问会抛错
const selfId = pluginState.selfId;    // 机器人 QQ (init 后异步获取, 可能为空串)
```

**配置: 声明源与写回**
```ts
// packages/shared/src/config.ts 是唯一声明源: PluginConfig 加字段 + FIELDS 加同 key 描述符。
// 默认值 / 清洗 / 原生面板 / WebUI 表单均由 FIELDS 派生, 不要在其他文件重复罗列字段。

import { sanitizeConfig } from 'shared'; // 亦经 '../core/state' 间接使用

pluginState.updateConfig({ pollIntervalSeconds: 120 }); // 内部合并 + sanitizeConfig + 落盘
pluginState.replaceConfig(nextConfig);                  // 整体替换 (同样清洗)
```

**会话配置 (群/好友)**
```ts
import { sessionConfigService } from '../services/sessionConfigService';

sessionConfigService.isSessionEnabled(id, 'group');  // 单一查询入口; 默认开启 (!== false)
sessionConfigService.isLiveMentionAllEnabled(id);    // 仅群会话; 默认关闭 (=== true)
sessionConfigService.setSessionEnabled(id, 'group', false);
```

**消息发送与消息段工厂**
```ts
import {
    sendReply, sendGroupMessage, sendPrivateMessage, sendForwardMsg,
    createTextMessage, createReplyMessage, createImageMessage,
    createAtMessageWithSeparator, createForwardNode,
} from '../utils/messageSend';

await sendReply(ctx, event, '纯文本直接传字符串');          // 有 event 用 sendReply
await sendGroupMessage(ctx, groupId, [createTextMessage('推送')]); // 无 event 按目标选
```

**业务数据持久化 (非会话配置)**
```ts
const data = pluginState.loadDataFile<MyData>('my-data.json', { items: [] });
pluginState.saveDataFile('my-data.json', data);
pluginState.getDataFilePath('cache.json'); // 数据文件存于 ctx.dataPath 下
```

**定时器**
```ts
const timer = setInterval(() => { /* ... */ }, 60_000);
pluginState.timers.set('my_job', timer);
// pluginState.cleanup() 会遍历 timers 全部 clearInterval, 无需手动逐个清理
```

**OneBot Action 调用 (四参模式)**
```ts
const groups = await ctx.actions.call(
    'get_group_list',
    {},                       // 无参 Action 传 {} 而非 void 0
    ctx.adapterName,
    ctx.pluginManager.config,
);
```

**路由注册与页面**
```ts
ctx.router.getNoAuth('/status', handler);  // 插件自带 WebUI 页面调用 → 无鉴权
ctx.router.get('/endpoint', handler);      // 需 NapCat WebUI 登录鉴权
ctx.router.page({                          // 页面 (侧边栏入口)
    path: 'dashboard',
    title: '插件控制台',
    htmlFile: 'webui/index.html',
});
```

**事件类型判断**
```ts
import { EventType } from '../onebotEvent';

if (event.post_type !== EventType.MESSAGE) return;  // 只处理消息事件
```

## 注意事项

- **日志**: 统一 `pluginState.logger` / `ctx.logger`, 方法为 `log`/`debug`/`info`/`warn`/`error`。
- **生成物**: `*.generated.ts` 与 `src/assets/*.png` 一律由 `pnpm help:generate` 产出并提交, 禁止手改。
- **外部渲染依赖**: 卡片渲染依赖插件 [napcat-plugin-svg-render](https://github.com/AliubYiero/napcat-plugin-svg-convert) (≥1.1.0, 默认端口 6099); 宿主须安装思源黑体 (Noto Sans CJK SC), 否则尺寸计算偏差会错行溢出。渲染不可用/失败时自动回退纯文本。
- **二维码依赖**: `qrcode` 的 `browser` 字段会把默认入口换成 `lib/browser.js` (无 `toFile`), 插件侧必须从 `qrcode/lib/server.js` 引入并补本地类型 (`src/qrcodeServer.d.ts`); 否则打包后扫码登录报 "QRCode.toFile is not a function"。
- **禁止 emoji**: 代码中不使用 Unicode emoji 字符。需要装饰性输出时用颜文字, 例如:
  ```ts
  ctx.logger.info('(｡･ω･｡) 插件初始化完成');
  ctx.logger.warn("(；′⌒`) 配置项缺失, 使用默认值");  // 该颜文字含反引号, 见下条
  ```
- **模板字符串反引号安全**: 模板字符串内禁止出现未转义的反引号 (部分颜文字含 `` ` ``), 否则会提前闭合字符串。含反引号的文本用字符串拼接或转义。
- **图标**: 前端用 SVG 组件 (参考 `packages/webui/src/components/Icons.tsx`), 不用 emoji。
- **WebUI 风格**: 主题色粉色 `#FB7299` (`bg-primary` / `text-primary`); 卡片用 `.card`; 激活态 `bg-primary text-white`; 暗色用 `dark:bg-[#1e1e20]`。禁止使用 CSS 渐变, 改用纯色。新增页面/组件须延续现有设计语言。
- **发布**: 推送 `v*` tag 触发 `.github/workflows/release.yml` (自动 `pnpm check` + `pnpm build`, 打包含 `assets/` 的 zip 并校验缺件); 版本号在 `packages/plugin/package.json` 维护。

## 参考

- 总纲 (强度分级 / 生命周期铁律 / 分层 / ADR 纪律): [docs/development-pattern.md](docs/development-pattern.md)
- 架构决策记录: [docs/adr/](docs/adr/)
- 领域术语与默认值语义: [CONTEXT.md](CONTEXT.md)
- NapCat 官方插件开发文档: [.example/plugin/](.example/plugin/) (`api/`、`mechanism.md`、`structure.md` 等)
- OneBot 11 API 手册: https://napcat.apifox.cn/
