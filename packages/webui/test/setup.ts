/**
 * 组件测试全局 setup (由 vitest.config.ts 的 setupFiles 加载)
 *
 * 对 node 环境 (纯函数) 与 happy-dom 环境 (组件) 用例都会执行,
 * 故 DOM 相关的清理登记需做环境守卫, 避免污染纯函数用例。
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof document !== 'undefined') {
    // 未开 vitest globals, RTL 的自动清理不会注册; 手动登记避免用例间 DOM 叠加
    afterEach(cleanup);
}
