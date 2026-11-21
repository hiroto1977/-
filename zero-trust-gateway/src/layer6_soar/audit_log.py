# 消せない記録 (追記だけ・ハッシュの鎖つき)。
#
# 各行は前の行のハッシュを含む。途中の 1 文字を変えても、行を抜いても、検算で分かる。
# ただし「末尾を切り落とす」だけは、この 1 つのファイルの中では分からない。
# だから鎖の先頭 (最新のハッシュと件数) を別の場所へ控え、検算のときに渡す (expected_head)。
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from contracts import AuditRecord

GENESIS_HASH = "0" * 64
MAX_FIELD_CHARS = 512
# 署名つきトークンの形 (xxx.yyy.zzz)。記録へ入れさせない (規則 8)。
_LOOKS_LIKE_JWS = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
_BODY_KEYS = ("seq", "at", "actor", "action", "target", "result", "prev_hash")

Result = Literal["ok", "denied", "error"]


class AuditChainBroken(RuntimeError):
    pass


class SecretInAudit(ValueError):
    pass


@dataclass(frozen=True)
class VerifyResult:
    ok: bool
    count: int
    head: str
    broken_at: int | None = None
    reason: str | None = None


def fingerprint(secret: str) -> str:
    # 秘密そのものの代わりに記録へ入れる指紋。
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()[:16]


def _canonical(body: dict[str, Any]) -> str:
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def record_hash(prev_hash: str, body: dict[str, Any]) -> str:
    return hashlib.sha256(f"{prev_hash}\n{_canonical(body)}".encode("utf-8")).hexdigest()


def _clean(name: str, value: str) -> str:
    if not isinstance(value, str) or value == "":
        raise ValueError(f"{name} は空でない文字列")
    if len(value) > MAX_FIELD_CHARS:
        raise ValueError(f"{name} は {MAX_FIELD_CHARS} 文字まで")
    if _LOOKS_LIKE_JWS.search(value):
        raise SecretInAudit(f"{name} にトークンらしい文字列が在る (指紋を入れる)")
    return value


def verify_file(
    path: Path, *, expected_head: str | None = None, expected_count: int | None = None
) -> VerifyResult:
    # 鎖を最初から検算する。expected_* は別の場所に控えた先頭 (末尾の切り落としを見つける)。
    prev, count = GENESIS_HASH, 0
    if path.exists():
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                number = count + 1
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    return VerifyResult(False, count, prev, number, "読めない行")
                if not isinstance(row, dict) or set(row) != {*_BODY_KEYS, "hash"}:
                    return VerifyResult(False, count, prev, number, "欄が合わない")
                if row["seq"] != number:
                    return VerifyResult(False, count, prev, number, "番号が続いていない")
                if row["prev_hash"] != prev:
                    return VerifyResult(False, count, prev, number, "前の行とつながらない")
                body = {k: row[k] for k in _BODY_KEYS}
                if row["hash"] != record_hash(prev, body):
                    return VerifyResult(False, count, prev, number, "中身とハッシュが合わない")
                prev, count = row["hash"], number
    if expected_count is not None and count != expected_count:
        return VerifyResult(False, count, prev, None, "件数が控えと合わない (末尾が欠けている)")
    if expected_head is not None and prev != expected_head:
        return VerifyResult(False, count, prev, None, "先頭のハッシュが控えと合わない")
    return VerifyResult(True, count, prev)


class AuditLog:
    def __init__(self, path: Path) -> None:
        self._path = Path(path)
        self._lock = threading.Lock()
        state = verify_file(self._path)
        if not state.ok:
            # 壊れた鎖の続きには書かない。
            raise AuditChainBroken(f"{state.broken_at} 行目: {state.reason}")
        self._seq, self._head = state.count, state.head

    @property
    def path(self) -> Path:
        return self._path

    def head(self) -> tuple[int, str]:
        # (件数, 最新のハッシュ)。これを別の場所へ控える。
        with self._lock:
            return self._seq, self._head

    def append(
        self, *, actor: str, action: str, target: str, result: Result, at: datetime
    ) -> AuditRecord:
        if result not in ("ok", "denied", "error"):
            raise ValueError("result は ok / denied / error")
        if at.tzinfo is None:
            raise ValueError("at は時間帯つきの時刻")
        with self._lock:
            body = {
                "seq": self._seq + 1,
                "at": at.astimezone(timezone.utc).isoformat(),
                "actor": _clean("actor", actor),
                "action": _clean("action", action),
                "target": _clean("target", target),
                "result": result,
                "prev_hash": self._head,
            }
            digest = record_hash(self._head, body)
            line = _canonical({**body, "hash": digest}) + "\n"
            fd = os.open(self._path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
            try:
                os.write(fd, line.encode("utf-8"))
                os.fsync(fd)
            finally:
                os.close(fd)
            self._seq, self._head = body["seq"], digest
            return AuditRecord(**body, hash=digest)


def main(argv: list[str]) -> int:
    # 使い方: python -m layer6_soar.audit_log verify <記録のファイル> [控えた件数 控えたハッシュ]
    if len(argv) not in (2, 4) or argv[0] != "verify":
        print("使い方: verify <記録のファイル> [控えた件数 控えたハッシュ]", file=sys.stderr)
        return 2
    count = int(argv[2]) if len(argv) == 4 else None
    head = argv[3] if len(argv) == 4 else None
    result = verify_file(Path(argv[1]), expected_head=head, expected_count=count)
    if result.ok:
        print(f"OK: {result.count} 件・先頭 {result.head}")
        return 0
    where = f"{result.broken_at} 行目: " if result.broken_at is not None else ""
    print(f"NG: {where}{result.reason}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
