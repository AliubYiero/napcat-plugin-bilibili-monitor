// @vitest-environment happy-dom
/**
 * PasswordField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 password kind。
 * 核心合同: 渲染为非 password 类型 + CSS 掩码, 规避浏览器密码管理器;
 * 显隐切换、失焦 / 回车提交、值未变不提交。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { PasswordFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import PasswordField from '../../../src/components/configFields/PasswordField';

const FIELD: PasswordFieldDescriptor = {
    kind: 'password',
    label: '示例密钥',
    default: '',
    placeholder: '请输入密钥',
};

function setup(value = '') {
    const onChange = vi.fn();
    render(
        <PasswordField
            field={FIELD}
            value={value}
            onChange={onChange}
        />,
    );
    const input = screen.getByPlaceholderText(
        '请输入密钥',
    ) as HTMLInputElement;
    const toggle = screen.getByRole('button');
    return { onChange, input, toggle };
}

describe('PasswordField', () => {
    it('渲染为 type="text" 而非 password', () => {
        const { input } = setup();
        expect(input).toHaveAttribute('type', 'text');
    });

    it('默认带掩码 class', () => {
        const { input } = setup();
        expect(input).toHaveClass('password-mask');
    });

    it('带 autoComplete=off 与各密码管理器忽略标记', () => {
        const { input } = setup();
        expect(input).toHaveAttribute('autocomplete', 'off');
        expect(input).toHaveAttribute('data-1p-ignore');
        expect(input).toHaveAttribute('data-lpignore', 'true');
        expect(input).toHaveAttribute('data-bwignore');
    });

    it('点击眼睛撤除掩码, 再点恢复', () => {
        const { input, toggle } = setup();
        expect(toggle).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(toggle);
        expect(input).not.toHaveClass('password-mask');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(toggle);
        expect(input).toHaveClass('password-mask');
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('输入后失焦提交新值', () => {
        const { input, onChange } = setup('');
        fireEvent.change(input, { target: { value: 'secret' } });
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith('secret');
    });

    it('值未变化时不提交', () => {
        const { input, onChange } = setup('secret');
        fireEvent.focus(input);
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('回车提交', () => {
        const { input, onChange } = setup('');
        fireEvent.change(input, { target: { value: 'secret' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('secret');
    });
});
