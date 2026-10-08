#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  nasaq-monitoring — uninstall.sh
#  إيقاف/إزالة الستاك. مع --purge يحذف الداتا و Node Exporter كمان.
#  الاستخدام:
#    sudo bash uninstall.sh          # إزالة الحاويات فقط (الداتا تفضل)
#    sudo bash uninstall.sh --purge  # إزالة كاملة (بيانات + Node Exporter + .env)
# ════════════════════════════════════════════════════════════════
set -euo pipefail

C_OK="\033[1;32m"; C_INFO="\033[1;34m"; C_WARN="\033[1;33m"; C_RST="\033[0m"
info() { echo -e "${C_INFO}[INFO]${C_RST} $*"; }
ok()   { echo -e "${C_OK}[ OK ]${C_RST} $*"; }
warn() { echo -e "${C_WARN}[WARN]${C_RST} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PURGE=0
[ "${1:-}" = "--purge" ] && PURGE=1

[ "$(id -u)" -eq 0 ] || { echo "لازم root: sudo bash uninstall.sh"; exit 1; }

# ───────── إيقاف وإزالة الحاويات ─────────
if [ -f .env ]; then
  info "إيقاف الحاويات..."
  docker compose down --remove-orphans || warn "تعذّر down — أكمل يدوياً"
  ok "الحاويات اتشالت"
else
  warn "مفيش .env — تخطّي compose down"
fi

if [ "$PURGE" -eq 1 ]; then
  echo
  warn "⚠️  --purge هيمسح: data/ بالكامل + services.json + .env + Node Exporter"
  read -rp "متأكد؟ اكتب yes للتأكيد: " CONFIRM || true
  if [ "$CONFIRM" != "yes" ]; then
    ok "تم الإلغاء — لم يُحذف شيء"
    exit 0
  fi

  info "حذف الداتا..."
  rm -rf data
  rm -f prometheus/targets/services.json
  rm -rf prometheus/targets/backups
  echo "[]" > prometheus/targets/services.json || true
  rm -f .env
  ok "الداتا و .env اتمسحوا"

  info "إزالة Node Exporter..."
  systemctl disable --now node_exporter 2>/dev/null || true
  rm -f /etc/systemd/system/node_exporter.service
  systemctl daemon-reload || true
  rm -f /usr/local/bin/node_exporter
  ok "Node Exporter اتشال"
else
  echo
  info "ملاحظة: الداتا في ./data اتسابت زي ما هي. للإزالة الكاملة: sudo bash uninstall.sh --purge"
fi

ok "تم."
