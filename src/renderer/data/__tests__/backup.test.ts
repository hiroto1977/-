import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  serializeBackup,
  parseBackup,
  sha256Hex,
  BACKUP_VERSION,
  serializeEncryptedBackup,
  isEncryptedBackup,
} from '../backup';
import type { StoredRecord } from '../store';

const RECORDS: StoredRecord[] = [
  { id: 'a', collection: 'sales', createdAt: 2, updatedAt: 2, data: { amount: 100 } },
  { id: 'b', collection: 'kpi-actuals', createdAt: 1, updatedAt: 1, data: { revenue: 50 } },
];

describe('sha256Hex', () => {
  it('produces a stable 64-char hex digest', async () => {
    const h = await sha256Hex('abc');
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('serializeBackup', () => {
  it('wraps records in a versioned envelope with a timestamp + checksum', async () => {
    const json = await serializeBackup(RECORDS, new Date('2026-05-29T00:00:00Z'));
    const obj = JSON.parse(json);
    expect(obj.app).toBe('service-hub');
    expect(obj.version).toBe(BACKUP_VERSION);
    expect(obj.exportedAt).toBe('2026-05-29T00:00:00.000Z');
    expect(obj.records).toHaveLength(2);
    expect(obj.checksum).toBe(await sha256Hex(JSON.stringify(RECORDS)));
  });
});

describe('parseBackup', () => {
  it('round-trips serialize → parse', async () => {
    expect(await parseBackup(await serializeBackup(RECORDS))).toEqual(RECORDS);
  });

  it('rejects non-JSON', async () => {
    await expect(parseBackup('not json')).rejects.toThrow(/JSON/);
  });

  it('rejects a non-object top-level value (number / null)', async () => {
    // `typeof parsed !== 'object' || parsed === null` ガードを外す / && にする mutant は
    // 後続の app チェックや null 参照で別経路に逸れるため、'形式が不正' 文言で kill。
    await expect(parseBackup('123')).rejects.toThrow(/形式が不正/);
    await expect(parseBackup('null')).rejects.toThrow(/形式が不正/);
  });

  // 文言まで見る。checksum を必須にしてから、どの拒否も「何かで落ちる」点は
  // 同じになった。何を理由に断ったかが利用者に伝わることがここでの中身なので、
  // 理由ごとに固定する。
  it('rejects a foreign app envelope', async () => {
    await expect(
      parseBackup(JSON.stringify({ app: 'other', version: 1, records: [] })),
    ).rejects.toThrow(/このアプリのバックアップファイルではありません/);
  });

  it('rejects a newer version', async () => {
    await expect(
      parseBackup(JSON.stringify({ app: 'service-hub', version: BACKUP_VERSION + 1, records: [] })),
    ).rejects.toThrow(/版数/);
  });

  it('rejects a non-numeric version', async () => {
    // `typeof file.version !== 'number' || file.version > BACKUP_VERSION` を false 固定
    // する mutant は版数チェックを丸ごと飛ばすため、文字列版数で /版数/ を確認して kill。
    await expect(
      parseBackup(JSON.stringify({ app: 'service-hub', version: 'one', records: RECORDS })),
    ).rejects.toThrow(/版数/);
  });

  it('rejects a missing records array', async () => {
    await expect(parseBackup(JSON.stringify({ app: 'service-hub', version: 1 }))).rejects.toThrow(/records/);
  });

  it('detects tampering when records are altered but checksum is stale', async () => {
    const json = await serializeBackup(RECORDS);
    const obj = JSON.parse(json);
    // tamper: change an amount, keep the old checksum
    obj.records[0].data.amount = 999999;
    await expect(parseBackup(JSON.stringify(obj))).rejects.toThrow(/チェックサム不一致/);
  });

  it('is robust to reformatting (whitespace-only changes still verify)', async () => {
    const json = await serializeBackup(RECORDS);
    const reformatted = JSON.stringify(JSON.parse(json)); // collapse pretty-print
    expect(await parseBackup(reformatted)).toEqual(RECORDS);
  });

  // かつては checksum 無しを「旧バックアップ互換」として通していた。
  // git を辿るとこのファイルの最初のコミットから常に checksum を書いており、
  // 通す対象が存在しなかった。実際に効いていたのは「改ざんする側が
  // checksum の行を消せば検知を回避できる」という抜け道だけだった。
  it('checksum の無いファイルを拒否する (省略による検知回避を塞ぐ)', async () => {
    const stripped = JSON.stringify({ app: 'service-hub', version: 1, records: RECORDS });
    await expect(parseBackup(stripped)).rejects.toThrow(/完全性チェックサムがありません/);
  });

  // 「無い」と「合わない」を別の文言で断る。同じ文言にすると、無い方の
  // 判定を外しても不一致の側で落ちるので、判定が消えたことに気付けない。
  it('正規のバックアップから checksum だけ消しても復元できない', async () => {
    const obj = JSON.parse(await serializeBackup(RECORDS));
    delete obj.checksum;
    await expect(parseBackup(JSON.stringify(obj))).rejects.toThrow(/完全性チェックサムがありません/);
  });
});

describe('encrypted backup', () => {
  it('round-trips serialize(encrypted) → parse with the passphrase', async () => {
    const enc = await serializeEncryptedBackup(RECORDS, 'pw-123');
    expect(isEncryptedBackup(enc)).toBe(true);
    // 暗号化エンベロープも app で識別できる ('service-hub' を '' にする mutant を kill)。
    expect(JSON.parse(enc).app).toBe('service-hub');
    // ciphertext must not leak plaintext record content
    expect(enc).not.toContain('sales');
    expect(await parseBackup(enc, 'pw-123')).toEqual(RECORDS);
  });

  it('isEncryptedBackup distinguishes the encrypted flag from a valid payload', async () => {
    const enc = await serializeEncryptedBackup(RECORDS, 'pw-123');
    const payload = JSON.parse(enc).payload;
    // 有効な payload でも encrypted!==true なら false (左辺を true 固定する mutant を kill)。
    expect(isEncryptedBackup(JSON.stringify({ encrypted: false, payload }))).toBe(false);
    // encrypted===true でも payload が封緘形でなければ false (&& を || にする mutant を kill)。
    expect(isEncryptedBackup(JSON.stringify({ encrypted: true, payload: 'garbage' }))).toBe(false);
  });

  /*
   * 壊れたバックアップの復元は**日本語の理由**で断る。
   *
   * `parseBackup` は他のすべての失敗 (JSON でない / app が違う / 版数 /
   * checksum 不一致) に理由を付けているのに、`salt` と `iv` が base64 として
   * 読めない場合だけ **`atob` の DOMException("Invalid character") がそのまま
   * 画面へ出ていた** (2026-08-22 に実測)。`ct` は try の中なので正しい文言が
   * 出る —— 同じ関数の中で 3 つのうち 2 つだけ外に出ていた形。
   *
   * バックアップは利用者が選んだファイルで、他人から受け取ったものでもありうる。
   * 「パスワードが違う」のか「ファイルが壊れている」のかで次の行動が変わる。
   */
  it.each([
    ['salt', { salt: '###', iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAAAA' }],
    ['iv', { salt: 'AAAA', iv: '@@@', ct: 'AAAAAAAAAAAAAAAAAAAAAAAA' }],
  ])('%s が base64 として読めなければ、どの欄かまで言って断る', async (field, over) => {
    const bundle = { v: 1, kdf: 'PBKDF2-SHA256', iterations: 600_000, ...over };
    const text = JSON.stringify({ encrypted: true, payload: bundle });
    // **どの欄が壊れているか**まで見る。欄名が空になっても「暗号化データが
    // 壊れています（ が base64 として…）」で通ってしまうので、文言の型だけでは
    // 留まらない (実測で欄名の変異体が生き残った)。
    await expect(parseBackup(text, 'pw-123')).rejects.toThrow(
      new RegExp(`暗号化データが壊れています（${field} が base64`),
    );
    // プラットフォームの生の例外を出さない。
    await expect(parseBackup(text, 'pw-123')).rejects.not.toThrow(/Invalid character/);
  });

  it('中身 (ct) が壊れている場合は従来どおり「復号に失敗」', async () => {
    const bundle = {
      v: 1, kdf: 'PBKDF2-SHA256', iterations: 600_000,
      salt: 'AAAA', iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAAAAAAAAAAAAAAAAAAAAAA',
    };
    await expect(
      parseBackup(JSON.stringify({ encrypted: true, payload: bundle }), 'pw-123'),
    ).rejects.toThrow(/復号に失敗しました/);
  });

  it('isEncryptedBackup returns false for non-JSON (catch path)', () => {
    // catch ブロックを空にする / true を返す mutant を、明示的に false 期待で kill。
    expect(isEncryptedBackup('not json{')).toBe(false);
  });

  it('rejects an encrypted envelope whose payload is malformed', async () => {
    // password はあるが payload が封緘形でない → isEncryptedBundle ガードで弾く。
    // decryptString も同種ガードを持つが文言が「データ」なので、parseBackup 固有の
    // 「バックアップの形式が不正」で照合し、`if(!isEncryptedBundle)` を外す mutant を kill。
    await expect(
      parseBackup(JSON.stringify({ encrypted: true, payload: 'garbage' }), 'pw'),
    ).rejects.toThrow(/バックアップの形式が不正/);
  });

  it('requires a password to restore an encrypted backup', async () => {
    const enc = await serializeEncryptedBackup(RECORDS, 'pw-123');
    await expect(parseBackup(enc)).rejects.toThrow(/パスワードが必要/);
  });

  it('rejects a wrong passphrase', async () => {
    const enc = await serializeEncryptedBackup(RECORDS, 'pw-123');
    await expect(parseBackup(enc, 'nope')).rejects.toThrow(/復号に失敗/);
  });

  it('isEncryptedBackup is false for a plaintext backup', async () => {
    expect(isEncryptedBackup(await serializeBackup(RECORDS))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 手入力したデータがバックアップで往復すること
// ---------------------------------------------------------------------------

/**
 * 事業・任意の数値・置き換えは利用者が手で入れた**帳簿**なので、
 * バックアップから抜けると気付かないまま失われる。
 *
 * `exportAll` は collection を問わず全件を出すので原理的には入るが、
 * 復元側は `isSafeCollection` (`^[a-z][a-z0-9-]{0,63}$`) を通す。
 * **collection 名がその形から外れると、黙って捨てられる**。
 * 名前を変えたときにここで落ちるようにしておく。
 */
describe('手入力データのバックアップ往復', () => {
  const MANUAL_RECORDS: readonly StoredRecord[] = [
    {
      id: 'bu-1',
      collection: 'business-units',
      createdAt: 3,
      updatedAt: 3,
      data: { name: '物販事業', category: '小売', startedOn: '2024-04' },
    },
    {
      id: 'mm-1',
      collection: 'manual-metrics',
      createdAt: 2,
      updatedAt: 2,
      data: { scope: 'github', label: '想定客単価', value: 4800, unit: 'yen', businessId: 'bu-1' },
    },
    {
      id: 'mo-1',
      collection: 'manual-overrides',
      createdAt: 1,
      updatedAt: 1,
      data: { scope: 'overview', path: 'kpi.revenue', value: 12345678 },
    },
  ];

  it('3 つの collection が中身ごと往復する', async () => {
    const restored = await parseBackup(await serializeBackup(MANUAL_RECORDS));
    expect(restored).toEqual(MANUAL_RECORDS);
  });

  it('collection 名が復元側の規則を満たす（満たさないと黙って捨てられる）', () => {
    const safe = /^[a-z][a-z0-9-]{0,63}$/;
    for (const r of MANUAL_RECORDS) {
      expect(safe.test(r.collection), r.collection).toBe(true);
    }
  });

  it('事業と数値の結び付き (businessId) が保たれる', async () => {
    const restored = await parseBackup(await serializeBackup(MANUAL_RECORDS));
    const metric = restored.find((r) => r.collection === 'manual-metrics');
    const unit = restored.find((r) => r.collection === 'business-units');
    expect(metric?.data['businessId']).toBe(unit?.id);
  });

  it('置き換えの scope とパスが保たれる', async () => {
    const restored = await parseBackup(await serializeBackup(MANUAL_RECORDS));
    const ov = restored.find((r) => r.collection === 'manual-overrides');
    expect(ov?.data).toEqual({ scope: 'overview', path: 'kpi.revenue', value: 12345678 });
  });

  it('他のデータと混ざっていても失われない', async () => {
    const mixed = [...RECORDS, ...MANUAL_RECORDS];
    const restored = await parseBackup(await serializeBackup(mixed));
    expect(restored).toHaveLength(mixed.length);
    for (const c of ['business-units', 'manual-metrics', 'manual-overrides']) {
      expect(restored.some((r) => r.collection === c), c).toBe(true);
    }
  });
});

/*
 * **平文バックアップの SHA-256 が守るもの・守らないもの。**
 *
 * 2026-08-22 まで、モジュールの説明にも画面の文言にも
 * `docs/DATA_PROTECTION.md` にも「SHA-256 で**改ざん検知**」と書いてあった。
 * **鍵の無いハッシュを同じファイルの中に置いても、改ざんは検知できない** ——
 * 中身を書き換える人は、続けて checksum を計算し直すだけでよい。
 *
 * ここはその限界を**実行できる事実**として置いてある。文言だけ直すと、
 * 次に読んだ人が「せっかく checksum があるのだから改ざん検知と書こう」と
 * 戻しうる。この検査は**攻撃が成功することを期待している**ので、
 * 消さずに読むこと —— 直すべきは「守れる」という記述のほうではなく、
 * 改ざんが心配なら暗号化バックアップを使う、という運用のほうである。
 */
describe('平文バックアップの SHA-256 が守るもの・守らないもの', () => {
  it('【守らない】書き換えて checksum を計算し直すと、復元は通る', async () => {
    const original = await serializeBackup(RECORDS);
    const parsed = JSON.parse(original) as { checksum: string; records: StoredRecord[] };

    // 攻撃者の操作は 2 手だけ —— 中身を書き換え、checksum を計算し直す。
    parsed.records = [
      { id: 'a', collection: 'sales', createdAt: 2, updatedAt: 2, data: { amount: 999_999 } },
    ];
    parsed.checksum = await sha256Hex(JSON.stringify(parsed.records));

    const restored = await parseBackup(JSON.stringify(parsed));
    expect(restored).toHaveLength(1);
    expect(restored[0]!.data).toEqual({ amount: 999_999 });
  });

  it('【守る】checksum を直さずに書き換えれば落ちる (破損検知)', async () => {
    const original = await serializeBackup(RECORDS);
    await expect(parseBackup(original.replace('100', '999999'))).rejects.toThrow(
      /チェックサム不一致/,
    );
  });

  it('【守る】失敗の文言が「改ざん」を主張していない', async () => {
    const original = await serializeBackup(RECORDS);
    await expect(parseBackup(original.replace('100', '999999'))).rejects.toThrow(
      /破損/,
    );
    await expect(parseBackup(original.replace('100', '999999'))).rejects.not.toThrow(
      /改ざん/,
    );
  });

  /*
   * **改ざんに耐えるのは暗号化バックアップのほう。** AES-GCM の認証タグは、
   * パスフレーズを知らない改変を復号の時点で落とす —— 上と違い、
   * 「計算し直す」手が無い。
   */
  it('暗号化バックアップは 1 バイト変えるだけで復号に失敗する', async () => {
    const enc = await serializeEncryptedBackup(RECORDS, 'correct horse battery staple');
    const env = JSON.parse(enc) as { payload: { ct: string } };
    const ct = env.payload.ct;
    // base64 の 1 文字を別の文字へ倒す (元と同じにならない選び方)。
    env.payload.ct = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);

    await expect(
      parseBackup(JSON.stringify(env), 'correct horse battery staple'),
    ).rejects.toThrow();
  });

  it('暗号化バックアップは正しいパスフレーズなら往復する (誤検知しない)', async () => {
    const enc = await serializeEncryptedBackup(RECORDS, 'correct horse battery staple');
    const out = await parseBackup(enc, 'correct horse battery staple');
    expect(out).toEqual(RECORDS);
  });
});

/*
 * **画面の文言も留める。**
 *
 * 誤った主張が最後に残るのは利用者の目に触れる文字列である。ここが
 * 「SHA-256 で改ざん検知」に戻っても、`backup.ts` の検査は緑のままになる ——
 * 実装は正しいのに説明だけが嘘、という一番たちの悪い形になる。
 *
 * 語そのものは禁じられない (正しい文面でも「改ざんに備えるには」と出てくる)。
 * 代わりに**打ち消しの一文が在ること**を要求する。主張を戻す人は、
 * この一文を消さないと書けない。
 */
describe('バックアップ画面の文言 (誤った保証を書き戻せないように)', () => {
  const PANEL = readFileSync(
    new URL('../../components/BackupPanel.tsx', import.meta.url),
    'utf8',
  );

  it('SHA-256 は破損検知だと書いてある', () => {
    expect(PANEL).toContain('SHA-256 で破損検知');
  });

  it('改ざん検知ではないと明示的に打ち消している', () => {
    expect(PANEL).toContain('改ざん検知ではありません');
  });

  it('改ざんに備える道 (暗号化) を案内している', () => {
    expect(PANEL).toMatch(/AES-GCM/);
    expect(PANEL).toMatch(/パスワードを指定/);
  });

  it('「SHA-256 で改ざん検知」と書いていない', () => {
    expect(PANEL).not.toMatch(/SHA-?256\s*(で|による)?\s*改ざん検知(?!ではありません)/);
  });
});
