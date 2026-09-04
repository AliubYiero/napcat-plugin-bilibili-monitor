/**
 * Bilibili 动态轮询服务
 *
 * 职责：
 * 1. 独立 setTimeout 链式定时器（与 live polling 同范式）
 * 2. 每轮: 登录态检查 → 唯一 hostMid 去重请求 → 与缓存比对出新动态
 * 3. 新动态按 pub_ts 从旧到新、间隔 500ms 分发推送
 *
 * 注意：store 单例依赖 pluginState.ctx，必须 plugin_init 之后才可实例化，
 * 因此使用惰性 getter。
 */
import { pluginState } from '../core/state';
import {
    BiliDynamicStore,
    type BiliDynamicMonitor,
} from '../store/bili-dynamic.store';
import { BiliCookieStore } from '../store/bili-cookie.store';
import { api_getDynamicFeed } from '../api/api_getDynamicFeed';
import type { BiliDynamicItem } from '../api/api_getDynamicFeed';
import { parseBiliDynamic } from './dyn-parser.service';
import { pushDynToTargets } from './dyn-push.service';

/** 默认轮询间隔（秒），配置缺失时兜底 */
const DEFAULT_DYN_POLL_INTERVAL = 300;

/** 新动态推送间隔（ms） */
const PUSH_INTERVAL_MS = 500;

/**
 * 动态监听的间隔 (ms)
 */
const MONITOR_INTERVAL_MS = 500;

/** 动态轮询服务（单例） */
export class BiliDynamicPollingService {
    private static instance: BiliDynamicPollingService | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;
    private stopped = false;

    private _dynStore: BiliDynamicStore | null = null;

    /** 惰性获取动态存储 */
    private get dynStore(): BiliDynamicStore {
        if (!this._dynStore) {
            this._dynStore = BiliDynamicStore.getInstance();
        }
        return this._dynStore;
    }

    static getInstance(): BiliDynamicPollingService {
        if (!BiliDynamicPollingService.instance) {
            BiliDynamicPollingService.instance =
                new BiliDynamicPollingService();
        }
        return BiliDynamicPollingService.instance;
    }

    /** 启动轮询（plugin_init 中调用） */
    start(): void {
        if (this.running) return;
        this.running = true;
        this.stopped = false;
        void this.dynStore;
        pluginState.logger.debug('动态轮询服务已启动');
        void this.tick();
    }

    /** 停止轮询（plugin_cleanup 中调用） */
    stop(): void {
        this.stopped = true;
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        pluginState.logger.debug('动态轮询服务已停止');
    }

    /** 单个轮询周期 */
    private async tick(): Promise<void> {
        if (this.stopped) return;
        try {
            if (!pluginState.config.enabled) {
                pluginState.logger.debug(
                    '插件已禁用，跳过本轮动态轮询',
                );
                return;
            }
            await this.pollOnce();
        } catch (err) {
            pluginState.logger.error('动态轮询执行出错:', err);
        } finally {
            this.scheduleNext();
        }
    }

    /** 调度下一轮（读取最新配置间隔，改配置即生效） */
    private scheduleNext(): void {
        if (this.stopped) return;
        const intervalMs =
            Math.max(
                1,
                pluginState.config.dynPollIntervalSeconds ??
                    DEFAULT_DYN_POLL_INTERVAL,
            ) * 1000;
        this.timer = setTimeout(() => {
            void this.tick();
        }, intervalMs);
    }

    /** 执行一次动态拉取与推送 */
    private async pollOnce(): Promise<void> {
        const monitors = this.dynStore.get();
        if (monitors.length === 0) {
            pluginState.logger.debug('当前无动态监听，跳过本轮拉取');
            return;
        }

        // 未登录时跳过，避免无谓请求触发风控
        const cookieStore = BiliCookieStore.getInstance();
        if (!cookieStore.has() || cookieStore.isExpired()) {
            pluginState.logger.warn(
                'B 站未登录或 Cookie 已失效，跳过本轮动态轮询',
            );
            return;
        }

        const uniqueUids = [...new Set(monitors.map((m) => m.uid))];
        pluginState.logger.debug(
            `开始拉取动态，共 ${uniqueUids.length} 个主播`,
        );

        for (const uid of uniqueUids) {
            try {
                await this.processMonitor(uid);
                await sleep(MONITOR_INTERVAL_MS);
            } catch (err) {
                // 单个主播失败不影响其他主播
                pluginState.logger.error(
                    `拉取主播 ${uid} 动态出错:`,
                    err,
                );
            }
        }
    }

    /**
     * 处理单个主播：拉取一页动态，比对缓存，
     * 新动态按 pub_ts 从旧到新、间隔 500ms 推送。
     * 首绑（cachedIds 为空 = 从未拉取过）只记录缓存不推送。
     */
    private async processMonitor(uid: string): Promise<void> {
        const monitor = this.dynStore.findItem((m) => m.uid === uid);
        if (!monitor) return;

        // 首绑判定：cachedIds 为空 = 从未拉取过
        const firstBind = monitor.cachedIds.length === 0;

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
        const pinned = items.filter((it) => isPinned(it));
        const normal = items.filter((it) => !isPinned(it));

        // 先在写缓存之前，用本轮拉取前的缓存状态判定新动态
        const newNormal = normal.filter(
            (it) => !monitor.cachedIds.includes(it.id_str),
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
            .filter((it) => !monitor.cachedIds.includes(it.id_str));

        // 全量记录缓存（置顶也记录，避免取消置顶后重复推送）
        this.dynStore.addCacheIds(
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

        const news = [...newPinned, ...newNormal];
        if (news.length === 0) {
            pluginState.logger.debug(`主播 ${uid} 本轮无新动态`);
            return;
        }

        // 从旧到新推送，间隔 500ms
        const sorted = news.sort(
            (a, b) =>
                Number(a.modules.module_author?.pub_ts ?? 0) -
                Number(b.modules.module_author?.pub_ts ?? 0),
        );
        for (const item of sorted) {
            if (this.stopped) return;
            const parsed = parseBiliDynamic(item);
            await pushDynToTargets(parsed, uid, monitor.to);
            await sleep(PUSH_INTERVAL_MS);
        }
    }
}

/** 判断动态是否为置顶动态 */
function isPinned(item: BiliDynamicItem): boolean {
    return item.modules.module_tag?.text === '置顶';
}

/** 睡眠工具 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
