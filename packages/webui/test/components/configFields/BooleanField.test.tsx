// @vitest-environment happy-dom
/**
 * BooleanField 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的 boolean kind。
 * 合同: 受控开关, 切换即提交 boolean。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { BooleanFieldDescriptor } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import BooleanField from '../../../src/components/configFields/BooleanField';

const FIELD: BooleanFieldDescriptor = {
    kind: 'boolean',
    label: '示例开关',
    description: 'boolean 类型：开 / 关',
    default: false,
};

describe('BooleanField', () => {
    it('渲染 label 与描述', () => {
        render(
            <BooleanField
                field={FIELD}
                value={false}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByText('示例开关')).toBeInTheDocument();
        expect(
            screen.getByText('boolean 类型：开 / 关'),
        ).toBeInTheDocument();
    });

    it('开关反映当前值', () => {
        render(
            <BooleanField
                field={FIELD}
                value={true}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('勾选触发 onChange(true)', () => {
        const onChange = vi.fn();
        render(
            <BooleanField
                field={FIELD}
                value={false}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByRole('checkbox'));
        expect(onChange).toHaveBeenCalledWith(true);
    });

    it('取消勾选触发 onChange(false)', () => {
        const onChange = vi.fn();
        render(
            <BooleanField
                field={FIELD}
                value={true}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByRole('checkbox'));
        expect(onChange).toHaveBeenCalledWith(false);
    });
});
