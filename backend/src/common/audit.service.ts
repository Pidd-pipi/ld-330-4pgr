import { Injectable } from '@nestjs/common';
import { DatabaseService, Queryable } from './database.service';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * 写入审计日志；传入事务 client 时与业务操作同事务提交，保证留痕闭环。
   */
  async log(
    actor: string,
    action: string,
    target: string,
    detail?: string,
    client: Queryable = this.database,
  ): Promise<void> {
    await client.query(
      'INSERT INTO audit_logs (actor, action, target, detail) VALUES ($1, $2, $3, $4)',
      [actor, action, target, detail ?? null],
    );
  }
}
