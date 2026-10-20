/**
 * 原生配置面板 Schema 构建测试
 *
 * 范式: docs/config-pattern.md 的分组布局。
 * 合同: FIELDS 的 section 在面板中渲染为分组标题; 登录块 (kind: login) 由
 *       FIELDS 声明顺序决定位置, 运行时状态参数注入; 纯样式块置于最前;
 *       webui 专属字段不出现在面板。
 */

import type {
    NapCatPluginContext,
    PluginConfigItem,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type { LoginStatus, SectionFieldDescriptor } from 'shared';
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

function buildSchema(loginStatus?: LoginStatus) {
    const ctx = {
        pluginName: 'napcat-plugin-bilibili-monitor',
        pluginManager: { getPluginInfo: () => undefined },
        NapCatConfig,
    } as unknown as NapCatPluginContext;
    return buildConfigSchema(ctx, loginStatus);
}

const LOGGED_IN: LoginStatus = {
    loggedIn: true,
    cookieExpired: false,
    user: {
        uid: '10001',
        name: '测试用户',
        avatar: 'https://example.com/avatar.png',
    },
    loginTime: 1_700_000_000_000,
};

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

    it('四个 section 都渲染为分组标题 HTML', () => {
        const titles = buildSchema()
            .filter((item) =>
                htmlOf(item).includes(SECTION_TITLE_MARK),
            )
            .map((item) => htmlOf(item));
        expect(titles).toHaveLength(4);
        expect(titles[0]).toContain('B 站账号');
        expect(titles[1]).toContain('基础配置');
        expect(titles[2]).toContain('直播监听配置');
        expect(titles[3]).toContain('动态监听配置');
    });

    it('登录块紧跟 B 站账号分组标题', () => {
        const schema = buildSchema();
        const accountSectionIndex = schema.findIndex(
            (item) =>
                htmlOf(item).includes(SECTION_TITLE_MARK) &&
                htmlOf(item).includes('B 站账号'),
        );
        const loginIndex = schema.findIndex((item) =>
            htmlOf(item).includes('前往拓展页扫码登录'),
        );
        const adminIndex = schema.findIndex(
            (item) => item.key === 'adminUsers',
        );
        expect(accountSectionIndex).toBeGreaterThan(0);
        expect(loginIndex).toBe(accountSectionIndex + 1);
        expect(adminIndex).toBeGreaterThan(loginIndex);
    });

    it('未登录块带说明文案与拓展页面入口', () => {
        const html = buildSchema()
            .map(htmlOf)
            .find((content) =>
                content.includes('前往拓展页扫码登录'),
            );
        expect(html).toContain('动态 / 视频监听');
        expect(html).toContain('需要登录后使用');
        expect(html).toContain('未登录');
        expect(html).toContain('前往拓展页扫码登录');
        expect(html).toContain(
            '/plugin/napcat-plugin-bilibili-monitor/page/dashboard#/status',
        );
        expect(html).toContain('#bili user login');
    });

    it('已登录块展示用户信息与失效徽标', () => {
        const html = buildSchema({
            ...LOGGED_IN,
            cookieExpired: true,
        })
            .map(htmlOf)
            .find((content) => content.includes('测试用户'));
        expect(html).toContain('UID: 10001');
        expect(html).toContain('https://example.com/avatar.png');
        expect(html).toContain('Cookie 已失效');
        expect(html).not.toContain('登录于');
        expect(html).not.toContain('前往拓展页面扫码登录');
    });

    it('Cookie 有效但用户信息缺失时仍视为已登录', () => {
        const html = buildSchema({
            ...LOGGED_IN,
            user: null,
        })
            .map(htmlOf)
            .find((content) => content.includes('B 站账号已登录'));
        expect(html).toContain('用户信息获取失败');
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
