// サービスレジストリ (単一の真実) の共有パーサ。
// build-landing.cjs と sync-readme.cjs が共用し、解析ロジックの重複を防ぐ。

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SERVICES_TS = path.join(ROOT, 'src/renderer/services.ts');
const SERVICEID_TS = path.join(ROOT, 'src/shared/serviceId.ts');

const CATEGORY_LABEL = {
  featured: 'おすすめ',
  tools: '分析・ツール',
  integrations: '外部サービス連携',
};
const CATEGORY_ORDER = ['featured', 'tools', 'integrations'];

/**
 * services.ts の SERVICES 配列から {id,label,icon,description,category} を抽出。
 * page: の値は識別子 (SomePage) と factory 呼び出し (createConnectorStubPage(...))
 * の両方を取り得るので、page: 〜 category: の間は非貪欲にスキップする。
 */
function parseServices() {
  const text = fs.readFileSync(SERVICES_TS, 'utf8');
  const entry =
    /id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*icon:\s*'([^']+)',\s*description:\s*'([^']*)',\s*page:[\s\S]*?category:\s*'([^']+)'/g;
  const out = [];
  let m;
  while ((m = entry.exec(text)) !== null) {
    out.push({ id: m[1], label: m[2], icon: m[3], description: m[4], category: m[5] });
  }
  if (out.length === 0) throw new Error('no services parsed from services.ts');
  return out;
}

/** serviceId.ts の SERVICE_IDS 件数 (正典)。parse 漏れ検知の基準。 */
function countCanonicalServices() {
  const text = fs.readFileSync(SERVICEID_TS, 'utf8');
  const m = text.match(/SERVICE_IDS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) throw new Error('SERVICE_IDS not found in serviceId.ts');
  return (m[1].match(/'[a-z][a-z0-9-]*'/g) || []).length;
}

module.exports = { ROOT, CATEGORY_LABEL, CATEGORY_ORDER, parseServices, countCanonicalServices };
