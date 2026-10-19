import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 插件身份以 packages/plugin/package.json 为唯一权威, 构建期注入到前端
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
const pluginId = pluginPkg.name;
const pluginDisplayName = pluginPkg.plugin || pluginId;
const pluginVersion = pluginPkg.version;
const pluginGithubUrl =
    pluginPkg?.napcat?.homepage ||
    'https://github.com/AliubYiero/napcat-plugin-bilibili-monitor';

export default defineConfig({
    plugins: [
        react(),
        viteSingleFile(),
        {
            name: 'inject-plugin-meta',
            transformIndexHtml(html) {
                // 占位符语法与 shared/displayTokens 一致 ({{...}})
                return html.replace(
                    /\{\{PLUGIN_DISPLAY_NAME\}\}/g,
                    pluginDisplayName,
                );
            },
        },
    ],
    define: {
        __PLUGIN_ID__: JSON.stringify(pluginId),
        __PLUGIN_DISPLAY_NAME__: JSON.stringify(pluginDisplayName),
        __PLUGIN_VERSION__: JSON.stringify(pluginVersion),
        __PLUGIN_GITHUB_URL__: JSON.stringify(pluginGithubUrl),
    },
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        cssCodeSplit: false,
        assetsInlineLimit: 100000000,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
            },
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:6099',
            '/plugin': 'http://localhost:6099',
        },
    },
});
