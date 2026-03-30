# Feishu ERP Bridge

飞书多维表到金蝶云星空的任务编排与执行工具。

当前 GitHub `main` 分支是纯主应用版本，不包含 OCR 子服务代码。本文档只描述这份代码里真实存在的功能与运行方式。

## 当前代码能做什么

- 多账户注册、登录与本地隔离存储。
- 配置飞书数据源：
  - `App ID`、`App Secret`
  - `App Token`、`Table ID`、可选 `View ID`
  - 字段变量映射
  - 字段类型处理
  - 筛选条件
  - 回写字段
- 配置金蝶目标：
  - `baseUrl`、`acctId`、`dbId`
  - `appId`、`appSecret`
  - `username`、`password`
  - `formId`
  - `apiMethod`
  - 可选 `opNumber`
  - `dataTemplate` JSON 模板
- 手动执行任务，并在执行中查看进度、成功数、失败数、停止状态。
- 生成任务触发 API，支持外部系统通过 HTTP 触发任务。
- 查看 WebAPI 请求预览，不发送到金蝶也能先检查最终请求体。
- 记录并查看单次执行的 WebAPI 日志。
- 导出和导入任务配置。

## 任务配置的真实边界

每个任务包含两部分配置：

### 1. 飞书配置

- 连接到飞书多维表。
- 读取字段并映射为变量。
- 支持常见字段处理类型，如文本、数字、日期、人员、电话、多选等。
- 支持筛选条件。
- 支持成功/失败/响应结果回写到飞书。

### 2. 金蝶配置

- 通过 JSON 模板组织要发送给金蝶的数据。
- 默认 API 方法是 `Save`。
- 支持在任务级别指定 `apiMethod`。
- 支持可选 `opNumber`。
- 当前逻辑是：
  - `opNumber` 有值就传。
  - `opNumber` 为空就不传。
  - 不再根据 API 方法做额外映射。

当前前端内置的常用 API 方法选项包括：

- `Save`
- `Delete`
- `View`
- `Draft`
- `Submit`
- `Audit`
- `UnAudit`
- `ExcuteOperation`
- `CancelAssign`
- `Allocate`
- `CancelAllocate`

同时也支持手动填写其它金蝶 API 方法。

## 当前界面包含哪些模块

- `任务管理`
  - 新建、编辑、复制、删除、启用/停用任务
  - 拖拽调整任务顺序
- `执行监控`
  - 查看执行记录
  - 查看实例状态与最新日志
  - 删除实例记录
- `WebAPI 调试`
  - 单独测试金蝶登录
  - 手动输入 `formId`、`apiMethod`、`opNumber` 和 JSON 数据进行请求测试
  - 查看请求预览与响应
- `任务触发 API`
  - 为任务生成独立触发地址
  - 启用/停用触发地址
  - 复制 URL 和 cURL 示例
  - 重新生成 token

## 当前内置验证能力

任务验证弹窗里实际有 5 个步骤：

1. 飞书登录测试
2. 飞书字段查询 / 筛选 / 回传测试
3. 金蝶登录测试
4. 查看传入数据（仅预览，不发送）
5. 第一条记录完整流程测试

其中第 4 步会显示真实请求预览，第 5 步会真的执行一次同步。

## 后端真实接口范围

### 认证与账户

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/account/profile`
- `PUT /api/account/profile`
- `POST /api/account/change-password`
- `DELETE /api/account`

### 任务数据

- `GET /api/data`
- `POST /api/data`
- `GET /api/export`
- `POST /api/import`
- `DELETE /api/tasks/:taskId`
- `DELETE /api/instances/:instanceId`

### 执行与预览

- `POST /api/tasks/:taskId/preview-request`
- `POST /api/tasks/:taskId/request-preview`
- `POST /api/tasks/:taskId/preview`
- `POST /api/tasks/:taskId/execute`
- `POST /api/tasks/:instanceId/stop`
- `GET /api/tasks/:instanceId/status`

### 日志

- `POST /api/logs/webapi`
- `GET /api/logs/:instanceId`
- `DELETE /api/logs/:instanceId`

### 外部触发

- `POST /api/public/task-trigger/:triggerToken`
- `GET /api/public/task-trigger/:triggerToken`

### 代理接口

- `app.all('/open-apis/*')`
  - 转发飞书开放平台请求
- `app.all('/K3Cloud/*')`
  - 转发金蝶请求

## 数据存储方式

当前代码使用本地 JSON 文件存储运行数据，目录在：

- `server/data/`

这里会存放：

- 账户数据
- 任务配置
- 执行实例
- WebAPI 日志

不同账户的数据按文件隔离保存。

## 运行方式

### 环境要求

- Node.js 18+
- npm 8+

### 首次安装

推荐直接执行：

```bash
npm run install:all
```

这会安装前端依赖和 `server/` 目录下的后端依赖。

### 本地开发

```bash
npm run dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`

### 仅启动后端

```bash
npm run server
```

### 构建前端

```bash
npm run build
```

### Cloudflare Tunnel 相关脚本

仓库里保留了两个启动脚本：

- `npm run start:tunnel`
- `npm run start:all`

这两个脚本当前依赖仓库中的 `cloudflared-windows-amd64.exe`，明显偏向 Windows 本机使用场景。

`npm run start:all` 的逻辑是：

- 启动后端
- 启动前端
- 启动 Cloudflare Tunnel

如果你不是在 Windows 环境运行，或没有这份可执行文件，需要自行调整。

## Docker 说明

仓库中仍然保留：

- `Dockerfile`
- `docker-compose.yml`

但当前主代码的统一启动方式仍围绕本地 Node + Windows Cloudflare Tunnel 脚本设计。  
如果直接用于 Docker / Linux 生产环境，建议先自行核对启动链路再使用，不建议仅凭旧文档直接上线。

## 主要目录

```text
src/
  components/           前端界面组件
  services/             前端服务封装
  stores/               Zustand 状态管理
  utils/                金蝶请求预览等工具

server/
  server.js             后端入口与 API
  taskExecutor.js       任务执行核心逻辑
  data/                 本地运行数据

scripts/
  start-all.js          本地统一启动脚本
  start-tunnel.js       Cloudflare Tunnel 启动脚本
```

## 当前版本特别说明

- 当前 GitHub `main` 不包含 OCR 页面与 OCR 服务代码。
- README 已按当前 `main` 的真实文件和真实接口重写。
- 如果你的本地工作区仍保留 OCR，那是另一套本地版本，不代表 GitHub 当前内容。
