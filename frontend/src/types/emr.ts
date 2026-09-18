export interface Patient {
  id: number;
  recordNo: string;
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies: string;
  history: string;
}

export interface Prescription {
  id?: number;
  recordId?: number;
  drugName: string;
  specification: string;
  dosage: string;
  frequency: string;
  duration: string;
  status?: string;
}

export interface MedicalRecord {
  id: number;
  department: string;
  doctor: string;
  recordType: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  createdAt: string;
  hasPendingRequest?: boolean;
  unlockAvailable?: boolean;
}

export interface RecordDetail extends MedicalRecord {
  patientId: number;
  patientName: string;
  locked: boolean;
  prescriptions: Prescription[];
}

export interface PrescriptionVersion {
  id: number;
  recordId: number;
  version: number;
  snapshot: Prescription[];
  changeReason: string | null;
  modifyRequestId: number | null;
  operator: string;
  createdAt: string;
}

export type ModifyRequestStatus = '待审批' | '已批准' | '已驳回';

export interface ModificationRequest {
  id: number;
  recordId: number;
  patientName: string;
  department: string;
  doctor: string;
  reason: string;
  status: ModifyRequestStatus;
  approver?: string | null;
  approveComment?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  usedAt?: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  target: string;
  detail: string | null;
  createdAt: string;
}

export interface Summary {
  patientCount: number;
  recordCount: number;
  prescriptionCount: number;
  workload: Array<{ department: string; count: number }>;
}

export interface CurrentUser {
  username: string;
  role: 'doctor' | 'nurse' | 'admin';
  name: string;
}
