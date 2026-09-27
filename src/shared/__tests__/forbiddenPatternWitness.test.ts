import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readOriginalSource } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/*
 * `lint:forbidden` の**外側の証人**。
 *
 * 2026-08-26 に実測した欠陥への対処である。`scripts/lint-forbidden-patterns.cjs`
 * を丸ごと骨抜きにする —— 走査ループを空配列へ、`selfTest` を自称合格へ、
 * `KNOWN_SUPPRESSIONS` を `[]` へ —— と、`src/renderer/pages/A8netPage.tsx` に
 * 本物の `innerHTML =` を植えたまま **lint:forbidden / self-test / chain:verify /
 * verify:arch / eslint / 全 tests がすべて緑**になった。
 *
 * 原因は `scripts/make-live-usb.sh` と同じ形 ——
 * **証人が、証人の対象と同じ紙に書かれている。**
 * 自己テストがゲート自身の中にしか無ければ、1 回の編集で守りと証人が同時に消える。
 * `src/` のファイルにこれが起きないのは、検査が別ファイル (`__tests__/`) に在り、
 * どちらも変異検査に載っているからである。ゲートにも同じ性質を与える。
 *
 * **標本は「規則の綴り」ではなく「禁じたい書き方」で選ぶ。** 正規表現を写すと
 * 表を書き換えたときに検査も一緒に動いてしまい、何も留めない
 * (CLAUDE.md の「検査が、留めるべき表を読んで回っていた」)。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-forbidden-patterns.cjs') as {
  FORBIDDEN_PATTERNS: { name: string; pattern: RegExp; codeOnly?: boolean }[];
  KNOWN_SUPPRESSIONS: unknown[];
  hitsCodeOnly: (fp: { pattern: RegExp; codeOnly?: boolean }, line: string) => boolean;
  EXCLUDE_PATTERNS: RegExp[];
  scanText: (
    rel: string,
    text: string,
    violations: { file: string; line: number; name: string }[],
    suppressions: Set<string>,
  ) => void;
};

/** ゲート本体の走査を、合成のファイル 1 枚に対して回す。 */
function scanOne(rel: string, text: string): { file: string; line: number; name: string }[] {
  const violations: { file: string; line: number; name: string }[] = [];
  gate.scanText(rel, text, violations, new Set());
  return violations;
}

/** 1 行が何件の規則に当たるか。ゲート本体の main と同じ数え方。 */
function hits(line: string): number {
  let n = 0;
  for (const fp of gate.FORBIDDEN_PATTERNS) {
    if (gate.hitsCodeOnly(fp, line)) n += 1;
  }
  return n;
}

/**
 * 禁じたい書き方。**この一覧は仕様であって、実装の写しではない。**
 * ここから 1 つでも当たらなくなったら、その禁止は消えている。
 */
const MUST_RING: [string, string][] = [
  ['Electron: renderer に Node を通す', '    webPreferences: { nodeIntegration: true },'],
  ['Electron: 文脈の隔離を外す', '      contextIsolation: false,'],
  ['Electron: サンドボックスを外す', '      sandbox: false,'],
  ['Electron: 同一生成元ポリシーを外す', '      webSecurity: false,'],
  ['Electron: webview を許す', '      webviewTag: true,'],
  ['HTML パーサへ文字列を流す (innerHTML)', '  el.innerHTML = value;'],
  ['HTML パーサへ文字列を流す (outerHTML)', '  el.outerHTML = value;'],
  ['HTML パーサへ文字列を流す (insertAdjacentHTML)', '  el.insertAdjacentHTML("beforeend", value);'],
  ['React から HTML を流す', '  <div dangerouslySetInnerHTML={{ __html: v }} />'],
  ['文字列をコードとして評価する (Function)', '  const f = new Function("return 1");'],
  ['文字列をコードとして評価する (setTimeout)', '  setTimeout("doIt()", 10);'],
  ['origin を確かめない postMessage の受け口', '  window.addEventListener("message", onMsg);'],
  ['fetch 以外の送信 (sendBeacon)', '  navigator.sendBeacon(url, token);'],
  ['fetch 以外の送信 (WebSocket)', '  const ws = new WebSocket(url);'],
  ['fetch 以外の送信 (画素ビーコン)', '  new Image().src = url;'],
  ['保管領域を直接開ける', '  const db = indexedDB.open("business-hub-vault", 1);'],
];

/** 当たってはいけない、ごく普通の書き方。ここが鳴ると受理すべき物が落ちる。 */
const MUST_STAY_SILENT: [string, string][] = [
  ['素の fetch', '  const res = await fetch(url, init);'],
  ['JSX の img', '  return <img src={thumbSrc} alt="" />;'],
  ['textContent で書く (正しい形)', '  el.textContent = value;'],
  ['関数を渡す setTimeout', '  setTimeout(() => doIt(), 10);'],
  ['click の listener', '  el.addEventListener("click", onClick);'],
  ['ただの真偽値', '  const contextIsolation = true;'],
  ['注釈の中の禁止語', '  // nodeIntegration: true にしてはいけない'],
];

describe('lint:forbidden — 外側の証人 (ゲート自身の外から留める)', () => {
  it.each(MUST_RING)('★ %s は必ず当たる', (_name, line) => {
    expect(hits(line)).toBeGreaterThan(0);
  });

  it.each(MUST_STAY_SILENT)('陰性: %s は当たらない', (_name, line) => {
    expect(hits(line)).toBe(0);
  });

  /*
   * 表そのものが空にされていないこと。上の標本は「当たる規則が 1 つでもあれば」
   * 通るので、**規則を 1 つに減らして全部それに当てる**ような潰し方は
   * 標本だけでは見えない。数の床を別に置く。
   */
  it('規則の数が床を割っていない', () => {
    expect(gate.FORBIDDEN_PATTERNS.length).toBeGreaterThanOrEqual(35);
  });

  it('例外の台帳が空にされていない (双方向照合の錨)', () => {
    expect(gate.KNOWN_SUPPRESSIONS.length).toBeGreaterThanOrEqual(40);
  });

  it('走査の除外に src が丸ごと入っていない', () => {
    const swallowsSrc = gate.EXCLUDE_PATTERNS.some(
      (re) => re.test('src/main/main.ts') || re.test('src/renderer/pages/A8netPage.tsx'),
    );
    expect(swallowsSrc).toBe(false);
  });

  /*
   * **表が正しいことと、その表で走査していることは別である。**
   *
   * 上の標本は `FORBIDDEN_PATTERNS` を直接引いているので、
   * **走査ループだけを空にする**改竄では 1 つも鳴らない (実測した)。
   * ゲート本体の `scanText` を合成のファイルへ当てて、
   * 「規則で実際に走査している」ことをここで留める。
   */
  it.each(MUST_RING)('★ 走査本体も %s を報告する', (_name, line) => {
    const found = scanOne('src/renderer/pages/Probe.tsx', `const x = 1;\n${line}\n`);
    expect(found.length).toBeGreaterThan(0);
    // 行番号まで見る。ファイル単位で「どこかに在る」と数えると、同居した
    // 別の行で通ってしまう (CLAUDE.md 0-a-17)。
    expect(found.map((v) => v.line)).toContain(2);
  });

  it.each(MUST_STAY_SILENT)('陰性: 走査本体は %s を報告しない', (_name, line) => {
    expect(scanOne('src/renderer/pages/Probe.tsx', `${line}\n`)).toHaveLength(0);
  });

  it('走査本体は allowFile の例外を握り潰し、その事実を記録する', () => {
    const suppressions = new Set<string>();
    const violations: { file: string; line: number; name: string }[] = [];
    // imageUrlGate.ts は「CSS の url() へ生の値を差し込んでいる」規則の唯一の例外。
    gate.scanText('src/shared/imageUrlGate.ts', 'const s = `url("${u}")`;\n', violations, suppressions);
    expect(violations).toHaveLength(0);
    expect([...suppressions].some((x) => x.includes('imageUrlGate.ts'))).toBe(true);
  });

  it('規則には名前がある (名無しの規則は台帳に書けない)', () => {
    for (const fp of gate.FORBIDDEN_PATTERNS) {
      expect(typeof fp.name).toBe('string');
      expect(fp.name.length).toBeGreaterThan(0);
    }
  });
});

/*
 * **走査が的を外していないことの、外側からの証人。** (2026-09-07)
 *
 * ゲートには錨が 1 つあった —— `KNOWN_SUPPRESSIONS` の双方向照合。走査が死んで
 * 例外の一致が消えれば鳴る。実測で `src` / `scripts` / `orchestration` の
 * どれを落としても鳴った。**ところが錨は「例外が在る場所」にしか無い。**
 * `assets` を落とすと **exit 0 のまま**で、そこに在る 1 本は `assets/sw.js`
 * —— 出荷される Service Worker、単一 HTML の外で全タブに常駐する唯一の
 * スクリプトである。根を足したのは 2026-08-22 で「丸ごと見えていなかった」から
 * だったのに、その直しには錨が無く、同じ形で黙って元へ戻れた。
 *
 * ゲート側に床 (`SCAN_ROOTS`) と名指し (`MUST_SCAN`) を置いたが、**それも
 * ゲートと同じ紙に在る**。このファイルの冒頭に書いた通り、同じ紙の証人は
 * 1 回の編集で一緒に消える。だから床の**存在**と**効き**をここから見る。
 */
const live = req('../../../scripts/lint-forbidden-patterns.cjs') as {
  SCAN_ROOTS: { dir: string; min: number; why?: string }[];
  MUST_SCAN: string[];
  rootShortfalls: (counts: Record<string, number>, roots?: { dir: string; min: number }[]) => string[];
  missingMustScan: (visited: Set<string>, must?: string[]) => string[];
  realRootCounts: () => Record<string, number>;
  realVisited: () => Set<string>;
};

describe('lint:forbidden — 走査が生きていること (外側の証人)', () => {
  it('出荷する Service Worker は名指しで走査対象に入っている', () => {
    expect(live.MUST_SCAN).toContain('assets/sw.js');
    /*
     * 2026-09-20 (パス 347) から、**リポジトリ直下の設定 3 本**も名指しで入る。
     * `SCAN_ROOTS` はディレクトリの一覧なので直下はどの根にも入らず、
     * `vite.config.ts` (出荷 HTML の中身を決める) に `eval(` を植えても
     * 当時は 4 つのゲートが全部 exit 0 だった。
     */
    for (const f of ['vite.config.ts', 'vitest.config.ts', 'eslint.config.js']) {
      expect(live.MUST_SCAN, f).toContain(f);
    }
  });

  it('★ 実物の走査が名指しの全部へ届いている', () => {
    expect(live.missingMustScan(live.realVisited())).toEqual([]);
    // 標本: 届いていなければ鳴る (規則が空振りしていないこと)。
    // **数は `MUST_SCAN` から導く** —— ここに数字を書くと、名指しを 1 本足した日に
    // 「検査が古いだけ」で落ちる (パス 346 と同じ形なので繰り返さない)。
    expect(live.missingMustScan(new Set())).toHaveLength(live.MUST_SCAN.length);
    expect(live.MUST_SCAN.length).toBeGreaterThanOrEqual(4);
  });

  it('★ 出荷物の在る根には床が置かれている (0 は「床が無い」ではない)', () => {
    const assets = live.SCAN_ROOTS.find((r) => r.dir === 'assets');
    expect(assets?.min).toBeGreaterThanOrEqual(1);
    // 床 0 の根は理由を書いてあること (「床が無い」と区別する)。
    for (const r of live.SCAN_ROOTS) {
      if (r.min === 0) expect((r.why ?? '').length).toBeGreaterThan(8);
    }
  });

  it('★ 実物の根はすべて床を満たし、床を上げれば鳴る (対照)', () => {
    expect(live.rootShortfalls(live.realRootCounts())).toEqual([]);
    const raised = live.SCAN_ROOTS.map((r) => ({ ...r, min: r.min + 100000 }));
    expect(live.rootShortfalls(live.realRootCounts(), raised)).toHaveLength(live.SCAN_ROOTS.length);
  });

  it('走査の死 (根が消えて 0 件) は床で鳴る', () => {
    const withFloor = live.SCAN_ROOTS.filter((r) => r.min > 0);
    expect(withFloor.length).toBeGreaterThan(0);
    expect(live.rootShortfalls({}, withFloor)).toHaveLength(withFloor.length);
  });
});

/**
 * **JSX テキストの URL 1 つで `codeOnly` の規則を迂回できた** (2026-09-25 · パス 464)。
 *
 * `hitsCodeOnly` は行を `stripComments` に通してから針を当てる。その走査器は
 * **JS の字句解析器**なので、JSX の素のテキストに在る `//` を行注記として読み、
 * **その行の後ろを丸ごと落としていた**。実測 (実物のゲートを `A8netPage.tsx` に当てる):
 *
 * - 素の行に外部窓を開く呼び出しを置く → **❌ 1 件**
 * - 同じ行の JSX テキストに URL を 1 つ足す → **✅ 0 件**
 *
 * つまり「外部 URL は `serviceHub.openExternal` 経由に統一する」という CLAUDE.md の
 * 規約は、**URL を 1 つ書くだけで迂回できた**。直しは共有の走査器の側
 * (`://` は行注記を始めない) で、ここはその害が閉じたことを**ゲート本体で**留める。
 *
 * **標本はゲートの正規表現を写さない** —— 上の `MUST_RING` と同じ規準で、
 * 「禁じたい書き方」を書く。
 */
describe('★ JSX テキストの URL で規則を迂回できない (パス 464)', () => {
  /** 迂回に使えた形。前半は JSX の素のテキスト、後半が禁じたい書き方。 */
  const EVASION = "    <p>docs: http://example.com</p>{void window.open('https://evil.example')}";
  /** 同じ禁止に当たる素の行 (錠が生きていることの対照)。 */
  const PLAIN = "    <p>{void window.open('https://evil.example')}</p>";

  it('素の行も、JSX テキストに URL が在る行も、同じだけ鳴る', () => {
    expect(hits(PLAIN), '素の行で鳴らない = 錠が死んでいる').toBeGreaterThanOrEqual(1);
    expect(hits(EVASION), 'URL を 1 つ足しただけで見落としている').toBe(hits(PLAIN));
  });

  it('ゲート本体の走査 (ファイル 1 枚) でも見落とさない', () => {
    const v = scanOne('src/renderer/pages/Probe.tsx', `export function P() {\n  return (\n${EVASION}\n  );\n}\n`);
    expect(v.map((x) => x.name)).toContain('window.open');
    expect(v[0]?.line, '行番号がずれている').toBe(3);
  });

  it('★ 対照: 本物の行注記に書いた禁止語は今までどおり数えない', () => {
    // 言及と宣言を見分ける側 (法則 `mention-vs-declaration`) は壊していない。
    expect(hits("    // かつて window.open('x') と書いていた")).toBe(0);
  });
});

/*
 * **免除の枠に散文が混ざっていた** (2026-09-25 · パス 466)。
 *
 * 台帳の鍵は `規則 :: ファイル :: 件数` で、件数はパス 273 が
 * 「ファイル名だけだと新しい違反を足しても鳴らない」として足した物である。
 * ところが `codeOnly` でない規則 (実測 38 中 14) は**注記の中でも鳴る** ——
 * それは測って決めた方針で (パス 370)、走査は綴りしか見ないので例外を作れば
 * そこが穴になる。**問題は枠のほうだった**: 件数が 1 つの数なので散文が食う。
 *
 * 決定的な対照 (2026-09-25 · 実測): `src/main/clients/ollama.ts` の免除は
 * `:: 2` で、その 2 件は**どちらも注記**である。注記から綴りを消し、
 * 同じ数だけ**本物の書き込み口への fetch** を入れると件数は 2 のままなので、
 * ゲートは `✅ no forbidden patterns found (例外 53 件はすべて台帳どおり)` と答えた ——
 * CVE-2024-37032 (Probllama) ほかが実装される当の口が CI を素通りした。
 *
 * ここはその害が閉じたことを**ゲート本体の鍵で**留める。
 * **綴りは再現しない** —— この検査ファイル自身が走査対象なので、
 * 書き込み口の経路名をそのまま書くと**この検査が規則に当たる** (パス 372 と同じ手)。
 */
describe('★ 免除の枠に散文が混ざらない (パス 466)', () => {
  const OLLAMA_MAIN = 'src/main/clients/ollama.ts';
  const RULE = 'Ollama write-side endpoints in network code';
  /**
   * 綴りを再現せずに組み立てる (この検査ファイル自身が走査対象なので、
   * 経路名をそのまま書くと**この検査が規則に当たる**)。
   */
  const WRITE_WORDS = ['pull', 'create', 'push', 'copy', 'delete', 'blobs', 'upload'];
  const WRITE_PATHS = WRITE_WORDS.map((w) => `/api/${w}`);
  /** 実物の綴りを無意味にする (規則は**行**で数えるので、1 行の全部を潰す)。 */
  const BLUR = new RegExp(`/api/(${WRITE_WORDS.join('|')})`, 'g');

  /** そのファイル 1 枚に対して、ゲートが記録する免除の鍵。 */
  const keyOf = (rel: string, text: string): string[] => {
    const sup = new Set<string>();
    gate.scanText(rel, text, [], sup);
    return [...sup].filter((k) => k.startsWith(RULE));
  };

  /** 免除の鍵から件数だけを取る (直す前の鍵の形)。 */
  const countOf = (key: string): string => key.replace(/ \(code \d+\)$/, '');

  const real = readOriginalSource(path.join(REPO_ROOT, OLLAMA_MAIN));
  /** 注記の 2 行を消し、同じ数だけ**本物の呼び出し**を足した姿 (決定的な対照)。 */
  const swapped = `${real.replace(BLUR, '/api/xxxx')}
async function probe(base: string, f: typeof fetch): Promise<void> {
  await f(\`\${base}${WRITE_PATHS[0]}\`, { method: 'POST' });
  await f(\`\${base}${WRITE_PATHS[1]}\`, { method: 'POST' });
}
`;

  it('前提: 実物の 2 件はどちらも注記で、台帳がそう名乗っている', () => {
    const keys = keyOf(OLLAMA_MAIN, real);
    expect(keys, '免除が 1 つだけ立つ').toHaveLength(1);
    expect(keys[0]).toContain('(code 0)');
    expect(gate.KNOWN_SUPPRESSIONS as string[]).toContain(keys[0]);
  });

  it('★ 散文を同じ数の本物の呼び出しへ入れ替えると、台帳に無い鍵になる (= 鳴る)', () => {
    const keys = keyOf(OLLAMA_MAIN, swapped);
    expect(keys).toHaveLength(1);
    // **台帳の綴りに依らない主張** —— 鍵そのものが動くこと。
    // 台帳だけを見ると、門を直す前へ戻したのに台帳が新しいままのとき緑になる。
    expect(keys[0], '実物と入れ替えた姿が同じ鍵 = 門が入れ替えを見ていない').not.toBe(
      keyOf(OLLAMA_MAIN, real)[0],
    );
    expect(keys[0], '入れ替えたのに code 0 のまま = 内訳が効いていない').not.toContain('(code 0)');
    expect(
      gate.KNOWN_SUPPRESSIONS as string[],
      '台帳に在る = 本物の書き込み口が CI を素通りする',
    ).not.toContain(keys[0]);
  });

  it('★ 対照: 件数だけの鍵 (直す前の形) では同じ鍵になり、門が黙る', () => {
    const before = countOf(keyOf(OLLAMA_MAIN, real)[0] ?? '');
    const after = countOf(keyOf(OLLAMA_MAIN, swapped)[0] ?? '');
    expect(before, '前提: 鍵が取れている').not.toBe('');
    expect(after, '直す前の鍵では入れ替えが見えない (これが欠陥)').toBe(before);
  });

  it('入れ替えた姿には本物の呼び出しが 2 本在る (標本が的に当たっている)', () => {
    const v = scanOne(OLLAMA_MAIN, swapped);
    // 免除の効くファイルなので違反としては出ない —— 出るのは免除の鍵のほう。
    expect(v).toHaveLength(0);
    expect(keyOf(OLLAMA_MAIN, swapped)[0]).toMatch(/:: 2$/);
  });
});
