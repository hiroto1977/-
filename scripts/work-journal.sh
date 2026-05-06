#!/usr/bin/env bash
# work-journal.sh — 業務 引継ぎ Free システム (governance/16_WORK_JOURNAL.md)
#
# 業務工程 を 8 種類のイベント に正規化し、~/.claude/audit.jsonl に
# `work.task.*` プレフィックスで追記。担当者が突然変わっても全文脈を 30 分で把握可能。
#
# 用法:
#   bash scripts/work-journal.sh --start    20260506-01 "title=A社見積 stakeholder=A社田中部長"
#   bash scripts/work-journal.sh --decision 20260506-01 "chose=plan_B why=A社が予算25%削減要望"
#   bash scripts/work-journal.sh --comm     20260506-01 "with=A社田中部長 summary=値引10%は無理"
#   bash scripts/work-journal.sh --artifact 20260506-01 "path=docs/見積_v3.xlsx status=draft"
#   bash scripts/work-journal.sh --block    20260506-01 "reason=部長承認待ち needs=金曜まで"
#   bash scripts/work-journal.sh --resume   20260506-01 "note=承認OK 5%値引で進める"
#   bash scripts/work-journal.sh --handoff  20260506-01 "next=月曜返答 open=配送費込み再検討"
#   bash scripts/work-journal.sh --complete 20260506-01 "outcome=受注 retro=値引交渉に時間"
#   bash scripts/work-journal.sh --list                # active タスク
#   bash scripts/work-journal.sh --show     20260506-01 # 全イベント 時系列
#   bash scripts/work-journal.sh --export   20260506-01 # Markdown サマリ
#
# 全イベントは audit-verify.sh で改竄検知される (既存 INV-2 / INV-10 を継承)。
#
# 関連: governance/16_WORK_JOURNAL.md, governance/12 §10 #31

set -u
LANG=ja_JP.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# audit lib (sourced)
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "work_journal.start" "args=$*"

if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_HDR="\033[1;36m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_HDR=""; C_RST=""
fi

AUDIT_LOG="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"

# ── ヘルパー: イベント発火 ──
emit_work() {
  local event_suffix="$1"
  local task_id="${2:-}"
  local extra="${3:-}"
  if [[ -z "$task_id" ]]; then
    echo "用法: --${event_suffix} <task-id> <details>" >&2
    return 2
  fi
  local details="task=$task_id"
  [[ -n "$extra" ]] && details="$details $extra"
  audit_log "work.task.${event_suffix}" "$details"
  echo -e "${C_OK}✓${C_RST} 記録: ${C_BLD}work.task.${event_suffix}${C_RST}  ${task_id}"
  [[ -n "$extra" ]] && echo "    $extra"
  return 0
}

# ── --list: アクティブ タスク (start あり / complete なし) ──
cmd_list() {
  local show_all="${1:-0}"
  if [[ ! -f "$AUDIT_LOG" ]]; then
    echo "${C_DIM}(audit.jsonl なし — まだ業務 記録 なし)${C_RST}"
    return 0
  fi
  echo -e "${C_HDR}━━ アクティブ タスク 一覧 ━━${C_RST}"
  python3 - "$AUDIT_LOG" "$show_all" <<'PY'
import sys, json, re
from collections import defaultdict
log_path, show_all = sys.argv[1], sys.argv[2] == "1"
tasks = defaultdict(lambda: {'events': [], 'state': 'unknown', 'last_ts': '', 'title': '', 'stake': ''})
RE_TASK = re.compile(r'task=(\S+)')
RE_TITLE = re.compile(r'title=(\S(?:\S|\s(?!\w+=))*)')
RE_STAKE = re.compile(r'stakeholder=(\S(?:\S|\s(?!\w+=))*)')
with open(log_path) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        ev = e.get('event', '')
        if not ev.startswith('work.task.'): continue
        d = e.get('details', '')
        m = RE_TASK.search(d)
        if not m: continue
        tid = m.group(1)
        tasks[tid]['events'].append(ev)
        tasks[tid]['last_ts'] = e.get('ts', '')
        if 'start' in ev:
            mt = RE_TITLE.search(d); ms = RE_STAKE.search(d)
            if mt: tasks[tid]['title'] = mt.group(1).strip()
            if ms: tasks[tid]['stake'] = ms.group(1).strip()
        # 状態判定
        if 'complete' in ev: tasks[tid]['state'] = 'complete'
        elif 'block' in ev: tasks[tid]['state'] = 'blocked'
        elif 'resume' in ev: tasks[tid]['state'] = 'active'
        elif 'handoff' in ev: tasks[tid]['state'] = 'handoff'
        elif tasks[tid]['state'] == 'unknown': tasks[tid]['state'] = 'active'
# 表示
shown = 0
for tid, t in sorted(tasks.items(), key=lambda kv: kv[1]['last_ts'], reverse=True):
    if not show_all and t['state'] == 'complete': continue
    icon = {'active': '🟢', 'blocked': '🟡', 'handoff': '🟣', 'complete': '⚪', 'unknown': '·'}[t['state']]
    print(f"  {icon} [{t['state']:8}] {tid:18}  {t['title'][:40]:40}  ({t['stake'][:25]})")
    print(f"           last={t['last_ts'][:19]}  events={len(t['events'])}")
    shown += 1
if shown == 0:
    print(f"  (アクティブ タスク なし{'' if show_all else ' / 完了済も見るなら --list --all'})")
PY
}

# ── --show: 特定タスクの全イベント ──
cmd_show() {
  local tid="${1:-}"
  if [[ -z "$tid" ]]; then echo "用法: --show <task-id>" >&2; return 2; fi
  if [[ ! -f "$AUDIT_LOG" ]]; then echo "(audit.jsonl なし)"; return 0; fi
  echo -e "${C_HDR}━━ タスク ${tid} 全イベント (時系列) ━━${C_RST}"
  python3 - "$AUDIT_LOG" "$tid" <<'PY'
import sys, json, re
log_path, tid = sys.argv[1], sys.argv[2]
RE_TASK = re.compile(r'task=' + re.escape(tid) + r'(?:\s|$)')
events = []
with open(log_path) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        if not e.get('event', '').startswith('work.task.'): continue
        if RE_TASK.search(e.get('details', '')):
            events.append(e)
if not events:
    print(f"  (task={tid} のイベントなし)")
else:
    for e in events:
        ev = e['event'].replace('work.task.', '')
        print(f"  [{e['ts'][:19]}] {ev:10}  {e['details']}")
    print(f"\n  合計 {len(events)} イベント")
PY
}

# ── --export: Markdown 形式でタスク全体を出力 ──
cmd_export() {
  local tid="${1:-}"
  if [[ -z "$tid" ]]; then echo "用法: --export <task-id>" >&2; return 2; fi
  if [[ ! -f "$AUDIT_LOG" ]]; then echo "(audit.jsonl なし)"; return 0; fi
  python3 - "$AUDIT_LOG" "$tid" <<'PY'
import sys, json, re
log_path, tid = sys.argv[1], sys.argv[2]
RE_TASK = re.compile(r'task=' + re.escape(tid) + r'(?:\s|$)')
events = []
with open(log_path) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        if not e.get('event', '').startswith('work.task.'): continue
        if RE_TASK.search(e.get('details', '')):
            events.append(e)
if not events: print(f"# Task {tid}\n\n(イベントなし)"); sys.exit()
print(f"# Task {tid}")
print()
print(f"イベント数: {len(events)}  /  最初: {events[0]['ts'][:19]}  /  最後: {events[-1]['ts'][:19]}")
print()
print("## 時系列")
print()
for e in events:
    ev = e['event'].replace('work.task.', '')
    print(f"- **{e['ts'][:19]}** `{ev}` {e['details']}")
print()
print("## 引継ぎチェック リスト (governance/16 §2.3)")
print()
last_handoff = next((e for e in reversed(events) if 'handoff' in e['event']), None)
if last_handoff:
    print(f"- ✅ 最終 handoff: {last_handoff['ts'][:19]}")
    print(f"  - {last_handoff['details']}")
else:
    print("- ⚠️ handoff イベントなし — 担当変更 前に `--handoff` を記録してください")
artifacts = [e for e in events if 'artifact' in e['event']]
if artifacts:
    print(f"- 成果物 ({len(artifacts)} 件):")
    for a in artifacts:
        m = re.search(r'path=(\S+)', a['details'])
        if m: print(f"  - `{m.group(1)}`")
PY
}

# ── --audit: JSONL のまま出力 (audit-verify とのパイプ用) ──
cmd_audit_filter() {
  if [[ ! -f "$AUDIT_LOG" ]]; then return 0; fi
  grep '"event":"work\.task\.' "$AUDIT_LOG"
}

# ── 引数 解析 ──
if [[ $# -eq 0 ]]; then
  sed -n '2,30p' "$0"
  exit 0
fi

case "$1" in
  --start)    shift; emit_work "start"    "${1:-}" "${2:-}" ;;
  --decision) shift; emit_work "decision" "${1:-}" "${2:-}" ;;
  --comm)     shift; emit_work "comm"     "${1:-}" "${2:-}" ;;
  --artifact) shift; emit_work "artifact" "${1:-}" "${2:-}" ;;
  --block)    shift; emit_work "block"    "${1:-}" "${2:-}" ;;
  --resume)   shift; emit_work "resume"   "${1:-}" "${2:-}" ;;
  --handoff)  shift; emit_work "handoff"  "${1:-}" "${2:-}" ;;
  --complete) shift; emit_work "complete" "${1:-}" "${2:-}" ;;
  --list)
    shift
    show_all=0
    [[ "${1:-}" == "--all" ]] && show_all=1
    cmd_list "$show_all"
    ;;
  --show)     shift; cmd_show "${1:-}" ;;
  --export)   shift; cmd_export "${1:-}" ;;
  --audit)    cmd_audit_filter ;;
  -h|--help)  sed -n '2,30p' "$0"; exit 0 ;;
  *)
    echo "未知のコマンド: $1" >&2
    echo "使えるコマンド: --start --decision --comm --artifact --block --resume --handoff --complete --list --show --export --audit" >&2
    exit 2
    ;;
esac
