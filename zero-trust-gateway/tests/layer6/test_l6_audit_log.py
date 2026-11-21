# 第 6 層: 消せない記録。書き換え・行の抜き取り・末尾の切り落としを見つけられることを確かめる。
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest

from helpers import at, forge
from layer6_soar.audit_log import (
    GENESIS_HASH,
    AuditChainBroken,
    AuditLog,
    SecretInAudit,
    fingerprint,
    main,
    verify_file,
)


def fill(path: Path, count: int = 5) -> AuditLog:
    log = AuditLog(path)
    for i in range(count):
        log.append(actor=f"user{i}", action="request", target="/resource/ping", result="ok", at=at())
    return log


def lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines(keepends=True)


def test_空の記録は_件数_0_で通る(tmp_path: Path) -> None:
    result = verify_file(tmp_path / "audit.jsonl")
    assert (result.ok, result.count, result.head) == (True, 0, GENESIS_HASH)


def test_書いた分だけ鎖が伸び_検算が通る(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    log = fill(path)
    result = verify_file(path)
    assert (result.ok, result.count) == (True, 5)
    assert log.head() == (5, result.head)
    first = json.loads(lines(path)[0])
    assert first["seq"] == 1 and first["prev_hash"] == GENESIS_HASH


def test_1_文字の書き換えを見つける(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    fill(path)
    rows = lines(path)
    rows[2] = rows[2].replace("user2", "user9")
    path.write_text("".join(rows), encoding="utf-8")
    result = verify_file(path)
    assert (result.ok, result.broken_at, result.reason) == (False, 3, "中身とハッシュが合わない")


def test_途中の行の抜き取りを見つける(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    fill(path)
    rows = lines(path)
    del rows[1]
    path.write_text("".join(rows), encoding="utf-8")
    result = verify_file(path)
    assert (result.ok, result.broken_at) == (False, 2)


def test_行の入れ替えを見つける(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    fill(path)
    rows = lines(path)
    rows[1], rows[2] = rows[2], rows[1]
    path.write_text("".join(rows), encoding="utf-8")
    assert verify_file(path).ok is False


def test_末尾の切り落としは_控えが在るときだけ見つかる(tmp_path: Path) -> None:
    # これがこの仕組みの限界: 同じファイルの中だけでは、末尾が欠けたことは分からない。
    path = tmp_path / "audit.jsonl"
    count, head = fill(path).head()
    path.write_text("".join(lines(path)[:3]), encoding="utf-8")
    assert verify_file(path).ok is True
    anchored = verify_file(path, expected_head=head, expected_count=count)
    assert (anchored.ok, anchored.reason) == (False, "件数が控えと合わない (末尾が欠けている)")
    assert verify_file(path, expected_head=head).ok is False


def test_読めない行_欄の過不足を見つける(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    fill(path, 2)
    original = lines(path)
    path.write_text(original[0] + "not json\n", encoding="utf-8")
    assert verify_file(path).reason == "読めない行"
    row = json.loads(original[1])
    row["extra"] = "x"
    path.write_text(original[0] + json.dumps(row) + "\n", encoding="utf-8")
    assert verify_file(path).reason == "欄が合わない"


def test_壊れた鎖の続きには書かない(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    fill(path)
    rows = lines(path)
    rows[0] = rows[0].replace("user0", "userX")
    path.write_text("".join(rows), encoding="utf-8")
    with pytest.raises(AuditChainBroken):
        AuditLog(path)


def test_開き直しても鎖は続く(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    fill(path, 2)
    AuditLog(path).append(actor="soar", action="x", target="y", result="denied", at=at())
    result = verify_file(path)
    assert (result.ok, result.count) == (True, 3)


def test_トークンらしい文字列は記録に入れさせない(tmp_path: Path) -> None:
    log = AuditLog(tmp_path / "audit.jsonl")
    # トークンの形をした文字列は、その場で組む (ファイルに書いておかない)。
    jws = forge({"alg": "EdDSA", "typ": "at+jwt"}, {"sub": "alice", "sid": "s1"}, b"signature-bytes")
    for field in ("actor", "action", "target"):
        args = {"actor": "a", "action": "b", "target": "c", field: f"token={jws}"}
        with pytest.raises(SecretInAudit):
            log.append(result="ok", at=at(), **args)
    assert log.head()[0] == 0
    assert len(fingerprint(jws)) == 16 and jws not in fingerprint(jws)


def test_空の欄_長すぎる欄_時間帯の無い時刻は断る(tmp_path: Path) -> None:
    log = AuditLog(tmp_path / "audit.jsonl")
    with pytest.raises(ValueError):
        log.append(actor="", action="b", target="c", result="ok", at=at())
    with pytest.raises(ValueError):
        log.append(actor="a", action="b" * 513, target="c", result="ok", at=at())
    with pytest.raises(ValueError):
        log.append(actor="a", action="b", target="c", result="ok", at=datetime(2026, 11, 21))
    with pytest.raises(ValueError):
        log.append(actor="a", action="b", target="c", result="maybe", at=at())  # type: ignore[arg-type]


def test_改行を含む欄でも_1_件は_1_行のまま(tmp_path: Path) -> None:
    path = tmp_path / "audit.jsonl"
    AuditLog(path).append(actor="a\nb", action="x", target="y", result="ok", at=at())
    assert len(lines(path)) == 1 and verify_file(path).ok is True


def test_検算の道具は_壊れていれば_1_を返す(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "audit.jsonl"
    count, head = fill(path).head()
    assert main(["verify", str(path)]) == 0
    assert main(["verify", str(path), str(count), head]) == 0
    assert main(["verify", str(path), str(count + 1), head]) == 1
    assert main(["bogus"]) == 2
    capsys.readouterr()
