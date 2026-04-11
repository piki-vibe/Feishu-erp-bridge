import { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import {
  Tabs,
  Button,
  Modal,
  Input,
  message,
  Table,
  Popconfirm,
  Switch,
  Progress,
  Tag,
  Typography,
  Badge,
  Tooltip,
  Space,
  Card,
  Row,
  Col,
  Empty,
  Steps,
  Alert,
  Collapse,
  Spin,
} from 'antd';
import type { DragEvent } from 'react';
import {
  PlusOutlined,
  EditOutlined,
  CopyOutlined,
  DeleteOutlined,
  SettingOutlined,
  StopOutlined,
  UnorderedListOutlined,
  HistoryOutlined,
  ClearOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ApiOutlined,
  CloudSyncOutlined,
  LoginOutlined,
  FileSyncOutlined,
  ThunderboltOutlined,
  ExportOutlined,
  ImportOutlined,
  LogoutOutlined,
  UserOutlined,
  LinkOutlined,
  ExperimentOutlined,
  SyncOutlined,
  HolderOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { TaskStatus } from './types';
import type { TaskConfig, TaskInstance, WebAPILog } from './types';
import AuthPage from './components/AuthPage';
import type {
  TaskTestModalType,
  TaskTestResult,
  VerificationTestType,
} from './components/TaskTestModal';
// MobileLayout 缁勪欢宸插鍏ワ紝鐢ㄤ簬绉诲姩绔€傞厤
import { useAccountStore } from './stores/accountStore';
import FeishuService from './services/feishuService';
import KingdeeService from './services/kingdeeService';
import { taskExecutionApi } from './services/apiService';
import { normalizeKingdeeApiMethod, normalizeKingdeeOpNumber } from './utils/kingdeeApi';
// 绉诲姩绔紭鍖栧鍏?
import { useResponsive } from './hooks/useResponsive';
import { BottomNavBar, TopNavBar, MobileTaskCard, MobileTaskInstanceCard, MainLayout } from './components';
import './theme.css';

const { Text } = Typography;
const { TabPane } = Tabs;
const { TextArea } = Input;
const TaskConfigComponent = lazy(() => import('./components/TaskConfig'));
const WebAPIDebugger = lazy(() => import('./components/WebAPIDebugger'));
const TaskTriggerApiPanel = lazy(() => import('./components/TaskTriggerApiPanel'));
const TaskTestModal = lazy(() => import('./components/TaskTestModal'));

type MonitoringTableRow = {
  key: string;
  taskName: string;
  status: TaskStatus;
  progress: number;
  startTime?: string;
  instance: TaskInstance;
};

function renderSectionFallback(tip: string, minHeight = 240) {
  return (
    <div style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" tip={tip} />
    </div>
  );
}

function App() {
  // 鍝嶅簲寮忔娴?
  const { isMobile } = useResponsive();

  // 浠?store 鑾峰彇鐘舵€佸拰鎿嶄綔
  const {
    currentAccount,
    tasks,
    taskInstances,
    logout,
    exportToFile,
    importFromFile,
    addTask,
    updateTask,
    deleteTask,
    copyTask,
    toggleTask,
    reorderTasks,
    deleteTaskInstance,
    loadFromServer,
    updateTaskInstanceStatus,
    isInitialized,
    initialize,
  } = useAccountStore();

  const hasInitializedRef = useRef(false);

  // 鏈湴鐘舵€?
  const [activeTab, setActiveTab] = useState('tasks');

  // 应用启动时先恢复登录态，避免刷新后闪到登录页
  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    initialize().catch((error) => {
      console.error('初始化登录态失败:', error);
    });
  }, [initialize]);

  // Tab切换处理
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskConfig | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskConfig | null>(null);
  const [testTask, setTestTask] = useState<TaskConfig | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<TaskInstance | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testModalType, setTestModalType] = useState<TaskTestModalType>('feishu');
  const [testResult, setTestResult] = useState<TaskTestResult | null>(null);
  const [verificationTestTaskId, setVerificationTestTaskId] = useState<string>('');
  const [showWebApiLogs, setShowWebApiLogs] = useState(false);
  const [loadedWebApiLogs, setLoadedWebApiLogs] = useState<WebAPILog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshingInstances, setRefreshingInstances] = useState(false);
  const [instanceLatestLogs, setInstanceLatestLogs] = useState<Map<string, { timestamp: string; message: string; level: string }>>(new Map());
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const dragTaskIdRef = useRef<string | null>(null);

  // 杞瀹氭椂鍣ㄥ紩鐢?
  const pollingIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pollingRequestingRef = useRef<Map<string, boolean>>(new Map());
  const serverRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMonitoringLogLoadAtRef = useRef(0);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const closeTestModal = useCallback(() => {
    setTestModalOpen(false);
    setTestResult(null);
    setVerificationTestTaskId('');
    setTestTask(null);
  }, []);

  const closeSelectedInstanceModal = useCallback(() => {
    setSelectedInstance(null);
    setLoadedWebApiLogs([]);
  }, []);

  // 娓呯悊鎵€鏈夎疆璇?
  const clearAllPolling = useCallback(() => {
    pollingIntervalsRef.current.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    pollingIntervalsRef.current.clear();
    pollingRequestingRef.current.clear();
    if (serverRefreshTimerRef.current) {
      clearTimeout(serverRefreshTimerRef.current);
      serverRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleServerRefresh = useCallback(() => {
    if (serverRefreshTimerRef.current) {
      return;
    }

    serverRefreshTimerRef.current = setTimeout(async () => {
      serverRefreshTimerRef.current = null;
      try {
        await loadFromServer();
      } catch (error) {
        console.error('刷新任务数据失败', error);
      }
    }, 600);
  }, [loadFromServer]);

  // 寮€濮嬭疆璇换鍔＄姸鎬?
  const startStatusPolling = useCallback((instanceId: string) => {
    // 濡傛灉宸叉湁杞鍦ㄨ繍琛岋紝鍏堟竻闄?
    const existingInterval = pollingIntervalsRef.current.get(instanceId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const intervalId = setInterval(async () => {
      if (pollingRequestingRef.current.get(instanceId)) {
        return;
      }
      pollingRequestingRef.current.set(instanceId, true);

      try {
        const status = await taskExecutionApi.getTaskStatus(instanceId);

        // 鏇存柊瀹炰緥鐘舵€?
        updateTaskInstanceStatus(instanceId, {
          status: status.isStopping ? TaskStatus.PAUSED : (status.status as TaskStatus),
          progress: status.progress,
          totalCount: status.totalCount,
          successCount: status.successCount,
          errorCount: status.errorCount,
          isStopping: status.isStopping === true,
          startTime: status.startTime,
          endTime: status.endTime,
          stopRequestedAt: status.stopRequestedAt ?? null,
        });

        // 浠诲姟瀹屾垚鏃跺仠姝㈣疆璇?
        if (!status.isRunning) {
          const interval = pollingIntervalsRef.current.get(instanceId);
          if (interval) {
            clearInterval(interval);
            pollingIntervalsRef.current.delete(instanceId);
          }
          pollingRequestingRef.current.delete(instanceId);
          // 合并触发刷新，避免多实例并发结束时频繁请求
          scheduleServerRefresh();
        }
      } catch (error) {
        console.error('轮询任务状态失败', error);
      } finally {
        pollingRequestingRef.current.set(instanceId, false);
      }
    }, 3500); // 降低轮询频率，减少页面与后端压力

    pollingIntervalsRef.current.set(instanceId, intervalId);
  }, [updateTaskInstanceStatus, scheduleServerRefresh]);


  // 页面刷新后自动续轮询运行中/停止中的任务
  useEffect(() => {
    const activeStatuses = new Set<TaskStatus>([TaskStatus.RUNNING, TaskStatus.PAUSED]);

    taskInstances.forEach((instance) => {
      if (activeStatuses.has(instance.status) && !pollingIntervalsRef.current.has(instance.id)) {
        startStatusPolling(instance.id);
      }
    });

    pollingIntervalsRef.current.forEach((intervalId, instanceId) => {
      const instance = taskInstances.find((item) => item.id === instanceId);
      if (!instance || !activeStatuses.has(instance.status)) {
        clearInterval(intervalId);
        pollingIntervalsRef.current.delete(instanceId);
        pollingRequestingRef.current.delete(instanceId);
      }
    });
  }, [taskInstances, startStatusPolling]);

  // 缁勪欢鍗歌浇鏃舵竻鐞嗘墍鏈夎疆璇?
  useEffect(() => {
    return () => {
      clearAllPolling();
    };
  }, [clearAllPolling]);

  // 处理登录成功
  const handleLoginSuccess = () => {
    const account = useAccountStore.getState().currentAccount;
    message.success(`欢迎回来，${account?.username}`);
  };

  // 处理登出
  const handleLogout = () => {
    Modal.confirm({
      title: '确认登出',
      content: '登出后将无法查看当前账户的数据，是否继续？',
      onOk: () => {
        logout();
        message.info('已登出');
      },
    });
  };

  // 处理导出
  const handleExport = async () => {
    try {
      await exportToFile();
      message.success('数据导出成功');
    } catch (error: unknown) {
      message.error(`导出失败: ${getErrorMessage(error, '未知错误')}`);
    }
  };

  // 处理导入
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await importFromFile(file);
          message.success('数据导入成功');
        } catch (error: unknown) {
          message.error(`导入失败: ${getErrorMessage(error, '未知错误')}`);
        }
      }
    };
    input.click();
  };

  // 处理保存任务
  const handleSaveTask = async () => {
    if (!formData.name.trim()) {
      message.error('请输入任务名称');
      return;
    }

    if (editingTask) {
      await updateTask(editingTask.id, {
        name: formData.name,
        description: formData.description,
      });
      message.success('任务更新成功');
    } else {
      await addTask({
        name: formData.name,
        description: formData.description,
        enabled: false,
        feishuConfig: {
          appToken: '',
          tableId: '',
          viewId: '',
          fieldParams: [],
          filterConditions: [],
          writeBackFields: [],
          appId: '',
          appSecret: '',
        },
        kingdeeConfig: {
          loginParams: {
            baseUrl: '',
            username: '',
            password: '',
            appId: '',
            appSecret: '',
            dbId: '',
          },
          apiMethod: 'Save',
          opNumber: '',
          formId: '',
          dataTemplate: '',
        },
      });
      message.success('任务创建成功');
    }

    setIsModalOpen(false);
    setFormData({ name: '', description: '' });
    setEditingTask(null);
  };

  // 处理编辑任务
  const handleEditTask = (task: TaskConfig) => {
    setEditingTask(task);
    setFormData({ name: task.name, description: task.description });
    setIsModalOpen(true);
  };

  const cloneTaskConfig = (task: TaskConfig): TaskConfig => ({
    ...task,
    feishuConfig: {
      ...task.feishuConfig,
      fieldParams: (task.feishuConfig.fieldParams || []).map((param) => ({ ...param })),
      filterConditions: (task.feishuConfig.filterConditions || []).map((condition) => ({ ...condition })),
      writeBackFields: (task.feishuConfig.writeBackFields || []).map((field) => ({ ...field })),
    },
    kingdeeConfig: {
      ...task.kingdeeConfig,
      apiMethod: normalizeKingdeeApiMethod(task.kingdeeConfig.apiMethod),
      opNumber: normalizeKingdeeOpNumber(task.kingdeeConfig.opNumber),
      loginParams: { ...task.kingdeeConfig.loginParams },
    },
    triggerApi: task.triggerApi ? { ...task.triggerApi } : undefined,
    verificationStatus: task.verificationStatus ? { ...task.verificationStatus } : undefined,
  });

  // 处理配置任务
  const handleConfigTask = (task: TaskConfig) => {
    setSelectedTask(cloneTaskConfig(task));
    setIsConfigModalOpen(true);
  };

  // 处理保存配置
  const handleSaveConfig = async (config: Partial<TaskConfig>) => {
    if (selectedTask) {
      await updateTask(selectedTask.id, config);
      message.success('配置保存成功');
    }
  };

  const openConfigTestModal = (type: 'feishu' | 'kingdee' | 'kingdee-validate') => {
    if (!selectedTask) {
      message.warning('请先选择任务');
      return;
    }
    setTestTask(selectedTask);
    setTestModalType(type === 'kingdee-validate' ? 'kingdee' : type);
    setTestResult(null);
    setTestModalOpen(true);
  };

  const generateTaskTriggerToken = (): string => {
    const randomBytes = new Uint8Array(24);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(randomBytes);
      return Array.from(randomBytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  };

  const handleGenerateTaskTriggerApi = async (taskId: string, regenerate = false) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      message.error('任务不存在');
      return;
    }

    const now = new Date().toISOString();
    const token = generateTaskTriggerToken();
    await updateTask(taskId, {
      triggerApi: {
        enabled: true,
        token,
        createdAt: task.triggerApi?.createdAt || now,
        updatedAt: now,
      },
    });

    message.success(regenerate ? '触发 API 已重新生成，旧地址已失效' : '触发 API 已生成');
  };

  const handleToggleTaskTriggerApi = async (taskId: string, enabled: boolean) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task?.triggerApi) {
      message.warning('请先生成触发 API');
      return;
    }

    await updateTask(taskId, {
      triggerApi: {
        ...task.triggerApi,
        enabled,
        updatedAt: new Date().toISOString(),
      },
    });

    message.success(enabled ? '触发 API 已启用' : '触发 API 已禁用');
  };

  const handleDeleteTaskTriggerApi = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task?.triggerApi) {
      message.info('该任务尚未配置触发 API');
      return;
    }

    await updateTask(taskId, {
      triggerApi: undefined,
    });

    message.success('触发 API 配置已删除');
  };

  // 澶勭悊寮€濮嬩换鍔?
  const handleStartTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!task.feishuConfig.tableId) {
      message.error('请先配置飞书表格 ID');
      return;
    }

    if (!task.kingdeeConfig.formId) {
      message.error('请先配置金蝶表单 ID');
      return;
    }

    // 执行自动验证
    await executeAutoVerification(taskId);
  };

  // 执行自动验证
  const executeAutoVerification = async (taskId: string, firstRecordOnly = false) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const verificationResults = {
      feishuLogin: { success: false, error: '', token: '' },
      feishuQuery: { success: false, error: '', recordCount: 0 },
      kingdeeLogin: { success: false, error: '' },
    };

    // 显示验证进度弹窗
    const verificationModal = Modal.info({
      title: '正在验证任务配置...',
      content: (
        <div style={{ padding: '20px 0' }}>
          <Steps
            current={-1}
            items={[
              { title: '飞书登录验证', icon: <LoginOutlined /> },
              { title: '数据查询验证', icon: <FileSyncOutlined /> },
              { title: '金蝶登录验证', icon: <LoginOutlined /> },
            ]}
            direction="vertical"
          />
        </div>
      ),
      width: 500,
      footer: null,
      maskClosable: false,
    });

    try {
      // 步骤 1: 飞书登录验证
      verificationModal.update({
        content: (
          <div style={{ padding: '20px 0' }}>
            <Steps
              current={0}
              items={[
                { title: '飞书登录验证', icon: <LoginOutlined />, description: <SyncOutlined spin /> },
                { title: '数据查询验证', icon: <FileSyncOutlined /> },
                { title: '金蝶登录验证', icon: <LoginOutlined /> },
              ]}
              direction="vertical"
            />
          </div>
        ),
      });

      const feishuService = new FeishuService(task.feishuConfig);
      const token = await feishuService.getToken();
      verificationResults.feishuLogin = { success: true, error: '', token };

      // 步骤 2: 飞书数据查询验证
      verificationModal.update({
        content: (
          <div style={{ padding: '20px 0' }}>
            <Steps
              current={1}
              items={[
                { title: '飞书登录验证', icon: <LoginOutlined />, description: <CheckCircleOutlined style={{ color: '#52C41A' }} /> },
                { title: '数据查询验证', icon: <FileSyncOutlined />, description: <SyncOutlined spin /> },
                { title: '金蝶登录验证', icon: <LoginOutlined /> },
              ]}
              direction="vertical"
            />
          </div>
        ),
      });

      if (!task.feishuConfig.tableId) {
        throw new Error('飞书表格 ID 未配置');
      }

      // 这里改为走后端预览接口，使用与“实际执行”一致的筛选与取数逻辑，
      // 避免前端本地校验与执行链路口径不一致，导致显示 0 但实际有数据。
      const previewResult = await taskExecutionApi.previewRequestData(taskId);
      const recordCount = Number(previewResult?.preview?.filterMatchedCount ?? 0);

      verificationResults.feishuQuery = {
        success: true,
        error: '',
        recordCount: Number.isFinite(recordCount) ? recordCount : 0,
      };

      // 步骤 3: 金蝶登录验证
      verificationModal.update({
        content: (
          <div style={{ padding: '20px 0' }}>
            <Steps
              current={2}
              items={[
                { title: '飞书登录验证', icon: <LoginOutlined />, description: <CheckCircleOutlined style={{ color: '#52C41A' }} /> },
                { title: '数据查询验证', icon: <FileSyncOutlined />, description: <CheckCircleOutlined style={{ color: '#52C41A' }} /> },
                { title: '金蝶登录验证', icon: <LoginOutlined />, description: <SyncOutlined spin /> },
              ]}
              direction="vertical"
            />
          </div>
        ),
      });

      const kingdeeService = new KingdeeService(task.kingdeeConfig);
      const kingdeeResult = await kingdeeService.testConnection();

      if (!kingdeeResult.success) {
        throw new Error(kingdeeResult.message);
      }

      verificationResults.kingdeeLogin = { success: true, error: '' };

      // 鍏ㄩ儴楠岃瘉閫氳繃锛屽叧闂繘搴﹀脊绐?
      verificationModal.destroy();

      // 显示验证通过确认弹窗
      Modal.confirm({
        title: (
          <Space>
            <CheckCircleOutlined style={{ color: '#52C41A' }} />
            <span>验证通过：</span>
          </Space>
        ),
        content: (
          <div style={{ padding: '12px 0' }}>
            <div style={{ marginBottom: 12 }}>
              <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 8 }} />
              <span>飞书登录：正常</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 8 }} />
              <span>数据查询：正常，共查询到 <Text strong>{verificationResults.feishuQuery.recordCount}</Text> 条记录</span>
            </div>
            <div>
              <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 8 }} />
              <span>金蝶登录：正常</span>
            </div>
          </div>
        ),
        okText: '开始执行',
        cancelText: '取消',
        onOk: () => {
          startTaskExecution(taskId, firstRecordOnly);
        },
      });
    } catch {
      verificationModal.destroy();

      // 楠岃瘉澶辫触锛屾樉绀洪敊璇俊鎭?
      Modal.error({
        title: <Space><ExclamationCircleOutlined style={{ color: '#FF4D4F' }} /><span>验证失败</span></Space>,
        content: (
          <div style={{ padding: '12px 0' }}>
            <Alert
              message={
                <div>
                  <div style={{ marginBottom: 8 }}>
                    {verificationResults.feishuLogin.success && verificationResults.feishuQuery.success ? (
                      <>
                        <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 8 }} />
                        <span>飞书登录：正常</span>
                      </>
                    ) : verificationResults.feishuLogin.success ? (
                      <>
                        <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 8 }} />
                        <span>飞书登录：正常</span>
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined style={{ color: '#FF4D4F', marginRight: 8 }} />
                        <span>飞书登录：失败</span>
                      </>
                    )}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    {verificationResults.feishuLogin.success && verificationResults.feishuQuery.success ? (
                      <>
                        <CheckCircleOutlined style={{ color: '#52C41A', marginRight: 8 }} />
                        <span>数据查询：正常</span>
                      </>
                    ) : (
                      <>
                        <CloseCircleOutlined style={{ color: '#FF4D4F', marginRight: 8 }} />
                        <span>数据查询：未验证</span>
                      </>
                    )}
                  </div>
                  <div>
                    <CloseCircleOutlined style={{ color: '#FF4D4F', marginRight: 8 }} />
                    <span>金蝶登录：未验证</span>
                  </div>
                </div>
              }
              type="error"
              showIcon={false}
            />
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Button
                type="primary"
                ghost
                onClick={() => {
                  Modal.destroyAll();
                  openVerificationTestModal(taskId);
                }}
              >
                前往验证测试进行详细诊断
              </Button>
            </div>
          </div>
        ),
        width: 500,
        okText: '关闭',
        footer: (_, { OkBtn }) => (
          <>
            <Button
              onClick={() => {
                Modal.destroyAll();
                openVerificationTestModal(taskId);
              }}
            >
              前往验证测试
            </Button>
            <OkBtn />
          </>
        ),
      });
    }
  };

  // 启动任务执行（内部函数）- 调用后端 API
  const startTaskExecution = async (taskId: string, firstRecordOnly = false) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    try {
      // 调用后端 API 启动任务
      const result = await taskExecutionApi.executeTask(taskId, { firstRecordOnly });
      if (result.success) {
        message.success('任务已开始执行');
        // 刷新任务实例列表
        await loadFromServer();
        // 寮€濮嬭疆璇换鍔＄姸鎬?
        if (result.instanceId) {
          startStatusPolling(result.instanceId);
        }
      }
    } catch (error: unknown) {
      message.error(`启动任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  };



  // 处理停止任务 - 调用后端 API
  const handleStopTask = async (instanceId: string) => {
    // 先做前端即时反馈，避免“点了停止还显示运行中”
    updateTaskInstanceStatus(instanceId, {
      status: TaskStatus.PAUSED,
      isStopping: true,
    });

    if (!pollingIntervalsRef.current.has(instanceId)) {
      startStatusPolling(instanceId);
    }

    try {
      const result = await taskExecutionApi.stopTask(instanceId);
      if (result.success) {
        message.success(result.message || '任务正在安全停止，请稍候');
      }
    } catch (error: unknown) {
      // 停止失败时回滚为运行中，避免误导
      updateTaskInstanceStatus(instanceId, {
        status: TaskStatus.RUNNING,
        isStopping: false,
      });
      message.error(`停止任务失败：${getErrorMessage(error, '未知错误')}`);
    }
  };

  // 处理删除单个执行记录
  const handleDeleteInstance = (instanceId: string) => {
    Modal.confirm({
      title: '删除执行记录',
      content: '确定要删除这条执行记录吗？',
      onOk: async () => {
        await deleteTaskInstance(instanceId);
        message.success('执行记录已删除');
      },
    });
  };

  // 加载执行日志。任务日志来自 IndexedDB，WebAPI 日志来自后端文件。
  const loadLogs = async (instanceId: string, loadFull = false) => {
    void loadFull;
    setLogsLoading(true);
    try {
      const { logsApi } = await import('./services/logsApi');

      let webApiLogs: WebAPILog[] = [];
      try {
        const result = await logsApi.getLog(instanceId);
        if (result.success && result.log) {
          webApiLogs = [result.log];
        }
      } catch {
        // 日志不存在，忽略
      }

      setLoadedWebApiLogs(webApiLogs);
    } catch (error: unknown) {
      message.error(`加载日志失败：${getErrorMessage(error, '未知错误')}`);
    } finally {
      setLogsLoading(false);
    }
  };

  // 鍔犺浇鎵€鏈夊疄渚嬬殑鏈€鏂版棩蹇楋紙鐢ㄤ簬绉诲姩绔崱鐗囨樉绀猴級
  const loadAllInstanceLogs = useCallback(async (instances: TaskInstance[] = taskInstances) => {
    try {
      const { logStorage } = await import('./services/logStorage');
      const logsMap = new Map<string, { timestamp: string; message: string; level: string }>();
      const latestInstances = [...instances]
        .sort((a, b) => new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime())
        .slice(0, 30);

      await Promise.all(latestInstances.map(async (instance) => {
        try {
          const logs = await logStorage.getTaskLogs(instance.id, { limit: 1 });
          if (logs.length > 0) {
            logsMap.set(instance.id, {
              timestamp: logs[0].timestamp,
              message: logs[0].message,
              level: logs[0].level,
            });
          }
        } catch {
          // 蹇界暐鍗曚釜瀹炰緥鐨勫姞杞介敊璇?
        }
      }));

      setInstanceLatestLogs(logsMap);
    } catch (error) {
      console.error('加载所有实例日志失败', error);
    }
  }, [taskInstances]);

  // 切换到监控页时节流加载日志，避免频繁重复 IO
  useEffect(() => {
    if (activeTab !== 'monitoring') {
      return;
    }
    const now = Date.now();
    if (now - lastMonitoringLogLoadAtRef.current < 8000) {
      return;
    }
    lastMonitoringLogLoadAtRef.current = now;
    void loadAllInstanceLogs();
  }, [activeTab, taskInstances.length, loadAllInstanceLogs]);

  const handleRefreshInstances = async () => {
    setRefreshingInstances(true);
    try {
      await loadFromServer();
      const latestInstances = useAccountStore.getState().taskInstances || [];
      await loadAllInstanceLogs(latestInstances);
      message.success('执行记录已刷新');
    } catch (error: unknown) {
      message.error(`刷新执行记录失败：${getErrorMessage(error, '未知错误')}`);
    } finally {
      setRefreshingInstances(false);
    }
  };

  // 处理查看实例详情 - 加载完整日志
  const handleViewInstance = (instance: TaskInstance) => {
    setSelectedInstance(instance);
    loadLogs(instance.id, true); // 加载完整日志
  };

  const handleOpenInstanceFromTest = async (instanceId: string) => {
    setActiveTab('monitoring');
    await loadFromServer();
    const latestInstances = useAccountStore.getState().taskInstances;
    const targetInstance = latestInstances.find((item) => item.id === instanceId)
      || taskInstances.find((item) => item.id === instanceId);

    if (!targetInstance) {
      message.warning('未找到对应任务实例，请在执行监控中手动查看');
      return;
    }

    setSelectedInstance(targetInstance);
    await loadLogs(targetInstance.id, true);
  };

  const normalizeDisplayText = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replace(/淇濆瓨澶辫触/g, '保存失败')
      .replace(/鍚屾鎴愬姛/g, '同步成功')
      .replace(/鍚屾澶辫触/g, '同步失败')
      .replace(/鏃犳硶鎻愬彇/g, '无法提取')
      .replace(/鑾峰彇椋炰功浠ょ墝澶辫触/g, '获取飞书令牌失败')
      .replace(/鑾峰彇鏁版嵁澶辫触/g, '获取数据失败')
      .replace(/鑾峰彇椋炰功鏁版嵁澶辫触/g, '获取飞书数据失败')
      .replace(/鍥炲啓鏁版嵁澶辫触/g, '回写数据失败');
  };

  const normalizeDisplayPayload = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return normalizeDisplayText(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => normalizeDisplayPayload(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, normalizeDisplayPayload(inner)])
      );
    }
    return value;
  };

  // 处理清空执行记录
  const handleClearInstances = () => {
    Modal.confirm({
      title: '清空执行记录',
      content: '确定要清空所有执行记录吗？',
      onOk: async () => {
        for (const instance of taskInstances) {
          await deleteTaskInstance(instance.id);
        }
        message.success('执行记录已清空');
      },
    });
  };


  // 打开验证测试弹窗
  const openVerificationTestModal = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      message.error('任务不存在');
      return;
    }
    setVerificationTestTaskId(taskId);
    setTestTask(task);
    setTestModalType('verification');
    setTestResult(null);
    setTestModalOpen(true);
  };

  // 执行验证测试
  const executeVerificationTest = async (testType: VerificationTestType) => {
    const task = tasks.find((t) => t.id === verificationTestTaskId);
    if (!task) {
      message.error('请选择一个任务');
      return;
    }

    setTestResult({ loading: true, type: testType, title: '正在执行测试...' });

    try {
      let result: Omit<TaskTestResult, 'loading'> | null = null;

      if (testType === 'feishu-login') {
        // 飞书登录测试
        if (!task.feishuConfig.appId || !task.feishuConfig.appSecret) {
          throw new Error('请先在任务配置中填写飞书 AppID 和 AppSecret');
        }
        const feishuService = new FeishuService(task.feishuConfig);
        const token = await feishuService.getToken();
        result = {
          success: true,
          type: 'feishu-login',
          title: '飞书登录测试成功',
          details: {
            '应用 ID': task.feishuConfig.appId,
            '应用 Token': task.feishuConfig.appToken,
            '访问令牌': token.slice(0, 20) + '...',
          },
        };
        // 鏇存柊楠岃瘉鐘舵€?
        await useAccountStore.getState().updateVerificationStatus(verificationTestTaskId, { feishuLoginTest: true });
      } else if (testType === 'feishu-field') {
        // 椋炰功瀛楁鏌ヨ/绛涢€?鍥炰紶娴嬭瘯
        if (!task.feishuConfig.tableId) {
          throw new Error('请先在任务配置中填写飞书表格 ID');
        }
        const feishuService = new FeishuService(task.feishuConfig);
        result = await feishuService.testFieldQuery(
          task.feishuConfig.tableId,
          task.feishuConfig.fieldParams,
          task.feishuConfig.filterConditions,
          task.feishuConfig.writeBackFields
        );
        // 鏇存柊楠岃瘉鐘舵€?
        await useAccountStore.getState().updateVerificationStatus(verificationTestTaskId, { feishuFieldTest: result.success });
      } else if (testType === 'kingdee-login') {
        // 金蝶登录测试
        if (!task.kingdeeConfig.loginParams.username || !task.kingdeeConfig.loginParams.password) {
          throw new Error('请先在任务配置中填写金蝶用户名和密码');
        }
        const kingdeeService = new KingdeeService(task.kingdeeConfig);
        const kingdeeResult = await kingdeeService.testConnection();
        result = {
          success: kingdeeResult.success,
          type: 'kingdee-login',
          title: kingdeeResult.success ? '金蝶登录测试成功' : '金蝶登录测试失败',
          message: kingdeeResult.message,
          details: {
            '服务器地址': task.kingdeeConfig.loginParams.baseUrl,
            '用户名': task.kingdeeConfig.loginParams.username,
            '账套 ID': task.kingdeeConfig.loginParams.dbId || '-',
          },
        };
        // 鏇存柊楠岃瘉鐘舵€?
        await useAccountStore.getState().updateVerificationStatus(verificationTestTaskId, { kingdeeLoginTest: kingdeeResult.success });
      } else if (testType === 'request-preview') {
        if (!task.feishuConfig.tableId) {
          throw new Error('请先在任务配置中填写飞书表格 ID');
        }
        if (!task.kingdeeConfig.formId) {
          throw new Error('请先在任务配置中填写金蝶表单 ID');
        }

        const previewResult = await taskExecutionApi.previewRequestData(task.id);
        if (!previewResult.success || !previewResult.preview) {
          throw new Error(previewResult.message || '生成请求数据预览失败');
        }

        const unresolvedVariables = previewResult.preview.unresolvedVariables || [];
        const hasUnresolved = unresolvedVariables.length > 0;
        const previewRequestData = (previewResult.preview.requestData || {}) as Record<string, unknown>;

        result = {
          success: !hasUnresolved,
          type: 'request-preview',
          title: hasUnresolved ? '传入数据预览完成（存在未替换变量）' : '传入数据预览完成',
          message: hasUnresolved
            ? `检测到未替换变量：${unresolvedVariables.join('，')}`
            : '已生成将发送给金蝶的请求数据（未发送）',
          details: {
            '任务 API 方法': previewResult.preview.apiMethod,
            '任务 opNumber': previewResult.preview.opNumber || '-',
            '任务表单 ID': previewResult.preview.formId,
            '请求地址': typeof previewRequestData.requestUrl === 'string' ? previewRequestData.requestUrl : '-',
            '目标服务': typeof previewRequestData.targetBaseUrl === 'string' ? previewRequestData.targetBaseUrl : '-',
            '记录 ID': previewResult.preview.recordId,
            '筛选命中数': previewResult.preview.filterMatchedCount,
            '未替换变量': hasUnresolved ? unresolvedVariables.join(', ') : '无',
          },
          requestData: previewResult.preview.requestData,
          feishuFields: previewResult.preview.feishuFields,
        };
      } else if (testType === 'full-flow') {
        // 完整流程测试
        if (!task.feishuConfig.tableId) {
          throw new Error('请先在任务配置中填写飞书表格 ID');
        }
        if (!task.kingdeeConfig.formId) {
          throw new Error('请先在任务配置中填写金蝶表单 ID');
        }
        // 绗洓椤规祴璇曠洿鎺ユ墽琛屸€滀粎绗竴鏉¤褰曗€濈殑瀹屾暣浠诲姟娴佺▼
        const executeResult = await taskExecutionApi.executeTask(task.id, { firstRecordOnly: true });
        if (!executeResult.success || !executeResult.instanceId) {
          throw new Error(executeResult.message || '启动第一条记录测试任务失败');
        }
        startStatusPolling(executeResult.instanceId);

        const startAt = Date.now();
        const timeoutMs = 180000;
        let statusResult: Awaited<ReturnType<typeof taskExecutionApi.getTaskStatus>> | null = null;
        let lastSnapshot = '';

        const toStatusText = (status: string) => {
          if (status === TaskStatus.RUNNING) return '运行中';
          if (status === TaskStatus.PAUSED) return '停止中';
          if (status === TaskStatus.SUCCESS) return '成功';
          if (status === TaskStatus.ERROR) return '失败';
          if (status === TaskStatus.WARNING) return '部分成功';
          return status;
        };

        setTestResult({
          loading: true,
          success: true,
          type: 'full-flow',
          title: '第一条记录完整流程测试进行中',
          message: `任务实例已启动：${executeResult.instanceId}`,
          instanceId: executeResult.instanceId,
          details: {
            '任务实例ID': executeResult.instanceId,
            '执行状态': '启动中',
            '处理总数': 0,
            '成功数量': 0,
            '失败数量': 0,
            '进度': '0%',
          },
        });

        while (Date.now() - startAt < timeoutMs) {
          statusResult = await taskExecutionApi.getTaskStatus(executeResult.instanceId);
          const snapshot = [
            statusResult.status,
            statusResult.progress,
            statusResult.totalCount,
            statusResult.successCount,
            statusResult.errorCount,
            statusResult.isRunning,
          ].join('|');

          if (snapshot !== lastSnapshot) {
            lastSnapshot = snapshot;
            setTestResult({
              loading: true,
              success: true,
              type: 'full-flow',
              title: '第一条记录完整流程测试进行中',
              message: `当前状态：${toStatusText(statusResult.status)}`,
              instanceId: executeResult.instanceId,
              details: {
                '任务实例ID': executeResult.instanceId,
                '执行状态': toStatusText(statusResult.status),
                '处理总数': statusResult.totalCount ?? 0,
                '成功数量': statusResult.successCount ?? 0,
                '失败数量': statusResult.errorCount ?? 0,
                '进度': `${statusResult.progress ?? 0}%`,
              },
            });
          }

          if (!statusResult.isRunning) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }

        if (!statusResult) {
          throw new Error('未获取到测试任务状态');
        }
        if (statusResult.isRunning) {
          throw new Error('第一条记录完整流程测试超时，请稍后在任务监控中查看结果');
        }

        const fullFlowSuccess =
          statusResult.status === TaskStatus.SUCCESS &&
          (statusResult.successCount ?? 0) > 0 &&
          (statusResult.errorCount ?? 0) === 0;

        result = {
          success: fullFlowSuccess,
          type: 'full-flow',
          title: fullFlowSuccess ? '第一条记录完整流程测试成功' : '第一条记录完整流程测试失败',
          message: fullFlowSuccess
            ? '第一条记录已完成完整流程'
            : `流程执行失败：状态=${statusResult.status}，成功=${statusResult.successCount ?? 0}，失败=${statusResult.errorCount ?? 0}`,
          instanceId: executeResult.instanceId,
          details: {
            '任务实例ID': executeResult.instanceId,
            '执行状态': statusResult.status,
            '处理总数': statusResult.totalCount ?? 0,
            '成功数量': statusResult.successCount ?? 0,
            '失败数量': statusResult.errorCount ?? 0,
            '进度': `${statusResult.progress ?? 0}%`,
          },
        };
        // 鏇存柊楠岃瘉鐘舵€?
        await useAccountStore.getState().updateVerificationStatus(verificationTestTaskId, { fullFlowTest: fullFlowSuccess });
      }

      if (!result) {
        throw new Error('测试结果生成失败');
      }

      setTestResult({ loading: false, ...result });
    } catch (error: unknown) {
      let errorMessage = getErrorMessage(error, '测试失败');
      if (testType === 'request-preview' && errorMessage.includes('404')) {
        errorMessage = '请求预览接口失败（404）。请重启后端后重试，或确认后端已部署最新版本。';
      }
      setTestResult({
        loading: false,
        success: false,
        type: testType,
        title: '测试失败',
        message: errorMessage,
      });
    }
  };

  const handleTaskDragStart = (taskId: string) => (event: DragEvent<HTMLElement>) => {
    dragTaskIdRef.current = taskId;
    setDragOverTaskId(taskId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
  };

  const handleTaskDragOverRow = (targetTaskId: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (dragTaskIdRef.current && dragTaskIdRef.current !== targetTaskId) {
      event.dataTransfer.dropEffect = 'move';
      setDragOverTaskId(targetTaskId);
    }
  };

  const handleTaskDrop = (targetTaskId: string) => async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const sourceTaskId = dragTaskIdRef.current || event.dataTransfer.getData('text/plain');

    if (!sourceTaskId || sourceTaskId === targetTaskId) {
      setDragOverTaskId(null);
      dragTaskIdRef.current = null;
      return;
    }

    try {
      await reorderTasks(sourceTaskId, targetTaskId);
      message.success('任务顺序已更新');
    } catch (error: unknown) {
      console.error('任务排序失败:', error);
      message.error(`任务排序失败: ${getErrorMessage(error, '请稍后重试')}`);
    } finally {
      setDragOverTaskId(null);
      dragTaskIdRef.current = null;
    }
  };

  const handleTaskDragEnd = () => {
    setDragOverTaskId(null);
    dragTaskIdRef.current = null;
  };


  // 浠诲姟绠＄悊琛ㄦ牸鍒?
  const taskColumns = [
    {
      title: '',
      key: 'sort',
      width: 56,
      align: 'center' as const,
      render: (_: unknown, record: TaskConfig) => (
        <span
          className="task-drag-handle"
          draggable
          onDragStart={handleTaskDragStart(record.id)}
          onDragEnd={handleTaskDragEnd}
          title="拖拽排序"
          aria-label={`拖拽排序 ${record.name}`}
        >
          <HolderOutlined />
        </span>
      ),
    },
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string, record: TaskConfig) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            background: record.enabled ? '#52C41A' : '#999',
            flexShrink: 0
          }} />
          <Text strong style={{ fontSize: 14 }}>{text}</Text>
        </div>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      render: (text: string) => (
        <Text
          type="secondary"
          style={{ fontSize: 13, display: 'block', maxWidth: 220 }}
          ellipsis={{ tooltip: text }}
        >
          {text || '-'}
        </Text>
      ),
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 120,
      align: 'center' as const,
      render: (enabled: boolean, record: TaskConfig) => (
        <Switch
          checked={enabled}
          onChange={() => toggleTask(record.id)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          size="small"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 470,
      align: 'center' as const,
      render: (_: unknown, record: TaskConfig) => (
        <Space size={[6, 6]} wrap>
          <Button
            icon={<SettingOutlined />}
            size="small"
            style={{ color: '#1D1D1F', borderColor: 'rgba(0,0,0,0.12)' }}
            onClick={() => handleConfigTask(record)}
          >
            配置
          </Button>
          <Button
            icon={<ExperimentOutlined />}
            size="small"
            style={{ color: '#1D1D1F', borderColor: 'rgba(0,0,0,0.12)' }}
            onClick={() => openVerificationTestModal(record.id)}
          >
            验证测试
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditTask(record)}
          >
            编辑
          </Button>
          <Button
            icon={<CopyOutlined />}
            size="small"
            onClick={() => copyTask(record.id, `${record.name} (副本)`)}
          >
            复制
          </Button>
          <Popconfirm title="确定删除?" onConfirm={() => deleteTask(record.id)}>
            <Button icon={<DeleteOutlined />} size="small" danger>
              删除
            </Button>
          </Popconfirm>
          <Button
            icon={<ThunderboltOutlined />}
            size="small"
            type="primary"
            disabled={!record.enabled}
            onClick={() => handleStartTask(record.id)}
          >
            执行
          </Button>
        </Space>
      ),
    },
  ];

  // 鎵ц鐩戞帶琛ㄦ牸鍒?
  const monitoringColumns = [
    {
      title: '任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 180,
      render: (text: string) => <Text strong style={{ fontSize: 14 }}>{text}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center' as const,
      render: (status: TaskStatus) => {
        const statusConfig: Record<TaskStatus, { color: string; bg: string; text: string; icon: React.ReactNode }> = {
          [TaskStatus.IDLE]: { color: '#999', bg: '#f5f5f5', text: '空闲', icon: <Badge status="default" /> },
          [TaskStatus.RUNNING]: { color: '#1890ff', bg: '#E6F7FF', text: '运行中', icon: <Badge status="processing" /> },
          [TaskStatus.PAUSED]: { color: '#FAAD14', bg: '#FFF7E6', text: '停止中', icon: <Badge status="warning" /> },
          [TaskStatus.SUCCESS]: { color: '#52C41A', bg: '#F6FFED', text: '成功', icon: <Badge status="success" /> },
          [TaskStatus.ERROR]: { color: '#FF4D4F', bg: '#FFF1F0', text: '失败', icon: <Badge status="error" /> },
          [TaskStatus.WARNING]: { color: '#FAAD14', bg: '#FFF7E6', text: '警告', icon: <Badge status="warning" /> },
        };
        const config = statusConfig[status] || statusConfig[TaskStatus.IDLE];
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {config.icon}
            <span style={{ color: config.color, fontWeight: 500, fontSize: 13 }}>{config.text}</span>
          </div>
        );
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 180,
      render: (progress: number, record: MonitoringTableRow) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress 
            percent={progress} 
            size="small" 
            status={
              record.instance.status === TaskStatus.ERROR
                ? 'exception'
                : record.instance.status === TaskStatus.PAUSED
                  ? 'normal'
                  : 'active'
            }
            style={{ flex: 1 }}
          />
          <Text type="secondary" style={{ fontSize: 12, minWidth: 35 }}>{progress}%</Text>
        </div>
      ),
    },
    {
      title: '执行时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      render: (startTime: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>{startTime ? new Date(startTime).toLocaleString() : '-'}</Text>
      ),
    },
    {
      title: '执行结果',
      key: 'result',
      width: 200,
      render: (_: unknown, record: MonitoringTableRow) => {
        const successCount = record.instance.successCount || 0;
        const errorCount = record.instance.errorCount || 0;
        const total = successCount + errorCount;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ 
                width: 32, 
                height: 32, 
                borderRadius: '50%', 
                background: '#F6FFED', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '2px solid #52C41A'
              }}>
                <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 16 }} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#52C41A' }}>{successCount}</div>
                <div style={{ fontSize: 11, color: '#999' }}>成功</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ 
                width: 32, 
                height: 32, 
                borderRadius: '50%', 
                background: '#FFF1F0', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '2px solid #FF4D4F'
              }}>
                <CloseCircleOutlined style={{ color: '#FF4D4F', fontSize: 16 }} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#FF4D4F' }}>{errorCount}</div>
                <div style={{ fontSize: 11, color: '#999' }}>失败</div>
              </div>
            </div>
            {total > 0 && (
              <div style={{ marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid #e8e8e8' }}>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#666' }}>{total}</div>
                <div style={{ fontSize: 11, color: '#999' }}>总计</div>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center' as const,
      render: (_: unknown, record: MonitoringTableRow) => {
        const instance = record.instance;
        const isFinished = instance.status === TaskStatus.SUCCESS || instance.status === TaskStatus.ERROR || instance.status === TaskStatus.WARNING;
        return (
          <Space size="small">
            {instance.status === TaskStatus.RUNNING && (
              <Tooltip title="停止">
                <Button icon={<StopOutlined />} size="small" danger onClick={() => handleStopTask(instance.id)} />
              </Tooltip>
            )}
            <Tooltip title="查看详情">
              <Button icon={<EyeOutlined />} size="small" type="primary" ghost onClick={() => handleViewInstance(instance)} />
            </Tooltip>
            {isFinished && (
              <Popconfirm title="确定删除此执行记录?" onConfirm={() => deleteTaskInstance(instance.id)}>
                <Tooltip title="删除记录">
                  <Button icon={<DeleteOutlined />} size="small" danger />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  if (!isInitialized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="正在恢复登录状态..." />
      </div>
    );
  }

  // 濡傛灉娌℃湁鐧诲綍锛屾樉绀虹櫥褰曢〉闈?
  if (!currentAccount) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  const sharedModals = (
    <>
      <Modal
        open={isModalOpen}
        onOk={handleSaveTask}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingTask(null);
          setFormData({ name: '', description: '' });
        }}
        okText="保存"
        cancelText="取消"
        className="custom-modal"
        title={editingTask ? '编辑任务' : '新建任务'}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
              任务名称 <span style={{ color: '#FF4D4F' }}>*</span>
            </label>
            <Input
              placeholder="请输入任务名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>任务描述</label>
            <TextArea
              placeholder="请输入任务描述（可选）"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title="任务配置"
        open={isConfigModalOpen}
        onCancel={() => {
          setIsConfigModalOpen(false);
          setSelectedTask(null);
        }}
        footer={null}
        width={1080}
        className="custom-modal"
      >
        {selectedTask ? (
          <Suspense fallback={renderSectionFallback('正在加载任务配置...', 220)}>
            <TaskConfigComponent
              task={selectedTask}
              onSave={handleSaveConfig}
              onTest={openConfigTestModal}
            />
          </Suspense>
        ) : null}
      </Modal>

      <Modal
        title="任务执行详情"
        open={!!selectedInstance}
        onCancel={closeSelectedInstanceModal}
        footer={[
          <Button key="close" onClick={closeSelectedInstanceModal}>
            关闭
          </Button>,
        ]}
        width={820}
        className="custom-modal"
      >
        {selectedInstance ? (
          <div>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} md={8}>
                <Card size="small">
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>任务名称</div>
                  <div style={{ fontWeight: 600 }}>{tasks.find(t => t.id === selectedInstance.taskId)?.name || '-'}</div>
                </Card>
              </Col>
              <Col xs={12} md={8}>
                <Card size="small">
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>状态</div>
                  <div>
                    <Tag color={selectedInstance.status === TaskStatus.RUNNING ? 'blue' : selectedInstance.status === TaskStatus.PAUSED ? 'orange' : selectedInstance.status === TaskStatus.SUCCESS ? 'green' : selectedInstance.status === TaskStatus.WARNING ? 'orange' : 'default'}>
                      {selectedInstance.status === TaskStatus.RUNNING ? '执行中' :
                        selectedInstance.status === TaskStatus.PAUSED ? '停止中' :
                          selectedInstance.status === TaskStatus.SUCCESS ? '成功' :
                            selectedInstance.status === TaskStatus.WARNING ? '部分成功' : '失败'}
                    </Tag>
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={8}>
                <Card size="small">
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>进度</div>
                  <div>{selectedInstance.progress}%</div>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small">
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>开始时间</div>
                  <div>{selectedInstance.startTime ? new Date(selectedInstance.startTime).toLocaleString('zh-CN') : '-'}</div>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small">
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>结束时间</div>
                  <div>{selectedInstance.endTime ? new Date(selectedInstance.endTime).toLocaleString('zh-CN') : '执行中...'}</div>
                </Card>
              </Col>
            </Row>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>执行进度</div>
              <Progress
                percent={selectedInstance.progress}
                status={
                  selectedInstance.status === TaskStatus.ERROR ? 'exception' :
                    selectedInstance.status === TaskStatus.SUCCESS ? 'success' :
                      'active'
                }
              />
            </div>

            <Card size="small" style={{ marginBottom: 16, background: '#FFF8E7', border: '1px solid #FFD88A' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <ApiOutlined style={{ color: '#F5A623' }} />
                  <Text strong>WebAPI 调用详情</Text>
                </Space>
                <Button
                  type="primary"
                  size="small"
                  style={{ background: '#F5A623', borderColor: '#F5A623' }}
                  onClick={() => {
                    setShowWebApiLogs(true);
                    void loadLogs(selectedInstance.id, true);
                  }}
                >
                  查看详情
                </Button>
              </div>
            </Card>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="WebAPI 调用详情（第一条记录）"
        open={showWebApiLogs && !!selectedInstance}
        onCancel={() => {
          setShowWebApiLogs(false);
        }}
        footer={[
          <Button key="close" onClick={() => { setShowWebApiLogs(false); }}>
            关闭
          </Button>,
        ]}
        width={900}
        className="custom-modal"
      >
        {selectedInstance ? (
          <div>
            {logsLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
            ) : loadedWebApiLogs.length === 0 ? (
              <Empty description="暂无 WebAPI 调用记录（任务可能未执行到数据同步阶段）" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '40px 0' }} />
            ) : (() => {
              const firstLog = loadedWebApiLogs[0];
              return (
                <div>
                  <Card
                    size="small"
                    title={<Space><Text strong>Record ID: {firstLog.recordId}</Text>{firstLog.success ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>}</Space>}
                    style={{ marginBottom: 16 }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary">调用时间:</Text>
                      <Text style={{ marginLeft: 8 }}>{new Date(firstLog.timestamp).toLocaleString()}</Text>
                    </div>
                    {firstLog.errorMessage ? (
                      <div style={{ marginBottom: 16 }}>
                        <Text type="danger">错误信息：{normalizeDisplayText(firstLog.errorMessage)}</Text>
                      </div>
                    ) : null}
                  </Card>
                  <Collapse
                    defaultActiveKey={['feishu', 'request', 'response', 'writeback']}
                    items={[
                      {
                        key: 'feishu',
                        label: '📄 飞书原始数据',
                        children: <pre style={{ margin: 0, fontSize: 11, maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>{JSON.stringify(normalizeDisplayPayload(firstLog.feishuData), null, 2)}</pre>,
                      },
                      {
                        key: 'request',
                        label: '📥 发送到金蝶的完整请求',
                        children: <pre style={{ margin: 0, fontSize: 11, maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>{JSON.stringify(normalizeDisplayPayload(firstLog.requestData), null, 2)}</pre>,
                      },
                      {
                        key: 'response',
                        label: '📥 金蝶响应数据',
                        children: <pre style={{ margin: 0, fontSize: 11, maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>{JSON.stringify(normalizeDisplayPayload(firstLog.responseData), null, 2)}</pre>,
                      },
                      {
                        key: 'writeback',
                        label: '↩️ 数据回写的数据',
                        children: firstLog.writeBackData && Object.keys(firstLog.writeBackData).length > 0 ? (
                          <div>
                            <pre style={{ margin: 0, fontSize: 11, maxHeight: 300, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>{JSON.stringify(normalizeDisplayPayload(firstLog.writeBackData), null, 2)}</pre>
                            {firstLog.writeBackError ? (
                              <Alert type="error" message={normalizeDisplayText(firstLog.writeBackError)} style={{ marginTop: 8 }} />
                            ) : null}
                          </div>
                        ) : <Empty description="无回写数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
                      },
                    ]}
                  />
                </div>
              );
            })()}
          </div>
        ) : null}
      </Modal>

      {testModalOpen ? (
        <Suspense fallback={null}>
          <TaskTestModal
            open={testModalOpen}
            modalType={testModalType}
            selectedTaskName={testTask?.name}
            result={testResult}
            onClose={closeTestModal}
            onRunVerificationTest={executeVerificationTest}
            onOpenInstance={handleOpenInstanceFromTest}
            onExecuteTask={() => {
              closeTestModal();
              window.setTimeout(() => {
                void executeAutoVerification(verificationTestTaskId);
              }, 100);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );

  // 移动端视图
  if (isMobile) {
    return (
      <>
        <div className="app-container mobile-view">
        <TopNavBar
          title="云桥"
          rightContent={<Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} size="small" />}
        />
        <div className="mobile-content-wrapper">
          {activeTab === 'tasks' && (
            <>
              <div className="mobile-stat-cards">
                <Card className="stat-card" size="small">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>总任务数</Text>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: '#5f7e56' }}>{tasks.length}</div>
                    </div>
                    <div style={{ width: 40, height: 40, background: '#edf4e8', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UnorderedListOutlined style={{ fontSize: 20, color: '#5f7e56' }} />
                    </div>
                  </div>
                </Card>
                <Card className="stat-card" size="small">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>今日执行</Text>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: '#6a9060' }}>
                        {taskInstances.filter(i => i.startTime && new Date(i.startTime).toDateString() === new Date().toDateString()).length}
                      </div>
                    </div>
                    <div style={{ width: 40, height: 40, background: '#f1f8ec', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CheckCircleOutlined style={{ fontSize: 20, color: '#6a9060' }} />
                    </div>
                  </div>
                </Card>
                <Card className="stat-card" size="small">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>今日失败</Text>
                      <div style={{ fontSize: 24, fontWeight: 'bold', color: '#b66b57' }}>
                        {taskInstances.filter(i => i.startTime && new Date(i.startTime).toDateString() === new Date().toDateString() && i.status === TaskStatus.ERROR).length}
                      </div>
                    </div>
                    <div style={{ width: 40, height: 40, background: '#fbf1ed', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <CloseCircleOutlined style={{ fontSize: 20, color: '#b66b57' }} />
                    </div>
                  </div>
                </Card>
              </div>
              <div className="mobile-task-list" style={{ position: 'relative', zIndex: 100, paddingBottom: '70px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 16 }}>任务列表</Text>
                  <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => { setEditingTask(null); setFormData({ name: '', description: '' }); setIsModalOpen(true); }}>新建</Button>
                </div>
                {tasks.length === 0 ? (
                  <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : (
                  tasks.map(task => (
                    <MobileTaskCard
                      key={task.id}
                      task={task}
                      onEdit={() => { setEditingTask(task); setFormData({ name: task.name, description: task.description || '' }); setIsModalOpen(true); }}
                      onConfig={() => handleConfigTask(task)}
                      onTest={() => {
                        openVerificationTestModal(task.id);
                      }}
                      onExecute={() => handleStartTask(task.id)}
                      onToggle={() => toggleTask(task.id)}
                    />
                  ))
                )}
              </div>
              <div className="mobile-actions">
                <Button block icon={<ExportOutlined />} onClick={handleExport} size="large">导出数据</Button>
                <Button block icon={<ImportOutlined />} onClick={handleImport} size="large" style={{ marginTop: 8 }}>导入数据</Button>
              </div>
            </>
          )}
          {activeTab === 'monitoring' && (
            <div className="mobile-monitoring">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ fontSize: 16 }}>执行记录</Text>
                <Space size={8}>
                  <Button
                    icon={<SyncOutlined />}
                    onClick={handleRefreshInstances}
                    loading={refreshingInstances}
                    size="small"
                  >
                    刷新
                  </Button>
                  <Button icon={<ClearOutlined />} onClick={handleClearInstances} disabled={taskInstances.length === 0} size="small">清空</Button>
                </Space>
              </div>
              {taskInstances.length === 0 ? (<Empty description="暂无执行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />) : (
                taskInstances.map(instance => {
                  const task = tasks.find(t => t.id === instance.taskId);
                  const latestLog = instanceLatestLogs.get(instance.id);
                  return (
                    <MobileTaskInstanceCard
                      key={instance.id}
                      instance={instance}
                      taskName={task?.name}
                      onStop={() => handleStopTask(instance.id)}
                      onDelete={() => handleDeleteInstance(instance.id)}
                      onViewLogs={() => { setSelectedInstance(instance); setShowWebApiLogs(true); loadLogs(instance.id, true); }}
                      latestLog={latestLog}
                    />
                  );
                })
              )}
            </div>
          )}
          {activeTab === 'debugger' && (
            <div className="mobile-debugger">
              <Suspense fallback={renderSectionFallback('正在加载 WebAPI 调试面板...')}>
                <WebAPIDebugger />
              </Suspense>
            </div>
          )}
          {activeTab === 'trigger-api' && (
            <div className="mobile-trigger-api">
              <Suspense fallback={renderSectionFallback('正在加载任务触发 API 面板...')}>
                <TaskTriggerApiPanel
                  tasks={tasks}
                  onGenerate={handleGenerateTaskTriggerApi}
                  onToggle={handleToggleTaskTriggerApi}
                  onDelete={handleDeleteTaskTriggerApi}
                />
              </Suspense>
            </div>
          )}
          {activeTab === 'profile' && (
            <div className="mobile-profile">
              <Card className="stat-card" size="small" style={{ marginBottom: 12 }}>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ width: 60, height: 60, background: '#edf4e8', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <UserOutlined style={{ fontSize: 30, color: '#5f7e56' }} />
                  </div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>{currentAccount?.username}</h3>
                  <Text type='secondary' style={{ fontSize: 13 }}>注册时间：{new Date(currentAccount?.createdAt || Date.now()).toLocaleDateString('zh-CN')}</Text>
                </div>
              </Card>
              <div className="mobile-actions">
                <Button block icon={<ExportOutlined />} onClick={handleExport} size="large">导出数据</Button>
                <Button block icon={<ImportOutlined />} onClick={handleImport} size="large" style={{ marginTop: 8 }}>导入数据</Button>
                    <Button block danger icon={<LogoutOutlined />} onClick={handleLogout} size="large" style={{ marginTop: 8 }}>退出登录</Button>
              </div>
            </div>
          )}
        </div>
        <BottomNavBar
          activeKey={activeTab}
          onTabChange={setActiveTab}
          items={[
            { key: 'tasks', label: '任务', icon: <UnorderedListOutlined /> },
            { key: 'monitoring', label: '监控', icon: <HistoryOutlined /> },
            { key: 'debugger', label: 'API', icon: <ApiOutlined /> },
            { key: 'trigger-api', label: '触发', icon: <LinkOutlined /> },
            { key: 'profile', label: '我的', icon: <UserOutlined /> },
          ]}
        />
      </div>
      {sharedModals}
      </>
    );
  }

return (
  <>
    <MainLayout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onLogout={handleLogout}
    >
      <>
          {/* 操作指引 */}
          {showGuide && currentAccount && (
            <div
              className="animate-fade-in-up guide-banner"
              style={{
                marginBottom: 16,
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.01em' }}>
                  快速上手
                </span>
                <div style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {([
                    { num: '01', label: '新建任务' },
                    { num: '02', label: '配置连接' },
                    { num: '03', label: '测试验证' },
                    { num: '04', label: '启用执行' },
                  ] as { num: string; label: string }[]).map((step, i, arr) => (
                    <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 20, height: 20,
                          borderRadius: 5,
                          background: 'rgba(0,0,0,0.05)',
                          color: '#1D1D1F',
                          fontSize: 10,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          letterSpacing: '-0.02em',
                          flexShrink: 0,
                        }}>{step.num}</span>
                        <span style={{ fontSize: 13, color: '#6E6E73', fontWeight: 400, whiteSpace: 'nowrap' }}>
                          {step.label}
                        </span>
                      </div>
                      {i < arr.length - 1 && (
                        <RightOutlined style={{ fontSize: 8, color: 'rgba(0,0,0,0.18)', margin: '0 10px' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setShowGuide(false)}
                style={{ color: 'rgba(0,0,0,0.25)', padding: '0 4px', marginLeft: 12, flexShrink: 0 }}
              />
            </div>
          )}

          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            className="custom-tabs"
            tabBarStyle={{ display: 'none' }}
          >
            <TabPane tab={<span><UnorderedListOutlined />任务管理</span>} key="tasks">
              <div>
                <div className="task-toolbar">
                  <div className="task-title-block">
                    <Text strong style={{ fontSize: 16 }}>任务列表</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>拖拽左侧手柄可调整执行顺序</Text>
                  </div>
                  <Space wrap>
                    <Button icon={<ExportOutlined />} onClick={handleExport}>
                      导出
                    </Button>
                    <Button icon={<ImportOutlined />} onClick={handleImport}>
                      导入
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingTask(null);
                        setFormData({ name: '', description: '' });
                        setIsModalOpen(true);
                      }}
                    >
                      新建任务
                    </Button>
                  </Space>
                </div>
                <Text type="secondary" className="task-result-hint">
                  共 {tasks.length} 个任务
                </Text>
                <Table
                  columns={taskColumns}
                  dataSource={tasks.map((task) => ({ ...task, key: task.id }))}
                  pagination={false}
                  className="custom-table"
                  tableLayout="fixed"
                  scroll={{ x: 1080 }}
                  rowClassName={(record: TaskConfig) => (record.id === dragOverTaskId ? 'task-row-drag-over' : '')}
                  onRow={(record: TaskConfig) => ({
                    onDragOver: handleTaskDragOverRow(record.id),
                    onDrop: handleTaskDrop(record.id),
                  })}
                  locale={{ emptyText: <Empty description="暂无任务，点击上方按钮创建新任务" /> }}
                />
              </div>
            </TabPane>

            <TabPane tab={<span><HistoryOutlined />执行监控</span>} key="monitoring">
              <div>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong style={{ fontSize: 16 }}>执行记录</Text>
                  <Space>
                    <Button icon={<SyncOutlined />} onClick={handleRefreshInstances} loading={refreshingInstances}>
                      刷新
                    </Button>
                    <Button icon={<ClearOutlined />} onClick={handleClearInstances} disabled={taskInstances.length === 0}>
                      清空记录
                    </Button>
                  </Space>
                </div>
                <Table
                  columns={monitoringColumns}
                  dataSource={taskInstances.map((instance) => ({
                    key: instance.id,
                    taskName: tasks.find((t) => t.id === instance.taskId)?.name || 'Unknown',
                    status: instance.status,
                    progress: instance.progress,
                    startTime: instance.startTime,
                    instance,
                  }))}
                  pagination={{ pageSize: 10 }}
                  className="custom-table"
                  scroll={{ x: 900 }}
                  locale={{ emptyText: <Empty description="暂无执行记录" /> }}
                />
              </div>
            </TabPane>

            <TabPane tab={<span><ApiOutlined />WebAPI调试</span>} key="debugger">
              <Suspense fallback={renderSectionFallback('正在加载 WebAPI 调试面板...')}>
                <WebAPIDebugger />
              </Suspense>
            </TabPane>

            <TabPane tab={<span><LinkOutlined />任务触发 API</span>} key="trigger-api">
              <Suspense fallback={renderSectionFallback('正在加载任务触发 API 面板...')}>
                <TaskTriggerApiPanel
                  tasks={tasks}
                  onGenerate={handleGenerateTaskTriggerApi}
                  onToggle={handleToggleTaskTriggerApi}
                  onDelete={handleDeleteTaskTriggerApi}
                />
              </Suspense>
            </TabPane>
          </Tabs>
      </>
    </MainLayout>
    {sharedModals}
  </>
);
}
export default App;







