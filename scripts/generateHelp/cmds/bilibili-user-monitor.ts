import type { Cmd } from '../cmd.ts';

export const bilibiliUserMonitor: Cmd = {
    id: 'bilibili-user-monitor',
    title: 'Bilibili User Monitor 插件帮助',
    cmd: [
        {
            groupName: '用户登录指令',
            isSuperAdmin: true,
            instructions: [
                {
                    cmd: '#bili user login',
                    desc: '登录 Bilibili 账号',
                    onlyPrivate: true,
                },
                {
                    cmd: '#bili user logout',
                    desc: '登出 Bilibili 账号',
                    onlyPrivate: true,
                },
                {
                    cmd: '#bili user status',
                    desc: '查询当前 Bilibili 账号的登录状态',
                    onlyPrivate: true,
                },
            ],
        },
        {
            groupName: '辅助指令',
            instructions: [
                {
                    cmd: '#bili live help',
                    desc: '查看直播状态监听指令帮助',
                },
                {
                    cmd: '#bili dyn help',
                    desc: '查询动态状态监听指令帮助',
                },
            ],
        },
        {
            groupName: '辅助指令',
            isSuperAdmin: true,
            instructions: [
                {
                    cmd: '#bili user help',
                    desc: '查询 Bilibili 账号登录指令帮助',
                    onlyPrivate: true,
                },
            ],
        },
    ],
};
