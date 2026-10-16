"""
=============================================================================
 python-api —— FastAPI 微服務（無狀態）
-----------------------------------------------------------------------------
 這個服務刻意「不」連資料庫，用來對比 node-api（有狀態）的差異。
 主要展示：Python 執行環境資訊、以及一個純運算端點（質數計算）。

 端點：
   GET /health                 健康檢查
   GET /info                   服務 / 執行環境資訊
   GET /compute/primes         計算 limit 以下的質數數量（示範 CPU 運算）
   GET /env                    顯示容器內可見的環境變數（示範環境注入）
=============================================================================
"""

from __future__ import annotations

import os
import platform
import socket
import sys
import time

import fastapi
from fastapi import FastAPI, Query

SERVICE_NAME = os.environ.get("SERVICE_NAME", "python-api")
APP_VERSION = "1.0.0"
STARTED_AT = time.time()

app = FastAPI(
    title="python-api",
    version=APP_VERSION,
    description="Docker 微服務示範系統中的 Python 服務",
)

_stats = {"requests": 0}


@app.middleware("http")
async def count_requests(request, call_next):
    """計算處理過的請求數量。"""
    _stats["requests"] += 1
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - start) * 1000:.2f}"
    return response


def _uptime() -> float:
    return round(time.time() - STARTED_AT, 3)


@app.get("/health")
def health():
    return {"status": "ok", "service": SERVICE_NAME, "uptime_seconds": _uptime()}


@app.get("/info")
def info():
    return {
        "service": SERVICE_NAME,
        "language": "Python",
        "runtime": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "implementation": platform.python_implementation(),
        "framework": f"FastAPI {fastapi.__version__}",
        "app_version": APP_VERSION,
        "hostname": socket.gethostname(),
        "platform": platform.system(),
        "machine": platform.machine(),
        "cpu_count": os.cpu_count(),
        "pid": os.getpid(),
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(STARTED_AT)),
        "uptime_seconds": _uptime(),
        "handled_requests": _stats["requests"],
        "database": {"connected": False, "note": "此服務為無狀態，不連資料庫"},
        "ascii_art": "🐍 Python inside Docker",
    }


def _count_primes(limit: int) -> int:
    """埃拉托斯特尼篩法：計算小於 limit 的質數個數。"""
    if limit < 3:
        return 0
    sieve = bytearray([1]) * limit
    sieve[0:2] = b"\x00\x00"
    for i in range(2, int(limit**0.5) + 1):
        if sieve[i]:
            step = i
            start = i * i
            sieve[start:limit:step] = b"\x00" * (((limit - 1 - start) // step) + 1)
    return sum(sieve)


@app.get("/compute/primes")
def compute_primes(limit: int = Query(default=200_000, ge=2, le=5_000_000)):
    """計算 limit 以下的質數個數，回傳花費時間（示範容器內 CPU 運算）。"""
    start = time.perf_counter()
    count = _count_primes(limit)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 3)
    return {
        "service": SERVICE_NAME,
        "limit": limit,
        "prime_count": count,
        "elapsed_ms": elapsed_ms,
        "cpu_count": os.cpu_count(),
    }


@app.get("/env")
def show_env():
    """只回傳示範需要的環境變數，避免洩漏機密。"""
    keys = ["SERVICE_NAME", "PORT", "PYTHONUNBUFFERED", "HOSTNAME", "PATH"]
    return {"service": SERVICE_NAME, "environment": {k: os.environ.get(k) for k in keys}}
