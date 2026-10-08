# 🚀 دليل النشر على الـ VPS (آخر خطوة)

هذا الدليل هو **الجزء الوحيد اللي بيتنفّذ على السيرفر الفعلي** — كل حاجة تانية اتكتبت واتحقّقت محلياً.

---

## 0) قبل ما تبدأ — المتطلبات

| البند | المطلوب |
|---|---|
| نظام التشغيل | Ubuntu 22.04+ أو Debian 12+ (amd64/arm64) |
| صلاحية | **root** (أو sudo) |
| RAM | 1 GB كحد أدنى (2 GB مُريح) |
| مساحة | 20 GB+ (البيانات محفوظة 14-15 يوم) |
| منفذ SSH | 22 مفتوح |

> **ملاحظة أمنية:** كل واجهات النظام مربوطة على `127.0.0.1` — مش محتاج تفتح أي منفذ تاني على الجدار الناري (غير SSH).

---

## 1) ارفع الكود على السيرفر

### الطريقة الأولى: Git
```bash
ssh root@SERVER_IP
git clone <repo-url> /opt/nasaq-monitoring
cd /opt/nasaq-monitoring
```

### الطريقة الثانية: بدون Git (SCP من جهازك)
```bash
# من جهازك المحلي
scp -r ./nasaq-monitoring root@SERVER_IP:/opt/nasaq-monitoring
# ثم على السيرفر
ssh root@SERVER_IP
cd /opt/nasaq-monitoring
```

---

## 2) شغّل التثبيت

```bash
sudo bash install.sh
```

- هيسألك عن **Telegram Bot Token** و **Chat ID** (اختياري — ممكن تخطيه وإضافته لاحقاً).
- هيطبعلك في الآخر: **باسورد Grafana** + أمر SSH Tunnel.

> شغّله تاني في أي وقت بأمان (idempotent).

---

## 3) افتح اللوحة (SSH Tunnel)

من **جهازك** (مش على السيرفر)، افتح نفق SSH:

```bash
ssh -L 3000:localhost:3000 -L 8081:localhost:8081 \
    -L 9090:localhost:9090 -L 9093:localhost:9093 \
    root@SERVER_IP
```

اسيبه شغّال، وافتح في المتصفح:
- **Grafana:** http://localhost:3000
- **إدارة الخدمات:** http://localhost:8081

**بيانات الدخول:** `admin` + الباسورد اللي طبعه السكربت (موجود في `.env`).

> 💡 لعمل نفق دائم في الخلفية: استخدم `-N -f` أو أضف الإعداد في `~/.ssh/config`.

---

## 4) أول تهيئة

1. **بدّل باسورد Grafana** (اختياري): من `localhost:3000` → Administration → Users، أو عدّل `GF_SECURITY_ADMIN_PASSWORD` في `.env` ثم `docker compose up -d grafana`.
2. **ضيف مواقعك/خدماتك:**
   - من صفحة الإدارة `http://localhost:8081` (الأسهل)، أو
   - من لوحة **05 · الخدمات والمواقع** جوّه Grafana.
3. **اختبر التنبيهات:** أوقف خدمة مؤقتاً أو استخدم `ALERTS` في لوحة النظرة العامة.

---

## 5) ✅ قائمة تحقق التسليم (VPS verification)

شغّلها بالترتيب على السيرفر. كل سطر لازم يطلع النتيجة المتوقعة:

```bash
cd /opt/nasaq-monitoring

# 1. كل الخدمات شغّالة
docker compose ps
#   المتوقع: prometheus/grafana/loki/... Up · targets-manager Up (healthy)

# 2. Node Exporter (native)
systemctl status node_exporter --no-pager
curl -s http://localhost:9100/metrics | head -1
#   المتوقع: active (running) + أسطر metrics

# 3. Prometheus جاهز + الـ targets
curl -s http://localhost:9090/-/ready
curl -s http://localhost:9090/api/v1/targets?state=active | grep -o '"health":"[a-z]*"' | sort | uniq -c
#   المتوقع: Prometheus Server is Ready. + أغلب targets "up"

# 4. القواعد محمّلة (18 قاعدة)
curl -s http://localhost:9090/api/v1/rules | grep -o '"name":"[a-z]*",' | head
#   جروبات: host, disk, services, containers

# 5. targets-manager
curl -s http://localhost:8081/api/health
#   المتوقع: {"ok":true,...}

# 6. إضافة/حذف خدمة (اختبار E2E)
TOKEN=$(grep '^TARGETS_MANAGER_TOKEN=' .env | cut -d= -f2-)
curl -s -X POST http://localhost:8081/api/targets \
  -H "content-type: application/json" -H "authorization: Bearer $TOKEN" \
  -d '{"target":"https://example.com","service":"smoke-test","module":"http_2xx"}'
#   المتوقع: {"ok":true,"id":"..."}
#   انزل الصفحة تاني بعد ثواني وتأكد إن الخدمة ظهرت في Prometheus ثم احذفها.
```

### اختبار تنبيه Telegram (الأهم)
```bash
# ابعث تنبيه تجريبي مباشرة لـ Alertmanager
curl -s -X POST http://localhost:9093/api/v2/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"SmokeTest","severity":"critical","service":"test","instance":"vps"},"annotations":{"summary":"اختبار تنبيه","description":"لو وصلتك الرسالة، التنبيهات شغّالة"}}]'
```
- ✅ **المتوقع: توصلك رسالة على تيليجرام.**
- لو مفيش: راجع التوكن في `.env` ثم `docker compose up -d --force-recreate alertmanager` وشوف `docker compose logs alertmanager`.

---

## 6) الصيانة والنسخ الاحتياطي

```bash
# تحديث الصور
docker compose pull && docker compose up -d

# نسخة احتياطية سريعة (خدماتك + الإعدادات)
tar czf nasaq-backup-$(date +%F).tar.gz .env prometheus/targets/services.json data/targets-state
```

**للاحتفاظ بالبيانات:** Prometheus 15 يوم · Loki 14 يوم (في `prometheus/prometheus.yml` و `loki/loki-config.yml`).

---

## 7) أهمية اختيارية: دومين + HTTPS

لو محتاج توصل من غير SSH Tunnel، حط **Nginx** كـ reverse proxy أمام Grafana:
- اسم نطاق + شهادة Let's Encrypt (`certbot`).
- Basic Auth إضافي أو SSO.
- **لا** تعرّض Prometheus/Alertmanager/Node Exporter للإنترنت إطلاقاً.

---

## 8) استكشاف الأخطاء السريع

| المشكلة | الحل |
|---|---|
| `install.sh` فشل في تثبيت Docker | تأكد من اتصال الإنترنت + أعد التشغيل |
| Grafana "Restarting" | شوف `docker compose logs grafana` — غالباً صلاحيات: `sudo bash install.sh` تاني |
| Alertmanager واقع | لو تيليجرام فاضي، النظام المفروض يشتغل عادي (فيه fallback)؛ لو لسه واقع: `docker compose logs alertmanager` |
| مفيش لوجات في Loki | تأكد `/var/log/journal` موجود + `docker compose logs promtail` |
| خدماتي مش بتظهر | `curl http://localhost:8081/api/targets` + تأكد Prometheus حملها خلال 30 ث |

---

## 9) إلغاء التثبيت

```bash
sudo bash uninstall.sh          # إزالة الحاويات (الداتا تفضل)
sudo bash uninstall.sh --purge  # إزالة كاملة (بيانات + Node Exporter + .env)
```
