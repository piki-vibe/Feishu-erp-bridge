#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_ROOT/ocr_service/.runtime/ocr_service.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No running OCR service found"
  exit 0
fi

OCR_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "$OCR_PID" ]; then
  rm -f "$PID_FILE"
  echo "No running OCR service found"
  exit 0
fi

if kill -0 "$OCR_PID" >/dev/null 2>&1; then
  kill "$OCR_PID"
  sleep 1
  if kill -0 "$OCR_PID" >/dev/null 2>&1; then
    kill -9 "$OCR_PID" >/dev/null 2>&1 || true
  fi
  echo "OCR service stopped"
else
  echo "No running OCR service found"
fi

rm -f "$PID_FILE"