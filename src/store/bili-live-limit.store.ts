// BiliLiveLimitStore.ts
import { BaseStore } from './BaseStore';

const BILI_LIVE_LIMIT_FILENAME = 'bilibiliLiveLimits.json';

/** 单个会话的自定义监听上限记录 */
export interface BiliLiveLimit {
    id: string;
    type: 'private' | 'group';
    /** 自定义监听上限（0 表示禁止新增订阅） */
    max: number;
}

export class BiliLiveLimitStore extends BaseStore<BiliLiveLimit> {
    private static instance: BiliLiveLimitStore | null = null;

    private constructor() {
        super(BILI_LIVE_LIMIT_FILENAME);
    }

    static getInstance(): BiliLiveLimitStore {
        if (!BiliLiveLimitStore.instance) {
            BiliLiveLimitStore.instance = new BiliLiveLimitStore();
        }
        return BiliLiveLimitStore.instance;
    }

    /** 获取指定会话的自定义上限记录（不存在返回 undefined） */
    find(id: string, type: 'private' | 'group'): BiliLiveLimit | undefined {
        return this.findItem(
            (item) => item.id === id && item.type === type,
        );
    }

    /** 获取所有自定义上限记录 */
    list(): BiliLiveLimit[] {
        return this.getAll();
    }

    /** 设置指定会话的自定义上限（幂等） */
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
