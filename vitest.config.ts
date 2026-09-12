/**
 * vitest 配置（独立于 vite.config.ts）
 *
 * 不复用构建配置: 构建配置带有一批会写入产物目录、连接远程
 * NapCat 实例的插件, 与测试的受众、生命周期、失败模式都不同,
 * 耦合进来会让"改构建"与"改测试"互相牵连。
 *
 * 时区在此钉死: 本文件由主进程在派生 worker 之前加载, worker
 * 继承其环境变量, 故时间格式化断言在本地与 CI 上一致。
 * 配套的守卫用例见 test/format.test.ts。
 */
import { defineConfig } from 'vitest/config';

process.env.TZ = 'Asia/Shanghai';

export default defineConfig({
    test: {
        // 测试与 src/ 平级, 天然不会被构建产物收集
        include: ['test/**/*.test.ts'],
        environment: 'node',
    },
});
