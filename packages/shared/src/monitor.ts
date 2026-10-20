/**
 * 监听状态页的跨包契约
 *
 * 后端 monitorStatusService / monitorWriteService 产出, WebUI 直接消费。
 * 只描述视图与写入结果, 不包含 store 结构或 HTTP 细节。
 */

import type { BiliUserProfile } from './login';

/** 会话类型 (与消息事件的 message_type 同域) */
export type MonitorSessionType = 'private' | 'group';

/** 会话上限类别 */
export type MonitorLimitKind = 'live' | 'online' | 'dyn';

/** 写入失败原因 */
export type MonitorWriteCode =
    | 'invalid'
    | 'duplicate'
    | 'limit_reached'
    | 'not_found'
    | 'login_required'
    | 'unlimited'
    | 'failed';

/** 单个目标的写入结果 */
export interface MonitorTargetResult {
    type: MonitorSessionType;
    id: string;
    ok: boolean;
    code?: MonitorWriteCode;
    message: string;
}

/** 写入请求里的目标 */
export interface MonitorTargetInput {
    type: MonitorSessionType;
    id: string;
}

/** 新增直播/动态监听请求 */
export interface AddMonitorRequest {
    uid: string;
    targets: MonitorTargetInput[];
}

/** 切换同接监听请求 */
export interface SetOnlineRequest {
    type: MonitorSessionType;
    id: string;
    enabled: boolean;
}

/** 设置会话上限请求 */
export interface SetLimitRequest {
    type: MonitorSessionType;
    id: string;
    kind: MonitorLimitKind;
    max: number;
}

/** 直播监听目标 (含开播 @ 订阅数) */
export interface LiveTargetView extends MonitorTargetInput {
    mentionCount: number;
    onlineEnabled: boolean;
}

/** 直播内容分段 */
export interface LiveContentSegmentView {
    title: string;
    parentAreaName: string;
    areaName: string;
    startTime: number;
    endTime: number;
}

/** 直播监听行 */
export interface LiveMonitorView {
    uid: string;
    uname: string;
    avatar: string;
    status: 'streaming' | 'offline';
    title: string;
    parentAreaName: string;
    areaName: string;
    liveTime: number;
    durationSec: number;
    onlineCurrent: number | null;
    onlinePeak: number | null;
    targets: LiveTargetView[];
    liveContents: LiveContentSegmentView[];
    onlineSnapshots: Array<[number, number]>;
}

/** 动态监听目标 */
export type DynTargetView = MonitorTargetInput;

/** 单个主播的动态检查健康 */
export interface DynUidHealthView {
    lastCheckAt: number | null;
    lastSuccessAt: number | null;
    lastError: string | null;
}

/** 动态监听行 */
export interface DynMonitorView {
    uid: string;
    uname: string;
    targets: DynTargetView[];
    cachedCount: number;
    health: DynUidHealthView;
}

/** 各档默认上限 */
export interface LimitDefaults {
    live: Record<MonitorSessionType, number>;
    online: Record<MonitorSessionType, number>;
    dyn: Record<MonitorSessionType, number>;
}

/** 上限元数据 */
export interface LimitMeta {
    min: number;
    max: number;
    defaults: LimitDefaults;
}

/** 会话已用数量 */
export interface LimitUsage {
    live: number;
    online: number;
    dyn: number;
}

/** 会话显式覆盖值 (缺省表示跟随默认) */
export type LimitOverrides = Partial<
    Record<MonitorLimitKind, number>
>;

/** 上限页的会话行 */
export interface LimitSessionView {
    type: MonitorSessionType;
    id: string;
    used: LimitUsage;
    limits: LimitOverrides;
    unlimited: boolean;
}

/** 上限页数据 */
export interface LimitsView {
    meta: LimitMeta;
    sessions: LimitSessionView[];
}

/** 轮询健康 */
export interface PollHealth {
    running: boolean;
    lastRunAt: number | null;
    lastSuccessAt: number | null;
    nextRunAt: number | null;
    lastError: string | null;
}

/** 轮询健康视图 (含空闲/跳过语义) */
export interface PollHealthView extends PollHealth {
    idle: boolean;
    skippedNotLoggedIn: boolean;
}

/** 渲染服务健康 */
export interface RenderHealthView {
    probedAt: number | null;
    available: boolean | null;
    message: string | null;
}

/** 健康条数据 */
export interface MonitorHealthView {
    process: {
        startTime: number;
        uptime: number;
    };
    live: PollHealthView;
    dyn: PollHealthView;
    login: {
        loggedIn: boolean;
        cookieExpired: boolean;
        user: BiliUserProfile | null;
    };
    render: RenderHealthView;
}
