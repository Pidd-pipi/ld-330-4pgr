import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

export interface CreatePatientDto {
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies?: string;
  history?: string;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [patients, records, prescriptions, workload] = await Promise.all([
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM patients'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM medical_records'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM prescriptions'),
      this.database.query<{ department: string; count: string }>(
        'SELECT department, COUNT(*) FROM medical_records GROUP BY department ORDER BY count DESC',
      ),
    ]);
    return {
      patientCount: Number(patients.rows[0].count),
      recordCount: Number(records.rows[0].count),
      prescriptionCount: Number(prescriptions.rows[0].count),
      workload: workload.rows.map((item) => ({ department: item.department, count: Number(item.count) })),
    };
  }

  async searchPatients(keyword = '') {
    const like = `%${keyword}%`;
    const result = await this.database.query<{ id: number; status: string }>(
      `SELECT id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history, created_at AS "createdAt"
       FROM patients
       WHERE name ILIKE $1 OR id_card ILIKE $1 OR phone ILIKE $1
       ORDER BY created_at DESC`,
      [like],
    );
    return result.rows;
  }

  async createPatient(dto: CreatePatientDto, user: JwtUser) {
    const recordNo = `EMR${Date.now().toString().slice(-9)}`;
    const result = await this.database.query(
      `INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history`,
      [recordNo, dto.name, dto.gender, dto.age, dto.idCard, dto.phone, dto.allergies ?? '', dto.history ?? ''],
    );
    await this.audit.log(user.sub, '创建患者档案', recordNo);
    return result.rows[0];
  }

  async timeline(patientId: number) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const records = await this.database.query(
      `SELECT id, department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
              diagnosis, treatment, status, created_at AS "createdAt"
       FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId],
    );
    return records.rows;
  }

  async createRecord(patientId: number, user: JwtUser) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const result = await this.database.query(
      `INSERT INTO medical_records
       (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
       VALUES ($1, '心内科', $2, '门诊', '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', $3)
       RETURNING id, status`,
      [patientId, user.name, RECORD_STATUS.pendingReview],
    );
    await this.audit.log(user.sub, '创建结构化病历', `record:${result.rows[0].id}`);
    return result.rows[0];
  }

  /** 病历详情：附带处方清单、处方锁定标记和当前生效的解锁申请（按病历隔离） */
  async recordDetail(recordId: number) {
    const recordResult = await this.database.query(
      `SELECT mr.id, mr.patient_id AS "patientId", p.name AS "patientName", p.record_no AS "patientNo",
              mr.department, mr.doctor, mr.record_type AS "recordType",
              mr.chief_complaint AS "chiefComplaint", mr.diagnosis, mr.treatment,
              mr.status, mr.created_at AS "createdAt"
       FROM medical_records mr
       JOIN patients p ON p.id = mr.patient_id
       WHERE mr.id = $1`,
      [recordId],
    );
    if (!recordResult.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    const record = recordResult.rows[0] as Record<string, unknown> & {
      id: number;
      status: string;
    };
    const locked = record.status === RECORD_STATUS.archived;

    const [prescriptions, activeRequest] = await Promise.all([
      this.database.query(
        `SELECT id, record_id AS "recordId", drug_name AS "drugName", specification, dosage, frequency,
                duration, status, created_by AS "createdBy", created_at AS "createdAt"
         FROM prescriptions WHERE record_id = $1 ORDER BY id`,
        [recordId],
      ),
      this.database.query(
        `SELECT id, status, applicant, reason, approved_at AS "approvedAt", used_at AS "usedAt"
         FROM prescription_modify_requests
         WHERE record_id = $1 AND status IN ('待审批', '已批准')
         ORDER BY id DESC LIMIT 1`,
        [recordId],
      ),
    ]);

    return {
      ...record,
      locked,
      prescriptions: prescriptions.rows,
      activeRequest: activeRequest.rows[0] ?? null,
    };
  }

  /** 审签归档：归档后该病历处方立即锁定，不影响其他病历 */
  async archive(recordId: number, user: JwtUser) {
    const current = await this.database.query<{ status: string }>(
      'SELECT status FROM medical_records WHERE id = $1',
      [recordId],
    );
    if (!current.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    if (current.rows[0].status === RECORD_STATUS.archived) {
      throw new ConflictException('该病历已归档，请勿重复操作');
    }
    const result = await this.database.query(
      `UPDATE medical_records SET status = $1 WHERE id = $2
       RETURNING id, status`,
      [RECORD_STATUS.archived, recordId],
    );
    await this.audit.log(user.sub, '审签归档病历（处方锁定）', `record:${recordId}`);
    return result.rows[0];
  }
}
