import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Input,
  Row,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  ApiOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { ocrControlApi, type OcrServiceStatus } from '../services/apiService';
import './InvoiceOcrPanel.css';

const { Text, Title } = Typography;

function getDefaultPublicBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://127.0.0.1:5000';
}

const DEFAULT_PUBLIC_BASE_URL = getDefaultPublicBaseUrl();
const DEFAULT_ENDPOINT = `${DEFAULT_PUBLIC_BASE_URL}/api/extract`;
const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.bmp', '.webp'];
const SERVICE_POLL_INTERVAL_MS = 10000;
const UNSUPPORTED_FORMAT_TEXT = '文件格式不对，仅支持 PDF 和图片';
const NO_INVOICE_NUMBER = '无发票号码';

interface OcrTotalPayload extends Record<string, unknown> {
  has_invoice_number_label?: boolean;
  matched_invoice_number?: string;
  raw_text_lines?: unknown[];
  match_details?: unknown[];
  all_number_tokens?: unknown[];
  ignored_number_tokens?: unknown[];
  scan_rule?: string;
}

interface OcrResult {
  invoice_number: string;
  processing_time: number;
  total?: OcrTotalPayload;
}

interface HistoryItem {
  id: string;
  fileName: string;
  invoiceNumber: string;
  processingTime: number;
  createdAt: string;
}

const DEFAULT_SERVICE_STATUS: OcrServiceStatus = {
  running: false,
  baseUrl: DEFAULT_PUBLIC_BASE_URL,
  extractUrl: DEFAULT_ENDPOINT,
  batchUrl: `${DEFAULT_PUBLIC_BASE_URL}/api/extract-batch`,
  supportedFormats: ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'webp'],
  lowPowerMode: true,
  processIsolated: true,
  health: null,
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

function isSupportedFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return file.type === 'application/pdf'
    || file.type.startsWith('image/')
    || SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

export default function InvoiceOcrPanel() {
  const [serviceStatus, setServiceStatus] = useState<OcrServiceStatus>(DEFAULT_SERVICE_STATUS);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceAction, setServiceAction] = useState<'start' | 'stop' | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [errorText, setErrorText] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const currentFile = fileList[0]?.originFileObj as File | undefined;
  const serviceRunning = serviceStatus.running === true;
  const currentEndpoint = serviceStatus.extractUrl || DEFAULT_ENDPOINT;
  const selectedFileName = currentFile?.name || '等待上传文件';
  const selectedFileSize = currentFile ? formatFileSize(currentFile.size) : '尚未选择';
  const selectedFileScope = '严格规则：只提取“发票号码”后的号码';
  const serviceModeLabel = serviceStatus.processIsolated ? '低功耗子进程' : '常驻模式';
  const serviceStateLabel = serviceRunning ? '可直接识别' : '等待启动';
  const serviceEngineLabel = serviceStatus.health?.engine_ready ? '已预热' : '按需唤起';
  const hasDetectedInvoiceNumber = !!result && result.invoice_number !== NO_INVOICE_NUMBER;
  const resultTotal = result?.total;

  const curlSnippet = useMemo(
    () => [
      `curl -X POST "${currentEndpoint}" \\`,
      '  -F "file=@/path/to/your-invoice.pdf"',
    ].join('\n'),
    [currentEndpoint]
  );

  const jsonSnippet = useMemo(
    () =>
      `fetch("${currentEndpoint}", {\n`
      + '  method: "POST",\n'
      + '  headers: { "Content-Type": "application/json" },\n'
      + '  body: JSON.stringify({ url: "https://example.com/invoice.png" })\n'
      + '}).then(r => r.json()).then(console.log);',
    [currentEndpoint]
  );

  const resultTraceJson = useMemo(
    () => (resultTotal ? JSON.stringify(resultTotal, null, 2) : ''),
    [resultTotal]
  );

  const refreshServiceStatus = useCallback(async (showToast = false) => {
    try {
      const nextStatus = await ocrControlApi.getStatus();
      setServiceStatus(nextStatus);
      if (showToast) {
        message.success(nextStatus.running ? 'OCR 服务在线' : 'OCR 服务未启动');
      }
    } catch (error: unknown) {
      setServiceStatus(DEFAULT_SERVICE_STATUS);
      if (showToast) {
        message.error(getErrorMessage(error, '获取 OCR 服务状态失败'));
      }
    } finally {
      setServiceLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const loadStatus = async (showToast = false) => {
      if (disposed) {
        return;
      }
      await refreshServiceStatus(showToast);
    };

    loadStatus(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      loadStatus(false);
    }, SERVICE_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [refreshServiceStatus]);

  const resetPanel = () => {
    setFileList([]);
    setResult(null);
    setErrorText('');
  };

  const runDemo = () => {
    setErrorText('');
    setResult({
      invoice_number: '044002100111202603280001',
      processing_time: 0.87,
      total: {
        has_invoice_number_label: true,
        matched_invoice_number: '044002100111202603280001',
        raw_text_lines: ['发票号码: 044002100111202603280001', '价税合计: 1322.50'],
        match_details: [
          {
            source: 'single_line',
            start_line_index: 0,
            end_line_index: 0,
            candidate: '044002100111202603280001',
          },
        ],
        all_number_tokens: ['044002100111202603280001', '132250'],
        ignored_number_tokens: ['132250'],
        scan_rule: 'strict_label_only_after_发票号码',
      },
    });
  };

  const handleStartService = async () => {
    setServiceAction('start');
    try {
      const nextStatus = await ocrControlApi.startService();
      setServiceStatus(nextStatus);
      if (!nextStatus.running) {
        throw new Error('OCR 服务启动失败');
      }
      message.success('OCR 服务已启动');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, 'OCR 服务启动失败'));
    } finally {
      setServiceAction(null);
      setServiceLoading(false);
    }
  };

  const handleStopService = async () => {
    setServiceAction('stop');
    try {
      const nextStatus = await ocrControlApi.stopService();
      setServiceStatus(nextStatus);
      setLoading(false);
      setErrorText('');
      message.success('OCR 服务已关闭');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, 'OCR 服务关闭失败'));
    } finally {
      setServiceAction(null);
      setServiceLoading(false);
    }
  };

  const extractInvoice = async () => {
    if (!serviceRunning) {
      message.warning('请先启动 OCR 服务');
      return;
    }

    if (!currentFile) {
      message.warning('请先上传发票文件');
      return;
    }

    if (!isSupportedFile(currentFile)) {
      setErrorText(UNSUPPORTED_FORMAT_TEXT);
      message.error(UNSUPPORTED_FORMAT_TEXT);
      return;
    }

    setLoading(true);
    setErrorText('');
    try {
      const formData = new FormData();
      formData.append('file', currentFile);

      const response = await fetch(currentEndpoint, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || `请求失败，状态码 ${response.status}`);
      }

      const nextResult: OcrResult = {
        invoice_number: String(payload.invoice_number || ''),
        processing_time: Number(payload.processing_time || 0),
        total: payload.total && typeof payload.total === 'object' ? payload.total as OcrTotalPayload : undefined,
      };
      setResult(nextResult);

      const historyItem: HistoryItem = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fileName: currentFile.name,
        invoiceNumber: nextResult.invoice_number || NO_INVOICE_NUMBER,
        processingTime: nextResult.processing_time,
        createdAt: new Date().toLocaleString('zh-CN'),
      };
      setHistory((prev) => [historyItem, ...prev].slice(0, 8));
      if (nextResult.invoice_number === NO_INVOICE_NUMBER) {
        message.warning('已完成 OCR，但未找到“发票号码”标签');
      } else {
        message.success('发票识别完成');
      }
    } catch (error: unknown) {
      const text = getErrorMessage(error, '识别失败');
      setErrorText(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  };

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动复制');
    }
  }, []);

  const resultTraceItems = useMemo(() => {
    if (!resultTotal || !resultTraceJson) {
      return [];
    }

    const lineCount = Array.isArray(resultTotal.raw_text_lines) ? resultTotal.raw_text_lines.length : 0;
    const matchCount = Array.isArray(resultTotal.match_details) ? resultTotal.match_details.length : 0;
    const tokenCount = Array.isArray(resultTotal.all_number_tokens) ? resultTotal.all_number_tokens.length : 0;
    const hasLabel = resultTotal.has_invoice_number_label === true;

    return [
      {
        key: 'total',
        label: 'OCR 全量信息 total',
        children: (
          <div className="result-trace-shell">
            <div className="result-trace-grid">
              <div className="result-trace-card">
                <span className="upload-meta-label">标签命中</span>
                <strong className="upload-meta-value">{hasLabel ? '已命中发票号码' : '未命中发票号码'}</strong>
              </div>
              <div className="result-trace-card">
                <span className="upload-meta-label">OCR 文本行数</span>
                <strong className="upload-meta-value">{lineCount}</strong>
              </div>
              <div className="result-trace-card">
                <span className="upload-meta-label">候选明细数</span>
                <strong className="upload-meta-value">{matchCount}</strong>
              </div>
              <div className="result-trace-card">
                <span className="upload-meta-label">识别数字片段</span>
                <strong className="upload-meta-value">{tokenCount}</strong>
              </div>
            </div>
            <div className="result-trace-toolbar">
              <Text className="service-status-hint">接口返回已原样保留 `total`，方便联调与审计。</Text>
              <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(resultTraceJson)}>
                复制 total
              </Button>
            </div>
            <pre className="invoice-code-block result-trace-code">{resultTraceJson}</pre>
          </div>
        ),
      },
    ];
  }, [copyText, resultTotal, resultTraceJson]);

  const apiExampleItems = useMemo(
    () => [
      {
        key: 'file-upload',
        label: '文件上传：参数保持 `file` 不变',
        children: (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <pre className="invoice-code-block">{curlSnippet}</pre>
            <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(curlSnippet)}>
              复制 cURL
            </Button>
          </Space>
        ),
      },
      {
        key: 'url-mode',
        label: 'URL 模式：参数保持 `{url}` 不变',
        children: (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <pre className="invoice-code-block">{jsonSnippet}</pre>
            <Button size="small" icon={<CopyOutlined />} onClick={() => copyText(jsonSnippet)}>
              复制 JS 示例
            </Button>
          </Space>
        ),
      },
    ],
    [copyText, curlSnippet, jsonSnippet]
  );

  const statusTag = serviceRunning ? (
    <Tag color="success">服务运行中</Tag>
  ) : (
    <Tag color="default">服务已关闭</Tag>
  );

  return (
    <div className="invoice-ocr-panel">
      <Card className="invoice-ocr-hero" bordered={false}>
        <div className="hero-glow" />
        <div className="hero-headline">
          <Tag color="gold">Invoice OCR</Tag>
          <Title level={2} className="hero-title">
            发票识别工作台
          </Title>
          <Text className="hero-copy">
            发票 OCR 独立运行于本地子服务。未启动时保持低功耗，启动后即可识别 PDF 与图片，并继续保留原有公开接口契约。
          </Text>

          <div className="hero-toolbar">
            <div className="hero-status-group">
              {statusTag}
              <span className="hero-status-note">
                {serviceRunning ? '工作台已解锁，可直接上传识别' : '先启动服务，再开始识别'}
              </span>
            </div>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={serviceAction === 'start'}
                disabled={serviceRunning}
                onClick={handleStartService}
              >
                启动服务
              </Button>
              <Button
                danger
                icon={<PoweroffOutlined />}
                loading={serviceAction === 'stop'}
                disabled={!serviceRunning}
                onClick={handleStopService}
              >
                关闭服务
              </Button>
              <Button
                icon={<ReloadOutlined />}
                loading={serviceLoading}
                onClick={() => refreshServiceStatus(true)}
              >
                刷新状态
              </Button>
            </Space>
          </div>

          <div className="hero-facts">
            <div className="hero-fact">
              <span className="hero-fact-label">识别地址</span>
              <strong className="hero-fact-value">{currentEndpoint}</strong>
            </div>
            <div className="hero-fact">
              <span className="hero-fact-label">支持格式</span>
              <strong className="hero-fact-value">PDF + 图片</strong>
            </div>
            <div className="hero-fact">
              <span className="hero-fact-label">运行模式</span>
              <strong className="hero-fact-value">{serviceModeLabel}</strong>
            </div>
            <div className="hero-fact">
              <span className="hero-fact-label">识别引擎</span>
              <strong className="hero-fact-value">{serviceEngineLabel}</strong>
            </div>
          </div>
        </div>
      </Card>

      <Row gutter={[18, 18]} align="top" className="invoice-ocr-layout invoice-ocr-primary-grid">
        <Col xs={24} xl={15}>
          <Card className="invoice-ocr-card invoice-ocr-upload-card" title={<Space><CloudUploadOutlined /> 上传工作台</Space>}>
            <div className="upload-card-shell">
              <div className="panel-section-intro">
                <div>
                  <Text className="panel-kicker">单文件识别</Text>
                  <div className="panel-heading">上传后立即提取发票号码</div>
                </div>
                <Tag color={serviceRunning ? 'success' : 'default'}>{serviceStateLabel}</Tag>
              </div>

              <Upload.Dragger
                className="invoice-upload-dropzone"
                multiple={false}
                maxCount={1}
                accept=".pdf,.jpg,.jpeg,.png,.bmp,.webp"
                disabled={!serviceRunning}
                fileList={fileList}
                beforeUpload={(file) => {
                  if (!isSupportedFile(file)) {
                    setErrorText(UNSUPPORTED_FORMAT_TEXT);
                    setFileList([]);
                    message.error(UNSUPPORTED_FORMAT_TEXT);
                    return Upload.LIST_IGNORE;
                  }
                  return false;
                }}
                onChange={({ fileList: next }) => {
                  setFileList(next.slice(-1));
                  setErrorText('');
                }}
              >
                <p className="ant-upload-drag-icon">
                  <FileSearchOutlined style={{ color: '#47647a' }} />
                </p>
                <p className="upload-title">拖拽发票到这里，或点击上传</p>
                <p className="upload-hint">支持 PDF/JPG/JPEG/PNG/BMP/WEBP，非这两类格式会直接返回格式错误</p>
              </Upload.Dragger>

              <div className="upload-meta-grid">
                <div className="upload-meta-card">
                  <span className="upload-meta-label">当前文件</span>
                  <strong className="upload-meta-value">{selectedFileName}</strong>
                </div>
                <div className="upload-meta-card">
                  <span className="upload-meta-label">文件大小</span>
                  <strong className="upload-meta-value">{selectedFileSize}</strong>
                </div>
                <div className="upload-meta-card">
                  <span className="upload-meta-label">识别范围</span>
                  <strong className="upload-meta-value">{selectedFileScope}</strong>
                </div>
              </div>

              <div className="upload-action-bar">
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<FileSearchOutlined />}
                    loading={loading}
                    disabled={!serviceRunning}
                    onClick={extractInvoice}
                  >
                    识别发票号码
                  </Button>
                  <Button icon={<ExperimentOutlined />} onClick={runDemo}>
                    演示结果
                  </Button>
                  <Button onClick={resetPanel}>清空</Button>
                </Space>
                <Text className="upload-state-text">
                  {serviceRunning ? '服务在线，可立即开始识别' : '服务关闭时上传区保持待命，不占用识别资源'}
                </Text>
              </div>

              {errorText ? <Alert type="error" showIcon message={errorText} /> : null}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card className="invoice-ocr-card invoice-ocr-result-card" title={<Space><ApiOutlined /> 识别结果</Space>}>
            {result ? (
              <div className="result-card-shell">
                <div className="invoice-highlight">
                  <Text type="secondary">发票号码</Text>
                  <div className="invoice-number">{result.invoice_number || NO_INVOICE_NUMBER}</div>
                </div>

                <div className="result-meta-grid">
                  <div className="result-meta-card">
                    <span className="upload-meta-label">处理耗时</span>
                    <strong className="upload-meta-value">{result.processing_time.toFixed(2)}s</strong>
                  </div>
                  <div className="result-meta-card">
                    <span className="upload-meta-label">识别状态</span>
                    <strong className="upload-meta-value">{hasDetectedInvoiceNumber ? '已识别' : '无发票号码'}</strong>
                  </div>
                </div>

                <div className="result-card-footer">
                  <Text className="service-status-hint">来源文件：{currentFile?.name || '演示结果'}</Text>
                  <Button
                    icon={<CopyOutlined />}
                    disabled={!hasDetectedInvoiceNumber}
                    onClick={() => copyText(result.invoice_number)}
                  >
                    复制号码
                  </Button>
                </div>

                {resultTraceItems.length > 0 ? (
                  <Collapse
                    bordered={false}
                    className="invoice-api-collapse result-trace-collapse"
                    items={resultTraceItems}
                  />
                ) : null}
              </div>
            ) : (
              <div className="invoice-empty result-empty">
                <FileSearchOutlined />
                <div>{serviceRunning ? '上传文件后，这里会立即显示发票号码' : '请先启动 OCR 服务'}</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[18, 18]} align="top" className="invoice-ocr-layout invoice-ocr-secondary-grid">
        <Col xs={24} md={12} xl={7}>
          <Card className="invoice-ocr-card" title={<Space><RocketOutlined /> 服务详情</Space>}>
            <div className="service-card-shell">
              <div className="service-status-strip">
                <div>
                  <Text strong>本地 OCR 子服务</Text>
                  <div className="service-status-hint">关闭后会直接停止对应进程，不再占用 OCR 识别资源</div>
                </div>
                {statusTag}
              </div>

              <Input value={currentEndpoint} readOnly />

              <div className="service-metric-grid">
                <div className="upload-meta-card">
                  <span className="upload-meta-label">当前状态</span>
                  <strong className="upload-meta-value">{serviceRunning ? '已启动' : '未启动'}</strong>
                </div>
                <div className="upload-meta-card">
                  <span className="upload-meta-label">运行模式</span>
                  <strong className="upload-meta-value">{serviceModeLabel}</strong>
                </div>
                <div className="upload-meta-card">
                  <span className="upload-meta-label">识别引擎</span>
                  <strong className="upload-meta-value">{serviceEngineLabel}</strong>
                </div>
              </div>

              <Space wrap>
                <Button icon={<CopyOutlined />} onClick={() => copyText(currentEndpoint)}>
                  复制接口地址
                </Button>
              </Space>

              {serviceRunning ? (
                <Alert
                  type="success"
                  showIcon
                  message="OCR 服务已就绪"
                  description="空闲时不会常驻加载重模型，只有识别时才会拉起工作进程，尽量降低对电脑性能的影响。"
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  message="OCR 服务未启动"
                  description="点击上方按钮启动后，这个工作台才会真正进入可识别状态。"
                />
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={7}>
          <Card className="invoice-ocr-card" title={<Space><ReloadOutlined /> 最近识别记录</Space>}>
            {history.length === 0 ? (
              <div className="invoice-empty small">
                <div>暂无识别记录</div>
              </div>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-title">{item.fileName}</div>
                    <div className="history-number">{item.invoiceNumber}</div>
                    <div className="history-meta">
                      <span>{item.createdAt}</span>
                      <span>{item.processingTime.toFixed(2)}s</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card className="invoice-ocr-card" title={<Space><ApiOutlined /> 对外公开 API 示例</Space>}>
            <Text className="invoice-api-note">
              提取接口继续保持公开可用，现有请求方式和参数不需要修改。
            </Text>
            <Collapse
              bordered={false}
              className="invoice-api-collapse"
              defaultActiveKey={[]}
              items={apiExampleItems}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
