/**
 * 展示块 (display) 占位符「单一声明源」
 *
 * display 字段的 `content` 是 ctx-free 静态 HTML; 其中的动态值以 `{{TOKEN}}` 形式声明,
 * 由前后端各自在可得处解析:
 *   - 后端: 原生面板渲染前, 用 ctx 的插件信息 (ctx.pluginManager.getPluginInfo)
 *   - 前端: 自建前端渲染前, 用构建期注入的插件身份
 *
 * 语法统一为 `{{...}}` (webui 的 index.html 构建期占位符亦改用同一拼写)。
 * 【必须】未命中的 token 回退空串; 注入值做 HTML 转义, 防止破坏展示块结构。
 */

/** 插件显示名 (package.json 的 `plugin` 字段) */
export const PLUGIN_DISPLAY_NAME_TOKEN = '{{PLUGIN_DISPLAY_NAME}}';
/** 插件描述 (package.json 的 `description` 字段) */
export const PLUGIN_DESCRIPTION_TOKEN = '{{PLUGIN_DESCRIPTION}}';
/** 插件拓展页面地址 (指向自建前端, 形如 /plugin/<id>/page/dashboard) */
export const EXTENSION_URL_TOKEN = '{{EXTENSION_URL}}';
/** 插件拓展页面仪表盘地址 (指向自建前端默认页, 形如 /plugin/<id>/page/dashboard#/status) */
export const EXTENSION_DASHBOARD_URL_TOKEN =
    '{{EXTENSION_DASHBOARD_URL}}';

/** 解析 display content 所需的值; 缺失时以空串回退 */
export interface DisplayTokenValues {
    pluginDisplayName?: string;
    pluginDescription?: string;
    extensionUrl?: string;
    extensionDashboardUrl?: string;
}

/** HTML 转义, 供注入展示块的值使用 */
export function escapeHtml(value: string): string {
    return value
        .split('&')
        .join('&amp;')
        .split('<')
        .join('&lt;')
        .split('>')
        .join('&gt;')
        .split('"')
        .join('&quot;')
        .split("'")
        .join('&#39;');
}

/**
 * 解析 display content 中的占位符 (纯函数)
 *
 * 【必须】未命中或值为空的 token 一律回退空串; 注入值经 HTML 转义。
 */
export function resolveDisplayContent(
    content: string,
    values: DisplayTokenValues,
): string {
    const replacements: ReadonlyArray<[string, string]> = [
        [
            PLUGIN_DISPLAY_NAME_TOKEN,
            escapeHtml(values.pluginDisplayName ?? ''),
        ],
        [
            PLUGIN_DESCRIPTION_TOKEN,
            escapeHtml(values.pluginDescription ?? ''),
        ],
        [EXTENSION_URL_TOKEN, escapeHtml(values.extensionUrl ?? '')],
        [
            EXTENSION_DASHBOARD_URL_TOKEN,
            escapeHtml(values.extensionDashboardUrl ?? ''),
        ],
    ];
    let resolved = content;
    for (const [token, value] of replacements) {
        resolved = resolved.split(token).join(value);
    }
    return resolved;
}

/**
 * 密码字段在原生面板的引导 (纯函数)
 *
 * 原生面板无密码控件: scope 为 `both` 的 password 字段改为渲染本引导,
 * 外观复用面板自身 (HeroUI) 的输入框类名以保持一致 —— 一个禁用的输入框
 * (显示掩码), 右侧一个「前往拓展页面修改 <label>」的跳转按钮, 说明文案
 * 与其它组件一致地放在输入框下方 (helper)。
 * (EXTENSION_DASHBOARD_URL_TOKEN 由两侧注入)
 *
 * 【必须】label / description 做 HTML 转义; 不含任何落盘 key, 原生面板不写回。
 * 类名 (bg-default-100 / rounded-medium / group-data-[...] 等) 取自面板已编译的
 * HeroUI 组件, 故注入后能命中既有样式; 若上游换主题需同步核对。
 *
 * 签名用原语参数而非 PasswordFieldDescriptor, 避免 displayTokens 反向依赖 config。
 */
export function buildPasswordPanelHint(
    label: string,
    description?: string,
): string {
    const helper = description
        ? `<div data-slot="helper-wrapper" class="flex p-1 relative flex-col gap-1.5"><div data-slot="description" class="text-tiny text-foreground-400">${escapeHtml(description)}</div></div>`
        : '';
    return `<div class="flex flex-col w-full mb-4 group" data-slot="base" data-filled="true" data-filled-within="true" data-has-label="true" data-has-value="true">
  <div data-slot="input-wrapper" class="relative w-full inline-flex tap-highlight-transparent shadow-sm px-3 bg-default-100 min-h-10 rounded-medium flex-col items-start justify-center gap-0 h-14 py-2" style="cursor: not-allowed;">
    <label data-slot="label" class="absolute z-10 pointer-events-none origin-top-left flex-shrink-0 subpixel-antialiased block text-foreground-500 will-change-auto !duration-200 !ease-out transition-[transform,color,left,opacity] group-data-[filled-within=true]:text-default-600 group-data-[filled-within=true]:scale-85 text-small group-data-[filled-within=true]:-translate-y-[calc(50%_+_theme(fontSize.small)/2_-_6px)] pe-2 max-w-full text-ellipsis overflow-hidden">${escapeHtml(label)}</label>
    <div data-slot="inner-wrapper" class="inline-flex w-full items-center h-full box-border gap-2 group-data-[has-label=true]:items-end pb-0.5">
      <input data-slot="input" class="flex-1 min-w-0 w-full font-normal bg-transparent !outline-none text-small text-ellipsis overflow-hidden" disabled readonly value="••••••••" />
      <a href="${EXTENSION_DASHBOARD_URL_TOKEN}" target="_blank" rel="noopener noreferrer" style="flex-shrink: 0; padding: 6px 14px; background: #fb7299; color: #ffffff; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; line-height: 16px; white-space: nowrap;">前往拓展页面修改${escapeHtml(label)}</a>
    </div>
  </div>
  ${helper}
</div>`;
}
