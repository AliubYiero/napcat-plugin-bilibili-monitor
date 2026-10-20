# NapCat 插件配置范式

本文是 NapCat 插件配置层的通用范式, 覆盖配置从声明到生效的全链路: 类型、默认值、清洗、原生面板、WebUI 表单、运行时读写与旧配置迁移。

本项目的参照实现 (三处文件, 各司其职):

| 环节 | 文件 | 说明 |
| --- | --- | --- |
| 声明源 (唯一权威) | `packages/shared/src/config.ts` | `FIELDS` 字段描述符 + `PluginConfig` 类型 |
| 后端原生面板 | `packages/plugin/src/config.ts` | `buildConfigSchema(ctx, loginStatus)` 把 `FIELDS` 映射为 `ctx.NapCatConfig` |
| 运行时读写 | `packages/plugin/src/core/state.ts` | `loadConfig` / `saveConfig` / `updateConfig` / `replaceConfig` |
| 前端表单 | `packages/webui/src/components/ConfigForm.tsx` | 按描述符 `kind` 渲染控件 |

## 核心约束: 单一声明源

新增或修改一个配置项时, **只改 `FIELDS` 一处**: 给 `PluginConfig` 加字段 (带注释), 给 `FIELDS` 加同 key 描述符, 二者用 `satisfies` 绑定键集 (另有单测兜底)。类型、默认值、清洗、原生面板、WebUI 表单全部由描述符派生, 不得在其他文件重复罗列字段。

```
FIELDS ──┬─→ PluginConfig         (类型, 编译期键集一致)
         ├─→ getDefaultConfig()   (默认值)
         ├─→ sanitizeConfig()     (清洗, 按 kind 分派)
         ├─→ buildConfigSchema()  (原生面板控件)
         └─→ ConfigForm           (自建前端控件)
```

描述符是 ctx-free 纯数据。需要 ctx 或运行时数据的映射必须**参数注入** (`buildConfigSchema(ctx, loginStatus)`), 禁止静态 import 业务模块。

## 写入铁律

**一切外部输入 (磁盘配置文件、WebUI 提交、旧配置迁移) 的配置写回必须经过 `sanitizeConfig`**, 直接把外部对象合并进内存配置等于放弃类型安全:

- `loadConfig`: 读盘后经 `sanitizeConfig`; 文件不存在则写默认配置落盘; 解析失败回退默认配置并记日志, 不抛错。
- `replaceConfig(config)`: 整体替换, 入口先 `sanitizeConfig`。
- `updateConfig(partial)`: 合并更新, 结果同样经 `sanitizeConfig` 后落盘; 仅限内部可信调用方。

## 字段 kind 与清洗语义

`sanitizeConfig` 是纯函数: 输入 `unknown`, 输出保证符合 `PluginConfig`, 不抛错。

| kind | 清洗 | 备注 |
| --- | --- | --- |
| `boolean` | `typeof` 守卫, 不符回退默认 | |
| `text` / `password` | `typeof` 守卫, 不符回退默认 | `password` 无原生面板控件, `scope` 收窄至 `webui`/`both` |
| `number` | 非有限数回退默认; 超区间**夹到 `min`/`max`** | ⚠️ `0` 会被夹到 `min` (如 `1`), **不是**回退默认值 |
| `select` | 未命中 `options` 回退默认 | |
| `multiSelect` | 过滤非法项; **空数组合法** | 空数组是"全不选"的语义, 不回退默认 |
| `stringList` | 逗号/换行分隔文本或数组 → 去空项 `string[]` | codec 由 `parseStringList` 单源提供, 前后端共用 |
| `section` | 不落盘, 无 key | 仅布局分组: WebUI 分卡边界 + 原生面板分组标题 |
| `display` | 不落盘, 无 key | 仅展示 HTML 片段 (可含 `{{...}}` 占位符) |
| `login` | 不落盘, 无 key | 登录状态展示块: 原生面板渲染静态状态 HTML, WebUI 渲染可交互登录卡 |

两条通用原则:

- **清洗不抛错**: 任何非法输入都回退默认值或丢弃条目, 保证插件在损坏的配置文件下仍能启动。
- **尊重用户显式选择**: 空数组、显式 `false` 等是语义, 不是缺失; 只有"字段不存在或类型不对"才回退默认。

## 分组布局 (section)

`section` 是扁平 `FIELDS` 中的**分隔行** (无 key, 不落盘), 同时驱动两侧布局, 不改变清洗语义:

- **WebUI**: 纯函数 `packages/webui/src/components/configFields/groupFields.ts` 按 section 把字段切成多组, 每组渲染为一张 `.card`。
    - 第一个 section 之前的字段归入「基础配置」; 每个 section 开启新组, 后续字段归属该组直到下一个 section。
    - 只渲染非空组 (空 section / 空基础组不产生空卡片); 被 `scope` 过滤的 section 既不显示也不作为分组边界; `display` 跟随当前组。
    - section 的 `description` 存在时渲染为标题下方的灰色小字。
- **原生面板**: `packages/plugin/src/config.ts` 把 section 渲染为分组标题 (粉色竖条 + 上边框 + 可选副标题), 样式集中在 `buildConfigSchema` 注入的**单份** `<style>` (类名统一 `bili-section-*` 前缀)。
    - 宿主把 `html` 内容直接注入 DOM, 且不会为插件字符串生成 Tailwind `dark:` 规则; 故暗色用 `.dark` / `[data-theme="dark"]` 祖先选择器跟随面板主题 class, 不用 `prefers-color-scheme`。
    - 登录状态块由 `FIELDS` 中的 `login` 描述符定位 (当前位于「B 站账号」section 之后), 不再硬编码插入位置。

## 运行时数据只进展示块

Schema 中允许出现运行时数据 (登录状态、运行统计等), 但只允许进入 `display` / `login` 展示块, **不得进入可保存配置项**:

1. Schema 构建函数接受可选运行时快照 (`buildConfigSchema(ctx, loginStatus)`), 快照为空时跳过对应展示块。
2. 运行时状态只渲染为 HTML 展示块; 运行统计 (`stats`) 存于配置文件但位于 FIELDS 之外, 由 `loadConfig`/`saveConfig` 单独透传。
3. 外部状态变化后通过配置 UI 控制器重建整个 Schema。

`login` 是**带交互的运行时展示块** (区别于纯 HTML 的 `display`): 原生面板只渲染静态登录状态与登录入口提示, WebUI 则渲染扫码 / 刷新 / 登出控件。它同样无 key、不落盘、不参与 `sanitizeConfig`, 位置由 `FIELDS` 声明。决策与后果见 `docs/adr/0011-login-status-config-kind.md`。

⚠️ Schema 构建函数需要运行时数据时必须参数注入, 禁止配置模块静态 import 业务模块——否则形成循环引用, 默认配置对象在模块加载期即触发 TDZ 错误。见 `docs/adr/0005-config-schema-runtime-data-injection.md`。

## 会话级配置不属于配置文件

群/好友级的开关是**会话级配置**, 不进配置文件、不进 `FIELDS`, 由独立数据文件承载 (见 `docs/store-pattern.md` 与 ADR 0006):

- 唯一读写入口是 `sessionConfigService`, 业务代码不直接触碰 store, 也不自行比较字段。
- 启用为宽松判定 `enabled !== false` (默认开启); 开播 @全体成员为反向判定 `=== true` 且仅群会话有效。
- 只持久化非默认值, 恢复默认即删除记录。
- 门控在消息入口最前端短路 (群与私聊都过门控), 业务层不重复判定。

插件全局启用/停用同样**不是**配置项: 由 NapCat 宿主负责 (见 ADR 0010)。

## 旧配置迁移

不再支持的键 (`enabled` / `debug` / `commandPrefix` / `groupConfigs` / `adminUser`) 由 `packages/plugin/src/store/migration/configMigration.ts` 一次性处理, 在 `loadConfig` **之前**运行:

- 迁移结果写回磁盘前必须经 `sanitizeConfig`; 运行统计等 FIELDS 之外的字段原样保留。
- 留备份 `<configFileName>.YYYYMMDDHHmmss.bak`。
- 弃用键只告警不静默丢弃信息 (如 `groupConfigs` 中 `enabled: false` 的记录迁移为会话配置)。
- 迁移失败抛错阻止启动。

## 新增配置项 checklist

- [ ] `packages/shared/src/config.ts`: `PluginConfig` 加字段 + `FIELDS` 加同 key 描述符 (含 `label` / `description` / `default`)
- [ ] 若是枚举/multiSelect: 候选项抽常量, 描述符与默认值共用
- [ ] 需要归入新分组时: 在 `FIELDS` 中插入 `section` 分隔行, 不新增描述符字段
- [ ] 确认 `sanitizeConfig` 对该 kind 的既有规则已覆盖语义 (数值区间用 `min`/`max`, 不写自定义分支)
- [ ] 若语义含默认值选择 (尤其启用类开关): 在 `CONTEXT.md` 与 ADR 中声明
- [ ] 需要 ctx / 运行时数据时: 只加 `display` / `login` 展示块, 并保持参数注入
- [ ] 仅布局 / 展示的 kind (`section` / `display` / `login`) 必须无 key, 不进 `PluginConfig`, 不参与 `sanitizeConfig`

## 与其他范式的关系

- 与**生命周期铁律**的关系: 配置读盘发生在 `plugin_init` 之后 (且晚于迁移), 清洗是纯函数可在任何时机调用; Schema 构建需要 ctx, 只能在运行期进行。见 `development-pattern.md`。
- 与**存储范式**的关系: 会话级配置由 store 承载, 遵循 `store-pattern.md` 的单例与延迟实例化纪律。
- 与**指令分发范式**的关系: 触发方式 (`triggerModes`) 与指令前缀 (`COMMAND_PREFIX` 常量, 不可配) 决定接收层行为, 会话门控在消息入口最前端短路。见 `instruction-pattern.md`。
- 与**领域建模纪律**的关系: 启用开关等默认值语义是领域决策, 定型时记入 `CONTEXT.md` 并按需补 ADR (本项目见 `docs/adr/0006-session-enabled-default.md`)。
