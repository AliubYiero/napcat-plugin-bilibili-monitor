/**
 * 会话配置服务
 *
 * 会话级配置的唯一读写入口 (业务代码不得直接触碰 store 或散落判定 enabled)。
 * 默认开启: 仅显式 `enabled === false` 才禁用 (缺记录视为启用),
 * 使旧版本升级时不会静默停掉监听。
 *
 * 范式: docs/store-pattern.md (延迟实例化)、docs/config-pattern.md 的"单一查询入口"
 * 【必须】store 实例在方法内惰性获取, 不在模块加载期触碰 (此时 ctx / dataPath 尚不可用)。
 */

import { SessionConfigStore } from '../store/sessionConfigStore';
import type { SessionConfig, SessionType } from '../types';

class SessionConfigService {
    private _store: SessionConfigStore | null = null;

    /** 惰性获取存储实例 (避免模块加载期触达未初始化的全局状态) */
    private get store(): SessionConfigStore {
        if (!this._store) {
            this._store = SessionConfigStore.getInstance();
        }
        return this._store;
    }

    /** 某会话是否启用 (单一查询入口; 默认开启, 仅显式 enabled === false 才禁用) */
    isSessionEnabled(id: string, type: SessionType): boolean {
        return this.store.find(id, type)?.enabled !== false;
    }

    /** 群是否启用 (便捷入口, 等价于 isSessionEnabled(id, 'group')) */
    isGroupEnabled(id: string): boolean {
        return this.isSessionEnabled(id, 'group');
    }

    /** 群是否开启开播 @全体成员提醒 (默认关闭, 仅显式 true 才生效) */
    isLiveMentionAllEnabled(id: string): boolean {
        return this.store.find(id, 'group')?.liveMentionAll === true;
    }

    /** 取某会话的完整配置 (缺记录时返回默认形态) */
    getConfig(id: string, type: SessionType): SessionConfig {
        return this.store.getConfig(id, type);
    }

    /** 全部会话记录 (供 WebUI/API 列举) */
    getAll(): Record<string, SessionConfig> {
        return this.store.getAll();
    }

    /** 设置某会话的启用状态 (upsert, 显式写入 enabled, 保留其它业务字段) */
    setSessionEnabled(
        id: string,
        type: SessionType,
        enabled: boolean,
    ): void {
        this.store.upsert([{ id, type, config: { enabled } }]);
    }

    /** 批量设置同一类型下多个会话的启用状态, 一次落盘 */
    setSessionsEnabled(
        ids: string[],
        type: SessionType,
        enabled: boolean,
    ): void {
        this.store.upsert(
            ids.map((id) => ({ id, type, config: { enabled } })),
        );
    }

    /** 设置某群的开播 @全体成员提醒 (仅群会话) */
    setLiveMentionAll(id: string, enabled: boolean): void {
        this.store.upsert([
            {
                id,
                type: 'group',
                config: { liveMentionAll: enabled },
            },
        ]);
    }
}

export const sessionConfigService = new SessionConfigService();
