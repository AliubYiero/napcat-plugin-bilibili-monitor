/**
 * `qrcode` Node 入口的类型补充
 *
 * 包的 `browser` 字段会把默认入口映射到 `lib/browser.js` (无 `toFile`),
 * 因此插件显式引用 `lib/server.js`。该子路径没有官方类型声明, 这里只补
 * 用到的 `toFile`。
 */
declare module 'qrcode/lib/server.js' {
    import type { QRCodeToFileOptions } from 'qrcode';

    export function toFile(
        path: string,
        text: string,
        options?: QRCodeToFileOptions,
    ): Promise<void>;
}
