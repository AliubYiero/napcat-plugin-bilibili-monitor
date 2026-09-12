/**
 * 动态解析测试
 *
 * 解析是纯函数: 原始 BiliDynamic 进, 推送结构出。这里断言的是群里
 * 的人最终能看到什么——标题、正文、图片列表、跳转链接、表情映射,
 * 不检查解析内部用了哪个辅助函数。
 *
 * 转发动态的"分隔线拼接"在解析层只到 separator + origCard 为止,
 * 真正的行拼接属消息段组装 (见 test/services/dyn/push.test.ts)。
 *
 * 领域规则来源: CONTEXT.md 的「转发语」「原动态卡片」「动态配图」。
 */
import { describe, expect, it } from 'vitest';
import { parseBiliDynamic } from '../../../src/services/dyn/parser.service';
import {
    archiveMajor,
    desc,
    descWithoutNodes,
    emojiNode,
    liveRcmdMajor,
    makeDynamic,
    opusMajor,
    picNode,
    textNode,
} from '../../helpers/dynamic';

/** 2024-01-01T00:00:00Z, 东八区即 2024/01/01 08:00:00 */
const PUB_TS = 1704067200;
const PUB_TIME = '[2024/01/01 08:00:00]';

/** 转发分隔线 (领域规则: 转发语与原动态卡片以分隔线拼接) */
const SEPARATOR = '----------';

describe('parseBiliDynamic 转发动态', () => {
    const orig = makeDynamic({
        id: 'orig-1',
        type: 'DYNAMIC_TYPE_DRAW',
        author: '原作者',
        pubTs: PUB_TS,
        major: opusMajor({ summary: desc('原动态正文') }),
    });

    const forward = makeDynamic({
        id: 'fwd-1',
        type: 'DYNAMIC_TYPE_FORWARD',
        author: '转发者',
        pubTs: PUB_TS,
        desc: desc('转发语'),
        orig,
    });

    it('识别为转发并带上分隔线', () => {
        const r = parseBiliDynamic(forward);
        expect(r.kind).toBe('forward');
        expect(r.separator).toBe(SEPARATOR);
    });

    it('头部行说明这是转发, 并带作者与发布时间', () => {
        expect(parseBiliDynamic(forward).headline).toBe(
            `${PUB_TIME} 「转发者」 转发了动态`,
        );
    });

    it('转发语与原动态卡片各成一份, 原卡片带原作者', () => {
        const r = parseBiliDynamic(forward);
        expect(r.texts).toEqual(['转发语']);
        expect(r.origCard?.texts).toEqual(['原动态正文']);
        expect(r.origCard?.headline).toContain('「原作者」');
    });

    it('转发动态的跳转链接由动态 id 拼出', () => {
        expect(parseBiliDynamic(forward).jumpUrl).toBe(
            'https://t.bilibili.com/fwd-1',
        );
    });

    it('表情与配图各归其主, 不串到对方卡片', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_FORWARD',
                desc: desc('转发语[笑]', [
                    textNode('转发语'),
                    emojiNode('[笑]', 'https://fwd-emoji'),
                    picNode('查看图片(1)', ['https://fwd-pic']),
                ]),
                orig: makeDynamic({
                    type: 'DYNAMIC_TYPE_DRAW',
                    desc: desc('原文[哭]', [
                        emojiNode('[哭]', 'https://orig-emoji'),
                    ]),
                }),
            }),
        );
        expect(r.emojiMap).toEqual({ '[笑]': 'https://fwd-emoji' });
        expect(r.images).toEqual(['https://fwd-pic']);
        expect(r.origCard?.emojiMap).toEqual({
            '[哭]': 'https://orig-emoji',
        });
    });

    it('原动态为视频时原卡片呈现视频模板', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_FORWARD',
                desc: desc('转发语'),
                orig: makeDynamic({
                    type: 'DYNAMIC_TYPE_AV',
                    author: '视频作者',
                    pubTs: PUB_TS,
                    major: archiveMajor({
                        bvid: 'BV1orig',
                        title: '原视频',
                        cover: 'https://orig-cover',
                    }),
                }),
            }),
        );
        expect(r.origCard?.texts).toEqual([
            '标题: 原视频',
            '链接: https://www.bilibili.com/video/BV1orig',
        ]);
        expect(r.origCard?.images).toEqual(['https://orig-cover']);
    });

    it('转发类型但缺原动态时降级兜底, 不抛异常', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_FORWARD',
                desc: desc('转发语'),
            }),
        );
        expect(r.kind).toBe('fallback');
        expect(r.separator).toBeNull();
        expect(r.origCard).toBeNull();
    });
});

describe('parseBiliDynamic 图文与纯文本动态', () => {
    it('无标题归为文本动态, 有标题归为图文动态', () => {
        const noTitle = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({ summary: desc('正文') }),
            }),
        );
        expect(noTitle.kind).toBe('text');
        expect(noTitle.texts).toEqual(['正文']);

        const withTitle = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    title: '标题',
                    summary: desc('正文'),
                }),
            }),
        );
        expect(withTitle.kind).toBe('opus');
        expect(withTitle.texts).toEqual(['标题', '正文']);
    });

    it('动态配图合并 OPUS 图片与富文本图片节点', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    summary: desc('看图', [
                        textNode('看图'),
                        picNode('查看图片(2)', ['https://rt-1']),
                    ]),
                    pics: ['https://opus-1'],
                }),
            }),
        );
        expect(r.images).toEqual(['https://opus-1', 'https://rt-1']);
    });

    it('配图占位文本从正文剔除, 且占位里的数字不参与逻辑', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    summary: desc('看这个查看图片(6)很好', [
                        textNode('看这个'),
                        picNode('查看图片(6)', ['https://img-1']),
                        textNode('很好'),
                    ]),
                }),
            }),
        );
        expect(r.texts).toEqual(['看这个很好']);
        expect(r.images).toEqual(['https://img-1']);
    });

    it('正文里保留表情文本, 另给出表情映射', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    summary: desc('今天[tv_微笑]了', [
                        textNode('今天'),
                        emojiNode('[tv_微笑]', 'https://emoji.gif'),
                        textNode('了'),
                    ]),
                }),
            }),
        );
        expect(r.texts).toEqual(['今天[tv_微笑]了']);
        expect(r.emojiMap).toEqual({
            '[tv_微笑]': 'https://emoji.gif',
        });
    });

    it('清理正文中的零宽字符', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                desc: desc('前​中﻿后'),
            }),
        );
        expect(r.texts).toEqual(['前中后']);
    });

    it('纯图动态的正文不含占位文本', () => {
        // 图集动态常见形态: 正文整体只是一个图片节点
        const r = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    summary: desc('查看图片(1)', [
                        picNode('查看图片(1)', ['https://img-1']),
                    ]),
                }),
            }),
        );
        expect(r.texts).toEqual([]);
        expect(r.images).toEqual(['https://img-1']);
    });

    it('节点未能解释的正文整段保留, 不被重建吞掉', () => {
        // 节点拼不出原文时不得信任重建结果, 否则正文会整段消失
        const r = parseBiliDynamic(
            makeDynamic({
                desc: desc('很长的正文', [
                    picNode('', ['https://img-1']),
                ]),
            }),
        );
        expect(r.texts).toEqual(['很长的正文']);
    });

    it('富文本节点缺失时无法剔除占位文本, 退回原文', () => {
        // 已记录的降级前提: 重建依赖节点覆盖全文
        const r = parseBiliDynamic(
            makeDynamic({
                desc: descWithoutNodes('看这个查看图片(6)很好'),
            }),
        );
        expect(r.texts).toEqual(['看这个查看图片(6)很好']);
    });

    it('跳转链接按 opus、basic、动态 id 顺序回落', () => {
        expect(
            parseBiliDynamic(
                makeDynamic({
                    id: 'dyn-1',
                    major: opusMajor({
                        summary: desc('正文'),
                        jumpUrl: 'https://www.bilibili.com/opus/1',
                    }),
                    basicJumpUrl: 'https://www.bilibili.com/basic',
                }),
            ).jumpUrl,
        ).toBe('https://www.bilibili.com/opus/1');

        expect(
            parseBiliDynamic(
                makeDynamic({
                    id: 'dyn-2',
                    major: opusMajor({ summary: desc('正文') }),
                    basicJumpUrl: 'https://www.bilibili.com/basic',
                }),
            ).jumpUrl,
        ).toBe('https://www.bilibili.com/basic');

        expect(
            parseBiliDynamic(
                makeDynamic({
                    id: 'dyn-3',
                    major: opusMajor({ summary: desc('正文') }),
                }),
            ).jumpUrl,
        ).toBe('https://t.bilibili.com/dyn-3');
    });

    it('相对协议链接补全为 https', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    summary: desc('正文'),
                    jumpUrl: '//www.bilibili.com/opus/2',
                }),
            }),
        );
        expect(r.jumpUrl).toBe('https://www.bilibili.com/opus/2');
    });

    it('正文整体为空时从 desc 回落, 且文本与节点同源', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                desc: desc('来自 desc 的正文', [
                    textNode('来自 desc 的正文'),
                ]),
                major: opusMajor({ summary: descWithoutNodes('') }),
            }),
        );
        expect(r.texts).toEqual(['来自 desc 的正文']);
    });
});

describe('parseBiliDynamic 投稿视频', () => {
    const video = makeDynamic({
        id: 'av-1',
        type: 'DYNAMIC_TYPE_AV',
        author: 'UP主',
        pubTs: PUB_TS,
        major: archiveMajor({
            bvid: 'BV1test',
            title: '视频标题',
            desc: '视频简介',
            durationText: '03:21',
            cover: 'https://cover.jpg',
        }),
    });

    it('识别为视频并说明投稿', () => {
        const r = parseBiliDynamic(video);
        expect(r.kind).toBe('video');
        expect(r.headline).toBe(
            `${PUB_TIME} 「UP主」 投稿了视频`,
        );
    });

    it('正文依次给出标题、简介与时长', () => {
        expect(parseBiliDynamic(video).texts).toEqual([
            '标题: 视频标题',
            '简介: 视频简介',
            '时长: 03:21',
        ]);
    });

    it('封面排在动态配图之前', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_AV',
                major: archiveMajor({
                    bvid: 'BV1test',
                    cover: 'https://cover.jpg',
                }),
                desc: desc('动态文案', [
                    picNode('查看图片(1)', ['https://rt-pic']),
                ]),
            }),
        );
        expect(r.images).toEqual([
            'https://cover.jpg',
            'https://rt-pic',
        ]);
    });

    it('有投稿文案时把它作为动态行放在最前', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_AV',
                desc: desc('UP 的动态文案'),
                major: archiveMajor({
                    bvid: 'BV1test',
                    title: '视频标题',
                }),
            }),
        );
        expect(r.texts).toEqual([
            '动态: UP 的动态文案',
            '标题: 视频标题',
        ]);
    });

    it('跳转链接指向视频页', () => {
        expect(parseBiliDynamic(video).jumpUrl).toBe(
            'https://www.bilibili.com/video/BV1test',
        );
    });

    it('按 major 类型路由, 不依赖动态类型字符串', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_UNKNOWN_TO_US',
                major: archiveMajor({
                    bvid: 'BV1byMajor',
                    title: '视频标题',
                }),
            }),
        );
        expect(r.kind).toBe('video');
    });
});

describe('parseBiliDynamic 投稿文章', () => {
    it('标题与正文取自 opus, 跳转链接用 opus 的', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                id: 'cv-1',
                type: 'DYNAMIC_TYPE_ARTICLE',
                major: opusMajor({
                    title: '文章标题',
                    summary: desc('文章正文'),
                    jumpUrl: 'https://www.bilibili.com/read/cv1',
                }),
            }),
        );
        expect(r.kind).toBe('article');
        expect(r.texts).toEqual(['文章标题', '文章正文']);
        expect(r.jumpUrl).toBe(
            'https://www.bilibili.com/read/cv1',
        );
    });
});

describe('parseBiliDynamic 直播推荐', () => {
    const live = makeDynamic({
        id: 'live-1',
        type: 'DYNAMIC_TYPE_LIVE_RCMD',
        author: '主播',
        pubTs: PUB_TS,
        major: liveRcmdMajor({
            roomId: 12345,
            title: '直播标题',
            parentAreaName: '娱乐',
            areaName: '视频唱见',
            cover: 'https://live-cover.jpg',
        }),
    });

    it('识别为直播并在头部行说明', () => {
        const r = parseBiliDynamic(live);
        expect(r.kind).toBe('live');
        expect(r.headline).toBe(
            `${PUB_TIME} 「主播」 开始了直播 「直播标题」`,
        );
    });

    it('正文给出标题、分区与直播间链接', () => {
        expect(parseBiliDynamic(live).texts).toEqual([
            '标题: 直播标题',
            '分区: 娱乐 - 视频唱见',
            '链接: https://live.bilibili.com/12345',
        ]);
    });

    it('配图为直播封面, 跳转链接指向直播间', () => {
        const r = parseBiliDynamic(live);
        expect(r.images).toEqual(['https://live-cover.jpg']);
        expect(r.jumpUrl).toBe('https://live.bilibili.com/12345');
    });

    it('live_rcmd 不是合法 JSON 时降级, 不抛异常', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_LIVE_RCMD',
                author: '主播',
                pubTs: PUB_TS,
                major: liveRcmdMajor({ rawOverride: '{坏数据' }),
            }),
        );
        expect(r.kind).toBe('live');
        expect(r.headline).toBe(`${PUB_TIME} 「主播」 开始了直播`);
        expect(r.texts).toEqual([]);
        expect(r.jumpUrl).toBe('');
    });

    it('按 major 类型路由, 不依赖动态类型字符串', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_UNKNOWN_TO_US',
                major: liveRcmdMajor({ roomId: 999 }),
            }),
        );
        expect(r.kind).toBe('live');
        expect(r.jumpUrl).toBe('https://live.bilibili.com/999');
    });
});

describe('parseBiliDynamic 兜底与健壮性', () => {
    it('未知类型归为兜底, 用 desc 正文', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                id: 'odd-1',
                type: 'DYNAMIC_TYPE_SOMETHING_NEW',
                desc: desc('未知类型正文'),
            }),
        );
        expect(r.kind).toBe('fallback');
        expect(r.texts).toEqual(['未知类型正文']);
        expect(r.jumpUrl).toBe('https://t.bilibili.com/odd-1');
    });

    it('正文与节点皆为空的动态不产出空行', () => {
        const r = parseBiliDynamic(makeDynamic({ desc: desc('') }));
        expect(r.texts).toEqual([]);
        expect(r.images).toEqual([]);
        expect(r.emojiMap).toEqual({});
    });

    it('空 URL 的配图不进图片列表', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                major: opusMajor({
                    summary: desc('正文'),
                    pics: ['', 'https://ok.jpg'],
                }),
            }),
        );
        expect(r.images).toEqual(['https://ok.jpg']);
    });

    it('作者与时间缺失时不抛异常', () => {
        const r = parseBiliDynamic(
            makeDynamic({
                type: 'DYNAMIC_TYPE_DRAW',
                major: opusMajor({ summary: desc('正文') }),
            }),
        );
        expect(r.headline).toBe(
            '[1970/01/01 08:00:00] 「」 发送了动态',
        );
    });
});
