// @vitest-environment happy-dom
/**
 * ConfigForm 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的声明式配置表单。
 * 合同: 按 FIELDS 的 section 切成多张卡片; 每张卡按 kind 渲染控件;
 *       过滤 scope='panel'; 布局 / 展示字段不落盘; onChange 冒泡字段 key;
 *       overrides 按 key 覆盖。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { getDefaultConfig } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import ConfigForm, {
    type FieldRenderProps,
} from '../../src/components/ConfigForm';

function renderForm(
    overrides?: Record<string, ComponentType<FieldRenderProps>>,
) {
    const onChange = vi.fn();
    const { container } = render(
        <ConfigForm
            config={getDefaultConfig()}
            onChange={onChange}
            overrides={overrides}
        />,
    );
    return { onChange, container };
}

describe('ConfigForm', () => {
    it('按 kind 渲染各字段控件', () => {
        renderForm();
        expect(screen.getByText('超级管理员 QQ')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('输入 QQ 号后按回车添加'),
        ).toBeInTheDocument();
        expect(screen.getByText('指令触发方式')).toBeInTheDocument();
        expect(screen.getByText('推送变化类型')).toBeInTheDocument();
        expect(
            screen.getByText('直播轮询间隔(秒)'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('动态轮询间隔(秒)'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('开播 @ 分组人数'),
        ).toBeInTheDocument();
    });

    it('过滤 scope=panel 的仅原生面板字段', () => {
        renderForm();
        expect(screen.queryByText(/跳转至拓展页面/)).toBeNull();
    });

    it('按 section 切成三张卡片并保持顺序', () => {
        const { container } = renderForm();
        expect(container.querySelectorAll('.card')).toHaveLength(3);
        expect(
            screen
                .getAllByRole('heading', { level: 3 })
                .map((heading) => heading.textContent),
        ).toEqual(['基础配置', '直播监听配置', '动态监听配置']);
    });

    it('卡片标题不触发 onChange', () => {
        const { onChange } = renderForm();
        expect(screen.getByText('直播监听配置')).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('控件变更冒泡字段 key', () => {
        const { onChange } = renderForm();
        const input = screen.getByPlaceholderText(
            '输入 QQ 号后按回车添加',
        );
        fireEvent.change(input, { target: { value: '10001' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('adminUsers', [
            '10001',
        ]);
    });

    it('overrides 按 key 覆盖渲染', () => {
        const Override = ({ value }: FieldRenderProps) => (
            <div data-testid="override">{String(value)}</div>
        );
        renderForm({ pollIntervalSeconds: Override });
        expect(screen.getByTestId('override')).toBeInTheDocument();
        expect(screen.queryByText('直播轮询间隔(秒)')).toBeNull();
    });
});
