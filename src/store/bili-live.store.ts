import { pluginState } from '../core/state';

// 常量定义（改为模块级常量，避免每个实例重复创建）
const BILI_LIVE_DATA_FILENAME = 'bilibiliLiveData.json';

export interface BiliLiveMonitor {
    roomId: number;
    to: BiliLiveMonitorToInfo[];
}

export interface BiliLiveMonitorToInfo {
    id: string;
    type: 'private' | 'group';
}

export class BiliLiveStore {
    private static instance: BiliLiveStore | null = null;
    private biliLiveData: BiliLiveMonitor[] = [];

    static getInstance(): BiliLiveStore {
        if (!BiliLiveStore.instance) {
            BiliLiveStore.instance = new BiliLiveStore();
        }
        return BiliLiveStore.instance;
    }

    /**
     * 获取当前内存中的直播间推送信息（不触发磁盘读取）
     */
    get(): BiliLiveMonitor[] {
        return this.biliLiveData;
    }

    /**
     * 重新从文件加载数据（用于外部文件可能被修改的情况）
     */
    reload(): void {
        this.biliLiveData = this.loadFromFile();
    }

    /**
     * 重置直播间推送信息（清空并保存）
     */
    reset(): void {
        this.biliLiveData = [];
        this.saveToFile();
    }

    /**
     * 检测指定直播间是否已存在指定来源的推送
     * @param roomId 直播间号
     * @param toInfo 目标来源信息
     * @returns 若直播间存在且已包含该来源返回 true，否则 false
     */
    has(roomId: number, toInfo: BiliLiveMonitorToInfo): boolean {
        const liveInfo = this.findLiveInfo(roomId);
        return liveInfo ? this.hasToInfo(liveInfo, toInfo) : false;
    }

    /**
     * 添加指定直播间的推送到指定来源
     */
    add(roomId: number, toInfo: BiliLiveMonitorToInfo): boolean {
        // 参数校验
        if (!Number.isInteger(roomId) || roomId <= 0) {
            throw new Error('roomId must be a positive integer');
        }
        if (!toInfo?.id || !toInfo.type) {
            throw new Error('Invalid toInfo');
        }

        const liveInfo = this.findLiveInfo(roomId);
        if (!liveInfo) {
            // 直播间不存在，直接添加新记录
            this.biliLiveData.push({ roomId, to: [toInfo] });
            this.saveToFile();
            return true;
        }

        // 直播间存在，但来源不存在时添加
        if (!this.hasToInfo(liveInfo, toInfo)) {
            liveInfo.to.push(toInfo);
            this.saveToFile();
            return true;
        }
        // 来源已存在，无操作
        return false;
    }

    /**
     * 移除指定直播间的推送到指定来源
     */
    remove(roomId: number, toInfo: BiliLiveMonitorToInfo): boolean {
        const liveInfoIndex = this.findIndexLiveInfo(roomId);
        if (liveInfoIndex === -1) {
            return false;
        }

        const liveInfo = this.biliLiveData[liveInfoIndex];
        if (!this.hasToInfo(liveInfo, toInfo)) {
            return false;
        }

        // 原地修改数组，避免创建新对象
        liveInfo.to = liveInfo.to.filter(
            (item) =>
                !(item.type === toInfo.type && item.id === toInfo.id),
        );

        // 如果该直播间下没有任何推送来源，可以选择删除整个直播间记录（可选优化）
        if (liveInfo.to.length === 0) {
            this.biliLiveData.splice(liveInfoIndex, 1);
        }

        this.saveToFile();
        return true;
    }

    /**
     * 从文件加载数据（内部使用）
     */
    private loadFromFile(): BiliLiveMonitor[] {
        return pluginState.loadDataFile<BiliLiveMonitor[]>(
            BILI_LIVE_DATA_FILENAME,
            [],
        );
    }

    /**
     * 保存数据到文件（内部使用）
     */
    private saveToFile(): void {
        pluginState.saveDataFile(
            BILI_LIVE_DATA_FILENAME,
            this.biliLiveData,
        );
    }

    /**
     * 根据直播间号获取推送信息（内部使用）
     */
    private findLiveInfo(
        roomId: number,
    ): BiliLiveMonitor | undefined {
        return this.biliLiveData.find(
            (item) => item.roomId === roomId,
        );
    }

    /**
     * 根据直播间号获取索引（内部使用）
     */
    private findIndexLiveInfo(roomId: number): number {
        return this.biliLiveData.findIndex(
            (item) => item.roomId === roomId,
        );
    }

    /**
     * 判断指定直播间中是否已存在目标来源
     */
    private hasToInfo(
        liveInfo: BiliLiveMonitor,
        toInfo: BiliLiveMonitorToInfo,
    ): boolean {
        return liveInfo.to.some(
            (item) =>
                item.type === toInfo.type && item.id === toInfo.id,
        );
    }
}
