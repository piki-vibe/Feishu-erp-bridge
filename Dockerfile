# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码
COPY . .

# 构建前端
RUN npm run build

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 安装 tini 用于进程管理
RUN apk add --no-cache tini

# 复制构建好的文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/scripts ./scripts

# 暴露端口
EXPOSE 3001 5173

# 启动应用（同时启动前后端）
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "scripts/start-all.js"]
