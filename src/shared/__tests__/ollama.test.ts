import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OLLAMA_PORT,
  MIN_SAFE_VERSION,
  OLLAMA_READ_PATHS,
  UNPATCHED_OOB_NOTICE,
  buildLoopbackBase,
  buildOllamaUrl,
  buildWarnings,
  classifyOllamaError,
  compareVersions,
  describeOllamaError,
  extractMissingModel,
  extractOllamaError,
  suggestInstalledModel,
  isAllowedOllamaBase,
  adviseFromBody,
  parseOllamaEndpoint,
  isSafeModelName,
  isVersionSafe,
  normalizeModels,
} from '../ollama';

/*
 * Ollama 連携の共有ロジック。main (Node fetch) と renderer (window fetch) の
 * 両方がこれを使うため、**片方だけ緩い**状態が生まれないようここで固定する。
 * 特にループバック限定と読み取りパス限定は、docs/OLLAMA_SECURITY.md の
 * 攻撃ベクトル遮断そのもの。
 */

describe('buildLoopbackBase', () => {
  it('既定ポートと任意ポートを 127.0.0.1 の base に組み立てる', () => {
    expect(buildLoopbackBase(DEFAULT_OLLAMA_PORT)).toBe('http://127.0.0.1:11434');
    expect(buildLoopbackBase(8080)).toBe('http://127.0.0.1:8080');
  });

  it('文字列入力 (UI の input) を受け付け、空白を許容する', () => {
    expect(buildLoopbackBase('11434')).toBe('http://127.0.0.1:11434');
    expect(buildLoopbackBase(' 11434 ')).toBe('http://127.0.0.1:11434');
  });

  it('範囲外・非整数・非数値は null', () => {
    for (const bad of [0, -1, 65536, 1.5, NaN, Infinity, '', 'abc', '11434abc', '0x2b']) {
      expect(buildLoopbackBase(bad as number | string)).toBeNull();
    }
  });

  it('境界: 1 と 65535 は有効', () => {
    expect(buildLoopbackBase(1)).toBe('http://127.0.0.1:1');
    expect(buildLoopbackBase(65535)).toBe('http://127.0.0.1:65535');
  });
});

describe('isAllowedOllamaBase — 接続先を 3 通りに限定する', () => {
  it('(1) ループバックは許可', () => {
    expect(isAllowedOllamaBase('http://127.0.0.1:11434')).toBe(true);
    expect(isAllowedOllamaBase('http://localhost:11434')).toBe(true);
    expect(isAllowedOllamaBase('http://[::1]:11434')).toBe(true);
  });

  it('(2) ページ自身と同じホスト名への http は許可 (PC配信ページをスマホから開く構成)', () => {
    expect(isAllowedOllamaBase('http://192.168.1.10:11434', '192.168.1.10')).toBe(true);
    expect(isAllowedOllamaBase('http://mypc.local:11434', 'mypc.local')).toBe(true);
    // 大文字小文字は正規化して比較する
    expect(isAllowedOllamaBase('http://MyPC.local:11434', 'mypc.local')).toBe(true);
  });

  it('(3) https は任意ホストを許可 (トンネル経由。CORS が相手側の同意を要求する)', () => {
    expect(isAllowedOllamaBase('https://abc-def.trycloudflare.com')).toBe(true);
    expect(isAllowedOllamaBase('https://mypc.tail1234.ts.net')).toBe(true);
  });

  it('平文 http で「別ホスト」は拒否 — 内部探索の踏み台化とプロンプト平文送信を防ぐ', () => {
    for (const bad of [
      'http://192.168.1.10:11434', // pageHostname 未指定 = 別ホスト扱い
      'http://169.254.169.254/', // クラウドメタデータ
      'http://10.0.0.5:11434',
      'http://example.com:11434',
      'http://127.0.0.1.evil.com:11434', // 見た目だけループバック
    ]) {
      expect(isAllowedOllamaBase(bad), bad).toBe(false);
    }
    // ページのホストと違えば同じ LAN 内でも拒否
    expect(isAllowedOllamaBase('http://192.168.1.99:11434', '192.168.1.10')).toBe(false);
  });

  it('http / https 以外のスキームは拒否', () => {
    expect(isAllowedOllamaBase('file:///etc/passwd')).toBe(false);
    expect(isAllowedOllamaBase('ws://127.0.0.1:11434')).toBe(false);
    expect(isAllowedOllamaBase('javascript:alert(1)')).toBe(false);
  });

  it('認証情報つき URL は拒否 (パーサ差異の温床)', () => {
    expect(isAllowedOllamaBase('http://user:pass@127.0.0.1:11434')).toBe(false);
    expect(isAllowedOllamaBase('https://user:pass@tunnel.example')).toBe(false);
    expect(isAllowedOllamaBase('http://evil.com@127.0.0.1:11434')).toBe(false);
  });

  it('パス・クエリ・フラグメント付きは拒否', () => {
    expect(isAllowedOllamaBase('http://127.0.0.1:11434/api')).toBe(false);
    expect(isAllowedOllamaBase('http://127.0.0.1:11434/?x=1')).toBe(false);
    expect(isAllowedOllamaBase('https://tunnel.example/#f')).toBe(false);
  });

  it('末尾スラッシュのみは許可 (URL 正規化の結果)', () => {
    expect(isAllowedOllamaBase('http://127.0.0.1:11434/')).toBe(true);
  });

  it('壊れた入力は拒否', () => {
    for (const bad of ['', 'not a url', '://', null, undefined, 123]) {
      expect(isAllowedOllamaBase(bad as string)).toBe(false);
    }
  });
});

describe('parseOllamaEndpoint — 利用者入力の正規化', () => {
  it('空文字は既定のループバック', () => {
    expect(parseOllamaEndpoint('')).toBe('http://127.0.0.1:11434');
    expect(parseOllamaEndpoint('   ')).toBe('http://127.0.0.1:11434');
  });

  it('数字のみはループバックのポート指定', () => {
    expect(parseOllamaEndpoint('11434')).toBe('http://127.0.0.1:11434');
    expect(parseOllamaEndpoint(' 8080 ')).toBe('http://127.0.0.1:8080');
  });

  it('スキーム省略は http を補い、ポート省略は 11434 を補う', () => {
    expect(parseOllamaEndpoint('192.168.1.10', '192.168.1.10')).toBe('http://192.168.1.10:11434');
    expect(parseOllamaEndpoint('192.168.1.10:11500', '192.168.1.10')).toBe(
      'http://192.168.1.10:11500',
    );
  });

  it('https はポートを補わない (トンネルは 443)', () => {
    expect(parseOllamaEndpoint('https://abc.trycloudflare.com')).toBe(
      'https://abc.trycloudflare.com',
    );
  });

  it('許可外の接続先は null', () => {
    expect(parseOllamaEndpoint('http://192.168.1.99:11434', '192.168.1.10')).toBeNull();
    expect(parseOllamaEndpoint('0x2b')).toBeNull();
    expect(parseOllamaEndpoint('70000')).toBeNull();
    expect(parseOllamaEndpoint('file:///etc/passwd')).toBeNull();
  });
});

describe('buildOllamaUrl — 読み取り 3 エンドポイント以外は組み立てない', () => {
  it('許可パスは結合する', () => {
    expect(buildOllamaUrl('http://127.0.0.1:11434', '/api/version')).toBe(
      'http://127.0.0.1:11434/api/version',
    );
    expect(buildOllamaUrl('http://127.0.0.1:11434/', '/api/tags')).toBe(
      'http://127.0.0.1:11434/api/tags',
    );
    expect(buildOllamaUrl('http://127.0.0.1:11434', '/api/chat')).toBe(
      'http://127.0.0.1:11434/api/chat',
    );
  });

  it('書き込み系エンドポイントは null (CVE-2024-37032 系の攻撃ベクトル)', () => {
    for (const danger of ['/api/pull', '/api/create', '/api/push', '/api/delete', '/api/blobs']) {
      expect(buildOllamaUrl('http://127.0.0.1:11434', danger as '/api/tags')).toBeNull();
    }
  });

  it('許可外 base では許可パスでも null', () => {
    expect(buildOllamaUrl('http://evil.com', '/api/tags')).toBeNull();
    expect(buildOllamaUrl('http://192.168.1.99:11434', '/api/tags', '192.168.1.10')).toBeNull();
  });

  it('ページと同じホスト / https では組み立てる', () => {
    expect(buildOllamaUrl('http://192.168.1.10:11434', '/api/tags', '192.168.1.10')).toBe(
      'http://192.168.1.10:11434/api/tags',
    );
    expect(buildOllamaUrl('https://abc.trycloudflare.com', '/api/chat')).toBe(
      'https://abc.trycloudflare.com/api/chat',
    );
  });

  it('OLLAMA_READ_PATHS は読み取り 3 本のみ', () => {
    expect([...OLLAMA_READ_PATHS]).toEqual(['/api/version', '/api/tags', '/api/chat']);
  });
});

describe('isSafeModelName', () => {
  it('正規のモデル識別子を許可', () => {
    for (const good of ['llama3.2', 'qwen2.5-coder:7b', 'library/mistral:latest', 'gemma2']) {
      expect(isSafeModelName(good), good).toBe(true);
    }
  });

  it('パストラバーサル・空白・シェル記号を拒否', () => {
    for (const bad of [
      '../etc/passwd',
      'a/../../b',
      'model name',
      'model;rm -rf /',
      'model\\win',
      'http://x/y',
      '',
      '-leading-dash',
    ]) {
      expect(isSafeModelName(bad), bad).toBe(false);
    }
  });

  it('非文字列を拒否', () => {
    expect(isSafeModelName(null as unknown as string)).toBe(false);
    expect(isSafeModelName(42 as unknown as string)).toBe(false);
  });

  it('128 文字境界', () => {
    expect(isSafeModelName('a'.repeat(128))).toBe(true);
    expect(isSafeModelName('a'.repeat(129))).toBe(false);
  });
});

describe('compareVersions / isVersionSafe', () => {
  it('順序を正しく比較する', () => {
    expect(compareVersions('0.1.46', '0.1.46')).toBe(0);
    expect(compareVersions('0.5.0', '0.1.46')).toBe(1);
    expect(compareVersions('0.1.45', '0.1.46')).toBe(-1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
  });

  it('桁数違いを扱う', () => {
    expect(compareVersions('0.2', '0.2.0')).toBe(0);
    expect(compareVersions('0.2.1', '0.2')).toBe(1);
  });

  it('プレリリース/ビルドタグは無視する', () => {
    expect(compareVersions('0.1.46-rc1', '0.1.46')).toBe(0);
    expect(compareVersions('0.1.46+build9', '0.1.46')).toBe(0);
  });

  it('MIN_SAFE_VERSION 境界を含めて判定する', () => {
    expect(isVersionSafe(MIN_SAFE_VERSION)).toBe(true);
    expect(isVersionSafe('0.1.47')).toBe(true);
    expect(isVersionSafe('0.1.45')).toBe(false);
  });

  it('不明・壊れたバージョンは安全でない扱い (安全側に倒す)', () => {
    for (const bad of ['', 'unknown', null, undefined, 42]) {
      expect(isVersionSafe(bad as string)).toBe(false);
    }
  });
});

describe('normalizeModels — 未知形状を落とし、危険な名前を弾く', () => {
  it('/api/tags のレスポンスを UI 形式へ正規化する', () => {
    const models = normalizeModels({
      models: [
        {
          name: 'llama3.2:latest',
          size: 2 * 1024 * 1024 * 1024,
          modified_at: '2026-07-01T10:00:00Z',
          details: { family: 'llama', parameter_size: '3B', quantization_level: 'Q4_K_M' },
        },
      ],
    });
    expect(models).toEqual([
      {
        name: 'llama3.2:latest',
        family: 'llama',
        parameterSize: '3B',
        quantization: 'Q4_K_M',
        sizeMb: 2048,
        modifiedAt: '2026-07-01T10:00:00Z',
      },
    ]);
  });

  it('details 欠落は — で埋める', () => {
    const [m] = normalizeModels({ models: [{ name: 'gemma2', size: 0, modified_at: '' }] });
    expect(m).toMatchObject({ family: '—', parameterSize: '—', quantization: '—', sizeMb: 0 });
  });

  it('危険なモデル名の行は捨てる', () => {
    const models = normalizeModels({
      models: [{ name: '../../etc/passwd', size: 1 }, { name: 'ok-model', size: 1 }],
    });
    expect(models.map((m) => m.name)).toEqual(['ok-model']);
  });

  it('配列でない・null・想定外の形は空配列', () => {
    for (const bad of [null, undefined, {}, { models: 'x' }, { models: [null, 3, 'y'] }]) {
      expect(normalizeModels(bad)).toEqual([]);
    }
  });

  it('size が非数値なら 0 MB として扱う', () => {
    const [m] = normalizeModels({ models: [{ name: 'x', size: 'huge', modified_at: '' }] });
    expect(m?.sizeMb).toBe(0);
  });
});

describe('buildWarnings', () => {
  it('未パッチ OOB の注意は常に含む', () => {
    expect(buildWarnings('0.5.0')).toEqual([UNPATCHED_OOB_NOTICE]);
  });

  it('MIN_SAFE_VERSION 未満なら更新警告を先頭に足す', () => {
    const w = buildWarnings('0.1.45');
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('0.1.45');
    expect(w[0]).toContain(MIN_SAFE_VERSION);
    expect(w[1]).toBe(UNPATCHED_OOB_NOTICE);
  });

  it('バージョン不明 (空文字) では更新警告を出さない (誤警告を避ける)', () => {
    expect(buildWarnings('')).toEqual([UNPATCHED_OOB_NOTICE]);
  });
});

/*
 * 実 Ollama のエラー応答の解釈。
 *
 * この環境には本物の Ollama を入れられない (公式配布も GitHub releases も
 * プロキシが遮断する) ため、**本物が返す文字列そのもの**を固定値としてここに
 * 置き、スタブと実物の差が入り込む余地を潰す。文言は Ollama の server/routes.go
 * および llm/server.go が実際に返すものに合わせている。
 */
describe('extractOllamaError', () => {
  it('{"error": "…"} の封筒から本文を取り出す', () => {
    expect(extractOllamaError({ error: 'model "x" not found, try pulling it first' })).toBe(
      'model "x" not found, try pulling it first',
    );
  });

  it('入れ子の {"error": {"message": "…"}} も読む', () => {
    expect(extractOllamaError({ error: { message: 'boom' } })).toBe('boom');
  });

  it('JSON として読めたのに error が無ければ空 (本文を垂れ流さない)', () => {
    expect(extractOllamaError({ ok: true }, '{"ok":true}')).toBe('');
    expect(extractOllamaError({}, '{}')).toBe('');
  });

  it('JSON でない本文はそのまま返す (Ollama が素の文字列を返す経路)', () => {
    expect(extractOllamaError(null, '  Forbidden  ')).toBe('Forbidden');
    expect(extractOllamaError(null, '404 page not found')).toBe('404 page not found');
  });

  it('空白のみ・空文字は空', () => {
    expect(extractOllamaError(null, '   ')).toBe('');
    expect(extractOllamaError(null)).toBe('');
    expect(extractOllamaError({ error: '   ' }, '')).toBe('');
  });

  it('長大な本文は 300 文字で切る', () => {
    expect(extractOllamaError(null, 'x'.repeat(5000))).toHaveLength(300);
  });
});

describe('classifyOllamaError', () => {
  it('未取得モデル', () => {
    expect(
      classifyOllamaError(404, 'model "mistral" not found, try pulling it first'),
    ).toBe('model-not-found');
    expect(classifyOllamaError(400, 'no such model')).toBe('model-not-found');
  });

  it('メモリ不足', () => {
    expect(
      classifyOllamaError(500, 'model requires more system memory (37.9 GiB) than is available (14.2 GiB)'),
    ).toBe('out-of-memory');
  });

  it('推論プロセスの異常終了', () => {
    expect(classifyOllamaError(500, 'llama runner process has terminated: exit status 2')).toBe(
      'runner-failed',
    );
    expect(classifyOllamaError(500, 'error loading model: unable to allocate backend buffer')).toBe(
      'runner-failed',
    );
  });

  it('403 は接続元の拒否 (OLLAMA_ORIGINS 未設定)', () => {
    expect(classifyOllamaError(403, 'Forbidden')).toBe('forbidden-origin');
  });

  it('本文なしの 404 はエンドポイント不在 (古い Ollama)', () => {
    expect(classifyOllamaError(404, '')).toBe('no-such-endpoint');
  });

  it('分類できないものは unknown', () => {
    expect(classifyOllamaError(500, 'something odd')).toBe('unknown');
    expect(classifyOllamaError(502, '')).toBe('unknown');
  });

  it('大文字小文字は問わない', () => {
    expect(classifyOllamaError(500, 'MODEL "X" NOT FOUND')).toBe('model-not-found');
  });
});

describe('extractMissingModel', () => {
  it('二重引用符・単引用符のどちらでも取り出す', () => {
    expect(extractMissingModel('model "llama3.2:latest" not found, try pulling it first')).toBe(
      'llama3.2:latest',
    );
    expect(extractMissingModel("model 'mistral' not found")).toBe('mistral');
  });

  it('引用符なしでも取り出す', () => {
    expect(extractMissingModel('model qwen2.5 not found')).toBe('qwen2.5');
  });

  it('モデル名として不正なものは返さない (そのまま画面に出さない)', () => {
    expect(extractMissingModel('model "../../etc/passwd" not found')).toBe('');
    expect(extractMissingModel('nothing here')).toBe('');
    expect(extractMissingModel('')).toBe('');
  });
});

describe('suggestInstalledModel', () => {
  it('タグ違いを補う (llama3.2 → llama3.2:latest)', () => {
    expect(suggestInstalledModel('llama3.2', ['llama3.2:latest', 'mistral:7b'])).toBe(
      'llama3.2:latest',
    );
  });

  it('タグが違うだけの別バージョンも拾う (mistral → mistral:7b)', () => {
    expect(suggestInstalledModel('mistral', ['mistral:7b'])).toBe('mistral:7b');
  });

  it('完全一致しているなら提案しない', () => {
    expect(suggestInstalledModel('llama3.2:latest', ['llama3.2:latest'])).toBe('');
    expect(suggestInstalledModel('LLaMA3.2:latest', ['llama3.2:latest'])).toBe('');
  });

  it('候補が無ければ空', () => {
    expect(suggestInstalledModel('gemma2', ['llama3.2:latest'])).toBe('');
    expect(suggestInstalledModel('gemma2', [])).toBe('');
    expect(suggestInstalledModel('', ['llama3.2:latest'])).toBe('');
  });
});

describe('describeOllamaError', () => {
  it('未取得モデル: pull コマンドと現在のモデル一覧を案内する', () => {
    const a = describeOllamaError(404, 'model "mistral" not found, try pulling it first', {
      model: 'mistral',
      installed: ['llama3.2:latest'],
    });
    expect(a.kind).toBe('model-not-found');
    expect(a.message).toContain('mistral');
    expect(a.hints.some((h) => h.includes('ollama pull mistral'))).toBe(true);
    expect(a.hints.some((h) => h.includes('llama3.2:latest'))).toBe(true);
  });

  it('未取得モデル: 近いモデルがあれば最初に提案する (pull より手軽なので)', () => {
    const a = describeOllamaError(404, 'model "llama3.2" not found, try pulling it first', {
      model: 'llama3.2',
      installed: ['llama3.2:latest'],
    });
    expect(a.hints[0]).toContain('llama3.2:latest');
  });

  it('未取得モデル: モデルが 1 つも無ければ、その旨と最初の 1 つを案内する', () => {
    const a = describeOllamaError(404, 'model "x" not found', { model: 'x', installed: [] });
    expect(a.hints.some((h) => h.includes('1 つもモデルがありません'))).toBe(true);
  });

  it('未取得モデル: model 未指定でもエラー文からモデル名を復元する', () => {
    const a = describeOllamaError(404, 'model "qwen2.5:0.5b" not found, try pulling it first');
    expect(a.message).toContain('qwen2.5:0.5b');
  });

  it('メモリ不足: pull を勧めず、小さいモデルへ誘導する', () => {
    const a = describeOllamaError(
      500,
      'model requires more system memory (37.9 GiB) than is available (14.2 GiB)',
      { model: 'llama3.1:70b' },
    );
    expect(a.kind).toBe('out-of-memory');
    expect(a.hints.join(' ')).not.toContain('ollama pull llama3.1:70b');
    expect(a.hints.join(' ')).toContain('小さいモデル');
  });

  it('推論プロセス異常: 対象モデル名を再取得コマンドに埋める', () => {
    const a = describeOllamaError(500, 'llama runner process has terminated: exit status 2', {
      model: 'broken:latest',
    });
    expect(a.kind).toBe('runner-failed');
    expect(a.hints[0]).toContain('broken:latest');
  });

  it('403: OLLAMA_ORIGINS の設定へ誘導する', () => {
    const a = describeOllamaError(403, 'Forbidden');
    expect(a.kind).toBe('forbidden-origin');
    expect(a.hints[0]).toContain('OLLAMA_ORIGINS');
  });

  it('本文なし 404: 古いバージョンの可能性を示す', () => {
    const a = describeOllamaError(404, '');
    expect(a.kind).toBe('no-such-endpoint');
    expect(a.message).toContain('404');
    expect(a.hints.join(' ')).toContain('ollama --version');
  });

  it('未知のエラーはステータスと生の本文を落とさず伝える', () => {
    const a = describeOllamaError(503, 'upstream unavailable');
    expect(a.kind).toBe('unknown');
    expect(a.message).toContain('503');
    expect(a.hints).toContain('upstream unavailable');
    expect(a.detail).toBe('upstream unavailable');
  });

  it('どの種類でも message は非空で、detail を保持する', () => {
    const cases: [number, string][] = [
      [404, 'model "x" not found'],
      [500, 'model requires more system memory (1 GiB) than is available (0 GiB)'],
      [500, 'llama runner process has terminated'],
      [403, 'Forbidden'],
      [404, ''],
      [500, 'mystery'],
    ];
    for (const [status, detail] of cases) {
      const a = describeOllamaError(status, detail);
      expect(a.message.length, `${status} ${detail}`).toBeGreaterThan(0);
      expect(a.detail).toBe(detail);
    }
  });
});

// --- 接続先の関門を実際に固定する ----------------------------------------
//
// `isAllowedOllamaBase` は「任意ホストへの http を許すと内部ネットワーク探索の
// 踏み台になる」ための関門である。ところがこのファイルは **変異検査の対象一覧に
// 載っていなかった** ので、検査があっても効いているかは誰も知らなかった。
// 実測すると 442 変異体 80.54% で、関門の各 guard が無証明だった。

describe('接続先の関門 — 各 guard を 1 つずつ固定する', () => {
  it('パスワードだけの認証情報も拒否する (ユーザ名だけを見ていると漏れる)', () => {
    // `http://user:pass@…` はユーザ名側で弾けるが、ユーザ名が空の形もある。
    expect(isAllowedOllamaBase('http://:pass@127.0.0.1:11434')).toBe(false);
    // ユーザ名だけ・パスワードだけ・両方、の 3 通りすべて
    expect(isAllowedOllamaBase('http://user@127.0.0.1:11434')).toBe(false);
    expect(isAllowedOllamaBase('http://user:pass@127.0.0.1:11434')).toBe(false);
  });

  it('文字列でない値は弾く — toString が正しい URL を返しても通さない', () => {
    // `new URL()` は toString を呼ぶので、型検査を外すとこれが通ってしまう。
    const sneaky = { toString: () => 'http://127.0.0.1:11434' };
    expect(isAllowedOllamaBase(sneaky as unknown as string)).toBe(false);
    expect(isAllowedOllamaBase(null as unknown as string)).toBe(false);
    expect(isAllowedOllamaBase(undefined as unknown as string)).toBe(false);
    expect(isAllowedOllamaBase(11434 as unknown as string)).toBe(false);
  });

  it('空文字は拒否 (new URL が throw する経路)', () => {
    expect(isAllowedOllamaBase('')).toBe(false);
  });

  it('ページのホスト名が空なら「同じホスト」条件は成立しない', () => {
    expect(isAllowedOllamaBase('http://192.168.1.10:11434', '')).toBe(false);
    // 既定引数でも同じ
    expect(isAllowedOllamaBase('http://192.168.1.10:11434')).toBe(false);
  });
});

describe('buildLoopbackBase — 入力した覚えのないポートへ行かせない', () => {
  it('10 進数字のみを受ける (0x / 1e 表記は Number() が別の値に化ける)', () => {
    expect(buildLoopbackBase('11434')).toBe('http://127.0.0.1:11434');
    expect(buildLoopbackBase('0x2b')).toBeNull(); // Number() なら 43 になる
    expect(buildLoopbackBase('1e3')).toBeNull(); // Number() なら 1000 になる
    expect(buildLoopbackBase('11434abc')).toBeNull();
    expect(buildLoopbackBase('abc11434')).toBeNull(); // 先頭の錨が無いと通る
    expect(buildLoopbackBase(' 11434 ')).toBe('http://127.0.0.1:11434'); // 前後の空白は許す
    expect(buildLoopbackBase('')).toBeNull();
  });

  it('数値はそのまま使う (文字列経路を通さない)', () => {
    expect(buildLoopbackBase(11434)).toBe('http://127.0.0.1:11434');
    expect(buildLoopbackBase(1.5)).toBeNull();
    expect(buildLoopbackBase(Number.NaN)).toBeNull();
  });

  it('ポート番号の境界は 1 と 65535 (両端を含む)', () => {
    expect(buildLoopbackBase(1)).toBe('http://127.0.0.1:1');
    expect(buildLoopbackBase(65535)).toBe('http://127.0.0.1:65535');
    expect(buildLoopbackBase(0)).toBeNull();
    expect(buildLoopbackBase(65536)).toBeNull();
    expect(buildLoopbackBase(-1)).toBeNull();
  });
});

describe('buildOllamaUrl — 許可 base と許可パスの積だけを通す', () => {
  it('末尾スラッシュ 1 本は落として結合する', () => {
    expect(buildOllamaUrl('http://127.0.0.1:11434/', '/api/tags')).toBe(
      'http://127.0.0.1:11434/api/tags',
    );
    expect(buildOllamaUrl('http://127.0.0.1:11434', '/api/tags')).toBe(
      'http://127.0.0.1:11434/api/tags',
    );
    // 2 本以上はそもそも関門で弾かれる (pathname が '/' にならない) ので、
    // 結合前に null になる。ここが「複数本を畳む必要が無い」根拠。
    expect(buildOllamaUrl('http://127.0.0.1:11434///', '/api/tags')).toBeNull();
  });

  it('未許可の base / パスは null', () => {
    expect(buildOllamaUrl('http://evil.example:11434', '/api/tags')).toBeNull();
    expect(buildOllamaUrl('http://127.0.0.1:11434', '/api/pull' as never)).toBeNull();
    expect(buildOllamaUrl('http://127.0.0.1:11434', '/api/delete' as never)).toBeNull();
  });

  it('読み取り 3 経路はすべて通る', () => {
    for (const p of OLLAMA_READ_PATHS) {
      expect(buildOllamaUrl('http://127.0.0.1:11434', p)).toBe(`http://127.0.0.1:11434${p}`);
    }
  });
});

describe('parseOllamaEndpoint — 入力の解釈', () => {
  it('スキームの判定は先頭から見る (途中の :// を拾わない)', () => {
    // 錨が外れると `evil.example/x?u=http://` を「スキーム付き」と誤認する
    expect(parseOllamaEndpoint('127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
    expect(parseOllamaEndpoint('https://tunnel.example')).toBe('https://tunnel.example');
  });

  it('パスやクエリに :// が含まれても「スキーム付き」と誤読しない', () => {
    // 先頭の錨が外れると、途中の `://` を拾って「もうスキームがある」と判断し、
    // `new URL('127.0.0.1/...')` が throw して接続できなくなる。
    expect(parseOllamaEndpoint('127.0.0.1/redirect?to=http://evil.example')).toBe(
      'http://127.0.0.1:11434',
    );
  });

  it('空入力は既定のループバック', () => {
    expect(parseOllamaEndpoint('')).toBe(`http://127.0.0.1:${DEFAULT_OLLAMA_PORT}`);
    expect(parseOllamaEndpoint('   ')).toBe(`http://127.0.0.1:${DEFAULT_OLLAMA_PORT}`);
  });

  it('数字のみはループバックのポート指定', () => {
    expect(parseOllamaEndpoint('11434')).toBe('http://127.0.0.1:11434');
    expect(parseOllamaEndpoint('99999')).toBeNull();
  });

  it('許可されない接続先は null', () => {
    expect(parseOllamaEndpoint('http://evil.example:11434')).toBeNull();
    expect(parseOllamaEndpoint('%%%')).toBeNull();
  });
});

// --- 失敗したときに何を出すか --------------------------------------------
//
// Ollama の失敗は「モデルが無い」「メモリが足りない」「許可されていない」で
// 次の一手がまるで違う。取り違えると利用者は絶対に解決しない作業へ送られる。
// 文言そのものが成果物なので、分岐ごとに丸ごと固定する。

describe('extractOllamaError — エラー封筒を開ける', () => {
  it('{"error": "…"} を取り出して前後の空白を落とす', () => {
    expect(extractOllamaError({ error: '  model not found  ' })).toBe('model not found');
  });

  it('{"error": {"message": "…"}} の入れ子も読む', () => {
    expect(extractOllamaError({ error: { message: '  nested  ' } })).toBe('nested');
  });

  it('error が空文字なら入れ子も本文も見ない (JSON は読めているので情報が無い)', () => {
    expect(extractOllamaError({ error: '   ' }, 'raw body')).toBe('');
    expect(extractOllamaError({ error: { message: '  ' } }, 'raw body')).toBe('');
  });

  it('JSON として読めたのに error が無ければ空 (本文を出しても情報がない)', () => {
    expect(extractOllamaError({ ok: true }, 'raw body')).toBe('');
    expect(extractOllamaError({}, 'raw body')).toBe('');
  });

  it('JSON ですらない本文は短く返す', () => {
    expect(extractOllamaError(null, '  Forbidden  ')).toBe('Forbidden');
    expect(extractOllamaError(undefined, 'Forbidden')).toBe('Forbidden');
    expect(extractOllamaError(null)).toBe('');
  });

  it('300 字で切る (異常に長い本文をそのまま流さない)', () => {
    expect(extractOllamaError({ error: 'x'.repeat(500) })).toHaveLength(300);
    expect(extractOllamaError({ error: { message: 'y'.repeat(500) } })).toHaveLength(300);
    expect(extractOllamaError(null, 'z'.repeat(500))).toHaveLength(300);
  });
});

describe('classifyOllamaError — 種類の取り違えを防ぐ', () => {
  it.each([
    ['model "llama3" not found, try pulling it first', 200, 'model-not-found'],
    ['no such model', 200, 'model-not-found'],
    ['model xyz not found', 200, 'model-not-found'],
    ['requires more system memory', 200, 'out-of-memory'],
    ['out of memory', 200, 'out-of-memory'],
    ['insufficient memory', 200, 'out-of-memory'],
    ['not enough memory', 200, 'out-of-memory'],
    ['llama runner process has terminated', 200, 'runner-failed'],
    ['error loading model', 200, 'runner-failed'],
    ['failed to load model', 200, 'runner-failed'],
  ] as const)('%s → %s', (detail, status, kind) => {
    expect(classifyOllamaError(status, detail)).toBe(kind);
  });

  it('大文字小文字を問わない', () => {
    expect(classifyOllamaError(200, 'NO SUCH MODEL')).toBe('model-not-found');
    expect(classifyOllamaError(200, 'Out Of Memory')).toBe('out-of-memory');
  });

  it('本文で決まらなければステータスで決める', () => {
    expect(classifyOllamaError(403, '')).toBe('forbidden-origin');
    expect(classifyOllamaError(404, '')).toBe('no-such-endpoint');
    expect(classifyOllamaError(500, '')).toBe('unknown');
    expect(classifyOllamaError(200, '')).toBe('unknown');
  });

  it('本文の判定はステータスより先 (403 でもモデル未取得ならそう言う)', () => {
    expect(classifyOllamaError(403, 'no such model')).toBe('model-not-found');
    expect(classifyOllamaError(404, 'out of memory')).toBe('out-of-memory');
  });

  it('読めない本文でも落ちない', () => {
    expect(classifyOllamaError(500, undefined as unknown as string)).toBe('unknown');
  });
});

describe('extractMissingModel — 本文からモデル名を取る', () => {
  it.each([
    ['model "llama3" not found', 'llama3'],
    ["model 'llama3.2:1b' not found", 'llama3.2:1b'],
    ['model `qwen2.5` not found', 'qwen2.5'],
    ['model “mistral” not found', 'mistral'],
    ['model llama3 not found', 'llama3'],
    ['MODEL "Llama3" NOT FOUND', 'Llama3'],
  ])('%s → %s', (detail, want) => {
    expect(extractMissingModel(detail)).toBe(want);
  });

  it('名前と not found の間の空白も何個でも読む', () => {
    // `\s+not found` を `\s not found` にすると 2 個以上で取り落とす。
    expect(extractMissingModel('model "llama3"  not found')).toBe('llama3');
  });

  it('model と名前の間の空白は何個でも読む', () => {
    // `\s+` を `\s` にすると 2 個以上の空白で名前を取り落とし、案内が
    // 「モデル「(不明)」」に化ける。
    expect(extractMissingModel('model  "llama3" not found')).toBe('llama3');
    expect(extractMissingModel('model\t"llama3"\tnot found')).toBe('llama3');
  });

  it('取れなければ空文字', () => {
    expect(extractMissingModel('something else')).toBe('');
    expect(extractMissingModel('')).toBe('');
    expect(extractMissingModel(undefined as unknown as string)).toBe('');
  });

  it('安全でない名前は返さない (本文はサーバ由来なのでそのまま信じない)', () => {
    expect(extractMissingModel('model "../../etc/passwd" not found')).toBe('');
    expect(extractMissingModel('model "a//b" not found')).toBe('');
  });
});

describe('suggestInstalledModel — 近いモデルを 1 つ提案する', () => {
  const installed = ['llama3.2:latest', 'qwen2.5:0.5b', 'mistral:7b'];

  it('完全一致なら提案しない', () => {
    expect(suggestInstalledModel('llama3.2:latest', installed)).toBe('');
    expect(suggestInstalledModel('LLAMA3.2:LATEST', installed)).toBe('');
  });

  it('タグ補完がいちばん優先 (llama3.2 → llama3.2:latest)', () => {
    expect(suggestInstalledModel('llama3.2', installed)).toBe('llama3.2:latest');
  });

  it('タグが違えば同じ base 名で拾う', () => {
    expect(suggestInstalledModel('qwen2.5:3b', installed)).toBe('qwen2.5:0.5b');
  });

  it('base 名も一致しなければ前方一致で拾う', () => {
    expect(suggestInstalledModel('mist', installed)).toBe('mistral:7b');
  });

  it('見つからなければ空文字', () => {
    expect(suggestInstalledModel('gemma', installed)).toBe('');
    expect(suggestInstalledModel('', installed)).toBe('');
    expect(suggestInstalledModel('llama3.2', [])).toBe('');
  });

  it('一覧に混ざった非文字列・空文字は無視する', () => {
    const dirty = [null, '', 42, 'llama3.2:latest'] as unknown as string[];
    expect(suggestInstalledModel('llama3.2', dirty)).toBe('llama3.2:latest');
    expect(suggestInstalledModel('gemma', dirty)).toBe('');
  });

  it('前後の空白は落として比べる', () => {
    // trim を外すと '  llama3.2  ' が一致せず、提案が出なくなる。
    expect(suggestInstalledModel('  llama3.2  ', ['llama3.2:latest'])).toBe('llama3.2:latest');
    expect(suggestInstalledModel('  llama3.2:latest  ', ['llama3.2:latest'])).toBe('');
  });

  it('引数が無くても落ちない', () => {
    expect(suggestInstalledModel(undefined as unknown as string, installed)).toBe('');
    expect(suggestInstalledModel('llama3.2', undefined as unknown as string[])).toBe('');
  });
});

describe('describeOllamaError — 分岐ごとに文言と手順を丸ごと固定する', () => {
  it('モデル未取得: インストール済みの近い名前を先に出し、次に取得コマンド', () => {
    const a = describeOllamaError(200, 'model "llama3.2" not found, try pulling it first', {
      installed: ['llama3.2:latest', 'mistral:7b'],
    });
    expect(a.kind).toBe('model-not-found');
    expect(a.message).toBe('モデル「llama3.2」がまだ取得されていません。');
    expect(a.hints).toEqual([
      'インストール済みの「llama3.2:latest」を指定すると動きます。',
      '取得する: ollama pull llama3.2',
      '現在あるモデル: llama3.2:latest, mistral:7b',
    ]);
  });

  it('モデル未取得: 近い名前が無ければ提案は出さない', () => {
    const a = describeOllamaError(200, 'no such model', { model: 'gemma', installed: ['mistral:7b'] });
    expect(a.hints).toEqual(['取得する: ollama pull gemma', '現在あるモデル: mistral:7b']);
  });

  it('モデル未取得: 1 つも入っていなければ最初の 1 つを案内する', () => {
    const a = describeOllamaError(200, 'no such model', { model: 'gemma', installed: [] });
    expect(a.hints).toEqual([
      '取得する: ollama pull gemma',
      'まだ 1 つもモデルがありません。例: ollama pull llama3.2',
    ]);
  });

  it('モデル未取得: 名前が取れなければ (不明) と書く', () => {
    const a = describeOllamaError(200, 'no such model');
    expect(a.message).toBe('モデル「(不明)」がまだ取得されていません。');
  });

  it('メモリ不足: 小さいモデル → 量子化 → 空きを増やす の順', () => {
    const a = describeOllamaError(200, 'requires more system memory');
    expect(a.kind).toBe('out-of-memory');
    expect(a.message).toBe('モデルが大きすぎて、この端末の空きメモリに載りませんでした。');
    expect(a.hints).toEqual([
      'より小さいモデルを試す (例: llama3.2:1b / qwen2.5:0.5b)',
      '量子化の強い版を選ぶ (Q4_K_M など)',
      '他のアプリを閉じて空きメモリを増やす',
    ]);
  });

  it('推論プロセス失敗: モデル名が分かれば取り直しコマンドに埋める', () => {
    const a = describeOllamaError(200, 'llama runner process has terminated', { model: 'mistral:7b' });
    expect(a.kind).toBe('runner-failed');
    expect(a.message).toBe('推論プロセスが起動できませんでした (モデル破損 / GPU ドライバの可能性)。');
    expect(a.hints).toEqual([
      'モデルを取り直す: ollama rm mistral:7b && ollama pull mistral:7b',
      'Ollama を再起動する',
      'CPU で動かす: OLLAMA_NUM_GPU=0 ollama serve',
    ]);
  });

  it('推論プロセス失敗: モデル名が無ければ <モデル> と書く', () => {
    const a = describeOllamaError(200, 'error loading model');
    expect(a.hints[0]).toBe('モデルを取り直す: ollama rm <モデル> && ollama pull <モデル>');
  });

  it('接続元が未許可 (403)', () => {
    const a = describeOllamaError(403, '');
    expect(a.kind).toBe('forbidden-origin');
    expect(a.message).toBe('Ollama にリクエストは届きましたが、接続元が許可されていません。');
    expect(a.hints).toEqual(['Ollama 側に OLLAMA_ORIGINS を設定して再起動してください。']);
  });

  it('エンドポイントが無い (404) — ステータスを文面に入れる', () => {
    const a = describeOllamaError(404, '');
    expect(a.kind).toBe('no-such-endpoint');
    expect(a.message).toBe('Ollama がそのエンドポイントを知りません (HTTP 404)。');
    expect(a.hints).toEqual([
      'Ollama のバージョンが古い可能性があります (ollama --version)。',
      '別のサーバがそのポートを使っていないか確認してください。',
    ]);
  });

  it('不明: ステータスを出し、本文があればそのまま添える', () => {
    expect(describeOllamaError(500, 'boom')).toEqual({
      kind: 'unknown',
      detail: 'boom',
      message: 'Ollama が HTTP 500 を返しました。',
      hints: ['boom'],
    });
    // 本文が空なら hints は空のまま
    expect(describeOllamaError(500, '').hints).toEqual([]);
  });

  it('detail は必ず文字列で返す (undefined を漏らさない)', () => {
    expect(describeOllamaError(500, undefined as unknown as string).detail).toBe('');
  });
});

describe('adviseFromBody — 生本文からの入口を 1 つにする', () => {
  it('JSON の封筒を開けて分類する', () => {
    const a = adviseFromBody(200, JSON.stringify({ error: 'no such model' }), { model: 'gemma' });
    expect(a.kind).toBe('model-not-found');
  });

  it('JSON でない本文でも必ず結果を返す', () => {
    const a = adviseFromBody(403, 'Forbidden');
    expect(a.kind).toBe('forbidden-origin');
    expect(a.detail).toBe('Forbidden');
  });

  it('空本文でも落ちない', () => {
    expect(adviseFromBody(500, '').kind).toBe('unknown');
  });
});

describe('buildWarnings — 未パッチ注意は常に出し、古い版は先頭に足す', () => {
  it('安全な版なら注意 1 件だけ', () => {
    expect(buildWarnings('0.1.46')).toHaveLength(1);
    expect(buildWarnings('9.9.9')).toHaveLength(1);
  });

  it('古い版は警告を先頭に積む', () => {
    const w = buildWarnings('0.1.45');
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('0.1.45');
    expect(w[0]).toContain('0.1.46');
    expect(w[0]).toContain('Probllama');
  });

  it('バージョン不明 (空文字) では版の警告を出さない', () => {
    expect(buildWarnings('')).toHaveLength(1);
  });
});

describe('normalizeModels — 未知の形は捨てる', () => {
  it('必要な項目を拾い、欠けは — で埋める', () => {
    expect(
      normalizeModels({
        models: [
          {
            name: 'llama3.2:latest',
            size: 2 * 1024 * 1024,
            modified_at: '2026-01-01T00:00:00Z',
            details: { family: 'llama', parameter_size: '3B', quantization_level: 'Q4_K_M' },
          },
          { name: 'bare:1b' },
        ],
      }),
    ).toEqual([
      {
        name: 'llama3.2:latest',
        family: 'llama',
        parameterSize: '3B',
        quantization: 'Q4_K_M',
        sizeMb: 2,
        modifiedAt: '2026-01-01T00:00:00Z',
      },
      { name: 'bare:1b', family: '—', parameterSize: '—', quantization: '—', sizeMb: 0, modifiedAt: '' },
    ]);
  });

  it('models が配列でなければ空', () => {
    expect(normalizeModels(null)).toEqual([]);
    expect(normalizeModels({})).toEqual([]);
    expect(normalizeModels({ models: 'x' })).toEqual([]);
  });

  it('要素が object でない・名前が安全でないものは落とす', () => {
    expect(
      normalizeModels({ models: [null, 'x', 42, { name: '../evil' }, { name: 'a//b' }, { name: 1 }] }),
    ).toEqual([]);
  });

  it('size が数値でない・非有限なら 0 MB', () => {
    const out = normalizeModels({
      models: [{ name: 'a:1b', size: 'x' }, { name: 'b:1b', size: Number.NaN }],
    });
    expect(out.map((m) => m.sizeMb)).toEqual([0, 0]);
  });
});

describe('壊れた入力で落とさない — 一覧・エラー本文の防御', () => {
  it('models に null が混ざっても throw しない', () => {
    expect(normalizeModels({ models: [null] })).toEqual([]);
    expect(normalizeModels({ models: [undefined] })).toEqual([]);
  });

  it('名前が文字列でない要素は捨てる', () => {
    expect(normalizeModels({ models: [{ name: 42 }, { name: null }, { name: {} }] })).toEqual([]);
  });

  it('size が有限でなければ 0 MB (Infinity を通さない)', () => {
    const out = normalizeModels({
      models: [{ name: 'a:1b', size: Number.POSITIVE_INFINITY }, { name: 'b:1b', size: -Infinity }],
    });
    expect(out.map((m) => m.sizeMb)).toEqual([0, 0]);
  });

  it('error が文字列でない形 (数値・配列) は入れ子として読みにいく', () => {
    expect(extractOllamaError({ error: 42 })).toBe('');
    expect(extractOllamaError({ error: [] })).toBe('');
    // 入れ子の message が文字列でなければ空
    expect(extractOllamaError({ error: { message: 42 } })).toBe('');
  });

  it('suggestInstalledModel は大文字小文字を無視して一致させる', () => {
    // タグ補完・base 一致・前方一致のいずれも小文字化して比べる
    expect(suggestInstalledModel('LLAMA3.2', ['Llama3.2:Latest'])).toBe('Llama3.2:Latest');
    expect(suggestInstalledModel('qwen2.5:3b', ['QWEN2.5:0.5B'])).toBe('QWEN2.5:0.5B');
    expect(suggestInstalledModel('MIST', ['Mistral:7b'])).toBe('Mistral:7b');
  });

  it('suggestInstalledModel はタグ補完を base 一致より優先する', () => {
    // 両方あり得るときに順番が入れ替わると別のモデルを勧めてしまう
    const list = ['llama3.2:8b', 'llama3.2:latest'];
    expect(suggestInstalledModel('llama3.2', list)).toBe('llama3.2:latest');
  });

  it('suggestInstalledModel は base 一致を前方一致より優先する', () => {
    // 'llama3' の base 一致は 'llama3:1b'、前方一致は 'llama3.2:latest' も該当する
    const list = ['llama3.2:latest', 'llama3:1b'];
    expect(suggestInstalledModel('llama3', list)).toBe('llama3:1b');
  });

  it('describeOllamaError は installed を渡さなくても落ちない', () => {
    const a = describeOllamaError(200, 'model "gemma" not found');
    expect(a.hints).toEqual([
      '取得する: ollama pull gemma',
      'まだ 1 つもモデルがありません。例: ollama pull llama3.2',
    ]);
  });

  it('parseOllamaEndpoint は undefined でも既定のループバックを返す', () => {
    expect(parseOllamaEndpoint(undefined as unknown as string)).toBe(
      `http://127.0.0.1:${DEFAULT_OLLAMA_PORT}`,
    );
  });
});
