# おとりの鍵 (canary)。どの権限も持たず、誰かが使った時点で「入り込まれた」と分かる。
#
# 鍵は配備の時に乱数で作る。保存するのはハッシュだけ (コードにも設定にも鍵そのものを書かない)。
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sys
from collections.abc import Iterable
from pathlib import Path

_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")
_MAX_PRESENTED_CHARS = 4096


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_canary() -> tuple[str, str]:
    # (おとりの鍵, そのハッシュ)。鍵は 1 度だけ見せて、置き場所へ置く。保存するのはハッシュ。
    token = secrets.token_urlsafe(32)
    return token, _digest(token)


class CanarySet:
    def __init__(self, hashes: Iterable[str]) -> None:
        self._hashes = tuple(hashes)
        for h in self._hashes:
            if not isinstance(h, str) or _SHA256_HEX.match(h) is None:
                raise ValueError("おとりの控えは SHA-256 の 16 進 64 文字")

    def __len__(self) -> int:
        return len(self._hashes)

    @classmethod
    def from_file(cls, path: Path | None) -> CanarySet:
        if path is None:
            return cls(())
        lines = (ln.strip() for ln in Path(path).read_text(encoding="utf-8").splitlines())
        return cls(ln for ln in lines if ln != "" and not ln.startswith("#"))

    def is_canary(self, presented: object) -> bool:
        # 途中でやめずに全部と比べる (比べる時間から当たり外れを読ませない)。
        if not isinstance(presented, str) or not 0 < len(presented) <= _MAX_PRESENTED_CHARS:
            return False
        digest = _digest(presented)
        hit = False
        for known in self._hashes:
            hit = hmac.compare_digest(digest, known) or hit
        return hit


def main(argv: list[str]) -> int:
    # 使い方: python -m layer6_soar.canary new
    if argv != ["new"]:
        print("使い方: new", file=sys.stderr)
        return 2
    token, digest = generate_canary()
    print("おとりの鍵 (この 1 度だけ表示・置き場所へ置く):")
    print(token)
    print("控え (CANARY_HASHES_FILE に 1 行で足す):")
    print(digest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
