/**
 * help:generate 命令入口
 * 通过 napcat-help-generate 服务端 API 生成帮助图片与文本, 并落盘到本项目:
 * - 图片: src/assets/{cmdId}-{Role}.png (覆盖写入)
 * - 文本: src/handlers/{live,dyn,user}/helpText.generated.ts (生成文件, 禁止手改)
 *
 * cmd 配置权威源在本项目 scripts/generateHelp/cmds/, 经 API 传参模式 (cmd 字段) 提交给上游服务渲染
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cmd, Role } from './cmd.ts';
import { bilibiliLiveMonitor } from './cmds/bilibili-live-monitor.ts';
import { bilibiliUserMonitor } from './cmds/bilibili-user-monitor.ts';
import { bilibiliDynamicMonitor } from './cmds/bilibili-dynamic-monitor.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 本项目根目录
const PROJECT_ROOT = resolve(__dirname, '..', '..');
// 上游 help-generate 项目目录 (约定与本项目同级)
const GENERATOR_ROOT = resolve(
    PROJECT_ROOT,
    '..',
    'napcat-help-generate',
);

// 权威源 cmd 配置 → 落盘目标
const CMD_TARGETS: {
    cmd: Cmd;
    handlerDir: string;
}[] = [
    {
        cmd: bilibiliLiveMonitor,
        handlerDir: join(PROJECT_ROOT, 'src/handlers/live'),
    },
    {
        cmd: bilibiliUserMonitor,
        handlerDir: join(PROJECT_ROOT, 'src/handlers/user'),
    },
    {
        cmd: bilibiliDynamicMonitor,
        handlerDir: join(PROJECT_ROOT, 'src/handlers/dyn'),
    },
];

// 权限组: API 键 (PascalCase) → 变体键 (camelCase)
const ROLE_MAP: { role: Role; variant: string }[] = [
    { role: 'User', variant: 'user' },
    { role: 'Admin', variant: 'admin' },
    { role: 'SuperAdmin', variant: 'superAdmin' },
];

// 探活/请求超时与启动等待
const POLL_INTERVAL_MS = 500;
const START_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

// ---------- 服务启动 ----------

async function isServerUp(port: number): Promise<boolean> {
    try {
        const res = await fetch(`http://localhost:${port}/api/cmds`, {
            signal: AbortSignal.timeout(2000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// 读取上游 .env 的 PORT (缺省 3366), 失败按缺省处理
function readGeneratorPort(): number {
    try {
        const env = readFileSync(
            join(GENERATOR_ROOT, '.env'),
            'utf-8',
        );
        const match = env.match(/^PORT=(\d+)\s*$/m);
        if (match) {
            return Number(match[1]);
        }
    } catch {
        // .env 不存在或不可读, 用缺省端口
    }
    return 3366;
}

// 上游服务未运行时自动启动, 轮询就绪
async function ensureServer(port: number): Promise<void> {
    if (await isServerUp(port)) {
        console.log(
            `[help:generate] 检测到上游服务已运行 (port ${port})`,
        );
        return;
    }

    console.log(
        `[help:generate] 上游服务未运行, 在 ${GENERATOR_ROOT} 启动 pnpm start ...`,
    );
    const bin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(bin, ['start'], {
        cwd: GENERATOR_ROOT,
        stdio: 'ignore',
        detached: false,
    });
    child.on('error', (err) => {
        console.error(
            `[help:generate] 启动上游服务失败: ${err.message}\n` +
                '请手动进入 napcat-help-generate 目录执行 pnpm start 后重试',
        );
        process.exit(1);
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < START_TIMEOUT_MS) {
        if (await isServerUp(port)) {
            console.log('[help:generate] 上游服务已就绪');
            return;
        }
        await sleep(POLL_INTERVAL_MS);
    }
    console.error(
        `[help:generate] 等待上游服务就绪超时 (${START_TIMEOUT_MS / 1000}s)\n` +
            '首次运行需在上游目录执行 npx playwright install chromium; 也可手动 pnpm start 后重试',
    );
    process.exit(1);
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ---------- API 请求 ----------

function assertOk(res: Response, body: string): void {
    if (res.status === 400 || res.status === 500) {
        // 上游错误响应为 {"error": "..."}
        try {
            const { error, detail } = JSON.parse(body);
            throw new Error(
                `上游返回 ${res.status}: ${error}${detail ? ` (${detail})` : ''}`,
            );
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new Error(`上游返回 ${res.status}: ${body}`);
            }
            throw e;
        }
    }
    if (!res.ok) {
        throw new Error(`上游返回 ${res.status}: ${body}`);
    }
}

async function fetchText(
    port: number,
    cmd: Cmd,
): Promise<Record<Role, string>> {
    const res = await fetch(`http://localhost:${port}/api/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cmd: [cmd],
            role: ROLE_MAP.map((r) => r.role),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await res.text();
    assertOk(res, body);
    return JSON.parse(body);
}

async function fetchImages(
    port: number,
    cmd: Cmd,
): Promise<Map<Role, Buffer>> {
    const res = await fetch(`http://localhost:${port}/api/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cmd: [cmd],
            role: ROLE_MAP.map((r) => r.role),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // body 只读一次: 先取 buffer, 错误响应用 UTF-8 文本判定, 成功响应按二进制解析
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
        assertOk(res, buffer.toString('utf-8'));
        throw new Error('响应不是 multipart: ' + contentType);
    }

    // 手写解析 multipart 响应 (上游 boundary 固定前缀 napcat-help-generate-)
    // 二进制安全: 以 latin1 解码 buffer, 保证字节 1:1 (PNG 不可走 UTF-8 text())
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
        throw new Error('响应缺少 boundary: ' + contentType);
    }
    const boundary = boundaryMatch[1];
    const bodyBin = buffer.toString('latin1');
    const parts = bodyBin.split(`--${boundary}`);
    const imageMap = new Map<Role, Buffer>();
    for (const part of parts) {
        // part 形如 \r\nContent-Disposition: form-data; name="User"; filename="{cmdId}-User.png"\r\nContent-Type: image/png\r\n\r\n<binary>\r\n
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
            continue;
        }
        const nameMatch = part.match(
            /name="(User|Admin|SuperAdmin)"/,
        );
        if (!nameMatch) {
            continue;
        }
        const raw = part.slice(headerEnd + 4).replace(/\r\n$/, '');
        imageMap.set(
            nameMatch[1] as Role,
            Buffer.from(raw, 'latin1'),
        );
    }
    const missing = ROLE_MAP.map((r) => r.role).filter(
        (r) => !imageMap.has(r),
    );
    if (missing.length > 0) {
        throw new Error(
            `multipart 响应缺少 role part: ${missing.join(', ')}`,
        );
    }
    return imageMap;
}

// ---------- 落盘 ----------

function writeImages(cmdId: string, images: Map<Role, Buffer>): void {
    const assetsDir = join(PROJECT_ROOT, 'src/assets');
    for (const [role, buffer] of images) {
        const file = join(assetsDir, `${cmdId}-${role}.png`);
        writeFileSync(file, buffer);
        console.log(
            `[help:generate] 写入 ${file} (${buffer.length} bytes)`,
        );
    }
}

function writeHelpText(
    cmdId: string,
    handlerDir: string,
    texts: Record<Role, string>,
): void {
    const lines: string[] = [];
    lines.push('/**');
    lines.push(' * 由 pnpm run help:generate 生成, 禁止手改');
    lines.push(
        ` * cmd 权威源: scripts/generateHelp/cmds/${cmdId}.ts`,
    );
    lines.push(' */');
    lines.push('');
    lines.push(
        "import type { HelpVariant } from '../../utils/helpMessage';",
    );
    lines.push('');
    lines.push(
        '/** 按帮助版本的文本帮助 (图片降级用), Admin 版同时用于私聊用户与群聊超管 */',
    );
    lines.push(
        'export const HELP_TEXT_MAP: Record<HelpVariant, string> = {',
    );
    for (const { role, variant } of ROLE_MAP) {
        lines.push(`    ${variant}: ${JSON.stringify(texts[role])},`);
    }
    lines.push('};');
    lines.push('');
    const file = join(handlerDir, 'helpText.generated.ts');
    writeFileSync(file, lines.join('\n'));
    console.log(`[help:generate] 写入 ${file}`);
}

// ---------- 主流程 ----------

async function main(): Promise<void> {
    const port = readGeneratorPort();
    await ensureServer(port);

    for (const { cmd, handlerDir } of CMD_TARGETS) {
        console.log(`[help:generate] 生成 ${cmd.id} ...`);
        const texts = await fetchText(port, cmd);
        const images = await fetchImages(port, cmd);
        writeImages(cmd.id, images);
        writeHelpText(cmd.id, handlerDir, texts);
    }
    console.log('[help:generate] 全部完成');
}

main().catch((err) => {
    console.error('[help:generate] 失败:', err);
    process.exit(1);
});
