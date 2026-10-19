/**
 * 单 uid 动态拉取与推送
 *
 * 抽自动态轮询的 processMonitor, 供两条路径共用:
 * - 常规动态轮询 (services/dyn/polling.service)
 * - 开播前预取 (services/live/polling.service 的 start_stream 分支)
 *
 * 同一 uid 的拉取经 in-flight Promise 互斥: 后到者复用进行中的那一次,
 * 既去重请求, 又保证后到者能等到本次推送完成 (开播链路依赖的
 * 「动态先于开播」顺序由此维持)。
 */

import type { BiliDynamicItem } from '../../api/getDynamicFeed';
import { api_getDynamicFeed } from '../../api/getDynamicFeed';
import { pluginState } from '../../core/state';
import { BiliCookieStore } from '../../store/biliCookieStore';
import { BiliDynMonitorStore } from '../../store/biliDynMonitorStore';
import { parseBiliDynamic } from './parserService';
import { pushDynToTargets } from './pushService';
import { addDynCachedIds, getDynCachedIds } from './runtimeService';

/** 新动态推送间隔 (ms) */
const PUSH_INTERVAL_MS = 500;

/** 同一 uid 的进行中拉取 (去重 + 保序) */
const inFlight = new Map<string, Promise<void>>();

/** 惰性获取动态监听存储 (避免模块加载期触达未初始化的 pluginState.ctx) */
let _dynStore: BiliDynMonitorStore | null = null;
function dynStore(): BiliDynMonitorStore {
    if (!_dynStore) {
        _dynStore = BiliDynMonitorStore.getInstance();
    }
    return _dynStore;
}

/**
 * 拉取某 uid 一页动态, 比对缓存, 推送新动态
 *
 * 同一 uid 已有拉取在进行时, 直接返回该次 Promise (后到者 await 同一个),
 * 不重复请求。
 *
 * @param shouldAbort 推送循环的中断判据 (轮询停止时提前退出), 默认不中断
 */
export function fetchAndPushUidDynamic(
    uid: string,
    shouldAbort: () => boolean = () => false,
): Promise<void> {
    const running = inFlight.get(uid);
    if (running) {
        pluginState.logger.debug(
            `主播 ${uid} 动态拉取进行中, 复用同一次`,
        );
        return running;
    }
    const task = (async () => {
        try {
            await runFetchAndPush(uid, shouldAbort);
        } finally {
            inFlight.delete(uid);
        }
    })();
    inFlight.set(uid, task);
    return task;
}

/**
 * 拉取并推送的实际编排 (被互斥包裹); 自捕获错误, 永不 reject,
 * 单 uid 失败不影响调用方。
 */
async function runFetchAndPush(
    uid: string,
    shouldAbort: () => boolean,
): Promise<void> {
    const monitor = dynStore().getByUid(uid);
    if (!monitor) return;

    try {
        const cookieStore = BiliCookieStore.getInstance();
        if (!cookieStore.has() || cookieStore.isExpired()) {
            pluginState.logger.warn(
                `B 站未登录或 Cookie 已失效, 跳过主播 ${uid} 动态拉取`,
            );
            return;
        }

        // 请求前取一次缓存快照: 本轮所有"是否已推送"的判定都基于它,
        // 避免本轮写入缓存后污染同一轮的判定。
        // 快照必须在 await 之前取, 否则首绑判定永假。
        const cachedIds = getDynCachedIds(uid);
        // 首绑判定：缓存为空 = 从未拉取过
        const firstBind = cachedIds.length === 0;

        const resp = await api_getDynamicFeed(uid);
        if (resp.code !== 0 || !resp.data?.items) {
            // -101 未登录 / -352 风控: 标记 Cookie 失效并中止
            if (resp.code === -101 || resp.code === -352) {
                void BiliCookieStore.getInstance().markExpired();
                return;
            }
            pluginState.logger.warn(
                `拉取主播 ${uid} 动态失败: code=${resp.code}, ${resp.message ?? ''}`,
            );
            return;
        }

        const items = resp.data.items;
        const news = selectNewDynamics(items, cachedIds, firstBind);

        // 全量记录缓存（置顶也记录，避免取消置顶后重复推送）
        addDynCachedIds(
            uid,
            items.map((it) => it.id_str),
        );

        // 首绑只记录缓存不推送
        if (firstBind) {
            pluginState.logger.debug(
                `主播 ${uid} 首次绑定，记录 ${items.length} 条动态到缓存，不推送`,
            );
            return;
        }

        if (news.length === 0) {
            pluginState.logger.debug(`主播 ${uid} 本轮无新动态`);
            return;
        }

        // 从旧到新推送，间隔 500ms
        for (const item of news) {
            if (shouldAbort()) return;
            const parsed = parseBiliDynamic(item);
            await pushDynToTargets(parsed, uid, monitor.to);
            await sleep(PUSH_INTERVAL_MS);
        }
    } catch (err) {
        pluginState.logger.error(`拉取主播 ${uid} 动态出错:`, err);
    }
}

/**
 * 由缓存快照 + 本次拉取结果选出新动态 (纯函数)
 *
 * 规则:
 * - 首绑 (cachedIds 为空) 不产出任何动态, 只记缓存
 * - 普通动态: id 不在缓存中即视为新
 * - 置顶动态: 发布时间需晚于"去置顶后的第二条"才算新 (置顶常驻,
 *   仅当其被更新时才推送), 且同样需不在缓存中
 * - 返回按 pub_ts 从旧到新排序
 */
export function selectNewDynamics(
    items: BiliDynamicItem[],
    cachedIds: string[],
    firstBind: boolean,
): BiliDynamicItem[] {
    if (firstBind) return [];

    const pinned = items.filter((it) => isPinned(it));
    const normal = items.filter((it) => !isPinned(it));

    const newNormal = normal.filter(
        (it) => !cachedIds.includes(it.id_str),
    );
    // 置顶动态最新判定：更新于第二条（去除置顶后首条）才视为新动态
    const secondPubTs = Number(
        normal[1]?.modules.module_author?.pub_ts ?? 0,
    );
    const newPinned = pinned
        .filter(
            (it) =>
                Number(it.modules.module_author?.pub_ts ?? 0) >
                secondPubTs,
        )
        .filter((it) => !cachedIds.includes(it.id_str));

    return [...newPinned, ...newNormal].sort(
        (a, b) =>
            Number(a.modules.module_author?.pub_ts ?? 0) -
            Number(b.modules.module_author?.pub_ts ?? 0),
    );
}

/** 判断动态是否为置顶动态 */
function isPinned(item: BiliDynamicItem): boolean {
    return item.modules.module_tag?.text === '置顶';
}

/** 睡眠工具 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
