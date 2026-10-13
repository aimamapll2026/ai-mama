/**
 * AI妈妈 · AI 任务编排层
 *
 * 每个任务都是「大模型优先，规则引擎兜底」：
 *   - 配了 Key → 调大模型，返回 source:'ai'，并带上模型名
 *   - 没配 Key / 调用失败 → 走本地规则引擎，返回 source:'rule'，并说明原因
 *
 * 这样姐妹在任何环境打开都能用，配了 Key 就自动升级。
 */
const ai = require('./ai');
const rules = require('./rules');

/** 统一的降级包装 */
async function withFallback(taskName, aiFn, ruleFn) {
  const cfg = ai.getAiConfig();
  if (!cfg.enabled) {
    const out = await ruleFn();
    return {
      ...out,
      source: 'rule',
      engine: '本地规则引擎',
      fallbackReason: '还没有配置大模型 API Key，先用本地规则引擎给你算一版'
    };
  }
  try {
    const out = await aiFn(cfg);
    return { ...out, source: 'ai', engine: cfg.providerName + ' · ' + cfg.model };
  } catch (e) {
    const out = await ruleFn();
    return {
      ...out,
      source: 'rule',
      engine: '本地规则引擎',
      fallbackReason: '大模型调用失败（' + (e.message || '未知错误') + '），已自动降级为本地规则引擎'
    };
  }
}

const SYSTEM_WRITER = `你是一位帮助女性内容创作者变现的资深内容顾问，中文写作功底扎实。
你的建议要具体、可执行，不要空话套话；用「姐妹」称呼对方，语气亲切但专业。
涉及平台规则时，只依据常识给建议，不要编造具体的政策条款、奖励金额或日期。`;

/** 把机会对象压缩成提示词里的简报 */
function oppBrief(opp) {
  return [
    `活动名称：${opp.title}`,
    `平台：${opp.platform}`,
    `类型：${opp.type}`,
    `收益：${opp.reward || '未标注'}`,
    `参与要求：${opp.requirement || '未标注'}`,
    opp.reviewDimensions ? `评审维度：${opp.reviewDimensions}` : '',
    opp.deadline ? `截止日期：${opp.deadline}` : ''
  ].filter(Boolean).join('\n');
}

/* ---------------- 1. 获奖胜算评估 ---------------- */
async function evaluate(opp, text) {
  return withFallback('evaluate',
    async (cfg) => {
      const prompt = `请评估下面这篇文案投稿到该活动后的获奖胜算。

【活动信息】
${oppBrief(opp)}

【我的文案】
${text}

请严格输出 JSON，不要任何多余文字，格式如下：
{
  "total": 0-100 的整数总分,
  "verdict": "一句话结论，20字以内",
  "items": [
    {"name":"维度名","score":0-100 整数,"note":"一句话说明，要具体，指出文案里的哪句话/哪个问题"}
  ],
  "suggestions": ["具体可执行的修改建议，每条一句话，3-5条"],
  "risks": ["可能影响资格或评选的风险提示，1-3条"]
}

items 必须包含且只包含这 5 个维度（name 就用这 5 个词）：
"篇幅 / 字数要求"、"题材 / 主题契合"、"原创 / 首发风险"、"结构完整度"、"评审维度覆盖"
评分要拉开差距、真实反映文案问题，不要一律给高分。`;

      const out = await ai.chat(
        [{ role: 'system', content: SYSTEM_WRITER }, { role: 'user', content: prompt }],
        { json: true, maxTokens: 2000, temperature: 0.3 }
      );
      const j = ai.parseJsonLoose(out);
      const ruleBase = await rules.evaluate(opp, text);
      return {
        total: clampScore(j.total),
        verdict: String(j.verdict || ruleBase.verdict).slice(0, 40),
        items: normalizeItems(j.items, ruleBase.items),
        suggestions: normList(j.suggestions, ruleBase.suggestions),
        risks: normList(j.risks, ruleBase.risks),
        opportunityId: opp.id,
        opportunityTitle: opp.title,
        platform: opp.platform,
        evaluatedAt: new Date().toISOString(),
        disclaimer: '评估由 AI 依据活动公开要求与文案内容分析生成，为参考性意见，不代表最终评选结果。'
      };
    },
    () => rules.evaluate(opp, text)
  );
}

/* ---------------- 2. 定向改写 ---------------- */
async function rewrite(opp, text) {
  return withFallback('rewrite',
    async (cfg) => {
      const theme = (opp.title || '').match(/[「《【]([^」》】]+)[」》】]/);
      const prompt = `请把下面这篇文案，按该活动的要求改写成更容易获奖的版本。

【活动信息】
${oppBrief(opp)}

【我的原稿】
${text}

要求：
1. 保留原稿的核心观点和个人经历，不要编造原文里没有的事实、数据或案例
2. 针对活动评审维度逐条优化，标题要有吸引力
3. 严格满足活动的字数 / 篇幅要求（如果活动有明确要求）
${theme ? `4. 全文要自然点出主题「${theme[1]}」` : ''}
5. 结尾加一句自然的互动引导

只输出改写后的完整文案正文，不要输出任何解释、前言或 Markdown 代码块标记。`;
      const out = await ai.chat(
        [{ role: 'system', content: SYSTEM_WRITER }, { role: 'user', content: prompt }],
        { maxTokens: 4000, temperature: 0.7 }
      );
      const cleaned = String(out).replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
      if (!cleaned) throw new Error('模型返回内容为空');
      return { rewritten: cleaned, opportunityTitle: opp.title, platform: opp.platform };
    },
    () => rules.rewrite(opp, text)
  );
}

/* ---------------- 3. 产品化分析 ---------------- */
async function productize(text) {
  return withFallback('productize',
    async (cfg) => {
      const prompt = `请分析下面这段文案能不能做成知识付费产品拿去卖。

【文案】
${text}

请严格输出 JSON，不要多余文字：
{
  "potential": 0-100 整数，产品化潜力分,
  "verdict": "一句话结论，20字以内",
  "reasons": ["判断依据，每条一句话，3条，要引用文案里的具体内容"],
  "priceSuggestion": "建议定价区间，如 19~99 元",
  "recommendPlatforms": [{"name":"平台名","reason":"为什么适合，一句话"}],
  "outline": ["产品章节大纲，5条，每条是一个具体章节标题"],
  "firstStep": "如果她现在就动手，第一步该做什么，一句话"
}

推荐平台从这几个里选 3 个最合适的：闲鱼、小红书、抖音、猪八戒、视频号、知乎。`;
      const out = await ai.chat(
        [{ role: 'system', content: SYSTEM_WRITER }, { role: 'user', content: prompt }],
        { json: true, maxTokens: 2000, temperature: 0.5 }
      );
      const j = ai.parseJsonLoose(out);
      const base = await rules.productize(text);
      return {
        potential: clampScore(j.potential),
        verdict: String(j.verdict || base.verdict).slice(0, 40),
        reasons: normList(j.reasons, base.reasons),
        priceSuggestion: String(j.priceSuggestion || base.priceSuggestion),
        recommendPlatforms: Array.isArray(j.recommendPlatforms) && j.recommendPlatforms.length
          ? j.recommendPlatforms.slice(0, 4).map(p => ({ name: String(p.name || ''), reason: String(p.reason || '') }))
          : base.recommendPlatforms,
        outline: normList(j.outline, base.outline),
        firstStep: String(j.firstStep || ''),
        disclaimer: '产品化潜力为 AI 基于文案内容的参考性评估；平台上架需你本人操作，平台不提供自动上架接口。'
      };
    },
    () => rules.productize(text)
  );
}

/* ---------------- 4. 冲突与风险会诊 ---------------- */
async function conflict({ text, opp, activeOpps }) {
  const ruleOut = await rules.conflict({ text, opp, activeOpps });
  return withFallback('conflict',
    async (cfg) => {
      const prompt = `一位内容创作者准备把下面的文案投给「${opp.title}」（${opp.platform}）。
她同时还在参加这些活动：
${activeOpps.map((o, i) => `${i + 1}. ${o.title}（${o.platform}）要求：${o.requirement || '未标注'}`).join('\n') || '（暂无）'}

【她的文案】
${text || '（未提供）'}

请用 JSON 输出你发现的冲突与风险：
{
  "risks": [{"level":"high|medium|low","title":"风险标题","detail":"具体说明该怎么办，一到两句话"}],
  "tip": "给她的总体建议，一句话"
}

重点排查：首发/独家要求冲突、同一内容多渠道使用的重复风险、平台规则红线。
不要编造不存在的规则条款。如果没有明显风险，risks 给一条 low 级别的提示即可。`;
      const out = await ai.chat(
        [{ role: 'system', content: SYSTEM_WRITER }, { role: 'user', content: prompt }],
        { json: true, maxTokens: 1500, temperature: 0.3 }
      );
      const j = ai.parseJsonLoose(out);
      return {
        risks: Array.isArray(j.risks) ? j.risks.slice(0, 5).map(r => ({
          level: ['high', 'medium', 'low'].includes(r.level) ? r.level : 'medium',
          title: String(r.title || '风险提示'),
          detail: String(r.detail || '')
        })) : [],
        tip: String(j.tip || ''),
        conflicts: ruleOut.conflicts
      };
    },
    () => ruleOut
  );
}

/* ---------------- 5. 机会简报润色（可选，用于周报） ---------------- */
async function weeklyComment(report, urgent, highPrize, lessons) {
  return withFallback('weeklyComment',
    async (cfg) => {
      const prompt = `请为本周的机会周报写一段给「姐妹」的导语，80-120 字。
背景：本周共 ${report.totalCount} 条机会，其中 ${urgent.length} 个即将截止，奖金最高的是「${highPrize[0]?.title || '无'}」（${highPrize[0]?.reward || ''}）。
本周推荐学习：${lessons.slice(0, 3).map(l => l.title).join('；') || '暂无'}。

要求：口语化、有推动力、直接说该先做什么，不要罗列数字，不要客套话。只输出这段话本身。`;
      const out = await ai.chat([{ role: 'user', content: prompt }], { maxTokens: 400, temperature: 0.8 });
      const t = String(out).trim();
      if (!t) throw new Error('返回为空');
      return { aiComment: t };
    },
    () => ({ aiComment: rules.reportComment(report, urgent, highPrize) })
  );
}

/* ---------------- 小工具 ---------------- */
function clampScore(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 60;
  return Math.max(0, Math.min(100, n));
}
function normList(v, fallback) {
  if (Array.isArray(v) && v.length) return v.slice(0, 8).map(x => String(x));
  return fallback || [];
}
function normalizeItems(items, fallback) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 5).map(it => ({
    name: String(it.name || '维度'),
    score: clampScore(it.score),
    note: String(it.note || '')
  }));
}

module.exports = { evaluate, rewrite, productize, conflict, weeklyComment };
