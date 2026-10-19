import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 插件身份以 packages/plugin/package.json 为唯一权威, 与构建期注入同源
const pluginPkg = JSON.parse(
    readFileSync(
        resolve(__dirname, '../plugin/package.json'),
        'utf-8',
    ),
) as {
    name: string;
    plugin?: string;
    version: string;
    napcat?: { homepage?: string };
};

/**
 * 单测配置
 *
 * 与 vite.config.ts (构建配置) 分开: 构建配置带单文件内联与插件身份注入,
 * 不适合测试期加载。
 *
 * 纯函数测试跑在 node 环境 (本文件默认); 组件测试在文件顶部用
 * `// @vitest-environment happy-dom` 按文件覆盖。
 * 组件 (tsx) 需 @vitejs/plugin-react 做 JSX 转换, 故此处挂 react 插件。
 */
export default defineConfig({
    plugins: [react()],
    resolve: {
        // 与 vite.config.ts 保持一致的条件解析顺序
        conditions: ['node', 'default'],
    },
    // 构建期注入的插件身份, 测试期需同样定义 (api.ts 模块加载即读取)
    define: {
        __PLUGIN_ID__: JSON.stringify(pluginPkg.name),
        __PLUGIN_DISPLAY_NAME__: JSON.stringify(
            pluginPkg.plugin || pluginPkg.name,
        ),
        __PLUGIN_VERSION__: JSON.stringify(pluginPkg.version),
        __PLUGIN_GITHUB_URL__: JSON.stringify(
            pluginPkg.napcat?.homepage ??
                'https://github.com/AliubYiero/napcat-plugin-template',
        ),
    },
    test: {
        environment: 'node',
        setupFiles: ['./test/setup.ts'],
        include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    },
});
