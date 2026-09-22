/**
 * **`orchestration/registry.json` のどの鍵が出荷物に入るか、と、その byte 代金** (2026-09-22 · パス 396)。
 *
 * `registry.json` は **286,148 B** の開発側の台帳 (AI オーケストレーションの組織・
 * チーム・ディスパッチ履歴・backlog) で、`src/` が**名前付き import** で一部を読む。
 * Vite は JSON の名前付き export を tree-shaking するので、**import した鍵だけ**が
 * 単一 HTML へ畳み込まれる —— つまり *どの鍵を import するか* が出荷 byte を決める。
 *
 * ## なぜ機械が要るか (実測 2026-09-22)
 *
 * `chatOrg.ts` の docblock はこう述べていた:
 *
 * > registry.json の `rounds` (履歴・容量の大半) は import しない —— Vite の JSON
 * > 名前付き export tree-shaking により **`org` / `teams` のみがバンドルされる**。
 *
 * **後半は出荷物についての主張で、偽だった。** `VillagePage.tsx` が `rounds` と
 * `backlog` を名前で import しており、組んだ `dist/standalone.html` を実測すると
 * **102 / 102 の round オブジェクトが逐語で入っていた** (backlog の題名も 43 / 43)。
 * 推論そのものは正しい (Vite は確かに落とす) —— **前提が古びた**: 書かれた時点では
 * 誰も `rounds` を import していなかったが、`VillagePage` が足されて誰も測り直さなかった。
 *
 * ## 誰がこの主張に寄りかかるか
 *
 * ディスパッチの 1 ラウンドに `shipped: […]` のリリースノートを足す人である。
 * 上の docblock を読めば「履歴は出荷物に入らない」と結論する —— 実際は入る。
 * LITE は **3,352,785 B** で、CI の警告線 3,400,000 B まで **47,215 B**
 * (ハード上限 4,000,000 B までは 647,215 B)。
 *
 * ## 読まれない小鍵の代金 (実測)
 *
 * 製品が `rounds` から読むのは `villageData.buildDispatchPlan` の **2 欄だけ** ——
 * `r.round` と `r.teams`。`src/` 全体を走査しても `rounds[].shipped` /
 * `.note` / `.teamCount` の読み手は **0 件**である (`.shipped*` の一致は
 * 水耕栽培の `shippedPlantsPerMonth` 等・`villageData.ts` の `'shipped'` は
 * backlog の status の enum)。それでも 3 欄は出荷物に入る:
 *
 * | 小鍵 | 出現 | minified |
 * | --- | --- | ---: |
 * | `shipped` | 102 / 102 | **39,254 B** |
 * | `note` | 54 / 102 | **6,783 B** |
 * | `teamCount` | 102 / 102 | 205 B (`teams.length` から導ける) |
 * | 計 | | **46,242 B** |
 *
 * = 警告線までの余裕の **98%**・ハード上限までの **7.1%**。
 * **これは欠陥として直していない** —— 履歴を製品から外すか台帳から削るかは
 * データモデルの決定で、開発側の記録 (どのラウンドで何を出したか) を失う側面がある。
 * ここは**代金を見えるようにする**だけにして、判断は `docs/REMAINING_WORK.md` へ回す。
 *
 * ## この検査が要求すること
 *
 * 1. `src/` (検査を除く) が `registry.json` から名前で import する鍵の集合が、
 *    下の台帳と**両方向**に一致する。
 * 2. 各鍵の minified byte が台帳の `maxBytes` 以下 (**増えたら鳴って読ませる**)。
 * 3. 走査が空虚でない (実物の import に当たっている標本つき)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const REPO = path.resolve(__dirname, '../../..');
const REGISTRY = path.join(REPO, 'orchestration/registry.json');

/** registry.json から名前で import してよい鍵と、その理由・代金の上限。 */
interface CostRow {
  readonly key: string;
  readonly importedBy: readonly string[];
  readonly why: string;
  /** minified byte の上限。**実測 + 余裕**で置く (実測に張り付けると無関係な編集で落ちる)。 */
  readonly maxBytes: number;
}

const LEDGER: readonly CostRow[] = [
  {
    key: 'org',
    importedBy: ['components/ChatbotWidget.tsx', 'pages/VillagePage.tsx', 'pages/AssistantPage.tsx'],
    why: '話題 → 担当 (チーム→部長→役員) の索引を組む (chatOrg.buildOrgIndex)。村シーンの村人ロスターの元でもある',
    maxBytes: 12_000, // 実測 5,978 B
  },
  {
    key: 'teams',
    importedBy: ['components/ChatbotWidget.tsx', 'pages/VillagePage.tsx', 'pages/AssistantPage.tsx'],
    why: '同じ索引の担当チーム側。domain / focus の語で話題を寄せる',
    maxBytes: 60_000, // 実測 36,981 B
  },
  {
    key: 'rounds',
    importedBy: ['pages/VillagePage.tsx'],
    why: '村シーンのディスパッチ計画。**読むのは r.round と r.teams の 2 欄だけ**で、'
      + 'shipped / note / teamCount (計 46,242 B) は誰も読まないまま出荷物に入る (docblock に実測表)',
    maxBytes: 200_000, // 実測 160,558 B —— **いちばん重い鍵**
  },
  {
    key: 'backlog',
    importedBy: ['pages/VillagePage.tsx'],
    why: '村シーンが各チームの未処理件数と status を出す',
    maxBytes: 20_000, // 実測 7,323 B
  },
];

// --- 実物の import を走査で導く -------------------------------------------------

/** `src/` の ts / tsx を歩く (検査は除く —— 検査は出荷物に入らない)。 */
function shippedSources(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      shippedSources(p, out);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 1 ファイルが registry.json から名前で import している鍵。
 *
 * `import { org as regOrg, teams as regTeams } from '…/registry.json'` の
 * **中括弧の中の元の名前**を取る (別名は出荷 byte に関係しない)。
 */
export function registryKeysImported(source: string): string[] {
  const out: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*'[^']*orchestration\/registry\.json'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]!.trim();
      if (name !== '') out.push(name);
    }
  }
  return out;
}

function scanned(): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const abs of shippedSources(path.join(REPO, 'src'))) {
    const keys = registryKeysImported(readOriginalSource(abs));
    if (keys.length === 0) continue;
    const rel = path.relative(path.join(REPO, 'src/renderer'), abs);
    for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), rel]);
  }
  return byKey;
}

function minifiedBytes(key: string): number {
  // **生の `readFileSync` は使わない** —— `originalSourcePolicy` が落とす
  // (Stryker の sandbox で書き換えられた写しではなく原文を読むため。パス 365 と同じ指摘)。
  const reg = JSON.parse(readOriginalSource(REGISTRY)) as Record<string, unknown>;
  return Buffer.byteLength(JSON.stringify(reg[key]));
}

// --- 主張 -----------------------------------------------------------------------

describe('registry.json の出荷 byte 代金', () => {
  const found = scanned();

  it('★ 走査が空虚でない (実物の import に当たっている)', () => {
    expect(found.size).toBeGreaterThanOrEqual(2);
    // 標本: 実物とまったく同じ形・別名つき・複数行。
    expect(registryKeysImported(
      "import { org as regOrg, teams as regTeams, rounds as regRounds } from '../../../orchestration/registry.json';",
    )).toEqual(['org', 'teams', 'rounds']);
    expect(registryKeysImported(
      "import {\n  org,\n  backlog as b,\n} from '../../orchestration/registry.json';",
    )).toEqual(['org', 'backlog']);
    // 別の JSON からの import は数えない。
    expect(registryKeysImported("import { org } from './other.json';")).toEqual([]);
  });

  it('★ import されている鍵は台帳と一致する (母集団 → 台帳)', () => {
    const ledgerKeys = new Set(LEDGER.map((r) => r.key));
    const missing = [...found.keys()].filter((k) => !ledgerKeys.has(k));
    expect(
      missing,
      `registry.json から新しい鍵を import している。出荷 byte が増えるので台帳へ理由と実測を書くこと: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('★ 台帳の鍵は実際に import されている (台帳 → 母集団)', () => {
    const stale = LEDGER.filter((r) => !found.has(r.key)).map((r) => r.key);
    expect(
      stale,
      `台帳に在るのに誰も import していない —— 出荷物から消えたなら台帳からも消すこと: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  it.each(LEDGER.map((r) => [r.key, r] as const))('%s の代金が上限以下', (key, row) => {
    const bytes = minifiedBytes(key);
    expect(
      bytes,
      `registry.json の "${key}" が ${bytes} B (上限 ${row.maxBytes} B)。`
      + `**この鍵は出荷物へ畳み込まれる** —— LITE は CI の警告線まで 47,215 B しか無い。`
      + `増やす理由が在るなら台帳の maxBytes を実測つきで引き直すこと。`,
    ).toBeLessThanOrEqual(row.maxBytes);
  });

  it('★ 台帳の理由が空でない', () => {
    for (const row of LEDGER) expect(row.why.length, row.key).toBeGreaterThan(20);
  });

  it('★ import している実物のファイルが台帳と一致する', () => {
    for (const row of LEDGER) {
      const actual = [...(found.get(row.key) ?? [])].sort();
      expect(actual, `"${row.key}" の import 元`).toEqual([...row.importedBy].sort());
    }
  });
});
