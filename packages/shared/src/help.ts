/**
 * 帮助面板类型「单一声明源」
 *
 * 供三处共享:
 *   - scripts/generateHelp (构建期生成帮助图片 / 文本 / 结构化数据)
 *   - plugin 运行时 (GET /help 直接返回生成产物)
 *   - webui 帮助文档页 (渲染)
 *
 * 字段结构需与上游渲染服务 napcat-help-generate/src/types/cmd.ts 手工同步。
 */

/** 权限组 */
export type Role = 'User' | 'Admin' | 'SuperAdmin';

/** 指令 */
export interface Instruction {
    /** 指令 */
    cmd: string;
    /** 指令描述 */
    desc: string;
    /** 仅私聊可用 */
    onlyPrivate?: boolean;
    /** 仅群聊可用 */
    onlyGroup?: boolean;
}

// onlyPrivate 和 onlyGroup 互斥
// 如果 onlyPrivate 和 onlyGroup 都不存在, 则为默认全部可用

/** 指令集 */
export interface InstructionSet {
    /** 指令集名称 */
    groupName: string;
    /** 指令列表 */
    instructions: Instruction[];
    /** 当前指令集是否只有群聊管理员可用 */
    isAdmin?: boolean;
    /** 当前指令集是否只有超级管理员可用 */
    isSuperAdmin?: boolean;
}

// 如果 isAdmin === true, 那么超级管理员可以使用
// isAdmin 和 isSuperAdmin 互斥, 只能存在一个

/** 文本帮助分组 */
export interface ContentHelp {
    /** 文本帮助分组名称 */
    groupName: string;
    methods: ContentHelpMethod[];
    /** 当前分组是否只有群聊管理员可用 */
    isAdmin?: boolean;
    /** 当前分组是否只有超级管理员可用 */
    isSuperAdmin?: boolean;
}

export interface ContentHelpMethod {
    /** 方法名, 可为空字符串(跳过标题) */
    name: string;
    /** 步骤, 支持 html 标签 */
    steps: (string | string[])[];
}

/** cmd 配置: 一个帮助面板 */
export interface Cmd {
    /** 脚注, 同时用作导出文件名 */
    id: string;
    /** 面板标题 */
    title: string;
    cmd: (InstructionSet | ContentHelp)[];
}
