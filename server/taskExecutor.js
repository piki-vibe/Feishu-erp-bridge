// 閸氬海顏禒璇插閹笛嗩攽閸?- 鐏忓棔鎹㈤崝鈩冨⒔鐞涘奔绮犻崜宥囶伂鏉╀胶些閸掓澘鎮楃粩?
// 閺€顖涘瘮閸忔娊妫村ù蹇氼潔閸ｃ劌鎮楁禒璇插缂佈呯敾鏉╂劘顢?

import axios from 'axios';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let iconvLite = null;
try {
  iconvLite = require('iconv-lite');
} catch {
  iconvLite = null;
}

const MOJIBAKE_HINT_REGEX = /淇濆瓨|鍚屾|鏃犳硶|鑾峰彇|鍥炲啓|鏈嶅姟鍣|璇锋眰|鍙戦€?/;
const ENABLE_TASK_DEBUG_LOG = process.env.ENABLE_TASK_DEBUG_LOG === 'true';
const debugLog = (...args) => {
  if (ENABLE_TASK_DEBUG_LOG) {
    console.log(...args);
  }
};
const debugWarn = (...args) => {
  if (ENABLE_TASK_DEBUG_LOG) {
    console.warn(...args);
  }
};

function tryRepairMojibake(text) {
  if (!text || !iconvLite || !MOJIBAKE_HINT_REGEX.test(text)) {
    return text;
  }

  try {
    const repaired = iconvLite.decode(iconvLite.encode(text, 'gbk'), 'utf8');
    if (!repaired || repaired.includes('�')) {
      return text;
    }
    return repaired;
  } catch {
    return text;
  }
}

function normalizeUserFacingText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = tryRepairMojibake(String(value));
  return text
    .replace(/淇濆瓨澶辫触/g, '保存失败')
    .replace(/鍚屾鎴愬姛/g, '同步成功')
    .replace(/鍚屾澶辫触/g, '同步失败')
    .replace(/鏃犳硶鎻愬彇/g, '无法提取')
    .replace(/鑾峰彇椋炰功浠ょ墝澶辫触/g, '获取飞书令牌失败')
    .replace(/鑾峰彇鏁版嵁澶辫触/g, '获取数据失败')
    .replace(/鑾峰彇椋炰功鏁版嵁澶辫触/g, '获取飞书数据失败')
    .replace(/鍥炲啓鏁版嵁澶辫触/g, '回写数据失败');
}

function normalizeTextValue(value) {
  if (typeof value === 'string') {
    return normalizeUserFacingText(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeTextValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, normalizeTextValue(inner)])
    );
  }

  return value;
}

// 妞嬬偘鍔熺€涙顔岀猾璇茬€风紓鏍垳
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

// 閺嶇厧绱￠崠鏍ㄦ）閺堢喎鈧?
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

// 鎻愬彇浜哄憳/婢舵岸鈧鐡у▓电殑鏂囨湰鍊?
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

// 娴犺姟鐘舵€?
export const TaskStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning'
};

// 濮濓絽婀潻鎰攽閻ㄥ嫪鎹㈤崝鈥崇杽娓?
const runningTasks = new Map();

// 妞嬬偘鍔熼張宥呭缁?
class FeishuService {
  constructor(config, options = {}) {
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

      let lastPageToken = undefined;
      while (true) {
        // Always use search endpoint so returned field keys remain field_name.
        // Using list endpoint returns field_id keys and breaks field-name based filtering.
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
          const hasMore = response.data.data?.has_more === true;
          pageToken = hasMore ? response.data.data?.page_token : undefined;
          if (!hasMore || !pageToken || pageToken === lastPageToken) break;
          lastPageToken = pageToken;
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

  async getFields(tableId) {
    try {
      if (!this.accessToken) {
        await this.getToken();
      }

      const allFields = [];
      let pageToken = undefined;

      let lastPageToken = undefined;
      while (true) {
        const response = await axios.get(
          `${this.baseURL}/open-apis/bitable/v1/apps/${this.appToken}/tables/${tableId}/fields`,
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

        if (response.data.code !== 0) {
          throw new Error(`閼惧嘲褰囩€涙顔岄崚妤勩€冩径杈Е: ${response.data.msg}`);
        }

        const items = response.data.data?.items || [];
        allFields.push(...items);

        const hasMore = response.data.data?.has_more === true;
        pageToken = hasMore ? response.data.data?.page_token : undefined;
        if (!hasMore || !pageToken || pageToken === lastPageToken) break;
        lastPageToken = pageToken;
      }

      return allFields;
    } catch (error) {
      console.error('获取飞书字段失败:', error.message);
      throw error;
    }
  }

  async getFieldNameMap(tableId) {
    const fields = await this.getFields(tableId);
    const map = new Map();
    fields.forEach(field => {
      if (field?.field_id && field?.field_name) {
        map.set(field.field_id, field.field_name);
      }
    });
    return map;
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
        if (typeof item === 'object' && item.name) return item.name;
        return String(item);
      }).join('');
    }
    if (typeof fieldValue === 'object') {
      if (fieldValue.text !== undefined) return fieldValue.text;
      if (fieldValue.name !== undefined) return fieldValue.name;
      if (fieldValue.value !== undefined) return this.extractFieldValue(fieldValue.value);
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
      console.error('飞书回写失败:', error.message);
      throw error;
    }
  }
}

// 闁叉垼婢忛張宥呭缁?
class KingdeeService {
  constructor(config, options = {}) {
    // 娴ｈ法鏁ら張顒€婀撮崥搴ｎ伂娴狅絿鎮婄捄顖氱窞閿涘矁鈧奔绗夐弰顖滄纯閹恒儴顔栭梻顕€噾铦禪RL
    // 閸氬海顏禒锝囨倞娴兼俺鍤滈崝銊ヮ槱閻?Cookie
    this.baseUrl = 'http://localhost:3001/K3Cloud';
    this.kingdeeBaseUrl = config.loginParams.baseUrl || 'http://47.113.148.159:8090';
    this.username = config.loginParams.username;
    this.password = config.loginParams.password;
    this.acctId = config.loginParams.acctId || config.loginParams.dbId;
    this.isLoggedIn = false;
    this.loginTime = 0;
    this.SESSION_TIMEOUT = 4 * 60 * 60 * 1000;
    // Cookie 存储
    this.cookies = '';
    this.sessionKey = options.sessionKey || `kingdee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.loginPromise = null;
    this.defaultApiMethod = config.apiMethod || 'Save';
    this.defaultOpNumber = typeof config.opNumber === 'string' ? config.opNumber.trim() : '';
  }

  isSessionValid() {
    if (!this.isLoggedIn) return false;
    return Date.now() - this.loginTime < this.SESSION_TIMEOUT;
  }

  markLoggedIn() {
    this.isLoggedIn = true;
    this.loginTime = Date.now();
  }

  touchSession() {
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
      // axios 鏉╂柨娲栭惃?set-cookie 閸欘垵鍏橀弰顖氱摟缁楋缚瑕嗛幋鏍ㄦ殶缂?
      if (Array.isArray(setCookieHeader)) {
        this.cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
      } else {
        this.cookies = setCookieHeader.split(';')[0];
      }
      debugLog('金蝶登录 Cookie:', this.cookies);
    } else {
      debugLog('金蝶登录响应中未包含 Set-Cookie');
    }
  }

  async login(force = false) {
    if (!force && this.isSessionValid()) {
      return true;
    }
    if (this.loginPromise) {
      return this.loginPromise;
    }
    this.loginPromise = this._loginInternal(force).finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  async _loginInternal(force = false) {
    try {
      const url = `${this.baseUrl}/Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser.common.kdsvc`;
      debugLog('金蝶登录请求:', { url, acctId: this.acctId, username: this.username, sessionKey: this.sessionKey, force });

      const response = await axios.post(url, {
        acctID: this.acctId || '',
        username: this.username,
        password: this.password,
        lcid: 2052,
        sessionKey: this.sessionKey,
        baseUrl: this.kingdeeBaseUrl,  // 娴肩娀鈧帡鍣鹃摝鑸垫箛閸斺€虫珤閸︽澘娼冪紒娆庡敩閻?
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 20000,
      });

      debugLog('金蝶登录响应:', {
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
        const errorMsg = response.data.Message || `登录失败，返回码: ${response.data.LoginResultType}`;
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
        debugLog('金蝶 Session 无效或过期，重新登录...');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('金蝶登录失败，无法保存数据');
        }
      }

      const apiMethod = this.resolveDynamicFormApiMethod(data);
      const opNumber = this.resolveDynamicFormOperationNumber(data, apiMethod);
      const payloadData = this.stripTemplateMetaFields(data);
      const requestMeta = this.buildDynamicFormRequest(formId, apiMethod, opNumber, payloadData);
      const actionLabel = this.getDynamicFormActionLabel(requestMeta);

      // 閸戝棗顦拠閿嬬湴婢惰揪绱濋崠鍛儓 Cookie
      const headers = {
        'Content-Type': 'application/json',
      };
      if (this.cookies) {
        headers['Cookie'] = this.cookies;
      }

      debugLog('金蝶保存请求:', {
        url: requestMeta.url,
        endpointMethod: requestMeta.endpointMethod,
        apiMethod: requestMeta.apiMethod,
        opNumber: requestMeta.opNumber,
        formId,
        hasCookie: !!this.cookies,
        dataPreview: JSON.stringify(payloadData).substring(0, 200) + '...'
      });

      const response = await axios.post(requestMeta.url, requestMeta.requestBody, {
        headers,
        timeout: 60000,  // 婢х偛濮為崚?60 绉掕秴鏃?
      });

      debugLog('金蝶保存响应:', {
        hasResult: !!response.data.Result,
        hasException: !!response.data.Exception,
        status: response.data.Result?.ResponseStatus?.IsSuccess
      });

      if (response.data?.error) {
        const rawResponseText = response.data?.rawResponse
          ? `，原始响应: ${normalizeUserFacingText(response.data.rawResponse)}`
          : '';
        const error = new Error(`${actionLabel}失败: ${normalizeUserFacingText(response.data.error)}${rawResponseText}`);
        error.responseData = response.data;
        throw error;
      }

      // Sliding session window: keep task session alive while records are being processed.
      this.touchSession();

      if (response.data.Exception) {
        const error = new Error(`${actionLabel}失败: ${normalizeUserFacingText(response.data.Exception)}`);
        error.responseData = response.data;
        throw error;
      }

      if (response.data.Result?.ResponseStatus) {
        const status = response.data.Result.ResponseStatus;
        if (!status.IsSuccess && status.Errors && status.Errors.length > 0) {
          const errorMessages = status.Errors.map(e => normalizeUserFacingText(e.Message)).join('; ');
          const error = new Error(`${actionLabel}失败: ${errorMessages}`);
          error.responseData = response.data;
          throw error;
        }
      }

      return response.data;
    } catch (error) {
      console.error('金蝶请求失败:', error.message);
      if (error.response) {
        const errorData = error.response.data;
        const enhancedError = new Error(`请求失败: ${normalizeUserFacingText(errorData?.Exception || error.message)}`);
        enhancedError.responseData = errorData;
        throw enhancedError;
      }
      throw error;
    }
  }

  resolveDynamicFormApiMethod(data) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const explicitMethod = data.__apiMethod || data.__api || data.__operation;
      if (typeof explicitMethod === 'string' && explicitMethod.trim()) {
        return explicitMethod.trim();
      }
    }

    return this.defaultApiMethod || 'Save';
  }

  resolveDynamicFormOperationNumber(data, apiMethod) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const explicitOpNumber = data.__opNumber;
      if (typeof explicitOpNumber === 'string' && explicitOpNumber.trim()) {
        return explicitOpNumber.trim();
      }
    }

    return this.defaultOpNumber || '';
  }

  buildDynamicFormRequest(formId, apiMethod, opNumber, payloadData) {
    const normalizedMethod = typeof apiMethod === 'string' && apiMethod.trim()
      ? apiMethod.trim()
      : (this.defaultApiMethod || 'Save');
    const normalizedOpNumber = typeof opNumber === 'string' ? opNumber.trim() : '';

    return {
      apiMethod: normalizedMethod,
      endpointMethod: normalizedMethod,
      opNumber: normalizedOpNumber,
      url: `${this.baseUrl}/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.${normalizedMethod}.common.kdsvc`,
      requestBody: {
        formid: formId,
        ...(normalizedOpNumber ? { opNumber: normalizedOpNumber } : {}),
        data: payloadData,
        sessionKey: this.sessionKey,
        baseUrl: this.kingdeeBaseUrl,
      },
    };
  }

  buildDynamicFormRequestPreview(requestMeta) {
    return {
      requestUrl: requestMeta.url,
      targetBaseUrl: this.kingdeeBaseUrl,
      endpointMethod: requestMeta.endpointMethod,
      apiMethod: requestMeta.apiMethod,
      ...(requestMeta.opNumber ? { opNumber: requestMeta.opNumber } : {}),
      payload: {
        ...(requestMeta.requestBody.baseUrl ? { baseUrl: requestMeta.requestBody.baseUrl } : {}),
        formid: requestMeta.requestBody.formid,
        ...(requestMeta.requestBody.opNumber ? { opNumber: requestMeta.requestBody.opNumber } : {}),
        data: requestMeta.requestBody.data,
      },
    };
  }

  getDynamicFormActionLabel(requestMeta) {
    const methodKey = requestMeta?.apiMethod?.trim().toLowerCase() === 'excuteoperation' && requestMeta?.opNumber
      ? requestMeta.opNumber
      : requestMeta?.apiMethod;
    const method = String(methodKey || '').trim().toLowerCase();
    if (method === 'save') return '保存';
    if (method === 'delect') return '删除';
    if (method === 'delete') return '删除';
    if (method === 'view') return '查看';
    if (method === 'draft') return '暂存';
    if (method === 'submit') return '提交';
    if (method === 'audit') return '审核';
    if (method === 'unaudit') return '反审核';
    if (method === 'cancelassign') return '撤销';
    if (method === 'allocate') return '分配';
    if (method === 'cancelallocate') return '取消分配';
    if (method === 'forbid') return '禁用';
    if (method === 'enable') return '启用';
    if (method === 'unforbid') return '反禁用';
    return methodKey || '请求';
  }

  stripTemplateMetaFields(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }

    const cloned = { ...data };
    delete cloned.__apiMethod;
    delete cloned.__api;
    delete cloned.__operation;
    delete cloned.__opNumber;
    return cloned;
  }
}

// 娴犺濮熼幍褑顢戦崳銊ц
export class TaskExecutor {
  constructor(task, instance, username, saveLogCallback, updateInstanceCallback, options = {}) {
    this.task = task;
    this.instance = instance;
    this.username = username;
    this.saveLogCallback = saveLogCallback;
    this.updateInstanceCallback = updateInstanceCallback;
    this.feishuService = new FeishuService(task.feishuConfig);
    this.kingdeeService = new KingdeeService(task.kingdeeConfig, {
      sessionKey: `${username}:${instance.id}`,
    });
    this.isRunning = false;
    this.isStopped = false;
    this.isStopping = false;
    this.firstLogSaved = false;
    this.executingPromises = []; // 濮濓絽婀幍褑顢戦惃?Promise 閸掓銆?
    this.firstRecordOnly = options.firstRecordOnly === true;
    this.fieldNameById = new Map();
  }

  // 閺囧瓨鏌婄€圭偘绶ラ悩鑸碘偓?
  async updateInstance(updates) {
    Object.assign(this.instance, updates);
    if (this.updateInstanceCallback) {
      await this.updateInstanceCallback(this.instance);
    }
  }

  // 娣囨繂鐡?WebAPI 閺冦儱绻旈敍鍫濆涧娣囨繂鐡ㄧ粭顑跨閺夆槄绱?
  async saveWebApiLog(logData) {
    if (this.firstLogSaved) {
      return false; // 瀹歌弓绻氱€涙绻冮敍宀冪儲鏉?
    }
    this.firstLogSaved = true;

    if (this.saveLogCallback) {
      await this.saveLogCallback(this.instance.id, logData);
    }
    return true;
  }

  // 閺嶇厧绱￠崠鏍х摟濞堥潧鈧?
  formatFieldValue(fieldValue, param, sourceFieldType) {
    const processType = param.processType || 'auto';
    const shouldRoundNumber = processType === 'number';

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
        const numValue = typeof fieldValue === 'number' ? fieldValue : Number(fieldValue);
        if (!isNaN(numValue)) {
          if (!shouldRoundNumber) {
            // auto 模式下保留原始数值，不做固定小数处理
            return numValue;
          }

          const decimalPlacesNumber = Number(param.decimalPlaces);
          const decimalPlaces = Number.isInteger(decimalPlacesNumber)
            ? Math.min(Math.max(decimalPlacesNumber, 0), 100)
            : 2;

          // number 模式按配置固定位数，保留末尾 0（例如 2.22 -> 2.220000000）
          return numValue.toFixed(decimalPlaces);
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

  // 閺嶇厧绱￠崠鏍ㄦ殶閹诡喕璐熼柌鎴ｆ緩閺嶇厧绱?
  formatDataForKingdee(fields) {
    const { fieldParams } = this.task.feishuConfig;
    const result = {};

    fieldParams.forEach(param => {
      if (!param.variableName || param.variableName.trim() === '') {
        return;
      }

      const rawFieldValue = this.getRawFieldValue(fields, param);
      const sourceFieldType = param.sourceFieldType;
      let fieldValue = this.feishuService.extractFieldValue(rawFieldValue);
      fieldValue = this.formatFieldValue(fieldValue, param, sourceFieldType);

      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        result[param.variableName] = fieldValue;
      }
    });

    return result;
  }

  // 濡剝婢橀弴鎸庡床閺佺増宓侀敍姘祮娴ｅ灝鐡у▓鍏歌礋缁岀尨绱濇稊鐔活洣娣囨繄鏆€閸欐﹢鍣洪獮鑸垫禌閹诡澀璐熺粚鍝勭摟缁楋缚瑕?
  buildTemplateReplacementData(fields) {
    const { fieldParams } = this.task.feishuConfig;
    const result = {};

    fieldParams.forEach(param => {
      if (!param.variableName || param.variableName.trim() === '') {
        return;
      }

      const rawFieldValue = this.getRawFieldValue(fields, param);
      const sourceFieldType = param.sourceFieldType;
      let fieldValue = this.feishuService.extractFieldValue(rawFieldValue);
      fieldValue = this.formatFieldValue(fieldValue, param, sourceFieldType);

      if (fieldValue === undefined || fieldValue === null) {
        fieldValue = '';
      }

      result[param.variableName] = fieldValue;
    });

    return result;
  }

  getRawFieldValue(fields, param) {
    if (!fields || !param) {
      return undefined;
    }

    let rawFieldValue = fields[param.fieldName];
    if (rawFieldValue !== undefined && rawFieldValue !== null) {
      return rawFieldValue;
    }

    const sourceFieldId = param.sourceFieldId;
    if (sourceFieldId && this.fieldNameById?.size > 0) {
      const currentFieldName = this.fieldNameById.get(sourceFieldId);
      if (currentFieldName) {
        rawFieldValue = fields[currentFieldName];
      }
    }

    return rawFieldValue;
  }

  createTemplateContext() {
    const { dataTemplate } = this.task.kingdeeConfig || {};
    let parsedTemplate = null;
    let templateParseFailed = false;

    if (dataTemplate) {
      try {
        parsedTemplate = JSON.parse(dataTemplate);
      } catch {
        templateParseFailed = true;
      }
    }

    return {
      dataTemplate,
      parsedTemplate,
      templateParseFailed,
    };
  }

  buildPayloadFromFields(fields, templateContext = this.createTemplateContext()) {
    const formattedData = this.formatDataForKingdee(fields);
    const templateReplacementData = this.buildTemplateReplacementData(fields);
    let finalData = formattedData;

    if (templateContext.parsedTemplate) {
      const templateWithValues = this.replacePlaceholders(templateContext.parsedTemplate, templateReplacementData);
      // Use template payload as-is after variable replacement.
      // Do not append A/B/C... variables to root level.
      finalData = templateWithValues;
    } else if (templateContext.templateParseFailed && templateContext.dataTemplate) {
      let templateWithValues = templateContext.dataTemplate;
      for (const [key, value] of Object.entries(templateReplacementData)) {
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
      } catch (parseError) {
        const message = parseError?.message || '未知 JSON 解析错误';
        const templateSnippet = String(templateWithValues || '').slice(0, 1200);
        const error = new Error(
          `金蝶数据模板解析失败，请检查模板 JSON 格式是否正确：${message}。` +
          '常见原因：缺少字段值、逗号位置错误、括号不匹配、数字变量未配置。'
        );
        error.responseData = {
          type: 'template_parse_error',
          parseError: message,
          templateSnippet,
        };
        throw error;
      }
    }

    const unresolvedVariables = Array.from(this.collectUnresolvedPlaceholders(finalData));

    return {
      formattedData,
      templateReplacementData,
      finalData,
      unresolvedVariables,
    };
  }

  async previewFirstRecordRequest() {
    const { tableId, viewId, filterConditions } = this.task.feishuConfig || {};
    const { formId } = this.task.kingdeeConfig || {};

    if (!tableId) {
      throw new Error('飞书表格 ID 未配置');
    }
    if (!formId) {
      throw new Error('金蝶表单 ID 未配置');
    }

    const response = await this.feishuService.getTableData(tableId, viewId, filterConditions);
    if (response.code !== 0) {
      throw new Error(normalizeUserFacingText(response.msg || '获取飞书数据失败'));
    }

    const feishuData = response.data?.items || [];
    if (feishuData.length === 0) {
      throw new Error('没有符合筛选条件的飞书记录');
    }

    try {
      this.fieldNameById = await this.feishuService.getFieldNameMap(tableId);
    } catch {
      this.fieldNameById = new Map();
    }

    const firstRecord = feishuData[0];
    const fields = firstRecord.fields || {};
    const payload = this.buildPayloadFromFields(fields, this.createTemplateContext());
    const apiMethod = this.kingdeeService.resolveDynamicFormApiMethod(payload.finalData);
    const opNumber = this.kingdeeService.resolveDynamicFormOperationNumber(payload.finalData, apiMethod);
    const payloadData = this.kingdeeService.stripTemplateMetaFields(payload.finalData);
    const requestMeta = this.kingdeeService.buildDynamicFormRequest(formId, apiMethod, opNumber, payloadData);

    return {
      apiMethod,
      opNumber,
      formId,
      recordId: firstRecord.record_id,
      filterMatchedCount: feishuData.length,
      feishuFields: fields,
      formattedData: payload.formattedData,
      templateReplacementData: payload.templateReplacementData,
      requestData: this.kingdeeService.buildDynamicFormRequestPreview(requestMeta),
      unresolvedVariables: payload.unresolvedVariables,
    };
  }

  // 閺囨寧宕插Ο鈩冩緲娑擃厾娈戦崡鐘辩秴缁?
  replacePlaceholders(obj, replacement) {
    if (typeof obj === 'string') {
      const exactPlaceholderMatch = obj.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
      if (exactPlaceholderMatch) {
        const variableName = String(exactPlaceholderMatch[1] || '').trim();
        if (variableName && Object.prototype.hasOwnProperty.call(replacement, variableName)) {
          const exactValue = replacement[variableName];
          if (exactValue === null || exactValue === undefined) {
            return '';
          }
          if (typeof exactValue === 'number' || typeof exactValue === 'boolean') {
            return exactValue;
          }
          return String(exactValue);
        }
      }

      let result = obj;
      for (const [key, value] of Object.entries(replacement)) {
        if (!key || key.trim() === '') continue;
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(placeholder, String(value ?? ''));
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

  // 閺€鍫曟肠濡剝婢樻稉顓熸弓鐞氼偅娴涢幑銏㈡畱閸楃姳缍呯粭锕€彉閲?
  collectUnresolvedPlaceholders(obj, unresolved = new Set()) {
    if (typeof obj === 'string') {
      const placeholderRegex = /\{\{\s*([^{}]+?)\s*\}\}/g;
      let match;
      while ((match = placeholderRegex.exec(obj)) !== null) {
        const variableName = String(match[1] || '').trim();
        if (variableName) {
          unresolved.add(variableName);
        }
      }
      return unresolved;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this.collectUnresolvedPlaceholders(item, unresolved));
      return unresolved;
    }

    if (obj !== null && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.collectUnresolvedPlaceholders(value, unresolved));
      return unresolved;
    }

    return unresolved;
  }

  buildUnresolvedPlaceholderError(unresolvedVariables, fields) {
    const { fieldParams = [] } = this.task.feishuConfig || {};
    const maxCount = 5;

    const details = unresolvedVariables.slice(0, maxCount).map(variableName => {
      const matchedParam = fieldParams.find(param => param.variableName === variableName);
      if (!matchedParam) {
        return `{{${variableName}}}(未找到变量映射)`;
      }

      const sourceFieldName = matchedParam.fieldName || '(未配置字段名)';
      const rawValue = this.getRawFieldValue(fields, matchedParam);
      const extractedValue = this.feishuService.extractFieldValue(rawValue);
      const valuePreview =
        extractedValue === '' || extractedValue === null || extractedValue === undefined
          ? '空值'
          : String(extractedValue);

      return `{{${variableName}}}->${sourceFieldName}=${valuePreview}`;
    });

    const restCount = unresolvedVariables.length - details.length;
    const restSuffix = restCount > 0 ? ` 等 ${unresolvedVariables.length} 个变量` : '';
    return `模板变量未成功替换：${details.join('，')}${restSuffix}。请检查当前记录对应字段值是否为空，或变量映射是否正确。`;
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
          writeBackData[field.fieldName] = value !== undefined ? normalizeTextValue(value) : '无法提取';
        } else {
          writeBackData[field.fieldName] = normalizeUserFacingText(message || '同步成功');
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
          writeBackData[field.fieldName] = value !== undefined ? normalizeTextValue(value) : '无法提取';
        } else {
          writeBackData[field.fieldName] = normalizeUserFacingText(message || '同步失败');
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
          writeBackData[field.fieldName] = value !== undefined ? normalizeTextValue(value) : '无法提取';
        } else {
          writeBackData[field.fieldName] = normalizeUserFacingText(
            JSON.stringify(normalizeTextValue(kingdeeResponse))
          );
        }
      }
    });

    if (Object.keys(writeBackData).length > 0) {
      try {
        await this.feishuService.writeBackData(tableId, recordId, writeBackData);
        return writeBackData;
      } catch (writeError) {
        console.error('回写飞书失败:', writeError.message);
        return writeBackData;
      }
    }

    return null;
  }

  // 閹笛嗩攽娴犺濮?
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
        isStopping: false,
        stopRequestedAt: null,
      });

      debugLog(`[${this.instance.id}] 任务开始执行: ${this.task.name}`);

      // 濮濄儵顎?1: 娴犲酣顥ｆ稊锕佸箯閸欐牗鏆熼幑?
      const { tableId, viewId, filterConditions } = this.task.feishuConfig;
      if (!tableId) {
        throw new Error('飞书表格 ID 未配置');
      }

      const response = await this.feishuService.getTableData(tableId, viewId, filterConditions);
      if (response.code !== 0) {
        throw new Error(normalizeUserFacingText(response.msg || '获取飞书数据失败'));
      }

      const feishuData = response.data?.items || [];
      try {
        this.fieldNameById = await this.feishuService.getFieldNameMap(tableId);
      } catch (fieldError) {
        this.fieldNameById = new Map();
        debugWarn(`[${this.instance.id}] 获取字段映射失败，回退到原字段名: ${fieldError.message}`);
      }

      if (feishuData.length === 0) {
        await this.updateInstance({
          status: TaskStatus.SUCCESS,
          endTime: new Date().toISOString(),
          totalCount: 0,
        });
        debugLog(`[${this.instance.id}] 飞书表格中没有符合条件的记录`);
        return;
      }

      const executionData = this.firstRecordOnly ? [feishuData[0]] : feishuData;

      if (this.firstRecordOnly) {
        debugLog(`[${this.instance.id}] 测试模式：仅执行第一条记录`);
      } else {
        debugLog(`[${this.instance.id}] 从飞书获取到 ${feishuData.length} 条记录`);
      }

      await this.updateInstance({ totalCount: executionData.length });

      // 濮濄儵顎?2: 瀵煎叆鏁版嵁鍒伴噾铦?
      const { formId } = this.task.kingdeeConfig;
      if (!formId) {
        throw new Error('金蝶表单 ID 未配置');
      }

      let successCount = 0;
      let errorCount = 0;
      const total = executionData.length;

      // Parse template once and reuse while processing records.
      const templateContext = this.createTemplateContext();

      // 并发处理
      const CONCURRENCY_LIMIT = 3;
      const queue = [...executionData];
      const executing = [];

      const processItem = async (item, index) => {
        if (this.isStopped || this.isStopping) return;

        const recordId = item.record_id;
        const fields = item.fields || {};
        let finalData = {};
        let requestPreview = {};
        let writeBackResult = null;

        try {
          const payload = this.buildPayloadFromFields(fields, templateContext);
          finalData = payload.finalData;

          const unresolvedVariables = payload.unresolvedVariables;
          if (unresolvedVariables.length > 0) {
            const unresolvedError = new Error(this.buildUnresolvedPlaceholderError(unresolvedVariables, fields));
            unresolvedError.responseData = {
              unresolvedVariables,
              recordId,
            };
            throw unresolvedError;
          }

          const apiMethod = this.kingdeeService.resolveDynamicFormApiMethod(finalData);
          const opNumber = this.kingdeeService.resolveDynamicFormOperationNumber(finalData, apiMethod);
          const payloadData = this.kingdeeService.stripTemplateMetaFields(finalData);
          const requestMeta = this.kingdeeService.buildDynamicFormRequest(formId, apiMethod, opNumber, payloadData);
          requestPreview = this.kingdeeService.buildDynamicFormRequestPreview(requestMeta);

          const result = await this.kingdeeService.saveData(formId, finalData);
          successCount++;
          writeBackResult = await this.handleWriteBack(recordId, 'success', '同步成功', result);

          // 閸欘亙绻氱€涙顑囨稉鈧弶陇顔囪ぐ鏇犳畱閺冦儱绻?
          await this.saveWebApiLog({
            recordId,
            feishuData: normalizeTextValue(fields),
            requestData: normalizeTextValue(requestPreview),
            responseData: normalizeTextValue(result),
            writeBackData: normalizeTextValue(writeBackResult || {}),
            success: true,
          });

        } catch (err) {
          errorCount++;
          const normalizedErrorMessage = normalizeUserFacingText(err.message);
          writeBackResult = await this.handleWriteBack(recordId, 'error', normalizedErrorMessage, err.responseData);

          // 閸欘亙绻氱€涙顑囨稉鈧弶陇顔囪ぐ鏇犳畱閺冦儱绻?
          await this.saveWebApiLog({
            recordId,
            feishuData: normalizeTextValue(fields),
            requestData: normalizeTextValue(requestPreview || finalData || {}),
            responseData: normalizeTextValue(err.responseData || {}),
            writeBackData: normalizeTextValue(writeBackResult || {}),
            success: false,
            errorMessage: normalizeUserFacingText(err.message),
          });

          console.error(`[${this.instance.id}] 记录 ${recordId} 导入失败: ${normalizeUserFacingText(err.message)}`);
        }

        const processedCount = successCount + errorCount;
        const progress = Math.round((processedCount / total) * 100);
        await this.updateInstance({
          progress,
          successCount,
          errorCount,
        });
      };

      // 娣囨繂鐡ㄥ锝呮躬閹笛嗩攽閻?Promise 瀵洜鏁ら敍宀€鏁ゆ禍搴＄暔閸忋劌浠犲?
      this.executingPromises = executing;

      while (queue.length > 0 || executing.length > 0) {
        // 婵″倹鐏夌拠閿嬬湴閸嬫粍顒涢敍灞肩瑝閸愬秳绮犻梼鐔峰灙閸欐牗鏌婃禒璇插閿涘奔绲剧粵澶婄窡瑜版挸澧犳禒璇插鐎瑰本鍨?
        if (this.isStopping) {
          debugLog(`[${this.instance.id}] 收到停止请求，等待 ${executing.length} 个并发任务收尾...`);
          // 不再取新任务，等待当前执行的任务完成
          if (executing.length > 0) {
            await Promise.all(executing);
          }
          break;
        }

        if (this.isStopped) {
          debugLog(`[${this.instance.id}] 任务已被手动停止`);
          break;
        }

        while (executing.length < CONCURRENCY_LIMIT && queue.length > 0) {
          const item = queue.shift();
          const index = executionData.length - queue.length;
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

      // 濮濄儵顎?3: 閺囧瓨鏌婃禒璇插閻樿埖鈧?
      let finalStatus;
      if (this.isStopped || this.isStopping) {
        finalStatus = TaskStatus.ERROR;
      } else if (errorCount === 0) {
        finalStatus = TaskStatus.SUCCESS;
      } else if (successCount === 0) {
        finalStatus = TaskStatus.ERROR;
      } else {
        finalStatus = TaskStatus.WARNING;
      }

      const finalProcessedCount = successCount + errorCount;
      const finalProgress = total > 0 ? Math.round((finalProcessedCount / total) * 100) : 100;

      await this.updateInstance({
        status: finalStatus,
        endTime: new Date().toISOString(),
        progress: finalProgress,
        successCount,
        errorCount,
        isStopping: false,
      });

      debugLog(`[${this.instance.id}] 任务执行完成: 成功 ${successCount} 条, 失败 ${errorCount} 条`);

    } catch (err) {
      console.error(`[${this.instance.id}] 任务执行异常: ${err.message}`);
      await this.updateInstance({
        status: TaskStatus.ERROR,
        endTime: new Date().toISOString(),
        isStopping: false,
      });
      throw err;
    } finally {
      this.isRunning = false;
      if (this.isStopping) {
        this.isStopping = false;
      }
    }
  }

  // 閸嬫粍顒涙禒璇插閿涘牆鐣ㄩ崗銊ヤ粻濮濐澁绱扮粵澶婄窡瑜版挸澧犲锝呮躬閹笛嗩攽閻ㄥ嫯顔囪ぐ鏇炵暚閹存劧绱?
  getRuntimeStatus() {
    return {
      isRunning: this.isRunning,
      isStopping: this.isStopping,
      isStopped: this.isStopped,
    };
  }

  stop() {
    if (this.isStopping || this.isStopped) {
      return;
    }

    this.isStopping = true;
    this.instance.status = TaskStatus.PAUSED;
    this.instance.isStopping = true;
    this.instance.stopRequestedAt = new Date().toISOString();
    this.instance.endTime = null;

    debugLog(`[${this.instance.id}] 请求安全停止，将在当前并发记录完成后结束`);

    if (this.updateInstanceCallback) {
      this.updateInstanceCallback(this.instance).catch(err => {
        console.error(`[${this.instance.id}] 保存停止状态失败:`, err.message);
      });
    }
  }
}

// 瀵煎嚭浠诲姟绠＄悊鍑芥暟
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






