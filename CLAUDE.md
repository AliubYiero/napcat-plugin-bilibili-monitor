# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

NapCat 插件(QQ 机器人),监听 Bilibili 直播与动态并推送通知:直播开播/下播、标题/分区变化,动态发布推送(含图文/转发/视频/文章/表情包等类型解析)。推送内容为 SVG 渲染的卡片图片(渲染失败回退纯文本)。TypeScript,pnpm,Vite 构建为单文件 ESM(`dist/index.mjs`),无测试框架。动态/视频监听需要 B 站登录(Cookie),通过私聊扫码登录(`#bili user login`)。

## 常用命令

```bash
pnpm install            # 安装依赖
pnpm run build          # 构建插件(vite build,输出 dist/)
pnpm run watch          # watch 构建
pnpm run typecheck      # tsc --noEmit(类型检查,无 lint/test 命令;详见 ADR 0003)
pnpm run format         # biome format --write
pnpm run help:generate  # 通过 napcat-help-generate 服务 API 生成帮助图片与文本(详见 docs/help-output-pattern.md)
pnpm run build:webui    # 构建前端(src/webui 独立子项目,React + Tailwind)
pnpm run dev:webui      # 前端开发服务器
```

调试/热重载依赖 NapCat 端的 `napcat-plugin-debug` 插件,通过 `.env` 中的 `WS_URL` 与 `TOKEN` 连接远程 NapCat 实例。vite.config.ts 中的 `napcatHmrPlugin` 负责构建后自动部署并热重载。

- 注意:README 提到的 `pnpm run deploy` / `pnpm run dev` 当前不在 package.json scripts 中,实际只有 `build` / `watch`。
- Biome 配置:4 空格缩进、单引号、行宽 70。webui 是独立 pnpm 子项目(有自己的 lockfile),主项目 biome 不覆盖它。

## 开发范式(先读)

本项目遵循 `docs/development-pattern.md` 总纲统摄的通用范式体系。写代码前按主题读对应文档:

| 主题 | 文档 |
| --- | --- |
| 总纲:骨架/生命周期铁律/分层模型/ADR 索引 | `docs/development-pattern.md` |
| store 持久化(单例、延迟实例化) | `docs/store-pattern.md` |
| 配置全链路(四环节、清洗、Schema、会话开关) | `docs/config-pattern.md` |
| 指令分发(接收→分发→执行、四档权限、作用域) | `docs/instruction-pattern.md` |
| 消息发送(发送工具、消息段工厂) | `docs/message-send-pattern.md` |
| 帮助输出(cmd 权威源 → API 生成 → 变体) | `docs/help-output-pattern.md` |
| 领域术语(含 _Avoid_ 反用词) | `CONTEXT.md` |
| 架构决策记录 | `docs/adr/` |

## 本项目实例化

范式在本项目的具体落地,与通用范式的差异或具体取值记录于此。

### 生命周期与关键约束

插件入口 `src/index.ts` 导出 NapCat 生命周期函数(`plugin_init` / `plugin_onmessage` / `plugin_cleanup` / 配置钩子)。核心约束(总纲铁律):**模块 import 阶段 `ctx` 尚未初始化**,`pluginState.ctx` 在 `plugin_init` 调用 `pluginState.init(ctx)` 之前访问会抛错。任何模块在加载期不得触碰 `ctx`、`ctx.dataPath` 或做文件 IO。

### 分层

```
index.ts (生命周期)
  → handlers/    指令解析与处理(message.handler 解析/CD → instruction.handler 分发 → live|dyn|user 子指令 handler)
  → services/    业务逻辑
      live: 轮询 polling、监听数据 store、上限 limit、卡片推送 pushCard
      dyn:  轮询 polling、解析 parser(纯函数)、推送 push、上限 limit
      user: 扫码登录 login(二维码生成/轮询/会话互斥)
      通用: WebUI API 路由 api.service、SVG 渲染 svgRender.service
  → store/       持久化层(JSON 文件读写)
  → api/         B 站 HTTP 接口封装(baseRequest / authRequest,authRequest 携带登录 Cookie;登录态查询 getNavInfo、动态 getDynamicFeed、扫码 qrcodeLogin)
```

### 命名规范

- 文件名一律小驼峰(`pushCard.service.ts`、`helpMessage.ts`),类型后缀(`.handler` / `.service` / `.store`)保留;类、接口、type 别名用大驼峰。
- services / handlers 按模块分子文件夹(`live/`、`dyn/`、`user/`),文件名不再带模块前缀——目录已表达模块归属(如 `services/live/polling.service.ts` 而非 `services/bili-live-polling.service.ts`)。
- 例外:`src/store/` 不分模块子目录,文件保留 `bili` 前缀(`biliLive.store.ts`);`BaseStore.ts`、`BiliDynamic.type.ts` 按类型名命名,不适用小驼峰规则。

### 全局状态

`src/core/state.ts` 的 `pluginState` 是唯一持有 `ctx` 的全局单例:封装 config 读写(带 `sanitizeConfig` 类型清洗)、`loadDataFile` / `saveDataFile`(data 目录下的 JSON 持久化)、logger、定时器注册表。所有模块通过 `pluginState.ctx.logger` 等访问运行时对象,不逐层传参。

### 用户角色取值

四档权限:`user`(含非好友私聊)< `admin`(群管理员)< `privateUser`(好友私聊用户,按 `event.sub_type === 'friend'` 判断,等同 admin 权限组)< `superAdmin`(`adminUsers` 配置,逗号分隔字符串经 `sanitizeConfig` 预解析为数组)。帮助输出按"角色 + 会话类型"决定版本(见 `src/utils/helpMessage.ts`),不是按角色一一对应。

### 推送卡片与解析

直播/动态变化通知由 `services/live/pushCard.service.ts` / `services/dyn/push.service.ts` 生成 SVG,经 `svgRender.service.ts` 调用渲染插件转图片发送;渲染不可用/失败时自动回退纯文本。新增推送字段需同时改卡片模板与文本回退。动态解析集中在 `parser.service.ts`(纯函数模块,无 IO,吸收全部动态类型模板/置顶判断/零宽字符清理/链接拼接逻辑)。

### 指令注册

新增指令在 `src/handlers/instruction.handler.ts` 的 `instructionSetMapper`(模块 → 子指令 → 定义)注册,可声明 `requiredRole` / `scope`,或用 `scopeRules` 按参数个数区分形态权限(如 `live max`)。帮助图片位于 `src/assets/*.png`,部署到 data 目录上级的 assets。帮助文本与图片由 `pnpm run help:generate` 从 `scripts/generateHelp/cmds/` 权威源生成(`src/handlers/*/helpText.generated.ts` 为生成文件,禁止手改)。

### 配置

`src/config.ts` 定义默认配置与 WebUI 配置 Schema(`plugin_config_ui`)。配置变更经过 `sanitizeConfig` 清洗。登录状态(Cookie)变化时通过 `biliCookieStore.onLoginStateChange` 回调重建配置 Schema 以刷新 WebUI 登录块。群启用开关默认开启(`enabled !== false`),修改入口当前仅 WebUI。

## 发布

推送 `v*` 格式 tag 触发 GitHub Actions 自动构建 Release。版本号在 package.json 中维护。

## 其他文档

- `.github/copilot-instructions.md`: 面向 NapCat 的插件开发模板描述(TypeScript,ESM),使用 Vite 打包到 `dist/index.mjs` 作为插件入口;包含消息处理、配置管理和 WebUI 支持。
- `.example/plugin/index.md`: 插件开发示例
