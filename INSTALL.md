# 快速安装指南

## 方式一：一键部署脚本（推荐）

### Windows
```bash
.\deploy.bat
```

### macOS / Linux
```bash
chmod +x deploy.sh
./deploy.sh
```

## 方式二：Docker 部署

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

访问：http://localhost:5173

## 方式三：手动部署

```bash
# 1. 克隆仓库
git clone https://github.com/keyupan91-cpu/Feishu-erp-bridge.git
cd Feishu-erp-bridge

# 2. 安装依赖
npm install

# 3. 启动服务
npm run start:all
```

## 访问地址

- **本地访问**: http://localhost:5173
- **后端 API**: http://localhost:3001

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（前后端） |
| `npm run start:all` | 生产模式（含 Cloudflare Tunnel） |
| `npm run build` | 构建生产版本 |
| `docker-compose up -d` | Docker 方式启动 |

## 系统要求

- Node.js v18.0+
- npm v8.0+
- 浏览器：Chrome 90+ / Edge 90+ / Firefox 88+

## 遇到问题？

1. **Node.js 版本过低**: 请升级到 v18.0 或更高版本
2. **端口被占用**: 修改 `package.json` 中的端口配置
3. **依赖安装失败**: 尝试 `npm install --legacy-peer-deps`
