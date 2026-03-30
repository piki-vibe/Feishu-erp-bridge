import FeishuService from './feishuService';
import KingdeeService from './kingdeeService';
import type { TaskConfig, TaskInstance, TaskLog, WebAPILog } from '../types';
import { TaskStatus } from '../types';
import { useAccountStore } from '../stores/accountStore';
import { logStorage } from './logStorage';
import { extractFeishuFieldValue as extractFeishuValue, formatFeishuFieldValue } from '../utils/feishuValueUtils';
import { buildKingdeeRequestPreview, normalizeKingdeeApiMethod, normalizeKingdeeOpNumber } from '../utils/kingdeeApi';

// 任务执行器类
export class TaskExecutor {
  private task: TaskConfig;
  private instance: TaskInstance;
  private feishuService: FeishuService;
  private kingdeeService: KingdeeService;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;

  constructor(task: TaskConfig, instance: TaskInstance) {
    this.task = task;
    this.instance = instance;
    this.feishuService = new FeishuService(task.feishuConfig);
    this.kingdeeService = new KingdeeService(task.kingdeeConfig);
  }

  // 添加日志 - 直接写入 IndexedDB，不占用内存
  private async addLog(level: 'info' | 'warn' | 'error', message: string) {
    const log: Omit<TaskLog, 'id'> = {
      instanceId: this.instance.id,
      taskId: this.task.id,
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    // 直接写入 IndexedDB，不经过 Zustand Store
    await logStorage.addTaskLog(this.instance.id, log);
  }

  // 添加 WebAPI 日志 - 直接写入 IndexedDB，不占用内存
  private async addWebApiLog(log: WebAPILog) {
    // 直接写入 IndexedDB，不经过 Zustand Store
    await logStorage.addWebApiLog(this.instance.id, log);
  }

  // 更新进度 - 只更新内存，不保存到服务器
  private async updateProgress(progress: number, successCount: number, errorCount: number) {
    const store = useAccountStore.getState();
    const updatedInstances = store.taskInstances.map((i) =>
      i.id === this.instance.id
        ? { ...i, progress, successCount, errorCount }
        : i
    );
    useAccountStore.setState({ taskInstances: updatedInstances });
  }

  // 更新状态 - 只更新内存，不保存到服务器
  private async updateStatus(status: TaskStatus) {
    const store = useAccountStore.getState();
    const updatedInstances = store.taskInstances.map((i) =>
      i.id === this.instance.id
        ? {
            ...i,
            status,
            endTime: status === TaskStatus.SUCCESS || status === TaskStatus.ERROR ? new Date().toISOString() : undefined,
          }
        : i
    );
    useAccountStore.setState({ taskInstances: updatedInstances });
  }

  // 执行同步任务
  async execute(): Promise<void> {
    if (this.isRunning) {
      throw new Error('任务正在执行中');
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    try {
      await this.updateStatus(TaskStatus.RUNNING);
      await this.addLog('info', '开始执行任务：' + this.task.name);

      // 步骤 1: 从飞书获取数据
      await this.addLog('info', '步骤 1: 从飞书表格查询数据...');
      const feishuData = await this.fetchFeishuData();

      if (feishuData.length === 0) {
        await this.addLog('warn', '飞书表格中没有符合条件的记录');
        await this.updateStatus(TaskStatus.SUCCESS);
        return;
      }

      await this.addLog('info', '从飞书获取到 ' + feishuData.length + ' 条记录');

      // 步骤 2: 导入数据到金蝶
      await this.addLog('info', '步骤 2: 导入数据到金蝶系统...');
      const { successCount, errorCount } = await this.importToKingdee(feishuData);

      // 步骤 3: 更新任务实例状态
      if (errorCount === 0) {
        await this.updateStatus(TaskStatus.SUCCESS);
        await this.addLog('info', '任务执行完成：成功 ' + successCount + ' 条');
      } else if (successCount === 0) {
        await this.updateStatus(TaskStatus.ERROR);
        await this.addLog('error', '任务执行失败：失败 ' + errorCount + ' 条');
      } else {
        await this.updateStatus(TaskStatus.WARNING);
        await this.addLog('warn', '任务执行完成：成功 ' + successCount + ' 条，失败 ' + errorCount + ' 条');
      }

    } catch (err: any) {
      await this.addLog('error', '任务执行异常：' + err.message);
      await this.updateStatus(TaskStatus.ERROR);
      throw err;
    } finally {
      this.isRunning = false;
      this.abortController = null;
      await this.saveInstanceData();
    }
  }

  // 统一保存任务实例数据
  private async saveInstanceData(): Promise<void> {
    try {
      const { useAccountStore } = await import('../stores/accountStore');
      const store = useAccountStore.getState();
      await store.saveToServer();
      console.log('任务实例数据已保存到服务器');
    } catch (error) {
      console.error('保存任务实例数据失败:', error);
    }
  }

  // 从飞书获取数据
  private async fetchFeishuData(): Promise<any[]> {
    try {
      const { tableId, viewId, filterConditions } = this.task.feishuConfig;
      if (!tableId) {
        throw new Error('飞书表格 ID 未配置');
      }
      const response = await this.feishuService.getTableData(tableId, viewId, filterConditions, undefined);
      if (response.code !== 0) {
        throw new Error(response.msg || '获取飞书数据失败');
      }
      return response.data?.items || [];
    } catch (err: any) {
      await this.addLog('error', '获取飞书数据失败：' + err.message);
      throw err;
    }
  }

  // 递归替换对象中的所有占位符
  private replacePlaceholders(obj: any, replacement: Record<string, any>): any {
    if (typeof obj === 'string') {
      // 替换字符串中的 {{variableName}} 占位符
      let result = obj;
      for (const [key, value] of Object.entries(replacement)) {
        // 跳过空 key 的替换
        if (!key || key.trim() === '') {
          continue;
        }
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(placeholder, String(value ?? ''));
      }
      // 如果替换后整个字符串就是一个单独的值（没有引号包围），尝试转换为原始类型
      // 例如："{{E}}" 替换后变成 "3000"，尝试转换为数字 3000
      // 检查是否整个字符串就是由一个占位符替换而来（即替换后没有引号包围）
      // 这里使用一个简单的方法：如果替换后的值看起来像数字或布尔值，尝试转换
      if (/^-?\d+(\.\d+)?$/.test(result)) {
        // 看起来像数字
        const numValue = parseFloat(result);
        if (!isNaN(numValue)) {
          return numValue;
        }
      }
      if (result === 'true') return true;
      if (result === 'false') return false;
      return result;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.replacePlaceholders(item, replacement));
    }
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replacePlaceholders(value, replacement);
      }
      return result;
    }
    return obj;
  }

  // 导入数据到金蝶 - 优化：并发执行，提高速度
  private async importToKingdee(feishuItems: any[]): Promise<{ successCount: number; errorCount: number }> {
    let successCount = 0;
    let errorCount = 0;
    const total = feishuItems.length;
    const { formId, dataTemplate, apiMethod, opNumber } = this.task.kingdeeConfig;

    if (!formId) {
      throw new Error('金蝶表单 ID 未配置');
    }

    const CONCURRENCY_LIMIT = 3;
    const queue = [...feishuItems];
    const executing: Promise<void>[] = [];

    let parsedTemplate: Record<string, any> | null = null;
    let templateParseFailed = false;
    if (dataTemplate) {
      try {
        parsedTemplate = JSON.parse(dataTemplate);
      } catch (parseError: any) {
        // 模板解析失败是正常的，因为模板中包含占位符（如 {{A}}），在替换前不是有效的 JSON
        // 只有当占位符都是数字/布尔值类型（未被引号包围）时，模板才是有效的 JSON
        templateParseFailed = true;
      }
    }

    const processItem = async (item: any, index: number): Promise<void> => {
      const recordId = item.record_id;
      const fields = item.fields || {};
      let finalData: Record<string, any> = {};
      let requestPreview: Record<string, any> = {};
      let writeBackResult: Record<string, any> | null = null;

      try {
        const formattedData = this.formatDataForKingdee(fields);
        finalData = formattedData;

        if (parsedTemplate) {
          // 模板解析成功：先替换模板中的占位符，再合并格式化数据
          const templateWithValues = this.replacePlaceholders(parsedTemplate, formattedData);
          finalData = { ...templateWithValues, ...formattedData };
        } else if (templateParseFailed && dataTemplate) {
          // 模板解析失败：使用原始模板字符串进行替换，然后尝试解析
          let templateWithValues = dataTemplate;
          for (const [key, value] of Object.entries(formattedData)) {
            const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            // 确保值是字符串或数字，避免 [object Object]
            let stringValue = '';
            if (typeof value === 'number' || typeof value === 'boolean') {
              stringValue = String(value);
            } else if (typeof value === 'object' && value !== null) {
              // 如果是对象，尝试提取 text 属性
              stringValue = value.text || value.value || String(value);
            } else {
              stringValue = String(value ?? '');
            }
            // 【关键修复】检查占位符是否被双引号包围，以决定如何处理转义
            const hasQuotes = templateWithValues.match(new RegExp(`"\\{\\{${key}\\}\\}"`));

            if (typeof value === 'number' || typeof value === 'boolean') {
              // 数字和布尔值：直接替换，不需要引号
              templateWithValues = templateWithValues.replace(placeholder, stringValue);
            } else if (hasQuotes) {
              // 字符串值且占位符被引号包围：只需要转义内容，不需要额外的引号
              // JSON.stringify 会添加外层引号，需要移除（因为模板中已有引号）
              const escaped = JSON.stringify(stringValue);
              templateWithValues = templateWithValues.replace(placeholder, escaped.slice(1, -1));
            } else {
              // 字符串值但占位符没有被引号包围：需要完整的 JSON 字符串
              templateWithValues = templateWithValues.replace(placeholder, JSON.stringify(stringValue));
            }
          }
          // 尝试解析替换后的模板
          try {
            finalData = JSON.parse(templateWithValues);
            // 验证解析后的数据是否包含必需的 Model 字段（金蝶要求）
            if (!finalData.Model) {
              await this.addLog('error', '记录 ' + recordId + ' 模板解析后缺少必需的 Model 字段');
              // 尝试构造一个最小可用的 Model
              finalData = {
                Model: { ...formattedData }
              };
            }
          } catch (e: any) {
            await this.addLog('error', '记录 ' + recordId + ' 模板替换后解析失败：' + e.message);
            await this.addLog('warn', '记录 ' + recordId + ' 将使用保底数据格式（仅包含格式化字段）');
            // 【保底方案】解析失败时，至少使用格式化后的字段数据
            // 这样可以确保有 Model 字段，虽然可能不完整，但比空数据好
            finalData = {
              Model: { ...formattedData }
            };
          }
        }

        requestPreview = buildKingdeeRequestPreview({
          baseUrl: this.task.kingdeeConfig.loginParams.baseUrl,
          formId,
          data: finalData,
          apiMethod: normalizeKingdeeApiMethod(apiMethod),
          opNumber: normalizeKingdeeOpNumber(opNumber),
        });

        const result = await this.kingdeeService.saveData(formId, finalData, apiMethod, opNumber);

        successCount++;
        // 先执行回写，获取回写数据（传入金蝶响应）
        writeBackResult = await this.handleWriteBack(recordId, 'success', '同步成功', result);

        // 再记录 WebAPI 日志，包含回写数据
        const webApiLog: Omit<WebAPILog, 'id'> = {
          instanceId: this.instance.id,
          recordId: recordId || ('record_' + index),
          timestamp: new Date().toISOString(),
          success: true,
          feishuData: fields,
          requestData: requestPreview,
          responseData: result,
          writeBackData: writeBackResult || {},
          writeBackSuccess: writeBackResult !== null,
          writeBackError: undefined,
        };

        await this.addWebApiLog(webApiLog as WebAPILog);

      } catch (err: any) {
        errorCount++;
        // 先执行回写，获取回写数据（传入金蝶响应）
        writeBackResult = await this.handleWriteBack(recordId, 'error', err.message, err.responseData);

        // 再记录 WebAPI 日志，包含回写数据
        const webApiLog: Omit<WebAPILog, 'id'> = {
          instanceId: this.instance.id,
          recordId: recordId || ('record_' + index),
          timestamp: new Date().toISOString(),
          success: false,
          errorMessage: err.message,
          feishuData: fields,
          requestData: Object.keys(requestPreview).length > 0 ? requestPreview : (finalData || {}),
          responseData: err.responseData || {},
          writeBackData: writeBackResult || {},
          writeBackSuccess: false,
          writeBackError: writeBackResult ? undefined : err.message,
        };
        await this.addWebApiLog(webApiLog as WebAPILog);
        await this.addLog('error', '记录 ' + recordId + ' 导入失败：' + err.message);
      }

      const processedCount = successCount + errorCount;
      const progress = Math.round((processedCount / total) * 100);
      await this.updateProgress(progress, successCount, errorCount);
    };

    while (queue.length > 0 || executing.length > 0) {
      if (this.abortController?.signal.aborted) {
        await this.addLog('warn', '任务已被取消');
        break;
      }

      while (executing.length < CONCURRENCY_LIMIT && queue.length > 0) {
        const item = queue.shift()!;
        const index = feishuItems.length - queue.length;
        const promise = processItem(item, index).then(() => {
          executing.splice(executing.indexOf(promise), 1);
        });
        executing.push(promise);
      }

      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }

    if (executing.length > 0) {
      await Promise.all(executing);
    }

    return { successCount, errorCount };
  }

  // 处理回写逻辑 - 返回回写的数据
  private async handleWriteBack(
    recordId: string | undefined,
    source: 'success' | 'error',
    message: string,
    kingdeeResponse?: any // 金蝶响应数据
  ): Promise<Record<string, any> | null> {
    const { tableId, writeBackFields = [] } = this.task.feishuConfig;
    if (!tableId || !recordId || writeBackFields.length === 0) {
      return null;
    }

    const writeBackData: Record<string, any> = {};
    writeBackFields.forEach(field => {
      if (field.source === 'status') {
        // 响应状态：成功返回"同步成功"，失败返回"同步失败"
        writeBackData[field.fieldName] = source === 'success' ? '同步成功' : '同步失败';
      } else if (field.source === 'success') {
        // 成功消息：只在成功时回传，失败时留空
        if (source === 'success') {
          if (field.jsonPath && kingdeeResponse) {
            // 支持 JSON 路径提取，如：Result.Number
            const keys = field.jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
            let value: any = kingdeeResponse;
            for (const key of keys) {
              if (value === null || value === undefined) {
                value = undefined;
                break;
              }
              value = value[key];
            }
            writeBackData[field.fieldName] = value !== undefined ? value : '无法提取';
          } else {
            // 没有 JSON 路径，返回成功消息
            writeBackData[field.fieldName] = message || '同步成功';
          }
        }
        // 失败时留空（不设置值）
      } else if (field.source === 'error') {
        // 错误消息：只在失败时回传，成功时留空
        if (source === 'error') {
          if (field.jsonPath && kingdeeResponse) {
            // 支持 JSON 路径提取，如：Result.ResponseStatus.Errors[0].Message
            const keys = field.jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
            let value: any = kingdeeResponse;
            for (const key of keys) {
              if (value === null || value === undefined) {
                value = undefined;
                break;
              }
              value = value[key];
            }
            writeBackData[field.fieldName] = value !== undefined ? value : '无法提取';
          } else {
            // 没有 JSON 路径，返回错误消息
            writeBackData[field.fieldName] = message || '同步失败';
          }
        }
        // 成功时留空（不设置值）
      } else if (field.source === 'response' && kingdeeResponse) {
        // 完整响应：无论成功失败都回传完整内容
        if (field.jsonPath) {
          // 支持简单的 JSON 路径，如：Result.ResponseStatus.Errors[0].Message
          const keys = field.jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
          let value: any = kingdeeResponse;
          for (const key of keys) {
            if (value === null || value === undefined) {
              value = undefined;
              break;
            }
            value = value[key];
          }
          writeBackData[field.fieldName] = value !== undefined ? value : '无法提取';
        } else {
          // 没有指定 JSON 路径，返回整个响应
          writeBackData[field.fieldName] = JSON.stringify(kingdeeResponse);
        }
      }
    });

    if (Object.keys(writeBackData).length > 0) {
      try {
        await this.feishuService.writeBackData(tableId, recordId, writeBackData);
        await this.addLog('info', '记录 ' + recordId + ' 状态已回写到飞书');
        return writeBackData; // 返回回写的数据
      } catch (writeError: any) {
        await this.addLog('warn', '回写状态到飞书失败：' + writeError.message);
        return writeBackData; // 即使失败也返回回写的数据
      }
    }

    return null;
  }

  // 提取飞书字段的实际值（处理多行文本等复杂类型）
  private extractFeishuFieldValue(fieldValue: any, sourceFieldType?: number): any {
    return extractFeishuValue(fieldValue, sourceFieldType);
  }

  // 根据处理类型格式化字段值
  private formatFieldValue(fieldValue: any, param: import('../types').FeishuFieldParam, sourceFieldType?: number): any {
    const extractedValue = this.extractFeishuFieldValue(fieldValue, sourceFieldType);
    return formatFeishuFieldValue(extractedValue, {
      processType: param.processType,
      sourceFieldType,
      sourceUiType: param.sourceUiType,
      decimalPlaces: param.decimalPlaces,
      dateFormat: param.dateFormat,
    });
  }

  // 格式化数据为金蝶格式
  private formatDataForKingdee(fields: Record<string, any>): Record<string, any> {
    const { fieldParams } = this.task.feishuConfig;
    const result: Record<string, any> = {};

    fieldParams.forEach(param => {
      // 跳过 variableName 为空的字段参数
      if (!param.variableName || param.variableName.trim() === '') {
        return;
      }

      const rawFieldValue = fields[param.fieldName];

      // 如果有 sourceFieldType，使用配置的；否则尝试自动检测
      const sourceFieldType = param.sourceFieldType;

      // 提取并格式化字段值（包含 auto 自动推断逻辑）
      const fieldValue = this.formatFieldValue(rawFieldValue, param, sourceFieldType);

      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        result[param.variableName] = fieldValue;
      }
    });

    return result;
  }

  // 停止任务
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.isRunning = false;
    }
  }

  // 检查是否正在运行
  isExecuting(): boolean {
    return this.isRunning;
  }
}

// 全局任务执行器管理
const runningExecutors: Map<string, TaskExecutor> = new Map();

// 执行任务
export async function executeTask(task: TaskConfig, instance: TaskInstance): Promise<void> {
  const executor = new TaskExecutor(task, instance);
  runningExecutors.set(instance.id, executor);

  try {
    await executor.execute();
  } finally {
    runningExecutors.delete(instance.id);
  }
}

// 停止任务
export function stopTaskExecution(instanceId: string): boolean {
  const executor = runningExecutors.get(instanceId);
  if (executor) {
    executor.stop();
    return true;
  }
  return false;
}

// 检查任务是否正在执行
export function isTaskExecuting(instanceId: string): boolean {
  const executor = runningExecutors.get(instanceId);
  return executor ? executor.isExecuting() : false;
}
