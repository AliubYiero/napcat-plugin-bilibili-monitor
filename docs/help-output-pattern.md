# 指令帮助输出范式

本文是 NapCat 插件指令帮助输出的通用范式, 覆盖从指令定义到用户可见帮助消息的全链路: 配置权威源编写、API 生成、脚本化落盘、运行时变体选择与回退。

参考实现: 本项目 `scripts/generateHelp/` (生成脚本与 cmd 权威源)、`src/utils/helpMessage.ts`、`src/handlers/live/help.handler.ts`、`src/handlers/dyn/help.handler.ts`、`src/handlers/user/help.handler.ts` (以下引用其内容均作为示例)。渲染服务由独立项目 `napcat-help-generate` 提供 (TS + express + Playwright, 无状态渲染), 其 API 详见该项目 README 与 CLAUDE.md。

## 核心约束

1. **按角色与会话类型输出对应版本**: 帮助内容分 User / Admin / SuperAdmin 三个权限组, 由消息来源的角色与会话类型共同决定输出版本 (见"变体映射"节), 而非仅按角色。
2. **图片优先 / 文本回退**: 优先发送帮助图片, 图片文件缺失或发送失败时回退发送纯文本帮助。
3. **配置单源**: cmd 配置权威源在插件项目 `scripts/generateHelp/cmds/`。生成产物 (`helpText.generated.ts` 与 assets PNG) 一律由 `pnpm run help:generate` 产出, 禁止手改; 渲染服务不持久化插件配置, 仅按请求传参渲染。

## 范式正文

### 全链路流水线

```
scripts/generateHelp/cmds/*.ts (插件项目内, cmd 配置权威源)
    → pnpm run help:generate
    → (自动启动/复用 napcat-help-generate 服务, POST /api/text + /api/images 传参渲染)
    → 落盘: src/assets/{cmdId}-{Role}.png + src/handlers/<模块>/helpText.generated.ts
    → handler import 生成文件
    → 运行时: sendHelpMessage 按变体发送图片, 失败回退文本
```

### 一、配置权威源: scripts/generateHelp/cmds/

cmd 配置以 TS 模块编写, 每个帮助面板一个文件, 类型定义在同目录 `cmd.ts`:

```typescript
interface Cmd {
    id: string;     // 脚注, 同时用作导出文件名
    title: string;  // 面板标题
    cmd: (InstructionSet | ContentHelp)[];
}

interface InstructionSet {
    groupName: string;           // 指令集名称
    instructions: Instruction[];
    isAdmin?: boolean;           // 仅群管理员可用 (超管也可用)
    isSuperAdmin?: boolean;      // 仅超管可用
}

interface Instruction {
    cmd: string;              // 指令
    desc: string;             // 指令描述
    onlyPrivate?: boolean;    // 仅私聊可用
    onlyGroup?: boolean;      // 仅群聊可用
}
```

#### 标记系统与互斥规则

- `isAdmin` 与 `isSuperAdmin` **互斥**, 一个指令集只能存在其一; 均缺省表示所有用户可见。
- `onlyPrivate` 与 `onlyGroup` **互斥**; 均缺省表示私聊与群聊均可用。
- 渲染服务依据标记自动添加 `[管理员]` / `[超管]` / `[仅私聊]` / `[仅群聊]` 标识, 无需在描述文本中手写。
- 权限过滤规则: User 可见无标记内容; Admin 可见无标记 + `isAdmin` 内容; SuperAdmin 可见全部。

#### 分组命名约定

指令集按职责分组, 参考命名:

- `核心指令` — 面向普通用户的主功能
- `辅助指令` — help、查询类等辅助功能
- `监听管理指令` — 管理类指令, 按权限拆成 `isAdmin` 与 `isSuperAdmin` 两个同名指令集

同一 `groupName` 可以出现多次 (搭配不同权限标记), 渲染时按权限组各自过滤。

#### SuperAdmin 版的内容取舍

SuperAdmin 版可以包含**仅私聊可用**的指令 (`onlyPrivate`)。这直接影响下游变体映射的合理性: 群聊中不输出 SuperAdmin 版, 正是因为其含有的仅私聊指令在群聊中不可用 (见"变体映射"节)。编写配置时保持这一内容构成约定。

### 二、生成: pnpm run help:generate

生成脚本 `scripts/generateHelp/index.ts` (tsx 直跑), 流程:

1. 读取渲染服务项目 `.env` 的 `PORT` (缺省 3366), `GET /api/cmds` 探活。
2. 服务未运行则在渲染服务目录自动 `spawn pnpm start`, 轮询就绪 (30s 超时; 首次运行需先在该项目执行 `npx playwright install chromium`)。
3. 对映射表 (`CMD_TARGETS`) 中每个 cmd: 以 API 传参模式提交完整 cmd 配置 (`cmd[0]` 优先于注册表 `ids`), 调用 `POST /api/text` (JSON) 与 `POST /api/images` (multipart, 手写解析, 二进制安全)。
4. 落盘 (见下节)。

服务端环境项 (渲染服务项目 `.env`): `PORT` / `SCREENSHOT_SCALE` / `IMAGE_FORMAT`, 由服务端自行管理, 脚本不干预。

### 三、产物与落盘

| 产物 | 落盘位置 | 说明 |
|---|---|---|
| 帮助图片 PNG | `src/assets/{cmdId}-{Role}.png` | 按权限组三张, 覆盖写入 |
| 文本帮助 | `src/handlers/<模块>/helpText.generated.ts` | 导出 `HELP_TEXT_MAP: Record<HelpVariant, string>`, 键为 `user` / `admin` / `superAdmin` (API 的 PascalCase 权限组由脚本映射为 camelCase 变体键) |

**同步纪律**: `helpText.generated.ts` 头部标注"由 pnpm run help:generate 生成, 禁止手改"。任何帮助内容变更都只修改 `scripts/generateHelp/cmds/` 下的权威源, 再重新生成。handler 以 `HELP_IMAGE` 常量声明各变体对应的 PNG 文件名 (纯命名映射, 无内容), 并 `import { HELP_TEXT_MAP } from './helpText.generated'`。

运行时发送逻辑由共享工具 `sendHelpMessage` 承担, handler 只需提供 `imageMap` 与 `textMap` 两份内容, 不自行实现选择与回退逻辑。

### 四、变体映射

帮助版本由"角色 + 会话类型"共同决定, 定义于 `getHelpVariant`:

| 角色 | 会话类型 | 输出版本 |
|---|---|---|
| `user` | 任意 | User |
| `admin` (群管理员) | 任意 | Admin |
| `privateUser` (好友私聊用户) | 好友私聊 | Admin |
| `superAdmin` | 群聊 | Admin |
| `superAdmin` | 私聊 | SuperAdmin |

映射依据 (角色定义见 `instruction-pattern.md` 的四档权限模型):

- `privateUser` (机器人好友的私聊用户) 等同 admin 权限组, 故输出 Admin 版; 非好友私聊角色为 user, 输出 User 版。
- **群聊超管输出 Admin 版而非 SuperAdmin 版**: SuperAdmin 版含有仅私聊可用的指令, 在群聊中输出会误导用户。私聊超管才能看到完整版。

`HelpVariant` 类型 (`'user' | 'admin' | 'superAdmin'`) 与 PNG 文件名中的权限组、`HELP_TEXT_MAP` 的键一一对应 (大小写拼写差异由脚本映射)。

## 标准范式清单

新增一个帮助面板时:

1. 在 `scripts/generateHelp/cmds/` 新建 cmd 配置文件 (遵循标记互斥与分组命名约定)。
2. 在 `scripts/generateHelp/index.ts` 的 `CMD_TARGETS` 映射表注册 (cmd 配置 + 落盘 handler 目录)。
3. 执行 `pnpm run help:generate`, 产物自动落盘 assets 与 handler 目录。
4. 新建 handler 文件, `HELP_IMAGE` 填入三个 PNG 文件名, `import { HELP_TEXT_MAP } from './helpText.generated'`。
5. handler 导出形如 `helpXxxHandler` 的函数, 调用 `sendHelpMessage(ctx, event, { imageMap, textMap })`。
6. 在指令解析层注册对应 help 指令。

## 与其他范式的关系

- 与**指令分发范式**的关系: 帮助 handler 是普通指令 handler, 在注册表中注册; 变体映射的输入 `UserRole` 来自权限模型的入口推导。权限档位与帮助版本档位不是一一对应关系。见 `instruction-pattern.md`。
- 与**消息发送范式**的关系: `sendHelpMessage` 内部走发送工具模块发送图片/文本, 失败即触发文本回退。见 `message-send-pattern.md`。
