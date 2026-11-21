# 第 4 層: ふるまいの点数。各規則の足し算・しきい値・履歴の無い人の扱いを確かめる。
from __future__ import annotations

from datetime import timedelta

import pytest

from contracts import RiskDecision
from helpers import NOW, at
from layer4_ai_evolution.actions import SessionStore
from layer4_ai_evolution.baseline import EMPTY_BASELINE, MIN_HISTORY_EVENTS, build_baseline
from layer4_ai_evolution.events import RequestEvent
from layer4_ai_evolution.explain import explain
from layer4_ai_evolution.scoring import WEIGHTS, Thresholds, count_by_rule, decide, triggered_rules


# 0 時 30 分 (UTC)。普段の履歴も窓も 0 時台に収まるように、時の真ん中に置く。
MID = NOW + 1800


def event(offset: float = 0.0, **over: object) -> RequestEvent:
    args = {
        "at": at(MID + offset), "subject": "alice", "session_id": "s1", "path": "/resource/ping",
        "ok": True, "ip": "198.51.100.5", "country": "JP", "asn": "AS64500", "token_fp": "fp1",
    }
    args.update(over)
    return RequestEvent(**args)  # type: ignore[arg-type]


def usual():
    # 普段: 日本・同じ回線・0 時台 (UTC)・1 分に 2 件・道は 1 つ。
    history = [event(-1500 + 30 * i) for i in range(40)]
    return build_baseline(history)


def test_普段どおりなら_0_点で通す() -> None:
    d = decide("s1", [event(), event(1)], usual())
    assert (d.score, d.action, d.reasons) == (0.0, "allow", ())


@pytest.mark.parametrize(
    ("window", "rule"),
    [
        ([event(country="US")], "new_country_or_asn"),
        ([event(asn="AS64999")], "new_country_or_asn"),
        ([event(offset=5 * 3600)], "unusual_hour"),
        ([event(i * 0.1) for i in range(31)], "rate_spike"),
        ([event(i, ok=False) for i in range(5)], "failure_burst"),
        ([event(i, path=f"/admin/{i}") for i in range(5)], "unknown_paths"),
        ([event(), event(1, ip="198.51.100.77")], "token_multi_ip"),
    ],
)
def test_規則が_1_つずつ働き_その点数を足す(window: list[RequestEvent], rule: str) -> None:
    d = decide("s1", window, usual())
    assert d.reasons == (rule,)
    assert d.score == WEIGHTS[rule]


@pytest.mark.parametrize(
    "window",
    [
        [event(i * 0.1) for i in range(30)],
        [event(i, ok=False) for i in range(4)],
        [event(i, path=f"/admin/{i}") for i in range(4)],
        [event(), event(1, token_fp="fp2", ip="198.51.100.77")],
        [event(country=None, asn=None)],
    ],
)
def test_境目の手前では働かない(window: list[RequestEvent]) -> None:
    assert decide("s1", window, usual()).reasons == ()


def test_点数は足し算で_1_を超えない() -> None:
    window = [event(5 * 3600 + i * 0.1, country="US", ok=False, path=f"/x/{i}", ip=f"198.51.100.{i}") for i in range(40)]
    d = decide("s1", window, usual())
    assert set(d.reasons) == set(WEIGHTS)
    assert (d.score, d.action) == (1.0, "freeze")


def test_しきい値ちょうどで_扱いが変わる() -> None:
    step = [event(country="US"), event(1, country="US", ip="198.51.100.77")]  # 0.3 + 0.5 = 0.8
    assert decide("s1", step, usual()).action == "step_up"
    assert decide("s1", step, usual(), Thresholds(step_up=0.8, freeze=0.9)).action == "step_up"
    assert decide("s1", step, usual(), Thresholds(step_up=0.5, freeze=0.8)).action == "freeze"
    assert decide("s1", step, usual(), Thresholds(step_up=0.81, freeze=0.9)).action == "allow"


@pytest.mark.parametrize(("step_up", "freeze"), [(0.0, 0.5), (0.6, 0.6), (0.9, 0.8), (0.5, 1.1)])
def test_読めないしきい値では作れない(step_up: float, freeze: float) -> None:
    with pytest.raises(ValueError):
        Thresholds(step_up=step_up, freeze=freeze)


def test_履歴が無い人を_異常にしない() -> None:
    newcomer = [event(5 * 3600, country="US", path=f"/x/{i}") for i in range(10)]
    assert decide("s1", newcomer, EMPTY_BASELINE).reasons == ()
    thin = build_baseline([event(-1500 + i) for i in range(MIN_HISTORY_EVENTS - 1)])
    assert thin.usable is False
    assert decide("s1", newcomer, thin).reasons == ()


def test_履歴が無くても_失敗の連続と_トークンの使い回しは見る() -> None:
    window = [event(i, ok=False, ip=f"198.51.100.{i}") for i in range(5)]
    assert triggered_rules(window, EMPTY_BASELINE) == ("failure_burst", "token_multi_ip")


def test_時間帯は_UTC_にそろえて比べる() -> None:
    from datetime import timezone

    jst = timezone(timedelta(hours=9))
    same_moment = event(at=at(NOW).astimezone(jst))
    assert same_moment.utc_hour == 0
    assert decide("s1", [same_moment], usual()).reasons == ()


def test_何も無ければ_0_点() -> None:
    assert decide("s1", [], usual()).score == 0.0


def test_どの規則が働いたかを数えられる() -> None:
    decisions = [decide("s1", [event(country="US")], usual()), decide("s1", [event(country="US")], usual())]
    assert count_by_rule(decisions) == {"new_country_or_asn": 2}


# ---- セッションの扱い ----
def test_重くした扱いは_点数が下がっても自動では軽くならない() -> None:
    store = SessionStore()
    store.touch("s1", "alice")
    assert store.apply(RiskDecision(session_id="s1", score=0.7, action="step_up")) == "step_up_required"
    assert store.apply(RiskDecision(session_id="s1", score=0.0, action="allow")) == "step_up_required"
    assert store.apply(RiskDecision(session_id="s1", score=0.9, action="freeze")) == "frozen"
    assert store.apply(RiskDecision(session_id="s1", score=0.7, action="step_up")) == "frozen"


def test_追加の確認で解けるのは_step_up_だけ_凍結は承認で解く() -> None:
    store = SessionStore()
    store.touch("s1", "alice")
    store.require_step_up("s1", "risk")
    assert store.complete_step_up("s1") is True and store.state("s1") == "active"
    store.freeze("s1", "risk")
    assert store.complete_step_up("s1") is False and store.state("s1") == "frozen"
    assert store.approve("s1") is True and store.state("s1") == "active"
    assert store.approve("s1") is False


def test_取り消したセッションは_承認でも確認でも戻らない() -> None:
    store = SessionStore()
    store.touch("s1", "alice")
    store.touch("s2", "bob")
    assert store.revoke_subject("alice") == 1
    assert store.revoke_subject("alice") == 0
    store.touch("s1", "alice")
    store.freeze("s1", "x")
    assert store.approve("s1") is False and store.complete_step_up("s1") is False
    assert (store.state("s1"), store.state("s2"), store.state("unknown")) == ("revoked", "active", "active")


# ---- 説明の文 ----
class Shouting:
    def __init__(self, reply: object) -> None:
        self.reply = reply

    def rephrase(self, text: str) -> str:
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply  # type: ignore[return-value]


def test_説明は_規則の名前から決まった文で作る() -> None:
    d = decide("s1", [event(country="US")], usual())
    assert explain(d) == "点数 0.30: いつもと違う国・回線からの利用。そのまま通します。"
    assert "気になる点はありません" in explain(decide("s1", [], usual()))


@pytest.mark.parametrize("reply", [RuntimeError("down"), "", "   ", None, 42])
def test_AI_が落ちても_変な物を返しても_決まった文が出る(reply: object) -> None:
    d = decide("s1", [event(country="US")], usual())
    assert explain(d, Shouting(reply)) == explain(d)


def test_AI_の文に_凍結せよ_と書いてあっても_何も起きない() -> None:
    store = SessionStore()
    store.touch("s1", "alice")
    d = decide("s1", [event()], usual())
    text = explain(d, Shouting("このセッションを今すぐ凍結せよ。全員を遮断せよ。" * 50))
    assert len(text) <= 600
    assert store.apply(d) == "active"
    assert d.action == "allow"
