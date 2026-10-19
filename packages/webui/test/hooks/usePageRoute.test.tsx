// @vitest-environment happy-dom
/**
 * usePageRoute hook 行为
 *
 * 范式: docs/webui-config-pattern.md 的 URL 路由 (hash)。
 * 合同: URL 是唯一真相源; 挂载归一化 (replaceState);
 *       切页写 location.hash; 点击当前页 no-op; hashchange 更新当前页。
 */

import { act, renderHook } from '@testing-library/react';
import { DEFAULT_PAGE } from 'shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePageRoute } from '../../src/hooks/usePageRoute';

beforeEach(() => {
    window.location.hash = '';
});

describe('usePageRoute', () => {
    it('挂载时读取 hash 作为当前页', () => {
        window.location.hash = '#/help';
        const { result } = renderHook(() => usePageRoute());
        expect(result.current[0]).toBe('help');
    });

    it('空 hash 归一化为默认页 (replaceState)', () => {
        const { result } = renderHook(() => usePageRoute());
        expect(result.current[0]).toBe(DEFAULT_PAGE);
        expect(window.location.hash).toBe(`#/${DEFAULT_PAGE}`);
    });

    it('navigate 写入 location.hash', () => {
        const { result } = renderHook(() => usePageRoute());
        act(() => {
            result.current[1]('sessions');
        });
        expect(window.location.hash).toBe('#/sessions');
    });

    it('navigate 当前页时 no-op (hash 不变)', () => {
        window.location.hash = '#/sessions';
        const { result } = renderHook(() => usePageRoute());
        act(() => {
            result.current[1]('sessions');
        });
        expect(window.location.hash).toBe('#/sessions');
    });

    it('hashchange 事件更新当前页', () => {
        const { result } = renderHook(() => usePageRoute());
        act(() => {
            window.location.hash = '#/help';
            window.dispatchEvent(new Event('hashchange'));
        });
        expect(result.current[0]).toBe('help');
    });
});
