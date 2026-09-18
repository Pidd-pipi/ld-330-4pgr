import { Card, Empty, Input, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { fetchAuditLogs } from '../../api/emr';
import { notifyError } from '../../api/client';
import type { AuditLog } from '../../types/emr';

export function AuditLogTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    fetchAuditLogs()
      .then(setLogs)
      .catch((error) => notifyError(error, '加载审计日志失败'));
  }, []);

  const filtered = keyword
    ? logs.filter(
        (log) =>
          log.action.includes(keyword) || log.actor.includes(keyword) || log.target.includes(keyword),
      )
    : logs;

  const tagColor = (action: string) => {
    if (action.includes('批准')) return 'warning';
    if (action.includes('驳回') || action.includes('拒绝')) return 'error';
    if (action.includes('归档')) return 'purple';
    if (action.includes('修改') || action.includes('解锁')) return 'red';
    return 'blue';
  };

  return (
    <Card
      title="审计日志（归档锁定 / 申请 / 审批 / 一次性解锁 / 版本快照全程留痕）"
      extra={<Input.Search placeholder="按操作人 / 动作 / 目标过滤" allowClear style={{ width: 280 }} onChange={(event) => setKeyword(event.target.value)} />}
    >
      <Table
        rowKey="id"
        size="small"
        dataSource={filtered}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无日志" /> }}
        columns={[
          { title: '#', dataIndex: 'id', width: 70 },
          { title: '时间', dataIndex: 'createdAt', width: 180 },
          { title: '操作人（账号）', dataIndex: 'actor', width: 160 },
          {
            title: '动作',
            dataIndex: 'action',
            render: (value: string) => <Tag color={tagColor(value)}>{value}</Tag>,
          },
          { title: '目标', dataIndex: 'target' },
        ]}
      />
    </Card>
  );
}
