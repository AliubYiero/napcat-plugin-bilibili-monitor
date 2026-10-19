// utils/request.ts
import axios, { type AxiosInstance } from 'axios';

// B 站直播域 API 基地址
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

// 导出单例实例
export default axiosInstance;
