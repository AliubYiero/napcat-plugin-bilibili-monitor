// base/BaseRecordStore.ts
import { pluginState } from '../core/state';
import { isPlainObject, unwrapData, wrapData } from './storeFile';

/**
 * 通用存储基类 (键值型数据文件, 键通常为 uid 字符串)
 *
 * 文件顶层统一为 `{ version: 1, data: Record<string, T> }`, 见 storeFile.ts。
 * 与 BaseStore 是兄弟关系而非父子: 数组与 Record 的读写语义差异
 * (getAll 返回引用 vs 拷贝、addItem 追加 vs set 覆盖) 不足以撑起
 * 共同的泛型抽象, 硬抽会让两边的方法签名都变形。
 *
 * @param T 存储的数据项类型（通常是对象）
 */
export abstract class BaseRecordStore<T> {
    /** 内存数据表 (protected: 子类需要在不落盘的前提下做内存清理/剪枝) */
    protected data: Record<string, T> = {};
    private readonly fileName: string;

    constructor(fileName: string) {
        this.fileName = fileName;
        this.data = this.loadFromFile();
    }

    /** 获取所有数据 (浅拷贝, 防止外部直接改内部表结构) */
    getAll(): Record<string, T> {
        return { ...this.data };
    }

    /** 按键取值, 不存在返回 undefined */
    get(key: string): T | undefined {
        return this.data[key];
    }

    /** 键是否存在 */
    has(key: string): boolean {
        return Object.hasOwn(this.data, key);
    }

    /** 新增或覆盖一项并保存 */
    set(key: string, value: T): void {
        this.data[key] = value;
        this.saveToFile();
    }

    /** 按键删除一项, 返回是否实际删除 */
    remove(key: string): boolean {
        if (!Object.hasOwn(this.data, key)) return false;
        delete this.data[key];
        this.saveToFile();
        return true;
    }

    /** 所有键 */
    keys(): string[] {
        return Object.keys(this.data);
    }

    /** 从文件重新加载数据（覆盖内存） */
    reload(): void {
        this.data = this.loadFromFile();
    }

    /** 清空所有数据并保存到文件 */
    reset(): void {
        this.data = {};
        this.saveToFile();
    }

    /** 保存前的规范化钩子（子类可重写, 默认不做任何事） */
    protected normalizeBeforeSave(): void {}

    /** 受保护的文件加载方法（子类可复用/重写） */
    protected loadFromFile(): Record<string, T> {
        const unwrapped = unwrapData(
            pluginState.loadDataFile<unknown>(this.fileName, undefined),
        );
        if (!unwrapped) return {};
        if (unwrapped.legacy) {
            pluginState.logger.warn(
                `数据文件 ${this.fileName} 为旧结构, 本次按原样读取, 写入后自动升级`,
            );
        }
        if (!isPlainObject(unwrapped.data)) {
            pluginState.logger.error(
                `数据文件 ${this.fileName} 结构异常, 已回退为空表`,
            );
            return {};
        }
        return unwrapped.data as Record<string, T>;
    }

    /** 受保护的文件保存方法（子类可复用/重写） */
    protected saveToFile(): void {
        this.normalizeBeforeSave();
        pluginState.saveDataFile(this.fileName, wrapData(this.data));
    }
}
