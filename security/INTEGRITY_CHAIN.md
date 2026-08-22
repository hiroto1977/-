# 完全性チェーン（Integrity Chain）

> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。
> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。

- アルゴリズム: `sha256`
- ブロック数: 41
- 先頭(genesis)ハッシュ: `773e7442591bb2286a73553c29b46d049e5f92927a69c38e7075d89496d15ec9`
- 末尾(tip)ハッシュ: `9369eedc569a22e62ef9e519f54a819eae3840d0fc990259fed05be47c2116db`
- 保護対象: 18 ファイル

## ブロック

| # | merkleRoot (先頭16) | prevHash (先頭16) | hash (先頭16) | note |
| --- | --- | --- | --- | --- |
| 0 | `6c2cc5354cb080c4` | `0000000000000000` | `773e7442591bb228` | genesis |
| 1 | `139a9c7c85736a5a` | `773e7442591bb228` | `5872f6c23c534bf0` | update ci.yml |
| 2 | `42703eb4c2162b18` | `5872f6c23c534bf0` | `39cef8f4fd753a7e` | update LockScreen.tsx |
| 3 | `8562ab8da46fbc1d` | `39cef8f4fd753a7e` | `f5b5925a555d09a8` | update ci.yml |
| 4 | `ceada09c34c616c1` | `f5b5925a555d09a8` | `b5aa9b099a70bc82` | update oauth.ts,LockScreen.tsx,dataCrypto.ts,vault.ts |
| 5 | `7b26b4fed70912f5` | `b5aa9b099a70bc82` | `7ad1f5e36ee1dc86` | update SECURITY_CHAIN.md,secrets.ts,preload.ts,LockScreen.tsx,webauthn.ts |
| 6 | `81eab83220a747f8` | `7ad1f5e36ee1dc86` | `8e44b1433fa4c9b1` | update ci.yml |
| 7 | `7ced0e0cf1093e16` | `8e44b1433fa4c9b1` | `780b337043df5bbe` | update ci.yml,oauth.ts |
| 8 | `fbbaa6ae22b70775` | `780b337043df5bbe` | `050c3396099b4a7f` | update ci.yml |
| 9 | `7b28671af35624fc` | `050c3396099b4a7f` | `1af7a1bdf6d2f3e2` | update ci.yml |
| 10 | `113a5991e5d1c5e8` | `1af7a1bdf6d2f3e2` | `1375df2b085cb15f` | update ci.yml |
| 11 | `4f974e0ced822a3d` | `1375df2b085cb15f` | `90a68b497432af20` | update sw.js,SECURITY_CHAIN.md,integrity-chain.cjs,dataCrypto.ts,vault.ts |
| 12 | `25d80566e373924d` | `90a68b497432af20` | `968b3a29474e976a` | update ci.yml |
| 13 | `5411858768d05b50` | `968b3a29474e976a` | `52d733dfc8650102` | update dataCrypto.ts,vault.ts |
| 14 | `15140f816e52b1a6` | `52d733dfc8650102` | `6d26505e456c051e` | update preload.ts |
| 15 | `cd7f3d0bd82b0867` | `6d26505e456c051e` | `91cc0100bee19344` | update ci.yml |
| 16 | `bd60cea0ba1f06bf` | `91cc0100bee19344` | `ec879526770ae31a` | update ci.yml |
| 17 | `53bf9a0942d531ef` | `ec879526770ae31a` | `961417e1d21df8fc` | update ci.yml |
| 18 | `5a0e4a9bb021daea` | `961417e1d21df8fc` | `9be78117743ad616` | update preload.ts |
| 19 | `288a96658cd46118` | `9be78117743ad616` | `bcdfc5b3865dfb75` | update secrets.ts |
| 20 | `140373ce2f88f82e` | `bcdfc5b3865dfb75` | `cc30608787e41e98` | update ci.yml,preload.ts |
| 21 | `09700e1b234e5483` | `cc30608787e41e98` | `731e8d6bc43ab0df` | update autoLock.ts |
| 22 | `15be43b27c91a525` | `731e8d6bc43ab0df` | `928eb6b845dc7dbf` | update ci.yml |
| 23 | `777484db066f49ca` | `928eb6b845dc7dbf` | `4598c80adc8d1d60` | update vault.ts |
| 24 | `52efefec055e0f0e` | `4598c80adc8d1d60` | `aba70d13aa2578f4` | update autoLock.ts |
| 25 | `515585da476b85ca` | `aba70d13aa2578f4` | `06beca0c2fb5e9d8` | update oauth.ts |
| 26 | `5d75a0005ce4ca85` | `06beca0c2fb5e9d8` | `2c1decf2e2cd64c3` | update integrity-chain.cjs,exportPaths.ts |
| 27 | `b57bf84f924d641f` | `2c1decf2e2cd64c3` | `a44212309d7e404f` | update SECURITY_CHAIN.md |
| 28 | `1f14c7774cb560ed` | `a44212309d7e404f` | `6b0fa2be7d99c4dc` | update webauthn.ts |
| 29 | `ed9be8bb49cef58a` | `6b0fa2be7d99c4dc` | `03386b67540506aa` | update secrets.ts |
| 30 | `205d9e9bde0c760c` | `03386b67540506aa` | `2966bf3530b54e8b` | update dataCrypto.ts |
| 31 | `8e4745ba19503490` | `2966bf3530b54e8b` | `7a725e72993ad0cf` | update oauth.ts |
| 32 | `ceb0799db6e8f70e` | `7a725e72993ad0cf` | `7eaa2e78100f46cd` | update ci.yml |
| 33 | `2a2cf1d61abda165` | `7eaa2e78100f46cd` | `d46240e2bd50fb94` | update ci.yml |
| 34 | `ee23eb5407d80b3b` | `d46240e2bd50fb94` | `1eb9072d4f475921` | update secrets.ts |
| 35 | `b4420d6031d3bd33` | `1eb9072d4f475921` | `e97c30f8c6151afd` | update integrity-chain.cjs,shellOpenGate.ts |
| 36 | `035c94da7e80d563` | `e97c30f8c6151afd` | `4c4364bc649c05ad` | update LockScreen.tsx |
| 37 | `7a567cd02f12ed6f` | `4c4364bc649c05ad` | `4413dfe237c2450a` | update ci.yml |
| 38 | `eb41559121ed811e` | `4413dfe237c2450a` | `37c33e6ffdd3d3a9` | update integrity-chain.cjs |
| 39 | `51081cda6da0d927` | `37c33e6ffdd3d3a9` | `843f298c2066b991` | update integrity-chain.cjs |
| 40 | `0d18f2dc0579e068` | `843f298c2066b991` | `9369eedc569a22e6` | update integrity-chain.cjs |

## 保護対象ファイル

- `.github/workflows/ci.yml`
- `assets/sw.js`
- `docs/SECURITY_CHAIN.md`
- `scripts/integrity-chain.cjs`
- `scripts/security-audit.sh`
- `scripts/setup-linux.sh`
- `scripts/setup-obsidian-docker.sh`
- `src/main/clients/exportPaths.ts`
- `src/main/oauth.ts`
- `src/main/secrets.ts`
- `src/main/shellOpenGate.ts`
- `src/preload/preload.ts`
- `src/renderer/security/LockScreen.tsx`
- `src/renderer/security/autoLock.ts`
- `src/renderer/security/dataCrypto.ts`
- `src/renderer/security/mnemonic.ts`
- `src/renderer/security/vault.ts`
- `src/renderer/security/webauthn.ts`
