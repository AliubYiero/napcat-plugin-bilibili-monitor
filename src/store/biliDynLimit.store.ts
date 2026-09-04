/**
 * B 站动态监听上限存储
 * 持久化到 data 目录的 bilibiliDynLimits.json, 结构: BiliDynLimit[]
 */

import { BaseStore } from './BaseStore';

const BILI_DYN_LIMIT_FILENAME = 'bilibiliDynLimits.json';

/** 单个会话的自定义动态监听上限记录 */
export interface BiliDynLimit {
    id: string;
    type: 'private' | 'group';
    /** 自定义动态监听上限 (0 表示禁止新增订阅) */
    max: number;
}

export class BiliDynLimitStore extends BaseStore<BiliDynLimit> {
    private static instance: BiliDynLimitStore | null = null;

    private constructor() {
        super(BILI_DYN_LIMIT_FILENAME);
    }

    static getInstance(): BiliDynLimitStore {
        if (!BiliDynLimitStore.instance) {
            BiliDynLimitStore.instance = new BiliDynLimitStore();
        }
        return BiliDynLimitStore.instance;
    }

    /** 获取指定会话的自定义上限记录 (不存在返回 undefined) */
    find(
        id: string,
        type: 'private' | 'group',
    ): BiliDynLimit | undefined {
        return this.findItem(
            (item) => item.id === id && item.type === type,
        );
    }

    /** 获取所有自定义上限记录 */
    list(): BiliDynLimit[] {
        return this.getAll();
    }

    /** 设置指定会话的自定义上限 (幂等) */
    set(id: string, type: 'private' | 'group', max: number): void {
        const existing = this.find(id, type);
        if (existing) {
            existing.max = max;
            this.saveToFile();
        } else {
            this.addItem({ id, type, max });
        }
    }
}
