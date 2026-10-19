/**
 * 原生配置面板 Schema 构建测试
 *
 * 范式: docs/config-pattern.md 的分组布局。
 * 合同: FIELDS 的 section 在面板中渲染为分组标题; 登录状态块插在第一个
 *       section 之后; 纯样式块置于最前; webui 专属字段不出现在面板。
 */

import type {
    NapCatPluginContext,
    PluginConfigItem,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type { SectionFieldDescriptor } from 'shared';
import { describe, expect, it } from 'vitest';
import {
    buildConfigSchema,
    buildSectionHtml,
} from '../../src/config';

/** 分组标题项的判定标记 (避免误匹配样式块中的 `.bili-section-title`) */
const SECTION_TITLE_MARK = 'class="bili-section-title"';

const createItem = (
    key: string,
    type: PluginConfigItem['type'],
    label: string,
    defaultValue?: unknown,
    description?: string,
): PluginConfigItem => ({
    key,
    type,
    label,
    default: defaultValue,
    description,
});

const NapCatConfig = {
    text: (
        key: string,
        label: string,
        defaultValue?: unknown,
        description?: string,
    ) => createItem(key, 'string', label, defaultValue, description),
    number: (
        key: string,
        label: string,
        defaultValue?: unknown,
        description?: string,
    ) => createItem(key, 'number', label, defaultValue, description),
    boolean: (
        key: string,
        label: string,
        defaultValue?: unknown,
        description?: string,
    ) => createItem(key, 'boolean', label, defaultValue, description),
    select: (
        key: string,
        label: string,
        _options: unknown,
        defaultValue?: unknown,
        description?: string,
    ) => createItem(key, 'select', label, defaultValue, description),
    multiSelect: (
        key: string,
        label: string,
        _options: unknown,
        defaultValue?: unknown,
        description?: string,
    ) =>
        createItem(
            key,
            'multi-select',
            label,
            defaultValue,
            description,
        ),
    html: (content: string) => createItem('', 'html', '', content),
    plainText: (content: string) =>
        createItem('', 'text', '', content),
    combine: (...items: PluginConfigItem[]) => items,
};

function buildSchema() {
    const ctx = {
        pluginName: 'napcat-plugin-bilibili-monitor',
        pluginManager: { getPluginInfo: () => undefined },
        NapCatConfig,
    } as unknown as NapCatPluginContext;
    return buildConfigSchema(ctx);
}

/** html 项的内容文本 */
const htmlOf = (item: PluginConfigItem) => String(item.default);

describe('buildConfigSchema 分组布局', () => {
    it('首个 schema 项是分组样式块', () => {
        const schema = buildSchema();
        expect(htmlOf(schema[0])).toContain('<style>');
        expect(htmlOf(schema[0])).toContain('.bili-section-title');
        expect(htmlOf(schema[0])).toContain('.bili-section-desc');
        expect(htmlOf(schema[0])).toContain(
            '[data-theme="dark"] .bili-section-title',
        );
    });

    it('三个 section 都渲染为分组标题 HTML', () => {
        const titles = buildSchema()
            .filter((item) =>
                htmlOf(item).includes(SECTION_TITLE_MARK),
            )
            .map((item) => htmlOf(item));
        expect(titles).toHaveLength(3);
        expect(titles[0]).toContain('基础配置');
        expect(titles[1]).toContain('直播监听配置');
        expect(titles[2]).toContain('动态监听配置');
    });

    it('登录状态块插在第一个 section 之后', () => {
        const schema = buildSchema();
        const sectionIndex = schema.findIndex((item) =>
            htmlOf(item).includes(SECTION_TITLE_MARK),
        );
        const loginIndex = schema.findIndex((item) =>
            htmlOf(item).includes('B 站账号'),
        );
        const adminIndex = schema.findIndex(
            (item) => item.key === 'adminUsers',
        );
        expect(sectionIndex).toBeGreaterThan(0);
        expect(loginIndex).toBe(sectionIndex + 1);
        expect(adminIndex).toBeGreaterThan(loginIndex);
    });

    it('webui 专属字段不出现在面板', () => {
        expect(
            buildSchema().some((item) => item.key === 'triggerModes'),
        ).toBe(false);
    });
});

describe('buildSectionHtml', () => {
    const field: SectionFieldDescriptor = {
        kind: 'section',
        label: '示例分组',
        description: '分组说明',
    };

    it('渲染标题与副标题', () => {
        const html = buildSectionHtml(field);
        expect(html).toContain('bili-section-bar');
        expect(html).toContain('示例分组');
        expect(html).toContain('bili-section-desc');
        expect(html).toContain('分组说明');
    });

    it('无 description 时不渲染副标题', () => {
        expect(
            buildSectionHtml({ kind: 'section', label: '无说明' }),
        ).not.toContain('bili-section-desc');
    });

    it('标题与说明经 HTML 转义', () => {
        const html = buildSectionHtml({
            kind: 'section',
            label: '<b>标题</b>',
            description: '<script>x</script>',
        });
        expect(html).toContain('&lt;b&gt;标题&lt;/b&gt;');
        expect(html).not.toContain('<script>');
    });
});
