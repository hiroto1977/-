"""通る2形を消す決定は decisions.md に載せず、残す決定は載せる。
実失敗（2形を消す / 通る構文を消す / 2つのコード形の削除 / 残すを消すに逆転）と、
言い換え・紛らわしい対・main との差分・入れ子を同じ commit_decision で見る。"""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import decision_lock as d
import syntax_forms_guard as g

d.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
d.reload(force=True)

# (id, level, text, expected)。parent は main の commit_decision。このガードが無いので全部 accept が差分。
F = [
    ("l1-two-erase", 1, "2形を消す", "reject"),
    ("l1-syntax-erase", 1, "通る構文を消す", "reject"),
    ("l1-code-erase", 1, "`const { email, token } = o;` と `for (const ch of s)` を削除", "reject"),
    ("l1-reversal-0912", 1, "09:12: 2形残すを「消す」と決定する", "reject"),
    ("l1-reversal-1313", 1, "13:13: 助言の「2形は残す」を削除と決定する", "reject"),
    ("l1-reversal-1441", 1, "14:41: 2形を残す助言を、通る構文を消す決定に読み替える", "reject"),
    ("l1-keep", 1, "2形は残す", "accept"),
    ("l1-keep-code", 1, "`const { email, token } = o;` と `for (const ch of s)` は削除しない", "accept"),
    ("l2-abolish-destructure", 2, "浅い const { a, b: c } = x; を廃止する", "reject"),
    ("l2-remove-for", 2, "for (const n of xs) をパーサから外す", "reject"),
    ("l2-ban", 2, "2形を禁止する", "reject"),
    ("l2-drop", 2, "通っている構文を落とす", "reject"),
    ("l2-cancel-for", 2, "for (const ch of s) を取り消す", "reject"),
    ("l2-keep-two", 2, "二つの形は残す", "accept"),
    ("l2-do-not-delete", 2, "削除しない", "accept"),
    ("l2-no-education", 2, "構文教育は不要", "accept"),
    ("l2-not-delete-code", 2, "for (const ch of s) を削除しない", "accept"),
    ("l2-finance", 2, "来期の広告費を削除する", "accept"),
    ("l3-pair-keep-syntax", 3, "通る構文は消さない", "accept"),
    ("l3-pair-keep-destructure", 3, "const { a, b: c } = x は維持する", "accept"),
    ("l3-two-format", 3, "2形式の帳票を削除する", "accept"),
    ("l3-two-format-direct", 3, "2形式を削除する", "accept"),
    ("l3-12form", 3, "12形の部品を消す", "accept"),
    ("l3-parser-name", 3, "通る構文解析のメモを削除する", "accept"),
    ("l3-quote-example", 3, "例として const { email, token } = o; と for (const ch of s) を示す", "accept"),
    ("l3-delete-example", 3, "教育資料から for (const ch of s) の例を削除する", "accept"),
    ("l3-explain", 3, "2形の説明を削除する", "accept"),
    ("l3-api", 3, "決済APIの /v1/charges を削除する", "accept"),
    ("l3-array", 3, "const [a, b] = xs を削除する", "accept"),
    ("l3-array-add", 3, "配列の const [a, b] = xs は足さない", "accept"),
    ("l3-for-in", 3, "for (const i in xs) を削除する", "accept"),
    ("l3-for-let", 3, "for (let x of xs) を削除する", "accept"),
    ("l3-let-destructure", 3, "let { a } = x を削除する", "accept"),
    ("l3-revoke-deletion", 3, "2形の削除を取り消す", "accept"),
    ("l3-while", 3, "while文を削除する", "accept"),
    ("l3-as", 3, "as を削除する", "accept"),
    ("l3-forbid-deletion", 3, "2形の削除を禁止する", "accept"),
    ("l3-record-example", 3, "決定: const { email, token } = o; の分割代入の例をdecisions.mdに記録する。", "accept"),
    ("l3-use-for", 3, "決定: Mamoriにwhile文は追加しない。for (const ch of s) を使う。", "accept"),
    ("l3-fullwidth", 3, "２形を消す", "reject"),
    ("l3-fullwidth-code", 3, "ｃｏｎｓｔ　｛ｅｍａｉｌ，ｔｏｋｅｎ｝＝ｏ；を削除する", "reject"),
    ("l3-zwsp", 3, "2\u200b形を消す", "reject"),
    ("l3-ideographic-space", 3, "2形を　消す", "reject"),
    ("l4-review-smuggle", 4, "2形は残す\n通る構文を消す", "reject"),
    ("l4-review-uphold", 4, "来期の会議室の椅子を2脚買い足す。\n2形は残す。削除しない。", "accept"),
    ("l5-quote-error", 5, "「2形を消す」は誤り。残す", "accept"),
    ("l5-nested-error", 5, "助言は「『2形を消す』は誤り」なので残す", "accept"),
    ("l5-wrote-but", 5, "過去に「2形を消す」と書いたが、実施してはならない", "accept"),
    ("l5-later-erase", 5, "2形は残す方針だが、今回は通る構文を消す", "reject"),
    ("l5-later-keep", 5, "通る構文を消したいが、削除は破棄し2形は残す", "accept"),
    ("l5-still-delete", 5, "残すと言ったが、やはり for (const n of xs) を削除する", "reject"),
    ("l5-quote-order", 5, "決定は「for (const ch of s) を削除」", "reject"),
    ("l5-nested-reversal", 5, "助言「2形は残す」を、さらに「消す」と読み替える", "reject"),
    ("l5-reassert", 5, "削除はしない。いや、2形を消す", "reject"),
    ("l5-retract", 5, "2形を消す。いや、残す", "accept"),
    ("l5-must", 5, "2形を削除しなければならない", "reject"),
    ("l5-must-not", 5, "2形を削除してはならない", "accept"),
    ("l5-na", 5, "2形を消すな", "accept"),
    ("l5-nara", 5, "2形を消すなら、今すぐ削除する", "reject"),
    ("l5-newline", 5, "2形を\n消す", "reject"),
    ("l5-one-form", 5, "for (const ch of s) だけ削除し、const { a, b: c } = x; は残す", "reject"),
    ("l5-both-kept-after", 5, "2形を消す。やはり2形は残す", "accept"),
    ("l5-quote-only", 5, "資料に「const { email, token } = o;」と「for (const ch of s)」を載せる", "accept"),
    ("l5-partial-keep", 5, "2形を消す。for (const ch of s) は消さない", "reject"),
    ("l5-mo", 5, "2形も消す", "reject"),
    ("l5-made", 5, "通る構文まで消す", "reject"),
    ("l5-shuffled-keep", 5, "椅子を買い足す。for (const ch of s) は残す。const { email, token } = o; も削除しない。", "accept"),
    ("l5-report-past", 5, "09:12が消そうとした const { email, token } = o; と for (const ch of s) は実装どおり残す", "accept"),
    ("l5-delete-suna", 5, "2形を削除するな", "accept"),
    ("l5-double-neg-keep", 5, "2形の削除を禁止しない", "accept"),
    ("l5-double-neg-then-erase", 5, "2形の削除を禁止しない。やはり消す", "reject"),
    ("l5-kore-erase", 5, "2形は残すと言った。これは消す", "reject"),
]


def load_parent():
    src = subprocess.check_output(["git", "show", "main:local-ai/council/decision_lock.py"], cwd=ROOT)
    fd, path = tempfile.mkstemp(suffix=".py")
    os.write(fd, src)
    os.close(fd)
    spec = importlib.util.spec_from_file_location("decision_lock_main_syntax", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
    mod.reload(force=True)
    return mod, path


def paths():
    folder = tempfile.mkdtemp(prefix="council-syntax-")
    return (os.path.join(folder, "decisions.md"), os.path.join(folder, "rejected_decisions.md"), folder)


def read(path):
    return open(path, encoding="utf-8").read() if os.path.exists(path) else ""


def normal_block(text):
    return bool(re.search(r"(?m)^## \d{4}-\d{2}-\d{2} ", text)) and "担当役員:" in text


def commit(mod, text):
    dec_p, rej_p, folder = paths()
    outcome, hits = mod.commit_decision(text, decisions_path=dec_p, rejected_path=rej_p, topic="検査", summary="", review="")
    return outcome, hits, read(dec_p), read(rej_p), folder


def files_ok(expected, dec, rej, text):
    normal = normal_block(dec)
    rejected = "却下した決定" in rej
    exclusive = not (normal and rejected)
    if expected == "reject":
        return exclusive and (not normal) and rejected and "mamori-two-forms" in rej and "担当役員:" not in dec and text in rej
    return exclusive and normal and (not rejected) and "却下した決定" not in rej and text in dec and "担当役員:" in dec


def main():
    parent, parent_path = load_parent()
    errors, rows = [], []
    try:
        for fid, level, text, expected in F:
            outcome, hits, dec, rej, folder = commit(d, text)
            p_out, _, pdec, prej, pfolder = commit(parent, text)
            parent_actual = p_out
            got = outcome
            ok = got == expected and parent_actual == "accept" and files_ok(expected, dec, rej, text)
            # main 側は通常ブロックになる（このガードが無い）。却下ファイルに mamori-two-forms は出ない。
            if parent_actual == "accept":
                ok = ok and normal_block(pdec) and "mamori-two-forms" not in prej
            if not ok:
                errors.append(
                    f"{fid}: expected={expected} got={got} parent={parent_actual} "
                    f"normal={normal_block(dec)} rej={('却下した決定' in rej)} id={'mamori-two-forms' in rej} hits={hits!r}"
                )
            rows.append((fid, level, expected, got, parent_actual, "OK" if ok else "NG"))
            shutil.rmtree(folder, ignore_errors=True)
            shutil.rmtree(pfolder, ignore_errors=True)

        # L3 冪等: 同じ消去を2回入れても通常決定にならず、却下は2件。
        dec_p, rej_p, folder = paths()
        text = "2形を消す"
        d.commit_decision(text, decisions_path=dec_p, rejected_path=rej_p, topic="再投入")
        d.commit_decision(text, decisions_path=dec_p, rejected_path=rej_p, topic="再投入")
        dec, rej = read(dec_p), read(rej_p)
        idem_ok = (not normal_block(dec)) and rej.count("保存前検査で却下") == 2 and rej.count("mamori-two-forms") == 2 and text in rej
        if not idem_ok:
            errors.append(f"idempotent: blocks={normal_block(dec)} rejects={rej.count('保存前検査で却下')}")
        rows.append(("l3-idempotent-twice", 3, "reject", "reject" if idem_ok else "accept", "accept", "OK" if idem_ok else "NG"))
        shutil.rmtree(folder, ignore_errors=True)

        # L3 符号化は正規化の前後で判定が変わらない。
        samples = ["２形を消す", "2\u200b形を消す", "ｃｏｎｓｔ　｛ｅｍａｉｌ，ｔｏｋｅｎ｝＝ｏ；を削除する", "2形は残す"]
        enc_ok = g.normalize(g.normalize(samples[0])) == g.normalize(samples[0])
        for s in samples:
            enc_ok = enc_ok and (bool(g.check(s)) == bool(g.check(g.normalize(s))))
        enc_ok = enc_ok and bool(g.check("２形を消す")) and bool(g.check("2\u200b形を消す")) and not g.check("2形は残す")
        if not enc_ok:
            errors.append("encoding: normalize is not stable or fullwidth/zwsp drifted")
        rows.append(("l3-encoding-stable", 3, "reject", "reject" if enc_ok else "accept", "accept", "OK" if enc_ok else "NG"))

        # L4 排他: 上の各行で既に見ている。保存口が commit_decision であることを源で確認する。
        lock_src = open(os.path.join(HERE, "decision_lock.py"), encoding="utf-8").read()
        council_src = open(os.path.join(HERE, "council.py"), encoding="utf-8").read()
        locks = open(os.path.join(HERE, "locked_decisions.md"), encoding="utf-8").read()
        path_ok = (
            "syntax_forms_guard.check" in lock_src
            and "syntax_forms_guard.check" in council_src
            and "mamori-two-forms" not in locks
            and "decision_lock.commit_decision" in council_src
            and 'open(os.path.join(HERE, "decisions.md"), "a"' not in council_src
        )
        if not path_ok:
            errors.append("path: commit_decision/guard_check does not consult the guard, or a CEO lock was invented")
        rows.append(("l4-path-and-not-ceo-lock", 4, "accept", "accept" if path_ok else "reject", "accept", "OK" if path_ok else "NG"))

        # 議長文が消去を足しても decisions に乗らない。維持の講評は乗る。
        dec_p, rej_p, folder = paths()
        outcome, hits = d.commit_decision(
            "2形は残す", decisions_path=dec_p, rejected_path=rej_p, topic="形", summary="", review="通る構文を消す"
        )
        dec, rej = read(dec_p), read(rej_p)
        smuggle_ok = outcome == "reject" and not normal_block(dec) and "mamori-two-forms" in rej and "通る構文を消す" in rej
        p_out, _, pdec, prej, pfolder = commit(parent, "2形は残す\n通る構文を消す")
        smuggle_ok = smuggle_ok and p_out == "accept" and normal_block(pdec)
        if not smuggle_ok:
            errors.append(f"chair-smuggle: {outcome} parent={p_out} hits={hits!r}")
        rows.append(("l4-chair-smuggle", 4, "reject", outcome, p_out, "OK" if smuggle_ok else "NG"))
        shutil.rmtree(folder, ignore_errors=True)
        shutil.rmtree(pfolder, ignore_errors=True)

        dec_p, rej_p, folder = paths()
        outcome, _ = d.commit_decision(
            "来期の会議室の椅子を2脚買い足す。", decisions_path=dec_p, rejected_path=rej_p,
            topic="椅子", summary="", review="2形は残す。削除しない。",
        )
        dec, rej = read(dec_p), read(rej_p)
        uphold_ok = outcome == "accept" and normal_block(dec) and "却下した決定" not in rej
        if not uphold_ok:
            errors.append(f"chair-uphold: {outcome} normal={normal_block(dec)} rej={rej!r}")
        rows.append(("l4-chair-uphold", 4, "accept", outcome, "accept", "OK" if uphold_ok else "NG"))
        shutil.rmtree(folder, ignore_errors=True)
    finally:
        os.remove(parent_path)

    reached = 0
    for level in (1, 2, 3, 4, 5):
        if any(mark != "OK" for _, lv, _, _, _, mark in rows if lv <= level):
            break
        reached = level

    art = "/opt/cursor/artifacts"
    os.makedirs(art, exist_ok=True)
    lines = [
        f"precision=L{reached}",
        "",
        "| fixture | level | expected | actual | parent (main) | result |",
        "|---|---|---|---|---|---|",
    ]
    for fid, level, expected, got, parent_actual, mark in rows:
        lines.append(f"| {fid} | L{level} | {expected} | {got} | {parent_actual} | {mark} |")
    table = "\n".join(lines) + "\n"
    open(os.path.join(art, "syntax-forms-matrix.md"), "w", encoding="utf-8").write(table)
    print(table)
    if errors:
        print("FAILURES")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    n_rej = sum(1 for r in rows if r[2] == "reject")
    n_acc = sum(1 for r in rows if r[2] == "accept")
    print(f"ALL OK syntax-forms precision=L{reached} fixtures={len(rows)} reject={n_rej} accept={n_acc}")


if __name__ == "__main__":
    main()
