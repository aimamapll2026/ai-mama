@echo off
chcp 65001 >nul
title AI妈妈 - 启动中...
cd /d "%~dp0"

echo.
echo  ==========================================
echo     AI妈妈 · 女性内容创作者的变现管家
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [错误] 没有检测到 Node.js
  echo.
  echo  请先安装 Node.js：
  echo  1. 打开 https://nodejs.org/
  echo  2. 下载左边的 "LTS" 版本
  echo  3. 一路点"下一步"安装完成
  echo  4. 装完后重新双击本文件
  echo.
  pause
  exit /b
)

if not exist "node_modules" (
  echo  [1/2] 首次运行，正在安装依赖（约 1-2 分钟，请耐心等待）...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b
  )
  echo.
)

echo  [2/2] 正在启动服务...
echo.
echo  ------------------------------------------
echo    启动成功后，浏览器会自动打开
echo    如果没打开，请手动访问：http://localhost:3000
echo.
echo    关闭这个黑色窗口 = 停止服务
echo  ------------------------------------------
echo.

start "" http://localhost:3000
node server.js

pause
