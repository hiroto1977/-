# 第 3 層: 1 回きりの乱数の控えと、認証の強さの控え。
from __future__ import annotations

import pytest

from helpers import NOW
from layer3_fido2.challenges import CHALLENGE_TTL_SECONDS, ChallengeBook, ChallengeBookFull
from layer3_fido2.sessions import PAIR_WINDOW_SECONDS, STRONG_MAX_AGE_SECONDS, AuthnSessions


# ---- 乱数 ----
def test_乱数は_32_バイトで_毎回違う() -> None:
    book = ChallengeBook()
    a = book.issue("jkt", "authenticate", now=NOW)
    b = book.issue("jkt2", "authenticate", now=NOW)
    assert (len(a), len(b)) == (32, 32) and a != b


def test_乱数は_1_度しか取り出せない() -> None:
    book = ChallengeBook()
    challenge = book.issue("jkt", "authenticate", now=NOW)
    taken = book.take("jkt", "authenticate", now=NOW)
    assert taken is not None and taken.challenge == challenge
    assert book.take("jkt", "authenticate", now=NOW) is None


def test_乱数は_120_秒で切れる() -> None:
    book = ChallengeBook()
    book.issue("jkt", "authenticate", now=NOW)
    assert book.take("jkt", "authenticate", now=NOW + CHALLENGE_TTL_SECONDS) is None
    book.issue("jkt", "authenticate", now=NOW)
    assert book.take("jkt", "authenticate", now=NOW + CHALLENGE_TTL_SECONDS - 1) is not None


def test_別の端末_別の用途では取り出せない() -> None:
    book = ChallengeBook()
    book.issue("jkt", "register", now=NOW, data={"subject": "alice"})
    assert book.take("other", "register", now=NOW) is None
    assert book.take("jkt", "authenticate", now=NOW) is None
    taken = book.take("jkt", "register", now=NOW)
    assert taken is not None and taken.data == {"subject": "alice"}


def test_同じ端末の新しい乱数は_前の物を置き換える() -> None:
    book = ChallengeBook()
    first = book.issue("jkt", "authenticate", now=NOW)
    second = book.issue("jkt", "authenticate", now=NOW + 1)
    taken = book.take("jkt", "authenticate", now=NOW + 1)
    assert taken is not None and taken.challenge == second != first
    assert len(book) == 0


def test_控えが満杯なら出さない_切れた物を捨てて空けば出す() -> None:
    book = ChallengeBook(max_entries=2)
    book.issue("a", "authenticate", now=NOW)
    book.issue("b", "authenticate", now=NOW)
    with pytest.raises(ChallengeBookFull):
        book.issue("c", "authenticate", now=NOW + 1)
    # 既に在る端末の出し直しは、満杯でも通る (数が増えない)。
    book.issue("a", "authenticate", now=NOW + 1)
    assert len(book.issue("c", "authenticate", now=NOW + CHALLENGE_TTL_SECONDS)) == 32
    with pytest.raises(ValueError):
        ChallengeBook(max_entries=0)


# ---- 強さ ----
def test_物理キーとスマホが_120_秒以内にそろえば_strong() -> None:
    s = AuthnSessions()
    assert s.record("jkt", "alice", "hardware_key", "k1", now=NOW).strength == "single"
    state = s.record("jkt", "alice", "phone_passkey", "p1", now=NOW + PAIR_WINDOW_SECONDS)
    assert (state.strength, state.subject, state.verified_at.timestamp()) == ("strong", "alice", NOW + 120)
    assert s.state("jkt", now=NOW + 500).strength == "strong"  # type: ignore[union-attr]


def test_121_秒あいたら_strong_にならない() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    assert s.record("jkt", "alice", "phone_passkey", "p1", now=NOW + 121).strength == "single"
    # もう一度、物理キーを足せば、新しい 2 つでそろう。
    assert s.record("jkt", "alice", "hardware_key", "k1", now=NOW + 130).strength == "strong"


def test_同じ種類を_2_回では_strong_にならない() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    assert s.record("jkt", "alice", "hardware_key", "k2", now=NOW + 1).strength == "single"
    s2 = AuthnSessions()
    s2.record("jkt", "alice", "phone_passkey", "p1", now=NOW)
    assert s2.record("jkt", "alice", "phone_passkey", "p2", now=NOW + 1).strength == "single"


def test_別の人の確認とは合算しない() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    state = s.record("jkt", "bob", "phone_passkey", "p9", now=NOW + 1)
    assert (state.subject, state.strength) == ("bob", "single")


def test_別の端末の鍵の確認とは合算しない() -> None:
    s = AuthnSessions()
    s.record("jkt-a", "alice", "hardware_key", "k1", now=NOW)
    assert s.record("jkt-b", "alice", "phone_passkey", "p1", now=NOW + 1).strength == "single"
    assert s.state("jkt-c", now=NOW) is None


def test_strong_は_12_時間まで() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    s.record("jkt", "alice", "phone_passkey", "p1", now=NOW)
    assert s.state("jkt", now=NOW + STRONG_MAX_AGE_SECONDS).strength == "strong"  # type: ignore[union-attr]
    assert s.state("jkt", now=NOW + STRONG_MAX_AGE_SECONDS + 1) is None


def test_そろった後の片方だけの確認で_strong_は下がらない_時刻も延びない() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    s.record("jkt", "alice", "phone_passkey", "p1", now=NOW + 10)
    assert s.record("jkt", "alice", "phone_passkey", "p1", now=NOW + 3600).strength == "single"
    state = s.state("jkt", now=NOW + 3600)
    assert state is not None
    assert (state.strength, state.verified_at.timestamp()) == ("strong", NOW + 10)


def test_1_回の確認は_1_組にしか数えない() -> None:
    # そろった直後に片方だけ押し直しても、「いま 2 つがそろった」にはならない。
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    assert s.record("jkt", "alice", "phone_passkey", "p1", now=NOW + 1).strength == "strong"
    assert s.record("jkt", "alice", "phone_passkey", "p1", now=NOW + 2).strength == "single"
    assert s.record("jkt", "alice", "hardware_key", "k1", now=NOW + 3).strength == "strong"
    state = s.state("jkt", now=NOW + 3)
    assert state is not None and state.verified_at.timestamp() == NOW + 3


def test_未来の時刻の控えは信用しない() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW + 100)
    assert s.state("jkt", now=NOW) is None


def test_止めた認証器でそろえた_strong_は消える() -> None:
    s = AuthnSessions()
    s.record("jkt", "alice", "hardware_key", "k1", now=NOW)
    s.record("jkt", "alice", "phone_passkey", "p1", now=NOW)
    s.record("other", "bob", "phone_passkey", "p2", now=NOW)
    assert s.drop_credential("k1") == 1
    assert s.state("jkt", now=NOW) is None
    assert len(s) == 1
    assert s.state("other", now=NOW) is not None
    # そろう前の、片方だけの確認も消える。
    s.record("jkt", "alice", "phone_passkey", "p1", now=NOW)
    assert s.drop_credential("p1") == 1
    assert s.state("jkt", now=NOW) is None
    assert s.drop_credential("nobody") == 0


def test_利用者ごとに_まとめて消せる() -> None:
    s = AuthnSessions()
    s.record("a", "alice", "hardware_key", "k1", now=NOW)
    s.record("b", "alice", "phone_passkey", "p1", now=NOW)
    s.record("c", "bob", "phone_passkey", "p2", now=NOW)
    assert s.revoke_subject("alice") == 2
    assert (s.state("a", now=NOW), s.state("b", now=NOW)) == (None, None)
    assert len(s) == 1


def test_控えが満杯なら_いちばん古い物を捨てる() -> None:
    s = AuthnSessions(max_entries=2)
    s.record("a", "alice", "hardware_key", "k1", now=NOW)
    s.record("b", "bob", "hardware_key", "k2", now=NOW + 1)
    s.record("c", "carol", "hardware_key", "k3", now=NOW + 2)
    assert s.state("a", now=NOW + 2) is None
    assert s.state("b", now=NOW + 2) is not None and s.state("c", now=NOW + 2) is not None
    with pytest.raises(ValueError):
        AuthnSessions(max_entries=0)
