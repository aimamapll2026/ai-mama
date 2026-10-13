/**
 * 云端存储层测试：用内存 mock 模拟 CloudBase 云数据库
 * 验证 lib/store.js 的云端读写路径正确（无需真实云环境）
 */
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/* ---------- 构造云数据库 mock ---------- */
const DB = {};   // { collectionName: [ {_id, ...doc} ] }

function makeCollection(name) {
  if (!DB[name]) DB[name] = [];
  return {
    limit() { return this; },
    async get() { return { data: DB[name].map(d => ({ ...d })) }; },
    doc(id) {
      return {
        async remove() {
          DB[name] = DB[name].filter(d => d._id !== id);
          return {};
        }
      };
    },
    async add(doc) {
      DB[name].push({ ...doc });
      return {};
    }
  };
}

const mockSdk = {
  init() {
    return {
      database() {
        return { collection: (n) => makeCollection(n) };
      }
    };
  }
};

/* ---------- 注入 mock ---------- */
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === '@cloudbase/node-sdk') return '__mock_tcb__';
  return origResolve.call(this, request, ...args);
};
const origLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === '@cloudbase/node-sdk') return mockSdk;
  return origLoad.call(this, request, ...args);
};

/* ---------- 测试 ---------- */
(async () => {
  console.log('\n===== 云端存储层（mock 云数据库） =====\n');

  process.env.STORAGE = 'cloud';
  const store = require('../lib/store');
  const mode = store.init();
  ok('初始化进入云端模式', mode === 'cloud', '实际 ' + mode);

  console.log('\n--- 数组类型数据 ---');
  const opps = [
    { id: 'op-1', title: '测试机会一', type: 'flow' },
    { id: 'op-2', title: '测试机会二', type: 'prize' }
  ];
  await store.write('opportunities.json', opps);
  ok('写入数组成功', DB['opportunities'] && DB['opportunities'].length === 2, JSON.stringify(DB['opportunities']?.length));

  const back = await store.read('opportunities.json', []);
  ok('读回数组长度一致', Array.isArray(back) && back.length === 2, JSON.stringify(back));
  ok('读回保留业务 id', back[0]?.id === 'op-1', JSON.stringify(back[0]));
  ok('读回不含 _id 字段', back[0] && !('_id' in back[0]), JSON.stringify(back[0]));

  console.log('\n--- 覆盖写（幂等） ---');
  await store.write('opportunities.json', [{ id: 'op-9', title: '新数据' }]);
  const after = await store.read('opportunities.json', []);
  ok('覆盖写后只有 1 条', after.length === 1, '实际 ' + after.length);
  ok('覆盖写内容正确', after[0]?.title === '新数据', JSON.stringify(after[0]));

  console.log('\n--- 对象类型数据（设置） ---');
  const settings = { email: 'test@qq.com', theme: 'dark', aiProvider: 'zhipu' };
  await store.write('settings.json', settings);
  const sBack = await store.read('settings.json', {});
  ok('对象读回正确', sBack.email === 'test@qq.com' && sBack.theme === 'dark', JSON.stringify(sBack));
  ok('对象不含 _id', !('_id' in sBack), JSON.stringify(sBack));

  console.log('\n--- 空集合兜底 ---');
  const empty = await store.read('not-exist.json', []);
  ok('不存在的数据返回兜底值', Array.isArray(empty) && empty.length === 0);

  console.log('\n--- 单条对象模式（settings 只存一个文档） ---');
  ok('settings 集合只存 1 个文档', DB['settings'] && DB['settings'].length === 1, '实际 ' + DB['settings']?.length);

  console.log('\n--- 更新设置（部分字段合并后整体写回） ---');
  const cur = await store.read('settings.json', {});
  cur.notifyEmail = true;
  await store.write('settings.json', cur);
  const s2 = await store.read('settings.json', {});
  ok('更新后字段保留', s2.email === 'test@qq.com' && s2.notifyEmail === true, JSON.stringify(s2));

  console.log('\n' + '='.repeat(46));
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  console.log('='.repeat(46) + '\n');
  process.exit(fail ? 1 : 0);
})();
