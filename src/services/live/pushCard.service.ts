/**
 * 直播推送卡片服务
 *
 * 职责：
 * 1. 从变化事件与房间存储收集卡片所需数据
 * 2. 按标题宽度动态计算卡片宽度（最小 700px，上限 1000px）
 * 3. 生成 SVG 代码，经渲染插件渲染为图片
 * 4. 组装三段式消息 [文本, 图片, 链接]；任何环节失败返回 null，
 *    由调用方回退到纯文本推送
 */
import { pluginState } from '../../core/state';
import type {
    BiliLiveRoomInfo,
    BiliLiveRoomStore,
    ChangeEvent,
    ChangeType,
} from '../../store/biliLiveRoom.store';
import {
    formatArea,
    formatDuration,
    formatTime,
    roomUrl,
} from '../../utils/format';
import {
    type OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { svgRenderService } from '../svgRender.service';
import {
    calcAverageOnline,
    SNAPSHOT_INTERVAL_TOLERANCE_SEC,
} from './onlineSnapshots.service';
import type { BiliLiveContent } from '../../store/biliLiveRoom.store';

/** 平均同接数剪切窗口（秒）：剪掉开播后前 5 分钟的预热期 */
const ONLINE_TRIM_START_SEC = 5 * 60;

/** 直播事件类型（与渲染插件约定的枚举） */
const LiveType = {
    START_LIVE: 0,
    STOP_LIVE: 1,
    CHANGE_LIVE_PARTITION: 2,
    CHANGE_LIVE_TITLE: 3,
} as const;

/** 卡片最小宽度 */
const CARD_MIN_WIDTH = 700;
/** 卡片最大宽度 */
const CARD_MAX_WIDTH = 1000;
/** 卡片固定高度 */
const CARD_HEIGHT = 218;
/** 标题字体大小 */
const TITLE_FONT_SIZE = 15;
/** 标题可用最大宽度（卡片最大宽度 - 内容区左侧固定偏移 380） */
const TITLE_MAX_WIDTH = CARD_MAX_WIDTH - 380;

/**
 * 宽度布局说明（偏移值由 SVG 模板决定）：
 * 内容卡片左缘 x=80、右外距 32；封面固定 236 宽；内容区自 x=316 起、
 * 左右内边距各 16。
 * => 标题可用宽 = cardWidth - (80 + 236 + 16 + 16 + 32) = cardWidth - 380
 */

/** 卡片渲染配置 */
interface CardConfig {
    roomId: number;
    cover: string;
    avatar: string;
    upName: string;
    /** 开播时间 */
    liveTime: string;
    /** 事件发生时间 */
    time: string;
    type: number;
    title: string;
    partition: string;
    liveDuration: string;
    /** 推送时是否正在直播 */
    isLive: boolean;
    /** 平均同接数（null 不显示） */
    averageOnline: number | null;
    /** 累计观众（>0 时分区行追加"· N人看过"） */
    accumulatedAudience: number;
}

/**
 * 构建推送消息：优先返回三段式 [文本, 图片, 链接]，
 * 数据不足、渲染失败或异常时返回 null，由调用方回退纯文本。
 */
export async function buildPushCardMessage(
    event: ChangeEvent,
    roomStore: BiliLiveRoomStore,
): Promise<OB11PostSendMsg['message'] | null> {
    try {
        const latest = roomStore.get(event.uid);
        const old = event.oldRoomInfo;
        if (!latest && !old) return null;

        const type = mapChangeType(event.type);
        if (type === null) return null;

        // 第一行文本与链接（数据源与纯文本回退一致）
        const time = formatTime(Date.now());
        const firstLine = renderFirstLine(event, time, latest, old);
        if (!firstLine) return null;

        const nowSec = Math.floor(Date.now() / 1000);
        const config = collectCardConfig(
            event,
            type,
            latest,
            old,
            nowSec,
            time,
            roomStore,
        );

        // 计算标题宽度并动态决定卡片宽度（计算失败用默认 700 继续）
        let title = config.title;
        const widthRes = await svgRenderService.calculateTextWidth(
            title,
            TITLE_FONT_SIZE,
        );
        let titleWidth = widthRes.success
            ? (widthRes.totalWidth ?? 0)
            : 0;
        if (titleWidth > TITLE_MAX_WIDTH) {
            const truncated = await truncateTitle(
                title,
                TITLE_MAX_WIDTH,
                titleWidth,
            );
            title = truncated.text;
            titleWidth = truncated.width;
        }
        const cardWidth = Math.min(
            CARD_MAX_WIDTH,
            Math.max(CARD_MIN_WIDTH, 380 + titleWidth),
        );

        // 渲染 SVG 为图片
        const svg = generateSvgContent(
            { ...config, title },
            cardWidth,
        );
        const result = await svgRenderService.renderSvg(svg, true);
        if (!result.success || !result.imageBase64) {
            pluginState.logger.debug(
                `SVG 卡片渲染失败, 回退纯文本: ${result.message ?? '未知原因'}`,
            );
            return null;
        }

        // 组装三段式消息：第一行文本 / 纯链接/ 图片
        return [
            {
                type: 'text' as OB11MessageDataType.text,
                data: {
                    text: `${firstLine}\n${roomUrl(config.roomId)}`,
                },
            },
            {
                type: 'image' as OB11MessageDataType.image,
                data: { file: `base64://${result.imageBase64}` },
            },
        ];
    } catch (err) {
        pluginState.logger.debug(
            '生成推送卡片出错, 回退纯文本:',
            err,
        );
        return null;
    }
}

/**
 * 构建推送消息：优先 SVG 卡片，渲染失败时回退纯文本。
 * 供轮询推送与 add 立即推送等场景复用。
 */
export async function buildChangeMessage(
    event: ChangeEvent,
    roomStore: BiliLiveRoomStore,
): Promise<OB11PostSendMsg['message'] | null> {
    const imageMessage = await buildPushCardMessage(event, roomStore);
    return imageMessage ?? renderTextMessage(event, roomStore);
}

/** 渲染推送消息第一行（事件描述），无法渲染时返回 null */
export function renderFirstLine(
    event: ChangeEvent,
    time: string,
    latest: BiliLiveRoomInfo | undefined,
    old: BiliLiveRoomInfo | undefined,
): string | null {
    switch (event.type) {
        case 'start_stream':
            // 开播事件显示开播时间而非事件发生时间
            return latest
                ? latest.live_time > 0
                    ? `[${formatTime(latest.live_time * 1000)}] 「${latest.uname}」 开始了直播 「${latest.title}」`
                    : `[${time}] 「${latest.uname}」 开始了直播 「${latest.title}」`
                : null;
        case 'end_stream': {
            if (!old) return null;
            // 追加本次直播时长（开播时间缺失时省略）
            const durationSec =
                Math.floor(Date.now() / 1000) - old.live_time;
            const durationText =
                durationSec > 0
                    ? `，直播时长 ${formatDuration(durationSec)}`
                    : '';
            return `[${time}] 「${old.uname}」 结束了直播${durationText}`;
        }
        case 'title_changed':
        case 'offline_title_changed':
            return latest
                ? `[${time}] 「${latest.uname}」 修改了直播标题 「${event.oldValue ?? ''}」→「${event.newValue ?? ''}」`
                : null;
        case 'area_changed':
        case 'offline_area_changed': {
            if (!latest) return null;
            const oldArea = event.oldValue as
                | { parent?: string; area?: string }
                | undefined;
            const newArea = event.newValue as
                | { parent?: string; area?: string }
                | undefined;
            return `[${time}] 「${latest.uname}」 修改了直播分区 「${formatArea(oldArea?.parent, oldArea?.area)}」→「${formatArea(newArea?.parent, newArea?.area)}」`;
        }
        default:
            return null;
    }
}

/** 时长行（开播时间为 0 或时长异常时返回 null，以便过滤掉） */
export function renderTextMessage(
    event: ChangeEvent,
    roomStore: BiliLiveRoomStore,
): OB11PostSendMsg['message'] | null {
    const latest = roomStore.get(event.uid);
    const old = event.oldRoomInfo;
    const time = formatTime(Date.now());
    const nowSec = Math.floor(Date.now() / 1000);

    // 第一行统一由 renderFirstLine 生成, 保证与图片卡片一致
    const firstLine = renderFirstLine(event, time, latest, old);
    if (!firstLine) return null;

    switch (event.type) {
        case 'start_stream': {
            if (!latest) return null;
            const text = [
                firstLine,
                `标题: ${latest.title}`,
                `分区: ${formatArea(latest.parent_area_name, latest.area_name)}`,
                `链接: ${roomUrl(latest.room_id)}`,
            ].join('\n');
            // 附带图片（放最后）：优先直播间封面，缺失时回退到关键帧
            const imageUrl =
                latest.cover_from_user || latest.keyframe;
            if (!imageUrl) return text;
            return [
                {
                    type: 'text' as OB11MessageDataType.text,
                    data: { text },
                },
                {
                    type: 'image' as OB11MessageDataType.image,
                    data: { file: imageUrl },
                },
            ];
        }
        case 'end_stream': {
            if (!old) return null;
            const { averageOnline } = computeOnlineStats(
                event,
                roomStore,
            );
            return [
                firstLine,
                durationLine(old.live_time, nowSec),
                `标题: ${old.title}`,
                `分区: ${formatArea(old.parent_area_name, old.area_name)}`,
                onlineLine(averageOnline),
                watchedLine(old.accumulatedAudience),
                `链接: ${roomUrl(old.room_id)}`,
            ]
                .filter((line): line is string => line !== null)
                .join('\n');
        }
        case 'title_changed':
        case 'offline_title_changed': {
            if (!latest) return null;
            const { averageOnline } =
                event.type === 'title_changed'
                    ? computeOnlineStats(event, roomStore)
                    : { averageOnline: null };
            return [
                firstLine,
                // 未直播变化附加状态说明行
                event.type === 'offline_title_changed'
                    ? '状态: 未开播'
                    : null,
                durationLine(latest.live_time, nowSec),
                `标题: ${latest.title}`,
                `分区: ${formatArea(latest.parent_area_name, latest.area_name)}`,
                onlineLine(averageOnline),
                watchedLine(latest.accumulatedAudience),
                `链接: ${roomUrl(latest.room_id)}`,
            ]
                .filter((line): line is string => line !== null)
                .join('\n');
        }
        case 'area_changed':
        case 'offline_area_changed': {
            if (!latest) return null;
            const oldArea = event.oldValue as
                | { parent?: string; area?: string }
                | undefined;
            const newArea = event.newValue as
                | { parent?: string; area?: string }
                | undefined;
            const { averageOnline } =
                event.type === 'area_changed'
                    ? computeOnlineStats(event, roomStore)
                    : { averageOnline: null };
            return [
                firstLine,
                // 未直播变化附加状态说明行
                event.type === 'offline_area_changed'
                    ? '状态: 未开播'
                    : null,
                durationLine(latest.live_time, nowSec),
                `标题: ${latest.title}`,
                `分区: ${formatArea(latest.parent_area_name, latest.area_name)}`,
                onlineLine(averageOnline),
                watchedLine(latest.accumulatedAudience),
                `链接: ${roomUrl(latest.room_id)}`,
            ]
                .filter((line): line is string => line !== null)
                .join('\n');
        }
        default:
            return null;
    }
}

/** "同接"行：平均同接数可算时显示（分区之下、看过之上） */
function onlineLine(averageOnline: number | null): string | null {
    if (averageOnline === null) return null;
    return `同接: ${averageOnline}`;
}

/** 时长行（开播时间为 0 或时长异常时返回 null，以便过滤掉） */

/**
 * 平均同接数显示场景
 */
interface OnlineStatResult {
    /** 平均同接数（取整），无可用数据时为 null（不显示） */
    averageOnline: number | null;
}

/**
 * 计算推送所需的同接数据
 *
 * - 改标题/改分区：取上一段直播内容区间的平均同接数
 *   （区间 = liveContents 最后一段, 由事件维护层刚补录的旧内容）
 * - 下播：取直播全程平均（剪切直播开始后前 5 分钟）
 * - 无快照或剪切后无数据时 averageOnline 为 null（不显示）
 */
function computeOnlineStats(
    event: ChangeEvent,
    roomStore: BiliLiveRoomStore,
): OnlineStatResult {
    const result: OnlineStatResult = { averageOnline: null };
    const info = roomStore.get(event.uid);
    if (!info) return result;

    const snapshots = info.onlineSnapshots ?? [];
    const contents = info.liveContents ?? [];

    if (event.type === 'end_stream') {
        // 直播全程：区间 [开播时间, 下播时间], 剪切开播预热期
        const old = event.oldRoomInfo;
        const startTime = old?.live_time || 0;
        if (startTime > 0 && snapshots.length > 0) {
            result.averageOnline = calcAverageOnline(
                snapshots,
                startTime,
                Math.floor(Date.now() / 1000),
                SNAPSHOT_INTERVAL_TOLERANCE_SEC,
                ONLINE_TRIM_START_SEC,
            );
        }
        return result;
    }

    if (
        event.type === 'title_changed' ||
        event.type === 'area_changed'
    ) {
        // 上一段内容 = liveContents 最后一段（事件维护层刚补录的旧内容）
        const last = contents[contents.length - 1];
        if (last && snapshots.length > 0) {
            result.averageOnline = calcAverageOnline(
                snapshots,
                last.startTime,
                last.endTime,
                SNAPSHOT_INTERVAL_TOLERANCE_SEC,
            );
        }
    }
    return result;
}

/** "看过"行：accumulatedAudience > 0 时返回文本行，否则 null */
function watchedLine(accumulatedAudience: number): string | null {
    if (accumulatedAudience <= 0) return null;
    return `看过: ${accumulatedAudience}人`;
}

function durationLine(
    liveTimeSec: number,
    nowSec: number,
): string | null {
    if (liveTimeSec <= 0) return null;
    const durationSec = nowSec - liveTimeSec;
    if (durationSec <= 0) return null;
    return `时长: ${formatDuration(durationSec)}`;
}

/** 收集卡片渲染所需的展示数据 */
function collectCardConfig(
    event: ChangeEvent,
    type: number,
    latest: BiliLiveRoomInfo | undefined,
    old: BiliLiveRoomInfo | undefined,
    nowSec: number,
    time: string,
    roomStore?: BiliLiveRoomStore,
): CardConfig {
    // 数据源回退链：latest 优先，缺失时回退到变更前快照 old
    // （end_stream 时 latest 已更新为离线数据，live_time 为 0、标题可能为空）
    const avatar = latest?.avatar || old?.avatar || '';
    const cover =
        latest?.cover_from_user ||
        latest?.keyframe ||
        old?.cover_from_user ||
        old?.keyframe ||
        '';
    const upName = latest?.uname || old?.uname || '';
    const title = latest?.title || old?.title || '';
    const parentArea =
        latest?.parent_area_name || old?.parent_area_name || '';
    const area = latest?.area_name || old?.area_name || '';
    const liveTimeSec = latest?.live_time || old?.live_time || 0;
    const roomId = latest?.room_id || old?.room_id || 0;

    // 直播中判定：开播时间存在且未超过当前时间（离线时 live_time 为 0）
    const isLive = liveTimeSec > 0 && nowSec >= liveTimeSec;

    let liveDuration = '';
    const durationSec = nowSec - liveTimeSec;
    if (isLive && type !== LiveType.START_LIVE && durationSec > 0) {
        liveDuration = formatDuration(durationSec);
    }

    // 同接/看过数据（仅改标题/改分区/下播事件）
    const { averageOnline } =
        roomStore &&
        (type === LiveType.CHANGE_LIVE_TITLE ||
            type === LiveType.CHANGE_LIVE_PARTITION ||
            type === LiveType.STOP_LIVE)
            ? computeOnlineStats(event, roomStore)
            : { averageOnline: null };

    return {
        roomId,
        cover,
        avatar,
        upName,
        liveTime:
            liveTimeSec > 0 ? formatTime(liveTimeSec * 1000) : '',
        time,
        type,
        title,
        partition: formatArea(parentArea, area),
        liveDuration,
        isLive,
        averageOnline,
        accumulatedAudience:
            latest?.accumulatedAudience ||
            old?.accumulatedAudience ||
            0,
    };
}

/** 将项目内变化类型映射为渲染插件约定的枚举值 */
function mapChangeType(type: ChangeType): number | null {
    switch (type) {
        case 'start_stream':
            return LiveType.START_LIVE;
        case 'end_stream':
            return LiveType.STOP_LIVE;
        case 'title_changed':
        case 'offline_title_changed':
            return LiveType.CHANGE_LIVE_TITLE;
        case 'area_changed':
        case 'offline_area_changed':
            return LiveType.CHANGE_LIVE_PARTITION;
        default:
            return null;
    }
}

/** 截断标题使其宽度不超过 maxWidth，追加省略号（最多 3 次宽度校准） */
async function truncateTitle(
    title: string,
    maxWidth: number,
    fullWidth: number,
): Promise<{ text: string; width: number }> {
    // 按等宽比例估算首个候选长度（预留空间给省略号）
    let target = Math.max(
        1,
        Math.floor((title.length * maxWidth) / fullWidth) - 1,
    );
    for (let i = 0; i < 3; i++) {
        if (target >= title.length) break;
        const text = `${title.slice(0, target)}…`;
        const res = await svgRenderService.calculateTextWidth(
            text,
            TITLE_FONT_SIZE,
        );
        if (
            res.success &&
            res.totalWidth !== undefined &&
            res.totalWidth <= maxWidth
        ) {
            return { text, width: res.totalWidth };
        }
        target = Math.max(1, Math.floor(target * 0.8));
    }
    // 兜底：极端保守截断（约 6 个全角字符）
    return { text: `${title.slice(0, 6)}…`, width: maxWidth };
}

/** 渲染事件副标题 */
function renderSubTitle(type: number): string {
    switch (type) {
        case LiveType.START_LIVE:
            return '开始了直播';
        case LiveType.STOP_LIVE:
            return '结束了直播';
        case LiveType.CHANGE_LIVE_PARTITION:
            return '修改了直播分区';
        case LiveType.CHANGE_LIVE_TITLE:
            return '修改了直播标题';
        default:
            return '未知直播事件';
    }
}

/** XML 转义，防止标题/链接中的特殊字符破坏 SVG */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** 生成卡片 SVG 代码（宽度随标题伸缩，最小 700 最大 1000） */
function generateSvgContent(
    config: CardConfig,
    cardWidth: number,
): string {
    const {
        cover,
        avatar,
        upName,
        liveTime,
        time,
        type,
        title,
        partition,
        liveDuration,
        isLive,
        averageOnline,
        accumulatedAudience,
    } = config;

    const contentCardWidth = cardWidth - 112; // 80 左外距 + 32 右外距
    const contentAreaWidth = contentCardWidth - 236; // 封面固定 236 宽
    // 未开播时不显示时长
    const showDuration = isLive && liveDuration.length > 0;
    const subTitle = renderSubTitle(type);
    // 开播事件显示开播时间, 其它事件显示事件发生时间
    const headerTime = type === LiveType.START_LIVE ? liveTime : time;
    // 分区行追加"看过"（改标题/改分区/下播且有累计观众时）
    const partitionText =
        accumulatedAudience > 0
            ? `${partition} · ${accumulatedAudience}人看过`
            : partition;
    // 封面左下角同接数（有可算平均数时显示）
    const onlineCount =
        averageOnline !== null
            ? `
	<!-- 封面左下角同接数 -->
	<g transform="translate(88,175) scale(0.02)">
		<path d="M512.3 276.9c-228.4 0-374 178.5-393.8 255.9 19.3 78.2 165.5 256 393.8 256s373.8-176.5 393.9-256c-19.7-78.2-165.6-255.9-393.9-255.9z m0 452.9c-182.3 0-303.2-131.1-331.5-196.7C209.6 467.4 331.2 336 512.3 336c181.9 0 303 131.2 331.5 196.9-28.6 65.6-149.8 196.9-331.5 196.9z" fill="#ffffff"/>
		<path d="M512.3 434.4c-54.4 0-98.4 44.1-98.4 98.5s44.1 98.4 98.4 98.4c54.4 0 98.5-44.1 98.5-98.4 0-54.4-44.1-98.5-98.5-98.5z m0 137.9c-21.7 0-39.4-17.7-39.4-39.4s17.6-39.4 39.4-39.4 39.4 17.7 39.4 39.4-17.7 39.4-39.4 39.4z" fill="#ffffff"/>
	</g>
	<text x="110" y="190" font-size="13" fill="#ffffff">${averageOnline}</text>`
            : '';

    const avatarImage = avatar
        ? `<image href="${escapeXml(avatar)}" x="16" y="16" width="48" height="48"
               preserveAspectRatio="xMidYMid slice"
               clip-path="url(#avatarClip)"/>`
        : '';
    const coverImage = cover
        ? `<image href="${escapeXml(cover)}" x="80" y="68" width="236" height="134"
               preserveAspectRatio="xMidYMid slice"/>`
        : '';
    const durationText = showDuration
        ? `<text x="305" y="190" font-size="13" fill="#ffffff" text-anchor="end">${escapeXml(liveDuration)}</text>`
        : '';
    // 封面右上角状态标签：直播结束为 56 宽粉色标签，直播中为 44 宽粉色，未开播为 44 宽灰色
    const isStopLive = type === LiveType.STOP_LIVE;
    const liveStatusTag = isStopLive
        ? `
	<!-- 封面右上角状态标签 -->
	<rect x="254" y="74" width="56" height="20" rx="2" ry="2" fill="#b9b9b9"/>
	<text x="282" y="84" font-size="12" fill="#ffffff" text-anchor="middle" dominant-baseline="central">直播结束</text>`
        : `
	<!-- 封面右上角状态标签 -->
	<rect x="266" y="74" width="44" height="20" rx="2" ry="2" fill="${isLive ? '#f69' : '#b9b9b9'}"/>
	<text x="288" y="84" font-size="12" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${isLive ? '直播中' : '未开播'}</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth + 2}" height="${CARD_HEIGHT + 2}"
     viewBox="0 0 ${cardWidth + 2} ${CARD_HEIGHT + 2}"
     font-family="'PingFang SC','Microsoft YaHei',sans-serif">
<defs>
	<!-- 头像圆形裁剪 -->
	<clipPath id="avatarClip">
		<circle cx="40" cy="40" r="24"/>
	</clipPath>

	<!-- 内容卡片圆角裁剪 -->
	<clipPath id="contentClip">
		<rect x="80" y="68" width="${contentCardWidth}" height="134" rx="6" ry="6"/>
	</clipPath>

	<!-- 封面占位渐变 -->
	<linearGradient id="coverPlaceholder" x1="0" y1="0" x2="1" y2="1">
		<stop offset="0%" stop-color="#e0e0e0"/>
		<stop offset="100%" stop-color="#c0c0c0"/>
	</linearGradient>

	<!-- 封面底部阴影渐变 -->
	<linearGradient id="durationShadow" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0%" stop-color="#000000" stop-opacity="0"/>
		<stop offset="99.32%" stop-color="#000000" stop-opacity="0.5"/>
		<stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
	</linearGradient>
</defs>

<!-- 外边框（1px，向四周扩展） -->
<rect x="0.5" y="0.5" width="${cardWidth + 1}" height="${CARD_HEIGHT + 1}"
      fill="none" stroke="#E3E5E7" stroke-width="1"/>

<!-- 原内容整体平移 (1,1) -->
<g transform="translate(1,1)">
	<!-- 卡片背景 -->
	<rect x="0" y="0" width="${cardWidth}" height="${CARD_HEIGHT}" fill="#ffffff"/>

	<!-- 头像 -->
	<circle cx="40" cy="40" r="24" fill="#cccccc"/>
	${avatarImage}

	<!-- 头部文字 -->
	<text x="80" y="34" font-size="17" font-weight="bold" fill="#18191C">${escapeXml(upName)}</text>
	<text x="80" y="54" font-size="13" fill="#9499A0">${escapeXml(headerTime)} · ${escapeXml(subTitle)}</text>

	<!-- 内容卡片 -->
	<g clip-path="url(#contentClip)">
		<!-- 封面图 -->
		<rect x="80" y="68" width="236" height="134" fill="url(#coverPlaceholder)"/>
		${coverImage}
		${liveStatusTag}

		<!-- 封面右下角时长阴影遮罩 -->
		<rect x="80" y="156" width="236" height="46" fill="url(#durationShadow)"/>

		<!-- 时长文本 -->
		${durationText}
		${onlineCount}

		<!-- 内容区域背景 -->
		<rect x="316" y="68" width="${contentAreaWidth}" height="134" fill="#ffffff"/>

		<!-- 标题与类型 -->
		<text x="332" y="93" font-size="15" fill="#18191C">${escapeXml(title)}</text>
		<text x="332" y="188" font-size="13" fill="#9499A0">${escapeXml(partitionText)}</text>
	</g>

	<!-- 内容卡片边框 -->
	<rect x="80" y="68" width="${contentCardWidth}" height="134" rx="6" ry="6" fill="none"
	      stroke="#E3E5E7" stroke-width="1"/>
</g>
</svg>`;
}
