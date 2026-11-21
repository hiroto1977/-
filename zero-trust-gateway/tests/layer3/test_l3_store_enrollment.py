# 第 3 層: 認証器の控えと、1 回きりの登録コード。
from __future__ import annotations

import json
import stat
from dataclasses import replace
from pathlib import Path

import pytest

from helpers import NOW
from layer3_fido2 import enrollment
from layer3_fido2.enrollment import EnrollmentBook, new_enrollment
from layer3_fido2.store import MAX_CREDENTIALS_PER_SUBJECT, Credential, CredentialStore, StoreError

AAGUID = "11111111-2222-4333-8444-555555555555"


def cred(n: int = 1, **over: object) -> Credential:
    base = Credential(
        credential_id=f"cred{n}",
        subject="alice",
        kind="hardware_key",
        public_key="cHVibGlj",
        sign_count=0,
        aaguid=AAGUID,
        multi_device=False,
        added_at=int(NOW),
    )
    return replace(base, **over)  # type: ignore[arg-type]


# ---- 控え ----
def test_足した認証器は_ファイルから読み戻せる(tmp_path: Path) -> None:
    path = tmp_path / "credentials.json"
    store = CredentialStore(path)
    handle = store.user_handle("alice")
    store.add(cred(1))
    store.add(cred(2, kind="phone_passkey", multi_device=True))
    store.set_sign_count("cred1", 7)
    again = CredentialStore(path)
    assert again.get("cred1") == cred(1, sign_count=7)
    assert [c.credential_id for c in again.for_subject("alice")] == ["cred1", "cred2"]
    assert again.user_handle("alice") == handle
    assert len(again) == 2


def test_控えのファイルは_持ち主だけが読める(tmp_path: Path) -> None:
    path = tmp_path / "credentials.json"
    CredentialStore(path).add(cred())
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert [p.name for p in tmp_path.iterdir()] == ["credentials.json"]


def test_控えに載るのは公開の値だけ(tmp_path: Path) -> None:
    path = tmp_path / "credentials.json"
    CredentialStore(path).add(cred())
    row = json.loads(path.read_text(encoding="utf-8"))["credentials"][0]
    assert sorted(row) == [
        "aaguid", "added_at", "credential_id", "disabled", "kind",
        "multi_device", "public_key", "sign_count", "subject",
    ]


@pytest.mark.parametrize(
    "text",
    [
        "",
        "not json",
        "[]",
        '{"version": 2, "handles": {}, "credentials": []}',
        '{"version": 1, "handles": {}}',
        '{"version": 1, "handles": {"Alice!": "aaaa"}, "credentials": []}',
        '{"version": 1, "handles": {}, "credentials": [{"credential_id": "x"}]}',
    ],
)
def test_読めない控えでは起動しない_空として扱わない(tmp_path: Path, text: str) -> None:
    path = tmp_path / "credentials.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(StoreError):
        CredentialStore(path)


def test_値のおかしい行が_1_つでも在れば読まない(tmp_path: Path) -> None:
    path = tmp_path / "credentials.json"
    CredentialStore(path).add(cred())
    data = json.loads(path.read_text(encoding="utf-8"))
    for field, bad in (("kind", "usb"), ("sign_count", -1), ("sign_count", True), ("aaguid", "x"), ("subject", "A")):
        broken = json.loads(json.dumps(data))
        broken["credentials"][0][field] = bad
        path.write_text(json.dumps(broken), encoding="utf-8")
        with pytest.raises(StoreError):
            CredentialStore(path)
    doubled = json.loads(json.dumps(data))
    doubled["credentials"].append(doubled["credentials"][0])
    path.write_text(json.dumps(doubled), encoding="utf-8")
    with pytest.raises(StoreError):
        CredentialStore(path)


def test_同じ認証器は_2_度登録できない_数にも天井が在る() -> None:
    store = CredentialStore()
    store.add(cred(1))
    with pytest.raises(StoreError):
        store.add(cred(1, subject="bob"))
    for n in range(2, MAX_CREDENTIALS_PER_SUBJECT + 1):
        store.add(cred(n))
    with pytest.raises(StoreError):
        store.add(cred(99))
    # 止めた認証器は数えない。
    assert store.disable("cred1") is True
    store.add(cred(99))


def test_止めた認証器は_一覧に出ない_2_度目は何もしない() -> None:
    store = CredentialStore()
    store.add(cred(1))
    assert store.disable("cred1") is True
    assert store.disable("cred1") is False
    assert store.disable("nobody") is False
    assert store.for_subject("alice") == ()
    assert [c.disabled for c in store.for_subject("alice", include_disabled=True)] == [True]


def test_利用者の番号は乱数で_人ごとに別_名前が読めなければ断る() -> None:
    store = CredentialStore()
    assert store.user_handle("alice") == store.user_handle("alice")
    assert store.user_handle("alice") != store.user_handle("bob")
    assert len(store.user_handle("alice")) >= 43
    with pytest.raises(StoreError):
        store.user_handle("Alice Smith")


# ---- 登録コード ----
def book(tmp_path: Path, *rows: dict) -> EnrollmentBook:
    path = tmp_path / "enroll.jsonl"
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    return EnrollmentBook(path)


def test_登録コードは_期限内なら本人の名前を返す(tmp_path: Path) -> None:
    code, row = new_enrollment("alice", now=NOW)
    b = book(tmp_path, row)
    assert b.subject_for(code, now=NOW) == "alice"
    assert b.subject_for(code, now=NOW + 15 * 60 - 1) == "alice"
    assert b.subject_for(code, now=NOW + 15 * 60) is None


def test_ファイルに残るのはハッシュだけ(tmp_path: Path) -> None:
    code, row = new_enrollment("alice", now=NOW)
    assert sorted(row) == ["expires_at", "sha256", "subject"]
    assert code not in json.dumps(row)
    assert len(code) >= 43 and len(row["sha256"]) == 64


@pytest.mark.parametrize("presented", ["", "wrong", None, 7, ["x"], "x" * 300])
def test_合わないコード_形の違う物は通らない(tmp_path: Path, presented: object) -> None:
    _, row = new_enrollment("alice", now=NOW)
    assert book(tmp_path, row).subject_for(presented, now=NOW) is None


def test_2_人分のコードは取り違えない(tmp_path: Path) -> None:
    a, row_a = new_enrollment("alice", now=NOW)
    b, row_b = new_enrollment("bob", now=NOW)
    both = book(tmp_path, row_a, row_b)
    assert (both.subject_for(a, now=NOW), both.subject_for(b, now=NOW)) == ("alice", "bob")


@pytest.mark.parametrize(
    "bad",
    [
        "not json\n",
        '{"subject": "alice", "sha256": "zz", "expires_at": 1}\n',
        '{"subject": "alice", "sha256": "' + "0" * 64 + '", "expires_at": "soon"}\n',
        '{"subject": "alice", "sha256": "' + "0" * 64 + '", "expires_at": 1, "extra": 1}\n',
        "[]\n",
    ],
)
def test_読めない行が_1_つでも在れば_どのコードも受け付けない(tmp_path: Path, bad: str) -> None:
    code, row = new_enrollment("alice", now=NOW)
    path = tmp_path / "enroll.jsonl"
    path.write_text(json.dumps(row) + "\n" + bad, encoding="utf-8")
    assert EnrollmentBook(path).subject_for(code, now=NOW) is None


def test_ファイルが無い_設定が無いなら_誰も登録できない(tmp_path: Path) -> None:
    code, _ = new_enrollment("alice", now=NOW)
    assert EnrollmentBook(None).subject_for(code, now=NOW) is None
    assert EnrollmentBook(tmp_path / "missing.jsonl").subject_for(code, now=NOW) is None


@pytest.mark.parametrize("subject", ["", "Alice", "a b", "../x", "a" * 65])
def test_名前の形が違えば_コードを作らない(subject: str) -> None:
    with pytest.raises(ValueError):
        new_enrollment(subject, now=NOW)


@pytest.mark.parametrize("ttl", [0, 61, -5])
def test_期限は_1_分から_60_分まで(ttl: int) -> None:
    with pytest.raises(ValueError):
        new_enrollment("alice", now=NOW, ttl_minutes=ttl)


def test_道具は_コードを_1_度だけ見せ_ファイルにはハッシュだけを足す(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "enroll.jsonl"
    assert enrollment.main(["new", "--subject", "alice", "--file", str(path)]) == 0
    shown = capsys.readouterr().out.splitlines()
    code = shown[1]
    text = path.read_text(encoding="utf-8")
    assert code not in text and json.loads(text)["subject"] == "alice"
    assert EnrollmentBook(path).subject_for(code, now=json.loads(text)["expires_at"] - 1) == "alice"
    assert enrollment.main(["new", "--subject", "Bad Name", "--file", str(path)]) == 2
    assert path.read_text(encoding="utf-8") == text
