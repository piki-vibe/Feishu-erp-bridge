from __future__ import annotations

import atexit
import logging
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse

import requests
from flask import Flask, jsonify, request

try:
    from flask_cors import CORS
except ImportError:
    def CORS(*_args, **_kwargs):  # type: ignore
        return None

try:
    from .config import SETTINGS
    from .ocr_engine import InvoiceOcrEngine, OcrProcessingError, UnsupportedFileTypeError
except ImportError:  # 兼容 python ocr_service/app.py
    from config import SETTINGS  # type: ignore
    from ocr_engine import InvoiceOcrEngine, OcrProcessingError, UnsupportedFileTypeError  # type: ignore

try:
    import fcntl  # type: ignore
except ImportError:
    fcntl = None  # type: ignore

try:
    import msvcrt  # type: ignore
except ImportError:
    msvcrt = None  # type: ignore


LOCK_DIR = Path(__file__).resolve().parent / ".runtime"
LOCK_FILE = LOCK_DIR / "ocr_service.lock"
_LOCK_HANDLE = None

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = SETTINGS.max_file_size_mb * 1024 * 1024
CORS(app)
logging.getLogger("werkzeug").setLevel(logging.ERROR)

os.environ.setdefault("OMP_NUM_THREADS", str(SETTINGS.ocr_cpu_threads))
os.environ.setdefault("MKL_NUM_THREADS", str(SETTINGS.ocr_cpu_threads))
os.environ.setdefault("OPENBLAS_NUM_THREADS", str(SETTINGS.ocr_cpu_threads))
os.environ.setdefault("NUMEXPR_NUM_THREADS", str(SETTINGS.ocr_cpu_threads))

engine = InvoiceOcrEngine(SETTINGS)
memory_logs: list[str] = []
max_logs = 1000


def _release_single_instance_lock() -> None:
    global _LOCK_HANDLE
    if _LOCK_HANDLE is None:
        return

    try:
        _LOCK_HANDLE.seek(0)
        if msvcrt is not None:
            msvcrt.locking(_LOCK_HANDLE.fileno(), msvcrt.LK_UNLCK, 1)
        elif fcntl is not None:
            fcntl.flock(_LOCK_HANDLE.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
    finally:
        _LOCK_HANDLE.close()
        _LOCK_HANDLE = None


def _acquire_single_instance_lock() -> None:
    global _LOCK_HANDLE

    if os.getenv("OCR_SINGLE_INSTANCE", "true").strip().lower() in {"0", "false", "no", "off"}:
        return

    LOCK_DIR.mkdir(parents=True, exist_ok=True)
    handle = LOCK_FILE.open("a+", encoding="utf-8")

    try:
        handle.seek(0)
        handle.write("0")
        handle.flush()
        handle.seek(0)

        if msvcrt is not None:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        elif fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

        handle.seek(0)
        handle.truncate()
        handle.write(str(os.getpid()))
        handle.flush()

        _LOCK_HANDLE = handle
        atexit.register(_release_single_instance_lock)
    except OSError as exc:
        handle.close()
        raise RuntimeError(
            f"OCR service is already running. Lock file: {LOCK_FILE}"
        ) from exc


def log_message(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {message}"
    memory_logs.append(line)
    if len(memory_logs) > max_logs:
        del memory_logs[: len(memory_logs) - max_logs]
    print(line)


@app.get("/")
def index():
    return jsonify(
        {
            "name": "invoice-ocr-service",
            "version": "2.0",
            "compatible_api": ["/api/extract", "/api/extract-batch"],
            "health": "/health",
        }
    )


@app.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "engine_ready": engine.ready,
            "server_threads": SETTINGS.server_threads,
            "max_file_size_mb": SETTINGS.max_file_size_mb,
            "batch_max_files": SETTINGS.batch_max_files,
            "ocr_cpu_threads": SETTINGS.ocr_cpu_threads,
            "keep_model_loaded": SETTINGS.keep_model_loaded,
            "process_isolated": SETTINGS.process_isolated,
        }
    )


@app.get("/api/logs")
def get_logs():
    return jsonify({"logs": memory_logs})


@app.post("/api/extract")
@app.post("/api/public/ocr/extract")
def extract_invoice():
    started = time.perf_counter()
    try:
        payload = _read_single_payload()
        result = engine.extract_from_bytes(
            payload["content"],
            filename=payload["filename"],
            content_type=payload["content_type"],
        )
        processing_time = round(time.perf_counter() - started, 2)
        log_message(
            f"extract success file={payload['filename']} invoice_number={result.invoice_number} in {processing_time}s"
        )

        return jsonify(
            {
                "invoice_number": result.invoice_number,
                "processing_time": processing_time,
                "total": result.total,
            }
        )
    except Exception as exc:
        processing_time = round(time.perf_counter() - started, 2)
        message = _map_error(exc)
        log_message(f"extract failed: {message} in {processing_time}s")
        return jsonify({"error": message}), _status_code(exc)


@app.post("/api/extract-batch")
@app.post("/api/public/ocr/extract-batch")
def extract_invoice_batch():
    started = time.perf_counter()
    results: list[dict] = []
    try:
        payloads = _read_batch_payloads()
        if len(payloads) > SETTINGS.batch_max_files:
            return jsonify({"error": f"单次最多处理 {SETTINGS.batch_max_files} 个文件"}), 400

        for payload in payloads:
            try:
                result = engine.extract_from_bytes(
                    payload["content"],
                    filename=payload["filename"],
                    content_type=payload["content_type"],
                )
                item = {
                    **({"url": payload["url"]} if payload.get("url") else {"filename": payload["filename"]}),
                    "invoice_number": result.invoice_number,
                    "total": result.total,
                }
                results.append(item)
            except Exception as per_file_exc:
                item = {"error": _map_error(per_file_exc)}
                if payload.get("url"):
                    item["url"] = payload["url"]
                else:
                    item["filename"] = payload["filename"]
                results.append(item)

        processing_time = round(time.perf_counter() - started, 2)
        log_message(f"batch success count={len(results)} in {processing_time}s")
        return jsonify(
            {
                "results": results,
                "processing_time": processing_time,
            }
        )
    except Exception as exc:
        processing_time = round(time.perf_counter() - started, 2)
        message = _map_error(exc)
        log_message(f"batch failed: {message} in {processing_time}s")
        return jsonify({"error": message}), _status_code(exc)


def _read_single_payload() -> dict:
    # 兼容旧参数：file 或 files(单个)
    upload = request.files.get("file")
    if upload is None and "files" in request.files:
        files = request.files.getlist("files")
        upload = files[0] if files else None

    if upload is not None and upload.filename:
        content = upload.read()
        _check_file_size(content)
        return {
            "filename": upload.filename,
            "content": content,
            "content_type": upload.mimetype or "application/octet-stream",
        }

    data = request.get_json(silent=True) if request.is_json else None
    if not data and request.form:
        data = request.form.to_dict()

    if isinstance(data, dict):
        url = str(data.get("url", "")).strip()
        if url:
            return _download_from_url(url)

    raise ValueError("No file or url provided")


def _read_batch_payloads() -> list[dict]:
    payloads: list[dict] = []
    if "files" in request.files:
        for upload in request.files.getlist("files"):
            if not upload or not upload.filename:
                continue
            content = upload.read()
            _check_file_size(content)
            payloads.append(
                {
                    "filename": upload.filename,
                    "content": content,
                    "content_type": upload.mimetype or "application/octet-stream",
                }
            )

    data = request.get_json(silent=True) if request.is_json else None
    if isinstance(data, dict) and isinstance(data.get("urls"), list):
        for raw_url in data["urls"]:
            url = str(raw_url).strip()
            if not url:
                continue
            payload = _download_from_url(url)
            payload["url"] = url
            payloads.append(payload)

    if not payloads:
        raise ValueError("No files or urls provided")
    return payloads


def _download_from_url(url: str) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("URL must start with http:// or https://")

    response = requests.get(url, timeout=SETTINGS.request_timeout_sec)
    response.raise_for_status()

    content = response.content or b""
    _check_file_size(content)

    content_type = (response.headers.get("Content-Type") or "application/octet-stream").split(";")[0]
    filename = _detect_filename_from_url(url, content_type)
    return {
        "filename": filename,
        "content": content,
        "content_type": content_type,
    }


def _detect_filename_from_url(url: str, content_type: str) -> str:
    path_name = os.path.basename(urlparse(url).path or "").strip()
    if path_name:
        return path_name
    if "pdf" in content_type:
        return "remote_file.pdf"
    if content_type.startswith("image/"):
        ext = content_type.split("/")[-1] or "jpg"
        return f"remote_file.{ext}"
    return "remote_file.bin"


def _check_file_size(content: bytes) -> None:
    max_size = SETTINGS.max_file_size_mb * 1024 * 1024
    if len(content) > max_size:
        raise ValueError(f"file too large (max {SETTINGS.max_file_size_mb} MB)")


def _map_error(exc: Exception) -> str:
    if isinstance(exc, UnsupportedFileTypeError):
        return str(exc)
    if isinstance(exc, OcrProcessingError):
        return str(exc)
    if isinstance(exc, requests.Timeout):
        return "download timeout"
    if isinstance(exc, requests.RequestException):
        return f"download failed: {exc}"
    if isinstance(exc, ValueError):
        return str(exc)
    return f"internal error: {exc}"


def _status_code(exc: Exception) -> int:
    if isinstance(exc, (UnsupportedFileTypeError, ValueError)):
        return 400
    if isinstance(exc, requests.RequestException):
        return 502
    if isinstance(exc, OcrProcessingError):
        return 500
    return 500


def _run_http_server() -> None:
    try:
        from waitress import serve
    except ImportError:
        log_message(
            f"Starting OCR service with Flask threaded server (threads={SETTINGS.server_threads})..."
        )
        app.run(host=SETTINGS.host, port=SETTINGS.port, debug=False, threaded=True)
        return

    log_message(f"Starting OCR service with Waitress (threads={SETTINGS.server_threads})...")
    serve(
        app,
        host=SETTINGS.host,
        port=SETTINGS.port,
        threads=SETTINGS.server_threads,
        _quiet=True,
    )


if __name__ == "__main__":
    try:
        _acquire_single_instance_lock()
    except RuntimeError as exc:
        print(str(exc))
        sys.exit(1)

    _run_http_server()
