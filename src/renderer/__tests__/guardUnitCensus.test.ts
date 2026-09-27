/**
 * **入力欄の断りは、その欄の単位語で話す。** (2026-09-27 · パス 493n)
 *
 * 入力の関門 (`data/inputGuards.ts` の `guardNumber`) は、断りの文にその欄の**単位語**を入れる ——
 * 「未入力です。0 X として計算されています」「N X 以下で入力してください」「N X は想定の範囲を
 * 超えています」。単位語は欄の宣言 (`NumSpec`) が選んだ**種類** (`NumKind`) から来るので、
 * 近い種類を借りると**嘘の単位を言う** (パス 373 / 493k が 1 つずつ直した形)。
 *
 * ## 見つけた物 (実測・直す前)
 *
 * 総称の単位語を持つ種類が 2 つ在り、**使う欄が 1 つも正しくなかった**:
 *
 * | 種類 (単位語) | 借りていた欄 | 断りの例 |
 * | --- | --- | --- |
 * | `count` (件) | 交換周期 (日)・RO 処理目標 (h)・棚の段数・賞与の回数・寄附先の自治体数・住戸数・決算月 (1-12)・課税期間の終了年 (西暦)・従業者数 | 「31 件 は想定の範囲を超えています」(棚の段数)・「2000 件 以上で入力してください」(終了年) |
 * | `ratio` (倍) | 循環量 (L)・RO 機の日産 (L/日)・曝気タンク容量 (L)・外貨額・取得時レート・現在レート・為替手数料 (片道・円) | 「0 倍 では計算できません」(外貨額)・「未入力です。0 倍 として計算されています」(循環量) |
 *
 * **16 欄のうち 6 欄は、ラベル自身が正しい単位を名乗っていた** (「(日)」「(h)」「(L)」「(円)」) ——
 * 同じ欄の中で、ラベルと断りが別の単位を言っていた。直しは総称の 2 種類を消し、欄の実物の
 * 単位語を持つ 8 種を足すこと (`hours` / `tiers` / `times` / `municipalities` / `dwellings` /
 * `calendarMonth` / `calendarYear` / `currencyUnits`)。
 *
 * ## この検査がすること
 *
 * 構文木 (TypeScript の compiler API) で、renderer の**すべての入力欄の宣言**を拾う ——
 * `label` と `kind` を持ち、`kind` が `NumKind` の字面である物のリテラル。そのうえで:
 *
 * 1. **ラベルが単位を名乗るなら** (括弧の中の、既知の単位語の 1 区切り —— `(日)` / `(片道・円)` /
 *    `(L/日・空欄可)` の `L`)、種類の単位語がその中に在る
 * 2. **名乗らないなら**、下の台帳が欄ごとに単位語を持ち、種類の単位語と一致する (両方向 ——
 *    ラベルが単位を名乗るようになったら「台帳から消せ」と落ちる)
 * 3. ラベルが字面でない宣言 (呼び手が名前を渡す・表から組む) と、種類が字面でない宣言は
 *    理由つきの台帳に載る (両方向)
 *
 * **台帳の単位語は「この欄の値は何で数えるか」を人に書かせる** —— 種類を選ぶときに
 * 単位語を 1 度も見ずに済む形が、借りる形を生んだ。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import ts from 'typescript';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { guardNumber, unitOfKind, type NumKind } from '../data/inputGuards';

const REPO = path.resolve(__dirname, '../../..');
const RENDERER = path.join(REPO, 'src/renderer');

// ---------------------------------------------------------------------------
// 種類の一覧 (型の宣言から読む —— 写しを作らない)
// ---------------------------------------------------------------------------

/** `NumKind` の union を原文から読む。 */
function numKindsFromSource(): readonly NumKind[] {
  const file = path.join(RENDERER, 'data/inputGuards.ts');
  const sf = ts.createSourceFile(file, readOriginalSource(file), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  sf.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === 'NumKind' && ts.isUnionTypeNode(n.type)) {
      for (const t of n.type.types) {
        if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) out.push(t.literal.text);
      }
    }
  });
  return out as NumKind[];
}

const KINDS = numKindsFromSource();
const KIND_SET: ReadonlySet<string> = new Set(KINDS);

/** 単位語の別綴り (同じ単位)。ラベルの綴りを画面ごとに揃えるまでの間の読み替え。 */
const UNIT_ALIASES: Readonly<Record<string, string>> = {
  'm²': '㎡', // 経営サマリーの「床面積 (m²)」—— 不動産の「敷地面積 (㎡)」と同じ単位
};

const KNOWN_UNITS: ReadonlySet<string> = new Set(KINDS.map((k) => unitOfKind(k)));

// ---------------------------------------------------------------------------
// ラベルが名乗る単位
// ---------------------------------------------------------------------------

/**
 * ラベルの括弧の中から、**既知の単位語の区切り**を拾う。
 *
 * 区切りは `・` / `、`。区切りが単位語そのもの (`日`) か、単位語で始まる複合
 * (`L/日` → `L`・`円/株` → `円`) なら単位として数える。`1-12` / `西暦` / `空欄可` /
 * `片道` のような区切りは単位ではない。
 */
function unitsNamedByLabel(label: string): readonly string[] {
  const out: string[] = [];
  for (const m of label.matchAll(/\(([^()]*)\)|（([^（）]*)）/g)) {
    const inside = m[1] ?? m[2] ?? '';
    for (const raw of inside.split(/[・、]/)) {
      const seg = UNIT_ALIASES[raw.trim()] ?? raw.trim();
      if (KNOWN_UNITS.has(seg)) {
        out.push(seg);
        continue;
      }
      const head = [...KNOWN_UNITS].find((u) => seg.startsWith(`${u}/`));
      if (head !== undefined) out.push(head);
    }
  }
  return out;
}

type UnitVerdict = { readonly ok: true } | { readonly ok: false; readonly why: string } | { readonly needsLedger: true };

/** 1 つの欄の判定 (ラベルと、種類の単位語)。 */
function unitVerdict(label: string, unit: string): UnitVerdict {
  const named = unitsNamedByLabel(label);
  if (named.length === 0) return { needsLedger: true };
  if (named.includes(unit)) return { ok: true };
  return { ok: false, why: `ラベル「${label}」は ${named.join(' / ')} を名乗るが、断りは「${unit}」で話す` };
}

// ---------------------------------------------------------------------------
// 台帳
// ---------------------------------------------------------------------------

/**
 * **ラベルが単位を名乗らない欄**の単位語。鍵はラベル (同じラベルは同じ単位で数える)。
 *
 * 行を足すときは「この欄の値は何で数えるか」を書く —— それが選んだ種類の単位語と
 * 一致しなければ落ちる。ラベルが単位を名乗るようになったら行を消す (両方向)。
 */
const UNIT_OF_UNLABELLED: Readonly<Record<string, string>> = {
  // 法人税の試算 (FinancialAnalysis)
  資本金: '円',
  従業者数: '人', // ★ 直す前は `count` (件) —— 均等割の区分 (50 人超) の欄
  繰越欠損金: '円',
  課税売上: '円',
  課税仕入: '円',
  // 物件 (data/investments)
  '月次経費 (任意)': '円',
  '月次返済 (任意)': '円',
  // 不動産の試算 (RealEstatePage)
  月額賃料: '円',
  物件価格: '円',
  年間経費: '円',
  自己資金: '円',
  年間返済額: '円',
  売却ネット手取り: '円',
  保有年数: '年',
  // 水耕栽培の設定 (OverviewPage)
  棚の段数: '段', // ★ 直す前は `count` (件) —— 「31 件 は想定の範囲を超えています」
  // 投資信託 (MutualFundsPage)
  達成年数: '年',
  積立年数: '年',
  外貨額: '通貨', // ★ 直す前は `ratio` (倍) —— 「0 倍 では計算できません」
  取得時レート: '円', // ★ 同 —— 1 通貨あたりの円 (「1 ドル 150 円」)
  現在レート: '円',
  // 税金 (TaxPage)
  賞与の回数: '回', // ★ 直す前は `count` (件)
  寄附先の自治体数: '団体', // ★ 同 —— ワンストップ特例の「5 団体以内」の数え方
  住戸数: '戸', // ★ 同
  勤続年数: '年',
  '決算月 (1-12)': '月', // ★ 同 —— 括弧は範囲であって単位ではない
  '課税期間の終了年 (西暦)': '年', // ★ 同 —— 「2000 件 以上で入力してください」と言っていた
  配偶者の合計所得: '円', // 福利厚生カード
};

/**
 * **ラベルが字面でない宣言**。鍵は `道 :: ラベルの式`。理由には「どこから名前が来て、
 * それがなぜこの種類の単位で数える物か」を書く (両方向)。
 */
const DYNAMIC_LABELS: Readonly<Record<string, string>> = {
  'src/renderer/data/inputGuards.ts :: label':
    '`dependentCountSpec(label)` —— 呼び手は扶養親族の人数の欄だけで、名前は「…の人数」(下の検査が呼び手の字面を確かめる)。単位は「人」。',
  "src/renderer/components/WelfareSchemeCard.tsx :: f.label.replace(/^┗ /, '')":
    '福利厚生カードの金額の欄の表 (`fields`) から組む。表の行はどれも円の額 (家賃・食事・育児補助・EC ポイント・目標の手元残り)。',
};

/**
 * **種類が字面でない宣言**。鍵は道。理由には、単位の一致を誰が確かめるかを書く (両方向)。
 */
const DELEGATED_KINDS: Readonly<Record<string, string>> = {
  'src/renderer/data/hydroponicsLog.ts':
    '水耕栽培の運転設定 18 欄は `CONTROL_KINDS` の表から種類を採る。単位はラベルの台帳 (`CONTROL_FIELD_BOUNDS`) が持ち、' +
    '一致は `hydroponicsControlSpecs.test.ts` が `unitOfKind` と突き合わせる。',
};

// ---------------------------------------------------------------------------
// 本物の木
// ---------------------------------------------------------------------------

interface SpecSite {
  readonly file: string;
  readonly line: number;
  /** ラベルが字面ならその値、でなければ `null`。 */
  readonly label: string | null;
  readonly labelText: string;
  /** 種類が字面ならその値、でなければ `null`。 */
  readonly kind: NumKind | null;
}

function propInit(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name) {
      return p.initializer;
    }
    // `{ label, kind: 'people' }` —— 省略形は名前そのものが値 (`dependentCountSpec` がこの形)
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return p.name;
  }
  return undefined;
}

function literalText(e: ts.Expression): string | null {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  return null;
}

/** `NumSpec` だけが持つ欄 (種類が字面でない宣言を、他の `{ label, kind }` と見分ける)。 */
const SPEC_ONLY = ['allowEmpty', 'allowZero', 'sane'] as const;

function specSites(file: string, text: string): readonly SpecSite[] {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: SpecSite[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      const labelInit = propInit(n, 'label');
      const kindInit = propInit(n, 'kind');
      if (labelInit && kindInit) {
        const kindLit = literalText(kindInit);
        const isSpec =
          kindLit !== null ? KIND_SET.has(kindLit) : SPEC_ONLY.some((k) => propInit(n, k) !== undefined);
        if (isSpec) {
          out.push({
            file,
            line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
            label: literalText(labelInit),
            labelText: labelInit.getText(sf),
            kind: kindLit as NumKind | null,
          });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function rendererSources(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readOriginalDirEntries(dir)) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== '__audits__') walk(abs);
      } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        out.set(path.relative(REPO, abs).split(path.sep).join('/'), readOriginalSource(abs));
      }
    }
  };
  walk(RENDERER);
  return out;
}

const SOURCES = rendererSources();
const SITES: readonly SpecSite[] = [...SOURCES].flatMap(([file, text]) => specSites(file, text));
const LITERAL = SITES.filter((s) => s.label !== null && s.kind !== null);
const where = (s: SpecSite): string => `${s.file}:${s.line} 「${s.labelText}」`;

describe('入力欄の断りは、その欄の単位語で話す (パス 493n)', () => {
  it('★ 走査が木を歩いた —— 字面のラベルと種類を持つ宣言は 120 以上', () => {
    // 床は実測に張り付けない。針が死んで 0 件で緑になる形だけを止める。
    expect(LITERAL.length).toBeGreaterThanOrEqual(120);
    // 種類の一覧が読めている (型の宣言から読むので、空なら上の母集団も空になる)
    expect(KINDS.length).toBeGreaterThanOrEqual(15);
    for (const k of KINDS) expect(unitOfKind(k), k).toBeTruthy();
  });

  it('★ ラベルが単位を名乗る欄は、断りも同じ単位で話す', () => {
    const bad = LITERAL.flatMap((s) => {
      const v = unitVerdict(s.label!, unitOfKind(s.kind!));
      return 'ok' in v && !v.ok ? [`${where(s)}: ${v.why}`] : [];
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('★ ラベルが単位を名乗らない欄は、台帳が単位語を持ち、種類と一致する (両方向)', () => {
    const unlabelled = LITERAL.filter((s) => 'needsLedger' in unitVerdict(s.label!, unitOfKind(s.kind!)));
    const missing = unlabelled.filter((s) => !Object.hasOwn(UNIT_OF_UNLABELLED, s.label!)).map(where);
    expect(missing, `台帳に「この欄の値は何で数えるか」を書く:\n${missing.join('\n')}`).toEqual([]);
    const wrong = unlabelled
      .filter((s) => Object.hasOwn(UNIT_OF_UNLABELLED, s.label!) && UNIT_OF_UNLABELLED[s.label!] !== unitOfKind(s.kind!))
      .map((s) => `${where(s)}: 台帳は「${UNIT_OF_UNLABELLED[s.label!]}」、断りは「${unitOfKind(s.kind!)}」`);
    expect(wrong, wrong.join('\n')).toEqual([]);
    const seen = new Set(unlabelled.map((s) => s.label!));
    const stale = Object.keys(UNIT_OF_UNLABELLED).filter((l) => !seen.has(l));
    expect(stale, `実物に無い (またはラベルが単位を名乗るようになった) 行 —— 台帳から消す: ${stale.join(', ')}`).toEqual([]);
  });

  it('★ ラベルが字面でない宣言は理由つきの台帳に在る (両方向)', () => {
    const dynamic = SITES.filter((s) => s.label === null && s.kind !== null).map((s) => `${s.file} :: ${s.labelText}`);
    expect([...new Set(dynamic)].sort()).toEqual(Object.keys(DYNAMIC_LABELS).sort());
    for (const why of Object.values(DYNAMIC_LABELS)) expect(why.length).toBeGreaterThan(30);
  });

  it('★ 扶養親族の欄の呼び手は、どれも人数の名前を字面で渡す (dependentCountSpec の台帳の理由を検算する)', () => {
    const calls: { at: string; arg: string | null }[] = [];
    for (const [file, text] of SOURCES) {
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'dependentCountSpec') {
          const a = n.arguments[0];
          calls.push({ at: `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`, arg: a ? literalText(a) : null });
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    // 呼び手は税金ページ 2 + 福利厚生カード 3 (床は実測に張り付けない)
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) expect(c.arg, c.at).toMatch(/^.+の人数$/);
  });

  it('★ 種類が字面でない宣言は、単位の一致を確かめる検査を名指しする (両方向)', () => {
    const delegated = [...new Set(SITES.filter((s) => s.kind === null).map((s) => s.file))].sort();
    expect(delegated).toEqual(Object.keys(DELEGATED_KINDS).sort());
    const owner = readOriginalSource(path.join(RENDERER, 'data/__tests__/hydroponicsControlSpecs.test.ts'));
    expect(owner).toContain('unitOfKind');
  });

  it('★ 総称の単位語 (件・倍) を持つ種類は無い —— 借りられる種類を置かない', () => {
    const units = KINDS.map((k) => unitOfKind(k));
    // 文字列の完全一致なので、綴りが外れれば鳴る (正規表現の針ではない)
    expect(units).not.toContain('件');
    expect(units).not.toContain('倍');
  });
});

describe('標本 —— 判定の規則が、直す前の形に当たる', () => {
  it('ラベルの単位と断りの単位が食い違えば落ちる (直す前の 3 形)', () => {
    expect(unitVerdict('交換周期 (日)', '件')).toMatchObject({ ok: false });
    expect(unitVerdict('循環量 (L)', '倍')).toMatchObject({ ok: false });
    expect(unitVerdict('為替手数料 (片道・円)', '倍')).toMatchObject({ ok: false });
  });

  it('区切りと複合の単位を読む (片道・円 / L/日・空欄可 / 年・円 / 全角の括弧)', () => {
    expect(unitsNamedByLabel('為替手数料 (片道・円)')).toEqual(['円']);
    expect(unitsNamedByLabel('RO 機の日産 (L/日・空欄可)')).toEqual(['L']);
    expect(unitsNamedByLabel('課税所得 (年・円)')).toEqual(['年', '円']);
    expect(unitsNamedByLabel('前課税期間の確定消費税額（国税分・円）')).toEqual(['円']);
    expect(unitsNamedByLabel('販売単価 (円/株)')).toEqual(['円']);
    expect(unitsNamedByLabel('電力原単位 (kWh/kg)')).toEqual(['kWh/kg']);
    expect(unitsNamedByLabel('床面積 (m²)')).toEqual(['㎡']);
  });

  it('単位でない括弧は単位として読まない —— 台帳が要る', () => {
    expect(unitVerdict('決算月 (1-12)', '月')).toEqual({ needsLedger: true });
    expect(unitVerdict('課税期間の終了年 (西暦)', '年')).toEqual({ needsLedger: true });
    expect(unitVerdict('月次経費 (任意)', '円')).toEqual({ needsLedger: true });
    expect(unitVerdict('棚の段数', '段')).toEqual({ needsLedger: true });
  });

  it('宣言の拾い方: 字面の種類 / 表から組む種類 / 他の { label, kind } を見分ける', () => {
    const src = [
      "const A = { x: { label: '棚の段数', kind: 'tiers', sane: 30 } };",
      "const B = { label: b.label, kind: KINDS[k], allowEmpty: true };",
      "const C = { label: '売上高', amount: 1, kind: 'section' };",
      "const D = <G spec={{ label: '決算月 (1-12)', kind: 'calendarMonth', min: 1 }} />;",
      "function E(label: string) { return { label, kind: 'people', allowZero: true }; }",
    ].join('\n');
    const got = specSites('x.tsx', src).map((s) => [s.label, s.kind, s.labelText]);
    expect(got).toEqual([
      ['棚の段数', 'tiers', "'棚の段数'"],
      [null, null, 'b.label'],
      ['決算月 (1-12)', 'calendarMonth', "'決算月 (1-12)'"],
      [null, 'people', 'label'], // 省略形 (`dependentCountSpec` の形)
    ]);
  });

  it('断りの文は種類の単位語を実際に使う (この検査が unitOfKind を信じてよい理由)', () => {
    for (const k of KINDS) {
      expect(guardNumber('abc', { label: 'X', kind: k })?.message, k).toContain(`0 ${unitOfKind(k)} として計算されています`);
    }
  });
});
