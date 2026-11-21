# ふるまいの点数 (0〜1)。決まった規則の足し算で、同じ入力には同じ答えになる。
#
# AI は使わない。止めるかどうかを決めるのは、ここの数としきい値だけ (規則 9)。
# 履歴が無い人を「異常」にしない —— 普段と比べる規則は、普段が分かるときだけ働く。
from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from contracts import RiskDecision

from .baseline import Baseline
from .events import RequestEvent

# 規則の名前 → 足す点数。
WEIGHTS: dict[str, float] = {
    "new_country_or_asn": 0.3,
    "unusual_hour": 0.1,
    "rate_spike": 0.3,
    "failure_burst": 0.2,
    "unknown_paths": 0.2,
    "token_multi_ip": 0.5,
}
RATE_SPIKE_FACTOR = 5
# 普段がとても少ない人でも、この件数までは「急増」と言わない。
RATE_SPIKE_FLOOR_PER_MINUTE = 30
FAILURE_BURST_COUNT = 5
UNKNOWN_PATHS_COUNT = 5


@dataclass(frozen=True)
class Thresholds:
    step_up: float = 0.6
    freeze: float = 0.85

    def __post_init__(self) -> None:
        if not 0.0 < self.step_up < self.freeze <= 1.0:
            raise ValueError("しきい値は 0 < step_up < freeze <= 1")


def triggered_rules(window: Sequence[RequestEvent], baseline: Baseline) -> tuple[str, ...]:
    # window は直近 1 分の、同じ人の出来事。
    hit: list[str] = []
    if len(window) == 0:
        return ()
    if baseline.usable:
        new_place = any(
            (e.country is not None and baseline.countries and e.country not in baseline.countries)
            or (e.asn is not None and baseline.asns and e.asn not in baseline.asns)
            for e in window
        )
        if new_place:
            hit.append("new_country_or_asn")
        if any(e.utc_hour not in baseline.hours for e in window):
            hit.append("unusual_hour")
        limit = max(RATE_SPIKE_FACTOR * baseline.median_per_minute, RATE_SPIKE_FLOOR_PER_MINUTE)
        if len(window) > limit:
            hit.append("rate_spike")
        unknown = {e.path for e in window if e.path not in baseline.paths}
        if len(unknown) >= UNKNOWN_PATHS_COUNT:
            hit.append("unknown_paths")
    if sum(1 for e in window if not e.ok) >= FAILURE_BURST_COUNT:
        hit.append("failure_burst")
    ips_per_token: dict[str, set[str]] = {}
    for e in window:
        if e.token_fp is not None and e.ip is not None:
            ips_per_token.setdefault(e.token_fp, set()).add(e.ip)
    if any(len(ips) >= 2 for ips in ips_per_token.values()):
        hit.append("token_multi_ip")
    return tuple(hit)


def decide(
    session_id: str,
    window: Sequence[RequestEvent],
    baseline: Baseline,
    thresholds: Thresholds = Thresholds(),
) -> RiskDecision:
    reasons = triggered_rules(window, baseline)
    score = min(1.0, round(sum(WEIGHTS[r] for r in reasons), 6))
    if score >= thresholds.freeze:
        action = "freeze"
    elif score >= thresholds.step_up:
        action = "step_up"
    else:
        action = "allow"
    return RiskDecision(session_id=session_id, score=score, action=action, reasons=reasons)


def count_by_rule(decisions: Sequence[RiskDecision]) -> Counter[str]:
    # どの規則がどれだけ働いたか (しきい値を見直す材料)。
    return Counter(reason for d in decisions for reason in d.reasons)
