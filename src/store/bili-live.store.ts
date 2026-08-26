// BiliLiveStore.ts
import { BaseStore } from './BaseStore';

// 常量定义（可选，也可以移到子类）
const BILI_LIVE_DATA_FILENAME = 'bilibiliLiveData.json';

export interface BiliLiveMonitor {
    uid: string;
    /** 主播名称 */
    uname: string;
    to: BiliLiveMonitorToInfo[];
}

export interface BiliLiveMonitorToInfo {
    id: string;
    type: 'private' | 'group';
}

export class BiliLiveStore extends BaseStore<BiliLiveMonitor> {
    private static instance: BiliLiveStore | null = null;
    
    private constructor() {
        // 指定存储文件名
        super(BILI_LIVE_DATA_FILENAME);
    }
    
    static getInstance(): BiliLiveStore {
        if (!BiliLiveStore.instance) {
            BiliLiveStore.instance = new BiliLiveStore();
        }
        return BiliLiveStore.instance;
    }
    
    // ========== 暴露原有业务接口 ==========
    
    /** 获取当前内存中的所有监控数据 */
    get(): BiliLiveMonitor[] {
        return this.getAll(); // 复用基类方法
    }
    
    /** 重载数据（重新从文件读取） */
    reload(): void {
        super.reload();
    }
    
    /** 重置所有数据（清空并保存） */
    reset(): void {
        super.reset();
    }
    
    /** 判断某个直播间是否已推送至指定目标 */
    has(uid: string, toInfo: BiliLiveMonitorToInfo): boolean {
        return this.hasItem(
            (item) =>
                item.uid === uid &&
                item.to.some(
                    (t) => t.type === toInfo.type && t.id === toInfo.id
                )
        );
    }
    
    /** 添加一个推送目标（如果已存在则无操作） */
    add(
        uid: string,
        uname: string,
        toInfo: BiliLiveMonitorToInfo,
    ): boolean {
        // 参数校验
        if (typeof uid !== 'string' || uid.trim() === '') {
            throw new Error('uid must be a non-empty string');
        }
        if (!toInfo?.id || !toInfo.type) {
            throw new Error('Invalid toInfo');
        }

        // 查找是否已有该直播间的记录
        const existing = this.findItem((item) => item.uid === uid);
        if (existing) {
            // 如果该目标已存在，直接返回 false
            if (existing.to.some((t) => t.type === toInfo.type && t.id === toInfo.id)) {
                return false;
            }
            // 否则同步最新主播名称, 添加新的 to 并保存
            existing.uname = uname || existing.uname;
            existing.to.push(toInfo);
            this.saveToFile(); // 基类 protected 方法
            return true;
        } else {
            // 新建直播间记录
            this.addItem({ uid, uname, to: [toInfo] }); // 调用基类 addItem
            return true;
        }
    }
    
    /** 移除一个推送目标（如果不存在则无操作） */
    remove(uid: string, toInfo: BiliLiveMonitorToInfo): boolean {
        const liveInfo = this.findItem((item) => item.uid === uid);
        if (!liveInfo) return false;
        
        const originalLength = liveInfo.to.length;
        // 过滤掉匹配的目标
        liveInfo.to = liveInfo.to.filter(
            (t) => !(t.type === toInfo.type && t.id === toInfo.id)
        );
        
        // 如果没有被移除，返回 false
        if (liveInfo.to.length === originalLength) {
            return false;
        }
        
        // 如果该直播间已无任何目标，则整体删除该条记录
        if (liveInfo.to.length === 0) {
            this.removeItem((item) => item.uid === uid);
        } else {
            // 否则只保存改动
            this.saveToFile();
        }
        return true;
    }
}
