# ADR 0003: napcat-types 类型垫片取代直接依赖

日期: 2026-10-20
状态: 已采纳 (取代"以 vite build 为唯一验证手段"的旧决策)

## 背景

`npm run typecheck` 会报出 `node_modules/napcat-types@0.0.16` 包内的错误, 与项目源码无关: `napcat-core/packet/transformer/message/UploadForwardMsgV2.ts` 存在语法错误 (TS1068/TS1109/TS1128), 且 `napcat-core` 引用了缺失的 `napcat-protobuf` 模块 (TS2307)。

根因是 `napcat-types` 只发布裸 `.ts` 源码 (零 `.d.ts`), 不是可独立编译的单元。一旦把它当普通依赖引入, `tsc` 会深入第三方源码树并报出大量与业务无关的错误, 使 `pnpm typecheck` 失去判定价值。

旧决策选择退让: 放弃类型检查, 以 `vite build` (esbuild, 不做类型检查) 作为验证手段。代价是源码类型错误在构建期不可见, 只能靠人工过滤 `tsc` 输出。

## 决策

**在 `packages/plugin/tsconfig.json` 用 `paths` 把 `napcat-types/*` 重定向到本地垫片 `packages/plugin/types/napcat-types/`, 恢复 `pnpm typecheck` 作为源码零错的判定手段。**

- 垫片是 0.0.16 的信实手工副本: 类型形状与上游一致, **OneBot 消息类型族退化为 `any`** (含 `ActionMap`, 故 `ctx.actions.call(...)` 四参调用可通过类型检查)。
- 插件对 `napcat-types` **无运行时/构建依赖**: 唯一以「值」使用的 `EventType` 已自持于 `src/onebotEvent.ts`。
- 垫片手动抄录, 升级 `napcat-types` 时需对照同名文件同步。
- 因垫片内已无上游语法错误, 不再需要 `typecheck:test` 之类过滤噪音的脚本 (相关脚本已删除)。

## 理由

- **恢复真判定**: 类型检查回到"源码零错"这一清晰标准, 交给 CI 直接跑, 无需噪音过滤。
- **依赖面收敛**: 插件真正依赖的是 NapCat 注入的 `ctx` 形状与少量 OneBot 结构, 不需要整个 `napcat-core` 的编译。
- **代价可控**: 垫片是静态类型声明, 不参与运行; 抄录成本一次性, 升级时对照同步即可。

## 后果

- `pnpm typecheck` 是有效判定 (CI 与 `pnpm check` 均执行), 垫片之外无第三方类型错误。
- 垫片与上游可能漂移: 升级 `napcat-types` 时必须人工对照 `packages/plugin/types/napcat-types/` 同名文件更新; 漂移的风险面限于类型提示, 不影响运行。
- 消息类型退化 `any` 意味着依赖这些类型的业务代码失去编译期保护, 相关结构 (推送目标、消息段) 需靠各自的工厂函数与运行期校验兜底。
- 若上游改为发布 `.d.ts`, 可撤销本决策, 移除垫片并恢复直接依赖。
