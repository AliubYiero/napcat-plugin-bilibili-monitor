import type {
    AddMonitorRequest,
    MonitorLimitKind,
    MonitorSessionType,
    MonitorTargetInput,
    MonitorTargetResult,
    MonitorWriteCode,
    SetLimitRequest,
    SetOnlineRequest,
} from 'shared';
import {
    api_getDynamicFeed,
    type BiliDynamicItem,
} from '../api/getDynamicFeed';
import {
    api_getStatusInfoByUids,
    type RoomStatusInfo,
} from '../api/getStatusInfoByUids';
import { isSuperAdmin } from '../core/admin';
import { pluginState } from '../core/state';
import { BiliCookieStore } from '../store/biliCookieStore';
import { BiliDynMonitorStore } from '../store/biliDynMonitorStore';
import { BiliLiveMonitorStore } from '../store/biliLiveMonitorStore';
import {
    BiliLiveRoomStore,
    mapToRoomInfo,
} from '../store/biliLiveRoomStore';
import {
    getDynLimit,
    isDynLimitReached,
    removeDynLimit,
    setDynLimit,
} from './dyn/limitService';
import {
    addDynCachedIds,
    removeDynRuntime,
} from './dyn/runtimeService';
import {
    getLiveLimit,
    isLiveLimitReached,
    MAX_LIMIT as LIVE_MAX_LIMIT,
    MIN_LIMIT as LIVE_MIN_LIMIT,
    removeLiveLimit,
    setLiveLimit,
} from './live/limitService';
import {
    getOnlineLimit,
    isOnlineLimitReached,
    removeOnlineLimit,
    setOnlineLimit,
} from './live/onlineLimitService';

const MIN_LIMIT = 0;
const MAX_LIMIT = 50;

const SESSION_TYPES: MonitorSessionType[] = ['private', 'group'];
const LIMIT_KINDS: MonitorLimitKind[] = ['live', 'online', 'dyn'];

function isNumericId(value: unknown): value is string {
    return typeof value === 'string' && /^\d+$/.test(value);
}

/** 主播 UID 是否合法 */
export function isMonitorUid(value: unknown): value is string {
    return isNumericId(value);
}

/** 校验并规范化目标输入 */
export function parseMonitorTarget(
    value: unknown,
): MonitorTargetInput | null {
    if (!value || typeof value !== 'object') return null;
    const { type, id } = value as {
        type?: unknown;
        id?: unknown;
    };
    if (!SESSION_TYPES.includes(type as MonitorSessionType)) {
        return null;
    }
    if (!isNumericId(id)) return null;
    return { type: type as MonitorSessionType, id };
}

/** 校验上限类别 */
export function parseLimitKind(
    value: unknown,
): MonitorLimitKind | null {
    return LIMIT_KINDS.includes(value as MonitorLimitKind)
        ? (value as MonitorLimitKind)
        : null;
}

/** 上限值是否合法 (整数 0~50) */
export function isLimitValue(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= MIN_LIMIT &&
        value <= MAX_LIMIT
    );
}

function result(
    target: MonitorTargetInput,
    ok: boolean,
    message: string,
    code?: MonitorWriteCode,
): MonitorTargetResult {
    return {
        type: target.type,
        id: target.id,
        ok,
        ...(code ? { code } : {}),
        message,
    };
}

function invalidResult(message: string): MonitorTargetResult {
    return {
        type: 'group',
        id: '',
        ok: false,
        code: 'invalid',
        message,
    };
}

function dedupeTargets(
    targets: MonitorTargetInput[],
): MonitorTargetInput[] {
    const seen = new Set<string>();
    const out: MonitorTargetInput[] = [];
    for (const target of targets) {
        const key = `${target.type}:${target.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(target);
    }
    return out;
}

function sessionLabel(target: MonitorTargetInput): string {
    return `${target.type === 'group' ? '群' : '私聊'} ${target.id}`;
}

/** 新增直播监听 (静默: 不推送, 只建立轮询基线) */
export async function addLiveMonitors(
    request: AddMonitorRequest,
): Promise<MonitorTargetResult[]> {
    const uid = String(request.uid ?? '').trim();
    if (!isNumericId(uid)) {
        return [invalidResult('主播 UID 必须是数字')];
    }

    const targets = dedupeTargets(
        request.targets
            .map(parseMonitorTarget)
            .filter(
                (target): target is MonitorTargetInput => !!target,
            ),
    );
    if (targets.length === 0) {
        return [invalidResult('请至少选择一个有效推送会话')];
    }

    let liveInfo: RoomStatusInfo | undefined;
    try {
        const response = await api_getStatusInfoByUids([uid]);
        liveInfo = response.data?.[uid];
        if (!liveInfo) {
            return targets.map((target) =>
                result(
                    target,
                    false,
                    `未找到主播 ${uid} 的信息`,
                    'not_found',
                ),
            );
        }
    } catch (error) {
        pluginState.logger.error(
            `WebUI 新增直播监听失败 (拉取主播 ${uid}):`,
            error,
        );
        const message =
            error instanceof Error ? error.message : String(error);
        return targets.map((target) =>
            result(
                target,
                false,
                `拉取主播信息失败: ${message}`,
                'failed',
            ),
        );
    }

    const monitorStore = BiliLiveMonitorStore.getInstance();
    const hadMonitor = !!monitorStore.getByUid(uid);
    const results: MonitorTargetResult[] = [];
    let added = false;

    for (const target of targets) {
        if (monitorStore.has(uid, target)) {
            results.push(
                result(
                    target,
                    false,
                    `${sessionLabel(target)} 已在直播监听中`,
                    'duplicate',
                ),
            );
            continue;
        }
        if (
            isLiveLimitReached(
                target,
                monitorStore.listForLiveTarget(target).length,
            )
        ) {
            const limit = getLiveLimit(target);
            results.push(
                result(
                    target,
                    false,
                    `${sessionLabel(target)} 直播监听已达上限 (${limit})`,
                    'limit_reached',
                ),
            );
            continue;
        }

        monitorStore.add(uid, liveInfo.uname, target);
        added = true;
        results.push(result(target, true, '已添加直播监听'));
    }

    if (added) {
        // 只为首次纳入轮询的主播建立基线: 已有监听时静默覆盖状态会
        // 吞掉轮询本该发现的开播/改标题变化, 导致既有目标漏推。
        if (!hadMonitor) {
            const roomInfo = mapToRoomInfo(liveInfo);
            if (roomInfo) {
                BiliLiveRoomStore.getInstance().upsertSilent(
                    roomInfo,
                );
            }
        }
        pluginState.logger.info(
            `WebUI 新增直播监听: ${uid} -> ${results
                .filter((item) => item.ok)
                .map((item) => `${item.type}:${item.id}`)
                .join(', ')}`,
        );
    }
    return results;
}

/** 移除单个直播目标 (同接由 store 级联关闭) */
export function removeLiveMonitor(
    uid: string,
    target: MonitorTargetInput,
): MonitorTargetResult {
    const monitorStore = BiliLiveMonitorStore.getInstance();
    const hadOnline = monitorStore.hasOnlineForTarget(uid, target);
    if (!monitorStore.remove(uid, target)) {
        return result(
            target,
            false,
            '未找到该直播监听目标',
            'not_found',
        );
    }
    pluginState.logger.info(
        `WebUI 移除直播监听: ${uid} -> ${target.type}:${target.id}`,
    );
    return result(
        target,
        true,
        hadOnline
            ? '已移除直播监听 (该会话的同接监听一并关闭)'
            : '已移除直播监听',
    );
}

/** 切换单个目标的同接监听 */
export function setOnlineMonitor(
    uid: string,
    request: SetOnlineRequest,
): MonitorTargetResult {
    const target = parseMonitorTarget(request);
    if (!target) {
        return invalidResult('无效的推送会话');
    }
    if (typeof request.enabled !== 'boolean') {
        return result(
            target,
            false,
            'enabled 必须是布尔值',
            'invalid',
        );
    }

    const monitorStore = BiliLiveMonitorStore.getInstance();
    if (
        !monitorStore.has(uid, target) ||
        !monitorStore.getByUid(uid)?.to.length
    ) {
        return result(
            target,
            false,
            '请先为该会话添加直播监听',
            'not_found',
        );
    }

    if (request.enabled) {
        if (monitorStore.hasOnlineForTarget(uid, target)) {
            return result(target, true, '该会话已开启同接监听');
        }
        if (
            isOnlineLimitReached(
                target,
                monitorStore.listForOnlineTarget(target).length,
            )
        ) {
            const limit = getOnlineLimit(target);
            return result(
                target,
                false,
                `同接监听已达上限 (${limit})`,
                'limit_reached',
            );
        }
        monitorStore.addOnline(uid, target);
        pluginState.logger.info(
            `WebUI 开启同接: ${uid} -> ${target.type}:${target.id}`,
        );
        return result(target, true, '已开启同接监听');
    }

    if (monitorStore.removeOnline(uid, target)) {
        pluginState.logger.info(
            `WebUI 关闭同接: ${uid} -> ${target.type}:${target.id}`,
        );
        return result(target, true, '已关闭同接监听');
    }
    return result(target, true, '该会话已处于关闭状态');
}

/** 新增动态监听 (静默: 只建立缓存基线, 不补推历史) */
export async function addDynMonitors(
    request: AddMonitorRequest,
): Promise<MonitorTargetResult[]> {
    const uid = String(request.uid ?? '').trim();
    if (!isNumericId(uid)) {
        return [invalidResult('主播 UID 必须是数字')];
    }

    const targets = dedupeTargets(
        request.targets
            .map(parseMonitorTarget)
            .filter(
                (target): target is MonitorTargetInput => !!target,
            ),
    );
    if (targets.length === 0) {
        return [invalidResult('请至少选择一个有效推送会话')];
    }

    const cookieStore = BiliCookieStore.getInstance();
    if (!cookieStore.has() || cookieStore.isExpired()) {
        return targets.map((target) =>
            result(
                target,
                false,
                'B 站未登录或 Cookie 已失效, 请先登录',
                'login_required',
            ),
        );
    }

    let items: BiliDynamicItem[];
    try {
        const response = await api_getDynamicFeed(uid);
        if (response.code !== 0 || !response.data?.items) {
            if (response.code === -101 || response.code === -352) {
                void cookieStore.markExpired();
                return targets.map((target) =>
                    result(
                        target,
                        false,
                        'B 站登录 Cookie 已失效, 请重新登录',
                        'login_required',
                    ),
                );
            }
            return targets.map((target) =>
                result(
                    target,
                    false,
                    `拉取动态失败 (code=${response.code})`,
                    'failed',
                ),
            );
        }
        items = response.data.items;
    } catch (error) {
        pluginState.logger.error(
            `WebUI 新增动态监听失败 (拉取主播 ${uid} 动态):`,
            error,
        );
        const message =
            error instanceof Error ? error.message : String(error);
        return targets.map((target) =>
            result(
                target,
                false,
                `拉取动态失败: ${message}`,
                'failed',
            ),
        );
    }

    const uname = items[0]?.modules.module_author?.name || uid;
    const dynStore = BiliDynMonitorStore.getInstance();
    const results: MonitorTargetResult[] = [];
    let added = false;

    for (const target of targets) {
        if (dynStore.has(uid, target)) {
            results.push(
                result(
                    target,
                    false,
                    `${sessionLabel(target)} 已在动态监听中`,
                    'duplicate',
                ),
            );
            continue;
        }
        if (
            isDynLimitReached(
                target,
                dynStore
                    .get()
                    .filter((monitor) =>
                        monitor.to.some(
                            (item) =>
                                item.type === target.type &&
                                item.id === target.id,
                        ),
                    ).length,
            )
        ) {
            const limit = getDynLimit(target);
            results.push(
                result(
                    target,
                    false,
                    `${sessionLabel(target)} 动态监听已达上限 (${limit})`,
                    'limit_reached',
                ),
            );
            continue;
        }

        dynStore.add(uid, uname, target);
        added = true;
        results.push(result(target, true, '已添加动态监听'));
    }

    if (added) {
        addDynCachedIds(
            uid,
            items.map((item) => item.id_str),
        );
        pluginState.logger.info(
            `WebUI 新增动态监听: ${uid} -> ${results
                .filter((item) => item.ok)
                .map((item) => `${item.type}:${item.id}`)
                .join(', ')}`,
        );
    }
    return results;
}

/** 移除单个动态目标 (最后一条记录时清理运行时缓存) */
export function removeDynMonitor(
    uid: string,
    target: MonitorTargetInput,
): MonitorTargetResult {
    const dynStore = BiliDynMonitorStore.getInstance();
    if (!dynStore.remove(uid, target)) {
        return result(
            target,
            false,
            '未找到该动态监听目标',
            'not_found',
        );
    }
    if (!dynStore.getByUid(uid)) {
        removeDynRuntime(uid);
    }
    pluginState.logger.info(
        `WebUI 移除动态监听: ${uid} -> ${target.type}:${target.id}`,
    );
    return result(target, true, '已移除动态监听');
}

/** 设置单个会话的某类上限 */
export function setMonitorLimit(
    request: SetLimitRequest,
): MonitorTargetResult {
    const target = parseMonitorTarget(request);
    if (!target) {
        return invalidResult('无效的推送会话');
    }
    const kind = parseLimitKind(request.kind);
    if (!kind) {
        return result(target, false, '无效的上限类别', 'invalid');
    }
    if (!isLimitValue(request.max)) {
        return result(
            target,
            false,
            `上限必须是 ${MIN_LIMIT}~${MAX_LIMIT} 的整数`,
            'invalid',
        );
    }
    if (target.type === 'private' && isSuperAdmin(target.id)) {
        return result(
            target,
            false,
            '超级管理员私聊无上限, 无需设置',
            'unlimited',
        );
    }

    if (kind === 'live')
        setLiveLimit(target.id, target.type, request.max);
    else if (kind === 'online')
        setOnlineLimit(target.id, target.type, request.max);
    else setDynLimit(target.id, target.type, request.max);

    pluginState.logger.info(
        `WebUI 设置上限: ${target.type}:${target.id} ${kind}=${request.max}`,
    );
    return result(target, true, '已更新上限');
}

/** 删除单个会话的某类上限覆盖 (恢复默认) */
export function removeMonitorLimit(
    type: MonitorSessionType,
    id: string,
    kind: MonitorLimitKind,
): MonitorTargetResult {
    const target: MonitorTargetInput = { type, id };
    if (!parseMonitorTarget(target)) {
        return invalidResult('无效的推送会话');
    }
    if (kind === 'live') removeLiveLimit(id, type);
    else if (kind === 'online') removeOnlineLimit(id, type);
    else removeDynLimit(id, type);

    pluginState.logger.info(
        `WebUI 恢复默认上限: ${type}:${id} ${kind}`,
    );
    return result(target, true, '已恢复默认上限');
}

/** 上限常量 (供路由校验复用) */
export const MONITOR_LIMIT_RANGE = {
    min: Math.min(MIN_LIMIT, LIVE_MIN_LIMIT),
    max: Math.max(MAX_LIMIT, LIVE_MAX_LIMIT),
} as const;
