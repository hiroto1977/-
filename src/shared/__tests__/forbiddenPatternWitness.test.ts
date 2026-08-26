import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

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
  isCommentLine: (line: string) => boolean;
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
    if (fp.codeOnly && gate.isCommentLine(line)) continue;
    if (fp.pattern.test(line)) n += 1;
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
