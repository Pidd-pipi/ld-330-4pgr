CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(120) NOT NULL,
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

-- 归档处方留痕闭环：处方补充创建人与创建时间，便于快照与审计追溯
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS created_by VARCHAR(80) NOT NULL DEFAULT '医生';
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 处方修改申请：病历归档后医生须申请并填写原因，管理员审批，批准后仅解锁一次
CREATE TABLE IF NOT EXISTS prescription_modify_requests (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  applicant VARCHAR(80) NOT NULL,
  applicant_name VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审批',
  approver VARCHAR(80),
  review_note VARCHAR(280),
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  used_at TIMESTAMP,
  used_prescription_id INT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 同一病历同时最多存在一个「待审批 / 已批准」申请：数据库层兜底拒绝重复申请，且天然按病历隔离
CREATE UNIQUE INDEX IF NOT EXISTS uq_modify_request_active_per_record
  ON prescription_modify_requests (record_id)
  WHERE status IN ('待审批', '已批准');

-- 处方版本快照：每次保存处方时记录该病历当时的完整处方清单
CREATE TABLE IF NOT EXISTS prescription_snapshots (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
  version INT NOT NULL,
  prescription_id INT REFERENCES prescriptions(id) ON DELETE SET NULL,
  request_id INT REFERENCES prescription_modify_requests(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL,
  operator VARCHAR(80) NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (record_id, version)
);

INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
VALUES
  ('EMR202606001', '张若宁', '女', 34, '110101199201010028', '13800010001', '青霉素', '慢性鼻炎'),
  ('EMR202606002', '李明哲', '男', 48, '110101197801010019', '13800010002', '无', '高血压')
ON CONFLICT (record_no) DO NOTHING;

INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients WHERE record_no = 'EMR202606001'
ON CONFLICT DO NOTHING;

-- 演示「已归档」病历：归档即锁定，处方调整必须走修改申请
INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '心内科', '王主任', '门诊', '反复头晕 1 个月', '原发性高血压 2 级', '规律口服降压药，低盐饮食，两周后复诊', '已归档'
FROM patients
WHERE record_no = 'EMR202606002'
  AND NOT EXISTS (SELECT 1 FROM medical_records mr WHERE mr.patient_id = patients.id AND mr.status = '已归档');

-- 为归档病历写入归档基线处方
INSERT INTO prescriptions (record_id, drug_name, specification, dosage, frequency, duration, status, created_by)
SELECT mr.id, seed.drug_name, seed.specification, seed.dosage, seed.frequency, seed.duration, '已审核', '王主任'
FROM medical_records mr
JOIN patients p ON p.id = mr.patient_id
CROSS JOIN (
  VALUES
    ('苯磺酸氨氯地平片', '5mg*7片', '5mg', '口服 qd', '14天'),
    ('缬沙坦胶囊', '80mg*7粒', '80mg', '口服 qd', '14天')
) AS seed(drug_name, specification, dosage, frequency, duration)
WHERE p.record_no = 'EMR202606002'
  AND mr.status = '已归档'
  AND NOT EXISTS (SELECT 1 FROM prescriptions px WHERE px.record_id = mr.id);

-- 归档基线版本快照（V1）
INSERT INTO prescription_snapshots (record_id, version, snapshot, operator, change_reason)
SELECT px.record_id,
       1,
       jsonb_agg(
         jsonb_build_object(
           'id', px.id,
           'drugName', px.drug_name,
           'specification', px.specification,
           'dosage', px.dosage,
           'frequency', px.frequency,
           'duration', px.duration,
           'status', px.status,
           'createdBy', px.created_by,
           'createdAt', px.created_at
         )
         ORDER BY px.id
       ),
       '王主任',
       '归档基线版本'
FROM prescriptions px
JOIN medical_records mr ON mr.id = px.record_id
JOIN patients p ON p.id = mr.patient_id
WHERE p.record_no = 'EMR202606002'
  AND mr.status = '已归档'
  AND NOT EXISTS (SELECT 1 FROM prescription_snapshots ps WHERE ps.record_id = px.record_id)
GROUP BY px.record_id;
