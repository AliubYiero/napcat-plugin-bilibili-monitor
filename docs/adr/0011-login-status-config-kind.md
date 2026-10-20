# ADR 0011: 登录状态作为声明式配置 kind

日期: 2026-10-20
状态: 已采纳

## 背景

原生面板的登录状态块原先由 `buildConfigSchema` 在**第一个 section 之后**硬编码插入: 位置与 `FIELDS` 的布局演进脱节, 且 WebUI 只认识配置字段, 无法承载扫码登录。与此同时, 登录态快照与二维码会话的形状分散在插件后端与 WebUI 两侧, 容易各自维护。

登录态与扫码会话都是**运行时数据**: 不落盘、不进 `PluginConfig`、不参与 `sanitizeConfig`; 但 WebUI 需要交互 (扫码、刷新、登出), 纯 HTML 的 `display` 不足以表达。

## 决策

1. **新增声明式 kind `login`** (`packages/shared/src/config.ts`): 无 key, 不落盘, 不进 `PluginConfig`; 位置由 `FIELDS` 声明 (当前位于「B 站账号」section), 不再硬编码插入。
2. **原生面板保持静态**: `login` 映射为登录状态块 + 入口提示 (WebUI 或 `#bili user login`), 不提供面板内扫码。
3. **WebUI 提供交互卡 `LoginField`**: 自包含 fetch / 轮询, 展示登录信息、二维码、刷新与行内二次确认登出; 挂载时接管已活跃会话, 仅活跃时每 2s 轮询, 页面隐藏暂停, 终止即停止。
4. **会话来源决定刷新权**: `source` 分 `webui` 与 `instruction`; 仅 `webui` 来源允许从 WebUI 重启会话。指令来源的会话刷新返回 409, 前端提示等待其结束。
5. **二维码图片独立端点**: 快照暴露递增的 `qrVersion`, 图片走 `GET /login/qrcode/image` (`sendFile` + `Cache-Control: no-store`), 不在前端内联 base64。
6. **契约单源**: 登录态与会话快照集中在 `packages/shared/src/login.ts`; 终止态只在当前页面会话内展示, 不跨页面持久化。

## 理由

- **布局单源**: 登录块的位置与分组跟随 `FIELDS`, 与配置演进保持一致。
- **职责分离**: 面板负责静态展示与入口指引, WebUI 负责交互; 登录入口仍是私聊指令, 不新增独立登录页。
- **运行时数据隔离**: 登录态与扫码会话不进入配置文件, 避免与可保存配置混用。
- **缓存正确性**: `qrVersion` + `no-store` 保证二维码刷新后不显示旧图。

## 后果

- 登录 UI 变更需同时改 shared 契约与两侧渲染, 但字段位置只在 `FIELDS` 一处声明。
- 原生面板无法完成扫码, 用户需使用 WebUI 或 `#bili user login`。
- WebUI 必须遵守来源限制: 指令发起的会话只能等待结束, 不能在页面上强制刷新。
- 相关范式: `config-pattern.md` (kind 与运行时展示块)、`webui-config-pattern.md` (登录卡片与端点)、`CONTEXT.md` (登录状态 / 登录会话 / 二维码版本)。
