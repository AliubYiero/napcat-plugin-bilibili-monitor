/**
 * 全局状态管理模块（单例模式）
 *
 * 封装插件的配置持久化和运行时状态，提供在项目任意位置访问
 * ctx、config、logger 等对象的能力，无需逐层传递参数。
 *
 * 使用方法：
 *   import { pluginState } from '../core/state';
 *   pluginState.config.pollIntervalSeconds; // 读取配置
 *   pluginState.ctx.logger.info(...);       // 使用日志
 *
 * 生命周期（见 docs/development-pattern.md 铁律）:
 *   plugin_init → init(ctx)（仅设 ctx / 建数据目录，不读配置）
 *              → 数据迁移 + 配置迁移
 *              → loadConfig()
 *              → await fetchSelfId()
 * 迁移必须先于 loadConfig: 迁移要把旧配置改写成新形状后再由本模块清洗。
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
    NapCatPluginContext,
    PluginLogger,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { getDefaultConfig, sanitizeConfig } from 'shared';
import type { PluginConfig } from '../types';

/** 获取机器人 QQ 号的超时时间(毫秒) */
const FETCH_SELF_ID_TIMEOUT_MS = 5000;

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ==================== 插件全局状态类 ====================

class PluginState {
    /** 插件配置 */
    config: PluginConfig = getDefaultConfig();
    /** 插件启动时间戳 */
    startTime: number = 0;
    /** 机器人自身 QQ 号 */
    selfId: string = '';
    /** 活跃的定时器 Map: jobId -> NodeJS.Timeout */
    timers: Map<string, ReturnType<typeof setInterval>> = new Map();
    /** 运行时统计 */
    stats = {
        processed: 0,
        todayProcessed: 0,
        lastUpdateDay: new Date().toDateString(),
    };

    /** NapCat 插件上下文（init 后可用） */
    private _ctx: NapCatPluginContext | null = null;

    /** 获取上下文（确保已初始化） */
    get ctx(): NapCatPluginContext {
        if (!this._ctx)
            throw new Error(
                'PluginState 尚未初始化，请先调用 init()',
            );
        return this._ctx;
    }

    /** 获取日志器的快捷方式 */
    get logger(): PluginLogger {
        return this.ctx.logger;
    }

    /** 配置文件完整路径 */
    get configPath(): string {
        return this.ctx.configPath;
    }

    // ==================== 生命周期 ====================

    /**
     * 初始化（在 plugin_init 中最先调用）
     *
     * 只做两件事: 记录 ctx 与启动时间、确保数据目录存在。
     * 配置读取 (loadConfig) 与机器人 QQ 获取 (fetchSelfId) 由入口在
     * 迁移完成后显式调用, 以便迁移先于清洗生效。
     */
    init(ctx: NapCatPluginContext): void {
        this._ctx = ctx;
        this.startTime = Date.now();
        this.ensureDataDir();
    }

    /**
     * 清理（在 plugin_cleanup 中调用）
     */
    cleanup(): void {
        // 清理所有定时器
        for (const [jobId, timer] of this.timers) {
            clearInterval(timer);
            this.logger.debug(`(｡-ω-) 清理定时器: ${jobId}`);
        }
        this.timers.clear();
        this.saveConfig();
        this._ctx = null;
    }

    /** 获取数据文件完整路径 */
    getDataFilePath(filename: string): string {
        return path.join(this.ctx.dataPath, filename);
    }

    // ==================== 数据目录 ====================

    /**
     * 读取 JSON 数据文件
     * 常用于订阅数据、定时任务配置、推送历史等持久化数据
     * @param filename 数据文件名（如 'subscriptions.json'）
     * @param defaultValue 文件不存在或解析失败时的默认值
     */
    loadDataFile<T>(filename: string, defaultValue: T): T {
        const filePath = this.getDataFilePath(filename);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            this.logger.warn(
                `(；′⌒\`) 读取数据文件 ${filename} 失败:`,
                e,
            );
        }
        return defaultValue;
    }

    /**
     * 保存 JSON 数据文件
     * @param filename 数据文件名
     * @param data 要保存的数据
     * @param space 缩进空格数
     */
    saveDataFile<T>(
        filename: string,
        data: T,
        space: number = 0,
    ): void {
        const filePath = this.getDataFilePath(filename);
        try {
            fs.writeFileSync(
                filePath,
                JSON.stringify(data, null, space),
                'utf-8',
            );
        } catch (e) {
            this.logger.error(
                `(╥﹏╥) 保存数据文件 ${filename} 失败:`,
                e,
            );
        }
    }

    // ==================== 配置读写 ====================

    /**
     * 从磁盘加载配置（迁移完成后调用）
     *
     * 【必须】一切写入 config 的值都经 shared 的 sanitizeConfig 清洗,
     * 保证磁盘上的损坏配置不会传播到运行时。
     */
    loadConfig(): void {
        const configPath = this.ctx.configPath;
        try {
            if (configPath && fs.existsSync(configPath)) {
                const raw = JSON.parse(
                    fs.readFileSync(configPath, 'utf-8'),
                );
                this.config = sanitizeConfig(raw);
                // 加载统计信息 (不在 FIELDS 内, 单独透传)
                if (isObject(raw) && isObject(raw.stats)) {
                    Object.assign(this.stats, raw.stats);
                }
                this.ctx.logger.debug('已加载本地配置');
            } else {
                this.config = getDefaultConfig();
                this.saveConfig();
                this.ctx.logger.debug(
                    '配置文件不存在，已创建默认配置',
                );
            }
        } catch (error) {
            this.ctx.logger.error(
                '加载配置失败，使用默认配置:',
                error,
            );
            this.config = getDefaultConfig();
        }
    }

    /**
     * 保存配置到磁盘（stats 一并落盘, 位于 FIELDS 之外）
     */
    saveConfig(): void {
        if (!this._ctx) return;
        const configPath = this._ctx.configPath;
        try {
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            const data = { ...this.config, stats: this.stats };
            fs.writeFileSync(
                configPath,
                JSON.stringify(data, null, 2),
                'utf-8',
            );
        } catch (error) {
            this._ctx.logger.error('保存配置失败:', error);
        }
    }

    // ==================== 配置管理 ====================

    /**
     * 合并更新配置
     *
     * 【必须】合并结果仍经 sanitizeConfig 清洗后再落盘,
     * 防止调用方传入非法值污染配置。
     */
    updateConfig(partial: Partial<PluginConfig>): void {
        this.config = sanitizeConfig({ ...this.config, ...partial });
        this.saveConfig();
    }

    /**
     * 完整替换配置
     */
    replaceConfig(config: PluginConfig): void {
        this.config = sanitizeConfig(config);
        this.saveConfig();
    }

    /**
     * 增加处理计数
     */
    incrementProcessed(): void {
        const today = new Date().toDateString();
        if (this.stats.lastUpdateDay !== today) {
            this.stats.todayProcessed = 0;
            this.stats.lastUpdateDay = today;
        }
        this.stats.todayProcessed++;
        this.stats.processed++;
    }

    /** 获取运行时长（毫秒） */
    getUptime(): number {
        return Date.now() - this.startTime;
    }

    // ==================== 统计 ====================

    /** 获取格式化的运行时长 */
    getUptimeFormatted(): string {
        const ms = this.getUptime();
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);

        if (d > 0) return `${d}天${h % 24}小时`;
        if (h > 0) return `${h}小时${m % 60}分钟`;
        if (m > 0) return `${m}分钟${s % 60}秒`;
        return `${s}秒`;
    }

    // ==================== 工具方法 ====================

    /**
     * 获取机器人自身 QQ 号（异步, 由入口在迁移后 await）
     *
     * 带超时: 宿主未就绪时不阻塞启动, 超时后 selfId 保持空串。
     */
    async fetchSelfId(): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const res = (await Promise.race([
                this.ctx.actions.call(
                    'get_login_info',
                    {},
                    this.ctx.adapterName,
                    this.ctx.pluginManager.config,
                ) as Promise<{ user_id?: number | string }>,
                new Promise<null>((resolve) => {
                    timer = setTimeout(
                        () => resolve(null),
                        FETCH_SELF_ID_TIMEOUT_MS,
                    );
                }),
            ])) as { user_id?: number | string } | null;
            if (res?.user_id) {
                this.selfId = String(res.user_id);
                this.logger.debug(
                    `(｡·ω·｡) 机器人 QQ: ${this.selfId}`,
                );
            }
        } catch (e) {
            this.logger.warn('(；′⌒`) 获取机器人 QQ 号失败:', e);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /** 确保数据目录存在 */
    private ensureDataDir(): void {
        const dataPath = this.ctx.dataPath;
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }
    }
}

/** 导出全局单例 */
export const pluginState = new PluginState();
