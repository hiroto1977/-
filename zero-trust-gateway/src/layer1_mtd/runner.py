# ファイアウォールの命令の実行役。既定は dry-run (何をするかを刷るだけ —— 規則 3)。
#
# 実際に動かすのは execute=True を明示したときだけ。開発中に自分を締め出さないため。
from __future__ import annotations

import re
import shlex
import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass

# 動かしてよい命令は nft だけ。引数は決まった字だけ (シェルは通さない)。
_ALLOWED_PROGRAMS = ("nft",)
_SAFE_ARG = re.compile(r"^[A-Za-z0-9_.:{}/-]+$")
_TIMEOUT_SECONDS = 10


class UnsafeCommand(ValueError):
    pass


@dataclass(frozen=True)
class RunResult:
    executed: bool
    line: str


class CommandRunner:
    def __init__(
        self,
        *,
        execute: bool = False,
        sink: Callable[[str], None] = print,
        spawn: Callable[..., object] = subprocess.run,
    ) -> None:
        self._execute = execute is True
        self._sink = sink
        self._spawn = spawn

    @property
    def execute(self) -> bool:
        return self._execute

    def run(self, argv: Sequence[str]) -> RunResult:
        args = list(argv)
        if not args or args[0] not in _ALLOWED_PROGRAMS:
            raise UnsafeCommand("動かしてよい命令は nft だけ")
        if any(not isinstance(a, str) or _SAFE_ARG.match(a) is None for a in args):
            raise UnsafeCommand("命令に使えない字が在る")
        line = shlex.join(args)
        if not self._execute:
            self._sink(f"[dry-run] {line}")
            return RunResult(executed=False, line=line)
        self._sink(f"[execute] {line}")
        self._spawn(args, check=True, timeout=_TIMEOUT_SECONDS)
        return RunResult(executed=True, line=line)
