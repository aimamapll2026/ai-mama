#!/usr/bin/env node
/**
 * AI妈妈 · 部署自检（本地或线上都能跑）
 *
 * 用法：
 *   node cloud/selfcheck.js                      # 检查本机 http://127.0.0.1:3000
 *   node cloud/selfcheck.js https://xxx.onrender.com   # 检查线上
 *
 * 会逐项告诉你：哪些正常、哪些有问题、怎么修。
 */
const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');

const results = [];
function ok(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? '  ✅ ' : '  ❌ ') + name + (detail ? '  → ' + detail : ''));
}

(async () => {
  console.log('\n🔍 AI妈妈 部署自检');
  console.log('   目标：' + BASE + '\n');

  // 1. 服务是否活着
  let health = null;
  try {
    const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(20000) });
    health = await r.json();
    ok('服务能访问', r.ok, 'HTTP ' + r.status);
  } catch (e) {
    ok('服务能访问', false, '连不上：' + e.message);
    console.log('\n⚠️  服务连不上。如果刚部署完，等 1 分钟再试（首次启动较慢）。');
    console.log('   如果是 Render 免费版且已闲置，打开链接等 30~60 秒唤醒即可。\n');
    return summary();
  }

  ok('返回格式正确', health && health.ok === true, JSON.stringify(health));

  // 2. 存储模式
  const mode = health.storage;
  ok('存储模式已设置', !!mode, '当前：' + mode + (mode === 'cloud' ? '（云数据库）' : '（本地文件）'));

  // 3. 云数据库连接（仅云端模式）
  if (mode === 'cloud') {
    try {
      const r = await fetch(BASE + '/api/debug/storage', { signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      const d = j.diagnostics || {};
      ok('云数据库连接正常', d.cloudHealthy === true,
         d.cloudHealthy ? '正常' : ('异常：' + (d.lastCloudError ? d.lastCloudError.message : '未知')));
      ok('已注入云环境凭据', (d.injectedKeys || []).length > 0,
         (d.injectedKeys || []).join(', ') || '未发现 TCB_ENV / CLOUDBASE_APIKEY');
      if (d.lastCloudError) {
        console.log('     ⚠️ 最近一次云端错误：' + JSON.stringify(d.lastCloudError));
      }
    } catch (e) {
      ok('云数据库连接正常', false, e.message);
    }
  }

  // 4. 数据是否读得到
  try {
    const r = await fetch(BASE + '/api/opportunities', { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const n = j.total || (j.list || []).length;
    ok('机会数据可读', n > 0, n + ' 条');
  } catch (e) {
    ok('机会数据可读', false, e.message);
  }

  try {
    const r = await fetch(BASE + '/api/lessons', { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const n = j.total || (j.list || []).length;
    ok('学习内容可读', n > 0, n + ' 篇');
  } catch (e) {
    ok('学习内容可读', false, e.message);
  }

  // 5. PWA 资源
  for (const [label, path, expect] of [
    ['首页可打开', '/', 'text/html'],
    ['manifest 存在', '/manifest.webmanifest', null],
    ['Service Worker 存在', '/sw.js', null],
    ['图标存在', '/icon-192.png', null],
  ]) {
    try {
      const r = await fetch(BASE + path, { signal: AbortSignal.timeout(20000) });
      const ct = r.headers.get('content-type') || '';
      const cd = r.headers.get('content-disposition') || '';
      let pass = r.ok;
      if (cd && cd.includes('attachment')) pass = false;
      if (expect && pass && !ct.includes(expect)) pass = false;
      ok(label, pass, 'HTTP ' + r.status + (cd ? ' | ' + cd : ''));
    } catch (e) {
      ok(label, false, e.message);
    }
  }

  // 6. AI 配置
  try {
    const r = await fetch(BASE + '/api/ai/config', { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const c = j.config || j;
    ok('AI 引擎已配置', !!c.enabled,
       c.enabled ? ('已启用：' + (c.providerName || '') + ' ' + (c.model || '')) : '未配置（不影响基础功能，去 App「设置」里填 Key）');
  } catch (e) {
    ok('AI 引擎已配置', false, e.message);
  }

  // 7. 邮件周报
  try {
    const r = await fetch(BASE + '/api/mail/config', { signal: AbortSignal.timeout(20000) });
    if (r.ok) {
      const j = await r.json();
      const c = j.config || j;
      ok('邮件周报已配置', !!c.enabled,
         c.enabled ? ('收件人：' + (c.to || '')) : '未配置（去 App「设置」填 QQ 邮箱 + 授权码）');
    } else {
      ok('邮件周报已配置', false, 'HTTP ' + r.status);
    }
  } catch (e) {
    ok('邮件周报已配置', false, e.message);
  }

  summary();
})();

function summary() {
  const pass = results.filter(r => r.pass).length;
  const total = results.length;
  console.log('\n' + '='.repeat(46));
  console.log('结果：' + pass + ' 项正常 / ' + (total - pass) + ' 项需关注');
  console.log('='.repeat(46) + '\n');

  if (pass < total) {
    console.log('提示：');
    console.log('  · 「AI 引擎未配置」「邮件周报未配置」属正常，去 App「设置」页填写即可');
    console.log('  · 「云数据库连接异常」请检查 TCB_ENV 和 CLOUDBASE_APIKEY 是否填对');
    console.log('  · 服务连不上、或资源 404，多半是还在启动，等 1 分钟重试\n');
  } else {
    console.log('🎉 全部正常，可以放心使用了！\n');
  }
}
