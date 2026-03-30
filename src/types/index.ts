// 任务状态
export const TaskStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

// 任务验证状态
export interface TaskVerificationStatus {
  feishuLoginTest: boolean;
  feishuFieldTest: boolean;
  kingdeeLoginTest: boolean;
  fullFlowTest: boolean;
  lastVerifiedAt?: string;
}

// 字段处理类型
export type FieldProcessType =
  | 'auto'
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'person'
  | 'phone';

export interface FeishuFieldMeta {
  fieldId: string;
  fieldName: string;
  fieldType: number;
  uiType?: string;
  isPrimary?: boolean;
  property?: any;
}

// 飞书字段参数
export interface FeishuFieldParam {
  id: string;
  variableName: string;
  fieldName: string;
  processType?: FieldProcessType;
  decimalPlaces?: number;
  dateFormat?: 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'YYYYMMDD' | 'timestamp';
  sourceFieldType?: number;
  sourceUiType?: string;
  sourceFieldId?: string;
}

// 筛选条件
export interface FilterCondition {
  id: string;
  fieldName: string;
  operator: 'eq' | 'ne' | 'contains' | 'notContains' | 'isEmpty' | 'isNotEmpty';
  value?: string;
}

// 回写字段配置
export interface WriteBackField {
  id: string;
  fieldName: string;
  source: 'success' | 'error' | 'response' | 'status';
  jsonPath?: string;
}

// 飞书配置
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
  viewId?: string;
  fieldParams: FeishuFieldParam[];
  filterConditions?: FilterCondition[];
  writeBackFields?: WriteBackField[];
}

// 金蝶登录参数
export interface KingdeeLoginParams {
  appId: string;
  appSecret: string;
  username: string;
  password: string;
  baseUrl: string;
  acctId?: string;
  dbId?: string;
}

// 金蝶配置
export interface KingdeeConfig {
  loginParams: KingdeeLoginParams;
  apiMethod?: string;
  opNumber?: string;
  formId: string;
  dataTemplate: string;
}

// 任务触发 API 配置
export interface TaskTriggerApiConfig {
  token: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// 任务配置
export interface TaskConfig {
  id: string;
  name: string;
  description: string;
  feishuConfig: FeishuConfig;
  kingdeeConfig: KingdeeConfig;
  triggerApi?: TaskTriggerApiConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  verificationStatus?: TaskVerificationStatus;
}

// 任务执行日志
export interface TaskLog {
  id: string;
  instanceId: string;
  taskId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

// WebAPI 调用日志
export interface WebAPILog {
  id: string;
  instanceId: string;
  timestamp: string;
  recordId: string;
  feishuData?: any;
  requestData?: any;
  responseData?: any;
  success: boolean;
  errorMessage?: string;
  writeBackData?: any;
  writeBackSuccess?: boolean;
  writeBackError?: string;
}

// 任务实例
export interface TaskInstance {
  id: string;
  taskId: string;
  status: TaskStatus;
  startTime?: string;
  endTime?: string;
  logs: any[];
  webApiLogs: any[];
  progress: number;
  totalCount?: number;
  successCount?: number;
  errorCount?: number;
  isStopping?: boolean;
  stopRequestedAt?: string | null;
}
