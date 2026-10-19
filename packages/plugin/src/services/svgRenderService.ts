/**
 * 度量字体族 (字体宽度计算的权威字体, 须为渲染插件已注册的族名或别名)
 */
export const MEASURE_FONT_FAMILY = 'Noto Sans CJK SC';

/**
 * 渲染字体族 CSS 栈 (SVG 根元素的 font-family)
 * 首选与度量字体保持一致, 其余为宿主字体回退
 */
export const RENDER_FONT_FAMILY = `'${MEASURE_FONT_FAMILY}','Noto Sans SC','Microsoft YaHei',sans-serif`;

export class SvgRenderService {
    constructor(private baseUrl: string = 'http://127.0.0.1:6099') {}

    /**
     * 调用 SVG 渲染插件接口
     * @param svgCode SVG 代码字符串
     * @param saveWebImage 是否缓存网络图片（可选，默认 true）
     */
    async renderSvg(
        svgCode: string,
        saveWebImage: boolean = true,
    ): Promise<{
        success: boolean;
        imageBase64?: string;
        message?: string;
    }> {
        const url = `${this.baseUrl}/plugin/napcat-plugin-svg-render/api/svg/render`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    svg: svgCode,
                    saveWebImage: saveWebImage,
                }),
            });

            const result = (await response.json()) as {
                code: number;
                data?: { imageBase64: string; format: string };
                message?: string;
            };

            if (result.code === 0 && result.data) {
                return {
                    success: true,
                    imageBase64: result.data.imageBase64,
                };
            } else {
                return {
                    success: false,
                    message: result.message || '渲染失败',
                };
            }
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
    }

    /**
     * 预计字符宽度 (基于渲染插件的字体度量数据, 默认思源黑体)
     * @param text 计算宽度的文本
     * @param fontSize 字体大小
     * @param fontFamily 字体族名或别名 (须为渲染插件已注册的字体, 默认与渲染字体一致)
     */
    async calculateTextWidth(
        text: string,
        fontSize: number = 16,
        fontFamily: string = MEASURE_FONT_FAMILY,
    ): Promise<{
        success: boolean;
        totalWidth?: number;
        message?: string;
    }> {
        const url = `${this.baseUrl}/plugin/napcat-plugin-svg-render/api/char/width`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    fontSize: fontSize,
                    fontFamily: fontFamily,
                }),
            });

            const result = (await response.json()) as {
                code: number;
                data?: { totalWidth: number };
                message?: string;
            };

            if (result.code === 0 && result.data) {
                return {
                    success: true,
                    totalWidth: result.data.totalWidth,
                };
            } else {
                return {
                    success: false,
                    message: result.message || '计算失败',
                };
            }
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : String(error),
            };
        }
    }
}

export const svgRenderService = new SvgRenderService();
