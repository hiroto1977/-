/**
 * **URL の authority が `${…}` で始まるテンプレートは台帳制** (2026-09-19 · パス 324)。
 *
 * 3 つの網の継ぎ目に穴が在った。`lint:url-encoding` は「authority 自体はホストの話なので見ない」と
 * 書き、`lint:network-targets` は**通信の呼び出し**の送り先しか見ず、画面に出すリンクは
 * `externalUrlOrNull` (**スキームだけ**) が担当 —— それぞれが「隣の網が見る」と述べていて、
 * **画面のリンクのホストに第三者の応答の値を置く行**は誰も見ていなかった。
 * 実物: `main/clients/slack.ts` の permalink は `team.info` の `team.domain` をそのまま
 * `https://${domain}.slack.com/archives/…` に置いており、`/` `?` `#` `\` の 1 字で host が
 * `.slack.com` の外へ出た (`lint:url-encoding` の「パス片を足してもオリジンは変えられない」は
 * **パス**の話で、authority には当てはまらない)。
 *
 * ここでは母集団 (authority の先頭が補間のテンプレート / 連結) を src 全体から数え、
 * 1 行ずつ理由 (解析の入力・解析済みの再直列化・内部の再解析・関門の返り値) を台帳に持つ。
 * **両方向** —— 台帳に無い行が出れば落ち、台帳の行が母集団から消えても落ちる。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';
import { SLACK_WORKSPACE_DOMAIN, slackWorkspaceDomainOrNull } from '../api/slack';

const REPO = join(__dirname, '..', '..', '..');

/**
 * authority の先頭が補間: テンプレートの `https://${…` / `http://${…` / `//${…` と、
 * 連結の `'https://' + …`。authority より**後ろ**の `${…}` (パス / クエリ) は `lint:url-encoding` の担当なので
 * ここには入れない。
 */
export const HOST_POSITION = /`(?:https?:)?\/\/\$\{|['"]https?:\/\/['"]\s*\+/;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

/** authority の先頭に補間を持つ行 (コメント行は落とす)。 */
export function hostPositionSites(files: readonly string[]): Site[] {
  const out: Site[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    stripComments(readOriginalSource(abs)).split('\n').forEach((line, i) => {
      if (HOST_POSITION.test(line)) out.push({ file, line: i + 1, text: line });
    });
  }
  return out;
}

interface LedgerRow {
  readonly file: string;
  /** その行に必ず在る綴り (行番号は動くので持たない)。 */
  readonly needle: string;
  /** なぜホストの位置に補間があってよいか。 */
  readonly reason: string;
}

/**
 * 台帳。理由は 4 種しか認めない: (a) 利用者の入力に scheme を補って **解析の入力** にする、
 * (b) 解析済み `URL.hostname` の再直列化、(c) 通信にも画面にも出ない内部の再解析、
 * (d) 第三者の値は**関門の返り値**だけを置く。「応答の文字列をそのまま」は理由にならない。
 */
const LEDGER: readonly LedgerRow[] = [
  {
    file: 'src/shared/ollama.ts',
    needle: '`http://${raw}`',
    reason: '(a) 利用者が打った接続先に scheme を補って new URL の入力にする。ホストは解析後の hostname を関門が見る',
  },
  {
    file: 'src/shared/atlassianSite.ts',
    needle: '`https://${parsed.hostname}`',
    reason: '(b) `.atlassian.net` を確かめた後の URL.hostname の再直列化 —— 関門の返り値',
  },
  {
    file: 'src/shared/privateTarget.ts',
    needle: '`http://${embeddedV4}/`',
    reason: '(c) IPv4 埋め込み IPv6 を分類するための内部の再解析。通信にも画面にも出ない',
  },
  {
    file: 'src/shared/privateTarget.ts',
    needle: '`http://${nat64Or6to4}/`',
    reason: '(c) 同上 (NAT64 / 6to4 の埋め込み)',
  },
  {
    file: 'src/renderer/data/sourceVerification.ts',
    needle: '`https://${parsed.hostname.toLowerCase()}',
    reason: '(b) 解析済み URL.hostname の再直列化。**この文字列は通信にも画面にも出ない** —— '
      + '出典の独立性を数える Set の鍵で、パス 478 の実測で読み手は distinctSourceCount だけ',
  },
  {
    file: 'src/main/clients/slack.ts',
    needle: '`https://${label}.slack.com/archives/',
    reason: '(d) 第三者の応答 (team.info の domain) は slackWorkspaceDomainOrNull の返り値 label だけを置く',
  },
];

const SITES = hostPositionSites(shippedSources());

describe('URL の authority が補間で始まる行 (パス 324)', () => {
  it('走査が生きている (床: 1 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(1);
  });

  it('★ 母集団と台帳は両方向に一致する', () => {
    const unlisted = SITES.filter((s) => !LEDGER.some((r) => r.file === s.file && s.text.includes(r.needle)));
    expect(unlisted.map((s) => `${s.file}:${s.line} ${s.text.trim()}`)).toEqual([]);
    const stale = LEDGER.filter((r) => SITES.filter((s) => s.file === r.file && s.text.includes(r.needle)).length !== 1);
    expect(stale.map((r) => `${r.file} ${r.needle}`)).toEqual([]);
  });

  it('台帳の理由は 4 種のどれかを名指しする', () => {
    for (const r of LEDGER) expect(r.reason).toMatch(/^\((a|b|c|d)\) /);
  });

  it('標本: 針は authority の先頭の補間に当たり、authority より後ろの補間には当たらない', () => {
    // 直す前の slack.ts の行そのもの
    expect(HOST_POSITION.test('  if (workspaceDomain) return `https://${workspaceDomain}.slack.com/archives/${channelId}`;')).toBe(true);
    expect(HOST_POSITION.test("  const u = 'https://' + host + '/v1';")).toBe(true);
    expect(HOST_POSITION.test('  const u = `//${host}/v1`;')).toBe(true);
    expect(HOST_POSITION.test('  const u = `http://${raw}`;')).toBe(true);
    // authority の後ろ (lint:url-encoding の担当) と定数のホスト
    expect(HOST_POSITION.test('  return `https://slack.com/app_redirect?channel=${id}`;')).toBe(false);
    expect(HOST_POSITION.test("  const SLACK_API = 'https://slack.com/api';")).toBe(false);
    expect(HOST_POSITION.test('  const u = `${SLACK_API}${SLACK_POST_MESSAGE_PATH}`;')).toBe(false);
  });

  it('★ slack.ts はホストに関門の返り値だけを置く (応答の値の直置きは 0 行)', () => {
    const src = readOriginalSource(join(REPO, 'src/main/clients/slack.ts'));
    expect(src).toContain('const label = slackWorkspaceDomainOrNull(workspaceDomain);');
    const hostLines = src.split('\n').filter((l) => HOST_POSITION.test(l));
    expect(hostLines).toHaveLength(1);
    expect(hostLines[0]).toContain('`https://${label}.slack.com/archives/');
    expect(src).not.toContain('${workspaceDomain}');
    // 標本: 不在を主張する綴りは、直す前の行に当たる
    expect('`https://${workspaceDomain}.slack.com/archives/${channelId}`').toContain('${workspaceDomain}');
  });
});

describe('slackWorkspaceDomainOrNull — ホストの 1 ラベルの文法', () => {
  it.each([
    ['acme', 'acme'],
    ['acme-corp-2', 'acme-corp-2'],
    ['ACME', 'ACME'],
    ['a', 'a'],
    ['a'.repeat(63), 'a'.repeat(63)],
    ['a' + 'b'.repeat(61) + 'c', 'a' + 'b'.repeat(61) + 'c'],
  ])('通す: %s', (input, expected) => {
    expect(slackWorkspaceDomainOrNull(input)).toBe(expected);
    expect(new URL(`https://${slackWorkspaceDomainOrNull(input)}.slack.com/archives/C1`).hostname).toBe(
      `${input.toLowerCase()}.slack.com`,
    );
  });

  it.each([
    ['スラッシュ (host が evil.example になる)', 'evil.example/x?'],
    ['クエリ', 'evil.example?'],
    ['フラグメント', 'evil.example#'],
    ['バックスラッシュ (特殊スキームでは / と同じ)', 'evil.example\\'],
    ['ドット (ラベルを増やす)', 'ac.me'],
    ['先頭のハイフン', '-acme'],
    ['末尾のハイフン', 'acme-'],
    ['下線', 'ac_me'],
    ['空白', 'a b'],
    ['空', ''],
    ['64 字', 'a'.repeat(64)],
    ['userinfo の @', 'a@evil.example'],
    ['ポート', 'acme:443'],
    ['制御文字', 'acme\n'],
    ['全角', 'ａｃｍｅ'],
  ])('断る: %s', (_why, input) => {
    expect(slackWorkspaceDomainOrNull(input)).toBeNull();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['数', 5],
    ['object', { toString: () => 'acme' }],
    ['配列', ['acme']],
  ])('文字列でなければ null: %s', (_why, input) => {
    expect(slackWorkspaceDomainOrNull(input)).toBeNull();
  });

  it('標本: 断った値をそのまま置くと host が .slack.com の外へ出る (直す前の形)', () => {
    const raw = 'evil.example/x?';
    expect(SLACK_WORKSPACE_DOMAIN.test(raw)).toBe(false);
    expect(new URL(`https://${raw}.slack.com/archives/C1`).hostname).toBe('evil.example');
    expect(new URL('https://evil.example\\.slack.com/archives/C1').hostname).toBe('evil.example');
    expect(new URL('https://evil.example#.slack.com/archives/C1').hostname).toBe('evil.example');
    expect(new URL('https://evil.example?.slack.com/archives/C1').hostname).toBe('evil.example');
  });
});
