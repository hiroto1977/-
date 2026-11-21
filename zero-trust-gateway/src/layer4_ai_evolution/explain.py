# 点数の理由を、人が読む文にする。
#
# 既定は決まった文の表 (AI なし)。ローカルの AI に言い換えさせる口 (Rephraser) も在るが、
# 返ってきた文は「人に見せるだけ」で、セッションの扱いには一切使わない (規則 9)。
# AI が落ちていても、変な文を返しても、既定の文が出る。
from __future__ import annotations

from typing import Protocol

from contracts import RiskDecision

_MAX_CHARS = 600
_TEXT: dict[str, str] = {
    "new_country_or_asn": "いつもと違う国・回線からの利用",
    "unusual_hour": "いつもと違う時間帯の利用",
    "rate_spike": "要求の数が普段の何倍にも増えた",
    "failure_burst": "短い間に失敗が続いた",
    "unknown_paths": "使ったことの無い機能へ続けて触れた",
    "token_multi_ip": "同じトークンが 2 つの場所から使われた",
}
_ACTION: dict[str, str] = {
    "allow": "そのまま通します",
    "step_up": "追加の確認を求めます",
    "freeze": "凍結して、管理者の承認を待ちます",
}


class Rephraser(Protocol):
    def rephrase(self, text: str) -> str: ...


def explain(decision: RiskDecision, rephraser: Rephraser | None = None) -> str:
    reasons = [_TEXT.get(r, r) for r in decision.reasons] or ["気になる点はありません"]
    base = f"点数 {decision.score:.2f}: {'・'.join(reasons)}。{_ACTION[decision.action]}。"
    if rephraser is None:
        return base
    try:
        text = rephraser.rephrase(base)
    except Exception:  # noqa: BLE001 —— AI の不調で判定の説明まで失わない
        return base
    if not isinstance(text, str) or text.strip() == "":
        return base
    return text.strip()[:_MAX_CHARS]
