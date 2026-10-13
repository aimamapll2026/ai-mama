#!/bin/bash
# AI妈妈 · 一键启动（Mac / Linux）
cd "$(dirname "$0")"

echo ""
echo "  =========================================="
echo "     AI妈妈 · 女性内容创作者的变现管家"
echo "  =========================================="
echo ""

# 找 node
if ! command -v node >/dev/null 2>&1; then
  echo "  [错误] 没有检测到 Node.js"
  echo ""
  echo "  请先安装 Node.js："
  echo "    Mac：打开 https://nodejs.org/ 下载 LTS 版本安装"
  echo "    或终端执行：brew install node"
  echo "  装完后重新运行本脚本"
  echo ""
  read -p "  按回车退出..."
  exit 1
fi

# 首次安装依赖
if [ ! -d "node_modules" ]; then
  echo "  [1/2] 首次运行，正在安装依赖（约 1-2 分钟）..."
  echo ""
  npm install || { echo ""; echo "  [错误] 依赖安装失败，请检查网络"; read -p "  按回车退出..."; exit 1; }
  echo ""
fi

echo "  [2/2] 正在启动服务..."
echo ""
echo "  ------------------------------------------"
echo "    启动后请用浏览器访问：http://localhost:3000"
echo "    按 Ctrl+C 停止服务"
echo "  ------------------------------------------"
echo ""

# 尝试自动打开浏览器
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open http://localhost:3000) &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open http://localhost:3000) &
fi

node server.js
