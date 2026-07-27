import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OLLAMA_PORT,
  MIN_SAFE_VERSION,
  OLLAMA_READ_PATHS,
  UNPATCHED_OOB_NOTICE,
  buildLoopbackBase,
  buildOllamaUrl,
  buildWarnings,
  compareVersions,
  isLoopbackBase,
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

describe('isLoopbackBase — 任意ホストへの踏み台化を防ぐ', () => {
  it('ループバックホストは許可', () => {
    expect(isLoopbackBase('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackBase('http://localhost:11434')).toBe(true);
    expect(isLoopbackBase('http://[::1]:11434')).toBe(true);
  });

  it('外部ホスト・内部ネットワークは拒否 (SSRF 踏み台化の防止)', () => {
    for (const bad of [
      'http://example.com:11434',
      'http://169.254.169.254/', // クラウドメタデータ
      'http://192.168.1.10:11434',
      'http://10.0.0.5:11434',
      'http://127.0.0.1.evil.com:11434', // 見た目だけループバック
      'http://ollama.local:11434',
    ]) {
      expect(isLoopbackBase(bad), bad).toBe(false);
    }
  });

  it('http 以外のスキームは拒否', () => {
    expect(isLoopbackBase('https://127.0.0.1:11434')).toBe(false);
    expect(isLoopbackBase('file:///etc/passwd')).toBe(false);
    expect(isLoopbackBase('ws://127.0.0.1:11434')).toBe(false);
  });

  it('認証情報つき URL は拒否 (パーサ差異の温床)', () => {
    expect(isLoopbackBase('http://user:pass@127.0.0.1:11434')).toBe(false);
    expect(isLoopbackBase('http://evil.com@127.0.0.1:11434')).toBe(false);
  });

  it('パス・クエリ・フラグメント付きは拒否', () => {
    expect(isLoopbackBase('http://127.0.0.1:11434/api')).toBe(false);
    expect(isLoopbackBase('http://127.0.0.1:11434/?x=1')).toBe(false);
    expect(isLoopbackBase('http://127.0.0.1:11434/#f')).toBe(false);
  });

  it('末尾スラッシュのみは許可 (URL 正規化の結果)', () => {
    expect(isLoopbackBase('http://127.0.0.1:11434/')).toBe(true);
  });

  it('壊れた入力は拒否', () => {
    for (const bad of ['', 'not a url', '://', null, undefined, 123]) {
      expect(isLoopbackBase(bad as string)).toBe(false);
    }
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

  it('非ループバック base では許可パスでも null', () => {
    expect(buildOllamaUrl('http://evil.com', '/api/tags')).toBeNull();
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
