export const DEFAULT_KINGDEE_API_METHOD = 'Save';

export const KINGDEE_API_METHOD_OPTIONS = [
  { value: 'Save', label: 'Save - 保存' },
  { value: 'Delete', label: 'Delete - 删除' },
  { value: 'View', label: 'View - 查看' },
  { value: 'Draft', label: 'Draft - 暂存' },
  { value: 'Submit', label: 'Submit - 提交' },
  { value: 'Audit', label: 'Audit - 审核' },
  { value: 'UnAudit', label: 'UnAudit - 反审核' },
  { value: 'ExcuteOperation', label: 'ExcuteOperation - 禁用/反禁用/其他操作' },
  { value: 'CancelAssign', label: 'CancelAssign - 撤销' },
  { value: 'Allocate', label: 'Allocate - 分配' },
  { value: 'CancelAllocate', label: 'CancelAllocate - 取消分配' },
];

export function normalizeKingdeeApiMethod(value?: string | null): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || DEFAULT_KINGDEE_API_METHOD;
}

export function normalizeKingdeeOpNumber(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface KingdeeRequestPayloadPreview {
  baseUrl?: string;
  formid: string;
  opNumber?: string;
  data: unknown;
}

export interface KingdeeRequestPreview {
  requestUrl: string;
  endpointMethod: string;
  apiMethod: string;
  opNumber?: string;
  payload: KingdeeRequestPayloadPreview;
}

export function buildKingdeeRequestPreview(options: {
  baseUrl?: string | null;
  formId: string;
  data: unknown;
  apiMethod?: string | null;
  opNumber?: string | null;
}): KingdeeRequestPreview {
  const apiMethod = normalizeKingdeeApiMethod(options.apiMethod);
  const opNumber = normalizeKingdeeOpNumber(options.opNumber);
  const baseUrl = typeof options.baseUrl === 'string' ? options.baseUrl.trim() : '';

  return {
    requestUrl: `/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.${apiMethod}.common.kdsvc`,
    endpointMethod: apiMethod,
    apiMethod,
    ...(opNumber ? { opNumber } : {}),
    payload: {
      ...(baseUrl ? { baseUrl } : {}),
      formid: options.formId,
      ...(opNumber ? { opNumber } : {}),
      data: options.data,
    },
  };
}

export function getKingdeeActionText(apiMethod?: string | null): string {
  const normalized = normalizeKingdeeApiMethod(apiMethod);
  switch (normalized.toLowerCase()) {
    case 'save':
      return '保存';
    case 'delect':
    case 'delete':
      return '删除';
    case 'view':
      return '查看';
    case 'draft':
      return '暂存';
    case 'submit':
      return '提交';
    case 'audit':
      return '审核';
    case 'unaudit':
      return '反审核';
    case 'excuteoperation':
      return '执行操作';
    case 'cancelassign':
      return '撤销';
    case 'allocate':
      return '分配';
    case 'cancelallocate':
      return '取消分配';
    case 'forbid':
      return '禁用';
    case 'enable':
      return '启用';
    case 'unforbid':
      return '反禁用';
    default:
      return normalized;
  }
}
