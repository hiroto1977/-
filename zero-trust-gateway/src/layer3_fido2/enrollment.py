# 最初の認証器を登録するための、1 回きりの登録コード。
#
# 認証器を足せるのは「強い認証済みの人」だけなので、最初の 1 台には別の入口が要る。
# 管理者がこの道具でコードを作り、本人へ別の道 (対面など) で渡す。
#   - コードは乱数で作る。保存するのはハッシュだけ (コードそのものはどこにも書かない)。
#   - 期限は短い (既定 15 分・最長 60 分)。
#   - 使えるのは、その人がまだ持っていない種類の認証器の登録だけ。
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import re
import secrets
import sys
import time
from pathlib import Path
from typing import Any

from .store import SUBJECT

DEFAULT_TTL_MINUTES = 15
MAX_TTL_MINUTES = 60
MAX_FILE_BYTES = 256 * 1024
_MAX_CODE_CHARS = 256
_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


def _digest(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def new_enrollment(subject: str, *, now: float, ttl_minutes: int = DEFAULT_TTL_MINUTES) -> tuple[str, dict[str, Any]]:
    # (登録コード, ファイルへ足す 1 行)。コードは 1 度だけ見せる。
    if SUBJECT.match(subject) is None:
        raise ValueError("利用者の名前は 英小文字・数字・. _ - (64 文字まで)")
    if not 1 <= ttl_minutes <= MAX_TTL_MINUTES:
        raise ValueError(f"期限は 1〜{MAX_TTL_MINUTES} 分")
    code = secrets.token_urlsafe(32)
    return code, {"subject": subject, "sha256": _digest(code), "expires_at": int(now) + ttl_minutes * 60}


def _rows(path: Path) -> list[dict[str, Any]]:
    # 読めないファイル・読めない行が 1 つでも在れば、どのコードも受け付けない (迷ったら断る)。
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("too large")
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() == "":
            continue
        row = json.loads(line)
        ok = (
            isinstance(row, dict)
            and sorted(row) == ["expires_at", "sha256", "subject"]
            and isinstance(row["subject"], str)
            and SUBJECT.match(row["subject"]) is not None
            and isinstance(row["sha256"], str)
            and _SHA256_HEX.match(row["sha256"]) is not None
            and isinstance(row["expires_at"], int)
            and not isinstance(row["expires_at"], bool)
        )
        if not ok:
            raise ValueError("bad row")
        rows.append(row)
    return rows


class EnrollmentBook:
    def __init__(self, path: Path | None) -> None:
        self._path = path

    def subject_for(self, code: object, *, now: float) -> str | None:
        # 合うコードが在り、期限内なら、その人の名前。途中でやめずに全部と比べる。
        if self._path is None or not isinstance(code, str) or not 0 < len(code) <= _MAX_CODE_CHARS:
            return None
        try:
            rows = _rows(self._path)
        except (OSError, ValueError, RecursionError):
            return None
        digest = _digest(code)
        found: str | None = None
        for row in rows:
            hit = hmac.compare_digest(digest, row["sha256"])
            if hit and row["expires_at"] > now and found is None:
                found = row["subject"]
        return found


def main(argv: list[str]) -> int:
    # 使い方: python -m layer3_fido2.enrollment new --subject alice --file /var/lib/zt/enroll.jsonl
    parser = argparse.ArgumentParser(prog="layer3_fido2.enrollment")
    parser.add_argument("command", choices=["new"])
    parser.add_argument("--subject", required=True)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--ttl-minutes", type=int, default=DEFAULT_TTL_MINUTES)
    args = parser.parse_args(argv)
    try:
        code, row = new_enrollment(args.subject, now=time.time(), ttl_minutes=args.ttl_minutes)
    except ValueError as err:
        print(str(err), file=sys.stderr)
        return 2
    with args.file.open("a", encoding="utf-8") as out:
        out.write(json.dumps(row, sort_keys=True) + "\n")
    print(f"登録コード (この 1 度だけ表示・{args.ttl_minutes} 分で切れる・本人へ別の道で渡す):")
    print(code)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
