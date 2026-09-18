import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { approveModifyRequest, fetchAllModifyRequests, rejectModifyRequest } from '../../api/emr';
import { notifyError } from '../../api/client';
import { MODIFY_REQUEST_STATUS_LABELS } from '../../constants/app';
import type { ModifyRequest } from '../../types/emr';

const FILTER_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待审批', value: '待审批' },
  { label: '已批准（待使用）', value: '已批准' },
  { label: '已驳回', value: '已驳回' },
  { label: '已使用', value: '已使用' },
];

export function ApprovalTab() {
  const [requests, setRequests] = useState<ModifyRequest[]>([]);
  const [status, setStatus] = useState('待审批');
  const [loading, setLoading] = useState(false);

  const load = async (currentStatus = status) => {
    setLoading(true);
    try {
      setRequests(await fetchAllModifyRequests(currentStatus || undefined));
    } catch (error) {
      notifyError(error, '加载申请失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load('待审批');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const review = (record: ModifyRequest, approve: boolean) => {
    let note = '';
    Modal.confirm({
      title: approve ? `批准申请 #${record.id}？` : `驳回申请 #${record.id}？`,
      content: (
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
          <Alert
            type={approve ? 'warning' : 'info'}
            showIcon
            message={
              approve
                ? '批准后仅解锁该病历一次：医生保存一次处方后解锁立即消费，不影响其他病历。'
                : '驳回后医生可重新发起申请。'
            }
          />
          <Input.TextArea
            rows={3}
            placeholder="审批意见（可选）"
            onChange={(event) => {
              note = event.target.value;
            }}
          />
        </Space>
      ),
      okText: approve ? '确认批准' : '确认驳回',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (approve) {
            await approveModifyRequest(record.id, note.trim() || undefined);
          } else {
            await rejectModifyRequest(record.id, note.trim() || undefined);
          }
          await load();
        } catch (error) {
          notifyError(error, '审批失败');
        }
      },
    });
  };

  return (
    <Card
      title="处方修改申请审批"
      extra={
        <Select
          value={status}
          options={FILTER_OPTIONS}
          style={{ width: 180 }}
          onChange={(value) => {
            setStatus(value);
            void load(value);
          }}
        />
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={requests}
        pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无申请" /> }}
        columns={[
          { title: '申请#', dataIndex: 'id', width: 70 },
          {
            title: '患者/病历',
            render: (_, record) => (
              <Space direction="vertical" size={0}>
                <span>{record.patientName}（{record.patientNo}）</span>
                <span style={{ color: '#999', fontSize: 12 }}>病历 #{record.recordId} · {record.department}</span>
              </Space>
            ),
          },
          { title: '申请人', dataIndex: 'applicantName' },
          { title: '修改原因', dataIndex: 'reason' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value: string) => {
              const meta = MODIFY_REQUEST_STATUS_LABELS[value] ?? { text: value, color: 'default' };
              return <Tag color={meta.color}>{meta.text}</Tag>;
            },
          },
          {
            title: '解锁消费',
            render: (_, record) =>
              record.usedAt ? <Tag color="success">已用于处方 #{record.usedPrescriptionId}</Tag> : record.status === '已批准' ? <Tag color="warning">待医生保存消费</Tag> : <span>—</span>,
          },
          { title: '申请时间', dataIndex: 'createdAt', width: 170 },
          {
            title: '操作',
            width: 170,
            render: (_, record) =>
              record.status === '待审批' ? (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    onClick={() => review(record, true)}
                  >
                    批准
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => review(record, false)}
                  >
                    驳回
                  </Button>
                </Space>
              ) : (
                <span style={{ color: '#999' }}>已处理</span>
              ),
          },
        ]}
      />
    </Card>
  );
}
