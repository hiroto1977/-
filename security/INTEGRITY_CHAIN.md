# 完全性チェーン（Integrity Chain）

> 自動生成物。直接編集しない（`npm run chain:append` で再生成）。
> 仕組みの全体像は [[SECURITY_CHAIN]] / `docs/SECURITY_CHAIN.md` を参照。

- アルゴリズム: `sha256`
- ブロック数: 155
- 先頭(genesis)ハッシュ: `773e7442591bb2286a73553c29b46d049e5f92927a69c38e7075d89496d15ec9`
- 末尾(tip)ハッシュ: `372531b5494570e1097b5d1c1cbac993556b1086c4c2670f0d1b19f684223ae2`
- 保護対象: 66 ファイル

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

## 保護対象ファイル

- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml`
- `.github/workflows/release.yml`
- `assets/manifest.webmanifest`
- `assets/sw.js`
- `docs/SECURITY_CHAIN.md`
- `electron-builder.json`
- `scripts/checksum-release.cjs`
- `scripts/inject-pwa.cjs`
- `scripts/inline-html.cjs`
- `scripts/integrity-chain.cjs`
- `scripts/lint-artifact-csp.cjs`
- `scripts/lint-sample-data.cjs`
- `scripts/make-autoinstall.sh`
- `scripts/make-live-usb.sh`
- `scripts/migrate.sh`
- `scripts/safe-vault-write.cjs`
- `scripts/security-audit.sh`
- `scripts/setup-linux.sh`
- `scripts/setup-obsidian-docker.sh`
- `scripts/smoke-app.cjs`
- `scripts/verify-release-artifacts.cjs`
- `src/main/atomicWrite.ts`
- `src/main/clients/assistant.ts`
- `src/main/clients/exportPaths.ts`
- `src/main/clients/types.ts`
- `src/main/main.ts`
- `src/main/oauth.ts`
- `src/main/secrets.ts`
- `src/main/shellOpenGate.ts`
- `src/preload/preload.ts`
- `src/renderer/data/assistantMarkdown.ts`
- `src/renderer/data/localWrite.ts`
- `src/renderer/data/recordCipher.ts`
- `src/renderer/fs/fsa.ts`
- `src/renderer/network/liveRead.ts`
- `src/renderer/network/proxy.ts`
- `src/renderer/oauth/pkce.ts`
- `src/renderer/oauth/pkceSession.ts`
- `src/renderer/security/LockScreen.tsx`
- `src/renderer/security/autoLock.ts`
- `src/renderer/security/bip39-wordlist.ts`
- `src/renderer/security/dataCrypto.ts`
- `src/renderer/security/frameGuard.ts`
- `src/renderer/security/lockWorkspace.ts`
- `src/renderer/security/mnemonic.ts`
- `src/renderer/security/vault.ts`
- `src/renderer/security/webauthn.ts`
- `src/shared/ai/chat.ts`
- `src/shared/ai/credentials.ts`
- `src/shared/ai/providers.ts`
- `src/shared/aiEndpoint.ts`
- `src/shared/atlassianSite.ts`
- `src/shared/controlChars.ts`
- `src/shared/cryptoParams.ts`
- `src/shared/escape.ts`
- `src/shared/externalUrlGate.ts`
- `src/shared/httpLimits.ts`
- `src/shared/imageUrlGate.ts`
- `src/shared/ollama.ts`
- `src/shared/proxyEndpoint.ts`
- `src/shared/redact.ts`
- `src/shared/safeFilename.ts`
- `src/shared/scanTarget.ts`
- `src/shared/tokenInput.ts`
- `src/shared/vaultToken.ts`
