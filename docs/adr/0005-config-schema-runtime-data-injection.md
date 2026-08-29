# 配置 Schema 使用运行时数据须参数注入, 禁止 config 模块静态 import 业务模块

`buildConfigSchema`（含 WebUI html 块）需要展示运行时数据（如 B 站登录状态）。直接让 `config.ts` 静态 import 业务模块会形成 `config.ts -> store -> core/state.ts -> config.ts` 循环引用，ESM 初始化顺序被打破，导致 `DEFAULT_CONFIG` 在 `PluginState` 类字段初始化时处于 TDZ，插件加载即抛 `Cannot access 'DEFAULT_CONFIG' before initialization`。故决定：config 模块保持纯函数、零业务依赖；需要运行时数据时一律由入口（`index.ts`，无环）在 `plugin_init` 读取后以参数传入（如 `buildConfigSchema(ctx, loginStatus)`）。注意：仅延迟到函数体内调用 store（而不删除静态 import）并不能解决此问题——环在模块依赖图上，不在调用时机上。同理，任何被 `state.ts` 反向引用的模块（config 等）都不得静态 import 触碰 `pluginState` 的模块。
