/**
 * AI妈妈 · 数据存储适配层
 *
 * 同一套接口，两种后端：
 *   - 本地模式（默认）：直接读写 data/*.json，零依赖，适合自己电脑跑
 *   - 云端模式：写入腾讯云 CloudBase 云数据库，适合公网部署
 *
 * 切换方式：环境变量 STORAGE=cloud（或自动检测到 CloudBase 环境即启用）
 *
 * 云数据库集合名与文件名一一对应（去掉 .json）：
 *   opportunities / lessons / records / reports / contents / settings
 *
 * 关键差异处理：
 *   本地是「整文件覆盖写」，云数据库是「文档级写」。
 *   为保持接口一致，云端模式下：
 *     - read(name)   → 若是数组：取该集合全部文档；若是对象：取 _id='__single__' 的文档
 *     - write(name)  → 先清空集合再批量写入（数据量小，简单可靠）
 */
const fs = require('fs');
const path = require('path');

// 数据目录：
//   - 默认用项目内 data/（本地跑、Docker 都适用）
//   - 云平台持久盘（如 Render Disk 挂载在 /var/data）时，用 DATA_DIR 环境变量指过去
//   - 首启动若目标目录为空，自动从随代码分发的 data/seed.json 初始化，避免页面空白
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data');

/* ---------------- 云端 SDK 惰性加载 ---------------- */
let cloudDb = null;
let cloudReady = false;
let storageMode = 'local';
let cloudInitError = null;

function detectMode() {
  if (process.env.STORAGE === 'cloud') return 'cloud';
  if (process.env.STORAGE === 'local') return 'local';
  // 腾讯云 CloudBase 运行时会注入这些变量
  if (process.env.TENCENTCLOUD_RUNENV || process.env.SCF_RUNTIME || process.env.TCB_ENV) return 'cloud';
  return 'local';
}

/** 取云环境 ID：优先显式变量，其次云托管自动注入的变量 */
function envId() {
  return process.env.TCB_ENV
    || process.env.SCF_NAMESPACE
    || process.env.CLOUDBASE_ENV
    || process.env.TENCENTCLOUD_RUNENV_ENV
    || undefined;
}

function getCloudDb() {
  if (cloudDb) return cloudDb;
  const tcb = require('@cloudbase/node-sdk');
  const ver = parseInt(String(tcb.version || require('@cloudbase/node-sdk/package.json').version), 10) || 2;

  const opts = { timeout: 15000 };
  // 显式传环境 ID（v3 的 SYMBOL_CURRENT_ENV 是 Symbol，非云函数环境会解析失败导致
  // "access token env not consistency"，实测显式传环境 ID 最稳）
  opts.env = envId();

  if (ver >= 3) {
    // v3 SDK：官方推荐 accessKey（API Key）鉴权，见 docs.cloudbase.net/cloud-function/resource-integration/cloudbase
    const ak = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY;
    if (ak) opts.accessKey = ak;
    if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
      opts.secretId = process.env.TENCENTCLOUD_SECRETID;
      opts.secretKey = process.env.TENCENTCLOUD_SECRETKEY;
    }
  } else {
    // v2 SDK：显式 accessKey
    const ak = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY;
    if (ak) opts.accessKey = ak;
  }

  const app = tcb.init(opts);
  cloudDb = app.database();
  return cloudDb;
}

/**
 * 给任意 Promise 加超时，避免网络/鉴权问题导致接口无限挂起。
 * 超时后抛错，让上层走兜底逻辑（返回 fallback），用户看到的是空列表而不是转圈。
 */
function withTimeout(promise, ms, tag) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('云端数据库超时（' + tag + '，' + ms + 'ms）')), ms);
    Promise.resolve(promise).then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

/**
 * 首次启动兜底：若数据目录里还没有任何数据文件，
 * 就从随代码分发的种子目录复制一份过去。
 * （云平台持久盘第一次挂载是空的，不做这步页面会全空）
 */
function ensureSeedData() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (path.resolve(DATA_DIR) === path.resolve(SEED_DIR)) return; // 同一目录，无需复制

    const FILES = ['opportunities.json', 'lessons.json', 'records.json', 'reports.json', 'contents.json', 'settings.json'];
    let copied = 0;
    for (const f of FILES) {
      const dest = path.join(DATA_DIR, f);
      if (fs.existsSync(dest)) continue;
      const src = path.join(SEED_DIR, f);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, dest);
      copied++;
    }
    if (copied) console.log('   数据：✓ 已从种子数据初始化 ' + copied + ' 个文件 → ' + DATA_DIR);
  } catch (e) {
    console.warn('   ⚠️ 种子数据初始化失败：' + e.message);
  }
}

function init() {
  ensureSeedData();
  storageMode = detectMode();
  if (storageMode === 'cloud') {
    try {
      getCloudDb();
      cloudReady = true;
      cloudInitError = null;
      console.log('   存储：✓ 腾讯云 CloudBase 云数据库（环境 ' + (envId() || '自动') + '）');
      // 后台预建全部集合（集合不存在时，读请求报 ResourceNotFound、写请求报
      // "access token env not consistency"，都不好判断，干脆启动时统一建好）
      setTimeout(() => { ensureAllCollections().catch(() => {}); }, 100);
    } catch (e) {
      cloudInitError = e.message;
      console.warn('   ⚠️ 云数据库初始化失败，回退本地文件：', e.message);
      storageMode = 'local';
    }
  } else {
    console.log('   存储：○ 本地 JSON 文件（' + DATA_DIR + '）');
  }
  return storageMode;
}

/** 需要用到的全部集合名（与 data/*.json 一一对应） */
const ALL_COLLECTIONS = ['opportunities', 'lessons', 'records', 'reports', 'contents', 'settings'];

async function ensureAllCollections() {
  let allOk = true;
  for (const col of ALL_COLLECTIONS) {
    const r = await ensureCollection(col);
    if (r !== true) allOk = false;
  }
  // 只有全部建成功才判定健康；否则保留 false/null，让诊断如实反映问题
  if (allOk) cloudHealthy = true;
}

function mode() { return storageMode; }
function collection(name) { return String(name).replace(/\.json$/, ''); }

/* ---------------- 本地实现 ---------------- */
function localRead(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch (e) {
    return fallback;
  }
}
function localWrite(name, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), 'utf8');
}

/* ---------------- 云端实现 ---------------- */
const SINGLE_ID = '__single__';

// 记一次云端是否可用，避免每次请求都等一轮超时
let cloudHealthy = null;   // null=未知，true=可用，false=不可用
let lastCloudError = null; // 最近一次云端错误的详情（诊断用）

/** 集合不存在时自动创建。返回 true=成功，false=失败（供诊断判断真实连通性） */
const createdCols = new Set();
async function ensureCollection(col) {
  if (createdCols.has(col)) return true;
  try {
    const db = getCloudDb();
    await withTimeout(db.createCollection(col), 10000, 'create ' + col);
    console.log('   ✓ 已自动创建云数据库集合：' + col);
    createdCols.add(col);
    return true;
  } catch (e) {
    // 集合已存在时 createCollection 也会报错，这属于正常情况，需与「连不上」区分
    const m = e.message || '';
    if (/already exist|exist/i.test(m) && !/not exist/i.test(m)) {
      createdCols.add(col);
      return true;
    }
    lastCloudError = { at: new Date().toISOString(), op: 'create ' + col, message: m };
    if (cloudHealthy !== true) cloudHealthy = false;
    console.warn('   ⚠️ 云数据库集合创建失败（' + col + '）：' + m);
    return false;
  }
}

async function cloudRead(name, fallback) {
  const db = getCloudDb();
  const col = collection(name);
  try {
    const res = await withTimeout(db.collection(col).limit(1000).get(), 15000, 'read ' + col);
    cloudHealthy = true;
    const docs = res.data || [];
    if (!docs.length) return fallback;

    // 单对象存储：存在 __single__ 文档
    const single = docs.find(d => d._id === SINGLE_ID);
    if (single) {
      const { _id, ...rest } = single;
      return rest;
    }
    // 数组存储：清掉云厂商附加字段
    return docs
      .filter(d => d._id !== SINGLE_ID)
      .map(d => { const { _id, _openid, ...rest } = d; return rest; });
  } catch (e) {
    // 集合不存在 → 自动建好后重试一次（读报 ResourceNotFound，写报 not consistency，都算这一类）
    if (/not exist|not consistency/i.test(e.message || '')) {
      await ensureCollection(col);
      try {
        const res = await withTimeout(db.collection(col).limit(1000).get(), 15000, 'read-retry ' + col);
        cloudHealthy = true;
        const docs = res.data || [];
        if (!docs.length) return fallback;
        const single = docs.find(d => d._id === SINGLE_ID);
        if (single) { const { _id, ...rest } = single; return rest; }
        return docs.filter(d => d._id !== SINGLE_ID).map(d => { const { _id, _openid, ...rest } = d; return rest; });
      } catch (e2) {
        lastCloudError = { at: new Date().toISOString(), op: 'read-retry ' + col, message: e2.message };
        if (cloudHealthy !== true) cloudHealthy = false;
        return localRead(name, fallback);
      }
    }
    // 连不上云库（鉴权失败/网络问题）→ 回退读本地随镜像带上的种子数据，保证页面不空
    cloudHealthy = false;
    lastCloudError = { at: new Date().toISOString(), op: 'read ' + col, message: e.message };
    console.warn('   ⚠️ 云数据库读取失败（' + col + '）：' + e.message + ' → 回退本地种子数据');
    return localRead(name, fallback);
  }
}

async function cloudWrite(name, data) {
  const db = getCloudDb();
  const col = collection(name);

  // 先清空：逐条删除（数据量小，足够）
  try {
    const old = await withTimeout(db.collection(col).limit(1000).get(), 15000, 'write-query ' + col);
    for (const d of (old.data || [])) {
      await withTimeout(db.collection(col).doc(d._id).remove(), 15000, 'remove ' + col);
    }
  } catch (e) { /* 集合不存在，忽略 */ }

  // 再写入
  try {
    if (Array.isArray(data)) {
      for (const item of data) {
        const doc = { ...item };
        if (doc.id) doc._id = String(doc.id);      // 用业务 id 当主键，便于去重
        await withTimeout(db.collection(col).add(doc), 15000, 'add ' + col).catch(async (e) => {
          if (/not exist|not consistency/i.test(e.message || '')) {
            await ensureCollection(col);
            return withTimeout(db.collection(col).add(doc), 15000, 'add-retry ' + col);
          }
          throw e;
        });
      }
    } else {
      await withTimeout(db.collection(col).add({ _id: SINGLE_ID, ...data }), 15000, 'add ' + col).catch(async (e) => {
        if (/not exist|not consistency/i.test(e.message || '')) {
          await ensureCollection(col);
          return withTimeout(db.collection(col).add({ _id: SINGLE_ID, ...data }), 15000, 'add-retry ' + col);
        }
        throw e;
      });
    }
    cloudHealthy = true;
  } catch (e) {
    // 写不进去也回退写本地文件，至少本次操作不丢
    lastCloudError = { at: new Date().toISOString(), op: 'write ' + col, message: e.message };
    console.warn('   ⚠️ 云数据库写入失败（' + col + '）：' + e.message + ' → 写入本地文件');
    localWrite(name, data);
  }
}

/* ---------------- 统一接口 ---------------- */

/**
 * 读取数据
 * @param {string} name 文件名（如 'opportunities.json'）
 * @param {*} fallback 读不到时的兜底值
 */
async function read(name, fallback) {
  if (storageMode === 'cloud') return cloudRead(name, fallback);
  return localRead(name, fallback);
}

/**
 * 写入数据
 * @param {string} name 文件名
 * @param {*} data 要写入的完整数据
 */
async function write(name, data) {
  if (storageMode === 'cloud') return cloudWrite(name, data);
  return localWrite(name, data);
}

/** 同步读取：仅本地模式可用，供不便改异步的旧代码路径使用 */
function readSync(name, fallback) {
  return localRead(name, fallback);
}
function writeSync(name, data) {
  return localWrite(name, data);
}

/** 诊断信息：云端连接状态与最近错误（供 /api/debug/storage 使用） */
function diagnostics() {
  return {
    mode: storageMode,
    cloudHealthy,
    lastCloudError,
    injectedKeys: Object.keys(process.env)
      .filter(k => /CLOUDBASE|TCB|TENCENT/i.test(k))
      .sort()
  };
}

module.exports = { init, mode, read, write, readSync, writeSync, diagnostics, DATA_DIR };
