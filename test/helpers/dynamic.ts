/**
 * 动态样本工厂
 *
 * 依据 src/store/BiliDynamic.type.ts 构造合法样本。三条纪律:
 *
 * 1. 覆盖项显式命名 (makeDynamic({ type, desc })), 不做深度合并。
 *    多层嵌套结构里"以为覆盖了其实没有"的隐蔽错误因此不可能发生,
 *    每个用例与基线的差异一眼可见。
 * 2. 工厂不替用例做决定: 未覆盖的字段一律给可辨识的空值, 不暗中
 *    提供一个"看起来像真的"的默认 (比如标题)。
 * 3. 噪音字段真填而非断言。类型新增必填字段时工厂立刻编译失败,
 *    这正是想要的信号——用 `as` 收口会把这层保护静默掉。
 *
 * 解析实际读取的字段只有 module_author.name / pub_ts、
 * module_dynamic.desc / major 与 orig, 其余皆为满足类型的噪音。
 */
import type {
    ArchiveContent,
    BiliDynamic,
    DescInfo,
    MajorContent,
    ModuleDynamic,
    OpusContent,
    Picture,
    RichTextNode,
    RichTextPicture,
} from '../../src/store/BiliDynamic.type';

// ==================== 样本工厂主入口 ====================

/** 构造一条动态样本的覆盖项, 全部显式命名 */
export interface DynOverrides {
    /** 动态 id_str */
    id?: string;
    /** 动态类型标识 (DYNAMIC_TYPE_*) */
    type?: string;
    /** 作者名 (module_author.name) */
    author?: string;
    /** 发布时间戳, 秒 (module_author.pub_ts) */
    pubTs?: number;
    /** 正文 (module_dynamic.desc) */
    desc?: DescInfo | null;
    /** 主要内容 (module_dynamic.major) */
    major?: MajorContent | null;
    /** 动态标签文本 (module_tag), 置顶判定用 */
    tag?: string | null;
    /** 被转发的原动态 */
    orig?: BiliDynamic | null;
    /** basic.jump_url */
    basicJumpUrl?: string;
}

/** 构造一条动态样本, 覆盖项之外一律取中性值 */
export function makeDynamic(o: DynOverrides = {}): BiliDynamic {
    return {
        id_str: o.id ?? '1000000000000000001',
        type: o.type ?? 'DYNAMIC_TYPE_WORD',
        basic: {
            rid_str: '',
            comment_type: 0,
            comment_id_str: '',
            like_icon: null,
            in_audit: false,
            is_only_fans: false,
            editable: false,
            open_app_extra: '',
            jump_url: o.basicJumpUrl ?? '',
            aigc: false,
        },
        visible: true,
        modules: {
            module_tag:
                o.tag === undefined || o.tag === null
                    ? null
                    : { text: o.tag },
            module_author: {
                ...NOISE_AUTHOR,
                name: o.author ?? '',
                pub_ts: String(o.pubTs ?? 0),
            },
            module_more: null,
            module_dispute: null,
            module_dynamic: makeModuleDynamic(o),
            module_extend: null,
            module_stat: null,
            module_interaction: null,
            module_share_info: null,
            module_fold: null,
        },
        orig: o.orig ?? null,
    };
}

function makeModuleDynamic(o: DynOverrides): ModuleDynamic {
    return {
        topic: null,
        desc: o.desc ?? null,
        major: o.major ?? null,
        additional: null,
    };
}

// ==================== 正文构造器 ====================

/** 纯文本正文, 富文本节点默认按整段单节点给出 */
export function desc(
    text: string,
    nodes: RichTextNode[] = [textNode(text)],
): DescInfo {
    return {
        text,
        rich_text_nodes: nodes,
        paragraphs: [],
        has_more: false,
    };
}

/** 无富文本节点的正文 (节点缺失场景) */
export function descWithoutNodes(text: string): DescInfo {
    return {
        text,
        rich_text_nodes: [],
        paragraphs: [],
        has_more: false,
    };
}

/** 普通文本节点 */
export function textNode(text: string): RichTextNode {
    return { ...NOISE_NODE, text, orig_text: text };
}

/**
 * 表情节点
 * 键取 emoji.text; gif 缺失时回退 icon_url (由 fallbackIcon 控制)
 */
export function emojiNode(
    key: string,
    url: string,
    fallbackIcon?: string,
): RichTextNode {
    return {
        ...NOISE_NODE,
        type: 'RICH_TEXT_NODE_TYPE_EMOJI',
        text: key,
        orig_text: key,
        emoji: {
            ...NOISE_EMOJI,
            text: key,
            gif_url: fallbackIcon === undefined ? url : '',
            icon_url: fallbackIcon ?? '',
        },
    };
}

/**
 * 携带图片的富文本节点
 *
 * nodeType 默认刻意取一个非图片语义的类型名: 解析只按 pics 是否非空
 * 判定, 类型名不参与 (见 CONTEXT.md「动态配图」)。改这个默认值会让
 * 相关用例失去证明力。
 */
export function picNode(
    placeholder: string,
    srcs: string[],
    nodeType = 'RICH_TEXT_NODE_TYPE_UNKNOWN',
): RichTextNode {
    return {
        ...NOISE_NODE,
        type: nodeType,
        text: placeholder,
        orig_text: placeholder,
        pics: srcs.map((src) => ({ ...NOISE_RICH_PIC, src })),
    };
}

// ==================== major 构造器 ====================

/** OPUS 图文/文章副内容 */
export function opusMajor(o: {
    title?: string;
    summary?: DescInfo | null;
    pics?: string[];
    jumpUrl?: string;
}): MajorContent {
    const opus: OpusContent = {
        jump_url: o.jumpUrl ?? '',
        title: o.title ?? '',
        summary: o.summary ?? desc(''),
        style: 0,
        pics: (o.pics ?? []).map(pic),
        fold_action: [],
        paywall: null,
    };
    return { type: 'MAJOR_TYPE_OPUS', none: null, blocked: null, opus };
}

/** 投稿视频副内容 */
export function archiveMajor(o: {
    bvid?: string;
    title?: string;
    desc?: string;
    durationText?: string;
    cover?: string;
}): MajorContent {
    const archive: ArchiveContent = {
        ...NOISE_ARCHIVE,
        bvid: o.bvid ?? '',
        title: o.title ?? '',
        desc: o.desc ?? '',
        duration_text: o.durationText ?? '',
        cover: o.cover ?? '',
    };
    return {
        type: 'MAJOR_TYPE_ARCHIVE',
        none: null,
        blocked: null,
        archive,
    };
}

/** 直播推荐副内容 (live_rcmd 为 JSON 字符串) */
export function liveRcmdMajor(o: {
    roomId?: number;
    title?: string;
    parentAreaName?: string;
    areaName?: string;
    cover?: string;
    /** 传入非法 JSON 以覆盖解析失败分支 */
    rawOverride?: string;
}): MajorContent {
    const raw =
        o.rawOverride ??
        JSON.stringify({
            type: 1,
            live_play_info: {
                room_id: o.roomId ?? 0,
                uid: 0,
                live_status: 1,
                room_type: 0,
                play_type: 0,
                title: o.title ?? '',
                cover: o.cover ?? '',
                online: 0,
                area_id: 0,
                area_name: o.areaName ?? '',
                parent_area_id: 0,
                parent_area_name: o.parentAreaName ?? '',
            },
            live_record_info: null,
        });
    return {
        type: 'MAJOR_TYPE_LIVE_RCMD',
        none: null,
        blocked: null,
        live_rcmd: raw,
    };
}

/** 一张 OPUS 配图 */
export function pic(url: string): Picture {
    return {
        url,
        width: 0,
        height: 0,
        size: 0,
        live_url: '',
        aigc: 0,
        warning: null,
    };
}

// ==================== 噪音字段 ====================
// 以下常量只为满足类型, 解析不读取。集中放底部, 以免淹没上面的工厂 API。

const NOISE_AUTHOR = {
    type: '',
    avatar: {
        container_size: { width: 0, height: 0 },
        layers: [],
        fallback_layers: {
            group_id: '',
            layers: [],
            group_mask: null,
            is_critical_group: false,
        },
    },
    face: '',
    face_nft: false,
    nft_info: null,
    name: '',
    name_render: null,
    label: '',
    mid: 0,
    jump_url: '',
    following: 0,
    pub_ts: '0',
    pub_time: '',
    pub_action: '',
    pub_location_text: '',
    pendant: {
        pid: 0,
        name: '',
        image: '',
        expire: '',
        image_enhance: '',
        image_enhance_frame: '',
        n_pid: '',
    },
    vip: {
        type: 0,
        status: 0,
        due_date: '',
        vip_pay_type: 0,
        theme_type: 0,
        label: {
            path: '',
            text: '',
            label_theme: '',
            text_color: '',
            bg_style: 0,
            bg_color: '',
            border_color: '',
            use_img_label: false,
            img_label_uri_hans: '',
            img_label_uri_hant: '',
            img_label_uri_hans_static: '',
            img_label_uri_hant_static: '',
        },
        avatar_subscript: 0,
        nickname_color: '',
        role: '',
        avatar_subscript_url: '',
        tv_vip_status: 0,
        tv_vip_pay_type: 0,
        tv_due_date: '',
        avatar_icon: {
            icon_type: 0,
            icon_resource: { type: 0, url: '' },
        },
    },
    official_verify: { type: -1, desc: '' },
    decorate: null,
    decoration_card: null,
    is_top: false,
    icon_badge: null,
    views_text: '',
    official: null,
    more: null,
    decorate_card: null,
};

const NOISE_NODE = {
    text: '',
    orig_text: '',
    type: '',
    jump_url: '',
    icon_url: '',
    icon_name: '',
    rid: '',
    emoji: null,
    goods: null,
    style: null,
    pics: [],
    video: null,
} satisfies RichTextNode;

const NOISE_EMOJI = {
    type: '',
    size: 0,
    text: '',
    icon_url: '',
    gif_url: '',
    webp_url: '',
    jump_url: '',
    jump_title: '',
    package_id: '',
    id: '',
};

const NOISE_RICH_PIC = {
    src: '',
    width: 0,
    height: 0,
    size: 0,
    live_src: '',
} satisfies RichTextPicture;

const NOISE_ARCHIVE = {
    type: 0,
    bvid: '',
    aid: '',
    cover: '',
    jump_url: '',
    stat: { danmaku: '', play: '', vt: '' },
    duration_text: '',
    title: '',
    desc: '',
    badge: { icon_url: '', text: '', bg_color: '', color: '' },
    enable_vt: 0,
    disable_preview: 0,
    premiere_online: '',
    stat_hidden: 0,
};
