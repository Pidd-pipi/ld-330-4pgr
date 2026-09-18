import {
  AuditOutlined,
  FileDoneOutlined,
  HomeOutlined,
  LockOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Layout,
  Row,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import '@wangeditor/editor/dist/css/style.css';
import { Link } from 'react-router-dom';
import {
  fetchSummary,
  fetchTimeline,
  searchPatients,
} from '../api/emr';
import { clearSession, getStoredUser, pickErrorMessage } from '../api/client';
import { APP_NAME, PRESCRIPTION_STATUS } from '../constants/app';
import { MetricCard } from '../components/MetricCard';
import { PrescriptionPanel } from '../components/PrescriptionPanel';
import type { CurrentUser } from '../types/emr';
import type { MedicalRecord, Patient, Summary } from '../types/emr';
import { useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;

export function Dashboard() {
  const navigate = useNavigate();
  const user = getStoredUser() as CurrentUser;
  const [summary, setSummary] = useState<Summary>({ patientCount: 0, recordCount: 0, prescriptionCount: 0, workload: [] });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [editorHtml, setEditorHtml] = useState('<p>主诉：发热伴咳嗽。诊疗计划：完善血常规检查。</p>');
  const [messageApi, contextHolder] = message.useMessage();

  const loadTimeline = async (patientId: number) => {
    const records = await fetchTimeline(patientId);
    setTimeline(records);
    setSelectedPatientId(patientId);
    setSelectedRecordId(records[0]?.id ?? null);
  };

  const load = async () => {
    const [summaryData, patientData] = await Promise.all([fetchSummary(), searchPatients('')]);
    setSummary(summaryData);
    setPatients(patientData);
    if (patientData[0]) {
      await loadTimeline(patientData[0].id);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <Layout className="app-shell">
      {contextHolder}
      <Header className="topbar">
        <Space size="large">
          <Typography.Title level={3} style={{ margin: 0 }}>{APP_NAME}</Typography.Title>
          <Space>
            <Link to="/"><HomeOutlined /> 工作台</Link>
            {user.role === 'admin' && <Link to="/approvals"><AuditOutlined /> 修改审批</Link>}
          </Space>
        </Space>
        <Space>
          <Tag color="blue">{user.name}（{user.role === 'doctor' ? '医生' : user.role === 'nurse' ? '护士' : '管理员'}）</Tag>
          <Tag>JWT + 角色权限</Tag>
          <Button size="small" icon={<LogoutOutlined />} onClick={logout}>退出登录</Button>
        </Space>
      </Header>
      <Content className="content">
        <Alert
          type="info"
          showIcon
          message="归档病历处方留痕闭环：归档即锁定处方 → 医生发起修改申请（必填原因）→ 管理员批准仅解锁该病历一次 → 保存处方自动生成版本快照与审计日志，全程不影响其他病历。"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><MetricCard title="患者档案" value={summary.patientCount} icon={<TeamOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="病历数量" value={summary.recordCount} icon={<FileDoneOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="处方数量" value={summary.prescriptionCount} icon={<MedicineBoxOutlined />} /></Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="患者档案快速检索">
              <Form layout="inline" onFinish={(values) => searchPatients(values.keyword ?? '').then((data) => { setPatients(data); })}>
                <Form.Item name="keyword"><Input.Search placeholder="姓名 / 身份证号 / 手机号" enterButton="检索" /></Form.Item>
              </Form>
              <Table
                rowKey="id"
                dataSource={patients}
                size="small"
                pagination={false}
                rowClassName={(record) => (record.id === selectedPatientId ? 'patient-row-active' : '')}
                onRow={(record) => ({ onClick: () => loadTimeline(record.id), style: { cursor: 'pointer' } })}
                columns={[
                  { title: '档案编号', dataIndex: 'recordNo' },
                  { title: '姓名', dataIndex: 'name' },
                  { title: '性别', dataIndex: 'gender' },
                  { title: '年龄', dataIndex: 'age' },
                  { title: '过敏史', dataIndex: 'allergies' },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="病历时间轴与审签（点击查看处方）">
              <Timeline
                items={timeline.map((record) => ({
                  color: record.status === '已归档' ? 'green' : 'blue',
                  children: (
                    <div
                      onClick={() => setSelectedRecordId(record.id)}
                      className={record.id === selectedRecordId ? 'record-node-active' : 'record-node'}
                    >
                      <Space direction="vertical" size={2}>
                        <strong>{record.department} · {record.recordType}</strong>
                        <span>{record.chiefComplaint}</span>
                        <Space size={4} wrap>
                          <Tag>{record.status}</Tag>
                          {record.status === '已归档' && <Tag color="red" icon={<LockOutlined />}>处方锁定</Tag>}
                          {record.hasPendingRequest && <Tag color="processing">修改申请审批中</Tag>}
                          {record.unlockAvailable && <Tag color="success">已批准·可改一次</Tag>}
                        </Space>
                      </Space>
                    </div>
                  ),
                }))}
              />
            </Card>
          </Col>
        </Row>

        {selectedRecordId && (
          <PrescriptionPanel
            key={selectedRecordId}
            recordId={selectedRecordId}
            user={user}
            onChanged={async () => {
              if (selectedPatientId) {
                const records = await fetchTimeline(selectedPatientId);
                setTimeline(records);
              }
              try {
                setSummary(await fetchSummary());
              } catch (error) {
                messageApi.error(pickErrorMessage(error));
              }
            }}
          />
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="结构化病历模板与富文本书写">
              <Toolbar editor={null} defaultConfig={{}} mode="default" />
              <Editor defaultConfig={{ placeholder: '录入主诉、现病史、体格检查、诊断与治疗方案' }} value={editorHtml} onChange={(editor) => setEditorHtml(editor.getHtml())} mode="default" />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="处方状态跟踪说明" size="small">
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="处方状态：待审核 → 已审核 → 已执行；归档病历的处方保存后重新进入“待审核”。"
              />
              <Space direction="vertical">
                {PRESCRIPTION_STATUS.map((status) => (
                  <Tag key={status} color="gold">{status}</Tag>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
