# AI妈妈 · 变现机会工作台

女性内容创作者的变现管家：机会库、学习库、投稿记录、周报推送、AI 稿件评估。

## 一键部署到 Render

点下面的按钮即可自动部署：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

部署时需要填两个环境变量（在 Render 控制台里填）：
- `TCB_ENV`：腾讯云 CloudBase 环境 ID
- `CLOUDBASE_APIKEY`：腾讯云 CloudBase API Key

不填也能跑，会使用内置的示例数据。

## 功能

- **机会库**：各平台变现机会汇总，按截止时间/收益排序
- **学习库**：涨粉、变现、选题等运营技巧
- **投稿记录**：记录投稿进度，打卡追踪
- **周报**：每周一自动汇总当周机会，邮件推送
- **AI 评估**：一键评估稿件质量，给改进建议

## 本地运行

```bash
npm install
npm start
# 打开 http://localhost:3000
```

## 部署自检

部署后运行，逐项检查是否正常：

```bash
node cloud/selfcheck.js https://你的网址.onrender.com
```

## 技术栈

Node.js + Express + 原生 H5（无框架）+ PWA 支持
