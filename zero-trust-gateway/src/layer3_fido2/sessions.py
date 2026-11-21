# 「いま、どの強さで認証済みか」の控え。端末の鍵 (DPoP の鍵の指紋) ごとに持つ。
#
#   strong … 物理キーとスマホのパスキー (別々の種類の認証器) の確認が、120 秒以内にそろった
#   single … どちらか片方だけ (そろう前・そろわなかった)
#   none   … 確認が無い / 12 時間を過ぎた
#
# クッキーや合言葉は配らない。次の要求で同じ鍵の証明 (DPoP) を出せた相手だけが、この控えに当たる。
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from contracts import AuthnState

from .store import KINDS, Kind

PAIR_WINDOW_SECONDS = 120
STRONG_MAX_AGE_SECONDS = 12 * 3600
_FUTURE_SKEW_SECONDS = 5


@dataclass
class _Entry:
    subject: str
    seen: dict[str, tuple[str, float]] = field(default_factory=dict)  # 種類 → (認証器, 時刻)
    strong_at: float | None = None  # 2 つがそろった時刻
    pair: tuple[str, ...] = ()  # そろえた 2 つの認証器


def _state(subject: str, strength: str, at: float) -> AuthnState:
    return AuthnState(
        subject=subject,
        strength=strength,  # type: ignore[arg-type]
        verified_at=datetime.fromtimestamp(at, tz=timezone.utc),
    )


class AuthnSessions:
    def __init__(self, *, max_entries: int = 10_000) -> None:
        if max_entries < 1:
            raise ValueError("max_entries は 1 以上")
        self._max = max_entries
        self._entries: dict[str, _Entry] = {}

    def __len__(self) -> int:
        return len(self._entries)

    @staticmethod
    def _latest(entry: _Entry) -> float:
        return max(at for _, at in entry.seen.values())

    def _make_room(self, now: float) -> None:
        if len(self._entries) < self._max:
            return
        self._entries = {
            jkt: e for jkt, e in self._entries.items() if now - self._latest(e) <= STRONG_MAX_AGE_SECONDS
        }
        if len(self._entries) >= self._max:
            # 満杯なら、いちばん古い控えを 1 つ捨てる (捨てられた人は、もう一度確認する)。
            oldest = min(self._entries, key=lambda k: self._latest(self._entries[k]))
            del self._entries[oldest]

    def record(self, jkt: str, subject: str, kind: Kind, credential_id: str, *, now: float) -> AuthnState:
        # 返すのは、この確認の直後の強さ。strong なら「いま 2 つがそろった」。
        entry = self._entries.get(jkt)
        if entry is None or entry.subject != subject:
            # 別の人の確認は、前の人の確認と合算しない。
            if entry is None:
                self._make_room(now)
            entry = self._entries[jkt] = _Entry(subject=subject)
        entry.seen[kind] = (credential_id, now)
        times = [entry.seen[k][1] for k in KINDS if k in entry.seen]
        if len(times) == len(KINDS) and max(times) - min(times) <= PAIR_WINDOW_SECONDS:
            entry.strong_at = now
            entry.pair = tuple(entry.seen[k][0] for k in KINDS)
            return _state(subject, "strong", now)
        return _state(subject, "single", now)

    def state(self, jkt: str, *, now: float) -> AuthnState | None:
        entry = self._entries.get(jkt)
        if entry is None or not entry.seen:
            return None
        if entry.strong_at is not None and -_FUTURE_SKEW_SECONDS <= now - entry.strong_at <= STRONG_MAX_AGE_SECONDS:
            return _state(entry.subject, "strong", entry.strong_at)
        latest = self._latest(entry)
        if not -_FUTURE_SKEW_SECONDS <= now - latest <= STRONG_MAX_AGE_SECONDS:
            return None
        return _state(entry.subject, "single", latest)

    def revoke_subject(self, subject: str) -> int:
        gone = [jkt for jkt, e in self._entries.items() if e.subject == subject]
        for jkt in gone:
            del self._entries[jkt]
        return len(gone)

    def drop_credential(self, credential_id: str) -> int:
        # 止めた認証器での確認は、無かったことにする (それでそろえた strong も消える)。
        count = 0
        for jkt in list(self._entries):
            entry = self._entries[jkt]
            hit = [k for k, (cid, _) in entry.seen.items() if cid == credential_id]
            if not hit and credential_id not in entry.pair:
                continue
            for kind in hit:
                del entry.seen[kind]
            if credential_id in entry.pair:
                entry.strong_at, entry.pair = None, ()
            count += 1
            if not entry.seen:
                del self._entries[jkt]
        return count
