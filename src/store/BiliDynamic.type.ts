// ========== 顶层动态接口 ==========
export interface BiliDynamic {
    id_str: string;
    type: DynamicType;
    basic: BasicInfo;
    visible: boolean;
    modules: DynamicModules;
    orig?: BiliDynamic | null;
}

// 动态类型（可能存在的值，保留 string 以兼容未知类型）
export type DynamicType =
    | 'DYNAMIC_TYPE_FORWARD'
    | 'DYNAMIC_TYPE_AV'
    | 'DYNAMIC_TYPE_DRAW'
    | 'DYNAMIC_TYPE_LIVE_RCMD' // 直播推荐动态
    | 'DYNAMIC_TYPE_ARTICLE'
    | string;

// ========== 基础信息 ==========
export interface BasicInfo {
    rid_str: string;
    comment_type: number;
    comment_id_str: string;
    like_icon: LikeIcon | null;
    in_audit: boolean;
    is_only_fans: boolean;
    editable: boolean;
    open_app_extra: string;
    jump_url: string;
    aigc: boolean;
}

export interface LikeIcon {
    id: string;
    start_url: string;
    action_url: string;
    end_url: string;
}

// ========== 动态模块总览 ==========
export interface DynamicModules {
    module_tag: ModuleTag | null;
    module_author: ModuleAuthor;
    module_more: ModuleMore | null;
    module_dispute: any | null;
    module_dynamic: ModuleDynamic;
    module_extend: any | null;
    module_stat: ModuleStat | null;
    module_interaction: ModuleInteraction | null;
    module_share_info: any | null;
    module_fold: any | null;
}

// 模块标签（置顶等）
export interface ModuleTag {
    text: string;
}

// ========== 作者模块 ==========
export interface ModuleAuthor {
    type: string;
    avatar: Avatar;
    face: string;
    face_nft: boolean;
    nft_info: any | null;
    name: string;
    name_render: any | null;
    label: string;
    mid: number | string;
    jump_url: string;
    following: number;
    pub_ts: string;
    pub_time: string;
    pub_action: string;
    pub_location_text: string;
    pendant: Pendant;
    vip: VipInfo;
    official_verify: OfficialVerify;
    decorate: any | null;
    decoration_card: DecorationCard | null;
    is_top: boolean;
    icon_badge: any | null;
    views_text: string;
    official: any | null;
    more: any | null;
    decorate_card: DecorationCard | null;
}

// ========== 头像组件（分层结构） ==========
export interface Avatar {
    container_size: Size;
    layers: any[];
    fallback_layers: FallbackLayers;
}

export interface Size {
    width: number;
    height: number;
}

export interface FallbackLayers {
    group_id: string;
    layers: Layer[];
    group_mask: any | null;
    is_critical_group: boolean;
}

export interface Layer {
    layer_id: string;
    visible: boolean;
    general_spec: GeneralSpec;
    layer_config: LayerConfig;
    resource: Resource;
}

export interface GeneralSpec {
    pos_spec: PosSpec;
    size_spec: SizeSpec;
    render_spec: RenderSpec;
}

export interface PosSpec {
    coordinate_pos: number;
    axis_x: number;
    axis_y: number;
}

export interface SizeSpec {
    width: number;
    height: number;
}

export interface RenderSpec {
    opacity: number;
}

export interface LayerConfig {
    tags: Record<string, TagConfig>;
    is_critical: boolean;
    allow_over_paint: boolean;
    layer_mask: any | null;
}

export interface TagConfig {
    config_type: number;
    general_config?: GeneralConfig;
}

export interface GeneralConfig {
    web_css_style: Record<string, string>;
}

export interface Resource {
    res_type: number;
    res_image: ResImage;
}

export interface ResImage {
    image_src: ImageSrc;
}

export interface ImageSrc {
    src_type: number;
    placeholder: number;
    remote?: RemoteImage;
    local?: number;
}

export interface RemoteImage {
    url: string;
    bfs_style: string;
}

// ========== 挂件信息 ==========
export interface Pendant {
    pid: number;
    name: string;
    image: string;
    expire: string;
    image_enhance: string;
    image_enhance_frame: string;
    n_pid: string;
}

// ========== VIP 信息 ==========
export interface VipInfo {
    type: number;
    status: number;
    due_date: string;
    vip_pay_type: number;
    theme_type: number;
    label: VipLabel;
    avatar_subscript: number;
    nickname_color: string;
    role: string;
    avatar_subscript_url: string;
    tv_vip_status: number;
    tv_vip_pay_type: number;
    tv_due_date: string;
    avatar_icon: VipAvatarIcon;
}

export interface VipLabel {
    path: string;
    text: string;
    label_theme: string;
    text_color: string;
    bg_style: number;
    bg_color: string;
    border_color: string;
    use_img_label: boolean;
    img_label_uri_hans: string;
    img_label_uri_hant: string;
    img_label_uri_hans_static: string;
    img_label_uri_hant_static: string;
}

export interface VipAvatarIcon {
    icon_type: number;
    icon_resource: {
        type: number;
        url: string;
    };
}

// ========== 官方认证 ==========
export interface OfficialVerify {
    type: number;
    desc: string;
}

// ========== 装饰卡片 ==========
export interface DecorationCard {
    id: string;
    item_id: string;
    name: string;
    card_url: string;
    big_card_url: string;
    card_type: string;
    expire_time: string;
    card_type_name: string;
    jump_url: string;
    fan: FanInfo;
    image_enhance: string;
    image_group: any | null;
}

export interface FanInfo {
    is_fan: string;
    number: string;
    color: string;
    name: string;
    num_desc: string;
    num_prefix: string;
    color_format: ColorFormat | null;
}

export interface ColorFormat {
    start_point: string;
    end_point: string;
    colors: string[];
    gradients: string[];
}

// ========== 更多模块（三点菜单） ==========
export interface ModuleMore {
    rcmd_text: string;
    three_point_items: ThreePointItem[];
}

export interface ThreePointItem {
    label: string;
    type: string;
    params: Record<string, any>;
    modal: any | null;
    jump_url: string;
}

// ========== 动态内容模块 ==========
export interface ModuleDynamic {
    topic: TopicInfo | null;
    desc: DescInfo | null;
    major: MajorContent | null;
    additional: AdditionalContent | null;
}

// 话题信息
export interface TopicInfo {
    id: string;
    name: string;
    jump_url: string;
}

// 描述信息
export interface DescInfo {
    text: string;
    rich_text_nodes: RichTextNode[];
    paragraphs: Paragraph[];
    has_more: boolean;
}

// 富文本节点
export interface RichTextNode {
    text: string;
    orig_text: string;
    type: string;
    jump_url: string;
    icon_url: string;
    icon_name: string;
    rid: string;
    emoji: EmojiInfo | null;
    goods: any | null;
    style: any | null;
    pics: RichTextPicture[];
    video: any | null;
}

// 富文本图片节点携带的图片
// 注意: 字段名 (src/live_src) 与 OPUS 的 Picture (url/live_url) 不同,
// 此处照抄 B 站返回, 不做统一
export interface RichTextPicture {
    src: string;
    width: number;
    height: number;
    size: number;
    live_src: string;
}

// 表情信息
export interface EmojiInfo {
    type: string;
    size: number;
    text: string;
    icon_url: string;
    gif_url: string;
    webp_url: string;
    jump_url: string;
    jump_title: string;
    package_id: string;
    id: string;
}

// 段落结构
export interface Paragraph {
    para_type: number;
    align: number;
    format: {
        align: number;
        indent: any | null;
    };
    text: {
        nodes: TextNode[];
    };
    pic: any | null;
    line: any | null;
    list: any | null;
    link_card: any | null;
    code: any | null;
    heading: any | null;
    blockquote: any | null;
}

// 文本节点联合类型（目前包含 WordNode，可扩展）
export type TextNode =
    | WordNode
    | RichNode
    | FormulaNode
    | UserNode
    | any;

export interface WordNode {
    type: 'TEXT_NODE_TYPE_WORD';
    word: {
        words: string;
        font_size: number;
        color: string;
        dark_color: string;
        style: {
            bold: boolean;
            italic: boolean;
            strikethrough: boolean;
            underline: boolean;
            background: string;
        };
        font_level: string;
        translated_words: string;
        bili_theme: string;
        bg_style: any | null;
    };
    rich: any | null;
    formula: any | null;
    user: any | null;
}

// 其他可能节点类型（占位）
export type RichNode = any;
export type FormulaNode = any;
export type UserNode = any;

// ========== 主要动态内容 ==========
export interface MajorContent {
    type: string;
    none: any | null;
    blocked: any | null;
    archive?: ArchiveContent | null;
    pgc?: any | null;
    courses?: any | null;
    draw?: any | null;
    article?: any | null;
    music?: any | null;
    common?: any | null;
    upower_common?: any | null;
    live?: any | null;
    /** 直播推荐详细信息（JSON 字符串，解析后为 LiveRcmdContent） */
    live_rcmd?: string | null;
    medialist?: any | null;
    subscription?: any | null;
    ugc_season?: any | null;
    subscription_new?: any | null;
    opus?: OpusContent | null;
    // 其他类型可继续扩展
}

// 视频稿件内容
export interface ArchiveContent {
    type: number;
    bvid: string;
    aid: string | number;
    cover: string;
    jump_url: string;
    stat: ArchiveStat;
    duration_text: string;
    title: string;
    desc: string;
    badge: Badge;
    enable_vt: number;
    disable_preview: number;
    premiere_online: string;
    stat_hidden: number;
}

export interface ArchiveStat {
    danmaku: string;
    play: string;
    vt: string;
}

export interface Badge {
    icon_url: string;
    text: string;
    bg_color: string;
    color: string;
}

// OPUS（图文/文章）内容
export interface OpusContent {
    jump_url: string;
    title: string;
    summary: DescInfo;
    style: number;
    pics: Picture[];
    fold_action: string[];
    paywall: any | null;
}

// 图片信息
export interface Picture {
    url: string;
    width: number;
    height: number;
    size: number;
    live_url: string;
    aigc: number;
    warning: any | null;
}

// ========== 直播推荐内容（live_rcmd 解析后） ==========
export interface LiveRcmdContent {
    /** 内容类型标识，固定为 1，表示直播推荐信息 */
    type: number;
    /** 直播播放信息 */
    live_play_info: LivePlayInfo;
    /** 直播回放/录制信息，此处为空 */
    live_record_info: null;
}

export interface LivePlayInfo {
    /** 直播房间 ID */
    room_id: number;
    /** 主播用户 ID */
    uid: number;
    /** 直播状态（1 表示正在直播） */
    live_status: number;
    /** 房间类型（0 表示普通房间） */
    room_type: number;
    /** 播放类型（0 表示常规直播） */
    play_type: number;
    /** 直播标题 */
    title: string;
    /** 直播封面图片 URL */
    cover: string;
    /** 当前在线观看人数 */
    online: number;
    /** 子分区 ID */
    area_id: number;
    /** 子分区名称 */
    area_name: string;
    /** 父分区 ID */
    parent_area_id: number;
    /** 父分区名称 */
    parent_area_name: string;
    /** 屏幕类型（0 表示横屏或普通） */
    live_screen_type: number;
    /** 直播开始时间戳（Unix 秒） */
    live_start_time: number;
    /** 直播间的跳转链接（相对协议） */
    link: string;
    /** 直播唯一 ID */
    live_id: number;
    /** 直播间挂件/角标信息 */
    pendants: Pendants;
    /** "看过"人数展示配置 */
    watched_show: WatchedShow;
    /** 房间付费类型（0 表示免费） */
    room_paid_type: number;
}

export interface Pendants {
    list: PendantsList;
}

export interface PendantsList {
    mobile_index_badge: MobileIndexBadge;
}

export interface MobileIndexBadge {
    /** 键为位置序号，值为角标具体配置 */
    list: Record<string, BadgeItem>;
}

export interface BadgeItem {
    /** 角标类型 */
    type: string;
    /** 角标名称 */
    name: string;
    /** 显示位置 */
    position: number;
    /** 显示文字 */
    text: string;
    /** 背景颜色 */
    bg_color: string;
    /** 背景图片 URL */
    bg_pic: string;
    /** 挂件 ID */
    pendant_id: number;
}

export interface WatchedShow {
    /** 是否启用"看过"展示 */
    switch: boolean;
    /** 看过人数的原始数值 */
    num: number;
    /** 短文本展示 */
    text_small: string;
    /** 长文本展示 */
    text_large: string;
    /** 图标 URL（小图） */
    icon: string;
    /** 图标位置 */
    icon_location: string;
    /** 图标 URL（Web 版） */
    icon_web: string;
}

// ========== 附加内容（如直播预约） ==========
export interface AdditionalContent {
    type: string;
    goods: any | null;
    vote: any | null;
    common: any | null;
    match: any | null;
    ugc: any | null;
    reserve: ReserveInfo | null;
    upower_lottery: any | null;
}

// 直播预约信息
export interface ReserveInfo {
    title: string;
    desc1: DescItem;
    desc2: DescItem;
    desc3: DescItem;
    premiere: any | null;
    badge_text: string;
    jump_url: string;
    button: ReserveButton;
    rid: number;
    reserve_total: number;
    state: number;
    stype: number;
    up_mid: string;
}

export interface DescItem {
    text: string;
    style: number;
    jump_url: string;
    icon_url: string;
    visible: boolean;
}

export interface ReserveButton {
    type: number;
    jump_style: any | null;
    jump_url: string;
    check: ButtonState;
    uncheck: ButtonState;
    status: number;
    click_type: number;
}

export interface ButtonState {
    icon_url: string;
    text: string;
    interactive: any | null;
    bg_style: number;
    toast: string;
    disable: number;
}

// ========== 统计模块 ==========
export interface ModuleStat {
    forward?: StatItem;
    comment?: StatItem;
    like?: StatItem;
    coin?: StatItem | null;
    favorite?: StatItem | null;
}

export interface StatItem {
    status: boolean;
    count: number;
    forbidden: boolean;
    disabled: boolean;
    silent: boolean;
    hidden: boolean;
}

// ========== 互动模块 ==========
export interface ModuleInteraction {
    items: InteractionItem[];
}

export interface InteractionItem {
    type: number;
    desc: DescInfo;
}

// ========== 其他模块（占位，具体结构未出现或未知） ==========
// module_dispute, module_extend, module_share_info, module_fold 等目前使用 any 或 null
