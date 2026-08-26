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
import { pluginState } from '../core/state';
import type {
    BiliLiveRoomInfo,
    BiliLiveRoomStore,
    ChangeEvent,
    ChangeType,
} from '../store/bili-live-room.store';
import {
    formatArea,
    formatDuration,
    formatTime,
    roomUrl,
} from '../utils/format';
import {
    type OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { svgRenderService } from './svg-render-service';

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
    liveTime: string;
    type: number;
    title: string;
    partition: string;
    liveDuration: string;
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
                data: { text: `${firstLine}\n${roomUrl(config.roomId)}` },
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

/** 渲染推送消息第一行（事件描述），无法渲染时返回 null */
export function renderFirstLine(
    event: ChangeEvent,
    time: string,
    latest: BiliLiveRoomInfo | undefined,
    old: BiliLiveRoomInfo | undefined,
): string | null {
    switch (event.type) {
        case 'start_stream':
            return latest
                ? `[${time}] ${latest.uname} 开始了直播`
                : null;
        case 'end_stream':
            return old
                ? `[${time}] ${old.uname} 结束了直播`
                : null;
        case 'title_changed':
            return latest
                ? `[${time}] ${latest.uname} 修改了直播标题 「${event.oldValue ?? ''}」->「${event.newValue ?? ''}」`
                : null;
        case 'area_changed': {
            if (!latest) return null;
            const oldArea = event.oldValue as
                | { parent?: string; area?: string }
                | undefined;
            const newArea = event.newValue as
                | { parent?: string; area?: string }
                | undefined;
            return `[${time}] ${latest.uname} 修改了直播分区 「${formatArea(oldArea?.parent, oldArea?.area)}」->「${formatArea(newArea?.parent, newArea?.area)}」`;
        }
        default:
            return null;
    }
}

/** 收集卡片渲染所需的展示数据 */
function collectCardConfig(
    _event: ChangeEvent,
    type: number,
    latest: BiliLiveRoomInfo | undefined,
    old: BiliLiveRoomInfo | undefined,
    nowSec: number,
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

    let liveDuration = '';
    const durationSec = nowSec - liveTimeSec;
    if (type !== LiveType.START_LIVE && durationSec > 0) {
        liveDuration = formatDuration(durationSec);
    }

    return {
        roomId,
        cover,
        avatar,
        upName,
        liveTime:
            liveTimeSec > 0 ? formatTime(liveTimeSec * 1000) : '',
        type,
        title,
        partition: formatArea(parentArea, area),
        liveDuration,
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
            return LiveType.CHANGE_LIVE_TITLE;
        case 'area_changed':
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
        type,
        title,
        partition,
        liveDuration,
    } = config;

    const contentCardWidth = cardWidth - 112; // 80 左外距 + 32 右外距
    const contentAreaWidth = contentCardWidth - 236; // 封面固定 236 宽
    const showDuration =
        type !== LiveType.START_LIVE && liveDuration.length > 0;
    const subTitle = renderSubTitle(type);

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

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="${CARD_HEIGHT}"
     viewBox="0 0 ${cardWidth} ${CARD_HEIGHT}"
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

<!-- 卡片背景 -->
<rect x="0" y="0" width="${cardWidth}" height="${CARD_HEIGHT}" fill="#ffffff"/>

<!-- 头像 -->
<circle cx="40" cy="40" r="24" fill="#cccccc"/>
${avatarImage}

<!-- 头部文字 -->
<text x="80" y="34" font-size="17" font-weight="bold" fill="#18191C">${escapeXml(upName)}</text>
<text x="80" y="54" font-size="13" fill="#9499A0">${escapeXml(liveTime)} · ${escapeXml(subTitle)}</text>

<!-- 内容卡片 -->
<g clip-path="url(#contentClip)">
	<!-- 封面图 -->
	<rect x="80" y="68" width="236" height="134" fill="url(#coverPlaceholder)"/>
	${coverImage}

	<!-- 封面右下角时长阴影遮罩 -->
	<rect x="80" y="156" width="236" height="46" fill="url(#durationShadow)"/>

	<!-- 时长文本 -->
	${durationText}

	<!-- 内容区域背景 -->
	<rect x="316" y="68" width="${contentAreaWidth}" height="134" fill="#ffffff"/>

	<!-- 标题与类型 -->
	<text x="332" y="93" font-size="15" fill="#18191C">${escapeXml(title)}</text>
	<text x="332" y="188" font-size="13" fill="#9499A0">${escapeXml(partition)}</text>
</g>

<!-- 内容卡片边框 -->
<rect x="80" y="68" width="${contentCardWidth}" height="134" rx="6" ry="6" fill="none"
      stroke="#E3E5E7" stroke-width="1"/>
</svg>`;
}
