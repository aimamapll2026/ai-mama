/**
 * AI妈妈 v1.4 · 后端接口回归测试
 * 覆盖：AI 引擎降级链路、邮件配置、周报发送、原有功能未回归
 */
const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE || `http://localhost:${PORT}/api`;
let pass = 0, fail = 0;
const fails = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`); }
}
async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

const SAMPLE_TEXT = `我做家居内容三年了，今天想聊聊小户型收纳这件事。

第一，别买成套收纳盒。不同柜子的深度不一样，成套的买回来一半用不上。
第二，先量尺寸再买。我吃过亏，买回来的盒子塞不进柜子，退货花了半个月。
第三，按使用频率分层。常用的放腰线高度，不常用的放最上层。
第四，留白比塞满更重要。视觉上太满会让人压抑。

总结一下，收纳的本质不是买更多工具，而是重新梳理你和物品的关系。希望对你有帮助。`;

(async () => {
  console.log('\n===== 1. 基础功能回归 =====');
  let r = await req('GET', '/health');
  ok('健康检查', r.data?.ok === true);
  r = await req('GET', '/meta');
  ok('机会统计含 sample', r.data?.counts?.sample === 6, JSON.stringify(r.data?.counts));
  ok('机会总数 24', r.data?.counts?.all === 24, '实际 ' + r.data?.counts?.all);
  r = await req('GET', '/lessons');
  ok('学习内容 6 条', r.data?.total === 6, '实际 ' + r.data?.total);
  r = await req('GET', '/lessons?topic=变现');
  ok('学习内容按主题筛选', r.data?.list?.length > 0 && r.data.list.every(l => l.topic === '变现'));

  console.log('\n===== 2. AI 引擎：未配置时降级 =====');
  r = await req('GET', '/ai/config');
  ok('AI 配置接口可读', r.data?.ok === true);
  ok('未配置时 enabled=false', r.data?.config?.enabled === false);
  ok('返回服务商列表', Array.isArray(r.data?.config?.providers) && r.data.config.providers.length >= 5);
  ok('不泄露 Key 明文', r.data?.config?.keyMasked === '');

  r = await req('POST', '/ai/evaluate', { opportunityId: 'op-prize-003', text: SAMPLE_TEXT });
  const ev = r.data?.evaluation;
  ok('评估接口返回', r.data?.ok === true && !!ev);
  ok('评估带 source 字段', ev?.source === 'rule', 'source=' + ev?.source);
  ok('评估带 engine 字段', typeof ev?.engine === 'string' && ev.engine.length > 0);
  ok('评估带降级原因', typeof ev?.fallbackReason === 'string' && ev.fallbackReason.includes('API Key'));
  ok('评估有 5 个维度', ev?.items?.length === 5, '实际 ' + ev?.items?.length);
  ok('总分在 0-100', ev?.total >= 0 && ev?.total <= 100);
  ok('有改进建议', Array.isArray(ev?.suggestions) && ev.suggestions.length > 0);
  ok('有风险提示', Array.isArray(ev?.risks) && ev.risks.length > 0);

  r = await req('POST', '/ai/rewrite', { opportunityId: 'op-prize-003', text: SAMPLE_TEXT });
  ok('改写接口返回', r.data?.ok === true && typeof r.data?.rewritten === 'string');
  ok('改写带 source', r.data?.source === 'rule');
  ok('改写稿非空且不等于原文', r.data?.rewritten?.length > 50 && r.data.rewritten !== SAMPLE_TEXT);

  r = await req('POST', '/ai/productize', { text: SAMPLE_TEXT });
  ok('产品化分析返回', r.data?.ok === true && !!r.data?.analysis);
  ok('产品化带 source', r.data?.analysis?.source === 'rule');
  ok('有潜力分数字段', typeof r.data?.analysis?.potential === 'number');
  ok('有推荐平台', Array.isArray(r.data?.analysis?.recommendPlatforms) && r.data.analysis.recommendPlatforms.length > 0);

  r = await req('POST', '/ai/conflict', { text: SAMPLE_TEXT, opportunityId: 'op-prize-003' });
  ok('冲突检测返回', r.data?.ok === true && Array.isArray(r.data?.conflicts));
  ok('冲突检测带 source', r.data?.source === 'rule');

  console.log('\n===== 3. 参数校验 =====');
  r = await req('POST', '/ai/evaluate', { opportunityId: 'not-exist', text: 'x' });
  ok('不存在的活动被拒绝', r.status === 400 && r.data?.ok === false);
  r = await req('POST', '/ai/evaluate', { opportunityId: 'op-prize-003', text: '' });
  ok('空文案被拒绝', r.status === 400);
  r = await req('POST', '/ai/productize', { text: '   ' });
  ok('空文案产品化被拒绝', r.status === 400);
  r = await req('POST', '/ai/test', {});
  ok('未配置时测试连接返回失败而非报错', r.status === 200 && r.data?.ok === false);

  console.log('\n===== 4. 邮件配置 =====');
  r = await req('GET', '/mail/config');
  const mc = r.data?.config;
  ok('邮件配置接口可读', r.data?.ok === true);
  ok('自动识别 QQ 邮箱', mc?.provider === 'qq', 'provider=' + mc?.provider);
  ok('自动带出 SMTP 服务器', mc?.host === 'smtp.qq.com', 'host=' + mc?.host);
  ok('端口 465 且 SSL', mc?.port === 465 && mc?.secure === true);
  ok('自动带出收件邮箱', mc?.to === '375087889@qq.com', 'to=' + mc?.to);
  ok('未配置授权码时 enabled=false', mc?.enabled === false);
  ok('不泄露授权码', mc?.passSet === false && mc.pass === undefined);
  ok('提供邮箱服务商预设', Array.isArray(mc?.presets) && mc.presets.length >= 4);

  r = await req('POST', '/mail/test', {});
  ok('未配置授权码时提示明确', r.data?.ok === false && /授权码/.test(r.data?.result?.error || ''), r.data?.result?.error);

  r = await req('POST', '/mail/send-report', {});
  ok('未配置时发周报被友好拒绝', r.status === 400 && /授权码|配置/.test(r.data?.error || ''), r.data?.error);

  console.log('\n===== 5. 配置保存与脱敏 =====');
  r = await req('PUT', '/ai/config', { aiProvider: 'dashscope', aiBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', aiModel: 'qwen-plus' });
  ok('AI 配置可保存', r.data?.ok === true && r.data?.config?.provider === 'dashscope');
  r = await req('PUT', '/ai/config', { aiApiKey: 'sk-test-abcd1234efgh5678' });
  ok('Key 保存后 enabled=true', r.data?.config?.enabled === true);
  ok('Key 返回时脱敏', /^sk-te\*+5678$/.test(r.data?.config?.keyMasked || ''), r.data?.config?.keyMasked);
  const sent = JSON.stringify(r.data);
  ok('响应体内无完整 Key', !sent.includes('abcd1234efgh'));

  r = await req('POST', '/ai/test', {});
  ok('假 Key 测试连接失败但不崩溃', r.status === 200 && r.data?.ok === false);
  ok('失败原因可读', typeof r.data?.result?.error === 'string' && r.data.result.error.length > 0);

  r = await req('PUT', '/ai/config', { aiApiKey: '', clearKey: true, aiProvider: 'deepseek', aiBaseUrl: 'https://api.deepseek.com/v1', aiModel: 'deepseek-chat' });
  ok('可清除 Key 回到规则引擎', r.data?.config?.enabled === false);

  r = await req('PUT', '/mail/config', { smtpProvider: 'qq', smtpUser: '375087889@qq.com', email: '375087889@qq.com' });
  ok('邮件配置可保存', r.data?.ok === true && r.data?.config?.user === '375087889@qq.com');

  console.log('\n===== 6. 周报 =====');
  r = await req('POST', '/reports/generate', {});
  ok('生成周报成功', r.data?.ok === true && !!r.data?.report);
  const rp = r.data?.report;
  ok('周报含 sample 统计', typeof rp?.counts?.sample === 'number', 'sample=' + rp?.counts?.sample);
  ok('周报有 headline', typeof rp?.headline === 'string' && rp.headline.length > 0);
  ok('周报有 urgentIds', Array.isArray(rp?.urgentIds));
  ok('周报有 highPrizeIds', Array.isArray(rp?.highPrizeIds));
  r = await req('GET', '/reports');
  ok('周报列表可读', r.data?.ok === true && r.data.list.length > 0);

  console.log('\n' + '='.repeat(46));
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); }
  console.log('='.repeat(46) + '\n');
  process.exit(fail ? 1 : 0);
})();
