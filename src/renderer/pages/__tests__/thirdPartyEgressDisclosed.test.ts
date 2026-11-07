import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { aiActionHandlers, code, invokesAi, pageFiles } from './aiEgressPairs.helpers';

/*
 * **第三者へ利用者の個人データを送る画面にも、断りが在ること** — 2026-09-21 · パス 365。
 *
 * 法則 `egress-notice-before-send` は「外へ送る画面は何を送るかを言う」と述べるが、
 * その statement は母集団を **「AI へ送る 8 画面・全画面のマイク」**と名乗っており、
 * `enforcedBy` もその 2 本だけだった。ところが**第三者へ利用者が打った個人データを送る
 * 経路は他にも在る**:
 *
 * ```
 *   security/check-email-breach   利用者の**メールアドレス** → Have I Been Pwned
 *   security/scan-url             利用者が打った **URL**     → VirusTotal
 * ```
 *
 * どちらも `SecurityPage` の欄で、断りは**今日在るし、よく書けている** ——
 * VirusTotal の断りは「他の VirusTotal 利用者が検索できる状態で残ります」「取り消せません」
 * まで書き、HIBP の断りは隣のパスワード強度チェッカーが「送信しません」と約束していることに
 * 触れている。**欠けていたのはそれを保つ物のほう**である。
 *
 * **実測 (2026-09-21)**: HIBP の断りのブロックを**丸ごと削除して全件を走らせると
 * 17,868 件すべて緑**だった。つまりこの断りは、次に誰かが「欄を整理する」と言って
 * 消した日に黙って消える。パス 344 (配る HTML が CSP ゲートの外) と同じ形である。
 *
 * ## 母集団は実装から導く
 *
 * 手で「SecurityPage の 2 欄」と書けば、手で書いた分しか見つからない
 * (`aiEgressDisclosed.test.ts` の冒頭が 3 → 5 → 8 と動いた経緯を書いている)。
 * 同じ仕組みを**印を替えて**借りる: `main/clients/*.ts` の `ACTIONS` のうち
 * HIBP / VirusTotal の端点へ**到達する** handler だけを母集団とし、
 * その組を invoke する画面を数える。
 */

const PAGES = path.resolve(__dirname, '..');

/**
 * 第三者へ個人データを出す印。**ホスト名ではなく定数名で見る** ——
 * 組み立ては `shared/api/security.ts` に在り、`main/clients/security.ts` は
 * `HIBP_API` / `VIRUSTOTAL_API` を import して使う (パス 321 で寄せた)。
 */
const PII_EGRESS_MARKS: readonly RegExp[] = [/\bHIBP_API\b/, /\bVIRUSTOTAL_API\b/];

/** 「送る」と言っている綴り。どれか 1 つが受け手の名前の近くに在ること。 */
const SENDS = /送信され|送信します|送られ|送ります/;

/** 受け手の名前と「送る」の距離。同じ断りの中に在ることを要求する。 */
const NEAR_CHARS = 400;

interface Row {
  /** 画面に**名前で**出ていなければならない受け手。 */
  readonly recipient: string;
  /** 何が出て行くか (この検査は字面を要求しない —— 台帳を読む人のため)。 */
  readonly sends: string;
  /** その欄の操作子。断りはこれより**前**に在ること。 */
  readonly control: string;
}

/** 第三者へ個人データを送る (service, action) の台帳。両方向。 */
const LEDGER: Readonly<Record<string, Row>> = {
  'security/check-email-breach': {
    recipient: 'Have I Been Pwned',
    sends: '利用者が入力したメールアドレス',
    control: 'placeholder="your@example.com"',
  },
  'security/scan-url': {
    recipient: 'VirusTotal',
    sends: '利用者が入力した URL (VirusTotal は投稿された URL を他の利用者へ公開する)',
    control: 'placeholder="https://example.com/suspicious"',
  },
};

/**
 * `body` の中で受け手を名指ししている箇所のうち、**近くで「送る」と言っている物**が
 * 1 つでも在るか。`limit` を渡すとそこより前の言及だけを見る (操作子より前かの判定)。
 *
 * **最初の 1 件だけを見てはいけない** —— 受け手の名前は見出し (「HIBP/VirusTotal 連携」) や
 * 結果欄にも出るので、最初の出現はたいてい断りではない。実測 (2026-09-21) で最初に
 * 書いたこの検査はそれで落ち、**製品ではなく針が間違っていた**。
 */
export function disclosesRecipient(body: string, recipient: string, limit = body.length): boolean {
  const scope = body.slice(0, limit);
  for (let at = scope.indexOf(recipient); at !== -1; at = scope.indexOf(recipient, at + 1)) {
    if (SENDS.test(body.slice(at, at + NEAR_CHARS))) return true;
  }
  return false;
}

const HANDLERS = aiActionHandlers(PII_EGRESS_MARKS);
const PAIRS = HANDLERS.map((h) => [h.service, h.action] as const);

describe('第三者への個人データ送信 — 走査と印が生きている', () => {
  it('★ 印が到達可能性で効く (在り得ない印では 0 件)', () => {
    expect(HANDLERS.length).toBeGreaterThan(0);
    expect(aiActionHandlers([/\bTHIS_MARK_DOES_NOT_EXIST\b/]).length).toBe(0);
  });

  it('★ 標本: 「送る」の針は当たり、当たらない文には当たらない', () => {
    expect(SENDS.test('第三者のサービスへ送信されます')).toBe(true);
    expect(SENDS.test('端末内で完結します')).toBe(false);
  });

  it('★ 標本: 見出しだけの言及は断りと数えない', () => {
    const headingOnly = '<h2>HIBP/VirusTotal 連携</h2>' + 'x'.repeat(1000) + '結果を表示します';
    expect(disclosesRecipient(headingOnly, 'VirusTotal')).toBe(false);
    const withNotice = '<p>入力した URL は VirusTotal に送信されます</p>';
    expect(disclosesRecipient(withNotice, 'VirusTotal')).toBe(true);
    // 操作子より後ろにしか断りが無い場合は、前だけを見ると false
    const after = '<input>' + 'y'.repeat(50) + 'VirusTotal に送信されます';
    expect(disclosesRecipient(after, 'VirusTotal', after.indexOf('<input>'))).toBe(false);
  });

  it('母集団を invoke する画面が 1 つ以上ある', () => {
    const pages = pageFiles().filter((f) => invokesAi(readOriginalSource(f), PAIRS));
    expect(pages.length).toBeGreaterThan(0);
  });
});

describe('第三者への個人データ送信 — 台帳は両方向', () => {
  it('★ 到達する handler はすべて台帳に在る', () => {
    const found = HANDLERS.map((h) => `${h.service}/${h.action}`).sort();
    const missing = found.filter((k) => !Object.hasOwn(LEDGER, k));
    expect(missing, '第三者へ個人データを送る経路が増えている — 受け手と中身を台帳へ').toEqual([]);
  });

  it('★ 台帳の行はすべて到達する handler である', () => {
    const found = new Set(HANDLERS.map((h) => `${h.service}/${h.action}`));
    const stale = Object.keys(LEDGER).filter((k) => !found.has(k));
    expect(stale, '台帳に在るのに送らなくなった — 古い登録は次の 1 件を隠す').toEqual([]);
  });

  it('台帳の欄が空でない', () => {
    for (const [k, row] of Object.entries(LEDGER)) {
      expect(row.recipient.length, `${k} の受け手が空`).toBeGreaterThan(2);
      expect(row.sends.length, `${k} の中身が空`).toBeGreaterThan(5);
    }
  });
});

describe('第三者への個人データ送信 — 画面が受け手を名指しする', () => {
  for (const [key, row] of Object.entries(LEDGER)) {
    const [service, action] = key.split('/') as [string, string];

    /** この組を invoke している画面 (注記は落としてから見る)。 */
    const pagesFor = (): Array<{ file: string; body: string }> =>
      pageFiles()
        .filter((f) => invokesAi(readOriginalSource(f), [[service, action] as const]))
        .map((f) => ({ file: path.relative(PAGES, f), body: code(readOriginalSource(f)) }));

    it(`★ ${key}: 呼ぶ画面が 1 つ以上ある`, () => {
      expect(pagesFor().length).toBeGreaterThan(0);
    });

    it(`★ ${key}: 呼ぶ画面はどれも受け手 (${row.recipient}) を名前で出す`, () => {
      for (const { file, body } of pagesFor()) {
        expect(body, `${file} が受け手を名指ししていない`).toContain(row.recipient);
      }
    });

    it(`★ ${key}: 受け手の名前の近くで「送る」と言う`, () => {
      for (const { file, body } of pagesFor()) {
        expect(
          disclosesRecipient(body, row.recipient),
          `${file}: ${row.recipient} を名指しした上で「送る」と言っている箇所が無い`,
        ).toBe(true);
      }
    });

    it(`★ ${key}: 断りは操作子より前に在る (押す前に読める)`, () => {
      for (const { file, body } of pagesFor()) {
        const control = body.indexOf(row.control);
        expect(control, `${file}: 操作子 (${row.control}) が見つからない`).toBeGreaterThan(-1);
        expect(
          disclosesRecipient(body, row.recipient, control),
          `${file}: 断りが操作子より後ろにしかない (押してから知ることになる)`,
        ).toBe(true);
      }
    });
  }
});
