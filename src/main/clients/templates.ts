import { wrapLines } from '../../shared/textWrap';
import {
  TEMPLATE_FIELD_LIMITS,
  renderTemplateSvg,
  type TemplateSvgParams,
} from '../../shared/templateSvg';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ActionContext, ActionMap, FetchContext } from './types';
import { isSafeExportPath, writeExportFile } from './exportPaths';
import type { ActionData, ExportFileResult } from '../../shared/actionData';

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

/**
 * 欄の名前と型。**中身の組み立ては `shared/templateSvg.ts` に 1 つだけ**
 * (パス 184 でここ・ブラウザ版・画面の 3 写しを畳んだ)。字数の上限は
 * `TEMPLATE_FIELD_LIMITS` が持つ —— 以前この JSDoc は「40 字以内 /
 * 80 字以内 / 200 字以内 / 24 字以内」と書いていたが、実装は 80 / 120 /
 * 400 / 48 で、**散文が実装の半分以下の数を説明していた**。
 */
export type TemplateParams = TemplateSvgParams;

export interface TemplateDef {
  readonly id: TemplateId;
  readonly label: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly defaults: TemplateParams;
}

// Catalog string-literals (label / description / default param text) are
// decorative copy. The TemplateId list is pinned by structural tests
// (toEqual on TEMPLATE_IDS). Hex defaults are pinned via validation tests.
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

export const TEMPLATE_IDS: readonly TemplateId[] = TEMPLATE_CATALOG.map((t) => t.id);

const CATALOG_BY_ID = Object.fromEntries(TEMPLATE_CATALOG.map((t) => [t.id, t])) as Readonly<
  Record<TemplateId, TemplateDef>
>;

// Use Object.hasOwn (not `in`) so prototype-chain entries like
// '__proto__' / 'constructor' / 'toString' do not pass — 3 dedicated
// tests pin this.
export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && Object.hasOwn(CATALOG_BY_ID, value);
}

export function getTemplateDef(id: TemplateId): TemplateDef {
  return CATALOG_BY_ID[id];
}

// --- Validation -------------------------------------------------------

/** 上限は共有台帳から読む (数を 2 か所に置かない・画面の入力欄も同じ物を読む)。 */
const FIELD_LIMITS = TEMPLATE_FIELD_LIMITS;

/** Validate + normalize template params, applying defaults for missing/invalid fields.
 *  Throws only on outright pathological input (control characters, oversize). */
// Each guard is exhaustively tested via negative cases. perTest mis-attribution
// on the chained `||` / boundary mutants is silenced.
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
      if (!isHexColor(v)) {
        throw new Error(`${k} must be #RRGGBB hex color`);
      }
      out[k] = v;
    }
  }
  return out;
}

// --- SVG helpers ------------------------------------------------------

/** マークアップ用のエスケープ。実装は `shared/escape.ts` に 1 つだけ持つ。 */
import { escapeXml, isHexColor } from '../../shared/escape';

export { escapeXml };

// --- SVG の組み立て ------------------------------------------------------
//
// **中身は `src/shared/templateSvg.ts` に 1 つだけ在る。** 2026-09-12 (パス 184)
// まで、同じ 8 テンプレートを組む実装がここ・`renderer/web-templates.ts`・
// `renderer/pages/TemplatesPage.tsx` に 3 つ在り、実測で**どの 2 つも一致
// しなかった** (代替テキストと書体が付くのはここだけ・画面のプレビューは
// どちらの書き出しとも別物)。経緯と実測表は共有側の冒頭にある。
//
// ここに残るのは **IPC 境界の番人** (`validateParams`) だけ —— レンダラーから
// 来た payload がファイル書き出しへ渡る手前で throw する側である。
// 緩い側 (既定値へ落とす) は共有の `normalizeTemplateParams` で、
// 揃えてはいけない差として `shared/__tests__/templateParamsParity.test.ts`
// が留めている。

/** Public render entry: validates params, then hands them to the shared renderer. */
export function renderTemplate(id: TemplateId, params: unknown): string {
  const def = getTemplateDef(id);
  const p = validateParams(params, def.defaults);
  return renderTemplateSvg(id, p, def);
}

// --- Snapshot ----------------------------------------------------------

export interface TemplatesSnapshot {
  readonly templates: readonly TemplateDef[];
  readonly fetchedAt: string;
  readonly isMock: boolean;
}

const FETCHED_AT = '2035-05-15T00:00:00.000Z';

export async function fetchTemplatesSnapshotImpl(
  _ctx: FetchContext,
): Promise<TemplatesSnapshot> {
  return { templates: TEMPLATE_CATALOG, fetchedAt: FETCHED_AT, isMock: true };
}

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

export function isSafeSvgExportPath(filePath: string, home: string): boolean {
  return isSafeExportPath(filePath, home, '.svg');
}

// 書き出しの結果の形は台帳 `shared/actionData.ts` の `ExportFileResult` (パス 116)。

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

export async function exportTemplateImpl(
  ctx: ActionContext,
  deps: ExportDeps = {},
): Promise<ExportFileResult> {
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
  const writeFn = deps.writeFile ?? writeExportFile;
  await mkdirFn(path.dirname(filePath));
  await writeFn(filePath, svg);
  const generatedAt = (deps.now ?? (() => new Date()))().toISOString();
  return { path: filePath, bytes: Buffer.byteLength(svg), generatedAt };
}

async function exportTemplate(ctx: ActionContext): Promise<ActionData<'templates/export-template'>> {
  return exportTemplateImpl(ctx);
}

export const ACTIONS: ActionMap = {
  'export-template': exportTemplate,
};

/** 印刷幅の折り返し。実装は `shared/textWrap.ts` に 1 つだけ持つ。 */
export { wrapLines };
