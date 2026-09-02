// utils/request.ts
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { pluginState } from '../core/state';

// 1. 定义 B 站 API 的通用响应结构
interface BilibiliResponse<T = any> {
    code: number;
    message: string;
    ttl: number;
    data: T;
}

// 2. 创建实例（单例）
const apiBase = 'https://api.live.bilibili.com';

const axiosInstance: AxiosInstance = axios.create({
    baseURL: apiBase,
    timeout: 15000, // B站接口偶尔慢，设长一点
    headers: {
        'Content-Type': 'application/json',
        // B 站服务端会校验 Referer，防止跨域拦截
        Referer: 'https://live.bilibili.com/',
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
});

// 3. 响应拦截器：统一剥离 data 层，并处理全局错误
// axiosInstance.interceptors.response.use(
// 	(response: AxiosResponse<BilibiliResponse>) => {
// 		const { code, message, data } = response.data;
//
// 		// B站业务成功码为 0
// 		if (code === 0) {
// 			// 直接返回 data，调用时不用再写 .data.data
// 			return data;
// 		}
//
// 		// 处理业务错误（如 -400 表示请求错误，-403 表示无权限）
// 		pluginState.ctx.logger.error(`B站API业务错误 [${code}]: ${message}`);
// 		return Promise.reject(new Error(message || '接口业务异常'));
// 	},
// 	(error) => {
// 		// 处理网络超时或 HTTP 状态码错误
// 		console.error('网络请求失败:', error.message);
// 		return Promise.reject(error);
// 	}
// );

// 导出单例实例
export default axiosInstance;
