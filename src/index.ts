/**
 * NapCat 插件模板 - 主入口
 *
 * 导出 PluginModule 接口定义的生命周期函数，NapCat 加载插件时会调用这些函数。
 *
 * 生命周期：
 *   plugin_init        → 插件加载时调用（必选）
 *   plugin_onmessage   → 收到事件时调用（需通过 post_type 判断事件类型）
 *   plugin_onevent     → 收到所有 OneBot 事件时调用
 *   plugin_cleanup     → 插件卸载/重载时调用
 *
 * 配置相关：
 *   plugin_config_ui          → 导出配置 Schema，用于 WebUI 自动生成配置面板
 *   plugin_get_config         → 自定义配置读取
 *   plugin_set_config         → 自定义配置保存
 *   plugin_on_config_change   → 配置变更回调
 *
 * @author Your Name
 * @license MIT
 */

import type {
    PluginModule,
    PluginConfigSchema,
    PluginConfigUIController,
    NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { EventType } from 'napcat-types/napcat-onebot/event/index';

import { buildConfigSchema } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message.handler';
import { registerApiRoutes } from './services/api.service';
import { BiliLivePollingService } from './services/live/polling.service';
import { BiliDynamicPollingService } from './services/dyn/polling.service';
import { initDynRuntime } from './services/dyn/runtime.service';
import { BiliCookieStore } from './store/biliCookie.store';
import {
    formatMigrationSummary,
    runDataMigration,
} from './store/migration/run';
import { MigrationValidationError } from './store/migration/plan';
import type { LoginStatusInfo } from './config';
import type { PluginConfig } from './types';

// ==================== 配置 UI Schema ====================

/** NapCat WebUI 读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

/** 记录当前 ctx, 供登录状态变化时重建配置 Schema */
let cachedCtx: NapCatPluginContext | null = null;

/** 用当前登录状态重建配置 Schema */
function rebuildConfigUI(ctx: NapCatPluginContext): void {
    const biliCookieStore = BiliCookieStore.getInstance();
    const loginStatus: LoginStatusInfo = {
        user: biliCookieStore.getUser(),
        cookieExpired: biliCookieStore.isExpired(),
    };
    plugin_config_ui = buildConfigSchema(ctx, loginStatus);
}

// ==================== 生命周期函数 ====================

/**
 * 插件初始化（必选）
 * 加载配置、注册 WebUI 路由和页面
 */
export const plugin_init: PluginModule['plugin_init'] = async (
    ctx,
) => {
    try {
        // 1. 初始化全局状态（加载配置）
        pluginState.init(ctx);

        ctx.logger.info('插件初始化中...');

        // 2. 旧数据迁移: 必须早于任何 store 实例化 (下面的 rebuildConfigUI
        //    就会 new BiliCookieStore)。失败时抛错阻止插件启动, 旧文件保持原样。
        const migration = runDataMigration();
        if (migration.status === 'migrated') {
            ctx.logger.info(formatMigrationSummary(migration.plan));
        } else {
            ctx.logger.debug('数据文件已是最新格式, 跳过迁移');
        }
        for (const warning of migration.warnings) {
            ctx.logger.warn(warning);
        }

        // 3. 清理动态运行时的孤立 uid (需动态监听与运行时两个 store 已就绪)
        initDynRuntime();

        // 4. 生成配置 Schema（用于 NapCat WebUI 配置面板, 含登录状态静态块）
        cachedCtx = ctx;
        rebuildConfigUI(ctx);

        // 5. 注册 WebUI 页面和静态资源
        // registerWebUI(ctx);

        // 6. 注册 API 路由
        registerApiRoutes(ctx);

        // 7. 登录状态变化时重建配置 Schema (刷新 WebUI 登录块)
        BiliCookieStore.getInstance().onLoginStateChange(() => {
            if (cachedCtx) rebuildConfigUI(cachedCtx);
        });

        // 8. 启动轮询服务（监听直播间状态变化并推送）
        BiliLivePollingService.getInstance().start();
        // 9. 启动动态轮询服务（监听主播动态发布并推送）
        BiliDynamicPollingService.getInstance().start();

        ctx.logger.info('插件初始化完成');
    } catch (error) {
        // 迁移失败等初始化异常必须向上抛: 吞掉错误会让插件带着
        // 不完整/不可信的数据继续运行
        ctx.logger.error('插件初始化失败, 插件不会启动:', error);
        if (error instanceof MigrationValidationError) {
            for (const issue of error.issues) {
                ctx.logger.error(
                    `旧数据类型错误: ${issue.file} ${issue.path}.${issue.field} 期望 string, 实际 ${issue.actual}`,
                );
            }
        }
        // 抛给 NapCat: 旧文件保持原样, 新文件不写, 插件不启动
        throw error;
    }
};

/**
 * 消息/事件处理（可选）
 * 收到事件时调用，需通过 post_type 判断是否为消息事件
 */
export const plugin_onmessage: PluginModule['plugin_onmessage'] =
    async (ctx, event) => {
        // 仅处理消息事件
        if (event.post_type !== EventType.MESSAGE) return;
        // 检查插件是否启用
        if (!pluginState.config.enabled) return;
        // 委托给消息处理器
        await handleMessage(ctx, event);
    };

/**
 * 事件处理（可选）
 * 处理所有 OneBot 事件（通知、请求等）
 */
export const plugin_onevent: PluginModule['plugin_onevent'] = async (
    ctx,
    event,
) => {
    // TODO: 在这里处理通知、请求等非消息事件
    // 示例：
    // if (event.post_type === EventType.NOTICE) { ... }
    // if (event.post_type === EventType.REQUEST) { ... }
};

/**
 * 插件卸载/重载（可选）
 * 必须清理定时器、关闭连接等资源
 */
export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (
    ctx,
) => {
    try {
        // 先停止轮询，再清理全局状态
        BiliLivePollingService.getInstance().stop();
        BiliDynamicPollingService.getInstance().stop();
        // TODO: 在这里清理你的资源（定时器、WebSocket 连接等）
        pluginState.cleanup();
        ctx.logger.info('插件已卸载');
    } catch (e) {
        ctx.logger.warn('插件卸载时出错:', e);
    }
};

// ==================== 配置管理钩子 ====================

/**
 * 配置界面控制器
 * 每次配置界面打开时调用: 用最新登录状态重建 Schema, 保证登录块不滞后
 */
export const plugin_config_controller: PluginModule['plugin_config_controller'] =
    (ctx) => {
        cachedCtx = ctx;
        rebuildConfigUI(ctx);
    };

/** 获取当前配置 */
export const plugin_get_config: PluginModule['plugin_get_config'] =
    async (ctx) => {
        return pluginState.config;
    };

/** 设置配置（完整替换，由 NapCat WebUI 调用） */
export const plugin_set_config: PluginModule['plugin_set_config'] =
    async (ctx, config) => {
        pluginState.replaceConfig(config as PluginConfig);
        ctx.logger.info('配置已通过 WebUI 更新');
    };

/**
 * 配置变更回调
 * 当 WebUI 中修改单个配置项时触发（需配置项标记 reactive: true）
 */
export const plugin_on_config_change: PluginModule['plugin_on_config_change'] =
    async (ctx, ui, key, value, currentConfig) => {
        try {
            pluginState.updateConfig({ [key]: value });
            ctx.logger.debug(`配置项 ${key} 已更新`);
        } catch (err) {
            ctx.logger.error(`更新配置项 ${key} 失败:`, err);
        }
    };

// ==================== 内部函数 ====================

/**
 * 注册 WebUI 页面和静态资源
 */
function registerWebUI(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // 托管前端静态资源（构建产物在 webui/ 目录下）
    // 访问路径: /plugin/<plugin-id>/files/static/
    router.static('/static', 'webui');

    // 注册仪表盘页面（显示在 NapCat WebUI 侧边栏）
    // 访问路径: /plugin/<plugin-id>/page/dashboard
    router.page({
        path: 'dashboard',
        title: '插件仪表盘',
        htmlFile: 'webui/index.html',
        description: '插件管理控制台',
    });

    ctx.logger.debug('WebUI 路由注册完成');
}
