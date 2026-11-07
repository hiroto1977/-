import { describe, expect, it } from 'vitest';
import {
  MIN_SAFE_VERSION,
  extractMissingModel,
  normalizeModels,
  suggestInstalledModel,
  unsafeVersionTexts,
} from '../ollama';

/**
 * `ollamaCore.mamori` (MG-035 · Mamori 0.18 への移植) を変異検査にかけて残った穴を、振る舞いで留める。
 * 移植の前は注記の pragma と書き方で覆っていた —— 移したあとは「文面そのもの」と「タグの切り方」を直接主張する。
 */
describe('unsafeVersionTexts —— 3 つの原因の全文 (note) は原因ごとに別の文', () => {
  it('unreadable: /api/version に version が無いことを言い、最低版を名指しする', () => {
    expect(unsafeVersionTexts('unreadable').note).toBe(
      'バージョンを読み取れませんでした (/api/version の応答に version がありません)。最低 ' +
        MIN_SAFE_VERSION +
        ' 以上か確認してください',
    );
  });
  it('prerelease: プレリリースは正式版より前なので修正が入っているとは限らない', () => {
    expect(unsafeVersionTexts('prerelease').note).toBe(
      'プレリリース版で実行中です。番号は ' +
        MIN_SAFE_VERSION +
        ' 以上に見えますが、プレリリースは対応する正式版より前なので、修正が入っているとは限りません。正式版へ更新してください',
    );
  });
  it('outdated: 既知 CVE と最低版', () => {
    expect(unsafeVersionTexts('outdated').note).toBe('既知 CVE。最低 ' + MIN_SAFE_VERSION + ' へ更新推奨');
  });
});

describe('suggestInstalledModel —— タグの切り方 (: より後ろを全部落とす)', () => {
  it('タグに空白が混ざっても「: 以降すべて」を落として前方一致で提案する', () => {
    // 先頭の ":" 以降を全部落とす。`[\S\S]` のように空白で止まる切り方だと提案が外れる。
    expect(suggestInstalledModel('llama3', ['llama3:8b q'])).toBe('llama3:8b q');
  });
  it('要求側のタグも落として比べる', () => {
    expect(suggestInstalledModel('llama3:70b', ['llama3:latest'])).toBe('llama3:latest');
  });
});

describe('extractMissingModel / normalizeModels —— 取りこぼしの標本', () => {
  it('モデル名が取れなければ空文字', () => {
    expect(extractMissingModel('something else')).toBe('');
  });
  it('size が数でない・負・無限のときは 0 MB に倒し、NaN を画面へ出さない', () => {
    const sizes = [undefined, 'huge', -5, Infinity, NaN, null, {}];
    for (const size of sizes) {
      const [m] = normalizeModels({ models: [{ name: 'x', size }] });
      expect(m?.sizeMb, String(size)).toBe(0);
    }
  });
});
