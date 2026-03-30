import { create } from 'zustand';
import { authApi, dataApi, accountApi, taskApi, instanceApi, getAuthToken, clearAuthToken } from '../services/apiService';
import type { TaskConfig, TaskInstance, TaskLog, WebAPILog, TaskVerificationStatus } from '../types';
import { TaskStatus } from '../types';
import { normalizeKingdeeApiMethod, normalizeKingdeeOpNumber } from '../utils/kingdeeApi';

// 从 token 中解析用户信息（简单的 base64 解码）
function parseJwt(token: string): { userId: string; username: string; exp?: number } | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

interface Account {
  id: string;
  username: string;
  createdAt: string;
}

interface AccountStore {
  // 当前登录账户
  currentAccount: Account | null;
  // 数据
  tasks: TaskConfig[];
  taskInstances: TaskInstance[];
  // 加载状态
  isLoading: boolean;
  // 是否已初始化（检查 token）
  isInitialized: boolean;

  // 初始化（检查本地 token）
  initialize: () => Promise<void>;

  // 登录/注册/登出
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;

  // 数据操作（自动保存到服务器）
  addTask: (task: Omit<TaskConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTask: (id: string, task: Partial<TaskConfig>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  copyTask: (id: string, newName: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  reorderTasks: (sourceTaskId: string, targetTaskId: string) => Promise<void>;
  updateVerificationStatus: (taskId: string, status: Partial<TaskVerificationStatus>) => Promise<void>;

  // 任务实例
  createTaskInstance: (taskId: string) => Promise<TaskInstance>;
  updateTaskInstance: (id: string, instance: Partial<TaskInstance>) => Promise<void>;
  updateTaskInstanceStatus: (id: string, status: Partial<TaskInstance>) => void;
  deleteTaskInstance: (id: string) => Promise<void>;
  addTaskLog: (instanceId: string, log: TaskLog) => Promise<void>;
  addWebApiLog: (instanceId: string, log: WebAPILog) => Promise<void>;

  // 任务执行
  startTask: (taskId: string) => Promise<TaskInstance>;
  stopTask: (instanceId: string) => Promise<void>;

  // 数据持久化
  saveToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;

  // 导出导入
  exportToFile: () => Promise<void>;
  importFromFile: (file: File) => Promise<void>;

  // 删除账户
  deleteAccount: () => Promise<void>;
}

const cloneFeishuConfig = (config: TaskConfig['feishuConfig']): TaskConfig['feishuConfig'] => ({
  ...config,
  fieldParams: (config.fieldParams || []).map((param) => ({ ...param })),
  filterConditions: (config.filterConditions || []).map((condition) => ({ ...condition })),
  writeBackFields: (config.writeBackFields || []).map((field) => ({ ...field })),
});

const cloneKingdeeConfig = (config: TaskConfig['kingdeeConfig']): TaskConfig['kingdeeConfig'] => ({
  ...config,
  apiMethod: normalizeKingdeeApiMethod(config.apiMethod),
  opNumber: normalizeKingdeeOpNumber(config.opNumber),
  loginParams: { ...config.loginParams },
});

const cloneTaskForStorage = <
  T extends {
    feishuConfig: TaskConfig['feishuConfig'];
    kingdeeConfig: TaskConfig['kingdeeConfig'];
    triggerApi?: TaskConfig['triggerApi'];
    verificationStatus?: TaskVerificationStatus;
  }
>(task: T): T => ({
  ...task,
  feishuConfig: cloneFeishuConfig(task.feishuConfig),
  kingdeeConfig: cloneKingdeeConfig(task.kingdeeConfig),
  triggerApi: task.triggerApi ? { ...task.triggerApi } : undefined,
  verificationStatus: task.verificationStatus ? { ...task.verificationStatus } : undefined,
});

const cloneTaskPatch = (patch: Partial<TaskConfig>): Partial<TaskConfig> => {
  const isolatedPatch: Partial<TaskConfig> = { ...patch };
  if (patch.feishuConfig) {
    isolatedPatch.feishuConfig = cloneFeishuConfig(patch.feishuConfig);
  }
  if (patch.kingdeeConfig) {
    isolatedPatch.kingdeeConfig = cloneKingdeeConfig(patch.kingdeeConfig);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'triggerApi')) {
    isolatedPatch.triggerApi = patch.triggerApi ? { ...patch.triggerApi } : undefined;
  }
  if (patch.verificationStatus) {
    isolatedPatch.verificationStatus = { ...patch.verificationStatus };
  }
  return isolatedPatch;
};

export const useAccountStore = create<AccountStore>((set, get) => ({
  currentAccount: null,
  tasks: [],
  taskInstances: [],
  isLoading: false,
  isInitialized: false,

  // 初始化 - 检查是否有 token，恢复登录状态
  initialize: async () => {
    const token = getAuthToken();
    if (token) {
      // 先检查 token 是否有效（未过期）
      const decoded = parseJwt(token);
      const isTokenExpired = decoded?.exp && (decoded.exp * 1000) < Date.now();

      if (!isTokenExpired && decoded) {
        try {
          // Token 有效，获取用户信息和数据
          const [profile, data] = await Promise.all([
            accountApi.getProfile(),
            dataApi.getData(),
          ]);

          set({
            currentAccount: {
              id: profile.account.id,
              username: profile.account.username,
              createdAt: profile.account.createdAt,
            },
            tasks: data.tasks || [],
            taskInstances: data.taskInstances || [],
            isInitialized: true,
          });
          return;
        } catch (error) {
          console.log('恢复登录状态失败，token 可能已失效:', error);
          // token 可能过期或无效，清除它
          clearAuthToken();
        }
      } else {
        console.log('Token 已过期，需要重新登录');
        clearAuthToken();
      }
    }
    // 没有 token 或 token 无效，设置为已初始化（显示登录界面）
    set({ isInitialized: true });
  },

  // 登录
  login: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const result = await authApi.login(username, password);
      set({
        currentAccount: result.account,
        tasks: result.data.tasks || [],
        taskInstances: result.data.taskInstances || [],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // 注册
  register: async (username: string, password: string) => {
    set({ isLoading: true });
    try {
      const result = await authApi.register(username, password);
      set({
        currentAccount: result.account,
        tasks: [],
        taskInstances: [],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // 登出
  logout: () => {
    authApi.logout();
    set({
      currentAccount: null,
      tasks: [],
      taskInstances: [],
    });
  },

  // 保存到服务器
  saveToServer: async () => {
    const { currentAccount, tasks, taskInstances } = get();
    if (!currentAccount) return;
    await dataApi.saveData(tasks, taskInstances);
  },

  // 从服务器加载
  loadFromServer: async () => {
    const { currentAccount } = get();
    if (!currentAccount) return;

    set({ isLoading: true });
    try {
      const data = await dataApi.getData();
      set({
        tasks: data.tasks || [],
        taskInstances: data.taskInstances || [],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // 添加任务
  addTask: async (task) => {
    const isolatedTask = cloneTaskForStorage(task);
    const newTask: TaskConfig = {
      ...isolatedTask,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
    await get().saveToServer();
  },

  // 更新任务
  updateTask: async (id, task) => {
    const isolatedPatch = cloneTaskPatch(task);
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, ...isolatedPatch, updatedAt: new Date().toISOString() }
          : t
      ),
    }));
    await get().saveToServer();
  },

  // 删除任务
  deleteTask: async (id) => {
    // 先调用后端 API 删除任务及其执行记录文件
    try {
      await taskApi.deleteTask(id);
    } catch (error) {
      console.error('删除任务后端文件失败:', error);
    }

    // 更新前端状态
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      taskInstances: state.taskInstances.filter((i) => i.taskId !== id),
    }));
    await get().saveToServer();
  },

  // 复制任务
  copyTask: async (id, newName) => {
    const task = get().tasks.find((t) => t.id === id);
    if (task) {
      const clonedTask = cloneTaskForStorage(task);
      await get().addTask({
        name: newName,
        description: clonedTask.description,
        feishuConfig: clonedTask.feishuConfig,
        kingdeeConfig: clonedTask.kingdeeConfig,
        verificationStatus: clonedTask.verificationStatus,
        enabled: false,
      });
    }
  },

  // 切换任务状态
  toggleTask: async (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, enabled: !t.enabled } : t
      ),
    }));
    await get().saveToServer();
  },

  // 重新排序任务
  reorderTasks: async (sourceTaskId, targetTaskId) => {
    if (!sourceTaskId || !targetTaskId || sourceTaskId === targetTaskId) {
      return;
    }

    const tasks = get().tasks;
    const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
    const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    const nextTasks = [...tasks];
    const [movedTask] = nextTasks.splice(sourceIndex, 1);
    nextTasks.splice(targetIndex, 0, movedTask);

    set({ tasks: nextTasks });
    await get().saveToServer();
  },

  // 更新任务验证状态
  updateVerificationStatus: async (taskId, status) => {
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const currentStatus = t.verificationStatus || {
          feishuLoginTest: false,
          feishuFieldTest: false,
          kingdeeLoginTest: false,
          fullFlowTest: false,
        };
        return {
          ...t,
          verificationStatus: {
            ...currentStatus,
            ...status,
            lastVerifiedAt: new Date().toISOString(),
          },
        };
      }),
    }));
    await get().saveToServer();
  },

  // 创建任务实例
  createTaskInstance: async (taskId) => {
    const newInstance: TaskInstance = {
      id: Date.now().toString(),
      taskId,
      status: TaskStatus.IDLE,
      logs: [],
      webApiLogs: [],
      progress: 0,
    };
    set((state) => ({
      taskInstances: [...state.taskInstances, newInstance],
    }));
    await get().saveToServer();
    return newInstance;
  },

  // 更新任务实例
  updateTaskInstance: async (id, instance) => {
    set((state) => ({
      taskInstances: state.taskInstances.map((i) =>
        i.id === id ? { ...i, ...instance } : i
      ),
    }));
    await get().saveToServer();
  },

  // 更新任务实例状态（用于轮询，不保存到服务器）
  updateTaskInstanceStatus: (id: string, status: Partial<TaskInstance>) => {
    set((state) => ({
      taskInstances: state.taskInstances.map((i) =>
        i.id === id ? { ...i, ...status } : i
      ),
    }));
  },

  // 删除任务实例
  deleteTaskInstance: async (id) => {
    // 先调用后端 API 删除执行记录文件（后端会同时删除日志）
    try {
      await instanceApi.deleteInstance(id);
    } catch (error) {
      console.error('删除执行记录文件失败:', error);
    }

    // 更新前端状态
    set((state) => ({
      taskInstances: state.taskInstances.filter((i) => i.id !== id),
    }));
    await get().saveToServer();
  },

  // 添加任务日志 - 已废弃，日志由后端管理
  addTaskLog: async (_instanceId, _log) => {
    console.warn('addTaskLog is deprecated, logs are managed by backend');
  },

  // 添加 WebAPI 日志 - 已废弃，日志由后端管理
  addWebApiLog: async (_instanceId, _log) => {
    console.warn('addWebApiLog is deprecated, logs are managed by backend');
  },

  // 开始任务 - 已废弃，任务由后端执行
  startTask: async (taskId) => {
    console.warn('startTask is deprecated, use taskExecutionApi.executeTask instead');
    const instance = await get().createTaskInstance(taskId);
    await get().updateTaskInstance(instance.id, {
      status: TaskStatus.RUNNING,
      startTime: new Date().toISOString(),
    });
    return instance;
  },

  // 停止任务 - 已废弃，任务由后端管理
  stopTask: async (instanceId) => {
    console.warn('stopTask is deprecated, use taskExecutionApi.stopTask instead');
    await get().updateTaskInstance(instanceId, {
      status: TaskStatus.ERROR,
      endTime: new Date().toISOString(),
    });
  },

  // 导出到文件
  exportToFile: async () => {
    await dataApi.exportData();
  },

  // 从文件导入 - 只导入任务配置，追加到现有任务列表
  importFromFile: async (file) => {
    const result = await dataApi.importData(file);
    // 导入的任务会追加到现有任务列表，执行记录保持不变
    set({
      tasks: result.data.tasks || [],
    });
    // 保存到服务器
    await get().saveToServer();
  },

  // 删除账户
  deleteAccount: async () => {
    await accountApi.deleteAccount();
    clearAuthToken();
    set({
      currentAccount: null,
      tasks: [],
      taskInstances: [],
    });
  },
}));
