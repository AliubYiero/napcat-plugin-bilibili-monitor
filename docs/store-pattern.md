# NapCat 插件数据读取与存储范式

本文是适用于任意 NapCat 插件项目的数据持久化通用范式, 覆盖 store 层的结构约定、实例化时机与正反例。各项目遵循此范式时, 应将持久化类集中在一个 store 目录, 并提供一个全局状态单例 (本文以 `pluginState` 称之, 参见 `packages/plugin/src/core/state.ts`)。

## 核心背景: 为什么不能在模块加载期读数据

NapCat 插件的加载流程是: 模块 import (加载所有文件) → 调用 `plugin_init(ctx)` → 插件正常运行。

- 只有在 `plugin_init` 之后, `ctx` (以及 `ctx.dataPath`、`ctx.logger` 等) 才可用。
- 全局状态单例的 `ctx` 在未初始化时访问会直接抛错。
- 因此, **任何 store 在"模块加载阶段" (import 时) 都不能触碰 `ctx` / 文件 IO**。

由此得出两条铁律:

1. **全局单例**: 同一份数据文件在进程内只应有唯一读写入口, 避免内存数据与磁盘数据互相覆盖。
2. **延迟实例化 / 延迟读取**: 不能在 store 文件被 import 时就创建实例并读文件, 必须推迟到真正被业务调用时。

## 范式正文

### 1. store 文件只定义类并导出类本身

```ts
// packages/plugin/src/store/xxxStore.ts
export class XxxStore extends BaseStore<MonitorItem> {
    private static instance: XxxStore | null = null;

    // 私有构造函数, 禁止外部 new
    private constructor() {
        super(DATA_FILENAME);
    }

    // 单例入口, 但注意: 类定义本身不调用它
    static getInstance(): XxxStore {
        if (!XxxStore.instance) {
            XxxStore.instance = new XxxStore();
        }
        return XxxStore.instance;
    }

    // 业务方法...
}
// 注意: 文件末尾没有 `export const xxxStore = XxxStore.getInstance()`
```

要点:

- 构造函数 `private`, 防止绕过单例。
- 只导出**类**, 不导出实例。import 该文件不会执行任何 IO。
- `BaseStore` 的构造函数会调用 `loadFromFile()`, 但由于实例化被推迟到业务调用时, 此时 `plugin_init` 已完成, `ctx.dataPath` 可用, 读取是安全的。

### 2. 使用方在调用时惰性获取实例

```ts
// packages/plugin/src/services/xxx/storeService.ts
class XxxStoreService {
    private _xxxStore: XxxStore | null = null;

    /** 惰性获取存储实例 (避免模块加载期触达未初始化的全局状态) */
    private get xxxStore(): XxxStore {
        if (!this._xxxStore) {
            this._xxxStore = XxxStore.getInstance();
        }
        return this._xxxStore;
    }

    async add(id: string, target: TargetInfo) {
        // 通过 getter 访问, 首次访问时才实例化并读文件
        const has = this.xxxStore.has(id, target);
        // ...
    }
}

export const xxxStoreService = new XxxStoreService();
```

要点:

- service 自身可以安全地导出单例 (`new XxxStoreService()` 不触发 IO)。
- store 实例通过 **private getter 缓存** (`_xxxStore` + getter) 获取: 第一次方法调用时才 `getInstance()`, 之后复用。
- 也可以不加缓存、每次直接 `XxxStore.getInstance()` (getInstance 内部本身有单例缓存), 效果等价, getter 缓存只是省一次静态查表。

## 反例: 模块加载期导出单例

一种典型的错误写法:

```ts
class XxxStore {
    private data: XxxData | null = null;
    // ...
    /** 获取内存数据 (惰性加载), 首次访问时才从文件读取 */
    private ensureLoaded(): XxxData {
        if (!this.data) {
            this.data = this.load(); // 每个 get 方法都要先过一遍
        }
        return this.data;
    }
}

// 错误: 文件加载时就创建实例
export const xxxStore = XxxStore.getInstance();
```

它的问题:

1. **导出即实例化**。`xxxStore` 在 import 时就被创建。为了让延迟读取生效, 所有读取方法内部都被迫先调用 `this.ensureLoaded()` 做惰性加载兜底——每个 getter 都多一层样板代码, 且容易遗漏 (新增方法忘记调用 `ensureLoaded()` 就会读到 `null`)。
2. 这实际上是把"延迟实例化"的责任从**调用方**转移到了 **store 内部每一个方法**, 模式被拆散在所有方法里, 不如正确范式集中、清晰。

该写法之所以容易长期没被发现, 是因为它把"构造时不读文件 + `ensureLoaded()` 兜底"绑定在一起; 一旦有人把读文件挪进构造函数 (直觉上很自然), 插件就会在 import 阶段崩溃。正确范式从结构上杜绝了这个隐患。

## 文件顶层格式与基类选择

数据文件的顶层格式统一为:

```jsonc
{ "version": 1, "data": /* 数组 或 Record<string, T> */ }
```

- 常量与包裹/解包逻辑在 `store/storeFile.ts` (纯函数模块, 零依赖, 不得 import 任何 store)。
- **写入侧强制包裹; 读取侧兼容未包裹的旧裸结构** —— 读到旧结构时按原样使用并告警,
  下次写入自动升级。这是防"迁移没跑成导致静默清空"的兜底。
- 结构不符时回退为空值 (数组 / 空表) 并记 error 日志, 不抛错。

基类按数据形状二选一, 二者是**兄弟关系而非父子**:

| 基类 | 数据形状 | 示例 |
| --- | --- | --- |
| `BaseStore<T>` | `T[]` | `biliLiveMonitorStore.ts` |
| `BaseRecordStore<T>` | `Record<string, T>` (键通常为 uid 或 `type:id`) | `biliDynRuntimeStore.ts` / `sessionConfigStore.ts` |

硬抽共同父类会让两边的方法签名都变形 (`getAll` 返回引用 vs 浅拷贝、`addItem` 追加 vs `set` 覆盖),
差异不足以撑起抽象。需要在不落盘的前提下做内存剪枝时, 子类直接用 `BaseRecordStore` 暴露的
`protected data`。

带状态机语义的 store (如 `biliLiveRoomStore.ts` 有变化检测与监听器) 不强行继承基类,
只复用 `storeFile.ts` 的常量与解包工具即可。

数据文件拓扑与命名见 `docs/adr/0007-store-file-topology.md`, **不得自行新增或合并文件**。运维健康快照 (轮询时间/失败原因/渲染探测) 不属于业务数据, 只存内存、不建文件 (见 ADR 0013)。

### 会话级配置的承载

会话级配置 (群/好友的启用开关等) 不进插件配置文件, 由独立数据文件承载 (见 ADR 0006):

- 键为 `type:id` (`group:123` / `private:456`), 由 store 导出统一的 key 构造函数。
- **只持久化非默认值**: 写入时把非默认字段写进记录, 恢复默认即删除该字段; 记录为空则删除该记录。
  这样"缺记录"与"显式默认"不会分叉, 文件也不会随会话数无界膨胀。
- **读取侧归一化**: 加载时丢弃非法记录、剔除与默认值相同的字段; 内存只保留最小集合。
- **唯一查询入口是 service** (`sessionConfigService`): 业务代码不直接触碰 store, 也不自行比较字段,
  默认值语义集中在一处 (如启用为 `enabled !== false`, 开播 @全体成员为 `=== true`)。
- 会话门控在消息入口最前端短路, 业务层不再重复判定; 它只门控指令响应, 不门控推送 (推送目标由监听记录决定)。

### 迁移模块纪律

`packages/plugin/src/store/migration/` 下的模块负责把旧数据/旧配置改写成新形状, 在 `loadConfig()` **之前**运行:

- 【必须】只可依赖全局状态单例与纯函数 `storeFile`, **严禁 import 任何 store / service**:
  迁移期属于"初始化早期", 一旦 import 就会在配置尚未加载时实例化 store。
- 【必须】一次性完成并留备份 (`<configFileName>.YYYYMMDDHHmmss.bak`), 便于人工回退。
- 【必须】不再支持的字段只告警不静默丢弃, 迁移结果 (`{ status, warnings, sessionEntries }`) 回给入口打日志。
- 【必须】迁移失败抛错阻止启动 (半迁移的配置比不启动更危险)。

## 标准范式清单

新建一个 store 时按以下步骤:

1. 继承列表型基类 `BaseStore<T>` 或键值型基类 `BaseRecordStore<T>`, 或自建类并依赖全局状态的键值读写方法 (如 `loadDataFile / saveDataFile`)。
2. `private constructor()`, 构造函数内**不做任何文件读取** (由基类构造统一加载, 因其发生在延迟实例化之后所以安全)。
3. 提供 `static getInstance()`, 内部持有 `private static instance`。
4. 文件只 `export class`, **不**导出实例常量。
5. 使用方 (service / handler) 通过 getter 缓存或直接调用 `getInstance()` 在方法内部获取实例。
6. 数据写入后统一走立即持久化方法 (如 `saveToFile()`), 不做批量延迟落盘。
7. 空数组字段在写入前删掉 (`delete`), 不落盘 `[]`: 缺省与"空"在领域上语义不同。

## 与其他范式的关系

- 与**生命周期铁律**的关系: 全局状态单例 (如 `pluginState`) 本身也是模块加载期导出的单例, 但它安全, 前提是"构造期零 IO"——`ctx` 以 nullable 字段持有, getter 中检查未初始化即抛错, 真正的 IO 全部在 `init(ctx)` 之后才发生。store 遵循"调用时 `getInstance()`"的范式, 是为了让这一约束不依赖每个开发者的自觉, 而是由结构保证。见 `development-pattern.md`。
- 与**配置范式**的关系: 配置文件与数据文件共用全局状态的持久化机制, 但配置遵循 `config-pattern.md` 的 FIELDS 单源链路 (外部输入经 `sanitizeConfig`), store 不直接读写配置; 会话级配置由 store 承载但不进配置文件。
- 与**消息发送范式**的关系: store 推送通知时最终调用发送工具, 同样只在运行期调用, 见 `message-send-pattern.md`。
