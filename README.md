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
- 病历权限与审签：内置医生、护士、管理员角色示例，JWT 登录与角色守卫，审签归档状态全程可查。
- **归档病历处方留痕闭环**：病历归档即锁定处方并生成版本基线；医生调整必须发起修改申请并填写原因（原因为空、重复申请直接拒绝）；管理员批准后仅解锁该病历一次，医生保存新处方自动生成 JSONB 版本快照、消耗解锁并写审计日志；审批、驳回、解锁消耗均留痕，且各病历互不影响。
- 病历检索与统计：提供患者、病历、处方数量和科室工作量统计接口。
- 系统管理与基础数据：初始化审计日志表，管理员可在“修改审批”页查看申请与全量审计日志。

### 归档病历处方修改流程

```text
医生归档病历 ──▶ 处方锁定 + 生成 v1 基线快照 + 审计日志
                     │
医生调整被拦截 ──▶ 发起修改申请（原因必填，重复申请拒绝）
                     │
管理员审批 ──┬─ 驳回：医生可补充原因后重新申请
             └─ 批准：仅解锁该病历一次（不影响其他病历）
                     │
医生保存新处方 ──▶ 生成新版本快照 + 关联申请号 + 审计日志 + 解锁立即消耗
                     │
再次保存（无新批准）──▶ 直接拒绝
```

演示账号（与登录页一致）：医生 `doctor / doctor123`、护士 `nurse / nurse123`、管理员 `admin / admin123`。
演示数据中 `EMR202606002（李明哲）` 自带一份已归档锁定病历、两条处方和 v1 基线快照，可直接走完整流程。

### 新增接口（均需 `Authorization: Bearer <token>`）

| 方法 | 路径 | 角色 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/records/:id/archive` | 医生/管理员 | 归档病历、锁定处方并生成基线快照 |
| GET | `/api/records/:id` | 登录用户 | 病历详情、处方、锁定与解锁状态 |
| POST | `/api/records/:id/prescriptions` | 医生 | 保存处方；归档病历须有“已批准未使用”的申请，成功后一次性消耗 |
| GET | `/api/records/:id/prescription-versions` | 登录用户 | 处方版本快照列表 |
| POST | `/api/modification-requests` | 医生 | 发起修改申请，body：`{ recordId, reason }` |
| GET | `/api/modification-requests?status=` | 登录用户 | 申请列表（医生仅本人，管理员全部） |
| POST | `/api/modification-requests/:id/approve` | 管理员 | 批准，该病历仅解锁一次 |
| POST | `/api/modification-requests/:id/reject` | 管理员 | 驳回，驳回后允许重新申请 |
| GET | `/api/audit-logs?limit=` | 管理员 | 全量审计日志 |

已部署环境升级表结构可执行幂等迁移：`database/migration_archive_lock.sql`（全新部署由 `init.sql` 自动完成）。

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
├── backend/              # NestJS 后端
│   ├── src/auth/         # 登录与 JWT
│   ├── src/common/       # 常量、数据库、审计日志、JWT 角色守卫
│   ├── src/modifications/# 处方修改申请审批与审计查询
│   └── src/records/      # 患者档案、病历、处方与版本快照 API
├── database/
│   ├── init.sql          # PostgreSQL 初始化脚本
│   └── migration_archive_lock.sql  # 老库增量迁移（幂等）
├── frontend/             # React 前端
│   ├── src/api/          # API 请求（自动携带 JWT）
│   ├── src/components/   # 通用组件（处方面板、路由守卫）
│   ├── src/constants/    # 前端常量
│   ├── src/pages/        # 登录、工作台、修改审批
│   └── src/types/        # 类型定义
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
