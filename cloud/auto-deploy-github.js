#!/usr/bin/env node
/**
 * AI妈妈 · 自动创建 GitHub 仓库并上传（无需打开 GitHub 网页）
 *
 * 用法：
 *   node cloud/auto-deploy-github.js <你的GitHub用户名> <你的Token>
 *
 * 例如：
 *   node cloud/auto-deploy-github.js zhangsan ghp_xxxxxxxxxxxx
 *
 * 脚本会自动：
 *   1. 用 API 在你的账号下创建仓库 ai-mama（已存在则复用）
 *   2. 推送全部代码上去
 *   3. 打印后续 Render 部署步骤
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const user = process.argv[2];
const token = process.argv[3];
const repo = process.argv[4] || 'ai-mama';

if (!user || !token) {
  console.log(`
用法：node cloud/auto-deploy-github.js <GitHub用户名> <Token> [仓库名]

示例：node cloud/auto-deploy-github.js zhangsan ghp_xxxxxxxxxxxx

Token 获取：https://github.com/settings/tokens/new
  · Note 填 ai-mama
  · Expiration 选 No expiration
  · 勾选最上面的大框 "repo"
  · 拉到底点 Generate token，复制 ghp_ 开头那串
`);
  process.exit(1);
}

const PROJECT_DIR = path.resolve(__dirname, '..');
process.chdir(PROJECT_DIR);

async function api(method, url, body) {
  const res = await fetch('https://api.github.com' + url, {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'ai-mama-deploy',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, ok: res.ok, json, text };
}

(async () => {
  console.log('\n' + '='.repeat(50));
  console.log('  🚀 AI妈妈 · 自动上传到 GitHub');
  console.log('='.repeat(50) + '\n');

  // ---------- 1. 验证 Token ----------
  console.log('① 验证 Token...');
  const me = await api('GET', '/user');
  if (!me.ok) {
    console.log('   ❌ Token 无效或已过期。');
    console.log('      HTTP ' + me.status + '：' + (me.json && me.json.message || ''));
    console.log('\n   请重新生成：https://github.com/settings/tokens/new');
    console.log('   务必勾选 "repo" 权限。\n');
    process.exit(1);
  }
  console.log('   ✅ 已登录为：' + me.json.login);
  if (me.json.login.toLowerCase() !== user.toLowerCase()) {
    console.log('   ⚠️  注意：你填的用户名是「' + user + '」，但 Token 属于「' + me.json.login + '」');
    console.log('      将以「' + me.json.login + '」的身份上传。');
  }
  const realUser = me.json.login;

  // ---------- 2. 创建仓库 ----------
  console.log('\n② 检查/创建仓库「' + repo + '」...');
  const getRepo = await api('GET', '/repos/' + realUser + '/' + repo);
  if (getRepo.ok) {
    console.log('   ✅ 仓库已存在，将直接推送更新');
  } else if (getRepo.status === 404) {
    const create = await api('POST', '/user/repos', {
      name: repo,
      description: 'AI妈妈 · 女性内容创作者的变现管家',
      private: false,        // 必须公开，Render 免费版才能读取
      auto_init: false,
    });
    if (!create.ok) {
      console.log('   ❌ 创建仓库失败：' + (create.json && create.json.message));
      if (String(create.json && create.json.message).includes('scope')) {
        console.log('      原因：Token 权限不足。请重新生成 Token 并勾选 "repo"。');
      }
      process.exit(1);
    }
    console.log('   ✅ 仓库创建成功：' + create.json.html_url);
  } else {
    console.log('   ❌ 查询仓库失败（HTTP ' + getRepo.status + '）：' + (getRepo.json && getRepo.json.message));
    process.exit(1);
  }

  // ---------- 3. 本地 git 准备 ----------
  console.log('\n③ 整理本地代码...');
  const run = (cmd, quiet) => {
    const r = spawnSync(cmd, { shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
    return r.status === 0;
  };
  if (!fs.existsSync(path.join(PROJECT_DIR, '.git'))) run('git init -q', true);
  run('git add -A', true);
  const st = spawnSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  if ((st.stdout || '').trim()) {
    run('git -c user.name="AI Mama" -c user.email="ai-mama@local" commit -q -m "AI妈妈 部署"', true);
  }
  run('git branch -M main', true);
  console.log('   ✅ 本地准备完成');

  // ---------- 4. 推送 ----------
  console.log('\n④ 上传代码（可能需要几十秒）...');
  run('git remote remove origin', true);
  const pushUrl = 'https://' + realUser + ':' + token + '@github.com/' + realUser + '/' + repo + '.git';
  const push = spawnSync('git', ['push', pushUrl, 'main', '-f'], { encoding: 'utf8' });
  if (push.status !== 0) {
    console.log('   ❌ 上传失败：');
    console.log((push.stderr || push.stdout || '').split('\n').slice(0, 6).join('\n'));
    console.log('\n   常见原因：Token 没勾 "repo" 权限。\n');
    process.exit(1);
  }
  console.log('   ✅ 代码已上传');

  // 清掉带 token 的 remote，避免留痕
  run('git remote remove origin', true);
  execSync('git remote add origin https://github.com/' + realUser + '/' + repo + '.git', { stdio: 'ignore' });

  // ---------- 完成 ----------
  const repoUrl = 'https://github.com/' + realUser + '/' + repo;
  const liveUrl = 'https://' + repo + '.onrender.com';

  console.log('\n' + '='.repeat(50));
  console.log('  🎉 上传成功！');
  console.log('='.repeat(50));
  console.log('\n你的代码仓库：' + repoUrl + '\n');
  console.log('【接下来在手机或电脑浏览器做，共 4 步】\n');
  console.log('第 1 步 · 打开 Render 注册页（点 "Sign up with GitHub"）：');
  console.log('   https://dashboard.render.com/register\n');
  console.log('第 2 步 · 点 "New +" → 选 "Web Service" → 找到仓库 ' + repo + ' → 点 Connect\n');
  console.log('第 3 步 · 核对这几项：');
  console.log('   · Name           ：' + repo);
  console.log('   · Language       ：Node');
  console.log('   · Build Command  ：npm install');
  console.log('   · Start Command  ：npm start');
  console.log('   · Instance Type  ：Free   ← 别选错\n');
  console.log('第 4 步 · 往下找 "Environment Variables"，加两条（可选但建议）：');
  console.log('   · TCB_ENV          = 你的腾讯云环境ID');
  console.log('   · CLOUDBASE_APIKEY = 你的腾讯云API Key\n');
  console.log('   然后点最下面的 "Create Web Service"，等 2~5 分钟\n');
  console.log('你的永久网址将是：');
  console.log('   ' + liveUrl + '\n');
  console.log('部署完可以用这个命令验证：');
  console.log('   node cloud/selfcheck.js ' + liveUrl + '\n');
})();
