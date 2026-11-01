# 完全性チェーン（Integrity Chain）

> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。
> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。

- アルゴリズム: `sha256`
- ブロック数: 421
- 先頭(genesis)ハッシュ: `773e7442591bb2286a73553c29b46d049e5f92927a69c38e7075d89496d15ec9`
- 末尾(tip)ハッシュ: `e22495141477e0be4992b676bcb0ccfa4e3d3390b37c50329c9faae71e21e532`
- 保護対象: 160 ファイル

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
| 86 | `32f5de0c68fcd8b3` | `7c85292a20963e2d` | `4321f481d6b2f89e` | update vault.ts |
| 87 | `9ec3ea8e3f255317` | `4321f481d6b2f89e` | `ca03bf32fd5e2880` | update vault.ts |
| 88 | `1cc3c7c819033fa4` | `ca03bf32fd5e2880` | `204b8b0708d79483` | update integrity-chain.cjs,assistantMarkdown.ts,fsa.ts,liveRead.ts,pkce.ts,pkceSession.ts |
| 89 | `49377d27b19a6e56` | `204b8b0708d79483` | `5b544e6e0ef11c95` | update integrity-chain.cjs,-updateCheck.ts |
| 90 | `b8417be6fe754814` | `5b544e6e0ef11c95` | `fe3e27013cc3bde7` | update integrity-chain.cjs |
| 91 | `89d8c0bb54c87253` | `fe3e27013cc3bde7` | `97de5be0cc01b5b3` | update ci.yml |
| 92 | `4d24ac82d6358f12` | `97de5be0cc01b5b3` | `ca4756441f02053d` | update ci.yml |
| 93 | `20e2afaa33167f2e` | `ca4756441f02053d` | `33fa48c202b886fe` | update scanTarget.ts |
| 94 | `417a7b5e911dd823` | `33fa48c202b886fe` | `3b41426a860662ff` | update main.ts |
| 95 | `605adcfbeefa6f12` | `3b41426a860662ff` | `acec7c30251a4fac` | update secrets.ts,preload.ts |
| 96 | `79ec40aad4a635f3` | `acec7c30251a4fac` | `d26a31b3b1ca426f` | update ci.yml |
| 97 | `fc77a8407d70d0a9` | `d26a31b3b1ca426f` | `c0bad63f953a758b` | update autoLock.ts |
| 98 | `0bc6dee62fd2f9d4` | `c0bad63f953a758b` | `27840c689469a04b` | update exportPaths.ts |
| 99 | `56e9e52cb3f2b26d` | `27840c689469a04b` | `aade7370faad4223` | update exportPaths.ts,main.ts |
| 100 | `c460739fd7400dfe` | `aade7370faad4223` | `48b810e266ab12e4` | update vault.ts |
| 101 | `9bc6c9a2ae44fe6f` | `48b810e266ab12e4` | `d8249fc2178adce8` | update externalUrlGate.ts |
| 102 | `52148ae69d9efc02` | `d8249fc2178adce8` | `b94cdfba77228b9c` | update proxy.ts |
| 103 | `b36b57246cb84db1` | `b94cdfba77228b9c` | `fe9ffd71a59311ff` | update ci.yml |
| 104 | `24c7d7c92056d026` | `fe9ffd71a59311ff` | `799bb36e1c1beaae` | update proxy.ts |
| 105 | `553015cbe05446f0` | `799bb36e1c1beaae` | `b8506ca1e4e8eea7` | update pages.yml |
| 106 | `7c2d93a93f04cada` | `b8506ca1e4e8eea7` | `2a2548b94c15b3ce` | update release.yml |
| 107 | `89f05c9e3292912e` | `2a2548b94c15b3ce` | `22de0027a1373b63` | update ci.yml |
| 108 | `99a8724e19507999` | `22de0027a1373b63` | `981d7c69db7aa3a3` | update manifest.webmanifest,inject-pwa.cjs,inline-html.cjs,integrity-chain.cjs |
| 109 | `e63ba4b38732a2cd` | `981d7c69db7aa3a3` | `97f5c79e5f3ffca8` | update release.yml |
| 110 | `f03d68a5406a3188` | `97f5c79e5f3ffca8` | `f6565ab1a87350db` | update integrity-chain.cjs,make-autoinstall.sh,make-live-usb.sh,migrate.sh |
| 111 | `f44413e6c060daae` | `f6565ab1a87350db` | `ee534ceb03de590a` | update SECURITY_CHAIN.md |
| 112 | `0c62d527ce4e905a` | `ee534ceb03de590a` | `854dbbbc470a4114` | update exportPaths.ts |
| 113 | `f5ca43b4a203083a` | `854dbbbc470a4114` | `08670d9986839cdd` | update dataCrypto.ts,vault.ts |
| 114 | `ec4cf0ebe755a053` | `08670d9986839cdd` | `a3c506b433488138` | update proxy.ts |
| 115 | `cf1fe661aac6b08f` | `a3c506b433488138` | `ac11ce83296ebf17` | update inject-pwa.cjs,inline-html.cjs |
| 116 | `1278d07bf02bb85b` | `ac11ce83296ebf17` | `7128afd9d23124e0` | update integrity-chain.cjs,safe-vault-write.cjs |
| 117 | `fce93a383e3a5521` | `7128afd9d23124e0` | `f5a376e5e8c16518` | update SECURITY_CHAIN.md |
| 118 | `85bb93031d8ad922` | `f5a376e5e8c16518` | `1e845491ca358c08` | update SECURITY_CHAIN.md |
| 119 | `4f8c4d777803e664` | `1e845491ca358c08` | `f2210321e55a6838` | update manifest.webmanifest |
| 120 | `eda1181974cfa51c` | `f2210321e55a6838` | `0aee7468bb3a0750` | update release.yml |
| 121 | `4f4f4818cebddc6e` | `0aee7468bb3a0750` | `e72a3eedfc053c48` | update release.yml,types.ts,oauth.ts,pkce.ts,vault.ts,httpLimits.ts |
| 122 | `1ebdc946a82a5d0c` | `e72a3eedfc053c48` | `f93a4f1b4f28a2c2` | update types.ts |
| 123 | `c0c67fa03bc8b0a1` | `f93a4f1b4f28a2c2` | `0eca7aa51e1d1156` | update integrity-chain.cjs |
| 124 | `0e00cb7c4c616f07` | `0eca7aa51e1d1156` | `0cf58b147a316eea` | update checksum-release.cjs,integrity-chain.cjs,lint-artifact-csp.cjs,lint-sample-data.cjs,smoke-app.cjs,verify-release-artifacts.cjs |
| 125 | `1f3273938b4f1a1f` | `0cf58b147a316eea` | `477bcacac053e527` | update integrity-chain.cjs |
| 126 | `f575eab48833ed49` | `477bcacac053e527` | `70868e145be8be65` | update SECURITY_CHAIN.md |
| 127 | `79e35118e8983854` | `70868e145be8be65` | `72f858d415bcb6d3` | update types.ts,httpLimits.ts |
| 128 | `7515ebbac8ea1d18` | `72f858d415bcb6d3` | `93a92f590da76238` | update httpLimits.ts |
| 129 | `e1390ffa2f146ddf` | `93a92f590da76238` | `24b8addc0d5b5f1d` | update assistantMarkdown.ts |
| 130 | `53dda0437603aaf5` | `24b8addc0d5b5f1d` | `bd88542958788ad2` | update redact.ts |
| 131 | `ba33405371f29494` | `bd88542958788ad2` | `05b2f8fffdd9e9bd` | update exportPaths.ts |
| 132 | `ea5c5619f8309e3f` | `05b2f8fffdd9e9bd` | `9654bc014293813d` | update pkce.ts |
| 133 | `bcd1eee5c221c0b5` | `9654bc014293813d` | `905d40c2ce690ddb` | update atomicWrite.ts,oauth.ts |
| 134 | `d8f041bfce652fac` | `905d40c2ce690ddb` | `84063d8cdda12e5a` | update proxy.ts,httpLimits.ts |
| 135 | `043a76d9af502aee` | `84063d8cdda12e5a` | `3c2d0c9785f17788` | update vault.ts |
| 136 | `c3152c18ec46ead4` | `3c2d0c9785f17788` | `9f3b1eedd3df38b3` | update vault.ts |
| 137 | `9cf1555905826674` | `9f3b1eedd3df38b3` | `900649295e813ac4` | update main.ts |
| 138 | `e8bc6ccc0afcddab` | `900649295e813ac4` | `ce9a7e0bd30a6c36` | update main.ts |
| 139 | `a3308a39c2c28954` | `ce9a7e0bd30a6c36` | `fafa5a0c3110cea9` | update atomicWrite.ts |
| 140 | `c776e99e54a7f9bc` | `fafa5a0c3110cea9` | `2601e7c68364cc6b` | update integrity-chain.cjs,assistant.ts |
| 141 | `db33e6606dcb0ff7` | `2601e7c68364cc6b` | `a608dedaf93d15f6` | update integrity-chain.cjs,chat.ts,credentials.ts,providers.ts |
| 142 | `4809c27beb714f99` | `a608dedaf93d15f6` | `69589af155d3ae5d` | update ci.yml |
| 143 | `8aea0c2f52f8138b` | `69589af155d3ae5d` | `400e4edecfbd6f11` | update ci.yml |
| 144 | `81a3ce85f9924fbe` | `400e4edecfbd6f11` | `038f7e0885f100bb` | update proxy.ts |
| 145 | `f57c861f3614642e` | `038f7e0885f100bb` | `d164f7802730003f` | update fsa.ts,proxy.ts |
| 146 | `91f3f1436e940d03` | `d164f7802730003f` | `df69a8f51b94e6db` | update proxy.ts |
| 147 | `06327687108ab3e1` | `df69a8f51b94e6db` | `fd31b6ddfc92568a` | update proxy.ts |
| 148 | `92e0b65f731bfab2` | `fd31b6ddfc92568a` | `ad0ff862e661ea85` | update proxy.ts |
| 149 | `be167b4609dfb65c` | `ad0ff862e661ea85` | `6eb22f58157533eb` | update proxy.ts |
| 150 | `f332d6a8a37247dc` | `6eb22f58157533eb` | `98bae01596737bac` | update main.ts,secrets.ts |
| 151 | `fdd11550ff27c3e4` | `98bae01596737bac` | `89246daa726d738b` | update LockScreen.tsx,vault.ts |
| 152 | `f606793c30cff64a` | `89246daa726d738b` | `efc501487f020d47` | update pkceSession.ts |
| 153 | `f22f939447993c7a` | `efc501487f020d47` | `93584bb44ebbd8bd` | update pkceSession.ts |
| 154 | `e9cecef70974c4fc` | `93584bb44ebbd8bd` | `372531b5494570e1` | update integrity-chain.cjs,localWrite.ts |
| 155 | `6cefc543f6675d95` | `372531b5494570e1` | `e7983061ca3ecf07` | update ci.yml |
| 156 | `50ac0c3c641e6c0a` | `e7983061ca3ecf07` | `e84bab6459b71da0` | update lockWorkspace.ts |
| 157 | `28202b616742428d` | `e84bab6459b71da0` | `a1917593c3509668` | update LockScreen.tsx,vault.ts |
| 158 | `9e58c4998b7853e9` | `a1917593c3509668` | `807afadb0f0a2c8e` | update LockScreen.tsx,lockWorkspace.ts,vault.ts |
| 159 | `fe83631956352e68` | `807afadb0f0a2c8e` | `4fe9956bf0ba2aa0` | update lockWorkspace.ts |
| 160 | `0a37c64b7de8a45a` | `4fe9956bf0ba2aa0` | `ae1c8f4d8e2dc526` | update autoLock.ts,vault.ts |
| 161 | `b353d35eee046219` | `ae1c8f4d8e2dc526` | `042c87f96d9711cf` | update ci.yml |
| 162 | `27c309c5a2d868ea` | `042c87f96d9711cf` | `42c788b02cbc8242` | update secrets.ts,dataCrypto.ts |
| 163 | `4922e693b9c74d3d` | `42c788b02cbc8242` | `a187e057e798613c` | update assistant.ts |
| 164 | `476aae4a503b3eb1` | `a187e057e798613c` | `4672ca44bb47bf57` | update chat.ts,ollama.ts |
| 165 | `9d1cf881f3a4f986` | `4672ca44bb47bf57` | `1702b111a531873e` | update integrity-chain.cjs,assistant.ts |
| 166 | `4c31dcb1167e631d` | `1702b111a531873e` | `e6256ca397a19d88` | update atomicWrite.ts,secrets.ts |
| 167 | `0afc115ab54105d1` | `e6256ca397a19d88` | `e86b31d3468802d8` | update fsa.ts |
| 168 | `bb46d1384b5e1fae` | `e86b31d3468802d8` | `57c7cf667a7ee417` | update integrity-chain.cjs,eraseAll.ts,main.ts,secrets.ts,preload.ts,eraseReport.ts |
| 169 | `1d2446226be4c549` | `57c7cf667a7ee417` | `1d24807548cffbf3` | update main.ts,eraseReport.ts |
| 170 | `a5322af408e45912` | `1d24807548cffbf3` | `1b4d7633b405a714` | update ollama.ts |
| 171 | `be4bcb1f36477b8f` | `1b4d7633b405a714` | `62ea193ca4394f07` | update main.ts |
| 172 | `9a697517fefa6d02` | `62ea193ca4394f07` | `720192b295ce1200` | update pkce.ts |
| 173 | `3fe75a462c025e45` | `720192b295ce1200` | `b17be4721c89ceaf` | update localWrite.ts |
| 174 | `f81458429b0e5a9b` | `b17be4721c89ceaf` | `13893b909040ef22` | update pkce.ts,vault.ts |
| 175 | `ad1c9a552a1fffdc` | `13893b909040ef22` | `e2f7eacb42e3cb68` | update integrity-chain.cjs,dataCrypto.ts,vault.ts,webCrypto.ts |
| 176 | `20dfa75dd8e55ea1` | `e2f7eacb42e3cb68` | `f8b634ca56505704` | update integrity-chain.cjs,public-host-guard.cjs,proxy.ts |
| 177 | `32a23823dfb8765f` | `f8b634ca56505704` | `781a89c3713f97df` | update manifest.webmanifest |
| 178 | `bf6d7facedc77e05` | `781a89c3713f97df` | `bdf2a0cbc9bd7e20` | update localWrite.ts,pkce.ts,vault.ts |
| 179 | `61652a96ff1a5874` | `bdf2a0cbc9bd7e20` | `67f759ceadfc90e4` | update integrity-chain.cjs,inputCeiling.ts |
| 180 | `54e2597aafc6db7b` | `67f759ceadfc90e4` | `df0135fbbcecf630` | update inputCeiling.ts |
| 181 | `9df0a01dbedd16f2` | `df0135fbbcecf630` | `593ba511b74d9924` | update assistant.ts,aiEndpoint.ts,ollama.ts,proxyEndpoint.ts,redact.ts,scanTarget.ts |
| 182 | `9456dfd5cd8cbffa` | `593ba511b74d9924` | `e5449b2f42356f95` | update inputCeiling.ts |
| 183 | `b687da381815bb23` | `e5449b2f42356f95` | `8865af8a70c980f1` | update redact.ts |
| 184 | `05e1629c029f0bc4` | `8865af8a70c980f1` | `28f4a4dc3013f77b` | update dataCrypto.ts |
| 185 | `c3d3cf83929d972c` | `28f4a4dc3013f77b` | `c22afe999a4dcb52` | update vault.ts |
| 186 | `1d211e3379972955` | `c22afe999a4dcb52` | `540801a9343cac0d` | update recordCipher.ts,vault.ts,cryptoParams.ts |
| 187 | `18cc4589d4c75ad6` | `540801a9343cac0d` | `7f73963a4badea7f` | update dataCrypto.ts,cryptoParams.ts |
| 188 | `aefb1eeded50b9d8` | `7f73963a4badea7f` | `50fb909a763fa713` | update redact.ts |
| 189 | `16493095e76909bb` | `50fb909a763fa713` | `99603a884ce00f29` | update secrets.ts,vault.ts,tokenInput.ts |
| 190 | `b1355dbc7c0c258e` | `99603a884ce00f29` | `a4581b8db1377e1b` | update secrets.ts,vaultToken.ts |
| 191 | `b8a80c2a515f4d13` | `a4581b8db1377e1b` | `7e915fc8f9d06c05` | update ci.yml,atlassianSite.ts |
| 192 | `8cd4d58c6b655672` | `7e915fc8f9d06c05` | `fc5b41cfc9978320` | update assistant.ts,vault.ts,inputCeiling.ts |
| 193 | `9115266c561a5b6d` | `fc5b41cfc9978320` | `daad1efc40fe40a2` | update vault.ts |
| 194 | `d259d7978fe91ebd` | `daad1efc40fe40a2` | `7ef3df28e9c7c612` | update eraseAll.ts |
| 195 | `032d93072d4e0d99` | `7ef3df28e9c7c612` | `9da7169a68d4522e` | update migrate.sh |
| 196 | `18f586e7be21a7e1` | `9da7169a68d4522e` | `366767004bfcda84` | update secrets.ts,vaultToken.ts |
| 197 | `cde076c101d629d5` | `366767004bfcda84` | `e455dcde10bef152` | update integrity-chain.cjs,oauth.ts,pkce.ts,tokenResponse.ts |
| 198 | `0d6b93e73d8f0a33` | `e455dcde10bef152` | `d28a33840d12b6a8` | update types.ts |
| 199 | `f87f4e628848e70e` | `d28a33840d12b6a8` | `a74ff7db3b620e02` | update main.ts |
| 200 | `ed046f9a62fdfff2` | `a74ff7db3b620e02` | `57415ae713904a65` | update assistant.ts |
| 201 | `54478df571f93fd5` | `57415ae713904a65` | `5794484979a09ef7` | update redact.ts |
| 202 | `94818d10d81b4eca` | `5794484979a09ef7` | `1da3835fa97a4169` | update types.ts,oauth.ts,proxy.ts,pkce.ts,chat.ts,redact.ts |
| 203 | `ffd387afc1a8dfc3` | `1da3835fa97a4169` | `5974986ecab81edf` | update tokenInput.ts |
| 204 | `8ef84f2f2871a2f7` | `5974986ecab81edf` | `b9a1bfd8ee0fbae5` | update main.ts,oauth.ts,scanTarget.ts |
| 205 | `8425f5134a7245a9` | `b9a1bfd8ee0fbae5` | `0c1052919fac85f2` | update atlassianSite.ts |
| 206 | `17f73bba666c801a` | `0c1052919fac85f2` | `7dc897572ce9e709` | update scanTarget.ts |
| 207 | `bea2854f8d1ba41f` | `7dc897572ce9e709` | `64f02826d03bc6a9` | update integrity-chain.cjs |
| 208 | `4829002d97eb6601` | `64f02826d03bc6a9` | `1259de2343e18a25` | update integrity-chain.cjs,writeFieldLimits.ts |
| 209 | `f0b4a3c3337eb2e8` | `1259de2343e18a25` | `4d705ae7f96457a3` | update writeFieldLimits.ts |
| 210 | `2932bf3681e2eea9` | `4d705ae7f96457a3` | `bfc1d71cf6a4a382` | update redact.ts |
| 211 | `fcc875b846a2d307` | `bfc1d71cf6a4a382` | `c40edecfac623e07` | update ollama.ts,redact.ts |
| 212 | `3e4b3cc70e3c63c1` | `c40edecfac623e07` | `f15a9c1268c00628` | update oauth.ts |
| 213 | `97d738e849b8c4b3` | `f15a9c1268c00628` | `b2360eeb1c6a1345` | update oauth.ts |
| 214 | `8d31f43402ce6c9b` | `b2360eeb1c6a1345` | `2f148e8ad881657a` | update proxy.ts |
| 215 | `f0b70d7ce3910b83` | `2f148e8ad881657a` | `a6fbb3d158dd3865` | update proxy.ts |
| 216 | `778a52b4c2cafedb` | `a6fbb3d158dd3865` | `3291d13bf175cf84` | update integrity-chain.cjs,proxy.ts,headerValue.ts,proxyEndpoint.ts,tokenInput.ts |
| 217 | `f1d91fad0e60d976` | `3291d13bf175cf84` | `21426058e2257388` | update externalUrlGate.ts |
| 218 | `c7e80990ace3e969` | `21426058e2257388` | `94dab87df56f68a7` | update imageUrlGate.ts |
| 219 | `d8280db5b33036f7` | `94dab87df56f68a7` | `584ff738f2e54656` | update imageUrlGate.ts |
| 220 | `e4c14e4db43effcd` | `584ff738f2e54656` | `9081829e86e19cd9` | update integrity-chain.cjs,proxy.ts,imageUrlGate.ts,privateTarget.ts |
| 221 | `3867dd78d005fa8e` | `9081829e86e19cd9` | `010833de8c0136f5` | update types.ts,main.ts,oauth.ts,proxy.ts,pkce.ts,chat.ts |
| 222 | `9a221dc8a7b88486` | `010833de8c0136f5` | `ba43bcaff2f37520` | update main.ts |
| 223 | `3bad11657753ff7d` | `ba43bcaff2f37520` | `dbef2f67700de4b3` | update lint-sample-data.cjs |
| 224 | `41cc4592e2328e61` | `dbef2f67700de4b3` | `07ff990376947690` | update smoke-app.cjs,httpLimits.ts |
| 225 | `938ba9be71b39e54` | `07ff990376947690` | `6a49e8e08b5ff4c2` | update integrity-chain.cjs,artifact-freshness.cjs |
| 226 | `da67b59058ce8567` | `6a49e8e08b5ff4c2` | `6fee5d6ed429511f` | update integrity-chain.cjs,artifact-freshness.cjs |
| 227 | `bd20f5455715e558` | `6fee5d6ed429511f` | `cc12d4379bb34aaa` | update localWrite.ts |
| 228 | `b2f88a11db36b8e4` | `cc12d4379bb34aaa` | `4622ed7f0c87d56a` | update inject-pwa.cjs,main.ts,LockScreen.tsx |
| 229 | `6e0ef03411cb14e9` | `4622ed7f0c87d56a` | `fe61d314102bf9a8` | update LockScreen.tsx |
| 230 | `19cbcb46e8a814b5` | `fe61d314102bf9a8` | `1bb6f54ad8b44fa2` | update ci.yml,pages.yml,release.yml |
| 231 | `ff0d24df824d74da` | `1bb6f54ad8b44fa2` | `1c5bc4d25c104fa5` | update LockScreen.tsx |
| 232 | `b9c5cd1a1e1e1b52` | `1c5bc4d25c104fa5` | `026e19752fd23417` | update eraseAll.ts,main.ts,preload.ts |
| 233 | `4e6ba7f326282c1f` | `026e19752fd23417` | `356612b929b814c6` | update integrity-chain.cjs,windowPrefs.ts |
| 234 | `74dea58ee7310355` | `356612b929b814c6` | `1bb13503b433342c` | update integrity-chain.cjs,stateFile.ts |
| 235 | `f7c1d88e72bafbde` | `1bb13503b433342c` | `9d5cf2972655164e` | update redact.ts |
| 236 | `771ba090924652e0` | `9d5cf2972655164e` | `e40f7cb370ef3d37` | update scanTarget.ts |
| 237 | `5fbf5ce3610df6c0` | `e40f7cb370ef3d37` | `73dadc5f8e9a2da5` | update atomicWrite.ts,secrets.ts |
| 238 | `7844589184c9bc41` | `73dadc5f8e9a2da5` | `c533a547beb0ad9c` | update dataCrypto.ts,vault.ts |
| 239 | `b3b796d83f7eb1ea` | `c533a547beb0ad9c` | `0328ccd0ab45e865` | update types.ts,oauth.ts,proxy.ts,pkce.ts,httpLimits.ts |
| 240 | `c46b55f220c9611b` | `0328ccd0ab45e865` | `ddca16c3dfb3c0b5` | update integrity-chain.cjs,oauth.ts,pkce.ts,constantTimeEquals.ts |
| 241 | `6406fd3ccaf97f32` | `ddca16c3dfb3c0b5` | `84bb7ee1fff35671` | update oauth.ts,pkce.ts,constantTimeEquals.ts,cryptoParams.ts,httpLimits.ts |
| 242 | `6260a8cd77642a91` | `84bb7ee1fff35671` | `eceb073a154f3b01` | update proxy.ts |
| 243 | `5531cfe750bcdc50` | `eceb073a154f3b01` | `6b3c13c99ea27ac2` | update eslint.config.js,integrity-chain.cjs,vite.config.ts,vitest.config.ts |
| 244 | `034c9619164aba7b` | `6b3c13c99ea27ac2` | `7a9ec8b816efb086` | update integrity-chain.cjs |
| 245 | `3e42e4291c23c54b` | `7a9ec8b816efb086` | `6215ffe67e69c320` | update PROXY_EXAMPLE.md,integrity-chain.cjs |
| 246 | `2003a5888b38d5c8` | `6215ffe67e69c320` | `dcb6a25543223906` | update vault.ts |
| 247 | `22b008549f16ae14` | `dcb6a25543223906` | `a37dbe4dd22650c9` | update fsa.ts |
| 248 | `6ac210dcc75635ef` | `a37dbe4dd22650c9` | `f1b6f5d32bf203ff` | update manifest.webmanifest,inject-pwa.cjs |
| 249 | `2271b65879a4c026` | `f1b6f5d32bf203ff` | `5b4b35d23c050a51` | update settings.json,integrity-chain.cjs |
| 250 | `4214f066246f7aa3` | `5b4b35d23c050a51` | `f02b2ea3944ebd26` | update integrity-chain.cjs |
| 251 | `c8100c9a08e21559` | `f02b2ea3944ebd26` | `17aa34be3fdcc87f` | update 00-project.mdc,10-boundaries.mdc,20-gates.mdc,30-conventions.mdc,integrity-chain.cjs |
| 252 | `ff9eea1aa2624c70` | `17aa34be3fdcc87f` | `601c33c1e8dc731b` | update ollama.ts |
| 253 | `6f5a37a33b4ffa5e` | `601c33c1e8dc731b` | `fab34a09f75da080` | update integrity-chain.cjs,versionOrder.ts |
| 254 | `6fbacb7e8851b479` | `fab34a09f75da080` | `ae26e30e071e2e5c` | update integrity-chain.cjs,isoDate.ts,localDate.ts,ollama.ts |
| 255 | `1171c2ce896e57a4` | `ae26e30e071e2e5c` | `3b9a268d86588536` | update imageUrlGate.ts,isoDate.ts,ollama.ts |
| 256 | `5cf97c4467c18e21` | `3b9a268d86588536` | `85a96af8da4f5467` | update chat.ts,httpLimits.ts |
| 257 | `a6b3405fa277402b` | `85a96af8da4f5467` | `5b6a4a278dbef782` | update integrity-chain.cjs,vitest.audit.config.ts |
| 258 | `2b107539c6239f53` | `5b6a4a278dbef782` | `911557dfbce3c75c` | update credentials.ts |
| 259 | `b124d43d54b1d0d2` | `911557dfbce3c75c` | `6f25fc1001916516` | update lint-sample-data.cjs |
| 260 | `ea639cce61f4dcaf` | `6f25fc1001916516` | `246874b2fdcd2f94` | update integrity-chain.cjs,population-floor.cjs,lint-sample-data.cjs |
| 261 | `f39e21e6bb61c860` | `246874b2fdcd2f94` | `43a51da6e33dabfc` | update lint-sample-data.cjs |
| 262 | `fa27132a818584f9` | `43a51da6e33dabfc` | `48a6f5b9c27762ea` | update integrity-chain.cjs,tracked-cross-check.cjs |
| 263 | `3f1ddcc92f79b834` | `48a6f5b9c27762ea` | `16e58b8e470d21c5` | update integrity-chain.cjs |
| 264 | `d0ca7f9b2d5fd979` | `16e58b8e470d21c5` | `d2c435999dee6dce` | update integrity-chain.cjs |
| 265 | `ceaa5c527f45669b` | `d2c435999dee6dce` | `67b63ab282a13375` | update integrity-chain.cjs |
| 266 | `d3eaff764ba7bbca` | `67b63ab282a13375` | `c0785b5ed154c317` | update integrity-chain.cjs,assistantLimits.ts |
| 267 | `14898f4d30d06ab5` | `c0785b5ed154c317` | `1c895191a6d9d57a` | update sw.js,build-landing.cjs,integrity-chain.cjs |
| 268 | `787d2ad147d24654` | `1c895191a6d9d57a` | `1006db0ed44424c6` | update integrity-chain.cjs,json-for-script.cjs |
| 269 | `21ff816f2822f648` | `1006db0ed44424c6` | `cae61502ae7543fd` | update sw.js |
| 270 | `83e0e4ed89540f57` | `cae61502ae7543fd` | `1ab05fdd576581ab` | update assistantMarkdown.ts |
| 271 | `ac0fd99febe6197a` | `1ab05fdd576581ab` | `953be3f186c4f1b4` | update manifest.webmanifest,windowPrefs.ts |
| 272 | `6998bda67d217b7c` | `953be3f186c4f1b4` | `c801e78c3a7d1e0b` | update isoDate.ts |
| 273 | `5dd02f4e41b68a13` | `c801e78c3a7d1e0b` | `b70615f4bd984f3e` | update integrity-chain.cjs,atomicWrite.ts,eraseAll.ts,secrets.ts,advisorQuestionLimits.ts |
| 274 | `0576f5161b4aa589` | `b70615f4bd984f3e` | `ca82f385b73b517e` | update PROXY_EXAMPLE.md,public-host-guard.cjs,externalUrlGate.ts,privateTarget.ts |
| 275 | `7e282aad65b1065d` | `ca82f385b73b517e` | `3ac3a67ca9df51ea` | update integrity-chain.cjs,keyIntent.ts,LockScreen.tsx |
| 276 | `f60908d7c7904acd` | `3ac3a67ca9df51ea` | `07d67638596f8f18` | update vault.ts,httpLimits.ts,ollama.ts |
| 277 | `7d5326e604434a1c` | `07d67638596f8f18` | `0dd206ac754b35c4` | update ollama.ts |
| 278 | `963c4d775f9a7afc` | `0dd206ac754b35c4` | `d4f0b6ac3ccca680` | update atlassianSite.ts,writeFieldLimits.ts |
| 279 | `08a44307ef662fb7` | `d4f0b6ac3ccca680` | `fceff271cb78d024` | update headerValue.ts |
| 280 | `7950b19aba88a53d` | `fceff271cb78d024` | `16047100ecc8c35f` | update eraseAll.ts,windowPrefs.ts,proxy.ts |
| 281 | `02483f41c2081db5` | `16047100ecc8c35f` | `0aa0cf1cbfbf22ea` | update imageUrlGate.ts |
| 282 | `a280c65785bb8da9` | `0aa0cf1cbfbf22ea` | `ac3fc45beec2049e` | update LockScreen.tsx |
| 283 | `0fa78a55c06d42df` | `ac3fc45beec2049e` | `2e6fb38e53186448` | update settings.json |
| 284 | `a579013b4297536f` | `2e6fb38e53186448` | `f0bb5da64c524124` | update 20-gates.mdc,ci.yml |
| 285 | `bd9e494a1a7fadfd` | `f0bb5da64c524124` | `450ca89b19bbcc9f` | update 20-gates.mdc,ci.yml |
| 286 | `0298e0b15870a0e7` | `450ca89b19bbcc9f` | `a8b54204a8afec47` | update PROXY_EXAMPLE.md,exportPaths.ts,secrets.ts,aiEndpoint.ts |
| 287 | `1a32b87ad28e8187` | `a8b54204a8afec47` | `6515b2c0501af05a` | update lint-artifact-csp.cjs |
| 288 | `1e132492fc4f6c94` | `6515b2c0501af05a` | `133a8673fafa41de` | update exportPaths.ts,shellOpenGate.ts,scanTarget.ts |
| 289 | `7066b935fbe555e6` | `133a8673fafa41de` | `3c5fcd1b99119fe1` | update auditor.md,mechanic.md,scout.md,integrity-chain.cjs |
| 290 | `7b421cf6e9b21a78` | `3c5fcd1b99119fe1` | `88d8f13849038fa6` | update ServiceHubを開く.bat,integrity-chain.cjs,redact.ts |
| 291 | `658892ce56be1ce6` | `88d8f13849038fa6` | `37a1ecfea7c01b33` | update eraseAll.ts |
| 292 | `4a32c27ccb855757` | `37a1ecfea7c01b33` | `133a7f40885c6a85` | update secrets.ts,privateTarget.ts |
| 293 | `6df193b418f5dbd1` | `133a7f40885c6a85` | `bc89375c50238d87` | update release.yml,assistantMarkdown.ts,escape.ts,privateTarget.ts |
| 294 | `28b2751607e56c7a` | `bc89375c50238d87` | `f96d82d8d5819d3d` | update escape.ts |
| 295 | `3d4e304444616052` | `f96d82d8d5819d3d` | `53c0f4d8d674fcfa` | update pages.yml,release.yml,integrity-chain.cjs,keychainBackend.ts,secrets.ts |
| 296 | `447bd4561f9d05cf` | `53c0f4d8d674fcfa` | `18b777696ed92487` | update exportPaths.ts |
| 297 | `2e41546fce340472` | `18b777696ed92487` | `ede2b79876ca2ff4` | update PROXY_EXAMPLE.md,public-host-guard.cjs,redact.ts |
| 298 | `ed21ea23f269cd9e` | `ede2b79876ca2ff4` | `51b0002380b7f6b7` | update dependabot.yml,ci.yml,dependency-audit.yml,e2e.yml,knowledge-auto.yml,mutation.yml |
| 299 | `468e7293b47ef358` | `51b0002380b7f6b7` | `1d8791f5129d8b1d` | update integrity-chain.cjs,knowledge-autopilot.cjs,merge-mutation-reports.cjs,mutate-changed.cjs,triage-mutations.cjs |
| 300 | `ce51511d4c39c3b0` | `1d8791f5129d8b1d` | `e5d72506ac7e90b1` | update knowledge-context.cjs,knowledge-graph.cjs,integrity-chain.cjs |
| 301 | `6c13960ce33c5869` | `e5d72506ac7e90b1` | `993e473211289c58` | update secrets.ts,vault.ts |
| 302 | `e71d4b5219e3589b` | `993e473211289c58` | `3494cb21a9f364f0` | update PROXY_EXAMPLE.md,proxy.ts |
| 303 | `d5f424f7d9254e02` | `3494cb21a9f364f0` | `833ce2b8c1c92afc` | update icon.svg,og.png,integrity-chain.cjs,atomicWrite.ts,exportPaths.ts,oauth.ts |
| 304 | `506a216e405fb25c` | `833ce2b8c1c92afc` | `36612853fd566a7c` | update proxy.ts,vault.ts |
| 305 | `5a0ed0941cd68760` | `36612853fd566a7c` | `3b6905b5c79db304` | update eraseAll.ts,secrets.ts,autoLock.ts,escape.ts,redact.ts,scanTarget.ts |
| 306 | `ad54bf29c9323825` | `3b6905b5c79db304` | `ad061da0c49a9ff1` | update integrity-chain.cjs,pure-data-module.cjs,assistant.ts,secrets.ts,redact.ts,scanTarget.ts |
| 307 | `d0d34954238bde8b` | `ad061da0c49a9ff1` | `3f3871a2c5528603` | update scanTarget.ts |
| 308 | `9d11a3cdbd78c61e` | `3f3871a2c5528603` | `a5780875a6c99616` | update mutation.yml,main.ts,redact.ts |
| 309 | `98efa5826c826fe5` | `a5780875a6c99616` | `2cd6c5bf824623f2` | update mutation.yml |
| 310 | `4c6e91d390153691` | `2cd6c5bf824623f2` | `3115ce31b4c20918` | update ci.yml |
| 311 | `31567147841da5b7` | `3115ce31b4c20918` | `35dbb97bd8100b8b` | update integrity-chain.cjs,lint-malware.cjs |
| 312 | `b9cce5ca2caeb5fb` | `35dbb97bd8100b8b` | `0e9472838dd463d9` | update integrity-chain.cjs,strip-non-code.cjs |
| 313 | `2e929dce0601f344` | `0e9472838dd463d9` | `5aa52c34c8aad687` | update main.ts |
| 314 | `984f2f7edae83e1f` | `5aa52c34c8aad687` | `61c303b74d72cfd3` | update credentials.ts |
| 315 | `aacafd5da866e019` | `61c303b74d72cfd3` | `e4f7af95464107a6` | update credentials.ts |
| 316 | `8278089dd0aae4a5` | `e4f7af95464107a6` | `a4a1520d0ee9f842` | update dependency-audit.yml |
| 317 | `84b459c981e07ff3` | `a4a1520d0ee9f842` | `7d89ddb527396f27` | update e2e.yml |
| 318 | `a1750a483dfbf2ec` | `7d89ddb527396f27` | `1ee928f60802b58d` | update integrity-chain.cjs,verify-e2e-playwright-pin.cjs |
| 319 | `e1af72c87959b7f2` | `1ee928f60802b58d` | `c4389d0142079619` | update e2e.yml |
| 320 | `fd7b60b466aa78cb` | `c4389d0142079619` | `f0ea1e1e25404084` | update PROXY_EXAMPLE.md |
| 321 | `923c0c5ebd57af4d` | `f0ea1e1e25404084` | `98f2db369a1f7932` | update main.ts,oauth.ts,shellOpenGate.ts |
| 322 | `8a2230d0e8453248` | `98f2db369a1f7932` | `ca505bcd6d80305b` | update integrity-chain.cjs,fileRequestGate.ts |
| 323 | `f14995f41e936da2` | `ca505bcd6d80305b` | `f8bcaec54c6bc580` | update fileRequestGate.ts |
| 324 | `aabd0a61bc04750c` | `f8bcaec54c6bc580` | `5a67b214b2898b77` | update knowledge-auto.yml,pages.yml,release.yml |
| 325 | `d93ada0448728194` | `5a67b214b2898b77` | `17f68f701f927f94` | update integrity-chain.cjs,main.ts,presenceWiring.ts,userPresence.ts |
| 326 | `13043da3fc42d71e` | `17f68f701f927f94` | `da3287b4ad58be5d` | update main.ts |
| 327 | `56ce42c1bba9e607` | `da3287b4ad58be5d` | `f2040bd32664e875` | update main.ts,userPresence.ts |
| 328 | `1e0f34eb00024611` | `f2040bd32664e875` | `f7b54c7e23ba6a98` | update userPresence.ts |
| 329 | `c466e9e11256eb4e` | `f7b54c7e23ba6a98` | `95ce7cdb947ca759` | update userPresence.ts |
| 330 | `7b5c40ae08d611c4` | `95ce7cdb947ca759` | `33b6801aca34f9ad` | update lint-artifact-csp.cjs,assistant.ts,fileRequestGate.ts,main.ts,presenceWiring.ts,userPresence.ts |
| 331 | `cd0ee6d8b512b1e5` | `33b6801aca34f9ad` | `43f3418004177687` | update main.ts,userPresence.ts,assistantMarkdown.ts,chat.ts,httpLimits.ts |
| 332 | `bee936bc7603e31f` | `43f3418004177687` | `540652df155d82b1` | update userPresence.ts |
| 333 | `f9418e65309d21ec` | `540652df155d82b1` | `f16a6677421b0065` | update main.ts |
| 334 | `0806707769de9b0a` | `f16a6677421b0065` | `f07de539289b4f03` | update main.ts |
| 335 | `20a9b8aa14575162` | `f07de539289b4f03` | `5a25905b23ab6d9b` | update ci.yml |
| 336 | `f2a797f99a1ad324` | `5a25905b23ab6d9b` | `beecec68acc06ee9` | update safeFilename.ts |
| 337 | `f5436e5173dbf8dc` | `beecec68acc06ee9` | `ece15b7b7d47030a` | update dependency-audit.yml |
| 338 | `b11a6b76345c63da` | `ece15b7b7d47030a` | `6f432d09bccf57e1` | update keychainBackend.ts,secrets.ts |
| 339 | `fada959eae1b8b65` | `6f432d09bccf57e1` | `7271480c31120940` | update e2e.yml,electron-builder.json,artifact-freshness.cjs |
| 340 | `bfa0970cdc357059` | `7271480c31120940` | `d863604b8563b53f` | update lint-malware.cjs |
| 341 | `3f1740b58e104a42` | `d863604b8563b53f` | `094f9ff558f4e110` | update electron-builder.json |
| 342 | `9fce4e9715807374` | `094f9ff558f4e110` | `1ae266fcef58bce6` | update lint-malware.cjs |
| 343 | `f14f671af1827039` | `1ae266fcef58bce6` | `25deb67338471519` | update e2e.yml |
| 344 | `aa6d9aa06728ae8f` | `25deb67338471519` | `51cf88bf04f5ecf9` | update assistant.ts,assistantLimits.ts |
| 345 | `3b3826d8429c059d` | `51cf88bf04f5ecf9` | `65c0841d00db2354` | update userPresence.ts |
| 346 | `9b8f59a5f1edc90e` | `65c0841d00db2354` | `304738880784cef5` | update main.ts,presenceWiring.ts,userPresence.ts |
| 347 | `c9687c3505731c44` | `304738880784cef5` | `e54095171294627f` | update integrity-chain.cjs,windowOpen.ts |
| 348 | `2ecbd52ee5df0838` | `e54095171294627f` | `14a185f753b2adae` | update windowOpen.ts |
| 349 | `9d3ce8bfbdc55367` | `14a185f753b2adae` | `501622b1ca291af8` | update exportPaths.ts,main.ts |
| 350 | `f9bbb4e265681a69` | `501622b1ca291af8` | `e2d67572484aab48` | update exportPaths.ts,shellOpenGate.ts,safeFilename.ts |
| 351 | `47a427ea6d21cd0a` | `e2d67572484aab48` | `6c9b4774a9f6e1ad` | update exportPaths.ts,main.ts,userPresence.ts,safeFilename.ts |
| 352 | `b4e41d7921221d0b` | `6c9b4774a9f6e1ad` | `0312b04293540216` | update userPresence.ts |
| 353 | `3b8c4827414a006e` | `0312b04293540216` | `a2e7ac9714738a29` | update main.ts,userPresence.ts |
| 354 | `e5d45749d55a2a2d` | `a2e7ac9714738a29` | `57db21a532892935` | update main.ts,userPresence.ts,assistantMarkdown.ts,privateTarget.ts |
| 355 | `03b5db1cd8a8f8c8` | `57db21a532892935` | `90938e774189f4a9` | update assistantMarkdown.ts |
| 356 | `b5bca2b946450daf` | `90938e774189f4a9` | `5c49300ee48f309c` | update privateTarget.ts |
| 357 | `f16a3e745b7553a9` | `5c49300ee48f309c` | `fa8476f1f549e493` | update privateTarget.ts |
| 358 | `8c4671e6dcce7b04` | `fa8476f1f549e493` | `4cb3bba91029c015` | update PROXY_EXAMPLE.md,public-host-guard.cjs,privateTarget.ts |
| 359 | `f64773ac2de8920d` | `4cb3bba91029c015` | `4b7671ff43e4c5a0` | update privateTarget.ts |
| 360 | `3ed546a3dc4a1d7a` | `4b7671ff43e4c5a0` | `7f9248c3766835bd` | update privateTarget.ts |
| 361 | `14f7d4306e870fde` | `7f9248c3766835bd` | `9734ef0a8a6404d1` | update privateTarget.ts |
| 362 | `c968ac11083fe4ca` | `9734ef0a8a6404d1` | `5eeeac3654f1adce` | update escape.ts |
| 363 | `c7373092e2a1a05a` | `5eeeac3654f1adce` | `bd18a5d1f21c3314` | update escape.ts |
| 364 | `c0415317bf4c03e2` | `bd18a5d1f21c3314` | `ef3a5c6e07035ef5` | update release.yml |
| 365 | `a728385d06940620` | `ef3a5c6e07035ef5` | `8dbad928f9c579df` | update integrity-chain.cjs,verify-packaged-fuses.cjs |
| 366 | `fcc0efea1db94617` | `8dbad928f9c579df` | `040515026238c582` | update integrity-chain.cjs,smoke-packaged.cjs |
| 367 | `962b8d4d8531dde0` | `040515026238c582` | `45ba43efd4ea545a` | update release.yml,verify-packaged-fuses.cjs |
| 368 | `47d1f344c9792a23` | `45ba43efd4ea545a` | `f39acc52fd3e09fc` | update redact.ts |
| 369 | `3a202a757d460717` | `f39acc52fd3e09fc` | `63d2990574dcd834` | update integrity-chain.cjs,secrets.ts,vault.ts,credentialTtl.ts |
| 370 | `b63cae4414368a65` | `63d2990574dcd834` | `208dc542c68e178d` | update secrets.ts,vault.ts,credentialTtl.ts |
| 371 | `e2226754991e5c46` | `208dc542c68e178d` | `8a7a0455d3002dd9` | update 00-project.mdc,manifest.webmanifest |
| 372 | `1632c6ebecc548f5` | `8a7a0455d3002dd9` | `7e8db84e5e9a20ec` | update integrity-chain.cjs,main.ts,userPresence.ts,actionTier.ts,outboundContentGate.ts,promptInjection.ts |
| 373 | `fcfdb6029d58f67f` | `7e8db84e5e9a20ec` | `19a08b86ab8ea05a` | update outboundContentGate.ts |
| 374 | `eb99626448fac019` | `19a08b86ab8ea05a` | `5d14b178bcaef1a3` | update outboundContentGate.ts |
| 375 | `f21529a2ab6b2fa4` | `5d14b178bcaef1a3` | `5bbede6d884170b0` | update userPresence.ts,outboundContentGate.ts |
| 376 | `aeb6d4c7cec746e5` | `5bbede6d884170b0` | `aaa75718151fce6c` | update outboundContentGate.ts |
| 377 | `ced4dc890a9be2fa` | `aaa75718151fce6c` | `89e29145bf14259f` | update electron-builder.json,build-integrity-manifest.cjs,integrity-chain.cjs,smoke-packaged.cjs,main.ts,selfAttestation.ts |
| 378 | `a2cb8f344ad2d7b5` | `89e29145bf14259f` | `e7a1560a49760321` | update selfAttestation.ts |
| 379 | `7a1453e286227601` | `e7a1560a49760321` | `f214d0465494d791` | update electron-builder.json,build-integrity-manifest.cjs,artifact-freshness.cjs,lint-malware.cjs,selfAttestation.ts |
| 380 | `3b250467883d391d` | `f214d0465494d791` | `49993e94e04950d0` | update vault.ts |
| 381 | `9983fa57821e82ab` | `49993e94e04950d0` | `409f948e647640fd` | update integrity-chain.cjs,egressStepUp.ts |
| 382 | `9393a650f568c6a7` | `409f948e647640fd` | `0f82fae8c348b109` | update vault.ts |
| 383 | `88144216ca3df10d` | `0f82fae8c348b109` | `31eea771527ba19b` | update ci.yml,dependency-audit.yml,e2e.yml,knowledge-auto.yml,mutation.yml,pages.yml |
| 384 | `38f3bd8768a4a749` | `31eea771527ba19b` | `fb6ee92fe5b3411d` | update integrity-chain.cjs,main.ts,oauth.ts,osSinks.ts,shellOpenGate.ts,windowOpen.ts |
| 385 | `c916396010b91921` | `fb6ee92fe5b3411d` | `b21dd5819f09f2fe` | update integrity-chain.cjs,mamori.cjs,osSinks.mamori,osSinks.ts,shellOpenGate.mamori,shellOpenGate.ts |
| 386 | `3157108e951aef10` | `b21dd5819f09f2fe` | `47321d862cb64cfb` | update parser.ts |
| 387 | `b1bd8727097ae82f` | `47321d862cb64cfb` | `33bfb25a8cb7bcba` | update integrity-chain.cjs,exportSink.mamori,exportSink.ts,checker.ts,vetted.mamori,vetted.ts |
| 388 | `8dd8099cf6b2c1a1` | `33bfb25a8cb7bcba` | `4d7e9b00876f8058` | update integrity-chain.cjs,VettedImg.tsx,imageUrlGate.mamori,imageUrlGate.ts,vetted.mamori,vetted.ts |
| 389 | `f3f9eda6bca96578` | `4d7e9b00876f8058` | `481cab63766de6c2` | update integrity-chain.cjs,VettedLink.tsx |
| 390 | `95ac773211290ab6` | `481cab63766de6c2` | `0698643af3a72623` | update checker.ts |
| 391 | `ad6850f327de7cb5` | `0698643af3a72623` | `03aa04535e364620` | update parser.ts |
| 392 | `da81754a5147af1d` | `03aa04535e364620` | `f6cfb1e38249707c` | update emit.ts,parser.ts |
| 393 | `679d2ea479835b9f` | `f6cfb1e38249707c` | `b90bf1ca0e5c2284` | update integrity-chain.cjs,ast.ts,checker.ts,emit.ts,parser.ts,proxyEndpoint.mamori |
| 394 | `9180ad493c9cbbe8` | `b90bf1ca0e5c2284` | `ee967358076aa390` | update checker.ts,emit.ts,parser.ts |
| 395 | `4843d8a8d9d6a96d` | `ee967358076aa390` | `c3ae67ba4c08746d` | update checker.ts |
| 396 | `6c0373db2dbbb7d1` | `c3ae67ba4c08746d` | `cb9b5216e75d9167` | update integrity-chain.cjs,controlChars.mamori,controlChars.ts,checker.ts,parser.ts |
| 397 | `ef62abf990b8192f` | `cb9b5216e75d9167` | `23585fa17a9e8aff` | update dependency-audit.yml,checker.ts |
| 398 | `a2ae11977f1fdf4f` | `23585fa17a9e8aff` | `bd57abb5d38b8775` | update selfAttestation.ts |
| 399 | `e97f81e7b2d229c8` | `bd57abb5d38b8775` | `8541d760dbebae1b` | update secrets.ts,vault.ts |
| 400 | `c08a43af5e544ebb` | `8541d760dbebae1b` | `efd5f12832c6bfca` | update lint-malware.cjs,vault.ts |
| 401 | `a5a217f8d4d18724` | `efd5f12832c6bfca` | `64a6201e17ac5c47` | update lint-malware.cjs |
| 402 | `fb263eee5d23b6a6` | `64a6201e17ac5c47` | `1e79af33475cfb92` | update proxy.ts,vault.ts |
| 403 | `7a88c53d3ff2a08c` | `1e79af33475cfb92` | `3bb97a6877a9c2ef` | update integrity-chain.cjs,tokenInput.mamori,tokenInput.ts |
| 404 | `d5cdc43554d30f65` | `3bb97a6877a9c2ef` | `9beedd49011a0422` | update escape.ts,checker.ts |
| 405 | `35bf4202074f1aa1` | `9beedd49011a0422` | `a6e261fb26e6f74b` | update checker.ts,parser.ts |
| 406 | `71a0b563f354bb2a` | `a6e261fb26e6f74b` | `7a7701fdcaf13c27` | update parser.ts |
| 407 | `5df0aef8d21e2ffb` | `7a7701fdcaf13c27` | `17547ec318064494` | update checker.ts |
| 408 | `e3bd8b52bc7efb78` | `17547ec318064494` | `b7d686bc3bc673c4` | update integrity-chain.cjs,mamori.cjs,mamori-capabilities.json,capabilities.ts,checker.ts,compile.ts |
| 409 | `6ac403e7f31ffa9c` | `b7d686bc3bc673c4` | `4b0d40f320cfcb01` | update ast.ts,emit.ts,parser.ts |
| 410 | `3f197333f05dccf1` | `4b0d40f320cfcb01` | `97935bbc7d0c80f1` | update checker.ts |
| 411 | `8d28897985dbd211` | `97935bbc7d0c80f1` | `315febb64f7d38d6` | update checker.ts |
| 412 | `de9697b3a60eb65f` | `315febb64f7d38d6` | `6e388d57bba54f4f` | update ast.ts,checker.ts,emit.ts,parser.ts |
| 413 | `7523df7f9a308fd0` | `6e388d57bba54f4f` | `d6682a5ff44bb473` | update checker.ts |
| 414 | `9cfcc08498defff7` | `d6682a5ff44bb473` | `b1423dc833881718` | update ast.ts,checker.ts,emit.ts,parser.ts |
| 415 | `b990e7888e85e677` | `b1423dc833881718` | `486ab4e5a8017af2` | update checker.ts |
| 416 | `d141de7d27c58d9b` | `486ab4e5a8017af2` | `aa886997aef06baf` | update ast.ts,checker.ts,emit.ts,parser.ts |
| 417 | `22d6faff04feb17d` | `aa886997aef06baf` | `d427071812815c87` | update integrity-chain.cjs,mamori-capabilities.json,egressStepUp.mamori,egressStepUp.ts |
| 418 | `1ef59b8cb4857183` | `d427071812815c87` | `acfdfa669a999f68` | update integrity-chain.cjs,mamori-capabilities.json,safeFilename.mamori,safeFilename.ts |
| 419 | `7a915db53849f1ee` | `acfdfa669a999f68` | `eb88e427cf7341a9` | update checker.ts |
| 420 | `9b177c4114307f8d` | `eb88e427cf7341a9` | `e22495141477e0be` | update safeFilename.mamori,safeFilename.ts |

## 保護対象ファイル

- `.claude/agents/auditor.md`
- `.claude/agents/mechanic.md`
- `.claude/agents/scout.md`
- `.claude/settings.json`
- `.cursor/rules/00-project.mdc`
- `.cursor/rules/10-boundaries.mdc`
- `.cursor/rules/20-gates.mdc`
- `.cursor/rules/30-conventions.mdc`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-audit.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/knowledge-auto.yml`
- `.github/workflows/mutation.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/release.yml`
- `assets/icon.svg`
- `assets/manifest.webmanifest`
- `assets/og.png`
- `assets/sw.js`
- `docs/PROXY_EXAMPLE.md`
- `docs/SECURITY_CHAIN.md`
- `electron-builder.json`
- `eslint.config.js`
- `launcher/ServiceHubを開く.bat`
- `orchestration/knowledge-context.cjs`
- `orchestration/knowledge-graph.cjs`
- `scripts/build-integrity-manifest.cjs`
- `scripts/build-landing.cjs`
- `scripts/checksum-release.cjs`
- `scripts/inject-pwa.cjs`
- `scripts/inline-html.cjs`
- `scripts/integrity-chain.cjs`
- `scripts/knowledge-autopilot.cjs`
- `scripts/lib/artifact-freshness.cjs`
- `scripts/lib/json-for-script.cjs`
- `scripts/lib/population-floor.cjs`
- `scripts/lib/pure-data-module.cjs`
- `scripts/lib/strip-non-code.cjs`
- `scripts/lib/tracked-cross-check.cjs`
- `scripts/lint-artifact-csp.cjs`
- `scripts/lint-malware.cjs`
- `scripts/lint-sample-data.cjs`
- `scripts/make-autoinstall.sh`
- `scripts/make-live-usb.sh`
- `scripts/mamori.cjs`
- `scripts/merge-mutation-reports.cjs`
- `scripts/migrate.sh`
- `scripts/mutate-changed.cjs`
- `scripts/public-host-guard.cjs`
- `scripts/safe-vault-write.cjs`
- `scripts/security-audit.sh`
- `scripts/setup-linux.sh`
- `scripts/setup-obsidian-docker.sh`
- `scripts/smoke-app.cjs`
- `scripts/smoke-packaged.cjs`
- `scripts/triage-mutations.cjs`
- `scripts/verify-e2e-playwright-pin.cjs`
- `scripts/verify-packaged-fuses.cjs`
- `scripts/verify-release-artifacts.cjs`
- `security/mamori-capabilities.json`
- `src/main/atomicWrite.ts`
- `src/main/clients/assistant.ts`
- `src/main/clients/exportPaths.ts`
- `src/main/clients/exportSink.mamori`
- `src/main/clients/exportSink.ts`
- `src/main/clients/types.ts`
- `src/main/eraseAll.ts`
- `src/main/fileRequestGate.ts`
- `src/main/keychainBackend.ts`
- `src/main/main.ts`
- `src/main/oauth.ts`
- `src/main/osSinks.mamori`
- `src/main/osSinks.ts`
- `src/main/presenceWiring.ts`
- `src/main/secrets.ts`
- `src/main/selfAttestation.ts`
- `src/main/shellOpenGate.mamori`
- `src/main/shellOpenGate.ts`
- `src/main/stateFile.ts`
- `src/main/userPresence.ts`
- `src/main/windowOpen.ts`
- `src/main/windowPrefs.ts`
- `src/preload/preload.ts`
- `src/renderer/components/VettedImg.tsx`
- `src/renderer/components/VettedLink.tsx`
- `src/renderer/data/assistantMarkdown.ts`
- `src/renderer/data/localWrite.ts`
- `src/renderer/data/recordCipher.ts`
- `src/renderer/fs/fsa.ts`
- `src/renderer/keyIntent.ts`
- `src/renderer/network/liveRead.ts`
- `src/renderer/network/proxy.ts`
- `src/renderer/oauth/pkce.ts`
- `src/renderer/oauth/pkceSession.ts`
- `src/renderer/security/LockScreen.tsx`
- `src/renderer/security/autoLock.ts`
- `src/renderer/security/bip39-wordlist.ts`
- `src/renderer/security/dataCrypto.ts`
- `src/renderer/security/egressStepUp.mamori`
- `src/renderer/security/egressStepUp.ts`
- `src/renderer/security/frameGuard.ts`
- `src/renderer/security/lockWorkspace.ts`
- `src/renderer/security/mnemonic.ts`
- `src/renderer/security/vault.ts`
- `src/renderer/security/webCrypto.ts`
- `src/renderer/security/webauthn.ts`
- `src/renderer/vettedSinks.mamori`
- `src/renderer/vettedSinks.ts`
- `src/shared/actionTier.ts`
- `src/shared/advisorQuestionLimits.ts`
- `src/shared/ai/chat.ts`
- `src/shared/ai/credentials.ts`
- `src/shared/ai/providers.ts`
- `src/shared/aiEndpoint.ts`
- `src/shared/assistantLimits.ts`
- `src/shared/atlassianSite.ts`
- `src/shared/constantTimeEquals.ts`
- `src/shared/controlChars.mamori`
- `src/shared/controlChars.ts`
- `src/shared/credentialTtl.ts`
- `src/shared/cryptoParams.ts`
- `src/shared/eraseReport.ts`
- `src/shared/escape.ts`
- `src/shared/externalUrlGate.mamori`
- `src/shared/externalUrlGate.ts`
- `src/shared/headerValue.ts`
- `src/shared/httpLimits.ts`
- `src/shared/imageUrlGate.mamori`
- `src/shared/imageUrlGate.ts`
- `src/shared/inputCeiling.ts`
- `src/shared/isoDate.ts`
- `src/shared/localDate.ts`
- `src/shared/mamori/ast.ts`
- `src/shared/mamori/capabilities.ts`
- `src/shared/mamori/checker.ts`
- `src/shared/mamori/compile.ts`
- `src/shared/mamori/emit.ts`
- `src/shared/mamori/parser.ts`
- `src/shared/ollama.ts`
- `src/shared/outboundContentGate.ts`
- `src/shared/privateTarget.ts`
- `src/shared/promptInjection.ts`
- `src/shared/proxyEndpoint.mamori`
- `src/shared/proxyEndpoint.ts`
- `src/shared/redact.ts`
- `src/shared/safeFilename.mamori`
- `src/shared/safeFilename.ts`
- `src/shared/scanTarget.ts`
- `src/shared/tokenInput.mamori`
- `src/shared/tokenInput.ts`
- `src/shared/tokenResponse.ts`
- `src/shared/vaultToken.ts`
- `src/shared/versionOrder.ts`
- `src/shared/vetted.mamori`
- `src/shared/vetted.ts`
- `src/shared/writeFieldLimits.ts`
- `vite.config.ts`
- `vitest.audit.config.ts`
- `vitest.config.ts`
