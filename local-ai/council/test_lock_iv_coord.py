"""IV更新の取消と肯定の暗号操作が並ぶ決定を、datacrypto-0927-cancel が落とす。

取消の語が 16 字以内にあると否定扱いになり、並列の目的語が 4 字を超えると
「と実施」の救出にも掛からなかった。nonce / random値 / getRandomValues の
管理・更新は語彙に無かった。

L1: 実文を check と、保存口 commit_decision の副作用（decisions.md に書かない）で見る。
L2: 同じ族の言い換えと、維持・取消確定・触らない文。
L3: 同じ入力の再投入、暗号語の無い「管理を実施」、取消だけの再確認。
L4（言い換えの総当たり）と L5（節の入れ替え・09:06 の別動詞への否定）には届いていない。
"""
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import decision_lock as d

d.LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
d.reload(force=True)

LOCK = "固定:datacrypto-0927-cancel"

# L1: ロックをすり抜けていた実文。
REAL = [
    "IV更新の取消しとロードリスケーティングを実施し、メモリの効率的な使用を図ります。",
    "データセキュリティと品質を優先し、IV 更新の取消とロードリスケーティングを実行します。",
    "3. IV更新の取消とnonceの管理を実施します。",
    "IV更新の取消とnonceの管理を実施し、データの安全性を確保します。",
    "IV更新の取消と非同期処理導入によりセキュリティリスクを低減します。",
    "nonceの管理を実施します。",
    "random値の更新を実施します。",
    "getRandomValuesの更新を実施します。",
]

# L2: 同じ族。記録してはいけない。
PARAPHRASE = [
    "ノンスの管理を実行します。",
    "Nonceの変更を進めます。",
    "乱数の再生成を行います。",
    "getRandomValuesの管理を実行します。",
]

# L2: 記録してよい。取消の維持・再確認、暗号語の無い管理。
KEEP = [
    "IV更新は取消確定のまま維持し、触らない。",
    "09:27の実装開始とIV更新は取消確定であり、再着手しない。",
    "IV更新の取消は確定済みなので議題にしない。",
    "dataCrypto/IVには触らない。",
    "在庫の管理を実施します。",
    "品質の管理を実施します。",
    # 取消を実施、は取消の再確認として読む。命令にしない。
    "IV更新の取消を実施します。",
    "nonceの管理を実施しない。",
    "nonceの管理を行わない。",
    "random値の更新は行政の手続きです。",
]

# この PR では塞がない。16 字の否定窓が別の動詞（再利用しない）に付く。
GAP_0906 = "既存のdataCryptoとhostEncrypt内のrandom値の更新はNonceを再利用しないようにします"


def _read(path):
    if not os.path.exists(path):
        return ""
    with open(path, encoding="utf-8") as f:
        return f.read()


def _ids(text):
    return [h[0] for h in d.check(text)]


def _save(text):
    folder = tempfile.mkdtemp(prefix="council-iv-coord-")
    dec_p = os.path.join(folder, "decisions.md")
    rej_p = os.path.join(folder, "rejected_decisions.md")
    outcome, hits = d.commit_decision(
        text, decisions_path=dec_p, rejected_path=rej_p, topic="IV座標", summary="", review=""
    )
    return outcome, hits, _read(dec_p), _read(rej_p), folder


class IvCoordTest(unittest.TestCase):
    def test_l1_real_sentences_hit_the_lock(self):
        for text in REAL:
            with self.subTest(text=text):
                self.assertIn(LOCK, _ids(text), text)
                self.assertEqual(_ids(text), _ids(text))
                outcome, hits, dec, rej, folder = _save(text)
                try:
                    self.assertEqual(outcome, "reject", hits)
                    self.assertNotIn(text, dec)
                    self.assertNotIn("担当役員:", dec)
                    self.assertIn(text, rej)
                    self.assertIn("datacrypto-0927-cancel", rej)
                    self.assertIn("却下した決定", rej)
                finally:
                    shutil.rmtree(folder, ignore_errors=True)

    def test_l2_paraphrases_hit_the_lock(self):
        for text in PARAPHRASE:
            with self.subTest(text=text):
                self.assertIn(LOCK, _ids(text), text)

    def test_l2_keep_sentences_pass(self):
        for text in KEEP:
            with self.subTest(text=text):
                self.assertEqual(d.check(text), [], text)
                outcome, hits, dec, rej, folder = _save(text)
                try:
                    self.assertEqual(outcome, "accept", hits)
                    self.assertIn(text, dec)
                    self.assertIn("担当役員:", dec)
                    self.assertNotIn(text, rej)
                    self.assertNotIn("却下した決定", rej)
                finally:
                    shutil.rmtree(folder, ignore_errors=True)

    def test_l3_overmatch_guard(self):
        self.assertEqual(d.check("在庫の管理を実施します。"), [])
        self.assertEqual(d.check("品質の管理を実施します。"), [])
        self.assertEqual(d.check("会議の進行を実施します。"), [])

    def test_l3_idempotent(self):
        bad = REAL[2]
        keep = KEEP[0]
        self.assertEqual(d.check(bad), d.check(bad))
        self.assertEqual(d.check(keep), d.check(keep))
        folder = tempfile.mkdtemp(prefix="council-iv-coord-idem-")
        dec_p = os.path.join(folder, "decisions.md")
        rej_p = os.path.join(folder, "rejected_decisions.md")
        try:
            o1, h1 = d.commit_decision(bad, decisions_path=dec_p, rejected_path=rej_p, topic="再投入")
            o2, h2 = d.commit_decision(bad, decisions_path=dec_p, rejected_path=rej_p, topic="再投入")
            dec, rej = _read(dec_p), _read(rej_p)
            self.assertEqual(o1, "reject")
            self.assertEqual(o2, "reject")
            self.assertEqual([h[0] for h in h1], [h[0] for h in h2])
            self.assertNotIn(bad, dec)
            self.assertNotIn("担当役員:", dec)
            self.assertEqual(rej.count("保存前検査で却下"), 2)
            self.assertEqual(rej.count(bad), 2)
            self.assertIn("datacrypto-0927-cancel", rej)
            o3, _ = d.commit_decision(keep, decisions_path=dec_p, rejected_path=rej_p, topic="維持")
            o4, _ = d.commit_decision(keep, decisions_path=dec_p, rejected_path=rej_p, topic="維持")
            dec, rej = _read(dec_p), _read(rej_p)
            self.assertEqual(o3, "accept")
            self.assertEqual(o4, "accept")
            self.assertEqual(dec.count(keep), 2)
            self.assertNotIn(bad, dec)
            self.assertNotIn(keep, rej)
        finally:
            shutil.rmtree(folder, ignore_errors=True)

    def test_known_gaps_still_pass(self):
        """塞がないと明記した形。check は空で、decisions.md には書ける。"""
        for text in (GAP_0906, "IV更新の取消を実施します。"):
            with self.subTest(text=text):
                self.assertEqual(d.check(text), [])
                outcome, hits, dec, rej, folder = _save(text)
                try:
                    self.assertEqual(outcome, "accept", hits)
                    self.assertIn(text, dec)
                    self.assertNotIn("却下した決定", rej)
                finally:
                    shutil.rmtree(folder, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
