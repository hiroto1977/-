# 完全性チェーン（Integrity Chain）

> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。
> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。

- アルゴリズム: `sha256`
- ブロック数: 2
- 先頭(genesis)ハッシュ: `773e7442591bb2286a73553c29b46d049e5f92927a69c38e7075d89496d15ec9`
- 末尾(tip)ハッシュ: `5872f6c23c534bf0df1c4d51478e67dc3c8b3c0f7afc30c17186a796f74bec5e`
- 保護対象: 15 ファイル

## ブロック

| # | merkleRoot (先頭16) | prevHash (先頭16) | hash (先頭16) | note |
| --- | --- | --- | --- | --- |
| 0 | `6c2cc5354cb080c4` | `0000000000000000` | `773e7442591bb228` | genesis |
| 1 | `139a9c7c85736a5a` | `773e7442591bb228` | `5872f6c23c534bf0` | update ci.yml |

## 保護対象ファイル

- `.github/workflows/ci.yml`
- `docs/SECURITY_CHAIN.md`
- `scripts/integrity-chain.cjs`
- `scripts/security-audit.sh`
- `scripts/setup-linux.sh`
- `scripts/setup-obsidian-docker.sh`
- `src/main/oauth.ts`
- `src/main/secrets.ts`
- `src/preload/preload.ts`
- `src/renderer/security/LockScreen.tsx`
- `src/renderer/security/autoLock.ts`
- `src/renderer/security/dataCrypto.ts`
- `src/renderer/security/mnemonic.ts`
- `src/renderer/security/vault.ts`
- `src/renderer/security/webauthn.ts`
