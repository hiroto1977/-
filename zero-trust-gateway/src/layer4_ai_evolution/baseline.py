# その人の「普段」。過去の出来事から作る。
from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median

from .events import RequestEvent

# 普段を名乗るのに要る件数。これより少ない人は「履歴が無い」として、普段との比べをしない。
MIN_HISTORY_EVENTS = 20
# その時間帯を「普段使う」と言うのに要る件数。
_MIN_EVENTS_PER_HOUR = 2


@dataclass(frozen=True)
class Baseline:
    events: int
    countries: frozenset[str]
    asns: frozenset[str]
    hours: frozenset[int]
    paths: frozenset[str]
    median_per_minute: float

    @property
    def usable(self) -> bool:
        return self.events >= MIN_HISTORY_EVENTS


EMPTY_BASELINE = Baseline(0, frozenset(), frozenset(), frozenset(), frozenset(), 0.0)


def build_baseline(history: Sequence[RequestEvent]) -> Baseline:
    if len(history) == 0:
        return EMPTY_BASELINE
    per_hour = Counter(e.utc_hour for e in history)
    per_minute = Counter(int(e.at.timestamp() // 60) for e in history)
    return Baseline(
        events=len(history),
        countries=frozenset(e.country for e in history if e.country is not None),
        asns=frozenset(e.asn for e in history if e.asn is not None),
        hours=frozenset(h for h, n in per_hour.items() if n >= _MIN_EVENTS_PER_HOUR),
        paths=frozenset(e.path for e in history),
        median_per_minute=float(median(per_minute.values())),
    )
