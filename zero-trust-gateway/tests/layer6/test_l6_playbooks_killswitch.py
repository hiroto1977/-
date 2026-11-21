# 第 6 層: 出来事ごとの対応と、停止スイッチ (既定は dry-run)。
from __future__ import annotations

from pathlib import Path

import pytest

from contracts import SecurityEvent
from helpers import at
from layer1_mtd.runner import CommandRunner
from layer4_ai_evolution.actions import SessionStore
from layer6_soar.audit_log import AuditLog, verify_file
from layer6_soar.blocklist import BlockPlanner
from layer6_soar.issuance_switch import IssuanceSwitch
from layer6_soar.killswitch import KillSwitchDisabled, main, restore, run_killswitch
from layer6_soar.playbooks import LogNotifier, SoarDeps, handle_event

ATTACKER = "198.51.100.23"
ADMIN = "203.0.113.10"


class Spawn:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, argv: list[str], **_: object) -> None:
        self.calls.append(argv)


class World:
    def __init__(self, tmp_path: Path, *, execute: bool = False) -> None:
        self.spawn = Spawn()
        self.lines: list[str] = []
        self.sessions = SessionStore()
        self.notifier = LogNotifier()
        self.issuance = IssuanceSwitch()
        self.disabled: list[str] = []
        self.audit_path = tmp_path / "audit.jsonl"
        self.deps = SoarDeps(
            audit=AuditLog(self.audit_path),
            planner=BlockPlanner(admin_allowlist=[ADMIN], rate_limit_per_minute=2),
            runner=CommandRunner(execute=execute, sink=self.lines.append, spawn=self.spawn),
            sessions=self.sessions,
            notifier=self.notifier,
            issuance=self.issuance,
            disable_authenticator=self.disabled.append,
        )

    def handle(self, kind: str, **over: object):
        return handle_event(SecurityEvent(kind=kind, at=at(), **over), self.deps)  # type: ignore[arg-type]


def test_おとりに触れたら_記録_遮断_切断_知らせ(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.sessions.touch("s1", "alice")
    w.sessions.touch("s2", "alice")
    w.sessions.touch("s3", "bob")
    out = w.handle("canary_touched", source_ip=ATTACKER, subject="alice")
    assert out.steps == ("audit:canary.touched", "block:dry-run", "sessions:revoked:2", "notify")
    assert out.needs_human is True
    assert (w.sessions.state("s1"), w.sessions.state("s3")) == ("revoked", "active")
    assert w.spawn.calls == []
    assert w.lines == [f"[dry-run] nft add element inet spa blocked '{{' {ATTACKER} timeout 86400s '}}'"]
    assert len(w.notifier.sent) == 1
    assert verify_file(w.audit_path).count == 1


def test_execute_の実行役なら_遮断を実際に動かす(tmp_path: Path) -> None:
    w = World(tmp_path, execute=True)
    out = w.handle("canary_touched", source_ip=ATTACKER)
    assert "block:executed" in out.steps
    assert w.spawn.calls == [
        ["nft", "add", "element", "inet", "spa", "blocked", "{", ATTACKER, "timeout", "86400s", "}"]
    ]


@pytest.mark.parametrize(
    ("ip", "step"),
    [(ADMIN, "block:skip:admin"), ("127.0.0.1", "block:skip:loopback"), (None, "block:skip:no_ip")],
)
def test_管理用と自分自身は_execute_でも遮断しない(tmp_path: Path, ip: str | None, step: str) -> None:
    w = World(tmp_path, execute=True)
    out = w.handle("canary_touched", source_ip=ip)
    assert step in out.steps
    assert w.spawn.calls == []


def test_遮断が続いたら_止めて人を呼ぶ(tmp_path: Path) -> None:
    w = World(tmp_path, execute=True)
    for i in range(2):
        w.handle("canary_touched", source_ip=f"198.51.100.{i + 1}")
    out = w.handle("canary_touched", source_ip="198.51.100.99")
    assert "block:skip:rate_limited" in out.steps
    assert len(w.spawn.calls) == 2


def test_点数で凍結(tmp_path: Path) -> None:
    w = World(tmp_path)
    w.sessions.touch("s1", "alice")
    out = w.handle("risk_freeze", subject="alice", session_id="s1")
    assert out.steps == ("session:frozen", "audit:risk.freeze", "notify")
    assert w.sessions.state("s1") == "frozen"


def test_署名カウンタが戻ったら_その認証器を止める(tmp_path: Path) -> None:
    w = World(tmp_path)
    out = w.handle("counter_regression", subject="alice", detail={"credential_id": "cred-1"})
    assert w.disabled == ["cred-1"]
    assert out.steps[0] == "authenticator:disabled" and out.needs_human is True


def test_記録の鎖が合わないときは_発行を止め_鎖には書かない(tmp_path: Path) -> None:
    w = World(tmp_path)
    out = w.handle("audit_chain_broken")
    assert out.steps == ("issuance:halted", "notify")
    assert w.issuance.halted() is True
    assert verify_file(w.audit_path).count == 0


def test_証明の失敗とノックの失敗は_記録する(tmp_path: Path) -> None:
    w = World(tmp_path)
    assert w.handle("attestation_failed", subject="alice").steps == ("audit:attestation.failed", "notify")
    assert w.handle("knock_rejected", source_ip=ATTACKER).steps == ("audit:knock.rejected",)
    assert verify_file(w.audit_path).count == 2


# ---- 停止スイッチ ----
def runner(execute: bool, spawn: Spawn, lines: list[str]) -> CommandRunner:
    return CommandRunner(execute=execute, sink=lines.append, spawn=spawn)


def test_既定は_dry_run_で_何も変えない() -> None:
    switch, spawn, lines = IssuanceSwitch(), Spawn(), []
    for level in (1, 2):
        result = run_killswitch(level, switch=switch, runner=runner(False, spawn, lines), sink=lines.append)
        assert result.executed is False
    assert switch.halted() is False
    assert spawn.calls == []
    assert lines[0] == "[dry-run] トークンの発行を止める"


def test_段_1_を実行すると_発行だけが止まる() -> None:
    switch, spawn = IssuanceSwitch(), Spawn()
    result = run_killswitch(1, switch=switch, runner=runner(False, spawn, []), execute=True)
    assert result.steps == ("issuance:halted",)
    assert switch.halted() is True and spawn.calls == []


def test_段_2_を実行すると_発行を止め_許可の一覧を空にする() -> None:
    switch, spawn = IssuanceSwitch(), Spawn()
    result = run_killswitch(2, switch=switch, runner=runner(True, spawn, []), execute=True)
    assert result.steps == ("issuance:halted", "firewall:executed", "firewall:executed")
    assert spawn.calls == [
        ["nft", "flush", "set", "inet", "spa", "allowed"],
        ["nft", "flush", "set", "inet", "spa", "allowed6"],
    ]


@pytest.mark.parametrize(("execute", "runner_execute"), [(True, False), (False, True)])
def test_段_2_は_片方だけ本気では動かない(execute: bool, runner_execute: bool) -> None:
    switch, spawn = IssuanceSwitch(), Spawn()
    with pytest.raises(ValueError):
        run_killswitch(2, switch=switch, runner=runner(runner_execute, spawn, []), execute=execute)
    assert switch.halted() is False and spawn.calls == []


def test_段_3_は無効で出荷している() -> None:
    switch, spawn = IssuanceSwitch(), Spawn()
    with pytest.raises(KillSwitchDisabled):
        run_killswitch(3, switch=switch, runner=runner(True, spawn, []), execute=True)
    assert switch.halted() is False and spawn.calls == []
    with pytest.raises(ValueError):
        run_killswitch(4, switch=switch, runner=runner(False, spawn, []))


def test_戻す道具は_execute_のときだけ再開する() -> None:
    switch = IssuanceSwitch()
    switch.halt("test")
    assert restore(switch=switch, sink=lambda _: None).executed is False
    assert switch.halted() is True
    assert restore(switch=switch, execute=True).steps == ("issuance:resumed",)
    assert switch.halted() is False


def test_道具は_印のファイルで_別のプロセスからも止められる(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    halt = tmp_path / "issuance.halt"
    monkeypatch.delenv("ISSUANCE_HALT_FILE", raising=False)
    assert main(["--level", "1", "--execute"]) == 2
    monkeypatch.setenv("ISSUANCE_HALT_FILE", str(halt))
    assert main(["--level", "1"]) == 0
    assert not halt.exists()
    assert main(["--level", "1", "--execute"]) == 0
    assert IssuanceSwitch(halt).halted() is True
    assert main(["--restore"]) == 0
    assert halt.exists()
    assert main(["--restore", "--execute"]) == 0
    assert not halt.exists()
    assert main(["--level", "3", "--execute"]) == 3
    capsys.readouterr()
