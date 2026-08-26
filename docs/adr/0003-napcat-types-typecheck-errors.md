# npm run typecheck 受 napcat-types 依赖包语法错误影响

`npm run typecheck` 会报出 `node_modules/napcat-types@0.0.16` 包内的错误,与项目源码无关: `napcat-core/packet/transformer/message/UploadForwardMsgV2.ts` 存在语法错误(TS1068/TS1109/TS1128),且 `napcat-core` 引用了缺失的 `napcat-protobuf` 模块(TS2307)。该依赖包为插件类型定义的发布产物,项目无法修复;`vite build`(esbuild)不做类型检查,构建不受影响。故项目以 `vite build` 作为实际验证手段;确需类型检查时,过滤 `npx tsc --noEmit` 输出中 `src/` 前缀的错误即可(源码零类型错误)。升级 `napcat-types` 后可撤销本决策。
