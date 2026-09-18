import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, MODIFY_REQUEST_STATUS, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';
import type { JwtUser } from '../common/jwt-auth.guard';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface RecordStatusRow {
  status: string;
}

@Injectable()
export class ModificationRequestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 医生发起修改申请：原因必填；同一病历存在待审批或已批准未使用的申请时拒绝重复申请。
   */
  async createRequest(recordId: number, reason: string, user: JwtUser) {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new BadRequestException(APP_MESSAGES.reasonRequired);
    }

    const record = await this.database.query<RecordStatusRow>(
      'SELECT status FROM medical_records WHERE id = $1',
      [recordId],
    );
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    if (record.rows[0].status !== RECORD_STATUS.archived) {
      throw new BadRequestException('仅已归档并锁定处方的病历需要发起修改申请');
    }

    const active = await this.database.query(
      `SELECT id FROM prescription_modify_requests
       WHERE record_id = $1 AND (status = $2 OR (status = $3 AND used_at IS NULL))`,
      [recordId, MODIFY_REQUEST_STATUS.pending, MODIFY_REQUEST_STATUS.approved],
    );
    if (active.rowCount) {
      throw new ConflictException(APP_MESSAGES.requestDuplicate);
    }

    try {
      const result = await this.database.query(
        `INSERT INTO prescription_modify_requests (record_id, doctor, reason)
         VALUES ($1, $2, $3)
         RETURNING id, record_id AS "recordId", doctor, reason, status, created_at AS "createdAt"`,
        [recordId, user.name, trimmedReason],
      );
      await this.audit.log(user.name, '发起归档病历处方修改申请', `record:${recordId}`, trimmedReason);
      return result.rows[0];
    } catch (error) {
      // 待审批唯一索引兜底：并发重复申请直接拒绝
      if ((error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
        throw new ConflictException(APP_MESSAGES.requestDuplicate);
      }
      throw error;
    }
  }

  /** 管理员批准：仅解锁该病历一次（used_at 在医生保存处方时写入） */
  async approveRequest(requestId: number, comment: string | undefined, user: JwtUser) {
    return this.database.withTransaction(async (client) => {
      const request = await client.query(
        `SELECT id, record_id AS "recordId", status FROM prescription_modify_requests
         WHERE id = $1 FOR UPDATE`,
        [requestId],
      );
      if (!request.rowCount) {
        throw new NotFoundException(APP_MESSAGES.requestNotFound);
      }
      if (request.rows[0].status !== MODIFY_REQUEST_STATUS.pending) {
        throw new BadRequestException(APP_MESSAGES.requestNotPending);
      }
      // 已存在“已批准且未使用”的解锁时，不允许再次批准，保证一次申请只解锁一次
      const existing = await client.query(
        `SELECT 1 FROM prescription_modify_requests
         WHERE record_id = $1 AND status = '已批准' AND used_at IS NULL`,
        [request.rows[0].recordId],
      );
      if (existing.rowCount) {
        throw new ConflictException('该病历已有一次尚未使用的解锁，拒绝重复批准');
      }
      const result = await client.query(
        `UPDATE prescription_modify_requests
           SET status = '已批准', approver = $1, approve_comment = $2, approved_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, record_id AS "recordId", doctor, reason, status, approver,
                   approve_comment AS "approveComment", approved_at AS "approvedAt", created_at AS "createdAt"`,
        [user.name, comment?.trim() || null, requestId],
      );
      await this.audit.log(
        user.name,
        '批准归档病历处方修改申请',
        `request:${requestId}`,
        `解锁病历 record:${request.rows[0].recordId}（仅一次）${comment?.trim() ? `；意见：${comment.trim()}` : ''}`,
        client,
      );
      return result.rows[0];
    });
  }

  async rejectRequest(requestId: number, comment: string | undefined, user: JwtUser) {
    return this.database.withTransaction(async (client) => {
      const request = await client.query(
        `SELECT id, record_id AS "recordId", status FROM prescription_modify_requests
         WHERE id = $1 FOR UPDATE`,
        [requestId],
      );
      if (!request.rowCount) {
        throw new NotFoundException(APP_MESSAGES.requestNotFound);
      }
      if (request.rows[0].status !== MODIFY_REQUEST_STATUS.pending) {
        throw new BadRequestException(APP_MESSAGES.requestNotPending);
      }
      const result = await client.query(
        `UPDATE prescription_modify_requests
           SET status = '已驳回', approver = $1, approve_comment = $2, rejected_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, record_id AS "recordId", doctor, reason, status, approver,
                   approve_comment AS "approveComment", rejected_at AS "rejectedAt", created_at AS "createdAt"`,
        [user.name, comment?.trim() || null, requestId],
      );
      await this.audit.log(
        user.name,
        '驳回归档病历处方修改申请',
        `request:${requestId}`,
        `病历 record:${request.rows[0].recordId}${comment?.trim() ? `；意见：${comment.trim()}` : ''}`,
        client,
      );
      return result.rows[0];
    });
  }

  /** 修改申请列表：医生只看本人申请，管理员看全部 */
  async listRequests(status: string | undefined, user: JwtUser) {
    const params: unknown[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE m.status = $1';
      if (user.role === 'doctor') {
        params.push(user.name);
        where += ' AND m.doctor = $2';
      }
    } else if (user.role === 'doctor') {
      params.push(user.name);
      where = 'WHERE m.doctor = $1';
    }
    const result = await this.database.query(
      `SELECT m.id, m.record_id AS "recordId", p.name AS "patientName", r.department,
              m.doctor, m.reason, m.status, m.approver, m.approve_comment AS "approveComment",
              m.approved_at AS "approvedAt", m.rejected_at AS "rejectedAt",
              m.used_at AS "usedAt", m.created_at AS "createdAt"
       FROM prescription_modify_requests m
       JOIN medical_records r ON r.id = m.record_id
       JOIN patients p ON p.id = r.patient_id
       ${where}
       ORDER BY m.created_at DESC`,
      params,
    );
    return result.rows;
  }

  async listAuditLogs(limit = 100) {
    const safeLimit = Math.min(Number.isFinite(Number(limit)) ? Number(limit) : 100, 500);
    const result = await this.database.query(
      `SELECT id, actor, action, target, detail, created_at AS "createdAt"
       FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1`,
      [safeLimit],
    );
    return result.rows;
  }
}
