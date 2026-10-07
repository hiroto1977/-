/**
 * **dialog / alertdialog の構文木の census** (2026-10-07 · パス 506) —— 窓はキーボードで入れて・閉じられて・戻れる。
 *
 * ## なぜ構文木か
 *
 * パス 506 の実機の測定で、浮いたコンシェルジュ (`role="dialog"`) とその中の確認 (`role="alertdialog"`) は
 * **開いても焦点が動かず・Esc で閉じず・閉じても焦点が body へ落ちた** (WAI-ARIA APG の dialog の約束を 1 つも持たない)。
 * 直しは `useDialogFocus` 1 つに寄せたが、**次の dialog を足した人がその hook を呼ばなければ同じ形が戻る**。
 * 実機の suite (`opened`) は今在る窓を押して測るが、新しい窓は名指ししないと測らない —— だから「`role` が dialog か
 * alertdialog の JSX は、名前と `ref` と `onKeyDown` を持ち、そのファイルは `useDialogFocus` を呼ぶ」を描く側で留める。
 *
 * ## 規則 (画面のソース `uiSources()` を構文木で走査する)
 *
 * 1. `role` が `dialog` / `alertdialog` になり得る JSX (字面・条件式の枝・const) は台帳 `DIALOG_SITES` に**両方向**で一致する。
 * 2. その JSX は `aria-label` (字面) か `aria-labelledby` を持つ (名前 · WCAG 4.1.2)。
 * 3. `ref` と `onKeyDown` を属性として持つ (焦点を運ぶ先と Esc の受け口)。属性の展開 (`{...x}`) は読めないので数えない。
 * 4. そのファイルは `./useDialogFocus` を import して呼ぶ (配線の実体は `useDialogFocus.test.ts` と jsdom の
 *    `conciergeDialogFocus.test.ts` / `VoiceCommandBar.render.test.ts` が振る舞いで見る)。
 *
 * ## ここが見ない物
 *
 * `role` が識別子の引数で決まる物 (部品に渡す) は読めない —— 今日 0 件で、現れたら規則 1 が「台帳に書け」と鳴る前に
 * 走査から落ちるので、`role` を受け取る部品が増えたらここの針を広げる。焦点が実際に動くか・Esc が効くかは jsdom と実機が測る。
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { constEnv, parseSource, resolveStrings, uiSources } from './astStyle';

const DIALOG_ROLES: ReadonlySet<string> = new Set(['dialog', 'alertdialog']);

export interface DialogSite {
  readonly file: string;
  readonly line: number;
  readonly roles: readonly string[];
  /** `aria-label` の字面 (条件式なら枝の 1 つ目)。無ければ null。 */
  readonly label: string | null;
  readonly labelledby: boolean;
  readonly hasRef: boolean;
  readonly hasKeyDown: boolean;
}

export interface DialogScan {
  readonly sites: readonly DialogSite[];
  readonly importsHook: boolean;
  readonly callsHook: boolean;
}

function attrOf(n: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  for (const a of n.attributes.properties) if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  return undefined;
}

function attrExpr(a: ts.JsxAttribute | undefined): ts.Expression | undefined {
  if (a === undefined || a.initializer === undefined) return undefined;
  if (ts.isJsxExpression(a.initializer)) return a.initializer.expression ?? undefined;
  return a.initializer;
}

/** 1 つのソースの dialog / alertdialog を走査する。 */
export function scanDialogSites(fileName: string, text: string): DialogScan {
  const sf = parseSource(fileName, text);
  const env = constEnv(sf);
  const sites: DialogSite[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const roles = resolveStrings(attrExpr(attrOf(n, 'role')), env).strings.filter((s) => DIALOG_ROLES.has(s));
      if (roles.length > 0) {
        const labels = resolveStrings(attrExpr(attrOf(n, 'aria-label')), env).strings.filter((s) => s.trim() !== '');
        sites.push({
          file: fileName,
          line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          roles,
          label: labels[0] ?? null,
          labelledby: attrOf(n, 'aria-labelledby') !== undefined,
          hasRef: attrOf(n, 'ref') !== undefined,
          hasKeyDown: attrOf(n, 'onKeyDown') !== undefined,
        });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const importsHook = /from\s+['"](?:\.\.?\/)+(?:components\/)?useDialogFocus['"]/.test(text);
  // hook そのものの定義 (`export function useDialogFocus(`) は呼び出しではない —— import している物だけを「呼ぶ」と数える。
  return { sites, importsHook, callsHook: importsHook && text.includes('useDialogFocus(') };
}

/** 台帳: 今日の dialog / alertdialog (ファイル × 名前)。両方向 —— 足せば「書け」、消せば「消せ」と鳴る。 */
const DIALOG_SITES: readonly { readonly file: string; readonly label: string; readonly why: string }[] = [
  {
    file: 'src/renderer/components/ChatbotWidget.tsx',
    label: 'AI コンシェルジュ',
    why: '浮いた窓 (列 `docked` では role を持たない)。開いたら入力欄へ・Esc で閉じる・閉じたら 🤖 へ戻す',
  },
  {
    file: 'src/renderer/components/ChatbotWidget.tsx',
    label: '要望リストの消去の確認',
    why: '書き出した直後の alertdialog。焦点は「残す」へ・Esc = 残す・消えたら「📥 要望」へ戻す',
  },
  {
    file: 'src/renderer/components/ChatbotWidget.tsx',
    label: '実行確認',
    why: '書き込みの確認の alertdialog。焦点は「やめる」へ・Esc = やめる・消えたら入力欄へ戻す (今日届く道は無い —— conciergeDialogFocus.test.ts の docblock)',
  },
  {
    file: 'src/renderer/components/VoiceCommandBar.tsx',
    label: '実行確認',
    why: '音声の確認の alertdialog。焦点は「取消」へ・Esc = 取消・消えたら 🎤 へ戻す',
  },
];

const scans = uiSources().map((s) => ({ ...s, scan: scanDialogSites(s.file, s.text) }));
const found = scans.flatMap((s) => s.scan.sites);
const key = (file: string, label: string | null) => `${file} :: ${label ?? '(名前なし)'}`;

describe('dialog / alertdialog の census (パス 506)', () => {
  it('★ 走査は空虚ではない (今日 4 件以上・2 ファイル以上)', () => {
    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(new Set(found.map((s) => s.file)).size).toBeGreaterThanOrEqual(2);
  });

  it('★ 母集団と台帳は両方向に一致する (ファイル × aria-label)', () => {
    const actual = found.map((s) => key(s.file, s.label)).sort();
    const ledger = DIALOG_SITES.map((r) => key(r.file, r.label)).sort();
    expect(actual, 'dialog を足したら台帳 DIALOG_SITES に理由つきで書く / 消したら台帳からも消す').toEqual(ledger);
    for (const r of DIALOG_SITES) expect(r.why.length, `${key(r.file, r.label)} の理由が短い`).toBeGreaterThanOrEqual(15);
  });

  it('★ どの dialog も名前・ref・onKeyDown を持つ', () => {
    const bad = found
      .filter((s) => (s.label === null && !s.labelledby) || !s.hasRef || !s.hasKeyDown)
      .map((s) => `${s.file}:${s.line} (${s.roles.join('/')}) 名前=${s.label ?? s.labelledby} ref=${s.hasRef} onKeyDown=${s.hasKeyDown}`);
    expect(bad, 'dialog は aria-label か aria-labelledby・ref・onKeyDown を属性として持つ (useDialogFocus を配線する)').toEqual([]);
  });

  it('★ dialog を持つファイルは useDialogFocus を import して呼ぶ', () => {
    const bad = scans.filter((s) => s.scan.sites.length > 0 && !(s.scan.importsHook && s.scan.callsHook)).map((s) => s.file);
    expect(bad, 'dialog の焦点と Esc は useDialogFocus 1 つで揃える').toEqual([]);
    // 逆向き: hook を呼ぶのに dialog を持たないファイルは無い (配線の宛先が消えた形)
    const orphan = scans.filter((s) => s.scan.callsHook && s.scan.sites.length === 0).map((s) => s.file);
    expect(orphan, 'useDialogFocus を呼ぶのに dialog が無い').toEqual([]);
  });

  it('標本: 針は字面・条件式の枝・const の role を拾い、他の role は拾わず、欠けた属性を名指しする', () => {
    const src = [
      "const ROLE = 'alertdialog';",
      'export function X({ docked }: { docked: boolean }) {',
      '  return (<div>',
      '    <div role="dialog" aria-label="a" ref={r} onKeyDown={k} />',
      "    <div role={docked ? undefined : 'dialog'} aria-label={docked ? undefined : 'b'} ref={r} onKeyDown={k} />",
      '    <span role={ROLE} aria-labelledby="h" ref={r} onKeyDown={k} />',
      '    <div role="button" aria-label="not a dialog" />',
      '    <div role="alertdialog" aria-label="c" />',
      '  </div>);',
      '}',
    ].join('\n');
    const scan = scanDialogSites('sample.tsx', src);
    expect(scan.sites.map((s) => s.label ?? '(labelledby)')).toEqual(['a', 'b', '(labelledby)', 'c']);
    expect(scan.sites[2]!.labelledby).toBe(true);
    const missing = scan.sites.filter((s) => !s.hasRef || !s.hasKeyDown);
    expect(missing.map((s) => `${s.line}:${s.label}`)).toEqual(['8:c']);
    expect(scan.importsHook).toBe(false);
    expect(scanDialogSites('s2.tsx', "import { useDialogFocus } from './useDialogFocus';\nuseDialogFocus(r, o);").importsHook).toBe(true);
    expect(scanDialogSites('s3.tsx', "import { useDialogFocus } from '../components/useDialogFocus';").importsHook).toBe(true);
  });
});
