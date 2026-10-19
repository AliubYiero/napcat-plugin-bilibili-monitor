import { useCallback, useState } from 'react';
import type { PluginStatus } from '../types';
import { noAuthFetch } from '../utils/api';

export function useStatus() {
    const [status, setStatus] = useState<PluginStatus | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await noAuthFetch<PluginStatus>('/status');
            if (data.code === 0 && data.data) {
                setStatus(data.data);
            }
        } catch (e) {
            console.error('Status fetch failed:', e);
        }
    }, []);

    return { status, fetchStatus };
}
