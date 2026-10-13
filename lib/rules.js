/**
 * AI妈妈 · 本地规则引擎
 *
 * 从 server.js 抽出来，作为大模型不可用时的兜底逻辑。
 * 特点：纯本地计算、零成本、结果可解释可复核。
 * 输出结构与 AI 版本完全一致，前端不用区分。
 */

/* ---------------- 获奖胜算评估 ---------------- */
function evaluate(opp, text) {
  const items = [];
  const len = String(text).replace(/\s/g, '').length;
  const reqStr = (opp.requirement || '') + (opp.reviewDimensions || '');

  // 1. 字数 / 篇幅
  let lenScore = 70, lenNote = `当前约 ${len} 字，活动未明确字数要求，按通用标准评估`;
  const rangeMatch = reqStr.match(/(\d+)\s*[~～\-到]\s*(\d+)\s*字/);
  const singleMatch = reqStr.match(/字数\s*(\d+)/) || reqStr.match(/(\d+)\s*字/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10), hi = parseInt(rangeMatch[2], 10);
    if (len >= lo && len <= hi) { lenScore = 100; lenNote = `约 ${len} 字，落在要求区间 ${lo}~${hi} 字内 ✅`; }
    else if (len < lo) { lenScore = Math.max(30, 100 - Math.round((lo - len) / lo * 100)); lenNote = `约 ${len} 字，比要求的 ${lo} 字少了 ${lo - len} 字，建议扩充`; }
    else { lenScore = Math.max(40, 100 - Math.round((len - hi) / hi * 60)); lenNote = `约 ${len} 字，超出上限 ${hi} 字，建议精简`; }
  } else if (singleMatch) {
    const target = parseInt(singleMatch[1], 10);
    if (target < 100) {
      lenNote = `活动要求「${opp.requirement || ''}」，请自行核对时长/篇幅`;
    } else if (len >= target * 0.8) { lenScore = 95; lenNote = `约 ${len} 字，满足要求（≥${target} 字） ✅`; }
    else { lenScore = 55; lenNote = `约 ${len} 字，未达到要求的 ${target} 字，建议补足`; }
  }
  items.push({ name: '篇幅 / 字数要求', score: lenScore, note: lenNote });

  // 2. 主题契合
  const theme = (opp.title || '').match(/[「《【]([^」》】]+)[」》】]/);
  const kwScore = theme && String(text).includes(theme[1]) ? 95 : (String(text).length > 100 ? 70 : 60);
  const kwNote = theme
    ? (String(text).includes(theme[1]) ? `文案中出现了主题词「${theme[1]}」，契合度高 ✅` : `文案中未明显出现主题词「${theme[1]}」，建议在标题或开头点题`)
    : '该活动无明确主题词，按通用契合度评估';
  items.push({ name: '题材 / 主题契合', score: kwScore, note: kwNote });

  // 3. 原创 / 首发风险
  const needsFirst = /首发|未发布|原创首发|独家/.test(reqStr);
  items.push({
    name: '原创 / 首发风险',
    score: needsFirst ? 65 : 90,
    note: needsFirst
      ? '该活动要求「首发 / 未发布」，请确认此文未在其他平台发布过 ⚠️'
      : '未检测到首发冲突信息'
  });

  // 4. 结构完整度
  let structScore = 60; const structNotes = [];
  if (/[？?]|^第|\d+个|\d+种|如何|怎么/.test(String(text).slice(0, 40))) { structScore += 15; structNotes.push('开头有钩子'); }
  if (String(text).length > 300) { structScore += 10; structNotes.push('内容有展开'); }
  if (/总结|最后|综上|所以|希望|建议/.test(String(text).slice(-200))) { structScore += 15; structNotes.push('有收尾'); }
  structScore = Math.min(100, structScore);
  items.push({
    name: '结构完整度',
    score: structScore,
    note: structNotes.length ? '检测到：' + structNotes.join('、') : '结构较平，建议加开头钩子与结尾总结'
  });

  // 5. 评审维度覆盖
  items.push({
    name: '评审维度覆盖',
    score: opp.reviewDimensions ? 75 : 70,
    note: opp.reviewDimensions
      ? `该活动评审维度：${opp.reviewDimensions}。请对照自查是否覆盖了权重最高的那一项`
      : '活动未公开评审维度，按通用标准评估'
  });

  const total = Math.round(
    items[0].score * 0.2 + items[1].score * 0.25 + items[2].score * 0.2 +
    items[3].score * 0.2 + items[4].score * 0.15
  );
  const verdict = total >= 85 ? '推荐投稿（胜算较高）'
    : total >= 70 ? '可以投稿，建议按建议优化后再投'
    : total >= 55 ? '谨慎投稿，需较大修改'
    : '不建议直接投稿，建议重写或换活动';

  const suggestions = items.filter(it => it.score < 85).map(it => `【${it.name}】${it.note}`);
  if (!suggestions.length) suggestions.push('各项要求均达标，整体质量不错，可微调细节后直接投稿。');

  const risks = [];
  if (needsFirst) risks.push('该活动要求首发/未发布，切勿先在别处发布，否则可能失去资格。');
  if (len < 300 && opp.type === 'prize') risks.push('篇幅偏短，部分评审看内容厚度，建议适当扩充。');
  if (!risks.length) risks.push('未发现明显硬伤。');

  return {
    opportunityId: opp.id,
    opportunityTitle: opp.title,
    platform: opp.platform,
    total, verdict, items, suggestions, risks,
    evaluatedAt: new Date().toISOString(),
    disclaimer: '评估基于活动公开要求与文案文本特征的匹配度计算，为参考性意见，不代表最终评选结果。'
  };
}

/* ---------------- 定向改写 ---------------- */
const HOOKS = ['我用亲身经历告诉你：', '真实复盘：', '3 个月实战总结：', '别再踩坑了，'];

function rewrite(opp, text) {
  const themeMatch = (opp.title || '').match(/[「《【]([^」》】]+)[」》】]/);
  const theme = themeMatch ? themeMatch[1] : '';
  const reqStr = (opp.requirement || '') + (opp.reviewDimensions || '');
  const rangeMatch = reqStr.match(/(\d+)\s*[~～\-到]\s*(\d+)\s*字/);
  const targetLo = rangeMatch ? parseInt(rangeMatch[1], 10) : null;
  const targetHi = rangeMatch ? parseInt(rangeMatch[2], 10) : null;

  let out = String(text).trim();
  const lines = out.split('\n');
  const firstLine = lines[0] || '';
  const hook = HOOKS[Math.floor(Math.random() * HOOKS.length)];
  const newTitle = (theme && !firstLine.includes(theme))
    ? `${hook}关于「${theme}」，我想说的都在这里`
    : hook + firstLine;
  out = newTitle + '\n\n' + lines.slice(1).join('\n').trim();

  if (theme && !out.includes(theme)) {
    out = out.replace(/\n\n/, `\n\n今天想聊聊「${theme}」这个话题。\n\n`);
  }

  const curLen = out.replace(/\s/g, '').length;
  if (targetLo && curLen < targetLo) {
    const filler = `\n\n补充一点细节：${theme ? `在「${theme}」这件事上，` : ''}我实际操作时还注意到一个容易被忽略的点——很多人失败不是因为方法不对，而是执行节奏乱了。我的做法是把它拆成小步骤，每完成一步就复盘一次，这样即使中间卡住也能快速调整。这部分经验对我帮助很大，希望对看到这里的你也有用。\n`;
    out += filler.repeat(Math.max(1, Math.ceil((targetLo - curLen) / filler.replace(/\s/g, '').length)));
  } else if (targetHi && curLen > targetHi) {
    out = out.replace(/\n{3,}/g, '\n\n');
    const cut = Math.ceil((curLen - targetHi) / curLen * out.length);
    out = out.slice(0, out.length - cut) + '……';
  }

  if (!/欢迎|评论|关注|点赞|收藏/.test(out.slice(-200))) {
    out += `\n\n如果你也在${theme ? `「${theme}」` : '这件事'}上摸索，欢迎在评论区聊聊你的经历，我会一条条回复。觉得有用的话，点个赞让更多人看到。`;
  }
  return { rewritten: out, opportunityTitle: opp.title, platform: opp.platform };
}

/* ---------------- 产品化分析 ---------------- */
function productize(text) {
  const s = String(text);
  const len = s.replace(/\s/g, '').length;
  const isHowTo = /如何|怎么|教程|方法|步骤|经验|复盘|实战/.test(s);
  const hasData = /\d+%|\d+倍|\d+个月|\d+天|月入|收入/.test(s);
  const potential = Math.min(95, 40 + (isHowTo ? 25 : 0) + (hasData ? 20 : 0) + Math.min(15, Math.floor(len / 200)));

  return {
    potential,
    verdict: potential >= 80 ? '推荐做成知识付费产品' : potential >= 60 ? '有潜力，建议补充方法论后上架' : '暂不建议，内容偏碎片化',
    reasons: [
      isHowTo ? '内容包含方法/经验类信息，具备「可复制」属性 ✅' : '内容偏叙事，缺少可复制的步骤，建议补充方法部分',
      hasData ? '包含具体数据，说服力强 ✅' : '缺少具体数据支撑，建议加入真实数字',
      `全文约 ${len} 字，${len > 500 ? '可作为图文资料包' : '偏短，建议扩充为完整资料'}`
    ],
    priceSuggestion: potential >= 80 ? '19~99 元' : potential >= 60 ? '9.9~29 元' : '建议先免费引流',
    recommendPlatforms: [
      { name: '闲鱼', reason: '门槛最低，适合快速验证有没有人买' },
      { name: '小红书', reason: '用户付费意愿相对高，适合轻咨询+资料组合' },
      { name: '抖音', reason: '有流量基础时可挂载课程，转化直接' }
    ],
    outline: [
      '第一章：我为什么要做这件事（背景与动机）',
      '第二章：从 0 到 1 的完整步骤拆解',
      '第三章：我踩过的坑与避坑清单',
      '第四章：可直接套用的模板与清单',
      '第五章：常见问题答疑'
    ],
    firstStep: '先把文案里的「方法部分」单独拎出来，列成一份可执行的步骤清单。',
    disclaimer: '产品化潜力为基于文本特征的参考性评估；平台上架需你本人操作，平台不提供自动上架接口。'
  };
}

/* ---------------- 冲突检测 ---------------- */
function conflict({ text, opp, activeOpps }) {
  const conflicts = [];
  const t = String(text || '').slice(0, 80);
  const needsFirst = opp ? /首发|未发布|独家/.test((opp.requirement || '') + (opp.reviewDimensions || '')) : false;

  if (needsFirst) {
    conflicts.push({
      type: 'first_release',
      message: `「${opp.title}」要求首发/未发布，若你同时把内容发到其他平台或上架售卖，可能失去资格`
    });
  }
  (activeOpps || []).forEach(o => {
    if (opp && o.id === opp.id) return;
    if (/首发|未发布|独家/.test((o.requirement || '') + (o.reviewDimensions || ''))) {
      conflicts.push({
        type: 'cross_conflict',
        message: `你已参加的「${o.title}」同样要求首发/未发布，两份要求可能互相冲突`
      });
    }
  });
  if (!t && !conflicts.length) {
    conflicts.push({ type: 'hint', message: '未检测到明显冲突，但建议投稿前确认该内容未在其他平台首发。' });
  }
  return { conflicts, risks: [], tip: '' };
}

/* ---------------- 周报导语 ---------------- */
function reportComment(report, urgent, highPrize) {
  if (!urgent.length && !highPrize.length) return '姐妹，本周风平浪静，妈妈继续帮你盯着。';
  const tips = [];
  if (urgent.length) tips.push(`有 ${urgent.length} 个活动快截止了，先处理这些`);
  if (highPrize.length) tips.push(`「${highPrize[0].title}」奖金最高，值得优先考虑`);
  return '姐妹，' + tips.join('；') + '。';
}

module.exports = { evaluate, rewrite, productize, conflict, reportComment };
