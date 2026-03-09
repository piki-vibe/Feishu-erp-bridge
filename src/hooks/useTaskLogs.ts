// 任务日志 Hook - 从后端获取日志
import { useState, useEffect, useCallback } from 'react';
import { logsApi } from '../services/apiService';

interface WebAPILog {
  id: string;
  instanceId: string;
  timestamp: string;
  recordId: string;
  feishuData?: any;
  requestData?: any;
  responseData?: any;
  writeBackData?: any;
  success: boolean;
  errorMessage?: string;
}

interface UseTaskLogsOptions {
  instanceId?: string;
  enablePolling?: boolean;
  pollingInterval?: number;
}

interface UseTaskLogsReturn {
  webApiLog: WebAPILog | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTaskLogs(options: UseTaskLogsOptions): UseTaskLogsReturn {
  const {
    instanceId,
    enablePolling = false,
    pollingInterval = 2000,
  } = options;

  const [webApiLog, setWebApiLog] = useState<WebAPILog | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载日志
  const loadLog = useCallback(async () => {
    if (!instanceId) {
      setWebApiLog(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await logsApi.getLog(instanceId);
      if (result.success && result.log) {
        setWebApiLog(result.log);
      } else {
        setWebApiLog(null);
      }
    } catch (err: any) {
      if (err.message?.includes('不存在')) {
        // 日志不存在是正常情况（任务还在执行或没有记录）
        setWebApiLog(null);
      } else {
        setError(err.message || '加载日志失败');
      }
    } finally {
      setIsLoading(false);
    }
  }, [instanceId]);

  // 刷新
  const refresh = useCallback(() => loadLog(), [loadLog]);

  // 初始加载
  useEffect(() => {
    loadLog();
  }, [instanceId]);

  // 轮询更新
  useEffect(() => {
    if (!enablePolling || !instanceId) return;

    const interval = setInterval(() => {
      loadLog();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [instanceId, enablePolling, pollingInterval, loadLog]);

  return {
    webApiLog,
    isLoading,
    error,
    refresh,
  };
}

export default useTaskLogs;