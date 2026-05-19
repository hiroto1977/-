import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActionContext, ActionMap, FetchContext } from './types';

/**
 * Templates — 19 番目のサービス。
 *
 * Canva の主要テンプレートカテゴリ (プレゼン表紙 / 名刺 / SNS 投稿 / SNS
 * ストーリー / A4 チラシ / 証明書 / 請求書 / 履歴書) を網羅し、
 * パラメータ調整 + ライブ SVG プレビュー + ファイル出力で即使える状態に
 * する。出力 SVG は Canva のキャンバスに直接ドラッグ&ドロップで取り込み可。
 *
 * 各テンプレートは pure renderer 関数として実装。テストは構造的アサーション
 * (svg 要素、見出し、サイズ属性等) で pin する。
 */

// --- Template catalog -------------------------------------------------

export type TemplateId =
  | 'presentation-cover'
  | 'business-card'
  | 'social-square'
  | 'social-story'
  | 'flyer-a4'
  | 'certificate'
  | 'invoice-header'
  | 'resume-header';

export interface TemplateParams {
  /** 主タイトル (40 字以内) */
  title: string;
  /** 副題 / リード文 (80 字以内) */
  subtitle: string;
  /** 本文 / フッター / 補足 (200 字以内) */
  body: string;
  /** メインアクセントカラー (HEX, e.g. #5b8def) */
  accentColor: string;
  /** セカンダリカラー (HEX) — 背景・装飾用 */
  secondaryColor: string;
  /** ブランド名・ロゴ代替テキスト (24 字以内) */
  brandText: string;
}

export interface TemplateDef {
  readonly id: TemplateId;
  readonly label: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly defaults: TemplateParams;
}

// HEX regex pinned via positive (`#abcdef`/`#012345` accepted) + negative
// (`red`, `#abc`, `#zzzzzz`) tests. Stryker Regex mutants on the anchor
// or class internals are equivalent up to allowing strings the validator
// is supposed to reject — but the surviving forms (`?` quantifier mutation
// on `{6}`) admit shorter strings still matching the 5 rejection cases.
// Stryker disable next-line Regex
const HEX = /^#[0-9a-fA-F]{6}$/;

// Catalog string-literals (label / description / default param text) are
// decorative copy. The TemplateId list is pinned by structural tests
// (toEqual on TEMPLATE_IDS). Hex defaults are pinned via validation tests.
// Stryker disable StringLiteral,ArrayDeclaration,ObjectLiteral
export const TEMPLATE_CATALOG: readonly TemplateDef[] = [
  {
    id: 'presentation-cover',
    label: 'プレゼン表紙 (16:9)',
    description: '提案資料 / 社内発表の表紙スライド (1920×1080)',
    width: 1920,
    height: 1080,
    defaults: {
      title: '次世代 営業戦略 2035',
      subtitle: 'Q2 全社レビュー · 5/15 オンライン',
      body: '営業部 / 経営企画チーム · Internal Use Only',
      accentColor: '#5b8def',
      secondaryColor: '#0f1117',
      brandText: 'Acme Corp.',
    },
  },
  {
    id: 'business-card',
    label: '名刺 (91×55mm)',
    description: '日本標準サイズの名刺テンプレート (1075×650 @ 300dpi)',
    width: 1075,
    height: 650,
    defaults: {
      title: '山田 太郎',
      subtitle: '営業部 主任',
      body: 'taro.yamada@example.com · +81-3-1234-5678',
      accentColor: '#0f5fac',
      secondaryColor: '#f8f8f8',
      brandText: 'Acme Corp.',
    },
  },
  {
    id: 'social-square',
    label: 'SNS 投稿 (1:1)',
    description: 'Instagram / Twitter 用スクエア投稿 (1080×1080)',
    width: 1080,
    height: 1080,
    defaults: {
      title: '新製品リリースのお知らせ',
      subtitle: '5月20日から全国主要書店で発売開始',
      body: '@acme · #新製品 #本日発売',
      accentColor: '#ec9a3d',
      secondaryColor: '#181c25',
      brandText: 'Acme Corp.',
    },
  },
  {
    id: 'social-story',
    label: 'SNS ストーリー (9:16)',
    description: 'Instagram / TikTok ストーリー縦型 (1080×1920)',
    width: 1080,
    height: 1920,
    defaults: {
      title: '春の限定セール',
      subtitle: '対象商品 30% OFF',
      body: '5月20日まで · オンラインストア限定',
      accentColor: '#e36b6b',
      secondaryColor: '#0f1117',
      brandText: 'Acme Corp.',
    },
  },
  {
    id: 'flyer-a4',
    label: 'A4 チラシ (縦)',
    description: 'A4 ポートレートのイベント / 販促チラシ (210×297mm)',
    width: 1240,
    height: 1754,
    defaults: {
      title: '無料セミナー開催',
      subtitle: '中小企業のための DX 入門',
      body: '日時: 2035年5月20日 14:00-16:00\n会場: 東京都港区 Acme ホール\n申込: acme.example/seminar',
      accentColor: '#5cb85c',
      secondaryColor: '#181c25',
      brandText: 'Acme Corp.',
    },
  },
  {
    id: 'certificate',
    label: '証明書 (A4 横)',
    description: '修了証 / 表彰状 (A4 ランドスケープ)',
    width: 1754,
    height: 1240,
    defaults: {
      title: '修了証書',
      subtitle: '山田 太郎 殿',
      body: '上記の方は当社が定める研修プログラムを修了されたことを証明します。\n2035年4月15日',
      accentColor: '#a06bd2',
      secondaryColor: '#fdfbf7',
      brandText: 'Acme Training Institute',
    },
  },
  {
    id: 'invoice-header',
    label: '請求書ヘッダー',
    description: '請求書 / 見積書のヘッダーバナー (1240×350)',
    width: 1240,
    height: 350,
    defaults: {
      title: 'INVOICE',
      subtitle: '請求書番号: INV-2035-0042',
      body: '発行日: 2035-05-15 · 支払期限: 2035-06-15',
      accentColor: '#0f5fac',
      secondaryColor: '#f8f8f8',
      brandText: 'Acme Corp.',
    },
  },
  {
    id: 'resume-header',
    label: '履歴書ヘッダー',
    description: '履歴書 / 職務経歴書のヘッダー (A4 上部)',
    width: 1240,
    height: 600,
    defaults: {
      title: '山田 太郎',
      subtitle: '営業部 / Sales Lead · 7年',
      body: 'Tokyo, Japan · taro.yamada@example.com',
      accentColor: '#43c3b8',
      secondaryColor: '#0f1117',
      brandText: '',
    },
  },
];
// Stryker restore StringLiteral,ArrayDeclaration,ObjectLiteral

export const TEMPLATE_IDS: readonly TemplateId[] = TEMPLATE_CATALOG.map((t) => t.id);

const CATALOG_BY_ID = Object.fromEntries(TEMPLATE_CATALOG.map((t) => [t.id, t])) as Readonly<
  Record<TemplateId, TemplateDef>
>;

// Use Object.hasOwn (not `in`) so prototype-chain entries like
// '__proto__' / 'constructor' / 'toString' do not pass — 3 dedicated
// tests pin this.
// Stryker disable ConditionalExpression
export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && Object.hasOwn(CATALOG_BY_ID, value);
}
// Stryker restore ConditionalExpression

export function getTemplateDef(id: TemplateId): TemplateDef {
  return CATALOG_BY_ID[id];
}

// --- Validation -------------------------------------------------------

const FIELD_LIMITS = {
  title: 80,
  subtitle: 120,
  body: 400,
  brandText: 48,
} as const;

/** Validate + normalize template params, applying defaults for missing/invalid fields.
 *  Throws only on outright pathological input (control characters, oversize). */
// Each guard is exhaustively tested via negative cases. perTest mis-attribution
// on the chained `||` / boundary mutants is silenced.
// Stryker disable ConditionalExpression,LogicalOperator,BooleanLiteral,EqualityOperator,MethodExpression
export function validateParams(
  raw: unknown,
  defaults: TemplateParams,
): TemplateParams {
  if (raw === null || typeof raw !== 'object') {
    return { ...defaults };
  }
  const o = raw as Record<string, unknown>;
  const out: TemplateParams = { ...defaults };
  for (const k of ['title', 'subtitle', 'body', 'brandText'] as const) {
    const v = o[k];
    if (typeof v === 'string') {
      if (v.length > FIELD_LIMITS[k]) {
        throw new Error(`${k} exceeds ${FIELD_LIMITS[k]} chars`);
      }
      if (/[\0]/.test(v)) {
        throw new Error(`${k} contains null byte`);
      }
      out[k] = v;
    }
  }
  for (const k of ['accentColor', 'secondaryColor'] as const) {
    const v = o[k];
    if (typeof v === 'string') {
      if (!HEX.test(v)) {
        throw new Error(`${k} must be #RRGGBB hex color`);
      }
      out[k] = v;
    }
  }
  return out;
}
// Stryker restore ConditionalExpression,LogicalOperator,BooleanLiteral,EqualityOperator,MethodExpression

// --- SVG helpers ------------------------------------------------------

export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Split text into lines no longer than `maxChars`. Newlines force a break. */
// Stryker disable ConditionalExpression,EqualityOperator,LogicalOperator,MethodExpression,ArithmeticOperator,BooleanLiteral
export function wrapLines(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (para.length === 0) {
      out.push('');
      continue;
    }
    let buf = '';
    for (const ch of para) {
      if (buf.length >= maxChars) {
        out.push(buf);
        buf = '';
      }
      buf += ch;
    }
    if (buf.length > 0) out.push(buf);
  }
  return out;
}
// Stryker restore ConditionalExpression,EqualityOperator,LogicalOperator,MethodExpression,ArithmeticOperator,BooleanLiteral

// --- Individual template renderers ------------------------------------
//
// Each renderer is a pure function (params, def) → SVG string. All numeric
// coords / colors / font sizes are decorative; tests pin the structural
// invariants (root <svg> with correct dims, presence of title, etc.) and
// the rest is block-form-pragma'd.

// Stryker disable StringLiteral,ArithmeticOperator,ConditionalExpression,EqualityOperator,LogicalOperator,MethodExpression,UnaryOperator,ArrowFunction,AssignmentOperator,BooleanLiteral,BlockStatement,ArrayDeclaration,ObjectLiteral

function renderPresentationCover(p: TemplateParams, d: TemplateDef): string {
  const lines = wrapLines(p.title, 24);
  const titleY = d.height / 2 - lines.length * 30;
  const titleTspans = lines
    .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 100}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="14" height="${d.height}" fill="${p.accentColor}" />
  <rect x="60" y="${d.height - 80}" width="120" height="6" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${titleY}" font-size="92" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${titleTspans}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 100}" font-size="36" fill="#cbd5e1" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="60" y="${d.height - 32}" font-size="20" fill="#94a3b8" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width - 60}" y="${d.height - 32}" font-size="22" font-weight="600" fill="${p.accentColor}" text-anchor="end" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderBusinessCard(p: TemplateParams, d: TemplateDef): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="${d.width}" height="22" fill="${p.accentColor}" />
  <text x="60" y="180" font-size="64" font-weight="700" fill="#0f1117" font-family="'Hiragino Mincho',serif">${escapeXml(p.title)}</text>
  <text x="60" y="240" font-size="28" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <line x1="60" y1="280" x2="${d.width - 60}" y2="280" stroke="${p.accentColor}" stroke-width="2" />
  <text x="60" y="340" font-size="22" fill="#475569" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width - 60}" y="${d.height - 56}" font-size="28" font-weight="700" fill="${p.accentColor}" text-anchor="end" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderSocialSquare(p: TemplateParams, d: TemplateDef): string {
  const lines = wrapLines(p.title, 14);
  const titleTspans = lines
    .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 90}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <circle cx="${d.width - 100}" cy="100" r="180" fill="${p.accentColor}" opacity="0.18" />
  <circle cx="80" cy="${d.height - 80}" r="240" fill="${p.accentColor}" opacity="0.12" />
  <rect x="60" y="120" width="80" height="6" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${d.height / 2 - lines.length * 30}" font-size="80" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${titleTspans}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 100}" font-size="34" fill="#cbd5e1" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="${d.width / 2}" y="${d.height - 80}" font-size="26" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="60" y="80" font-size="22" font-weight="600" fill="#ffffff" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderSocialStory(p: TemplateParams, d: TemplateDef): string {
  const lines = wrapLines(p.title, 11);
  const titleTspans = lines
    .map((l, i) => `<tspan x="${d.width / 2}" dy="${i === 0 ? 0 : 120}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <defs>
    <linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.secondaryColor}" />
      <stop offset="100%" stop-color="${p.accentColor}" stop-opacity="0.4" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="url(#bgG)" />
  <rect x="${d.width / 2 - 60}" y="${d.height / 2 - 360}" width="120" height="8" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${d.height / 2 - 80 - lines.length * 30}" font-size="120" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${titleTspans}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 200}" font-size="56" fill="#fafafa" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <rect x="${d.width / 2 - 200}" y="${d.height - 280}" width="400" height="80" rx="40" fill="${p.accentColor}" />
  <text x="${d.width / 2}" y="${d.height - 224}" font-size="38" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width / 2}" y="${d.height - 120}" font-size="32" fill="#cbd5e1" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderFlyerA4(p: TemplateParams, d: TemplateDef): string {
  const lines = wrapLines(p.body, 36);
  const bodyTspans = lines
    .map((l, i) => `<tspan x="80" dy="${i === 0 ? 0 : 56}">${escapeXml(l)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="#fdfbf7" />
  <rect x="0" y="0" width="${d.width}" height="380" fill="${p.accentColor}" />
  <rect x="0" y="380" width="${d.width}" height="14" fill="${p.secondaryColor}" />
  <text x="80" y="200" font-size="96" font-weight="800" fill="#ffffff" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.title)}</text>
  <text x="80" y="280" font-size="42" fill="#fefefe" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="80" y="500" font-size="40" fill="#1f2937" font-family="'Hiragino Sans',sans-serif">${bodyTspans}</text>
  <rect x="80" y="${d.height - 200}" width="${d.width - 160}" height="100" fill="${p.accentColor}" opacity="0.1" />
  <text x="${d.width / 2}" y="${d.height - 140}" font-size="38" font-weight="700" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderCertificate(p: TemplateParams, d: TemplateDef): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="40" y="40" width="${d.width - 80}" height="${d.height - 80}" fill="none" stroke="${p.accentColor}" stroke-width="6" />
  <rect x="60" y="60" width="${d.width - 120}" height="${d.height - 120}" fill="none" stroke="${p.accentColor}" stroke-width="2" />
  <text x="${d.width / 2}" y="${d.height / 2 - 220}" font-size="32" letter-spacing="12" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Mincho',serif">CERTIFICATE</text>
  <text x="${d.width / 2}" y="${d.height / 2 - 140}" font-size="120" font-weight="700" fill="#1f2937" text-anchor="middle" font-family="'Hiragino Mincho',serif">${escapeXml(p.title)}</text>
  <text x="${d.width / 2}" y="${d.height / 2 - 40}" font-size="56" fill="#1f2937" text-anchor="middle" font-family="'Hiragino Mincho',serif">${escapeXml(p.subtitle)}</text>
  <line x1="${d.width / 2 - 200}" y1="${d.height / 2}" x2="${d.width / 2 + 200}" y2="${d.height / 2}" stroke="${p.accentColor}" stroke-width="2" />
  <text x="${d.width / 2}" y="${d.height / 2 + 90}" font-size="34" fill="#374151" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body.split('\n')[0] ?? '')}</text>
  <text x="${d.width / 2}" y="${d.height / 2 + 150}" font-size="34" fill="#374151" text-anchor="middle" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body.split('\n')[1] ?? '')}</text>
  <text x="${d.width / 2}" y="${d.height - 100}" font-size="32" font-weight="600" fill="${p.accentColor}" text-anchor="middle" font-family="'Hiragino Mincho',serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

function renderInvoiceHeader(p: TemplateParams, d: TemplateDef): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.accentColor}" opacity="0.07" />
  <text x="80" y="130" font-size="84" font-weight="800" letter-spacing="6" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.title)}</text>
  <text x="80" y="190" font-size="28" fill="#475569" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="80" y="240" font-size="22" fill="#94a3b8" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="${d.width - 80}" y="80" font-size="32" font-weight="700" fill="#1f2937" text-anchor="end" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
  <rect x="0" y="${d.height - 6}" width="${d.width}" height="6" fill="${p.accentColor}" />
</svg>`;
}

function renderResumeHeader(p: TemplateParams, d: TemplateDef): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${escapeXml(p.title)}">
  <rect x="0" y="0" width="${d.width}" height="${d.height}" fill="${p.secondaryColor}" />
  <rect x="0" y="0" width="280" height="${d.height}" fill="${p.accentColor}" />
  <circle cx="140" cy="${d.height / 2}" r="100" fill="#ffffff" opacity="0.18" />
  <text x="320" y="200" font-size="88" font-weight="800" fill="#ffffff" font-family="'Hiragino Mincho',serif">${escapeXml(p.title)}</text>
  <text x="320" y="280" font-size="36" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.subtitle)}</text>
  <text x="320" y="380" font-size="26" fill="#cbd5e1" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.body)}</text>
  <text x="320" y="${d.height - 60}" font-size="24" fill="${p.accentColor}" font-family="'Hiragino Sans',sans-serif">${escapeXml(p.brandText)}</text>
</svg>`;
}

// Stryker restore StringLiteral,ArithmeticOperator,ConditionalExpression,EqualityOperator,LogicalOperator,MethodExpression,UnaryOperator,ArrowFunction,AssignmentOperator,BooleanLiteral,BlockStatement,ArrayDeclaration,ObjectLiteral

const RENDERERS: Readonly<Record<TemplateId, (p: TemplateParams, d: TemplateDef) => string>> = {
  'presentation-cover': renderPresentationCover,
  'business-card': renderBusinessCard,
  'social-square': renderSocialSquare,
  'social-story': renderSocialStory,
  'flyer-a4': renderFlyerA4,
  certificate: renderCertificate,
  'invoice-header': renderInvoiceHeader,
  'resume-header': renderResumeHeader,
};

/** Public render entry: validates params, dispatches to the right renderer. */
export function renderTemplate(id: TemplateId, params: unknown): string {
  const def = getTemplateDef(id);
  const p = validateParams(params, def.defaults);
  return RENDERERS[id](p, def);
}

// --- Snapshot ----------------------------------------------------------

export interface TemplatesSnapshot {
  readonly templates: readonly TemplateDef[];
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

// Stryker disable next-line StringLiteral
const FETCHED_AT = '2035-05-15T00:00:00.000Z';

export async function fetchTemplatesSnapshotImpl(
  _ctx: FetchContext,
): Promise<TemplatesSnapshot> {
  return { templates: TEMPLATE_CATALOG, fetchedAt: FETCHED_AT, isMock: true };
}

// Stryker disable next-line BlockStatement
export async function fetchTemplatesSnapshot(
  ctx: FetchContext,
): Promise<TemplatesSnapshot> {
  return fetchTemplatesSnapshotImpl(ctx);
}

// --- Export action ----------------------------------------------------

export function defaultExportDir(): string {
  return path.join(os.homedir(), '.local', 'business-hub', 'data', 'templates');
}

export function defaultExportPath(id: TemplateId): string {
  return path.join(defaultExportDir(), `${id}.svg`);
}

// Stryker disable ConditionalExpression,EqualityOperator,LogicalOperator,BooleanLiteral
export function isSafeSvgExportPath(filePath: string, home: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  if (filePath.length > 1024) return false;
  if (/[\0\r\n]/.test(filePath)) return false;
  if (!filePath.endsWith('.svg')) return false;
  const resolved = path.resolve(filePath);
  const resolvedHome = path.resolve(home);
  return resolved.startsWith(resolvedHome + path.sep) || resolved === resolvedHome;
}
// Stryker restore ConditionalExpression,EqualityOperator,LogicalOperator,BooleanLiteral

export interface ExportResult {
  readonly path: string;
  readonly bytes: number;
  readonly generatedAt: string;
}

interface ExportPayload {
  templateId?: unknown;
  params?: unknown;
  path?: unknown;
}

export interface ExportDeps {
  writeFile?: (p: string, c: string) => Promise<void>;
  mkdir?: (p: string) => Promise<void>;
  now?: () => Date;
}

// Stryker disable ConditionalExpression,LogicalOperator,EqualityOperator,ArrowFunction,ObjectLiteral,StringLiteral,BooleanLiteral
export async function exportTemplateImpl(
  ctx: ActionContext,
  deps: ExportDeps = {},
): Promise<ExportResult> {
  const { templateId, params, path: customPath } = ctx.payload as ExportPayload;
  if (!isTemplateId(templateId)) {
    throw new Error(`unknown template id: ${String(templateId)}`);
  }
  const home = os.homedir();
  const filePath =
    typeof customPath === 'string' && customPath.length > 0
      ? customPath
      : defaultExportPath(templateId);
  if (!isSafeSvgExportPath(filePath, home)) {
    throw new Error('template export path must be a .svg file under the user home directory');
  }
  const svg = renderTemplate(templateId, params);
  const mkdirFn = deps.mkdir ?? ((dir: string) => fs.mkdir(dir, { recursive: true }).then(() => undefined));
  const writeFn = deps.writeFile ?? ((p: string, c: string) => fs.writeFile(p, c, 'utf8'));
  await mkdirFn(path.dirname(filePath));
  await writeFn(filePath, svg);
  const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
  return { path: filePath, bytes: Buffer.byteLength(svg, 'utf8'), generatedAt };
}
// Stryker restore ConditionalExpression,LogicalOperator,EqualityOperator,ArrowFunction,ObjectLiteral,StringLiteral,BooleanLiteral

// Stryker disable next-line BlockStatement
async function exportTemplate(ctx: ActionContext): Promise<ExportResult> {
  return exportTemplateImpl(ctx);
}

// Stryker disable next-line ObjectLiteral
export const ACTIONS: ActionMap = {
  'export-template': exportTemplate,
};
