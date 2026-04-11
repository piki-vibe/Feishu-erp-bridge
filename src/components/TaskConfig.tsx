import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Form,
  Input,
  Button,
  Select,
  AutoComplete,
  message,
  Collapse,
  Space,
  Table,
  InputNumber,
  Modal,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { TaskConfig, FeishuFieldMeta, FeishuFieldParam, FilterCondition, WriteBackField } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import FeishuService from '../services/feishuService';
import { getDefaultProcessType } from '../utils/fieldTypeUtils';
import { buildFeishuFieldPreview } from '../utils/feishuValueUtils';
import {
  KINGDEE_API_METHOD_OPTIONS,
  normalizeKingdeeApiMethod,
  normalizeKingdeeOpNumber,
} from '../utils/kingdeeApi';

const { TextArea, Password } = Input;

interface TaskConfigProps {
  task: TaskConfig;
  onSave: (task: TaskConfig) => void;
  onTest?: (type: 'feishu' | 'kingdee' | 'kingdee-validate') => void;
  onCancel?: () => void;
}

const cloneFieldParams = (params: FeishuFieldParam[] = []): FeishuFieldParam[] =>
  params.map((param) => ({ ...param }));

const cloneFilterConditions = (conditions: FilterCondition[] = []): FilterCondition[] =>
  conditions.map((condition) => ({ ...condition }));

const cloneWriteBackFields = (fields: WriteBackField[] = []): WriteBackField[] =>
  fields.map((field) => ({ ...field }));

const cloneFeishuConfig = (config: TaskConfig['feishuConfig']): TaskConfig['feishuConfig'] => ({
  ...config,
  fieldParams: cloneFieldParams(config.fieldParams || []),
  filterConditions: cloneFilterConditions(config.filterConditions || []),
  writeBackFields: cloneWriteBackFields(config.writeBackFields || []),
});

const cloneKingdeeConfig = (config: TaskConfig['kingdeeConfig']): TaskConfig['kingdeeConfig'] => ({
  ...config,
  apiMethod: normalizeKingdeeApiMethod(config.apiMethod),
  opNumber: normalizeKingdeeOpNumber(config.opNumber),
  loginParams: { ...config.loginParams },
});

const TaskConfigComponent: React.FC<TaskConfigProps> = ({ task, onSave }) => {
  const { isMobile } = useResponsive();
  const [activeKey, setActiveKey] = useState<string[]>(['1']); // 手风琴展开状态
  const [kingdeeActiveKey, setKingdeeActiveKey] = useState<string[]>(['k1', 'k2']);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [feishuConfig, setFeishuConfig] = useState(() => cloneFeishuConfig(task.feishuConfig));
  const [kingdeeConfig, setKingdeeConfig] = useState(() => cloneKingdeeConfig(task.kingdeeConfig));
  const [fieldParams, setFieldParams] = useState<FeishuFieldParam[]>(() => cloneFieldParams(task.feishuConfig.fieldParams || []));
  const [filterConditions, setFilterConditions] = useState(() => cloneFilterConditions(task.feishuConfig.filterConditions || []));
  const [writeBackFields, setWriteBackFields] = useState<WriteBackField[]>(() => cloneWriteBackFields(task.feishuConfig.writeBackFields || []));

  // 字段列表状态
  const [fieldList, setFieldList] = useState<FeishuFieldMeta[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const nextFeishuConfig = cloneFeishuConfig(task.feishuConfig);
    setFeishuConfig(nextFeishuConfig);
    setKingdeeConfig(cloneKingdeeConfig(task.kingdeeConfig));
    setFieldParams(cloneFieldParams(nextFeishuConfig.fieldParams || []));
    setFilterConditions(cloneFilterConditions(nextFeishuConfig.filterConditions || []));
    setWriteBackFields(cloneWriteBackFields(nextFeishuConfig.writeBackFields || []));
    setFieldList([]);
    setPreviewLoadingId(null);
    setKingdeeActiveKey(['k1', 'k2']);
    setTemplateEditorOpen(false);
  }, [task.id, task.updatedAt]);

  // 处理函数 - 在 fieldParamColumns 之前定义
  const handleFieldParamChange = useCallback((id: string, key: keyof FeishuFieldParam, value: any) => {
    setFieldParams(prev => prev.map(param =>
      param.id === id ? { ...param, [key]: value } : param
    ));
  }, []);

  const handleDeleteFieldParam = useCallback((id: string) => {
    setFieldParams(prev => prev.filter(param => param.id !== id));
  }, []);

  const handleSelectFieldForParam = useCallback((paramId: string, fieldName: string) => {
    handleFieldParamChange(paramId, 'fieldName', fieldName);
    const field = fieldList.find((item) => item.fieldName === fieldName);
    if (!field) {
      return;
    }
    handleFieldParamChange(paramId, 'processType', getDefaultProcessType(field.fieldType));
    handleFieldParamChange(paramId, 'sourceFieldType', field.fieldType);
    handleFieldParamChange(paramId, 'sourceUiType', field.uiType);
    handleFieldParamChange(paramId, 'sourceFieldId', field.fieldId);
  }, [fieldList, handleFieldParamChange]);

  const previewValueToText = useCallback((value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (value === '') return '(empty string)';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, []);

  const handlePreviewFieldValue = useCallback(async (param: FeishuFieldParam) => {
    if (!param.fieldName) {
      message.warning('请先选择字段');
      return;
    }
    if (!feishuConfig.appId || !feishuConfig.appSecret || !feishuConfig.appToken || !feishuConfig.tableId) {
      message.error('请先完善飞书配置');
      setActiveKey(['1']);
      return;
    }

    const fieldMeta = fieldList.find((item) => item.fieldName === param.fieldName);
    setPreviewLoadingId(param.id);
    try {
      const service = new FeishuService(feishuConfig);
      const response = await service.getTableData(
        feishuConfig.tableId,
        feishuConfig.viewId,
        undefined,
        [param.fieldName]
      );
      const firstRecord = response.data?.items?.[0];
      const rawValue = firstRecord?.fields?.[param.fieldName];
      const preview = buildFeishuFieldPreview(rawValue, {
        processType: param.processType,
        sourceFieldType: param.sourceFieldType ?? fieldMeta?.fieldType,
        sourceUiType: param.sourceUiType ?? fieldMeta?.uiType,
        decimalPlaces: param.decimalPlaces,
        dateFormat: param.dateFormat,
        preserveNumberScale: true,
      });
      const recordId = firstRecord?.record_id || '无匹配记录';

      Modal.info({
        width: 760,
        title: '字段值预览',
        content: (
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            <p><strong>字段:</strong> {param.fieldName}{fieldMeta ? ` (${fieldMeta.fieldType})` : ''}</p>
            <p>
              <strong>处理方式:</strong> {param.processType || 'auto'}
              {preview.effectiveProcessType !== (param.processType || 'auto')
                ? ` -> ${preview.effectiveProcessType}`
                : ''}
            </p>
            <p><strong>记录 ID:</strong> {recordId}</p>
            <p style={{ marginBottom: 6 }}><strong>ԭʼֵ:</strong></p>
            <pre style={{ background: '#f7f7f7', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {previewValueToText(rawValue)}
            </pre>
            <p style={{ marginBottom: 6 }}><strong>提取值:</strong></p>
            <pre style={{ background: '#f7f7f7', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {previewValueToText(preview.extractedValue)}
            </pre>
            <p style={{ marginBottom: 6 }}><strong>最终值:</strong></p>
            <pre style={{ background: '#f7f7f7', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {previewValueToText(preview.formattedValue)}
            </pre>
          </div>
        ),
      });
    } catch (error: any) {
      message.error(`查看失败：${error.message}`);
    } finally {
      setPreviewLoadingId(null);
    }
  }, [feishuConfig, fieldList, filterConditions, previewValueToText]);

  const kingdeeTemplateSyntaxHint = useMemo(() => {
    const template = kingdeeConfig.dataTemplate || '';
    if (!template.trim()) {
      return {
        type: 'warning' as const,
        message: 'JSON 模板为空，保存前请确认。仅提示，不影响保存。',
      };
    }

    const sanitizedTemplate = template.replace(/\{\{\s*[^{}]+\s*\}\}/g, '0');
    try {
      JSON.parse(sanitizedTemplate);
      return {
        type: 'success' as const,
        message: 'JSON 语法检查通过（仅提示，不影响保存）。',
      };
    } catch {
      return {
        type: 'warning' as const,
        message: 'JSON 语法可能有问题，请检查逗号、引号与括号（仅提示，不影响保存）。',
      };
    }
  }, [kingdeeConfig.dataTemplate]);

  // 字段参数表格列
  const fieldParamColumns = useMemo(() => [
    {
      title: '变量名',
      dataIndex: 'variableName',
      key: 'variableName',
      width: 120,
      render: (_: string, record: FeishuFieldParam) => (
        <Input
          value={record.variableName}
          onChange={(e) => handleFieldParamChange(record.id, 'variableName', e.target.value)}
          placeholder="如：A"
        />
      ),
    },
    {
      title: '字段名',
      dataIndex: 'fieldName',
      key: 'fieldName',
      width: 180,
      render: (_: string, record: FeishuFieldParam) => (
        <Select
          value={record.fieldName}
          onChange={(value) => handleSelectFieldForParam(record.id, value)}
          style={{ width: '100%' }}
          showSearch
          options={fieldList.map((field) => ({
            label: `${field.fieldName} (${field.fieldType})`,
            value: field.fieldName,
          }))}
        />
      ),
    },
    {
      title: '处理类型',
      dataIndex: 'processType',
      key: 'processType',
      width: 120,
      render: (_: string, record: FeishuFieldParam) => (
        <Select
          value={record.processType || 'auto'}
          onChange={(value) => handleFieldParamChange(record.id, 'processType', value)}
          style={{ width: '100%' }}
          options={[
            { value: 'auto', label: '自动' },
            { value: 'text', label: '文本' },
            { value: 'number', label: '数字' },
            { value: 'date', label: '日期' },
            { value: 'datetime', label: '日期时间' },
            { value: 'timestamp', label: '时间戳' },
            { value: 'multiselect', label: '多选' },
            { value: 'person', label: '人员' },
          ]}
        />
      ),
    },
    {
      title: '格式',
      key: 'format',
      width: 120,
      render: (_: any, record: FeishuFieldParam) => {
        const processType = record.processType || 'auto';

        // 根据处理类型显示不同的配置
        if (processType === 'number') {
          return (
            <InputNumber
              min={0}
              max={10}
              value={record.decimalPlaces ?? 2}
              onChange={(value) => handleFieldParamChange(record.id, 'decimalPlaces', value)}
              style={{ width: '100%' }}
              placeholder="小数位"
            />
          );
        } else if (processType === 'date' || processType === 'datetime') {
          return (
            <Select
              value={record.dateFormat || 'YYYY-MM-DD'}
              onChange={(value) => handleFieldParamChange(record.id, 'dateFormat', value)}
              style={{ width: '100%' }}
              options={[
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
                { value: 'YYYYMMDD', label: 'YYYYMMDD' },
                { value: 'timestamp', label: '时间戳' },
              ]}
            />
          );
        }
        return <span style={{ color: '#999', fontSize: 12 }}>无需配置</span>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: any, record: FeishuFieldParam) => (
        <Space>
          <Button
            size="small"
            loading={previewLoadingId === record.id}
            onClick={() => handlePreviewFieldValue(record)}
          >
            查看
          </Button>
          <Button
            icon={<DeleteOutlined />}
            danger
            size="small"
            onClick={() => handleDeleteFieldParam(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ], [
    fieldList,
    handleDeleteFieldParam,
    handleFieldParamChange,
    handlePreviewFieldValue,
    handleSelectFieldForParam,
    previewLoadingId,
  ]);

  // 获取字段列表
  const handleRefreshFields = async () => {
    if (!feishuConfig.appToken || !feishuConfig.tableId) {
      message.error('请先填写飞书 App Token 和表格 ID');
      setActiveKey(['1']); // 展开基础参数面板
      return;
    }

    setLoadingFields(true);
    try {
      const feishuService = new FeishuService(feishuConfig);
      const fields = await feishuService.getFields(feishuConfig.tableId);
      const normalizedFields: FeishuFieldMeta[] = fields
        .map((field: any) => {
          const parsedFieldType = typeof field.fieldType === 'number'
            ? field.fieldType
            : Number.parseInt(String(field.fieldType), 10);
          return {
            fieldId: field.fieldId || field.field_id || field.id || field.fieldName || '',
            fieldName: field.fieldName || field.field_name || '',
            fieldType: Number.isFinite(parsedFieldType) ? parsedFieldType : 1,
            uiType: field.uiType || field.ui_type,
            isPrimary: field.isPrimary ?? field.is_primary,
            property: field.property,
          };
        })
        .filter((field: FeishuFieldMeta) => !!field.fieldName);

      setFieldList(normalizedFields);
      setFieldParams((prev) => prev.map((param) => {
        const matchedField = normalizedFields.find((item) => item.fieldName === param.fieldName);
        if (!matchedField) {
          return param;
        }
        return {
          ...param,
          sourceFieldType: param.sourceFieldType ?? matchedField.fieldType,
          sourceUiType: param.sourceUiType ?? matchedField.uiType,
          sourceFieldId: param.sourceFieldId ?? matchedField.fieldId,
        };
      }));
      message.success(`成功获取 ${normalizedFields.length} 个字段`);
    } catch (error: any) {
      message.error(`获取字段列表失败：${error.message}`);
    } finally {
      setLoadingFields(false);
    }
  };

  const handleAddFieldParam = useCallback(() => {
    setFieldParams(prev => [...prev, {
      id: Date.now().toString(),
      variableName: '',
      fieldName: '',
      processType: 'auto',
      decimalPlaces: 2,
      dateFormat: 'YYYY-MM-DD',
    }]);
  }, []);

  // 处理筛选条件变更
  const handleFilterConditionChange = useCallback((id: string, key: keyof FilterCondition, value: any) => {
    setFilterConditions(prev => prev.map(condition =>
      condition.id === id ? { ...condition, [key]: value } : condition
    ));
  }, []);

  // 添加筛选条件
  const handleAddFilterCondition = useCallback(() => {
    setFilterConditions(prev => [...prev, {
      id: Date.now().toString(),
      fieldName: '',
      operator: 'eq',
      value: '',
    }]);
  }, []);

  // 删除筛选条件
  const handleDeleteFilterCondition = useCallback((id: string) => {
    setFilterConditions(prev => prev.filter(condition => condition.id !== id));
  }, []);

  // 处理回写字段变更
  const handleWriteBackFieldChange = useCallback((id: string, key: keyof WriteBackField, value: any) => {
    setWriteBackFields(prev => prev.map(field =>
      field.id === id ? { ...field, [key]: value } : field
    ));
  }, []);

  // 添加回写字段
  const handleAddWriteBackField = useCallback(() => {
    setWriteBackFields(prev => [...prev, {
      id: Date.now().toString(),
      fieldName: '',
      source: 'success',
    }]);
  }, []);

  // 删除回写字段
  const handleDeleteWriteBackField = useCallback((id: string) => {
    setWriteBackFields(prev => prev.filter(field => field.id !== id));
  }, []);

  const handleSave = () => {
    const nextFeishuConfig = cloneFeishuConfig({
      ...feishuConfig,
      fieldParams: cloneFieldParams(fieldParams),
      filterConditions: cloneFilterConditions(filterConditions),
      writeBackFields: cloneWriteBackFields(writeBackFields),
    });

    const updatedTask: TaskConfig = {
      ...task,
      feishuConfig: nextFeishuConfig,
      kingdeeConfig: cloneKingdeeConfig(kingdeeConfig),
    };

    onSave(updatedTask);
  };

  // 移动端字段参数卡片
  const renderMobileFieldParamCard = (param: FeishuFieldParam) => {
    const processType = param.processType || 'auto';
    return (
      <div
        key={param.id}
        style={{
          marginBottom: '12px',
          padding: '12px',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 600, color: '#2C3E50', marginBottom: '8px' }}>
          字段参数
        </div>
        <Form layout="vertical" size="large">
        <Form.Item label="变量名" style={{ marginBottom: '12px' }}>
          <Input
            value={param.variableName}
            onChange={(e) => handleFieldParamChange(param.id, 'variableName', e.target.value)}
            placeholder="如：A"
            style={{ height: '44px', fontSize: '16px' }}
          />
        </Form.Item>
        <Form.Item label="字段名" style={{ marginBottom: '12px' }}>
          <Select
            value={param.fieldName}
            onChange={(value) => handleSelectFieldForParam(param.id, value)}
            style={{ width: '100%', height: '44px', fontSize: '16px' }}
            showSearch
            options={fieldList.map((field) => ({
              label: `${field.fieldName} (${field.fieldType})`,
              value: field.fieldName,
            }))}
          />
        </Form.Item>
        <Form.Item label="处理类型" style={{ marginBottom: '12px' }}>
          <Select
            value={processType}
            onChange={(value) => handleFieldParamChange(param.id, 'processType', value)}
            style={{ width: '100%', height: '44px', fontSize: '16px' }}
            options={[
              { value: 'auto', label: '自动' },
              { value: 'text', label: '文本' },
              { value: 'number', label: '数字' },
              { value: 'date', label: '日期' },
              { value: 'datetime', label: '日期时间' },
              { value: 'timestamp', label: '时间戳' },
              { value: 'multiselect', label: '多选' },
              { value: 'person', label: '人员' },
            ]}
          />
        </Form.Item>
        {processType === 'number' && (
          <Form.Item label="小数位数" style={{ marginBottom: '12px' }}>
            <InputNumber
              min={0}
              max={10}
              value={param.decimalPlaces ?? 2}
              onChange={(value) => {
                handleFieldParamChange(param.id, 'decimalPlaces', value);
              }}
              style={{ width: '100%', height: '44px', fontSize: '16px' }}
            />
          </Form.Item>
        )}
        {processType === 'auto' && (
          <div style={{ marginBottom: '12px', color: '#999', fontSize: '13px' }}>
            自动模式无需配置格式
          </div>
        )}
        {(processType === 'date' || processType === 'datetime') && (
          <Form.Item label="日期格式" style={{ marginBottom: 0 }}>
            <Select
              value={param.dateFormat || 'YYYY-MM-DD'}
              onChange={(value) => handleFieldParamChange(param.id, 'dateFormat', value)}
              style={{ width: '100%', height: '44px', fontSize: '16px' }}
              options={[
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
                { value: 'YYYYMMDD', label: 'YYYYMMDD' },
                { value: 'timestamp', label: '时间戳' },
              ]}
            />
          </Form.Item>
        )}
      </Form>
      <Button
        size="large"
        loading={previewLoadingId === param.id}
        onClick={() => handlePreviewFieldValue(param)}
        block
        style={{ marginTop: '12px', height: '44px', borderRadius: '8px' }}
      >
        查看第一条记录值
      </Button>
      <Button
        icon={<DeleteOutlined />}
        danger
        size="large"
        onClick={() => handleDeleteFieldParam(param.id)}
        block
        style={{ marginTop: '10px', height: '44px', borderRadius: '8px' }}
      >
        删除此参数
      </Button>
      </div>
    );
  };

  // 移动端筛选条件卡片
  const renderMobileFilterCard = (condition: FilterCondition) => {
    const isDisabled = condition.operator === 'isEmpty' || condition.operator === 'isNotEmpty';
    return (
      <div
        key={condition.id}
        style={{
          marginBottom: '12px',
          padding: '12px',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 600, color: '#2C3E50', marginBottom: '8px' }}>
          筛选条件
        </div>
        <Form layout="vertical" size="large">
          <Form.Item label="字段名" style={{ marginBottom: '12px' }}>
            <Select
              value={condition.fieldName}
              onChange={(value) => handleFilterConditionChange(condition.id, 'fieldName', value)}
              style={{ width: '100%', height: '44px', fontSize: '16px' }}
              showSearch
              options={fieldList.map((field) => ({
                label: field.fieldName,
                value: field.fieldName,
              }))}
            />
          </Form.Item>
          <Form.Item label="操作符" style={{ marginBottom: '12px' }}>
            <Select
              value={condition.operator}
              onChange={(value) => handleFilterConditionChange(condition.id, 'operator', value)}
              style={{ width: '100%', height: '44px', fontSize: '16px' }}
              options={[
                { value: 'eq', label: '等于' },
                { value: 'ne', label: '不等于' },
                { value: 'contains', label: '包含' },
                { value: 'notContains', label: '不包含' },
                { value: 'isEmpty', label: '为空' },
                { value: 'isNotEmpty', label: '不为空' },
              ]}
            />
          </Form.Item>
          <Form.Item label="ֵ" style={{ marginBottom: 0 }}>
            <Input
              value={condition.value || ''}
              onChange={(e) => handleFilterConditionChange(condition.id, 'value', e.target.value)}
              disabled={isDisabled}
              placeholder={isDisabled ? '此操作符不需要值' : '筛选值'}
              style={{ height: '44px', fontSize: '16px' }}
            />
          </Form.Item>
        </Form>
        <Button
          icon={<DeleteOutlined />}
          danger
          size="large"
          onClick={() => handleDeleteFilterCondition(condition.id)}
          block
          style={{ marginTop: '12px', height: '44px', borderRadius: '8px' }}
        >
          删除此条件
        </Button>
      </div>
    );
  };

  // 移动端回写字段卡片
  const renderMobileWriteBackCard = (field: WriteBackField) => (
    <div
      key={field.id}
      style={{
        marginBottom: '12px',
        padding: '12px',
        border: '1px solid #d9d9d9',
        borderRadius: '8px',
        background: '#fafafa',
      }}
    >
      <div style={{ fontWeight: 600, color: '#2C3E50', marginBottom: '8px' }}>
        回写字段
      </div>
      <Form layout="vertical" size="large">
        <Form.Item label="飞书字段名" style={{ marginBottom: '12px' }}>
          <Select
            value={field.fieldName}
            onChange={(value) => handleWriteBackFieldChange(field.id, 'fieldName', value)}
            style={{ width: '100%', height: '44px', fontSize: '16px' }}
            showSearch
            options={fieldList.map((f) => ({
              label: f.fieldName,
              value: f.fieldName,
            }))}
          />
        </Form.Item>
        <Form.Item label="数据来源" style={{ marginBottom: '12px' }}>
          <Select
            value={field.source}
            onChange={(value) => handleWriteBackFieldChange(field.id, 'source', value)}
            style={{ width: '100%', height: '44px', fontSize: '16px' }}
            options={[
              { value: 'status', label: '响应状态' },
              { value: 'success', label: '成功消息' },
              { value: 'error', label: '错误消息' },
              { value: 'response', label: '完整响应' },
            ]}
          />
        </Form.Item>
        <Form.Item label="JSON 路径（可选）" style={{ marginBottom: 0 }}>
          <Input
            value={field.jsonPath || ''}
            onChange={(e) => handleWriteBackFieldChange(field.id, 'jsonPath', e.target.value)}
            placeholder="如：Result.ResponseStatus.Errors[0].Message"
            style={{ height: '44px', fontSize: '16px' }}
          />
        </Form.Item>
      </Form>
      <Button
        icon={<DeleteOutlined />}
        danger
        size="large"
        onClick={() => handleDeleteWriteBackField(field.id)}
        block
        style={{ marginTop: '12px', height: '44px', borderRadius: '8px' }}
      >
        删除此字段
      </Button>
    </div>
  );

  // 手风琴面板内容
  const renderCollapsePanel = () => (
    <>
      {/* 面板 1: 飞书基础参数 */}
      <Collapse.Panel header="飞书基础参数" key="1">
        <Form layout="vertical" size="large">
          <Form.Item label="App ID" required>
            <Input
              value={feishuConfig.appId || ''}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, appId: e.target.value })}
              placeholder="请输入 App ID"
              size="large"
            />
          </Form.Item>
          <Form.Item label="App Secret" required>
            <Input
              value={feishuConfig.appSecret || ''}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, appSecret: e.target.value })}
              placeholder="请输入 App Secret"
              size="large"
            />
          </Form.Item>
          <Form.Item label="App Token" required>
            <Input
              value={feishuConfig.appToken}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, appToken: e.target.value })}
              placeholder="请输入 App Token"
              size="large"
            />
          </Form.Item>
          <Form.Item label="表格 ID" required>
            <Input
              value={feishuConfig.tableId}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, tableId: e.target.value })}
              size="large"
            />
          </Form.Item>
          <Form.Item label="视图 ID (可选)">
            <Input
              value={feishuConfig.viewId}
              onChange={(e) => setFeishuConfig({ ...feishuConfig, viewId: e.target.value })}
              size="large"
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              icon={<SyncOutlined spin={loadingFields} />}
              onClick={handleRefreshFields}
              loading={loadingFields}
              block
              size="large"
            >
              {loadingFields ? '获取中...' : '更新字段列表'}
            </Button>
          </Form.Item>
        </Form>
      </Collapse.Panel>

      {/* 面板 2: 查询参数字段 */}
      <Collapse.Panel header="查询参数字段" key="2">
        {fieldList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            <p>请先在上方「飞书基础参数」面板中点击「更新字段列表」按钮</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddFieldParam}>
                  添加字段参数
                </Button>
                <Button icon={<SyncOutlined />} onClick={handleRefreshFields} loading={loadingFields}>
                  刷新字段
                </Button>
              </Space>
            </div>
            {isMobile ? (
              <div>
                {fieldParams.map((param) => renderMobileFieldParamCard(param))}
              </div>
            ) : (
              <Table
                columns={fieldParamColumns}
                dataSource={fieldParams.map((param) => ({ ...param, key: param.id }))}
                pagination={false}
                scroll={{ x: 600 }}
              />
            )}
          </>
        )}
      </Collapse.Panel>

      {/* 面板 3: 筛选字段 */}
      <Collapse.Panel header="筛选字段" key="3">
        {fieldList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            <p>请先在上方「飞书基础参数」面板中点击「更新字段列表」按钮</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddFilterCondition}>
                  添加筛选条件
                </Button>
                <Button icon={<SyncOutlined />} onClick={handleRefreshFields} loading={loadingFields}>
                  刷新字段
                </Button>
              </Space>
            </div>
            {isMobile ? (
              <div>
                {filterConditions.map((condition) => renderMobileFilterCard(condition))}
              </div>
            ) : (
              <Table
                columns={[
                  {
                    title: '字段名',
                    dataIndex: 'fieldName',
                    key: 'fieldName',
                    render: (_: string, record: FilterCondition) => (
                      <Select
                        value={record.fieldName}
                        onChange={(value) => handleFilterConditionChange(record.id, 'fieldName', value)}
                        style={{ width: '100%' }}
                        showSearch
                        options={fieldList.map((field) => ({
                          label: field.fieldName,
                          value: field.fieldName,
                        }))}
                      />
                    ),
                  },
                  {
                    title: '操作符',
                    dataIndex: 'operator',
                    key: 'operator',
                    render: (_: string, record: FilterCondition) => (
                      <Select
                        value={record.operator}
                        onChange={(value) => handleFilterConditionChange(record.id, 'operator', value)}
                        style={{ width: 120 }}
                        options={[
                          { value: 'eq', label: '等于' },
                          { value: 'ne', label: '不等于' },
                          { value: 'contains', label: '包含' },
                          { value: 'notContains', label: '不包含' },
                          { value: 'isEmpty', label: '为空' },
                          { value: 'isNotEmpty', label: '不为空' },
                        ]}
                      />
                    ),
                  },
                  {
                    title: 'ֵ',
                    dataIndex: 'value',
                    key: 'value',
                    render: (_: string, record: FilterCondition) => {
                      // 当操作符为 isEmpty 或 isNotEmpty 时，禁用值输入框
                      const isDisabled = record.operator === 'isEmpty' || record.operator === 'isNotEmpty';
                      return (
                        <Input
                          value={record.value || ''}
                          onChange={(e) => handleFilterConditionChange(record.id, 'value', e.target.value)}
                          disabled={isDisabled}
                          placeholder={isDisabled ? '此操作符不需要值' : '筛选值'}
                        />
                      );
                    },
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: (_: any, record: FilterCondition) => (
                      <Button
                        icon={<DeleteOutlined />}
                        danger
                        size="small"
                        onClick={() => handleDeleteFilterCondition(record.id)}
                      >
                        删除
                      </Button>
                    ),
                  },
                ]}
                dataSource={filterConditions.map((condition) => ({ ...condition, key: condition.id }))}
                pagination={false}
                scroll={{ x: 600 }}
              />
            )}
          </>
        )}
      </Collapse.Panel>

      {/* 面板 4: 回传字段 */}
      <Collapse.Panel header="回传字段" key="4">
        {fieldList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
            <p>请先在上方「飞书基础参数」面板中点击「更新字段列表」按钮</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddWriteBackField}>
                  添加回写字段
                </Button>
                <Button icon={<SyncOutlined />} onClick={handleRefreshFields} loading={loadingFields}>
                  刷新字段
                </Button>
              </Space>
            </div>
            {isMobile ? (
              <div>
                {writeBackFields.map((field) => renderMobileWriteBackCard(field))}
              </div>
            ) : (
              <Table
                columns={[
                  {
                    title: '飞书字段名',
                    dataIndex: 'fieldName',
                    key: 'fieldName',
                    render: (_: string, record: WriteBackField) => (
                      <Select
                        value={record.fieldName}
                        onChange={(value) => handleWriteBackFieldChange(record.id, 'fieldName', value)}
                        style={{ width: '100%' }}
                        showSearch
                        options={fieldList.map((f) => ({
                          label: f.fieldName,
                          value: f.fieldName,
                        }))}
                      />
                    ),
                  },
                  {
                    title: '数据来源',
                    dataIndex: 'source',
                    key: 'source',
                    render: (_: string, record: WriteBackField) => (
                      <Select
                        value={record.source}
                        onChange={(value) => handleWriteBackFieldChange(record.id, 'source', value)}
                        style={{ width: 120 }}
                        options={[
                          { value: 'status', label: '响应状态' },
                          { value: 'success', label: '成功消息' },
                          { value: 'error', label: '错误消息' },
                          { value: 'response', label: '完整响应' },
                        ]}
                      />
                    ),
                  },
                  {
                    title: 'JSON 路径（可选）',
                    dataIndex: 'jsonPath',
                    key: 'jsonPath',
                    render: (_: string, record: WriteBackField) => (
                      <Input
                        value={record.jsonPath || ''}
                        onChange={(e) => handleWriteBackFieldChange(record.id, 'jsonPath', e.target.value)}
                        placeholder="如：Result.ResponseStatus.Errors[0].Message"
                      />
                    ),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    render: (_: any, record: WriteBackField) => (
                      <Button
                        icon={<DeleteOutlined />}
                        danger
                        size="small"
                        onClick={() => handleDeleteWriteBackField(record.id)}
                      >
                        删除
                      </Button>
                    ),
                  },
                ]}
                dataSource={writeBackFields.map((field, index) => ({ ...field, key: index }))}
                pagination={false}
                scroll={{ x: 600 }}
              />
            )}
          </>
        )}
      </Collapse.Panel>
    </>
  );

  // 金蝶参数面板内容
  const renderKingdeePanel = () => (
    <Form layout="vertical" size="large">
      <Collapse
        activeKey={kingdeeActiveKey}
        onChange={(key) => {
          if (Array.isArray(key)) {
            setKingdeeActiveKey(key.map((item) => String(item)));
            return;
          }
          setKingdeeActiveKey(key ? [String(key)] : []);
        }}
        size="large"
      >
        <Collapse.Panel header="金蝶基础参数" key="k1">
          <Form.Item label="App ID">
            <Input
              value={kingdeeConfig.loginParams.appId}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  loginParams: {
                    ...kingdeeConfig.loginParams,
                    appId: e.target.value,
                  },
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item label="App Secret">
            <Password
              value={kingdeeConfig.loginParams.appSecret}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  loginParams: {
                    ...kingdeeConfig.loginParams,
                    appSecret: e.target.value,
                  },
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item label="用户名">
            <Input
              value={kingdeeConfig.loginParams.username}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  loginParams: {
                    ...kingdeeConfig.loginParams,
                    username: e.target.value,
                  },
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item label="DB ID (数据中心 ID)">
            <Input
              value={kingdeeConfig.loginParams.dbId}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  loginParams: {
                    ...kingdeeConfig.loginParams,
                    dbId: e.target.value,
                  },
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item label="密码">
            <Password
              value={kingdeeConfig.loginParams.password}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  loginParams: {
                    ...kingdeeConfig.loginParams,
                    password: e.target.value,
                  },
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item label="API 地址">
            <Input
              value={kingdeeConfig.loginParams.baseUrl}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  loginParams: {
                    ...kingdeeConfig.loginParams,
                    baseUrl: e.target.value,
                  },
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item label="表单 ID">
            <Input
              value={kingdeeConfig.formId}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  formId: e.target.value,
                })
              }
              size="large"
            />
          </Form.Item>
          <Form.Item
            label="API 方法"
            extra="这里填 client. 后面的 API 方法名。下拉里是常用方法，也可以自己输入其他方法。"
          >
            <AutoComplete
              value={kingdeeConfig.apiMethod}
              options={KINGDEE_API_METHOD_OPTIONS}
              onChange={(value) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  apiMethod: normalizeKingdeeApiMethod(value),
                })
              }
              placeholder="例如：Save / Delete / ExcuteOperation"
              filterOption={(inputValue, option) => {
                const optionValue = String(option?.value || '').toLowerCase();
                const optionLabel = typeof option?.label === 'string' ? option.label.toLowerCase() : '';
                const keyword = inputValue.toLowerCase();
                return optionValue.includes(keyword) || optionLabel.includes(keyword);
              }}
            >
              <Input size="large" />
            </AutoComplete>
          </Form.Item>
          <Form.Item
            label="opNumber（可选）"
            extra="有值就传 opNumber，留空就不传。不会再根据 API 方法自动映射。"
          >
            <Input
              value={kingdeeConfig.opNumber || ''}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  opNumber: normalizeKingdeeOpNumber(e.target.value),
                })
              }
              placeholder="例如：Forbid / Audit"
              size="large"
            />
          </Form.Item>
        </Collapse.Panel>

        <Collapse.Panel header="数据模板 (JSON)" key="k2">
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="small"
              onClick={() => {
                Modal.info({
                  title: '选择变量插入',
                  content: (
                    <div>
                      <p>点击变量插入到模板中：</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                        {fieldParams.length === 0 ? (
                          <span style={{ color: '#999' }}>暂无变量，请先在飞书参数中添加字段参数</span>
                        ) : (
                          fieldParams.map((param) => (
                            <Button
                              key={param.id}
                              size="small"
                              onClick={() => {
                                const textarea = document.querySelector('textarea[data-template="kingdee"]') as HTMLTextAreaElement | null;
                                const currentTemplate = kingdeeConfig.dataTemplate || '';
                                const cursorPos = textarea?.selectionStart ?? currentTemplate.length;
                                const textBefore = currentTemplate.substring(0, cursorPos);
                                const textAfter = currentTemplate.substring(cursorPos);
                                const variable = `{{${param.variableName}}}`;
                                const newTemplate = textBefore + variable + textAfter;
                                setKingdeeConfig({
                                  ...kingdeeConfig,
                                  dataTemplate: newTemplate,
                                });
                                Modal.destroyAll();
                                message.success(`已插入变量 {{${param.variableName}}}`);
                              }}
                            >
                              {param.variableName} ({param.fieldName})
                            </Button>
                          ))
                        )}
                      </div>
                    </div>
                  ),
                  onOk() {},
                });
              }}
            >
              导入变量
            </Button>

            <Button size="small" onClick={() => setTemplateEditorOpen(true)}>
              展开编辑
            </Button>
          </div>

          <TextArea
            data-template="kingdee"
            rows={10}
            value={kingdeeConfig.dataTemplate}
            onChange={(e) =>
              setKingdeeConfig({
                ...kingdeeConfig,
                dataTemplate: e.target.value,
              })
            }
            placeholder={`示例格式：
{
  "NeedUpDateFields": [],
  "NeedReturnFields": [],
  "IsDeleteEntry": "true",
  "ValidateFlag": "true",
  "Model": {
    "FID": 0,
    "FBillTypeID": { "FNUMBER": "FKDLX01_SYS" },
    "FDATE": "{{A}}",
    "FPAYORGID": { "FNumber": "100" },
    "FREMARK": "{{B}}"
  }
}`}
            style={{ fontSize: '14px' }}
          />

          <Alert
            showIcon
            type={kingdeeTemplateSyntaxHint.type}
            message={kingdeeTemplateSyntaxHint.message}
            style={{ marginTop: 8 }}
          />

          <Modal
            title="编辑数据模板 (JSON)"
            open={templateEditorOpen}
            onCancel={() => setTemplateEditorOpen(false)}
            onOk={() => setTemplateEditorOpen(false)}
            okText="完成"
            cancelText="取消"
            width={isMobile ? 360 : 980}
          >
            <div style={{ marginBottom: 8 }}>
              <Button
                size="small"
                onClick={() => {
                  Modal.info({
                    title: '选择变量插入',
                    content: (
                      <div>
                        <p>点击变量插入到模板中：</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                          {fieldParams.length === 0 ? (
                            <span style={{ color: '#999' }}>暂无变量，请先在飞书参数中添加字段参数</span>
                          ) : (
                            fieldParams.map((param) => (
                              <Button
                                key={param.id}
                                size="small"
                                onClick={() => {
                                  const textarea = document.querySelector('textarea[data-template="kingdee-expanded"]') as HTMLTextAreaElement | null;
                                  const currentTemplate = kingdeeConfig.dataTemplate || '';
                                  const cursorPos = textarea?.selectionStart ?? currentTemplate.length;
                                  const textBefore = currentTemplate.substring(0, cursorPos);
                                  const textAfter = currentTemplate.substring(cursorPos);
                                  const variable = `{{${param.variableName}}}`;
                                  const newTemplate = textBefore + variable + textAfter;
                                  setKingdeeConfig({
                                    ...kingdeeConfig,
                                    dataTemplate: newTemplate,
                                  });
                                  Modal.destroyAll();
                                  message.success(`已插入变量 {{${param.variableName}}}`);
                                }}
                              >
                                {param.variableName} ({param.fieldName})
                              </Button>
                            ))
                          )}
                        </div>
                      </div>
                    ),
                    onOk() {},
                  });
                }}
              >
                导入变量
              </Button>
            </div>
            <TextArea
              data-template="kingdee-expanded"
              rows={isMobile ? 18 : 26}
              value={kingdeeConfig.dataTemplate}
              onChange={(e) =>
                setKingdeeConfig({
                  ...kingdeeConfig,
                  dataTemplate: e.target.value,
                })
              }
              style={{ fontSize: 14 }}
            />
          </Modal>
        </Collapse.Panel>
      </Collapse>
      <Form.Item>
        <Button type="primary" onClick={handleSave} size="large" block>
          保存配置
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <div style={{ padding: '20px' }}>
      {/* 飞书配置 - 手风琴面板 */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          飞书参数配置
          <Button
            size="small"
            icon={<SyncOutlined spin={loadingFields} />}
            onClick={handleRefreshFields}
            loading={loadingFields}
          >
            更新字段列表
          </Button>
        </h3>
        <Collapse
          accordion
          activeKey={activeKey}
          onChange={(key) => setActiveKey(Array.isArray(key) ? key : [key])}
          size="large"
        >
          {renderCollapsePanel()}
        </Collapse>
      </div>

      {/* 金蝶配置 - 卡片形式 */}
      <div>
        <h3 style={{ marginBottom: '16px' }}>金蝶参数配置</h3>
        {renderKingdeePanel()}
      </div>

      {isMobile && (
        <style>{`
          .mobile-config-card {
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          }

          .mobile-config-card .ant-form-item-label {
            padding-bottom: 4px;
          }

          .mobile-config-card .ant-form-item-label > label {
            font-size: 14px;
            font-weight: 500;
            color: #5D6D7E;
          }

          .mobile-config-card .ant-input,
          .mobile-config-card .ant-select-selector,
          .mobile-config-card .ant-input-number-input {
            font-size: 16px;
            padding: 12px 16px;
          }

          .mobile-config-card .ant-input-number {
            display: flex;
            align-items: center;
          }

          @media (prefers-color-scheme: dark) {
            .mobile-config-card {
              background: #1a1a2e;
              border-color: #2a2a4e;
            }

            .mobile-config-card .ant-form-item-label > label {
              color: #b8b8b8;
            }

            .mobile-config-card .ant-input,
            .mobile-config-card .ant-select-selector,
            .mobile-config-card .ant-input-number {
              background: #16213e;
              border-color: #2a2a4e;
              color: #eaeaea;
            }
          }
        `}</style>
      )}
    </div>
  );
};

export default TaskConfigComponent;
