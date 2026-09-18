import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, RECORD_STATUS } from '../common/constants';
import { DatabaseService, Queryable } from '../common/database.service';
import type { JwtUser } from '../common/jwt-auth.guard';

export interface CreatePatientDto {
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies?: string;
  history?: string;
}

export interface PrescriptionDto {
  drugName: string;
  specification: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface MedicalRecordRow {
  id: number;
  patient_id: number;
  status: string;
}

interface ApprovedRequestRow {
  id: number;
  reason: string;
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
    const result = await this.database.query(
      `SELECT id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history, created_at AS "createdAt"
       FROM patients
       WHERE name ILIKE $1 OR id_card ILIKE $1 OR phone ILIKE $1
       ORDER BY created_at DESC`,
      [like],
    );
    return result.rows;
  }

  async createPatient(dto: CreatePatientDto) {
    const recordNo = `EMR${Date.now().toString().slice(-9)}`;
    const result = await this.database.query(
      `INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history`,
      [recordNo, dto.name, dto.gender, dto.age, dto.idCard, dto.phone, dto.allergies ?? '', dto.history ?? ''],
    );
    await this.audit.log('doctor', '创建患者档案', recordNo);
    return result.rows[0];
  }

  async timeline(patientId: number) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const records = await this.database.query(
      `SELECT r.id, r.department, r.doctor, r.record_type AS "recordType", r.chief_complaint AS "chiefComplaint",
              r.diagnosis, r.treatment, r.status, r.created_at AS "createdAt",
              EXISTS (
                SELECT 1 FROM prescription_modify_requests m
                WHERE m.record_id = r.id AND m.status = '待审批'
              ) AS "hasPendingRequest",
              EXISTS (
                SELECT 1 FROM prescription_modify_requests m
                WHERE m.record_id = r.id AND m.status = '已批准' AND m.used_at IS NULL
              ) AS "unlockAvailable"
       FROM medical_records r WHERE r.patient_id = $1 ORDER BY r.created_at DESC`,
      [patientId],
    );
    return records.rows;
  }

  async createRecord(patientId: number, user: JwtUser) {
    const result = await this.database.query(
      `INSERT INTO medical_records
       (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
       VALUES ($1, '心内科', $2, '门诊', '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', $3)
       RETURNING id, status`,
      [patientId, user.name, RECORD_STATUS.pendingReview],
    );
    await this.audit.log(user.name, '创建结构化病历', `record:${result.rows[0].id}`);
    return result.rows[0];
  }

  /** 病历详情：附带处方锁定状态，前端据此决定入口 */
  async recordDetail(recordId: number) {
    const record = await this.database.query(
      `SELECT r.id, r.patient_id AS "patientId", p.name AS "patientName", r.department, r.doctor,
              r.record_type AS "recordType", r.chief_complaint AS "chiefComplaint",
              r.diagnosis, r.treatment, r.status, r.created_at AS "createdAt"
       FROM medical_records r
       JOIN patients p ON p.id = r.patient_id
       WHERE r.id = $1`,
      [recordId],
    );
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    const detail = record.rows[0];
    const requestState = await this.database.query(
      `SELECT
         EXISTS (SELECT 1 FROM prescription_modify_requests WHERE record_id = $1 AND status = '待审批') AS pending,
         EXISTS (SELECT 1 FROM prescription_modify_requests WHERE record_id = $1 AND status = '已批准' AND used_at IS NULL) AS available`,
      [recordId],
    );
    return {
      ...detail,
      locked: detail.status === RECORD_STATUS.archived,
      hasPendingRequest: Boolean(requestState.rows[0]?.pending),
      unlockAvailable: Boolean(requestState.rows[0]?.available),
      prescriptions: await this.listPrescriptions(recordId),
    };
  }

  async listPrescriptions(recordId: number) {
    return this.listPrescriptionsFromClient(this.database, recordId);
  }

  private async listPrescriptionsFromClient(client: Queryable, recordId: number) {
    const result = await client.query(
      `SELECT id, record_id AS "recordId", drug_name AS "drugName", specification, dosage, frequency, duration, status
       FROM prescriptions WHERE record_id = $1 ORDER BY id ASC`,
      [recordId],
    );
    return result.rows;
  }

  /** 归档病历：处方随即锁定，并生成版本基线快照留痕 */
  async archiveRecord(recordId: number, user: JwtUser) {
    return this.database.withTransaction(async (client) => {
      const record = await client.query<MedicalRecordRow>(
        'SELECT id, patient_id, status FROM medical_records WHERE id = $1 FOR UPDATE',
        [recordId],
      );
      if (!record.rowCount) {
        throw new NotFoundException(APP_MESSAGES.recordNotFound);
      }
      if (record.rows[0].status === RECORD_STATUS.archived) {
        throw new BadRequestException(APP_MESSAGES.recordNotArchived);
      }
      await client.query(
        'UPDATE medical_records SET status = $1 WHERE id = $2',
        [RECORD_STATUS.archived, recordId],
      );
      await this.createVersionSnapshot(
        client,
        recordId,
        '病历归档，处方锁定基线',
        user.name,
        null,
      );
      await this.audit.log(user.name, '病历归档并锁定处方', `record:${recordId}`, undefined, client);
      return { id: recordId, status: RECORD_STATUS.archived, locked: true };
    });
  }

  /**
   * 医生保存处方：
   * - 未归档病历：直接保存并生成版本快照；
   * - 已归档病历：必须存在“已批准且未使用”的修改申请，保存成功后该申请立即消耗（仅解锁一次），
   *   不影响任何其他病历。
   */
  async savePrescriptions(recordId: number, prescriptions: PrescriptionDto[], user: JwtUser) {
    if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
      throw new BadRequestException(APP_MESSAGES.prescriptionRequired);
    }
    const normalized = prescriptions.map((item) => ({
      drugName: item.drugName?.trim(),
      specification: item.specification?.trim(),
      dosage: item.dosage?.trim(),
      frequency: item.frequency?.trim(),
      duration: item.duration?.trim(),
    }));
    if (normalized.some((item) => !item.drugName || !item.specification || !item.dosage || !item.frequency || !item.duration)) {
      throw new BadRequestException(APP_MESSAGES.prescriptionFieldsRequired);
    }

    return this.database.withTransaction(async (client) => {
      const record = await client.query<MedicalRecordRow>(
        'SELECT id, patient_id, status FROM medical_records WHERE id = $1 FOR UPDATE',
        [recordId],
      );
      if (!record.rowCount) {
        throw new NotFoundException(APP_MESSAGES.recordNotFound);
      }

      let approvedRequest: ApprovedRequestRow | null = null;
      let changeReason = '医生保存处方，生成版本快照';
      if (record.rows[0].status === RECORD_STATUS.archived) {
        const requestResult = await client.query<ApprovedRequestRow>(
          `UPDATE prescription_modify_requests
             SET used_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT id FROM prescription_modify_requests
              WHERE record_id = $1 AND status = '已批准' AND used_at IS NULL
              ORDER BY approved_at ASC, id ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
           )
           RETURNING id, reason`,
          [recordId],
        );
        if (!requestResult.rowCount) {
          throw new BadRequestException(APP_MESSAGES.recordArchived);
        }
        approvedRequest = requestResult.rows[0];
        changeReason = approvedRequest.reason;
      }

      await client.query('DELETE FROM prescriptions WHERE record_id = $1', [recordId]);
      for (const item of normalized) {
        await client.query(
          `INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status)
           VALUES ($1, $2, $3, $4, $5, $6, '待审核')`,
          [recordId, item.drugName, item.specification, item.dosage, item.frequency, item.duration],
        );
      }

      const version = await this.createVersionSnapshot(
        client,
        recordId,
        changeReason,
        user.name,
        approvedRequest?.id ?? null,
      );

      await this.audit.log(
        user.name,
        approvedRequest ? '凭批准申请修改归档病历处方' : '保存处方',
        `record:${recordId}`,
        approvedRequest
          ? `修改申请#${approvedRequest.id}一次性解锁已消耗；原因：${approvedRequest.reason}`
          : changeReason,
        client,
      );

      return {
        recordId,
        locked: record.rows[0].status === RECORD_STATUS.archived,
        version: version.version,
        modifyRequestId: approvedRequest?.id ?? null,
        prescriptions: await this.listPrescriptionsFromClient(client, recordId),
      };
    });
  }

  async listVersions(recordId: number) {
    const record = await this.database.query('SELECT id FROM medical_records WHERE id = $1', [recordId]);
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    const result = await this.database.query(
      `SELECT v.id, v.record_id AS "recordId", v.version, v.snapshot, v.change_reason AS "changeReason",
              v.modify_request_id AS "modifyRequestId", v.operator, v.created_at AS "createdAt"
       FROM prescription_versions v
       WHERE v.record_id = $1
       ORDER BY v.version DESC, v.id DESC`,
      [recordId],
    );
    return result.rows;
  }

  /**
   * 生成处方版本快照（须在事务内、且调用方已持有病历行锁）。
   */
  private async createVersionSnapshot(
    client: Queryable,
    recordId: number,
    changeReason: string,
    operator: string,
    modifyRequestId: number | null,
  ) {
    const current = await client.query<{
      drug_name: string;
      specification: string;
      dosage: string;
      frequency: string;
      duration: string;
      status: string;
    }>(
      `SELECT drug_name, specification, dosage, frequency, duration, status
       FROM prescriptions WHERE record_id = $1 ORDER BY id ASC`,
      [recordId],
    );
    const snapshot = current.rows.map((row) => ({
      drugName: row.drug_name,
      specification: row.specification,
      dosage: row.dosage,
      frequency: row.frequency,
      duration: row.duration,
      status: row.status,
    }));
    const result = await client.query<{ version: number }>(
      `INSERT INTO prescription_versions (record_id, version, snapshot, change_reason, modify_request_id, operator)
       SELECT $1, COALESCE(MAX(version), 0) + 1, $2::jsonb, $3, $4, $5
       FROM prescription_versions WHERE record_id = $1
       RETURNING version`,
      [recordId, JSON.stringify(snapshot), changeReason, modifyRequestId, operator],
    );
    return { version: result.rows[0].version, snapshot, changeReason, operator };
  }
}
