#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  nasaq-monitoring — install.sh
#  تثبيت كامل على Ubuntu/Debian: Docker + الستاك + Node Exporter.
#  الاستخدام:  sudo bash install.sh
#  (يمكن تشغيله أكثر من مرة بأمان — idempotent)
# ════════════════════════════════════════════════════════════════
set -euo pipefail

# ───────── الألوان ─────────
C_OK="\033[1;32m"; C_INFO="\033[1;34m"; C_WARN="\033[1;33m"; C_ERR="\033[1;31m"; C_RST="\033[0m"
info() { echo -e "${C_INFO}[INFO]${C_RST} $*"; }
ok()   { echo -e "${C_OK}[ OK ]${C_RST} $*"; }
warn() { echo -e "${C_WARN}[WARN]${C_RST} $*"; }
err()  { echo -e "${C_ERR}[FAIL]${C_RST} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NODE_EXPORTER_VERSION="${NODE_EXPORTER_VERSION:-1.8.2}"

# ───────── 1) صلاحيات + نظام التشغيل ─────────
[ "$(id -u)" -eq 0 ] || err "لازم تشغّل السكربت بـ root:  sudo bash install.sh"

if [ -f /etc/os-release ]; then
  . /etc/os-release
else
  err "مش قادر أقرأ /etc/os-release — النظام غير مدعوم"
fi
case "${ID:-}" in
  ubuntu|debian) ok "النظام: ${PRETTY_NAME:-$ID}" ;;
  *) warn "النظام (${ID:-unknown}) مش Ubuntu/Debian — هكمّل على مسؤوليتك"; ;;
esac

# ───────── 2) Docker + Compose ─────────
if ! command -v docker >/dev/null 2>&1; then
  info "تثبيت Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "تم تثبيت Docker"
else
  ok "Docker موجود مسبقاً"
fi
docker compose version >/dev/null 2>&1 || err "docker compose plugin غير متوفر — حدّث Docker"
systemctl is-active --quiet docker || systemctl start docker

# ───────── 3) journald persistent (لـ Promtail) ─────────
if [ ! -d /var/log/journal ]; then
  info "تفعيل journald persistent (مطلوب لسحب لوجات النظام)..."
  mkdir -p /var/log/journal
  systemd-tmpfiles --create --prefix /var/log/journal >/dev/null 2>&1 || true
  systemctl restart systemd-journald || true
  ok "journald persistent مُفعّل"
else
  ok "journald persistent موجود"
fi

# ───────── 4) توليد .env ─────────
if [ -f .env ]; then
  ok "ملف .env موجود — هستخدمه زي ما هو (لو محتاج تعديل، حرّره ثم أعد التشغيل)"
else
  info "أول تشغيل — توليد .env"
  GEN_GF_PW="$(openssl rand -hex 16)"
  GEN_TM_TOKEN="$(openssl rand -hex 24)"

  echo
  echo "────────── إعداد تنبيهات Telegram (اختياري) ──────────"
  echo "  لإنشاء بوت:  كلّم @BotFather على تيليجرام ← /newbot"
  echo "  لمعرفة chat_id: كلّم @userinfobot"
  echo "  (اتركه فاضي لو مش عايز تنبيهات دلوقتي — تقدر تضيفها لاحقاً في .env)"
  read -rp "  Telegram Bot Token : " TG_TOKEN || true
  read -rp "  Telegram Chat ID   : " TG_CHAT  || true
  echo

  cat > .env <<EOF
# ولّده install.sh — عدّل بحرص
TZ=Africa/Cairo
DATA_DIR=./data

GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=${GEN_GF_PW}
GF_INSTALL_PLUGINS=volkovlabs-forms-panel
GRAFANA_PUBLIC_URL=http://localhost:3000

PROMETHEUS_RETENTION=15d

TELEGRAM_BOT_TOKEN=${TG_TOKEN}
TELEGRAM_CHAT_ID=${TG_CHAT}

TARGETS_MANAGER_TOKEN=${GEN_TM_TOKEN}

GRAFANA_BIND=127.0.0.1
GRAFANA_PORT=3000
PROMETHEUS_PORT=9090
ALERTMANAGER_PORT=9093
TARGETS_MANAGER_PORT=8081
EOF
  chmod 600 .env
  ok "تم إنشاء .env (صلاحيات 600)"
fi

# ───────── 5) مجلدات الداتا + الصلاحيات ─────────
info "تجهيز مجلدات الداتا والصلاحيات..."
mkdir -p data/prometheus data/grafana data/loki data/alertmanager \
         data/promtail-positions data/targets-state prometheus/targets
# Prometheus (nobody=65534) · Grafana (472) · Loki (10001) · Alertmanager (65534)
chown -R 65534:65534 data/prometheus
chown -R 472:472       data/grafana
chown -R 10001:10001   data/loki
chown -R 65534:65534   data/alertmanager
# targets-manager (node user = 1000): كتابة services.json والـ state
chown -R 1000:1000     prometheus/targets data/targets-state
ok "المجلدات جاهزة"

# ───────── 6) Node Exporter (native) ─────────
info "تثبيت Node Exporter (native + systemd)..."
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  armv7l) ARCH=armv7 ;;
  *) err "معمارية غير مدعومة: $(uname -m)" ;;
esac
NE_TGZ="node_exporter-${NODE_EXPORTER_VERSION}.linux-${ARCH}.tar.gz"
NE_URL="https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/${NE_TGZ}"
TMP_NE="$(mktemp -d)"
curl -fsSL -o "${TMP_NE}/${NE_TGZ}" "$NE_URL" || err "فشل تحميل Node Exporter"
tar -xzf "${TMP_NE}/${NE_TGZ}" -C "$TMP_NE"
install -m 0755 "${TMP_NE}/node_exporter-${NODE_EXPORTER_VERSION}.linux-${ARCH}/node_exporter" /usr/local/bin/node_exporter
rm -rf "$TMP_NE"

cat > /etc/systemd/system/node_exporter.service <<'EOF'
[Unit]
Description=Node Exporter (nasaq-monitoring)
Documentation=https://github.com/prometheus/node_exporter
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter \
  --collector.systemd \
  --collector.processes \
  --web.listen-address=:9100
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now node_exporter
systemctl restart node_exporter
sleep 2
if systemctl is-active --quiet node_exporter; then
  ok "Node Exporter شغّال على 0.0.0.0:9100"
else
  warn "Node Exporter مش شغّال صح — راجع: journalctl -u node_exporter -n 30"
fi

# ───────── 7) تشغيل الستاك ─────────
info "تشغيل الحاويات (docker compose up -d)..."
docker compose up -d
# أول تشغيل: تثبيت الـ plugin يسبق الإقلاع → restart أمان لـ Grafana
docker compose restart grafana >/dev/null
ok "الستاك شغّال"

# ───────── 8) ملخّص الوصول ─────────
GF_PW="$(grep '^GF_SECURITY_ADMIN_PASSWORD=' .env | cut -d= -f2-)"
IP_PUB="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  ✅  nasaq-monitoring اتثبّت بنجاح                                 ║
╚══════════════════════════════════════════════════════════════════╝

🔐 الوصول آمن عبر SSH Tunnel (شغّله من جهازك، مش على السيرفر):

    ssh -L 3000:localhost:3000 -L 8081:localhost:8081 -L 9090:localhost:9090 \\
        -L 9093:localhost:9093 -L 9100:localhost:9100  root@${IP_PUB:-SERVER_IP}

  ثم افتح:
    • Grafana (اللوحة)        → http://localhost:3000
    • إدارة الخدمات            → http://localhost:8081

  بيانات دخول Grafana:
    المستخدم  : admin
    كلمة السر : ${GF_PW}

  (المنافذ الأخرى للـ debug فقط: Prometheus 9090 · Alertmanager 9093 · Node Exporter 9100)

📌 خطوات مهمة بعد كده:
  1. ضيف مواقعك/خدماتك من صفحة الإدارة (http://localhost:8081)
     أو من لوحة "05 · الخدمات والمواقع" جوّه Grafana.
  2. لو حبيت تنبيهات Telegram، ضيف التوكن في .env ثم: docker compose up -d --force-recreate alertmanager
  3. لو الأقراص على mount مختلف أو الـ Telegram مش شغّال، راجع README.md.

🔒 نصيحة أمنية: المنافذ مربوطة على 127.0.0.1 — متفتحهاش على الإنترنت مباشرة.
EOF
