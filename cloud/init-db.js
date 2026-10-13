/**
 * 云端数据初始化：把本地 data/*.json 的内容推到 CloudBase 云数据库
 *
 * 用法（在项目根目录）：
 *   TCB_ENV=你的环境ID node cloud/init-db.js
 *
 * 幂等：已有数据的集合默认跳过；加 --force 强制覆盖。
 */
process.env.STORAGE = 'cloud';

const path = require('path');
const fs = require('fs');
const store = require('../lib/store');

const FORCE = process.argv.includes('--force');
const DATA_DIR = path.join(__dirname, '..', 'data');

// 要同步的数据文件；机会库/学习/设置是「带过去的样本数据」
const FILES = [
  'opportunities.json',
  'lessons.json',
  'settings.json',
  'contents.json',
  'reports.json',
  'records.json'
];

async function main() {
  console.log('\n=== AI妈妈 · 云端数据初始化 ===\n');

  const mode = store.init();
  if (mode !== 'cloud') {
    console.error('❌ 当前不是云端模式。请设置环境变量 TCB_ENV=你的环境ID 后再运行。');
    process.exit(1);
  }

  let ok = 0, skip = 0, fail = 0;

  for (const f of FILES) {
    const fp = path.join(DATA_DIR, f);
    if (!fs.existsSync(fp)) { console.log(`  ○ ${f} 本地不存在，跳过`); skip++; continue; }

    let local;
    try {
      local = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      console.log(`  ✗ ${f} 解析失败：${e.message}`); fail++; continue;
    }

    const isEmpty = Array.isArray(local) ? local.length === 0 : Object.keys(local).length === 0;
    if (isEmpty && !FORCE) { console.log(`  ○ ${f} 内容为空，跳过`); skip++; continue; }

    // 检查云端是否已有数据
    if (!FORCE) {
      const existing = await store.read(f, null);
      const hasData = Array.isArray(existing) ? existing.length > 0 : (existing && Object.keys(existing).length > 0);
      if (hasData) {
        const n = Array.isArray(existing) ? existing.length : 1;
        console.log(`  ○ ${f} 云端已有 ${n} 条数据，跳过（要覆盖加 --force）`);
        skip++;
        continue;
      }
    }

    try {
      await store.write(f, local);
      const n = Array.isArray(local) ? local.length + ' 条' : '1 个对象';
      console.log(`  ✓ ${f} → 已写入 ${n}`);
      ok++;
    } catch (e) {
      console.log(`  ✗ ${f} 写入失败：${e.message}`);
      fail++;
    }
  }

  console.log(`\n完成：成功 ${ok} / 跳过 ${skip} / 失败 ${fail}\n`);
  if (fail) process.exit(1);
}

main().catch(e => {
  console.error('初始化异常：', e);
  process.exit(1);
});
