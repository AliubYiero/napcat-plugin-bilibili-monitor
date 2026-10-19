// @vitest-environment happy-dom
/**
 * Chip 组件行为
 *
 * 范式: docs/webui-config-pattern.md 的标签胶囊。
 * 合同: 渲染 label 与无障碍名; 删除按钮独立于容器交互 (stopPropagation)。
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Chip from '../../../src/components/configFields/Chip';

describe('Chip', () => {
    it('渲染 label 与带无障碍名的删除按钮', () => {
        render(<Chip label="10001" onRemove={vi.fn()} />);
        expect(screen.getByText('10001')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: '移除 10001' }),
        ).toBeInTheDocument();
    });

    it('点删除按钮调用 onRemove', () => {
        const onRemove = vi.fn();
        render(<Chip label="10001" onRemove={onRemove} />);
        fireEvent.click(
            screen.getByRole('button', { name: '移除 10001' }),
        );
        expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('删除点击不冒泡到容器', () => {
        const onRemove = vi.fn();
        const onParentClick = vi.fn();
        render(
            <button type="button" onClick={onParentClick}>
                <Chip label="10001" onRemove={onRemove} />
            </button>,
        );
        fireEvent.click(
            screen.getByRole('button', { name: '移除 10001' }),
        );
        expect(onRemove).toHaveBeenCalledTimes(1);
        expect(onParentClick).not.toHaveBeenCalled();
    });
});
