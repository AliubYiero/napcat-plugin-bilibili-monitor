/**
 * 单 uid 动态「选新」纯函数测试
 *
 * 只测 selectNewDynamics: 由缓存快照 + 一次拉取结果选出应推送的动态。
 * 覆盖普通动态、置顶动态的判定, 以及首绑语义 —— 这些正是常态轮询与
 * 开播前预取共用的那部分逻辑。
 */
import { describe, expect, it } from 'vitest';
import { selectNewDynamics } from '../../../src/services/dyn/fetchUidDynamicService';
import { makeDynamic } from '../../helpers/dynamic';

/** 置顶标签文本 (领域规则: module_tag.text === '置顶') */
const PINNED = '置顶';

/** 取 id_str 列表, 便于断言顺序 */
function ids(items: { id_str: string }[]): string[] {
    return items.map((it) => it.id_str);
}

describe('selectNewDynamics', () => {
    it('首绑不产出任何动态', () => {
        const items = [
            makeDynamic({ id: 'a', pubTs: 100 }),
            makeDynamic({ id: 'b', pubTs: 200 }),
        ];
        expect(selectNewDynamics(items, [], true)).toEqual([]);
    });

    it('普通动态: 不在缓存中的视为新, 且按 pub_ts 从旧到新', () => {
        const items = [
            makeDynamic({ id: 'new2', pubTs: 300 }),
            makeDynamic({ id: 'new1', pubTs: 200 }),
        ];
        expect(ids(selectNewDynamics(items, ['old'], false))).toEqual(
            ['new1', 'new2'],
        );
    });

    it('已缓存的普通动态被排除', () => {
        const items = [
            makeDynamic({ id: 'a', pubTs: 200 }),
            makeDynamic({ id: 'b', pubTs: 100 }),
        ];
        expect(ids(selectNewDynamics(items, ['a'], false))).toEqual([
            'b',
        ]);
    });

    it('置顶晚于去置顶后第二条才算新, 并混入结果', () => {
        const items = [
            makeDynamic({ id: 'pin', pubTs: 500, tag: PINNED }),
            makeDynamic({ id: 'b', pubTs: 400 }),
            makeDynamic({ id: 'a', pubTs: 300 }),
        ];
        expect(ids(selectNewDynamics(items, ['a'], false))).toEqual([
            'b',
            'pin',
        ]);
    });

    it('常驻置顶 (不晚于第二条) 不推送', () => {
        const items = [
            makeDynamic({ id: 'pin', pubTs: 100, tag: PINNED }),
            makeDynamic({ id: 'b', pubTs: 400 }),
            makeDynamic({ id: 'a', pubTs: 300 }),
        ];
        expect(ids(selectNewDynamics(items, ['a'], false))).toEqual([
            'b',
        ]);
    });

    it('已缓存的置顶不重复推送', () => {
        const items = [
            makeDynamic({ id: 'pin', pubTs: 500, tag: PINNED }),
            makeDynamic({ id: 'b', pubTs: 400 }),
            makeDynamic({ id: 'a', pubTs: 300 }),
        ];
        expect(
            ids(selectNewDynamics(items, ['a', 'pin'], false)),
        ).toEqual(['b']);
    });
});
