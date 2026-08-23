import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
 *   'decision'   同じ答えを返さねばならない判定 → **パリティ検査が要る**
 *   'pure'       純計算。ずれれば数字が違うだけで、境界の守りではない
 *   'different'  名前が同じだけで**別の関数** (引数の型が違う)
 *
 * 新しい重複が増えたら、どれかに分類して理由を書くことになる。
 */

type Kind = 'decision' | 'pure' | 'different';

/** 分類台帳。**増えても減っても鳴る** (双方向)。 */
const LEDGER: Readonly<Record<string, { kind: Kind; why: string }>> = {
  // --- 判定: パリティ検査が突き合わせている ---
  buildRfc2822: { kind: 'decision', why: 'メールヘッダの組み立て (rfc2822Parity)' },
  isSafeHeaderValue: { kind: 'decision', why: 'CR/LF/NUL の拒否 (rfc2822Parity)' },
  parseAtlassianToken: { kind: 'decision', why: '送り先ホストの許可 (atlassianSiteParity)' },
  parseSecurityKeys: { kind: 'decision', why: '資格情報の解析 (dualBuildParity)' },
  safeStateEquals: { kind: 'decision', why: 'CSRF の state 比較 (stateEqualsParity)' },
  extractJson: { kind: 'decision', why: 'LLM 応答から JSON を取る (dualBuildParity)' },
  normalizeAnalysis: { kind: 'decision', why: 'LLM 応答を型へ丸める (dualBuildParity)' },
  validateAdvisorJson: { kind: 'decision', why: 'LLM 応答を絞る (advisorValidationParity)' },
  isSafeSymbol: { kind: 'decision', why: '銘柄記号の形 (dualBuildParity)' },

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
};

/** `export function <name>` を集める (検査は除く)。 */
function exportedFunctions(root: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      for (const m of readFileSync(full, 'utf8').matchAll(/^export function (\w+)/gm)) {
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
  it("'decision' はすべてパリティ検査から参照されている", () => {
    const parityFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
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
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
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
    const missing = Object.entries(LEDGER)
      .filter(([, v]) => v.kind === 'decision')
      .map(([k]) => k)
      .filter((k) => !imports.has(k));
    expect(missing, "'decision' なのに突き合わせている検査が import していない").toEqual([]);
  });

  it('理由が空の項目が無い', () => {
    const blank = Object.entries(LEDGER).filter(([, v]) => v.why.trim().length === 0);
    expect(blank.map(([k]) => k)).toEqual([]);
  });

  /* 走査そのものが動いていること (空虚に通っていない)。 */
  it('負の対照: 走査は実際に重複を見つけている', () => {
    expect(duplicates().length).toBeGreaterThan(10);
    expect(duplicates()).toContain('safeStateEquals');
  });
});
