/**
 * 一键部署到腾讯云 CloudBase 静态网站托管
 *
 * 用法（在项目根目录）：
 *   TCB_ENV=你的环境ID node cloud/deploy-static.js
 *
 * 作用：把 public/ 下的页面传到 CloudBase 静态托管，
 *      并自动把接口地址指向云托管服务，生成一个可直接在手机上打开的网址。
 *
 * 需要环境变量：
 *   TCB_ENV            环境 ID（必填）
 *   CLOUDBASE_APIKEY   服务端 API Key（必填）
 *   API_BASE           云托管服务地址（可选，默认用 ai-mama2 的域名）
 */
const fs = require('fs');
const path = require('path');

const ENV = process.env.TCB_ENV;
const KEY = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY;
const API_BASE = process.env.API_BASE || '';

if (!ENV || !KEY) {
  console.error('\n❌ 缺少参数。正确用法：');
  console.error('   TCB_ENV=你的环境ID CLOUDBASE_APIKEY=你的Key node cloud/deploy-static.js\n');
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function main() {
  const tcb = require('@cloudbase/node-sdk');
  const app = tcb.init({ env: ENV, accessKey: KEY, timeout: 60000 });

  console.log('\n=== AI妈妈 · 静态网站部署 ===\n');
  console.log('   环境：' + ENV);

  // 1. 生成前端页面时注入接口地址
  let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  if (API_BASE) {
    const inject = `<script>window.AIMAMA_API_BASE=${JSON.stringify(API_BASE)};</script>\n`;
    const idx = html.lastIndexOf('<script>');
    html = html.slice(0, idx) + inject + html.slice(idx);
    console.log('   接口地址：' + API_BASE);
  }

  // 2. 上传各文件
  const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon.svg'];
  for (const f of files) {
    const fp = path.join(PUBLIC_DIR, f);
    if (!fs.existsSync(fp)) continue;
    const content = f === 'index.html' ? Buffer.from(html, 'utf8') : fs.readFileSync(fp);
    try {
      await app.uploadFile({
        cloudPath: f,
        fileContent: content
      });
      console.log('   ✓ 已上传 ' + f);
    } catch (e) {
      console.log('   ✗ ' + f + ' 上传失败：' + e.message);
    }
  }

  console.log('\n完成。静态托管地址可在控制台「静态网站托管」中查看。\n');
}

main().catch(e => {
  console.error('部署失败：', e.message);
  process.exit(1);
});
