# 金蝶数据传输平台

**版本**: v1.0.0 | **更新日期**: 2026-03-06

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-compose-%3E%3D2.0-blue.svg)](https://docs.docker.com/compose/)

---

## 产品简介

金蝶数据传输平台是一款企业级数据同步工具，用于实现**飞书多维表**与**金蝶云星空**系统之间的双向数据流转。通过可视化配置，无需编写代码即可完成复杂的数据同步任务。

### 核心功能

| 功能 | 说明 |
|------|------|
| 飞书集成 | 读取飞书多维表数据，支持数据回写 |
| 金蝶集成 | 金蝶云星空 API 对接，Session 复用 |
| 任务管理 | 多任务配置、启用/禁用、复制、删除 |
| 执行监控 | 实时执行进度、成功/失败统计 |
| 日志追溯 | 详细的任务日志和 WebAPI 调用日志 |
| 多账户 | 多账户数据独立存储，安全隔离 |
| 公网访问 | Cloudflare Tunnel 公网暴露，支持移动端访问 |

### 应用界面

#### PC 端界面

![应用界面截图](docs/screenshots/app-preview.png)
> 主界面展示任务列表和执行状态

#### 移动端界面

![移动端界面](docs/screenshots/app-mobile.png)
> 手机端适配，随时随地查看任务状态

### 适用场景

- 财务单据同步：付款单、收款单、费用报销单等
- 供应链单据：采购订单、销售订单、入库单等
- 基础资料同步：物料、客户、供应商等

---

## 技术架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  外网用户    │────▶│ Cloudflare   │────▶│  Vite 前端   │
│  (手机/电脑) │     │  Tunnel      │     │  (5173)     │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                                │ 代理 /api
                                                ▼
                                         ┌─────────────┐
                                         │  Node 后端   │
                                         │  (3001)     │
                                         └─────────────┘
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        ▼                       ▼                       ▼
                ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
                │  飞书多维表    │        │  金蝶云星空   │        │  本地文件存储 │
                └──────────────┘        └──────────────┘        └──────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Ant Design 6 + Vite |
| 后端 | Node.js + Express + JWT + bcrypt |
| 数据存储 | 本地 JSON 文件（按账户隔离） |
| 公网访问 | Cloudflare Tunnel |

---

## 快速开始

### 部署方式对比

| 方式 | 适用场景 | 难度 |
|------|---------|------|
| 一键部署脚本 | 本地开发/测试 | ⭐ |
| Docker 部署 | 生产环境 | ⭐⭐ |
| 手动部署 | 自定义配置 | ⭐⭐⭐ |

---

### 方式一：一键部署脚本（推荐新手）

**Windows 用户**：

1. 双击运行 `deploy.bat`

![Windows 部署截图](docs/screenshots/deploy-windows.png)

2. 等待依赖安装完成

3. 启动服务：
```bash
npm run start:all
```

**macOS / Linux 用户**：

```bash
# 1. 赋予执行权限
chmod +x deploy.sh

# 2. 运行部署脚本
./deploy.sh

# 3. 启动服务
npm run start:all
```

---

### 方式二：Docker 部署（生产环境推荐）

#### 前置要求

- Docker Desktop 已安装并运行
- Docker Compose v2.0+

#### 部署步骤

**步骤 1：克隆仓库**

```bash
git clone https://github.com/keyupan91-cpu/Feishu-erp-bridge.git
cd Feishu-erp-bridge
```

![Git 克隆截图](docs/screenshots/git-clone.png)

**步骤 2：构建并启动容器**

```bash
docker-compose up -d --build
```

![Docker 构建截图](docs/screenshots/docker-build.png)

**步骤 3：查看运行状态**

```bash
# 查看容器状态
docker-compose ps

# 查看实时日志
docker-compose logs -f
```

![Docker 日志截图](docs/screenshots/docker-logs.png)

**步骤 4：访问应用**

打开浏览器访问：`http://localhost:5173`

![应用访问截图](docs/screenshots/app-access.png)

**步骤 5：停止服务**

```bash
docker-compose down
```

#### 数据持久化

Docker Compose 已配置数据卷，以下数据会持久化保存到本地：

| 数据卷 | 容器内路径 | 说明 |
|--------|-----------|------|
| `./server/data` | `/app/server/data` | 账户和任务配置数据 |
| `./logs` | `/app/logs` | 运行日志文件 |

---

### 方式三：手动部署

#### 步骤 1：环境准备

确保已安装以下软件：

| 软件 | 版本要求 | 下载地址 |
|------|---------|---------|
| Node.js | v18.0+ | https://nodejs.org/ |
| Git | 任意版本 | https://git-scm.com/ |

验证环境：

```bash
node -v  # 应显示版本号，如 v20.11.0
npm -v   # 应显示版本号，如 10.2.4
```

![环境验证截图](docs/screenshots/env-check.png)

#### 步骤 2：克隆项目

```bash
git clone https://github.com/keyupan91-cpu/Feishu-erp-bridge.git
cd Feishu-erp-bridge
```

#### 步骤 3：安装依赖

```bash
npm install
```

#### 步骤 4：启动服务

```bash
# 开发模式（推荐）
npm run dev

# 生产模式（包含 Cloudflare Tunnel）
npm run start:all
```

#### 步骤 5：访问应用

启动成功后，在终端查看访问地址：

```
╔══════════════════════════════════════════════════════════╗
║          金蝶数据传输平台 - 服务启动成功                  ║
╠══════════════════════════════════════════════════════════╣
║  本地访问：                                               ║
║    前端：http://localhost:5173                           ║
║    后端：http://localhost:3001                           ║
║  公网访问：https://xxx.trycloudflare.com                 ║
╚══════════════════════════════════════════════════════════╝
```

---

### 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10/11、macOS、Linux |
| Node.js | v18.0 或更高版本 |
| 内存 | 至少 512MB 可用内存 |
| 磁盘 | 至少 100MB 可用空间 |
| 浏览器 | Chrome 90+、Edge 90+、Firefox 88+ |
| 网络 | 需能访问飞书 API 和金蝶云星空服务器 |

---

## 配置指南

### 1. 注册账户

1. 访问应用页面 `http://localhost:5173`
2. 切换到「注册」标签
3. 输入用户名（至少 6 位）和密码
4. 完成注册

![登录页面](docs/screenshots/login-page.png)
> 用户登录/注册页面

### 2. 配置飞书参数

#### 2.1 创建飞书应用

1. 登录 [飞书开放平台](https://open.feishu.cn/)
2. 点击「企业自建应用」→「创建应用」

![创建飞书应用截图](docs/screenshots/feishu-create-app.png)

#### 2.2 获取凭证

1. 进入应用详情页
2. 获取 App ID 和 App Secret

#### 2.3 配置飞书应用

在应用配置页面输入飞书参数：

![飞书配置页面](docs/screenshots/feishu-config.png)
> 飞书应用配置页面

#### 2.3 配置权限

在「权限管理」页面添加以下权限：

| 权限 | 说明 |
|------|------|
| 多维表读取 | 读取表格数据 |
| 多维表写入 | 回写同步状态 |

#### 2.4 获取多维表信息

从多维表 URL 中获取：

```
https://xxx.feishu.cn/base/bascnXXXXXXXXXXXXX?table=tblXXXXXXXXXXXXX
                                    └─ App Token          └─ Table ID
```

![多维表信息截图](docs/screenshots/feishu-table-info.png)

### 3. 配置金蝶参数

#### 3.1 准备金蝶云星空信息

| 参数 | 说明 | 示例 |
|------|------|------|
| 服务器地址 | 金蝶云星空 API 地址 | `http://xxx.xxx.com:8000` |
| 用户名 | 登录用户名 | `admin` |
| 密码 | 登录密码 | `******` |
| 账套 ID | 组织机构编号 | `100001` |

#### 3.2 测试连接

在应用配置页面输入金蝶参数后，点击「测试连接」按钮确认配置正确。

![金蝶配置截图](docs/screenshots/kingdee-config.png)

### 4. 创建同步任务

1. 点击「新建任务」按钮
2. 填写任务名称和描述
3. 配置飞书字段映射
4. 配置金蝶数据模板
5. 保存并执行

![创建任务截图](docs/screenshots/create-task.png)

#### 数据模板配置示例

使用 `{{变量名}}` 格式引用飞书字段：

```json
{
  "Model": {
    "FDATE": "{{date}}",
    "FREMARK": "{{remark}}",
    "FPAYORGID": { "FNumber": "{{companyCode}}" }
  }
}
```

---

## 目录结构

```
金蝶数据传输平台/
├── src/                        # 前端源码
│   ├── components/             # React 组件
│   ├── services/               # API 服务
│   ├── stores/                 # 状态管理
│   ├── hooks/                  # 自定义 Hook
│   ├── types/                  # TypeScript 类型
│   └── App.tsx                 # 主应用组件
├── server/                     # 后端源码
│   ├── server.js               # Express 服务器
│   ├── services/               # 业务服务
│   └── data/                   # 数据存储目录
├── scripts/                    # 工具脚本
│   ├── start-all.js            # 统一启动脚本
│   └── start-tunnel.js         # Tunnel 启动脚本
├── cloudflared-windows-amd64.exe  # Cloudflare Tunnel
├── package.json                # 项目配置
└── README.md                   # 本文档
```

---

## 核心功能说明

### 任务执行流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  从飞书读取  │───▶│  数据格式化  │───▶│  发送到金蝶  │───▶│  状态回写   │
│  多维表数据  │    │  变量替换   │    │  API 调用    │    │  到飞书     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 数据模板配置

在任务配置中，使用 `{{变量名}}` 格式引用飞书字段：

```json
{
  "Model": {
    "FDATE": "{{date}}",
    "FREMARK": "{{remark}}",
    "FPAYORGID": { "FNumber": "{{companyCode}}" }
  }
}
```

### 回写配置

配置同步状态回写到飞书：

| 飞书字段 | 数据来源 | 说明 |
|---------|---------|------|
| 同步状态 | 成功消息 | 显示「同步成功」或「同步失败」 |
| 错误信息 | 错误消息 | 显示具体错误原因 |
| 响应 JSON | 完整响应 | 记录完整 API 响应 |

---

## 公网访问配置

### Cloudflare Tunnel 配置

Cloudflare Tunnel 可以将本地服务安全地暴露到公网，无需公网 IP 和端口映射。

#### 步骤 1：下载 cloudflared

**Windows 用户**：

```powershell
# 使用 PowerShell 下载
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "cloudflared-windows-amd64.exe"
```

**macOS 用户**：

```bash
brew install cloudflared
```

**Linux 用户**：

```bash
# AMD64
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
chmod +x cloudflared

# ARM64
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -O cloudflared
chmod +x cloudflared
```

#### 步骤 2：启动 Tunnel

```bash
# 方式一：使用项目脚本启动（推荐）
npm run start:all

# 方式二：直接启动 cloudflared
./cloudflared-windows-amd64.exe tunnel --url http://localhost:5173
```

#### 步骤 3：获取公网 URL

启动成功后，在终端会显示公网 URL：

```
+--------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some  |
|  time to be reachable):                                            |
|  https://example-quick-tunnel.trycloudflare.com                    |
+--------------------------------------------------------------------+
```

![Cloudflare Tunnel 截图](docs/screenshots/cloudflare-tunnel.png)

#### 注意事项

1. **临时 Tunnel**：使用 `--url` 方式创建的 Tunnel 是临时的，关闭后 URL 失效
2. **持久 Tunnel**：需要注册 Cloudflare 账号并配置 DNS，参考 [Cloudflare 官方文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-non-http/)
3. **安全建议**：生产环境建议使用持久 Tunnel 并配置访问控制

---

## 数据管理

### 数据存储位置

```
server/data/
├── {username}.json           # 账户主数据（任务配置）
└── {username}_instances/     # 执行记录目录
    ├── 任务名_时间戳.json     # 执行记录文件
    └── ...
```

### 数据导入导出

```bash
# 通过应用界面操作
- 导出数据：下载所有任务配置为 JSON 文件
- 导入数据：上传 JSON 文件，追加到现有任务列表
```

---

## API 端点

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册账户 |
| POST | `/api/auth/login` | 登录 |

### 数据接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/data` | 获取账户数据 |
| POST | `/api/data` | 保存账户数据 |
| DELETE | `/api/instances/:id` | 删除执行记录 |
| DELETE | `/api/tasks/:id` | 删除任务 |

### 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/accounts` | 获取账户列表 |
| POST | `/api/admin/accounts` | 创建账户 |
| PUT | `/api/admin/accounts/:id` | 更新账户 |
| DELETE | `/api/admin/accounts/:id` | 删除账户 |

### 代理接口

| 路径 | 说明 |
|------|------|
| `/open-apis/*` | 代理飞书 API |
| `/K3Cloud/*` | 代理金蝶 API |

---

## 常见问题

### Cloudflare Tunnel 启动失败

1. 检查 `cloudflared-windows-amd64.exe` 是否存在
2. 检查端口 5173 是否被占用
3. 检查网络连接是否正常

### 飞书连接失败

- 错误码 99991014: 应用权限不足
- 错误码 99991020: 多维表不存在
- 检查 App ID 和 App Secret 是否正确

### 金蝶连接失败

- 检查服务器地址格式（包含端口）
- 确认用户名、密码、账套 ID 正确
- 使用 WebAPI 调试工具测试登录

### 数据同步失败

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 往来单位不存在 | 金蝶中无该单位 | 在金蝶中先创建往来单位 |
| 单据类型错误 | 单据类型编号不正确 | 检查数据模板配置 |
| 字段格式不匹配 | 数据类型不符 | 检查字段参数配置 |

---

## 安全说明

1. **密码加密**: 使用 bcrypt 加密存储
2. **JWT 认证**: Token 有效期 7 天
3. **数据隔离**: 每个账户的数据独立存储
4. **公网安全**: 后端不直接暴露公网，仅前端通过 Tunnel 暴露

---

## 响应式设计

| 屏幕宽度 | 适配策略 |
|---------|---------|
| > 768px | 桌面端布局 |
| 577px - 768px | 平板布局 |
| ≤ 576px | 手机端布局 |
| ≤ 375px | 超小屏幕优化 |

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 相关链接

- [GitHub 仓库](https://github.com/keyupan91-cpu/Feishu-erp-bridge)
- [飞书开放平台](https://open.feishu.cn/)
- [金蝶云星空开发文档](https://developer.kingdee.com/)
- [Cloudflare 官方文档](https://developers.cloudflare.com/cloudflare-one/)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=keyupan91-cpu/Feishu-erp-bridge&type=Date)](https://star-history.com/#keyupan91-cpu/Feishu-erp-bridge&Date)

---

## 技术支持

如有问题，请联系技术支持团队或查看相关文档。
