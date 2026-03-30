// API 服务 - 涓庡悗绔湇鍔″櫒閫氫俊
import type { TaskConfig, TaskInstance } from '../types';

// 浣跨敤鐩稿璺緞锛岄€氳繃 Vite 浠ｇ悊璁块棶鍚庣
const API_BASE_URL = '/api';
const REQUEST_TIMEOUT_MS = 20000;
type JsonObject = Record<string, unknown>;

// 存储 token
let authToken: string | null = localStorage.getItem('auth_token');

// 设置 token
export function setAuthToken(token: string) {
  authToken = token;
  localStorage.setItem('auth_token', token);
}

// 清除 token
export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('auth_token');
}

// 获取 token
export function getAuthToken(): string | null {
  return authToken;
}

// 通用请求函数
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = method === 'GET' ? 1 : 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      let data: JsonObject = {};
      try {
        const parsed: unknown = await response.json();
        if (parsed && typeof parsed === 'object') {
          data = parsed as JsonObject;
        }
      } catch {
        data = {};
      }

      if (!response.ok) {
        const errorMessage = typeof data.error === 'string' ? data.error : `请求失败，状态码: ${response.status}`;
        throw new Error(errorMessage);
      }

      return data as T;
    } catch (error: unknown) {
      const requestError = error instanceof Error ? error : new Error(String(error || '请求失败'));
      if (requestError.name === 'AbortError') {
        lastError = new Error('请求超时，请稍后重试');
      } else if (requestError.message === 'Failed to fetch') {
        lastError = new Error('无法连接到服务器，请确认后端服务已启动');
      } else {
        lastError = requestError;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('请求失败');
}
export const authApi = {
  // 娉ㄥ唽
  register: async (username: string, password: string) => {
    const result = await request<{
      success: boolean;
      token: string;
      account: { id: string; username: string; createdAt: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (result.token) {
      setAuthToken(result.token);
    }
    return result;
  },

  // 登录
  login: async (username: string, password: string) => {
    const result = await request<{
      success: boolean;
      token: string;
      account: { id: string; username: string; createdAt: string };
      data: { tasks: TaskConfig[]; taskInstances: TaskInstance[] };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (result.token) {
      setAuthToken(result.token);
    }
    return result;
  },

  // 登出
  logout: () => {
    clearAuthToken();
  },
};

// 数据相关 API
export const dataApi = {
  // 获取数据
  getData: async () => {
    return request<{ tasks: TaskConfig[]; taskInstances: TaskInstance[] }>('/data');
  },

  // 保存数据
  saveData: async (tasks: TaskConfig[], taskInstances: TaskInstance[]) => {
    return request<{ success: boolean; message: string }>('/data', {
      method: 'POST',
      body: JSON.stringify({ tasks, taskInstances }),
    });
  },

  // 导出数据
  exportData: async () => {
    const response = await fetch(`${API_BASE_URL}/export`, {
      headers: {
        'Authorization': `Bearer ${authToken || ''}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '导出失败');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const contentDisposition = response.headers.get('content-disposition');
    const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 'export.json';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  // 导入数据 - 鍙鍏ヤ换鍔￠厤缃?
  importData: async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);

    // 鍙彂閫佷换鍔￠厤缃紝涓嶅彂閫佹墽琛岃褰?
    return request<{
      success: boolean;
      message: string;
      data: { tasks: TaskConfig[]; importedCount: number };
    }>('/import', {
      method: 'POST',
      body: JSON.stringify({
        tasks: data.tasks || [],
      }),
    });
  },
};

// 浠诲姟绠＄悊 API
export const taskApi = {
  // 鍒犻櫎浠诲姟鍙婂叾鎵€鏈夋墽琛岃褰?
  deleteTask: async (taskId: string) => {
    return request<{ success: boolean; message: string }>(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },
};

// 鎵ц璁板綍绠＄悊 API
export const instanceApi = {
  // 鍒犻櫎鍗曚釜鎵ц记录
  deleteInstance: async (instanceId: string) => {
    return request<{ success: boolean; message: string }>(`/instances/${instanceId}`, {
      method: 'DELETE',
    });
  },
};

// 浠诲姟鎵ц API
export const taskExecutionApi = {
  // 预览第一条匹配记录将发送到金蝶的请求数据（不发送）
  previewRequestData: async (taskId: string) => {
    type PreviewResult = {
      success: boolean;
      message: string;
      preview: {
        apiMethod: string;
        opNumber?: string;
        formId: string;
        recordId: string;
        filterMatchedCount: number;
        feishuFields: Record<string, unknown>;
        formattedData: Record<string, unknown>;
        templateReplacementData: Record<string, unknown>;
        requestData: Record<string, unknown>;
        unresolvedVariables: string[];
      };
    };

    const candidatePaths = [
      `/tasks/${taskId}/preview-request`,
      `/tasks/${taskId}/request-preview`,
      `/tasks/${taskId}/preview`,
    ];

    let lastError: Error | null = null;
    for (const path of candidatePaths) {
      try {
        return await request<PreviewResult>(path, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      } catch (error: unknown) {
        const fallbackError = error instanceof Error ? error : new Error(String(error || '预览请求数据失败'));
        const errorMessage = fallbackError.message;
        const isNotFound = errorMessage.includes('404') || errorMessage.includes('Cannot POST');
        const isTaskMissing = errorMessage.includes('任务不存在');

        if (isTaskMissing) {
          throw fallbackError;
        }

        lastError = fallbackError;
        if (!isNotFound) {
          throw fallbackError;
        }
      }
    }

    throw lastError || new Error('预览请求数据失败');
  },

  // 鍚姩浠诲姟鎵ц
  executeTask: async (taskId: string, options?: { firstRecordOnly?: boolean }) => {
    return request<{
      success: boolean;
      instanceId: string;
      message: string;
    }>(`/tasks/${taskId}/execute`, {
      method: 'POST',
      body: JSON.stringify({
        firstRecordOnly: options?.firstRecordOnly === true,
      }),
    });
  },

  // 鍋滄浠诲姟鎵ц
  stopTask: async (instanceId: string) => {
    return request<{ success: boolean; message: string }>(`/tasks/${instanceId}/stop`, {
      method: 'POST',
    });
  },

  // 鑾峰彇浠诲姟鐘舵€?
  getTaskStatus: async (instanceId: string) => {
    return request<{
      success: boolean;
      status: string;
      progress: number;
      totalCount: number;
      successCount: number;
      errorCount: number;
      isRunning: boolean;
      isStopping?: boolean;
      isStopped?: boolean;
      startTime?: string;
      endTime?: string;
      stopRequestedAt?: string | null;
    }>(`/tasks/${instanceId}/status`);
  },
};

export interface OcrServiceStatus {
  success?: boolean;
  running: boolean;
  baseUrl: string;
  extractUrl: string;
  batchUrl: string;
  supportedFormats: string[];
  lowPowerMode: boolean;
  processIsolated: boolean;
  health: null | {
    status: string;
    engine_ready: boolean;
    max_file_size_mb: number;
    batch_max_files: number;
    ocr_cpu_threads: number;
    keep_model_loaded: boolean;
    process_isolated?: boolean;
  };
  message?: string;
  output?: string;
}

export const ocrControlApi = {
  getStatus: async () => {
    return request<OcrServiceStatus>('/ocr/service/status');
  },

  startService: async () => {
    return request<OcrServiceStatus>('/ocr/service/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  stopService: async () => {
    return request<OcrServiceStatus>('/ocr/service/stop', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};

// 璐︽埛绠＄悊 API
export const accountApi = {
  // 鍒犻櫎璐︽埛
  deleteAccount: async () => {
    return request<{ success: boolean; message: string }>('/account', {
      method: 'DELETE',
    });
  },

  // 鑾峰彇褰撳墠璐︽埛淇℃伅
  getProfile: async () => {
    return request<{
      account: {
        id: string;
        username: string;
        email: string;
        phone: string;
        department: string;
        role: string;
        createdAt: string;
        lastLoginAt: string;
      };
    }>('/account/profile');
  },
};


