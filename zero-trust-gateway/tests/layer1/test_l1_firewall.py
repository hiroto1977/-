# 第 1 層: nftables の命令の組み立てと、既定が dry-run の実行役。
from __future__ import annotations

import pytest

from layer1_mtd.firewall import (
    MAX_TIMEOUT_SECONDS,
    add_element_argv,
    delete_element_argv,
    flush_set_argv,
)
from layer1_mtd.runner import CommandRunner, UnsafeCommand

# 文書用の IP (RFC 5737 / RFC 3849)。実在の機械を指さない。
V4 = "203.0.113.7"
V6 = "2001:db8::7"


class Spawn:
    def __init__(self) -> None:
        self.calls: list[tuple[list[str], dict[str, object]]] = []

    def __call__(self, argv: list[str], **kwargs: object) -> None:
        self.calls.append((argv, kwargs))


def test_足す命令は_期限つきで_v4_と_v6_を別の一覧へ入れる() -> None:
    assert add_element_argv("blocked", V4, 3600) == [
        "nft", "add", "element", "inet", "spa", "blocked", "{", V4, "timeout", "3600s", "}",
    ]
    assert add_element_argv("allowed", V6, 30)[5:8] == ["allowed6", "{", V6]


def test_IPv4_を包んだ_IPv6_は_中の_IPv4_として扱う() -> None:
    assert add_element_argv("blocked", f"::ffff:{V4}", 60)[5:8] == ["blocked", "{", V4]


@pytest.mark.parametrize(
    "ip",
    ["", "not-an-ip", "203.0.113.7; nft flush ruleset", "203.0.113.0/24", "$(id)", "203.0.113.7 }", None, 7],
)
def test_IP_でない物は_命令に入らない(ip: object) -> None:
    with pytest.raises(ValueError):
        add_element_argv("blocked", ip, 60)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        delete_element_argv("blocked", ip)  # type: ignore[arg-type]


@pytest.mark.parametrize("timeout", [0, -1, MAX_TIMEOUT_SECONDS + 1, True, 1.5, "60"])
def test_期限は_1_秒から_7_日の整数だけ(timeout: object) -> None:
    with pytest.raises(ValueError):
        add_element_argv("blocked", V4, timeout)  # type: ignore[arg-type]


def test_知らない一覧の名前は断る() -> None:
    with pytest.raises(ValueError):
        add_element_argv("admin", V4, 60)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        flush_set_argv("admin", 4)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        flush_set_argv("allowed", 5)  # type: ignore[arg-type]


def test_既定は_dry_run_で_子プロセスを_1_度も起こさない() -> None:
    spawn, lines = Spawn(), []
    runner = CommandRunner(sink=lines.append, spawn=spawn)
    result = runner.run(add_element_argv("blocked", V4, 60))
    assert runner.execute is False
    assert result.executed is False
    assert spawn.calls == []
    assert lines == ["[dry-run] nft add element inet spa blocked '{' 203.0.113.7 timeout 60s '}'"]


@pytest.mark.parametrize("flag", ["true", 1, "yes", None])
def test_execute_は_True_そのものを渡したときだけ効く(flag: object) -> None:
    spawn = Spawn()
    runner = CommandRunner(execute=flag, sink=lambda _: None, spawn=spawn)  # type: ignore[arg-type]
    runner.run(flush_set_argv("allowed", 4))
    assert runner.execute is False
    assert spawn.calls == []


def test_execute_なら_シェルを通さずに_1_度だけ動かす() -> None:
    spawn = Spawn()
    runner = CommandRunner(execute=True, sink=lambda _: None, spawn=spawn)
    argv = add_element_argv("blocked", V6, 60)
    assert runner.run(argv).executed is True
    assert spawn.calls == [(argv, {"check": True, "timeout": 10})]


@pytest.mark.parametrize(
    "argv",
    [
        [],
        ["rm", "-rf", "/"],
        ["sh", "-c", "nft list ruleset"],
        ["nft", "add; reboot"],
        ["nft", "$(id)"],
        ["nft", "a b"],
        ["nft", 7],
    ],
)
def test_nft_以外と_危ない字は_dry_run_でも断る(argv: list[object]) -> None:
    spawn = Spawn()
    for execute in (False, True):
        with pytest.raises(UnsafeCommand):
            CommandRunner(execute=execute, sink=lambda _: None, spawn=spawn).run(argv)  # type: ignore[arg-type]
    assert spawn.calls == []
