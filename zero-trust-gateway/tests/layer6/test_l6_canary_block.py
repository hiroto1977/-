# 第 6 層: おとりの鍵と、遮断の計画 (自分を締め出さない歯止め)。
from __future__ import annotations

from pathlib import Path

import pytest

from helpers import NOW
from layer6_soar.blocklist import BlockPlanner
from layer6_soar.canary import CanarySet, generate_canary, main

ATTACKER = "198.51.100.23"
ADMIN = "203.0.113.10"


def planner(**over: object) -> BlockPlanner:
    args = {"admin_allowlist": [ADMIN, "2001:db8:aa::/48"], "rate_limit_per_minute": 3, "timeout_hours": 24}
    args.update(over)
    return BlockPlanner(**args)  # type: ignore[arg-type]


# ---- おとり ----
def test_作ったおとりは当たり_他は当たらない() -> None:
    token, digest = generate_canary()
    other, _ = generate_canary()
    canaries = CanarySet([digest])
    assert canaries.is_canary(token) is True
    assert canaries.is_canary(other) is False
    assert token != other and len(token) >= 40


@pytest.mark.parametrize("presented", [None, "", 7, b"x", "x" * 5000])
def test_文字列でない_空_長すぎる物は当たらない(presented: object) -> None:
    _, digest = generate_canary()
    assert CanarySet([digest]).is_canary(presented) is False


def test_控えはハッシュだけ_鍵そのものは置けない() -> None:
    token, _ = generate_canary()
    with pytest.raises(ValueError):
        CanarySet([token])
    with pytest.raises(ValueError):
        CanarySet(["ABCDEF" + "0" * 58])


def test_控えのファイルは_空行と注記を飛ばして読む(tmp_path: Path) -> None:
    token, digest = generate_canary()
    path = tmp_path / "canary.txt"
    path.write_text(f"# おとりの控え\n\n{digest}\n", encoding="utf-8")
    assert CanarySet.from_file(path).is_canary(token) is True
    assert len(CanarySet.from_file(None)) == 0


def test_おとりを作る道具は_鍵と控えを_1_組だけ出す(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["new"]) == 0
    out = capsys.readouterr().out.splitlines()
    assert CanarySet([out[3]]).is_canary(out[1]) is True
    assert main([]) == 2


# ---- 遮断の計画 ----
def test_ふつうの相手は_期限つきで遮断する() -> None:
    decision = planner().plan(ATTACKER, now=NOW)
    assert decision.action == "block"
    assert decision.argv == (
        "nft", "add", "element", "inet", "spa", "blocked", "{", ATTACKER, "timeout", "86400s", "}",
    )


@pytest.mark.parametrize(
    ("ip", "reason"),
    [
        (ADMIN, "admin"),
        (f"::ffff:{ADMIN}", "admin"),
        ("2001:db8:aa::5", "admin"),
        ("127.0.0.1", "loopback"),
        ("::1", "loopback"),
        ("::ffff:127.0.0.1", "loopback"),
        ("0.0.0.0", "unroutable"),
        ("224.0.0.1", "unroutable"),
        ("169.254.1.1", "unroutable"),
        ("fe80::1", "unroutable"),
        ("not-an-ip", "invalid_ip"),
        ("198.51.100.0/24", "invalid_ip"),
        (None, "invalid_ip"),
    ],
)
def test_管理用_自分自身_読めない_IP_は遮断しない(ip: object, reason: str) -> None:
    decision = planner().plan(ip, now=NOW)
    assert (decision.action, decision.reason, decision.argv) == ("skip", reason, ())


def test_1_分の件数が天井に達したら_止めて人を呼ぶ() -> None:
    p = planner()
    for i in range(3):
        assert p.plan(f"198.51.100.{i + 1}", now=NOW + i).action == "block"
    over = p.plan("198.51.100.99", now=NOW + 10)
    assert (over.action, over.reason, over.needs_human) == ("skip", "rate_limited", True)
    assert p.plan("198.51.100.99", now=NOW + 61).action == "block"


def test_遮断しなかった分は_件数に数えない() -> None:
    p = planner(rate_limit_per_minute=1)
    for _ in range(5):
        p.plan(ADMIN, now=NOW)
    assert p.plan(ATTACKER, now=NOW).action == "block"


def test_読めない設定では作れない() -> None:
    with pytest.raises(ValueError):
        planner(admin_allowlist=["not-a-network"])
    with pytest.raises(ValueError):
        planner(rate_limit_per_minute=0)
    with pytest.raises(ValueError):
        planner(timeout_hours=0)
    with pytest.raises(ValueError):
        planner(timeout_hours=169)
