import axios from 'axios';
import type { KingdeeConfig } from '../types';
import {
  buildKingdeeRequestPreview,
  getKingdeeActionText,
  normalizeKingdeeApiMethod,
  normalizeKingdeeOpNumber,
} from '../utils/kingdeeApi';

interface KingdeeResponse {
  LoginResultType?: number;
  Result?: any;
  Exception?: string;
  [key: string]: any;
}

export interface TestConnectionResult {
  success: boolean;
  statusCode: number;
  message: string;
  details?: any;
}

interface DynamicFormRequestMeta {
  apiMethod: string;
  endpointMethod: string;
  opNumber: string;
  url: string;
  payload: Record<string, unknown>;
}

class KingdeeService {
  private username: string;
  private password: string;
  private baseUrl: string;
  private acctId?: string;
  private dbId?: string;
  private defaultApiMethod: string;
  private defaultOpNumber: string;

  private isLoggedIn = false;
  private loginTime = 0;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000;

  constructor(config: KingdeeConfig) {
    this.baseUrl = config.loginParams.baseUrl || '';
    this.username = config.loginParams.username;
    this.password = config.loginParams.password;
    this.acctId = config.loginParams.acctId;
    this.dbId = config.loginParams.dbId;
    this.defaultApiMethod = normalizeKingdeeApiMethod(config.apiMethod);
    this.defaultOpNumber = normalizeKingdeeOpNumber(config.opNumber);

    console.log('KingdeeService initialized with:', {
      baseUrl: this.baseUrl,
      username: this.username,
      acctId: this.acctId ? '***' : 'empty',
      dbId: this.dbId ? '***' : 'empty',
      apiMethod: this.defaultApiMethod,
      opNumber: this.defaultOpNumber || '(empty)',
    });
  }

  private isSessionValid(): boolean {
    if (!this.isLoggedIn) return false;
    const now = Date.now();
    const elapsed = now - this.loginTime;
    const isValid = elapsed < this.SESSION_TIMEOUT;
    console.log(`Session check: ${isValid ? 'valid' : 'expired'} (${Math.floor(elapsed / 1000)}s elapsed)`);
    return isValid;
  }

  private markLoggedIn(): void {
    this.isLoggedIn = true;
    this.loginTime = Date.now();
    console.log('Session marked as logged in at:', new Date(this.loginTime).toLocaleString());
  }

  private clearSession(): void {
    this.isLoggedIn = false;
    this.loginTime = 0;
    console.log('Session cleared');
  }

  getLoginStatus(): boolean {
    return this.isSessionValid();
  }

  async login(): Promise<boolean> {
    try {
      const url = '/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser.common.kdsvc';
      const acctId = this.acctId || this.dbId || '';

      const payload = {
        baseUrl: this.baseUrl,
        acctID: acctId,
        username: this.username,
        password: this.password,
        lcid: 2052,
      };

      console.log('Logging in to Kingdee via proxy:', url);
      console.log('Login payload:', {
        baseUrl: this.baseUrl,
        acctID: acctId ? '***' : 'empty',
        username: this.username,
        password: this.password ? '***' : 'empty',
      });

      const response = await axios.post<KingdeeResponse>(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      });

      console.log('Login response:', response.data);

      const responsePayload: unknown = response.data;
      if (typeof responsePayload === 'string' && responsePayload.startsWith('response_error')) {
        throw new Error(`金蝶服务返回异常: ${responsePayload}`);
      }

      if (response.data.LoginResultType === 1) {
        console.log('金蝶登录成功');
        this.markLoggedIn();
        return true;
      }

      console.log('金蝶登录失败');
      this.clearSession();
      return false;
    } catch (error: any) {
      console.error('金蝶登录失败:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        throw new Error(`登录失败: ${error.response.data?.Exception || error.response.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const loginSuccess = await this.login();

      if (loginSuccess) {
        return {
          success: true,
          statusCode: 200,
          message: '金蝶连接测试成功，登录验证通过',
          details: {
            baseUrl: this.baseUrl,
            username: this.username,
          },
        };
      }

      return {
        success: false,
        statusCode: 401,
        message: '金蝶连接测试失败，登录验证未通过，请检查用户名、密码或账套 ID',
      };
    } catch (error: any) {
      console.error('金蝶连接测试失败:', error);

      let errorMessage = error.message;
      let statusCode = -1;

      if (error.response) {
        statusCode = error.response.status;
        errorMessage = error.response.data?.Exception || error.response.data?.msg || error.response.data?.error || error.message;
      } else if (error.request) {
        errorMessage = '网络错误，无法连接到金蝶服务器';
      }

      return {
        success: false,
        statusCode,
        message: `连接失败: ${errorMessage}`,
      };
    }
  }

  private resolveApiMethod(apiMethod?: string): string {
    return normalizeKingdeeApiMethod(apiMethod || this.defaultApiMethod);
  }

  private resolveOpNumber(opNumber?: string): string {
    return normalizeKingdeeOpNumber(opNumber ?? this.defaultOpNumber);
  }

  private buildDynamicFormRequest(formId: string, data: any, apiMethod?: string, opNumber?: string): DynamicFormRequestMeta {
    const requestPreview = buildKingdeeRequestPreview({
      baseUrl: this.baseUrl,
      formId,
      data,
      apiMethod: this.resolveApiMethod(apiMethod),
      opNumber: this.resolveOpNumber(opNumber),
    });

    return {
      apiMethod: requestPreview.apiMethod,
      endpointMethod: requestPreview.endpointMethod,
      opNumber: requestPreview.opNumber || '',
      url: requestPreview.requestUrl,
      payload: requestPreview.payload as unknown as Record<string, unknown>,
    };
  }

  private getActionText(requestMeta: DynamicFormRequestMeta): string {
    if (requestMeta.apiMethod.trim().toLowerCase() === 'excuteoperation' && requestMeta.opNumber) {
      return getKingdeeActionText(requestMeta.opNumber || requestMeta.apiMethod);
    }
    return getKingdeeActionText(requestMeta.apiMethod);
  }

  async validateData(formId: string, data: any): Promise<any> {
    try {
      if (!this.isSessionValid()) {
        console.log('Session invalid or expired, re-login required');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('金蝶登录失败，无法验证数据');
        }
      } else {
        console.log('Using existing session, skip login');
      }

      const url = '/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Save.common.kdsvc';
      const payload = {
        baseUrl: this.baseUrl,
        formid: formId,
        data: {
          ...data,
          ValidateFlag: 'true',
        },
      };

      console.log('Validating data to Kingdee:', url);
      console.log('Validate payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post<KingdeeResponse>(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      console.log('Validate response:', response.data);

      return response.data;
    } catch (error: any) {
      console.error('验证数据失败:', error);
      if (error.response) {
        throw new Error(`验证失败: ${error.response.data?.Exception || error.response.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async saveData(formId: string, data: any, apiMethod?: string, opNumber?: string): Promise<any> {
    const requestMeta = this.buildDynamicFormRequest(formId, data, apiMethod, opNumber);
    const actionText = this.getActionText(requestMeta);

    try {
      if (!this.isSessionValid()) {
        console.log('Session invalid or expired, re-login required');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('金蝶登录失败，无法发送请求');
        }
      } else {
        console.log('Using existing session, skip login');
      }

      console.log('Sending request to Kingdee:', {
        apiMethod: requestMeta.apiMethod,
        endpointMethod: requestMeta.endpointMethod,
        opNumber: requestMeta.opNumber || '(empty)',
        url: requestMeta.url,
      });
      console.log('Request payload:', JSON.stringify(requestMeta.payload, null, 2));

      const response = await axios.post<KingdeeResponse>(requestMeta.url, requestMeta.payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      console.log('Request response:', response.data);

      if (response.data.Exception) {
        const error = new Error(`${actionText}失败: ${response.data.Exception}`);
        (error as any).responseData = response.data;
        throw error;
      }

      if (response.data.Result?.ResponseStatus) {
        const status = response.data.Result.ResponseStatus;
        if (!status.IsSuccess && status.Errors && status.Errors.length > 0) {
          const errorMessages = status.Errors.map((item: any) => item.Message).join('; ');
          const error = new Error(`${actionText}失败: ${errorMessages}`);
          (error as any).responseData = response.data;
          throw error;
        }
      }

      return response.data;
    } catch (error: any) {
      console.error('Kingdee request failed:', error);
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.Exception || errorData?.error || error.message;
        const enhancedError = new Error(`${actionText}失败: ${errorMessage}`);
        (enhancedError as any).responseData = errorData;
        throw enhancedError;
      }
      throw error;
    }
  }
}

export default KingdeeService;
