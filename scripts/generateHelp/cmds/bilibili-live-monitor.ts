import type { Cmd } from '../cmd.ts';

export const bilibiliLiveMonitor: Cmd = {
    id: 'bilibili-live-monitor',
    title: 'Bilibili Live Monitor 插件帮助',
    cmd: [
        {
            groupName: '核心指令',
            instructions: [
                {
                    cmd: '#bili live add <主播uid>',
                    desc: '添加主播到直播状态监听列表',
                },
                {
                    cmd: '#bili live remove <主播uid>',
                    desc: '从直播状态监听列表移除主播',
                },
                {
                    cmd: '#bili live list',
                    desc: '查看当前正在监听直播状态的主播列表',
                },
                {
                    cmd: '#bili live mention <主播uid>',
                    desc: '订阅主播开播 @ 提醒',
                    onlyGroup: true,
                },
                {
                    cmd: '#bili live unmention <主播uid>',
                    desc: '取消订阅开播 @ 提醒',
                    onlyGroup: true,
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
                    cmd: '#bili live max',
                    desc: '查看当前会话直播状态监听上限',
                },
            ],
        },
        {
            groupName: '监听管理指令',
            isSuperAdmin: true,
            instructions: [
                {
                    cmd: '#bili live max <监听数>',
                    desc: '设置当前群直播状态监听上限',
                    onlyGroup: true,
                },
                {
                    cmd: '#bili live max <监听数> <group|private> <id>',
                    desc: '修改指定会话直播状态监听上限',
                    onlyPrivate: true,
                },
            ],
        },
    ],
};
