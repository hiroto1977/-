/**
 * **スキルの「実行に使う名前」と「画面に出す題」を分ける** (2026-09-12 · パス 179)。
 *
 * ## 実測した欠陥
 *
 * `scanSkills` は 1 つの欄 (`name`) に 2 つの役を兼ねさせていた ——
 * frontmatter の `name:` が在ればそれ、無ければファイル名。
 * 画面はそれを題として刷り、**同じ値を `run-skill` の鍵として送っていた**。
 * ところが `readSkillBody` は鍵から `~/.claude/skills/<鍵>/SKILL.md` を組むので、
 * frontmatter の `name:` がフォルダ名と違うと**別の物を指す**。
 *
 * 実測 (2026-09-12、`scanSkills` + `ACTIONS['run-skill']` の直接呼び出し):
 *
 * | 置いた物 | 一覧の表示 | 実行を押すと |
 * |---|---|---|
 * | `invoice/SKILL.md` · `name: 請求書作成` | 請求書作成 | `skill "請求書作成" has an unsafe name` |
 * | `my-tool/SKILL.md` · `name: helper` | helper | `skill "helper" not found in ~/.claude/skills` |
 * | `alpha/SKILL.md` · `name: beta` + `beta/SKILL.md` | beta | **`beta/SKILL.md` の本文が Anthropic へ行く** (成功として表示) |
 * | `plain.md` (frontmatter 無し) | plain | 動く |
 *
 * **動くのは「frontmatter の名前がファイル名と同じ」ときだけ**だった。
 * 3 行目がいちばん重い —— 選んだのとは**別のスキルの定義が第三者の API へ送られ**、
 * 画面は成功と言う。この app は日本語向けなので 1 行目 (日本語の `name:`) は
 * 最も出やすい形である。
 *
 * ## この module が持つもの
 *
 * 鍵 (`id`) と題 (`label`) を分けたうえで、**鍵で実行できない物を画面が言う**ための文。
 * 判定そのもの (`isSafeSkillName`) は `main/clients/skills.ts` に 1 つだけ在り、
 * ここには**写さない** —— 同じ規則を 2 か所に置くと必ず片方が緩む
 * (パス 167 / 174 で 2 度直した形)。
 */

/** 実行できない理由を画面に出すための最小の形。 */
export interface SkillChoice {
  /** 実行するときの鍵 = フォルダ名 (`<id>/SKILL.md`) かファイル名 (`<id>.md`)。 */
  readonly id: string;
  /** 画面に出す題 (frontmatter の `name:`、無ければ `id`)。 */
  readonly label: string;
}

/** 実行に使える字。`isSafeSkillName` の**説明**であって判定ではない (判定は main に 1 つ)。 */
const USABLE_CHARS = '英数字と . _ -';

/**
 * 鍵に使えない字が入っているとき。
 *
 * **題を変えろとは言わない** —— 直すのはフォルダ名で、`name:` は日本語のままでよい。
 * 「できない」で終わらせず打てる手を書く (パス 157 の規準)。
 */
export function unsafeSkillIdNote(id: string): string {
  return (
    `実行できません: 実行には ${USABLE_CHARS} だけの名前が要りますが、`
    + `フォルダ名 (またはファイル名) は「${id}」です。`
    + 'フォルダ名を英数字に変えると実行できます (frontmatter の name: は日本語のままで構いません)。'
  );
}

/**
 * 同じ鍵を 2 つの物が持っているとき。
 *
 * `readSkillBody` は `<id>/SKILL.md` を先に見るので、**フォルダ側が勝つ**。
 * 負けた側は押しても別の物が走るので、押させない。
 */
export function shadowedSkillIdNote(id: string, winnerPath: string): string {
  return (
    `実行できません: 同じ名前「${id}」を ${winnerPath} も持っており、`
    + '実行するとそちらの定義が読まれます。どちらかの名前を変えてください。'
  );
}

/**
 * 選択肢に出す文字列。**題が一意でなければ鍵を添える。**
 *
 * 題は frontmatter が決めるので重なりうる (`alpha/` と `gamma/` が同じ `name:` を
 * 書ける)。重なったまま並べると、利用者には**どちらを選んだのか分からない**
 * —— パス 179 で直した「一覧と実行が別の物を指す」の残り半分である。
 */
export function skillOptionText(choice: SkillChoice, all: readonly SkillChoice[]): string {
  const sameLabel = all.filter((c) => c.label === choice.label).length;
  return sameLabel > 1 ? `${choice.label} (${choice.id})` : choice.label;
}

/**
 * 一覧に「実行できない物が在る」と言う 1 文 (0 件なら何も言わない = `undefined`)。
 *
 * 件数だけを言い、理由は各行に出す —— まとめて書くと行との対応が消える。
 */
export function unrunnableSkillsNote(count: number): string | undefined {
  if (count <= 0) return undefined;
  return `このうち ${count} 件は実行できません (一覧の各行に理由を出しています)。`;
}
