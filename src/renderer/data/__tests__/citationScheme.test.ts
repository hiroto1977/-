import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * **確証済みデータの出典に、平文 http の URL が増えていないか。**
 *
 * ## なぜ気にするのか
 *
 * このリポジトリの知識データは「出典つきで検証済み」であることが売りで、
 * `lint:citations` / `lint:doi-prefix` / `verify:knowledge` が出典の
 * 内部矛盾や出版社のずれを見ている。**だが平文 http は誰も見ていなかった。**
 *
 * 平文で配られる出典は、経路上で**書き換えられる**。利用者が
 * 「確証済み」と言われて開いた先が別物になりうる以上、
 * 「検証済みの出典」という主張が弱くなる。
 * (読むだけの公開ページなので影響は限定的 —— コードの脆弱性ではなく、
 *  **データの完全性**の話である。)
 *
 * 実測 (2026-08-23): https 12,225 件 / http 22 件 /
 * **それ以外のスキームは 0 件** (`javascript:` 等は無い)。
 *
 * ## 直すときは推測しない
 *
 * このリポジトリの規則: **推測で出典を直さない。**
 * `http://` を機械的に `https://` へ置き換えるのは*推測*である ——
 * その URL が https で同じ物を返す保証は無く、リダイレクト先が別ページの
 * ことも、https を提供していないことも、URL 自体が古くなっていることもある。
 *
 * 直す手順は「その URL を実際に引いて、同じ出典が https で取れることを
 * 確かめてから」台帳と本文を同時に直す。**確かめられないものは残す。**
 *
 * ## 台帳は双方向
 *
 *   増えた → 新しい平文の出典。https で引けるか確かめてから入れること
 *   減った → 直したなら台帳からも消すこと
 */

/** 実測で見つかった平文 http の出典 (2026-08-23 時点)。**増やさない。** */
const KNOWN_CLEARTEXT: readonly string[] = [
  'http://andyneely.blogspot.com/2013/11/what-is-servitization.html',
  'http://bastiat.org/en/twisatwins.html',
  'http://coin.wne.uw.edu.pl/wincenciak/docs/makro_zaawansowana/lecture_3.pdf',
  'http://exploresel.gse.harvard.edu/frameworks/4/',
  'http://faculty.washington.edu/jdb/345/345%20Articles/Baumeister%20et%20al.%20(1998).pdf',
  'http://henryjenkins.org/blog/2009/02/if_it_doesnt_spread_its_dead_p_1.html',
  'http://piketty.pse.ens.fr/files/Barro91.pdf',
  'http://piketty.pse.ens.fr/files/BarroSalaIMartin2004Chap1-2.pdf',
  'http://piketty.pse.ens.fr/files/Baumol1967.pdf',
  'http://stats.org.uk/statistical-inference/TverskyKahneman1971.pdf',
  'http://www.bailii.org/ew/cases/EWCA/Civ/1991/11.html',
  'http://www.econ.yale.edu/growth_pdf/cdp764.pdf',
  'http://www.econ2.jhu.edu/people/ccarroll/public/lecturenotes/assetpricing/bubbles/',
  'http://www.iot.ntnu.no/innovation/norsi-pims-courses/harrison/Meyer%20&%20Rowan%20(1977).PDF',
  'http://www.jstor.org/stable/285080',
  'http://www.pilaj.jp/',
  'http://www.scholarpedia.org/article/Donald_Olding_Hebb',
  'http://www.scholarpedia.org/article/Inattentional_blindness',
  'http://www.scholarpedia.org/article/Kamin_blocking',
  'http://www.scholarpedia.org/article/Scale-free_networks',
  'http://www.uniset.ca/other/css/22ER931.html',
  'http://www1.tcue.ac.jp/home1/takamatsu/107016/6.html',
];

function dataFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') dataFiles(full, out);
      continue;
    }
    if (/\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/** データ中の `url:` / `sourceUrl:` / `href:` を集める。 */
export function citationUrls(text: string): string[] {
  return [...text.matchAll(/(?:url|sourceUrl|href)\s*:\s*'([^']*)'/g)]
    .map((m) => m[1]!)
    .filter((u) => u.length > 0);
}

const allUrls = (): string[] => {
  const out: string[] = [];
  for (const f of [...dataFiles('src/renderer/data'), ...dataFiles('src/shared')]) {
    out.push(...citationUrls(readFileSync(f, 'utf8')));
  }
  return out;
};

describe('出典の URL スキーム', () => {
  it('http(s) 以外のスキームは 1 件も無い', () => {
    const odd = allUrls().filter((u) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) && !/^https?:/.test(u));
    expect(odd, 'javascript: / data: 等が出典に混ざっています').toEqual([]);
  });

  it('平文 http の出典が台帳と一致する (増えても減っても鳴る)', () => {
    const actual = [...new Set(allUrls().filter((u) => u.startsWith('http://')))].sort();
    const known = [...KNOWN_CLEARTEXT].sort();
    const added = actual.filter((u) => !known.includes(u));
    const gone = known.filter((u) => !actual.includes(u));
    expect(
      added,
      '平文 http の出典が増えました。https で同じ物が引けるか**実際に確かめて**から決めてください (推測で置換しない)',
    ).toEqual([]);
    expect(gone, '直したなら台帳からも消してください').toEqual([]);
  });

  /* 走査が動いていること (空虚に通っていない)。 */
  it('負の対照: 走査は実物の出典を読んでいる', () => {
    const urls = allUrls();
    expect(urls.length).toBeGreaterThan(5000);
    expect(urls.filter((u) => u.startsWith('https://')).length).toBeGreaterThan(5000);
  });

  it('判定そのものの対照', () => {
    expect(citationUrls("url: 'https://a/'")).toEqual(['https://a/']);
    expect(citationUrls("sourceUrl: 'http://b/'")).toEqual(['http://b/']);
    expect(citationUrls("href: 'javascript:x'")).toEqual(['javascript:x']);
    expect(citationUrls("name: 'https://not-a-url-field/'")).toEqual([]);
  });
});
