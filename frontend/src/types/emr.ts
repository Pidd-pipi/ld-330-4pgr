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
  createdAt?: string;
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
}

export interface Prescription {
  id: number;
  recordId: number;
  drugName: string;
  specification: string;
  dosage: string;
  frequency: string;
  duration: string;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface ModifyRequest {
  id: number;
  recordId: number;
  applicant: string;
  applicantName: string;
  reason: string;
  status: string;
  approver?: string | null;
  reviewNote?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  usedAt?: string | null;
  usedPrescriptionId?: number | null;
  createdAt: string;
  department?: string;
  recordDoctor?: string;
  patientName?: string;
  patientNo?: string;
}

export interface PrescriptionVersion {
  id: number;
  recordId: number;
  version: number;
  prescriptionId: number | null;
  requestId: number | null;
  snapshot: Prescription[];
  operator: string;
  changeReason: string;
  createdAt: string;
}

export interface RecordDetail extends MedicalRecord {
  patientId: number;
  patientName: string;
  patientNo: string;
  locked: boolean;
  prescriptions: Prescription[];
  activeRequest: (Pick<ModifyRequest, 'id' | 'status' | 'applicant' | 'reason' | 'approvedAt' | 'usedAt'>) | null;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
}

export interface Summary {
  patientCount: number;
  recordCount: number;
  prescriptionCount: number;
  workload: Array<{ department: string; count: number }>;
}

export interface SessionUser {
  username: string;
  role: string;
  name: string;
}

export interface SavePrescriptionResult {
  prescription: Prescription;
  version: number;
  requestId: number | null;
  unlockedOnce: boolean;
}
