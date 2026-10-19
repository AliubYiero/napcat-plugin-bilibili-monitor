/**
 * 由 pnpm run help:generate 生成, 禁止手改
 * cmd 权威源: scripts/generateHelp/cmds/
 * 供 WebUI 帮助文档页消费 (GET /help)
 */

import type { Cmd } from 'shared';

/** 全部帮助面板 (内容为各 cmds 权威源原样, 未经权限过滤) */
export const HELP_PANELS: Cmd[] = [
    {
        "id": "bilibili-live-monitor",
        "title": "Bilibili Live Monitor 插件帮助",
        "cmd": [
            {
                "groupName": "核心指令",
                "isAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili live add <主播uid>",
                        "desc": "添加主播到直播状态监听列表"
                    },
                    {
                        "cmd": "#bili live remove <主播uid>",
                        "desc": "从直播状态监听列表移除主播"
                    },
                    {
                        "cmd": "#bili live mention all",
                        "desc": "开启本群开播 @全体成员提醒",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili live unmention all",
                        "desc": "关闭本群开播 @全体成员提醒",
                        "onlyGroup": true
                    }
                ]
            },
            {
                "groupName": "核心指令",
                "instructions": [
                    {
                        "cmd": "#bili live list",
                        "desc": "查看当前正在监听直播状态的主播列表"
                    },
                    {
                        "cmd": "#bili live mention <主播uid>",
                        "desc": "订阅主播开播 @ 提醒",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili live mention",
                        "desc": "订阅当前群唯一监听主播的开播 @ 提醒 (仅监听 1 个主播时可用)",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili live unmention <主播uid>",
                        "desc": "取消订阅开播 @ 提醒",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili live unmention",
                        "desc": "取消订阅当前群唯一监听主播的开播 @ 提醒 (仅监听 1 个主播时可用)",
                        "onlyGroup": true
                    }
                ]
            },
            {
                "groupName": "辅助指令",
                "instructions": [
                    {
                        "cmd": "#bili live help",
                        "desc": "查看直播状态监听指令帮助"
                    },
                    {
                        "cmd": "#bili dyn help",
                        "desc": "查询动态状态监听指令帮助"
                    }
                ]
            },
            {
                "groupName": "辅助指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili user help",
                        "desc": "查询 Bilibili 用户登录指令帮助",
                        "onlyPrivate": true
                    }
                ]
            },
            {
                "groupName": "同接监听指令",
                "isAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili live online add <主播uid>",
                        "desc": "添加主播到同接数监听列表"
                    },
                    {
                        "cmd": "#bili live online remove <主播uid>",
                        "desc": "从同接数监听列表移除主播"
                    }
                ]
            },
            {
                "groupName": "同接监听指令",
                "instructions": [
                    {
                        "cmd": "#bili live online list",
                        "desc": "查看当前正在监听同接数的主播列表"
                    },
                    {
                        "cmd": "#bili live online show <主播uid>",
                        "desc": "查看主播本场直播的同接数变化图表"
                    },
                    {
                        "cmd": "#bili live online show",
                        "desc": "查看当前监听主播的同接数变化图表 (仅监听 1 个主播时可用)"
                    }
                ]
            },
            {
                "groupName": "监听管理指令",
                "isAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili live max",
                        "desc": "查看当前会话直播状态监听上限"
                    },
                    {
                        "cmd": "#bili live online max",
                        "desc": "查看当前会话直播同接监听上限"
                    }
                ]
            },
            {
                "groupName": "监听管理指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili live max <监听数>",
                        "desc": "设置当前群聊直播状态监听上限",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili live max <监听数> <group|private> <id>",
                        "desc": "修改指定会话直播状态监听上限",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#bili live online max <监听数>",
                        "desc": "设置当前群聊直播同接监听上限",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili live online max <监听数> <group|private> <id>",
                        "desc": "修改指定会话直播同接监听上限",
                        "onlyPrivate": true
                    }
                ]
            }
        ]
    },
    {
        "id": "bilibili-user-monitor",
        "title": "Bilibili User Monitor 插件帮助",
        "cmd": [
            {
                "groupName": "用户登录指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili user login",
                        "desc": "登录 Bilibili 账号",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#bili user logout",
                        "desc": "登出 Bilibili 账号",
                        "onlyPrivate": true
                    },
                    {
                        "cmd": "#bili user status",
                        "desc": "查询当前 Bilibili 账号的登录状态",
                        "onlyPrivate": true
                    }
                ]
            },
            {
                "groupName": "辅助指令",
                "instructions": [
                    {
                        "cmd": "#bili live help",
                        "desc": "查看直播状态监听指令帮助"
                    },
                    {
                        "cmd": "#bili dyn help",
                        "desc": "查询动态状态监听指令帮助"
                    }
                ]
            },
            {
                "groupName": "辅助指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili user help",
                        "desc": "查询 Bilibili 账号登录指令帮助",
                        "onlyPrivate": true
                    }
                ]
            }
        ]
    },
    {
        "id": "bilibili-dynamic-monitor",
        "title": "Bilibili Dynamic Monitor 插件帮助",
        "cmd": [
            {
                "groupName": "核心指令",
                "isAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili dyn add <主播uid>",
                        "desc": "添加主播到动态监听列表"
                    },
                    {
                        "cmd": "#bili dyn remove <主播uid>",
                        "desc": "从动态监听列表移除主播"
                    }
                ]
            },
            {
                "groupName": "核心指令",
                "instructions": [
                    {
                        "cmd": "#bili dyn latest <主播uid>",
                        "desc": "查看主播最新一条动态"
                    },
                    {
                        "cmd": "#bili dyn list",
                        "desc": "查看当前正在监听动态状态的主播列表"
                    }
                ]
            },
            {
                "groupName": "辅助指令",
                "instructions": [
                    {
                        "cmd": "#bili live help",
                        "desc": "查看直播状态监听指令帮助"
                    },
                    {
                        "cmd": "#bili dyn help",
                        "desc": "查询动态状态监听指令帮助"
                    }
                ]
            },
            {
                "groupName": "辅助指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili user help",
                        "desc": "查询 Bilibili 用户登录指令帮助",
                        "onlyPrivate": true
                    }
                ]
            },
            {
                "groupName": "监听管理指令",
                "isAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili dyn max",
                        "desc": "查看当前会话动态监听上限"
                    }
                ]
            },
            {
                "groupName": "监听管理指令",
                "isSuperAdmin": true,
                "instructions": [
                    {
                        "cmd": "#bili dyn max <监听数>",
                        "desc": "设置当前群动态监听上限",
                        "onlyGroup": true
                    },
                    {
                        "cmd": "#bili dyn max <监听数> <group|private> <id>",
                        "desc": "修改指定会话动态监听上限",
                        "onlyPrivate": true
                    }
                ]
            }
        ]
    }
];
