import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifyError } from '../api/client';
import { login } from '../api/emr';
import { session } from '../api/session';
import { APP_NAME, DEMO_ACCOUNTS, ROLE_LABELS } from '../constants/app';

interface LoginForm {
  username: string;
  password: string;
}

export function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const { token, user } = await login(values.username.trim(), values.password);
      session.save(token, user);
      navigate('/', { replace: true });
    } catch (error) {
      notifyError(error, '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #17324d 0%, #1677ff 100%)',
        padding: 16,
      }}
    >
      <Card style={{ width: 420 }} variant="borderless">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Title level={3} style={{ marginBottom: 0, textAlign: 'center' }}>
            {APP_NAME}
          </Typography.Title>
          <Alert
            type="info"
            showIcon
            message="归档病历处方留痕闭环"
            description="归档即锁定，调整须申请并填写原因，管理员批准后仅解锁一次，全程版本快照与审计留痕。"
          />
          <Form<LoginForm> layout="vertical" onFinish={onFinish} initialValues={{ username: 'doctor', password: 'doctor123' }}>
            <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
              <Input prefix={<UserOutlined />} placeholder="doctor / nurse / admin" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="演示密码见下方" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            演示账号：
            {DEMO_ACCOUNTS.map((account) => (
              <span key={account.username} style={{ marginRight: 12 }}>
                {ROLE_LABELS[account.username]} {account.username} / {account.password}
              </span>
            ))}
          </Typography.Paragraph>
        </Space>
      </Card>
    </div>
  );
}
