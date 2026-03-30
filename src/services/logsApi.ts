import type { WebAPILog } from '../types';

const API_BASE_URL = '/api';
const REQUEST_TIMEOUT_MS = 20000;

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const token = localStorage.getItem('auth_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `请求失败，状态码: ${response.status}`);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    if (error instanceof Error && error.message === 'Failed to fetch') {
      throw new Error('无法连接到服务器，请确认后端服务已启动');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export interface SaveWebApiLogPayload {
  instanceId: string;
  recordId: string;
  feishuData?: unknown;
  requestData?: unknown;
  responseData?: unknown;
  writeBackData?: unknown;
  success: boolean;
  errorMessage?: string;
}

export const logsApi = {
  saveWebApiLog: async (data: SaveWebApiLogPayload) => request<{ success: boolean; saved: boolean; message: string }>('/logs/webapi', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getLog: async (instanceId: string) => request<{ success: boolean; log: WebAPILog }>(`/logs/${instanceId}`),

  deleteLog: async (instanceId: string) => request<{ success: boolean; message: string }>(`/logs/${instanceId}`, {
    method: 'DELETE',
  }),
};
