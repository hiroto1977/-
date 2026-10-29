/**
 * **送り先を決める設定を書く出荷コードは、持ち主の確認を通る** (2026-10-29 · パス 554 · threat: T-219)。
 *
 * ## 実測 (2026-10-29 · 直す前)
 *
 * アプリが**どこへ**資格情報と本文を送るかを決める設定は 2 つ:
 *
 * | 設定 | 保管先 | 書く口 | 乗る物 |
 * | --- | --- | --- | --- |
 * | BYO プロキシ (`setProxyConfig`) | IndexedDB (平文) | `SettingsPage` の「保存」 | 経由する全要求の `Authorization` |
 * | Ollama の接続先 (`OLLAMA_ENDPOINT_KEY`) | localStorage (平文) | `OllamaPage` の「接続テスト」 | 会話の本文 |
 *
 * **どちらも通常の保存と同じ 1 押しで書けた。** 資格情報そのものの書き込みには本人確認 (T-183) が
 * 要るのに、その資格情報が丸ごと渡る**先**を変える操作には何も要らなかった —— 本人確認は main の
 * IPC にだけ掛かり、この 2 つは IPC を通らない (ブラウザ版の `shim.invoke` にも無い)。
 *
 * ## この検査が持つもの
 *
 * **母集団**である —— 走査が見つけた書き手 1 件ずつに、設定の種類と、通っている門を名乗らせる
 * (両方向)。新しい書き手が増えれば「どの門を通るのか書け」と鳴り、消えた行が台帳に残っても鳴る。
 * 同じファイルに 2 つ目の (門の無い) 書き込みが生えても件数で鳴る。
 * **判定そのものの正しさは振る舞いの検査が持つ**
 * (`pages/__tests__/proxyStepUpOnScreen.test.ts` / `pages/__tests__/ollamaEndpointStepUp.test.ts`)。
 *
 * ## 限界 (正直に)
 * 門はレンダラーの中に在る。レンダラーを乗っ取った相手 (別の `file://` の HTML · C1) は保管層へ
 * 直接書ける。この門が止めるのは**人の手** —— 貼り付けを促す指示に従う前に立ち止まれること。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const ROOT = join(__dirname, '..');

type Setting = 'proxy' | 'ollama';

/**
 * 針 2 本。**注記を落としてから**当てる —— `security/egressStepUp.ts` の docblock は
 * 「`setProxyConfig` を直接呼べる」と限界を述べており、注記を読むとそこが書き手に見える。
 * - プロキシ: `setProxyConfig(` のうち **null でない物** (`setProxyConfig(null)` は消す口で、
 *   逃げ口は門の外に置く —— 法則 `escape-hatch-stays-open`)。定義 (`function setProxyConfig(`) は除く。
 * - Ollama: `.setItem(OLLAMA_ENDPOINT_KEY` と、鍵の綴りを直書きした形の両方。
 */
const NEEDLES: Readonly<Record<Setting, RegExp>> = {
  proxy: /(?<!function\s)\bsetProxyConfig\s*\(\s*(?!null\b)/g,
  ollama: /\.setItem\s*\(\s*(?:OLLAMA_ENDPOINT_KEY\b|['"]servicehub\.ollama\.endpoint['"])/g,
};

/** 台帳の 1 行。`writes` は**そのファイルの書き込みの数** (2 つ目が門無しで生えたら鳴る)。 */
interface Row {
  readonly file: string;
  readonly setting: Setting;
  /** 書く前に通る判定 (`security/egressStepUp.ts` の名前)。 */
  readonly guard: string;
  /** 確認を通った後にだけ呼ばれる、書き込みを持つ関数の名前。 */
  readonly writer: string;
  readonly writes: number;
  readonly why: string;
}

const LEDGER: readonly Row[] = [
  {
    file: 'pages/SettingsPage.tsx',
    setting: 'proxy',
    guard: 'proxyChangeNeedsStepUp',
    writer: 'applySave',
    writes: 1,
    why:
      '`ProxySection` の「保存」。`save()` は書かずに `pending` へ置き、`StepUpPassword` が保管庫の'
      + 'パスワードで照合してから `applySave` が書く。どの URL も端末の外なので判定は常に真。'
      + '「削除」(`setProxyConfig(null)`) は門の外 —— 消す口は閉じない。',
  },
  {
    file: 'pages/OllamaPage.tsx',
    setting: 'ollama',
    guard: 'ollamaEndpointNeedsStepUp',
    writer: 'writeEndpoint',
    writes: 1,
    why:
      '`ConnectionSetup` の「接続テスト」。ブラウザ版で、解決した先が loopback でないときだけ'
      + '`pendingEndpoint` へ置いて `StepUpPassword` を通す (同じ端末へのポート番号は本文が端末を'
      + '出ないので 1 押しのまま)。デスクトップ版の main は 127.0.0.1 に固定なので掛けない。',
  },
];

interface Hit {
  readonly file: string;
  readonly setting: Setting;
  readonly at: number;
}

function walk(dir: string, rel: string, out: string[]): void {
  for (const e of readOriginalDirEntries(dir)) {
    if (e.name === '__tests__' || e.name === '__audits__') continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, rel === '' ? e.name : `${rel}/${e.name}`, out);
    else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(rel === '' ? e.name : `${rel}/${e.name}`);
  }
}

/** 出荷コードだけ (`src/renderer` の全部から検査と監査を除く)。 */
function shippingFiles(): readonly string[] {
  const out: string[] = [];
  walk(ROOT, '', out);
  return out.sort();
}

const code = (file: string): string => stripComments(readOriginalSource(join(ROOT, file)));

let hitsCache: readonly Hit[] | null = null;
function hits(): readonly Hit[] {
  if (hitsCache !== null) return hitsCache;
  const out: Hit[] = [];
  for (const file of shippingFiles()) {
    const src = code(file);
    for (const setting of ['proxy', 'ollama'] as const) {
      for (const m of src.matchAll(NEEDLES[setting])) out.push({ file, setting, at: m.index ?? 0 });
    }
  }
  hitsCache = out;
  return out;
}

/** 位置 `at` を直前に含む、いちばん近い `function 名前(` の名前 (入れ子の関数も数える)。 */
function nearestFunctionName(src: string, at: number): string | null {
  const before = src.slice(0, at);
  const names = [...before.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]!);
  return names.length === 0 ? null : names[names.length - 1]!;
}

const key = (r: { file: string; setting: Setting }) => `${r.file}::${r.setting}`;

describe('送り先を決める設定の書き手の母集団 (threat: T-219)', () => {
  it('★ 走査は空でない (針が死んでいない)', () => {
    expect(hits().length).toBeGreaterThanOrEqual(2);
    expect(shippingFiles().length).toBeGreaterThanOrEqual(100);
  });

  it('★ 針の標本: 書く形は数え、消す形・読む形・定義は数えない', () => {
    const p = NEEDLES.proxy;
    expect([...'await setProxyConfig(next);'.matchAll(p)]).toHaveLength(1);
    expect([...'setProxyConfig({ url })'.matchAll(p)]).toHaveLength(1);
    expect([...'await setProxyConfig(null);'.matchAll(p)]).toHaveLength(0);
    expect([...'export async function setProxyConfig(cfg: ProxyConfig | null) {'.matchAll(p)]).toHaveLength(0);
    const o = NEEDLES.ollama;
    expect([...'localStorage.setItem(OLLAMA_ENDPOINT_KEY, next);'.matchAll(o)]).toHaveLength(1);
    expect([..."localStorage.setItem('servicehub.ollama.endpoint', next);".matchAll(o)]).toHaveLength(1);
    expect([...'localStorage.getItem(OLLAMA_ENDPOINT_KEY)'.matchAll(o)]).toHaveLength(0);
    expect([...'localStorage.removeItem(OLLAMA_ENDPOINT_KEY)'.matchAll(o)]).toHaveLength(0);
    // 実物にその形が在る (針が的に当たっている)。
    expect(code('pages/SettingsPage.tsx')).toContain('await setProxyConfig(null);');
    expect(code('network/ollamaWeb.ts')).toContain('localStorage.getItem(OLLAMA_ENDPOINT_KEY)');
    // 注記の中の言及は数えない (egressStepUp.ts の docblock が `setProxyConfig` を名指しする)。
    expect(readOriginalSource(join(ROOT, 'security/egressStepUp.ts'))).toContain('`setProxyConfig` を');
    expect(hits().filter((h) => h.file === 'security/egressStepUp.ts')).toEqual([]);
  });

  it('★ 走査の一致は、すべて台帳に在る (新しい書き手は「どの門を通るか」を書く)', () => {
    const known = new Set(LEDGER.map(key));
    expect([...new Set(hits().map(key))].filter((k) => !known.has(k))).toEqual([]);
  });

  it('★ 台帳の行は、すべて走査に在る (消えた行が残らない)', () => {
    const found = new Set(hits().map(key));
    expect(LEDGER.map(key).filter((k) => !found.has(k))).toEqual([]);
  });

  it('★ 書き込みの数はファイルごとに台帳どおり (2 つ目が門無しで生えたら鳴る)', () => {
    for (const row of LEDGER) {
      const n = hits().filter((h) => h.file === row.file && h.setting === row.setting).length;
      expect(n, `${key(row)} の書き込みは ${row.writes} 件のはずが ${n} 件`).toBe(row.writes);
    }
  });

  it('★ 書き手は、門 (判定) と確認の部品を**自分の**ファイルで読み、書き込みは確認後の関数の中に在る', () => {
    for (const row of LEDGER) {
      const src = code(row.file);
      expect(src, `${row.file} が StepUpPassword を描いていない`).toContain('<StepUpPassword');
      expect(src, `${row.file} が ${row.guard} を読んでいない`).toMatch(
        new RegExp(`import \\{[^}]*\\b${row.guard}\\b[^}]*\\} from '\\.\\./security/egressStepUp'`),
      );
      expect(src, `${row.file} が ${row.guard} を呼んでいない`).toContain(`${row.guard}(`);
      // 書き込みは「確認を通った後にだけ呼ばれる関数」の中に在り、その関数が onApproved の先である。
      const hit = hits().find((h) => h.file === row.file && h.setting === row.setting)!;
      expect(nearestFunctionName(src, hit.at), `${key(row)} の書き込みが ${row.writer} の中に無い`).toBe(row.writer);
      expect(src, `${row.file} の onApproved が ${row.writer} を呼んでいない`).toMatch(
        new RegExp(`onApproved=\\{\\(\\) => ${row.writer}\\(`),
      );
      // 門の無い道から書き手を直接呼ぶ所は、判定の分岐の下にだけ在る (判定が偽のときの 1 押し)。
      const guardCalls = [...src.matchAll(new RegExp(`${row.guard}\\(`, 'g'))].length;
      expect(guardCalls, `${row.file} の ${row.guard} の呼び出しは 1 つ`).toBe(1);
    }
  });

  it('★ Ollama の門はブラウザ版にだけ掛かる (デスクトップ版の main は loopback に固定)', () => {
    const row = LEDGER.find((r) => r.setting === 'ollama')!;
    const src = code(row.file);
    const at = src.indexOf(`${row.guard}(`);
    const line = src.slice(src.lastIndexOf('\n', at), src.indexOf('\n', at));
    expect(line).toContain("buildKind === 'browser' &&");
    // main の接続先は固定 (この検査は 1 行の事実を留めるだけ —— 判定は ollama.test.ts が持つ)。
    const main = stripComments(readOriginalSource(join(ROOT, '..', 'main', 'clients', 'ollama.ts')));
    expect(main).toContain("'http://127.0.0.1:11434'");
  });

  it('★ 台帳の理由は省略形ではない', () => {
    for (const row of LEDGER) expect(row.why.length, key(row)).toBeGreaterThan(40);
  });
});
