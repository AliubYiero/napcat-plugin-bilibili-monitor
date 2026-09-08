import type { Cmd } from '../cmd.ts';

export const bilibiliDynamicMonitor: Cmd = {
    id: 'bilibili-dynamic-monitor',
    title: 'Bilibili Dynamic Monitor 插件帮助',
    cmd: [
        {
            groupName: '核心指令',
            instructions: [
                {
                    cmd: '#bili dyn add <主播uid>',
                    desc: '添加主播到动态监听列表',
                },
                {
                    cmd: '#bili dyn remove <主播uid>',
                    desc: '从动态监听列表移除主播',
                },
                {
                    cmd: '#bili dyn latest <主播uid>',
                    desc: '查看主播最新一条动态',
                },
                {
                    cmd: '#bili dyn list',
                    desc: '查看当前正在监听动态状态的主播列表',
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
                    desc: '查询 Bilibili 用户登录指令帮助',
                    onlyPrivate: true,
                },
            ],
        },
        {
            groupName: '监听管理指令',
            isAdmin: true,
            instructions: [
                {
                    cmd: '#bili dyn max',
                    desc: '查看当前会话动态监听上限',
                },
            ],
        },
        {
            groupName: '监听管理指令',
            isSuperAdmin: true,
            instructions: [
                {
                    cmd: '#bili dyn max <监听数>',
                    desc: '设置当前群动态监听上限',
                    onlyGroup: true,
                },
                {
                    cmd: '#bili dyn max <监听数> <group|private> <id>',
                    desc: '修改指定会话动态监听上限',
                    onlyPrivate: true,
                },
            ],
        },
    ],
};
