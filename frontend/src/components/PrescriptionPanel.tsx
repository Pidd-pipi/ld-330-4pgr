import {
  HistoryOutlined,
  LockOutlined,
  PlusOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import {
  archiveRecord,
  createModificationRequest,
  fetchPrescriptionVersions,
  fetchRecordDetail,
  savePrescriptions,
} from '../api/emr';
import { pickErrorMessage } from '../api/client';
import type {
  CurrentUser,
  Prescription,
  PrescriptionVersion,
  RecordDetail,
} from '../types/emr';

interface PrescriptionPanelProps {
  recordId: number;
  user: CurrentUser;
  /** 归档 / 申请 / 保存成功后通知父组件刷新时间轴 */
  onChanged: () => void;
}

const EMPTY_PRESCRIPTION: Prescription = {
  drugName: '',
  specification: '',
  dosage: '',
  frequency: '',
  duration: '',
};

export function PrescriptionPanel({ recordId, user, onChanged }: PrescriptionPanelProps) {
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Prescription[]>([]);
  const [saving, setSaving] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [versions, setVersions] = useState<PrescriptionVersion[]>([]);
  const [versionOpen, setVersionOpen] = useState(false);
  const [form] = Form.useForm<{ reason: string }>();
  const [messageApi, contextHolder] = message.useMessage();

  const isDoctor = user.role === 'doctor';
  const isAdmin = user.role === 'admin';

  const load = async () => {
    setDetail(await fetchRecordDetail(recordId));
  };

  useEffect(() => {
    setEditing(false);
    void load();
  }, [recordId]);

  const openEditor = () => {
    if (!detail) return;
    setDraft(
      detail.prescriptions.length
        ? detail.prescriptions.map(({ drugName, specification, dosage, frequency, duration }) => ({
            drugName,
            specification,
            dosage,
            frequency,
            duration,
          }))
        : [{ ...EMPTY_PRESCRIPTION }],
    );
    setEditing(true);
  };

  const updateRow = (index: number, field: keyof Prescription, value: string) => {
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleSave = async () => {
    if (draft.some((row) => !row.drugName?.trim() || !row.specification?.trim() || !row.dosage?.trim()
      || !row.frequency?.trim() || !row.duration?.trim())) {
      messageApi.error('药品名称、规格、用量、频次、疗程均为必填项');
      return;
    }
    setSaving(true);
    try {
      const result = await savePrescriptions(recordId, draft);
      messageApi.success(
        result.modifyRequestId
          ? `处方已保存并生成 v${result.version} 快照，本次解锁已一次性消耗`
          : `处方已保存并生成 v${result.version} 版本快照`,
      );
      setEditing(false);
      await load();
      onChanged();
    } catch (error) {
      messageApi.error(pickErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    try {
      await archiveRecord(recordId);
      messageApi.success('病历已归档，处方已锁定并生成基线快照');
      await load();
      onChanged();
    } catch (error) {
      messageApi.error(pickErrorMessage(error));
    }
  };

  const handleRequest = async () => {
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);
      await createModificationRequest(recordId, values.reason);
      messageApi.success('修改申请已提交，等待管理员审批');
      setRequestOpen(false);
      form.resetFields();
      await load();
      onChanged();
    } catch (error) {
      if (error instanceof Error || 'response' in (error as object)) {
        messageApi.error(pickErrorMessage(error));
      }
    } finally {
      setConfirmLoading(false);
    }
  };

  const openVersions = async () => {
    setVersionOpen(true);
    setVersions([]);
    try {
      setVersions(await fetchPrescriptionVersions(recordId));
    } catch (error) {
      messageApi.error(pickErrorMessage(error));
    }
  };

  if (!detail) {
    return <Card title="处方与留痕"><Empty description="未选择病历" /></Card>;
  }

  return (
    <Card
      title={
        <Space>
          处方管理与修改留痕
          {detail.locked
            ? <Tag icon={<LockOutlined />} color="red">已归档 · 处方锁定</Tag>
            : <Tag color="blue">未归档 · 可编辑</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => void openVersions()}>版本快照</Button>
          {!detail.locked && isDoctor && (
            <Popconfirm title="确认归档该病历？" description="归档后处方立即锁定，调整须申请并经管理员批准。" onConfirm={() => void handleArchive()}>
              <Button size="small" type="primary" ghost>归档病历</Button>
            </Popconfirm>
          )}
        </Space>
      }
    >
      {contextHolder}

      {detail.locked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="该病历已归档，处方处于锁定状态"
          description={
            detail.unlockAvailable
              ? '管理员已批准一次修改，请尽快保存新处方；保存后本次解锁立即失效，再次调整需重新申请。'
              : detail.hasPendingRequest
                ? '修改申请正在等待管理员审批，审批通过前不可保存处方，请勿重复申请。'
                : '医生调整处方必须发起修改申请并填写原因，管理员批准后仅解锁该病历一次，不影响其他病历。'
          }
        />
      )}

      {isDoctor && detail.locked && !detail.unlockAvailable && !detail.hasPendingRequest && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginBottom: 12 }}
          onClick={() => setRequestOpen(true)}
        >
          发起处方修改申请
        </Button>
      )}
      {isDoctor && detail.unlockAvailable && !editing && (
        <Button
          type="primary"
          icon={<UnlockOutlined />}
          style={{ marginBottom: 12 }}
          onClick={openEditor}
        >
          凭已批准申请调整处方（仅一次）
        </Button>
      )}
      {isDoctor && !detail.locked && !editing && (
        <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={openEditor}>
          编辑处方
        </Button>
      )}
      {!isDoctor && !isAdmin && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="当前角色仅可查看处方，无修改权限" />
      )}

      <Table
        rowKey={(_row, index) => String(index)}
        size="small"
        pagination={false}
        dataSource={editing ? draft : detail.prescriptions}
        columns={[
          {
            title: '药品名称',
            dataIndex: 'drugName',
            render: (_value, _row, index) => editing
              ? <Input value={draft[index].drugName} onChange={(e) => updateRow(index, 'drugName', e.target.value)} placeholder="如：苯磺酸氨氯地平片" />
              : _value,
          },
          {
            title: '规格',
            dataIndex: 'specification',
            render: (_value, _row, index) => editing
              ? <Input value={draft[index].specification} onChange={(e) => updateRow(index, 'specification', e.target.value)} placeholder="如：5mg*7片" />
              : _value,
          },
          {
            title: '用量',
            dataIndex: 'dosage',
            render: (_value, _row, index) => editing
              ? <Input value={draft[index].dosage} onChange={(e) => updateRow(index, 'dosage', e.target.value)} placeholder="如：5mg 口服" />
              : _value,
          },
          {
            title: '频次',
            dataIndex: 'frequency',
            render: (_value, _row, index) => editing
              ? <Input value={draft[index].frequency} onChange={(e) => updateRow(index, 'frequency', e.target.value)} placeholder="如：每日一次" />
              : _value,
          },
          {
            title: '疗程',
            dataIndex: 'duration',
            render: (_value, _row, index) => editing
              ? <Input value={draft[index].duration} onChange={(e) => updateRow(index, 'duration', e.target.value)} placeholder="如：14天" />
              : _value,
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (value: string | undefined) => (value ? <Tag color="gold">{value}</Tag> : <Tag>新处方</Tag>),
          },
          ...(editing
            ? [{
                title: '操作',
                width: 72,
                render: (_: unknown, __: Prescription, index: number) => (
                  <Button
                    danger
                    type="link"
                    size="small"
                    disabled={draft.length <= 1}
                    onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
                  >
                    删除
                  </Button>
                ),
              }]
            : []),
        ]}
      />

      {editing && (
        <Space style={{ marginTop: 12 }}>
          <Button icon={<PlusOutlined />} onClick={() => setDraft((rows) => [...rows, { ...EMPTY_PRESCRIPTION }])}>
            增加药品
          </Button>
          <Button type="primary" loading={saving} onClick={() => void handleSave()}>
            保存并生成版本快照
          </Button>
          <Button onClick={() => setEditing(false)}>取消</Button>
        </Space>
      )}

      <Modal
        title="发起归档病历处方修改申请"
        open={requestOpen}
        onOk={() => void handleRequest()}
        confirmLoading={confirmLoading}
        onCancel={() => { setRequestOpen(false); form.resetFields(); }}
        okText="提交申请"
        cancelText="取消"
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="申请经管理员批准后仅解锁该病历一次；未填写原因或重复申请将被直接拒绝。"
        />
        <Form form={form} layout="vertical">
          <Form.Item
            name="reason"
            label="修改原因（必填）"
            rules={[{ required: true, whitespace: true, message: '请填写处方调整原因' }]}
          >
            <Input.TextArea rows={4} placeholder="如：患者用药后出现下肢水肿，申请将氨氯地平减量并加用利尿剂" showCount maxLength={300} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <Space>
            <HistoryOutlined />
            处方版本快照（病历 #{recordId}）
          </Space>
        }
        open={versionOpen}
        footer={null}
        width={760}
        onCancel={() => setVersionOpen(false)}
      >
        {versions.length === 0 ? (
          <Typography.Text type="secondary">暂无快照，保存处方或归档时自动生成。</Typography.Text>
        ) : (
          <Timeline
            items={versions.map((version) => ({
              color: version.modifyRequestId ? 'red' : 'green',
              children: (
                <Space direction="vertical" size={4}>
                  <Space wrap>
                    <Tag color="blue">v{version.version}</Tag>
                    <strong>{version.changeReason}</strong>
                    {version.modifyRequestId && <Tag color="red">凭申请#{version.modifyRequestId}修改</Tag>}
                  </Space>
                  <Typography.Text type="secondary">
                    {version.operator} · {new Date(version.createdAt).toLocaleString('zh-CN')}
                  </Typography.Text>
                  <div>
                    {(version.snapshot ?? []).map((drug, index) => (
                      <Tag key={index}>
                        {drug.drugName} {drug.specification} · {drug.dosage} · {drug.frequency} · {drug.duration}
                        {drug.status ? ` · ${drug.status}` : ''}
                      </Tag>
                    ))}
                  </div>
                </Space>
              ),
            }))}
          />
        )}
      </Modal>
    </Card>
  );
}
