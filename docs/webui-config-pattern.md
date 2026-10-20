# WebUI 与配置表单范式

本文是 NapCat 插件自带 WebUI 的通用范式, 覆盖页面集、hash 路由、配置表单、无鉴权 API 契约与样式规范。本项目参照实现: `packages/webui/` (React SPA, 单文件 HTML 产物) + `packages/shared/src/ui.ts` / `config.ts` (页面元信息与配置字段单源) + `packages/plugin/src/services/apiService.ts` (后端路由)。

## 核心约束

1. **页面集固定且单源**: 页面清单 (`PAGES` / `DEFAULT_PAGE`) 单源在 `shared/src/ui.ts`, 同时驱动侧边栏、页头与路由; 新增页面只改这一处 + webui 的 `PageId → 组件` 注册表。
2. **hash 是当前页的唯一真相源**: WebUI 作为单文件 HTML 嵌在 NapCat 的 iframe 中 (路径固定), 只有 hash 变更不会触发宿主 404, 因此页面切换一律走 `#/<pageId>`。
3. **配置表单是声明式派生**: 控件由 shared 的 `FIELDS` 描述符按 `kind` 渲染, 不在前端重复罗列字段。
4. **自带页面调用无鉴权路由**: 插件页面用 `router.getNoAuth` / `postNoAuth`, 前端用 `noAuthFetch`。

## 一、页面集与路由

```ts
// shared/src/ui.ts —— 页面元信息唯一权威
export const PAGES = [
    { id: 'status', title: '状态', description: '...', icon: 'dashboard', order: 10 },
    { id: 'sessions', title: '会话管理', ... },
    { id: 'help', title: '帮助文档', ... },
] as const satisfies readonly PageMeta[];

export const DEFAULT_PAGE: PageId = 'status';
```

路由是**纯函数 + 一个 hook**:

- `packages/webui/src/utils/pageRoute.ts`: `parsePage(hash)` (取首段, 非法回退 `DEFAULT_PAGE`) 与 `buildHash(page)` (生成规范 `#/<pageId>`), 二者不触碰 `window`, 便于单测。
- `packages/webui/src/hooks/usePageRoute.ts`: 订阅 `hashchange`、读写 `location.hash`, 把纯函数接到浏览器上; 非法或空 hash 会被写回默认页。

页面组件在 `App.tsx` 按 `PageId` 注册 (该映射无法放进 shared, 因组件属于 webui)。

## 二、API 契约

`packages/webui/src/utils/api.ts` 提供两个薄封装, 都不做业务判断:

| 封装 | base | 用于 |
| --- | --- | --- |
| `noAuthFetch<T>(path, init)` | `/plugin/{pluginName}/api` | 插件自带页面 (对应后端 `getNoAuth` / `postNoAuth`) |
| `authFetch<T>(path, init)` | `/api/Plugin/ext/{pluginName}` | 需 NapCat WebUI 登录鉴权的接口 (本项目未使用) |

- `pluginName` 按 `window.__PLUGIN_NAME__` → 父窗口 → 路径段 `/ext/{name}` 或 `/plugin/{name}` → 构建期常量 `__PLUGIN_ID__` 的顺序解析, 使同一份产物在宿主内嵌与独立调试下都能定位到自己的路由。
- 非 2xx 响应 `throw new Error(text || 'HTTP <status>')`; 返回值统一为 `ApiResponse<T>` (shared 类型)。

契约以 `packages/plugin/src/services/apiService.ts` 为准; 页面新增/变更端点时必须两侧同步, 且遵循"插件自带页面 → 无鉴权路由"的边界。

## 三、声明式配置表单

`packages/webui/src/components/ConfigForm.tsx` 直接消费 shared 的 `FIELDS`, 按 `kind` 渲染控件; 布局与展示字段 (`section` / `display`) 没有 `key`, 其余字段从 `config[field.key]` 取值。

`FIELDS` 先经纯函数 `packages/webui/src/components/configFields/groupFields.ts` 按 `section` 切成多组, 每组渲染为一张 `.card` (标题即 section 的 `label`, 可选 `description` 作为副标题); 第一个 section 前的字段归入「基础配置」, 空组不渲染。分组规则详见 `config-pattern.md` 的「分组布局」。

| kind | 控件 |
| --- | --- |
| `boolean` | `BooleanField` (开关) |
| `text` | `TextField` |
| `password` | `PasswordField` (显隐切换) |
| `number` | `NumberField` (`min` / `max` 约束) |
| `select` | `SelectField` (下拉) |
| `multiSelect` | `MultiSelectField` (胶囊多选) |
| `stringList` | `StringListField` (标签输入) |
| `section` | 分组卡片边界 (`groupFields` 切分, 标题为卡片 `h3`) |
| `display` | `DisplayField` (`dangerouslySetInnerHTML` 渲染展示块) |
| `login` | `LoginField` (登录状态 / 扫码 / 刷新 / 登出) |

要点:

- **`scope: 'panel'` 的字段在前端跳过** (只用于原生面板), 表单不重复呈现。
- `overrides` 是扩展点: 按字段 key 覆盖控件, 用于个别字段的特殊交互, 不需要改 `ConfigForm` 本身。
- 所有控件是受控组件: 只上报 `onChange(key, value)`, 由页面决定何时提交 (`POST /config` 走后端 `sanitizeConfig`)。
- 新增字段时前端**零改动**——加 `FIELDS` 描述符即可 (见 `config-pattern.md`)。

### 登录卡片 (login kind)

`LoginField` 是唯一的交互式运行时展示控件, 自包含数据获取, 不参与表单提交:

- **数据来源**: `GET /login/status` 取登录态; 二维码会话端点见下表。图片直接用 `noAuthUrl('/login/qrcode/image')` 作 `<img src>`, 不在前端内联 base64。
- **状态接管**: 挂载时若已有活跃会话 (例如刚由私聊指令发起), 直接接管并继续轮询, 不重复创建。
- **轮询**: 仅当会话活跃时每 2s 拉一次; 终止 (`success` / `expired` / `error`) 即停止; 页面隐藏时暂停, 恢复可见立即补拉一次。
- **刷新**: 仅 `source === 'webui'` 的会话允许重启; 指令发起的会话禁用按钮并提示等待其结束。
- **登出**: 行内二次确认, 5s 未确认自动复位; 成功后回到未登录态。
- **终止态**: 只在当前页面会话内展示; 重新进入页面回到空闲态, 并重新拉取登录状态。
- **视觉**: 与原生面板登录块共用粉色卡片语言 (渐变外框、状态胶囊、B 站账号图标); 已登录态展示头像 / 昵称 / UID 与失效徽标, 不展示登录时间。

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/login/status` | GET | 登录态快照 (含 Cookie 过期标记与用户信息) |
| `/login/qrcode` | POST | 创建扫码会话 (已有活跃会话时复用) |
| `/login/qrcode/poll` | GET | 拉取会话快照, WebUI 轮询入口 |
| `/login/qrcode/refresh` | POST | 重启会话; 非 `webui` 来源返回 409 |
| `/login/qrcode/image` | GET | 二维码 PNG (`sendFile` + `Cache-Control: no-store`, 缺失 404) |
| `/logout` | POST | 清除 Cookie 并回到未登录态 |

原生面板的 `login` 块只展示静态状态与入口提示 (WebUI 或 `#bili user login`), 不提供扫码交互。

## 四、stringList 标签输入

`stringList` 的候选形态是"逗号 / 换行分隔的文本", 需要一层解析与规范化。规则收敛在纯函数模块 `packages/webui/src/utils/tagList.ts`:

- `appendTags(list, tags)`: trim → 去空 → 去重后追加, 不改原数组。
- `removeTag(list, value)`: 移除首个匹配项。
- `splitPending(raw)`: 把输入框当前内容按分隔符切分, **末段保留为"待提交"** (用户可能正在输入), 其余段落作为完整标签。

切割口径 (分隔符集合) 与 shared 的 `parseStringList` **一致**, 保证前端展示与后端清洗对同一份输入的理解相同; 若改分隔符, 两处必须同步。

## 五、帮助文档页

`packages/webui/src/pages/HelpPage.tsx` 消费后端 `GET /help` 原样返回的 `HELP_PANELS` (生成物, 见 `help-output-pattern.md`), 提供搜索与分页签。

过滤逻辑抽为纯函数 `packages/webui/src/utils/helpFilter.ts`:

- 纯文本匹配: `stripHtml` 去掉标签后 `toLowerCase().includes(q)`, 不解析 HTML。
- 命中粒度保留结构: 指令集 / 文本帮助内部再按 `cmd` / `desc` / 方法名 / 步骤过滤, 命中的分组原样保留, 完全不命中的分组整块丢弃。

不依赖渲染服务: 帮助页只消费结构化产物, 因此渲染服务不可用时帮助页仍可用 (受影响的只是指令回复里的图片)。

## 六、会话页

`packages/webui/src/pages/SessionsPage.tsx` 对着会话 API:

- `GET /sessions` 拿到群与好友列表 (含 `id` / `type` / `name` / `enabled` / 成员数), 默认全部为启用 (见 ADR 0006)。
- 单个开关 → `POST /sessions/:type/:id/config`; 批量 → `POST /sessions/bulk-config` (`{ type, enabled, ids }`)。
- 页面只负责收集意图与提交, 不做启停语义判断 (默认开启/只存非默认值等语义在 `sessionConfigService`)。

## 七、样式规范

- 主题色粉色 `#FB7299` (`bg-primary` / `text-primary`); 激活态 `bg-primary text-white`; 暗色用 `dark:bg-[#1e1e20]`。
- 卡片统一用 `.card`; **禁止 CSS 渐变**, 用纯色。
- 图标用 SVG 组件 (`components/Icons.tsx`), **不使用 emoji**。
- 新增页面/组件延续既有设计语言, 不做单页面特调。

## 八、构建与测试

- WebUI 由 Vite 构建为**单文件 HTML** (`vite-plugin-singlefile`), 产物落在 `packages/plugin/dist/webui/index.html`, 由插件以 `ctx.router.page({ htmlFile: 'webui/index.html' })` 挂载。
- 单测在 `packages/webui/test/`, 环境 jsdom; 优先测纯函数 (`pageRoute` / `tagList` / `helpFilter`) 与配置控件 (`configFields/*`), 页面级测试聚焦交互而非快照。

## 标准范式清单

新增一个页面:

1. `shared/src/ui.ts` 的 `PAGES` 加一条元信息 (id / title / description / icon / order)。
2. `packages/webui/src/pages/` 新建页面组件, 在 `App.tsx` 的 `PageId → 组件` 注册表加映射。
3. 数据来自无鉴权 API: 用 `noAuthFetch` 调用, 后端在 `apiService.ts` 用 `getNoAuth` / `postNoAuth` 注册。
4. 过滤/转换逻辑抽成纯函数模块并补单测, 页面只做编排。
5. 视觉沿用主题色与 `.card`, 图标用 SVG 组件。

新增一个配置控件 kind (少见):

1. `shared/src/config.ts` 的 kind 联合加类型; 有 key 的 kind 同步清洗分支 (见 `config-pattern.md`)。
2. `packages/webui/src/components/configFields/` 加控件并在 `ConfigForm.tsx` 的 kind 分发接入。
3. 后端 `buildConfigSchema` 同步该 kind 的原生面板映射。
4. 无 key 的展示 kind (`display` / `login`) 不进 `PluginConfig`、不参与 `sanitizeConfig`; 交互状态由控件自持。

## 与其他范式的关系

- 与**配置范式**的关系: 前端表单是 `FIELDS` 派生链的一环, 与原生面板、清洗共享同一描述符; 提交仍经后端 `sanitizeConfig`。见 `config-pattern.md`。
- 与**帮助输出范式**的关系: 帮助页消费结构化产物 `HELP_PANELS`, 与指令回复用的图片/文本产物同源。见 `help-output-pattern.md`。
- 与**存储范式**的关系: 会话页背后的会话配置由 store 承载, 默认值语义不在前端重复。见 `store-pattern.md`。
- 与**生命周期铁律**的关系: 路由注册与页面挂载发生在 `plugin_init` 之后。见 `development-pattern.md`。
