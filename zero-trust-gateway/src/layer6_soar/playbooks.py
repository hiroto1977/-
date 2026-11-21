# 出来事ごとの対応の手順 (ARCHITECTURE_V2.md §3.6 の表)。
#
# 自動でするのは「自分の側の遮断・切断・停止・記録・知らせ」だけ。相手の機械には何もしない。
# 判断を変える所 (遮断の解除・承認・再登録) は人がする。
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from contracts import Notifier, SecurityEvent, SessionControl
from layer1_mtd.runner import CommandRunner

from .audit_log import AuditLog
from .blocklist import BlockPlanner
from .issuance_switch import IssuanceSwitch


@dataclass
class SoarDeps:
    audit: AuditLog
    planner: BlockPlanner
    runner: CommandRunner
    sessions: SessionControl
    notifier: Notifier
    issuance: IssuanceSwitch
    disable_authenticator: Callable[[str], None] | None = None


@dataclass(frozen=True)
class PlaybookOutcome:
    steps: tuple[str, ...]
    needs_human: bool


@dataclass
class _Run:
    steps: list[str] = field(default_factory=list)
    needs_human: bool = False


class LogNotifier:
    # 既定の知らせ先 (メモリに溜めるだけ)。Webhook などへ送る実装は、送り先が決まってから足す。
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    def notify(self, title: str, body: str) -> None:
        self.sent.append((title, body))


def _record(deps: SoarDeps, event: SecurityEvent, run: _Run, action: str, result: str) -> None:
    deps.audit.append(
        actor="soar",
        action=action,
        target=event.subject or event.source_ip or "unknown",
        result=result,  # type: ignore[arg-type]
        at=event.at,
    )
    run.steps.append(f"audit:{action}")


def _block(deps: SoarDeps, event: SecurityEvent, run: _Run) -> None:
    if event.source_ip is None:
        run.steps.append("block:skip:no_ip")
        return
    decision = deps.planner.plan(event.source_ip, now=event.at.timestamp())
    if decision.action == "skip":
        run.steps.append(f"block:skip:{decision.reason}")
        run.needs_human = run.needs_human or decision.needs_human
        return
    result = deps.runner.run(decision.argv)
    run.steps.append("block:executed" if result.executed else "block:dry-run")


def handle_event(event: SecurityEvent, deps: SoarDeps) -> PlaybookOutcome:
    run = _Run()
    kind = event.kind
    if kind == "canary_touched":
        _record(deps, event, run, "canary.touched", "denied")
        _block(deps, event, run)
        if event.subject is not None:
            count = deps.sessions.revoke_subject(event.subject)
            run.steps.append(f"sessions:revoked:{count}")
        deps.notifier.notify("おとりの鍵が使われました", f"送信元: {event.source_ip or '不明'}")
        run.steps.append("notify")
        run.needs_human = True
    elif kind == "risk_freeze":
        if event.session_id is not None:
            deps.sessions.freeze(event.session_id, "risk")
            run.steps.append("session:frozen")
        _record(deps, event, run, "risk.freeze", "denied")
        deps.notifier.notify("セッションを凍結しました", "承認か却下を決めてください")
        run.steps.append("notify")
        run.needs_human = True
    elif kind == "counter_regression":
        credential = event.detail.get("credential_id")
        if credential is not None and deps.disable_authenticator is not None:
            deps.disable_authenticator(credential)
            run.steps.append("authenticator:disabled")
        _record(deps, event, run, "authenticator.counter_regression", "denied")
        deps.notifier.notify("認証器の複製の疑い", "本人確認と再登録が要ります")
        run.steps.append("notify")
        run.needs_human = True
    elif kind == "attestation_failed":
        _record(deps, event, run, "attestation.failed", "denied")
        deps.notifier.notify("端末の証明に失敗しました", "端末の調査が要ります")
        run.steps.append("notify")
        run.needs_human = True
    elif kind == "audit_chain_broken":
        # 記録そのものが信用できないので、鎖へは書かない。発行を止めて人を呼ぶ。
        deps.issuance.halt("audit_chain_broken")
        run.steps.append("issuance:halted")
        deps.notifier.notify("記録の鎖が合いません", "トークンの発行を止めました。調査が要ります")
        run.steps.append("notify")
        run.needs_human = True
    elif kind == "knock_rejected":
        _record(deps, event, run, "knock.rejected", "denied")
    else:
        # 知らない種類は黙って捨てない。
        raise ValueError(f"知らない出来事: {kind}")
    return PlaybookOutcome(tuple(run.steps), run.needs_human)
