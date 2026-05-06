#!/usr/bin/env bash
# orchestrate.sh — 4 チーム × 4 役 オーケストレータ
#
# 役割:
#   ・PDCA / OODA サイクルの起動
#   ・チーム間ハンドオフを audit log (=「板」) に記録
#   ・現在の状態 (誰が何をしているか) を表示
#   ・親 Agent に渡す sub-agent prompt の生成 (--prompt-for モード)
#
# このスクリプト自体は sub-agent を呼ばない。Claude Code 等の親が
# このスクリプトの出力を Agent ツールの prompt にして呼び出す設計。
#
# 用法:
#   bash scripts/orchestrate.sh --cycle pdca
#   bash scripts/orchestrate.sh --cycle ooda --trigger preflight
#   bash scripts/orchestrate.sh --emit team.alpha.1.scoped "issue=12"
#   bash scripts/orchestrate.sh --handoff alpha.2 beta.1 "issue=12 design done"
#   bash scripts/orchestrate.sh --status
#   bash scripts/orchestrate.sh --board --tail 50
#   bash scripts/orchestrate.sh --prompt-for alpha.1
#   bash scripts/orchestrate.sh --auto bootstrap     # 起動チェック (preflight + status + KPI + watch)
#   bash scripts/orchestrate.sh --auto pdca          # 次の PDCA コマンドを 1 つ提示
#   bash scripts/orchestrate.sh --auto ooda          # watcher → breach → 自動応答
#   bash scripts/orchestrate.sh --auto monitor 60    # 60s ループで監視
#
# 詳細: governance/13_TEAM_ORCHESTRATION.md

set -u
LANG=ja_JP.UTF-8

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── audit log の取り込み ──
# 注意: 自動の orchestrate.start は出さない (このスクリプト自体は制御面で、
#       実際のイベント記録は --emit / --handoff / --cycle で個別に行う)
[[ -f "$SCRIPT_DIR/lib/audit.sh" ]] && source "$SCRIPT_DIR/lib/audit.sh"
type audit_log >/dev/null 2>&1 || audit_log() { :; }

# ── 色 ──
if [[ -t 1 ]]; then
  C_OK="\033[1;32m"; C_W="\033[1;33m"; C_E="\033[1;31m"
  C_DIM="\033[2m"; C_BLD="\033[1m"; C_HDR="\033[1;36m"; C_RST="\033[0m"
else
  C_OK=""; C_W=""; C_E=""; C_DIM=""; C_BLD=""; C_HDR=""; C_RST=""
fi

usage() {
  sed -n '2,28p' "$0"
}

# ── サブ コマンド ──

cmd_emit() {
  local event="${1:-}"
  local details="${2:-}"
  if [[ -z "$event" ]]; then
    echo "用法: $0 --emit <event> [details]" >&2
    return 2
  fi
  audit_log "$event" "$details"
  echo -e "${C_OK}✓${C_RST} 板に記録: ${C_BLD}$event${C_RST}  details=\"$details\""
}

cmd_handoff() {
  local from="${1:-}" to="${2:-}" context="${3:-}"
  if [[ -z "$from" || -z "$to" ]]; then
    echo "用法: $0 --handoff <from-role> <to-role> [context]" >&2
    echo "例:   $0 --handoff alpha.2 beta.1 \"issue=12 design done\"" >&2
    return 2
  fi
  # チーム名を抽出 (alpha.2 → alpha)
  local from_team="${from%.*}"
  local to_team="${to%.*}"
  audit_log "handoff.${from_team}.${to_team}" "from=$from to=$to ctx=$context"
  echo -e "${C_OK}↪${C_RST} ハンドオフ: ${C_BLD}$from${C_RST} → ${C_BLD}$to${C_RST}"
  echo "    context: $context"
}

cmd_status() {
  local audit="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
  echo -e "${C_HDR}── オーケストレーション 状態 ──${C_RST}"
  echo "板 (audit.jsonl): $audit"
  if [[ ! -f "$audit" ]]; then
    echo -e "${C_DIM}(板 未作成 — 1 度も orchestrate を回していない)${C_RST}"
    return 0
  fi
  local total team_events handoffs incidents
  total=$(wc -l < "$audit")
  team_events=$(grep -cE '"event":"team\.' "$audit" 2>/dev/null) || team_events=0
  handoffs=$(grep -cE '"event":"handoff\.' "$audit" 2>/dev/null) || handoffs=0
  incidents=$(grep -cE '"event":"incident\.' "$audit" 2>/dev/null) || incidents=0
  echo "  全イベント:  $total"
  echo "  チーム活動:  $team_events"
  echo "  ハンドオフ:  $handoffs"
  echo "  インシデント: $incidents"
  echo ""
  echo -e "${C_HDR}── 直近のハンドオフ (5 件) ──${C_RST}"
  grep -E '"event":"handoff\.' "$audit" 2>/dev/null \
    | tail -5 \
    | sed -E 's/.*"ts":"([^"]+)".*"event":"([^"]+)".*"details":"([^"]+)".*/  [\1] \2  →  \3/'
  echo ""
  echo -e "${C_HDR}── 直近の チーム活動 (5 件) ──${C_RST}"
  grep -E '"event":"team\.' "$audit" 2>/dev/null \
    | tail -5 \
    | sed -E 's/.*"ts":"([^"]+)".*"event":"team\.([^"]+)".*"details":"([^"]+)".*/  [\1] team.\2  \3/'
}

cmd_board() {
  local n="${1:-50}"
  local audit="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
  if [[ ! -f "$audit" ]]; then
    echo "板 ($audit) が存在しない" >&2
    return 1
  fi
  echo -e "${C_HDR}── 板 (直近 $n 件) ──${C_RST}"
  tail -n "$n" "$audit" \
    | sed -E 's/.*"ts":"([^"]+)".*"event":"([^"]+)".*"details":"([^"]*)".*/[\1] \2  \3/'
}

cmd_cycle() {
  local cycle="${1:-}"
  local trigger="${2:-manual}"
  case "$cycle" in
    pdca)
      audit_log "pdca.cycle.start" "trigger=$trigger"
      echo -e "${C_HDR}━━ PDCA サイクル 起動 ━━${C_RST}"
      cat "$ROOT_DIR/scripts/cycles/pdca.md" 2>/dev/null \
        | head -40
      echo ""
      echo -e "${C_DIM}全文: scripts/cycles/pdca.md${C_RST}"
      echo ""
      echo -e "${C_BLD}次のステップ${C_RST}"
      echo "  1. 親エージェントが Agent ツールで α1 を起動:"
      echo "     bash scripts/orchestrate.sh --prompt-for alpha.1"
      echo "  2. α1 の出力を受けて --handoff alpha.1 alpha.2"
      echo "  3. 以下、順次"
      ;;
    ooda)
      audit_log "ooda.cycle.start" "trigger=$trigger"
      echo -e "${C_E}━━ OODA サイクル 起動 (異常事態) ━━${C_RST}"
      cat "$ROOT_DIR/scripts/cycles/ooda.md" 2>/dev/null \
        | head -40
      echo ""
      echo -e "${C_DIM}全文: scripts/cycles/ooda.md${C_RST}"
      echo ""
      echo -e "${C_BLD}緊急ステップ (60 秒)${C_RST}"
      echo "  1. 検出元と症状を 1 文で:"
      echo "     bash scripts/orchestrate.sh --emit incident.detected \"trigger=$trigger symptom=...\""
      echo "  2. 直近の板を確認:"
      echo "     bash scripts/orchestrate.sh --board --tail 50"
      echo "  3. 09_INCIDENT_PLAYBOOK の該当 シナリオを引く"
      ;;
    *)
      echo "未知のサイクル: $cycle (使えるのは pdca / ooda)" >&2
      return 2
      ;;
  esac
}

cmd_propose_response() {
  local breach="${1:-}"
  if [[ -z "$breach" ]]; then
    echo "用法: $0 --propose-response <breach-type>" >&2
    echo "" >&2
    echo "対応する breach-type:" >&2
    echo "  audit_chain_broken      INV-2/INV-10 違反: 監査ログ改竄疑い" >&2
    echo "  chat_error_storm        過去 1h で chat.error 多発" >&2
    echo "  inv12_concurrent_scope  同 issue を複数チームが同時着手" >&2
    echo "  pii_scan_stale          PII クリーン実行が古い" >&2
    return 2
  fi
  echo -e "${C_HDR}━━ OODA Decide: 推奨対応 (breach=$breach) ━━${C_RST}"
  echo ""
  case "$breach" in
    audit_chain_broken)
      cat <<EOF
  ${C_BLD}対応カテゴリ${C_RST}: 監査ログ 改竄疑い (INV-10 違反)
  ${C_BLD}IR プレイブック${C_RST}: governance/09_INCIDENT_PLAYBOOK.md (該当 シナリオなし → 即興 IR)

  ${C_BLD}60 秒で実行${C_RST}:
    1. 別端末で最新 backup を verify:
       \$ scp <other-host>:~/.claude/audit.jsonl /tmp/other.jsonl
       \$ bash scripts/audit-verify.sh /tmp/other.jsonl
    2. 改竄行を特定:
       \$ bash scripts/audit-verify.sh ~/.claude/audit.jsonl 2>&1 | grep "改竄"
    3. backup から復旧 (運用ガイド: 03_OPERATIONS.md D-4):
       \$ tar -xzf ~/.claude/audit-backups/audit.jsonl.bak.YYYYMM.tar.gz
       \$ diff ~/.claude/audit.jsonl <展開先>/audit.jsonl

  ${C_BLD}並行 アクション${C_RST}:
    α: 攻撃カタログ 08 と照合し新シナリオ候補に追加
    γ: 改竄パターンを再発防止テストに追加
    δ: 03_OPERATIONS の IR-3 を更新
EOF
      ;;
    chat_error_storm)
      cat <<EOF
  ${C_BLD}対応カテゴリ${C_RST}: クラウド AI 障害 or CORS 失効
  ${C_BLD}IR プレイブック${C_RST}: governance/09_INCIDENT_PLAYBOOK.md I-2 周辺 (機密漏れリスク監視も)

  ${C_BLD}60 秒で実行${C_RST}:
    1. ローカル専用モードに即切替 (UI 経由 or localStorage):
       v19 ダッシュボード → 設定 → ローカル専用 ON
    2. 直近の chat.error 内容を確認:
       \$ grep '"event":"chat.error"' ~/.claude/audit.jsonl | tail -5
    3. preflight で OLLAMA_ORIGINS / Anthropic / Google を確認:
       \$ bash scripts/preflight.sh

  ${C_BLD}並行 アクション${C_RST}:
    β: localOnly 自動切替を実装するか検討 (新 INV 候補)
    γ: chat.error の発火条件をテスト
    δ: ベンダー 障害 連絡 リスト (03 G 節) を確認
EOF
      ;;
    inv12_concurrent_scope)
      cat <<EOF
  ${C_BLD}対応カテゴリ${C_RST}: 重複着手 (INV-12 違反)
  ${C_BLD}IR プレイブック${C_RST}: 運用問題 (governance/13_TEAM_ORCHESTRATION §9 失敗モード)

  ${C_BLD}60 秒で実行${C_RST}:
    1. 重複 issue を特定:
       \$ grep '"event":"team\..*\.1\.scoped"' ~/.claude/audit.jsonl | tail -10
    2. 後発チームに撤退要請:
       \$ bash scripts/orchestrate.sh --emit team.<TEAM>.1.bounce "issue=<N> reason=duplicate"
    3. 先発チームに完遂を委ねる、または α1 が再分担:
       \$ bash scripts/orchestrate.sh --handoff <late> <first> "issue=<N> takeover"

  ${C_BLD}並行 アクション${C_RST}:
    α: 重複が起きた根本原因を §9 失敗モードに追加
    γ: orchestrate.sh --emit に「同 issue の team.1.scoped 重複検出」を組込
EOF
      ;;
    pii_scan_stale)
      cat <<EOF
  ${C_BLD}対応カテゴリ${C_RST}: PII セカンドラインの 鮮度低下 (INV-6 関連)
  ${C_BLD}IR プレイブック${C_RST}: governance/09_INCIDENT_PLAYBOOK.md I-1 (シークレット コミット) 周辺

  ${C_BLD}60 秒で実行${C_RST}:
    1. 即時 PII スキャン (作業 ディレクトリ全体):
       \$ bash scripts/pii-scan.sh --diff
    2. ステージ 済の差分も:
       \$ bash scripts/pii-scan.sh --staged
    3. (gitleaks があれば二次防御):
       \$ gitleaks detect --no-banner --redact

  ${C_BLD}並行 アクション${C_RST}:
    β: 自動 PII スキャンを daily routine (storage-orchestrator) に組込
    δ: 03 ルーティン に「日次 PII スキャン」を追加
EOF
      ;;
    *)
      echo "  未対応の breach-type: $breach" >&2
      echo "  対応する breach-type は --help で確認" >&2
      return 1
      ;;
  esac
  echo ""
  audit_log "orchestrate.propose_response" "breach=$breach"
}

cmd_auto() {
  local mode="${1:-bootstrap}"
  case "$mode" in
    bootstrap) auto_bootstrap ;;
    pdca)      auto_pdca ;;
    ooda)      auto_ooda ;;
    monitor)   auto_monitor "${2:-60}" ;;
    *)
      echo "用法: $0 --auto <mode> [interval]" >&2
      echo "  mode: bootstrap | pdca | ooda | monitor" >&2
      return 2
      ;;
  esac
}

# ── 起動時 標準シーケンス: preflight + status + KPI + watcher ──
auto_bootstrap() {
  echo -e "${C_HDR}━━ 自動モード: bootstrap ━━${C_RST}"
  echo "  実行内容: preflight (FAST) → orchestrate status → KPI → watcher (once)"
  echo ""
  echo -e "${C_BLD}── (1/4) preflight (FAST) ──${C_RST}"
  PREFLIGHT_FAST=1 bash "$ROOT_DIR/scripts/preflight.sh" 2>&1 | tail -8
  echo ""
  echo -e "${C_BLD}── (2/4) orchestrate status ──${C_RST}"
  cmd_status 2>&1 | head -20
  echo ""
  echo -e "${C_BLD}── (3/4) KPI ──${C_RST}"
  ORCHESTRATE_KPI_NO_GAMMA=1 bash "$ROOT_DIR/scripts/orchestrate-kpi.sh" 2>&1 | head -10
  echo ""
  echo -e "${C_BLD}── (4/4) watcher (once) ──${C_RST}"
  bash "$ROOT_DIR/scripts/orchestrate-watch.sh" --once 2>&1 | tail -10
  echo ""
  echo -e "${C_HDR}━━ bootstrap 完了 ━━${C_RST}"
  audit_log "orchestrate.auto.bootstrap" ""
}

# ── PDCA 自動: 次の手 を 1 つ提示 ──
auto_pdca() {
  echo -e "${C_HDR}━━ 自動モード: PDCA 次の手 ━━${C_RST}"
  echo ""
  local audit="${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}"
  local design="$ROOT_DIR/governance/12_SYSTEM_DESIGN.md"

  # 1. §10 から最高優先 未着手 課題を取得
  local issue
  issue=$(python3 - "$design" <<'PY' 2>/dev/null
import sys, re
with open(sys.argv[1], encoding='utf-8') as f: text = f.read()
m = re.search(r'^## 10\..*?\n(.*?)(?=\n^## \d|\Z)', text, flags=re.S | re.M)
if not m: sys.exit(0)
section = m.group(1)
rows = re.findall(r'^\| (\d+) \| (高|中|低) \| (.*?) \| (.*?) \| (.*?) \|$', section, flags=re.M)
unresolved = [r for r in rows if '実装済' not in r[4] and '対応済' not in r[4]]
if not unresolved: sys.exit(0)
order = {'高': 0, '中': 1, '低': 2}
unresolved.sort(key=lambda r: order.get(r[1], 9))
n, prio, issue_t, plan, status = unresolved[0]
print(f"{n}\t{prio}\t{issue_t[:80]}")
PY
)

  if [[ -z "$issue" ]]; then
    echo -e "  ${C_OK}✅ §10 全課題 実装済${C_RST}"
    echo ""
    echo "  α1 は新たな歪みの発見モードに入るべきです。"
    echo "  推奨アクション:"
    echo "    bash scripts/orchestrate.sh --auto bootstrap   # 起動チェック で 異常 発見"
    echo "    bash scripts/orchestrate-kpi.sh                # KPI で 改善余地 確認"
    echo "    bash scripts/orchestrate-watch.sh --once       # watcher で 健康診断"
    audit_log "orchestrate.auto.pdca" "result=all_resolved"
    return 0
  fi

  local n prio title
  n=$(echo "$issue" | cut -f1)
  prio=$(echo "$issue" | cut -f2)
  title=$(echo "$issue" | cut -f3)

  echo -e "  ${C_BLD}最高優先 未着手 課題${C_RST}: #$n [${prio}] $title"
  echo ""

  # 2. 板で進行中の sub-cycle 状態を判定 (この issue の team.*.N.* の最終)
  local last_event=""
  if [[ -f "$audit" ]]; then
    last_event=$(grep "issue=$n" "$audit" 2>/dev/null \
                 | grep -oE '"event":"team\.[^"]+"' \
                 | tail -1 \
                 | sed 's/"event":"//;s/"$//')
  fi

  # 3. 次の手を提示
  echo -e "  ${C_BLD}次の手${C_RST}:"
  if [[ -z "$last_event" ]]; then
    echo "    bash scripts/orchestrate.sh --emit team.alpha.1.scoped \"issue=$n priority=$prio title=...\""
    echo "    bash scripts/orchestrate.sh --handoff alpha.1 alpha.2 \"issue=$n design needed\""
  else
    case "$last_event" in
      team.alpha.1.scoped)
        echo "    (alpha.1 完了) → α2 設計 へ"
        echo "    bash scripts/orchestrate.sh --emit team.alpha.2.designed \"issue=$n design summary\"" ;;
      team.alpha.2.designed)
        echo "    (alpha.2 完了) → α3 文書化 (governance/12 §10 の状態 更新) へ"
        echo "    bash scripts/orchestrate.sh --emit team.alpha.3.documented \"issue=$n\"" ;;
      team.alpha.3.documented|team.beta.1.scoped)
        echo "    (α 完了 → β 実装段階) コードを書いてください、終わったら:"
        echo "    bash scripts/orchestrate.sh --emit team.beta.3.implemented \"issue=$n files=...\"" ;;
      team.beta.3.implemented)
        echo "    (β 完了 → γ テスト段階) tests/ に追加してください、終わったら:"
        echo "    bash scripts/orchestrate.sh --emit team.gamma.3.implemented \"issue=$n N tests\""
        echo "    bash tests/smoke-test.sh   # 全合格 を確認" ;;
      team.gamma.3.implemented)
        echo "    (γ 完了 → 査読段階)"
        echo "    bash scripts/audit-verify.sh && bash scripts/orchestrate-kpi.sh --check"
        echo "    bash scripts/orchestrate.sh --emit team.gamma.4.passed \"issue=$n reviews=...\""
        echo "    bash scripts/orchestrate.sh --emit team.alpha.4.passed \"issue=$n INV consistent\"" ;;
      team.gamma.4.passed|team.alpha.4.passed)
        echo "    (査読 完了 → Act commit + push)"
        echo "    git add -A && git commit -m \"design: ... v=N\""
        echo "    bash scripts/orchestrate.sh --emit pdca.cycle.complete \"issue=$n v=N\"" ;;
      *)
        echo "    最後のイベント: $last_event (cycles/pdca.md 参照)" ;;
    esac
  fi
  echo ""
  echo -e "  ${C_DIM}詳細: scripts/cycles/pdca.md${C_RST}"
  audit_log "orchestrate.auto.pdca" "issue=$n last=$last_event"
}

# ── OODA 自動: watcher → breach → propose-response ──
auto_ooda() {
  echo -e "${C_HDR}━━ 自動モード: OODA ━━${C_RST}"
  echo ""
  echo "  watcher --once 実行中..."
  local out rc
  out=$(bash "$ROOT_DIR/scripts/orchestrate-watch.sh" --once 2>&1)
  rc=$?
  echo "$out" | tail -10
  if [[ "$rc" -eq 0 ]]; then
    echo ""
    echo -e "  ${C_OK}✅ 異常なし${C_RST}"
    audit_log "orchestrate.auto.ooda" "result=healthy"
    return 0
  fi
  # breach 検出 → 各 breach タイプに対し propose-response
  local breaches
  breaches=$(echo "$out" | grep -oE 'BREACH:[a-z_0-9]+' | cut -d: -f2 | sort -u)
  echo ""
  echo -e "  ${C_E}━━ 自動応答: 各 breach の対応案 ━━${C_RST}"
  for b in $breaches; do
    echo ""
    cmd_propose_response "$b" 2>&1 | tail -20
  done
  audit_log "orchestrate.auto.ooda" "result=breach count=$(echo "$breaches" | wc -w | tr -d ' ')"
  return 1
}

# ── monitor: --loop 60s ラッパー、breach 時に propose-response ──
auto_monitor() {
  local interval="${1:-60}"
  echo -e "${C_HDR}━━ 自動モード: monitor (${interval}s ごと) ━━${C_RST}"
  echo "  Ctrl-C で停止。breach 検出時 は 自動応答 を表示します。"
  trap 'audit_log "orchestrate.auto.monitor.stopped" ""; exit 0' INT TERM
  while true; do
    auto_ooda || true
    echo ""
    echo -e "${C_DIM}次回まで ${interval} 秒...${C_RST}"
    sleep "$interval"
  done
}

cmd_prompt_for() {
  local role="${1:-}"
  if [[ -z "$role" ]]; then
    echo "用法: $0 --prompt-for <team>.<N>" >&2
    echo "例:   $0 --prompt-for alpha.1" >&2
    return 2
  fi
  local team="${role%.*}"
  local rolenum="${role#*.}"
  local team_file="$ROOT_DIR/scripts/teams/${team}.md"
  if [[ ! -f "$team_file" ]]; then
    echo "チーム ファイルがない: $team_file" >&2
    return 1
  fi
  # チーム ブリーフ から該当 役 のセクションを抽出
  local upper_role
  case "$team" in
    alpha) upper_role="α$rolenum" ;;
    beta)  upper_role="β$rolenum" ;;
    gamma) upper_role="γ$rolenum" ;;
    delta) upper_role="δ$rolenum" ;;
    *)     echo "未知のチーム: $team" >&2; return 1 ;;
  esac
  echo "# Sub-agent prompt: $upper_role"
  echo ""
  echo "## 全チーム ブリーフ"
  echo ""
  cat "$team_file"
  echo ""
  echo "## 現在の板 (直近 20 件)"
  echo ""
  echo "\`\`\`"
  tail -20 "${AUDIT_LOG_PATH:-${HOME}/.claude/audit.jsonl}" 2>/dev/null \
    | sed -E 's/.*"ts":"([^"]+)".*"event":"([^"]+)".*"details":"([^"]*)".*/[\1] \2  \3/' \
    || echo "(板 空)"
  echo "\`\`\`"
  echo ""
  # α1 (Strategist) には §10 Open Issues も埋め込む (live context)
  if [[ "$role" == "alpha.1" ]]; then
    local design_doc="$ROOT_DIR/governance/12_SYSTEM_DESIGN.md"
    if [[ -f "$design_doc" ]]; then
      echo "## governance/12 §10 Open Issues (現状)"
      echo ""
      echo "**未着手** または検討中の課題のみ抽出 (実装済は省略):"
      echo ""
      python3 - "$design_doc" <<'PY' 2>/dev/null || echo "(§10 解析失敗)"
import sys, re
with open(sys.argv[1], encoding='utf-8') as f:
    text = f.read()
# §10 セクション抽出
m = re.search(r'^## 10\. .*?\n(.*?)(?=\n^## \d|\Z)', text, flags=re.S | re.M)
if not m:
    sys.exit()
section = m.group(1)
# テーブル行: | N | 重要度 | 課題 | 対策案 | 状態 |
rows = re.findall(r'^\| (\d+) \| (高|中|低) \| (.*?) \| (.*?) \| (.*?) \|$', section, flags=re.M)
unresolved = [r for r in rows if '実装済' not in r[4] and '対応済' not in r[4]]
print(f"未着手: {len(unresolved)} 件 / 全 {len(rows)} 件\n")
for n, prio, issue, plan, status in unresolved:
    print(f"- **#{n}** [{prio}] {issue[:80]}")
    print(f"  対策案: {plan[:100]}")
    print(f"  状態: {status}")
if not unresolved:
    print("(全課題 実装済 — α1 は新たな歪みの発見モードに入るべき)")
PY
      echo ""
    fi
  fi
  echo "## あなたの役: $upper_role"
  echo ""
  echo "上記ブリーフから ${upper_role} のセクションだけを実行してください。終わったら:"
  echo ""
  echo "\`\`\`bash"
  echo "bash scripts/orchestrate.sh --emit team.${team}.${rolenum}.<verb> \"<details>\""
  echo "\`\`\`"
  echo ""
  echo "次の役へ:"
  echo ""
  echo "\`\`\`bash"
  case "$rolenum" in
    1) echo "bash scripts/orchestrate.sh --handoff ${team}.1 ${team}.2 \"<context>\"" ;;
    2) echo "bash scripts/orchestrate.sh --handoff ${team}.2 ${team}.3 \"<context>\"" ;;
    3) echo "bash scripts/orchestrate.sh --handoff ${team}.3 ${team}.4 \"<context>\"" ;;
    4) echo "# 査読 OK なら別チーム(γ など)に handoff、ブロックなら ${team}.3 に差戻し" ;;
  esac
  echo "\`\`\`"
}

# ── 引数 解析 ──
if [[ $# -eq 0 ]]; then
  usage
  exit 0
fi

case "${1:-}" in
  -h|--help)
    usage; exit 0 ;;
  --emit)
    shift; cmd_emit "$@" ;;
  --handoff)
    shift; cmd_handoff "$@" ;;
  --status)
    cmd_status ;;
  --board)
    shift
    n=50
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --tail) n="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    cmd_board "$n"
    ;;
  --cycle)
    shift
    cycle="$1"; shift || true
    trigger="manual"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --trigger) trigger="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    cmd_cycle "$cycle" "$trigger"
    ;;
  --prompt-for)
    shift; cmd_prompt_for "$@" ;;
  --propose-response)
    shift; cmd_propose_response "$@" ;;
  --auto)
    shift; cmd_auto "$@" ;;
  *)
    echo "未知のコマンド: $1" >&2
    usage
    exit 2
    ;;
esac
