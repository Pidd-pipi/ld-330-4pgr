# 电子病历管理系统（GBEMR）

面向中小型医疗机构的电子病历管理系统，覆盖患者档案、结构化病历、医嘱处方、审签归档、统计检索和系统审计。

## 快速启动（Docker Compose）

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

访问地址：

- 前端：http://localhost:18930
- 后端健康检查：http://localhost:19930/health
- API 示例：http://localhost:18930/api/summary

停止服务：

```bash
docker compose down
```

## 项目主要功能

- 患者档案管理：录入姓名、性别、年龄、身份证号、手机号、过敏史、既往史，并支持姓名、身份证号、手机号检索。
- 病历书写与模板：门诊/住院病历结构化字段，集成富文本编辑器，按患者时间轴展示。
- 医嘱与处方管理：处方药品、规格、用法、频次、疗程和状态跟踪，支持打印预览入口。
- 病历权限与审签：内置医生、护士、管理员角色示例，演示 JWT 登录和审签归档状态。
- 归档病历处方留痕闭环：病历归档后处方锁定；医生调整必须发起修改申请并填写原因；管理员批准后仅解锁该病历一次；保存处方自动生成版本快照并写审计日志；未填原因、重复申请、无解锁保存均直接拒绝，且不影响其他病历。
- 病历检索与统计：提供患者、病历、处方数量和科室工作量统计接口。
- 系统管理与基础数据：数据库初始化审计日志表，提供审计日志查询入口，保留操作追踪能力。

### 归档病历处方留痕闭环说明

| 环节 | 规则 |
| --- | --- |
| 归档 | 医生/管理员审签归档后，该病历处方立即锁定（`medical_records.status = 已归档`） |
| 修改申请 | 仅已归档病历可发起，原因必填；同一病历同时只允许一个「待审批/已批准」申请（应用层 + 数据库部分唯一索引双重拦截重复申请） |
| 审批 | 仅管理员可批准/驳回；批准表示为该病历发放一次解锁名额 |
| 一次性解锁 | 医生保存一次处方后，申请自动变为「已使用」，病历重新锁定；再次调整需重新申请 |
| 版本快照 | 每次保存处方生成 `prescription_snapshots` 版本快照（JSONB 全量处方清单，关联申请） |
| 审计日志 | 归档、申请、批准、驳回、解锁消费、快照生成全部写入 `audit_logs`，可在「审计日志」页查询 |
| 隔离性 | 所有校验均以 `record_id` 为边界并在数据库事务内完成，只影响当前病历 |

闭环相关接口（均沿用现有 `/api` 风格，写操作携带 JWT）：

- `POST /api/records/:id/archive` 审签归档（医生/管理员）
- `GET  /api/records/:id` 病历详情（含处方、锁定状态、当前活跃申请）
- `POST /api/records/:id/modify-requests` 发起修改申请（原因必填，医生/管理员）
- `GET  /api/records/:id/modify-requests` 该病历申请留痕
- `GET  /api/modify-requests?status=` 申请列表（管理员）
- `POST /api/modify-requests/:id/approve` / `reject` 审批（管理员）
- `POST /api/records/:id/prescriptions` 保存处方（归档病历须有已批准申请，自动消费解锁并生成快照）
- `GET  /api/records/:id/prescriptions` / `versions` 处方清单与版本快照
- `GET  /api/audit-logs` 审计日志（登录用户可查）

## 本地开发方式

后端：

```bash
cd backend
npm install
npm run start:dev
```

前端：

```bash
cd frontend
npm install
npm run dev
```

本地开发时前端默认运行在 `18930`，Vite 会将 `/api` 代理到 `http://localhost:19930`。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Ant Design、React Router、WangEditor |
| 后端 | NestJS、TypeScript、JWT、pg |
| 数据库 | PostgreSQL 15 |
| 部署 | Docker Compose、Nginx |

## 项目目录结构

```text
.
├── backend/                  # NestJS 后端
│   ├── src/auth/             # 登录、JWT 守卫与角色守卫
│   ├── src/common/           # 常量、数据库事务、审计日志
│   ├── src/records/          # 患者档案、病历与归档 API
│   ├── src/prescriptions/    # 处方保存、锁定校验与版本快照
│   └── src/modify-requests/  # 归档病历处方修改申请与审批
├── database/
│   └── init.sql              # PostgreSQL 初始化脚本（含申请表/快照表）
├── frontend/                 # React 前端
│   ├── src/api/              # API 请求与会话
│   ├── src/components/       # 通用组件
│   ├── src/constants/        # 前端常量
│   ├── src/pages/            # 登录页、工作台与各功能页签
│   └── src/types/            # 类型定义
├── docker-compose.yml
├── .env.example
└── README.md
```

## 环境变量说明

| 变量 | 说明 | 默认示例 |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | Compose 项目名，避免中文目录影响容器名 | `gbemr` |
| `DB_NAME` | PostgreSQL 数据库名 | `gbemr` |
| `DB_USER` | PostgreSQL 用户名 | `gbemr_user` |
| `DB_PASSWORD` | PostgreSQL 密码 | `change_me_strong_password` |
| `JWT_SECRET` | JWT 签名密钥 | `change_me_to_a_long_random_secret` |
| `FRONTEND_PORT` | 前端宿主机端口 | `18930` |
| `BACKEND_PORT` | 后端宿主机端口 | `19930` |

## Docker 部署说明

- `docker-compose.yml` 顶层声明 `name: gbemr`，并通过 `.env` 设置 `COMPOSE_PROJECT_NAME=gbemr`，可在中文目录名下直接启动。
- 前端端口映射为 `${FRONTEND_PORT:-18930}:80`，后端端口映射为 `${BACKEND_PORT:-19930}:3000`。
- 前端 Nginx 将 `/api/` 反向代理到 Docker 内部服务 `http://backend:3000/`。
- PostgreSQL 使用命名卷 `db_data` 持久化，不绑定到宿主机中文路径。
- 数据库和后端均配置 healthcheck，后端等待数据库 healthy 后启动，前端等待后端 healthy 后启动。

常见问题：

- 如果端口被占用，修改 `.env` 中的 `FRONTEND_PORT` 或 `BACKEND_PORT` 后重新执行 `docker compose up -d`。
- 首次启动前必须执行 `cp .env.example .env`。
- 修改数据库初始化脚本后如需重新初始化，可执行 `docker compose down -v` 清理数据卷。

## License

MIT
