/**
 * **法則の台帳 —— 320 パスで学んだ規則と、それを守っている機械。**
 *
 * 1 つの法則は「何を守るか」「どこで学んだか (出典)」「何がそれを守っているか
 * (執行者)」を持つ。執行者は 7 種:
 *
 * | kind | 意味 | 検査で留めること |
 * |---|---|---|
 * | `gate` | `verify:all` の npm script | package.json に在り、verify:all に並んでいる |
 * | `test` | vitest のファイル | 実在する `.test.ts` |
 * | `harness` | verify:all の外の実機 (e2e / perf / smoke:app / mutate) | package.json に在る |
 * | `chain` | 整合性チェーン (保護対象の封緘) | — |
 * | `type` | tsc の総和型など、型そのものが守る | 実在するファイル |
 * | `ci` | workflow の構成 | 実在する workflow |
 * | `prose` | **機械が無い** (理由つき) | 出典の文書が実在し、理由が空でない |
 *
 * 執行者が `prose` だけの法則は `docs/ONTOLOGY.md` §6 に集まる。それは欠陥の一覧ではなく
 * 「散文で述べた規則は落ちない」ことを知っている上での**分母**である —— 機械にできる物から
 * 順に機械にする (2026-09-18 の解析で 3 つを機械にした。引継ぎ参照)。
 *
 * 出典の書き方: `パターン 0-a-15` は `docs/SESSION_HANDOFF.md` の「確立されたパターン」の番号、
 * `パス 301` は同じ文書の各パスの節、`不変条件 #5` は `docs/ARCHITECTURE.md` §8.1 の番号。
 */

export const LAW_FAMILIES = {
  'gate-hygiene': 'ゲートそのものの規律',
  'single-rule': '規則は 1 つ',
  boundary: '境界と信頼',
  'at-rest': '保存と復元',
  surface: '画面へ出る文言・外へ出る本文',
  numbers: '数字の健全性',
  'dual-build': '両ビルドの対称',
  knowledge: '知識と出典',
  'supply-chain': '供給網と CI',
} as const;

export type LawFamily = keyof typeof LAW_FAMILIES;

export type Enforcer =
  | { readonly kind: 'gate'; readonly script: string }
  | { readonly kind: 'test'; readonly file: string }
  | { readonly kind: 'harness'; readonly script: string }
  | { readonly kind: 'chain' }
  | { readonly kind: 'type'; readonly where: string }
  | { readonly kind: 'ci'; readonly workflow: string }
  | { readonly kind: 'prose'; readonly where: string; readonly why: string };

export interface Law {
  readonly id: string;
  readonly family: LawFamily;
  readonly name: string;
  readonly statement: string;
  readonly provenance: readonly string[];
  readonly enforcedBy: readonly Enforcer[];
}

const gate = (script: string): Enforcer => ({ kind: 'gate', script });
const test = (file: string): Enforcer => ({ kind: 'test', file });
const harness = (script: string): Enforcer => ({ kind: 'harness', script });
const chain: Enforcer = { kind: 'chain' };
const type = (where: string): Enforcer => ({ kind: 'type', where });
const ci = (workflow: string): Enforcer => ({ kind: 'ci', workflow });
const prose = (where: string, why: string): Enforcer => ({ kind: 'prose', where, why });

const HANDOFF = 'docs/SESSION_HANDOFF.md';
const T = {
  shared: (n: string): string => `src/shared/__tests__/${n}.test.ts`,
  renderer: (n: string): string => `src/renderer/__tests__/${n}.test.ts`,
  main: (n: string): string => `src/main/__tests__/${n}.test.ts`,
  preload: (n: string): string => `src/preload/__tests__/${n}.test.ts`,
  root: (n: string): string => `src/__tests__/${n}.test.ts`,
};

export const LAWS: readonly Law[] = [
  // ───────────────────────── ゲートそのものの規律 ─────────────────────────
  {
    id: 'manual-check-becomes-gate',
    family: 'gate-hygiene',
    name: '手でやった検査はその場でゲートにする',
    statement: '「私が今やった手作業を、次のセッションの誰かが思い出せるか」— 思い出せないならゲートにする。ゲートを作ったら負の対照 (違反を仕込んで落ちる・正常を誤検出しない・直ったのに台帳に残っていれば落ちる) を取る。',
    provenance: ['パターン 0'],
    enforcedBy: [prose(HANDOFF, '「手でやった」は機械に映らない。作ったゲートが CI に在ることは gate-runs-in-ci が、自作ゲートが対照を持つことは negative-control が見る')],
  },
  {
    id: 'scan-whole-tree',
    family: 'gate-hygiene',
    name: '走査範囲は木全体、例外は台帳',
    statement: '「対象を絞る」と「対象を忘れる」はコードの上で見分けがつかない。走査は木全体にし、外す物を理由つきの台帳に書く。台帳を書いたら「どこまで歩いたか」「注記の規則を判定が実装しているか」「対照は判定関数そのものへ標本を通しているか」を問う。外した側をどう台帳にするかは `outside-scope-gets-its-own-census`。',
    provenance: ['パターン 0-a', 'パターン 0-a-24'],
    enforcedBy: [gate('lint:network-targets'), gate('lint:forbidden'), test(T.shared('bareFetchLedger'))],
  },
  {
    id: 'distributed-code-same-gates',
    family: 'boundary',
    name: '配るコードも自分の門を通す',
    statement:
      '「これを貼って deploy してください」と文書に載せたコードは、動くのが利用者の環境でも**設計はこちらの責任**である。'
      + '自分の src に掛けている門 —— 応答本文の上限・転送の各ホップの再検査・宛先の関門 —— を、配るコードにも同じだけ掛ける。'
      + '両者が「同じ」であることを文で書かない: 文は書いた瞬間から離れていくので、実物どうしをテストで結ぶ'
      + '(文書からコードを切り出して読み込み、同じ標本を当てる)。',
    provenance: ['パス 343', 'パス 300'],
    enforcedBy: [test('src/renderer/network/__tests__/proxyWorkerParity.test.ts')],
  },
  {
    id: 'outside-scope-gets-its-own-census',
    family: 'gate-hygiene',
    name: '走査の外は、広げれば見えるとは限らない',
    statement:
      '走査範囲を絞ったら、外した側の母集団を一度数える。広げれば見えると決めてはいけない —— '
      + '外の母集団は書き方の前提が違うので、同じ検出器を当てると偽陽性で埋まり、'
      + '本当に危ない物は元の検出器の設計上の除外（例: 素の識別子の送り先）に隠れたままになる。'
      + '外が小さいなら「危ない構文か」を問うのをやめ、**全件**を守りつきで台帳に載せる。',
    provenance: ['パス 342', 'パターン 0-a'],
    enforcedBy: [gate('lint:network-targets'), test(T.shared('networkTargetWitness'))],
  },
  {
    id: 'gate-runs-in-ci',
    family: 'gate-hygiene',
    name: '検査が走る場所が CI に在る',
    statement: 'verify:all の全ゲートが ci.yml に在る。「これで強制される」と書いた検査は、CI のどのステップで走るかを確かめる。走らないなら vitest ゲートへ移す。',
    provenance: ['パターン 0-a-11', 'パターン 0-c'],
    enforcedBy: [gate('lint:docs')],
  },
  {
    id: 'negative-control',
    family: 'gate-hygiene',
    name: 'ゲートは守りを外して確かめる',
    statement: '自作のゲートは --self-test (陽性・陰性の対照) を持ち、verify:all がそれを走らせる。--self-test の「鳴る側」は作った本人の想像なので、守るはずの実物を一度壊して鳴らす。',
    provenance: ['パターン 0', 'パターン 0-a-15'],
    enforcedBy: [test(T.shared('ontologyLaws'))],
  },
  {
    id: 'count-has-floor',
    family: 'gate-hygiene',
    name: '件数を出す検査は床を持つ',
    statement: '「Checked 0 … ✅」は走査が壊れても緑。ゲートは件数に下限を置き、検査は「全件について〜」の前に非空を主張する。台帳にせず命名規約 (VERIFIED_*) で絞る。',
    provenance: ['パターン 0-a-7'],
    enforcedBy: [gate('lint:test-coverage'), test(T.shared('e2eSuiteFloors')), gate('lint:deps')],
  },
  {
    id: 'table-pinned-by-literal',
    family: 'gate-hygiene',
    name: '表を留める検査は表を読まない',
    statement: '留める対象を読んで回る検査は、対象が変われば一緒に変わる。何が入っているかと何が入っていないかを字面で書く。モジュール定数は vi.resetModules + 動的 import で留める。',
    provenance: ['パターン 0-a-9', 'パターン 0-a-5'],
    enforcedBy: [harness('mutate'), prose(HANDOFF, '「表を読んで回っている」形は変異検査 (Stryker) が生存として映すが、CI の毎回では走らない (週次)。字面かどうかを静的に数える網は無い')],
  },
  {
    id: 'unique-anchor-for-refs',
    family: 'gate-hygiene',
    name: '参照には一意な錨を前置する',
    statement: 'file:line の参照は、直前のバッククォート付き識別子が引用位置の ±15 行に居ることを見る。錨が無い参照は行番号がファイルに収まる限り永久に通る。錨は一意でなければ意味が無い。',
    provenance: ['パターン 0-a-3', 'パス 292'],
    enforcedBy: [gate('verify:arch')],
  },
  {
    id: 'mention-vs-declaration',
    family: 'gate-hygiene',
    name: '言及と宣言を見分ける',
    statement: '名前が「在るか」で照合する検査は、コメントや文字列の中の言及で満たされる。宣言の出現には「コメント行でない・引用符の外」を要求する。',
    provenance: ['パス 292', 'パス 289', 'パス 291'],
    enforcedBy: [gate('verify:arch')],
  },
  {
    id: 'general-form-not-one-file',
    family: 'gate-hygiene',
    name: '不変条件は一般形で守る',
    statement: 'ファイル名で書かれた不変条件はそのファイルしか守られない。文面から一般形を取り出し、その形をする場所を全部洗う (「Skill name」→ 変数をパスに畳む箇所、「Gmail の to」→ CR/LF で join する箇所)。',
    provenance: ['パターン 0-a-4'],
    enforcedBy: [gate('lint:url-encoding'), gate('lint:ipc-handlers'), gate('lint:forbidden')],
  },
  {
    id: 'generated-plus-coverage',
    family: 'gate-hygiene',
    name: '生成物 == 再計算 だけでは足りない',
    statement: '「committed と再計算が一致する」は成果物が古いことしか捕まえない。計算が壊れても再生成すれば通る。生成物の検査には本体データとの網羅を必ず足し、数は決め打ちせず欠ける理由を検査する。',
    provenance: ['パターン 0-a-5', 'パターン 0-a-6'],
    enforcedBy: [gate('vault:check'), gate('verify:graph'), test(T.shared('ontologyDoc'))],
  },
  {
    id: 'live-metrics-not-prose',
    family: 'gate-hygiene',
    name: '数は機械が、判断は散文が持つ',
    statement: '散文に書いた件数は誰も検算せず腐る (母集団が 4 倍ずれていた実測)。数える物は生成ブロックか live metric にし、判断だけを散文に書く。**閉じた列挙 (「only …」「全 N 件」) も同じ** —— 成員を並べたら、その並びと実物を機械で結ぶ。CLAUDE.md は preload bridge を「it only calls」で 6 件挙げていたが実物は 15 件で、落ちていた 9 件に eraseAll (全データ削除) と openPath が在った (パス 338)。攻撃面の側では、過小申告が読み手を油断させる。',
    provenance: ['パス 145', 'パス 220', 'パス 248', 'パス 338'],
    enforcedBy: [gate('verify:arch'), gate('lint:zero-fold'), gate('lint:shared-judgement'), gate('lint:docs'), test(T.preload('bridgeStatic'))],
  },
  {
    id: 'one-way-match-hides-the-other',
    family: 'gate-hygiene',
    name: '片方向の照合は、もう片方を隠す',
    statement: 'ゲートが同じ母集団について 2 つの数を刷るなら (走査 27 / 表 30)、その差は読まれないまま残る —— 差は理由つきの台帳にして両方向に鳴らす。パス 340 の実測: egress マトリクスの差 4 件のうち 3 件は **AI 提供者の既定の送り先** (`defaultBaseUrl`) で、送信文脈の針の死角だった。対照で確認 —— `api.openai.com` を別のホストに書き換えても verify:arch は緑のまま通り、**提供者を 1 つ足すだけで利用者のプロンプトと API キーの送り先が台帳の外へ出られた**。',
    provenance: ['パス 340'],
    enforcedBy: [gate('verify:arch'), test(T.shared('egressMatrixReverse'))],
  },
  {
    id: 'exclusion-states-the-real-reason',
    family: 'gate-hygiene',
    name: '外した物の理由は、実際に守っている理由で書く',
    statement: '門が何かを意図して外すとき、その理由は次の判断の材料になる。結論が正しくても premise が偽なら、次に足す物の評価がそこから外れる。lint:regex は多項式を「入力上限が 5000 だから O(n²) でも 30ms」で外していたが、実物の最大は 200,000 (MAX_TEXT_PREVIEW_CHARS) で 1 呼び出し 31 秒だった —— 守っていたのは長さではなく到達可能性 (その式に長い入力が来ない) である。理由に数を書くなら、その数が実物の最大であることを機械で留める。',
    provenance: ['パス 337'],
    enforcedBy: [test(T.shared('regexPolynomialLedger')), harness('audit:regex-poly')],
  },
  {
    id: 'measure-before-claim',
    family: 'gate-hygiene',
    name: '危なそうで報告しない — 実測してから言う',
    statement: '受け口が危なく見えても、その受け口が実際に何を拒むかを実行して確かめる。深刻度を上げる方にも下げる方にも効く (Headers が CR/LF を投げるので注入は成立しない、など)。**道具の報告も測る対象である** —— 変異検査が「生存」と言う変異体は、当てられなかっただけで検査が鳴らないことを意味しない場合がある。2026-09-20 実測: ad-hoc の `--mutate` で報告された生存 **61 件のうち 58 件が偽** (パス 353 の 13・355 の 13・356 の 3・357 の 35 が偽。本物はパス 355 の `join("")` 3 件だけ)。**誤りの向きは決まっている** —— 偽の生存は点数を**低く**見せるので、公開している score を脅かすのではなく「次にどこへ検査を書くか」の判断を歪める。**訂正は写しの数だけ要る** —— 測って偽と分かった主張は、**その主張が書かれている全部の場所**で撤回する。2026-08-23 に「渡ってくる名前は利用者入力ではないためこれは多層防御」を偽と測り `shared/safeFilename.ts` では撤回したが、**同じ文の写しが `renderer/fs/fsa.ts` に残り、2026-09-21 (パス 362) まで誰も直さなかった** —— 撤回が 2 部のうち 1 部にしか届かず、関門の隣に**既に否定された前提**が立っていた。こういう事実は散文の綴りではなく**振る舞い**で留める (「その文が無いこと」の検査は言い換えられた瞬間に黙る)。',
    provenance: ['パターン 0-a-8', 'パス 300', 'パス 356', 'パス 362 (訂正が写しの片方にしか届いていなかった)'],
    enforcedBy: [harness('audit:survivors'), test(T.shared('verifySurvivors')), test('src/renderer/fs/__tests__/folderMirrorUserInput.test.ts'), prose(HANDOFF, '「言う前に測ったか」は機械に映らない。実測は各パスの記録が持つ —— ただし変異検査の報告については `npm run audit:survivors` が当て直して答える')],
  },
  {
    id: 'pragma-directly-above',
    family: 'gate-hygiene',
    name: 'Stryker の pragma は対象行の直上に',
    statement: '`disable next-line` は間に何か入ると無言で外れ、緩む方向にしか壊れない。理由の無い pragma は測っていない範囲を 100% として報告する。広い disable と無言の pragma は台帳。',
    provenance: ['パターン 0-a-13', 'パス 1220 付近の REMAINING_WORK'],
    enforcedBy: [gate('lint:mutation-scope')],
  },
  {
    id: 'claim-unit-not-file',
    family: 'gate-hygiene',
    name: '主張の単位で見る',
    statement: '「ファイルのどこかに但し書きが在るか」で判定する検査は同居で無効化される。その断言そのものが無いこと (名指し) と、正しい形が使われていることの両方を見る。',
    provenance: ['パターン 0-a-17'],
    enforcedBy: [prose(HANDOFF, '検査の書き方の規律。個々の検査が守っているかを機械で見る形は無い (absence-needs-sample が「不在の主張」側だけを数える)')],
  },
  {
    id: 'absence-needs-sample',
    family: 'gate-hygiene',
    name: '不在を主張する検査には標本を添える',
    statement: '`not.toMatch` は綴りが 1 つ違えば黙る。規則が実際にその文面へ当たることを同じ検査の中で標本に対して確かめる。正規表現の針で綴りを肯定形で確かめていない物は台帳制。',
    provenance: ['CLAUDE.md 規約 (2026-08-25)', 'パス 293'],
    enforcedBy: [test(T.shared('absenceSampleCensus'))],
  },
  {
    id: 'records-carry-date',
    family: 'gate-hygiene',
    name: '記録は測った日を持つ',
    statement: '日付の無い安全の主張・件数・余裕は黙って古くなる。脆弱性台帳には照合日と期限、出荷物の計測には「パス N 後」、導出値には測った日。',
    provenance: ['パス 141', 'パス 290 (CLAUDE.md の LITE の余裕)'],
    enforcedBy: [gate('lint:rate-freshness'), gate('lint:docs')],
  },
  {
    id: 'artifact-freshness',
    family: 'gate-hygiene',
    name: '成果物は材料より新しい',
    statement: '実機の harness は古い成果物を黙って相手にしない。材料 (src・vite.config・inline-html・tsconfig・package・束に入る JSON) より成果物が古ければ exit 2。母集団は package.json から導く。',
    provenance: ['パス 302', 'パス 304', 'パス 305'],
    enforcedBy: [test(T.shared('artifactFreshness')), harness('perf'), harness('e2e'), harness('smoke:app')],
  },
  {
    id: 'harness-floor-per-suite',
    family: 'gate-hygiene',
    name: '実機の床は suite ごと',
    statement: '「合計 0 件で落とす」だけでは suite が黙って縮んでも緑。suite ごとに床 (実測の 85%) と全 suite 時の合計の床を持つ。`ok(true, …)` は直前の文が投げる wait でしか許さない。',
    provenance: ['パス 303'],
    enforcedBy: [test(T.shared('e2eSuiteFloors')), harness('e2e')],
  },
  {
    id: 'typecheck-covers-all-ts',
    family: 'gate-hygiene',
    name: '.ts は全部 tsc の網の中',
    statement: 'eslint は型を見ない。tsconfig の include の外の .ts は 1 行も検査されず、走っている検査の中で undefined を読んでも通る。覆われていない .ts が出れば落ち、exclude が生えれば「教えろ」と落ちる。',
    provenance: ['パス 278'],
    enforcedBy: [test(T.shared('typecheckCoverage')), gate('typecheck')],
  },
  {
    id: 'charset-enumerated',
    family: 'gate-hygiene',
    name: '文字種は列挙・制御文字は 4 群',
    statement: '簡体字は CJK 統合漢字に同居するので範囲走査では拾えず、字を列挙する。双方向制御 (Trojan Source) と不可視文字は攻撃手法なので落とす。正当な出現は件数と理由つきで台帳。',
    provenance: ['パターン 0-b', 'パス 255', 'パス 279'],
    enforcedBy: [gate('lint:charset')],
  },

  // ───────────────────────── 規則は 1 つ ─────────────────────────
  {
    id: 'one-rule-in-shared',
    family: 'single-rule',
    name: '判定は shared に 1 つ',
    statement: '読んだ後に何を計算するかは src/shared/ に 1 つだけ置き、保存先だけがビルドで違う形にする。写しは消す。述語を共有したら「no と言われたあとの動作」も両ビルドで揃うか読む (母集団は生成物)。',
    provenance: ['パターン 0-a-22', 'パス 247', 'パス 248', 'パス 268', 'パス 309'],
    enforcedBy: [gate('lint:shared-judgement'), test(T.shared('dualBuildDecisions')), test(T.shared('talentParity'))],
  },
  {
    id: 'copy-pinned-by-parity',
    family: 'single-rule',
    name: '写しが避けられないなら、ずれを検査で留める',
    statement: 'プロセス境界のせいで 2 つ要る実装は「同じ入力から同じ出力」「拒否する入力が一致」をパリティ検査で固定する。**母集団の針が狭いと、写しが在るのに映らない** —— 2026-09-20 まで `^export function` だけを見ており、`async function` と `const` が 1 つも映っていなかった (13 → 22 件)。**写しは `.ts` の外にも在る** —— 母体 (OS / ブラウザの枠) へ伝える下地色は出どころが `styles.css` の `--bg` 1 つなのに写しが 5 つ在り、機械が縛っていたのは 1 つだけだった。縛られていない 3 つのうち 2 つがその場で誤っており、`assets/manifest.webmanifest` の `theme_color` / `background_color` は **`--bg` がどの版でも取ったことのない値**だった (パス 363)。パリティ検査が `.ts` しか見ないと、webmanifest・ビルド script・生成 HTML に載った写しは永久に映らない。畳めるなら畳んで同一性を主張するほうが強い (パリティは標本の外で割れうる)。',
    provenance: ['パターン 0-a-4', 'パターン 0-a-14', 'パス 331', 'パス 363 (写しは .ts の外にも在る)'],
    enforcedBy: [test(T.shared('dualBuildDecisions')), test(T.main('stateEqualsParity')), test(T.shared('stocksConstantsParity')), test(T.renderer('webShimSnapshotParity')), test(T.shared('advisorQuestionParity')), test(T.shared('hostChromeColorCensus'))],
  },
  {
    id: 'same-question-before-parity',
    family: 'single-rule',
    name: '同じ問いに答えているか確かめてから揃える',
    statement: '同名の判定が 3 つ在っても、3 つとも違ってよいことがある (ループバック判定)。統合は狭い側を広い側へ寄せる方向にしか働かない。違うなら違いのほうを検査で留め、コードにも寄せない理由を書く。',
    provenance: ['パターン 0-a-14'],
    enforcedBy: [test(T.shared('loopbackChecks'))],
  },
  {
    id: 'parity-is-not-correctness',
    family: 'single-rule',
    name: 'パリティは両方に在る穴を見つけない',
    statement: '一致は正しさではない。パリティを取った組は、そのあと 1 つの実装として正しいかを別に見る。送り先・パス・header に入る判断は実際の攻撃形を食わせて測る。',
    provenance: ['パターン 0-a-16'],
    enforcedBy: [prose(HANDOFF, '「一致した 2 つが両方とも間違っている」は定義上パリティに映らない。攻撃形を食わせる検査は組ごとに書く')],
  },
  {
    id: 'fold-must-pair',
    family: 'single-rule',
    name: '「必ず併用する」と書いた対は畳む',
    statement: '「A を使うときは B も呼べ」と書きたくなったら B を A の中へ畳む。畳めないときだけ注記 + 台帳。実測: 7 か所のうち併用していたのは 2 か所だった。',
    provenance: ['パターン 0-a-23'],
    enforcedBy: [test(T.shared('ontologyLaws'))],
  },
  {
    id: 'checked-equals-used',
    family: 'single-rule',
    name: '調べた物と使う物を同じにする',
    statement: '関門が通した値ではなく元の文字列を使うと、調べた物と使われる物が別になる (URL の字面一致 vs 解析後・1 ホップ目 vs 転送先・アンカーの属性 vs クリックの handler)。関門の返り値を使う。',
    provenance: ['パス 291', 'パス 298', 'パス 299', 'パス 301', 'パス 325 (母集団の機械)'],
    enforcedBy: [test(T.shared('parsedUrlGateCensus')), test(T.shared('externalUrlGate')), test(T.shared('imageUrlGate')), test(T.shared('followableUrlCensus')), test(T.shared('egressRedirectCensus'))],
  },
  {
    id: 'center-then-count-callers',
    family: 'single-rule',
    name: '中心へ寄せたら呼び出し側から数え直す',
    statement: '守りを 1 か所へ寄せても、その口を使っていない経路は守られない。「その関数を使っている場所」ではなく「同じことをしている場所」を実測で数え、迂回してよいファイルを台帳で固定する。**関門の docblock が消費者を数え上げていても数え直す** —— `safeFilename` は自分を「アプリ全体で 1 つだけ持つ」と名乗り消費者 2 つ (`library.put` / `writeBlobToFolder`・どちらも保管層) を名指ししていたが、名前を決める出口は 3 種類目が在った (`a.download` 10 か所)。**書く側が検めた欄を読む側が検め直しているか**も同じ形で、`metaFromStored` は 3 欄を `typeof === string` だけで通し、`put()` が拒む 9 形が 9/9 素通りしていた (パス 359)。',
    provenance: ['パターン 0-a-18', 'パス 311', 'パス 359', 'パス 360 (同じファイルの 57 行差で同じ問いが 2 通りに答えられていた)'],
    enforcedBy: [test(T.shared('bareFetchLedger')), test(T.shared('egressRedirectCensus')), test(T.shared('jsonBodyCensus')), test(T.renderer('downloadFilenameCensus'))],
  },
  {
    id: 'no-weakness-as-spec',
    family: 'single-rule',
    name: '弱さを仕様として書き留めない',
    statement: '検査の題名が「前置き一致なので弾く側」「Never throws」と弱さに名前を与えると、落ちる検査が無くなり読んで気付くしかない。**「揃えることを要求しない」「分かる人が決めること」と書いた保留も同じ** —— 理由の欄が埋まるので検査は通り続け、実測で 1 か月近く誰も決めなかった。弱さは閉じるか、`docs/REMAINING_WORK.md` に「閉じていない物」として書く (台帳は片付いた物の説明を置く所)。',
    provenance: ['パス 291', 'パス 309', 'パス 336'],
    enforcedBy: [test(T.shared('dualBuildDecisions')), prose(HANDOFF, '題名の意味は機械に映らない。機械が在るのは両ビルド台帳の理由の欄だけ (保留の決まり文句を落とす) で、検査の題名そのものは各パスの「閉じていない物」の節が持つ')],
  },

  // ───────────────────────── 境界と信頼 ─────────────────────────
  {
    id: 'zone-imports',
    family: 'boundary',
    name: '層の import 境界',
    statement: 'renderer は main / electron / node 組み込みを読まない。shared も同じ (renderer が読む区画)。preload は electron と shared だけ。main は renderer を読まない。相対パスの実行時 require も見る。',
    provenance: ['不変条件 #1', '不変条件 #14', 'パターン 0-a'],
    enforcedBy: [gate('lint:imports'), test(T.shared('ontologyLaws'))],
  },
  {
    id: 'bridge-is-the-only-door',
    family: 'boundary',
    name: 'main への口は window.serviceHub だけ',
    statement: 'レンダラーへ Node API を通す設定・contextIsolation と sandbox と webSecurity を外す設定・文字列を code として評価する口・HTML を文字列で流し込む口を書かない (lint:forbidden の 38 種)。Node が要るものは preload bridge を広げる。',
    provenance: ['不変条件 #1', '不変条件 #9', 'CLAUDE.md Conventions'],
    enforcedBy: [gate('lint:forbidden'), test(T.main('mainWindow')), chain],
  },
  {
    id: 'renderer-never-sees-raw-token',
    family: 'boundary',
    name: 'renderer に raw token は届かない',
    statement: 'secrets:list は ID だけを返す。外へ出る値に載る文言は全部 safeErrorMessage → redactSecrets を通る (数える単位はハンドラではなく「外へ出る値に載る文言」)。',
    provenance: ['不変条件 #2', '不変条件 #4', 'ARCHITECTURE §4.4 統一原則 1'],
    enforcedBy: [test(T.main('rendererBoundMessages')), test(T.preload('bridgeContract')), test(T.main('property'))],
  },
  {
    id: 'ipc-validates-service-id',
    family: 'boundary',
    name: 'IPC で受けた serviceId は indexing 前に検証する',
    statement: '各ハンドラが isServiceId を呼んでいるか (isServiceId 自体の検査ではなく)。prototype の鍵は Object.hasOwn で落とす。ハンドラは try の外で await しない (包含で見る)。',
    provenance: ['不変条件 #3', 'パターン 0-a-4', 'パターン 0-a-15', 'パス 235'],
    enforcedBy: [gate('lint:ipc-handlers'), test(T.shared('serviceId'))],
  },
  {
    id: 'bridge-floor-never-rejects',
    family: 'boundary',
    name: 'invoke / fetchSnapshot は reject しない',
    statement: '画面は「失敗しても reject しない」を約束として try の外で await する。床 (safeErrorMessage で { ok: false } に畳む) は両ビルドとも外側 1 か所に置く。枝の中の try の写しで守らない。',
    provenance: ['パス 312', 'ARCHITECTURE §1.5'],
    enforcedBy: [gate('lint:ipc-handlers'), test(T.renderer('webShimInvokeNeverRejects'))],
  },
  {
    id: 'permissions-default-deny',
    family: 'boundary',
    name: 'ブラウザ権限は既定で拒否',
    statement: 'Electron の既定は全部承認。許すのはクリップボードの 2 つだけ。',
    provenance: ['不変条件 #15'],
    enforcedBy: [test(T.main('mainWindow')), chain],
  },
  {
    id: 'csp-pinned',
    family: 'boundary',
    name: 'CSP は実物で留める',
    statement: 'default-src self・外部フォントを読まない・connect-src は dev の HMR だけ。雛形側は検査で、出荷 HTML は注入後の公開ファイルにゲートを当てる。',
    provenance: ['ARCHITECTURE §1.3', 'パス 149'],
    enforcedBy: [gate('lint:csp'), test(T.shared('shippedCsp'))],
  },
  {
    id: 'external-url-one-gate',
    family: 'boundary',
    name: '外部 URL を OS へ渡す扉は同じ関門を通る',
    statement: 'app:openExternal と新窓ハンドラ、加えてプラットフォームが自分で辿る出口 (アンカーの属性) も http(s) 限定の同じ関門を通り、属性には関門の返り値を置く。',
    provenance: ['不変条件 #5', 'パス 298'],
    enforcedBy: [test(T.shared('externalUrlGate')), test(T.shared('followableUrlCensus')), gate('lint:forbidden')],
  },
  {
    id: 'image-url-parsed-and-private-refused',
    family: 'boundary',
    name: '第三者由来の画像 URL は解析し、内側の送り先を拒む',
    statement: '<img src> は読めなくても GET は利用者の網の内側へ飛ぶ。第三者 API の応答の URL は解析してから判定し、private / reserved を拒む。利用者自身の背景画像は別の段 (LAN の NAS は正当)。',
    provenance: ['パス 299', 'パス 300'],
    enforcedBy: [test(T.shared('imageUrlGate'))],
  },
  {
    id: 'shell-open-gate',
    family: 'boundary',
    name: 'OS の「開く」は書き出し根の内側 + 拡張子 allowlist',
    statement: 'realpath で symlink を辿ってから閉じ込めを見る。字面の閉じ込めは symlink を見ない。',
    provenance: ['ARCHITECTURE §1.4 app:openPath', 'パス 0-a-2'],
    enforcedBy: [test(T.main('exportSymlinkContainment')), chain],
  },
  {
    id: 'redirects-refused',
    family: 'boundary',
    name: 'アプリ自身の fetch は転送に追随しない',
    statement: '送り先の関門は最初の 1 ホップしか見ない。規則は httpLimits.ts に 1 つ、網の fetch 12 か所が全部通る。例外は no-cors の 1 形だけ (Fetch 標準が network error と定めるため)。',
    provenance: ['パス 301', 'パス 304'],
    enforcedBy: [test(T.shared('egressRedirectCensus')), harness('e2e:ollama')],
  },
  {
    id: 'response-body-capped',
    family: 'boundary',
    name: '相手の本文は上限つきで読む —— 失敗した応答でも',
    statement: '上限は「読む前」に byte で効かせる (全部読んでから捨てるのは上限ではない)。**失敗した応答の枝ほど要る** —— 大きな本文を返すのは壊れている相手で、その相手は `!res.ok` に来る。失敗の読みは `readFailureBody` ただ 1 つ (**実測 16 か所**)。**数えるときは別名を解決する** —— パス 330 は `readBodyWithCap|readFailureBody` の綴りだけを数え、本体が 1 行の別名 (`readCapped` / `readCappedText` / `readWithCap`) の先に在る呼び出し 18 件を落としていた (26 → 44 件。うち 7 件は失敗の枝の手書きで、上限は掛かっていたが口が 1 つではなかった · パス 334)。本文を自分で読む場所は門と端末のファイルの 3 件だけで、`Response` を受け取って自分で読む口 (`parseJsonBody`) は置かない —— 置くと上限が「呼び出し側がどの transport を渡したか」に依る。',
    provenance: ['パス 301', 'パス 311', 'パス 330 (母集団の機械)', 'パス 334 (別名の解決)'],
    enforcedBy: [test(T.shared('responseBodyCapCensus')), test(T.shared('jsonBodyCensus')), test(T.shared('httpLimits'))],
  },
  {
    id: 'variable-hosts-ledgered',
    family: 'boundary',
    name: '送り先が変数の通信は台帳',
    statement: 'Authorization を付けて送る先がホスト名で絞られていなければ資格情報の流出。送り先が定数でない通信は台帳に載っていなければ落ち、直したら消す (双方向)。走査は src 全体。',
    provenance: ['不変条件 #7', 'ARCHITECTURE §3.3', 'パターン 0-a'],
    enforcedBy: [gate('lint:network-targets')],
  },
  {
    id: 'url-path-encoded',
    family: 'boundary',
    name: 'URL の動的部分は encodeURIComponent',
    statement: '通信呼び出しに渡る URL の authority より後ろに生の ${…} があれば落ちる。ホストは network-targets、画面に出すリンクは external-url-one-gate の担当。',
    provenance: ['不変条件 #6'],
    enforcedBy: [gate('lint:url-encoding')],
  },
  {
    id: 'link-host-not-from-response',
    family: 'boundary',
    name: '応答の値を URL のホストの位置に置くなら 1 ラベルの文法で断る',
    statement: 'url-path-encoded は authority を見ず、network-targets は通信しか見ず、external-url-one-gate はスキームしか見ない —— 画面に出すリンクのホストに第三者の応答の値 (Slack team.domain) を置く行は 3 つの網のどれにも映らなかった。authority が ${…} で始まるテンプレートは台帳制 (両方向) で、置くのは関門の返り値 (slackWorkspaceDomainOrNull) だけ。',
    provenance: ['パス 324'],
    enforcedBy: [test(T.shared('hostInterpolationCensus')), test('src/main/clients/__tests__/slack.test.ts')],
  },
  {
    id: 'ollama-allowlist',
    family: 'boundary',
    name: 'Ollama は読む endpoint だけを呼ぶ',
    statement: 'pull / create / push / copy / delete / blobs / upload を呼ばない (GGUF 経由の脆弱性の面を絶つ)。許可表は共有台帳 OLLAMA_READ_PATHS から組み立てる。脆弱性台帳は日付つき。',
    provenance: ['不変条件 #7', '不変条件 #8', 'パス 141', 'パス 248'],
    enforcedBy: [gate('lint:forbidden'), test(T.shared('ollama')), gate('lint:rate-freshness')],
  },
  {
    id: 'loopback-oauth-host-pin',
    family: 'boundary',
    name: 'OAuth callback の Host は loopback だけ',
    statement: 'DNS リバインディングを Host header の固定で断つ。判定は ollama / aiEndpoint のループバック判定とは別の問い (揃えない)。',
    provenance: ['不変条件 #12', 'パターン 0-a-14'],
    enforcedBy: [test(T.shared('loopbackChecks')), chain],
  },
  {
    id: 'header-values-one-rule',
    family: 'boundary',
    name: 'Headers が何を受理するかは 1 つの判定',
    statement: '資格情報の入口は shared/headerValue.ts の 1 つで受理を判定し、プラットフォームの例外文面 (ヘッダ名を含まない) が鍵を画面へ出さない。',
    provenance: ['パス 244', 'パス 296'],
    enforcedBy: [test(T.shared('headerValue')), test(T.shared('headerValueLeak'))],
  },

  // ───────────────────────── 保存と復元 ─────────────────────────
  {
    id: 'storage-ledger-and-hard-reset',
    family: 'at-rest',
    name: '端末に残す物は台帳、ハードリセットは全行を覆う',
    statement: '新しい保存先が黙って増えない。媒体が DATA_PROTECTION の在庫に載る。入口 (localWrite) へ流れる鍵は登録の鍵と一致する (双方向)。「すべてのデータを削除」が台帳の全行を消す。',
    provenance: ['lint:storage 規則 11', 'lint:storage 規則 12', 'パス 136', 'パス 310'],
    enforcedBy: [gate('lint:storage'), test('src/renderer/security/__tests__/eraseAll.test.ts')],
  },
  {
    id: 'read-policy-three-states',
    family: 'at-rest',
    name: '「無い」「読めなかった」「読めた」を分ける',
    statement: '壊れた保存値を「まだ無い」に畳むと、次の登録が元の一覧を上書きする。読みは 3 状態で返し、画面は ⚠ で言う。端末からの読み 22 か所は方針 4 通りと理由で台帳。',
    provenance: ['パス 120', 'パス 121', 'パス 309', 'パス 310', 'パス 313'],
    enforcedBy: [test(T.renderer('storageReadLedger')), test(T.shared('watchlistState')), test(T.shared('teamRadarState')), test(T.main('stateFile'))],
  },
  {
    id: 'escape-hatch-stays-open',
    family: 'at-rest',
    name: '壊れた行があっても逃げ口は開く',
    statement: '保管層は読みで落とさない —— 落とすと壊れた行が UI から触れなくなる (`library.ts` の「行そのものは落とさない」= パス 136)。代わりに入口 (`store.importAll`) で検め、既に入っている行は設定画面の点検パネルで消す。**その設計は「逃げ口が開いている」ことに全体重を掛けている** —— 逃げ口自身が壊れた行で投げたら利用者は自分のデータから永久に締め出され、全ゲートは緑のままである。だから逃げ口は壊れた行の下でも描けることを機械で留め、投げる画面は両方向の台帳で数える。実測 (2026-09-21): 形の合わない行を collection ごとに 1 件入れて 74 画面を描くと、**欄が無い行で 2 画面が投げ** (`sales` / `kpi` —— どちらも `.slice` on undefined)、**型が違う行では 0 画面**。',
    provenance: ['パス 136', 'パス 225', 'パス 360'],
    enforcedBy: [test(T.renderer('malformedStoreRenders')), test('src/renderer/components/__tests__/recordShapeAuditPanel.test.ts')],
  },
  {
    id: 'sample-never-written-back',
    family: 'at-rest',
    name: '見本を利用者の保管場所へ書き戻さない',
    statement: '「まだ無い」「読めなかった」ときに返る同梱の見本は飾りであって利用者の物ではない。それを画面の状態へ取り込むと自動保存がそのまま端末へ書き、利用者が何も押していないのに編集中の内容が消える。取り込むのは stored === "saved" のときだけ。「読めていない下書きを書き戻さない」(パス 160) と対になる、書く側の規則。',
    provenance: ['パス 160', 'パス 335'],
    enforcedBy: [test(T.renderer('snapshotAdoptionCensus')), test('src/renderer/pages/__tests__/teamRadarSampleNeverOverwrites.test.ts'), harness('e2e')],
  },
  {
    id: 'size-gate-before-parse',
    family: 'at-rest',
    name: 'ディスクから読む所は読む前に大きさの門',
    statement: '「自分が書いた物は大きくならない」は前提にならない (別プロセス・壊れたディスク・同期ソフト)。stat で読む前に門、読んだ後にも byte の門。secrets.json は 1 MB かつ plain object。**控えへ倒れる枝は呼び出し側から見えないので、門は読む関数の中に置く** (パス 326)。同期の読みは主スレッドを止めるので特に要る。',
    provenance: ['不変条件 #13', 'パス 308', 'パス 313', 'パス 326 (母集団の機械)'],
    enforcedBy: [test(T.main('fileReadSizeGateCensus')), test(T.main('stateFile')), test(T.main('secretsProtection')), chain],
  },
  {
    id: 'at-rest-mechanism-inventory',
    family: 'at-rest',
    name: '保存物の封緘方式は台帳',
    statement: 'OS のキーチェーン / WebCrypto の保管庫 / 難読化 / 平文のどれで残っているかを 1 つの在庫が持ち、画面 (secrets:protection) がそれを言う。',
    provenance: ['パス 147', 'パス 318'],
    enforcedBy: [test(T.main('atRestPolicy')), gate('lint:storage')],
  },
  {
    id: 'credential-only-when-read',
    family: 'at-rest',
    name: '読み手の無い資格情報を預からない',
    statement: '取得も書き込みも読まないサービスにトークン入力欄を出さない。「預かること自体が漏えい面」。判定は規則 (client が token に触るか) で決まり、双方向で照合する。',
    provenance: ['credentialUse.ts の docblock', 'パス 147'],
    enforcedBy: [gate('lint:credential-use'), test(T.shared('credentialUse')), type('src/shared/credentialUse.ts')],
  },
  {
    id: 'data-origin-declared',
    family: 'at-rest',
    name: '数字の出所 (sample / local / remote) を宣言する',
    statement: '空の stub を「ライブ」として刷らない。分類は木から機械的に決まる規則で、総和型なので足し忘れは tsc が弾く。同梱の見本は集計の側がそれを言う。',
    provenance: ['dataOrigin.ts の docblock', 'パス 164', 'パス 187'],
    enforcedBy: [gate('lint:data-origin'), test(T.shared('dataOrigin')), type('src/shared/dataOrigin.ts')],
  },
  {
    id: 'crypto-floors-frozen',
    family: 'at-rest',
    name: '暗号の床は凍結値',
    statement: 'PBKDF2 の反復・salt の byte は使う側ではなく宣言行に危険を書き、下げる編集が検査で落ちる。封緘した物は自分を作った反復回数を覚える。**導出は凍結値を読む** —— ハッシュを書き写すと封筒のメタだけが動いて「復号できないバックアップ」になる (パス 327)。',
    provenance: ['パス 237', 'パス 239', 'パス 240', 'パス 327', 'パターン 0-a-10'],
    enforcedBy: [test(T.shared('kdfParamsCensus')), test(T.shared('cryptoParams')), chain],
  },
  {
    id: 'key-bound-to-slot',
    family: 'at-rest',
    name: '暗号文は置き場所と束ねる',
    statement: '認証付き暗号は「中身が正しい」しか言わない。鍵と値の対で保管するなら鍵を additionalData に入れ、解錠 (鍵が手に入る瞬間) に全件直す。',
    provenance: ['パターン 0-a-21'],
    enforcedBy: [test(T.shared('ontologyLaws')), chain],
  },
  {
    id: 'paired-secrets-written-atomically',
    family: 'at-rest',
    name: '対で意味を持つ保管値は 1 トランザクションで入れ替える',
    statement: '鍵の検算値 (`kcv`) と鍵の包み (`master-wrap`) のように**片方だけでは嘘になる**保管値は、`idbPut` を 2 回ではなく 1 トランザクションで書く。`vault.ts` の `idbPutAll` は docblock でその危険を名指ししていたのに、**`initialize` だけが `idbPut` を 2 回呼んでいた** (`changePassword` / `recoverWithMnemonic` は最初から通っていた)。実測 (2026-09-21): meta だけ書けた金庫は `unlock` が**成功し** (kcv は passwordKey を指す)、トークンも往復するので**利用者は設定をやり直さない** —— しかも `initialize` は meta が在れば断るので**やり直せない**。meta の `recoveryWrappedKey` が包むのは本物の master 鍵なので、**控えた 24 語で復旧した瞬間に実効鍵が入れ替わり、それまでのトークンが全部読めなくなる** (`TOKEN LOST`)。**塞ぐのは作る側だけ** —— 「Phase E を名乗るのに master-wrap が無ければ解錠を断る」は既にその状態に居る利用者にとって改悪で、解錠時に直す道も無い (master-wrap は master 鍵が無いと作れず、master 鍵は復旧枝からしか出ない)。',
    provenance: ['パス 239', 'パス 361'],
    enforcedBy: [test('src/renderer/security/__tests__/vaultPairedWrites.test.ts'), test('src/renderer/security/__tests__/vault.test.ts')],
  },
  {
    id: 'write-then-read-loop',
    family: 'at-rest',
    name: '書く口を足したら読みの一巡',
    statement: '「保存した」の toast は読まれた証拠ではない。入力 → 保存 → 判定し直した結果が画面に出るまでを同じ変更の中で通す。両ビルドに枝が要る。',
    provenance: ['パターン 0-a-22'],
    enforcedBy: [test(T.renderer('webShimSnapshotBranches')), test(T.renderer('webShimInputGatesAndSaves')), test(T.renderer('deviceStoreWritePolicy'))],
  },
  {
    id: 'destructive-ops-have-owner',
    family: 'at-rest',
    name: '破壊的な操作は「宛先を誰が決めるか」で数える',
    statement: '名前がデータ由来でなくても、宛先が環境変数なら守りが要る。rmSync / unlinkSync / 上書きは書き込み先の名前とは別の軸。台帳の ✅ には問いを書く。',
    provenance: ['パターン 0-a-20'],
    enforcedBy: [test(T.shared('notebooklmExportClear')), test(T.main('exportSymlinkContainment')), gate('lint:shell')],
  },

  // ───────────────────────── 画面へ出る文言・外へ出る本文 ─────────────────────────
  {
    id: 'redact-then-cut',
    family: 'surface',
    name: '相手の本文は伏せてから切る、天井は梯子',
    statement: '天井だけ掛けて伏字を持たない経路 (clampToCeiling) は前半 (伏せる) を落としている。伏字の運び手はヘッダ名・JSON 項目名・URL のクエリと form 本文の 1 つ目。天井は redact.ts の梯子に名前と理由つきで置く。',
    provenance: ['パス 271', 'パス 273', 'パス 289', 'パス 290', 'パス 307', 'パス 320'],
    enforcedBy: [test(T.shared('redactionCoverage')), test(T.shared('ceilingLiteralCensus')), chain],
  },
  {
    id: 'exception-to-screen-ledgered',
    family: 'surface',
    name: '例外の文面 → 画面は台帳',
    statement: '伏字を通さずに例外の文面を state / JSX / 戻り値へ流す行を数え、出どころの種類と理由で台帳に載せる (双方向・窓は 1 行)。母集団は renderer と shared。',
    provenance: ['パス 314', 'パス 320'],
    enforcedBy: [test(T.renderer('errorMessageSurfaceCensus'))],
  },
  {
    id: 'json-body-parsed-with-constant-message',
    family: 'surface',
    name: '2xx の非 JSON 本文は定数の文で断る',
    statement: 'V8 の SyntaxError は本文の先頭 10 字を引用する。本文を JSON として読む直呼びは出荷 code で **0 か所** —— パス 330 で `parseJsonBody` (Response を受け取って自分で読む口) を消し、上限つきで読んだ**文字列**を受け取る `parseJsonText` だけにした。口が在ると上限が呼び出し側の transport 次第になる。',
    provenance: ['パス 311', 'パス 330'],
    enforcedBy: [test(T.shared('jsonBodyCensus')), test(T.shared('apiResponse'))],
  },
  {
    id: 'envelope-checked-at-read',
    family: 'surface',
    name: '第三者の応答は読むところで確かめる',
    statement: '`as T` は封筒も確かめない。200 の {} を成功にしない・null で型エラーを画面へ漏らさない・[] が 5 つの事実を意味しない・認可サーバの応答 1 つで資格情報を失わない。',
    provenance: ['パス 259', 'パス 260', 'パス 261', 'パス 262', 'パス 263', 'パス 264'],
    enforcedBy: [test(T.shared('tokenResponse')), test(T.shared('apiResponse')), test(T.shared('securityResponse'))],
  },
  {
    id: 'ceiling-unit-is-chars',
    family: 'surface',
    name: '天井も床も文字で数える',
    statement: '画面は「2,000 字」と刷り、実装が UTF-16 のコード単位で数えると絵文字で食い違う。上限は n 文字目で切り上げる (100 MB を辿らない)。床 (12 文字以上) も同じ単位。',
    provenance: ['パス 195', 'パス 197', 'パス 252', 'パス 254', 'パス 258'],
    enforcedBy: [test(T.shared('ceilingUnitCensus')), test(T.renderer('ceilingUnitCensus')), test(T.shared('inputCeiling'))],
  },
  {
    id: 'exported-markup-escapes-free-text',
    family: 'surface',
    name: '書き出す成果物に自由文を素で入れない',
    statement: '書き出した `.md` / `.svg` / `.html` はライブラリに保存され、**ダウンロードして人に渡る**。自由文 (利用者の入力・AI の応答・第三者の応答) は `shared/escape.ts` の 1 つを通す —— Markdown は `escapeMarkdownInline` (1 行で終わる場所: 見出し・箇条書きの 1 項目・引用の 1 行) と `escapeMarkdownText` (地の文)、XML/HTML は `escapeXml`、色は**入口で検証する** (`safeColor` で既定値へ落とすか、`isHexColor` で断る)。`lint:forbidden` #11 が落とすのは**再実装**であって「通していない」ではないので、**形式ごとに**母集団を数える —— Markdown は不活性だが、`.svg` はブラウザで開くと中の `<script>` が走り、`.svg` / `.html` はアプリ自身が `shell.openPath` で OS に開かせる。',
    provenance: ['パス 332', 'パス 348', 'escape.ts の docblock (2026-08-20)'],
    enforcedBy: [test(T.renderer('markdownExportCensus')), test(T.shared('markupExportCensus')), test(T.shared('escape')), gate('lint:forbidden')],
  },
  {
    id: 'refuse-dont-truncate',
    family: 'surface',
    name: '外へ書く欄は切らずに断る',
    statement: '外へ送る本文を黙って slice しない。天井を超えたら理由を言って送らない。天井は型と長さの上限を持ち (12 家系)、画面の maxLength は関門ではない。',
    provenance: ['パス 110', 'パス 111', 'パス 172', 'パス 175', 'パス 183'],
    enforcedBy: [test(T.shared('writeFieldLimits')), test(T.renderer('writeBodyCeilingCensus'))],
  },
  {
    id: 'egress-notice-before-send',
    family: 'surface',
    name: '外へ送る画面は何を送るかを言う',
    statement: 'AI へ送る 8 画面・全画面のマイクは、何を・どこへ・どれだけ送るかを送る前に言う。断りが送る量を 2 倍に述べていてはならない。',
    provenance: ['パス 106', 'パス 107', 'パス 108', 'パス 186'],
    enforcedBy: [test('src/renderer/pages/__tests__/aiEgressDisclosed.test.ts'), test(T.renderer('aiDataDisclosure'))],
  },

  // ───────────────────────── 数字の健全性 ─────────────────────────
  {
    id: 'no-zero-fold',
    family: 'numbers',
    name: '割れない値を 0 に倒さない',
    statement: '平均受注単価 0 円・実効税率 0.0%・勝率 0% は測った結果ではない。「—」か断りへ。母集団 (? … : 0 / ?? 0 / || 0) は生成物で、判断は散文が持つ。',
    provenance: ['パス 204', 'パス 229', 'パス 266', 'lint:zero-fold'],
    enforcedBy: [gate('lint:zero-fold'), test(T.shared('zeroFoldCensus')), test(T.shared('nonFiniteEntryPoints'))],
  },
  {
    id: 'refused-values-make-no-judgement',
    family: 'numbers',
    name: '⛔ の値から判定を作らない',
    statement: '画面が断っている値 (マイナス・率の天井超・非有限) を判定へ通すと「最も都合のよい答え」が出る。段ごとに断り、⛔ の欄が在れば保存しない。',
    provenance: ['パス 206', 'パス 209', 'パス 210', 'パス 214', 'パス 216'],
    enforcedBy: [test(T.renderer('guardedJudgements'))],
  },
  {
    id: 'parameters-ledgered-and-wired',
    family: 'numbers',
    name: '計算の定数は台帳に登録し、配線し、画面は同じ出所を刷る',
    statement: '法定値・参考値・しきい値は parameters.ts の台帳。登録した値は必ず配線し「上書きすると画面が動く」を対照つきで留める。欄と欄の順序・等しくてはならない組も台帳。',
    provenance: ['CLAUDE.md Conventions', 'パス 220', 'パス 221', 'パス 222'],
    enforcedBy: [gate('lint:parameter-prose'), test(T.shared('parameters')), test(T.shared('parameterConsistency')), test(T.shared('parameterReachability'))],
  },
  {
    id: 'safety-limits-not-parameters',
    family: 'numbers',
    name: '安全上限は台帳に載せない',
    statement: 'timeout / 応答サイズ / PBKDF2 反復 / 入力長は利用者が上書きできる台帳に置かない。名前と理由つきの定数 (梯子) にする。',
    provenance: ['CLAUDE.md Conventions', 'パス 273'],
    enforcedBy: [test(T.shared('writeFieldLimits')), test(T.shared('ontologyLaws'))],
  },
  {
    id: 'dates-parsed-once',
    family: 'numbers',
    name: '日付の判定は 1 つ',
    statement: '同じ YYYY-MM-DD の判定が 7 通りに割れていた。暦を見る判定を 1 つにし、Date.UTC の 0〜99 (1900 年代) を通さない。',
    provenance: ['パス 115', 'パス 200'],
    enforcedBy: [test(T.shared('isoDate')), test(T.shared('dateAssemblyCensus')), test(T.shared('calendarDateCensus'))],
  },

  // ───────────────────────── 両ビルドの対称 ─────────────────────────
  {
    id: 'browser-cannot-exceed-desktop',
    family: 'dual-build',
    name: 'ブラウザ版はデスクトップの許可表を超えない',
    statement: 'ブラウザ版の invoke の if 連鎖に在ってデスクトップの LIVE_ACTIONS に無い操作は 0。走査が字面を全部説明できることを別に確かめる。',
    provenance: ['dualBuildActionSurface の docblock (2026-08-23)'],
    enforcedBy: [test(T.root('dualBuildActionSurface')), test(T.shared('ontologyFacets'))],
  },
  {
    id: 'desktop-only-reasons-by-kind',
    family: 'dual-build',
    name: 'デスクトップ限定の操作は種類つきの台帳',
    statement: '「デスクトップ版の機能です」と説明して穴を仕様として固定しない。理由は種類 (needs-main-only-facility / dead-action …) で書き、dead-action は画面から呼ばれていてはならない。',
    provenance: ['パス 274', 'パス 275'],
    enforcedBy: [test(T.renderer('webShimCredentials')), test(T.shared('ontologyFacets'))],
  },
  {
    id: 'bridge-methods-match',
    family: 'dual-build',
    name: 'bridge の口は preload と web-shim で同じ集合',
    statement: '15 の口は preload の型・main のハンドラ・web-shim の実装で同じ名前。片方にだけ生えた口は「在るが繋がっていない」。',
    provenance: ['パス 318', 'ARCHITECTURE §1.4'],
    enforcedBy: [test(T.preload('bridgeContract')), test(T.preload('bridgeStatic')), test(T.renderer('webShimBridge')), gate('verify:arch')],
  },
  {
    id: 'snapshot-parity',
    family: 'dual-build',
    name: '両ビルドのスナップショットは同じ形',
    statement: '同じサービスの fetchSnapshot が両ビルドで同じ欄を返す。ブラウザ版だけ not_implemented で「エラー」と出さない。',
    provenance: ['dataOrigin.ts の docblock', 'パス 309'],
    enforcedBy: [test(T.renderer('webShimSnapshotParity')), test(T.renderer('webShimSnapshotBranches'))],
  },
  {
    id: 'both-builds-real-browser',
    family: 'dual-build',
    name: '実機は両ビルド',
    statement: '実ブラウザでしか見えない退行 (CORS・no-cors・起動) が在る。e2e は FULL と LITE を両方通し、e2e:ollama はスタブ Ollama + 実 chromium。',
    provenance: ['パス 230', 'パス 304', 'パス 305'],
    enforcedBy: [harness('e2e'), harness('e2e:lite'), harness('e2e:ollama'), ci('.github/workflows/e2e.yml')],
  },

  // ───────────────────────── 知識と出典 ─────────────────────────
  {
    id: 'provenance-required',
    family: 'knowledge',
    name: '確証済みデータには出典が要る',
    statement: '権威ある出典が目録の記録だけの項目を落とす。同じ DOI が別々の出版年・著作で引かれない。雑誌・ブログ・百科事典・目録に academic を付けない。URL のスキームは http(s) だけ。DOI プレフィックスと出版社が矛盾しない。',
    provenance: ['CLAUDE.md lint:citations', 'lint:doi-prefix', 'verify:knowledge'],
    enforcedBy: [gate('verify:knowledge'), gate('lint:citations'), gate('lint:doi-prefix'), gate('lint:knowledge-refs')],
  },
  {
    id: 'vault-and-graph-in-sync',
    family: 'knowledge',
    name: '生成物は本体と同期し、本体を網羅する',
    statement: 'vault・graph・概念表は本体から生成し、committed == 再生成に加えて本体との網羅を検査する。手で行を書かない。',
    provenance: ['パターン 0-a-5', 'CLAUDE.md knowledge:md'],
    enforcedBy: [gate('vault:check'), gate('verify:graph'), gate('verify:orchestration')],
  },
  {
    id: 'legal-text-current',
    family: 'knowledge',
    name: '法令の記述は現行法',
    statement: '刑名の表記ゆれは 1 行ずつ裁定する (拘禁刑へ・旧刑名は括弧・米国法は対象外)。日付の無い率は lint:rate-freshness が期限で落とす。',
    provenance: ['刑名の裁定 (残作業 8)', 'lint:rate-freshness'],
    enforcedBy: [gate('lint:rate-freshness'), prose(HANDOFF, '「現行法か」は機械に映らない。率と日付の期限だけを機械が見る')],
  },

  // ───────────────────────── 供給網と CI ─────────────────────────
  {
    id: 'deps-ledgered',
    family: 'supply-chain',
    name: '依存の閉包・床・取得元は台帳',
    statement: '本番依存は単一 HTML へ畳まれ保管庫と同じオリジンで走るので、増やすなら理由を書く。取得元は registry のみ・integrity 必須。「自分で押さえた版」の床は 1 つの台帳。週次の監査が狭い PR の門の外側を受け持つ。',
    provenance: ['CLAUDE.md lint:deps', 'パス 306'],
    enforcedBy: [gate('lint:deps'), ci('.github/workflows/dependency-audit.yml'), test(T.shared('dependencyAuditWorkflow'))],
  },
  {
    id: 'workflows-pinned-and-least-privilege',
    family: 'supply-chain',
    name: 'workflow は permissions 明示・第三者 action は SHA 固定',
    statement: 'pull_request_target 禁止。run: へ信用できない値を埋め込まない。第一者 action は runner の Node に合わせて上げる。',
    provenance: ['CLAUDE.md lint:workflow-security', 'パス 316'],
    enforcedBy: [gate('lint:workflow-security'), test(T.shared('workflowSecurityWitness')), chain],
  },
  {
    id: 'shell-scripts-strict',
    family: 'supply-chain',
    name: '.sh は strict、遠隔コードと破壊的操作は台帳',
    statement: '追跡されている .sh すべて。bash shebang・set -euo pipefail・bash -n・curl | sh は台帳のみ・後戻りできない書き込みと秘密の扱いは台帳のみ (双方向)・台帳の --self-test を実際に走らせる。',
    provenance: ['CLAUDE.md lint:shell', 'パス 279'],
    enforcedBy: [gate('lint:shell')],
  },
  {
    id: 'integrity-chain-with-closure',
    family: 'supply-chain',
    name: '守りを決めるファイルは封緘し、読んでいる先を 1 段見る',
    statement: '保護対象の一覧が読んでいる先 (PBKDF2 の反復を持つ定数など) が保護か理由つきの除外に載っていることを機械で確かめる。1 段ずつでよい。除外の理由は「実行時に残るか」で決める。',
    provenance: ['パターン 0-a-10', 'パターン 0-a-18', 'パス 285', 'パス 286', 'パス 287'],
    enforcedBy: [gate('chain:verify'), test(T.shared('integrityChainWitness')), chain],
  },
  {
    id: 'mutation-scope-protected',
    family: 'supply-chain',
    name: '保護対象は変異検査の中',
    statement: '権限・資格情報・書き出し先を決める壁が mutate から外れると変異体が 1 つも作られず、測っていないのに緑になる。',
    provenance: ['lint:mutation-scope の docblock', 'パス 318'],
    enforcedBy: [gate('lint:mutation-scope'), harness('mutate')],
  },
  {
    id: 'release-artifacts-reread',
    family: 'supply-chain',
    name: '公開先は前のランの残骸を溜める — 置いてある一覧を読み返す',
    statement: 'CI の緑はそのランが何を出したかしか保証しない。追記しかしない置き場 (リリース資産) は公開後に一覧を読み返す。数は宣言側 (electron-builder.json) から導く。',
    provenance: ['パターン 0-a-19'],
    enforcedBy: [gate('verify:release-artifacts')],
  },
  {
    id: 'repo-size-ceiling',
    family: 'supply-chain',
    name: '追跡ファイルの大きさに天井',
    statement: '履歴に入った blob は後から追跡を外しても消えない。1 ファイル 12 MB / 追跡合計 80 MB (85% で警告)。出荷 HTML は 16 MB / 4 MB。',
    provenance: ['CLAUDE.md lint:repo-size', 'ci.yml の出荷物の天井'],
    enforcedBy: [gate('lint:repo-size'), ci('.github/workflows/ci.yml')],
  },
];

export interface LawLedgerProblem {
  readonly law: string;
  readonly problem: string;
}

export interface LawLedgerFacts {
  /** package.json の scripts の名前。 */
  readonly scripts: ReadonlySet<string>;
  /** verify:all に並ぶ script の名前。 */
  readonly verifyAll: ReadonlySet<string>;
  /** リポジトリ相対パスが実在するか。 */
  readonly exists: (repoRelative: string) => boolean;
}

/**
 * 台帳そのものを実物と突き合わせる (純粋関数 —— 実物は呼び出し側が渡す)。
 * 執行者の指す物が消えれば落ちる。執行者を持たない法則も落ちる。
 */
export function validateLawLedger(laws: readonly Law[], facts: LawLedgerFacts): LawLedgerProblem[] {
  const out: LawLedgerProblem[] = [];
  const seen = new Set<string>();
  const families = new Set<string>(Object.keys(LAW_FAMILIES));
  for (const law of laws) {
    if (seen.has(law.id)) out.push({ law: law.id, problem: 'id が重複している' });
    seen.add(law.id);
    if (!families.has(law.family)) out.push({ law: law.id, problem: `family が語彙に無い: ${law.family}` });
    if (law.enforcedBy.length === 0) out.push({ law: law.id, problem: '執行者が 1 つも無い (散文だけなら prose を書く)' });
    if (law.provenance.length === 0) out.push({ law: law.id, problem: '出典が無い' });
    for (const e of law.enforcedBy) {
      switch (e.kind) {
        case 'gate':
          if (!facts.scripts.has(e.script)) out.push({ law: law.id, problem: `ゲート ${e.script} が package.json に無い` });
          else if (!facts.verifyAll.has(e.script)) out.push({ law: law.id, problem: `ゲート ${e.script} が verify:all に並んでいない` });
          break;
        case 'harness':
          if (!facts.scripts.has(e.script)) out.push({ law: law.id, problem: `実機 ${e.script} が package.json に無い` });
          break;
        case 'test':
          if (!e.file.endsWith('.test.ts')) out.push({ law: law.id, problem: `検査の名前が .test.ts でない: ${e.file}` });
          else if (!facts.exists(e.file)) out.push({ law: law.id, problem: `検査が実在しない: ${e.file}` });
          break;
        case 'type':
          if (!facts.exists(e.where)) out.push({ law: law.id, problem: `型の在処が実在しない: ${e.where}` });
          break;
        case 'ci':
          if (!facts.exists(e.workflow)) out.push({ law: law.id, problem: `workflow が実在しない: ${e.workflow}` });
          break;
        case 'prose':
          if (!facts.exists(e.where)) out.push({ law: law.id, problem: `散文の在処が実在しない: ${e.where}` });
          if (e.why.trim().length === 0) out.push({ law: law.id, problem: '機械が無い理由が空' });
          break;
        case 'chain':
          break;
      }
    }
  }
  return out;
}
