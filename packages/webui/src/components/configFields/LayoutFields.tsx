import {
    DEFAULT_PAGE,
    type DisplayFieldDescriptor,
    resolveDisplayContent,
} from 'shared';

/** 纯展示块 (仅展示, 不落盘) */
export function DisplayField({
    field,
}: {
    field: DisplayFieldDescriptor;
}) {
    // 与后端对称: 用构建期注入的插件身份解析 {{...}} 占位符
    const content = resolveDisplayContent(field.content, {
        pluginDisplayName: __PLUGIN_DISPLAY_NAME__,
        pluginDescription: '',
        extensionUrl: `/plugin/${__PLUGIN_ID__}/page/dashboard`,
        extensionDashboardUrl: `/plugin/${__PLUGIN_ID__}/page/dashboard#/${DEFAULT_PAGE}`,
    });
    return (
        <div
            className="text-xs text-gray-400"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容由插件作者在 FIELDS 中声明, 视为可信
            dangerouslySetInnerHTML={{ __html: content }}
        />
    );
}
