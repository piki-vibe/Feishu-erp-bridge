FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=1200 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
    OCR_HOST=0.0.0.0 \
    OCR_PORT=5000 \
    OCR_SERVER_THREADS=4 \
    OCR_CPU_THREADS=2 \
    OCR_KEEP_MODEL_LOADED=false \
    OCR_PROCESS_ISOLATED=true

WORKDIR /app

RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g; s|http://deb.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
  && rm -rf /var/lib/apt/lists/*

COPY ocr_service/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
  && pip install -r /tmp/requirements.txt

COPY ocr_service /app/ocr_service

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://127.0.0.1:5000/health || exit 1

CMD ["python", "-m", "ocr_service.app"]
