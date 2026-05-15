/**
 * Browser-side template renderers — mirror of the backend templates.ts
 * renderers. Imported by web-shim.ts so the standalone HTML build can
 * generate SVGs without IPC.
 *
 * Kept minimal: same 8 templates, same field shape, but no path safety
 * (web build doesn't write to disk).
 */

export interface TemplateParams {
  title: string;
  subtitle: string;
  body: string;
  accentColor: string;
  secondaryColor: string;
  brandText: string;
}

export interface TemplateDef {
  id: string;
  width: number;
  height: number;
  defaults: TemplateParams;
}

export const TEMPLATE_CATALOG_FOR_WEB: readonly TemplateDef[] = [
  { id: 'presentation-cover', width: 1920, height: 1080, defaults: { title: '次世代 営業戦略 2035', subtitle: 'Q2 全社レビュー · 5/15 オンライン', body: '営業部 / 経営企画チーム · Internal Use Only', accentColor: '#5b8def', secondaryColor: '#0f1117', brandText: 'Acme Corp.' } },
  { id: 'business-card', width: 1075, height: 650, defaults: { title: '山田 太郎', subtitle: '営業部 主任', body: 'taro.yamada@example.com · +81-3-1234-5678', accentColor: '#0f5fac', secondaryColor: '#f8f8f8', brandText: 'Acme Corp.' } },
  { id: 'social-square', width: 1080, height: 1080, defaults: { title: '新製品リリースのお知らせ', subtitle: '5月20日から全国主要書店で発売開始', body: '@acme · #新製品 #本日発売', accentColor: '#ec9a3d', secondaryColor: '#181c25', brandText: 'Acme Corp.' } },
  { id: 'social-story', width: 1080, height: 1920, defaults: { title: '春の限定セール', subtitle: '対象商品 30% OFF', body: '5月20日まで · オンラインストア限定', accentColor: '#e36b6b', secondaryColor: '#0f1117', brandText: 'Acme Corp.' } },
  { id: 'flyer-a4', width: 1240, height: 1754, defaults: { title: '無料セミナー開催', subtitle: '中小企業のための DX 入門', body: '日時: 2035年5月20日 14:00-16:00\n会場: 東京都港区 Acme ホール\n申込: acme.example/seminar', accentColor: '#5cb85c', secondaryColor: '#181c25', brandText: 'Acme Corp.' } },
  { id: 'certificate', width: 1754, height: 1240, defaults: { title: '修了証書', subtitle: '山田 太郎 殿', body: '上記の方は当社が定める研修プログラムを修了されたことを証明します。\n2035年4月15日', accentColor: '#a06bd2', secondaryColor: '#fdfbf7', brandText: 'Acme Training Institute' } },
  { id: 'invoice-header', width: 1240, height: 350, defaults: { title: 'INVOICE', subtitle: '請求書番号: INV-2035-0042', body: '発行日: 2035-05-15 · 支払期限: 2035-06-15', accentColor: '#0f5fac', secondaryColor: '#f8f8f8', brandText: 'Acme Corp.' } },
  { id: 'resume-header', width: 1240, height: 600, defaults: { title: '山田 太郎', subtitle: '営業部 / Sales Lead · 7年', body: 'Tokyo, Japan · taro.yamada@example.com', accentColor: '#43c3b8', secondaryColor: '#0f1117', brandText: '' } },
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (para.length === 0) { out.push(''); continue; }
    let buf = '';
    for (const ch of para) {
      if (buf.length >= maxChars) { out.push(buf); buf = ''; }
      buf += ch;
    }
    if (buf.length > 0) out.push(buf);
  }
  return out;
}

export function renderTemplateForWeb(def: TemplateDef, params: Record<string, string>): string {
  const p: TemplateParams = {
    title: typeof params.title === 'string' ? params.title : def.defaults.title,
    subtitle: typeof params.subtitle === 'string' ? params.subtitle : def.defaults.subtitle,
    body: typeof params.body === 'string' ? params.body : def.defaults.body,
    accentColor: typeof params.accentColor === 'string' ? params.accentColor : def.defaults.accentColor,
    secondaryColor: typeof params.secondaryColor === 'string' ? params.secondaryColor : def.defaults.secondaryColor,
    brandText: typeof params.brandText === 'string' ? params.brandText : def.defaults.brandText,
  };
  const d = def;
  const W = d.width;
  const H = d.height;

  if (d.id === 'presentation-cover') {
    const lines = wrap(p.title, 24);
    const titleY = H / 2 - lines.length * 30;
    const ts = lines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 100}">${esc(l)}</tspan>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.secondaryColor}"/><rect width="14" height="${H}" fill="${p.accentColor}"/><rect x="60" y="${H - 80}" width="120" height="6" fill="${p.accentColor}"/><text x="${W / 2}" y="${titleY}" font-size="92" font-weight="800" fill="#fff" text-anchor="middle">${ts}</text><text x="${W / 2}" y="${H / 2 + 100}" font-size="36" fill="#cbd5e1" text-anchor="middle">${esc(p.subtitle)}</text><text x="60" y="${H - 32}" font-size="20" fill="#94a3b8">${esc(p.body)}</text><text x="${W - 60}" y="${H - 32}" font-size="22" font-weight="600" fill="${p.accentColor}" text-anchor="end">${esc(p.brandText)}</text></svg>`;
  }
  if (d.id === 'business-card') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.secondaryColor}"/><rect width="${W}" height="22" fill="${p.accentColor}"/><text x="60" y="180" font-size="64" font-weight="700" fill="#0f1117">${esc(p.title)}</text><text x="60" y="240" font-size="28" fill="${p.accentColor}">${esc(p.subtitle)}</text><line x1="60" y1="280" x2="${W - 60}" y2="280" stroke="${p.accentColor}" stroke-width="2"/><text x="60" y="340" font-size="22" fill="#475569">${esc(p.body)}</text><text x="${W - 60}" y="${H - 56}" font-size="28" font-weight="700" fill="${p.accentColor}" text-anchor="end">${esc(p.brandText)}</text></svg>`;
  }
  if (d.id === 'social-square') {
    const lines = wrap(p.title, 14);
    const ts = lines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 90}">${esc(l)}</tspan>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.secondaryColor}"/><circle cx="${W - 100}" cy="100" r="180" fill="${p.accentColor}" opacity="0.18"/><circle cx="80" cy="${H - 80}" r="240" fill="${p.accentColor}" opacity="0.12"/><rect x="60" y="120" width="80" height="6" fill="${p.accentColor}"/><text x="${W / 2}" y="${H / 2 - lines.length * 30}" font-size="80" font-weight="800" fill="#fff" text-anchor="middle">${ts}</text><text x="${W / 2}" y="${H / 2 + 100}" font-size="34" fill="#cbd5e1" text-anchor="middle">${esc(p.subtitle)}</text><text x="${W / 2}" y="${H - 80}" font-size="26" fill="${p.accentColor}" text-anchor="middle">${esc(p.body)}</text><text x="60" y="80" font-size="22" font-weight="600" fill="#fff">${esc(p.brandText)}</text></svg>`;
  }
  if (d.id === 'social-story') {
    const lines = wrap(p.title, 11);
    const ts = lines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 120}">${esc(l)}</tspan>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.secondaryColor}"/><stop offset="100%" stop-color="${p.accentColor}" stop-opacity="0.4"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><rect x="${W / 2 - 60}" y="${H / 2 - 360}" width="120" height="8" fill="${p.accentColor}"/><text x="${W / 2}" y="${H / 2 - 80 - lines.length * 30}" font-size="120" font-weight="900" fill="#fff" text-anchor="middle">${ts}</text><text x="${W / 2}" y="${H / 2 + 200}" font-size="56" fill="#fafafa" text-anchor="middle">${esc(p.subtitle)}</text><rect x="${W / 2 - 200}" y="${H - 280}" width="400" height="80" rx="40" fill="${p.accentColor}"/><text x="${W / 2}" y="${H - 224}" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">${esc(p.body)}</text><text x="${W / 2}" y="${H - 120}" font-size="32" fill="#cbd5e1" text-anchor="middle">${esc(p.brandText)}</text></svg>`;
  }
  if (d.id === 'flyer-a4') {
    const lines = wrap(p.body, 36);
    const ts = lines.map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 56}">${esc(l)}</tspan>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fdfbf7"/><rect width="${W}" height="380" fill="${p.accentColor}"/><rect y="380" width="${W}" height="14" fill="${p.secondaryColor}"/><text x="80" y="200" font-size="96" font-weight="800" fill="#fff">${esc(p.title)}</text><text x="80" y="280" font-size="42" fill="#fefefe">${esc(p.subtitle)}</text><text x="80" y="500" font-size="40" fill="#1f2937">${ts}</text><rect x="80" y="${H - 200}" width="${W - 160}" height="100" fill="${p.accentColor}" opacity="0.1"/><text x="${W / 2}" y="${H - 140}" font-size="38" font-weight="700" fill="${p.accentColor}" text-anchor="middle">${esc(p.brandText)}</text></svg>`;
  }
  if (d.id === 'certificate') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.secondaryColor}"/><rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${p.accentColor}" stroke-width="6"/><rect x="60" y="60" width="${W - 120}" height="${H - 120}" fill="none" stroke="${p.accentColor}" stroke-width="2"/><text x="${W / 2}" y="${H / 2 - 220}" font-size="32" letter-spacing="12" fill="${p.accentColor}" text-anchor="middle">CERTIFICATE</text><text x="${W / 2}" y="${H / 2 - 140}" font-size="120" font-weight="700" fill="#1f2937" text-anchor="middle">${esc(p.title)}</text><text x="${W / 2}" y="${H / 2 - 40}" font-size="56" fill="#1f2937" text-anchor="middle">${esc(p.subtitle)}</text><line x1="${W / 2 - 200}" y1="${H / 2}" x2="${W / 2 + 200}" y2="${H / 2}" stroke="${p.accentColor}" stroke-width="2"/><text x="${W / 2}" y="${H / 2 + 90}" font-size="34" fill="#374151" text-anchor="middle">${esc(p.body.split('\n')[0] ?? '')}</text><text x="${W / 2}" y="${H / 2 + 150}" font-size="34" fill="#374151" text-anchor="middle">${esc(p.body.split('\n')[1] ?? '')}</text><text x="${W / 2}" y="${H - 100}" font-size="32" font-weight="600" fill="${p.accentColor}" text-anchor="middle">${esc(p.brandText)}</text></svg>`;
  }
  if (d.id === 'invoice-header') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.secondaryColor}"/><rect width="${W}" height="${H}" fill="${p.accentColor}" opacity="0.07"/><text x="80" y="130" font-size="84" font-weight="800" letter-spacing="6" fill="${p.accentColor}">${esc(p.title)}</text><text x="80" y="190" font-size="28" fill="#475569">${esc(p.subtitle)}</text><text x="80" y="240" font-size="22" fill="#94a3b8">${esc(p.body)}</text><text x="${W - 80}" y="80" font-size="32" font-weight="700" fill="#1f2937" text-anchor="end">${esc(p.brandText)}</text><rect y="${H - 6}" width="${W}" height="6" fill="${p.accentColor}"/></svg>`;
  }
  if (d.id === 'resume-header') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${p.secondaryColor}"/><rect width="280" height="${H}" fill="${p.accentColor}"/><circle cx="140" cy="${H / 2}" r="100" fill="#fff" opacity="0.18"/><text x="320" y="200" font-size="88" font-weight="800" fill="#fff">${esc(p.title)}</text><text x="320" y="280" font-size="36" fill="${p.accentColor}">${esc(p.subtitle)}</text><text x="320" y="380" font-size="26" fill="#cbd5e1">${esc(p.body)}</text><text x="320" y="${H - 60}" font-size="24" fill="${p.accentColor}">${esc(p.brandText)}</text></svg>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#222"/></svg>`;
}
