/**
 * Ollama (デスクトップ版) の失敗の枝 —— 転送の拒否・導入済み一覧の取り損ね・要求したモデルの名乗り
 * (2026-09-30 · パス 502)。
 *
 * 変異検査の全掃引が `ollama.ts` に 9 件の生存を残していた。`ollama.test.ts` は失敗の枝の多くを
 * 留めているが、次の 4 つは**値を見ていなかった**:
 *
 *   ① **転送 (3xx) に追随しない** —— 規則そのもの (`isRedirectResponse`) は `httpLimits` の検査が持つが、
 *     Ollama の口 (`withTimeout`) が**その規則を呼んで文を組むこと**を誰も走らせていなかった
 *     (未到達 = どの検査もその行を通らない)。loopback の Ollama が `302 Location:` を返すのは
 *     乗っ取り (別プロセスが 11434 を握る) のときで、追随すると利用者の prompt が別の場所へ再送される。
 *   ② **導入済み一覧を取れなかったとき、名前を添えない** —— 一覧の応答が失敗 (`!res.ok`) でも
 *     本文が一覧の形をしていれば読めてしまう。失敗した応答の本文を「導入済み」と信じない。
 *   ③ **失敗の助言は、要求したモデルの名を言う** —— 本文がモデル名を述べない失敗 (runner の異常)
 *     では、名乗れるのは要求した名だけ。ここを落とすと「ollama rm <モデル>」の雛形のままになる。
 *
 * 文面は**値ごと** (`toThrow(new Error(…))` / `toBe`) で留める。
 */
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, fetchOllamaSnapshot } from '../ollama';
import { FetchError } from '../types';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** 転送の応答。`Location` は相手が決める値 (loopback の別プロセスが握った場合も同じ)。 */
function redirect(status: number, location: string): Response {
  return new Response(null, { status, headers: { location } });
}

/** 要求された経路ごとに答える fetch (呼ばれた URL は calls で読む)。 */
function routed(routes: Record<string, () => Response | Promise<Response>>): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '');
    const make = routes[path];
    if (!make) throw new Error(`想定外の経路: ${path}`);
    return make();
  });
}
const pathsOf = (f: ReturnType<typeof vi.fn<typeof fetch>>): string[] =>
  f.mock.calls.map((c) => String(c[0]).replace(/^https?:\/\/[^/]+/, ''));

const REFUSAL = (host: string) =>
  `Ollama が別の場所 (${host}) へ転送しようとしました —— 追随しません (送り先の関門は最初の 1 ホップにしか掛からないため)`;

describe('Ollama — 転送 (3xx) には追随しない (パス 502)', () => {
  it.each([301, 302, 303, 307, 308])('★ chat: %s は相手の名と行き先を言って断り、Location へは取りに行かない', async (status) => {
    const f = routed({ '/api/chat': () => redirect(status, 'http://evil.example/steal') });
    await expect(
      ACTIONS['chat']!({ token: '', fetch: f, payload: { model: 'llama3.2', prompt: 'secret prompt' } }),
    ).rejects.toThrow(new Error(REFUSAL('evil.example')));
    // 1 回だけ (Location 先へ再送しない・失敗の助言のために /api/tags も引かない)
    expect(pathsOf(f)).toEqual(['/api/chat']);
  });

  it('★ chat: 相対の Location は要求した URL から解いた行き先を言う (loopback の別の道)', async () => {
    const f = routed({ '/api/chat': () => redirect(307, '/somewhere/else') });
    await expect(
      ACTIONS['chat']!({ token: '', fetch: f, payload: { model: 'llama3.2', prompt: 'hi' } }),
    ).rejects.toThrow(new Error(REFUSAL('127.0.0.1:11434')));
  });

  it('★ 取得 (snapshot): /api/version の転送は「届かない」として警告に出し、起動していないと扱う', async () => {
    const f = routed({ '/api/version': () => redirect(302, 'http://evil.example/v') });
    const snap = await fetchOllamaSnapshot({ token: '', fetch: f });
    expect(snap.running).toBe(false);
    expect(snap.warnings).toEqual([`Ollama unreachable at http://127.0.0.1:11434: ${REFUSAL('evil.example')}`]);
    // 転送の先を取りに行かず、一覧も引かない
    expect(pathsOf(f)).toEqual(['/api/version']);
  });

  it('対照: 転送でない 404 は従来どおり HTTP の状態を言う (転送の枝に入らない)', async () => {
    const f = routed({ '/api/version': () => new Response('nope', { status: 404 }) });
    const snap = await fetchOllamaSnapshot({ token: '', fetch: f });
    expect(snap.warnings).toEqual(['Ollama /api/version returned HTTP 404']);
  });
});

describe('Ollama — 導入済み一覧を取れなかったとき、助言は名前を添えない (パス 502)', () => {
  const tagsBody = { models: [{ name: 'llama3.2:1b', size: 1, modified_at: '2026-07-01T00:00:00Z' }] };

  async function adviceFor(model: string, tags: () => Response | Promise<Response>): Promise<string> {
    const notFound = () =>
      new Response(JSON.stringify({ error: `model "${model}" not found, try pulling it first` }), { status: 404 });
    const f = routed({ '/api/chat': notFound, '/api/tags': tags });
    const err = await ACTIONS['chat']!({ token: '', fetch: f, payload: { model, prompt: 'hi' } }).catch((e: unknown) => e);
    expect(pathsOf(f), '失敗の枝だけが一覧を引く').toEqual(['/api/chat', '/api/tags']);
    return (err as Error).message;
  }

  it('対照: 一覧が取れれば、導入済みの名前を提案する (この検査が何を留めているか)', async () => {
    expect(await adviceFor('llama3.2', () => json(tagsBody))).toBe(
      'モデル「llama3.2」がまだ取得されていません。 (インストール済みの「llama3.2:1b」を指定すると動きます。)',
    );
  });

  it('★ 一覧の応答が失敗 (500) なら、本文が一覧の形をしていても導入済みとは信じない', async () => {
    expect(await adviceFor('llama3.2', () => json(tagsBody, 500))).toBe(
      'モデル「llama3.2」がまだ取得されていません。 (取得する: ollama pull llama3.2)',
    );
  });

  it.each([
    ['応答が失敗 (本文は一覧の形)', () => json({ models: [{ name: 's-decoy:1b' }] }, 503)],
    ['接続が切れた', () => Promise.reject(new Error('socket hang up'))],
    ['本文が JSON でない', () => new Response('<html>', { status: 200 })],
    ['本文が一覧でない (物でない要素だけ)', () => json({ models: ['x', 1, null] })],
  ])('★ 一覧を取れない (%s) ときは、名前の前置きが合いやすい要求名でも提案を作らない', async (_why, tags) => {
    // `suggestInstalledModel` は前置きが合えば提案を作る。取れなかった一覧を「何かが入っている」と
    // 読み替える形 (空でなく番人を返す) は、`s` のような短い名前・番人の綴り (`stryker`) で露出する。
    for (const model of ['s', 'stryker', 'llama3.2']) {
      expect(await adviceFor(model, tags), model).toBe(
        `モデル「${model}」がまだ取得されていません。 (取得する: ollama pull ${model})`,
      );
    }
  });

  it('対照: 一覧が取れて前置きが合えば、短い名前でも提案が出る (上の「出ない」が空虚でない)', async () => {
    expect(await adviceFor('s', () => json({ models: [{ name: 'stryker:latest' }] }))).toBe(
      'モデル「s」がまだ取得されていません。 (インストール済みの「stryker:latest」を指定すると動きます。)',
    );
  });
});

describe('Ollama — 失敗の助言は要求したモデルの名を言う (パス 502)', () => {
  it.each([
    ['runner の異常', 'llama runner process has terminated: exit status 2', 500,
      '推論プロセスが起動できませんでした (モデル破損 / GPU ドライバの可能性)。 (モデルを取り直す: ollama rm llama3.2 && ollama pull llama3.2)'],
  ])('★ %s: 本文がモデル名を述べなくても、要求した名で助言する', async (_why, body, status, expected) => {
    const f = routed({ '/api/chat': () => new Response(JSON.stringify({ error: body }), { status }) });
    const err = await ACTIONS['chat']!({ token: '', fetch: f, payload: { model: 'llama3.2', prompt: 'hi' } }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).status).toBe(status);
    expect((err as Error).message).toBe(expected);
    // 未取得モデルではないので、一覧は引かない
    expect(pathsOf(f)).toEqual(['/api/chat']);
  });
});
