// @vitest-environment happy-dom
/**
 * SelectBox 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的下拉选择 (单选 / 多选共用)。
 * 合同: 开合 / 外点关闭 / Escape; 单选回填标量并关面板;
 *       多选按 options 声明顺序回填; 胶囊可移除且不连带开合。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import SelectBox, {
    type SelectBoxOption,
} from '../../../src/components/configFields/SelectBox';

const OPTIONS: readonly SelectBoxOption[] = [
    { label: '选项 A', value: 'a' },
    { label: '选项 B', value: 'b' },
    { label: '选项 C', value: 'c' },
];

/** 触发框: 唯一带 aria-haspopup="listbox" 的组合框 */
function getTrigger(): HTMLElement {
    return screen.getByRole('combobox', {
        name: (_name, element) =>
            element?.getAttribute('aria-haspopup') === 'listbox',
    });
}

function setup(
    props: Partial<ComponentProps<typeof SelectBox>> = {},
) {
    const onChange = vi.fn();
    render(
        <SelectBox
            label="示例单选"
            options={OPTIONS}
            value={[]}
            onChange={onChange}
            {...props}
        />,
    );
    return { onChange, trigger: getTrigger() };
}

describe('SelectBox', () => {
    it('空值显示默认 placeholder', () => {
        setup();
        expect(screen.getByText('请选择')).toBeInTheDocument();
    });

    it('可自定义 placeholder', () => {
        setup({ placeholder: '请选择项' });
        expect(screen.getByText('请选择项')).toBeInTheDocument();
    });

    it('单选已选显示 label', () => {
        setup({ value: ['b'] });
        expect(screen.getByText('选项 B')).toBeInTheDocument();
    });

    it('多选已选显示可移除的胶囊', () => {
        setup({ value: ['a', 'b'], multiple: true });
        expect(
            screen.getByRole('button', { name: '移除 选项 A' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: '移除 选项 B' }),
        ).toBeInTheDocument();
    });

    it('点触发框展开与收起', () => {
        setup();
        expect(getTrigger()).toHaveAttribute(
            'aria-expanded',
            'false',
        );
        fireEvent.click(getTrigger());
        expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(getTrigger());
        expect(getTrigger()).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('键盘 Enter 展开, Escape 收起', () => {
        setup();
        fireEvent.keyDown(getTrigger(), { key: 'Enter' });
        expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(getTrigger(), { key: 'Escape' });
        expect(getTrigger()).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('点击组件外部收起', () => {
        setup();
        fireEvent.click(getTrigger());
        expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');
        fireEvent.mouseDown(document.body);
        expect(getTrigger()).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('单选点选项回填标量并关面板', () => {
        const { onChange } = setup();
        fireEvent.click(getTrigger());
        fireEvent.click(
            screen.getByRole('option', { name: '选项 B' }),
        );
        expect(onChange).toHaveBeenCalledWith(['b']);
        expect(getTrigger()).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });

    it('aria-selected / aria-multiselectable 反映状态', () => {
        setup({ value: ['b'] });
        fireEvent.click(getTrigger());
        expect(
            screen.getByRole('option', { name: '选项 B' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(
            screen.getByRole('option', { name: '选项 A' }),
        ).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByRole('listbox')).toHaveAttribute(
            'aria-multiselectable',
            'false',
        );
    });

    it('多选按 options 声明顺序回填 (非点击顺序)', () => {
        const onChange = vi.fn();
        function Harness() {
            const [value, setValue] = useState<(string | number)[]>(
                [],
            );
            return (
                <SelectBox
                    label="示例多选"
                    options={OPTIONS}
                    value={value}
                    multiple
                    onChange={(next) => {
                        onChange(next);
                        setValue(next);
                    }}
                />
            );
        }
        render(<Harness />);
        fireEvent.click(getTrigger());
        fireEvent.click(
            screen.getByRole('option', { name: '选项 C' }),
        );
        fireEvent.click(
            screen.getByRole('option', { name: '选项 A' }),
        );
        expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
    });

    it('多选点胶囊移除已选项且不连带开合', () => {
        const onChange = vi.fn();
        function Harness() {
            const [value, setValue] = useState<(string | number)[]>([
                'a',
                'b',
            ]);
            return (
                <SelectBox
                    label="示例多选"
                    options={OPTIONS}
                    value={value}
                    multiple
                    onChange={(next) => {
                        onChange(next);
                        setValue(next);
                    }}
                />
            );
        }
        render(<Harness />);
        fireEvent.click(
            screen.getByRole('button', { name: '移除 选项 A' }),
        );
        expect(onChange).toHaveBeenCalledWith(['b']);
        expect(getTrigger()).toHaveAttribute(
            'aria-expanded',
            'false',
        );
    });
});
