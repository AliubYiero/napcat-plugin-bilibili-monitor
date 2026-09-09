// biliLiveOnlineLimit.store.ts
import { BaseStore } from './BaseStore';

const BILI_LIVE_ONLINE_LIMIT_FILENAME =
    'bilibiliLiveOnlineLimits.json';

/** 单个会话的自定义同接监听上限记录 */
export interface BiliLiveOnlineLimit {
    id: string;
    type: 'private' | 'group';
    /** 自定义同接监听上限（0 表示禁止新增订阅） */
    max: number;
}

export class BiliLiveOnlineLimitStore extends BaseStore<BiliLiveOnlineLimit> {
    private static instance: BiliLiveOnlineLimitStore | null = null;

    private constructor() {
        super(BILI_LIVE_ONLINE_LIMIT_FILENAME);
    }

    static getInstance(): BiliLiveOnlineLimitStore {
        if (!BiliLiveOnlineLimitStore.instance) {
            BiliLiveOnlineLimitStore.instance =
                new BiliLiveOnlineLimitStore();
        }
        return BiliLiveOnlineLimitStore.instance;
    }

    /** 获取指定会话的自定义上限记录（不存在返回 undefined） */
    find(
        id: string,
        type: 'private' | 'group',
    ): BiliLiveOnlineLimit | undefined {
        return this.findItem(
            (item) => item.id === id && item.type === type,
        );
    }

    /** 获取所有自定义上限记录 */
    list(): BiliLiveOnlineLimit[] {
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
