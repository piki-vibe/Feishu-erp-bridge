from __future__ import annotations

import json
import os
import threading
import gc
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from typing import Any

try:
    from .config import Settings
    from .invoice_extractor import NO_INVOICE_NUMBER, extract_invoice_number
except ImportError:  # 兼容直接运行
    from config import Settings  # type: ignore
    from invoice_extractor import NO_INVOICE_NUMBER, extract_invoice_number  # type: ignore


class UnsupportedFileTypeError(Exception):
    pass


class OcrProcessingError(Exception):
    pass


@dataclass
class OcrResult:
    invoice_number: str
    text_lines: list[str]
    confidence: float
    total: dict[str, Any]

    def to_worker_payload(self) -> dict[str, Any]:
        return {
            "invoice_number": self.invoice_number,
            "text_lines": self.text_lines,
            "confidence": self.confidence,
            "total": self.total,
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "OcrResult":
        return cls(
            invoice_number=str(payload.get("invoice_number") or ""),
            text_lines=[str(item) for item in payload.get("text_lines") or []],
            confidence=float(payload.get("confidence") or 0.0),
            total=dict(payload.get("total") or {}),
        )


class InvoiceOcrEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._ocr_model = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._ocr_model is not None

    def extract_from_bytes(
        self,
        file_content: bytes,
        filename: str,
        content_type: str = "",
    ) -> OcrResult:
        if self.settings.process_isolated and os.getenv("OCR_WORKER_PROCESS") != "1":
            return self._extract_in_subprocess(file_content, filename, content_type)

        return self._extract_in_process(file_content, filename, content_type)

    def _extract_in_subprocess(
        self,
        file_content: bytes,
        filename: str,
        content_type: str,
    ) -> OcrResult:
        suffix = os.path.splitext(filename or "")[1] or ".bin"
        handle, temp_path = tempfile.mkstemp(prefix="invoice-ocr-", suffix=suffix)
        os.close(handle)

        try:
            with open(temp_path, "wb") as output:
                output.write(file_content)

            env = os.environ.copy()
            env["OCR_WORKER_PROCESS"] = "1"
            env.setdefault("PYTHONIOENCODING", "utf-8")

            creationflags = 0
            creationflags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
            creationflags |= getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0)

            completed = subprocess.run(
                [sys.executable, "-m", "ocr_service.worker", temp_path, filename or "", content_type or ""],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                timeout=max(90, self.settings.request_timeout_sec * 4),
                creationflags=creationflags,
            )
            stdout = (completed.stdout or "").strip()
            stderr = (completed.stderr or "").strip()

            if completed.returncode != 0:
                error_text = stderr or stdout or "OCR worker failed"
                try:
                    payload = json.loads(stdout or stderr)
                    error_text = str(payload.get("error") or error_text)
                except Exception:
                    error_text = error_text
                raise OcrProcessingError(error_text)

            return OcrResult.from_payload(json.loads(stdout))
        except subprocess.TimeoutExpired as exc:
            raise OcrProcessingError("OCR worker timeout") from exc
        except json.JSONDecodeError as exc:
            raise OcrProcessingError(f"OCR worker returned invalid JSON: {exc}") from exc
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _extract_in_process(
        self,
        file_content: bytes,
        filename: str,
        content_type: str = "",
    ) -> OcrResult:
        kind = _detect_kind(filename, content_type)
        if kind == "pdf":
            text_lines, confidences = self._extract_text_from_pdf(file_content)
        elif kind == "image":
            text_lines, confidences = self._extract_text_from_image(file_content)
        else:
            raise UnsupportedFileTypeError("文件格式不对，仅支持 PDF 和图片")

        extracted = extract_invoice_number(text_lines)
        confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
        total = {
            **extracted,
            "confidence": confidence,
        }
        result = OcrResult(
            invoice_number=extracted["invoice_number"] or NO_INVOICE_NUMBER,
            text_lines=text_lines,
            confidence=confidence,
            total=total,
        )
        if not self.settings.keep_model_loaded:
            self.release_model()
        return result

    def _ensure_model(self):
        if self._ocr_model is not None:
            return self._ocr_model

        with self._lock:
            if self._ocr_model is None:
                try:
                    from paddleocr import PaddleOCR
                except Exception as exc:
                    raise OcrProcessingError(
                        "PaddleOCR 初始化失败，请检查依赖版本（建议 numpy<2.0）。"
                    ) from exc

                kwargs = {
                    "use_angle_cls": self.settings.use_angle_cls,
                    "lang": self.settings.ocr_lang,
                    "show_log": False,
                    "cpu_threads": self.settings.ocr_cpu_threads,
                    "enable_mkldnn": False,
                }
                try:
                    self._ocr_model = PaddleOCR(**kwargs)
                except TypeError:
                    # 兼容老版本参数签名
                    kwargs.pop("cpu_threads", None)
                    kwargs.pop("enable_mkldnn", None)
                    self._ocr_model = PaddleOCR(**kwargs)
        return self._ocr_model

    def release_model(self) -> None:
        with self._lock:
            if self._ocr_model is not None:
                self._ocr_model = None
                gc.collect()

    def _extract_text_from_image(self, content: bytes) -> tuple[list[str], list[float]]:
        image = _decode_image(content)
        lines, scores = self._run_ocr(image)
        return lines, scores

    def _extract_text_from_pdf(self, content: bytes) -> tuple[list[str], list[float]]:
        try:
            import fitz
        except Exception as exc:
            raise OcrProcessingError("PyMuPDF 未安装或不可用。") from exc

        all_lines: list[str] = []
        all_scores: list[float] = []
        try:
            with fitz.open(stream=content, filetype="pdf") as doc:
                page_limit = min(len(doc), self.settings.max_pdf_pages)
                for page_idx in range(page_limit):
                    page = doc.load_page(page_idx)
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = _decode_image(pix.tobytes("png"))
                    lines, scores = self._run_ocr(image)
                    all_lines.extend(lines)
                    all_scores.extend(scores)
        except Exception as exc:
            raise OcrProcessingError(f"PDF 解析失败: {exc}") from exc

        return all_lines, all_scores

    def _run_ocr(self, image) -> tuple[list[str], list[float]]:
        model = self._ensure_model()
        try:
            result = model.ocr(image, cls=self.settings.use_angle_cls)
        except Exception as exc:
            raise OcrProcessingError(f"OCR 识别失败: {exc}") from exc

        text_lines: list[str] = []
        confidences: list[float] = []
        for block in result or []:
            if not block:
                continue
            for item in block:
                if not item or len(item) < 2:
                    continue
                value = str(item[1][0]).strip().replace(" ", "")
                score = float(item[1][1]) if len(item[1]) > 1 else 0.0
                if value:
                    text_lines.append(value)
                    confidences.append(score)
        return text_lines, confidences


def _detect_kind(filename: str, content_type: str) -> str:
    ext = os.path.splitext((filename or "").lower())[1]
    content_type = (content_type or "").lower()

    if ext == ".pdf" or "application/pdf" in content_type:
        return "pdf"

    image_ext = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    if ext in image_ext or content_type.startswith("image/"):
        return "image"

    raise UnsupportedFileTypeError("文件格式不对，仅支持 PDF 和图片")


def _decode_image(content: bytes):
    try:
        import cv2
        import numpy as np
    except Exception as exc:
        raise OcrProcessingError("OpenCV 或 numpy 不可用。") from exc

    array = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise OcrProcessingError("无法读取图片内容")
    return image
