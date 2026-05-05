#!/usr/bin/env bash
# orchestrate-kpi.sh — 4 チーム × 4 役 オーケストレーション の KPI 計測
#
# 用法:
#   bash scripts/orchestrate-kpi.sh                # テーブル表示
#   bash scripts/orchestrate-kpi.sh --json         # JSON 出力 (cron / 集計用)
#   bash scripts/orchestrate-kpi.sh --check        # INV-12 違反 (重複 scoped) のみチェック → exit 1
#
# KPI:
#   α (Architect)   : INV カバレッジ = テストで参照される INV 数 / 全 INV 数
#   β (Implement)   : サイクル完遂 中央時間 (team.alpha.1.scoped → pdca.cycle.complete)
#   γ (Quality)     : テスト pass 率 = pass / (pass + fail) (smoke-test 出力)
#   δ (Operations)  : governance 文書 鮮度 = 最終 commit からの中央経過日数
#
# 関連: governance/13_TEAM_ORCHESTRATION.md §8 KPI

set -u
LANG=ja_JP.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }
audit_log "orchestrate_kpi.start" "args=$*"

JSON=0
CHECK_ONLY=0
for a in "$@"; do
  case "$a" in
    --json)  JSON=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "未知: $a" >&2; exit 2 ;;
  esac
done

if [[ "$JSON" -eq 0 && -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_HDR="\033[1;36m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_HDR=""; C_RST=""
fi

# ── α KPI: INV カバレッジ ──
# 設計図 §4 の各 INV 行の「検証」カラムが test ファイル / smoke-test を参照していれば covered と数える
kpi_alpha() {
  local design="$ROOT_DIR/governance/12_SYSTEM_DESIGN.md"
  if [[ ! -f "$design" ]]; then echo "0 0 0"; return; fi
  python3 - "$design" "$ROOT_DIR" <<'PY' 2>/dev/null || echo "0 0 0"
import sys, re, os
design_path, root = sys.argv[1], sys.argv[2]
with open(design_path, encoding='utf-8') as f:
    text = f.read()
# §4 テーブル行 : | **INV-N** | 説明 | 守る場所 | 検証 |
rows = re.findall(r'^\| \*\*INV-(\d+)\*\* \| .* \| .* \| (.*) \|$', text, flags=re.M)
total = len(rows)
covered = 0
for inv_n, verify_col in rows:
    # 検証カラムに tests/ パスや audit-verify などが入っているか
    if re.search(r'tests?/', verify_col) or 'audit-verify' in verify_col or '監査ビューア' in verify_col:
        # かつそのファイルが実在 (tests/X が書かれているなら check)
        m = re.search(r'tests?/[\w./_-]+', verify_col)
        if m:
            path = m.group(0).rstrip('.,)')
            full = os.path.join(root, path.split(':')[0])
            if os.path.exists(full):
                covered += 1
                continue
        # audit-verify への参照は実在前提で許容
        covered += 1
rate = round(covered*100/total) if total else 0
print(f"{covered} {total} {rate}")
PY
}

# ── β KPI: サイクル完遂 中央時間 ──
kpi_beta() {
  local audit="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
  if [[ ! -f "$audit" ]]; then echo "0 0"; return; fi
  # scoped → cycle.complete のペアを抽出し、各ペアの経過秒を中央値
  python3 - "$audit" <<'PY' 2>/dev/null || echo "0 0"
import sys, json, re
from datetime import datetime
def parse_ts(s):
    # ISO 8601, may include +HH:MM
    s = re.sub(r'\.\d+', '', s)
    return datetime.fromisoformat(s)
scoped = []
completed = []
with open(sys.argv[1]) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        ev = e.get('event', '')
        if ev.endswith('.1.scoped'):
            scoped.append(parse_ts(e['ts']))
        elif ev == 'pdca.cycle.complete':
            completed.append(parse_ts(e['ts']))
# pair scoped[i] with first completed > scoped[i]
deltas = []
ci = 0
for s in scoped:
    while ci < len(completed) and completed[ci] < s: ci += 1
    if ci < len(completed):
        deltas.append((completed[ci] - s).total_seconds())
        ci += 1
if not deltas:
    print("0 0"); sys.exit()
deltas.sort()
mid = deltas[len(deltas)//2]
print(f"{len(deltas)} {int(mid)}")
PY
}

# ── γ KPI: テスト pass 率 ──
# 再帰防止: KPI 自身が テスト 内から呼ばれた場合 (ORCHESTRATE_KPI_NO_GAMMA=1)、
# smoke-test 走行は省略し audit log の最新 結果 を使う。
kpi_gamma() {
  if [[ "${ORCHESTRATE_KPI_NO_GAMMA:-0}" == "1" ]]; then
    # 既知の最新 結果がない場合は 0/0/0 を返す
    echo "0 0 0"; return
  fi
  local out
  out=$(ORCHESTRATE_KPI_NO_GAMMA=1 bash "$ROOT_DIR/tests/smoke-test.sh" 2>&1)
  # "結果: N pass / M fail / K skip / T total" の N と M を集計
  local pass fail
  pass=$(echo "$out" | grep -oE '結果: [0-9]+ pass' | grep -oE '[0-9]+' | awk '{ s+=$1 } END { print s+0 }')
  fail=$(echo "$out" | grep -oE '/ [0-9]+ fail' | grep -oE '[0-9]+' | awk '{ s+=$1 } END { print s+0 }')
  local rate
  local denom=$((pass + fail))
  if [[ "$denom" -gt 0 ]]; then
    rate=$(awk -v p="$pass" -v d="$denom" 'BEGIN { printf "%.0f", p*100/d }')
  else
    rate=0
  fi
  echo "$pass $fail $rate"
}

# ── δ KPI: governance 文書 鮮度 (最終 commit からの中央経過日数) ──
kpi_delta() {
  local gov="$ROOT_DIR/governance"
  if [[ ! -d "$gov" ]] || ! command -v git >/dev/null 2>&1; then
    echo "0 0"; return
  fi
  local now median
  now=$(date +%s)
  # 各 .md ファイルの最終 commit 時刻を取得
  median=$(cd "$ROOT_DIR" && \
    find governance -maxdepth 2 -name '*.md' -type f 2>/dev/null \
    | while IFS= read -r f; do
        ts=$(git log -1 --format=%ct -- "$f" 2>/dev/null)
        [[ -n "$ts" && "$ts" -gt 0 ]] && echo $(( (now - ts) / 86400 ))
      done \
    | sort -n \
    | awk '{ a[NR]=$1 } END {
        if (NR==0) { print 0; exit }
        if (NR % 2 == 1) print a[(NR+1)/2]
        else printf "%d\n", (a[NR/2] + a[NR/2+1]) / 2
      }')
  local count
  count=$(find "$gov" -maxdepth 2 -name '*.md' -type f 2>/dev/null | wc -l)
  echo "$count ${median:-0}"
}

# ── INV-12 違反検出: 同 issue ID の重複 scoped ──
inv12_check() {
  local audit="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
  if [[ ! -f "$audit" ]]; then echo "0"; return; fi
  python3 - "$audit" <<'PY' 2>/dev/null || echo "0"
import sys, json, re
from collections import defaultdict
counts = defaultdict(set)  # issue_id -> set of teams that scoped it
with open(sys.argv[1]) as f:
    for line in f:
        try: e = json.loads(line)
        except: continue
        ev = e.get('event', '')
        m = re.match(r'team\.(\w+)\.1\.scoped', ev)
        if m:
            team = m.group(1)
            details = e.get('details', '')
            im = re.search(r'issue=(\S+)', details)
            if im:
                counts[im.group(1)].add(team)
violations = sum(1 for teams in counts.values() if len(teams) > 1)
print(violations)
PY
}

# ── 出力 ──
# --check は INV-12 のみで早期終了 (γ smoke-test を回さない → 再帰防止)
if [[ "$CHECK_ONLY" -eq 1 ]]; then
  inv12_violations=$(inv12_check)
  if [[ "$inv12_violations" -gt 0 ]]; then
    echo -e "${C_E}❌ INV-12 違反: $inv12_violations 件の issue が複数チームに重複 scoped されている${C_RST}"
    audit_log "orchestrate_kpi.inv12_violation" "count=$inv12_violations"
    exit 1
  fi
  echo -e "${C_OK}✅ INV-12: 重複 scoped なし${C_RST}"
  exit 0
fi

read alpha_covered alpha_total alpha_rate <<<"$(kpi_alpha)"
read beta_n beta_median <<<"$(kpi_beta)"
read gamma_pass gamma_fail gamma_rate <<<"$(kpi_gamma)"
read delta_count delta_median <<<"$(kpi_delta)"
inv12_violations=$(inv12_check)

if [[ "$JSON" -eq 1 ]]; then
  cat <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "alpha_inv_coverage": {
    "covered": $alpha_covered,
    "total": $alpha_total,
    "rate_pct": $alpha_rate
  },
  "beta_cycle_time": {
    "completed_cycles": $beta_n,
    "median_seconds": $beta_median
  },
  "gamma_test_pass": {
    "pass": $gamma_pass,
    "fail": $gamma_fail,
    "rate_pct": $gamma_rate
  },
  "delta_doc_freshness": {
    "doc_count": $delta_count,
    "median_age_days": $delta_median
  },
  "inv12_violations": $inv12_violations
}
EOF
else
  echo -e "${C_HDR}── オーケストレーション KPI ──${C_RST}"
  echo "  実行時刻: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  printf "  ${C_BLD}α${C_RST} (Architect)   INV カバレッジ : %d / %d  (%d%%)\n" "$alpha_covered" "$alpha_total" "$alpha_rate"
  printf "  ${C_BLD}β${C_RST} (Implement)   サイクル中央時間: %d 件完了 / 中央 %d 秒\n" "$beta_n" "$beta_median"
  printf "  ${C_BLD}γ${C_RST} (Quality)     テスト pass 率 : %d / %d  (%d%%)\n" "$gamma_pass" "$((gamma_pass + gamma_fail))" "$gamma_rate"
  printf "  ${C_BLD}δ${C_RST} (Operations)  文書 鮮度      : %d 文書 / 中央 %d 日 経過\n" "$delta_count" "$delta_median"
  echo ""
  if [[ "$inv12_violations" -gt 0 ]]; then
    echo -e "  ${C_E}⚠️  INV-12 違反: $inv12_violations${C_RST}"
  else
    echo -e "  ${C_DIM}INV-12: 違反なし${C_RST}"
  fi
fi

audit_log "orchestrate_kpi.done" "alpha=$alpha_rate beta_n=$beta_n gamma=$gamma_rate delta=$delta_median inv12=$inv12_violations"
