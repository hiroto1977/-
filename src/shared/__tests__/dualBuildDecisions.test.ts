import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { readOriginalDir, readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **デスクトップ版とブラウザ版で「同じ名前の関数」を 2 度書いている所の台帳。**
 *
 * ## なぜ要るか (2026-08-23)
 *
 * `dualBuildParity.test.ts` の頭にはこう書いてある:
 *
 * > 2026-08-22 に main / renderer の両方で定義されている関数名を機械で洗ったら
 * > 36 件あった
 *
 * **洗ったのは 1 度きりで、数え直す仕組みが無かった。** 明日 2 実装が
 * 増えても、パリティ検査が無いまま誰にも気づかれない。
 * 実際この台帳を作る過程で、**照合されていない 2 件**
 * (`renderDashboardHtml` / `renderDashboardMarkdown`) が見つかった
 * (実測の結果どちらも安全だった —— 下の分類に理由を書いてある)。
 *
 * ## 精度のために分類する
 *
 * 「重複はすべてパリティ検査が要る」にすると、`sma` / `ema` / `rsi` のような
 * **純計算まで鳴る**。受理すべき対象が並ぶゲートは鳴らし続けて無視されるので
 * 作らない。3 つに分ける:
 *
 *   'decision'     同じ答えを返さねばならない判定 → **パリティ検査が要る**
 *   'pure'         純計算。ずれれば数字が違うだけで、境界の守りではない
 *   'different'    名前が同じだけで**別の関数** (引数や返り値の型が違う)
 *   'shared-alias' 実体は `src/shared/` に 1 つで、両方はその別名 →
 *                  **ずれようがない**ので突き合わせではなく同一性を主張する
 *   'value'        関数ではなく定数の写し → **同じ値であること**を下の検査が見る
 *
 * 新しい重複が増えたら、どれかに分類して理由を書くことになる。
 *
 * ## 'shared-alias' と 'value' は 2026-09-20 (パス 331) に足した
 *
 * 針を `export function` だけから `async function` / `const` まで広げたら
 * **13 件 → 22 件**になり、増えた 9 件が既存の 3 分類に収まらなかった。
 * `safeStateEquals` は同じパスで shared へ畳んだので写しではなくなり
 * (`shared-alias`)、定数 6 件は「同じ答えを返す関数」ではなく
 * 「同じ値であるべき定数」だった (`value`)。
 */

type Kind = 'decision' | 'pure' | 'different' | 'shared-alias' | 'value';

/** 分類台帳。**増えても減っても鳴る** (双方向)。 */
const LEDGER: Readonly<Record<string, { kind: Kind; why: string }>> = {
  // --- 判定: パリティ検査が突き合わせている ---
  // buildRfc2822 / isSafeHeaderValue は 2026-09-19 (パス 321) に shared/rfc2822.ts の 1 つへ
  // 畳んだ (両ビルドは re-export)。2 実装ではなくなったので、この台帳からは消えた。
  parseAtlassianToken: { kind: 'decision', why: '送り先ホストの許可 (atlassianSiteParity)' },
  // parseSecurityKeys は 2026-09-19 (パス 321) に shared/api/security.ts の 1 つへ畳んだ (両ビルドは re-export)。
  safeStateEquals: {
    kind: 'shared-alias',
    why:
      'CSRF の state 比較。2026-09-20 (パス 331) に `shared/constantTimeEquals.ts` の 1 つへ畳んだ —— '
      + 'それまで main は `Buffer.from(s,\'utf8\')` → `timingSafeEqual`、renderer は UTF-16 の XOR ループで、'
      + '**UTF-8 への変換が孤立サロゲートを U+FFFD へ潰す**ため実測 4,330,561 組のうち 4,192,256 組 (96.8%) で '
      + '答えが割れた (base64url の字だけなら 0 組)。`stateEqualsParity` は同一性を主張する。',
  },
  extractJson: { kind: 'decision', why: 'LLM 応答から JSON を取る (dualBuildParity)' },
  normalizeAnalysis: { kind: 'decision', why: 'LLM 応答を型へ丸める (dualBuildParity)' },
  validateAdvisorJson: { kind: 'decision', why: 'LLM 応答を絞る (advisorValidationParity)' },

  // --- 純計算 ---
  sma: { kind: 'pure', why: '単純移動平均。境界の守りではない' },
  ema: { kind: 'pure', why: '指数移動平均' },
  rsi: { kind: 'pure', why: 'RSI' },
  macd: { kind: 'pure', why: 'MACD' },
  bollingerBands: { kind: 'pure', why: 'ボリンジャーバンド' },
  backtest: { kind: 'pure', why: '過去データの検証。副作用なし' },
  buildTickerAnalysis: { kind: 'pure', why: '上の指標を束ねるだけ' },

  // --- 名前が同じだけの別関数 ---
  renderDashboardHtml: {
    kind: 'different',
    why: '引数の型が違う (main は StocksSnapshot / ブラウザは平坦な watchlist)。'
      + '2026-08-23 に敵性入力で実測し、**どちらも escapeXml を通していて生タグを出さない**ことを確認',
  },
  renderDashboardMarkdown: {
    kind: 'different',
    why: '同上。Markdown も HTML として描画されうるので同じ入力で確認済み',
  },

  // --- 2026-09-20 (パス 331) に針を広げて初めて映った 9 件 ---
  generatePkce: {
    kind: 'different',
    why:
      '乱数の取り方が実行環境で違う (main は `node:crypto` の randomBytes・renderer は WebCrypto の '
      + 'getRandomValues) ので実装は分かれる。**返す形も違う** —— main は {verifier, challenge} で '
      + 'state を別に作り、renderer は {verifier, challenge, state} を 1 度に返す。'
      + '**byte 数は 2026-09-20 (パス 336) から `shared/cryptoParams.ts` の 1 つ** —— '
      + 'それまで main verifier 32B / state 16B、renderer verifier 64B / state 32B と割れており、'
      + 'verifier は RFC 7636 §7.1 の RECOMMENDED どおり 32 octet (S256 の原像計算 256 bit が '
      + '律速なので 64 octet は 1 bit も強くしない)、state は床 128 bit の 1 段上の 32 octet に揃えた。'
      + '実物の長さが一致することは `stateEqualsParity.test.ts` が走らせて確かめる。',
  },
  readCapped: {
    kind: 'shared-alias',
    why:
      'どちらも `shared/httpLimits.ts` の `readBodyWithCap` を呼ぶ 1 行の別名で、'
      + '束ねる上限とラベルだけがモジュールごとに違う (パス 330)。判定そのものは shared に 1 つなのでずれようがない。',
  },
  ADVISOR_DISCLAIMER: {
    kind: 'value',
    why: '投資助言でない旨の断り。片方だけ短くなると、そのビルドの画面だけ断りが消える。',
  },
  DEFAULT_RISK_PARAMS: {
    kind: 'value',
    why: '既定のリスク値 (建玉比率・損切り・利確)。割れると同じ操作が両ビルドで別の数字を出す。',
  },
  STRATEGIES: {
    kind: 'value',
    why: '戦略の目録。片方に無い戦略はそのビルドで選べず、同じ id が別の関数を指せば同じ名前で別の売買になる。',
  },
  SMA_CROSSOVER_STRATEGY: {
    kind: 'value',
    why: '戦略 1 件 (関数値)。同じ足を与えて同じシグナルを返すことを下の検査が見る。',
  },
  RSI_MEAN_REVERSION_STRATEGY: {
    kind: 'value',
    why: '戦略 1 件 (関数値)。同上。',
  },
  MACD_SIGNAL_STRATEGY: {
    kind: 'value',
    why: '戦略 1 件 (関数値)。同上。',
  },
};

/**
 * 出荷される宣言の名前を集める針。
 *
 * **2026-09-20 (パス 331) まで `^export function (\w+)` だけだった。**
 * 上の docblock は「main / renderer の両方で定義されている関数名を機械で洗った」
 * と言うが、洗えていたのは `export function` だけで、
 * **`export async function` と `export const` は 1 つも映っていなかった**。
 * 実測 (2026-09-20): 針を広げると **13 件 → 22 件**。映っていなかった 9 件は
 *
 * ```
 *   generatePkce                    renderer が `export async function`
 *   safeStateEquals / readCapped    `export const` の別名
 *   ADVISOR_DISCLAIMER / DEFAULT_RISK_PARAMS / STRATEGIES
 *   SMA_CROSSOVER_STRATEGY / RSI_MEAN_REVERSION_STRATEGY / MACD_SIGNAL_STRATEGY
 * ```
 *
 * 定数 6 件は**画面に出る文面と数字**である (投資助言でない旨の断り・既定の
 * リスク値・戦略の目録)。片方だけ変えても、この台帳は何も言わなかった。
 *
 * 行頭アンカーは残す —— 入れ子の宣言 (関数の中の `export` は文法上ありえないが、
 * インデントされた行は型定義の中の宣言など) を拾わないため。
 */
const EXPORTED_NAME = /^export (?:async function|function|const) ([A-Za-z_][A-Za-z0-9_]*)\b/gm;

/** 出荷される `export` の名前を集める (検査は除く)。 */
function exportedFunctions(root: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (dir: string): void => {
    for (const name of readOriginalDir(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      for (const m of readOriginalSource(full).matchAll(EXPORTED_NAME)) {
        const k = m[1]!;
        out.set(k, [...(out.get(k) ?? []), full]);
      }
    }
  };
  walk(root);
  return out;
}

const duplicates = (): string[] => {
  const main = exportedFunctions('src/main');
  const renderer = exportedFunctions('src/renderer');
  return [...main.keys()].filter((k) => renderer.has(k)).sort();
};

describe('2 実装ある関数は、すべて台帳で分類されている', () => {
  it('台帳と実物が一致する (増えても減っても鳴る)', () => {
    const actual = duplicates();
    const known = Object.keys(LEDGER).sort();
    const added = actual.filter((k) => !(k in LEDGER));
    const gone = known.filter((k) => !actual.includes(k));
    expect(
      added,
      '2 実装が増えました。decision / pure / different に分類して理由を書いてください',
    ).toEqual([]);
    expect(gone, 'もう 2 実装ではありません。台帳から消してください').toEqual([]);
  });

  /*
   * **'decision' に分類したものは、必ず突き合わせている検査が在る。**
   * 分類だけして検査を書かなければ、台帳は「守っているつもり」の一覧になる。
   */
  it("'decision' と 'value' はすべてパリティ検査から参照されている", () => {
    const parityFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readOriginalDir(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== 'node_modules') walk(full);
          continue;
        }
        if (/[Pp]arity\.test\.tsx?$/.test(name)) parityFiles.push(full);
      }
    };
    walk('src');
    expect(parityFiles.length, 'パリティ検査が 1 つも無い').toBeGreaterThan(3);
    /*
     * **import している名前だけを見る。**
     *
     * 最初は「パリティ検査の本文にその名前が出るか」で判定した。
     * 対照実験 (`sma` を decision へ付け替える) が**鳴らなかった** ——
     * `dualBuildParity.test.ts` の注記に「sma / ema / rsi … のような純計算」
     * と**書いてあった**ので、注記に当たって通ってしまっていた。
     *
     * 0-a-17 と同じ形である: 「ファイルのどこかに在るか」で判定すると
     * 同居した文字列で無効化される。**実際に import しているか**を見る。
     */
    const imports = new Set<string>();
    for (const f of parityFiles) {
      const src = stripComments(readOriginalSource(f));
      /*
       * 静的 `import { a } from '…'` と、**動的 `const { a } = await import('…')`**
       * の両方を拾う。最初は静的だけを見ていて `safeStateEquals` を
       * 「検査が無い」と誤って挙げた —— `stateEqualsParity.test.ts` は
       * electron のモックを先に効かせる必要があり、動的 import を使っている。
       */
      const specs: string[] = [];
      for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)) specs.push(m[1]!);
      for (const m of src.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*await\s+import\s*\(/g)) {
        specs.push(m[1]!);
      }
      for (const spec of specs) {
        for (const part of spec.split(',')) {
          // `foo as bar` (静的) と `foo: bar` (分割代入) は元の名前で数える。
          const name = part.trim().split(/\s+as\s+|:/)[0]!.trim();
          if (name) imports.add(name);
        }
      }
    }
    // `value` も同じ要求を掛ける (2026-09-20 · パス 331) —— 定数の写しは
    // 「同じ答えを返す」ではなく「同じ値である」ことを突き合わせる必要がある。
    const missing = Object.entries(LEDGER)
      .filter(([, v]) => v.kind === 'decision' || v.kind === 'value')
      .map(([k]) => k)
      .filter((k) => !imports.has(k));
    expect(missing, "'decision' / 'value' なのに突き合わせている検査が import していない").toEqual([]);
  });

  it('理由が空の項目が無い', () => {
    const blank = Object.entries(LEDGER).filter(([, v]) => v.why.trim().length === 0);
    expect(blank.map(([k]) => k)).toEqual([]);
  });

  /*
   * **保留を台帳に置かない** (2026-09-20 · パス 336)。
   *
   * この台帳の `why` は「**なぜ割れていてよいか**」を書く欄である。ところが
   * 2026-08-23 から 2026-09-20 まで、2 つの項がそこへ
   * 「揃えるか、違う理由を書くかは、どちらが正しいか分かる人が決めること」
   * と**決めていないこと**を書いていた (`MAX_RESPONSE_BYTES` と `generatePkce`)。
   * 理由の欄が埋まっているので検査は通り続け、**1 か月近く誰も決めなかった**。
   *
   * 保留は台帳ではなく `docs/REMAINING_WORK.md` が持つ ——
   * あちらは「残っている物の一覧」として読まれるが、ここは「片付いた物の説明」
   * として読まれるからである。決まっていない物をここへ書くと、
   * **読み手には片付いて見える**。
   *
   * 針は**保留の決まり文句**に当てる (割れている理由の説明は巻き込まない)。
   */
  it('★ 理由の欄に「まだ決めていない」を置いていない', () => {
    const DEFERRAL = /分かる人が決め|わかる人が決め|誰かが決め|決めていない|決まっていない|要検討|TODO/;
    const parked = Object.entries(LEDGER)
      .filter(([, v]) => DEFERRAL.test(v.why))
      .map(([k]) => k);
    expect(parked, '保留は docs/REMAINING_WORK.md へ (台帳は片付いた物の説明)').toEqual([]);
    // 標本 —— 針は実際に在った 2 つの文面へ当たる (綴り違いで黙る検査を作らない)。
    expect('揃えるか違う理由を書くかは分かる人が決めること。').toMatch(DEFERRAL);
    expect('どちらが正しいか分かる人が決めること').toMatch(DEFERRAL);
    // 対照 —— 片付いた理由の書き方は巻き込まない。
    expect('乱数の取り方が実行環境で違うので実装は分かれる。').not.toMatch(DEFERRAL);
    expect('RFC 7636 §7.1 の RECOMMENDED どおり 32 octet。').not.toMatch(DEFERRAL);
  });

  /* 走査そのものが動いていること (空虚に通っていない)。 */
  it('負の対照: 走査は実際に重複を見つけている', () => {
    expect(duplicates().length).toBeGreaterThan(10);
    // `export const` の別名。**狭い針 (`^export function` だけ) ではここが映らない。**
    expect(duplicates()).toContain('safeStateEquals');
    // `export async function`。同上 (renderer の `generatePkce`)。
    expect(duplicates()).toContain('generatePkce');
  });

  /**
   * ★ **針の標本 —— 広げた 2 形に実際に当たり、狭い針では当たらない。**
   *
   * 「22 件ある」と言うだけでは、針が広がったのか母集団が増えたのか
   * 読む側に分からない。同じ検査の中で両方の針を当てて差を見せる。
   */
  it('★ 標本: 広げた針は async function / const に当たり、狭い針は当たらない', () => {
    const NARROW = /^export function (\w+)/gm;
    const grab = (src: string, re: RegExp): string[] => [...src.matchAll(re)].map((m) => m[1]!);
    const sample = [
      'export function sma(a: number[]) {}',
      'export async function generatePkce() {}',
      'export const STRATEGIES = {};',
      'export const safeStateEquals = constantTimeEquals;',
    ].join('\n');
    expect(grab(sample, EXPORTED_NAME).sort()).toEqual(
      ['STRATEGIES', 'generatePkce', 'safeStateEquals', 'sma'],
    );
    expect(grab(sample, NARROW)).toEqual(['sma']);
    // 広げた針が拾ってはいけない物。
    expect(grab('export type Foo = string;', EXPORTED_NAME)).toEqual([]);
    expect(grab("export { sma } from './x';", EXPORTED_NAME)).toEqual([]);
    expect(grab('  export const inner = 1;', EXPORTED_NAME)).toEqual([]);
  });

  /*
   * **この台帳が原理的に見ない範囲 —— 名前が違う 2 実装。**
   *
   * 上の走査は `^export function (\w+)` を両ビルドから集めて**同じ名前**の
   * 重複を数える。だから片方を改名するだけで台帳から消える。実在した例:
   *
   *   main     `clients/assistant.ts`  `sanitizeMessages`
   *   browser  `web-shim.ts`           `sanitizeAssistantTurns`
   *
   * 同じ判断 (外部 API へ送る会話履歴の関門) を 2 度書いていて、上限は
   * **字面で 2 度**書いてあった (8000 / 40 / 60000×2)。2026-08-23 に
   * `shared/assistantLimits.ts` へ寄せ、`assistantTurnsParity.test.ts` で
   * 突き合わせた。
   *
   * **自動では見つけられない。** 本文の類似度で拾う案は誤検知が多く、
   * 受理すべき対象が並ぶゲートは無視されるので採らない。ここは
   * **見つけたものを書き留める場所**であって、検出器ではない。
   * 限界を書かずに置くと「見張っているつもり」になるので明記する。
   */
  const CROSS_NAME_PAIRS: { main: string; web: string; parity: string }[] = [
    {
      main: 'sanitizeMessages',
      web: 'sanitizeAssistantTurns',
      parity: 'src/renderer/__tests__/assistantTurnsParity.test.ts',
    },
  ];

  it.each(CROSS_NAME_PAIRS)('別名の 2 実装 $main / $web が両方在り、突き合わせがある', (pair) => {
    const mainFns = exportedFunctions('src/main');
    const webFns = exportedFunctions('src/renderer');
    expect(mainFns.has(pair.main), `main 側に ${pair.main} が無い`).toBe(true);
    expect(webFns.has(pair.web), `ブラウザ側に ${pair.web} が無い`).toBe(true);
    // 同名でないことがこの組の要点。同名になったなら上の台帳が数えるので、
    // ここから外して LEDGER へ移すこと。
    expect(pair.main).not.toBe(pair.web);
    // **コメントを落としてから見る。** 最初はそのまま `toContain` していて、
    // 突き合わせを外す対照実験が鳴らなかった —— 検査ファイルの説明文に
    // 名前が書いてあるので、本文が読まなくなっても字面は残る (0-a-17)。
    const parity = stripComments(readOriginalSource(pair.parity));
    expect(parity, `${pair.parity} が ${pair.web} を読んでいない`).toContain(pair.web);
    expect(parity, `${pair.parity} が ${pair.main} を読んでいない`).toContain(pair.main);
  });
});
