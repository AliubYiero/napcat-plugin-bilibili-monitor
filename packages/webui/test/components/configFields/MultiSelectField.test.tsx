// @vitest-environment happy-dom
/**
 * MultiSelectField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 multiSelect kind。
 * 合同: 原样透传为多选 SelectBox (value 与 onChange 均为数组)。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { MultiSelectFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import MultiSelectField from '../../../src/components/configFields/MultiSelectField';

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
            <button
                type="button"
                onClick={() => onChange(['a', 'c'])}
            >
                emit-multi
            </button>
        </div>
    ),
}));

const FIELD: MultiSelectFieldDescriptor = {
    kind: 'multiSelect',
    label: '示例多选',
    default: [],
    options: [
        { label: '选项 A', value: 'a' },
        { label: '选项 B', value: 'b' },
        { label: '选项 C', value: 'c' },
    ],
};

describe('MultiSelectField', () => {
    it('以 multiple 与数组 value 传给 SelectBox', () => {
        render(
            <MultiSelectField
                field={FIELD}
                value={['a', 'b']}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByTestId('multiple')).toHaveTextContent(
            'true',
        );
        expect(screen.getByTestId('value')).toHaveTextContent(
            '["a","b"]',
        );
    });

    it('onChange 原样透传数组', () => {
        const onChange = vi.fn();
        render(
            <MultiSelectField
                field={FIELD}
                value={[]}
                onChange={onChange}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'emit-multi' }),
        );
        expect(onChange).toHaveBeenCalledWith(['a', 'c']);
    });
});
