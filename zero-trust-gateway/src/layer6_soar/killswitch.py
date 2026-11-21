# 停止スイッチ。既定は dry-run (何をするかを刷るだけ —— 規則 3)。
#
#   段 1: トークンの発行を止める (出した分は 5 分以内に切れる)
#   段 2: 段 1 に加えて、外向きの入口を閉じる (許可した IP の一覧を空にする。管理用の SSH は残る)
#   段 3: 物理の遮断 —— 無効で出荷している (配線と手順が決まってから)
#
# 使い方: python -m layer6_soar.killswitch --level 1            (刷るだけ)
#         python -m layer6_soar.killswitch --level 1 --execute  (実際に止める)
#         python -m layer6_soar.killswitch --restore --execute  (発行を再開する)
from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from layer1_mtd.firewall import flush_set_argv
from layer1_mtd.runner import CommandRunner

from .issuance_switch import IssuanceSwitch


class KillSwitchDisabled(RuntimeError):
    pass


@dataclass(frozen=True)
class KillResult:
    level: int
    executed: bool
    steps: tuple[str, ...]


def run_killswitch(
    level: int,
    *,
    switch: IssuanceSwitch,
    runner: CommandRunner,
    execute: bool = False,
    sink: Callable[[str], None] = print,
) -> KillResult:
    if level not in (1, 2, 3):
        raise ValueError("level は 1 / 2 / 3")
    if level == 3:
        raise KillSwitchDisabled("段 3 (物理の遮断) は無効で出荷している")
    if level >= 2 and execute != runner.execute:
        # 片方だけ本気で動かさない (dry-run のつもりで入口を閉じる・発行だけ止めて入口は開いたまま、を作らない)。
        raise ValueError("段 2 は、実行役 (runner) の execute とそろえて呼ぶ")
    steps: list[str] = []
    if execute:
        switch.halt(f"killswitch level {level}")
        steps.append("issuance:halted")
    else:
        sink("[dry-run] トークンの発行を止める")
        steps.append("issuance:dry-run")
    if level >= 2:
        for version in (4, 6):
            result = runner.run(flush_set_argv("allowed", version))  # type: ignore[arg-type]
            steps.append("firewall:executed" if result.executed else "firewall:dry-run")
    return KillResult(level=level, executed=execute, steps=tuple(steps))


def restore(
    *, switch: IssuanceSwitch, execute: bool = False, sink: Callable[[str], None] = print
) -> KillResult:
    # 戻すのは発行の停止だけ。入口の一覧は、正しいノックでまた入る。
    if execute:
        switch.resume()
        return KillResult(level=0, executed=True, steps=("issuance:resumed",))
    sink("[dry-run] トークンの発行を再開する")
    return KillResult(level=0, executed=False, steps=("issuance:dry-run",))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="停止スイッチ (既定は dry-run)")
    parser.add_argument("--level", type=int, choices=(1, 2, 3), default=1)
    parser.add_argument("--restore", action="store_true")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    halt_file = os.environ.get("ISSUANCE_HALT_FILE", "")
    if halt_file == "":
        print("ISSUANCE_HALT_FILE を設定してください (発行を止める印の置き場所)", file=sys.stderr)
        return 2
    switch = IssuanceSwitch(Path(halt_file))
    try:
        if args.restore:
            result = restore(switch=switch, execute=args.execute)
        else:
            result = run_killswitch(
                args.level,
                switch=switch,
                runner=CommandRunner(execute=args.execute),
                execute=args.execute,
            )
    except KillSwitchDisabled as err:
        print(str(err), file=sys.stderr)
        return 3
    print("実行しました" if result.executed else "dry-run でした (実行するには --execute)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
