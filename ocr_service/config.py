from __future__ import annotations

import os
from dataclasses import dataclass


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    server_threads: int
    max_file_size_mb: int
    batch_max_files: int
    request_timeout_sec: int
    ocr_lang: str
    use_angle_cls: bool
    ocr_cpu_threads: int
    keep_model_loaded: bool
    process_isolated: bool
    max_pdf_pages: int


def load_settings() -> Settings:
    return Settings(
        host=os.getenv("OCR_HOST", "0.0.0.0"),
        port=_int_env("OCR_PORT", 5000),
        server_threads=max(1, _int_env("OCR_SERVER_THREADS", 4)),
        max_file_size_mb=_int_env("OCR_MAX_FILE_SIZE_MB", 20),
        batch_max_files=_int_env("OCR_BATCH_MAX_FILES", 20),
        request_timeout_sec=_int_env("OCR_REQUEST_TIMEOUT_SEC", 25),
        ocr_lang=os.getenv("OCR_LANG", "ch"),
        use_angle_cls=_bool_env("OCR_USE_ANGLE_CLS", True),
        ocr_cpu_threads=max(1, _int_env("OCR_CPU_THREADS", 2)),
        keep_model_loaded=_bool_env("OCR_KEEP_MODEL_LOADED", False),
        process_isolated=_bool_env("OCR_PROCESS_ISOLATED", True),
        max_pdf_pages=_int_env("OCR_MAX_PDF_PAGES", 5),
    )


SETTINGS = load_settings()
