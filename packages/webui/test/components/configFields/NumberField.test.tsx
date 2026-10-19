// @vitest-environment happy-dom
/**
 * NumberField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 number kind。
 * 合同: 合法数字提交为 number; 空 / 非有限数回退显示原值;
 *       越界不前端钳制 (区间钳制归后端 sanitizeConfig)。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { NumberFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import NumberField from '../../../src/components/configFields/NumberField';

const FIELD: NumberFieldDescriptor = {
    kind: 'number',
    label: '示例数值',
    default: 10,
    min: 0,
    max: 100,
    step: 1,
    placeholder: '请输入数值',
};

function setup(value = 10) {
    const onChange = vi.fn();
    render(
        <NumberField
            field={FIELD}
            value={value}
            onChange={onChange}
        />,
    );
    const input = screen.getByPlaceholderText(
        '请输入数值',
    ) as HTMLInputElement;
    return { input, onChange };
}

describe('NumberField', () => {
    it('合法数字提交为 number', () => {
        const { input, onChange } = setup(10);
        fireEvent.change(input, { target: { value: '20' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(20);
    });

    it('空串不提交并恢复原值', () => {
        const { input, onChange } = setup(10);
        fireEvent.change(input, { target: { value: '' } });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
        expect(input.value).toBe('10');
    });

    it('非有限数不提交并恢复原值', () => {
        const { input, onChange } = setup(10);
        fireEvent.change(input, { target: { value: '1e999' } });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
        expect(input.value).toBe('10');
    });

    it('值未变化时不提交', () => {
        const { input, onChange } = setup(10);
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('越界值仍提交 (钳制归后端清洗)', () => {
        const { input, onChange } = setup(10);
        fireEvent.change(input, { target: { value: '999' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(999);
    });
});
