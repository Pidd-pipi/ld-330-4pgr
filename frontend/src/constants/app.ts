export const APP_NAME = '电子病历管理系统';

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];

export const ROLE_OPTIONS = [
  { label: '医生（王主任）', value: 'doctor' },
  { label: '护士（刘护士）', value: 'nurse' },
  { label: '管理员', value: 'admin' },
];

export const ROLE_LABELS: Record<string, string> = {
  doctor: '医生',
  nurse: '护士',
  admin: '管理员',
};

/** 修改申请状态（与后端常量保持一致） */
export const MODIFY_REQUEST_STATUS_LABELS: Record<string, { text: string; color: string }> = {
  待审批: { text: '待审批', color: 'processing' },
  已批准: { text: '已批准（待使用解锁）', color: 'warning' },
  已驳回: { text: '已驳回', color: 'error' },
  已使用: { text: '已使用（解锁已消费）', color: 'success' },
};

export const DEMO_ACCOUNTS = [
  { username: 'doctor', password: 'doctor123' },
  { username: 'nurse', password: 'nurse123' },
  { username: 'admin', password: 'admin123' },
];
