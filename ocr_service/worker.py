from __future__ import annotations

import contextlib
import io
import json
import os
import sys

try:
    from .config import SETTINGS
    from .ocr_engine import InvoiceOcrEngine
except ImportError:  # 兼容直接运行
    from config import SETTINGS  # type: ignore
    from ocr_engine import InvoiceOcrEngine  # type: ignore


def main() -> int:
    if len(sys.argv) < 4:
        print("usage: python -m ocr_service.worker <file_path> <filename> <content_type>", file=sys.stderr)
        return 2

    os.environ["OCR_WORKER_PROCESS"] = "1"

    file_path = sys.argv[1]
    filename = sys.argv[2]
    content_type = sys.argv[3]

    try:
        with open(file_path, "rb") as source:
            content = source.read()

        engine = InvoiceOcrEngine(SETTINGS)
        silent_stdout = io.StringIO()
        silent_stderr = io.StringIO()
        with contextlib.redirect_stdout(silent_stdout), contextlib.redirect_stderr(silent_stderr):
            result = engine.extract_from_bytes(content, filename=filename, content_type=content_type)
        print(
            json.dumps(
                result.to_worker_payload(),
                ensure_ascii=True,
            )
        )
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc) or exc.__class__.__name__}, ensure_ascii=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
