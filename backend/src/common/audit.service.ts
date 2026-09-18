import { Injectable } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';

interface AuditQueryExecutor {
  query(text: string, params: unknown[]): Promise<unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  /** executor 可传入事务连接，使审计日志与业务变更在同一事务内提交 */
  async log(
    actor: string,
    action: string,
    target: string,
    executor: AuditQueryExecutor = this.database,
  ): Promise<void> {
    await executor.query(
      'INSERT INTO audit_logs (actor, action, target) VALUES ($1, $2, $3)',
      [actor, action, target],
    );
  }

  async list(limit = 100) {
    const result = await this.database.query<QueryResultRow>(
      'SELECT id, actor, action, target, created_at AS "createdAt" FROM audit_logs ORDER BY id DESC LIMIT $1',
      [Math.min(Number(limit) || 100, 500)],
    );
    return result.rows;
  }
}
