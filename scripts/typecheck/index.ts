/**
 * 测试代码类型检查入口
 *
 * 背景: 依赖包 napcat-types 内含一处被截断的声明文件, 使 tsc 退出码
 * 恒为失败且与源码无关 (见 ADR 0003)。故不能以退出码判定成败, 改为
 * 沿用既有做法, 从输出中过滤出指向源码与测试代码的错误。
 *
 * 判定规则:
 * - 只把形如 `(行,列): error TSxxxx` 的行视为编译错误;
 * - 其中不含 `node_modules` 的即"我们的"错误, 存在则判失败;
 * - 一条编译错误都没有却仍非零退出 → tsc 本身出错 (配置无效等),
 *   同样判失败并原样输出, 避免把工具故障误报成通过。
 *
 * 用法: pnpm run typecheck:test
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

/** tsc 可执行入口 (跨平台: 交给当前 node 执行, 不依赖 .bin 包装) */
const TSC_BIN = resolve(
    PROJECT_ROOT,
    'node_modules',
    'typescript',
    'bin',
    'tsc',
);

/** 测试目录的独立 tsconfig (含 src/ 以覆盖被测模块) */
const TEST_TSCONFIG = 'test/tsconfig.json';

/** 形如 `path/to/file.ts(12,3): error TS2345: ...` 的编译错误行 */
const ERROR_LINE_RE = /\(\d+,\d+\): error TS\d+/;

const result = spawnSync(
    process.execPath,
    [TSC_BIN, '--noEmit', '-p', TEST_TSCONFIG],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const lines = output.split(/\r?\n/);
const errorLines = lines.filter((line) => ERROR_LINE_RE.test(line));
const ownErrors = errorLines.filter(
    (line) => !line.includes('node_modules'),
);

// 非零退出且没有任何编译错误 → tsc 自身故障, 原样输出
if (result.status !== 0 && errorLines.length === 0) {
    console.error(output.trim());
    console.error('\ntsc 未能产生编译错误行, 请检查上述输出');
    process.exit(1);
}

if (ownErrors.length > 0) {
    console.error(`类型检查失败, ${ownErrors.length} 处错误:\n`);
    for (const line of ownErrors) console.error(`  ${line}`);
    process.exit(1);
}

const ignored = errorLines.length - ownErrors.length;
console.log(
    ignored > 0
        ? `类型检查通过 (源码与测试零错误, 已忽略 ${ignored} 条依赖包噪音)`
        : '类型检查通过 (源码与测试零错误)',
);
