// @vitest-environment happy-dom
/**
 * TextField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 text kind。
 * 合同: 本地态 + 失焦 / 回车提交, 值未变不提交, 外部值变化回填。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { TextFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import TextField from '../../../src/components/configFields/TextField';

const FIELD: TextFieldDescriptor = {
    kind: 'text',
    label: '示例文本',
    default: '',
    placeholder: '请输入文本',
};

function setup(value = '') {
    const onChange = vi.fn();
    const { rerender } = render(
        <TextField field={FIELD} value={value} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText(
        '请输入文本',
    ) as HTMLInputElement;
    return { input, onChange, rerender };
}

describe('TextField', () => {
    it('输入后失焦提交新值', () => {
        const { input, onChange } = setup('');
        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith('hello');
    });

    it('回车提交', () => {
        const { input, onChange } = setup('');
        fireEvent.change(input, { target: { value: 'hello' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('hello');
    });

    it('值未变化时不提交', () => {
        const { input, onChange } = setup('hello');
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('外部 value 变化回填输入框', () => {
        const { input, rerender } = setup('a');
        rerender(
            <TextField field={FIELD} value="b" onChange={vi.fn()} />,
        );
        expect(input.value).toBe('b');
    });
});
