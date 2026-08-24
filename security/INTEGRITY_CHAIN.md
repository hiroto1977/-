# 完全性チェーン（Integrity Chain）

> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。
> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。

- アルゴリズム: `sha256`
- ブロック数: 86
- 先頭(genesis)ハッシュ: `773e7442591bb2286a73553c29b46d049e5f92927a69c38e7075d89496d15ec9`
- 末尾(tip)ハッシュ: `7c85292a20963e2d83bc6a1be75f259daea7c406158dc7277b398d7e7ffa6e13`
- 保護対象: 36 ファイル

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
| 41 | `0d9c1bf0c240e70f` | `9369eedc569a22e6` | `d2d21bf8d3f18fcb` | update release.yml,electron-builder.json,integrity-chain.cjs,main.ts,proxy.ts,redact.ts |
| 42 | `66b23fe88ac77099` | `d2d21bf8d3f18fcb` | `1c8edeabe6b441a0` | update ci.yml |
| 43 | `2f0d929bbc594e96` | `1c8edeabe6b441a0` | `388b30e642f963d0` | update main.ts |
| 44 | `f30d6f340b5851f7` | `388b30e642f963d0` | `39932a8323ed5495` | update integrity-chain.cjs,atomicWrite.ts,bip39-wordlist.ts,aiEndpoint.ts,controlChars.ts,cryptoParams.ts |
| 45 | `d70cf531745613cc` | `39932a8323ed5495` | `a53b396703fa9230` | update SECURITY_CHAIN.md |
| 46 | `7fa3a0097abeb8b6` | `a53b396703fa9230` | `008b4bc1e5d502c5` | update oauth.ts |
| 47 | `20258601ec2a1f91` | `008b4bc1e5d502c5` | `dc1c1367e23c5139` | update oauth.ts,dataCrypto.ts |
| 48 | `b29befda45b0a687` | `dc1c1367e23c5139` | `d8a3e40df752f5b0` | update oauth.ts |
| 49 | `8da42131c8c4976c` | `d8a3e40df752f5b0` | `60782af95933e736` | update oauth.ts |
| 50 | `c92679acc5f65b4e` | `60782af95933e736` | `3e29ce7919dadd4e` | update integrity-chain.cjs,recordCipher.ts |
| 51 | `676ee12ca34cc3b5` | `3e29ce7919dadd4e` | `bcce6ca2fa84f57e` | update SECURITY_CHAIN.md |
| 52 | `084101963c5bf414` | `bcce6ca2fa84f57e` | `53c73eba8603751d` | update main.ts |
| 53 | `612892c46ca5394e` | `53c73eba8603751d` | `c72af1f29ec6f57c` | update pages.yml,integrity-chain.cjs |
| 54 | `3820b9dd47c25323` | `c72af1f29ec6f57c` | `d0e7741ca50713f0` | update SECURITY_CHAIN.md |
| 55 | `0d62ec64e07e12b8` | `d0e7741ca50713f0` | `8a05d8af1f72a0a5` | update oauth.ts |
| 56 | `e2c25fcd3b41b6ed` | `8a05d8af1f72a0a5` | `7006abcdf2cef47c` | update integrity-chain.cjs,externalUrlGate.ts,main.ts |
| 57 | `28c732be57a18770` | `7006abcdf2cef47c` | `470fa2f23af089ce` | update main.ts |
| 58 | `30a17058c1a7dce6` | `470fa2f23af089ce` | `ae8d54d40a2be340` | update oauth.ts |
| 59 | `75ffb28c877bdca7` | `ae8d54d40a2be340` | `dcad7f795f03c5e2` | update proxy.ts |
| 60 | `e4126e4eac6d8fdc` | `dcad7f795f03c5e2` | `eeac0f5276dd3c49` | update integrity-chain.cjs,proxy.ts,httpLimits.ts |
| 61 | `2372625cdbcd27fd` | `eeac0f5276dd3c49` | `f51ba095062ecda5` | update aiEndpoint.ts |
| 62 | `927cf69ec924f7a3` | `f51ba095062ecda5` | `cd8f66d63230cc1b` | update LockScreen.tsx |
| 63 | `dd5ef6ac3d3652bc` | `cd8f66d63230cc1b` | `1972d6f2f55469fd` | update oauth.ts,httpLimits.ts |
| 64 | `b15b3fdcd5f333e8` | `1972d6f2f55469fd` | `8bc5c0003c47e292` | update integrity-chain.cjs,types.ts |
| 65 | `46767fc14a000f1d` | `8bc5c0003c47e292` | `dfda63e2c72a718a` | update integrity-chain.cjs |
| 66 | `09d4b6567698d5ad` | `dfda63e2c72a718a` | `b51a09ec99d231b8` | update main.ts |
| 67 | `e40912bd16556ec0` | `b51a09ec99d231b8` | `06da6bae65e13f54` | update integrity-chain.cjs,main.ts,externalUrlGate.ts,-externalUrlGate.ts |
| 68 | `7c8b38e31228fa97` | `06da6bae65e13f54` | `a11023d976807870` | update secrets.ts,preload.ts |
| 69 | `e38060290c21a34d` | `a11023d976807870` | `59cfb89aa0519ee4` | update vault.ts |
| 70 | `7c7426079d9b6739` | `59cfb89aa0519ee4` | `4b5501fa2e49d813` | update redact.ts |
| 71 | `9322d2fff937e707` | `4b5501fa2e49d813` | `579596b82b618d4d` | update secrets.ts |
| 72 | `000c279d4bdfdc3d` | `579596b82b618d4d` | `33518fb27b28f427` | update ci.yml |
| 73 | `68b50be3716f9a64` | `33518fb27b28f427` | `708ab4c3cd1e87d1` | update proxy.ts |
| 74 | `1e8ca825cf6ca6fa` | `708ab4c3cd1e87d1` | `e596c96059156a1f` | update atomicWrite.ts |
| 75 | `c66a242529446c63` | `e596c96059156a1f` | `29d74128a50ebacd` | update exportPaths.ts |
| 76 | `5ce3b7beacc9b34c` | `29d74128a50ebacd` | `fbf4cef13d97cacd` | update redact.ts |
| 77 | `fb92b028496dec7a` | `fbf4cef13d97cacd` | `d7313537088d8825` | update ci.yml |
| 78 | `52ea2bdc47a0cadc` | `d7313537088d8825` | `04847bd2791be297` | update ci.yml |
| 79 | `41f17ed817811e3c` | `04847bd2791be297` | `5252080b2bcfac7f` | update ci.yml |
| 80 | `7db33c5fdd348177` | `5252080b2bcfac7f` | `3f9ae19a3e103906` | update redact.ts |
| 81 | `de16c7fa5a4e4451` | `3f9ae19a3e103906` | `2f5bb0b889447408` | update oauth.ts |
| 82 | `947d1c7838134fea` | `2f5bb0b889447408` | `9de3831aaca25dd3` | update ci.yml |
| 83 | `a545ef603c75b43b` | `9de3831aaca25dd3` | `e1f899cbe558eef9` | update ci.yml,release.yml |
| 84 | `bd08f3e0cc53084d` | `e1f899cbe558eef9` | `bee8216b40c71916` | update vault.ts |
| 85 | `ef73f4bf2cb5f1c1` | `bee8216b40c71916` | `7c85292a20963e2d` | update ci.yml |

## 保護対象ファイル

- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/release.yml`
- `assets/sw.js`
- `docs/SECURITY_CHAIN.md`
- `electron-builder.json`
- `scripts/integrity-chain.cjs`
- `scripts/security-audit.sh`
- `scripts/setup-linux.sh`
- `scripts/setup-obsidian-docker.sh`
- `src/main/atomicWrite.ts`
- `src/main/clients/exportPaths.ts`
- `src/main/clients/types.ts`
- `src/main/main.ts`
- `src/main/oauth.ts`
- `src/main/secrets.ts`
- `src/main/shellOpenGate.ts`
- `src/preload/preload.ts`
- `src/renderer/data/recordCipher.ts`
- `src/renderer/network/proxy.ts`
- `src/renderer/security/LockScreen.tsx`
- `src/renderer/security/autoLock.ts`
- `src/renderer/security/bip39-wordlist.ts`
- `src/renderer/security/dataCrypto.ts`
- `src/renderer/security/mnemonic.ts`
- `src/renderer/security/vault.ts`
- `src/renderer/security/webauthn.ts`
- `src/shared/aiEndpoint.ts`
- `src/shared/controlChars.ts`
- `src/shared/cryptoParams.ts`
- `src/shared/externalUrlGate.ts`
- `src/shared/httpLimits.ts`
- `src/shared/proxyEndpoint.ts`
- `src/shared/redact.ts`
- `src/shared/tokenInput.ts`
- `src/shared/vaultToken.ts`
