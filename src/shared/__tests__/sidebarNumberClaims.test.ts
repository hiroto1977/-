/**
 * **サイドバーの説明が名乗る数を、実物と突き合わせる** (2026-09-12 · パス 163)。
 *
 * ## 実測した欠陥 — 73 件のうち 17 件が数を名乗り、3 件がずれていた
 *
 * | 画面 | 名乗っていた | 実測 |
 * | --- | --- | --- |
 * | 書類スタジオ | 45 書式 | **52** (`STUDIO_TEMPLATES.length` —— 画面自身は「経営書類（52種）」と刷っている) |
 * | KPI | 8 指標 | **11** (`SNAPSHOT.kpi.aggregate.kpi` の欄) |
 * | Ollama | 「127.0.0.1 固定」 | デスクトップは固定だが**ブラウザ版は 3 経路** (ループバック / ページと同じホスト / 任意の https) |
 *
 * 書式と指標は**後から増えた**もので、増やした人はサイドバーの散文を知らない ——
 * このリポジトリが何度も書いている「**数を 2 か所に書くと必ず食い違う**」そのもの。
 * Ollama のほうはより重い: **同じ誤りをパス 138 が `SECURITY_AUDIT.md` で直している**
 * (「ブラウザ版は 3 経路」と書き換えた)。**サイドバーの写しだけが残っていた**
 * —— 利用者が最初に読む面で、しかも接続先という安全に関わる主張である。
 *
 * ## 台帳の形
 *
 * `services.ts` の説明に**数字が 1 つでも在れば、ここに行が要る**。行は 2 種類:
 *
 * - `measure` を持つ行 … その数を実物から測り、説明の中の値と一致することを見る
 * - `why` だけの行 …… 製品名・番地・API の版・言い回し (「ボタン 1 つで」)。
 *   **なぜ測らないかを書く** (書かないと「測れないから外した」と区別できない)
 *
 * **双方向に見る**: 数字を持つ説明が台帳に無ければ落ち、台帳の行に対応する
 * 説明が無ければ落ちる (id を変えた・説明から数字が消えた場合)。
 */
import { describe, expect, it } from 'vitest';
import { SERVICES } from '../../renderer/services';
import { SNAPSHOT } from '../../renderer/data/snapshot';
import { STUDIO_TEMPLATES } from '../../renderer/data/docStudioData';
import { MAX_BYTES, MAX_ITEMS } from '../../renderer/library/library';
import { BUSINESS_CATEGORY_IDS } from '../businessAdvisor';
import { SCORE_MAX, SCORE_MIN } from '../teamRadarState';
import type { ServiceId } from '../serviceId';
import { org as regOrg, teams as regTeams } from '../../../orchestration/registry.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 村の体数 —— `villageSummary` と同じ数え方 (CEO + COO + 役員 + 秘書 + 管理職 + 稼働チーム)。 */
function villageBodies(): number {
  const secretaries = regOrg.secretaries.reduce((n, s) => n + Math.max(0, s.members), 0);
  const activeTeams = regTeams.filter((t) => t.active).length;
  return 1 + 1 + regOrg.executives.length + secretaries + regOrg.managers.length + activeTeams;
}

interface Claim {
  /** 説明の中に在るはずの綴り (数を含む形でそのまま書く)。 */
  readonly text: string;
  /** 実物から測る。省くと「測らない理由」だけの行になる。 */
  readonly measure?: () => string;
  /** 測る行では「その数が何か」、測らない行では「なぜ測らないか」。 */
  readonly why: string;
}

/**
 * 数字を名乗る 17 件の台帳。**空にはできない** —— 下の走査が母集団を数え、
 * 行の無い説明があれば落ちる。
 */
// 鍵は `ServiceId` —— 綴りを間違えた id は tsc が止める (走査を待たずに落ちる)。
const LEDGER: Partial<Record<ServiceId, readonly Claim[]>> = {
  home: [{ text: 'ボタン 1 つで', why: '言い回し (操作が 1 回という意味で、数えられる量ではない)' }],
  security: [{ text: 'Norton 360', why: '製品名' }],
  ollama: [
    {
      text: 'デスクトップ版は 127.0.0.1 固定 / ブラウザ版は接続先を指定',
      why:
        '番地。**実行形態で違う** —— main の OLLAMA_BASE は固定、ブラウザ版は 3 経路 '
        + '(ループバック / ページと同じホスト / 任意の https)。パス 138 が SECURITY_AUDIT で直した区別',
    },
  ],
  kpi: [
    { text: '11 指標', measure: () => String(Object.keys(SNAPSHOT.kpi.aggregate.kpi).length), why: 'KPI の算出欄の数' },
    { text: '6 事業', why: '模擬データの事業数 (main の MOCK_UNITS。ブラウザ版は利用者の記録から作るので固定ではない)' },
    { text: 'Phase 6', why: '行程の名前' },
  ],
  stocks: [{ text: 'Phase 7', why: '行程の名前' }],
  business: [
    { text: '10 事業', measure: () => String(BUSINESS_CATEGORY_IDS.length), why: '事業カテゴリの数' },
    { text: 'Phase 6', why: '行程の名前' },
  ],
  teamradar: [
    { text: '1-5 評価', measure: () => `${SCORE_MIN}-${SCORE_MAX} 評価`, why: '評点の範囲' },
    { text: '5 軸', measure: () => String(SNAPSHOT.teamradar.axes.length), why: '既定の評価軸の数' },
  ],
  templates: [
    { text: '8 種類', measure: () => String(SNAPSHOT.templates.templates.length), why: 'テンプレートの数' },
  ],
  library: [
    { text: '50 MB', measure: () => `${MAX_BYTES / 1024 / 1024} MB`, why: '保存の総量上限' },
    { text: '100 件', measure: () => String(MAX_ITEMS), why: '保存の件数上限' },
  ],
  settings: [{ text: 'AES-GCM-256', why: '暗号方式の名前' }],
  quality: [{ text: '1 画面で', why: '言い回し' }],
  netsea: [{ text: 'B2B', why: '業態の呼び名' }],
  'super-delivery': [{ text: 'B2B', why: '業態の呼び名' }],
  youtube: [{ text: 'API v3', why: 'API の版' }],
  village: [{ text: '143 体', measure: () => String(villageBodies()), why: '村人の総数 (orchestration/registry.json から)' }],
  docstudio: [{ text: '52 書式', measure: () => String(STUDIO_TEMPLATES.length), why: '経営書類の書式の数' }],
  talent: [{ text: '達成確率100%', why: '規則の名前 (talent.ts「達成確率100%キープの法則」。100 は割合の天井)' }],
};

function descriptionOf(id: string): string {
  const def = SERVICES.find((s) => s.id === id);
  if (!def) throw new Error(`${id} はサイドバーに無い`);
  return def.description;
}

const WITH_DIGITS = SERVICES.filter((s) => /\d/.test(s.description)).map((s) => s.id);

describe('サイドバーの説明が名乗る数 (パス 163)', () => {
  it('★ 数字を名乗る説明はすべて台帳に在る (母集団を数える)', () => {
    const missing = WITH_DIGITS.filter((id) => !(id in LEDGER));
    expect(missing, '説明に数字を書いたら sidebarNumberClaims.test.ts の台帳に行を足すこと').toEqual([]);
  });

  it('★ 台帳に在るのに、数字を名乗る説明が無い項は無い (腐った台帳を許さない)', () => {
    const stale = Object.keys(LEDGER).filter((id) => !(WITH_DIGITS as readonly string[]).includes(id));
    expect(stale).toEqual([]);
  });

  it('★ 台帳の綴りが説明の中に実際に在る (綴りがずれた台帳は何も守らない)', () => {
    const absent: string[] = [];
    for (const [id, claims] of Object.entries(LEDGER)) {
      const desc = descriptionOf(id);
      for (const c of claims ?? []) if (!desc.includes(c.text)) absent.push(`${id}: ${c.text}`);
    }
    expect(absent).toEqual([]);
  });

  it('★ 測れる数は実物と一致する (書式 45 / 指標 8 のずれを見つけた検査)', () => {
    const drift: string[] = [];
    for (const [id, claims] of Object.entries(LEDGER)) {
      for (const c of claims ?? []) {
        if (!c.measure) continue;
        const measured = c.measure();
        // 説明の中の綴りは「52 書式」のように単位を伴うので、測った値を同じ形に組み直して比べる。
        const expected = c.text.replace(/^[\d.-]+/, measured.replace(/\s.*$/, ''));
        if (c.text !== expected) drift.push(`${id}: 説明は「${c.text}」だが実測は「${expected}」(${c.why})`);
      }
    }
    expect(drift).toEqual([]);
  });

  it('★ 測らない行には理由が書いてある (無言の除外を許さない)', () => {
    const silent: string[] = [];
    for (const [id, claims] of Object.entries(LEDGER)) {
      for (const c of claims ?? []) if (c.why.trim().length === 0) silent.push(`${id}: ${c.text}`);
    }
    expect(silent).toEqual([]);
  });

  /**
   * **同じ数は文書にも写っている。** `docs/DESIGN_BLUEPRINT.md` の
   * 「16 サービスマトリクス」の kpi 行が「6 事業 × 8 指標」と書いていた ——
   * サイドバーと同じずれで、直すときに 1 か所しか直さないと片方が残る。
   * (写しを消せない —— あの表は行ごとに散文を持つ形なので、**両方を見る**。)
   */
  it('★ 文書の写しも実物と一致する (サイドバーだけ直して満足しない)', () => {
    const blueprint = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'DESIGN_BLUEPRINT.md'), 'utf8');
    const metrics = Object.keys(SNAPSHOT.kpi.aggregate.kpi).length;
    const row = blueprint.split('\n').find((l) => l.startsWith('| kpi |'));
    expect(row, 'DESIGN_BLUEPRINT.md の 16 サービスマトリクスに kpi 行が無い').toBeDefined();
    expect(row, `kpi の指標数は実測 ${metrics}`).toContain(`${metrics} 指標`);
  });

  it('走査が生きている (数字を名乗る説明が 10 件以上ある)', () => {
    // 走査が死んで 0 件になると、上の 2 本が無条件に通る。
    expect(WITH_DIGITS.length).toBeGreaterThanOrEqual(10);
  });
});
