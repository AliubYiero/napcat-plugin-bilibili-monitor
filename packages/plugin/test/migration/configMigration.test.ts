/**
 * 配置迁移 (旧配置形状 → 新配置形状 + 会话文件)
 *
 * 覆盖: 幂等跳过、备份、adminUser 合并、groupConfigs 抽取、字段移除、
 * stats 保留、按值告警、损坏文件阻断。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

vi.mock('../../src/core/state', async () => {
    const { createFakePluginState } = await import(
        '../helpers/pluginState'
    );
    return { pluginState: createFakePluginState() };
});

import { runConfigMigration } from '../../src/store/migration/configMigration';
import { MigrationError } from '../../src/store/migration/run';
import {
    readFile,
    resetFakeState,
    seedFile,
    setConfigPath,
} from '../helpers/pluginState';

const SESSION_FILE = 'bilibiliSessionConfig.json';

let dir: string;
let configPath: string;

beforeEach(() => {
    resetFakeState();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-mig-'));
    configPath = path.join(dir, 'config.json');
    setConfigPath(configPath);
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

function writeConfig(value: unknown): void {
    fs.writeFileSync(
        configPath,
        JSON.stringify(value, null, 2),
        'utf-8',
    );
}

function readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function backupNames(): string[] {
    return fs.readdirSync(dir).filter((n) => n.endsWith('.bak'));
}

describe('跳过条件', () => {
    it('配置文件缺失时跳过', () => {
        const result = runConfigMigration();
        expect(result.status).toBe('skipped');
    });

    it('无任何旧字段时跳过, 不改写不备份', () => {
        writeConfig({ adminUsers: ['111'], pollIntervalSeconds: 30 });
        const before = fs.readFileSync(configPath, 'utf-8');
        const result = runConfigMigration();
        expect(result.status).toBe('skipped');
        expect(fs.readFileSync(configPath, 'utf-8')).toBe(before);
        expect(backupNames()).toEqual([]);
    });

    it('配置文件非法 JSON 时抛 MigrationError', () => {
        fs.writeFileSync(configPath, '{ not json', 'utf-8');
        expect(() => runConfigMigration()).toThrow(MigrationError);
    });
});

describe('adminUser 合并', () => {
    it('旧 adminUser 字符串并入 adminUsers', () => {
        writeConfig({ adminUser: '111, 222' });
        const result = runConfigMigration();
        expect(result.status).toBe('migrated');
        expect(readConfig().adminUsers).toEqual(['111', '222']);
        expect(readConfig()).not.toHaveProperty('adminUser');
    });

    it('已有 adminUsers 时优先保留新字段', () => {
        writeConfig({ adminUsers: ['999'], adminUser: '111' });
        runConfigMigration();
        expect(readConfig().adminUsers).toEqual(['999']);
    });
});

describe('groupConfigs 抽取到会话文件', () => {
    it('只保留有意义的取值并写会话文件', () => {
        writeConfig({
            groupConfigs: {
                '123': { enabled: false, liveMentionAll: true },
                '456': { enabled: true },
            },
        });
        const result = runConfigMigration();
        expect(result.sessionEntries).toBe(1);
        expect(readFile(SESSION_FILE)).toEqual({
            version: 1,
            data: {
                'group:123': {
                    id: '123',
                    type: 'group',
                    enabled: false,
                    liveMentionAll: true,
                },
            },
        });
    });

    it('抽取后配置中不再有 groupConfigs', () => {
        writeConfig({ groupConfigs: { '123': { enabled: false } } });
        runConfigMigration();
        expect(readConfig()).not.toHaveProperty('groupConfigs');
    });

    it('已存在的会话记录不被覆盖', () => {
        // 预置会话文件已有同键记录
        seedFile(SESSION_FILE, {
            version: 1,
            data: { 'group:123': { id: '123', type: 'group' } },
        });
        writeConfig({ groupConfigs: { '123': { enabled: false } } });
        const result = runConfigMigration();
        expect(result.sessionEntries).toBe(0);
        expect(readFile(SESSION_FILE)).toEqual({
            version: 1,
            data: { 'group:123': { id: '123', type: 'group' } },
        });
    });

    it('无有效记录时提示且不生成会话文件', () => {
        writeConfig({ groupConfigs: { '123': { enabled: true } } });
        const result = runConfigMigration();
        expect(result.sessionEntries).toBe(0);
        expect(readFile(SESSION_FILE)).toBeUndefined();
        expect(
            result.warnings.some((w) => w.includes('groupConfigs')),
        ).toBe(true);
    });
});

describe('幂等', () => {
    it('迁移后再次执行跳过, 会话记录不重复', () => {
        writeConfig({
            groupConfigs: { '123': { liveMentionAll: true } },
        });
        expect(runConfigMigration().status).toBe('migrated');
        const second = runConfigMigration();
        expect(second.status).toBe('skipped');
        expect(readFile(SESSION_FILE)).toEqual({
            version: 1,
            data: {
                'group:123': {
                    id: '123',
                    type: 'group',
                    liveMentionAll: true,
                },
            },
        });
    });
});

describe('按值告警与字段移除', () => {
    it('enabled=false 告警', () => {
        writeConfig({ enabled: false });
        const result = runConfigMigration();
        expect(
            result.warnings.some((w) => w.includes('enabled=false')),
        ).toBe(true);
        expect(readConfig()).not.toHaveProperty('enabled');
    });

    it('非 #bili 的 commandPrefix 告警并移除', () => {
        writeConfig({ commandPrefix: '#x' });
        const result = runConfigMigration();
        expect(result.warnings.some((w) => w.includes('#x'))).toBe(
            true,
        );
        expect(readConfig()).not.toHaveProperty('commandPrefix');
    });

    it('#bili 的 commandPrefix 不告警', () => {
        writeConfig({ commandPrefix: '#bili' });
        const result = runConfigMigration();
        expect(
            result.warnings.some((w) => w.includes('commandPrefix')),
        ).toBe(false);
    });

    it('debug 移除并告警', () => {
        writeConfig({ debug: true });
        const result = runConfigMigration();
        expect(result.warnings.some((w) => w.includes('debug'))).toBe(
            true,
        );
        expect(readConfig()).not.toHaveProperty('debug');
    });
});

describe('stats 保留与备份', () => {
    it('stats 原样保留', () => {
        writeConfig({
            enabled: true,
            stats: { processed: 5, todayProcessed: 2 },
        });
        runConfigMigration();
        expect(readConfig().stats).toEqual({
            processed: 5,
            todayProcessed: 2,
        });
    });

    it('迁移前生成 <文件名>.<时间戳>.bak 备份', () => {
        writeConfig({ enabled: false });
        runConfigMigration(new Date('2026-01-02T03:04:05'));
        expect(backupNames()).toEqual([
            'config.json.20260102030405.bak',
        ]);
    });
});
