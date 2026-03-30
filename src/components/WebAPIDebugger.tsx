import { useState } from 'react';
import {
  Card,
  Input,
  Button,
  AutoComplete,
  message,
  Tabs,
  Typography,
  Space,
  Alert,
  Divider,
  Tag,
  Row,
  Col,
  Tooltip,
} from 'antd';
import {
  ApiOutlined,
  PlayCircleOutlined,
  ClearOutlined,
  CopyOutlined,
  LoginOutlined,
  SendOutlined,
  LockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import KingdeeService from '../services/kingdeeService';
import type { KingdeeConfig } from '../types';
import {
  buildKingdeeRequestPreview,
  DEFAULT_KINGDEE_API_METHOD,
  KINGDEE_API_METHOD_OPTIONS,
  getKingdeeActionText,
  normalizeKingdeeApiMethod,
  normalizeKingdeeOpNumber,
} from '../utils/kingdeeApi';

const { TextArea } = Input;
const { Text, Title } = Typography;

// 默认登录参数
const defaultLoginParams = {
  appId: '',
  appSecret: '',
  username: '',
  password: '',
  baseUrl: '',
  acctId: '',
  dbId: '',
};

// 默认数据模板示例
const defaultDataTemplate = `{
  "Creator": "Administrator",
  "NeedUpDateFields": [],
  "Model": {
    "FBillType": "BD_MATERIAL",
    "FNumber": "TEST001",
    "FName": "测试物料",
    "FSpecification": "规格型号"
  }
}`;

function WebAPIDebugger() {
  // 登录参数
  const [loginParams, setLoginParams] = useState(defaultLoginParams);
  // 表单ID
  const [formId, setFormId] = useState('');
  const [apiMethod, setApiMethod] = useState(DEFAULT_KINGDEE_API_METHOD);
  const [opNumber, setOpNumber] = useState('');
  // 数据模板
  const [dataTemplate, setDataTemplate] = useState(defaultDataTemplate);
  // 测试结果
  const [testResult, setTestResult] = useState<any>(null);
  // 加载状态
  const [loading, setLoading] = useState(false);
  // 当前激活的标签页
  const [activeTab, setActiveTab] = useState('login');
  // 登录成功状态
  const [loginSuccess, setLoginSuccess] = useState(false);
  // 保存 KingdeeService 实例
  const [kingdeeService, setKingdeeService] = useState<KingdeeService | null>(null);

  // 测试登录
  const handleTestLogin = async () => {
    if (!loginParams.baseUrl) {
      message.error('请输入服务器地址');
      return;
    }
    if (!loginParams.username || !loginParams.password) {
      message.error('请输入用户名和密码');
      return;
    }
    if (!loginParams.acctId) {
      message.error('请输入账套ID');
      return;
    }

    setLoading(true);
    setTestResult(null);
    setLoginSuccess(false);

    try {
      const config: KingdeeConfig = {
        loginParams,
        apiMethod: DEFAULT_KINGDEE_API_METHOD,
        opNumber: '',
        formId: '',
        dataTemplate: '',
      };

      const service = new KingdeeService(config);
      const result = await service.testConnection();

      setTestResult({
        type: 'login',
        success: result.success,
        title: result.success ? '登录测试成功' : '登录测试失败',
        message: result.message,
        details: result.details,
        timestamp: new Date().toISOString(),
      });

      if (result.success) {
        message.success('登录测试成功，可以进入数据测试');
        setLoginSuccess(true);
        setKingdeeService(service);
        // 登录成功后自动切换到数据测试标签
        setActiveTab('data');
      } else {
        message.error(result.message);
        setKingdeeService(null);
      }
    } catch (error: any) {
      setTestResult({
        type: 'login',
        success: false,
        title: '登录测试失败',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
      message.error(`登录测试失败: ${error.message}`);
      setKingdeeService(null);
    } finally {
      setLoading(false);
    }
  };

  // 测试保存数据
  const handleTestSave = async () => {
    // 检查是否已登录
    if (!loginSuccess || !kingdeeService) {
      message.error('请先完成登录测试');
      setActiveTab('login');
      return;
    }

    if (!formId) {
      message.error('请输入表单ID');
      return;
    }
    if (!dataTemplate) {
      message.error('请输入数据模板');
      return;
    }

    // 验证JSON格式
    let parsedData: any;
    try {
      parsedData = JSON.parse(dataTemplate);
    } catch (error: any) {
      message.error(`数据模板JSON格式错误: ${error.message}`);
      return;
    }

    setLoading(true);
    setTestResult(null);

    try {
      const normalizedApiMethod = normalizeKingdeeApiMethod(apiMethod);
      const normalizedOpNumber = normalizeKingdeeOpNumber(opNumber);
      const actionText = getKingdeeActionText(
        normalizedApiMethod.trim().toLowerCase() === 'excuteoperation' && normalizedOpNumber
          ? normalizedOpNumber
          : normalizedApiMethod
      );
      const requestPreview = buildKingdeeRequestPreview({
        baseUrl: loginParams.baseUrl,
        formId,
        data: parsedData,
        apiMethod: normalizedApiMethod,
        opNumber: normalizedOpNumber,
      });
      const result = await kingdeeService.saveData(formId, parsedData, normalizedApiMethod, normalizedOpNumber);

      setTestResult({
        type: 'save',
        success: true,
        title: `数据${actionText}成功`,
        requestData: requestPreview,
        responseData: result,
        timestamp: new Date().toISOString(),
      });

      message.success(`数据${actionText}成功`);
    } catch (error: any) {
      const normalizedApiMethod = normalizeKingdeeApiMethod(apiMethod);
      const normalizedOpNumber = normalizeKingdeeOpNumber(opNumber);
      const actionText = getKingdeeActionText(
        normalizedApiMethod.trim().toLowerCase() === 'excuteoperation' && normalizedOpNumber
          ? normalizedOpNumber
          : normalizedApiMethod
      );
      const requestPreview = buildKingdeeRequestPreview({
        baseUrl: loginParams.baseUrl,
        formId,
        data: parsedData,
        apiMethod: normalizedApiMethod,
        opNumber: normalizedOpNumber,
      });
      setTestResult({
        type: 'save',
        success: false,
        title: `数据${actionText}失败`,
        requestData: requestPreview,
        errorMessage: error.message,
        responseData: error.responseData,
        timestamp: new Date().toISOString(),
      });
      message.error(`数据${actionText}失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 清空结果
  const handleClear = () => {
    setTestResult(null);
    message.info('已清空测试结果');
  };

  // 复制结果
  const handleCopy = () => {
    if (testResult) {
      const text = JSON.stringify(testResult, null, 2);
      navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    }
  };

  // 重置登录状态（当用户修改登录参数时）
  const handleLoginParamChange = (field: string, value: string) => {
    setLoginParams({ ...loginParams, [field]: value });
    // 如果修改了关键参数，需要重新登录
    if (['baseUrl', 'username', 'password', 'acctId'].includes(field)) {
      setLoginSuccess(false);
      setKingdeeService(null);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={
          <Space>
            <ApiOutlined style={{ color: '#4A90E2', fontSize: 20 }} />
            <Title level={4} style={{ margin: 0 }}>
              金蝶 WebAPI 调试工具
            </Title>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Alert
          message="独立调试工具"
          description="此工具用于直接测试金蝶 WebAPI，与飞书数据同步功能完全独立。请先完成登录测试，成功后才能进行数据测试。"
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        {/* 登录状态指示器 */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Text strong>登录状态：</Text>
          {loginSuccess ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              已登录
            </Tag>
          ) : (
            <Tag icon={<CloseCircleOutlined />} color="error">
              未登录
            </Tag>
          )}
          {loginSuccess && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              服务器：{loginParams.baseUrl}
            </Text>
          )}
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            // 如果切换到数据测试但未登录成功，提示用户
            if (key === 'data' && !loginSuccess) {
              message.warning('请先完成登录测试');
              return;
            }
            setActiveTab(key);
          }}
          items={[
            {
              key: 'login',
              label: (
                <Space>
                  <LoginOutlined />
                  登录测试
                  {loginSuccess && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                </Space>
              ),
              children: (
                <Card title="金蝶登录参数" size="small" style={{ marginBottom: 24 }}>
                  <Row gutter={16}>
                    <Col span={24}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          服务器地址 <Text type="danger">*</Text>
                        </Text>
                        <Input
                          placeholder="例如: http://192.168.1.100:8090"
                          value={loginParams.baseUrl}
                          onChange={(e) => handleLoginParamChange('baseUrl', e.target.value)}
                        />
                      </div>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          账套 ID (AcctID) <Text type="danger">*</Text>
                        </Text>
                        <Input
                          placeholder="例如: 647298"
                          value={loginParams.acctId}
                          onChange={(e) => handleLoginParamChange('acctId', e.target.value)}
                        />
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          数据库 ID (DbID)
                        </Text>
                        <Input
                          placeholder="可选"
                          value={loginParams.dbId}
                          onChange={(e) => handleLoginParamChange('dbId', e.target.value)}
                        />
                      </div>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          用户名 <Text type="danger">*</Text>
                        </Text>
                        <Input
                          placeholder="金蝶用户名"
                          value={loginParams.username}
                          onChange={(e) => handleLoginParamChange('username', e.target.value)}
                        />
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          密码 <Text type="danger">*</Text>
                        </Text>
                        <Input.Password
                          placeholder="金蝶密码"
                          value={loginParams.password}
                          onChange={(e) => handleLoginParamChange('password', e.target.value)}
                        />
                      </div>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          App ID (可选)
                        </Text>
                        <Input
                          placeholder="应用ID"
                          value={loginParams.appId}
                          onChange={(e) => handleLoginParamChange('appId', e.target.value)}
                        />
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          App Secret (可选)
                        </Text>
                        <Input.Password
                          placeholder="应用密钥"
                          value={loginParams.appSecret}
                          onChange={(e) => handleLoginParamChange('appSecret', e.target.value)}
                        />
                      </div>
                    </Col>
                  </Row>

                  <Space>
                    <Button
                      type="primary"
                      icon={<LoginOutlined />}
                      loading={loading && activeTab === 'login'}
                      onClick={handleTestLogin}
                      size="large"
                    >
                      测试登录
                    </Button>
                    {loginSuccess && (
                      <Button
                        type="default"
                        icon={<SendOutlined />}
                        onClick={() => setActiveTab('data')}
                      >
                        进入数据测试
                      </Button>
                    )}
                  </Space>
                </Card>
              ),
            },
            {
              key: 'data',
              label: (
                <Tooltip title={loginSuccess ? '' : '请先完成登录测试'}>
                  <span style={{ opacity: loginSuccess ? 1 : 0.5 }}>
                    <Space>
                      <SendOutlined />
                      数据测试
                      {!loginSuccess && <LockOutlined />}
                    </Space>
                  </span>
                </Tooltip>
              ),
              disabled: !loginSuccess,
              children: (
                <Card
                  title={
                    <Space>
                      <span>数据保存参数</span>
                      <Tag color="green">
                        已连接: {loginParams.baseUrl}
                      </Tag>
                    </Space>
                  }
                  size="small"
                  style={{ marginBottom: 24 }}
                >
                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      表单 ID (FormId)
                    </Text>
                    <Input
                      placeholder="例如: BD_MATERIAL, AP_PAYBILL 等"
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <Row gutter={16}>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          API 鏂规硶
                        </Text>
                        <AutoComplete
                          value={apiMethod}
                          options={KINGDEE_API_METHOD_OPTIONS}
                          onChange={(value) => setApiMethod(normalizeKingdeeApiMethod(value))}
                          placeholder="例如：Save / Delete / ExcuteOperation"
                          filterOption={(inputValue, option) => {
                            const optionValue = String(option?.value || '').toLowerCase();
                            const optionLabel = typeof option?.label === 'string' ? option.label.toLowerCase() : '';
                            const keyword = inputValue.toLowerCase();
                            return optionValue.includes(keyword) || optionLabel.includes(keyword);
                          }}
                        >
                          <Input />
                        </AutoComplete>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          opNumber (鍙€?)
                        </Text>
                        <Input
                          placeholder="渚嬪锛?Forbid / UnForbid"
                          value={opNumber}
                          onChange={(e) => setOpNumber(normalizeKingdeeOpNumber(e.target.value))}
                        />
                      </div>
                    </Col>
                  </Row>

                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                      数据模板 (JSON)
                    </Text>
                    <TextArea
                      placeholder="请输入JSON格式的数据模板"
                      value={dataTemplate}
                      onChange={(e) => setDataTemplate(e.target.value)}
                      rows={15}
                      style={{ fontFamily: 'monospace', fontSize: 13 }}
                    />
                  </div>

                  <Space>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      loading={loading && activeTab === 'data'}
                      onClick={handleTestSave}
                      size="large"
                    >
                      执行保存
                    </Button>
                    <Button
                      icon={<ClearOutlined />}
                      onClick={() => setDataTemplate('')}
                    >
                      清空
                    </Button>
                    <Button
                      onClick={() => setDataTemplate(defaultDataTemplate)}
                    >
                      恢复默认
                    </Button>
                    <Button
                      onClick={() => setActiveTab('login')}
                    >
                      返回登录
                    </Button>
                  </Space>
                </Card>
              ),
            },
          ]}
        />
      </Card>

      {/* 测试结果展示 */}
      {testResult && (
        <Card
          title={
            <Space>
              {testResult.success ? (
                <Tag color="success">成功</Tag>
              ) : (
                <Tag color="error">失败</Tag>
              )}
              <Text strong>{testResult.title}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(testResult.timestamp).toLocaleString()}
              </Text>
            </Space>
          }
          extra={
            <Space>
              <Button icon={<CopyOutlined />} size="small" onClick={handleCopy}>
                复制结果
              </Button>
              <Button icon={<ClearOutlined />} size="small" onClick={handleClear}>
                清空
              </Button>
            </Space>
          }
          style={{
            background: testResult.success ? '#F6FFED' : '#FFF1F0',
            border: `1px solid ${testResult.success ? '#B7EB8F' : '#FFA39E'}`,
          }}
        >
          {testResult.message && (
            <Alert
              message={testResult.message}
              type={testResult.success ? 'success' : 'error'}
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {testResult.type === 'login' && testResult.details && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>登录信息:</Text>
              <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                {Object.entries(testResult.details).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: 4 }}>
                    <Text type="secondary">{key}:</Text>
                    <Text style={{ marginLeft: 8 }}>{String(value)}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {testResult.type === 'save' && (
            <>
              <Divider>请求数据</Divider>
              <div style={{ marginBottom: 16 }}>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: '#f5f5f5',
                    borderRadius: 4,
                    fontSize: 12,
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(testResult.requestData, null, 2)}
                </pre>
              </div>

              <Divider>响应数据</Divider>
              {testResult.success ? (
                <div style={{ marginBottom: 16 }}>
                  <pre
                    style={{
                      margin: 0,
                      padding: 12,
                      background: '#f5f5f5',
                      borderRadius: 4,
                      fontSize: 12,
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(testResult.responseData, null, 2)}
                  </pre>
                </div>
              ) : (
                <>
                  <Alert
                    message={testResult.errorMessage}
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                  {testResult.responseData && (
                    <div style={{ marginBottom: 16 }}>
                      <Text strong type="secondary">响应内容：</Text>
                      <pre
                        style={{
                          margin: 0,
                          padding: 12,
                          background: '#f5f5f5',
                          borderRadius: 4,
                          fontSize: 12,
                          maxHeight: 400,
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(testResult.responseData, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}

export default WebAPIDebugger;
