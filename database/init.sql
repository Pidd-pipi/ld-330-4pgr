CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(120) NOT NULL,
  detail TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  record_no VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  gender VARCHAR(16) NOT NULL,
  age INT NOT NULL,
  id_card VARCHAR(32) UNIQUE NOT NULL,
  phone VARCHAR(32) NOT NULL,
  allergies TEXT,
  history TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_records (
  id SERIAL PRIMARY KEY,
  patient_id INT REFERENCES patients(id),
  department VARCHAR(80) NOT NULL,
  doctor VARCHAR(80) NOT NULL,
  record_type VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES medical_records(id),
  drug_name VARCHAR(120) NOT NULL,
  specification VARCHAR(80) NOT NULL,
  dosage VARCHAR(80) NOT NULL,
  frequency VARCHAR(80) NOT NULL,
  duration VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审核'
);

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

-- 处方版本快照：医生每次保存处方时生成，归档前留痕基线，批准解锁后留痕修改结果
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

INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
VALUES
  ('EMR202606001', '张若宁', '女', 34, '110101199201010028', '13800010001', '青霉素', '慢性鼻炎'),
  ('EMR202606002', '李明哲', '男', 48, '110101197801010019', '13800010002', '无', '高血压')
ON CONFLICT (record_no) DO NOTHING;

INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients WHERE record_no = 'EMR202606001'
ON CONFLICT DO NOTHING;

-- 演示用已归档病历（处方锁定状态），仅在尚未存在该患者的归档病历时插入
INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT p.id, '心内科', '赵医生', '门诊', '反复头晕 1 个月', '原发性高血压 2 级', '降压治疗并低盐饮食，2 周后复诊', '已归档'
FROM patients p
WHERE p.record_no = 'EMR202606002'
  AND NOT EXISTS (
    SELECT 1 FROM medical_records r WHERE r.patient_id = p.id AND r.status = '已归档'
  );

-- 为归档病历写入两条演示处方（仅在该病历尚无处方时插入）
INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status)
SELECT r.id, v.drug_name, v.specification, v.dosage, v.frequency, v.duration, '已审核'
FROM medical_records r
JOIN patients p ON p.id = r.patient_id
CROSS JOIN (VALUES
  ('苯磺酸氨氯地平片', '5mg*7片', '5mg 口服', '每日一次', '14天'),
  ('缬沙坦胶囊', '80mg*7粒', '80mg 口服', '每日一次', '14天')
) AS v(drug_name, specification, dosage, frequency, duration)
WHERE p.record_no = 'EMR202606002'
  AND r.status = '已归档'
  AND NOT EXISTS (SELECT 1 FROM prescriptions x WHERE x.record_id = r.id);

-- 归档时的处方基线快照（版本 1），仅在尚无快照时写入
INSERT INTO prescription_versions (record_id, version, snapshot, change_reason, operator)
SELECT r.id, 1,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'drugName', x.drug_name,
                 'specification', x.specification,
                 'dosage', x.dosage,
                 'frequency', x.frequency,
                 'duration', x.duration,
                 'status', x.status
               )), '[]'::jsonb)
          FROM prescriptions x WHERE x.record_id = r.id),
       '病历归档，处方锁定基线',
       '系统管理员'
FROM medical_records r
JOIN patients p ON p.id = r.patient_id
WHERE p.record_no = 'EMR202606002'
  AND r.status = '已归档'
  AND NOT EXISTS (SELECT 1 FROM prescription_versions v WHERE v.record_id = r.id);
