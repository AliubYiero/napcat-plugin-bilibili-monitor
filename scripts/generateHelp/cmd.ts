// 权限组
export type Role = 'User' | 'Admin' | 'SuperAdmin';

// 指令
export interface Instruction {
    cmd: string; // 指令
    desc: string; // 指令描述
    onlyPrivate?: boolean; // 仅私聊可用
    onlyGroup?: boolean; // 仅群聊可用
}

// onlyPrivate 和 onlyGroup 互斥
// 如果 onlyPrivate 和 onlyGroup 都不存在, 则为默认全部可用

// 指令集
export interface InstructionSet {
    groupName: string; // 指令集名称
    instructions: Instruction[]; // 指令列表
    isAdmin?: boolean; // 当前指令集是否只有群聊管理员可用
    isSuperAdmin?: boolean; // 当前指令集是否只有超级管理员可用
}

// 如果 isAdmin === true, 那么超级管理员可以使用
// isAdmin 和 isSuperAdmin 互斥, 只能存在一个

// 文本帮助
export interface ContentHelp {
    groupName: string; // 文本帮助分组名称
    methods: ContentHelpMethod[];
    isAdmin?: boolean; // 当前分组是否只有群聊管理员可用
    isSuperAdmin?: boolean; // 当前分组是否只有超级管理员可用
}

export interface ContentHelpMethod {
    name: string; // 方法名, 可为空字符串(跳过标题)
    steps: (string | string[])[]; // 支持 html 标签
}

// cmd 配置: Cmd
export interface Cmd {
    id: string; // 脚注, 同时用作导出文件名
    title: string; // 面板标题
    cmd: (InstructionSet | ContentHelp)[];
}
