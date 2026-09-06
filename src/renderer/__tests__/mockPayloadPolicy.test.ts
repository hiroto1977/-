/**
 * **中身が「同梱データ」を名乗っているなら、画面もそう言う。**
 *
 * `main/clients/` の一部は、実 API を差し込む前の値を返すときに `isMock: true` を
 * 立てる。ところが**画面がそれを読まないと、緑の「ローカル」/「ライブ」バッジが付く**
 * —— `shared/dataOrigin.ts` の注記が `tone: 'ok'` を「実際に取ってきた」時の色だと
 * 決めているのに、取ってきた中身は作り物である。
 *
 * 実測 (2026-09-06): 11 モジュールが `isMock: true` を返し、画面が何か言っていたのは
 * 3 つだけだった。いちばん重かったのが `funding` —— `fetchFundingSnapshot` は
 * `MOCK_ITEMS` / `MOCK_ACCOUNTING` と固定の期首残高 300 万円から、補助金・融資の一覧・
 * キャッシュランウェイ・債務償還年数・**特定収入割合 (消費税の計算に関わる)** を
 * 組み立てて返す。「更新」を押すと緑の「ローカル」が付いていた。
 *
 * この検査は**台帳を双方向に**見る: 名乗る側が増えたら登録を要求し、登録が腐っても
 * 落とす。走査が死んだら気付けるように件数の床も置く。
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';

const REPO = join(__dirname, '..', '..', '..');

/** 画面が名乗りをどう扱うか。 */
type Surfacing =
  /** 画面が `isMock` を読んで専用の注記を出す。 */
  | 'notice'
  /** `useServiceData` の `payloadIsMock` を StatusBar へ渡し、バッジが「同梱データ」になる。 */
  | 'badge'
  /** 図表を持たない (挨拶・注記だけ)。言うことが無いので出さない。 */
  | 'no-figures';

interface LedgerEntry {
  readonly surfacing: Surfacing;
  /** そう扱ってよい理由。空欄と一言は認めない。 */
  readonly why: string;
}

/**
 * 台帳。**`isMock: true` を返すモジュールを足したら、ここにも足さないと落ちる。**
 * `no-figures` を選ぶときは「数字を出していない」ことを書く —— 数字を出すなら
 * `notice` か `badge` にすること。
 */
const LEDGER: Record<string, LedgerEntry> = {
  'src/main/clients/funding.ts': {
    surfacing: 'badge',
    why: '補助金・融資の一覧とキャッシュランウェイ・債務償還年数・特定収入割合を返す。FundingPage が payloadIsMock を StatusBar へ渡し、バッジが「同梱データ」になる。',
  },
  'src/main/clients/teamradar.ts': {
    surfacing: 'badge',
    why: 'チームの状態 (人数・軸の値) を返す。TeamRadarPage が payloadIsMock を StatusBar へ渡す。',
  },
  'src/main/clients/stocks.ts': {
    surfacing: 'notice',
    why: 'StocksPage が data.isMock で「シミュレーション中 / 実弾発注は行いません」の帯を出す。仮想資金であることを明示している。',
  },
  'src/main/clients/business.ts': {
    surfacing: 'notice',
    why: 'BusinessPage が data.isMock で注記を出す。事業ダッシュボードの数字が同梱値であることを画面で言う。',
  },
  'src/main/clients/kpi.ts': {
    surfacing: 'notice',
    why: 'KpiPage が isMock で注記を出す。KPI の実績値が同梱値であることを画面で言う。',
  },
  'src/main/clients/home.ts': {
    surfacing: 'no-figures',
    why: '挨拶の文字列だけを返す (greeting)。数字が無いので「同梱」と言う対象が無い。',
  },
  'src/main/clients/village.ts': {
    surfacing: 'no-figures',
    why: '挨拶の文字列 (greeting) だけを返す。数字が無いので「同梱」と言う対象が無い。',
  },
  'src/main/clients/settings.ts': {
    surfacing: 'no-figures',
    why: '保管の説明文 (note) だけを返す。数字が無い。',
  },
  'src/main/clients/library.ts': {
    surfacing: 'no-figures',
    why: '保存先の説明文 (note) だけを返す。実体の件数はライブラリ自身が IndexedDB から数える。',
  },
  'src/main/clients/docstudio.ts': {
    surfacing: 'no-figures',
    why: '書類スタジオの説明文だけを返す。差込値は利用者の入力で、同梱値ではない。',
  },
  'src/main/clients/templates.ts': {
    surfacing: 'no-figures',
    why: '同梱の書式カタログそのものを返す。カタログは実在する製品データで、数字ではない。',
  },
};

/** `isMock: true` を返すモジュール。 */
function mockClients(): string[] {
  return globSync(['src/main/clients/**/*.ts'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**'],
  })
    .filter((abs) => /isMock:\s*true/.test(readFileSync(abs, 'utf8')))
    .map((abs) => relative(REPO, abs).split('\\').join('/'))
    .sort();
}

const CLIENTS = mockClients();
const src = (rel: string): string => readFileSync(join(REPO, rel), 'utf8');

describe('同梱データを名乗る中身の台帳', () => {
  it('走査が生きている (床: 8 モジュール以上)', () => {
    // 実測 11。走査が死ぬと「違反 0 件」で通ってしまう。
    expect(CLIENTS.length).toBeGreaterThanOrEqual(8);
  });

  it('標本: 走査は `isMock: true` を実際に見ている', () => {
    expect(CLIENTS).toContain('src/main/clients/funding.ts');
    // 名乗らないモジュールは入らない (走査が全件を拾っているだけではない)。
    expect(CLIENTS).not.toContain('src/main/clients/github.ts');
  });

  it('★ 台帳に無いモジュールは無い', () => {
    const undeclared = CLIENTS.filter((f) => !(f in LEDGER));
    expect(undeclared, '`isMock: true` を返すなら台帳 (LEDGER) に理由つきで登録すること').toEqual([]);
  });

  it('★ 台帳に載っているのに現物が無い項目は無い (腐った台帳を許さない)', () => {
    const stale = Object.keys(LEDGER).filter((f) => !CLIENTS.includes(f));
    expect(stale, '`isMock: true` を止めたら台帳からも消すこと').toEqual([]);
  });

  it('理由は 20 字以上', () => {
    const thin = Object.entries(LEDGER)
      .filter(([, e]) => e.why.length < 20)
      .map(([f]) => f);
    expect(thin).toEqual([]);
  });

  it('★ `badge` の画面は payloadIsMock を StatusBar へ渡している', () => {
    // 台帳が `badge` と言うなら、実際に配線が在ること。
    const pages: Record<string, string> = {
      'src/main/clients/funding.ts': 'src/renderer/pages/FundingPage.tsx',
      'src/main/clients/teamradar.ts': 'src/renderer/pages/TeamRadarPage.tsx',
    };
    const missing = Object.entries(LEDGER)
      .filter(([, e]) => e.surfacing === 'badge')
      .map(([f]) => f)
      .filter((f) => {
        const page = pages[f];
        return page === undefined || !src(page).includes('payloadIsMock={payloadIsMock}');
      });
    expect(missing, 'badge を選んだなら StatusBar へ payloadIsMock を渡すこと').toEqual([]);
  });

  it('★ `notice` の画面は isMock を読んで何か出している', () => {
    const pages: Record<string, string> = {
      'src/main/clients/stocks.ts': 'src/renderer/pages/StocksPage.tsx',
      'src/main/clients/business.ts': 'src/renderer/pages/BusinessPage.tsx',
      'src/main/clients/kpi.ts': 'src/renderer/pages/KpiPage.tsx',
    };
    const missing = Object.entries(LEDGER)
      .filter(([, e]) => e.surfacing === 'notice')
      .map(([f]) => f)
      .filter((f) => {
        const page = pages[f];
        return page === undefined || !/isMock\s*&&/.test(src(page));
      });
    expect(missing, 'notice を選んだなら画面が isMock を読んで出すこと').toEqual([]);
  });

  it('★ 図表を持つと宣言した画面が `no-figures` になっていない', () => {
    // 数字を出すのに「言うことが無い」と登録するのが、この台帳のいちばん危ない腐り方。
    const figures = ['src/main/clients/funding.ts', 'src/main/clients/teamradar.ts', 'src/main/clients/stocks.ts', 'src/main/clients/business.ts', 'src/main/clients/kpi.ts'];
    const wrong = figures.filter((f) => LEDGER[f]?.surfacing === 'no-figures');
    expect(wrong).toEqual([]);
  });
});
