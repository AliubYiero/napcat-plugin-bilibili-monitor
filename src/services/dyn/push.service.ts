/**
 * 动态推送服务
 *
 * 输入解析后的 ParsedDyn + 目标列表，组装消息段并发送：
 * - 普通动态: 单段落，文本段后跟该段配图
 * - 转发动态: 两段落，「转发语 + 其配图」在前，分隔线后接
 *   「原动态文本 + 其配图」
 * - LIVE_RCMD: 逐目标判断，已在 live store 监听该主播的目标跳过
 *   (由直播推送负责)，否则复用 buildChangeMessage 开播卡片
 */

import { pluginState } from '../../core/state';
import type {
    OB11MessageData,
    OB11MessageDataType,
    OB11PostSendMsg,
} from 'napcat-types/napcat-onebot';
import { sendReplyByToInfo } from '../../handlers/utils';
import type { BiliDynamicMonitorToInfo } from '../../store/biliDynamic.store';
import { BiliLiveStore } from '../../store/biliLive.store';
import { BiliLiveRoomStore } from '../../store/biliLiveRoom.store';
import { buildChangeMessage } from '../live/pushCard.service';
import type { ParsedDyn } from './parser.service';

/**
 * 按表情映射切分文本为 [文本, 图片, 文本, ...] 交错序列
 * 映射为空时原样返回单段文本
 */
function splitByEmojiMap(
    text: string,
    emojiMap: Record<string, string>,
): { text: string; image?: string }[] {
    const keys = Object.keys(emojiMap);
    if (keys.length === 0 || !text) return [{ text }];

    // 按 key 长度降序构建正则, 避免短 key 抢占长 key 的匹配
    const pattern = new RegExp(
        keys
            .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|'),
        'g',
    );
    const parts: { text: string; image?: string }[] = [];
    let last = 0;
    for (const match of text.matchAll(pattern)) {
        const url = emojiMap[match[0]];
        if (!url) continue;
        if (match.index! > last) {
            parts.push({ text: text.slice(last, match.index) });
        }
        parts.push({ text: '', image: url });
        last = match.index! + match[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}

/** 将切分结果映射为 OB11 消息段（空文本段丢弃） */
function toSegments(
    parts: { text: string; image?: string }[],
): OB11MessageData[] {
    const segments: OB11MessageData[] = [];
    for (const part of parts) {
        if (part.image) {
            segments.push({
                type: 'image' as OB11MessageDataType.image,
                data: { file: part.image },
            } as OB11MessageData);
        } else if (part.text) {
            segments.push({
                type: 'text' as OB11MessageDataType.text,
                data: { text: part.text },
            } as OB11MessageData);
        }
    }
    return segments;
}

/** 图片 URL 列表 → OB11 图片消息段 */
function toImageSegments(urls: string[]): OB11MessageData[] {
    // 沿用字面量: createImageMessage 返回 OB11PostSendMsg['message']
    // 联合类型, 放进数组仍需断言, 与工厂函数无实质差别
    return urls.map(
        (url) =>
            ({
                type: 'image' as OB11MessageDataType.image,
                data: { file: url },
            }) as OB11MessageData,
    );
}

/** 组装普通动态的推送消息（文本 + 表情内嵌图片 + 内容图片） */
export function buildDynMessage(
    dyn: ParsedDyn,
): OB11PostSendMsg['message'] | null {
    const lines: string[] = [dyn.headline];

    if (dyn.kind === 'video' && dyn.jumpUrl) {
        lines.push(...dyn.texts);
        lines.push(`链接: ${dyn.jumpUrl}`);
    } else if (
        ['forward', 'opus', 'text', 'fallback', 'article'].includes(
            dyn.kind,
        ) &&
        dyn.jumpUrl
    ) {
        lines.push(`${dyn.jumpUrl}`);
        lines.push(...dyn.texts);
    }

    // 转发动态: 分隔线 + 原动态卡片
    const origLines: string[] = [];
    if (dyn.separator && dyn.origCard) {
        origLines.push(
            '\n',
            dyn.separator,
            '',
            dyn.origCard.headline,
            ...dyn.origCard.texts,
        );
    }

    const mainText = lines.join('\n');
    const origText = origLines.join('\n');
    const origImages = dyn.origCard?.images ?? [];

    // 文本为空且无图片时无法构成消息
    if (
        !mainText.trim() &&
        !origText.trim() &&
        dyn.images.length === 0 &&
        origImages.length === 0
    )
        return null;

    // 按段落组装: 每段 = 文本段 + 该段配图
    const segments: OB11MessageData[] = [
        ...toSegments(splitByEmojiMap(mainText, dyn.emojiMap)),
        ...toImageSegments(dyn.images),
    ];
    if (dyn.origCard) {
        segments.push(
            ...toSegments(
                splitByEmojiMap(origText, dyn.origCard.emojiMap),
            ),
            ...toImageSegments(origImages),
        );
    }
    return segments;
}

/**
 * 将一条解析后的动态推送到目标列表
 * LIVE_RCMD 逐目标判断是否复用直播开播卡片
 */
export async function pushDynToTargets(
    dyn: ParsedDyn,
    hostUid: string,
    targets: BiliDynamicMonitorToInfo[],
): Promise<void> {
    for (const toInfo of targets) {
        try {
            let message: OB11PostSendMsg['message'] | null = null;

            if (dyn.kind === 'live') {
                // 该目标已在 live store 监听该主播 → 由直播推送负责
                if (isLiveMonitored(hostUid, toInfo)) {
                    pluginState.logger.debug(
                        `目标 ${toInfo.type}:${toInfo.id} 已监听直播, 跳过 LIVE_RCMD 动态 (uid=${hostUid})`,
                    );
                    continue;
                }
                message = await buildLiveCardForDyn(hostUid);
            } else {
                message = buildDynMessage(dyn);
            }

            if (!message) continue;
            await sendReplyByToInfo(pluginState.ctx, toInfo, message);
        } catch (err) {
            pluginState.logger.error(
                `推送动态到 ${toInfo.type}:${toInfo.id} 失败:`,
                err,
            );
        }
    }
}

/** 判断某目标是否在 live store 中监听了该主播 */
function isLiveMonitored(
    uid: string,
    toInfo: BiliDynamicMonitorToInfo,
): boolean {
    return BiliLiveStore.getInstance().has(uid, toInfo);
}

/**
 * 为 LIVE_RCMD 动态构建开播卡片消息
 * 复用 live 的 buildChangeMessage（卡片渲染失败自动回退纯文本）
 */
async function buildLiveCardForDyn(
    uid: string,
): Promise<OB11PostSendMsg['message'] | null> {
    const roomInfo = BiliLiveRoomStore.getInstance().get(uid);
    if (!roomInfo) {
        pluginState.logger.debug(
            `LIVE_RCMD 动态推送时无房间基线数据 (uid=${uid}), 跳过`,
        );
        return null;
    }
    return buildChangeMessage(
        { uid, type: 'start_stream', newValue: 'streaming' },
        BiliLiveRoomStore.getInstance(),
    );
}
