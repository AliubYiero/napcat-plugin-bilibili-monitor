/**
 * WebUI hash 路由纯函数
 *
 * 范式: docs/webui-config-pattern.md 的"URL 路由"。
 * WebUI 以单文件 HTML 内嵌于 NapCat iframe (服务端路径固定), 只有 hash 段
 * 客户端可控且不会触发服务端 404, 故页面切换后以 `#/<pageId>` 反映当前页。
 */

import { DEFAULT_PAGE, PAGES, type PageId } from 'shared';

const PAGE_IDS: readonly string[] = PAGES.map((page) => page.id);

const HASH_PREFIX = '#/';

function isPageId(value: string): value is PageId {
    return PAGE_IDS.includes(value);
}

/**
 * 从 location.hash 解析页面 id (入参含前导 `#`)。
 * 宽容取首段 (忽略多余路径段与尾斜杠); 空或非法值回退 DEFAULT_PAGE。
 */
export function parsePage(hash: string): PageId {
    const segment = hash.replace(/^#\/?/, '').split('/')[0];
    return isPageId(segment) ? segment : DEFAULT_PAGE;
}

/** 由页面 id 生成规范 hash (含前导 `#`) */
export function buildHash(page: PageId): string {
    return `${HASH_PREFIX}${page}`;
}
