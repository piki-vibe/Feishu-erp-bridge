# Invoice OCR Service (Refactored)

这个目录是重构后的 OCR 独立服务，保留旧接口请求方式与参数不变：

- `POST /api/extract`
- `POST /api/extract-batch`

同时提供兼容别名（可选）：

- `POST /api/public/ocr/extract`
- `POST /api/public/ocr/extract-batch`

## 1) 启动方式

推荐直接在项目根目录使用轻量脚本启动，默认会限制线程、禁止模型常驻并避免重复实例：

```powershell
npm run ocr:start
```

停止 OCR：

```powershell
npm run ocr:stop
```

如果需要手动启动，也可以使用下面方式：

```powershell
# 在项目根目录执行
python -m venv .venv-ocr
.venv-ocr\Scripts\activate
pip install -r ocr_service\requirements.txt
python -m ocr_service.app
```

默认监听：`http://127.0.0.1:5000`

补充说明：

- OCR 服务默认支持 `PDF`、`JPG`、`JPEG`、`PNG`、`BMP`、`WEBP`
- 非上述格式会返回：`文件格式不对，仅支持 PDF 和图片`
- 主项目中的“发票 OCR”页面会在打开标签时按需加载，不影响主任务页面首屏表现
- 当前提取规则为严格模式：只有 OCR 文本里命中 `发票号码` 标签，才会提取其后的号码
- 若未命中 `发票号码` 标签，统一返回：`无发票号码`
- 返回体新增 `total` 字段，用于记录完整 OCR 文本、标签命中情况与匹配明细

## 2) 环境变量（可选）

- `OCR_HOST` 默认 `0.0.0.0`
- `OCR_PORT` 默认 `5000`
- `OCR_SERVER_THREADS` 默认 `4`（OCR 服务入口线程数，提升并发请求吞吐）
- `OCR_MAX_FILE_SIZE_MB` 默认 `20`
- `OCR_BATCH_MAX_FILES` 默认 `20`
- `OCR_REQUEST_TIMEOUT_SEC` 默认 `25`
- `OCR_MAX_PDF_PAGES` 默认 `5`
- `OCR_LANG` 默认 `ch`
- `OCR_USE_ANGLE_CLS` 默认 `true`
- `OCR_CPU_THREADS` 默认 `2`（限制 OCR 线程，降低卡顿）
- `OCR_KEEP_MODEL_LOADED` 默认 `false`（每次识别后释放模型，降低常驻内存）
- `OCR_PROCESS_ISOLATED` 默认 `true`（每次请求在子进程中识别，减少主服务常驻内存）
- 服务优先使用 `Waitress` 多线程启动；未安装时回退到 Flask 多线程模式

## 3) 兼容接口说明

### `POST /api/extract`

请求方式保持不变：

1. `multipart/form-data`，字段 `file`（或兼容 `files` 单个）
2. `application/json`，字段 `url`

返回示例（字段保持兼容）：

```json
{
  "invoice_number": "12345678901234567890",
  "processing_time": 1.23,
  "total": {
    "has_invoice_number_label": true,
    "matched_invoice_number": "12345678901234567890",
    "raw_text_lines": ["发票号码:12345678901234567890"]
  }
}
```

### `POST /api/extract-batch`

请求方式保持不变：

1. `multipart/form-data`，字段 `files`（多个文件）
2. `application/json`，字段 `urls`（数组）

返回示例（字段保持兼容）：

```json
{
  "results": [
    {
      "filename": "invoice.pdf",
      "invoice_number": "12345678901234567890",
      "total": {
        "has_invoice_number_label": true,
        "matched_invoice_number": "12345678901234567890"
      }
    }
  ],
  "processing_time": 2.34
}
```

## 4) 依赖兼容说明

重构后显式固定 `numpy==1.26.4`，避免 `numpy 2.x` 与 `imgaug` 的兼容冲突导致 PaddleOCR 启动失败。

同时固定 `opencv-python==4.6.0.66` 与 `PyMuPDF==1.20.2`，与 `paddleocr==2.7.0.3` 的 Linux / Docker 依赖约束保持一致，避免云端镜像构建冲突。

## 5) 2026-03-29 阿里云部署留痕

- 公网统一入口：`https://erp.keyupan.cn`
- 公开 OCR 接口：
  - `POST https://erp.keyupan.cn/api/extract`
  - `POST https://erp.keyupan.cn/api/extract-batch`
- OCR 管理接口保持不变，需要主系统登录后的 Bearer Token：
  - `GET /api/ocr/service/status`
  - `POST /api/ocr/service/start`
  - `POST /api/ocr/service/stop`

本次云端部署补充项：

- OCR 镜像切换到阿里云 Debian / PyPI 镜像源，解决阿里云 ECS 上依赖拉取过慢的问题
- Docker 运行时补充 `libgl1`，修复 `cv2` 导入时报 `libGL.so.1` 缺失的问题
- `worker.py` 屏蔽 Paddle 模型下载进度条与告警输出，避免子进程 JSON 返回被污染
- OCR 容器增加模型缓存挂载：
  - `/opt/feishu-erp-bridge/ocr_service/.cache/paddleocr:/root/.paddleocr`
  - `/opt/feishu-erp-bridge/ocr_service/.cache/paddlehub:/root/.paddlehub`
- 主容器通过 `OCR_BASE_URL=http://keyupan-erp-ocr:5000` 访问 OCR，并通过 Docker Socket 管理 OCR 启停

已完成的线上验证：

- 上传 `jpg` 样本，未命中“发票号码”标签时返回：`无发票号码`
- 上传 `pdf` 样本，严格从“发票号码”后提取：`26952000000276075601`
- 上传非图片/PDF 文件时返回：`文件格式不对，仅支持 PDF 和图片`
- `start/stop/status` 管理接口已在公网域名下验证通过，返回的 `baseUrl/extractUrl/batchUrl` 已统一为公网地址
