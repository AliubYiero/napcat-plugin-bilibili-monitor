# NapCat 插件数据读取与存储范式

本文总结本项目（napcat-plugin-bilibili-monitor）中 store 层进行数据持久化的标准做法。

## 核心背景：为什么不能在模块加载期读数据

NapCat 插件的加载流程是：模块 import（加载所有文件）→ 调用 `plugin_init(ctx)` → 插件正常运行。

- 只有在 `plugin_init` 之后，`ctx`（以及 `ctx.dataPath`、`ctx.logger` 等）才可用。
- `pluginState.ctx` 在未初始化时访问会直接抛错（见 `src/core/state.ts` 的 getter）。
- 因此，**任何 store 在"模块加载阶段"（import 时）都不能触碰 `pluginState.ctx` / 文件 IO**。

由此得出两条铁律：

1. **全局单例**：同一份数据文件在进程内只应有唯一读写入口，避免内存数据与磁盘数据互相覆盖。
2. **延迟实例化 / 延迟读取**：不能在 store 文件被 import 时就创建实例并读文件，必须推迟到真正被业务调用时。

## 正确范式

以 `src/store/bili-live.store.ts` + `src/services/bili-live-store.service.ts` 为例。

### 1. store 文件只定义类并导出类本身

```ts
// src/store/bili-live.store.ts
export class BiliLiveStore extends BaseStore<BiliLiveMonitor> {
    private static instance: BiliLiveStore | null = null;

    // 私有构造函数，禁止外部 new
    private constructor() {
        super(BILI_LIVE_DATA_FILENAME);
    }

    // 单例入口，但注意：类定义本身不调用它
    static getInstance(): BiliLiveStore {
        if (!BiliLiveStore.instance) {
            BiliLiveStore.instance = new BiliLiveStore();
        }
        return BiliLiveStore.instance;
    }

    // 业务方法...
}
// 注意：文件末尾没有 `export const xxxStore = XxxStore.getInstance()`
```

要点：

- 构造函数 `private`，防止绕过单例。
- 只导出**类**，不导出实例。import 该文件不会执行任何 IO。
- `BaseStore` 的构造函数虽然会调用 `loadFromFile()`，但由于实例化被推迟到业务调用时，此时 `plugin_init` 已完成，`ctx.dataPath` 可用，读取是安全的。

### 2. 使用方在调用时惰性获取实例

```ts
// src/services/bili-live-store.service.ts
class BiliLiveStoreService {
    private _biliLiveStore: BiliLiveStore | null = null;

    /** 惰性获取存储实例（避免模块加载期触达未初始化的 pluginState.ctx） */
    private get biliLiveStore(): BiliLiveStore {
        if (!this._biliLiveStore) {
            this._biliLiveStore = BiliLiveStore.getInstance();
        }
        return this._biliLiveStore;
    }

    async add(uid: string, toInfo: BiliLiveMonitorToInfo) {
        // 通过 getter 访问，首次访问时才实例化并读文件
        const hasUid = this.biliLiveStore.has(uid, toInfo);
        // ...
    }
}

export const biliLiveStoreService = new BiliLiveStoreService();
```

要点：

- service 自身可以安全地导出单例（`new BiliLiveStoreService()` 不触发 IO）。
- store 实例通过 **private getter 缓存**（`_xxxStore` + getter）获取：第一次方法调用时才 `getInstance()`，之后复用。
- 也可以不加缓存、每次直接 `XxxStore.getInstance()`（getInstance 内部本身有单例缓存），效果等价，getter 缓存只是省一次静态查表。

## 反例：模块加载期导出单例

一种典型的错误写法（本项目的 `bili-cookie.store.ts` 曾出现过，现已修复）：

```ts
class BiliCookieStore {
    private data: BiliCookieData | null = null;
    // ...
    /** 获取内存数据 (惰性加载)，首次访问时才从文件读取 */
    private ensureLoaded(): BiliCookieData {
        if (!this.data) {
            this.data = this.load(); // 每次 get 方法都要先过一遍
        }
        return this.data;
    }
}

// 错误：文件加载时就创建实例
export const biliCookieStore = BiliCookieStore.getInstance();
```

它的问题：

1. **导出即实例化**。`biliCookieStore` 在 import 时就被创建。虽然它的构造函数本身不读文件（`data` 初始为 `null`），但为了让延迟读取生效，所有读取方法内部都被迫先调用 `this.ensureLoaded()` 做惰性加载兜底——每个 getter 都多一层样板代码，且容易遗漏（新增方法忘记调用 `ensureLoaded()` 就会读到 `null`）。
2. 这实际上是把"延迟实例化"的责任从**调用方**转移到了 **store 内部每一个方法**，模式被拆散在所有方法里，不如正确范式集中、清晰。

该写法之所以长期没出错，是因为它把"构造时不读文件 + `ensureLoaded()` 兜底"绑定在一起；一旦有人把读文件挪进构造函数（直觉上很自然），插件就会在 import 阶段崩溃。正确范式从结构上杜绝了这个隐患。

## 标准范式清单

新建一个 store 时按以下步骤：

1. 继承 `BaseStore<T>`（列表型数据），或自建类并依赖 `pluginState.loadDataFile / saveDataFile`（键值型数据，如 cookie）。
2. `private constructor()`，构造函数内**不做任何文件读取**（列表型由 `BaseStore` 构造统一加载，因其发生在延迟实例化之后所以安全）。
3. 提供 `static getInstance()`，内部持有 `private static instance`。
4. 文件只 `export class`，**不**导出实例常量。
5. 使用方（service / handler）通过 getter 缓存或直接调用 `getInstance()` 在方法内部获取实例。
6. 数据写入后统一走 `saveToFile()` / `save()` 立即持久化，不做批量延迟落盘。

## 与 pluginState 的关系

`src/core/state.ts` 的 `pluginState` 本身也是模块加载期导出的单例（`export const pluginState = new PluginState()`），但它安全，原因是：

- 它的 `ctx` 是 `private _ctx: NapCatPluginContext | null`，getter 中检查未初始化即抛错，**没有任何字段在构造时读取 `ctx`**。
- 真正的 IO（`loadDataFile` / `saveDataFile` / `loadConfig`）全部在 `init(ctx)` 之后才会发生。

也就是说，"单例可以模块加载期导出"的前提是"构造期零 IO"；store 遵循"调用时 `getInstance()`"的范式，是为了让这一约束不依赖每个开发者的自觉，而是由结构保证。
