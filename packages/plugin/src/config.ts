/**
 * 插件配置模块
 *
 * 配置字段的权威源在 `shared/src/config.ts` 的 `FIELDS`:
 *   - 默认值由 `getDefaultConfig()` 派生
 *   - 清洗由 `sanitizeConfig()` 派生
 *   - 本文件只负责把 `FIELDS` 映射成 NapCat 原生面板 Schema (需要 ctx),
 *     并前置一段登录状态展示块。
 */

import type {
    NapCatPluginContext,
    PluginConfigSchema,
    PluginEntry,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type {
    ConfigField,
    DisplayTokenValues,
    SectionFieldDescriptor,
} from 'shared';
import {
    DEFAULT_PAGE,
    escapeHtml,
    FIELDS,
    getDefaultConfig,
    resolveDisplayContent,
} from 'shared';
import type { PluginConfig } from './types';

/** 登录状态数据 (由入口在 plugin_init 时传入, 避免 config -> store 循环引用) */
export interface LoginStatusInfo {
    user?: {
        uid: string;
        name: string;
        avatar: string;
    };
    cookieExpired: boolean;
}

/** 默认配置 (从 FIELDS 派生) */
export const DEFAULT_CONFIG: PluginConfig = getDefaultConfig();

/** 构建登录状态展示 HTML (静态块, 刷新配置页/重启插件后更新) */
export function buildLoginStatusHtml(
    status?: LoginStatusInfo,
): string {
    const user = status?.user;

    // 未登录
    if (!user) {
        return `
            <div style="padding: 14px; background: #fff3f5; border: 1px solid #FB7299; border-radius: 12px; margin-bottom: 12px; color: #666;">
                <p style="margin: 0 0 6px 0; font-weight: 600; color: #FB7299;">B 站账号: 未登录</p>
                <p style="margin: 0; font-size: 13px;">动态/视频监听需要登录。请私聊机器人发送 #bili user login 扫码登录</p>
            </div>
        `;
    }

    const expiredBadge = status?.cookieExpired
        ? '<span style="margin-left: 8px; padding: 2px 8px; border-radius: 6px; background: #ff4d4f; color: white; font-size: 12px;">Cookie 已失效</span>'
        : '';
    return `
        <div style="padding: 14px; background: #f0f9ff; border: 1px solid #52a0e8; border-radius: 12px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${user.avatar}" alt="avatar" style="width: 48px; height: 48px; border-radius: 50%;" referrerpolicy="no-referrer" />
                <div>
                    <p style="margin: 0; font-weight: 600; color: #333;">${user.name}${expiredBadge}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px; color: #888;">UID: ${user.uid}</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * 分组标题样式
 *
 * html 字段会被直接注入宿主 DOM, 因此:
 *   - 类名统一加 `bili-section-` 前缀 (style 是全局作用域);
 *   - 暗色用 `.dark` / `[data-theme="dark"]` 祖先选择器, 跟随 NapCat 面板
 *     的主题 class (宿主不读取 prefers-color-scheme, 也不会为本字符串生成
 *     Tailwind dark: 规则)。
 */
const SECTION_STYLE = `<style>
.bili-section-title { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; padding-top: 14px; border-top: 1px solid rgba(251,114,153,0.18); font-size: 14px; font-weight: 600; line-height: 20px; color: #b23a63; letter-spacing: .2px; }
.bili-section-bar { width: 3px; height: 14px; border-radius: 2px; background: #fb7299; flex: 0 0 auto; }
.bili-section-desc { margin: 0; font-size: 12px; line-height: 18px; color: #6b7280; }
.dark .bili-section-title, [data-theme="dark"] .bili-section-title { color: #f49ab5; }
.dark .bili-section-desc, [data-theme="dark"] .bili-section-desc { color: #9ca3af; }
</style>`;

/** 分组标题 HTML (置于纯样式块之外, 由 SECTION_STYLE 提供样式) */
export function buildSectionHtml(
    field: SectionFieldDescriptor,
): string {
    const description = field.description
        ? `<p class="bili-section-desc">${escapeHtml(field.description)}</p>`
        : '';
    return `<div class="bili-section"><div class="bili-section-title"><span class="bili-section-bar"></span><span>${escapeHtml(field.label)}</span></div>${description}</div>`;
}

/**
 * 构建 NapCat 原生配置面板 Schema
 *
 * 遍历 shared 的 FIELDS, 按 kind 映射到 `ctx.NapCatConfig` 的构建器, 并在
 * 第一个 section 之后插入登录状态展示块 (登录/登出后重启插件或刷新页面时更新)。
 * 【必须】新增配置项只需改 shared/src/config.ts (FIELDS), 此处无需改动。
 *
 *   - boolean(key, label, defaultValue?, description?)          → 开关
 *   - text(key, label, defaultValue?, description?)             → 文本输入
 *   - number(key, label, defaultValue?, description?)           → 数字输入
 *   - select(key, label, options, defaultValue?, description?)  → 下拉单选
 *   - multiSelect(key, label, options, defaultValue?, description?) → 下拉多选
 *   - html(content) / plainText(content)                        → 纯展示, 不保存值
 *   - combine(...items)                                         → 合并为 Schema
 */
export function buildConfigSchema(
    ctx: NapCatPluginContext,
    loginStatus?: LoginStatusInfo,
): PluginConfigSchema {
    const values = getDisplayTokenValues(ctx);
    const visibleFields = FIELDS_ALL.filter(
        (field) => field.scope !== 'webui',
    );
    const items = visibleFields.map((field) =>
        toNapCatItem(ctx, field, values),
    );
    const loginItem = ctx.NapCatConfig.html(
        buildLoginStatusHtml(loginStatus),
    );
    // 纯样式块 → 信息头 → 首个分组标题 → 登录状态 → 其余配置项;
    // 没有 section 时回退为「首项之后」(保持旧行为)。
    const firstSectionIndex = visibleFields.findIndex(
        (field) => field.kind === 'section',
    );
    const insertAt =
        firstSectionIndex >= 0
            ? firstSectionIndex + 1
            : Math.min(1, items.length);
    return ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(SECTION_STYLE),
        ...items.slice(0, insertAt),
        loginItem,
        ...items.slice(insertAt),
    );
}

/**
 * FIELDS 的遍历视图: 收窄为描述符统一类型
 * (as const 字面量元组不含未显式声明的可选属性如 scope)。
 */
const FIELDS_ALL: readonly ConfigField[] = FIELDS;

/**
 * 插件显示名 (package.json 的 `plugin` 字段)
 *
 * 【必须】显示名以 package.json 为唯一权威: 取宿主已解析的信息,
 * 回退链 `plugin` → `name` → 插件 id。
 */
export function getPluginDisplayName(
    ctx: NapCatPluginContext,
): string {
    const info = readPluginInfo(ctx);
    return info?.packageJson?.plugin ?? info?.name ?? ctx.pluginName;
}

/**
 * 汇总 display 占位符所需的值
 *
 * 插件名/描述取宿主已解析的 package.json (getPluginInfo), 拓展页地址由插件 id 拼装。
 */
function getDisplayTokenValues(
    ctx: NapCatPluginContext,
): DisplayTokenValues {
    const info = readPluginInfo(ctx);
    const pkg = info?.packageJson;
    return {
        pluginDisplayName: getPluginDisplayName(ctx),
        pluginDescription:
            pkg?.description ?? info?.description ?? '',
        extensionUrl: `/plugin/${ctx.pluginName}/page/dashboard`,
        extensionDashboardUrl: `/plugin/${ctx.pluginName}/page/dashboard#/${DEFAULT_PAGE}`,
    };
}

function readPluginInfo(
    ctx: NapCatPluginContext,
): PluginEntry | undefined {
    try {
        return ctx.pluginManager?.getPluginInfo?.(ctx.pluginName);
    } catch {
        return undefined;
    }
}

type NapCatConfigItem = PluginConfigSchema[number];

function toNapCatItem(
    ctx: NapCatPluginContext,
    field: ConfigField,
    values: DisplayTokenValues,
): NapCatConfigItem {
    const { NapCatConfig } = ctx;
    switch (field.kind) {
        case 'boolean':
            return NapCatConfig.boolean(
                field.key,
                field.label,
                field.default,
                field.description,
            );
        case 'text':
        case 'password':
            return NapCatConfig.text(
                field.key,
                field.label,
                field.default,
                field.description,
            );
        case 'number':
            return NapCatConfig.number(
                field.key,
                field.label,
                field.default,
                field.description,
            );
        case 'select':
            return NapCatConfig.select(
                field.key,
                field.label,
                [...field.options],
                field.default,
                field.description,
            );
        case 'multiSelect':
            return NapCatConfig.multiSelect(
                field.key,
                field.label,
                [...field.options],
                [...field.default],
                field.description,
            );
        case 'stringList':
            // 原生面板无列表控件: 降级为逗号分隔文本, 由清洗层转回数组
            return NapCatConfig.text(
                field.key,
                field.label,
                field.default.join(','),
                field.description,
            );
        case 'section':
            // 仅布局: 分组标题 (样式见 SECTION_STYLE)
            return NapCatConfig.html(buildSectionHtml(field));
        case 'display':
            // 解析 {{...}} 占位符后再交给原生面板渲染
            return NapCatConfig.html(
                resolveDisplayContent(field.content, values),
            );
    }
}
