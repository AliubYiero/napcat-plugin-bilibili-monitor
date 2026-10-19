// @vitest-environment happy-dom
/**
 * SelectField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 select kind。
 * 合同: 适配为单选 SelectBox (value 装箱为 [v]); 回调取标量; 空数组守卫。
 * SelectBox 自身行为由其单测覆盖, 此处 mock 掉以隔离适配逻辑。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { SelectFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import SelectField from '../../../src/components/configFields/SelectField';

vi.mock('../../../src/components/configFields/SelectBox', () => ({
    default: ({
        value,
        multiple,
        onChange,
    }: {
        value: (string | number)[];
        multiple?: boolean;
        onChange: (next: (string | number)[]) => void;
    }) => (
        <div>
            <span data-testid="value">{JSON.stringify(value)}</span>
            <span data-testid="multiple">
                {String(multiple ?? false)}
            </span>
            <button type="button" onClick={() => onChange(['b'])}>
                emit-scalar
            </button>
            <button type="button" onClick={() => onChange([])}>
                emit-empty
            </button>
        </div>
    ),
}));

const FIELD: SelectFieldDescriptor = {
    kind: 'select',
    label: '示例单选',
    default: 'a',
    options: [
        { label: '选项 A', value: 'a' },
        { label: '选项 B', value: 'b' },
    ],
};

describe('SelectField', () => {
    it('以装箱数组传给 SelectBox, 且非多选', () => {
        render(
            <SelectField
                field={FIELD}
                value="a"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByTestId('value')).toHaveTextContent(
            '["a"]',
        );
        expect(screen.getByTestId('multiple')).toHaveTextContent(
            'false',
        );
    });

    it('选择后回传标量', () => {
        const onChange = vi.fn();
        render(
            <SelectField
                field={FIELD}
                value="a"
                onChange={onChange}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'emit-scalar' }),
        );
        expect(onChange).toHaveBeenCalledWith('b');
    });

    it('空数组不回调 (守卫)', () => {
        const onChange = vi.fn();
        render(
            <SelectField
                field={FIELD}
                value="a"
                onChange={onChange}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'emit-empty' }),
        );
        expect(onChange).not.toHaveBeenCalled();
    });
});
