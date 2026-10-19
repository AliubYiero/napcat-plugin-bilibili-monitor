/**
 * 帮助面板类型
 *
 * 单一权威源已上移至 shared (`packages/shared/src/help.ts`), 供 plugin 运行时与
 * webui 共享; 本文件仅重导出, 以保持 scripts 内 `./cmd.ts` 相对导入不变。
 *
 * 【必须】字段结构需与上游渲染服务 napcat-help-generate/src/types/cmd.ts 手工同步。
 */
export type {
    Cmd,
    ContentHelp,
    ContentHelpMethod,
    Instruction,
    InstructionSet,
    Role,
} from 'shared';
