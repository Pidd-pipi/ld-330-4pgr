import { apiClient } from './client';
import type {
  AuditLog,
  MedicalRecord,
  ModificationRequest,
  Patient,
  Prescription,
  PrescriptionVersion,
  RecordDetail,
  Summary,
} from '../types/emr';

export const fetchSummary = async () => {
  const { data } = await apiClient.get<Summary>('/summary');
  return data;
};

export const searchPatients = async (keyword: string) => {
  const { data } = await apiClient.get<Patient[]>('/patients', { params: { keyword } });
  return data;
};

export const fetchTimeline = async (patientId: number) => {
  const { data } = await apiClient.get<MedicalRecord[]>(`/patients/${patientId}/timeline`);
  return data;
};

// ---- 归档病历处方留痕闭环 ----

export const fetchRecordDetail = async (recordId: number) => {
  const { data } = await apiClient.get<RecordDetail>(`/records/${recordId}`);
  return data;
};

export const archiveRecord = async (recordId: number) => {
  const { data } = await apiClient.post<{ id: number; status: string; locked: boolean }>(
    `/records/${recordId}/archive`,
  );
  return data;
};

export const savePrescriptions = async (
  recordId: number,
  prescriptions: Prescription[],
) => {
  const { data } = await apiClient.post<{
    recordId: number;
    locked: boolean;
    version: number;
    modifyRequestId: number | null;
    prescriptions: Prescription[];
  }>(`/records/${recordId}/prescriptions`, { prescriptions });
  return data;
};

export const fetchPrescriptionVersions = async (recordId: number) => {
  const { data } = await apiClient.get<PrescriptionVersion[]>(
    `/records/${recordId}/prescription-versions`,
  );
  return data;
};

export const createModificationRequest = async (recordId: number, reason: string) => {
  const { data } = await apiClient.post<ModificationRequest>('/modification-requests', {
    recordId,
    reason,
  });
  return data;
};

export const fetchModificationRequests = async (status?: string) => {
  const { data } = await apiClient.get<ModificationRequest[]>('/modification-requests', {
    params: status ? { status } : {},
  });
  return data;
};

export const approveModificationRequest = async (id: number, comment?: string) => {
  const { data } = await apiClient.post<ModificationRequest>(
    `/modification-requests/${id}/approve`,
    { comment },
  );
  return data;
};

export const rejectModificationRequest = async (id: number, comment?: string) => {
  const { data } = await apiClient.post<ModificationRequest>(
    `/modification-requests/${id}/reject`,
    { comment },
  );
  return data;
};

export const fetchAuditLogs = async (limit = 100) => {
  const { data } = await apiClient.get<AuditLog[]>('/audit-logs', { params: { limit } });
  return data;
};
