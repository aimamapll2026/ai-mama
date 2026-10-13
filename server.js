/**
 * AI妈妈 - 后端服务
 * 简单稳定的 Express + JSON 文件存储
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const ai = require('./lib/ai');
const aiTasks = require('./lib/ai-tasks');
const mailer = require('./lib/mailer');
const store = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.json({ limit: '2mb' }));

// CORS：静态托管与云托管分属不同域名时，接口需要允许跨域
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 把 Content-Type 为 text/html 的响应去掉网关强加的下载头
app.use((req, res, next) => {
  const origSet = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() === 'content-disposition') return res;
    return origSet(name, value);
  };
  next();
});

app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    // Service Worker 必须不被缓存，否则更新发布后用户拿到旧版本
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    }
    if (filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
    // 页面按在线方式打开
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Disposition', 'inline');
    }
  }
}));

/* ---------------- 数据读写（本地 JSON / 云数据库 双模式） ---------------- */
// 底层适配见 lib/store.js：本地模式读写 data/*.json，云端模式读写 CloudBase 云数据库。
async function readJson(name, fallback) {
  return store.read(name, fallback);
}
async function writeJson(name, data) {
  return store.write(name, data);
}
function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------- 基础接口 ---------------- */

// 诊断端点：查看云端数据库连接状态（不含任何敏感值，只含变量名）
app.get('/api/debug/storage', (req, res) => {
  res.json({ ok: true, diagnostics: store.diagnostics() });
});

// 健康检查
app.get('/api/health', async (req, res) => {
  res.json({
    ok: true,
    name: 'AI妈妈',
    time: new Date().toISOString(),
    storage: store.mode()          // local | cloud
  });
});

// 机会列表（支持类型/平台/关键词/排序筛选）
app.get('/api/opportunities', async (req, res) => {
  let list = await readJson('opportunities.json', []);
  const { type, platform, keyword, sort } = req.query;

  if (type && type !== 'all') list = list.filter(o => o.type === type);
  if (platform && platform !== 'all') list = list.filter(o => o.platform === platform);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter(o =>
      (o.title || '').toLowerCase().includes(k) ||
      (o.summary || '').toLowerCase().includes(k) ||
      (o.platform || '').toLowerCase().includes(k) ||
      (o.tags || []).some(t => t.toLowerCase().includes(k))
    );
  }

  // 排序：默认按截止时间升序（越急越靠前）
  if (sort === 'deadline') {
    list = list.slice().sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
  } else if (sort === 'reward') {
    list = list.slice().sort((a, b) => rewardValue(b) - rewardValue(a));
  }

  res.json({ ok: true, total: list.length, list });
});

// 奖金粗排序数值（用于「高奖金」排序）
function rewardValue(o) {
  const m = String(o.reward || '').match(/(\d[\d,]*)/);
  if (!m) return 0;
  return parseInt(m[1].replace(/,/g, ''), 10) || 0;
}

// 机会详情
app.get('/api/opportunities/:id', async (req, res) => {
  const list = await readJson('opportunities.json', []);
  const item = list.find(o => o.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: '未找到该机会' });
  res.json({ ok: true, item });
});

// 平台与统计
app.get('/api/meta', async (req, res) => {
  const list = await readJson('opportunities.json', []);
  const platforms = [...new Set(list.map(o => o.platform))];
  const counts = {
    all: list.length,
    flow: list.filter(o => o.type === 'flow').length,
    prize: list.filter(o => o.type === 'prize').length,
    product: list.filter(o => o.type === 'product').length,
    sample: list.filter(o => o.type === 'sample').length
  };
  res.json({ ok: true, platforms, counts });
});

/* ---------------- 学习提升 ---------------- */
// 精选经验帖索引（含妈妈提炼要点），可按主题/平台筛选
app.get('/api/lessons', async (req, res) => {
  let list = await readJson('lessons.json', []);
  const { topic, platform, keyword } = req.query;
  if (topic && topic !== 'all') list = list.filter(l => l.topic === topic);
  if (platform && platform !== 'all') list = list.filter(l => l.platform === platform);
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter(l =>
      (l.title + l.summary + (l.keyPoints || []).join('')).toLowerCase().includes(k)
    );
  }
  const allLessons = await readJson('lessons.json', []);
  const topics = [...new Set(allLessons.map(l => l.topic))];
  res.json({ ok: true, total: list.length, topics, list });
});

/* ---------------- 设置 ---------------- */
app.get('/api/settings', async (req, res) => {
  res.json({ ok: true, settings: await readJson('settings.json', {}) });
});
app.put('/api/settings', async (req, res) => {
  const cur = await readJson('settings.json', {});
  const next = { ...cur, ...req.body };
  await writeJson('settings.json', next);
  res.json({ ok: true, settings: next });
});

/* ---------------- 记录（报名/投稿） ---------------- */
app.get('/api/records', async (req, res) => {
  res.json({ ok: true, list: await readJson('records.json', []) });
});

// 创建记录
app.post('/api/records', async (req, res) => {
  const list = await readJson('records.json', []);
  const { opportunityId, kind } = req.body;
  const opps = await readJson('opportunities.json', []);
  const opp = opps.find(o => o.id === opportunityId);
  if (!opp) return res.status(400).json({ ok: false, error: '机会不存在' });

  const rec = {
    id: uid('rec'),
    opportunityId,
    kind: kind || (opp.type === 'prize' ? 'submission' : 'signup'),
    title: opp.title,
    platform: opp.platform,
    type: opp.type,
    deadline: opp.deadline,
    // 打卡状态机：
    //   checked_in 已报名 → published 已发布 → reviewing 评审中 →
    //   rewarded 已获奖 / earning 已产生收益 / listed 已上架 →
    //   done 已完成
    status: 'checked_in',
    // 成果字段（按机会类型使用）
    metrics: {
      views: null,    // 播放量 / 阅读量
      income: null,   // 收益金额（元）
      prize: null,    // 奖金（元）
      sales: null,    // 销量（件/份）
      revenue: null   // 销售额（元）
    },
    note: '',
    checkins: [],     // 打卡历史 [{ at, status, metrics, note }]
    result: '',
    draft: req.body.draft || '',
    createdAt: new Date().toISOString()
  };
  list.unshift(rec);
  await writeJson('records.json', list);
  res.json({ ok: true, record: rec });
});

// 更新记录（状态/结果/草稿）
app.put('/api/records/:id', async (req, res) => {
  const list = await readJson('records.json', []);
  const idx = list.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: '记录不存在' });
  list[idx] = { ...list[idx], ...req.body, updatedAt: new Date().toISOString() };
  await writeJson('records.json', list);
  res.json({ ok: true, record: list[idx] });
});

// 打卡：更新进度状态 + 成果数字，并留存打卡历史
app.post('/api/records/:id/checkin', async (req, res) => {
  const VALID = ['checked_in', 'published', 'reviewing', 'rewarded', 'earning', 'listed', 'done'];
  const list = await readJson('records.json', []);
  const idx = list.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: '记录不存在' });

  const { status, metrics, note } = req.body || {};
  if (status && !VALID.includes(status)) {
    return res.status(400).json({ ok: false, error: '无效的打卡状态' });
  }
  // 数字字段校验：必须是数字或空
  const METRIC_KEYS = ['views', 'income', 'prize', 'sales', 'revenue'];
  const cleanMetrics = {};
  for (const k of METRIC_KEYS) {
    const v = metrics && metrics[k];
    if (v === null || v === undefined || v === '') { cleanMetrics[k] = null; continue; }
    const num = Number(v);
    if (Number.isNaN(num) || num < 0) {
      return res.status(400).json({ ok: false, error: `字段 ${k} 必须是非负数字` });
    }
    cleanMetrics[k] = num;
  }

  const rec = list[idx];
  const merged = { ...(rec.metrics || {}), ...cleanMetrics };
  if (status) rec.status = status;
  rec.metrics = merged;
  if (note !== undefined) rec.note = note;
  rec.checkins = rec.checkins || [];
  rec.checkins.unshift({
    at: new Date().toISOString(),
    status: rec.status,
    metrics: cleanMetrics,
    note: note || ''
  });
  rec.updatedAt = new Date().toISOString();
  await writeJson('records.json', list);
  res.json({ ok: true, record: rec });
});

// 删除记录
app.delete('/api/records/:id', async (req, res) => {
  let list = await readJson('records.json', []);
  const before = list.length;
  list = list.filter(r => r.id !== req.params.id);
  if (list.length === before) return res.status(404).json({ ok: false, error: '记录不存在' });
  await writeJson('records.json', list);
  res.json({ ok: true });
});

/* ---------------- 我的内容（文案库） ---------------- */
app.get('/api/contents', async (req, res) => {
  res.json({ ok: true, list: await readJson('contents.json', []) });
});
app.post('/api/contents', async (req, res) => {
  const list = await readJson('contents.json', []);
  const { title, body } = req.body;
  if (!body || !String(body).trim()) {
    return res.status(400).json({ ok: false, error: '文案内容不能为空' });
  }
  const item = {
    id: uid('ct'),
    title: title || String(body).slice(0, 20),
    body: String(body),
    createdAt: new Date().toISOString(),
    usedIn: []
  };
  list.unshift(item);
  await writeJson('contents.json', list);
  res.json({ ok: true, item });
});
app.delete('/api/contents/:id', async (req, res) => {
  let list = await readJson('contents.json', []);
  list = list.filter(c => c.id !== req.params.id);
  await writeJson('contents.json', list);
  res.json({ ok: true });
});

/* ---------------- 周报 ---------------- */
app.get('/api/reports', async (req, res) => {
  res.json({ ok: true, list: await readJson('reports.json', []) });
});

// 生成周报：同一周内已存在则覆盖更新，避免重复堆积
app.post('/api/reports/generate', async (req, res) => {
  const reports = await readJson('reports.json', []);
  const report = await buildReport();
  const idx = reports.findIndex(r => r.week === report.week);
  if (idx >= 0) reports[idx] = { ...reports[idx], ...report };
  else reports.unshift(report);
  await writeJson('reports.json', reports.slice(0, 52));
  res.json({ ok: true, report });
});

function buildHeadline(urgent, highPrize) {
  const parts = [];
  if (urgent.length) parts.push(`${urgent.length} 个机会即将截稿`);
  if (highPrize.length) parts.push(`最高奖金 ${rewardValue(highPrize[0])} 元`);
  return parts.length ? parts.join('，') : '本周暂无紧急事项';
}
function buildReportComment(urgent, highPrize) {
  if (!urgent.length && !highPrize.length) return '姐妹，本周风平浪静，妈妈继续帮你盯着。';
  const tips = [];
  if (urgent.length) tips.push(`有 ${urgent.length} 个活动快截止了，先处理这些`);
  if (highPrize.length) tips.push(`「${highPrize[0].title}」奖金最高，值得优先考虑`);
  return '姐妹，' + tips.join('；') + '。';
}
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}
function daysLeft(deadline) {
  if (!deadline) return 9999;
  const d = new Date(deadline + 'T23:59:59');
  return Math.ceil((d - new Date()) / 86400000);
}

/* ---------------- AI 能力（大模型优先，本地规则引擎兜底） ---------------- */

/**
 * 每个 AI 接口都返回 source 字段：
 *   source:'ai'   → 由大模型生成，engine 里带模型名
 *   source:'rule' → 走本地规则引擎，fallbackReason 说明原因
 * 前端会把来源明确标给用户，不让人误以为规则结果就是 AI 结论。
 */

// 获奖胜算评估
app.post('/api/ai/evaluate', async (req, res) => {
  try {
    const { opportunityId, text } = req.body || {};
    const opps = await readJson('opportunities.json', []);
    const opp = opps.find(o => o.id === opportunityId);
    if (!opp) return res.status(400).json({ ok: false, error: '机会不存在' });
    if (!text || !String(text).trim()) {
      return res.status(400).json({ ok: false, error: '请先粘贴你的文案' });
    }
    const evaluation = await aiTasks.evaluate(opp, String(text));
    res.json({ ok: true, evaluation });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '评估失败' });
  }
});

// 定向改写
app.post('/api/ai/rewrite', async (req, res) => {
  try {
    const { opportunityId, text } = req.body || {};
    const opps = await readJson('opportunities.json', []);
    const opp = opps.find(o => o.id === opportunityId);
    if (!opp) return res.status(400).json({ ok: false, error: '机会不存在' });
    if (!text || !String(text).trim()) {
      return res.status(400).json({ ok: false, error: '请先粘贴你的文案' });
    }
    const out = await aiTasks.rewrite(opp, String(text));
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '改写失败' });
  }
});

// 冲突检测（结合你正在参加的活动 + 大模型会诊）
app.post('/api/ai/conflict', async (req, res) => {
  try {
    const { text, opportunityId } = req.body || {};
    const opps = await readJson('opportunities.json', []);
    const opp = opps.find(o => o.id === opportunityId) || null;
    const records = await readJson('records.json', []);
    const activeIds = records.filter(r => r.status !== 'ended' && r.status !== 'done').map(r => r.opportunityId);
    const activeOpps = opps.filter(o => activeIds.includes(o.id));
    const out = await aiTasks.conflict({ text: String(text || ''), opp, activeOpps });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '检测失败' });
  }
});

// 文案产品化分析
app.post('/api/ai/productize', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ ok: false, error: '请先粘贴你的文案' });
    }
    const analysis = await aiTasks.productize(String(text));
    res.json({ ok: true, analysis });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '分析失败' });
  }
});

/* ---------------- AI 配置 ---------------- */

// 读取 AI 配置状态（永不返回 Key 明文）
app.get('/api/ai/config', async (req, res) => {
  res.json({ ok: true, config: ai.describeAiConfig() });
});

// 保存 AI 配置
app.put('/api/ai/config', async (req, res) => {
  const cur = await readJson('settings.json', {});
  const b = req.body || {};
  const allow = ['aiProvider', 'aiBaseUrl', 'aiModel', 'aiTemperature'];
  allow.forEach(k => { if (b[k] !== undefined) cur[k] = b[k]; });
  // Key 特殊处理：允许传空字符串表示「清除」
  if (b.aiApiKey !== undefined) {
    const k = String(b.aiApiKey).trim();
    if (k) cur.aiApiKey = k;
    else if (b.clearKey) delete cur.aiApiKey;
  }
  await writeJson('settings.json', cur);
  res.json({ ok: true, config: ai.describeAiConfig() });
});

// 测试大模型连接（会消耗极少 token）
app.post('/api/ai/test', async (req, res) => {
  const result = await ai.testConnection();
  res.json({ ok: result.ok, result });
});

/* ---------------- 邮件周报 ---------------- */

// 读取邮件配置状态（永不返回授权码）
app.get('/api/mail/config', async (req, res) => {
  res.json({ ok: true, config: mailer.describeMailConfig() });
});

// 保存邮件配置
app.put('/api/mail/config', async (req, res) => {
  const cur = await readJson('settings.json', {});
  const b = req.body || {};
  ['smtpProvider', 'smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'mailFromName', 'email'].forEach(k => {
    if (b[k] !== undefined) cur[k] = b[k];
  });
  if (b.smtpPass !== undefined) {
    const p = String(b.smtpPass).trim();
    if (p) cur.smtpPass = p;
    else if (b.clearPass) delete cur.smtpPass;
  }
  if (b.notifyEmail !== undefined) cur.notifyEmail = !!b.notifyEmail;
  await writeJson('settings.json', cur);
  res.json({ ok: true, config: mailer.describeMailConfig() });
});

// 测试发信
app.post('/api/mail/test', async (req, res) => {
  const result = await mailer.testConnection();
  res.json({ ok: result.ok, result });
});

// 立即发送一封周报（先确保有周报，没有就现生成一份）
app.post('/api/mail/send-report', async (req, res) => {
  try {
    const cfg = mailer.getMailConfig();
    if (!cfg.enabled) {
      return res.status(400).json({ ok: false, error: '邮件还没配置好，去「设置 → 邮箱推送」填一下 SMTP 授权码' });
    }
    let reports = await readJson('reports.json', []);
    const week = currentWeekKey();
    let rp = reports.find(r => r.week === week);
    if (!rp) {
      rp = await buildReport();
      reports.unshift(rp);
      await writeJson('reports.json', reports.slice(0, 52));
    }
    const result = await sendReportMail(rp);
    res.json({ ok: true, week: rp.week, to: result.to });
  } catch (e) {
    res.status(400).json({ ok: false, error: mailer.friendlyError ? mailer.friendlyError(e) : e.message });
  }
});

/** 组装并发送周报邮件 */
async function sendReportMail(rp) {
  const opps = await readJson('opportunities.json', []);
  const oppMap = {};
  opps.forEach(o => { oppMap[o.id] = o; });
  const lessons = await readJson('lessons.json', []);
  const records = await readJson('records.json', []);
  const urgent = (rp.urgentIds || []).map(id => oppMap[id]).filter(Boolean);
  const highPrize = (rp.highPrizeIds || []).map(id => oppMap[id]).filter(Boolean);

  // 邮件正文里的导语：优先用 AI 写，未配置就用规则
  if (!rp.mailComment) {
    const c = await aiTasks.weeklyComment(rp, urgent, highPrize, lessons);
    rp.mailComment = { text: c.aiComment, source: c.source, engine: c.engine };
  }

  const mailRp = { ...rp, aiComment: rp.mailComment.text };
  const ctx = { oppMap, lessons, records };
  return mailer.sendMail({
    subject: `【AI妈妈】${rp.week} 机会周报 · ${rp.headline || ''}`,
    html: mailer.renderWeeklyHtml(mailRp, ctx),
    text: mailer.renderWeeklyText(mailRp, ctx)
  });
}

/* ---------------- 周报生成（供接口与定时任务共用） ---------------- */
function currentWeekKey() {
  const d = new Date();
  return `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, '0')}`;
}
async function buildReport() {
  const opps = await readJson('opportunities.json', []);
  const urgent = opps
    .filter(o => daysLeft(o.deadline) >= 0 && daysLeft(o.deadline) <= 14)
    .sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline));
  const highPrize = opps
    .filter(o => o.type === 'prize')
    .sort((a, b) => rewardValue(b) - rewardValue(a))
    .slice(0, 3);
  return {
    id: uid('rp'),
    week: currentWeekKey(),
    createdAt: new Date().toISOString(),
    totalCount: opps.length,
    counts: {
      flow: opps.filter(o => o.type === 'flow').length,
      prize: opps.filter(o => o.type === 'prize').length,
      product: opps.filter(o => o.type === 'product').length,
      sample: opps.filter(o => o.type === 'sample').length
    },
    urgentIds: urgent.slice(0, 6).map(o => o.id),
    highPrizeIds: highPrize.map(o => o.id),
    headline: buildHeadline(urgent, highPrize),
    aiComment: buildReportComment(urgent, highPrize)
  };
}

/* ---------------- 每周定时发送 ---------------- */
/**
 * 极简调度器：每小时醒一次，命中「周一 09:00（本机时区）」且本周还没发过，就发一封。
 * 不用外部 cron 依赖，服务跑着就有效。
 */
let lastScheduledKey = '';
async function startWeeklyScheduler() {
  const TICK = 15 * 60 * 1000;   // 每 15 分钟醒一次，避免"正好错过 9 点"那一小时
  setInterval(async () => {
    try {
      const s = await readJson('settings.json', {});
      if (!s.notifyEmail) return;
      const c = mailer.getMailConfig();
      if (!c.enabled) return;
      const now = new Date();
      // 用中国时区判断，避免云服务器默认 UTC 导致发错时间
      const cn = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60 * 1000);
      if (cn.getDay() !== 1 || cn.getHours() !== 9) return;      // 周一 9 点（北京时间）
      const key = currentWeekKey();
      if (lastScheduledKey === key) return;
      if (s.lastMailWeek === key) return;                        // 持久化防重发
      lastScheduledKey = key;

      let reports = await readJson('reports.json', []);
      let rp = reports.find(r => r.week === key);
      if (!rp) { rp = await buildReport(); reports.unshift(rp); await writeJson('reports.json', reports.slice(0, 52)); }
      await sendReportMail(rp);
      const cur = await readJson('settings.json', {});
      cur.lastMailWeek = key;
      cur.lastMailAt = new Date().toISOString();
      await writeJson('settings.json', cur);
      console.log(`✉️  周报已发送至 ${c.to}（${key}）`);
    } catch (e) {
      console.warn('⚠️  周报定时发送失败：', e.message);
    }
  }, TICK).unref?.();
}

/* ---------------- 启动 ---------------- */
// 先初始化存储层（决定走本地文件还是云数据库）
store.init();

// 导出 app，供云函数入口（cloud/index.js）复用
module.exports = app;

// 仅在直接运行时监听端口；被 require 时（云函数场景）不监听
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const aiCfg = ai.describeAiConfig();
    const mailCfg = mailer.describeMailConfig();
    console.log(`\n🤖 AI妈妈 已启动: http://localhost:${PORT}`);
    console.log(`   引擎：${aiCfg.enabled ? '✓ 大模型（' + aiCfg.providerName + ' · ' + aiCfg.model + '）' : '○ 本地规则引擎（未配置 API Key）'}`);
    console.log(`   邮件周报：${mailCfg.enabled ? '✓ 已配置（' + mailCfg.to + '）' : '○ 未配置'}\n`);
    startWeeklyScheduler();
  });
}
