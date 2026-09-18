# NapCat 插件开发范式总纲

本文是 NapCat 插件开发的通用范式总纲, 定位为**可迁移到任意 NapCat 插件项目的模板**: 定义统一文档骨架、生命周期铁律、分层架构模型, 并索引各专项范式与架构决策。本项目 (napcat-plugin-bilibili-monitor) 是该范式体系的参考实现, 项目细节见根目录 `CLAUDE.md` 的"本项目实例化"一节。

## 文档体系与骨架

专项范式文档共五份, 全部遵循统一骨架:

> 概述 → 核心约束(铁律) → 范式正文(含正反例) → 标准范式清单(checklist) → 与其他范式的关系

| 文档 | 覆盖范围 |
| --- | --- |
| [store-pattern.md](./store-pattern.md) | 数据持久化: 单例 store、延迟实例化、模块加载期禁 IO |
| [config-pattern.md](./config-pattern.md) | 配置全链路: 类型/默认值/Schema/清洗四环节、会话级开关 |
| [instruction-pattern.md](./instruction-pattern.md) | 指令分发: 接收→分发→执行链路、四档权限、作用域校验 |
| [message-send-pattern.md](./message-send-pattern.md) | 消息发送: 发送工具收敛、消息段工厂 |
| [help-output-pattern.md](./help-output-pattern.md) | 帮助输出: cmd.json 上游 → 产物 → 运行时变体选择 |

命名与术语先读根目录 `CONTEXT.md` (领域术语表, 含 _Avoid_ 反用词); 重大取舍见 `docs/adr/` (索引见下文)。写代码/起名前先查这两处。

## 生命周期铁律

NapCat 插件加载流程: **模块 import → `plugin_init(ctx)` → 运行**。所有范式共同的前提由此而来:

1. **模块加载期 (import 时) `ctx` 尚未初始化**。任何模块在加载期不得触碰 `ctx`、`ctx.dataPath`、`ctx.logger`, 不得做文件 IO, 不得调用发送函数。
2. **单例可以模块加载期导出, 前提是构造期零 IO**(构造不读 ctx、不读文件、不读配置)。真正的 IO 全部推迟到 `plugin_init` 之后。
3. 全局状态经由唯一的 `pluginState` 单例访问 (含 config 读写与清洗、data 目录 JSON 持久化、logger、定时器注册表), 各模块不自行持有 ctx 或逐层传参。

各专项范式是这条铁律的具体化: store 的"延迟实例化" (store-pattern)、配置读写的"运行期才读盘" (config-pattern)、发送工具的"运行期才调用" (message-send-pattern)。

## 分层架构模型

```
入口 (index.ts)          生命周期装配, 不含业务
  → 接收层 (handlers)    消息过滤、前缀检查、指令分发   [instruction-pattern]
  → 执行层 (handlers)    按模块分目录的指令 handler
  → 业务层 (services)    轮询、解析、推送、上限等业务逻辑
  → 持久化层 (store)     JSON 文件读写, 单例 + 延迟实例化 [store-pattern]
  → 外部 API 层 (api)    上游服务 HTTP 封装, 与业务解耦
横切: 发送工具 [message-send-pattern]、配置 [config-pattern]、
      帮助输出 [help-output-pattern]、权限推导
```

各层通用纪律:

- **每层只做自己的事**: 接收层不认识指令语义, 分发层不做业务, handler 内不重复权限校验, store 不含业务规则。
- **纯函数优先**: 解析、清洗、模板渲染等无 IO 逻辑抽为纯函数模块 (输入 → 输出, 不触碰 ctx / store), 便于独立理解与复用。
- **外部 API 层与业务解耦**: HTTP 封装只做请求/响应与登录态注入, 不做业务判断; 业务层不直接拼 URL。
- **失败回退链**: 可视化产物 (渲染图片等) 优先, 失败回退纯文本; 外部依赖不可用时降级而不崩溃。

## 领域建模纪律

- 领域术语以 `CONTEXT.md` 为唯一权威: 新术语在概念定型时即写入, 带 _Avoid_ 项; 与代码冲突时先校对再改。
- 默认值语义 (尤其是启用开关的默认开启/关闭) 属于领域决策, 在 CONTEXT.md 声明, 必要时配 ADR。
- 状态机类概念 (如"直播会话") 明确事件何时有意义、基线何时重置。

## 架构决策记录 (ADR) 索引

ADR 记录"难逆转、无上下文会意外、真实权衡"三类决策, 每份声明其约束的范式:

| ADR | 结论 | 约束 |
| --- | --- | --- |
| 0001 SVG 渲染推送卡片 | 用外部 SVG 渲染插件生成卡片图片, 失败回退文本, 不引入本地重依赖 | services 推送链路的失败回退纪律 |
| 0003 typecheck 报错来源 | napcat-types 包自身语法错误, 以 vite build 为验证手段 | 构建与验证命令的使用 |
| 0004 离线变化检测 | 推翻 0002: 未直播时同样检测标题/分区变化, 独立事件类型 | 轮询比对与变化事件的实现 |
| 0005 配置 Schema 运行时注入 | Schema 构建参数注入运行时数据, 禁止 config 模块静态 import 业务模块 (避免循环引用) | config-pattern 的 Schema 静态/动态边界 |
| 0006 群启用默认开启 | `enabled !== false` 宽松判定, 入口最前端短路 | config-pattern 的会话级开关、instruction-pattern 的接收层 |
| 0007 数据文件拓扑 | 按业务域拆分 6 个文件, 统一 `{ version: 1, data }` 包裹, 一次性迁移 | store-pattern 的文件划分与版本约定 |

## 尚未成文的区域

以下区域有参考实现但暂无专项范式, 新增同类代码时参照现有实现:

- **API 请求层**: 外部服务 HTTP 封装的职责划分 (基础请求 / 带登录态请求 / 具体接口) 与错误处理, 参照 `api/` 目录现有实现。
- **services 业务纪律**: 轮询 (定时器 + 增量比对)、纯函数解析、推送 (渲染 + 回退)、上限控制, 参照 `services/` 各模块; 通用纪律见上文"分层架构模型"。
- **插件入口装配**: 生命周期函数的注册与初始化顺序, 参照 `index.ts`。
- **帮助图片产物管线**的上游工具: 见 help-output-pattern, 工具本体在独立项目 `napcat-help-generate`。
