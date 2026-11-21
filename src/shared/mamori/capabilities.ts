/**
 * 能力の台帳 (2026-10-31 · 0.5 · threat: T-242) —— 「マイナスデイ・マインド」を言語の規則にした物。
 *
 * 考え方: 脆弱性は**書いた時点ですでに入っている**と見て、守りの層が**何に届くか**を常に目に見える形で固定する。
 * 守りの層 (`.mamori`) が持つ能力は 4 つだけで、どれもコンパイラが構文木から**導く** (書き手の申告ではない):
 *
 * - `externals` —— `extern` で宣言した外の値 (危ない口 `sink` と、副作用の判断を持たない `pure`)。
 * - `imports`   —— 相対でない `use` (外の module から引いた名前)。供給網の入口。
 * - `gates`     —— 印を作れる関数 (`gate fn` + 戻り値の型)。**印を作れる所が増えるのは、関門が増えること**。
 * - `sinks`     —— 危ない口を呼べる関数 (`sink fn` + 行き先の型)。
 *
 * 導いた表を、リポジトリが持つ台帳 (`security/mamori-capabilities.json`) と**両方向**に突き合わせる (M7)。
 * 新しい能力が入れば台帳に無いので止まり、台帳に在るのに実在しなければ (古い申告) 止まる。台帳の差分は
 * レビューで読める 1 行ずつで、台帳自身は整合性チェーンの保護対象 —— 能力を足す変更が**黙って通らない**。
 *
 * 台帳が無い (`policy` を渡さない) 呼び方はライブラリとしての呼び方で検めない。出荷の道 (CLI と生成物の検査) は
 * 必ず台帳を渡す (`mamoriCapabilities.test.ts` が見る)。
 */
import type { Module } from './ast';
import type { MamoriDiagnostic } from './checker';

export interface ModuleCapabilities {
  readonly externals: readonly string[];
  readonly imports: readonly string[];
  readonly gates: readonly string[];
  readonly sinks: readonly string[];
}

export interface CapabilityPolicy {
  readonly modules: Readonly<Record<string, ModuleCapabilities>>;
}

const KINDS = ['externals', 'imports', 'gates', 'sinks'] as const;
type Kind = (typeof KINDS)[number];

interface Entry {
  readonly text: string;
  readonly line: number;
  readonly col: number;
}

/** 1 つのモジュールの能力を、位置つきで導く。 */
function entriesOf(module: Module): Record<Kind, Entry[]> {
  const out: Record<Kind, Entry[]> = { externals: [], imports: [], gates: [], sinks: [] };
  const add = (kind: Kind, text: string, pos: { line: number; col: number }): void => {
    out[kind].push({ text, line: pos.line, col: pos.col });
  };
  for (const it of module.items) {
    if (it.kind === 'extern') add('externals', `${it.authority} ${it.from ?? 'global'}: ${it.names.join(', ')}`, it.pos);
    if (it.kind === 'use' && !it.from.startsWith('.')) add('imports', `${it.from}: ${[...(it.defaultName === null ? [] : [`default ${it.defaultName}`]), ...it.names.map((n) => n.name)].join(', ')}`, it.pos);
    // 関数でない宣言 (vetted・型・定数) は role を持たず、中の 2 つの門のどちらにも当たらない —— この条件を外しても答えは同じ (等価)。
    // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (関数でない宣言は gate でも sink でもない)
    if (it.kind === 'fn') {
      if (it.role === 'gate') add('gates', `${it.name} -> ${it.returns.text}`, it.pos);
      if (it.role === 'sink') add('sinks', `${it.name}(${it.params[0]!.type!.text})`, it.pos);
    }
  }
  return out;
}

/** 導いた能力の表 (道 → 能力)。台帳の形と同じで、文字列は並べて比べやすいよう整列してある。 */
export function deriveCapabilities(modules: readonly { readonly file: string; readonly module: Module }[]): Record<string, ModuleCapabilities> {
  const table: Record<string, ModuleCapabilities> = {};
  for (const { file, module } of modules) {
    const e = entriesOf(module);
    table[file] = { externals: sorted(e.externals), imports: sorted(e.imports), gates: sorted(e.gates), sinks: sorted(e.sinks) };
  }
  // 道の順 (既定の並べ替え = UTF-16 の順で、環境の言語設定に依らない)。
  return Object.fromEntries(Object.keys(table).sort().map((k) => [k, table[k]!]));
}

function sorted(es: readonly Entry[]): string[] {
  return es.map((x) => x.text).sort();
}

/** 導いた能力を台帳と突き合わせる (M7)。台帳に無い能力・台帳に在るのに実在しない能力・台帳に無いモジュールを断る。 */
export function checkCapabilities(modules: readonly { readonly file: string; readonly module: Module }[], policy: CapabilityPolicy): MamoriDiagnostic[] {
  const out: MamoriDiagnostic[] = [];
  const seen = new Set<string>();
  for (const { file, module } of modules) {
    seen.add(file);
    const allowed = policy.modules[file];
    const derived = entriesOf(module);
    for (const kind of KINDS) {
      const have = new Set<string>(allowed?.[kind]);
      for (const e of derived[kind]) {
        if (!have.has(e.text)) out.push({ file, line: e.line, col: e.col, rule: 'M7', message: `能力の台帳 (security/mamori-capabilities.json) に無い ${kind} です: ${e.text} —— 能力を足す変更は台帳に 1 行足して、その差分をレビューする` });
      }
      const real = new Set(derived[kind].map((e) => e.text));
      for (const text of allowed?.[kind] ?? []) {
        if (!real.has(text)) out.push({ file, line: 1, col: 1, rule: 'M7', message: `能力の台帳に在るのに実在しない ${kind} です: ${text} —— 古い申告は台帳から消す` });
      }
    }
  }
  for (const file of Object.keys(policy.modules)) {
    if (!seen.has(file)) out.push({ file, line: 1, col: 1, rule: 'M7', message: `能力の台帳に在るのに、このモジュールが見つかりません: ${file}` });
  }
  return out;
}
