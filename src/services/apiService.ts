// API 服务 - 与后端服务器通信
import type { TaskConfig, TaskInstance } from '../types';

// 使用相对路径，通过 Vite 代理访问后端
const API_BASE_URL = '/api';

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

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    let data: any;
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || `请求失败：${response.status}`);
    }

    return data;
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      throw new Error('无法连接到服务器，请确保后端服务已启动');
    }
    throw error;
  }
}

// 账户相关 API
export const authApi = {
  // 注册
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

  // 导入数据 - 只导入任务配置
  importData: async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);

    // 只发送任务配置，不发送执行记录
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

// 任务管理 API
export const taskApi = {
  // 删除任务及其所有执行记录
  deleteTask: async (taskId: string) => {
    return request<{ success: boolean; message: string }>(`/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },
};

// 执行记录管理 API
export const instanceApi = {
  // 删除单个执行记录
  deleteInstance: async (instanceId: string) => {
    return request<{ success: boolean; message: string }>(`/instances/${instanceId}`, {
      method: 'DELETE',
    });
  },
};

// 任务执行 API
export const taskExecutionApi = {
  // 启动任务执行
  executeTask: async (taskId: string) => {
    return request<{
      success: boolean;
      instanceId: string;
      message: string;
    }>(`/tasks/${taskId}/execute`, {
      method: 'POST',
    });
  },

  // 停止任务执行
  stopTask: async (instanceId: string) => {
    return request<{ success: boolean; message: string }>(`/tasks/${instanceId}/stop`, {
      method: 'POST',
    });
  },

  // 获取任务状态
  getTaskStatus: async (instanceId: string) => {
    return request<{
      success: boolean;
      status: string;
      progress: number;
      totalCount: number;
      successCount: number;
      errorCount: number;
      isRunning: boolean;
      startTime?: string;
      endTime?: string;
    }>(`/tasks/${instanceId}/status`);
  },
};

// 日志 API
export const logsApi = {
  // 保存 WebAPI 日志
  saveWebApiLog: async (data: {
    instanceId: string;
    recordId: string;
    feishuData?: any;
    requestData?: any;
    responseData?: any;
    writeBackData?: any;
    success: boolean;
    errorMessage?: string;
  }) => {
    return request<{ success: boolean; saved: boolean; message: string }>('/logs/webapi', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 获取日志
  getLog: async (instanceId: string) => {
    return request<{
      success: boolean;
      log: {
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
      };
    }>(`/logs/${instanceId}`);
  },

  // 删除日志
  deleteLog: async (instanceId: string) => {
    return request<{ success: boolean; message: string }>(`/logs/${instanceId}`, {
      method: 'DELETE',
    });
  },
};

// 账户管理 API
export const accountApi = {
  // 删除账户
  deleteAccount: async () => {
    return request<{ success: boolean; message: string }>('/account', {
      method: 'DELETE',
    });
  },

  // 获取当前账户信息
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
