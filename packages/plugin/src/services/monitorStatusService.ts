import type {
    DynMonitorView,
    LimitDefaults,
    LimitSessionView,
    LimitsView,
    LiveMonitorView,
    LiveTargetView,
    MonitorHealthView,
    MonitorLimitKind,
    MonitorSessionType,
} from 'shared';
import { isSuperAdmin } from '../core/admin';
import { pluginState } from '../core/state';
import { BiliCookieStore } from '../store/biliCookieStore';
import { BiliDynMonitorStore } from '../store/biliDynMonitorStore';
import { BiliDynRuntimeStore } from '../store/biliDynRuntimeStore';
import { BiliLimitStore } from '../store/biliLimitStore';
import { BiliLiveMonitorStore } from '../store/biliLiveMonitorStore';
import { BiliLiveRoomStore } from '../store/biliLiveRoomStore';
import {
    DEFAULT_GROUP_LIMIT as DYN_DEFAULT_GROUP,
    DEFAULT_PRIVATE_LIMIT as DYN_DEFAULT_PRIVATE,
} from './dyn/limitService';
import { healthSnapshot } from './health/healthSnapshot';
import {
    DEFAULT_GROUP_LIMIT as LIVE_DEFAULT_GROUP,
    DEFAULT_PRIVATE_LIMIT as LIVE_DEFAULT_PRIVATE,
    MAX_LIMIT as LIVE_MAX_LIMIT,
    MIN_LIMIT as LIVE_MIN_LIMIT,
} from './live/limitService';
import {
    DEFAULT_GROUP_ONLINE_LIMIT,
    DEFAULT_PRIVATE_ONLINE_LIMIT,
    MAX_ONLINE_LIMIT,
    MIN_ONLINE_LIMIT,
} from './live/onlineLimitService';

/** 会话唯一键 */
export function monitorSessionKey(
    type: MonitorSessionType,
    id: string,
): string {
    return `${type}:${id}`;
}

/** 读取直播监听视图 */
export function getLiveMonitors(): LiveMonitorView[] {
    const monitorStore = BiliLiveMonitorStore.getInstance();
    const roomStore = BiliLiveRoomStore.getInstance();
    const nowSec = Math.floor(Date.now() / 1000);

    return monitorStore
        .get()
        .map((monitor): LiveMonitorView => {
            const room = roomStore.get(monitor.uid);
            const snapshots = room?.onlineSnapshots ?? [];
            const onlineCurrent =
                snapshots.length > 0
                    ? snapshots[snapshots.length - 1][0]
                    : null;
            const onlinePeak =
                snapshots.length > 0
                    ? snapshots.reduce(
                          (peak, snapshot) =>
                              Math.max(peak, snapshot[0]),
                          0,
                      )
                    : null;
            const liveTime = room?.live_time ?? 0;
            const status = room?.live_status ?? 'offline';

            const targets: LiveTargetView[] = monitor.to.map(
                (target) => ({
                    type: target.type,
                    id: target.id,
                    mentionCount: target.mentionUsers?.length ?? 0,
                    onlineEnabled:
                        monitor.onlineTo?.some(
                            (online) =>
                                online.type === target.type &&
                                online.id === target.id,
                        ) ?? false,
                }),
            );

            return {
                uid: monitor.uid,
                uname: room?.uname || monitor.uname || monitor.uid,
                avatar: room?.avatar ?? '',
                status,
                title: room?.title ?? '',
                parentAreaName: room?.parent_area_name ?? '',
                areaName: room?.area_name ?? '',
                liveTime,
                durationSec:
                    status === 'streaming' && liveTime > 0
                        ? Math.max(0, nowSec - liveTime)
                        : 0,
                onlineCurrent,
                onlinePeak,
                targets,
                liveContents: (room?.liveContents ?? []).map(
                    (content) => ({
                        title: content.title,
                        parentAreaName: content.parent_area_name,
                        areaName: content.area_name,
                        startTime: content.startTime,
                        endTime: content.endTime,
                    }),
                ),
                onlineSnapshots: snapshots.map(
                    (snapshot) =>
                        [snapshot[0], snapshot[1]] as [
                            number,
                            number,
                        ],
                ),
            };
        })
        .sort((a, b) => {
            if (a.status !== b.status) {
                return a.status === 'streaming' ? -1 : 1;
            }
            return a.uname.localeCompare(b.uname, 'zh-CN');
        });
}

/** 读取动态监听视图 */
export function getDynMonitors(): DynMonitorView[] {
    const monitorStore = BiliDynMonitorStore.getInstance();
    const runtimeStore = BiliDynRuntimeStore.getInstance();

    return monitorStore
        .get()
        .map(
            (monitor): DynMonitorView => ({
                uid: monitor.uid,
                uname: monitor.uname || monitor.uid,
                targets: monitor.to.map((target) => ({
                    type: target.type,
                    id: target.id,
                })),
                cachedCount: runtimeStore.getCachedIds(monitor.uid)
                    .length,
                health: healthSnapshot.getDynUidHealth(monitor.uid),
            }),
        )
        .sort((a, b) => a.uname.localeCompare(b.uname, 'zh-CN'));
}

/** 各档默认上限 (单源: 三个 limitService 的常量) */
function buildLimitDefaults(): LimitDefaults {
    return {
        live: {
            group: LIVE_DEFAULT_GROUP,
            private: LIVE_DEFAULT_PRIVATE,
        },
        online: {
            group: DEFAULT_GROUP_ONLINE_LIMIT,
            private: DEFAULT_PRIVATE_ONLINE_LIMIT,
        },
        dyn: {
            group: DYN_DEFAULT_GROUP,
            private: DYN_DEFAULT_PRIVATE,
        },
    };
}

/** 读取上限页数据 */
export function getLimitsView(): LimitsView {
    const liveMonitors = BiliLiveMonitorStore.getInstance().get();
    const dynMonitors = BiliDynMonitorStore.getInstance().get();
    const limitStore = BiliLimitStore.getInstance();

    const liveUsage = new Map<string, number>();
    const onlineUsage = new Map<string, number>();
    const dynUsage = new Map<string, number>();
    const sessions = new Map<
        string,
        { type: MonitorSessionType; id: string }
    >();

    const addSession = (
        type: MonitorSessionType,
        id: string,
    ): void => {
        sessions.set(monitorSessionKey(type, id), { type, id });
    };

    const increment = (
        map: Map<string, number>,
        type: MonitorSessionType,
        id: string,
    ): void => {
        const key = monitorSessionKey(type, id);
        map.set(key, (map.get(key) ?? 0) + 1);
    };

    for (const monitor of liveMonitors) {
        for (const target of monitor.to) {
            addSession(target.type, target.id);
            increment(liveUsage, target.type, target.id);
        }
        for (const target of monitor.onlineTo ?? []) {
            addSession(target.type, target.id);
            increment(onlineUsage, target.type, target.id);
        }
    }

    for (const monitor of dynMonitors) {
        for (const target of monitor.to) {
            addSession(target.type, target.id);
            increment(dynUsage, target.type, target.id);
        }
    }

    for (const record of limitStore.getAll()) {
        addSession(record.type, record.id);
    }

    const sessionViews: LimitSessionView[] = [...sessions.values()]
        .map(({ type, id }) => {
            const key = monitorSessionKey(type, id);
            const record = limitStore.get(id, type);
            return {
                type,
                id,
                used: {
                    live: liveUsage.get(key) ?? 0,
                    online: onlineUsage.get(key) ?? 0,
                    dyn: dynUsage.get(key) ?? 0,
                },
                limits: record ? { ...record.limits } : {},
                unlimited: type === 'private' && isSuperAdmin(id),
            };
        })
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'group' ? -1 : 1;
            return a.id.localeCompare(b.id);
        });

    return {
        meta: {
            min: Math.min(LIVE_MIN_LIMIT, MIN_ONLINE_LIMIT, 0),
            max: Math.max(LIVE_MAX_LIMIT, MAX_ONLINE_LIMIT, 50),
            defaults: buildLimitDefaults(),
        },
        sessions: sessionViews,
    };
}

/** 读取健康快照; probe=true 时按需探测渲染服务 */
export async function getMonitorHealth(
    probe: boolean,
): Promise<MonitorHealthView> {
    const cookieStore = BiliCookieStore.getInstance();
    const render = probe
        ? await healthSnapshot.probeRender()
        : healthSnapshot.getRenderHealth();

    return {
        process: {
            startTime: pluginState.startTime,
            uptime: pluginState.getUptime(),
        },
        live: healthSnapshot.getPollHealth('live'),
        dyn: healthSnapshot.getPollHealth('dyn'),
        login: {
            loggedIn: cookieStore.has(),
            cookieExpired: cookieStore.isExpired(),
            user: cookieStore.getUser() ?? null,
        },
        render,
    };
}

/** 是否为本插件支持的上限类别 */
export function isMonitorLimitKind(
    value: unknown,
): value is MonitorLimitKind {
    return value === 'live' || value === 'online' || value === 'dyn';
}
