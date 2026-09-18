import { apiClient } from './client';
import type {
  AuditLog,
  MedicalRecord,
  ModifyRequest,
  Patient,
  Prescription,
  PrescriptionVersion,
  RecordDetail,
  SavePrescriptionResult,
  SessionUser,
  Summary,
} from '../types/emr';

export const login = async (username: string, password: string) => {
  const { data } = await apiClient.post<{ token: string; user: SessionUser }>('/auth/login', {
    username,
    password,
  });
  return data;
};

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

export const fetchRecordDetail = async (recordId: number) => {
  const { data } = await apiClient.get<RecordDetail>(`/records/${recordId}`);
  return data;
};

export const archiveRecord = async (recordId: number) => {
  const { data } = await apiClient.post<{ id: number; status: string }>(`/records/${recordId}/archive`);
  return data;
};

export const createRecord = async (patientId: number) => {
  const { data } = await apiClient.post<{ id: number; status: string }>(`/patients/${patientId}/records`);
  return data;
};

export const fetchPrescriptions = async (recordId: number) => {
  const { data } = await apiClient.get<Prescription[]>(`/records/${recordId}/prescriptions`);
  return data;
};

export const savePrescription = async (
  recordId: number,
  payload: {
    drugName: string;
    specification: string;
    dosage: string;
    frequency: string;
    duration: string;
  },
) => {
  const { data } = await apiClient.post<SavePrescriptionResult>(`/records/${recordId}/prescriptions`, payload);
  return data;
};

export const fetchPrescriptionVersions = async (recordId: number) => {
  const { data } = await apiClient.get<PrescriptionVersion[]>(
    `/records/${recordId}/prescriptions/versions`,
  );
  return data;
};

export const createModifyRequest = async (recordId: number, reason: string) => {
  const { data } = await apiClient.post<ModifyRequest>(`/records/${recordId}/modify-requests`, { reason });
  return data;
};

export const fetchRecordModifyRequests = async (recordId: number) => {
  const { data } = await apiClient.get<ModifyRequest[]>(`/records/${recordId}/modify-requests`);
  return data;
};

export const fetchAllModifyRequests = async (status?: string) => {
  const { data } = await apiClient.get<ModifyRequest[]>('/modify-requests', {
    params: status ? { status } : {},
  });
  return data;
};

export const approveModifyRequest = async (requestId: number, note?: string) => {
  const { data } = await apiClient.post<ModifyRequest>(`/modify-requests/${requestId}/approve`, { note });
  return data;
};

export const rejectModifyRequest = async (requestId: number, note?: string) => {
  const { data } = await apiClient.post<ModifyRequest>(`/modify-requests/${requestId}/reject`, { note });
  return data;
};

export const fetchAuditLogs = async () => {
  const { data } = await apiClient.get<AuditLog[]>('/audit-logs');
  return data;
};
