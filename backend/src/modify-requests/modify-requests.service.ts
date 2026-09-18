import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, MODIFY_REQUEST_STATUS, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';
import type { JwtUser } from '../auth/jwt-auth.guard';

export interface CreateModifyRequestDto {
  reason: string;
}

@Injectable()
export class ModifyRequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /** 医生对已归档病历发起处方修改申请，必须填写原因；同病历重复申请直接拒绝 */
  async create(recordId: number, dto: CreateModifyRequestDto, user: JwtUser) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException(APP_MESSAGES.reasonRequired);
    }

    return this.database.withTransaction(async (client) => {
      const recordResult = await client.query<{ id: number; status: string }>(
        'SELECT id, status FROM medical_records WHERE id = $1 FOR UPDATE',
        [recordId],
      );
      if (!recordResult.rowCount) {
        throw new NotFoundException(APP_MESSAGES.recordNotFound);
      }
      if (recordResult.rows[0].status !== RECORD_STATUS.archived) {
        throw new BadRequestException(APP_MESSAGES.onlyArchivedCanRequest);
      }

      // 应用层先给出明确提示；数据库的部分唯一索引 uq_modify_request_active_per_record 做最终兜底
      const active = await client.query(
        `SELECT 1 FROM prescription_modify_requests
         WHERE record_id = $1 AND status IN ('待审批', '已批准')
         LIMIT 1`,
        [recordId],
      );
      if (active.rowCount) {
        throw new ConflictException(APP_MESSAGES.duplicateRequest);
      }

      try {
        const insertResult = await client.query(
          `INSERT INTO prescription_modify_requests (record_id, applicant, applicant_name, reason, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, record_id AS "recordId", applicant, applicant_name AS "applicantName",
                     reason, status, created_at AS "createdAt"`,
          [recordId, user.sub, user.name, reason, MODIFY_REQUEST_STATUS.pending],
        );
        await this.audit.log(
          user.sub,
          '发起归档病历处方修改申请',
          `record:${recordId}, request:${insertResult.rows[0].id}`,
          client,
        );
        return insertResult.rows[0];
      } catch (error) {
        // 并发重复申请命中部分唯一索引
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException(APP_MESSAGES.duplicateRequest);
        }
        throw error;
      }
    });
  }

  /** 申请列表：管理员默认看全部，可按状态过滤；带病历/患者信息 */
  async list(status?: string) {
    const result = await this.database.query(
      `SELECT q.id, q.record_id AS "recordId", q.applicant, q.applicant_name AS "applicantName",
              q.reason, q.status, q.approver, q.review_note AS "reviewNote",
              q.approved_at AS "approvedAt", q.rejected_at AS "rejectedAt",
              q.used_at AS "usedAt", q.used_prescription_id AS "usedPrescriptionId",
              q.created_at AS "createdAt",
              mr.department, mr.doctor AS "recordDoctor",
              p.name AS "patientName", p.record_no AS "patientNo"
       FROM prescription_modify_requests q
       JOIN medical_records mr ON mr.id = q.record_id
       JOIN patients p ON p.id = mr.patient_id
       ${status ? 'WHERE q.status = $1' : ''}
       ORDER BY q.id DESC`,
      status ? [status] : [],
    );
    return result.rows;
  }

  /** 某病历的申请（前端留痕工作台使用） */
  async listByRecord(recordId: number) {
    const result = await this.database.query(
      `SELECT id, record_id AS "recordId", applicant, applicant_name AS "applicantName",
              reason, status, approver, review_note AS "reviewNote",
              approved_at AS "approvedAt", rejected_at AS "rejectedAt",
              used_at AS "usedAt", used_prescription_id AS "usedPrescriptionId",
              created_at AS "createdAt"
       FROM prescription_modify_requests WHERE record_id = $1 ORDER BY id DESC`,
      [recordId],
    );
    return result.rows;
  }

  /** 管理员审批：批准即给该病历发放一次解锁名额（仍只对该病历有效） */
  async review(requestId: number, approve: boolean, note: string | undefined, user: JwtUser) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{ id: number; status: string; record_id: number }>(
        'SELECT id, status, record_id FROM prescription_modify_requests WHERE id = $1 FOR UPDATE',
        [requestId],
      );
      if (!result.rowCount) {
        throw new NotFoundException(APP_MESSAGES.requestNotFound);
      }
      if (result.rows[0].status !== MODIFY_REQUEST_STATUS.pending) {
        throw new ConflictException(APP_MESSAGES.requestNotPending);
      }

      const recordId = result.rows[0].record_id;
      if (approve) {
        // 批准后保持「已批准」：仅该病历解锁一次，保存处方时原子消费
        try {
          await client.query(
            `UPDATE prescription_modify_requests
             SET status = $1, approver = $2, review_note = $3, approved_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [MODIFY_REQUEST_STATUS.approved, user.sub, note?.trim() ?? null, requestId],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
            throw new ConflictException(APP_MESSAGES.duplicateRequest);
          }
          throw error;
        }
      } else {
        await client.query(
          `UPDATE prescription_modify_requests
           SET status = $1, approver = $2, review_note = $3, rejected_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [MODIFY_REQUEST_STATUS.rejected, user.sub, note?.trim() ?? null, requestId],
        );
      }

      await this.audit.log(
        user.sub,
        approve ? '批准归档病历处方修改申请（解锁一次）' : '驳回归档病历处方修改申请',
        `record:${recordId}, request:${requestId}`,
        client,
      );
      return this.fetchOne(client, requestId);
    });
  }

  private async fetchOne(client: PoolClient, requestId: number) {
    const result = await client.query(
      `SELECT id, record_id AS "recordId", applicant, applicant_name AS "applicantName",
              reason, status, approver, review_note AS "reviewNote",
              approved_at AS "approvedAt", rejected_at AS "rejectedAt",
              used_at AS "usedAt", used_prescription_id AS "usedPrescriptionId",
              created_at AS "createdAt"
       FROM prescription_modify_requests WHERE id = $1`,
      [requestId],
    );
    return result.rows[0];
  }
}
