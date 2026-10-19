// @vitest-environment happy-dom
/**
 * LayoutFields 组件行为 (SectionField / DisplayField)
 *
 * 范式: docs/webui-config-pattern.md 的布局与展示字段。
 * 合同: 仅布局 / 展示不落盘; DisplayField 用构建期身份解析 {{...}} 占位符。
 */

import { render, screen } from '@testing-library/react';
import {
    DEFAULT_PAGE,
    type DisplayFieldDescriptor,
    EXTENSION_DASHBOARD_URL_TOKEN,
    EXTENSION_URL_TOKEN,
    PLUGIN_DISPLAY_NAME_TOKEN,
    type SectionFieldDescriptor,
} from 'shared';
import { describe, expect, it } from 'vitest';
import {
    DisplayField,
    SectionField,
} from '../../../src/components/configFields/LayoutFields';

describe('SectionField', () => {
    it('渲染分组标题', () => {
        const field: SectionFieldDescriptor = {
            kind: 'section',
            label: '示例字段',
        };
        render(<SectionField field={field} />);
        expect(screen.getByText('示例字段')).toBeInTheDocument();
    });
});

describe('DisplayField', () => {
    const field: DisplayFieldDescriptor = {
        kind: 'display',
        content: `${PLUGIN_DISPLAY_NAME_TOKEN}|${EXTENSION_URL_TOKEN}|${EXTENSION_DASHBOARD_URL_TOKEN}`,
    };

    it('用构建期注入身份解析占位符', () => {
        const { container } = render(<DisplayField field={field} />);
        expect(container.textContent).toContain(
            __PLUGIN_DISPLAY_NAME__,
        );
        expect(container.textContent).toContain(
            `/plugin/${__PLUGIN_ID__}/page/dashboard`,
        );
        expect(container.textContent).toContain(`#/${DEFAULT_PAGE}`);
    });

    it('不残留占位符', () => {
        const { container } = render(<DisplayField field={field} />);
        expect(container.textContent).not.toContain('{{');
    });
});
