// @vitest-environment happy-dom
/**
 * HelpPage 页面行为 (IO 部分)
 *
 * 范式: docs/webui-config-pattern.md 的帮助文档页。
 * 过滤纯逻辑见 utils/helpFilter 的单测; 此处只测 IO 接线与搜索联动。
 */

import {
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import type { Cmd } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HelpPage from '../../src/pages/HelpPage';
import { noAuthFetch } from '../../src/utils/api';

vi.mock('../../src/utils/api', () => ({
    noAuthFetch: vi.fn(),
}));

const mockedFetch = vi.mocked(noAuthFetch);

const PANELS: Cmd[] = [
    {
        id: 'p1',
        title: '面板一',
        cmd: [
            {
                groupName: '基础指令',
                instructions: [
                    { cmd: '#cmd help', desc: '查看帮助' },
                    { cmd: '#cmd ping', desc: '连通测试' },
                ],
            },
        ],
    },
    {
        id: 'p2',
        title: '面板二',
        cmd: [
            {
                groupName: '图文指南',
                methods: [
                    { name: '安装', steps: ['打开设置', '点击安装'] },
                ],
            },
        ],
    },
];

beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({ code: 0, data: PANELS });
});

describe('HelpPage', () => {
    it('请求 /help 并渲染面板与分组', async () => {
        render(<HelpPage />);
        expect(
            await screen.findByText('基础指令'),
        ).toBeInTheDocument();
        expect(mockedFetch).toHaveBeenCalledWith('/help');
        expect(screen.getByText('面板一 (1)')).toBeInTheDocument();
        expect(screen.getByText('面板二 (1)')).toBeInTheDocument();
    });

    it('搜索后过滤分组并切到有命中的面板', async () => {
        render(<HelpPage />);
        await screen.findByText('基础指令');
        fireEvent.change(
            screen.getByPlaceholderText('搜索指令或说明...'),
            { target: { value: '安装' } },
        );
        await waitFor(() => {
            expect(screen.queryByText('基础指令')).toBeNull();
        });
        expect(screen.getByText('安装')).toBeInTheDocument();
        expect(
            screen.getByText('搜索到 1 个分组'),
        ).toBeInTheDocument();
    });

    it('无命中时显示空态', async () => {
        render(<HelpPage />);
        await screen.findByText('基础指令');
        fireEvent.change(
            screen.getByPlaceholderText('搜索指令或说明...'),
            { target: { value: '不存在xyz' } },
        );
        await waitFor(() => {
            expect(
                screen.getByText('没有匹配的指令'),
            ).toBeInTheDocument();
        });
    });
});
