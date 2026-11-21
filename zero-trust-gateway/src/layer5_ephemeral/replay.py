# 使い捨ての番号 (jti / nonce) の控え。同じ番号の 2 度目を断るために使う。
from __future__ import annotations


class ReplayCacheFull(RuntimeError):
    # 控えが満杯。呼び手は「通さない」に倒す (規則 5)。
    pass


class ReplayCache:
    def __init__(self, *, max_entries: int = 100_000) -> None:
        if max_entries < 1:
            raise ValueError("max_entries は 1 以上")
        self._max = max_entries
        self._seen: dict[str, float] = {}

    def __len__(self) -> int:
        return len(self._seen)

    def _purge(self, now: float) -> None:
        self._seen = {k: exp for k, exp in self._seen.items() if exp > now}

    def check_and_store(self, key: str, *, now: float, expires_at: float) -> bool:
        # 初めての番号なら控えて True。見たことが在れば False。
        known = self._seen.get(key)
        if known is not None and known > now:
            return False
        if len(self._seen) >= self._max:
            self._purge(now)
            if len(self._seen) >= self._max:
                raise ReplayCacheFull("replay cache is full")
        self._seen[key] = expires_at
        return True
