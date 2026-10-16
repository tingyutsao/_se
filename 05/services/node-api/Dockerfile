# =============================================================================
#  Node.js API 映像檔（多階段建置）
#   build 階段：安裝相依套件
#   runtime 階段：只帶入執行期需要的檔案，映像更小、攻擊面更少
# =============================================================================

# ---------- 階段 1：安裝相依套件 -------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# 先複製 package 檔再安裝，善用 Docker layer cache
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# =============================================================================
#  執行階段
# =============================================================================
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# 建立非 root 使用者，避免容器以 root 執行
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER app

EXPOSE 3000

# 健康檢查：容器內部直接打自己的 /health
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
