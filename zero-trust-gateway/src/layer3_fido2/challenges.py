# 確認のたびに出す、1 回きりの乱数 (challenge) の控え。
#
#   - 乱数は 32 バイト。120 秒で切れる。
#   - 端末の鍵 (DPoP の鍵の指紋) と用途 (登録 / 確認) に結び付く。別の端末・別の用途では使えない。
#   - 取り出したら消す (検めに失敗しても、同じ乱数は 2 度使えない)。
from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from typing import Any, Literal

Purpose = Literal["register", "authenticate"]
CHALLENGE_BYTES = 32
CHALLENGE_TTL_SECONDS = 120


class ChallengeBookFull(RuntimeError):
    # 控えが満杯。呼び手は「出さない」に倒す。
    pass


@dataclass(frozen=True)
class Pending:
    challenge: bytes
    expires_at: float
    data: dict[str, Any] = field(default_factory=dict)


class ChallengeBook:
    def __init__(self, *, max_entries: int = 10_000) -> None:
        if max_entries < 1:
            raise ValueError("max_entries は 1 以上")
        self._max = max_entries
        self._pending: dict[tuple[str, str], Pending] = {}

    def __len__(self) -> int:
        return len(self._pending)

    def issue(self, jkt: str, purpose: Purpose, *, now: float, data: dict[str, Any] | None = None) -> bytes:
        # 同じ端末・同じ用途の前の乱数は、新しい物で置き換える (1 つだけ生きる)。
        key = (jkt, purpose)
        if key not in self._pending and len(self._pending) >= self._max:
            self._pending = {k: p for k, p in self._pending.items() if p.expires_at > now}
            if len(self._pending) >= self._max:
                raise ChallengeBookFull("challenge book is full")
        challenge = secrets.token_bytes(CHALLENGE_BYTES)
        self._pending[key] = Pending(challenge, now + CHALLENGE_TTL_SECONDS, dict(data or {}))
        return challenge

    def take(self, jkt: str, purpose: Purpose, *, now: float) -> Pending | None:
        pending = self._pending.pop((jkt, purpose), None)
        if pending is None or pending.expires_at <= now:
            return None
        return pending
