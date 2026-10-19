/**
 * 动态解析器（纯函数模块）
 *
 * 输入原始 BiliDynamic，输出渲染所需的结构化信息。
 * 吸收全部推送模板（图文/纯文本/表情包/转发/视频/转发视频/文章）、
 * 置顶判断、零宽字符清理、链接拼接等复杂逻辑。无 IO，可独立验证。
 */

import type {
    BiliDynamic,
    DescInfo,
    LiveRcmdContent,
    RichTextNode,
} from '../../store/BiliDynamic.type';
import { formatArea, roomUrl } from '../../utils/format';

// ==================== 解析结果结构 ====================

/** 转发动态中分隔线后的原动态卡片 */
export interface ParsedDynCard {
    /** 头部行: `[YYYY/MM/DD hh:mm:ss] 「作者」 ...` */
    headline: string;
    /** 文本内容行 */
    texts: string[];
    /** 表情文本 → 图片 URL 映射（键为带中括号的 emoji 文本） */
    emojiMap: Record<string, string>;
    /** 图片 URL 列表 */
    images: string[];
}

/** 解析后的动态（推送渲染的输入） */
export interface ParsedDyn {
    /** 动态 id_str */
    id: string;
    /** 动态类型标识 */
    kind:
        | 'forward'
        | 'opus'
        | 'text'
        | 'video'
        | 'article'
        | 'live'
        | 'fallback';
    /** 头部行: `[YYYY/MM/DD hh:mm:ss] 「作者」 发送了动态` 等 */
    headline: string;
    /** 文本内容行（已清理零宽字符） */
    texts: string[];
    /** 表情文本 → 图片 URL 映射（键为带中括号的 emoji 文本） */
    emojiMap: Record<string, string>;
    /** 图片 URL 列表 */
    images: string[];
    /** 转发动态的分隔线, 其余类型为 null */
    separator: string | null;
    /** 分隔线后的原动态卡片, 仅转发动态存在 */
    origCard: ParsedDynCard | null;
    /** 跳转链接 */
    jumpUrl: string;
    /** 发布时间戳 (秒) */
    pubTs: number;
}

// ==================== 常量与工具 ====================

/** 转发动态分隔线 */
const FORWARD_SEPARATOR = '----------';

/** 零宽字符（含 U+200B 等） */
const ZERO_WIDTH_RE = /[\u200b-\u200d\ufeff]/g;

/** 清理零宽字符 */
function cleanText(text: string): string {
    return text.replace(ZERO_WIDTH_RE, '');
}

/** 将相对协议链接补全为 https */
function normalizeUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('//')) return `https:${url}`;
    return url;
}

/** 时间戳 → [YYYY/MM/DD hh:mm:ss] */
function formatDynTime(pubTs: number): string {
    const d = new Date(pubTs * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `[${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`;
}

/** 表情文本 → 图片 URL 映射（gif 优先, 回退静态图标） */
function extractEmojiMap(
    nodes: RichTextNode[],
): Record<string, string> {
    const map: Record<string, string> = {};
    for (const node of nodes) {
        if (node?.type !== 'RICH_TEXT_NODE_TYPE_EMOJI') continue;
        const url = node.emoji?.gif_url || node.emoji?.icon_url;
        const key = node.emoji?.text || node.text;
        if (!url || !key) continue;
        map[key] = url;
    }
    return map;
}

/** 节点是否携带图片（不判 type 名, 只看 pics 是否非空） */
function hasPics(node: RichTextNode): boolean {
    return (node?.pics?.length ?? 0) > 0;
}

/** 一份正文数据是否有内容（文本或富文本节点任一非空） */
function hasContent(desc: DescInfo | null | undefined): boolean {
    return (
        (desc?.text ?? '').length > 0 ||
        (desc?.rich_text_nodes?.length ?? 0) > 0
    );
}

/**
 * 挑选正文文本与其富文本节点
 * 主来源有内容时整体采用, 否则整体回落到备来源。
 * 文本与节点必须同源: 不可文本取 summary、节点取 desc
 * （那样会拿 desc 的节点去重建 summary 的正文）。空数组同样会回落,
 * 区别于 `??` 仅在 null/undefined 时回落。
 */
function pickBody(
    primary: DescInfo | null | undefined,
    secondary?: DescInfo | null,
): { text: string; nodes: RichTextNode[] } {
    const source = hasContent(primary) ? primary : secondary;
    return {
        text: source?.text ?? '',
        nodes: source?.rich_text_nodes ?? [],
    };
}

/** 提取节点中的图片 URL（节点顺序 + 节点内顺序） */
function extractRichTextPics(nodes: RichTextNode[]): string[] {
    const urls: string[] = [];
    for (const node of nodes) {
        if (!hasPics(node)) continue;
        for (const pic of node.pics) {
            if (pic?.src) urls.push(pic.src);
        }
    }
    return urls;
}

/** 全部节点（含图片节点）的文本拼接是否覆盖原文 */
function coversText(text: string, nodes: RichTextNode[]): boolean {
    const all = nodes.map((node) => node.text ?? '').join('');
    return cleanText(all) === cleanText(text);
}

/**
 * 剔除正文中图片节点的占位文本（形如「查看图片(6)」）
 *
 * 以节点序列重建正文: 带图节点整体丢弃, 其余节点（含表情节点）的
 * text 原样保留, 故表情内嵌切分不受影响。
 * 前提: rich_text_nodes 覆盖全文。节点缺失时退回原文。
 *
 * 重建结果为空时须区分两种情形, 否则会把纯图动态的占位文本当成正文
 * 推出去: 正文本来就只有图 (空即正确答案), 与节点未覆盖全文 (重建
 * 会吞掉正文)。以"全部节点文本拼接是否等于原文"判定, 相等即节点
 * 覆盖全文, 信任重建结果。
 */
function stripPictureNodes(
    text: string,
    nodes: RichTextNode[],
): string {
    if (nodes.length === 0) return cleanText(text);
    const rebuilt = nodes
        .filter((node) => !hasPics(node))
        .map((node) => node.text ?? '')
        .join('');
    if (!rebuilt && text && !coversText(text, nodes)) {
        return cleanText(text);
    }
    return cleanText(rebuilt);
}

/** 秒数 → hh:mm:ss（超过 1 小时）或 mm:ss */
function formatVideoDuration(durationText: string): string {
    return durationText || '';
}

/** 手动拼接动态通用跳转链接 */
function buildDynJumpUrl(idStr: string): string {
    return `https://t.bilibili.com/${idStr}`;
}

// ==================== 主解析入口 ====================

/**
 * 解析单条动态为推送结构
 * @param item 原始动态条目
 */
export function parseBiliDynamic(item: BiliDynamic): ParsedDyn {
    const author = item.modules.module_author;
    const dynamicModule = item.modules.module_dynamic;
    const major = dynamicModule?.major ?? null;
    const pubTs = Number(author?.pub_ts ?? 0);
    const name = author?.name ?? '';
    const timeText = formatDynTime(pubTs);

    // 转发动态：转发内容 + 分隔线 + 原动态
    if (item.type === 'DYNAMIC_TYPE_FORWARD' && item.orig) {
        const orig = parseOrigCard(item.orig);
        const body = pickBody(dynamicModule?.desc);
        const nodes = body.nodes;
        return {
            id: item.id_str,
            kind: 'forward',
            headline: `${timeText} 「${name}」 转发了动态`,
            texts: [stripPictureNodes(body.text, nodes)].filter(
                (t) => t.length > 0,
            ),
            emojiMap: extractEmojiMap(nodes),
            images: extractRichTextPics(nodes),
            separator: FORWARD_SEPARATOR,
            origCard: orig,
            // 转发动态无 OPUS jump_url, 手动拼接
            jumpUrl: buildDynJumpUrl(item.id_str),
            pubTs,
        };
    }

    // 直播推荐（文本格式与直播开播卡片一致）
    if (
        item.type === 'DYNAMIC_TYPE_LIVE_RCMD' ||
        major?.type === 'MAJOR_TYPE_LIVE_RCMD'
    ) {
        const playInfo = parseLiveRcmd(major?.live_rcmd ?? null);
        const title = playInfo?.title ?? '';
        const jumpUrl = roomUrl(playInfo?.room_id);
        return {
            id: item.id_str,
            kind: 'live',
            headline: title
                ? `${timeText} 「${name}」 开始了直播 「${title}」`
                : `${timeText} 「${name}」 开始了直播`,
            texts: [
                title ? `标题: ${title}` : '',
                playInfo
                    ? `分区: ${formatArea(
                          playInfo.parent_area_name,
                          playInfo.area_name,
                      )}`
                    : '',
                jumpUrl ? `链接: ${jumpUrl}` : '',
            ].filter((t) => t.length > 0),
            emojiMap: {},
            images: playInfo?.cover ? [playInfo.cover] : [],
            separator: null,
            origCard: null,
            jumpUrl,
            pubTs,
        };
    }

    // 投稿视频
    if (
        item.type === 'DYNAMIC_TYPE_AV' ||
        major?.type === 'MAJOR_TYPE_ARCHIVE'
    ) {
        const archive = major?.archive;
        const title = archive?.title ?? '';
        const desc = cleanText(archive?.desc ?? '');
        const jumpUrl = archive?.bvid
            ? `https://www.bilibili.com/video/${archive.bvid}`
            : `https://www.bilibili.com/${item.id_str}`;
        const texts: string[] = [`标题: ${title}`];
        // 简介可能多行, 原样拆入
        if (desc.length > 0) {
            texts.push(`简介: ${desc}`);
        }
        if (archive?.duration_text) {
            texts.push(
                `时长: ${formatVideoDuration(archive.duration_text)}`,
            );
        }
        // 投稿文案（desc）与转发语同源, 同样走剔除与配图提取
        const body = pickBody(dynamicModule?.desc);
        const nodes = body.nodes;
        const dynText = stripPictureNodes(body.text, nodes);
        return {
            id: item.id_str,
            kind: 'video',
            headline: `${timeText} 「${name}」 投稿了视频`,
            // 动态行（desc.text）存在时放最前
            ...(dynText
                ? { texts: [`动态: ${dynText}`, ...texts] }
                : { texts }),
            emojiMap: extractEmojiMap(nodes),
            images: [
                ...(archive?.cover ? [archive.cover] : []),
                ...extractRichTextPics(nodes),
            ],
            separator: null,
            origCard: null,
            jumpUrl,
            pubTs,
        };
    }

    // 投稿专栏/文章（实际以 OPUS 承载）
    if (item.type === 'DYNAMIC_TYPE_ARTICLE') {
        const opus = major?.opus;
        // 正文以 summary 为准, 不跨到 desc 取节点
        const body = pickBody(opus?.summary);
        const nodes = body.nodes;
        const title = opus?.title ?? '';
        const summary = stripPictureNodes(body.text, nodes);
        const jumpUrl = normalizeUrl(
            opus?.jump_url ||
                item.basic?.jump_url ||
                buildDynJumpUrl(item.id_str),
        );
        return {
            id: item.id_str,
            kind: 'article',
            headline: `${timeText} 「${name}」 投稿了文章`,
            texts: [title, summary].filter((t) => t.length > 0),
            emojiMap: extractEmojiMap(nodes),
            images: [
                ...(opus?.pics ?? []).map((pic) => pic.url),
                ...extractRichTextPics(nodes),
            ].filter(Boolean),
            separator: null,
            origCard: null,
            jumpUrl,
            pubTs,
        };
    }

    // 图文/纯文本动态（OPUS，含 DYNAMIC_TYPE_DRAW / DYNAMIC_TYPE_WORD）
    if (
        major?.type === 'MAJOR_TYPE_OPUS' ||
        item.type === 'DYNAMIC_TYPE_DRAW' ||
        item.type === 'DYNAMIC_TYPE_WORD'
    ) {
        const opus = major?.opus;
        // 标题存在 → 标题行; 正文以 summary 为主, 整体为 empty 时回落 desc
        const body = pickBody(opus?.summary, dynamicModule?.desc);
        const nodes = body.nodes;
        const title = opus?.title ?? '';
        const bodyText = stripPictureNodes(body.text, nodes);
        const jumpUrl = normalizeUrl(
            opus?.jump_url ||
                item.basic?.jump_url ||
                buildDynJumpUrl(item.id_str),
        );
        // 表情包: 从 rich_text_nodes 提取 emoji 文本 → 图片映射
        const emojiMap = extractEmojiMap(nodes);
        return {
            id: item.id_str,
            kind: title ? 'opus' : 'text',
            headline: `${timeText} 「${name}」 发送了动态`,
            texts: [title, bodyText].filter((t) => t.length > 0),
            emojiMap,
            images: [
                ...(opus?.pics ?? []).map((pic) => pic.url),
                ...extractRichTextPics(nodes),
            ].filter(Boolean),
            separator: null,
            origCard: null,
            jumpUrl,
            pubTs,
        };
    }

    // 兜底: 尝试 desc
    const fallbackBody = pickBody(dynamicModule?.desc);
    const fallbackNodes = fallbackBody.nodes;
    const fallbackText = stripPictureNodes(
        fallbackBody.text,
        fallbackNodes,
    );
    return {
        id: item.id_str,
        kind: 'fallback',
        headline: `${timeText} 「${name}」 发送了动态`,
        texts: fallbackText ? [fallbackText] : [],
        emojiMap: extractEmojiMap(fallbackNodes),
        images: extractRichTextPics(fallbackNodes),
        separator: null,
        origCard: null,
        jumpUrl: buildDynJumpUrl(item.id_str),
        pubTs,
    };
}

// ==================== 辅助解析 ====================

/** 解析直播推荐的 live_rcmd JSON 字符串 */
function parseLiveRcmd(
    raw: string | null | undefined,
): LiveRcmdContent['live_play_info'] | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw).live_play_info ?? null;
    } catch {
        return null;
    }
}

/**
 * 解析转发动态的原动态为卡片
 * 原动态为视频时呈现视频模板, 其余呈现简化图文
 */
function parseOrigCard(orig: BiliDynamic): ParsedDynCard {
    const author = orig.modules.module_author;
    const name = author?.name ?? '';
    const pubTs = Number(author?.pub_ts ?? 0);
    const timeText = formatDynTime(pubTs);
    const major = orig.modules.module_dynamic?.major ?? null;

    // 原动态为视频
    if (
        orig.type === 'DYNAMIC_TYPE_AV' ||
        major?.type === 'MAJOR_TYPE_ARCHIVE'
    ) {
        const archive = major?.archive;
        const jumpUrl = archive?.bvid
            ? `https://www.bilibili.com/video/${archive.bvid}`
            : '';
        const texts: string[] = [];
        if (archive?.title) texts.push(`标题: ${archive.title}`);
        const desc = cleanText(archive?.desc ?? '');
        if (desc) texts.push(`简介: ${desc}`);
        if (archive?.duration_text)
            texts.push(`时长: ${archive.duration_text}`);
        if (jumpUrl) texts.push(`链接: ${jumpUrl}`);
        return {
            headline: `${timeText} 「${name}」 `,
            texts,
            emojiMap: {},
            images: archive?.cover ? [archive.cover] : [],
        };
    }

    // 原动态为图文/纯文本
    const opus = major?.opus;
    // 正文以 summary 为主, 整体为空时回落 desc
    const body = pickBody(
        opus?.summary,
        orig.modules.module_dynamic?.desc,
    );
    const nodes = body.nodes;
    const title = opus?.title ?? '';
    const bodyText = stripPictureNodes(body.text, nodes);
    const emojiMap = extractEmojiMap(nodes);
    return {
        headline: `${timeText} 「${name}」`,
        texts: [title, bodyText].filter((t) => t.length > 0),
        emojiMap,
        images: [
            ...(opus?.pics ?? []).map((pic) => pic.url),
            ...extractRichTextPics(nodes),
        ].filter(Boolean),
    };
}
