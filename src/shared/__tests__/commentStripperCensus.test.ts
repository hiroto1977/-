/**
 * **注記を落とす道具は 1 つ。写しは 13 個あり、契約は 7 通りだった。** (2026-09-25 · パス 461)
 *
 * パス 460 が残した問い (「`codeOnly` の写し 10 個の契約が同じか測る」) をそのまま測りに行った。
 * **題は「写し 10 個」だが、数えたら 13 個で、契約は 7 通りだった。**
 *
 * ## 実測 (2026-09-25 · 直す前 · 弁別標本 10 種への出力を繋いだ指紋で分ける)
 *
 * | 契約 | 写し | 何をするか |
 * | ---: | ---: | --- |
 * | 1 | 2 | ブロックは空白へ (行番号を保つ) · 行末の `//` を**素の正規表現**で消す |
 * | 2 | 3 | ブロックは空白へ · **行頭が `//` か `*` の行だけ**落とす |
 * | 3 | 1 | ブロックを **空文字へ** (行が詰まる) · 行頭が `//` の行だけ落とす |
 * | 4 | 3 | ブロックを **空白 1 つへ** (行が詰まる) · 行末の `//` を直前が `:` でないときだけ消す |
 * | 5 | 1 | ブロックを**改行の数だけ**へ · 最初の `//` から行末までを切る |
 * | 6 | 2 | ブロックを空文字へ · 行頭が `//` か `*` の行を落とす (trim して判定) |
 * | 7 | 1 | ブロックは空白へ · 行末の `//` を**空白へ** (列も保つ) |
 *
 * ★ **誤りは両方向に在る** —— 参照実装 (字句解析 = 下の `stripComments`) と突き合わせた実測:
 *
 * | 向き | 何が起きるか | 実測 (`src` の 1,444 本) |
 * | --- | --- | ---: |
 * | **落とし過ぎ** | 文字列の中の URL で切れ、**その行の後ろが消える** | **15,361 行** (契約 1 / 5 / 7) |
 * | 同 | 文字列の中の素の 2 連スラッシュで切れる | 1,375 行 (契約 4) |
 * | **残し過ぎ** | **行末の注記が code として残る** (法則 `mention-vs-declaration`) | **2,420 行 / 480 本** (契約 2 / 3 / 6) |
 * | 行番号 | ブロック注記の行が詰まり、**掴んだ位置が実物とずれる** | 6 写し |
 *
 * ## パス 462 —— **glob の `**` が偽の注記を開き、71 行を食っていた** (2026-09-25)
 *
 * パス 461 は 13 本を寄せて「どの census の答えも変わらなかった」と書いた。残り 66 本の
 * うち**ファイル全体を落とす 43 本**を寄せたら、**2 つの census の答えが変わった** ——
 * どちらも `originalSourcePolicy` (mutate 台帳のファイルを原文で読む検査は
 * `readOriginalSource` を通す、という規則の母集団) である。
 *
 * ★ **原因は、素朴なブロック注記の正規表現が文字列の中の `/**` から始まること。**
 * このリポジトリの検査は glob を多用する —— `globSync(['src/main/**' + '/*.ts'], …)` の
 * `/**` がそこで「注記の始まり」になり、**次のブロック注記の閉じまで丸ごと食う**。実測 (直す前):
 *
 * | ファイル | 食われた範囲 | 台帳の件数 | 実測 |
 * | --- | --- | ---: | ---: |
 * | `stateWritePolicy.test.ts` | **68〜139 行 (71 行)** | 1 | **3** |
 * | `fileReadSizeGateCensus.test.ts` | **99〜144 行 (45 行)** | 6 | **9** |
 *
 * ★ **向きは両方** —— `stateWritePolicy` は**一時ディレクトリの生の読み 2 件が台帳に
 * 載っていなかった** (台帳は「`count` は実測の件数で、増えたら鳴る (台帳が白紙委任に
 * ならないように)」と自分で述べている)。`fileReadSizeGateCensus` は逆に、引用 3 件が
 * 見えていなかった。**どちらも「数が偽」で、偽にしていたのは道具である。**
 *
 * ★ **そして `originalSourcePolicy` 自身の自己検査が偽だった** —— 「★ この検査自身は
 * 生の読みを 1 件も持たない (標本は綴りを割って組み立てている)」と主張しながら、台帳の
 * `why` の散文 2 か所がその綴りを**割らずに引用**していた。旧い道具はそこも食っていたので
 * 通っていた。綴りを再現せずに述べる形へ直した (パス 372 と同じ手)。
 *
 * ★ **母集団の実測 (2026-09-25 · `src` + `scripts` の 1,537 本)**: 素朴な正規表現が
 * 食うファイルは **42 本 / 合計 1,274 行**。最大は `shared-judgement-census.cjs` の 394 行。
 *
 * ## パス 461 の記録 —— **あの日はどの census の答えも変わらなかった**
 *
 * 13 本を寄せて走らせると、**落ちたのは 2 件だけ**で、どちらも「裸の続き行を注記として
 * 食わせる**人工的な標本**」だった (実物の走査はファイル全体を渡すので、続き行は必ず
 * ブロック注記の内側に在る —— その形は 1 度も来ない)。13 本のうち 11 本は**両方向の台帳**を
 * 持つので、母集団が動けばそこが鳴る。つまりこれは**罠の除去**であって生きた欠陥の修復では
 * ない (パス 359 / 398 / 439 と同じ位置づけ)。
 *
 * ★ **ただし標本の側は生きた欠陥だった** —— その 2 件は「注記の中では数えない」を主張し
 * ながら、**実物では起こり得ない形**で確かめていた。走査に掛ける物と同じ形の標本と、
 * **行末の注記**の標本へ直した (後者は契約 2 / 6 では素通りしていた形である)。
 * CLAUDE.md の規約「不在の主張には標本を添える」の、**標本の形**についての現れ。
 *
 * ## 母集団は名前ではなく**算法**で数える
 *
 * `codeOnly` は 1 つの名前にすぎない。同じ算法は `code()` `read()` `withoutComments()`
 * `isCommentLine()` ほかの名前でも書かれており、**算法で数えると 67 本**あった
 * (2026-09-25 実測)。13 本を寄せたので残りは 66 本。
 *
 * ★ **理由の欄は作らない** (パス 368 の tick 台帳と同じ判断) —— どの行も同じ
 * 「まだ寄せていない」で、理由が埋まると「保留を検査に書く」形になる
 * (法則 `no-weakness-as-spec`)。**減らすことだけが正しい向き**なので、台帳と母集団が
 * **両方向で一致すること**だけを機械が持つ。
 *
 * ★ **針は `stripComments` を通してから当てる** —— `stripNonCode` は正規表現リテラルの
 * **中身を落とす**ので、探している綴り (注記を落とす正規表現そのもの) が消えて
 * **どの入力でも通る検査**になる。新しい道具が要る当の理由である。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { stripComments, stripNonCode } from './stripNonCode';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = path.resolve(__dirname, '../../..');

/** 注記を落とす道具の**正しい置き場所**。ここ以外は台帳に載る。 */
const HOMES: readonly string[] = ['src/shared/__tests__/stripNonCode.ts', 'scripts/lib/strip-non-code.cjs'];

/** 自前の注記除去を持つ綴り (どれも「注記を落とす」算法そのもの)。 */
const BLOCK_STRIP = String.raw`/\/\*[\s\S]*?\*\//`;
const LINE_STRIP_RE = String.raw`/\/\/[^\n]*/`;
const LINE_STRIP_START = [String.raw`startsWith('//')`, String.raw`startsWith("//")`];
/**
 * **同じ算法の、行頭アンカーの正規表現による綴り** (2026-09-25 · パス 463)。
 *
 * パス 461 の docblock は「母集団は名前ではなく**算法**で数える」と書いたが、
 * 数えていたのは 3 つの**綴り**だった。`/^\s*(\/\/|\*|\/\*)/` と書いた同じ算法は
 * どれにも当たらず、実測で **12 本**が母集団の外に居た —— うち 5 本は
 * その 1 つだけを持ち (`lint-regex-complexity.cjs` ほか)、残る 7 本は
 * **パス 462 が「寄せた」と記録した本に死んだ 2 つ目として残っていた**
 * (census は「自前へ戻っていない」と主張しながら、その綴りを見られなかった)。
 */
const LINE_STRIP_ANCHOR = /\/\^\\s\*\(?\??:?\\?\/\\?\//;

/**
 * 母集団の外に置く物と、その理由。
 *
 * **1 件だけ** —— しかも**出荷コード**である。`normalizeForDetection` がブロック注記を
 * 空白へ潰すのは *ソースの注記*を落とすためではなく、**SQL インジェクションの回避手法
 * (語と語の間に空のブロック注記を挟む) を打ち消す**ためで、`securityRange.test.ts` が
 * その 1 件を標本つきで留めている。
 */
const EXEMPT: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'src/shared/__tests__/commentStripperCensus.test.ts',
    why: 'この検査そのもの。**針の綴りを定数として持つ**だけで実装は持たない —— この道具を自分自身に当てるのが正しい形で (パス 452 が stripNonCodeParity で同じことを書いた)、下の it が「共有の道具を import している = 自前を持たない」を確かめる',
  },
  {
    file: 'src/renderer/__tests__/themeTokens.test.ts',
    why: '落とす相手が **CSS** (styles.css) で、共有の字句解析器は JS/TS のもの —— CSS に行注記も正規表現リテラルもテンプレート補間も無いので、当てても「今日たまたま同じ答え」にしかならない。実測 (2026-09-25 · パス 462): この CSS には注記の外の `//` が 0 件なので今日の答えは変わらないが、`url(//cdn…)` を 1 行書いた日に JS の行注記として行末まで食う。**言語が違う物に同じ道具を当てない**',
  },
  {
    file: 'scripts/lint-mutation-scope.cjs',
    why: '**注記を落とす物ではなく、注記そのものを探す物**。`Stryker disable` / `restore` の pragma は定義上コメントの中に在るので、行頭アンカーの正規表現で `//` と `/*` を見るのは「注記か」を判じているのではなく**針そのもの**である (落としたら母集団が空になる · 2026-09-25 パス 463)',
  },
  {
    file: 'src/shared/securityRange.ts',
    why: '出荷コードの検知前正規化 (WAF 風)。ソースの注記ではなく SQL インジェクションの comment 挿入を打ち消すためで、securityRange.test.ts が標本つきで留めている',
  },
];

/**
 * **まだ寄せていない**自前の注記除去。理由の欄は無い (上の docblock に理由)。
 * 減るのが正しい向きで、増えたら名指しで鳴る。
 *
 * **2026-09-25 (パス 463) に 0 件になった。** 空でも消さない —— 次に自前を
 * 書いた人はここへ載せるまで鳴り、寄せ終わった行を消し忘れても鳴る (両方向)。
 */
const REMAINING: readonly string[] = [];

function walk(rel: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(path.join(REPO, rel))) {
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(child, out);
      continue;
    }
    if (/\.(?:tsx?|cjs|mjs)$/.test(e.name)) out.push(child);
  }
  return out;
}

/** 自前の注記除去を持つファイル (共有の置き場所は除く)。 */
function selfRolled(): string[] {
  const found: string[] = [];
  for (const rel of [...walk('src'), ...walk('scripts')]) {
    if (HOMES.includes(rel)) continue;
    const code = stripComments(readOriginalSource(path.join(REPO, rel)));
    if (
      code.includes(BLOCK_STRIP)
      || code.includes(LINE_STRIP_RE)
      || LINE_STRIP_START.some((s) => code.includes(s))
      || LINE_STRIP_ANCHOR.test(code)
    ) {
      found.push(rel);
    }
  }
  return found.sort();
}

/**
 * 共有の道具を読んでいる本。**この一覧は走査と両方向で一致する** (下の it) ——
 * 手書きの一覧のままだと、行を消したときにその行の主張が黙って消える
 * (パス 462 の対照 F。**分類を下げるのも退行の 1 手である**)。
 * 実測: パス 461 で 13 本・パス 462 で 56 本・パス 463 で **80 本**。
 */
const MIGRATED: readonly string[] = [
  'src/__tests__/actionSurface.ts',
  'src/main/__tests__/atRestPolicy.test.ts',
  'src/main/__tests__/fileReadSizeGateCensus.test.ts',
  'src/main/__tests__/shellOpenCallSites.test.ts',
  'src/main/__tests__/stateWritePolicy.test.ts',
  'src/main/__tests__/writeModeGate.test.ts',
  'src/main/clients/__tests__/exportPathGate.test.ts',
  'src/main/clients/__tests__/nullableSnapshotFieldWidth.test.ts',
  'src/main/clients/__tests__/responseRowGuards.test.ts',
  'src/renderer/__tests__/browserSendClaimCensus.test.ts',
  'src/renderer/__tests__/ceilingUnitCensus.test.ts',
  'src/renderer/__tests__/cloudSyncClaims.test.ts',
  'src/renderer/__tests__/demoMixDisclosureCensus.test.ts',
  'src/renderer/__tests__/desktopPathClaims.test.ts',
  'src/renderer/__tests__/deviceStoreWritePolicy.test.ts',
  'src/renderer/__tests__/disclaimerRendered.test.ts',
  'src/renderer/__tests__/errorMessageSurfaceCensus.test.ts',
  'src/renderer/__tests__/fixedTickAssertionCensus.test.ts',
  'src/renderer/__tests__/inlineColorCensus.test.ts',
  'src/renderer/__tests__/inputCapLiterals.test.ts',
  'src/renderer/__tests__/invokeFailureSurfaced.test.ts',
  'src/renderer/__tests__/markdownExportCensus.test.ts',
  'src/renderer/__tests__/maxLengthCensus.test.ts',
  'src/renderer/__tests__/numericInputReaderCensus.test.ts',
  'src/renderer/__tests__/staticProseClaims.test.ts',
  'src/renderer/__tests__/storageClaims.test.ts',
  'src/renderer/__tests__/submitGuardCensus.test.ts',
  'src/renderer/__tests__/webShimAnalyzeCeiling.test.ts',
  'src/renderer/__tests__/webShimAssistantProxyNotice.test.ts',
  'src/renderer/__tests__/webShimCredentials.test.ts',
  'src/renderer/components/__tests__/financialAnalysisNumberReading.test.ts',
  'src/renderer/components/__tests__/voiceEgressDisclosed.test.ts',
  'src/renderer/data/__tests__/csvColumnCoverage.test.ts',
  'src/renderer/data/__tests__/csvExportGate.test.ts',
  'src/renderer/data/__tests__/emotionsLogMoodParity.test.ts',
  'src/renderer/data/__tests__/namedEscapeHatchReachable.test.ts',
  'src/renderer/oauth/__tests__/pkceSession.test.ts',
  'src/renderer/pages/__tests__/aiEgressPairs.helpers.ts',
  'src/renderer/pages/__tests__/moneyNotationOneScreen.test.ts',
  'src/renderer/pages/__tests__/namedControlExists.test.ts',
  'src/renderer/pages/__tests__/oneNumberOneSource.test.ts',
  'src/renderer/pages/__tests__/thirdPartyFieldCeiling.test.ts',
  'src/shared/__tests__/absenceSampleCensus.test.ts',
  'src/shared/__tests__/advisorArrayBounds.test.ts',
  'src/shared/__tests__/advisorQuestionParity.test.ts',
  'src/shared/__tests__/advisorResponseParity.test.ts',
  'src/shared/__tests__/advisorUniverseDisclosed.test.ts',
  'src/shared/__tests__/atlassianLinks.test.ts',
  'src/shared/__tests__/bareFetchLedger.test.ts',
  'src/shared/__tests__/buildScriptEscapes.test.ts',
  'src/shared/__tests__/businessPayloadParity.test.ts',
  'src/shared/__tests__/calendarDateCensus.test.ts',
  'src/shared/__tests__/commentBlindLedger.test.ts',
  'src/shared/__tests__/controlCharSingleRule.test.ts',
  'src/shared/__tests__/dateAssemblyCensus.test.ts',
  'src/shared/__tests__/dualBuildDecisions.test.ts',
  'src/shared/__tests__/e2eSuiteFloors.test.ts',
  'src/shared/__tests__/e2eWaitMargin.test.ts',
  'src/shared/__tests__/externalUrlGate.test.ts',
  'src/shared/__tests__/finiteShapeGuards.test.ts',
  'src/shared/__tests__/hostChromeColorCensus.test.ts',
  'src/shared/__tests__/hostInterpolationCensus.test.ts',
  'src/shared/__tests__/jsonBodyCensus.test.ts',
  'src/shared/__tests__/judgementReachEdges.test.ts',
  'src/shared/__tests__/kdfParamsCensus.test.ts',
  'src/shared/__tests__/lawCoverageLedger.test.ts',
  'src/shared/__tests__/limitCoverageCensus.test.ts',
  'src/shared/__tests__/linkRedirectGuard.test.ts',
  'src/shared/__tests__/localFileOpenPolicy.test.ts',
  'src/shared/__tests__/markupExportCensus.test.ts',
  'src/shared/__tests__/nonFiniteEntryPoints.test.ts',
  'src/shared/__tests__/ollamaInputLimits.test.ts',
  'src/shared/__tests__/ollamaModelFieldCeilings.test.ts',
  'src/shared/__tests__/orchestrationPopulationFloors.test.ts',
  'src/shared/__tests__/originalSourcePolicy.test.ts',
  'src/shared/__tests__/parsedUrlGateCensus.test.ts',
  'src/shared/__tests__/permissionJustification.test.ts',
  'src/shared/__tests__/pluginPlanConsumers.test.ts',
  'src/shared/__tests__/redactionCoverage.test.ts',
  'src/shared/__tests__/responseBodyCapCensus.test.ts',
  'src/shared/__tests__/sanitizerCensus.test.ts',
  'src/shared/__tests__/scriptEmbedGate.test.ts',
  'src/shared/__tests__/stripNonCodeParity.test.ts',
  'src/shared/__tests__/typecheckCoverage.test.ts',
  'src/shared/api/__tests__/createdResponseFields.test.ts',
];

describe('注記を落とす道具は 1 つ (パス 461)', () => {
  it('★ 契約を標本で留める —— 落とし過ぎず、残し過ぎず、行番号を保つ', () => {
    // 文字列の中の 2 連スラッシュは注記ではない (契約 1 / 4 / 5 / 7 がここで切っていた)。
    expect(stripComments("const r = fetch('https://a.com/v1', { needle: 1 });")).toBe(
      "const r = fetch('https://a.com/v1', { needle: 1 });",
    );
    expect(stripComments("const re = 'a//b';")).toBe("const re = 'a//b';");
    expect(stripComments("const u = '//cdn.x/y.js';")).toBe("const u = '//cdn.x/y.js';");
    // 行末の注記は落とす (契約 2 / 3 / 6 がここで残していた)。
    expect(stripComments('const a = 1; // needle')).toBe('const a = 1; ');
    // 正規表現の中の 2 連スラッシュも注記ではない。
    expect(stripComments(String.raw`const r = /a\/\/b/.test(x); // c`)).toBe(
      String.raw`const r = /a\/\/b/.test(x); `,
    );
    // 行番号を保つ (契約 3 / 4 / 6 がここでずらしていた)。
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toHaveLength(4);
    expect(stripComments('/**\n * doc\n */\nconst a = 1;')).toBe('\n\n\nconst a = 1;');
    // **コードの `*` 継続行は注記ではない** (契約 2 / 6 がここで落としていた)。
    expect(stripComments('const a = 1\n  * 2;')).toBe('const a = 1\n  * 2;');
    // テンプレートの補間も中身も残す。
    expect(stripComments('const t = `x${a}//y`;')).toBe('const t = `x${a}//y`;');
  });

  it('★ `stripNonCode` では代われない (正規表現の中身を落とすので針が消える)', () => {
    const line = `const R = ${BLOCK_STRIP};`;
    expect(stripComments(line).includes(BLOCK_STRIP)).toBe(true);
    // 同じ入力を `stripNonCode` に通すと、探している綴りが消える。
    expect(stripNonCode(line).includes(BLOCK_STRIP)).toBe(false);
  });

  it('★ 針が的に当たり、注記の中では当たらない', () => {
    // **床は「見つけた件数」には置かない** —— この台帳は**減るのが正しい向き**なので、
    // 実測に張り付けると寄せた日に落ちる (パス 378 が `tickSensitivityLedger` で
    // 同じ形を直した)。床は**走査が木を歩いたこと**に置き、針が生きていることは
    // 下の 3 つの標本が直接見る。
    expect(walk('src').length + walk('scripts').length).toBeGreaterThanOrEqual(1000);
    expect(stripComments(`const R = ${BLOCK_STRIP};`).includes(BLOCK_STRIP)).toBe(true);
    expect(stripComments(`/** 直す前は ${BLOCK_STRIP} だった */`).includes(BLOCK_STRIP)).toBe(false);
    expect(stripComments(`// ${LINE_STRIP_RE}`).includes(LINE_STRIP_RE)).toBe(false);
  });

  it('★ 台帳に無い自前の注記除去は無い (14 個目が生えたら鳴る)', () => {
    const known = new Set([...REMAINING, ...EXEMPT.map((e) => e.file)]);
    expect(selfRolled().filter((f) => !known.has(f))).toEqual([]);
  });

  it('★ 台帳の行は全部実物に在る (寄せ終わった行が残らない · 両方向)', () => {
    const found = new Set(selfRolled());
    expect(REMAINING.filter((f) => !found.has(f))).toEqual([]);
    expect(EXEMPT.map((e) => e.file).filter((f) => !found.has(f))).toEqual([]);
  });

  it('★ 免除は理由を持ち、この検査自身は共有の道具を読んでいる', () => {
    for (const e of EXEMPT) expect(e.why.length, `${e.file} の理由が短すぎる`).toBeGreaterThanOrEqual(15);
    // 自分を免除したので、自分が自前を持っていないことは別に主張する
    // (免除の理由が「針を持つだけ」であることを、実物で確かめる)。
    const self = readOriginalSource(path.join(REPO, 'src/shared/__tests__/commentStripperCensus.test.ts'));
    expect(stripComments(self)).toMatch(/import \{ stripComments, stripNonCode \} from '\.\/stripNonCode';/);
  });

  /**
   * 共有の `stripComments` を import しているファイル (この検査自身と道具の在処は除く)。
   * **`MIGRATED` は手書きの一覧ではなく、この走査と一致することを要求する** ——
   * パス 462 の対照 F がここを撃った: 台帳から 1 行消すと、その行の主張
   * (「共有の道具を読む」「自前へ戻っていない」) が黙って消え、しかも自前を持たない
   * ファイルは `selfRolled()` にも出ないので**どちらの向きからも見えなかった**。
   * **分類を下げるのも退行の 1 手である** (パス 455 の対照 J と同じ形)。
   */
  const importsShared = (): string[] =>
    [...walk('src'), ...walk('scripts')]
      .filter((rel) => !HOMES.includes(rel) && !EXEMPT.some((e) => e.file === rel))
      .filter((rel) =>
        /import \{[^}]*\bstripComments\b[^}]*\} from '[^']*stripNonCode';/.test(
          readOriginalSource(path.join(REPO, rel)),
        ),
      )
      .sort();

  it('★ 寄せた本の一覧は走査から導く (台帳から消しても鳴る · 両方向)', () => {
    expect(importsShared()).toEqual([...MIGRATED].sort());
  });

  it('★ 寄せた本は共有の道具を読み、自前の除去を持たない (両方向)', () => {
    // 寄せる方向にしか動かないので、床だけ置く (実測 2026-09-25 · 13 → 56 → 78)。
    expect(MIGRATED.length).toBeGreaterThanOrEqual(56);
    const found = new Set(selfRolled());
    for (const rel of MIGRATED) {
      const src = readOriginalSource(path.join(REPO, rel));
      // **他の名前と一緒に import する形も在る** (`{ stripComments, stripNonCode }`) ——
      // 上の走査 (`importsShared`) と同じ針にする。狭い針だと、寄せた本が
      // 「import していない」として鳴った (2026-09-25 · パス 463 で実際に鳴った)。
      expect(stripComments(src), `${rel} が stripComments を import していない`).toMatch(
        /import \{[^}]*\bstripComments\b[^}]*\} from '[^']*stripNonCode';/,
      );
      expect(found.has(rel), `${rel} が自前の注記除去へ戻っている`).toBe(false);
    }
  });
});
