/**
 * 文本格式化工具
 * 供消息渲染 (纯文本回退 / SVG 卡片) 共用
 */

/** 格式化时间: YYYY/M/D HH:mm:ss */
export function formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 格式化时长: H:MM:SS */
export function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${h}:${pad(m)}:${pad(s)}`;
}

/** 复合分区文本: 父-子;父为空或等于子只显示子;都为空显示"未知分区" */
export function formatArea(parent?: string, area?: string): string {
    const parentName = parent?.trim() || '';
    const areaName = area?.trim() || '';
    if (!parentName && !areaName) return '未知分区';
    if (!parentName || parentName === areaName)
        return areaName || parentName;
    return `${parentName} - ${areaName}`;
}

/** 直播间链接 */
export function roomUrl(roomId?: number): string {
    return roomId ? `https://live.bilibili.com/${roomId}` : '';
}
