import type {
    LimitDefaults,
    LimitSessionView,
    LiveMonitorView,
    MonitorLimitKind,
    MonitorSessionType,
    PollHealthView,
    RenderHealthView,
} from 'shared';
import type { SessionInfo } from '../types';

export type HealthTone = 'ok' | 'warn' | 'error' | 'idle' | 'info';

export interface HealthBadgeView {
    label: string;
    detail: string;
    tone: HealthTone;
}

/** 会话唯一键 */
export function sessionKey(
    type: MonitorSessionType,
    id: string,
): string {
    return `${type}:${id}`;
}

/** 会话显示名 (无名称时回落类型 + ID) */
export function sessionName(
    sessions: SessionInfo[],
    type: MonitorSessionType,
    id: string,
): string {
    const found = sessions.find(
        (session) => session.type === type && session.id === id,
    );
    if (found?.name) return found.name;
    return `${type === 'group' ? '群' : '私聊'} ${id}`;
}

/** 时间戳 → 本地时间 */
export function formatDateTime(timestamp: number | null): string {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/** 时间戳 → 时分秒 */
export function formatClock(timestamp: number | null): string {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
        hour12: false,
    });
}

/** 相对时间 */
export function formatRelative(
    timestamp: number | null,
    now = Date.now(),
): string {
    if (!timestamp) return '—';
    const diff = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (diff < 5) return '刚刚';
    if (diff < 60) return `${diff} 秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    return `${Math.floor(diff / 86400)} 天前`;
}

/** 距离下次轮询 */
export function formatUntil(
    timestamp: number | null,
    now = Date.now(),
): string {
    if (!timestamp) return '—';
    const diff = Math.floor((timestamp - now) / 1000);
    if (diff <= 0) return '即将执行';
    if (diff < 60) return `${diff} 秒后`;
    return `${Math.ceil(diff / 60)} 分钟后`;
}

/** 进程运行时长 */
export function formatUptime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days} 天 ${hours} 小时`;
    if (hours > 0) return `${hours} 小时 ${minutes} 分`;
    return `${minutes} 分钟`;
}

/** 直播状态标签 */
export function liveStatusLabel(
    status: 'streaming' | 'offline',
): string {
    return status === 'streaming' ? '直播中' : '未开播';
}

/** 直播时长 */
export function formatLiveDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours} 小时 ${minutes} 分`;
    return `${minutes} 分`;
}

/** 轮询健康徽章 */
export function describePoll(
    kind: 'live' | 'dyn',
    health: PollHealthView,
    now = Date.now(),
): HealthBadgeView {
    if (health.idle) {
        return {
            label: '空闲（无监听）',
            detail: '添加监听后自动开始轮询',
            tone: 'idle',
        };
    }
    if (health.skippedNotLoggedIn) {
        return {
            label: '跳过（未登录）',
            detail: '登录 B 站后恢复动态轮询',
            tone: 'warn',
        };
    }
    if (health.running) {
        return {
            label: '运行中',
            detail: `本轮开始于 ${formatClock(health.lastRunAt)}`,
            tone: 'info',
        };
    }
    if (health.lastError) {
        return {
            label: kind === 'live' ? '直播轮询异常' : '动态轮询异常',
            detail: health.lastError,
            tone: 'error',
        };
    }
    if (health.lastSuccessAt === null) {
        return {
            label: '等待首轮',
            detail: '尚未完成一次检查',
            tone: 'idle',
        };
    }
    return {
        label: '正常',
        detail: `最近成功 ${formatRelative(health.lastSuccessAt, now)} · 下次 ${formatUntil(health.nextRunAt, now)}`,
        tone: 'ok',
    };
}

/** 登录健康徽章 */
export function describeLogin(
    loggedIn: boolean,
    cookieExpired: boolean,
    userName?: string,
): HealthBadgeView {
    if (!loggedIn) {
        return {
            label: '未登录',
            detail: '动态/视频监听需要登录',
            tone: 'idle',
        };
    }
    if (cookieExpired) {
        return {
            label: 'Cookie 已失效',
            detail: '请在私聊执行 #bili user login 重新登录',
            tone: 'warn',
        };
    }
    return {
        label: '已登录',
        detail: userName ? `账号 ${userName}` : '登录态有效',
        tone: 'ok',
    };
}

/** 渲染服务健康徽章 */
export function describeRender(
    render: RenderHealthView,
    now = Date.now(),
): HealthBadgeView {
    if (render.probedAt === null || render.available === null) {
        return {
            label: '未探测',
            detail: '点击刷新健康状态进行探测',
            tone: 'idle',
        };
    }
    return {
        label: render.available ? '可用' : '不可用',
        detail: `${render.available ? 'SVG 卡片渲染正常' : (render.message ?? '渲染失败')} · 探测于 ${formatRelative(render.probedAt, now)}（本次进程内）`,
        tone: render.available ? 'ok' : 'error',
    };
}

/** 生效上限 (null 表示无上限) */
export function effectiveLimit(
    session: LimitSessionView,
    kind: MonitorLimitKind,
    defaults: LimitDefaults,
): number | null {
    if (session.unlimited) return null;
    return session.limits[kind] ?? defaults[kind][session.type];
}

/** 上限展示文本 */
export function limitText(limit: number | null): string {
    return limit === null ? '∞' : String(limit);
}

/** 同接快照 → SVG polyline 点串 */
export function buildOnlinePolyline(
    snapshots: Array<[number, number]>,
    width: number,
    height: number,
): string {
    if (snapshots.length < 2) return '';
    const values = snapshots.map((snapshot) => snapshot[0]);
    const times = snapshots.map((snapshot) => snapshot[1]);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    const valueSpan = Math.max(1, maxValue - minValue);
    const timeSpan = Math.max(1, maxTime - minTime);

    return snapshots
        .map(([value, time]) => {
            const x = ((time - minTime) / timeSpan) * width;
            const y =
                height - ((value - minValue) / valueSpan) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
}

/** 直播行筛选 */
export function filterLiveRows(
    rows: LiveMonitorView[],
    options: {
        search: string;
        status: 'all' | 'streaming' | 'offline';
        session: string;
    },
): LiveMonitorView[] {
    const query = options.search.trim().toLowerCase();
    return rows.filter((row) => {
        if (
            options.status !== 'all' &&
            row.status !== options.status
        ) {
            return false;
        }
        if (
            options.session &&
            !row.targets.some(
                (target) =>
                    sessionKey(target.type, target.id) ===
                    options.session,
            )
        ) {
            return false;
        }
        if (!query) return true;
        return (
            row.uname.toLowerCase().includes(query) ||
            row.uid.includes(query) ||
            row.title.toLowerCase().includes(query)
        );
    });
}
