# SVG 渲染字体改用思源黑体并与宽度计算对齐

卡片与图表的 SVG 根元素字体由 `'PingFang SC','Microsoft YaHei',sans-serif` 改为 `'Noto Sans CJK SC','Noto Sans SC','Microsoft YaHei',sans-serif`（首选思源黑体，苹方无跨平台宿主映射故移除，保留雅黑作回退）。字体栈由 `packages/plugin/src/services/svgRenderService.ts` 的 `RENDER_FONT_FAMILY` 常量统一提供，`pushCard` 与 `onlineChart` 两个 SVG 站点共用，避免再次漂移。

宽度计算（`/char/width`）此前未传 `fontFamily`，实际按渲染插件默认字体（思源宋体）度量，与渲染字体不一致，注释"基于微软雅黑"亦已过期。现由 `MEASURE_FONT_FAMILY`（`Noto Sans CJK SC`）作为唯一真源，`RENDER_FONT_FAMILY` 由其派生，`calculateTextWidth` 默认传入该族名，使度量与渲染两端首选字体一致。注意度量接口只接受单个已注册族名/别名，整条 CSS 栈会因"字体未注册"报错，故不能共用同一字符串。

该能力依赖渲染插件 `fontFamily` 参数透传与度量式宽度计算（自 `1.1.0` 起），故 README 声明最低版本要求。思源黑体须安装于渲染宿主（`fonts-noto-cjk`），缺失时尺寸计算偏差会导致错行溢出；渲染失败仍按既有回退链降级纯文本。未引入字体配置项与运行时版本探测，与 0001 的"外部依赖 + 失败回退 + 不引入本地重依赖"一致。
