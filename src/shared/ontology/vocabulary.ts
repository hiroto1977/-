/**
 * **Service Hub のオントロジー — 語彙 (層・ビルド・実体クラス)。**
 *
 * 2026-09-18 に、それまでの 320 パスで学んだ物を 1 つの語彙に畳んだ。
 * ここに在るのは「このシステムは何でできているか」の宣言で、実物との一致は
 * `src/shared/__tests__/ontology*.test.ts` が両方向に検査する
 * (宣言に無い物が実物に生えれば落ち、宣言に在る物が実物から消えても落ちる)。
 * 文書 `docs/ONTOLOGY.md` はこのモジュールと実物から**生成**する
 * (`npm run ontology:md`)。手で書いた表は必ず腐る —— このリポジトリが
 * 繰り返し実測してきた形なので、表は 1 つも手で持たない。
 *
 * ## なぜ shared に置くか
 *
 * 語彙は判断を持たない純粋なデータで、両ビルドのどちらからも読める場所は
 * `src/shared/` しか無い。実物を読む側 (node:fs・ゲートの .cjs) は
 * `src/__tests__/ontologyFacts.ts` に在り、shared は node を読まない
 * (`lint:imports` の規則: shared は renderer が読む区画)。
 */

/** プロセス / 信頼区画。`lint:imports` の ZONES と同じ 4 つ。 */
export const ZONE_IDS = ['main', 'preload', 'renderer', 'shared'] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

/** 出荷される形。 */
export const BUILD_IDS = ['desktop', 'browser-full', 'browser-lite'] as const;
export type BuildId = (typeof BUILD_IDS)[number];

export interface ZoneSpec {
  readonly id: ZoneId;
  readonly label: string;
  /** 何に触れてよいか (信頼の上限)。 */
  readonly trust: string;
  /** import してよい層。`scripts/check-import-boundaries.cjs` の ALLOW と一致する (検査で留める)。 */
  readonly mayImport: readonly ZoneId[];
  /** electron / node 組み込みを読んでよいか。 */
  readonly nodeAccess: 'full' | 'electron-only' | 'none';
  readonly shipsIn: readonly BuildId[];
}

export const ZONES: readonly ZoneSpec[] = [
  {
    id: 'main',
    label: 'Electron main',
    trust: 'フル Node。IPC の受け口・secrets・OAuth・REST・shell。',
    mayImport: ['main', 'shared'],
    nodeAccess: 'full',
    shipsIn: ['desktop'],
  },
  {
    id: 'preload',
    label: 'Preload (contextIsolated bridge)',
    trust: '`window.serviceHub` を expose するだけ。node 組み込みは読まない。',
    mayImport: ['preload', 'shared'],
    nodeAccess: 'electron-only',
    shipsIn: ['desktop'],
  },
  {
    id: 'renderer',
    label: 'Renderer (React)',
    trust: '表示と入力。Node API 不可・raw token は届かない・外へは bridge 経由。ブラウザ版では web-shim が main の役を引き受ける。',
    mayImport: ['renderer', 'shared', 'preload'],
    nodeAccess: 'none',
    shipsIn: ['desktop', 'browser-full', 'browser-lite'],
  },
  {
    id: 'shared',
    label: 'Shared (判定・型・台帳)',
    trust: '両ビルドが同じ実装を読む区画。renderer が読むので node / electron を持ち込めない。',
    mayImport: ['shared'],
    nodeAccess: 'none',
    shipsIn: ['desktop', 'browser-full', 'browser-lite'],
  },
];

export interface BuildSpec {
  readonly id: BuildId;
  readonly label: string;
  readonly zones: readonly ZoneId[];
  /** `window.serviceHub` の実体。 */
  readonly bridge: 'ipcMain.handle (main.ts)' | 'web-shim.ts';
  readonly note: string;
}

export const BUILDS: readonly BuildSpec[] = [
  {
    id: 'desktop',
    label: 'Electron デスクトップ',
    zones: ['main', 'preload', 'renderer', 'shared'],
    bridge: 'ipcMain.handle (main.ts)',
    note: '3 プロセス。secrets は OS のキーチェーン (safeStorage)。状態ファイルは userData。',
  },
  {
    id: 'browser-full',
    label: 'ブラウザ単体 (standalone.html)',
    zones: ['renderer', 'shared'],
    bridge: 'web-shim.ts',
    note: '単一 HTML。資格情報は WebCrypto の保管庫。学術コーパスを積む。',
  },
  {
    id: 'browser-lite',
    label: 'ブラウザ単体 LITE (standalone-lite.html)',
    zones: ['renderer', 'shared'],
    bridge: 'web-shim.ts',
    note: '学術コーパスを積まない以外は FULL と同じ。両方が同じだけ増えるのは共有モジュールだから。',
  },
];

/**
 * 実体クラス —— 「このシステムに何が在るか」と「その一覧はどこに在るか」。
 *
 * `ledger` は一覧の在処 (実在するファイル)、`machines` はその一覧を実物と
 * 突き合わせている検査。どちらも実在を検査で留める。
 */
export interface EntityClass {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly ledger: readonly string[];
  readonly machines: readonly string[];
}

export const ENTITY_CLASSES: readonly EntityClass[] = [
  {
    id: 'service',
    label: 'サービス',
    summary: '76 の画面 / 連携。facet (配置・出所・資格情報・local・OAuth・action) は複数の台帳に分かれて宣言され、それぞれのゲートが導出と照合する。',
    ledger: ['src/shared/serviceId.ts', 'src/renderer/services.ts', 'src/shared/dataOrigin.ts', 'src/shared/credentialUse.ts', 'src/main/clients/index.ts', 'src/main/oauth.ts'],
    machines: ['scripts/lint-data-origin.cjs', 'scripts/lint-credential-use.cjs', 'scripts/lint-test-coverage.cjs', 'src/renderer/__tests__/sidebarCoverage.test.ts', 'src/__tests__/dualBuildActionSurface.test.ts'],
  },
  {
    id: 'bridge-method',
    label: 'bridge の口 (IPC チャンネル)',
    summary: '`window.serviceHub` の口。preload の型・main のハンドラ・web-shim の枝が同じ集合であること。',
    ledger: ['src/preload/preload.ts', 'src/main/main.ts', 'src/renderer/web-shim.ts'],
    machines: ['scripts/lint-ipc-handlers.cjs', 'src/preload/__tests__/bridgeContract.test.ts', 'src/preload/__tests__/bridgeStatic.test.ts', 'src/renderer/__tests__/webShimBridge.test.ts'],
  },
  {
    id: 'store',
    label: '保存先 (端末に残る物)',
    summary: 'ブラウザの IndexedDB / Cache Storage / localStorage / sessionStorage と、デスクトップの userData の状態ファイル。全行がハードリセットに覆われる。',
    ledger: ['scripts/lint-storage-ledger.cjs', 'src/shared/atRestInventory.ts', 'src/main/eraseAll.ts', 'docs/DATA_PROTECTION.md'],
    machines: ['scripts/lint-storage-ledger.cjs', 'src/renderer/__tests__/storageReadLedger.test.ts', 'src/main/__tests__/eraseAll.test.ts', 'src/main/__tests__/atRestPolicy.test.ts'],
  },
  {
    id: 'egress-site',
    label: '外へ出る通信の口',
    summary: 'fetch の呼び出し 12 か所 (転送に追随しない)・送り先が変数の通信の台帳・素の fetch を握ってよい場所の台帳。',
    ledger: ['scripts/lint-network-targets.cjs', 'src/shared/httpLimits.ts', 'docs/ARCHITECTURE.md'],
    machines: ['scripts/lint-network-targets.cjs', 'scripts/lint-url-encoding.cjs', 'src/shared/__tests__/egressRedirectCensus.test.ts', 'src/shared/__tests__/bareFetchLedger.test.ts'],
  },
  {
    id: 'url-door',
    label: 'URL を外へ渡す扉',
    summary: 'OS で開く扉 (openExternal / 新窓)・アンカーの属性・`<img src>`・OS の「開く」。すべて解析してから判定し、関門の返り値を使う。',
    ledger: ['src/shared/externalUrlGate.ts', 'src/shared/imageUrlGate.ts', 'src/main/shellOpenGate.ts'],
    machines: ['src/shared/__tests__/externalUrlGate.test.ts', 'src/shared/__tests__/imageUrlGate.test.ts', 'src/shared/__tests__/followableUrlCensus.test.ts', 'src/main/__tests__/exportSymlinkContainment.test.ts'],
  },
  {
    id: 'surface',
    label: '文言が画面へ出る面',
    summary: '例外の文面・相手の本文・保存値の理由が画面へ届く行。伏字を通してから天井で切る。',
    ledger: ['src/shared/redact.ts', 'src/renderer/__tests__/errorMessageSurfaceCensus.test.ts'],
    machines: ['src/renderer/__tests__/errorMessageSurfaceCensus.test.ts', 'src/shared/__tests__/redactionCoverage.test.ts', 'src/shared/__tests__/ceilingLiteralCensus.test.ts', 'src/main/__tests__/rendererBoundMessages.test.ts'],
  },
  {
    id: 'limit',
    label: '天井と床 (安全上限)',
    summary: '応答の byte・締切・本文の字数・入力の字数・鍵の長さ・状態ファイルの大きさ・PBKDF2 の反復。台帳 (parameters) には載せない。単位は文字。',
    ledger: ['src/shared/redact.ts', 'src/shared/httpLimits.ts', 'src/shared/inputCeiling.ts', 'src/shared/writeFieldLimits.ts', 'src/shared/assistantLimits.ts', 'src/shared/cryptoParams.ts', 'src/main/stateFile.ts'],
    machines: ['src/shared/__tests__/ceilingUnitCensus.test.ts', 'src/renderer/__tests__/ceilingUnitCensus.test.ts', 'src/renderer/__tests__/writeBodyCeilingCensus.test.ts', 'src/shared/__tests__/cryptoParams.test.ts', 'src/main/__tests__/stateFile.test.ts'],
  },
  {
    id: 'parameter',
    label: '計算に使う固定の数字 (上書きできる)',
    summary: '法定値・参考値・しきい値。台帳に登録し、画面は `useParameters()` で読んで関数へ渡す。上書きすると画面が動くことを対照つきで留める。',
    ledger: ['src/shared/parameters.ts', 'src/shared/parameterConsistency.ts'],
    machines: ['scripts/lint-parameter-prose.cjs', 'src/shared/__tests__/parameters.test.ts', 'src/shared/__tests__/parameterConsistency.test.ts', 'src/shared/__tests__/parameterReachability.test.ts'],
  },
  {
    id: 'knowledge-dataset',
    label: '確証済みの知識',
    summary: '学術 / 法務税務労務 / 補助金 / 相談窓口 / 経済史。出典つきで、vault・graph・orchestration の文脈の唯一の元。',
    ledger: ['src/renderer/data/academicKnowledge.ts', 'src/renderer/data/complianceKnowledge.ts', 'src/renderer/data/subsidyKnowledge.ts', 'src/renderer/data/counselorKnowledge.ts', 'src/renderer/data/economicHistoryKnowledge.ts'],
    machines: ['scripts/verify-knowledge-provenance.cjs', 'scripts/lint-citations.cjs', 'scripts/lint-doi-prefix.cjs', 'scripts/lint-knowledge-refs.cjs', 'scripts/build-knowledge-vault.cjs', 'scripts/verify-graph.cjs'],
  },
  {
    id: 'gate',
    label: 'ゲート (verify:all)',
    summary: '`npm run verify:all` の連鎖。全部が ci.yml に在り、自作の物は `--self-test` を持つ。',
    ledger: ['package.json', '.github/workflows/ci.yml'],
    machines: ['scripts/cross-doc-consistency.cjs', 'src/shared/__tests__/ontologyLaws.test.ts'],
  },
  {
    id: 'census',
    label: 'census (母集団を数える検査)',
    summary: '走査で母集団を数え、台帳と両方向に突き合わせる vitest。標本と対照を持つ。',
    ledger: ['src/shared/__tests__/absenceSampleCensus.test.ts'],
    machines: ['src/shared/__tests__/absenceSampleCensus.test.ts'],
  },
  {
    id: 'protected-file',
    label: '整合性チェーンの保護対象',
    summary: '守りを決めるファイルの封緘。保護対象が読む先も 1 段は保護か除外台帳に在る。',
    ledger: ['scripts/integrity-chain.cjs', 'security/integrity-chain.json'],
    machines: ['scripts/integrity-chain.cjs', 'src/shared/__tests__/integrityChainWitness.test.ts', 'scripts/lint-mutation-scope.cjs'],
  },
  {
    id: 'harness',
    label: '実機の harness',
    summary: '実ブラウザ / 実 Electron でしか見えない物 (CORS・no-cors・起動・性能)。suite ごとの床。CI では label / dispatch で走る。',
    ledger: ['scripts/e2e/core.cjs', '.github/workflows/e2e.yml'],
    machines: ['src/shared/__tests__/e2eSuiteFloors.test.ts', 'src/shared/__tests__/artifactFreshness.test.ts'],
  },
  {
    id: 'document',
    label: '文書',
    summary: 'ARCHITECTURE の file:line と live metric・CLAUDE.md の数・REMAINING_WORK の生成ブロック。散文で述べた規則は落ちないので、数は機械が持つ。',
    ledger: ['docs/ARCHITECTURE.md', 'CLAUDE.md', 'docs/SESSION_HANDOFF.md', 'docs/REMAINING_WORK.md', 'docs/ONTOLOGY.md'],
    machines: ['scripts/verify-architecture.cjs', 'scripts/cross-doc-consistency.cjs', 'src/shared/__tests__/ontologyDoc.test.ts'],
  },
  {
    id: 'workflow',
    label: 'CI の workflow',
    summary: 'permissions 明示・第三者 action の SHA 固定・pull_request_target 禁止。週次の依存監査は常設 Issue 1 つ。',
    ledger: ['.github/workflows/ci.yml', '.github/workflows/e2e.yml', '.github/workflows/dependency-audit.yml', '.github/workflows/release.yml'],
    machines: ['scripts/lint-workflow-security.cjs', 'src/shared/__tests__/workflowSecurityWitness.test.ts', 'src/shared/__tests__/dependencyAuditWorkflow.test.ts'],
  },
];
