// base/BaseStore.ts
import { pluginState } from '../core/state';
import { unwrapData, wrapData } from './storeFile';

/**
 * 通用存储基类 (数组型数据文件)
 *
 * 文件顶层统一为 `{ version: 1, data: T[] }`, 见 storeFile.ts。
 * 键值型 (Record<string, T>) 数据文件见 BaseRecordStore。
 *
 * @param T 存储的数据项类型（通常是对象）
 */
export abstract class BaseStore<T> {
    private data: T[] = [];
    private readonly fileName: string;

    constructor(fileName: string) {
        this.fileName = fileName;
        this.data = this.loadFromFile();
    }

    /** 获取所有数据（内存引用） */
    getAll(): T[] {
        return this.data;
    }

    /** 从文件重新加载数据（覆盖内存） */
    reload(): void {
        this.data = this.loadFromFile();
    }

    /** 清空所有数据并保存到文件 */
    reset(): void {
        this.data = [];
        this.saveToFile();
    }

    /** 添加一个新项（直接 push） */
    addItem(item: T): void {
        this.data.push(item);
        this.saveToFile();
    }

    /** 根据条件删除第一个匹配的项，返回是否删除成功 */
    removeItem(predicate: (item: T) => boolean): boolean {
        const index = this.data.findIndex(predicate);
        if (index === -1) return false;
        this.data.splice(index, 1);
        this.saveToFile();
        return true;
    }

    /** 根据条件查找第一个匹配项 */
    findItem(predicate: (item: T) => boolean): T | undefined {
        return this.data.find(predicate);
    }

    /** 根据条件判断是否存在匹配项 */
    hasItem(predicate: (item: T) => boolean): boolean {
        return this.data.some(predicate);
    }

    /** 受保护的文件加载方法（子类可复用/重写） */
    protected loadFromFile(): T[] {
        const unwrapped = unwrapData(
            pluginState.loadDataFile<unknown>(this.fileName, undefined),
        );
        if (!unwrapped) return [];
        if (unwrapped.legacy) {
            pluginState.logger.warn(
                `数据文件 ${this.fileName} 为旧结构, 本次按原样读取, 写入后自动升级`,
            );
        }
        if (!Array.isArray(unwrapped.data)) {
            pluginState.logger.error(
                `数据文件 ${this.fileName} 结构异常, 已回退为空列表`,
            );
            return [];
        }
        return unwrapped.data as T[];
    }

    /** 受保护的文件保存方法（子类可复用/重写） */
    protected saveToFile(): void {
        pluginState.saveDataFile(this.fileName, wrapData(this.data));
    }
}
