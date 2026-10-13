/**
 * AI妈妈 · 邮件周报发送模块
 *
 * 用 nodemailer + SMTP 把周报发到你的邮箱。
 * 以 QQ 邮箱为例：
 *   1. 登录 QQ 邮箱 → 设置 → 账户 → 开启「IMAP/SMTP 服务」
 *   2. 按提示发一条短信，拿到 16 位「授权码」（不是 QQ 密码！）
 *   3. 把授权码填到工作台的「设置 → 邮箱推送」里
 *
 * 未配置时不会报错，只返回「未配置」，前端会给出引导。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/** 常见邮箱服务商预设（大部分已内置，用户只需填授权码） */
const MAIL_PRESETS = {
  qq:        { host: 'smtp.qq.com',        port: 465, secure: true, label: 'QQ 邮箱',      help: '设置→账户→开启 IMAP/SMTP 服务，用 16 位授权码' },
  '163':     { host: 'smtp.163.com',       port: 465, secure: true, label: '网易 163',     help: '设置→POP3/SMTP/IMAP，开启 SMTP，用授权码' },
  '126':     { host: 'smtp.126.com',       port: 465, secure: true, label: '网易 126',     help: '同上，用授权码' },
  outlook:   { host: 'smtp.office365.com', port: 587, secure: false, label: 'Outlook',     help: '使用应用密码（如开了两步验证）' },
  gmail:     { host: 'smtp.gmail.com',     port: 465, secure: true, label: 'Gmail',        help: '需开启两步验证并生成「应用专用密码」' },
  aliyun:    { host: 'smtp.mxhichina.com', port: 465, secure: true, label: '阿里云企业邮', help: '用邮箱登录密码或客户端密码' },
  exmail:    { host: 'smtp.exmail.qq.com', port: 465, secure: true, label: '腾讯企业邮',   help: '用邮箱登录密码' }
};

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8'));
  } catch (e) {
    return {};
  }
}

/** 推断服务商：显式配置 > 按发信邮箱域名猜 */
function guessProvider(email, explicit) {
  if (explicit && MAIL_PRESETS[explicit]) return explicit;
  const domain = String(email || '').split('@')[1] || '';
  if (/qq\.com$/i.test(domain)) return 'qq';
  if (/163\.com$/i.test(domain)) return '163';
  if (/126\.com$/i.test(domain)) return '126';
  if (/outlook|hotmail|live\./i.test(domain)) return 'outlook';
  if (/gmail/i.test(domain)) return 'gmail';
  if (/exmail\.qq\.com$/i.test(domain)) return 'exmail';
  if (/aliyun|mxhichina/i.test(domain)) return 'aliyun';
  return '';
}

/** 读取生效的邮件配置 */
function getMailConfig() {
  const s = readSettings();
  const user = (s.smtpUser || s.email || process.env.SMTP_USER || '').trim();
  const pass = (s.smtpPass || process.env.SMTP_PASS || '').trim();
  const provider = guessProvider(user, s.smtpProvider || process.env.SMTP_PROVIDER);
  const preset = MAIL_PRESETS[provider] || {};
  const host = (s.smtpHost || process.env.SMTP_HOST || preset.host || '').trim();
  const portRaw = s.smtpPort || process.env.SMTP_PORT || preset.port || 465;
  const port = Number(portRaw) || 465;
  const secure = s.smtpSecure != null ? !!s.smtpSecure : (port === 465);
  const to = (s.email || user || '').trim();

  return {
    enabled: !!(host && user && pass && to),
    host, port, secure, user, pass, to, provider,
    providerLabel: preset.label || (host || '自定义'),
    fromName: s.mailFromName || 'AI妈妈',
    help: preset.help || '请填写 SMTP 服务器地址、端口、账号与授权码'
  };
}

/** 给前端看的配置摘要（不返回密码） */
function describeMailConfig() {
  const c = getMailConfig();
  return {
    enabled: c.enabled,
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    to: c.to,
    provider: c.provider,
    providerLabel: c.providerLabel,
    help: c.help,
    passSet: !!c.pass,
    presets: Object.entries(MAIL_PRESETS).map(([id, p]) => ({
      id, label: p.label, host: p.host, port: p.port, secure: p.secure, help: p.help
    }))
  };
}

function getTransport() {
  const c = getMailConfig();
  if (!c.enabled) throw new Error('MAIL_NOT_CONFIGURED');
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    throw new Error('缺少 nodemailer 依赖，请在项目目录执行 npm install nodemailer');
  }
  return {
    c,
    transporter: nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    })
  };
}

/** 发送一封邮件 */
async function sendMail({ subject, html, text }) {
  const { c, transporter } = getTransport();
  const info = await transporter.sendMail({
    from: `"${c.fromName}" <${c.user}>`,
    to: c.to,
    subject,
    text: text || '',
    html: html || ''
  });
  return { ok: true, messageId: info.messageId, to: c.to };
}

/** 连通性自检：设置页「测试发信」用 */
async function testConnection() {
  const c = getMailConfig();
  if (!c.enabled) {
    const missing = [];
    if (!c.host) missing.push('SMTP 服务器');
    if (!c.user) missing.push('发信邮箱');
    if (!c.pass) missing.push('授权码');
    if (!c.to) missing.push('收件邮箱');
    return { ok: false, error: '还没配置完整，缺少：' + missing.join('、') };
  }
  try {
    await sendMail({
      subject: '【AI妈妈】邮件推送测试成功 ✅',
      text: '姐妹，配置成功！以后每周的机会汇总会发到这里。',
      html: renderTestHtml()
    });
    return { ok: true, to: c.to, host: c.host };
  } catch (e) {
    return { ok: false, error: friendlyError(e), host: c.host, to: c.to };
  }
}

/** 把 SMTP 的英文报错翻译成姐妹看得懂的话 */
function friendlyError(e) {
  const msg = (e && e.message) || String(e);
  if (/Invalid login|535|authentication failed|Login Fail/i.test(msg)) {
    return '登录被拒绝：多半是把「邮箱密码」当成了「授权码」。QQ/163 邮箱必须用开启 SMTP 服务后生成的 16 位授权码。原始信息：' + msg;
  }
  if (/ETIMEDOUT|timeout|EHOSTUNREACH|ECONNREFUSED/i.test(msg)) {
    return '连不上 SMTP 服务器：请检查服务器地址和端口（QQ 邮箱用 smtp.qq.com:465）。原始信息：' + msg;
  }
  if (/self signed|certificate/i.test(msg)) {
    return '证书校验失败：可尝试把端口改为 587 并关闭 SSL。原始信息：' + msg;
  }
  return msg;
}

/* ---------------- 邮件模板（内联样式，兼容各家邮箱客户端） ---------------- */
const C = {
  bg: '#0d1020', card: '#161a2e', border: '#262b45', text: '#eef2f9',
  dim: '#98a2b8', brand: '#ff7a3d', brand2: '#ffa63d', urgent: '#ff5d5d', ok: '#4ade80'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTestHtml() {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:${C.bg};font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
  <div style="max-width:600px;margin:0 auto;background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:28px;color:${C.text}">
    <div style="font-size:20px;font-weight:800;color:${C.brand}">AI妈妈</div>
    <div style="font-size:12px;color:${C.dim};margin-top:2px">女性内容创作者的变现管家</div>
    <div style="height:1px;background:${C.border};margin:20px 0"></div>
    <div style="font-size:16px;font-weight:700">✅ 邮件推送配置成功</div>
    <p style="font-size:14px;line-height:1.9;color:${C.dim}">姐妹，这条邮箱已经打通了。以后每周一，妈妈会把新机会和值得学的经验帖发到这里。</p>
  </div></body></html>`;
}

/**
 * 渲染周报邮件 HTML
 * @param {Object} rp 周报对象
 * @param {Object} ctx { opps: Map, lessons: [], records: [] }
 */
function renderWeeklyHtml(rp, ctx) {
  const oppMap = ctx.oppMap || {};
  const urgent = (rp.urgentIds || []).map(id => oppMap[id]).filter(Boolean);
  const high = (rp.highPrizeIds || []).map(id => oppMap[id]).filter(Boolean);
  const lessons = (ctx.lessons || []).slice(0, 3);
  const records = (ctx.records || []).slice(0, 5);
  const counts = rp.counts || {};

  const oppRow = (o, extra) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid ${C.border}">
      <div style="font-size:11px;color:${C.brand2};font-weight:700">${esc(o.platform)} · ${esc(typeLabel(o.type))}</div>
      <div style="font-size:14px;font-weight:700;margin:3px 0">${esc(o.title)}</div>
      <div style="font-size:12.5px;color:${C.dim};line-height:1.7">${esc(o.summary || '')}</div>
      <div style="font-size:12.5px;color:${C.ok};margin-top:4px">💰 ${esc(o.reward || '—')}${extra ? ' · ' + extra : ''}</div>
    </td></tr>`;

  const lessonRow = l => `
    <tr><td style="padding:10px 0;border-bottom:1px solid ${C.border}">
      <div style="font-size:11px;color:${C.brand2};font-weight:700">${esc(l.platform)} · ${esc(l.topic)}</div>
      <div style="font-size:14px;font-weight:700;margin:3px 0">${esc(l.title)}</div>
      <div style="font-size:12.5px;color:${C.dim};line-height:1.7">${(l.keyPoints || []).slice(0, 2).map(p => '· ' + esc(p)).join('<br>')}</div>
    </td></tr>`;

  const recRow = r => `
    <div style="font-size:13px;padding:5px 0;color:${C.dim}">
      <b style="color:${C.text}">${esc(r.title)}</b> — ${esc(statusLabel(r.status))}
    </div>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px 12px;background:${C.bg};font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
<div style="max-width:620px;margin:0 auto;background:${C.card};border:1px solid ${C.border};border-radius:18px;overflow:hidden;color:${C.text}">
  <div style="padding:26px 26px 18px;background:linear-gradient(135deg,rgba(255,107,61,.18),rgba(255,166,61,.06))">
    <div style="font-size:21px;font-weight:800">AI妈妈 <span style="font-size:13px;font-weight:600;color:${C.dim}">· 本周机会周报</span></div>
    <div style="font-size:12px;color:${C.dim};margin-top:3px">女性内容创作者的变现管家 · ${esc(rp.week || '')}</div>
  </div>

  <div style="padding:22px 26px">
    <div style="font-size:16px;font-weight:800;color:${C.brand2};line-height:1.6">${esc(rp.headline || '')}</div>
    <div style="margin-top:12px;background:rgba(255,107,61,.08);border-left:3px solid ${C.brand};border-radius:8px;padding:12px 14px;font-size:13.5px;line-height:1.85;color:${C.text}">
      ${esc(rp.aiComment || '')}
    </div>

    <div style="margin-top:18px;font-size:12px;color:${C.dim}">
      机会库共 ${esc(rp.totalCount || 0)} 条 · 流量分成 ${counts.flow || 0} · 投稿评奖 ${counts.prize || 0} · 产品上架 ${counts.product || 0} · 免费申样 ${counts.sample || 0}
    </div>

    ${urgent.length ? `<div style="margin-top:22px;font-size:13px;font-weight:800;letter-spacing:1px;color:${C.urgent}">⏰ 即将截止（先处理这些）</div>
    <table style="width:100%;border-collapse:collapse">${urgent.map(o => oppRow(o, '剩 ' + daysLeft(o.deadline) + ' 天')).join('')}</table>` : ''}

    ${high.length ? `<div style="margin-top:22px;font-size:13px;font-weight:800;letter-spacing:1px;color:${C.brand2}">💰 奖金最高的机会</div>
    <table style="width:100%;border-collapse:collapse">${high.map(o => oppRow(o)).join('')}</table>` : ''}

    ${lessons.length ? `<div style="margin-top:22px;font-size:13px;font-weight:800;letter-spacing:1px;color:${C.brand2}">📚 本周值得看的经验帖</div>
    <table style="width:100%;border-collapse:collapse">${lessons.map(lessonRow).join('')}</table>` : ''}

    ${records.length ? `<div style="margin-top:22px;font-size:13px;font-weight:800;letter-spacing:1px;color:${C.ok}">📌 你在跟进的活动</div>
    <div style="margin-top:8px">${records.map(recRow).join('')}</div>` : ''}

    <div style="margin-top:26px;padding-top:16px;border-top:1px solid ${C.border};font-size:12px;color:#6b7488;line-height:1.9">
      这封邮件由 AI妈妈 自动生成。妈妈不会保存你的平台账号密码，也不会代你登录或提交，所有操作都由你本人在官方页面完成。<br>
      想改收件邮箱或关掉推送，可以在工作台「设置」里调整。
    </div>
  </div>
</div></body></html>`;
}

function renderWeeklyText(rp, ctx) {
  const oppMap = ctx.oppMap || {};
  const lines = [];
  lines.push(`AI妈妈 · 本周机会周报（${rp.week || ''}）`);
  lines.push(rp.headline || '');
  lines.push(rp.aiComment || '');
  lines.push('');
  const urgent = (rp.urgentIds || []).map(id => oppMap[id]).filter(Boolean);
  if (urgent.length) {
    lines.push('【即将截止】');
    urgent.forEach(o => lines.push(`- [${o.platform}] ${o.title}（剩 ${daysLeft(o.deadline)} 天）${o.reward || ''}`));
    lines.push('');
  }
  const high = (rp.highPrizeIds || []).map(id => oppMap[id]).filter(Boolean);
  if (high.length) {
    lines.push('【高奖金机会】');
    high.forEach(o => lines.push(`- [${o.platform}] ${o.title} ${o.reward || ''}`));
    lines.push('');
  }
  if ((ctx.lessons || []).length) {
    lines.push('【本周值得看的经验帖】');
    ctx.lessons.slice(0, 3).forEach(l => lines.push(`- [${l.platform}] ${l.title}`));
    lines.push('');
  }
  lines.push('—— 由 AI妈妈 自动生成');
  return lines.join('\n');
}

function typeLabel(t) {
  return { flow: '流量分成', prize: '投稿评奖', product: '产品上架', sample: '免费申样' }[t] || t;
}
function statusLabel(s) {
  return {
    checked_in: '已参加', published: '已发布', reviewing: '评审中', rewarded: '已获奖',
    earning: '有收益', listed: '已上架', done: '已完成',
    ongoing: '进行中', submitted: '已投稿', won: '已中奖', ended: '已结束'
  }[s] || s;
}
function daysLeft(deadline) {
  if (!deadline) return 9999;
  const d = new Date(deadline + 'T23:59:59');
  return Math.ceil((d - new Date()) / 86400000);
}

module.exports = {
  MAIL_PRESETS,
  getMailConfig,
  describeMailConfig,
  sendMail,
  testConnection,
  renderWeeklyHtml,
  renderWeeklyText,
  renderTestHtml,
  friendlyError
};
