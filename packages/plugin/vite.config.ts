import fs from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeResolve from '@rollup/plugin-node-resolve';
// @ts-expect-error
import { napcatHmrPlugin } from 'napcat-plugin-debug-cli/vite';
import { defineConfig, loadEnv } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const nodeModules = [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
].flat();

// 依赖排除（如有外部依赖需排除，在此添加）
const external: string[] = [];

// dev 部署身份标注（--mode deploy-dev）
// 以新 id 注册为独立插件, 不覆盖远程正在运行的正式插件
const DEV_SUFFIX = '-dev';
const DEV_NAME_PREFIX = '[DEV] ';

/**
 * 递归复制目录
 */
function copyDirRecursive(src: string, dest: string) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = resolve(src, entry.name);
        const destPath = resolve(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 构建后自动复制资源的 Vite 插件
 * - 复制 webui 构建产物（需先运行 webui 构建）到 dist/webui
 * - 生成精简的 package.json（只保留运行时必要字段）
 *   dev 部署时改写 name / plugin / version 以标注开发身份
 * - 复制 templates 目录（如果存在）
 *
 * @param isDevDeploy 是否为 dev 部署 (--mode deploy-dev)
 */
function copyAssetsPlugin(isDevDeploy: boolean) {
    return {
        name: 'copy-assets',
        writeBundle() {
            try {
                const distDir = resolve(__dirname, 'dist');

                // 1. 复制 webui 构建产物（由根脚本 pnpm build 先行构建）
                const webuiDist = resolve(
                    repoRoot,
                    'packages/webui/dist',
                );
                const webuiDest = resolve(distDir, 'webui');
                if (fs.existsSync(webuiDist)) {
                    copyDirRecursive(webuiDist, webuiDest);
                    console.log(
                        "[copy-assets] (o'v'o) 已复制 webui 构建产物",
                    );
                } else {
                    console.error(
                        '[copy-assets] (;_;) webui 构建产物不存在，请先运行 pnpm run build（根目录）',
                    );
                }

                // 2. 生成精简的 package.json（只保留运行时必要字段）
                const pkgPath = resolve(__dirname, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(
                        fs.readFileSync(pkgPath, 'utf-8'),
                    );
                    const distPkg: Record<string, unknown> = {
                        name: isDevDeploy
                            ? `${pkg.name}${DEV_SUFFIX}`
                            : pkg.name,
                        plugin:
                            isDevDeploy && pkg.plugin
                                ? `${DEV_NAME_PREFIX}${pkg.plugin}`
                                : pkg.plugin,
                        version: isDevDeploy
                            ? `${pkg.version}${DEV_SUFFIX}`
                            : pkg.version,
                        type: pkg.type,
                        main: pkg.main,
                        description: pkg.description,
                        author: pkg.author,
                        dependencies: pkg.dependencies,
                    };
                    if (pkg.napcat) {
                        distPkg.napcat = pkg.napcat;
                    }
                    fs.writeFileSync(
                        resolve(distDir, 'package.json'),
                        JSON.stringify(distPkg, null, 2),
                    );
                    console.log(
                        "[copy-assets] (o'v'o) 已生成精简 package.json",
                    );
                    if (isDevDeploy) {
                        console.log(
                            `[copy-assets] (>'o'<) dev 身份: ${distPkg.name} (${distPkg.plugin} v${distPkg.version})`,
                        );
                    }
                }

                // 3. 复制 templates 目录（如果存在）
                const templatesSrc = resolve(__dirname, 'templates');
                if (fs.existsSync(templatesSrc)) {
                    copyDirRecursive(
                        templatesSrc,
                        resolve(distDir, 'templates'),
                    );
                    console.log(
                        "[copy-assets] (o'v'o) 已复制 templates 目录",
                    );
                }

                // 4. 复制帮助图片资源（由 pnpm run help:generate 产出）
                const assetsSrc = resolve(__dirname, 'src/assets');
                if (fs.existsSync(assetsSrc)) {
                    copyDirRecursive(
                        assetsSrc,
                        resolve(distDir, 'assets'),
                    );
                    console.log(
                        "[copy-assets] (o'v'o) 已复制 assets 目录",
                    );
                }

                console.log("[copy-assets] (*'v'*) 资源复制完成！");
            } catch (error) {
                console.error(
                    '[copy-assets] (;_;) 资源复制失败:',
                    error,
                );
            }
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, repoRoot, '');

    // 热部署插件只在 --mode deploy / deploy-dev 下挂载:
    //   pnpm run build      → 纯构建, 不连调试服务 (无需 WS_URL / TOKEN)
    //   pnpm run deploy     → 构建 + 复制到远程 + 热重载 (正式 id)
    //   pnpm run deploy:dev → 同上, 但以 -dev 新 id 部署, 不覆盖正在运行的插件
    const isDevDeploy = mode === 'deploy-dev';
    const isDeploy = mode === 'deploy' || isDevDeploy;
    console.log(
        isDevDeploy
            ? "[vite] (o'v'o) dev 部署模式: 以 -dev 新 id 构建并热重载 (不覆盖正式插件)"
            : isDeploy
              ? "[vite] (o'v'o) 部署模式: 构建完成后自动复制到远程并热重载"
              : "[vite] (*'v'*) 构建模式: 仅产出 dist/, 需要热部署请运行 pnpm run deploy",
    );

    return {
        resolve: {
            conditions: ['node', 'default'],
        },
        build: {
            sourcemap: false,
            target: 'esnext',
            minify: false,
            lib: {
                entry: resolve(__dirname, 'src/index.ts'),
                formats: ['es'],
                fileName: () => 'index.mjs',
            },
            rollupOptions: {
                external: [...nodeModules, ...external],
                output: {
                    inlineDynamicImports: true,
                },
            },
            outDir: 'dist',
        },
        plugins: [
            nodeResolve(),
            copyAssetsPlugin(isDevDeploy),
            ...(isDeploy
                ? [
                      napcatHmrPlugin({
                          webui: {
                              distDir: '../../packages/webui/dist',
                              targetDir: 'webui',
                          },
                          wsUrl: env.WS_URL,
                          token: env.TOKEN,
                      }),
                  ]
                : []),
        ],
    };
});
