import { useCallback, useEffect, useState } from 'react';
import type { PageId } from 'shared';
import { buildHash, parsePage } from '../utils/pageRoute';

/**
 * WebUI hash 路由 hook
 *
 * URL 是当前页面的唯一真相源: 挂载时读取 hash 并归一化, 监听 hashchange,
 * 切页写 location.hash (自动压入历史, 浏览器后退/前进随之生效)。
 */
export function usePageRoute(): [PageId, (page: PageId) => void] {
    const [page, setPage] = useState<PageId>(() =>
        parsePage(window.location.hash),
    );

    useEffect(() => {
        // 归一无 hash / 非法值的地址栏 (replace, 不新增历史)
        const normalized = buildHash(parsePage(window.location.hash));
        if (window.location.hash !== normalized) {
            window.history.replaceState(null, '', normalized);
        }

        const onHashChange = () => {
            setPage(parsePage(window.location.hash));
        };
        window.addEventListener('hashchange', onHashChange);
        return () =>
            window.removeEventListener('hashchange', onHashChange);
    }, []);

    const navigate = useCallback((next: PageId) => {
        const hash = buildHash(next);
        // 点击当前页 no-op, 避免污染历史栈
        if (window.location.hash === hash) return;
        window.location.hash = hash;
    }, []);

    return [page, navigate];
}
