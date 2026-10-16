# =============================================================================
#  Nginx 映像檔：反向代理 + 前端靜態網站
#  build context 是「專案根目錄」，所以可以同時 COPY nginx/ 與 web/
# =============================================================================
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="demo-nginx-web" \
      org.opencontainers.image.description="Nginx reverse proxy + static dashboard"

# 移除預設站台設定，改用我們自己的
RUN rm -f /etc/nginx/conf.d/default.conf

# 反向代理設定
COPY nginx/nginx.conf /etc/nginx/conf.d/app.conf

# 靜態前端（簡易 Web 介面）
COPY web/ /usr/share/nginx/html/

EXPOSE 80

# 健康檢查：alpine 版內建 busybox wget
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
