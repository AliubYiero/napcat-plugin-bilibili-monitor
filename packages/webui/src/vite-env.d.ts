/// <reference types="vite/client" />

declare global {
    // 构建期由 webui/vite.config.ts 从 packages/plugin/package.json 注入
    const __PLUGIN_ID__: string;
    const __PLUGIN_DISPLAY_NAME__: string;
    const __PLUGIN_VERSION__: string;
    const __PLUGIN_GITHUB_URL__: string;

    interface Window {
        __PLUGIN_NAME__?: string;
    }
}

export {};
