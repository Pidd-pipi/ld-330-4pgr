import { AuditOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';
import {
  approveModificationRequest,
  fetchAuditLogs,
  fetchModificationRequests,
  rejectModificationRequest,
} from '../api/emr';
import { pickErrorMessage } from '../api/client';
import type { AuditLog, ModificationRequest } from '../types/emr';

interface ApproveState {
  open: boolean;
  action: 'approve' | 'reject';
  request?: ModificationRequest;
}

export function ApprovalsPage() {
  const [requests, setRequests] = useState<ModificationRequest[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [approveState, setApproveState] = useState<ApproveState>({ open: false, action: 'approve' });
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<{ comment: string }>();
  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestData, logData] = await Promise.all([
        fetchModificationRequests(),
        fetchAuditLogs(),
      ]);
      setRequests(requestData);
      setLogs(logData);
    } catch (error) {
      messageApi.error(pickErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitDecision = async () => {
    const { action, request } = approveState;
    if (!request) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (action === 'approve') {
        await approveModificationRequest(request.id, values.comment);
        messageApi.success(`已批准申请 #${request.id}，病历 #${request.recordId} 仅解锁一次`);
      } else {
        await rejectModificationRequest(request.id, values.comment);
        messageApi.success(`已驳回申请 #${request.id}`);
      }
      setApproveState((state) => ({ ...state, open: false }));
      form.resetFields();
      await load();
    } catch (error) {
      if (error instanceof Error || 'response' in (error as object)) {
        messageApi.error(pickErrorMessage(error, action === 'approve' ? '批准失败' : '驳回失败'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const requestColumns: ColumnsType<ModificationRequest> = [
    { title: '申请号', dataIndex: 'id', width: 80, render: (id: number) => `#${id}` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string, record) => {
        if (status === '待审批') return <Tag color="processing">待审批</Tag>;
        if (status === '已批准') return record.usedAt ? <Tag color="default">已批准·已消耗</Tag> : <Tag color="success">已批准·待使用</Tag>;
        return <Tag color="error">已驳回</Tag>;
      },
    },
    { title: '病历号', dataIndex: 'recordId', width: 90, render: (id: number) => `#${id}` },
    { title: '患者', dataIndex: 'patientName', width: 90 },
    { title: '科室', dataIndex: 'department', width: 100 },
    { title: '申请医生', dataIndex: 'doctor', width: 100 },
    { title: '修改原因', dataIndex: 'reason' },
    { title: '审批人', dataIndex: 'approver', width: 100, render: (v: string | null) => v ?? '—' },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, record) => record.status === '待审批'
        ? (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => { form.resetFields(); setApproveState({ open: true, action: 'approve', request: record }); }}
            >
              批准
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => { form.resetFields(); setApproveState({ open: true, action: 'reject', request: record }); }}
            >
              驳回
            </Button>
          </Space>
        )
        : null,
    },
  ];

  const logColumns: ColumnsType<AuditLog> = [
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => new Date(v).toLocaleString('zh-CN') },
    { title: '操作人', dataIndex: 'actor', width: 120 },
    { title: '操作', dataIndex: 'action', width: 260 },
    { title: '对象', dataIndex: 'target', width: 160 },
    { title: '详情', dataIndex: 'detail', render: (v: string | null) => v ?? '—' },
  ];

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {contextHolder}
      <Alert
        type="info"
        showIcon
        message="处方修改审批中心"
        description="仅管理员可审批。批准后系统只解锁对应病历一次，医生保存新处方并生成版本快照后解锁立即消耗；所有申请、审批、保存动作均写入审计日志。"
      />
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title={<Space><AuditOutlined />修改申请与审计留痕</Space>}>
            <Tabs
              items={[
                {
                  key: 'requests',
                  label: `修改申请（${requests.length}）`,
                  children: (
                    <Table
                      rowKey="id"
                      loading={loading}
                      size="small"
                      scroll={{ x: 1100 }}
                      dataSource={requests}
                      columns={requestColumns}
                      pagination={{ pageSize: 10 }}
                    />
                  ),
                },
                {
                  key: 'logs',
                  label: `审计日志（${logs.length}）`,
                  children: (
                    <Table
                      rowKey="id"
                      loading={loading}
                      size="small"
                      dataSource={logs}
                      columns={logColumns}
                      pagination={{ pageSize: 15 }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={approveState.action === 'approve' ? '批准处方修改申请' : '驳回处方修改申请'}
        open={approveState.open}
        confirmLoading={submitting}
        okText={approveState.action === 'approve' ? '确认批准（仅解锁一次）' : '确认驳回'}
        okButtonProps={{ danger: approveState.action === 'reject' }}
        cancelText="取消"
        onOk={() => void submitDecision()}
        onCancel={() => setApproveState((state) => ({ ...state, open: false }))}
        destroyOnClose
      >
        {approveState.request && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert
              type={approveState.action === 'approve' ? 'success' : 'warning'}
              showIcon
              message={`病历 #${approveState.request.recordId} · ${approveState.request.patientName} · ${approveState.request.doctor}`}
              description={`修改原因：${approveState.request.reason}`}
            />
            <Form form={form} layout="vertical">
              <Form.Item name="comment" label="审批意见（可选）">
                <Input.TextArea rows={3} maxLength={200} showCount placeholder={approveState.action === 'approve' ? '如：同意按申请调整，注意监测血压' : '如：理由不充分，请补充临床依据'} />
              </Form.Item>
            </Form>
          </Space>
        )}
      </Modal>
    </div>
  );
}
