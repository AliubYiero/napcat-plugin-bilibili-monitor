/**
 * BiliLiveRoomStore 直播间运行时快照
 *
 * 本次重构只改其持久化边界 (version 包裹 + uid 归一化为字符串),
 * 变化检测与监听器行为必须与重构前一致 —— 这里覆盖七类变化事件,
 * 作为行为不变性的回归网。见 ADR 0004 (离线变化检测)。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import {
    BiliLiveRoomStore,
    type BiliLiveRoomInfo,
    type ChangeEvent,
} from '../../src/store/biliLiveRoom.store';
import {
    fakeLogger,
    readFile,
    resetFakeState,
    seedFile,
} from '../helpers/pluginState';

const FILE = 'bilibiliLiveRoomData.json';
const store = BiliLiveRoomStore.getInstance();

/** 造一个完整直播间信息, 覆盖项显式传参, 不做深度合并 */
function makeRoom(
    overrides: Partial<BiliLiveRoomInfo> = {},
): BiliLiveRoomInfo {
    return {
        room_id: 9527,
        uid: '1',
        live_status: 'streaming',
        title: '标题',
        parent_area_name: '虚拟主播',
        area_name: '虚拟主播',
        live_time: 1000,
        uname: '主播A',
        avatar: '',
        cover_from_user: '',
        keyframe: '',
        liveContents: [],
        accumulatedAudience: 0,
        onlineSnapshots: [],
        ...overrides,
    };
}

/** 记录一次事件流用于断言 */
function collectEvents(): ChangeEvent[] {
    const events: ChangeEvent[] = [];
    store.on((event) => events.push(event));
    return events;
}

beforeEach(() => {
    resetFakeState();
    store.reset();
});

describe('持久化边界', () => {
    it('新增落盘为 version 包裹', () => {
        store.updateOrAdd(makeRoom({ uid: '1' }));
        const raw = readFile(FILE) as { version: number };
        expect(raw.version).toBe(1);
        expect(store.get('1')).toEqual(makeRoom({ uid: '1' }));
    });

    it('旧数据里的数字 uid 归一化为字符串', () => {
        seedFile(FILE, {
            123: {
                room_id: 9527,
                uid: 123,
                live_status: 'offline',
                title: '旧标题',
            },
        });
        store.reload();
        expect(store.get('123')?.uid).toBe('123');
        expect(store.get('123')?.title).toBe('旧标题');
    });

    it('uid 非数字也非字符串的记录被丢弃并告警', () => {
        seedFile(FILE, {
            version: 1,
            data: {
                1: { room_id: 1, uid: { nested: true } },
                2: { room_id: 2, uid: '2', title: '正常' },
            },
        });
        store.reload();
        expect(store.getAll()).toEqual({
            2: expect.objectContaining({ uid: '2' }),
        });
        expect(fakeLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('顶层结构异常时回退为空表', () => {
        seedFile(FILE, { version: 1, data: 'oops' });
        store.reload();
        expect(store.getAll()).toEqual({});
        expect(fakeLogger.error).toHaveBeenCalledTimes(1);
    });
});

describe('detectChanges 七类变化事件', () => {
    beforeEach(() => {
        store.updateOrAdd(makeRoom());
    });

    it('start_stream: 离线转直播', () => {
        store.updateOrAdd(makeRoom({ live_status: 'offline' }));
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ live_status: 'streaming' }));
        expect(events.map((e) => e.type)).toEqual(['start_stream']);
    });

    it('end_stream: 直播转离线', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ live_status: 'offline' }));
        expect(events.map((e) => e.type)).toEqual(['end_stream']);
    });

    it('restart_stream: 直播中 live_time 在窗口内变化', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ live_time: 1200 }));
        expect(events.map((e) => e.type)).toEqual(['restart_stream']);
        expect(events[0].newValue).toBe(1200);
    });

    it('超过窗口的 live_time 变化不发事件', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ live_time: 1000 + 600 }));
        expect(events).toEqual([]);
    });

    it('title_changed: 直播中标题变化', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ title: '新标题' }));
        expect(events.map((e) => e.type)).toEqual(['title_changed']);
    });

    it('area_changed: 直播中分区变化', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ area_name: '单机游戏' }));
        expect(events.map((e) => e.type)).toEqual(['area_changed']);
    });

    it('offline_title_changed: 未直播时标题变化', () => {
        store.updateOrAdd(makeRoom({ live_status: 'offline' }));
        const events = collectEvents();
        store.updateOrAdd(
            makeRoom({ live_status: 'offline', title: '新标题' }),
        );
        expect(events.map((e) => e.type)).toEqual([
            'offline_title_changed',
        ]);
    });

    it('offline_area_changed: 未直播时分区变化', () => {
        store.updateOrAdd(makeRoom({ live_status: 'offline' }));
        const events = collectEvents();
        store.updateOrAdd(
            makeRoom({ live_status: 'offline', area_name: '单机游戏' }),
        );
        expect(events.map((e) => e.type)).toEqual([
            'offline_area_changed',
        ]);
    });

    it('状态变化吞掉同次的标题与分区差异', () => {
        const events = collectEvents();
        store.updateOrAdd(
            makeRoom({
                live_status: 'offline',
                title: '新标题',
                area_name: '单机游戏',
            }),
        );
        expect(events.map((e) => e.type)).toEqual(['end_stream']);
    });

    it('无变化时不触发事件', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom());
        expect(events).toEqual([]);
    });

    it('未注册过的新直播间不触发事件', () => {
        const events = collectEvents();
        store.updateOrAdd(makeRoom({ uid: '2' }));
        expect(events).toEqual([]);
    });
});

describe('运行时字段', () => {
    it('接口覆盖时保留已采集的运行时数据', () => {
        store.updateOrAdd(makeRoom());
        store.appendOnlineSnapshot('1', [10, 100]);
        store.pushLiveContent('1', {
            title: '标题',
            parent_area_name: '虚拟主播',
            area_name: '虚拟主播',
            startTime: 1000,
            endTime: 1100,
        });

        store.updateOrAdd(makeRoom({ title: '新标题' }));

        const info = store.get('1');
        expect(info?.onlineSnapshots).toEqual([[10, 100]]);
        expect(info?.liveContents).toHaveLength(1);
    });

    it('clearRuntimeData 清空快照与内容并重置累计观众', () => {
        store.updateOrAdd(makeRoom());
        store.appendOnlineSnapshot('1', [10, 100]);
        store.updateAccumulatedAudience('1', 500);
        store.clearRuntimeData('1');

        const info = store.get('1');
        expect(info?.onlineSnapshots).toEqual([]);
        expect(info?.liveContents).toEqual([]);
        expect(info?.accumulatedAudience).toBe(0);
    });

    it('累计观众按轮次覆盖更新', () => {
        store.updateOrAdd(makeRoom());
        store.updateAccumulatedAudience('1', 500);
        store.updateAccumulatedAudience('1', 800);
        expect(store.get('1')?.accumulatedAudience).toBe(800);
    });
});
