// 后端任务执行器 - 将任务执行从前端迁移到后端
// 支持关闭浏览器后任务继续运行

import axios from 'axios';

// 飞书字段类型编码
const FeishuFieldType = {
  TEXT: 1,
  NUMBER: 2,
  SINGLE_SELECT: 3,
  MULTI_SELECT: 4,
  DATE: 5,
  CHECKBOX: 7,
  PERSON: 11,
  PHONE: 13,
  LINK: 15,
  ATTACHMENT: 17,
  FORMULA: 20,
  LOCATION: 22,
  GROUP_CHAT: 23,
  CREATED_TIME: 1001,
  MODIFIED_TIME: 1002,
  CREATED_USER: 1003,
  MODIFIED_USER: 1004,
  AUTO_NUMBER: 1005,
};

// 格式化日期值
function formatDate(value, format = 'YYYY-MM-DD') {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  let timestamp;

  if (typeof value === 'number') {
    timestamp = value;
  } else if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (isNaN(parsed)) {
      return value;
    }
    timestamp = parsed;
  } else {
    return String(value);
  }

  if (format === 'timestamp') {
    return String(timestamp);
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'YYYY/MM/DD':
      return `${year}/${month}/${day}`;
    case 'YYYYMMDD':
      return `${year}${month}${day}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

// 提取人员/多选字段的文本值
function extractTextValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    const texts = value.map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object') {
        return item.text || item.name || String(item);
      }
      return String(item);
    });
    return texts.filter(t => t).join(',');
  }

  if (typeof value === 'object' && value.value && Array.isArray(value.value)) {
    return extractTextValue(value.value);
  }

  if (typeof value === 'object' && value.text) {
    return value.text;
  }

  return String(value);
}

// 任务状态
export const TaskStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning'
};

// 正在运行的任务实例
const runningTasks = new Map();

// 飞书服务类
class FeishuService {
  constructor(config) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.appToken = config.appToken;
    this.accessToken = null;
    this.baseURL = 'https://open.feishu.cn';
  }

  async getToken() {
    try {
      const url = `${this.baseURL}/open-apis/auth/v3/tenant_access_token/internal`;
      const response = await axios.post(url, {
        app_id: this.appId,
        app_secret: this.appSecret,
      }, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        timeout: 20000,
      });

      if (response.data.code === 0) {
        this.accessToken = response.data.tenant_access_token;
        return this.accessToken;
      } else {
        throw new Error(`获取飞书令牌失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('获取飞书访问令牌失败:', error.message);
      throw error;
    }
  }

  async getTableData(tableId, viewId, filterConditions) {
    try {
      if (!this.accessToken) {
        await this.getToken();
      }

      const requestBody = {};

      if (viewId && (!filterConditions || filterConditions.length === 0)) {
        requestBody.view_id = viewId;
      }

      let needsClientFilter = false;
      if (filterConditions && filterConditions.length > 0) {
        const { filter, needsClientFilter: needsFilter } = this.buildFilter(filterConditions);
        if (filter) {
          requestBody.filter = filter;
        }
        needsClientFilter = needsFilter;
      }

      const allItems = [];
      let pageToken = undefined;

      while (true) {
        const response = await axios.post(
          `${this.baseURL}/open-apis/bitable/v1/apps/${this.appToken}/tables/${tableId}/records/search`,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            params: {
              page_size: 500,
              page_token: pageToken,
            },
            timeout: 30000,
          }
        );

        if (response.data.code === 0) {
          const items = response.data.data?.items || [];
          allItems.push(...items);
          pageToken = response.data.data?.page_token;
          if (!pageToken) break;
        } else {
          throw new Error(`获取数据失败: ${response.data.msg}`);
        }
      }

      let items = allItems;
      if (needsClientFilter && filterConditions) {
        items = this.clientFilter(items, filterConditions);
      }

      return { code: 0, data: { items, total: items.length } };
    } catch (error) {
      console.error('获取飞书表格数据失败:', error.message);
      throw error;
    }
  }

  buildFilter(conditions) {
    const apiConditions = conditions
      .map(condition => this.buildSingleCondition(condition))
      .filter(condition => condition !== null);

    const needsClientFilter = conditions.some(
      c => c.operator === 'isEmpty' || c.operator === 'isNotEmpty'
    );

    if (apiConditions.length === 0) {
      return { filter: null, needsClientFilter };
    }

    return {
      filter: { conjunction: 'and', conditions: apiConditions },
      needsClientFilter
    };
  }

  buildSingleCondition(condition) {
    const result = { field_name: condition.fieldName };

    switch (condition.operator) {
      case 'isEmpty':
      case 'isNotEmpty':
        return null;
      case 'eq':
        result.operator = 'is';
        result.value = condition.value ? [condition.value] : [];
        break;
      case 'ne':
        result.operator = 'isNot';
        result.value = condition.value ? [condition.value] : [];
        break;
      case 'contains':
        result.operator = 'contains';
        result.value = condition.value ? [condition.value] : [];
        break;
      case 'notContains':
        result.operator = 'doesNotContain';
        result.value = condition.value ? [condition.value] : [];
        break;
      default:
        result.operator = 'is';
        result.value = condition.value ? [condition.value] : [];
    }

    return result;
  }

  extractFieldValue(fieldValue) {
    if (fieldValue === null || fieldValue === undefined) return '';
    if (typeof fieldValue === 'number' || typeof fieldValue === 'string' || typeof fieldValue === 'boolean') {
      return fieldValue;
    }
    if (Array.isArray(fieldValue)) {
      return fieldValue.map(item => {
        if (typeof item === 'object' && item.text) return item.text;
        return String(item);
      }).join('');
    }
    if (typeof fieldValue === 'object') {
      if (fieldValue.value && Array.isArray(fieldValue.value)) return fieldValue.value[0];
      if (fieldValue.text) return fieldValue.text;
      if (fieldValue.value !== undefined) return fieldValue.value;
      return JSON.stringify(fieldValue);
    }
    return fieldValue;
  }

  clientFilter(items, filterConditions) {
    return items.filter(item => {
      const fields = item.fields || item;

      for (const condition of filterConditions) {
        const rawFieldValue = fields[condition.fieldName];
        const fieldValue = this.extractFieldValue(rawFieldValue);
        const expectedValue = condition.value || '';

        switch (condition.operator) {
          case 'isEmpty':
            if (fieldValue !== '') return false;
            break;
          case 'isNotEmpty':
            if (fieldValue === '') return false;
            break;
          case 'eq':
            if (fieldValue !== expectedValue) return false;
            break;
          case 'ne':
            if (fieldValue === expectedValue) return false;
            break;
          case 'contains':
            if (!fieldValue.includes(expectedValue)) return false;
            break;
          case 'notContains':
            if (fieldValue.includes(expectedValue)) return false;
            break;
        }
      }

      return true;
    });
  }

  async writeBackData(tableId, recordId, data) {
    try {
      if (!this.accessToken) {
        await this.getToken();
      }

      const response = await axios.put(
        `${this.baseURL}/open-apis/bitable/v1/apps/${this.appToken}/tables/${tableId}/records/${recordId}`,
        { fields: data },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          timeout: 30000,
        }
      );

      if (response.data.code === 0) {
        return response.data;
      } else {
        throw new Error(`回写数据失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('回写数据到飞书失败:', error.message);
      throw error;
    }
  }
}

// 金蝶服务类
class KingdeeService {
  constructor(config) {
    // 使用本地后端代理路径，而不是直接访问金蝶URL
    // 后端代理会自动处理 Cookie
    this.baseUrl = 'http://localhost:3001/K3Cloud';
    this.kingdeeBaseUrl = config.loginParams.baseUrl || 'http://47.113.148.159:8090';
    this.username = config.loginParams.username;
    this.password = config.loginParams.password;
    this.acctId = config.loginParams.acctId || config.loginParams.dbId;
    this.isLoggedIn = false;
    this.loginTime = 0;
    this.SESSION_TIMEOUT = 30 * 60 * 1000;
    // Cookie 存储
    this.cookies = '';
  }

  isSessionValid() {
    if (!this.isLoggedIn) return false;
    return Date.now() - this.loginTime < this.SESSION_TIMEOUT;
  }

  markLoggedIn() {
    this.isLoggedIn = true;
    this.loginTime = Date.now();
  }

  clearSession() {
    this.isLoggedIn = false;
    this.loginTime = 0;
    this.cookies = '';
  }

  // 从响应中提取 Cookie
  extractCookies(response) {
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      // axios 返回的 set-cookie 可能是字符串或数组
      if (Array.isArray(setCookieHeader)) {
        this.cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
      } else {
        this.cookies = setCookieHeader.split(';')[0];
      }
      console.log('金蝶登录 Cookie 已保存:', this.cookies);
    } else {
      console.log('金蝶登录响应中没有 Set-Cookie header');
    }
  }

  async login() {
    try {
      const url = `${this.baseUrl}/Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser.common.kdsvc`;
      console.log('金蝶登录请求 (通过后端代理):', { url, acctId: this.acctId, username: this.username });

      const response = await axios.post(url, {
        acctID: this.acctId || '',
        username: this.username,
        password: this.password,
        lcid: 2052,
        baseUrl: this.kingdeeBaseUrl,  // 传递金蝶服务器地址给代理
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      console.log('金蝶登录响应:', {
        LoginResultType: response.data.LoginResultType,
        Message: response.data.Message,
        hasCookie: !!response.headers['set-cookie']
      });

      if (response.data.LoginResultType === 1) {
        this.extractCookies(response);
        this.markLoggedIn();
        return true;
      } else {
        this.clearSession();
        const errorMsg = response.data.Message || `登录失败，错误码: ${response.data.LoginResultType}`;
        console.error('金蝶登录失败:', errorMsg);
        return false;
      }
    } catch (error) {
      console.error('金蝶登录失败:', error.message);
      throw error;
    }
  }

  async saveData(formId, data) {
    try {
      if (!this.isSessionValid()) {
        console.log('金蝶 Session 无效或过期，重新登录...');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('金蝶登录失败，无法保存数据');
        }
      }

      const url = `${this.baseUrl}/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Save.common.kdsvc`;

      // 准备请求头，包含 Cookie
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.cookies) {
        headers['Cookie'] = this.cookies;
      }

      console.log('金蝶保存请求 (通过后端代理):', {
        url,
        formId,
        hasCookie: !!this.cookies,
        dataPreview: JSON.stringify(data).substring(0, 200) + '...'
      });

      const response = await axios.post(url, {
        formid: formId,
        data: data,
        baseUrl: this.kingdeeBaseUrl,  // 传递金蝶服务器地址给代理
      }, {
        headers,
        timeout: 60000,  // 增加到 60 秒超时
      });

      console.log('金蝶保存响应:', {
        hasResult: !!response.data.Result,
        hasException: !!response.data.Exception,
        status: response.data.Result?.ResponseStatus?.IsSuccess
      });

      if (response.data.Exception) {
        const error = new Error(`保存失败: ${response.data.Exception}`);
        error.responseData = response.data;
        throw error;
      }

      if (response.data.Result?.ResponseStatus) {
        const status = response.data.Result.ResponseStatus;
        if (!status.IsSuccess && status.Errors && status.Errors.length > 0) {
          const errorMessages = status.Errors.map(e => e.Message).join('; ');
          const error = new Error(`保存失败: ${errorMessages}`);
          error.responseData = response.data;
          throw error;
        }
      }

      return response.data;
    } catch (error) {
      console.error('保存数据到金蝶失败:', error.message);
      if (error.response) {
        const errorData = error.response.data;
        const enhancedError = new Error(`保存失败: ${errorData?.Exception || error.message}`);
        enhancedError.responseData = errorData;
        throw enhancedError;
      }
      throw error;
    }
  }
}

// 任务执行器类
export class TaskExecutor {
  constructor(task, instance, username, saveLogCallback, updateInstanceCallback) {
    this.task = task;
    this.instance = instance;
    this.username = username;
    this.saveLogCallback = saveLogCallback;
    this.updateInstanceCallback = updateInstanceCallback;
    this.feishuService = new FeishuService(task.feishuConfig);
    this.kingdeeService = new KingdeeService(task.kingdeeConfig);
    this.isRunning = false;
    this.isStopped = false;
    this.firstLogSaved = false;
  }

  // 更新实例状态
  async updateInstance(updates) {
    Object.assign(this.instance, updates);
    if (this.updateInstanceCallback) {
      await this.updateInstanceCallback(this.instance);
    }
  }

  // 保存 WebAPI 日志（只保存第一条）
  async saveWebApiLog(logData) {
    if (this.firstLogSaved) {
      return false; // 已保存过，跳过
    }
    this.firstLogSaved = true;

    if (this.saveLogCallback) {
      await this.saveLogCallback(this.instance.id, logData);
    }
    return true;
  }

  // 格式化字段值
  formatFieldValue(fieldValue, param, sourceFieldType) {
    const processType = param.processType || 'auto';

    let effectiveType = processType;
    if (processType === 'auto' && sourceFieldType !== undefined) {
      if (sourceFieldType === FeishuFieldType.NUMBER) {
        effectiveType = 'number';
      } else if (sourceFieldType === FeishuFieldType.DATE ||
                 sourceFieldType === FeishuFieldType.CREATED_TIME ||
                 sourceFieldType === FeishuFieldType.MODIFIED_TIME) {
        effectiveType = 'datetime';
      }
    }

    switch (effectiveType) {
      case 'number':
        if (typeof fieldValue === 'number') {
          const decimalPlaces = param.decimalPlaces ?? 2;
          return Number(fieldValue.toFixed(decimalPlaces));
        }
        const numValue = Number(fieldValue);
        if (!isNaN(numValue)) {
          const decimalPlaces = param.decimalPlaces ?? 2;
          return Number(numValue.toFixed(decimalPlaces));
        }
        return fieldValue;

      case 'date':
      case 'datetime':
        return formatDate(fieldValue, param.dateFormat || 'YYYY-MM-DD');

      case 'timestamp':
        if (typeof fieldValue === 'number') {
          return String(fieldValue);
        }
        if (typeof fieldValue === 'string') {
          const parsed = Date.parse(fieldValue);
          return isNaN(parsed) ? fieldValue : String(parsed);
        }
        return String(fieldValue);

      case 'multiselect':
      case 'person':
        return extractTextValue(fieldValue);

      default:
        return fieldValue;
    }
  }

  // 格式化数据为金蝶格式
  formatDataForKingdee(fields) {
    const { fieldParams } = this.task.feishuConfig;
    const result = {};

    fieldParams.forEach(param => {
      if (!param.variableName || param.variableName.trim() === '') {
        return;
      }

      const rawFieldValue = fields[param.fieldName];
      const sourceFieldType = param.sourceFieldType;
      let fieldValue = this.feishuService.extractFieldValue(rawFieldValue);
      fieldValue = this.formatFieldValue(fieldValue, param, sourceFieldType);

      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        result[param.variableName] = fieldValue;
      }
    });

    return result;
  }

  // 替换模板中的占位符
  replacePlaceholders(obj, replacement) {
    if (typeof obj === 'string') {
      let result = obj;
      for (const [key, value] of Object.entries(replacement)) {
        if (!key || key.trim() === '') continue;
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(placeholder, String(value ?? ''));
      }
      if (/^-?\d+(\.\d+)?$/.test(result)) {
        const numValue = parseFloat(result);
        if (!isNaN(numValue)) return numValue;
      }
      if (result === 'true') return true;
      if (result === 'false') return false;
      return result;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.replacePlaceholders(item, replacement));
    }
    if (obj !== null && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replacePlaceholders(value, replacement);
      }
      return result;
    }
    return obj;
  }

  // 处理回写逻辑
  async handleWriteBack(recordId, source, message, kingdeeResponse) {
    const { tableId, writeBackFields = [] } = this.task.feishuConfig;
    if (!tableId || !recordId || writeBackFields.length === 0) {
      return null;
    }

    const writeBackData = {};
    writeBackFields.forEach(field => {
      if (field.source === 'status') {
        writeBackData[field.fieldName] = source === 'success' ? '同步成功' : '同步失败';
      } else if (field.source === 'success' && source === 'success') {
        if (field.jsonPath && kingdeeResponse) {
          const keys = field.jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
          let value = kingdeeResponse;
          for (const key of keys) {
            if (value === null || value === undefined) {
              value = undefined;
              break;
            }
            value = value[key];
          }
          writeBackData[field.fieldName] = value !== undefined ? value : '无法提取';
        } else {
          writeBackData[field.fieldName] = message || '同步成功';
        }
      } else if (field.source === 'error' && source === 'error') {
        if (field.jsonPath && kingdeeResponse) {
          const keys = field.jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
          let value = kingdeeResponse;
          for (const key of keys) {
            if (value === null || value === undefined) {
              value = undefined;
              break;
            }
            value = value[key];
          }
          writeBackData[field.fieldName] = value !== undefined ? value : '无法提取';
        } else {
          writeBackData[field.fieldName] = message || '同步失败';
        }
      } else if (field.source === 'response' && kingdeeResponse) {
        if (field.jsonPath) {
          const keys = field.jsonPath.replace(/\[(\d+)\]/g, '.$1').split('.');
          let value = kingdeeResponse;
          for (const key of keys) {
            if (value === null || value === undefined) {
              value = undefined;
              break;
            }
            value = value[key];
          }
          writeBackData[field.fieldName] = value !== undefined ? value : '无法提取';
        } else {
          writeBackData[field.fieldName] = JSON.stringify(kingdeeResponse);
        }
      }
    });

    if (Object.keys(writeBackData).length > 0) {
      try {
        await this.feishuService.writeBackData(tableId, recordId, writeBackData);
        return writeBackData;
      } catch (writeError) {
        console.error('回写状态到飞书失败:', writeError.message);
        return writeBackData;
      }
    }

    return null;
  }

  // 执行任务
  async execute() {
    if (this.isRunning) {
      throw new Error('任务正在执行中');
    }

    this.isRunning = true;
    this.firstLogSaved = false;

    try {
      await this.updateInstance({
        status: TaskStatus.RUNNING,
        startTime: new Date().toISOString(),
        progress: 0,
        successCount: 0,
        errorCount: 0,
      });

      console.log(`[${this.instance.id}] 开始执行任务: ${this.task.name}`);

      // 步骤 1: 从飞书获取数据
      const { tableId, viewId, filterConditions } = this.task.feishuConfig;
      if (!tableId) {
        throw new Error('飞书表格 ID 未配置');
      }

      const response = await this.feishuService.getTableData(tableId, viewId, filterConditions);
      if (response.code !== 0) {
        throw new Error(response.msg || '获取飞书数据失败');
      }

      const feishuData = response.data?.items || [];
      if (feishuData.length === 0) {
        await this.updateInstance({
          status: TaskStatus.SUCCESS,
          endTime: new Date().toISOString(),
          totalCount: 0,
        });
        console.log(`[${this.instance.id}] 飞书表格中没有符合条件的记录`);
        return;
      }

      console.log(`[${this.instance.id}] 从飞书获取到 ${feishuData.length} 条记录`);
      await this.updateInstance({ totalCount: feishuData.length });

      // 步骤 2: 导入数据到金蝶
      const { formId, dataTemplate } = this.task.kingdeeConfig;
      if (!formId) {
        throw new Error('金蝶表单 ID 未配置');
      }

      let successCount = 0;
      let errorCount = 0;
      const total = feishuData.length;

      // 解析模板
      let parsedTemplate = null;
      let templateParseFailed = false;
      if (dataTemplate) {
        try {
          parsedTemplate = JSON.parse(dataTemplate);
        } catch {
          templateParseFailed = true;
        }
      }

      // 并发处理
      const CONCURRENCY_LIMIT = 3;
      const queue = [...feishuData];
      const executing = [];

      const processItem = async (item, index) => {
        if (this.isStopped) return;

        const recordId = item.record_id;
        const fields = item.fields || {};
        let finalData = {};
        let writeBackResult = null;

        try {
          const formattedData = this.formatDataForKingdee(fields);
          finalData = formattedData;

          if (parsedTemplate) {
            const templateWithValues = this.replacePlaceholders(parsedTemplate, formattedData);
            finalData = { ...templateWithValues, ...formattedData };
          } else if (templateParseFailed && dataTemplate) {
            let templateWithValues = dataTemplate;
            for (const [key, value] of Object.entries(formattedData)) {
              const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
              let stringValue = '';
              if (typeof value === 'number' || typeof value === 'boolean') {
                stringValue = String(value);
              } else if (typeof value === 'object' && value !== null) {
                stringValue = value.text || value.value || String(value);
              } else {
                stringValue = String(value ?? '');
              }

              const hasQuotes = templateWithValues.match(new RegExp(`"\\{\\{${key}\\}\\}"`));

              if (typeof value === 'number' || typeof value === 'boolean') {
                templateWithValues = templateWithValues.replace(placeholder, stringValue);
              } else if (hasQuotes) {
                const escaped = JSON.stringify(stringValue);
                templateWithValues = templateWithValues.replace(placeholder, escaped.slice(1, -1));
              } else {
                templateWithValues = templateWithValues.replace(placeholder, JSON.stringify(stringValue));
              }
            }

            try {
              finalData = JSON.parse(templateWithValues);
              if (!finalData.Model) {
                finalData = { Model: { ...formattedData } };
              }
            } catch {
              finalData = { Model: { ...formattedData } };
            }
          }

          const result = await this.kingdeeService.saveData(formId, finalData);
          successCount++;
          writeBackResult = await this.handleWriteBack(recordId, 'success', '同步成功', result);

          // 只保存第一条记录的日志
          await this.saveWebApiLog({
            recordId,
            feishuData: fields,
            requestData: finalData,
            responseData: result,
            writeBackData: writeBackResult || {},
            success: true,
          });

        } catch (err) {
          errorCount++;
          writeBackResult = await this.handleWriteBack(recordId, 'error', err.message, err.responseData);

          // 只保存第一条记录的日志
          await this.saveWebApiLog({
            recordId,
            feishuData: fields,
            requestData: finalData || {},
            responseData: err.responseData || {},
            writeBackData: writeBackResult || {},
            success: false,
            errorMessage: err.message,
          });

          console.error(`[${this.instance.id}] 记录 ${recordId} 导入失败: ${err.message}`);
        }

        const processedCount = successCount + errorCount;
        const progress = Math.round((processedCount / total) * 100);
        await this.updateInstance({
          progress,
          successCount,
          errorCount,
        });
      };

      while (queue.length > 0 || executing.length > 0) {
        if (this.isStopped) {
          console.log(`[${this.instance.id}] 任务已被取消`);
          break;
        }

        while (executing.length < CONCURRENCY_LIMIT && queue.length > 0) {
          const item = queue.shift();
          const index = feishuData.length - queue.length;
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

      // 步骤 3: 更新任务状态
      let finalStatus;
      if (this.isStopped) {
        finalStatus = TaskStatus.ERROR;
      } else if (errorCount === 0) {
        finalStatus = TaskStatus.SUCCESS;
      } else if (successCount === 0) {
        finalStatus = TaskStatus.ERROR;
      } else {
        finalStatus = TaskStatus.WARNING;
      }

      await this.updateInstance({
        status: finalStatus,
        endTime: new Date().toISOString(),
        progress: 100,
        successCount,
        errorCount,
      });

      console.log(`[${this.instance.id}] 任务执行完成: 成功 ${successCount} 条, 失败 ${errorCount} 条`);

    } catch (err) {
      console.error(`[${this.instance.id}] 任务执行异常: ${err.message}`);
      await this.updateInstance({
        status: TaskStatus.ERROR,
        endTime: new Date().toISOString(),
      });
      throw err;
    } finally {
      this.isRunning = false;
    }
  }

  // 停止任务
  stop() {
    this.isStopped = true;
    console.log(`[${this.instance.id}] 任务已请求停止`);
  }
}

// 导出任务管理函数
export function getRunningTasks() {
  return runningTasks;
}

export function addRunningTask(instanceId, executor) {
  runningTasks.set(instanceId, executor);
}

export function removeRunningTask(instanceId) {
  runningTasks.delete(instanceId);
}

export function getRunningTask(instanceId) {
  return runningTasks.get(instanceId);
}