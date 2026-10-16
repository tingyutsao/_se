# =============================================================================
#  Rust API 映像檔
#  第一階段用官方 rust 映像檔編譯；第二階段只帶入編譯好的執行檔，
#  所以最終映像檔從 ~1GB 降到 ~80MB（多階段建置的價值）。
# =============================================================================
FROM rust:1.83-slim AS builder

# 讓服務能回報編譯器版本（編譯期常數，寫進二進位檔）
ARG RUST_VERSION=1.83.0
ENV RUSTC_VERSION=${RUST_VERSION}

WORKDIR /app

# 這個服務沒有第三方依賴，不需要連 crates.io。
# Cargo.lock 一併複製，讓建置結果可重現（--locked）。
COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release --locked

# =============================================================================
#  執行階段：只放執行檔
# =============================================================================
FROM debian:bookworm-slim

LABEL org.opencontainers.image.title="demo-rust-api" \
      org.opencontainers.image.description="Rust microservice built with only the standard library"

ENV PORT=8080 \
    SERVICE_NAME=rust-api

# 建立非 root 使用者
RUN useradd --create-home --shell /usr/sbin/nologin appuser

COPY --from=builder /app/target/release/rust-api /usr/local/bin/rust-api

USER appuser

EXPOSE 8080

# 用二進位檔自己的 --health 模式做健康檢查（映像檔內不需要 curl）
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD ["rust-api", "--health"]

CMD ["rust-api"]
