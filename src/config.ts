/**
 * 插件配置模块
 * 定义默认配置值和 WebUI 配置 Schema
 */

import type {
    NapCatPluginContext,
    PluginConfigSchema,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import type { ChangeType } from './store/bili-live-room.store';
import type { PluginConfig } from './types';

/** 登录状态数据 (由入口在 plugin_init 时传入, 避免 config -> store 循环引用) */
export interface LoginStatusInfo {
    user?: {
        uid: string;
        name: string;
        avatar: string;
    };
    cookieExpired: boolean;
}

/** 构建登录状态展示 HTML (静态块, 刷新配置页/重启插件后更新) */
export function buildLoginStatusHtml(
    status?: LoginStatusInfo,
): string {
    const user = status?.user;

    // 未登录
    if (!user) {
        return `
            <div style="padding: 14px; background: #fff3f5; border: 1px solid #FB7299; border-radius: 12px; margin-bottom: 20px; color: #666;">
                <p style="margin: 0 0 6px 0; font-weight: 600; color: #FB7299;">B 站账号: 未登录</p>
                <p style="margin: 0; font-size: 13px;">动态/视频监听需要登录。请私聊机器人发送 #bili user login 扫码登录</p>
            </div>
        `;
    }

    const expiredBadge = status?.cookieExpired
        ? '<span style="margin-left: 8px; padding: 2px 8px; border-radius: 6px; background: #ff4d4f; color: white; font-size: 12px;">Cookie 已失效</span>'
        : '';
    return `
        <div style="padding: 14px; background: #f0f9ff; border: 1px solid #52a0e8; border-radius: 12px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <img src="${user.avatar}" alt="avatar" style="width: 48px; height: 48px; border-radius: 50%;" referrerpolicy="no-referrer" />
                <div>
                    <p style="margin: 0; font-weight: 600; color: #333;">${user.name}${expiredBadge}</p>
                    <p style="margin: 2px 0 0 0; font-size: 13px; color: #888;">UID: ${user.uid}</p>
                </div>
            </div>
        </div>
    `;
}

/** 有效的推送类型列表 */
export const VALID_PUSH_TYPES: ChangeType[] = [
    'start_stream',
    'end_stream',
    'title_changed',
    'area_changed',
    'offline_title_changed',
    'offline_area_changed',
];

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    commandPrefix: '#bili',
    cooldownSeconds: 0,
    groupConfigs: {},
    // 轮询默认每 60 秒拉取一次直播间状态
    pollIntervalSeconds: 60,
    // 默认推送全部变化类型
    pushTypes: [...VALID_PUSH_TYPES],
    // TODO: 在这里添加你的默认配置值
    adminUser: '',
};

/**
 * 构建 WebUI 配置 Schema
 *
 * 使用 ctx.NapCatConfig 提供的构建器方法生成配置界面：
 *   - boolean(key, label, defaultValue?, description?, reactive?)  → 开关
 *   - text(key, label, defaultValue?, description?, reactive?)     → 文本输入
 *   - number(key, label, defaultValue?, description?, reactive?)   → 数字输入
 *   - select(key, label, options, defaultValue?, description?)     → 下拉单选
 *   - multiSelect(key, label, options, defaultValue?, description?) → 下拉多选
 *   - html(content)     → 自定义 HTML 展示（不保存值）
 *   - plainText(content) → 纯文本说明
 *   - combine(...items)  → 组合多个配置项为 Schema
 */
export function buildConfigSchema(
    ctx: NapCatPluginContext,
    loginStatus?: LoginStatusInfo,
): PluginConfigSchema {
    return ctx.NapCatConfig.combine(
        // 插件信息头部
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: #FB7299; border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600;">Bilibili监听器</h3>
                <p style="margin: 0; font-size: 13px; opacity: 0.85;">监听指定用户动态发布/视频发布/直播状态, 推送到指定群聊</p>
            </div>
        `),
        // 登录状态展示 (静态块, 登录/登出后重启插件或刷新页面时更新)
        ctx.NapCatConfig.html(buildLoginStatusHtml(loginStatus)),
        // 管理员用户列表
        ctx.NapCatConfig.text(
            'adminUser',
            '插件管理员',
            '',
            '可私聊管理插件的超级管理员用户',
        ),
        // 轮询间隔
        ctx.NapCatConfig.number(
            'pollIntervalSeconds',
            '轮询间隔(秒)',
            60,
            '多久拉取一次 B站 直播间状态, 修改后下一轮生效',
        ),
        // 推送类型
        ctx.NapCatConfig.multiSelect(
            'pushTypes',
            '推送类型',
            [
                { value: 'start_stream', label: '开始直播' },
                { value: 'end_stream', label: '结束直播' },
                { value: 'title_changed', label: '修改标题' },
                { value: 'area_changed', label: '修改分区' },
                {
                    value: 'offline_title_changed',
                    label: '未直播修改标题',
                },
                {
                    value: 'offline_area_changed',
                    label: '未直播修改分区',
                },
            ],
            VALID_PUSH_TYPES,
            '选择需要推送的变化类型',
        ),
    );
}
