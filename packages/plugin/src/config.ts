/**
 * 插件配置模块
 *
 * 配置字段的权威源在 `shared/src/config.ts` 的 `FIELDS`:
 *   - 默认值由 `getDefaultConfig()` 派生
 *   - 清洗由 `sanitizeConfig()` 派生
 *   - 本文件只负责把 `FIELDS` 映射成 NapCat 原生面板 Schema (需要 ctx)。
 */

import type {
    NapCatPluginContext,
    PluginConfigSchema,
    PluginEntry,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type {
    ConfigField,
    DisplayTokenValues,
    LoginStatus,
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

/** 默认配置 (从 FIELDS 派生) */
export const DEFAULT_CONFIG: PluginConfig = getDefaultConfig();

/** 登录卡片外框 (粉色调, 与面板其他展示块同一视觉语言) */
const LOGIN_CARD_STYLE =
    'padding: 18px 20px; background: linear-gradient(135deg, #fff5f8 0%, #ffe9f0 100%); border: 1px solid rgba(251, 114, 153, 0.25); border-radius: 16px; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(251, 114, 153, 0.08);';

/** 登录卡片外层 (prose 包裹与原展示块一致) */
function wrapLoginCard(content: string): string {
    return `<div class="prose dark:prose-invert max-w-none"><div style="${LOGIN_CARD_STYLE}">${content}</div></div>`;
}

/** 状态胶囊 */
function buildLoginBadge(
    text: string,
    tone: 'pink' | 'red' = 'pink',
): string {
    const colors =
        tone === 'red'
            ? 'background: #ff4d4f; color: #ffffff;'
            : 'background: rgba(251, 114, 153, 0.12); color: #FB7299;';
    return `<span style="display: inline-block; padding: 1px 9px; border-radius: 999px; ${colors} font-size: 11px; font-weight: 600; line-height: 18px; white-space: nowrap;">${escapeHtml(text)}</span>`;
}

/** 未登录说明: 高亮其中的「动态 / 视频监听」短语 */
function buildLoginDescription(description: string): string {
    return escapeHtml(description).replace(
        /动态\s*\/\s*视频监听/,
        (match) =>
            `<span style="color: #d6336c; font-weight: 600;">${match}</span>`,
    );
}

/** 未登录卡片: 状态 + 说明 + 拓展页入口 + 私聊指令引导 */
function buildLoggedOutCard(
    description: string,
    extensionUrl?: string,
): string {
    const link = extensionUrl
        ? `<a href="${escapeHtml(extensionUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; background: linear-gradient(135deg, #FB7299 0%, #ff8fb3 100%); color: #ffffff; border-radius: 10px; font-size: 13px; font-weight: 600; text-decoration: none; line-height: 18px; box-shadow: 0 2px 8px rgba(251, 114, 153, 0.35);">前往拓展页扫码登录 <span style="font-size: 14px;">→</span></a>`
        : '';

    return wrapLoginCard(`
        <div style="display: flex; align-items: flex-start; gap: 14px;">
            <div style="flex-shrink: 0; width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #FB7299 0%, #FC9DB8 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(251, 114, 153, 0.3);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
                    <polyline points="17 2 12 7 7 2"></polyline>
                </svg>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                    <span style="font-weight: 700; font-size: 15px; color: #d6336c;">B 站账号</span>
                    ${buildLoginBadge('未登录')}
                </div>
                <p style="margin: 0 0 14px 0; font-size: 13px; color: #8b5566; line-height: 1.5;">
                    ${buildLoginDescription(description)}
                </p>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
                    ${link}
                    <span style="font-size: 12px; color: #a86b7e;">
                        或私聊机器人发送 <code style="padding: 2px 6px; background: rgba(251, 114, 153, 0.12); border-radius: 5px; font-size: 12px; color: #d6336c; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">#bili user login</code>
                    </span>
                </div>
            </div>
        </div>
    `);
}

/** 已登录卡片: 头像 + 昵称/UID + 状态胶囊 + 切换账号提示 */
function buildLoggedInCard(
    status: LoginStatus,
    extensionUrl?: string,
): string {
    const user = status.user;
    const expired = status.cookieExpired;
    const avatar = user?.avatar
        ? `<img src="${escapeHtml(user.avatar)}" alt="avatar" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(251, 114, 153, 0.35); flex-shrink: 0;" referrerpolicy="no-referrer" />`
        : `<div style="flex-shrink: 0; width: 42px; height: 42px; border-radius: 50%; background: rgba(251, 114, 153, 0.15); display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FB7299" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </div>`;

    const name = user ? escapeHtml(user.name) : 'B 站账号已登录';
    const meta = user
        ? `UID: ${escapeHtml(user.uid)}`
        : '用户信息获取失败';

    const expiredBadge = expired
        ? buildLoginBadge('Cookie 已失效', 'red')
        : '';
    const footNote = expired
        ? '请在拓展页登出后重新扫码登录'
        : `如需切换账号, 请先发送 <code style="padding: 2px 6px; background: rgba(251, 114, 153, 0.12); border-radius: 5px; font-size: 12px; color: #d6336c; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">#bili user logout</code>`;
    const footLink =
        expired && extensionUrl
            ? ` <a href="${escapeHtml(extensionUrl)}" target="_blank" rel="noopener noreferrer" style="color: #d6336c; font-weight: 600; text-decoration: none;">前往拓展页</a>`
            : '';

    return wrapLoginCard(`
        <div style="display: flex; align-items: flex-start; gap: 14px;">
            ${avatar}
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                    <span style="font-weight: 700; font-size: 15px; color: #d6336c;">${name}</span>
                    ${buildLoginBadge('已登录')}
                    ${expiredBadge}
                </div>
                <p style="margin: 0; font-size: 13px; color: #8b5566; line-height: 1.5;">${meta}</p>
                <p style="margin: 14px 0 0 0; font-size: 12px; color: #a86b7e; line-height: 1.5;">${footNote}${footLink}</p>
            </div>
        </div>
    `);
}

/**
 * 构建登录状态展示 HTML (静态块, 刷新配置页/重启插件后更新)
 *
 * @param status 运行时登录状态
 * @param description 未登录时的说明文案 (由 FIELDS 的 login 描述符提供)
 * @param extensionUrl 拓展页面地址 (未登录/失效时提供跳转入口)
 */
export function buildLoginStatusHtml(
    status?: LoginStatus,
    description = '仅动态 / 视频监听需要登录后使用',
    extensionUrl?: string,
): string {
    return status?.loggedIn
        ? buildLoggedInCard(status, extensionUrl)
        : buildLoggedOutCard(description, extensionUrl);
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
 *   - login                                                     → 登录状态块 (运行时注入)
 *   - combine(...items)                                         → 合并为 Schema
 */
export function buildConfigSchema(
    ctx: NapCatPluginContext,
    loginStatus?: LoginStatus,
): PluginConfigSchema {
    const values = getDisplayTokenValues(ctx);
    const visibleFields = FIELDS_ALL.filter(
        (field) => field.scope !== 'webui',
    );
    const items = visibleFields.map((field) =>
        toNapCatItem(ctx, field, values, loginStatus),
    );
    return ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(SECTION_STYLE),
        ...items,
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
    loginStatus?: LoginStatus,
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
        case 'login':
            // 运行时状态参数注入; 未登录时附带拓展页面跳转入口
            return NapCatConfig.html(
                buildLoginStatusHtml(
                    loginStatus,
                    field.description,
                    values.extensionDashboardUrl,
                ),
            );
    }
}
