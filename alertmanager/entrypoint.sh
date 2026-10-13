#!/bin/sh
# ════════════════════════════════════════════════════════════════
#  nasaq-monitoring — Alertmanager entrypoint
#  يولّد ملف الإعداد الحي من القالب مع حقن بيانات التيليجرام، ثم
#  يراقب ملف التجاوز (/etc/nasaq-state/telegram.env) الذي تكتبه
#  صفحة الإدارة — أي تغيير يُعاد تطبيقه تلقائياً (SIGHUP) خلال ~10 ثوانٍ.
#  أولوية القيم: ملف التجاوز (الصفحة) ← متغيرات البيئة (.env).
# ════════════════════════════════════════════════════════════════
OVR="/etc/nasaq-state/telegram.env"
TMPL="/etc/alertmanager/alertmanager.yml"
LIVE="/alertmanager/alertmanager-live.yml"

ENV_TOK="${TELEGRAM_BOT_TOKEN:-disabled}"
ENV_CHAT="${TELEGRAM_CHAT_ID:-1}"

log() { echo "[entrypoint] $*"; }

gen() {
  unset TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
  if [ -f "$OVR" ]; then
    # shellcheck disable=SC1090
    . "$OVR"
  fi
  _tok="${TELEGRAM_BOT_TOKEN:-$ENV_TOK}"
  _chat="${TELEGRAM_CHAT_ID:-$ENV_CHAT}"
  unset TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID
  sed -e "s|__TELEGRAM_BOT_TOKEN__|${_tok}|g" \
      -e "s|__TELEGRAM_CHAT_ID__|${_chat}|g" \
      "$TMPL" > "$LIVE.tmp" && mv "$LIVE.tmp" "$LIVE"
}

gen || { log "initial config generation failed"; exit 1; }
log "live config generated"

# single quotes on purpose: $AM_PID must expand when the signal arrives
trap 'kill -TERM $AM_PID 2>/dev/null' TERM INT
/bin/alertmanager --config.file="$LIVE" --storage.path=/alertmanager &
AM_PID=$!

last=""
if [ -f "$OVR" ]; then
  last=$(cat "$OVR" 2>/dev/null || true)
fi
while kill -0 "$AM_PID" 2>/dev/null; do
  sleep 10
  cur=""
  if [ -f "$OVR" ]; then
    cur=$(cat "$OVR" 2>/dev/null || true)
  fi
  if [ "$cur" != "$last" ]; then
    log "telegram override changed — regenerating live config"
    if gen; then
      kill -HUP "$AM_PID" && log "alertmanager reloaded"
    else
      log "regeneration failed — keeping previous config"
    fi
    last="$cur"
  fi
done
wait "$AM_PID"
