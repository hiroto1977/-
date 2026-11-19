"""サービス健全性を、変化が無いのに毎回開かない。

main（確認時点）では他に議題が無いと pick_topic が毎回
「サービス健全性 / ローカルAI環境の改善…」を返した。間隔は COUNCIL_INTERVAL
（既定 600 秒）だけで、同じ議題の冷却は無かった。決定の重複排除は決定 ID なので、
言い換えた決定は新しい決定として decisions.md に足されていた。

精度の梯子（この検査が届いた段）:
  L1  変化の無い pick_topic を連続で呼ぶ。1 回目だけ健全性を返し、状態ファイルを書く。
      2 回目は session が会議を始めず、仮ディレクトリの decisions.md を 1 バイトも変えない。
  L2  稼働が変われば冷却中でも開く。冷却時間が過ぎれば同じ稼働でも開く。
      固定停止の llama7B が落ちているだけでは開かない。
      冷却中でも CEO の指示・助言・受信箱・残作業は先に拾う。メモリ量だけでは開かない。
  L3  壊れた状態ファイルは例外にせず、会議を開かず、正しい JSON に書き直す。
      未来の時刻は冷却中として開かない。
  L4  未達。実デーモンの待ちループと、実ポートへのプローブは差し替えている。
  L5  未達。動いている村の decisions.md には当てていない。
"""
import json, os, sys, tempfile, time, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False


def ensure_import_key():
    """council.py は読込時に鍵ファイルを開く。無いときだけ検査用の仮鍵を作り、終わったら消す。"""
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


def tearDownModule():
    if _CREATED_KEY and os.path.exists(KEY_FILE):
        os.remove(KEY_FILE)


IMPROVE = "ローカルAI環境の改善（空きメモリ 4096MB / 停止中: なし）。固定停止のサービスは起動・再構築しないこと。"


class HealthTopicCooldownTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self._saved = {
            "HEALTH_STATE": council.HEALTH_STATE,
            "ADVICE": council.ADVICE,
            "INBOX": council.INBOX,
            "REMAINING_WORK": council.REMAINING_WORK,
            "HEALTH_TOPIC_COOLDOWN": council.HEALTH_TOPIC_COOLDOWN,
            "PENDING": list(council.PENDING),
            "ROT": council.ROT[0],
            "status": council.STATE.get("status"),
            "topic": council.STATE.get("topic"),
            "updated": council.STATE.get("updated"),
            "speaking": council.STATE.get("speaking"),
        }
        council.HEALTH_STATE = os.path.join(self.tmp.name, "health_topic_state.json")
        council.ADVICE = os.path.join(self.tmp.name, "advice_inbox.md")
        council.INBOX = os.path.join(self.tmp.name, "inbox.md")
        council.REMAINING_WORK = os.path.join(self.tmp.name, "REMAINING_WORK.md")
        council.PENDING.clear()
        self.snap = {name: True for name in council.SERVICES}
        self.logs = []
        self.addCleanup(self._restore)
        self._patches = [
            mock.patch.object(council, "service_snapshot", side_effect=lambda timeout=None: dict(self.snap)),
            mock.patch.object(council, "free_mb", return_value=4096),
            mock.patch.object(council, "log_sys", side_effect=self.logs.append),
        ]
        started = []
        for p in self._patches:
            started.append(p.start())
            self.addCleanup(p.stop)
        self.free_mock = started[1]

    def _restore(self):
        council.HEALTH_STATE = self._saved["HEALTH_STATE"]
        council.ADVICE = self._saved["ADVICE"]
        council.INBOX = self._saved["INBOX"]
        council.REMAINING_WORK = self._saved["REMAINING_WORK"]
        council.HEALTH_TOPIC_COOLDOWN = self._saved["HEALTH_TOPIC_COOLDOWN"]
        council.PENDING[:] = self._saved["PENDING"]
        council.ROT[0] = self._saved["ROT"]
        council.STATE["status"] = self._saved["status"]
        council.STATE["topic"] = self._saved["topic"]
        council.STATE["updated"] = self._saved["updated"]
        council.STATE["speaking"] = self._saved["speaking"]

    def _state(self):
        with open(council.HEALTH_STATE, encoding="utf-8") as f:
            return json.load(f)

    def _write_state(self, at, snapshot):
        with open(council.HEALTH_STATE, "w", encoding="utf-8") as f:
            json.dump({"at": at, "snapshot": snapshot}, f, ensure_ascii=False, sort_keys=True)
            f.write("\n")

    def test_l1_consecutive_calls_skip_and_do_not_record(self):
        """main ではこの 2 連続が両方とも健全性だった。直し後は 2 回目を開かない。"""
        self.assertIn("llama7B", council.decision_lock.forced_down_services())
        first = council.pick_topic()
        self.assertEqual(first, ("サービス健全性", IMPROVE))
        self.assertTrue(os.path.isfile(council.HEALTH_STATE))
        saved = self._state()
        self.assertNotIn("llama7B", saved["snapshot"])
        self.assertTrue(all(v is True for v in saved["snapshot"].values()))
        self.assertGreater(saved["at"], time.time() - 60)
        blob = open(council.HEALTH_STATE, "rb").read()
        dec_path = os.path.join(self.tmp.name, "decisions.md")
        with open(dec_path, "w", encoding="utf-8") as f:
            f.write("# 既存の決定\n")
        before = open(dec_path, "rb").read()
        rot = council.ROT[0]
        with mock.patch.object(council, "HERE", self.tmp.name), \
             mock.patch.object(council, "ask", side_effect=AssertionError("会議を始めてはいけない")), \
             mock.patch.object(council.decision_lock, "commit_decision", side_effect=AssertionError("決定を書いてはいけない")):
            council.session()
        self.assertEqual(open(dec_path, "rb").read(), before)
        self.assertNotIn("決定:", open(dec_path, encoding="utf-8").read())
        self.assertFalse(os.path.exists(os.path.join(self.tmp.name, "rejected_decisions.md")))
        self.assertFalse(os.path.isdir(os.path.join(self.tmp.name, "logs")))
        self.assertEqual(council.ROT[0], rot)
        self.assertIn("見送り", council.STATE["status"])
        self.assertEqual(council.STATE["topic"], "")
        self.assertIsNone(council.STATE["speaking"])
        self.assertIsNone(council.pick_topic())
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)
        self.assertTrue(any("冷却中" in m for m in self.logs))

    def test_l2_snapshot_change_allows_during_cooldown(self):
        self.assertEqual(council.pick_topic()[0], "サービス健全性")
        self.snap["Ollama"] = False
        src, topic = council.pick_topic()
        self.assertEqual(src, "サービス健全性")
        self.assertIn("停止中: Ollama", topic)
        self.assertIs(self._state()["snapshot"]["Ollama"], False)
        self.snap["Ollama"] = True
        src, topic = council.pick_topic()
        self.assertEqual((src, topic), ("サービス健全性", IMPROVE))
        self.assertIsNone(council.pick_topic())

    def test_l2_memory_only_change_does_not_open(self):
        self.assertEqual(council.pick_topic()[0], "サービス健全性")
        self.free_mock.return_value = 100
        self.assertIsNone(council.pick_topic())

    def test_l2_cooldown_elapsed_allows_again(self):
        self.assertEqual(council.pick_topic(), ("サービス健全性", IMPROVE))
        snap = self._state()["snapshot"]
        council.HEALTH_TOPIC_COOLDOWN = 3600
        self._write_state(time.time() - 10, snap)
        self.assertIsNone(council.pick_topic())
        self._write_state(time.time() - 3601, snap)
        self.assertEqual(council.pick_topic(), ("サービス健全性", IMPROVE))
        renewed = self._state()
        self.assertGreater(renewed["at"], time.time() - 60)
        self._write_state(time.time() + 10000, renewed["snapshot"])
        self.assertIsNone(council.pick_topic())

    def test_l2_locked_llama7b_down_is_not_a_change(self):
        self.assertIn("llama7B", council.decision_lock.forced_down_services())
        self.assertEqual(council.pick_topic()[0], "サービス健全性")
        self.assertNotIn("llama7B", self._state()["snapshot"])
        blob = open(council.HEALTH_STATE, "rb").read()
        self.snap["llama7B"] = False
        self.assertIsNone(council.pick_topic())
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)
        poisoned = dict(self._state()["snapshot"])
        poisoned["llama7B"] = True
        self._write_state(time.time(), poisoned)
        self.snap["llama7B"] = False
        self.assertIsNone(council.pick_topic())
        self.snap["Ollama"] = False
        src, topic = council.pick_topic()
        self.assertEqual(src, "サービス健全性")
        self.assertIn("Ollama", topic)
        self.assertNotIn("llama7B", self._state()["snapshot"])

    def test_l2_user_advice_inbox_and_remaining_during_cooldown(self):
        self.assertEqual(council.pick_topic()[0], "サービス健全性")
        blob = open(council.HEALTH_STATE, "rb").read()

        council.PENDING.append("来期の椅子を2脚買い足す")
        src, topic = council.pick_topic()
        self.assertEqual(src, "CEOの指示")
        self.assertIn("椅子", topic)
        self.assertEqual(council.PENDING, [])
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)

        with open(council.ADVICE, "w", encoding="utf-8") as f:
            f.write("- 相談役として椅子の色だけを選ぶ\n")
        src, topic = council.pick_topic()
        self.assertEqual(src, "クラウドの助言（Grok）")
        self.assertIn("椅子の色", topic)
        self.assertIn("[済]", open(council.ADVICE, encoding="utf-8").read())
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)

        with open(council.INBOX, "w", encoding="utf-8") as f:
            f.write("- 受信箱から棚の高さを決める\n")
        src, topic = council.pick_topic()
        self.assertEqual(src, "受信箱")
        self.assertIn("棚の高さ", topic)
        self.assertIn("[済]", open(council.INBOX, encoding="utf-8").read())
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)

        with open(council.REMAINING_WORK, "w", encoding="utf-8") as f:
            f.write("- 残作業の項目を1つ見る\n")
        src, topic = council.pick_topic()
        self.assertEqual(src, "リポジトリ残作業")
        self.assertIn("残作業の項目", topic)
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)

        os.remove(council.REMAINING_WORK)
        self.assertIsNone(council.pick_topic())
        self.assertEqual(open(council.HEALTH_STATE, "rb").read(), blob)

    def test_l3_corrupt_state_skips_and_rewrites(self):
        samples = [
            "{",
            "",
            "[]",
            "null",
            "1",
            '{"at": "yesterday", "snapshot": {}}',
            '{"at": true, "snapshot": {"Ollama": true}}',
            '{"at": 1, "snapshot": {"Ollama": 1}}',
            '{"at": NaN, "snapshot": {}}',
        ]
        dec_path = os.path.join(self.tmp.name, "decisions.md")
        with open(dec_path, "w", encoding="utf-8") as f:
            f.write("# 既存の決定\n")
        before = open(dec_path, "rb").read()
        for text in samples:
            with self.subTest(text=text[:24]):
                with open(council.HEALTH_STATE, "w", encoding="utf-8") as f:
                    f.write(text)
                self.assertIsNone(council.pick_topic())
                data = self._state()
                self.assertIsInstance(data["at"], (int, float))
                self.assertNotIsInstance(data["at"], bool)
                self.assertIsInstance(data["snapshot"], dict)
                self.assertNotIn("llama7B", data["snapshot"])
                self.assertTrue(data["snapshot"])
                self.assertTrue(all(isinstance(v, bool) for v in data["snapshot"].values()))
                self.assertIsNone(council.pick_topic())
        with open(council.HEALTH_STATE, "wb") as f:
            f.write(b"\xff")
        self.assertIsNone(council.pick_topic())
        self.assertNotIn("llama7B", self._state()["snapshot"])
        with mock.patch.object(council, "HERE", self.tmp.name), \
             mock.patch.object(council, "ask", side_effect=AssertionError("会議を始めてはいけない")), \
             mock.patch.object(council.decision_lock, "commit_decision", side_effect=AssertionError("決定を書いてはいけない")):
            council.session()
        self.assertEqual(open(dec_path, "rb").read(), before)

    def test_l3_missing_file_allows_one_meeting(self):
        self.assertFalse(os.path.exists(council.HEALTH_STATE))
        self.assertEqual(council.pick_topic(), ("サービス健全性", IMPROVE))
        self.assertTrue(os.path.isfile(council.HEALTH_STATE))
        os.remove(council.HEALTH_STATE)
        self.assertEqual(council.pick_topic()[0], "サービス健全性")


if __name__ == "__main__":
    unittest.main(verbosity=2)
