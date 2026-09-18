import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, MODIFY_REQUEST_STATUS, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

export interface CreatePrescriptionDto {
  drugName: string;
  specification: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface RecordRow {
  id: number;
  status: string;
}

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  private normalize(dto: CreatePrescriptionDto): CreatePrescriptionDto {
    return {
      drugName: dto.drugName?.trim(),
      specification: dto.specification?.trim(),
      dosage: dto.dosage?.trim(),
      frequency: dto.frequency?.trim(),
      duration: dto.duration?.trim(),
    };
  }

  listByRecord(recordId: number) {
    return this.database.query(
      `SELECT id, record_id AS "recordId", drug_name AS "drugName", specification, dosage, frequency,
              duration, status, created_by AS "createdBy", created_at AS "createdAt"
       FROM prescriptions WHERE record_id = $1 ORDER BY id`,
      [recordId],
    ).then((result) => result.rows);
  }

  /** 处方版本快照列表，按版本倒序 */
  async versions(recordId: number) {
    const record = await this.database.query('SELECT id FROM medical_records WHERE id = $1', [recordId]);
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    const result = await this.database.query(
      `SELECT id, record_id AS "recordId", version, prescription_id AS "prescriptionId",
              request_id AS "requestId", snapshot, operator, change_reason AS "changeReason",
              created_at AS "createdAt"
       FROM prescription_snapshots WHERE record_id = $1 ORDER BY version DESC`,
      [recordId],
    );
    return result.rows;
  }

  /**
   * 保存处方（归档病历处方留痕闭环核心）：
   * 1. 未归档病历：直接保存并生成版本快照；
   * 2. 已归档病历：必须存在「已批准且未使用」的修改申请，且本次保存即消费该次解锁（仅一次、仅该病历）；
   * 3. 未填原因（在申请环节）或重复申请在申请接口拦截；这里拦截无解锁的保存。
   * 全流程在一个事务内完成，避免越界解锁或漏写快照/审计。
   */
  async save(recordId: number, rawDto: CreatePrescriptionDto, user: JwtUser) {
    const dto = this.normalize(rawDto);
    if (!dto.drugName || !dto.specification || !dto.dosage || !dto.frequency || !dto.duration) {
      throw new BadRequestException(APP_MESSAGES.prescriptionFieldRequired);
    }

    return this.database.withTransaction(async (client) => {
      // 行级锁定病历，防止并发绕过归档锁定
      const recordResult = await client.query<RecordRow>(
        'SELECT id, status FROM medical_records WHERE id = $1 FOR UPDATE',
        [recordId],
      );
      if (!recordResult.rowCount) {
        throw new NotFoundException(APP_MESSAGES.recordNotFound);
      }
      const record = recordResult.rows[0];
      const archived = record.status === RECORD_STATUS.archived;

      // 仅对该病历查找待使用的解锁申请，天然不影响其他病历
      const requestResult = archived
        ? await client.query<{
            id: number;
            reason: string;
            applicant: string;
          }>(
            `SELECT id, reason, applicant FROM prescription_modify_requests
             WHERE record_id = $1 AND status = $2
             ORDER BY id DESC LIMIT 1
             FOR UPDATE`,
            [recordId, MODIFY_REQUEST_STATUS.approved],
          )
        : null;

      const request = archived ? requestResult?.rows[0] ?? null : null;
      if (archived && !request) {
        // 已归档且没有有效解锁：处方锁定，直接拒绝
        throw new BadRequestException(APP_MESSAGES.recordArchived);
      }

      // 写入新处方
      const insertResult = await client.query(
        `INSERT INTO prescriptions
           (record_id, drug_name, specification, dosage, frequency, duration, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, '待审核', $7)
         RETURNING id, record_id AS "recordId", drug_name AS "drugName", specification, dosage, frequency,
                   duration, status, created_by AS "createdBy", created_at AS "createdAt"`,
        [recordId, dto.drugName, dto.specification, dto.dosage, dto.frequency, dto.duration, user.name],
      );
      const prescription = insertResult.rows[0] as { id: number };

      // 汇总保存后的完整处方清单作为版本快照内容
      const fullResult = await client.query(
        `SELECT id, drug_name AS "drugName", specification, dosage, frequency, duration, status,
                created_by AS "createdBy", created_at AS "createdAt"
         FROM prescriptions WHERE record_id = $1 ORDER BY id`,
        [recordId],
      );
      const versionResult = await client.query<{ next: number | null }>(
        'SELECT MAX(version) + 1 AS next FROM prescription_snapshots WHERE record_id = $1',
        [recordId],
      );
      const version = versionResult.rows[0].next ?? 1;

      const changeReason = archived
        ? `归档后修改（申请#${request?.id}，申请人：${request?.applicant}，原因：${request?.reason}）`
        : '常规处方调整';

      await client.query(
        `INSERT INTO prescription_snapshots
           (record_id, version, prescription_id, request_id, snapshot, operator, change_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          recordId,
          version,
          prescription.id,
          request?.id ?? null,
          JSON.stringify(fullResult.rows),
          user.sub,
          changeReason,
        ],
      );

      // 消费一次性解锁：已批准 -> 已使用，再次保存将被锁定拦截
      if (request) {
        await client.query(
          `UPDATE prescription_modify_requests
           SET status = $1, used_at = CURRENT_TIMESTAMP, used_prescription_id = $2
           WHERE id = $3`,
          [MODIFY_REQUEST_STATUS.consumed, prescription.id, request.id],
        );
      }

      await this.audit.log(
        user.sub,
        archived ? '归档病历处方修改（一次性解锁）' : '保存处方并生成版本快照',
        `record:${recordId}, prescription:${prescription.id}, v${version}${
          request ? `, request:${request.id}` : ''
        }`,
        client,
      );

      return {
        prescription: insertResult.rows[0],
        version,
        requestId: request?.id ?? null,
        unlockedOnce: Boolean(request),
      };
    });
  }
}
