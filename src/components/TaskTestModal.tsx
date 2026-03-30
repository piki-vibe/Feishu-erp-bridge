import type { ReactNode } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Modal,
  Space,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudSyncOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FileSyncOutlined,
  LoginOutlined,
  SyncOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export type TaskTestModalType = 'feishu' | 'kingdee' | 'sync' | 'verification';
export type VerificationTestType =
  | 'feishu-login'
  | 'feishu-field'
  | 'kingdee-login'
  | 'request-preview'
  | 'full-flow';

export interface TaskTestResult {
  loading?: boolean;
  success?: boolean;
  type?: TaskTestModalType | VerificationTestType;
  title?: string;
  message?: string;
  details?: Record<string, unknown>;
  requestData?: unknown;
  feishuFields?: unknown;
  instanceId?: string;
}

interface TaskTestModalProps {
  open: boolean;
  modalType: TaskTestModalType;
  selectedTaskName?: string;
  result: TaskTestResult | null;
  onClose: () => void;
  onRunVerificationTest: (testType: VerificationTestType) => void;
  onOpenInstance: (instanceId: string) => void;
  onExecuteTask: () => void;
}

interface ModalAlertContent {
  message: string;
  description: ReactNode;
}

const verificationActions: Array<{
  key: VerificationTestType;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    key: 'feishu-login',
    title: '1. 飞书登录测试',
    description: '测试飞书连接是否正常。',
    icon: <LoginOutlined />,
  },
  {
    key: 'feishu-field',
    title: '2. 飞书字段查询/筛选/回传测试',
    description: '测试字段查询、筛选条件和回传配置是否正确。',
    icon: <FileSyncOutlined />,
  },
  {
    key: 'kingdee-login',
    title: '3. 金蝶登录测试',
    description: '测试金蝶连接是否正常。',
    icon: <LoginOutlined />,
  },
  {
    key: 'request-preview',
    title: '4. 查看传入数据（不发送）',
    description: '查看筛选后第一条将发送给 WebAPI 的完整请求体。',
    icon: <EyeOutlined />,
  },
  {
    key: 'full-flow',
    title: '5. 第一条记录完整流程测试',
    description: '使用第一条记录执行完整同步流程，并实时显示执行状态。',
    icon: <CloudSyncOutlined />,
  },
];

function getModalTitle(modalType: TaskTestModalType) {
  if (modalType === 'feishu') {
    return { text: '飞书登录测试', icon: <LoginOutlined style={{ color: '#4A90E2' }} /> };
  }
  if (modalType === 'kingdee') {
    return { text: '金蝶登录测试', icon: <LoginOutlined style={{ color: '#F5A623' }} /> };
  }
  if (modalType === 'sync') {
    return { text: '完整同步测试', icon: <CloudSyncOutlined style={{ color: '#52C41A' }} /> };
  }
  return { text: '验证测试', icon: <ExperimentOutlined style={{ color: '#722ed1' }} /> };
}

function getAlertContent(modalType: TaskTestModalType): ModalAlertContent {
  if (modalType === 'feishu') {
    return {
      message: '飞书登录测试',
      description: (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          <li>Step 1: 使用配置的 AppID 和 AppSecret 请求飞书开放平台。</li>
          <li>Step 2: 获取 tenant_access_token（应用访问令牌）。</li>
          <li>Step 3: 验证是否能够访问飞书表格 API。</li>
        </ul>
      ),
    };
  }

  if (modalType === 'kingdee') {
    return {
      message: '金蝶登录测试',
      description: (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          <li>Step 1: 使用配置的服务器地址和金蝶用户名密码。</li>
          <li>Step 2: 调用金蝶 WebAPI 的 `/Login` 接口。</li>
          <li>Step 3: 验证是否返回有效的 `accountId`。</li>
        </ul>
      ),
    };
  }

  if (modalType === 'verification') {
    return {
      message: '验证测试说明',
      description: (
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          <li>Step 1~3: 先验证飞书与金蝶连接配置。</li>
          <li>Step 4: 仅预览将发送给 WebAPI 的数据，不会实际发送。</li>
          <li>Step 5: 执行筛选后第一条记录完整流程测试。</li>
          <li style={{ color: '#FF4D4F' }}>注意：Step 5 会实际调用金蝶与飞书回写，请在测试环境执行。</li>
        </ul>
      ),
    };
  }

  return {
    message: '完整同步测试说明',
    description: (
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        <li>Step 1: 从飞书表格查询第一条记录。</li>
        <li>Step 2: 将数据导入到金蝶系统。</li>
        <li>Step 3: 将同步状态写回飞书表格（仅在配置了回写字段时执行）。</li>
        <li style={{ color: '#FF4D4F' }}>注意：此测试会实际修改金蝶和飞书的数据，请谨慎使用。</li>
      </ul>
    ),
  };
}

function formatDetailValue(value: unknown) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function renderDetails(details?: Record<string, unknown>) {
  if (!details) {
    return null;
  }

  return (
    <div>
      {Object.entries(details).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <Text type="secondary">{key}:</Text>
          <Text style={{ marginLeft: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {formatDetailValue(value)}
          </Text>
        </div>
      ))}
    </div>
  );
}

function renderSelectedTask(selectedTaskName?: string) {
  if (!selectedTaskName) {
    return null;
  }

  return (
    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#F5F5F5', borderRadius: 6 }}>
      <Text type="secondary">当前测试任务：</Text>
      <Text strong>{selectedTaskName}</Text>
    </div>
  );
}

export default function TaskTestModal({
  open,
  modalType,
  selectedTaskName,
  result,
  onClose,
  onRunVerificationTest,
  onOpenInstance,
  onExecuteTask,
}: TaskTestModalProps) {
  const modalTitle = getModalTitle(modalType);
  const alertContent = getAlertContent(modalType);
  const isVerification = modalType === 'verification';

  return (
    <Modal
      title={<Space>{modalTitle.icon}<span>{modalTitle.text}</span></Space>}
      open={open}
      onCancel={onClose}
      footer={null}
      width={isVerification ? 700 : '90%'}
      className="custom-modal"
      zIndex={1050}
    >
      {isVerification ? (
        <div>
          {renderSelectedTask(selectedTaskName)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {verificationActions.map((action) => (
              <Button
                key={action.key}
                block
                size="large"
                onClick={() => onRunVerificationTest(action.key)}
                icon={action.icon}
                style={{ height: 50, justifyContent: 'flex-start', padding: '0 16px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Text strong>{action.title}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{action.description}</Text>
                </div>
              </Button>
            ))}
          </div>
        </div>
      ) : renderSelectedTask(selectedTaskName)}

      <Alert
        message={alertContent.message}
        description={alertContent.description}
        type="warning"
        showIcon
        style={{ marginBottom: 24 }}
      />

      {result && !isVerification ? (
        <Card
          title={(
            <Space>
              {result.success ? <CheckCircleOutlined style={{ color: '#52C41A' }} /> : <CloseCircleOutlined style={{ color: '#FF4D4F' }} />}
              <span>{result.title}</span>
            </Space>
          )}
          style={{
            background: result.success ? '#F6FFED' : '#FFF1F0',
            border: `1px solid ${result.success ? '#B7EB8F' : '#FFA39E'}`,
          }}
        >
          {result.message ? (
            <div style={{ marginBottom: 16 }}>
              <Text type={result.success ? 'success' : 'danger'}>{result.message}</Text>
            </div>
          ) : null}
          {renderDetails(result.details)}
        </Card>
      ) : null}

      {result && isVerification ? (
        <Card
          title={(
            <Space>
              {result.loading ? <SyncOutlined spin /> : result.success ? <CheckCircleOutlined style={{ color: '#52C41A' }} /> : <CloseCircleOutlined style={{ color: '#FF4D4F' }} />}
              <span>{result.title || '测试结果'}</span>
            </Space>
          )}
          style={{
            background: result.loading ? '#FAFAFA' : result.success ? '#F6FFED' : '#FFF1F0',
            border: `1px solid ${result.loading ? '#E8E8E8' : result.success ? '#B7EB8F' : '#FFA39E'}`,
          }}
        >
          {result.message ? (
            <div style={{ marginBottom: 16 }}>
              <Text type={result.success ? 'success' : 'danger'}>{result.message}</Text>
            </div>
          ) : null}
          {renderDetails(result.details)}

          {result.type === 'request-preview' ? (
            <Collapse
              style={{ marginTop: 12 }}
              items={[
                {
                  key: 'preview-request-data',
                  label: '预览：即将发送给金蝶的完整请求参数',
                  children: (
                    <pre style={{ margin: 0, fontSize: 11, maxHeight: 280, overflow: 'auto', background: '#F5F5F5', padding: 12, borderRadius: 6 }}>
                      {JSON.stringify(result.requestData || {}, null, 2)}
                    </pre>
                  ),
                },
                {
                  key: 'preview-feishu-fields',
                  label: '预览：当前第一条记录原始字段',
                  children: (
                    <pre style={{ margin: 0, fontSize: 11, maxHeight: 280, overflow: 'auto', background: '#F5F5F5', padding: 12, borderRadius: 6 }}>
                      {JSON.stringify(result.feishuFields || {}, null, 2)}
                    </pre>
                  ),
                },
              ]}
            />
          ) : null}

          {result.type === 'full-flow' && result.instanceId ? (
            <Button style={{ marginTop: 12 }} onClick={() => onOpenInstance(result.instanceId as string)}>
              查看执行情况
            </Button>
          ) : null}

          {result.loading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <SyncOutlined spin style={{ fontSize: 24 }} />
              <div style={{ marginTop: 12 }}>正在执行测试...</div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <Button block onClick={onClose}>
          关闭
        </Button>
        {isVerification && result && !result.loading ? (
          <Button type="primary" block onClick={onExecuteTask}>
            执行任务
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
