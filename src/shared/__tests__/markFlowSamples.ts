/**
 * 標本: 印 (関門を通った値の型) へ、関門を通らない値が流れ込む形。**どの関数も呼ばれない。**
 *
 * この中の行は、`@ts-expect-error` の 1 行を除いて、どれも `tsc` (strict) が通す —— それが穴である
 * (2026-11-16 · MG-074 · 台帳の T-272 / T-273)。`markFlowCensus.test.ts` がこのファイルを
 * 型検査器で走査し、行末の印と突き合わせる:
 *
 *   `// !! <rule>`  その行で <rule> が鳴る (鳴らなければ検査が落ちる)
 *   `// ok`         鳴らない (鳴れば検査が落ちる)
 *   `// ok <rule>`  違反ではない分類 (`ok-…`) として数えられる
 *
 * 印の無い行で何かが鳴っても落ちる (両方向)。
 */
import { externalUrlOrNull } from '../externalUrlGate';
import type { VettedExternalUrl } from '../vetted';

/** 印を受ける口の代役。 */
function sink(u: VettedExternalUrl): string {
  return u;
}
function sinkMany(us: readonly VettedExternalUrl[]): number {
  return us.length;
}
/** 印を欄に持つ型 —— 綴りに印の名前が出ない。 */
interface Box {
  u: VettedExternalUrl;
}

// ── 型の無い値を、印の型の位置へ置く ─────────────────────────────────────

export function anyArg(s: string): string {
  return sink(JSON.parse(s)); // !! any-to-mark
}
export function anyInit(s: string): VettedExternalUrl {
  const u: VettedExternalUrl = JSON.parse(s); // !! any-to-mark
  return u;
}
export function anyReturn(s: string): VettedExternalUrl {
  return JSON.parse(s); // !! any-to-mark
}
export function anyArray(s: string): number {
  const xs: VettedExternalUrl[] = JSON.parse(s); // !! any-to-mark
  return sinkMany(xs);
}
export function anyAssign(s: string): VettedExternalUrl | null {
  let u: VettedExternalUrl | null = null;
  u = JSON.parse(s); // !! any-to-mark
  return u;
}
export function anyField(s: string): Box {
  return { u: JSON.parse(s) }; // !! any-to-mark
}
export function anyBox(s: string): Box {
  const b: Box = JSON.parse(s); // !! any-to-mark
  return b;
}
export function anyMember(s: string): string {
  const v = JSON.parse(s);
  return sink(v.url); // !! any-to-mark
}
export function anyElement(xs: unknown): string | null {
  return Array.isArray(xs) ? sink(xs[0]) : null; // !! any-to-mark
}
export async function anyPromise(s: string): Promise<VettedExternalUrl> {
  return Promise.resolve(JSON.parse(s)); // !! any-to-mark
}
export function anyExplicit(s: string): Promise<VettedExternalUrl> {
  // 型引数を明示すると式の型は印になる —— 型の無い値は、引数の位置でだけ見える。
  return Promise.resolve<VettedExternalUrl>(JSON.parse(s)); // !! any-to-mark // ok ok-generic-lib-explicit
}
export function anySpread(s: string): string {
  const packed: [any] = [JSON.parse(s)];
  return sink(...packed); // !! any-to-mark
}
export function anyReturningFunction(evil: string): string {
  const conv: (x: string) => VettedExternalUrl = JSON.parse; // !! any-to-mark
  return sink(conv(evil));
}
export function anyGetter(s: string): Box {
  return {
    get u() { // !! any-to-mark
      return JSON.parse(s);
    },
  };
}

// ── 型引数が、呼び出しの文脈から印に決まる ───────────────────────────────

function launder<T>(x: string): T {
  return JSON.parse(x);
}
function castAway<T>(x: unknown): T {
  return x as T;
}
function first<T>(xs: T[], raw: string): T {
  void xs;
  return JSON.parse(raw);
}
function pick<T>(): T[] {
  return JSON.parse('[]');
}
function same<T>(x: T): T {
  return x;
}
export function genInferred(s: string): string {
  return sink(launder(s)); // !! generic-from-nothing
}
export function genCast(s: string): string {
  return sink(castAway(s)); // !! generic-from-nothing
}
export function genNever(s: string): string {
  return sink(first([], s)); // !! generic-from-nothing
}
export function genExplicit(s: string): VettedExternalUrl {
  const u = launder<VettedExternalUrl>(s); // !! generic-from-nothing
  return u;
}
export function genElement(): VettedExternalUrl | undefined {
  return pick<VettedExternalUrl>()[0]; // !! generic-from-nothing
}
class Holder<T> {
  get(x: string): T {
    return x as T;
  }
}
export function genClass(evil: string): string {
  return sink(new Holder<VettedExternalUrl>().get(evil)); // !! generic-from-nothing
}
export function genCarries(u: VettedExternalUrl): string {
  return sink(same(u)); // ok ok-generic-arg-carries-mark
}

// ── 印を欄に持つ型への言い換え・型の述語 ─────────────────────────────────

export function castBox(s: string): Box {
  return JSON.parse(s) as Box; // !! cast-to-mark
}
export function castObject(o: { u: string }): Box {
  return o as Box; // !! cast-to-mark
}
export function castNever(evil: string): string {
  return sink(evil as never); // !! cast-to-never
}
export function castSame(b: Box): Readonly<Box> {
  return b as Readonly<Box>; // ok ok-cast-from-mark
}
export function isBox(v: unknown): v is Box { // !! predicate-names-mark
  return typeof v === 'object' && v !== null;
}

// ── 本体の無い宣言が印を名乗る ───────────────────────────────────────────

export function overloaded(x: string): VettedExternalUrl; // !! bodyless-names-mark
export function overloaded(x: string): string {
  return x;
}
declare const ambient: VettedExternalUrl; // !! bodyless-names-mark
export function useAmbient(): string {
  return sink(ambient);
}

// ── 型検査を黙らせる ─────────────────────────────────────────────────────

export function suppressed(raw: string): string {
  // @ts-expect-error 標本 (黙らせた行は素の文字列を口へ渡せる) !! ts-directive
  return sink(raw);
}

// ── 印を受ける関数を、印を受けない型として持ち出す ───────────────────────

interface Runner {
  run(u: string): string;
}
export function methodBivariance(evil: string): string {
  const r: Runner = { run: sink }; // !! sink-widened
  return r.run(evil);
}
export function sinkToAny(evil: string): unknown {
  const f: any = sink; // !! sink-widened
  return f(evil);
}
export function sinkCast(evil: string): string {
  return (sink as (u: string) => string)(evil); // !! sink-widened
}
export function sinkBorrowed(s: string): string {
  return sink.call(undefined, JSON.parse(s)); // !! sink-widened
}
export function sinkHolder(evil: string): unknown {
  const holder = { sink };
  const loose = holder as unknown; // !! sink-widened
  return [loose, evil];
}

// ── 印を入れた入れ物を、印の無い型の書き換えられる入れ物として渡す ───────

function fill(ys: string[], evil: string): void {
  ys.push(evil);
}
function joinAll(xs: readonly string[]): string {
  return xs.join(',');
}
export function covariance(evil: string): string | null {
  const good = externalUrlOrNull('https://example.com/');
  if (good === null) return null;
  const xs: VettedExternalUrl[] = [good];
  fill(xs, evil); // !! container-widened
  const u = xs[1];
  return u === undefined ? null : sink(u);
}
export function fieldWidened(b: Box, evil: string): string {
  const loose: { u: string } = b; // !! container-widened
  loose.u = evil;
  return sink(b.u);
}
export function overwritten(b: Box, evil: string): string {
  Object.assign(b, { u: evil }); // !! container-widened
  return sink(b.u);
}
export function intercepted(b: Box, evil: string): string {
  const p = new Proxy(b, { get: () => evil }); // !! container-widened
  return sink(p.u);
}
export function readOnlyView(us: readonly VettedExternalUrl[]): string {
  return joinAll(us); // ok
}
export function readOnlyField(b: Box): string {
  const view: Readonly<{ u: string }> = b; // ok
  return view.u;
}
export function copied(b: Box, us: VettedExternalUrl[]): number {
  const text: { u: string } = { ...b }; // ok
  const list: string[] = [...us]; // ok
  return text.u.length + list.length;
}

// ── 通ってよい形 ─────────────────────────────────────────────────────────

export function gated(raw: string): string | null {
  const u = externalUrlOrNull(raw); // ok
  return u === null ? null : sink(u); // ok
}
export function widenToText(u: VettedExternalUrl): string {
  const text: string = u; // ok
  return text;
}
export function unknownStays(s: string): unknown {
  const v: unknown = JSON.parse(s); // ok
  return v;
}
