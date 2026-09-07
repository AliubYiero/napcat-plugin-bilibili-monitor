# 指令帮助输出范式

本文是 NapCat 插件指令帮助输出的通用范式, 覆盖从指令定义到用户可见帮助消息的全链路: 上游配置编写、产物导出、插件落盘集成、运行时变体选择与回退。

参考实现: 本项目 `src/utils/helpMessage.ts`、`src/handlers/live/help.handler.ts`、`src/handlers/user/help.handler.ts` (以下引用其内容均作为示例)。上游工具项目为 `napcat-help-generate` (纯前端页面, 编辑 `cmd.json` 后导出产物), 其配置类型详见该项目 `type.ts` 与 README。

## 核心约束

1. **按角色与会话类型输出对应版本**: 帮助内容分 User / Admin / SuperAdmin 三个权限组, 由消息来源的角色与会话类型共同决定输出版本 (见"变体映射"节), 而非仅按角色。
2. **图片优先 / 文本回退**: 优先发送帮助图片, 图片文件缺失或发送失败时回退发送纯文本帮助。
3. **产物是唯一数据源**: 插件侧的帮助内容以导出产物为准, 不得手写改写——这是防止图片版与文本版、以及插件与工具项目之间内容漂移的唯一保障。

## 范式正文

### 全链路流水线

```
cmd.json (结构化指令定义, 上游工具项目)
    → help-generate 工具渲染与过滤
    → 产物: 三权限组帮助图片 PNG + texts.json (按权限组的纯文本帮助)
    → 插件落盘: PNG 复制进 assets, 文本嵌入 handler
    → 运行时: sendHelpMessage 按变体发送图片, 失败回退文本
```

### 一、上游: cmd.json 编写规范

`cmd.json` 是唯一数据源, 为 `Cmd[]` 数组, 每个元素对应一份帮助配置:

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
- 工具依据标记自动渲染 `[管理员]` / `[超管]` / `[仅私聊]` / `[仅群聊]` 标识, 无需在描述文本中手写。
- 权限过滤规则: User 可见无标记内容; Admin 可见无标记 + `isAdmin` 内容; SuperAdmin 可见全部。

#### 分组命名约定

指令集按职责分组, 参考命名:

- `核心指令` — 面向普通用户的主功能
- `辅助指令` — help、查询类等辅助功能
- `监听管理指令` — 管理类指令, 按权限拆成 `isAdmin` 与 `isSuperAdmin` 两个同名指令集

同一 `groupName` 可以出现多次 (搭配不同权限标记), 工具会按权限组各自渲染。

#### SuperAdmin 版的内容取舍

SuperAdmin 版可以包含**仅私聊可用**的指令 (`onlyPrivate`)。这直接影响下游变体映射的合理性: 群聊中不输出 SuperAdmin 版, 正是因为其含有的仅私聊指令在群聊中不可用 (见"变体映射"节)。编写上游配置时保持这一内容构成约定。

### 二、产物

通过 help-generate 页面导出:

- **帮助图片 PNG**: 按权限组导出三张, 文件名 `{id}-{User|Admin|SuperAdmin}.png`, 2x 缩放。
- **texts.json**: 一份 JSON 文件, 结构为 `{User: string, Admin: string, SuperAdmin: string}`, 键为权限组, 值为该权限组过滤后的纯文本帮助。

### 三、下游: 插件集成纪律

产物以"落盘"方式进入插件, 图片与文本保持同一种模式:

- **PNG**: 复制进插件 `assets` 目录, 保留 `{id}-{变体}.png` 命名约定。handler 中以 `HELP_IMAGE` 常量声明各变体对应的文件名。
- **texts.json**: 将三个字符串嵌入 handler 的 `HELP_TEXT_MAP` 常量 (`Record<HelpVariant, string>`)。

**同步纪律**: `HELP_IMAGE` 与 `HELP_TEXT_MAP` 必须以导出产物为准, **不得手写改写**。任何帮助内容变更都应先修改上游 `cmd.json` 并重新导出, 再同步落盘到插件。

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

`HelpVariant` 类型 (`'user' | 'admin' | 'superAdmin'`) 与 texts.json / PNG 文件名中的权限组一一对应。

## 标准范式清单

新增一个帮助 handler 时:

1. 在上游工具项目 `cmd.json` 中编写该帮助配置 (遵循标记互斥与分组命名约定)。
2. 通过 help-generate 页面导出 PNG 与 texts.json。
3. 将三张 PNG 复制进插件 `assets` 目录。
4. 新建 handler 文件, 将 texts.json 的三个字符串嵌入 `HELP_TEXT_MAP`、文件名填入 `HELP_IMAGE`。
5. handler 导出形如 `helpXxxHandler` 的函数, 调用 `sendHelpMessage(ctx, event, { imageMap, textMap })`。
6. 在指令解析层注册对应 help 指令。

## 与其他范式的关系

- 与**指令分发范式**的关系: 帮助 handler 是普通指令 handler, 在注册表中注册; 变体映射的输入 `UserRole` 来自权限模型的入口推导。权限档位与帮助版本档位不是一一对应关系。见 `instruction-pattern.md`。
- 与**消息发送范式**的关系: `sendHelpMessage` 内部走发送工具模块发送图片/文本, 失败即触发文本回退。见 `message-send-pattern.md`。
