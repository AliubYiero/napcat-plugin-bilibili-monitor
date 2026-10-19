/**
 * 指令分发判定 (resolveDispatch 纯函数)
 *
 * 覆盖: 三级/二级/一级命名空间匹配优先级、大小写不敏感、
 * 角色门槛、作用域提示、scopeRules 形态化门槛与未命中静默。
 */

import { describe, expect, it } from 'vitest';
import type { UserRole, UserRoleName } from '../../src/core/admin';
import { resolveDispatch } from '../../src/handlers/instructionDispatch';

function role(
    roleName: UserRoleName,
    type: 'group' | 'private' = 'group',
): UserRole {
    return { userId: '1', role: roleName, from: { id: '1', type } };
}

describe('命名空间匹配', () => {
    it('未知指令静默', () => {
        expect(
            resolveDispatch(['bogus'], role('superAdmin')),
        ).toEqual({
            type: 'silent',
        });
    });

    it('空参数静默', () => {
        expect(resolveDispatch([], role('superAdmin'))).toEqual({
            type: 'silent',
        });
    });

    it('一级注册表为空时静默', () => {
        expect(resolveDispatch(['help'], role('superAdmin'))).toEqual(
            {
                type: 'silent',
            },
        );
    });

    it('二级: live list 命中, 参数为空', () => {
        const decision = resolveDispatch(
            ['live', 'list'],
            role('user'),
        );
        expect(decision.type).toBe('run');
        if (decision.type === 'run') {
            expect(decision.commands).toEqual([]);
        }
    });

    it('三级: live online add 命中, 参数为剩余项', () => {
        const decision = resolveDispatch(
            ['live', 'online', 'add', '100'],
            role('admin'),
        );
        expect(decision.type).toBe('run');
        if (decision.type === 'run') {
            expect(decision.commands).toEqual(['100']);
        }
    });

    it('三级未带子指令时回落二级 (无匹配即静默)', () => {
        expect(
            resolveDispatch(['live', 'online'], role('superAdmin')),
        ).toEqual({ type: 'silent' });
    });

    it('三级优先于二级', () => {
        const nested = resolveDispatch(
            ['live', 'online', 'add', '100'],
            role('admin'),
        );
        expect(nested.type).toBe('run');
        if (nested.type === 'run') {
            expect(nested.commands).toEqual(['100']);
        }
    });

    it('指令名大小写不敏感', () => {
        expect(
            resolveDispatch(['LIVE', 'LIST'], role('user')).type,
        ).toBe('run');
        expect(
            resolveDispatch(['LIVE', 'ONLINE', 'ADD'], role('admin'))
                .type,
        ).toBe('run');
    });
});

describe('角色门槛', () => {
    it('二级 add 需要管理员', () => {
        expect(
            resolveDispatch(['live', 'add', '100'], role('user')),
        ).toEqual({ type: 'silent' });
        expect(
            resolveDispatch(['live', 'add', '100'], role('admin'))
                .type,
        ).toBe('run');
    });

    it('privateUser 等同 admin 权限组', () => {
        expect(
            resolveDispatch(
                ['live', 'add', '100'],
                role('privateUser', 'private'),
            ).type,
        ).toBe('run');
    });

    it('三级 add 需要管理员', () => {
        expect(
            resolveDispatch(['live', 'online', 'add'], role('user')),
        ).toEqual({ type: 'silent' });
    });

    it('超管不受会话类型限制', () => {
        expect(
            resolveDispatch(
                ['user', 'login'],
                role('superAdmin', 'private'),
            ).type,
        ).toBe('run');
    });
});

describe('作用域', () => {
    it('群限定指令在私聊回复提示', () => {
        expect(
            resolveDispatch(
                ['live', 'mention'],
                role('admin', 'private'),
            ),
        ).toEqual({
            type: 'scopeHint',
            message: '该指令仅限群聊使用',
        });
    });

    it('群限定指令在群聊执行', () => {
        expect(
            resolveDispatch(
                ['live', 'mention'],
                role('admin', 'group'),
            ).type,
        ).toBe('run');
    });

    it('私聊限定指令在群聊回复提示', () => {
        expect(
            resolveDispatch(
                ['user', 'status'],
                role('superAdmin', 'group'),
            ),
        ).toEqual({
            type: 'scopeHint',
            message: '该指令仅限私聊使用',
        });
    });

    it('权限不足优先静默, 不泄露作用域信息', () => {
        expect(
            resolveDispatch(
                ['user', 'status'],
                role('user', 'group'),
            ),
        ).toEqual({ type: 'silent' });
    });
});

describe('scopeRules 形态化门槛', () => {
    it('live max 无参: 群管理员可查看', () => {
        expect(
            resolveDispatch(['live', 'max'], role('admin', 'group'))
                .type,
        ).toBe('run');
    });

    it('live max 无参: 普通用户静默', () => {
        expect(
            resolveDispatch(['live', 'max'], role('user', 'group')),
        ).toEqual({ type: 'silent' });
    });

    it('live max 无参: 私聊管理员可查看', () => {
        expect(
            resolveDispatch(['live', 'max'], role('admin', 'private'))
                .type,
        ).toBe('run');
    });

    it('live max 一个参数: 群内需超管', () => {
        expect(
            resolveDispatch(
                ['live', 'max', '5'],
                role('admin', 'group'),
            ),
        ).toEqual({ type: 'silent' });
        expect(
            resolveDispatch(
                ['live', 'max', '5'],
                role('superAdmin', 'group'),
            ).type,
        ).toBe('run');
    });

    it('live max 三个参数: 私聊需超管', () => {
        expect(
            resolveDispatch(
                ['live', 'max', '1', '2', '3'],
                role('superAdmin', 'private'),
            ).type,
        ).toBe('run');
    });

    it('未命中任何形态时静默', () => {
        expect(
            resolveDispatch(
                ['live', 'max', '1', '2'],
                role('superAdmin', 'group'),
            ),
        ).toEqual({ type: 'silent' });
    });

    it('形态作用域不符时回复提示', () => {
        expect(
            resolveDispatch(
                ['live', 'online', 'max', '1', '2', '3'],
                role('superAdmin', 'group'),
            ),
        ).toEqual({
            type: 'scopeHint',
            message: '该指令仅限私聊使用',
        });
    });
});
