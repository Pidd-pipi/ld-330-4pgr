-- 归档病历处方留痕闭环 · 增量迁移（幂等，可重复执行）
-- 已部署环境手动执行：psql "$DB_DSN" -f database/migration_archive_lock.sql
-- 全新部署无需执行，init.sql 已包含相同结构。

-- 审计日志补充详情字段（老库升级用）
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS detail TEXT;

-- 归档病历处方修改申请：批准后仅解锁该病历一次（used_at 记录解锁消耗）
CREATE TABLE IF NOT EXISTS prescription_modify_requests (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id),
  doctor VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审批',
  approver VARCHAR(80),
  approve_comment TEXT,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 同一病历只允许存在一个待审批申请，从数据库层拒绝重复申请
CREATE UNIQUE INDEX IF NOT EXISTS uq_modify_request_pending
  ON prescription_modify_requests (record_id)
  WHERE status = '待审批';

CREATE INDEX IF NOT EXISTS idx_modify_request_record
  ON prescription_modify_requests (record_id, created_at DESC);

-- 处方版本快照：医生每次保存处方时生成
CREATE TABLE IF NOT EXISTS prescription_versions (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id),
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  change_reason TEXT,
  modify_request_id INT REFERENCES prescription_modify_requests(id),
  operator VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (record_id, version)
);

CREATE INDEX IF NOT EXISTS idx_prescription_version_record
  ON prescription_versions (record_id, version DESC);
