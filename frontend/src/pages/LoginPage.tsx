import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { pickErrorMessage, saveSession } from '../api/client';
import { APP_NAME } from '../constants/app';

const DEMO_HINT: Record<string, string> = {
  doctor: '医生 doctor / doctor123',
  nurse: '护士 nurse / nurse123',
  admin: '管理员 admin / admin123',
};

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError('');
    try {
      const result = await login(values.username, values.password);
      saveSession(result.token, result.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Typography.Title level={3} style={{ marginBottom: 4 }}>{APP_NAME}</Typography.Title>
            <Typography.Text type="secondary">归档病历处方留痕闭环 · 请先登录</Typography.Text>
          </div>
          {error && <Alert type="error" showIcon message={error} />}
          <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'doctor', password: 'doctor123' }}>
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" size="large" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large" loading={loading}>
              登录
            </Button>
          </Form>
          <Alert type="info" showIcon message={
            <Space direction="vertical" size={0}>
              {Object.values(DEMO_HINT).map((hint) => <span key={hint}>{hint}</span>)}
            </Space>
          } />
        </Space>
      </Card>
    </div>
  );
}
