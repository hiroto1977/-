"""残作業の議題が、題名の次が ## 節でも健全性に落ちないこと。

直す前の pick_topic は `open(path).read().split("\\n## ")[0]` の箇条書きだけを見ていた。
docs/REMAINING_WORK.md は `# Service Hub — 残りの作業手順書` の直後が `## ` なので、
先頭の切片は題名だけで items は空、議題は毎回「サービス健全性: ローカルAI環境の改善」だった。
パスも `/workspace/repo-analysis/docs/REMAINING_WORK.md` 固定で、このリポジトリには無い。

精度の梯子（この検査が実際に見ているもの）:
  L1  pick_topic の戻り。却下は rejected_decisions.md と system.log を読み直して見る。
  L2  題名に「残」があっても、閉じた穴だけの行は選ばない。見出しの印と行の印を分ける。
  L3  同じファイルを二度読んでもバイトは不変。ROT の剰余。上書きパス・欠落・旧パス。全角の番号。
  L4  locked_decisions.md は呼び出しの前後でバイト一致。却下した行は健全性の議題に替えない。
  L5  常駐の評議会と decisions.md の数時間分は見ていない。未達。
"""
import hashlib, os, shutil, sys, tempfile, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False
LOCK_FILE = os.path.join(HERE, "locked_decisions.md")


def ensure_import_key():
    """council.py は読込時に鍵ファイルを開く。無いときだけ検査用の仮鍵を作る。"""
    global _CREATED_KEY
    if os.path.exists(KEY_FILE):
        return
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, b"test-key-not-secret\n")
    os.close(fd)
    _CREATED_KEY = True


ensure_import_key()
import council  # noqa: E402


# この変更で触ってはいけないファイル。pick_topic の前後でバイトが同じことだけ見る。
_UNTOUCHED = (
    LOCK_FILE,
    os.path.normpath(os.path.join(HERE, "..", "start-all.sh")),
    os.path.normpath(os.path.join(HERE, "..", "stop-all.sh")),
    os.path.normpath(os.path.join(HERE, "..", "..", "src", "renderer", "security", "dataCrypto.ts")),
)


def _sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


_UNTOUCHED_BEFORE = {p: _sha(p) for p in _UNTOUCHED}


def tearDownModule():
    for p, digest in _UNTOUCHED_BEFORE.items():
        if _sha(p) != digest:
            raise AssertionError(f"触ってはいけないファイルが変わった: {p}")
    if _CREATED_KEY and os.path.exists(KEY_FILE):
        os.remove(KEY_FILE)


TITLE = "# Service Hub — 残りの作業手順書\n"
HEALTH = "ローカルAI環境の改善"
A = "- 画面の余白を直す（未着手）"
B = "- 入力欄の名前を足す（別パス）"
DONE = "- メモリ表示を直して閉じた"
LOCKED = "- llama7Bを再起動してメモリ再分配する（別パス）"


def doc(*sections):
    """実ファイルと同じ並び: 題名、空行、`## ` 節。新しい節を先に書く。"""
    parts = [TITLE]
    for heading, bullets in sections:
        parts.append(f"\n## {heading}\n\n")
        for b in bullets:
            parts.append(b if b.endswith("\n") else b + "\n")
    return "".join(parts)


def legacy_split_bullets(text):
    """直す前の式。先頭の `## ` より前だけを箇条書きにする。"""
    return [l.strip() for l in text.split("\n## ")[0].splitlines() if l.strip().startswith(("-", "*"))]


class PickTopicRemainingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="council-topic-")
        os.makedirs(os.path.join(self.tmp, "logs"))
        self.c = council
        self._env = os.environ.get("COUNCIL_REMAINING_WORK")
        os.environ.pop("COUNCIL_REMAINING_WORK", None)
        self._here, self._advice, self._rej = self.c.HERE, self.c.ADVICE, self.c.REJECTED
        self._pending = list(self.c.PENDING)
        self._rot = self.c.ROT[0]
        self.c.HERE = self.tmp
        self.c.ADVICE = os.path.join(self.tmp, "advice_inbox.md")
        self.c.REJECTED = os.path.join(self.tmp, "rejected_decisions.md")
        self.c.PENDING.clear()
        self.c.ROT[0] = 0
        self.lock_before = open(LOCK_FILE, "rb").read()
        self.health = mock.patch.object(self.c, "health_view", return_value=([], "空きメモリ 9999MB / 停止中: なし", {}))
        self.health.start()
        # 健全性議題の冷却の状態も一時の置き場へ (実物の council の置き場に書かない)。
        self._health_state, self._inbox = self.c.HEALTH_STATE, self.c.INBOX
        self.c.HEALTH_STATE = os.path.join(self.tmp, "health_topic_state.json")
        self.c.INBOX = os.path.join(self.tmp, "inbox.md")

    def tearDown(self):
        self.health.stop()
        self.c.HEALTH_STATE, self.c.INBOX = self._health_state, self._inbox
        after = open(LOCK_FILE, "rb").read()
        self.c.HERE = self._here
        self.c.ADVICE = self._advice
        self.c.REJECTED = self._rej
        self.c.PENDING[:] = self._pending
        self.c.ROT[0] = self._rot
        if self._env is None:
            os.environ.pop("COUNCIL_REMAINING_WORK", None)
        else:
            os.environ["COUNCIL_REMAINING_WORK"] = self._env
        shutil.rmtree(self.tmp, ignore_errors=True)
        self.assertEqual(after, self.lock_before, "locked_decisions.md を変えない")

    def write(self, text):
        path = os.path.join(self.tmp, "REMAINING_WORK.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        os.environ["COUNCIL_REMAINING_WORK"] = path
        return path

    def pick(self):
        return self.c.pick_topic()

    def log_text(self):
        path = os.path.join(self.tmp, "logs", "system.log")
        if not os.path.exists(path):
            return ""
        with open(path, encoding="utf-8") as f:
            return f.read()

    def rejected_text(self):
        if not os.path.exists(self.c.REJECTED):
            return ""
        with open(self.c.REJECTED, encoding="utf-8") as f:
            return f.read()

    def test_real_structure_picks_unfinished_not_health(self):
        """題名の直後が ## 節。直す前の切片には箇条書きが無く、健全性に落ちていた。"""
        text = doc(
            ("パス 574 閉じた穴", [DONE, "- 検査を足して閉じた"]),
            ("パス 573 で測って残した物", [A]),
        )
        self.assertEqual(legacy_split_bullets(text), [], "直す前の式は題名しか見ない")
        path = self.write(text)
        before = open(path, "rb").read()
        src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("画面の余白を直す", topic)
        self.assertNotIn(HEALTH, topic)
        self.assertNotIn("メモリ表示を直して閉じた", topic)
        self.assertEqual(open(path, "rb").read(), before, "残作業ファイルは読むだけで書かない")

    def test_finished_only_is_health(self):
        """題名の『残』だけでは選ばない。閉じた穴だけの行は健全性へ戻る。"""
        text = doc(("パス 100 閉じた穴", [DONE, "- 検査を足して閉じた"]))
        self.assertIn("残", TITLE)
        self.write(text)
        src, topic = self.pick()
        self.assertEqual(src, "サービス健全性")
        self.assertIn(HEALTH, topic)
        self.assertNotIn("メモリ表示", topic)

    def test_rotation_advances(self):
        text = doc(
            ("パス 574 で測って残した物", [A, B]),
            ("パス 573 閉じた穴", [DONE]),
        )
        self.write(text)
        self.c.ROT[0] = 0
        src0, t0 = self.pick()
        self.c.ROT[0] = 1
        src1, t1 = self.pick()
        self.c.ROT[0] = 2
        src2, t2 = self.pick()
        self.assertEqual(src0, "リポジトリ残作業")
        self.assertEqual(src1, "リポジトリ残作業")
        self.assertEqual(src2, "リポジトリ残作業")
        self.assertIn("画面の余白を直す", t0)
        self.assertIn("入力欄の名前を足す", t1)
        self.assertIn("画面の余白を直す", t2)
        self.assertNotEqual(t0, t1)
        for t in (t0, t1, t2):
            self.assertNotIn("メモリ表示を直して閉じた", t)

    def test_locked_item_is_logged_and_not_health(self):
        text = doc(("測って残した物", [LOCKED, A]))
        self.write(text)
        src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("画面の余白を直す", topic)
        self.assertNotIn("再起動", topic)
        self.assertNotIn(HEALTH, topic)
        log = self.log_text()
        rej = self.rejected_text()
        self.assertIn("議題却下", log)
        self.assertIn("リポジトリ残作業", log)
        self.assertIn("llama7B", log)
        self.assertIn("llama7B", rej)
        self.assertIn("llama7B-stop", rej)
        self.assertNotIn("担当役員", rej)

    def test_missing_file_is_health(self):
        missing = os.path.join(self.tmp, "no-such-remaining.md")
        os.environ["COUNCIL_REMAINING_WORK"] = missing
        src, topic = self.pick()
        self.assertEqual(src, "サービス健全性")
        self.assertIn(HEALTH, topic)
        self.assertFalse(os.path.exists(missing))

    def test_path_override_reads_that_file(self):
        text = doc(("残した物", ["- 上書きパスだけの未着手項目"]))
        path = self.write(text)
        src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("上書きパスだけの未着手項目", topic)
        self.assertEqual(self.c.remaining_work_path(), path)

    def test_legacy_path_when_repo_file_missing(self):
        text = doc(("残した物", ["- 旧パスにしか無い未着手"]))
        legacy = os.path.join(self.tmp, "legacy-remaining.md")
        with open(legacy, "w", encoding="utf-8") as f:
            f.write(text)
        os.environ.pop("COUNCIL_REMAINING_WORK", None)
        with mock.patch.object(self.c, "repo_remaining_path", return_value=os.path.join(self.tmp, "missing.md")), \
             mock.patch.object(self.c, "LEGACY_REMAINING", legacy):
            self.assertEqual(self.c.remaining_work_path(), legacy)
            src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("旧パスにしか無い未着手", topic)

    def test_repo_file_structure_and_pick(self):
        """実ファイルは題名の次が ## で、直す前の切片は空。それでも残作業を返す。"""
        os.environ.pop("COUNCIL_REMAINING_WORK", None)
        repo = self.c.repo_remaining_path()
        self.assertTrue(repo.endswith(os.path.join("docs", "REMAINING_WORK.md")))
        self.assertNotEqual(os.path.normpath(repo), os.path.normpath(self.c.LEGACY_REMAINING))
        self.assertTrue(os.path.isfile(repo))
        text = open(repo, encoding="utf-8").read()
        self.assertTrue(text.startswith("# "))
        self.assertIn("\n## ", text)
        self.assertEqual(legacy_split_bullets(text), [])
        before = hashlib.sha256(text.encode("utf-8")).hexdigest()
        src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertTrue(topic.startswith("Service Hubの残作業:"))
        self.assertNotIn(HEALTH, topic)
        self.assertGreater(len(topic), len("Service Hubの残作業:"))
        again = hashlib.sha256(open(repo, "rb").read()).hexdigest()
        self.assertEqual(again, before)

    def test_heading_marker_and_line_marker(self):
        plain = doc(("測って残した物", ["- 画面の余白を直す"]))
        self.write(plain)
        src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("画面の余白を直す", topic)
        closed = doc(("パス 100 閉じた穴", [DONE, "- 画面の焦点を直す（移さなかった）"]))
        self.write(closed)
        src, topic = self.pick()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("移さなかった", topic)
        self.assertNotIn("メモリ表示", topic)

    def test_numbered_and_fullwidth_bullets(self):
        text = doc(("残した物", ["1. 番号つきの未着手", "１. 全角番号の未着手"]))
        self.write(text)
        self.c.ROT[0] = 0
        _, t0 = self.pick()
        self.c.ROT[0] = 1
        _, t1 = self.pick()
        self.assertIn("番号つきの未着手", t0)
        self.assertIn("全角番号の未着手", t1)

    def test_higher_priority_still_wins(self):
        self.write(doc(("残した物", [A])))
        with open(self.c.ADVICE, "w", encoding="utf-8") as f:
            f.write("- 助言の未着手を先に話す\n")
        src, topic = self.pick()
        self.assertEqual(src, "クラウドの助言（Grok）")
        self.assertIn("助言の未着手を先に話す", topic)
        os.remove(self.c.ADVICE)
        self.c.PENDING.append("CEOからの未着手の指示")
        src, topic = self.pick()
        self.assertEqual(src, "CEOの指示")
        self.assertIn("CEOからの未着手の指示", topic)
        self.assertEqual(self.c.PENDING, [])
        inbox = os.path.join(self.tmp, "inbox.md")
        with open(inbox, "w", encoding="utf-8") as f:
            f.write("- 受信箱の未着手\n")
        src, topic = self.pick()
        self.assertEqual(src, "受信箱")
        self.assertIn("受信箱の未着手", topic)
        self.assertIn("[済]", open(inbox, encoding="utf-8").read())
        self.health.stop()
        self.health = mock.patch.object(self.c, "health_view", return_value=(["Ollama"], "停止中: Ollama", {"Ollama": False}))
        self.health.start()
        src, topic = self.pick()
        self.assertEqual(src, "サービス健全性")
        self.assertIn("Ollama", topic)
        self.assertNotIn("画面の余白", topic)


if __name__ == "__main__":
    unittest.main()
