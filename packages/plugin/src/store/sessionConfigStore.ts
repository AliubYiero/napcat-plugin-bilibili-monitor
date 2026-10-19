/**
 * 会话配置存储
 *
 * 持久化到 data 目录的 bilibiliSessionConfig.json,
 * 结构: { version: 1, data: Record<'<type>:<id>', SessionConfig> }
 *
 * 键为 `<type>:<id>` (如 `group:123456` / `private:10001`)。
 *
 * 语义要点:
 * - 启用开关默认开启: 只有显式 `enabled === false` 才禁用; 缺记录 = 启用。
 * - `liveMentionAll` 默认关闭: 只有显式 `true` 才生效 (仅群会话)。
 * - 归一化: 只保留有意义的取值 (enabled:false / liveMentionAll:true),
 *   两者皆无的会话整条删除, 文件保持精简。
 */

import type { SessionConfig, SessionType } from 'shared';
import { BaseRecordStore } from './BaseRecordStore';
import { isPlainObject } from './storeFile';

const SESSION_CONFIG_FILENAME = 'bilibiliSessionConfig.json';

/** 会话配置的一条 upsert 输入 */
export interface SessionConfigPatch {
    id: string;
    type: SessionType;
    config: Partial<SessionConfig>;
}

/** 会话类型是否合法 */
function isSessionType(v: unknown): v is SessionType {
    return v === 'private' || v === 'group';
}

/** 组合存储键 */
export function sessionConfigKey(
    id: string,
    type: SessionType,
): string {
    return `${type}:${id}`;
}

export class SessionConfigStore extends BaseRecordStore<SessionConfig> {
    private static instance: SessionConfigStore | null = null;

    private constructor() {
        super(SESSION_CONFIG_FILENAME);
    }

    static getInstance(): SessionConfigStore {
        if (!SessionConfigStore.instance) {
            SessionConfigStore.instance = new SessionConfigStore();
        }
        return SessionConfigStore.instance;
    }

    /** 取指定会话的原始记录 (不存在返回 undefined) */
    find(id: string, type: SessionType): SessionConfig | undefined {
        return this.get(sessionConfigKey(id, type));
    }

    /** 取指定会话的配置 (缺记录时返回默认形态 { id, type }) */
    getConfig(id: string, type: SessionType): SessionConfig {
        return this.find(id, type) ?? { id, type };
    }

    /**
     * 批量 upsert 会话配置并一次落盘
     * 合并后归一化: 无有效取值的记录整条删除。
     */
    upsert(patches: readonly SessionConfigPatch[]): void {
        let changed = false;
        for (const patch of patches) {
            const key = sessionConfigKey(patch.id, patch.type);
            const merged: SessionConfig = {
                ...this.data[key],
                ...patch.config,
                id: patch.id,
                type: patch.type,
            };
            const normalized = normalizeRecord(merged);
            if (normalized) {
                this.data[key] = normalized;
            } else {
                delete this.data[key];
            }
            changed = true;
        }
        if (changed) this.saveToFile();
    }

    protected loadFromFile(): Record<string, SessionConfig> {
        const raw = super.loadFromFile();
        const out: Record<string, SessionConfig> = {};
        for (const [key, value] of Object.entries(raw)) {
            const cleaned = cleanEntry(key, value);
            if (cleaned) out[key] = cleaned;
        }
        return out;
    }
}

/**
 * 清洗磁盘读入的单条记录: 键与值必须自洽, 只保留有效取值
 * @returns 有效则返回归一化记录, 否则 null
 */
function cleanEntry(key: string, raw: unknown): SessionConfig | null {
    if (!isPlainObject(raw)) return null;
    const { id, type } = raw;
    if (typeof id !== 'string' || !isSessionType(type)) return null;
    if (sessionConfigKey(id, type) !== key) return null;
    return normalizeRecord({ id, type, ...raw });
}

/**
 * 归一化记录: 只保留有意义的取值 (enabled:false / liveMentionAll:true);
 * 两者皆无时返回 null (调用方删除该条)。
 */
function normalizeRecord(
    record: SessionConfig,
): SessionConfig | null {
    const out: SessionConfig = {
        id: record.id,
        type: record.type,
    };
    if (record.enabled === false) out.enabled = false;
    if (record.type === 'group' && record.liveMentionAll === true) {
        out.liveMentionAll = true;
    }
    if (
        out.enabled === undefined &&
        out.liveMentionAll === undefined
    ) {
        return null;
    }
    return out;
}
