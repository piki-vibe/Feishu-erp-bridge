#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${OCR_PORT:-5000}"
PYTHON_BIN="${OCR_PYTHON_BIN:-python3}"
RUNTIME_DIR="$PROJECT_ROOT/ocr_service/.runtime"
PID_FILE="$RUNTIME_DIR/ocr_service.pid"
LOG_FILE="$RUNTIME_DIR/ocr_service.log"

mkdir -p "$RUNTIME_DIR"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python not found: $PYTHON_BIN" >&2
  exit 1
fi

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" >/dev/null 2>&1; then
    echo "OCR service already running. PID: $EXISTING_PID Port: $PORT"
    exit 0
  fi
fi

export OCR_HOST="${OCR_HOST:-0.0.0.0}"
export OCR_PORT="$PORT"
export OCR_SERVER_THREADS="${OCR_SERVER_THREADS:-4}"
export OCR_CPU_THREADS="${OCR_CPU_THREADS:-2}"
export OCR_KEEP_MODEL_LOADED="${OCR_KEEP_MODEL_LOADED:-false}"
export OCR_PROCESS_ISOLATED="${OCR_PROCESS_ISOLATED:-true}"
export OCR_SINGLE_INSTANCE="${OCR_SINGLE_INSTANCE:-true}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-2}"
export MKL_NUM_THREADS="${MKL_NUM_THREADS:-2}"
export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-2}"
export NUMEXPR_NUM_THREADS="${NUMEXPR_NUM_THREADS:-2}"

cd "$PROJECT_ROOT"
nohup "$PYTHON_BIN" -m ocr_service.app >>"$LOG_FILE" 2>&1 &
OCR_PID=$!
echo "$OCR_PID" > "$PID_FILE"
echo "OCR service started: http://127.0.0.1:$PORT PID=$OCR_PID"