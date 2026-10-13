'use strict';

/**
 * **JSON Schema の部分集合を検める** (2026-09-26 · パス 484)。
 *
 * `orchestration/registry.schema.json` は `registry.json` の形を宣言しているが、
 * 2026-09-26 まで**その宣言を読む物が 1 つも無かった** —— 門
 * (`verify-orchestration.cjs`) の冒頭は「1. JSON は registry.schema.json の
 * 必須構造を満たす (簡易チェック)」と書きながら、実際に見ていたのは最上位の
 * 必須キーと、門が自分で書いた個々の不変条件だけだった。
 *
 * 実測 (2026-09-26 · 宣言された制約を 1 つずつ実物の写しで破って門を走らせる):
 *
 * | | 件数 |
 * | --- | ---: |
 * | 宣言された制約 | 153 |
 * | 門が鳴る | 85 |
 * | **門が素通りさせる** | **67** |
 * | 写しでは測れない (最上位の `type` —— 台帳を配列にすると必須キーの検査が先に鳴る) | 1 |
 *
 * 素通りした中に**製品が読む欄**が在る —— チームの `domain` が無い / 数である、
 * 役員・秘書室の `title` が無い台帳では村のディスパッチ計画 (`villageData`) が
 * 投げ、チャットの話題の振り分け (`chatOrg.routeTopic`) も投げる。`active: "false"`
 * (文字列) は真として数えられて**止めたチームが村に居続け**、backlog の
 * `status` の綴り違い (`designd`) は dispatch から黙って外れて村では完了の色で
 * 塗られる。どれも `exit 0` だった。
 *
 * ## なぜ依存を足さずに自前で持つか
 *
 * `lint:deps` は本番依存の閉包と、インストール時にコードを走らせる依存を
 * 台帳制にしている。検証器 1 つのために ajv (と推移依存) を足すより、
 * **宣言が実際に使っているキーワードだけ**を持つ方が小さく、読めて、測れる。
 *
 * ## 失敗は閉じる向きへ
 *
 * **知らないキーワードは問題として返す** (`schema: 未対応のキーワード "format"`)。
 * 黙って読み飛ばすと、宣言に足した制約が**門に届かないまま**「宣言してある」ことになる
 * —— 2026-09-26 まで台帳全体がその形だった。部分集合を広げるときは、ここに足して
 * 振る舞いの検査 (`registrySchemaEnforced.test.ts`) を足す。
 *
 * ## 数え方
 *
 * - `minLength` / `maxLength` は**文字** (コードポイント) で数える —— JSON Schema の
 *   定義 (RFC 8259 の文字) とこのリポジトリの規約 (パス 252 / 422) が同じ答えを出す。
 *   `.length` (UTF-16 の単位) で数えると、絵文字 1 字を 2 字と数えて自分の宣言と食い違う。
 * - 鍵は `Object.hasOwn` で見る —— `properties` に `constructor` を宣言していないのに
 *   `'constructor' in properties` が真になる形を作らない (`shared/lookup.ts` と同じ理由)。
 */

/** 注記だけのキーワード (値を検めない)。 */
const { printable } = require('./untrusted-text.cjs');

const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description']);

/** 検めるキーワード。**ここに無いキーワードは宣言されても問題として返す。** */
const SUPPORTED = new Set([
  'type',
  'required',
  'properties',
  'items',
  'additionalProperties',
  'enum',
  'pattern',
  'minimum',
  'minItems',
  'minLength',
  'maxLength',
]);

const TYPE_NAMES = new Set(['string', 'integer', 'number', 'boolean', 'array', 'object', 'null']);

/** JSON の値の型名 (`integer` は整数の number)。 */
function jsonTypeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(want, v) {
  const got = jsonTypeOf(v);
  if (want === 'number') return got === 'number' || got === 'integer';
  return want === got;
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const chars = (s) => [...s].length;

/**
 * `value` を `schema` で検め、問題を 1 件ずつ JSON パスつきで返す (空なら適合)。
 *
 * 型が合わない所ではその下を見ない —— 形の違う値の子を歩くと、同じ 1 つの誤りから
 * 意味の無い問題が何十件も出て、どれが原因か読めなくなる。
 *
 * @param {unknown} schema
 * @param {unknown} value
 * @param {string} [where]
 * @returns {string[]}
 */
function validateAgainstSchema(schema, value, where = '$') {
  const problems = [];
  walk(schema, value, where, problems);
  return problems;
}

function walk(schema, value, where, out) {
  if (!isPlainObject(schema)) {
    out.push(`schema: ${where} の宣言が object ではありません`);
    return;
  }
  for (const k of Object.keys(schema)) {
    if (!ANNOTATIONS.has(k) && !SUPPORTED.has(k)) out.push(`schema: ${where} に未対応のキーワード "${k}" (検めずに通すことはしません)`);
  }
  /** 数を取るキーワードの値。数でなければ宣言の誤りとして返し、その制約は見ない。 */
  const numKw = (k) => {
    if (!Object.hasOwn(schema, k)) return null;
    const n = schema[k];
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    out.push(`schema: ${where} の ${k} ${JSON.stringify(n)} は数ではありません`);
    return null;
  };

  if (Object.hasOwn(schema, 'type')) {
    const t = schema.type;
    if (typeof t !== 'string' || !TYPE_NAMES.has(t)) {
      out.push(`schema: ${where} の type ${JSON.stringify(t)} は未対応です (型名 1 つだけを受けます)`);
      return;
    }
    if (!typeMatches(t, value)) {
      out.push(`${where}: ${t} であるべきところが ${jsonTypeOf(value)} (${preview(value)})`);
      return;
    }
  }

  if (Object.hasOwn(schema, 'enum')) {
    const e = schema.enum;
    if (!Array.isArray(e) || !e.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
      out.push(`schema: ${where} の enum はスカラーの配列であること`);
    } else if (!e.includes(value)) {
      out.push(`${where}: ${preview(value)} は ${JSON.stringify(e)} のどれでもありません`);
    }
  }

  const minLength = numKw('minLength');
  const maxLength = numKw('maxLength');
  if (typeof value === 'string') {
    if (Object.hasOwn(schema, 'pattern')) {
      let re = null;
      try {
        re = new RegExp(schema.pattern, 'u');
      } catch {
        out.push(`schema: ${where} の pattern ${JSON.stringify(schema.pattern)} を正規表現として読めません`);
      }
      if (re && !re.test(value)) out.push(`${where}: ${preview(value)} は ${schema.pattern} に合いません`);
    }
    if (minLength !== null && chars(value) < minLength) {
      out.push(`${where}: ${chars(value)} 文字 (${minLength} 文字以上であること)`);
    }
    if (maxLength !== null && chars(value) > maxLength) {
      out.push(`${where}: ${chars(value)} 文字 (${maxLength} 文字までであること)`);
    }
  }

  const minimum = numKw('minimum');
  if (typeof value === 'number' && minimum !== null && value < minimum) {
    out.push(`${where}: ${value} (${minimum} 以上であること)`);
  }

  const minItems = numKw('minItems');
  if (Array.isArray(value)) {
    if (minItems !== null && value.length < minItems) {
      out.push(`${where}: ${value.length} 件 (${minItems} 件以上であること)`);
    }
    if (Object.hasOwn(schema, 'items')) {
      if (!isPlainObject(schema.items)) {
        out.push(`schema: ${where} の items は 1 つの宣言 (object) であること (組の配列は未対応)`);
      } else {
        value.forEach((x, i) => walk(schema.items, x, `${where}[${i}]`, out));
      }
    }
  }

  if (Object.hasOwn(schema, 'required') && !(Array.isArray(schema.required) && schema.required.every((k) => typeof k === 'string'))) {
    out.push(`schema: ${where} の required は文字列の配列であること`);
  }
  if (isPlainObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const k of schema.required) {
        if (typeof k === 'string' && !Object.hasOwn(value, k)) out.push(`${where}: 必須の "${k}" がありません`);
      }
    }
    const props = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [k, sub] of Object.entries(props)) {
      if (Object.hasOwn(value, k)) walk(sub, value[k], `${where}.${k}`, out);
    }
    if (Object.hasOwn(schema, 'additionalProperties')) {
      const ap = schema.additionalProperties;
      for (const [k, v] of Object.entries(value)) {
        if (Object.hasOwn(props, k)) continue;
        if (ap === false) out.push(`${where}: 宣言に無い "${k}" があります`);
        else if (isPlainObject(ap)) walk(ap, v, `${where}.${k}`, out);
        else if (ap !== true) out.push(`schema: ${where} の additionalProperties は boolean か 1 つの宣言であること`);
      }
    }
  }
}

/**
 * 問題文に載せる値の短い写し (長い値で文が膨らまないように)。
 *
 * **危ない字は見える形へ** —— 問題文は端末と CI のログへ刷られる。`JSON.stringify` は
 * C0 を `\u001b` に逃がすが、双方向制御 (RLO) や不可視文字は素のまま出すので、
 * 門が「この題名は RLO を含む」と断る文そのものが表示を反転させてしまう。
 */
function preview(v) {
  const cs = [...printable(JSON.stringify(v) ?? String(v))];
  return cs.length > 60 ? `${cs.slice(0, 57).join('')}…` : cs.join('');
}

module.exports = { validateAgainstSchema, SUPPORTED_KEYWORDS: SUPPORTED, ANNOTATION_KEYWORDS: ANNOTATIONS };
