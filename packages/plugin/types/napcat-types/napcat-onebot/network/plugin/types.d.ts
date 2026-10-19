/**
 * napcat-types 垫片 · 插件框架类型（信实副本）
 *
 * 来源: napcat-types@0.0.16 (包内 napcat-onebot/network/plugin/types.ts); 该包未声明 license,
 *   此处仅作类型声明使用, 供本项目 typecheck 消费。
 * 背景: napcat-types 只发布裸 .ts (零 .d.ts), 其源码不是可独立编译单元
 *   (依赖未发布的 napcat-protobuf、protobuf 类型被截断等), 直接引入会使 tsc
 *   深入第三方源码树并大量报错。故用 tsconfig `paths` 把 `napcat-types/*`
 *   重定向到本垫片, 让 typecheck 只检查项目自身代码 (见 AGENTS.md「构建 / 验证 / 部署」)。
 * 处理: 原文件对外部的相对 import 已替换为下方本地 `any` 别名 (stub 段)。
 * 更新: 升级 napcat-types 时, 请对照新版同名文件手动同步本文件。
 */

// ---- stub: 原相对 import (NapCatCore / OB11Message 等) 一律退化为 any ----
type NapCatCore = any;
type NapCatOneBot11Adapter = any;
type ActionMap = any;
type OB11EmitEventContent = any;
type NetworkAdapterConfig = any;
type OB11Message = any;

export interface PluginPackageJson {
    name?: string;
    plugin?: string;
    version?: string;
    main?: string;
    description?: string;
    author?: string;
}
export interface PluginConfigItem {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'multi-select' | 'html' | 'text';
    label: string;
    description?: string;
    default?: unknown;
    options?: {
        label: string;
        value: string | number;
    }[];
    placeholder?: string;
    /** 标记此字段为响应式：值变化时触发 schema 刷新 */
    reactive?: boolean;
    /** 是否隐藏此字段 */
    hidden?: boolean;
}
export type PluginConfigSchema = PluginConfigItem[];
/** NapCatConfig 类的静态方法接口（用于 typeof NapCatConfig） */
export interface INapCatConfigStatic {
    text(key: string, label: string, defaultValue?: string, description?: string, reactive?: boolean): PluginConfigItem;
    number(key: string, label: string, defaultValue?: number, description?: string, reactive?: boolean): PluginConfigItem;
    boolean(key: string, label: string, defaultValue?: boolean, description?: string, reactive?: boolean): PluginConfigItem;
    select(key: string, label: string, options: {
        label: string;
        value: string | number;
    }[], defaultValue?: string | number, description?: string, reactive?: boolean): PluginConfigItem;
    multiSelect(key: string, label: string, options: {
        label: string;
        value: string | number;
    }[], defaultValue?: (string | number)[], description?: string, reactive?: boolean): PluginConfigItem;
    html(content: string): PluginConfigItem;
    plainText(content: string): PluginConfigItem;
    combine(...items: PluginConfigItem[]): PluginConfigSchema;
}
/** NapCatConfig 类型（包含静态方法） */
export type NapCatConfigClass = INapCatConfigStatic;
/** HTTP 请求对象（包装类型） */
export interface PluginHttpRequest {
    /** 请求路径 */
    path: string;
    /** 请求方法 */
    method: string;
    /** 查询参数 */
    query: Record<string, string | string[] | undefined>;
    /** 请求体 */
    body: unknown;
    /** 请求头 */
    headers: Record<string, string | string[] | undefined>;
    /** 路由参数 */
    params: Record<string, string>;
    /** 原始请求对象（用于高级用法） */
    raw: unknown;
}
/** HTTP 响应对象（包装类型） */
export interface PluginHttpResponse {
    /** 设置状态码 */
    status(code: number): PluginHttpResponse;
    /** 发送 JSON 响应 */
    json(data: unknown): void;
    /** 发送文本响应 */
    send(data: string | Buffer): void;
    /** 设置响应头 */
    setHeader(name: string, value: string): PluginHttpResponse;
    /** 发送文件 */
    sendFile(filePath: string): void;
    /** 重定向 */
    redirect(url: string): void;
    /** 原始响应对象（用于高级用法） */
    raw: unknown;
}
/** 下一步函数类型 */
export type PluginNextFunction = (err?: unknown) => void;
/** 插件请求处理器类型 */
export type PluginRequestHandler = (req: PluginHttpRequest, res: PluginHttpResponse, next: PluginNextFunction) => void | Promise<void>;
/** HTTP 方法类型 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'all';
/** 插件 API 路由定义 */
export interface PluginApiRouteDefinition {
    /** HTTP 方法 */
    method: HttpMethod;
    /** 路由路径（相对于插件路由前缀） */
    path: string;
    /** 请求处理器 */
    handler: PluginRequestHandler;
}
/** 插件页面定义 */
export interface PluginPageDefinition {
    /** 页面路径（用于路由，如 'settings'） */
    path: string;
    /** 页面标题（显示在 Tab 上） */
    title: string;
    /** 页面图标（可选，支持 emoji 或图标名） */
    icon?: string;
    /** 页面 HTML 文件路径（相对于插件目录） */
    htmlFile: string;
    /** 页面描述 */
    description?: string;
}
/** 内存文件生成器 - 用于动态生成静态文件内容 */
export type MemoryFileGenerator = () => string | Buffer | Promise<string | Buffer>;
/** 内存静态文件定义 */
export interface MemoryStaticFile {
    /** 文件路径（相对于 urlPath） */
    path: string;
    /** 文件内容或生成器 */
    content: string | Buffer | MemoryFileGenerator;
    /** 可选的 MIME 类型 */
    contentType?: string;
}
/** 插件路由注册器 */
export interface PluginRouterRegistry {
    /**
     * 注册单个 API 路由（需要认证，挂载到 /api/Plugin/ext/{pluginId}/）
     * @param method HTTP 方法
     * @param path 路由路径
     * @param handler 请求处理器
     */
    api(method: HttpMethod, path: string, handler: PluginRequestHandler): void;
    /** 注册 GET API（需要认证） */
    get(path: string, handler: PluginRequestHandler): void;
    /** 注册 POST API（需要认证） */
    post(path: string, handler: PluginRequestHandler): void;
    /** 注册 PUT API（需要认证） */
    put(path: string, handler: PluginRequestHandler): void;
    /** 注册 DELETE API（需要认证） */
    delete(path: string, handler: PluginRequestHandler): void;
    /**
     * 注册单个无认证 API 路由（挂载到 /plugin/{pluginId}/api/）
     * @param method HTTP 方法
     * @param path 路由路径
     * @param handler 请求处理器
     */
    apiNoAuth(method: HttpMethod, path: string, handler: PluginRequestHandler): void;
    /** 注册 GET API（无认证） */
    getNoAuth(path: string, handler: PluginRequestHandler): void;
    /** 注册 POST API（无认证） */
    postNoAuth(path: string, handler: PluginRequestHandler): void;
    /** 注册 PUT API（无认证） */
    putNoAuth(path: string, handler: PluginRequestHandler): void;
    /** 注册 DELETE API（无认证） */
    deleteNoAuth(path: string, handler: PluginRequestHandler): void;
    /**
     * 注册插件页面
     * @param page 页面定义
     */
    page(page: PluginPageDefinition): void;
    /**
     * 注册多个插件页面
     * @param pages 页面定义数组
     */
    pages(pages: PluginPageDefinition[]): void;
    /**
     * 提供静态文件服务
     * @param urlPath URL 路径
     * @param localPath 本地文件夹路径（相对于插件目录或绝对路径）
     */
    static(urlPath: string, localPath: string): void;
    /**
     * 提供内存生成的静态文件服务
     * @param urlPath URL 路径
     * @param files 内存文件列表
     */
    staticOnMem(urlPath: string, files: MemoryStaticFile[]): void;
}
/** 插件管理器公共接口 */
export interface IPluginManager {
    readonly config: NetworkAdapterConfig;
    getPluginPath(): string;
    getPluginConfig(): PluginStatusConfig;
    getAllPlugins(): PluginEntry[];
    getLoadedPlugins(): PluginEntry[];
    getPluginInfo(pluginId: string): PluginEntry | undefined;
    setPluginStatus(pluginId: string, enable: boolean): Promise<void>;
    loadPluginById(pluginId: string): Promise<boolean>;
    unregisterPlugin(pluginId: string): Promise<void>;
    uninstallPlugin(pluginId: string, cleanData?: boolean): Promise<void>;
    reloadPlugin(pluginId: string): Promise<boolean>;
    loadDirectoryPlugin(dirname: string): Promise<void>;
    getPluginDataPath(pluginId: string): string;
    getPluginConfigPath(pluginId: string): string;
}
/** 插件配置 UI 控制器 - 用于动态控制配置界面 */
export interface PluginConfigUIController {
    /** 更新整个 schema */
    updateSchema: (schema: PluginConfigSchema) => void;
    /** 更新单个字段 */
    updateField: (key: string, field: Partial<PluginConfigItem>) => void;
    /** 移除字段 */
    removeField: (key: string) => void;
    /** 添加字段 */
    addField: (field: PluginConfigItem, afterKey?: string) => void;
    /** 显示字段 */
    showField: (key: string) => void;
    /** 隐藏字段 */
    hideField: (key: string) => void;
    /** 获取当前配置值 */
    getCurrentConfig: () => Record<string, unknown>;
}
/**
 * 插件日志接口 - 简化的日志 API
 */
export interface PluginLogger {
    /** 普通日志 */
    log(...args: unknown[]): void;
    /** 调试日志 */
    debug(...args: unknown[]): void;
    /** 信息日志 */
    info(...args: unknown[]): void;
    /** 警告日志 */
    warn(...args: unknown[]): void;
    /** 错误日志 */
    error(...args: unknown[]): void;
}
export interface NapCatPluginContext {
    core: NapCatCore;
    oneBot: NapCatOneBot11Adapter;
    actions: ActionMap;
    pluginName: string;
    pluginPath: string;
    configPath: string;
    dataPath: string;
    /** NapCatConfig 配置构建器 */
    NapCatConfig: NapCatConfigClass;
    adapterName: string;
    /** 插件管理器实例 */
    pluginManager: IPluginManager;
    /** 插件日志器 - 自动添加插件名称前缀 */
    logger: PluginLogger;
    /**
     * WebUI 路由注册器
     * 用于注册插件的 HTTP API 路由，路由将挂载到 /api/Plugin/ext/{pluginId}/
     * 静态资源将挂载到 /plugin/{pluginId}/files/{urlPath}/
     */
    router: PluginRouterRegistry;
    /**
     * 获取其他插件的导出模块
     * @param pluginId 目标插件 ID
     * @returns 插件导出的模块，如果插件未加载则返回 undefined
     */
    getPluginExports: <T = PluginModule>(pluginId: string) => T | undefined;
}
export interface PluginModule<T extends OB11EmitEventContent = OB11EmitEventContent, C = unknown> {
    plugin_init: (ctx: NapCatPluginContext) => void | Promise<void>;
    plugin_onmessage?: (ctx: NapCatPluginContext, event: OB11Message) => void | Promise<void>;
    plugin_onevent?: (ctx: NapCatPluginContext, event: T) => void | Promise<void>;
    plugin_cleanup?: (ctx: NapCatPluginContext) => void | Promise<void>;
    plugin_config_schema?: PluginConfigSchema;
    plugin_config_ui?: PluginConfigSchema;
    plugin_get_config?: (ctx: NapCatPluginContext) => C | Promise<C>;
    plugin_set_config?: (ctx: NapCatPluginContext, config: C) => void | Promise<void>;
    /**
     * 配置界面控制器 - 当配置界面打开时调用
     * 返回清理函数，在界面关闭时调用
     */
    plugin_config_controller?: (ctx: NapCatPluginContext, ui: PluginConfigUIController, initialConfig: Record<string, unknown>) => void | (() => void) | Promise<void | (() => void)>;
    /**
     * 响应式字段变化回调 - 当标记为 reactive 的字段值变化时调用
     */
    plugin_on_config_change?: (ctx: NapCatPluginContext, ui: PluginConfigUIController, key: string, value: unknown, currentConfig: Record<string, unknown>) => void | Promise<void>;
}
export type PluginRuntimeStatus = 'loaded' | 'error' | 'unloaded';
export interface PluginRuntime {
    /** 运行时状态 */
    status: PluginRuntimeStatus;
    /** 错误信息（当 status 为 'error' 时） */
    error?: string;
    /** 插件模块（当 status 为 'loaded' 时） */
    module?: PluginModule;
    /** 插件上下文（当 status 为 'loaded' 时） */
    context?: NapCatPluginContext;
}
export interface PluginEntry {
    /** 插件 ID（包名或目录名） */
    id: string;
    /** 文件系统目录名 */
    fileId: string;
    /** 显示名称 */
    name?: string;
    /** 版本号 */
    version?: string;
    /** 描述 */
    description?: string;
    /** 作者 */
    author?: string;
    /** 插件目录路径 */
    pluginPath: string;
    /** 入口文件路径 */
    entryPath?: string;
    /** package.json 内容 */
    packageJson?: PluginPackageJson;
    /** 是否启用（用户配置） */
    enable: boolean;
    /** 运行时是否已加载 */
    loaded: boolean;
    /** 运行时信息 */
    runtime: PluginRuntime;
}
export interface PluginStatusConfig {
    [key: string]: boolean;
}
