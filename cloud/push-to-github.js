#!/usr/bin/env node
/**
 * AI妈妈 · 一键推送到 GitHub（Windows / Mac 通用）
 *
 * 作用：把当前项目推到你自己的 GitHub 仓库，供 Render 部署。
 * 前提：已安装 Node.js（含 git 检查提示）
 *
 * 用法：在本项目目录下打开命令行，运行：
 *   node cloud/push-to-github.js
 */
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));

/** 执行命令；失败不抛异常，返回 { ok, out } */
function tryRun(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { ok: true, out: (out || '').trim() };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '') || e.message || '').trim() };
  }
}
/** 执行命令并把输出直接显示给用户 */
function showRun(cmd) {
  return spawnSync(cmd, { shell: true, stdio: 'inherit' }).status === 0;
}

const PROJECT_DIR = path.resolve(__dirname, '..');

(async () => {
  console.log('\n' + '='.repeat(52));
  console.log('  📦 AI妈妈 · 一键上传到 GitHub');
  console.log('='.repeat(52));
  console.log('\n跟着提示走就行，中途想退出按 Ctrl+C。\n');

  // ---------- 0. 环境检查 ----------
  const nodeV = process.version;
  console.log('✅ Node.js：' + nodeV);

  const gitV = tryRun('git --version');
  if (!gitV.ok) {
    console.log('\n❌ 没有检测到 Git。\n');
    console.log('请先安装 Git（免费，2 分钟）：');
    console.log('  1. 打开 https://git-scm.com/download/win');
    console.log('  2. 下载后一路点「下一步」装完');
    console.log('  3. 装完后【关掉这个窗口】，重新开一次再运行本命令\n');
    process.exit(1);
  }
  console.log('✅ ' + gitV.out);

  // 确认在项目目录
  if (!fs.existsSync(path.join(PROJECT_DIR, 'server.js'))) {
    console.log('\n❌ 当前目录不对，没找到 server.js');
    console.log('   请先进入解压出来的 ai-mama 文件夹再运行本命令。\n');
    process.exit(1);
  }
  try { process.chdir(PROJECT_DIR); } catch (e) {}

  // ---------- 1. 收集信息 ----------
  console.log('\n' + '-'.repeat(52));
  console.log('  第 1 步：告诉我要传到哪');
  console.log('-'.repeat(52));
  console.log('\n（如果你还没注册 GitHub，先看文档里的第 1 步）\n');

  const user = await ask('① 你的 GitHub 用户名（英文，如 zhangsan）：');
  if (!user) { console.log('\n❌ 用户名不能空，请重新运行。\n'); process.exit(1); }

  let repo = await ask('② 仓库名（直接回车用 ai-mama）：');
  if (!repo) repo = 'ai-mama';

  // ---------- 2. Token ----------
  console.log('\n' + '-'.repeat(52));
  console.log('  第 2 步：需要一个 GitHub Token（临时密码）');
  console.log('-'.repeat(52));
  console.log('\n获取方法（约 30 秒）：');
  console.log('   1) 打开  https://github.com/settings/tokens/new');
  console.log('      （如果打不开或没看到按钮，看文档「Token 常见问题」）');
  console.log('   2) Note 填：ai-mama');
  console.log('   3) Expiration 选：No expiration（永不过期）');
  console.log('   4) 【重要】勾选最上面那个大框 "repo"（会自动全选下面几项）');
  console.log('   5) 拉到最底部，点绿色按钮 "Generate token"');
  console.log('   6) 复制那串 ghp_ 开头的字符\n');

  const token = await ask('把 Token 粘贴到这里（右键=粘贴，然后回车）：');
  if (!token) { console.log('\n❌ Token 不能空，请重新运行。\n'); process.exit(1); }
  if (!/^ghp_|^github_pat_/.test(token)) {
    console.log('\n⚠️  提醒：Token 一般以 ghp_ 或 github_pat_ 开头，你贴的好像不是。');
    const go = await ask('   确定继续吗？(y/n)：');
    if (go.toLowerCase() !== 'y') { console.log('\n已退出，请重新运行。\n'); process.exit(1); }
  }

  const remote = `https://${user}:${token}@github.com/${user}/${repo}.git`;

  // ---------- 3. 本地准备 ----------
  console.log('\n' + '-'.repeat(52));
  console.log('  第 3 步：整理本地代码');
  console.log('-'.repeat(52) + '\n');

  if (!tryRun('git rev-parse --git-dir').ok) {
    console.log('· 初始化本地仓库...');
    showRun('git init -q');
  }
  showRun('git add -A');
  const staged = tryRun('git diff --cached --name-only').out;
  if (staged) {
    console.log('· 提交改动（' + staged.split('\n').length + ' 个文件）...');
    showRun('git -c user.name="AI Mama" -c user.email="ai-mama@local" commit -q -m "AI妈妈 部署"');
  } else {
    console.log('· 无新改动');
  }
  showRun('git branch -M main');
  console.log('✅ 本地准备完成');

  // ---------- 4. 推送 ----------
  console.log('\n' + '-'.repeat(52));
  console.log('  第 4 步：上传到 GitHub（可能要几十秒）');
  console.log('-'.repeat(52) + '\n');

  tryRun('git remote remove origin');
  const pushOk = showRun(`git push ${remote} main -f`);

  if (!pushOk) {
    console.log('\n❌ 上传失败。请对照下面找原因：\n');
    console.log('  【最常见的 4 个原因】');
    console.log('   1. Token 没复制完整  → 要 ghp_ 开头的完整一串，中间不能断');
    console.log('   2. Token 没勾 "repo" → 回 Token 页面重新生成，务必勾上 repo');
    console.log('   3. 用户名拼错        → 打开 github.com 看你右上角头像旁的名字');
    console.log('   4. 网络连不上 GitHub → 换个网络（如手机热点）再试');
    console.log('\n  改好后重新运行本命令即可（可以重复运行，不会出问题）\n');
    process.exit(1);
  }

  // ---------- 完成 ----------
  const liveUrl = 'https://' + repo + '.onrender.com';
  console.log('\n' + '='.repeat(52));
  console.log('  🎉 上传成功！');
  console.log('='.repeat(52));
  console.log('\n【剩下的事，用手机或电脑浏览器做】\n');
  console.log('第 5 步 · 注册/登录 Render（可先用 GitHub 账号登录）：');
  console.log('   https://dashboard.render.com/register\n');
  console.log('第 6 步 · 点右上角 "New +" → 选 "Web Service"\n');
  console.log('第 7 步 · 选 "Git Provider"，找到仓库：' + repo + ' 点 Connect\n');
  console.log('第 8 步 · 核对这几项（其余的不用管）：');
  console.log('   · Name            填：' + repo);
  console.log('   · Language        选：Node');
  console.log('   · Branch          选：main');
  console.log('   · Build Command   填：npm install');
  console.log('   · Start Command   填：npm start');
  console.log('   · Instance Type   选：Free  ← 别选错\n');
  console.log('第 9 步 · 往下找到 "Environment Variables"，加两条：');
  console.log('   · TCB_ENV          = 你的腾讯云环境ID');
  console.log('   · CLOUDBASE_APIKEY = 你的腾讯云API Key');
  console.log('   （不加也能跑，只是用示例数据）\n');
  console.log('第 10 步 · 点最下面 "Create Web Service"，等 2~5 分钟');
  console.log('          看到绿色 "Live" 就成功了\n');
  console.log('你的永久网址是：');
  console.log('   ' + liveUrl + '\n');
  console.log('第 11 步 · 验证一下（在本窗口里运行）：');
  console.log('   node cloud/selfcheck.js ' + liveUrl + '\n');
  console.log('💡 提示：Render 免费版 15 分钟没人用会休眠，');
  console.log('   下次打开等 30~60 秒自动唤醒，属正常现象。\n');

  rl.close();
})();
