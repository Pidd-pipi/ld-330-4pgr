export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordNotFound: '未找到病历',
  recordArchived: '病历已归档，处方已锁定，需先发起修改申请并经管理员批准',
  recordNotArchived: '该病历已归档，无需重复归档',
  reasonRequired: '修改原因不能为空',
  requestNotFound: '未找到修改申请',
  requestDuplicate: '该病历已存在处理中的修改申请，请勿重复申请',
  requestNotPending: '仅待审批状态的申请可以审批',
  noApprovedRequest: '没有已批准且尚未使用的修改申请，无法保存处方',
  prescriptionRequired: '至少保留一条处方',
  prescriptionFieldsRequired: '药品名称、规格、用量、频次、疗程均为必填项',
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
};

export const MODIFY_REQUEST_STATUS = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
} as const;

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];
