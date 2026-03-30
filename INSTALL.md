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
| `npm run dev:lite` | 轻量开发模式（适合本机联调 OCR） |
| `npm run start:all` | 生产模式（含 Cloudflare Tunnel） |
| `npm run ocr:start` | 单独启动 OCR 子服务 |
| `npm run ocr:stop` | 单独关闭 OCR 子服务 |
| `npm run build` | 构建生产版本 |
| `docker-compose up -d` | Docker 方式启动 |

## 发票 OCR 子服务（2026-03-28 留痕）

### 支持格式

- `PDF`
- `JPG` / `JPEG`
- `PNG`
- `BMP`
- `WEBP`

非上述格式会返回：`文件格式不对，仅支持 PDF 和图片`

### 启动建议

1. 先启动主服务：`npm run dev` 或 `npm run dev:lite`
2. 在需要 OCR 时再执行：`npm run ocr:start`
3. 使用完成后执行：`npm run ocr:stop`
4. 发票 OCR 页面已改为独立布局并按需加载，平时不打开该标签页时不会额外增加前端首屏负担
5. 开发环境代理日志默认已静默；如需排查代理链路，可临时设置 `VITE_PROXY_DEBUG=true`
6. 低功耗模式下 `/health` 返回里的 `engine_ready` 可能为 `false`，这表示模型未常驻内存；首次识别时会按需加载，不影响正常调用
7. 识别结果面板可展开查看接口返回的 `total`，便于核对 OCR 全量文本与严格匹配过程
8. OCR 服务入口默认启用 `4` 个线程处理并发请求，识别阶段仍走隔离子进程，兼顾吞吐与低常驻内存

### 接口说明

- OCR 服务管理接口需要先登录主系统后由前端工作台调用
- 公开提取接口仍保持原参数不变：
  - `POST /api/extract`
  - `POST /api/extract-batch`
- 识别规则已收紧为：只在 OCR 文本中命中 `发票号码` 标签时，才提取其后的号码
- 若未命中 `发票号码` 标签，则返回 `无发票号码`
- 返回体新增 `total` 字段，用于记录完整 OCR 文本与匹配明细
- 主后端对账户文件与实例记录文件均已启用串行安全写，降低并发登录/资料更新时的文件损坏风险

## 系统要求

- Node.js v18.0+
- npm v8.0+
- 浏览器：Chrome 90+ / Edge 90+ / Firefox 88+

## 遇到问题？

1. **Node.js 版本过低**: 请升级到 v18.0 或更高版本
2. **端口被占用**: 修改 `package.json` 中的端口配置
3. **依赖安装失败**: 尝试 `npm install --legacy-peer-deps`
