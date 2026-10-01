import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **配る単一 HTML が端末に残す物の母集団** — 2026-09-21 · パス 364。
 *
 * `lint:storage` は「端末に残す物は台帳・ハードリセットは全行を覆う」を守る門だが、
 * その走査範囲 (`SCAN_DIR`) は **`src/renderer` だけ**である。このリポジトリは
 * それとは別に、**利用者がダウンロードして自分で開く単一 HTML** を配っており、
 * 実測 (2026-09-21) するとそのうち **3 本が入力を `localStorage` へ自動保存**していた:
 *
 * ```
 *   電子定款メーカー.html      teikan-maker-values-v1        商号・本店・発起人の氏名と住所・出資額
 *   就業規則メーカー.html      shugyokisoku-maker-values-v1  事業場の名称・所在地・代表者名
 *   経営書類スタジオ.html      docs-studio-values-v1         12 種の差込値 (会社名・氏名・住所)
 *   業務自動化ダッシュボード     (保存しない)
 * ```
 *
 * **3 本とも `removeItem` が 0 件だった。** つまり文書の中から消す手段が無く、
 * 利用者はブラウザのサイトデータ設定を知らないかぎり**自分の氏名と住所を入れたまま**にする
 * ほか無い。しかも保存先はその文書自身の生成元なので、**アプリの「すべてのデータを削除」は
 * 構造的に届かない** —— `eraseAll` を直しても解決しない側である。
 *
 * 入れた人から見ると、これは「個人情報を扱う画面」ではなく「書類を作る道具」なので、
 * 残っている自覚が持ちにくい。法則 `escape-hatch-stays-open` (逃げ口は開いている) の、
 * **逃げ口が最初から無かった**形である。
 *
 * ## この検査が持つもの
 *
 * 母集団は走査で導く (builder のソースが保存 API に触れているか)。台帳は**両方向**。
 * 保存する行には **① 自分の鍵を `removeItem` すること ② 消す口の id が実在すること
 * ③ 何が消えるかを名指しする確認文を持つこと ④ `docs/DATA_PROTECTION.md` の在庫に
 * 鍵が載っていること**を要求する —— ④ が無いと、在庫と実物が別々に古びる。
 *
 * 自動保存そのものは**責めない**。タブを閉じても書きかけが消えないための機能で、
 * builder の docblock にも最初からそう書いてある。要求するのは**消せること**である。
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const DATA_PROTECTION = 'docs/DATA_PROTECTION.md';

/** ブラウザに物を残す API。`caches` はここでは出ないが、増えたら母集団に入るよう並べる。 */
const STORAGE_API = /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie|\bcaches\b/;

/** 配る単一 HTML を作る builder を git から数える (追跡 + 未追跡)。 */
function distributedBuilders(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts/build-*.cjs'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return [...new Set(out.split('\n').filter(Boolean))].sort();
}

/** そのうち保存 API に触れている物。 */
export function storingBuilders(): string[] {
  return distributedBuilders().filter((rel) => STORAGE_API.test(readOriginalSource(join(REPO_ROOT, rel))));
}

interface Row {
  /** `localStorage` の鍵 (builder のソース中の綴りと一致すること)。 */
  readonly key: string;
  /** 消す口の要素 id。 */
  readonly clearId: string;
  /** 在庫に載せるための一言 (何を持つか)。 */
  readonly holds: string;
}

/**
 * 保存する配布物の台帳 (両方向)。
 *
 * ここに行を足したら `docs/DATA_PROTECTION.md` の「配る単一 HTML が残す物」にも
 * 同じ鍵を書く —— 下の検査がその表を読む。
 */
const LEDGER: Readonly<Record<string, Row>> = {
  'scripts/build-teikan-maker.cjs': {
    key: 'teikan-maker-values-v1',
    clearId: 'btn-clear',
    holds: '商号・本店所在地・発起人の氏名と住所・引受株数/出資額',
  },
  'scripts/build-shugyokisoku-maker.cjs': {
    key: 'shugyokisoku-maker-values-v1',
    clearId: 'btn-clear',
    holds: '事業場の名称・所在地・代表者名など就業規則の差込値',
  },
  'scripts/build-docs-studio.cjs': {
    key: 'docs-studio-values-v1',
    clearId: 'btn-clear',
    holds: '12 種の書類すべての差込値 (会社名・氏名・住所を含む)',
  },
};

/**
 * 消す口の click handler の中身だけを切り出す。
 *
 * **綴りを全文で探すと、builder 自身の self-check の標本に当たる。** 実測 (2026-09-21):
 * 最初に書いたこの検査は `src.toContain('localStorage.removeItem(LS_KEY)')` で、
 * **実物の呼び出しを `void 0` に潰しても通った** —— builder の `required` 配列が
 * 同じ綴りを持っているためである (法則 `mention-vs-declaration`)。対照が鳴らなかったので
 * 気付けた。handler の中だけを見る形に直した。
 */
export function clearHandlerBody(src: string, clearId: string): string | null {
  const open = src.indexOf(`$('${clearId}').addEventListener('click', function () {`);
  if (open === -1) return null;
  const end = src.indexOf('\n  });', open);
  return end === -1 ? null : src.slice(open, end);
}

const POPULATION = storingBuilders();

describe('配る単一 HTML の保存 — 走査と針が生きている', () => {
  it('配る builder が 1 本以上見つかる (床)', () => {
    expect(distributedBuilders().length).toBeGreaterThanOrEqual(8);
  });

  it('★ 標本: 保存 API の針は当たり、触れていない物には当たらない', () => {
    expect(STORAGE_API.test("localStorage.setItem('k', v)")).toBe(true);
    expect(STORAGE_API.test('sessionStorage.getItem(k)')).toBe(true);
    expect(STORAGE_API.test('document.cookie = x')).toBe(true);
    expect(STORAGE_API.test('const html = renderPaper(values);')).toBe(false);
  });

  it('保存する builder が 1 本以上見つかる (床)', () => {
    expect(POPULATION.length).toBeGreaterThanOrEqual(1);
  });

  it('★ 標本: handler の切り出しは handler の中だけを返す (self-check の標本に当たらない)', () => {
    const fake =
      "$('btn-clear').addEventListener('click', function () {\n    localStorage.removeItem(LS_KEY);\n  });\n" +
      "const required = ['localStorage.removeItem(LS_KEY)'];";
    const body = clearHandlerBody(fake, 'btn-clear');
    expect(body).not.toBeNull();
    expect(body!).toContain('localStorage.removeItem(LS_KEY)');
    expect(body!).not.toContain('const required');
    // handler が無ければ null (綴りが余所に在っても拾わない)
    expect(clearHandlerBody("const required = ['localStorage.removeItem(LS_KEY)'];", 'btn-clear')).toBeNull();
  });
});

describe('配る単一 HTML の保存 — 台帳は両方向', () => {
  it('★ 保存する builder はすべて台帳に在る', () => {
    const missing = POPULATION.filter((f) => !Object.hasOwn(LEDGER, f));
    expect(missing, '端末に物を残す配布物が増えている — 鍵・消す口・中身を台帳へ').toEqual([]);
  });

  it('★ 台帳の行はすべて保存する builder である', () => {
    const found = new Set(POPULATION);
    const stale = Object.keys(LEDGER).filter((f) => !found.has(f));
    expect(stale, '台帳に在るのに保存しなくなった — 古い登録は次の 1 件を隠す').toEqual([]);
  });
});

describe('配る単一 HTML の保存 — 消せること', () => {
  for (const [file, row] of Object.entries(LEDGER)) {
    const src = (): string => readOriginalSource(join(REPO_ROOT, file));

    it(`★ ${row.key}: 鍵が実物の綴りと一致する`, () => {
      expect(src()).toContain(`'${row.key}'`);
    });

    it(`★ ${row.key}: 消す口の handler の中で自分の鍵を removeItem する`, () => {
      const body = clearHandlerBody(src(), row.clearId);
      expect(body, '消す口の handler が見つからない').not.toBeNull();
      expect(body!, '文書の中から消せないと、利用者はブラウザの設定を知らないかぎり残したままになる').toContain(
        'localStorage.removeItem(LS_KEY)',
      );
    });

    it(`★ ${row.key}: 消す口の id が文書に在る`, () => {
      expect(src()).toContain(`id="${row.clearId}"`);
    });

    it(`★ ${row.key}: 確認文が「何が消えるか」と「戻せない」を言う`, () => {
      const m = /var CLEAR_CONFIRM = '([^']+)';/.exec(src());
      expect(m, '確認文が定数として無い').not.toBeNull();
      const text = m![1]!;
      expect(text).toContain('消します');
      expect(text).toContain('元に戻せません');
      // 「よろしいですか」だけの確認にしない —— 中身を名指しする分の長さが要る。
      expect(text.length).toBeGreaterThan(40);
    });

    it(`★ ${row.key}: DATA_PROTECTION の在庫に載っている`, () => {
      const doc = readOriginalSource(join(REPO_ROOT, DATA_PROTECTION));
      expect(doc, '在庫に無い保存先は問われもしない').toContain(row.key);
    });
  }
});
