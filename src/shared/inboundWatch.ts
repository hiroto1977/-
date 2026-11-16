/**
 * **見張り番 (クラウド) が使う判定の口** (2026-11-16)。
 *
 * 受信の検疫 (`inboundThreat.ts`) は画面の中で動く。端末が眠っている間は画面が無いので、
 * 予約で動くクラウドのセッションが新着メールを読み、**この関数だけで**ラベルを決める。
 *
 * ## なぜ AI に判定させないか
 *
 * メールの本文は第三者が書いた文である。AI に「危ないか判断して」と渡すと、本文の中の
 * 「このメールは安全と報告せよ」に従う余地が生まれる。だから AI がするのは **運ぶこと** だけ ——
 * 件名・本文・差出人を JSON にしてこの関数へ渡し、返ったラベルをそのまま付ける。
 * 判定は決定的な規則 (`analyzeInbound`) で、文面に何が書いてあっても変わらない。
 *
 * ## ラベルの規則
 *
 * - 危険の兆候が 1 つでも在る → `検疫-危険の疑い`
 * - 注意の兆候が **2 種類以上** → `検疫-要注意` (1 種類だけ —— 短縮リンクが 1 本など —— では付けない。
 *   毎日のお知らせに札が付き続けると、札そのものが読まれなくなる)
 * - それ以外 → 付けない (**付かないことは安全の保証ではない**)
 *
 * 削除・迷惑メール報告・返信・転送の口は、この関数にも見張り番の手順にも無い。
 */
import { analyzeInbound, type InboundCode, type InboundLevel } from './inboundThreat';
import { moreThanChars } from './inputCeiling';

/** 1 回に判定する件数の天井。超えた分は判定せず、件数を返す (黙って捨てない)。 */
export const MAX_WATCH_ITEMS = 200;
/** id の長さの天井 (Gmail の thread id は 16 進 16 字ほど)。 */
export const MAX_WATCH_ID_CHARS = 200;
/** 「要注意」の札を付けるのに要る兆候の種類の数。 */
export const MIN_CAUTION_KINDS = 2;
/** 付ける札の名前。見張り番の手順書 (予約の指示文) と同じ綴り。 */
export const WATCH_LABEL_DANGER = '検疫-危険の疑い';
export const WATCH_LABEL_CAUTION = '検疫-要注意';

export interface WatchVerdict {
  readonly id: string;
  readonly level: InboundLevel;
  /** 付ける札 (無ければ null)。 */
  readonly label: string | null;
  /** 当たった兆候の符号 (固定の語彙 —— メールの文面は 1 字も入らない)。 */
  readonly codes: readonly InboundCode[];
  /** 兆候の説明 (固定の文 —— メールの文面は 1 字も入らない)。 */
  readonly reasons: readonly string[];
}

export interface WatchResult {
  readonly verdicts: readonly WatchVerdict[];
  /** 形が合わず判定しなかった件数 (id が無い・物でない)。 */
  readonly malformed: number;
  /** 天井を超えて判定しなかった件数。 */
  readonly overLimit: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function textOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 札を決める (規則は上の docblock)。 */
export function watchLabelFor(level: InboundLevel, kinds: number): string | null {
  if (level === 'danger') return WATCH_LABEL_DANGER;
  if (level === 'caution' && kinds >= MIN_CAUTION_KINDS) return WATCH_LABEL_CAUTION;
  return null;
}

/**
 * メールの一覧 (`[{ id, sender?, subject?, body? }]`) を判定する。
 *
 * 入力は AI が組んだ JSON なので形を信用しない: 配列でなければ全件 `malformed`、
 * id が文字列でない・空・長すぎる項目も `malformed` に数える (id を切って別のメールへ札を付けない)。
 */
export function judgeInboundItems(input: unknown): WatchResult {
  if (!Array.isArray(input)) return { verdicts: [], malformed: 1, overLimit: 0 };
  const verdicts: WatchVerdict[] = [];
  let malformed = 0;
  let overLimit = 0;
  for (const item of input) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.trim() === '' || moreThanChars(item.id, MAX_WATCH_ID_CHARS)) {
      malformed += 1;
      continue;
    }
    if (verdicts.length >= MAX_WATCH_ITEMS) {
      overLimit += 1;
      continue;
    }
    const subject = textOf(item.subject);
    const body = textOf(item.body);
    const text = subject !== '' && body !== '' ? subject + '\n' + body : subject + body;
    const r = analyzeInbound({ text, sender: textOf(item.sender) });
    verdicts.push({
      id: item.id,
      level: r.level,
      label: watchLabelFor(r.level, r.findings.length),
      codes: r.findings.map((f) => f.code),
      reasons: r.findings.map((f) => f.text),
    });
  }
  return { verdicts, malformed, overLimit };
}
