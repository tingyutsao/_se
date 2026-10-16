# =============================================================================
#  Python API 映像檔（FastAPI + Uvicorn）
# =============================================================================
FROM python:3.12-slim

LABEL org.opencontainers.image.title="demo-python-api"

# 讓 Python 輸出不要有緩衝、不要產生 .pyc，適合容器環境
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

# 先安裝相依套件（善用 layer cache，改程式碼時不用重裝）
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 建立非 root 使用者
RUN useradd --create-home --shell /usr/sbin/nologin appuser

# 複製應用程式
COPY app ./app
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# 健康檢查：用 Python 標準函式庫，不必額外安裝 curl
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health').status==200 else 1)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
