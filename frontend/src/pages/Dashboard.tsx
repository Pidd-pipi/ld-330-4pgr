import { AuditOutlined, FileSearchOutlined, LogoutOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { Alert, Button, Layout, Space, Tabs, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { session } from '../api/session';
import { APP_NAME, ROLE_LABELS } from '../constants/app';
import { ApprovalTab } from './tabs/ApprovalTab';
import { ArchiveTraceTab } from './tabs/ArchiveTraceTab';
import { AuditLogTab } from './tabs/AuditLogTab';
import { OverviewTab } from './tabs/OverviewTab';

const { Header, Content } = Layout;

export function Dashboard() {
  const navigate = useNavigate();
  const user = useMemo(() => session.getUser(), []);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const logout = () => {
    session.clear();
    navigate('/login', { replace: true });
  };

  const items = [
    { key: 'overview', label: <span><FileSearchOutlined /> 总览</span>, children: <OverviewTab /> },
    {
      key: 'trace',
      label: <span><MedicineBoxOutlined /> 归档处方留痕</span>,
      children: <ArchiveTraceTab user={user} />,
    },
    // 仅管理员看到审批台
    ...(user.role === 'admin'
      ? [
          {
            key: 'approval',
            label: <span><AuditOutlined /> 修改申请审批</span>,
            children: <ApprovalTab />,
          },
        ]
      : []),
    { key: 'audit', label: '审计日志', children: <AuditLogTab /> },
  ];

  return (
    <Layout className="app-shell">
      <Header className="topbar">
        <Typography.Title level={3} style={{ color: '#fff' }}>{APP_NAME}</Typography.Title>
        <Space>
          <Tag color="blue">{ROLE_LABELS[user.role] ?? user.role}</Tag>
          <Typography.Text style={{ color: '#fff' }}>{user.name}（{user.username}）</Typography.Text>
          <Button size="small" icon={<LogoutOutlined />} onClick={logout}>退出登录</Button>
        </Space>
      </Header>
      <Content className="content">
        <Alert
          type="info"
          showIcon
          message="归档病历处方留痕闭环：归档即锁定 → 医生发起修改申请（原因必填、不可重复）→ 管理员批准（仅解锁该病历一次）→ 保存处方自动生成版本快照并写审计日志，其他病历不受影响。"
        />
        <Tabs defaultActiveKey="trace" items={items} destroyInactiveTabPane />
      </Content>
    </Layout>
  );
}
