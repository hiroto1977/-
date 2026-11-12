/**
 * **社外向けポータルの取り込みの閉包** (2026-11-11)。
 *
 * 関門 `portalScreenOrNull` (`shared/portal.mamori`) は「この画面を開いてよいか」を決めるが、
 * **配る HTML に社内の画面が入っていないこと**は関門では守れない (入っていれば、別の道で開ける)。
 * ここは入口 (`portal/partnerMain.tsx` / `portal/customerMain.tsx`) から辿れるモジュールを esbuild に数えさせ、
 * 入ってはいけない物が 1 つも無いことを見る。
 *
 * - **数えるのは取り込みの閉包 (import の連なり) で、束に残った物ではない** —— 束ね方 (tree-shaking) は
 *   道具ごとに違うので、「辿れる」こと自体を閉じる。
 * - **カスタマー**: 閉包を**全件**名指しで持つ (小さいので)。1 つ増えても減っても落ちる。
 * - **パートナー**: 画面 2 つ (書類スタジオ・コンプライアンス) が計算の部品を広く読むので、全件は持たない。
 *   代わりに ① 入ってはいけない物の型が 0 件 ② 目を引く物 (暗号・AI・保管層・見本) は理由つきの台帳と両方向。
 *
 * 画面の表 (入口のファイルが `mountPortal` へ渡す物) と台帳の一致もここで見る。
 */
import path from 'node:path';
import { build } from 'esbuild';
import { beforeAll, describe, expect, it } from 'vitest';
import { CUSTOMER_SCREENS, PARTNER_SCREENS } from '../../../shared/portal';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const read = (rel: string): string => readOriginalSource(path.join(REPO, rel));

const PARTNER_ENTRY = 'src/renderer/portal/partnerMain.tsx';
const CUSTOMER_ENTRY = 'src/renderer/portal/customerMain.tsx';

/** 入口から辿れる、このリポジトリのモジュール (node_modules は除く)。 */
async function closureOf(entry: string): Promise<string[]> {
  const result = await build({
    entryPoints: [entry],
    absWorkingDir: REPO,
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    logLevel: 'silent',
    outdir: 'portal-closure-out',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
  });
  return Object.keys(result.metafile.inputs)
    .filter((f) => !f.startsWith('node_modules'))
    .sort();
}

/**
 * 社外向けの HTML に入ってはいけない物。`sample` はその型が当たる実在のモジュール
 * (針が的に当たることを下で確かめる)。
 */
const FORBIDDEN: readonly { name: string; re: RegExp; sample: string }[] = [
  { name: '社内版の橋', re: /^src\/renderer\/web-shim\.ts$/, sample: 'src/renderer/web-shim.ts' },
  { name: '社内版の入口', re: /^src\/renderer\/main\.tsx$/, sample: 'src/renderer/main.tsx' },
  { name: '社内版の殻', re: /^src\/renderer\/App\.tsx$/, sample: 'src/renderer/App.tsx' },
  { name: '村の殻', re: /^src\/renderer\/components\/VillageShell\.tsx$/, sample: 'src/renderer/components/VillageShell.tsx' },
  { name: 'ポータルの一覧 (社内版の部品)', re: /^src\/renderer\/portal\/PortalDirectory\.tsx$/, sample: 'src/renderer/portal/PortalDirectory.tsx' },
  { name: '画面の一覧 (全画面の表)', re: /^src\/renderer\/services\.tsx?$/, sample: 'src/renderer/services.ts' },
  { name: '保管庫', re: /^src\/renderer\/security\/vault\.ts$/, sample: 'src/renderer/security/vault.ts' },
  { name: 'ロック画面', re: /^src\/renderer\/security\/LockScreen\.tsx$/, sample: 'src/renderer/security/LockScreen.tsx' },
  { name: '網の経路 (プロキシ・Ollama)', re: /^src\/renderer\/network\//, sample: 'src/renderer/network/proxy.ts' },
  { name: 'OAuth', re: /^src\/renderer\/oauth\//, sample: 'src/renderer/oauth/pkce.ts' },
  { name: '外部サービスへの書き込み', re: /^src\/renderer\/data\/saasWriteWeb\.ts$/, sample: 'src/renderer/data/saasWriteWeb.ts' },
  { name: '外部サービスの API', re: /^src\/shared\/api\//, sample: 'src/shared/api/github.ts' },
  { name: 'AI へ送る経路', re: /^src\/shared\/ai\/chat\.ts$/, sample: 'src/shared/ai/chat.ts' },
  { name: 'ライブラリ (端末の blob 保管)', re: /^src\/renderer\/library\//, sample: 'src/renderer/library/library.ts' },
  { name: '保存先フォルダ', re: /^src\/renderer\/fs\//, sample: 'src/renderer/fs/fsa.ts' },
  { name: 'AI コンシェルジュ', re: /^src\/renderer\/components\/ChatbotWidget\.tsx$/, sample: 'src/renderer/components/ChatbotWidget.tsx' },
  { name: '主プロセス', re: /^src\/main\//, sample: 'src/main/main.ts' },
];

/** 画面のファイル (`pages/X.tsx`)。台帳に名指しした画面の物だけが入ってよい。 */
const PAGE_FILE = /^src\/renderer\/pages\/([A-Za-z0-9]+)\.tsx$/;

/** 入口のファイルが `mountPortal` へ渡す画面の表 (id → 部品の名前)。 */
function registryOf(entryRel: string, portal: string): Record<string, string> {
  const code = stripComments(read(entryRel));
  const call = new RegExp(`mountPortal\\(\\s*'${portal}'\\s*,\\s*\\{([^}]*)\\}`).exec(code);
  if (call === null) throw new Error(`${entryRel}: mountPortal('${portal}', { … }) の形が読めない`);
  const out: Record<string, string> = {};
  for (const m of (call[1] ?? '').matchAll(/([a-z][a-z0-9-]*)\s*:\s*([A-Z][A-Za-z0-9]*)/g)) {
    out[m[1] as string] = m[2] as string;
  }
  return out;
}

let partner: string[] = [];
let customer: string[] = [];

beforeAll(async () => {
  [partner, customer] = await Promise.all([closureOf(PARTNER_ENTRY), closureOf(CUSTOMER_ENTRY)]);
}, 60_000);

describe('走査が生きている', () => {
  it('2 つの入口とも、自分自身と台帳・関門・橋を含む', () => {
    for (const [entry, closure] of [
      [PARTNER_ENTRY, partner],
      [CUSTOMER_ENTRY, customer],
    ] as const) {
      expect(closure, entry).toContain(entry);
      expect(closure, entry).toContain('src/shared/portal.ts');
      expect(closure, entry).toContain('src/renderer/portal/portalShim.ts');
      expect(closure, entry).toContain('src/renderer/portal/PortalScreenView.tsx');
    }
    expect(partner.length).toBeGreaterThan(100);
    expect(customer.length).toBeGreaterThan(10);
  });

  it('入ってはいけない物の型は、実在するモジュールに当たる (針が的に当たる)', () => {
    for (const f of FORBIDDEN) {
      expect(f.re.test(f.sample), f.name).toBe(true);
      expect(() => read(f.sample), `${f.name}: ${f.sample} が実在しない`).not.toThrow();
    }
  });

  it('対照: 社内版の入口の閉包には、入ってはいけない物が実際に在る (型が何も拾わないのではない)', async () => {
    const internal = await closureOf('src/renderer/main.tsx');
    const hit = FORBIDDEN.filter((f) => internal.some((m) => f.re.test(m))).map((f) => f.name);
    // 主プロセスは社内版のブラウザの束にも入らない。それ以外は全部、社内版の閉包に在る。
    expect(hit).toEqual(FORBIDDEN.filter((f) => f.name !== '主プロセス').map((f) => f.name));
  }, 60_000);
});

describe('★ 社外向けの HTML に、社内の物が入っていない', () => {
  it('パートナー: 入ってはいけない物が 0 件', () => {
    const found = FORBIDDEN.flatMap((f) => partner.filter((m) => f.re.test(m)).map((m) => `${f.name}: ${m}`));
    expect(found).toEqual([]);
  });

  it('カスタマー: 入ってはいけない物が 0 件', () => {
    const found = FORBIDDEN.flatMap((f) => customer.filter((m) => f.re.test(m)).map((m) => `${f.name}: ${m}`));
    expect(found).toEqual([]);
  });

  it('★ パートナーに入る画面は、台帳に名指しした画面の物だけ (両方向)', () => {
    const registry = registryOf(PARTNER_ENTRY, 'partner');
    const ledger = PARTNER_SCREENS.filter((s) => s.kind === 'service').map((s) => s.id).sort();
    expect(Object.keys(registry).sort()).toEqual(ledger);

    const pagesInClosure = partner.flatMap((m) => {
      const hit = PAGE_FILE.exec(m);
      return hit === null ? [] : [hit[1] as string];
    });
    expect(pagesInClosure.sort()).toEqual(Object.values(registry).sort());
  });

  it('★ カスタマーにはアプリの画面が 1 つも入らない (表も空)', () => {
    expect(CUSTOMER_SCREENS.filter((s) => s.kind === 'service')).toEqual([]);
    expect(registryOf(CUSTOMER_ENTRY, 'customer')).toEqual({});
    expect(customer.filter((m) => PAGE_FILE.test(m))).toEqual([]);
  });

  it('★ カスタマーの閉包は、この一覧ちょうど (1 つ増えても減っても落ちる)', () => {
    expect(customer).toEqual(
      [
        'src/renderer/components/PageErrorBoundary.tsx',
        'src/renderer/components/VettedLink.tsx',
        'src/renderer/portal/PortalApp.tsx',
        'src/renderer/portal/PortalScreenView.tsx',
        'src/renderer/portal/PublishedScreen.tsx',
        'src/renderer/portal/customerMain.tsx',
        'src/renderer/portal/portalContent.ts',
        'src/renderer/portal/portalEntry.tsx',
        'src/renderer/portal/portalShim.ts',
        'src/renderer/security/frameGuard.ts',
        'src/renderer/security/frameGuardHost.ts',
        'src/renderer/styles.css',
        'src/renderer/vettedSinks.ts',
        'src/shared/buildDestinations.ts',
        'src/shared/externalUrlGate.ts',
        'src/shared/inputCeiling.ts',
        'src/shared/linkSpoof.ts',
        'src/shared/lookup.ts',
        'src/shared/portal.ts',
        'src/shared/redact.ts',
        'src/shared/serviceId.ts',
      ].sort(),
    );
  });
});

/**
 * パートナーの閉包のうち**目を引く物** —— 名前だけ見ると「社外へ出してよいのか」と問いたくなるモジュール。
 * 入れてよい理由を 1 つずつ書く。型に当たるのに台帳に無ければ落ち、台帳に在るのに閉包から消えても落ちる。
 */
const NOTABLE = /\/security\/|\/shared\/ai\/|ollama|aiEndpoint|\/data\/store\.ts$|recordCipher|\/data\/snapshot\.ts$|credentialUse|cryptoParams|grokSnapshot/;

const ACCEPTED: Readonly<Record<string, string>> = {
  'src/renderer/security/frameGuard.ts': '枠の中で開かれたら描かない判定 (配る HTML にも要る守り)。',
  'src/renderer/security/frameGuardHost.ts': '上の判定の host 壁 (window.top を読むだけ)。',
  'src/renderer/security/dataCrypto.ts': '記録の封緘の入口。書類スタジオが読む記録層 (useCollection → store) が取り込む。鍵はこの HTML に無く、封緘は有効にならない。',
  'src/renderer/security/dataCryptoHost.ts': '上の host 壁 (WebCrypto を呼ぶだけ)。',
  'src/renderer/security/webCrypto.ts': 'WebCrypto の薄い包み。保管庫 (vault.ts) ではない —— 保管庫は入ってはいけない物の側で 0 件を見る。',
  'src/renderer/data/recordCipher.ts': '記録を封緘する器。鍵を渡す者 (保管庫) が居ないので平文のまま通す。',
  'src/renderer/data/store.ts': '端末内の記録層 (IndexedDB)。書類スタジオが KPI・貸借対照表・提出者情報の取り込みに読む。取引先の端末では空で、網へは出ない。',
  'src/renderer/data/snapshot.ts': '全サービスの同梱の見本 (約 70 KB)。画面が `SNAPSHOT[id]` を引くために丸ごと入る。架空の値で秘密は無いが、社内の画面の見本まで運ぶ —— 画面ごとに割るのは残作業 (docs/REMAINING_WORK.md)。',
  'src/shared/grokSnapshot.ts': '上の見本が読む Grok 画面の見本 (提供者の表を引くだけ)。',
  'src/shared/ai/providers.ts': 'AI 提供者の表 (名前・既定モデル・端点の文字列)。**送る経路 (shared/ai/chat.ts) は入らない** (入ってはいけない物の側で 0 件を見る)。網へ出る口は CSP の connect-src none も塞ぐ。',
  'src/shared/aiEndpoint.ts': '提供者の表が読む、端点の形の判定 (純関数)。',
  'src/shared/ollama.ts': '見本が読む Ollama の版の判定と文面 (純関数)。',
  'src/shared/ollamaCore.ts': '同上 (モデル名の形の判定)。',
  'src/shared/ollamaHost.ts': '同上の host 壁。呼ばれない。',
  'src/shared/cryptoParams.ts': '暗号の定数の表 (反復回数ほか)。値だけで、鍵は無い。',
  'src/shared/credentialUse.ts': '「このサービスは資格情報を預かるか」の宣言の表。StatusBar が入力欄を出すかの判定に読む (このポータルの 2 画面はどちらも預からない —— portalGate.test.ts)。',
};

describe('★ パートナーの閉包の「目を引く物」は、理由つきの台帳と両方向に一致する', () => {
  it('型に当たるモジュール ⇔ 台帳', () => {
    const notable = partner.filter((m) => NOTABLE.test(m)).sort();
    expect(notable).toEqual(Object.keys(ACCEPTED).sort());
  });

  it('理由は空でなく、省略の決まり文句でもない', () => {
    const lazy = /^(同上|TBD|TODO|あとで)[。.]?$/;
    expect(lazy.test('同上。')).toBe(true); // 針が禁じたい文面に当たる
    for (const [mod, why] of Object.entries(ACCEPTED)) {
      expect(why.length, mod).toBeGreaterThanOrEqual(15);
      expect(lazy.test(why), mod).toBe(false);
    }
  });

  it('カスタマーには「目を引く物」が枠の守りしか無い', () => {
    expect(customer.filter((m) => NOTABLE.test(m))).toEqual([
      'src/renderer/security/frameGuard.ts',
      'src/renderer/security/frameGuardHost.ts',
    ]);
  });
});

describe('ビルドの確認 (selfCheck) の針は、名指しした社内のモジュールに実際に在る', () => {
  const { INTERNAL_MARKERS } = require('../../../../scripts/build-portal.cjs') as {
    INTERNAL_MARKERS: readonly { marker: string; module: string }[];
  };

  it('文面はそのモジュールの原文に在り、そのモジュールは「入ってはいけない物」に載っている', () => {
    expect(INTERNAL_MARKERS.length).toBeGreaterThanOrEqual(5);
    for (const { marker, module: mod } of INTERNAL_MARKERS) {
      expect(read(mod).includes(marker), `${mod} に「${marker}」が無い (針が古びた)`).toBe(true);
      const guarded =
        FORBIDDEN.some((f) => f.re.test(mod)) || (PAGE_FILE.test(mod) && !Object.values(registryOf(PARTNER_ENTRY, 'partner')).includes(PAGE_FILE.exec(mod)?.[1] ?? ''));
      expect(guarded, `${mod} が閉包の検査の対象に無い`).toBe(true);
    }
  });

  it('文面は、社外向けの入口から辿れるどのモジュールにも無い (針が社外向けの物に当たらない)', () => {
    for (const { marker } of INTERNAL_MARKERS) {
      for (const mod of new Set([...partner, ...customer])) {
        if (mod.endsWith('.css')) continue;
        expect(stripComments(read(mod)).includes(marker), `${mod} が「${marker}」を持つ`).toBe(false);
      }
    }
  });
});
