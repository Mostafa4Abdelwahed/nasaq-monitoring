# 🖥️ nasaq-monitoring

نظام مراقبة VPS كامل على سيرفر واحد (Ubuntu/Debian) — **مقاييس + لوجات + تنبيهات Telegram + إدارة الخدمات من اللوحة**.
الهدف: لو حصلت مشكلة في أي حاجة على السيرفر، تعرف مكانها فوراً بدون تضييع وقت.

---

## ✨ المميزات

- **مقاييس حية:** المعالج، الذاكرة، الأقراص، الشبكة، Load، inodes.
- **لوجات موحّدة:** نظام (journald) + ملفات `/var/log` + حاويات Docker — قابلة للبحث والفلترة.
- **تنبيهات ذكية:** 18 قاعدة تنبيه → تيليجرام، كل تنبيه فيه السبب + المكان + رابط مباشر للوحة.
- **فحص الخدمات والمواقع:** HTTP/TCP/ICMP + كشف انتهاء شهادات SSL.
- **إدارة الخدمات من الداشبورد:** إضافة/تعطيل/حذف المواقع المراقَبة من داخل Grafana أو من صفحة إدارة خفيفة — بدون restart.
- **بيانات واضحة لتحديد المكان:** 6 لوحات منظّمة حسب نوع المشكلة.

---

## 🏗️ المعمارية

```
Node Exporter (native على الهوست) ─┐
cAdvisor (حاويات) ─────────────────┤
Blackbox Exporter (خدمات/مواقع) ───┼─► Prometheus ─► Alertmanager ─► Telegram
Promtail (لوجات) ─► Loki ──────────┘        │
                                            ▼
                                         Grafana (اللوحات) ◄─ targets-manager
```

| المكوّن | الوظيفة | المنفذ |
|---|---|---|
| Node Exporter | مقاييس النظام (native) | 9100 |
| cAdvisor | مقاييس الحاويات | داخلي |
| Blackbox Exporter | فحص الخدمات/المواقع | داخلي |
| Prometheus | التخزين + قواعد التنبيه | 9090 |
| Alertmanager | توجيه التنبيهات → Telegram | 9093 |
| Grafana | اللوحات | 3000 |
| Loki + Promtail | تجميع اللوجات | داخلي |
| targets-manager | إدارة الخدمات (API + صفحة) | 8081 |

> كل المنافذ مربوطة على `127.0.0.1` — الوصول عبر SSH Tunnel فقط.

---

## 📦 المتطلبات

- VPS على **Ubuntu 22.04+** أو **Debian 12+** (amd64/arm64).
- صلاحية **root** (أو sudo).
- اتصال إنترنت (لتحميل صور Docker و Node Exporter).
- مساحة تخزين معقولة (البيانات محفوظة 14-15 يوم).

---

## 🚀 التثبيت

```bash
git clone <repo-url> nasaq-monitoring
cd nasaq-monitoring
sudo bash install.sh
```

السكربت بيعمل كل حاجة:
1. يتأكد من النظام والصلاحيات.
2. يثبّت Docker + Compose لو مش موجودين.
3. يفعّل journald persistent (لـ اللوجات).
4. يولّد `.env` بباسورد Grafana وتوكن عشوائيين + يسألك عن تيليجرام (اختياري).
5. يثبّت **Node Exporter** native كخدمة systemd.
6. يشغّل كل الحاويات + يعمل restart لـ Grafana (لتثبيت الـ plugin).

في النهاية بيطبعلك بيانات الدخول وأمر SSH Tunnel.

### الوصول الآمن (SSH Tunnel)

من **جهازك** (مش على السيرفر):

```bash
ssh -L 3000:localhost:3000 -L 8081:localhost:8081 -L 9090:localhost:9090 \
    -L 9093:localhost:9093 root@SERVER_IP
```

ثم افتح في المتصفح:
- **Grafana:** http://localhost:3000
- **إدارة الخدمات:** http://localhost:8081

---

## 📊 اللوحات

| اللوحة | متى تفتحها |
|---|---|
| **01 · نظرة عامة** | أول حاجة دايماً — حالة السيرفر + التنبيهات المشتعلة |
| **02 · الأقراص والتخزين** | السيرفر بطيء أو مساحة قربت تخلص |
| **03 · الشبكة** | مشاكل اتصال / ترافيك غريب |
| **04 · الحاويات** | حاوية بتاكل موارد أو بتعمل restart |
| **05 · الخدمات والمواقع** | موقع/خدمة واقعة + إدارة الخدمات |
| **06 · اللوجات** | تحديد سبب أي عطل من السجلات |

### 🗺️ خريطة "المشكلة → المكان"

| المشكلة | افتح | التنبيه |
|---|---|---|
| السيرفر مش بيرد | 01 + 06 | `ServerDown` |
| السيرفر بطيء | 02 / 03 | `HighDiskIO` / `HighLoad` |
| الرام كاملة → Crash | 01 → 04 | `HighRAM` / `LowMemory` |
| موقع/خدمة واقعة | 05 → 06 | `ServiceDown` |
| حاوية بتعمل restart | 04 + 06 | `ContainerRestarting` |
| خدمة نظام فشلت | 06 | `SystemdServiceFailed` |
| قرص قرب يخلص | 02 | `DiskSpaceLow` / `DiskWillFillIn24h` |
| شهادة SSL قربت تنتهي | 05 | `SSLCertExpiringSoon` |

---

## ➕ إدارة الخدمات المراقَبة

في لوحة **05 · الخدمات والمواقع** فيه:
- **زر "إدارة الخدمات"** → يفتح صفحة الإدارة الكاملة (http://localhost:8081).
- **فورم إضافة** جوّه اللوحة نفسها (بيحتاج تدخل التوكن مرة في إعدادات الـ panel).

الصفحة المستقلة (http://localhost:8081) تتيح: إضافة/تعطيل/تفعيل/حذف مع جدول كامل.

**أنواع الفحص (modules):**

| module | الاستخدام | مثال |
|---|---|---|
| `http_2xx` | موقع HTTP | `https://example.com` |
| `http_2xx_ssl` | موقع + فحص صلاحية SSL | `https://example.com` |
| `tcp_connect` | فحص منفذ | `db.example.com:3306` |
| `icmp` | Ping | `8.8.8.8` |

> أي إضافة/تعديل تظهر في Prometheus تلقائياً خلال **30 ثانية** — بدون restart.

---

## 🔔 تنبيهات Telegram

### إعداد البوت
1. كلّم **@BotFather** على تيليجرام → `/newbot` → خُد الـ **Token**.
2. كلّم **@userinfobot** → خُد الـ **Chat ID**.

### الإدخال
- من صفحة الإدارة (http://localhost:8081): زر **بوت التيليجرام** — حفظ + زر إرسال تجريبي، ويُطبق خلال ~15 ثانية بدون إعادة تشغيل (الأسهل، ويتفوق على `.env`).
- وقت `install.sh` هيسألك عنهم (القيم الابتدائية في `.env`)، أو
- ضيفهم يدوياً في `.env`:
  ```
  TELEGRAM_BOT_TOKEN=123456:ABC...
  TELEGRAM_CHAT_ID=123456789
  ```
  ثم:
  ```bash
  docker compose up -d --force-recreate alertmanager
  ```

**لاختبار سريع:** أوقف المؤقت مؤقتاً أو اعمل تنبيه يدوي — أو شوف `ALERTS` في لوحة النظرة العامة.

---

## 🛠️ الصيانة

```bash
docker compose ps                    # حالة الخدمات
docker compose logs -f <service>     # لوجات خدمة
docker compose restart grafana       # إعادة تشغيل خدمة
docker compose pull && docker compose up -d   # تحديث الصور

systemctl status node_exporter       # حالة Node Exporter
journalctl -u node_exporter -n 30    # لوجاته
```

- **الاحتفاظ بالبيانات:** Prometheus 15 يوم · Loki 14 يوم (قابل للتعديل).
- **النسخ الاحتياطي:** `prometheus/targets/services.json` + مجلد `.env` + `data/` (لقطة دورية).
- **نسخ خدمات احتياطية:** آخر 10 نسخ في `prometheus/targets/backups/`.

---

## 🗑️ إلغاء التثبيت

```bash
sudo bash uninstall.sh          # إزالة الحاويات فقط (الداتا تفضل)
sudo bash uninstall.sh --purge  # إزالة كاملة: بيانات + Node Exporter + .env
```

---

## 🧰 استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| Grafana مش بتفتح | تأكد نفق SSH شغّال + `docker compose ps` |
| فورم الإضافة في Grafana مش شغّال | الـ plugin مش محمّل: `docker compose restart grafana` |
| مفيش تنبيهات تيليجرام | تحقق من التوكن/chat id في `.env` ثم أعد إنشاء alertmanager |
| مفيش لوجات في Loki | تأكد `/var/log/journal` موجود + `docker compose logs promtail` |
| Node Exporter مش شغّال | `journalctl -u node_exporter -n 50` |
| صلاحيات الداتا | `sudo bash install.sh` تاني (بيعمل chown) |
| خدماتي مش بتظهر | راجع التحقق من الصلاحية: `curl -s http://localhost:8081/api/targets` |

---

## 🔒 ملاحظات أمنية

- **كل المنافذ مربوطة على `127.0.0.1`** — مفيش أي حاجة مكشوفة للإنترنت.
- الوصول عبر **SSH Tunnel** (مشفّر) أو حط **Nginx + Basic Auth + TLS** لو محتاج دومين.
- `.env` صلاحياته `600` ومرفوض في Git.
- لا تفتح المنافذ 3000/8081/9090/9093/9100 على الجدار الناري مباشرة.
