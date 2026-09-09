/**
 * 同接变化图表服务
 *
 * 职责：
 * 1. 纯函数生成同接变化折线图 SVG（自适应宽度、分段着色、图例、
 *    直播开始标记），移植自外部验证过的 generateChart 实现
 * 2. 分段合成：直播内容历史 + 顶层标题/分区字段兜底合成最后一段，
 *    顶层字段与历史末段相同时不重复合成
 * 3. 组装纯图片消息（渲染一次，复用 base64 发多个目标）
 * 4. 导出文本摘要（峰值/末值/采样点数），供指令链路渲染失败时回退
 */
import { pluginState } from '../../core/state';
import type {
    BiliLiveContent,
    BiliOnlineSnapshot,
} from '../../store/biliLiveRoom.store';
import {
    type OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { svgRenderService } from '../svgRender.service';

/** 图表最小宽度 */
const CHART_MIN_WIDTH = 800;
/** 图表最大宽度 */
const CHART_MAX_WIDTH = 2000;

/** 分段着色调色板（循环使用） */
const SEGMENT_COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#FF8A5C',
    '#A29BFE',
];

/** 点归属分段判定的端点容差（秒） */
const SEGMENT_MATCH_TOLERANCE_SEC = 300;

/** 图表绘制数据（从房间信息收集，纯数据无 store 依赖） */
export interface OnlineChartData {
    /** 主播名称（标题用） */
    uname: string;
    /** 开播时间戳（秒），未知为 0 */
    liveTimeSec: number;
    /** 图表右边界时间戳（秒）：下播为结束时刻，直播中为当前时间 */
    endTimeSec: number;
    /** 当前内容标题（顶层字段，兜底合成最后一段用） */
    title: string;
    parentAreaName: string;
    areaName: string;
    /** 直播内容历史 */
    liveContents: BiliLiveContent[];
    /** 同接快照序列 [同接数, 秒级时间戳] */
    onlineSnapshots: BiliOnlineSnapshot[];
}

/** 图表折线分段 */
interface ChartSegment {
    title: string;
    color: string;
    startTime: number;
    /** Infinity 表示持续到图表右边界 */
    endTime: number;
}

/**
 * 合成图表分段：
 * 1. 直播内容历史逐段着色
 * 2. 顶层标题/分区字段兜底合成最后一段——与历史末段
 *    （title + 分区 + startTime）完全相同时视为已归档，不重复合成
 */
function buildSegments(data: OnlineChartData): ChartSegment[] {
    const segments: ChartSegment[] = data.liveContents.map(
        (seg, idx) => ({
            title: `${seg.title} (${seg.parent_area_name} - ${seg.area_name})`,
            color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
            startTime: seg.startTime,
            endTime: seg.endTime,
        }),
    );

    const last = data.liveContents[data.liveContents.length - 1];
    const sameAsLast =
        last &&
        last.title === data.title &&
        last.parent_area_name === data.parentAreaName &&
        last.area_name === data.areaName;
    if (sameAsLast) return segments;

    // 顶层字段兜底段：覆盖最后历史段之后到图表右边界的数据点
    const startTime = last ? last.endTime : data.liveTimeSec;
    const title = data.title || '直播内容';
    segments.push({
        title: `${title} (${data.parentAreaName} - ${data.areaName})`,
        color: SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length],
        startTime,
        endTime: Infinity,
    });
    return segments;
}

/** Y 轴漂亮刻度定标 */
function calculateYAxis(max: number): { max: number; step: number } {
    if (max === 0) return { max: 1, step: 1 };
    const desiredTicks = 6;
    const roughStep = max / (desiredTicks - 1);
    const magnitude = Math.pow(
        10,
        Math.floor(Math.log10(roughStep)),
    );
    const normalized = roughStep / magnitude;
    let niceStep: number;
    if (normalized < 1.5) niceStep = 1 * magnitude;
    else if (normalized < 3.5) niceStep = 2 * magnitude;
    else if (normalized < 7.5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;
    const yMax = Math.ceil(max / niceStep) * niceStep;
    return { max: yMax || 1, step: niceStep || 1 };
}

/** X 轴时间刻度步长（毫秒），按时间跨度分档 */
function calculateTimeStep(rangeMs: number): number {
    const seconds = rangeMs / 1000;
    if (seconds < 60) return 10 * 1000;
    if (seconds < 300) return 30 * 1000;
    if (seconds < 1800) return 2 * 60 * 1000;
    if (seconds < 7200) return 5 * 60 * 1000;
    if (seconds < 21600) return 15 * 60 * 1000;
    return 30 * 60 * 1000;
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** XML 转义，防止标题中的特殊字符破坏 SVG */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * 生成同接变化折线图 SVG
 * 快照不足 2 个数据点时返回 null（无法成线，调用方跳过）
 */
export function generateOnlineChartSvg(
    data: OnlineChartData,
): string | null {
    const snapshots = data.onlineSnapshots ?? [];
    if (snapshots.length < 2) return null;

    const points = snapshots
        .map(([viewers, ts]) => ({ x: ts * 1000, y: viewers, ts }))
        .sort((a, b) => a.ts - b.ts);

    // X 轴范围：优先从开播时间起
    const dataMin = points[0].x;
    const dataMax = points[points.length - 1].x;
    const xMin =
        data.liveTimeSec > 0 && data.liveTimeSec * 1000 <= dataMin
            ? data.liveTimeSec * 1000
            : dataMin;
    const range = dataMax - xMin;
    const xMax = dataMax + range * 0.02 || dataMax + 60000;

    const N = points.length;

    // Y 轴定标
    const yResult = calculateYAxis(
        Math.max(...points.map((p) => p.y)),
    );
    const yMax = yResult.max;
    const yStep = yResult.step;
    const yTicksCount = Math.floor(yMax / yStep) + 1;

    // 自适应尺寸：宽度随数据点数 800~2000，高度随刻度数
    const width = Math.max(
        CHART_MIN_WIDTH,
        Math.min(CHART_MAX_WIDTH, N * 10 + 100),
    );
    const height = Math.max(400, (yTicksCount - 1) * 45 + 80);
    const margin = { top: 60, right: 40, bottom: 60, left: 70 };
    const innerWidth = width - margin.left - margin.right;

    // 分段与数据点归属（仅保留有数据点的段进图例）
    const segments = buildSegments(data);
    const pointSegments = points.map((p) => {
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (
                p.ts >= seg.startTime &&
                p.ts <= seg.endTime + SEGMENT_MATCH_TOLERANCE_SEC
            ) {
                return i;
            }
        }
        return segments.length - 1;
    });
    const legendItems = segments.filter((_, idx) =>
        pointSegments.includes(idx),
    );

    // 绘图区顶部偏移（标题 + 图例）
    const titleHeight = 24;
    const legendLineHeight = 25;
    const legendPadding = 8;
    const legendTotalHeight =
        legendItems.length > 0
            ? legendItems.length * legendLineHeight +
              legendPadding * 2
            : 0;
    const plotTop =
        margin.top + titleHeight + legendTotalHeight + 15;
    const plotBottom = height - margin.bottom;
    const plotHeight = plotBottom - plotTop;

    // 比例尺
    const xScale = (value: number) =>
        margin.left +
        ((value - xMin) / (xMax - xMin || 1)) * innerWidth;
    const yScale = (value: number) =>
        plotTop + plotHeight - (value / (yMax || 1)) * plotHeight;

    // 生成刻度
    const stepMs = calculateTimeStep(xMax - xMin);
    const xTicks: number[] = [];
    for (
        let t = Math.ceil(xMin / stepMs) * stepMs;
        t <= xMax;
        t += stepMs
    ) {
        xTicks.push(t);
    }
    if (xTicks.length === 0) xTicks.push(xMin, xMax);

    const yTicks: number[] = [];
    for (let v = 0; v <= yMax; v += yStep) {
        yTicks.push(v);
    }

    // 组装 SVG
    const lines: string[] = [];
    lines.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="'PingFang SC','Microsoft YaHei',sans-serif">`,
    );
    lines.push(`<rect width="100%" height="100%" fill="white"/>`);

    const title = `${data.uname || '直播间'} 同接数变化`;
    lines.push(
        `<text x="${width / 2}" y="${margin.top / 2 + 8}" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(title)}</text>`,
    );

    legendItems.forEach((item, idx) => {
        const yPos =
            margin.top + idx * legendLineHeight + legendPadding;
        lines.push(
            `<circle cx="${margin.left + 16}" cy="${yPos + 8}" r="5" fill="${item.color}"/>`,
        );
        lines.push(
            `<text x="${margin.left + 30}" y="${yPos + 12}" font-size="12" fill="#333">${escapeXml(item.title)}</text>`,
        );
    });

    // Y 轴网格 + 刻度标签
    yTicks.forEach((value) => {
        const y = yScale(value);
        lines.push(
            `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5"/>`,
        );
        lines.push(
            `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#333">${value}</text>`,
        );
    });

    // X 轴网格 + 刻度标签（固定 hh:mm）
    xTicks.forEach((time) => {
        const x = xScale(time);
        lines.push(
            `<line x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" stroke="#e0e0e0" stroke-width="0.5"/>`,
        );
        const date = new Date(time);
        lines.push(
            `<text x="${x}" y="${plotBottom + 18}" text-anchor="middle" font-size="11" fill="#333">${pad2(date.getHours())}:${pad2(date.getMinutes())}</text>`,
        );
    });

    // 坐标轴与轴标签
    lines.push(
        `<line x1="${margin.left}" y1="${plotBottom}" x2="${width - margin.right}" y2="${plotBottom}" stroke="#333" stroke-width="1"/>`,
    );
    lines.push(
        `<line x1="${margin.left}" y1="${plotTop}" x2="${margin.left}" y2="${plotBottom}" stroke="#333" stroke-width="1"/>`,
    );
    lines.push(
        `<text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="13" fill="#333">时间</text>`,
    );
    lines.push(
        `<text transform="rotate(-90, 18, ${height / 2})" x="18" y="${height / 2 + 4}" text-anchor="middle" font-size="13" fill="#333">同接数</text>`,
    );

    // 直播开始标记
    if (data.liveTimeSec > 0) {
        const startX = xScale(data.liveTimeSec * 1000);
        if (
            startX >= margin.left &&
            startX <= width - margin.right
        ) {
            lines.push(
                `<line x1="${startX}" y1="${plotTop}" x2="${startX}" y2="${plotBottom}" stroke="#FF8C00" stroke-width="1.5" stroke-dasharray="6,4"/>`,
            );
            lines.push(
                `<text x="${startX}" y="${plotTop - 8}" text-anchor="middle" font-size="10" fill="#FF8C00">直播开始</text>`,
            );
        }
    }

    // 分段折线与数据点
    const grouped = new Map<number, typeof points>();
    points.forEach((p, i) => {
        const segId = pointSegments[i];
        const list = grouped.get(segId) ?? [];
        list.push(p);
        grouped.set(segId, list);
    });
    grouped.forEach((segPoints, segId) => {
        if (segPoints.length < 2) return;
        const color = segments[segId]?.color ?? '#B0B0B0';
        const pathData = segPoints
            .map((p, idx) => {
                const x = xScale(p.x);
                const y = yScale(p.y);
                return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
            })
            .join(' ');
        lines.push(
            `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`,
        );
        segPoints.forEach((p) => {
            lines.push(
                `<circle cx="${xScale(p.x)}" cy="${yScale(p.y)}" r="3" fill="${color}"/>`,
            );
        });
    });

    lines.push(`</svg>`);
    return lines.join('\n');
}

/** 图表文本摘要（渲染失败回退）：峰值/末值/采样点数 */
export function buildOnlineChartSummaryText(
    data: OnlineChartData,
): string {
    const snapshots = data.onlineSnapshots ?? [];
    if (snapshots.length === 0) return '本场直播无同接采样数据';
    const values = snapshots.map(([v]) => v);
    const peak = Math.max(...values);
    const last = values[values.length - 1];
    return (
        `「${data.uname}」本场同接变化: ` +
        `峰值 ${peak}, 末值 ${last}, 共 ${snapshots.length} 个采样点`
    );
}

/**
 * 构建同接变化图表消息（纯图片）
 * 快照不足 2 点返回 null（调用方跳过）；
 * 渲染失败由调用方决定回退方式（推送链路静默, 指令链路回退摘要）
 */
export async function buildOnlineChartImageMessage(
    data: OnlineChartData,
): Promise<OB11PostSendMsg['message'] | null> {
    try {
        const svg = generateOnlineChartSvg(data);
        if (!svg) return null;

        const result = await svgRenderService.renderSvg(svg, true);
        if (!result.success || !result.imageBase64) {
            pluginState.logger.warn(
                `同接图表渲染失败: ${result.message ?? '未知原因'}`,
            );
            return null;
        }
        return [
            {
                type: 'image' as OB11MessageDataType.image,
                data: { file: `base64://${result.imageBase64}` },
            },
        ];
    } catch (err) {
        pluginState.logger.warn('生成同接图表出错:', err);
        return null;
    }
}
