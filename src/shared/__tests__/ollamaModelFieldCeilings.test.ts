/**
 * **モデル一覧の欄は、型だけでなく大きさも検める。** (2026-09-22 · パス 408)
 *
 * パス 407 は「`/api/tags` を読む口を 1 つにする」を直し、main も
 * `normalizeModels` を通るようにした。その 1 つの口を読み直すと、
 * **検めていたのは型だけ**だった ——
 *
 * ```
 *   name                → isSafeModelName の正規表現が 128 字で切る (行ごと落とす)
 *   family              → typeof だけ・長さは見ない      ← 天井なし
 *   parameter_size      → 同                              ← 天井なし
 *   quantization_level  → 同                              ← 天井なし
 *   modified_at         → 同 (生の文字列をそのまま画面へ) ← 天井なし
 *   size                → Number.isFinite だけ (負も通る) ← 下限なし
 * ```
 *
 * 実測 (2026-09-22 · 直す前): 1 件の 4 欄に 200,000 字を入れると
 * **`OllamaPage` の meta 行が 800,038 字**になり、`size: -1e300` は
 * **`-9.5367431640625e+293 MB`** を画面に刷った。応答の上限は
 * `MAX_OLLAMA_RESPONSE_BYTES` (2 MiB) なので、**1 件で ~2 MB が 1 行に載る**。
 *
 * **相手は「利用者が設定した Ollama ホスト」** である —— `isAllowedOllamaBase` は
 * ループバックのほか**頁と同じホスト**と任意の https を通す。`isSafeModelName` が
 * そもそも在る理由がそれで、**その理由は隣の 4 欄にも等しく当てはまる**
 * (パス 398 と同じ非対称: 隣が検めているのに 1 つだけ前提を持たない)。
 *
 * ## この検査が受け持つ範囲
 *
 * 背骨は**振る舞い** —— `normalizeModels` を実際に呼んで、境界のちょうど・+1・
 * 桁違いの 3 点を見る。綴りの走査は「**7 つ目の欄が足された日に鳴る**」ための網で、
 * 母集団は `OllamaModelInfo` の宣言から導く (欄を並べて書くと、次に足された欄が黙る)。
 * 画面に出るかは `renderer/pages/__tests__/ollamaModelMetaOnScreen.test.ts` が見る
 * (法則 `user-facing-claim-held-at-render`)。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_OLLAMA_MODEL_DETAIL_CHARS, normalizeModels } from '../ollama';
import { localIsoDate } from '../localDate';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC = readOriginalSource(path.join(REPO_ROOT, 'src/shared/ollama.ts'));

/** 1 件だけの応答を組む (欄は呼び手が差し替える)。 */
function one(details: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return normalizeModels({
    models: [{ name: 'llama3:8b', size: 1024 * 1024, modified_at: '2026-07-01T12:00:00Z', details, ...extra }],
  })[0]!;
}

const OK_DETAILS = { family: 'llama', parameter_size: '8B', quantization_level: 'Q4_K_M' };

describe('モデル一覧の欄の天井 (パス 408)', () => {
  it('★ 正常な応答の答えは 1 つも変わらない', () => {
    const m = one(OK_DETAILS);
    expect(m).toEqual({
      name: 'llama3:8b',
      family: 'llama',
      parameterSize: '8B',
      quantization: 'Q4_K_M',
      sizeMb: 1,
      modifiedAt: localIsoDate(new Date(Date.parse('2026-07-01T12:00:00Z'))),
    });
  });

  it('★ 天井ちょうどは通し、+1 は切って「…」で述べる (両向きの境界)', () => {
    const atCap = 'x'.repeat(MAX_OLLAMA_MODEL_DETAIL_CHARS);
    const overCap = 'x'.repeat(MAX_OLLAMA_MODEL_DETAIL_CHARS + 1);
    expect(one({ ...OK_DETAILS, family: atCap }).family).toBe(atCap);
    const cut = one({ ...OK_DETAILS, family: overCap }).family;
    expect(cut).toBe(atCap + '…');
    // **切ったことを述べる** —— 黙って切ると「この Ollama はこういう値を返す」と読まれる。
    expect(cut.endsWith('…')).toBe(true);
  });

  it('★ 3 つの欄すべてに掛かる (1 つだけ直して満足しない)', () => {
    const big = 'x'.repeat(200_000);
    const m = one({ family: big, parameter_size: big, quantization_level: big });
    for (const [label, v] of [
      ['family', m.family],
      ['parameterSize', m.parameterSize],
      ['quantization', m.quantization],
    ] as const) {
      expect([...v].length, label).toBe(MAX_OLLAMA_MODEL_DETAIL_CHARS + 1);
    }
  });

  it('★ 文字境界で切る (サロゲート対を割って孤立サロゲートを残さない)', () => {
    // 1 文字 = 2 コード単位の絵文字を天井ちょうど + 1 個。
    const emoji = '😀'.repeat(MAX_OLLAMA_MODEL_DETAIL_CHARS + 1);
    const cut = one({ ...OK_DETAILS, family: emoji }).family;
    expect([...cut].length).toBe(MAX_OLLAMA_MODEL_DETAIL_CHARS + 1); // 64 文字 + …
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(cut)).toBe(false);
  });

  it('非文字列は — / 空文字はそのまま (今日の振る舞いを変えない)', () => {
    const m = one({ family: 42, parameter_size: null, quantization_level: {} });
    expect([m.family, m.parameterSize, m.quantization]).toEqual(['—', '—', '—']);
    expect(one({ ...OK_DETAILS, family: '' }).family).toBe('');
  });

  it('★ 対照: 天井が無ければ 200,000 字がそのまま出る (この検査が的に当たる)', () => {
    // 製品は直したので再現できない。同じ長さの値を素で持つと何が起きるかを、
    // **算術で**示す (パス 398 と同じ形)。
    const big = 'x'.repeat(200_000);
    const rawMeta = `${big} · ${big} · ${big} · 1 MB · 更新 ${big}`;
    // 4 欄 × 200,000 + 区切り (" · " × 4 = 12) + "1 MB" (4) + "更新 " (3)。
    expect(rawMeta.length).toBe(800_019);
    // ★ 2026-09-22 の probe が測った 800,038 はこれより 19 字多い ——
    //   あちらは `size: 1e300` も同時に入れており、`sizeMb` が "1" ではなく
    //   **"9.5367431640625e+293" (20 字)** だったため。数を写すのではなく、
    //   **この検査の中で組んだ物を数える** (写すと次に実物が変わったとき嘘になる)。
    expect(`${big} · ${big} · ${big} · 9.5367431640625e+293 MB · 更新 ${big}`.length).toBe(800_038);
    const m = one({ family: big, parameter_size: big, quantization_level: big });
    const capped = `${m.family} · ${m.parameterSize} · ${m.quantization} · ${m.sizeMb} MB · 更新 ${m.modifiedAt}`;
    expect(capped.length).toBeLessThan(300);
  });
});

describe('更新日 (パス 408)', () => {
  it('★ 読めない日付は null —— 空文字と混ぜない', () => {
    expect(one(OK_DETAILS, { modified_at: 'x'.repeat(20) }).modifiedAt).toBeNull();
    expect(one(OK_DETAILS, { modified_at: '' }).modifiedAt).toBeNull();
    expect(one(OK_DETAILS, { modified_at: undefined }).modifiedAt).toBeNull();
  });

  it('★ 数は epoch ミリ秒として読まない (1970-01-01 の捏造を作らない)', () => {
    // parseTimestamp は数を epoch ms として受けるので、typeof を先に置かないと
    // `modified_at: 20260922` が **1970-01-01** になる (でっち上げ)。
    const m = one(OK_DETAILS, { modified_at: 20260922 });
    expect(m.modifiedAt).toBeNull();
    expect(String(m.modifiedAt)).not.toContain('1970');
  });

  it('★ 実物の Ollama が返す形 (ナノ秒 + 時差) を読む', () => {
    const raw = '2023-11-04T14:56:49.277302595-07:00';
    expect(one(OK_DETAILS, { modified_at: raw }).modifiedAt).toBe(
      localIsoDate(new Date(Date.parse(raw))),
    );
    expect(one(OK_DETAILS, { modified_at: raw }).modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('★ 生の文字列を画面へ通さない (build をまたいで同じ形になる)', () => {
    const m = one(OK_DETAILS, { modified_at: '2026-07-01T12:00:00.277302595Z' });
    expect(m.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(m.modifiedAt).not.toContain('T');
  });
});

describe('大きさ (パス 408)', () => {
  it('★ 負は読めない値として 0 に倒す (ファイルに負の大きさは無い)', () => {
    expect(one(OK_DETAILS, { size: -1e300 }).sizeMb).toBe(0);
    expect(one(OK_DETAILS, { size: -1 }).sizeMb).toBe(0);
  });

  it('0 と非有限は今までどおり 0 (振る舞いを変えていない)', () => {
    expect(one(OK_DETAILS, { size: 0 }).sizeMb).toBe(0);
    expect(one(OK_DETAILS, { size: '1MB' }).sizeMb).toBe(0);
    expect(one(OK_DETAILS, { size: Infinity }).sizeMb).toBe(0);
  });

  it('★ 桁違いの正の値は**そのまま出す** (測って、直さないと決めた)', () => {
    /*
     * `1e300` は有限で非負なので「読めた大きさ」である。0 へ倒すと
     * **「0 MB のモデル」という嘘**になり、壊れていることが画面から消える ——
     * `9.5367431640625e+293 MB` は誰の目にも壊れて見えるので、そちらが正直である。
     * 長さも 25 字以下なので、この検査の主題 (行が膨らむ) には当たらない。
     */
    const mb = one(OK_DETAILS, { size: 1e300 }).sizeMb;
    expect(mb).toBeGreaterThan(1e290);
    expect(String(mb).length).toBeLessThan(30);
  });
});

describe('母集団 (宣言から導く・両方向)', () => {
  /** `OllamaModelInfo` の宣言から欄名を取る (欄を並べて書かない)。 */
  function declaredFields(): string[] {
    const m = /export interface OllamaModelInfo \{([\s\S]*?)\n\}/.exec(SRC);
    expect(m, 'OllamaModelInfo の宣言が読めない').not.toBeNull();
    const body = stripComments(m![1]!);
    return [...body.matchAll(/^\s*(\w+)\s*:/gm)].map((x) => x[1]!);
  }

  it('宣言が読めて、欄が 6 つ在る (走査が空虚でない床)', () => {
    expect(declaredFields()).toEqual([
      'name',
      'family',
      'parameterSize',
      'quantization',
      'sizeMb',
      'modifiedAt',
    ]);
  });

  it('★ 相手が名乗る文字列の欄は、すべて関門を通る (7 つ目が足されたら鳴る)', () => {
    const body = /export function normalizeModels\(raw: unknown\)[\s\S]*?\n\}/.exec(SRC)![0];
    // 出力の各欄がどの関門を通るか。`name` は isSafeModelName (行ごと落とす) が受け持つ。
    const GATE: Record<string, RegExp> = {
      name: /name: m\.name,/,
      family: /family: modelDetail\(/,
      parameterSize: /parameterSize: modelDetail\(/,
      quantization: /quantization: modelDetail\(/,
      sizeMb: /sizeMb: Math\.round\(size \/ /,
      // パス 410 で私有の `modelModifiedAt` を消し、共有の `displayDateOf`
      // (`typeof` → `parseTimestamp` → `localIsoDate`) へ寄せた。判定は同じ 1 つ。
      modifiedAt: /modifiedAt: displayDateOf\(/,
    };
    for (const f of declaredFields()) {
      expect(GATE[f], `欄 ${f} の関門が台帳に無い —— 足したなら、どの関門を通るかをここへ書く`).toBeDefined();
      expect(body, `欄 ${f} が関門を通っていない`).toMatch(GATE[f]!);
    }
    // 逆向き: 台帳に在るのに宣言から消えた欄は残さない。
    for (const f of Object.keys(GATE)) expect(declaredFields(), `台帳の ${f} が宣言に無い`).toContain(f);
  });

  it('★ 名前の天井 (128) は行ごと落とす —— 隣の 4 欄と方針が違うことを留める', () => {
    const long = 'a'.repeat(129);
    expect(normalizeModels({ models: [{ name: long }, { name: 'ok' }] }).map((m) => m.name)).toEqual(['ok']);
  });
});
