export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordNotFound: '未找到病历',
  recordArchived: '已归档病历处方已锁定，请先发起修改申请并填写原因',
  onlyArchivedCanRequest: '仅已归档病历需要发起处方修改申请',
  reasonRequired: '请填写修改原因后再提交申请',
  duplicateRequest: '该病历已有待审批或已批准的修改申请，请勿重复申请',
  requestNotFound: '未找到修改申请',
  requestNotPending: '该申请已完成审批，不能重复审批',
  noActiveRequest: '该病历没有已批准且未使用的解锁申请',
  prescriptionFieldRequired: '药品名称、规格、用量、频次、疗程均为必填项',
} as const;

export const ROLES = {
  doctor: 'doctor',
  nurse: 'nurse',
  admin: 'admin',
} as const;

export const RECORD_STATUS = {
  draft: '草稿',
  pendingReview: '待审签',
  archived: '已归档',
} as const;

export const MODIFY_REQUEST_STATUS = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
  consumed: '已使用',
} as const;

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];
