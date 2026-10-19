// @vitest-environment happy-dom
/**
 * StringListField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 stringList 标签输入。
 * tagList 纯函数的拆分/去重/删除已由其单测覆盖, 此处只测 DOM 层合同:
 * 分隔符即添加、回车/失焦提交、空输入退格删末项、容器聚焦、placeholder 切换。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { StringListFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import StringListField from '../../../src/components/configFields/StringListField';

const FIELD: StringListFieldDescriptor = {
    kind: 'stringList',
    label: '超级管理员 QQ',
    default: [],
    placeholder: '输入 QQ 号后按回车添加',
};

function setup(value: readonly string[] = []) {
    const onChange = vi.fn();
    render(
        <StringListField
            field={FIELD}
            value={value}
            onChange={onChange}
        />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    return { input, onChange };
}

describe('StringListField', () => {
    it('空值显示 field.placeholder', () => {
        const { input } = setup([]);
        expect(input.placeholder).toBe('输入 QQ 号后按回车添加');
    });

    it('有标签时无 placeholder', () => {
        const { input } = setup(['a']);
        expect(input.placeholder).toBe('');
    });

    it('输入分隔符即添加标签', () => {
        const { input, onChange } = setup([]);
        fireEvent.change(input, { target: { value: '10001,' } });
        expect(onChange).toHaveBeenCalledWith(['10001']);
    });

    it('回车提交残留文本', () => {
        const { input, onChange } = setup([]);
        fireEvent.change(input, { target: { value: '10002' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith(['10002']);
    });

    it('失焦提交残留文本', () => {
        const { input, onChange } = setup([]);
        fireEvent.change(input, { target: { value: '10003' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(['10003']);
    });

    it('失焦进同容器内胶囊时不提交', () => {
        const { input, onChange } = setup(['a']);
        fireEvent.change(input, { target: { value: '10004' } });
        const chip = screen.getByRole('button', { name: '移除 a' });
        fireEvent.blur(input, { relatedTarget: chip });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('空输入退格删除末项', () => {
        const { input, onChange } = setup(['a', 'b']);
        fireEvent.keyDown(input, { key: 'Backspace' });
        expect(onChange).toHaveBeenCalledWith(['a']);
    });

    it('容器为 label, 与输入框原生关联 (点击即聚焦)', () => {
        const { input } = setup([]);
        const container = input.closest('label');
        expect(container).not.toBeNull();
        expect(container?.className).toBe('tag-input');
    });
});
