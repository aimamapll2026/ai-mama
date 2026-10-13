/**
 * AI妈妈 · 大模型适配层
 *
 * 设计原则：
 * 1. 兼容 OpenAI 风格的 /chat/completions 接口（DeepSeek / 通义 / 智谱 / Kimi / OpenAI 都是这个协议）
 * 2. 未配置 Key 时自动降级到本地规则引擎（lib/rules.js），保证任何环境都能跑
 * 3. 所有调用失败都不抛到用户界面，而是降级 + 标注来源
 *
 * 配置方式（二选一）：
 *   A. 在「设置」页填写 API Key（存 data/settings.json）
 *   B. 设置环境变量 AI_API_KEY / AI_BASE_URL / AI_MODEL
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/** 国内常见的兼容 OpenAI 协议的服务商预设 */
const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    applyUrl: 'https://platform.deepseek.com/api_keys',
    note: '性价比高，中文写作能力好，适合文案改写'
  },
  dashscope: {
    name: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    applyUrl: 'https://bailian.console.aliyun.com/',
    note: '有免费额度，qwen-plus 综合表现稳'
  },
  moonshot: {
    name: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    applyUrl: 'https://platform.moonshot.cn/console/api-keys',
    note: '长文本理解强，适合长文评估'
  },
  zhipu: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    applyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    note: 'glm-4-flash 有免费额度'
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    applyUrl: 'https://platform.openai.com/api-keys',
    note: '需要海外网络环境'
  }
};

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8'));
  } catch (e) {
    return {};
  }
}

/** 读取生效的 AI 配置（设置页优先，其次环境变量） */
function getAiConfig() {
  const s = readSettings();
  const key = (s.aiApiKey || process.env.AI_API_KEY || '').trim();
  const provider = (s.aiProvider || process.env.AI_PROVIDER || 'deepseek').trim();
  const preset = PROVIDERS[provider] || {};
  const baseUrl = (s.aiBaseUrl || process.env.AI_BASE_URL || preset.baseUrl || '').replace(/\/+$/, '');
  const model = (s.aiModel || process.env.AI_MODEL || preset.model || '').trim();
  return {
    enabled: !!key,
    key,
    provider,
    providerName: (preset.name || provider),
    baseUrl,
    model,
    temperature: s.aiTemperature != null ? Number(s.aiTemperature) : 0.7,
    timeout: Number(s.aiTimeout || process.env.AI_TIMEOUT || 60000)
  };
}

/** 给前端用的配置摘要（绝不返回 Key 本身） */
function describeAiConfig() {
  const c = getAiConfig();
  return {
    enabled: c.enabled,
    provider: c.provider,
    providerName: c.providerName,
    baseUrl: c.baseUrl,
    model: c.model,
    keyMasked: c.key ? c.key.slice(0, 5) + '****' + c.key.slice(-4) : '',
    providers: Object.entries(PROVIDERS).map(([k, v]) => ({
      id: k, name: v.name, baseUrl: v.baseUrl, model: v.model, applyUrl: v.applyUrl, note: v.note
    }))
  };
}

/**
 * 调用大模型（OpenAI 兼容协议）
 * @param {Array} messages [{role, content}]
 * @param {Object} opt { json: 是否要求返回 JSON, maxTokens, temperature }
 * @returns {Promise<string>} 模型返回的纯文本
 */
async function chat(messages, opt = {}) {
  const c = getAiConfig();
  if (!c.enabled) throw new Error('AI_NOT_CONFIGURED');
  if (!c.baseUrl || !c.model) throw new Error('AI_CONFIG_INCOMPLETE');

  const body = {
    model: c.model,
    messages,
    temperature: opt.temperature != null ? opt.temperature : c.temperature,
    stream: false
  };
  if (opt.maxTokens) body.max_tokens = opt.maxTokens;
  if (opt.json) body.response_format = { type: 'json_object' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), c.timeout);
  try {
    const res = await fetch(c.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + c.key
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const raw = await res.text();
    if (!res.ok) {
      let hint = raw.slice(0, 300);
      try { hint = JSON.parse(raw).error?.message || hint; } catch (e) {}
      throw new Error(`模型接口返回 ${res.status}：${hint}`);
    }
    let data;
    try { data = JSON.parse(raw); } catch (e) { throw new Error('模型返回内容不是合法 JSON'); }
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型返回内容为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** 从模型返回里稳妥地抠出 JSON（有些模型会包 ```json 代码块） */
function parseJsonLoose(text) {
  if (!text) throw new Error('内容为空');
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch (e) {}
  const start = t.search(/[{[]/);
  if (start >= 0) {
    for (let end = t.length; end > start; end--) {
      const slice = t.slice(start, end);
      try { return JSON.parse(slice); } catch (e) {}
    }
  }
  throw new Error('无法解析模型返回的 JSON');
}

/** 连通性自检：设置页「测试连接」用 */
async function testConnection() {
  const c = getAiConfig();
  if (!c.enabled) return { ok: false, error: '还没有填写 API Key' };
  const t0 = Date.now();
  try {
    const out = await chat(
      [{ role: 'user', content: '请只回复两个字：可用' }],
      { maxTokens: 20, temperature: 0 }
    );
    return { ok: true, latency: Date.now() - t0, model: c.model, reply: String(out).trim().slice(0, 40) };
  } catch (e) {
    return { ok: false, error: e.message, model: c.model };
  }
}

module.exports = { PROVIDERS, getAiConfig, describeAiConfig, chat, parseJsonLoose, testConnection };
