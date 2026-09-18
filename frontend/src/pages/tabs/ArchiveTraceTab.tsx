import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Row,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  archiveRecord,
  createModifyRequest,
  fetchPrescriptionVersions,
  fetchRecordDetail,
  fetchRecordModifyRequests,
  fetchTimeline,
  savePrescription,
  searchPatients,
} from '../../api/emr';
import { notifyError } from '../../api/client';
import { MODIFY_REQUEST_STATUS_LABELS } from '../../constants/app';
import type {
  MedicalRecord,
  ModifyRequest,
  Patient,
  PrescriptionVersion,
  RecordDetail,
  SessionUser,
} from '../../types/emr';

interface PrescriptionForm {
  drugName: string;
  specification: string;
  dosage: string;
  frequency: string;
  duration: string;
}

const statusTag = (status: string) => {
  const meta = MODIFY_REQUEST_STATUS_LABELS[status] ?? { text: status, color: 'default' };
  return <Tag color={meta.color}>{meta.text}</Tag>;
};

export function ArchiveTraceTab({ user }: { user: SessionUser }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [keyword, setKeyword] = useState('');
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [versions, setVersions] = useState<PrescriptionVersion[]>([]);
  const [requests, setRequests] = useState<ModifyRequest[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<PrescriptionForm>();

  const canWrite = user.role === 'doctor' || user.role === 'admin';

  const loadPatients = async (kw = '') => {
    const data = await searchPatients(kw);
    setPatients(data);
    if (!selectedPatient && data[0]) {
      await selectPatient(data[0], data);
    }
  };

  const selectPatient = async (patient: Patient, list?: Patient[]) => {
    setSelectedPatient(patient);
    const data = await fetchTimeline(patient.id);
    setTimeline(data);
    if (data[0]) {
      await selectRecord(data[0].id);
    } else {
      setDetail(null);
      setVersions([]);
      setRequests([]);
    }
  };

  const selectRecord = async (recordId: number) => {
    const [recordDetail, recordRequests] = await Promise.all([
      fetchRecordDetail(recordId),
      fetchRecordModifyRequests(recordId),
    ]);
    setDetail(recordDetail);
    setRequests(recordRequests);
    setVersions(await fetchVersionsSafe(recordId));
    setReason('');
  };

  const fetchVersionsSafe = async (recordId: number): Promise<PrescriptionVersion[]> => {
    try {
      return await fetchPrescriptionVersions(recordId);
    } catch {
      return [];
    }
  };

  useEffect(() => {
    void loadPatients(keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = () => detail && selectRecord(detail.id);

  const handleArchive = (recordId: number) => {
    Modal.confirm({
      title: '确认审签归档？',
      content: '归档后该病历处方立即锁定，调整处方必须发起修改申请并经管理员批准（仅解锁一次）。',
      okText: '确认归档',
      cancelText: '取消',
      onOk: async () => {
        try {
          await archiveRecord(recordId);
          if (selectedPatient) {
            const data = await fetchTimeline(selectedPatient.id);
            setTimeline(data);
          }
          await selectRecord(recordId);
        } catch (error) {
          notifyError(error, '归档失败');
        }
      },
    });
  };

  const handleApply = async () => {
    if (!detail) return;
    if (!reason.trim()) {
      notifyError(new Error('请填写修改原因后再提交申请'), '未填写原因');
      return;
    }
    setSubmitting(true);
    try {
      await createModifyRequest(detail.id, reason.trim());
      setReason('');
      await refresh();
    } catch (error) {
      notifyError(error, '提交申请失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (values: PrescriptionForm) => {
    if (!detail) return;
    if (detail.locked && detail.activeRequest?.status !== '已批准') {
      notifyError(new Error(getErrorMessageLocked(detail)), '处方已锁定');
      return;
    }
    setSubmitting(true);
    try {
      const result = await savePrescription(detail.id, values);
      Modal.success({
        title: result.unlockedOnce ? '一次性解锁已使用，处方保存成功' : '处方保存成功',
        content: `已生成 V${result.version} 版本快照并写入审计日志。${
          result.unlockedOnce ? '该病历已重新锁定，再次调整需重新申请。' : ''
        }`,
      });
      form.resetFields();
      await refresh();
    } catch (error) {
      notifyError(error, '保存处方失败');
    } finally {
      setSubmitting(false);
    }
  };

  const lockedHint = useMemo(() => {
    if (!detail?.locked) return null;
    if (detail.activeRequest?.status === '已批准') {
      return {
        type: 'warning' as const,
        message: '该病历已归档，管理员已批准本次修改：下方保存将消费这次一次性解锁，保存后立即重新锁定。',
      };
    }
    if (detail.activeRequest?.status === '待审批') {
      return {
        type: 'info' as const,
        message: '该病历已归档且已有待审批的修改申请，批准前不能新增处方，请勿重复申请。',
      };
    }
    return {
      type: 'error' as const,
      message: '该病历已归档，处方已锁定。请先发起修改申请并填写原因，管理员批准后仅解锁一次。',
    };
  }, [detail]);

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={7}>
        <Card title="患者与病历" size="small">
          <Input.Search
            placeholder="姓名 / 身份证号 / 手机号"
            allowClear
            onSearch={(value) => loadPatients(value)}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ marginBottom: 12 }}
          />
          <List
            size="small"
            dataSource={patients}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无患者" /> }}
            renderItem={(patient) => (
              <List.Item
                onClick={() => selectPatient(patient)}
                style={{ cursor: 'pointer', background: selectedPatient?.id === patient.id ? '#e6f4ff' : undefined }}
              >
                <List.Item.Meta title={patient.name} description={`${patient.recordNo} · ${patient.gender} · ${patient.age}岁`} />
              </List.Item>
            )}
          />
          {timeline.length > 0 && (
            <Typography.Title level={5} style={{ marginTop: 12 }}>病历列表</Typography.Title>
          )}
          <List
            size="small"
            bordered
            dataSource={timeline}
            renderItem={(record) => (
              <List.Item
                actions={
                  record.status !== '已归档' && canWrite
                    ? [
                        <Button
                          key="archive"
                          size="small"
                          type="link"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleArchive(record.id);
                          }}
                        >
                          归档
                        </Button>,
                      ]
                    : undefined
                }
                onClick={() => selectRecord(record.id)}
                style={{ cursor: 'pointer', background: detail?.id === record.id ? '#f6ffed' : undefined }}
              >
                <Space direction="vertical" size={0}>
                  <span>
                    <Badge status={record.status === '已归档' ? 'success' : 'processing'} text={`#${record.id} ${record.department} · ${record.recordType}`} />
                  </span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{record.chiefComplaint}</Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Col xs={24} lg={17}>
        {!detail ? (
          <Card><Empty description="请选择病历查看处方留痕" /></Card>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              size="small"
              title={
                <Space>
                  {detail.locked ? <LockOutlined style={{ color: '#cf1322' }} /> : <UnlockOutlined style={{ color: '#3f8600' }} />}
                  病历 #{detail.id} · {detail.patientName}（{detail.patientNo}）
                  <Tag color={detail.locked ? 'green' : 'blue'}>{detail.status}</Tag>
                </Space>
              }
            >
              <Descriptions size="small" column={2}>
                <Descriptions.Item label="科室">{detail.department}</Descriptions.Item>
                <Descriptions.Item label="主治医生">{detail.doctor}</Descriptions.Item>
                <Descriptions.Item label="诊断" span={2}>{detail.diagnosis}</Descriptions.Item>
                <Descriptions.Item label="治疗方案" span={2}>{detail.treatment}</Descriptions.Item>
              </Descriptions>
            </Card>

            {lockedHint && <Alert type={lockedHint.type} showIcon message={lockedHint.message} />}

            <Card
              size="small"
              title={`处方清单（${detail.prescriptions.length}）`}
              extra={detail.locked && <Tag color={detail.activeRequest?.status === '已批准' ? 'warning' : 'error'}>锁定中</Tag>}
            >
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.prescriptions}
                columns={[
                  { title: '药品', dataIndex: 'drugName' },
                  { title: '规格', dataIndex: 'specification' },
                  { title: '用量', dataIndex: 'dosage' },
                  { title: '频次', dataIndex: 'frequency' },
                  { title: '疗程', dataIndex: 'duration' },
                  { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color="gold">{value}</Tag> },
                  { title: '开具人', dataIndex: 'createdBy' },
                ]}
              />
            </Card>

            {canWrite && (
              <Card
                size="small"
                title={detail.locked ? '归档后调整处方（一次性解锁）' : '新增处方（自动生成版本快照）'}
              >
                {detail.locked && detail.activeRequest?.status !== '已批准' ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Typography.Text strong>发起处方修改申请（原因必填）</Typography.Text>
                    <Input.TextArea
                      rows={3}
                      value={reason}
                      disabled={detail.activeRequest?.status === '待审批'}
                      placeholder="请如实填写修改原因，例如：患者用药后出现干咳不良反应，申请更换降压方案"
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={detail.activeRequest?.status === '待审批'}
                      onClick={handleApply}
                    >
                      {detail.activeRequest?.status === '待审批' ? '已有待审批申请' : '提交修改申请'}
                    </Button>
                  </Space>
                ) : (
                  <Form layout="inline" form={form} onFinish={handleSave}>
                    <Form.Item name="drugName" rules={[{ required: true, message: '药品名称必填' }]}>
                      <Input placeholder="药品名称" style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item name="specification" rules={[{ required: true, message: '规格必填' }]}>
                      <Input placeholder="规格" style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name="dosage" rules={[{ required: true, message: '用量必填' }]}>
                      <Input placeholder="用量" style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item name="frequency" rules={[{ required: true, message: '频次必填' }]}>
                      <Input placeholder="频次" style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item name="duration" rules={[{ required: true, message: '疗程必填' }]}>
                      <Input placeholder="疗程" style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" loading={submitting}>
                        {detail.locked ? '保存并消费解锁' : '保存处方'}
                      </Button>
                    </Form.Item>
                  </Form>
                )}
              </Card>
            )}

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card size="small" title="处方版本快照">
                  {versions.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无快照" />
                  ) : (
                    <Timeline
                      items={versions.map((item) => ({
                        color: item.requestId ? 'red' : 'blue',
                        children: (
                          <Space direction="vertical" size={2}>
                            <strong>V{item.version}</strong>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {item.createdAt} · 操作人 {item.operator}
                            </Typography.Text>
                            <span>{item.changeReason}</span>
                            <Button
                              size="small"
                              type="link"
                              style={{ padding: 0 }}
                              onClick={() =>
                                Modal.info({
                                  title: `V${item.version} 处方快照（共 ${item.snapshot.length} 条）`,
                                  width: 640,
                                  content: (
                                    <pre style={{ maxHeight: 420, overflow: 'auto', fontSize: 12 }}>
                                      {JSON.stringify(item.snapshot, null, 2)}
                                    </pre>
                                  ),
                                })
                              }
                            >
                              查看快照内容
                            </Button>
                          </Space>
                        ),
                      }))}
                    />
                  )}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card size="small" title="修改申请留痕">
                  {requests.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无申请" />
                  ) : (
                    <Timeline
                      items={requests.map((item) => ({
                        children: (
                          <Space direction="vertical" size={2}>
                            <Space>
                              <strong>申请 #{item.id}</strong>
                              {statusTag(item.status)}
                            </Space>
                            <span>申请人：{item.applicantName}</span>
                            <span>原因：{item.reason}</span>
                            {item.reviewNote && <span>审批意见：{item.reviewNote}</span>}
                            {item.usedAt && <Tag color="success">解锁已于 {item.usedAt} 消费</Tag>}
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.createdAt}</Typography.Text>
                          </Space>
                        ),
                      }))}
                    />
                  )}
                </Card>
              </Col>
            </Row>
          </Space>
        )}
      </Col>
    </Row>
  );
}

function getErrorMessageLocked(detail: RecordDetail): string {
  return detail.activeRequest?.status === '待审批'
    ? '申请审批中，请等待管理员批准'
    : '已归档病历处方已锁定，请先发起修改申请';
}
