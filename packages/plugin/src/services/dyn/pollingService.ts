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
import { pluginState } from '../../core/state';
import { BiliCookieStore } from '../../store/biliCookieStore';
import { BiliDynMonitorStore } from '../../store/biliDynMonitorStore';
import { fetchAndPushUidDynamic } from './fetchUidDynamicService';

/** 默认轮询间隔（秒），配置缺失时兜底 */
const DEFAULT_DYN_POLL_INTERVAL = 300;

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

    private _dynStore: BiliDynMonitorStore | null = null;

    /** 惰性获取动态监听存储 */
    private get dynStore(): BiliDynMonitorStore {
        if (!this._dynStore) {
            this._dynStore = BiliDynMonitorStore.getInstance();
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
                // 与开播前预取共用同一实现 (内部 in-flight 互斥去重)
                await fetchAndPushUidDynamic(uid, () => this.stopped);
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
}

/** 睡眠工具 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
