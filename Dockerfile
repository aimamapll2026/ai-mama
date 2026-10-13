# AI妈妈 · 云托管镜像
# 适用于腾讯云 CloudBase Run（云托管）等常驻 Node 进程环境
FROM node:18-alpine

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# 拷贝源码（含 data/ 种子数据：云数据库万一连不上时作为兜底，保证页面不空）
COPY . .

ENV NODE_ENV=production
ENV STORAGE=cloud
ENV PORT=80
ENV TZ=Asia/Shanghai

EXPOSE 80

CMD ["node", "server.js"]
