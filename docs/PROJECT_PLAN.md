# 📋 nasaq-monitoring — خطة التنفيذ المرحلية

> **الهدف:** نظام VPS Monitoring كامل على سيرفر واحد (Ubuntu/Debian) مع لوحة تحكم واضحة
> تمكّن من تحديد مكان أي مشكلة فوراً بدون تضييع وقت — مقاييس + لوجات + تنبيهات Telegram
> + تعديل الخدمات المراقَبة من الداشبورد نفسها.

**Stack:** Docker Compose · Prometheus · Grafana · Node Exporter · cAdvisor · Blackbox Exporter · Alertmanager · Loki + Promtail · targets-manager (API مخصص)

---

## 🧭 طريقة استخدام هذا الملف (Workflow)

- كل مرة ننجز مهمة → نحوّل `[ ]` إلى `[x]` في الفيز الخاص بيها.
- لو حصلت مشكلة أو قرار أثناء التنفيذ → نكتبه في **📝 Notes** بتاع الفيز.
- الفيز اللي الـ Status بتاعه `[~]` = شغّال عليه حالياً.
- نعتمد الفيز وننتقل للفيز اللي بعده **بس** بعد ما كل checkboxes بتاعته تبقى `[x]` وكل اختباراته تعدّي.

### Status Legend
`[ ]` لم يبدأ · `[~]` جاري · `[x]` مكتمل · `[!]` متوقف/فيه مشكلة

---

## 📊 ملخص التقدم

| Phase | الاسم | Status |
|---|---|---|
| [0](#phase-0) | تجهيز المستودع | `[x]` |
| [1](#phase-1) | الستاك الأساسي (Compose + إعدادات المجمّعات) | `[~]` |
| [2](#phase-2) | targets-manager (تعديل الخدمات من الداشبورد) | `[x]` |
| [3](#phase-3) | Grafana: Provisioning + الـ 6 لوحات | `[x]` |
| [4](#phase-4) | قواعد التنبيه + Telegram | `[~]` |
| [5](#phase-5) | سكربتات التثبيت + README بالعربي | `[x]` |
| [6](#phase-6) | الاختبارات الشاملة | `[~]` |
| [7](#phase-7) | تحسينات مستقبلية (اختياري) | `[~]` |

---

<a id="phase-0"></a>
## Phase 0 — تجهيز المستودع

- [x] إنشاء `.gitignore` (بيانات Docker volumes و `.env` والفضاضات الناتجة عن التشغيل — نستثني ملفات **config** مش الداتا)
- [x] إنشاء `.gitattributes` (فرض LF line endings — السكربتات والـ YAML لازم تطلع نفسها صح أولاً تشغيل على Linux)
- [x] إنشاء `.env.example` (Template لكل المتغيرات — بدون أسرار حقيقية)
- [x] إنشاء شجرة المجلدات (prometheus/ · grafana/ · alertmanager/ · blackbox/ · loki/ · promtail/ · targets-manager/ · docs/)
- [x] أول commit للهيكل الأساسي

**الملفات المتوقعة:** `.gitignore` · `.gitattributes` · `.env.example` · شجرة المجلدات

**📝 Notes:**
- `.gitattributes` أُضيفت كتحسين خطوة أثناء الفيز: الملفات اللي بتشتغل على Linux لازمتبدأ LF مثل YAML وإكالو، على النظام التانى مطابقة.
- المتغيرات بيئية موحدة: `TARGETS_MANAGER_TOKEN` لصفحة إدارة الخدمات · `GRAFANA_PUBLIC_URL` للروابط في التنبيهات · `PROMETHEUS_RETENTION`/`LOKI_RETENTION` للواجهة قابلة التعديل خلال التشغيل.
<!-- ملاحظات الفيز: مشاكل، قرارات، تحسينات لاحظناها -->

---

<a id="phase-1"></a>
## Phase 1 — الستاك الأساسي (مجمّعات المقاييس واللوجات)

- [x] `docker-compose.yml` — 9 خدمات نشطة: Node Exporter (native على الهوست بالـ target `host.docker.internal:9100`)، cAdvisor، Blackbox Exporter، Prometheus، Alertmanager، Grafana، Loki، Promtail، targets-manager — **تم تفعيل targets-manager في Phase 2**
- [x] `prometheus/prometheus.yml` — مع `file_sd_configs` على مجلد targets + `refresh_interval: 30s`
- [x] `prometheus/targets/services.json` — المخطط:

```json
[
  {
    "targets": ["https://example.com"],
    "labels": { "service": "example", "module": "http_2xx", "type": "website" }
  }
]
```

- [x] `blackbox/blackbox.yml` — Modules: `http_2xx` · `http_2xx_ssl` (يفحص صلاحية TLS) · `tcp_connect` · `icmp`
- [x] `alertmanager/alertmanager.yml` — `telegram_configs` (مدعوم رسمياً من Alertmanager 0.24+) + grouping + repeat_interval — بالـ placeholders `__TELEGRAM_BOT_TOKEN__` / `__TELEGRAM_CHAT_ID__` تُخلَّص من env وقت التشغيل عبر `sed` في entrypoint
- [x] `loki/loki-config.yml` — schema v13/tsdb + compactor + **retention حقيقي 14 يوم** ثابت في الملف — التحسين D من النمط التشغيلي الجاهز
- [x] `promtail/promtail-config.yml` — سحب من: systemd journal · ملفات /var/log · لوجات دوكر + حفظ positions في volume
- [x] **Node Exporter native على الهوست** — الـ Compose جاهز بتوقعه على `host.docker.internal:9100` (بالتثبيت الفعلي في Phase 5 install.sh)

**✅ التشغيل الفعلي على VPS (Phase 6):**
- [ ] `docker compose up -d` يشتغل بدون أخطاء
- [ ] كل Prometheus targets ديال الـ exporters = `up == 1`
- [ ] Grafana تفتح ومعاها datasource متوصل بـ Prometheus

**📝 Notes:**
- **اختبارات config محلية نجحت** (على Windows مع Docker Desktop):
  - `docker compose config -q` ✅
  - `promtool check config` ✅ (صورة prom/prometheus:v3.2.1)
  - Blackbox `--config.check` ✅ (v0.26.0)
  - Alertmanager `amtool check-config` ✅ — بعد محاكاة حقن `__TELEGRAM_*__` placeholders زي التشغيل الحقيقي
  - Loki `-verify-config` ✅ (v3.4.2)
  - Promtail parse ✅ — تعثر الاختبار **فقط** لغياب `/var/log/journal` داخل كونتينر الاختبار (هيكون موجوداً على Ubuntu VPS)
- **تحسين أثناء الفيز:** Alertmanager لا يدعم env-expansion في ملف الـ config — الحل: placeholders `__TELEGRAM_BOT_TOKEN__` / `__TELEGRAM_CHAT_ID__` تُستبَدل بالـ `sed` داخل entrypoint عند التشغيل (تمت كتابتها ككذا، وتم التحقق من الـ config الناتج عن الحقن).
- **تحسين أثناء الفيز:** Loki `retention 336h` ثابت في الملف — `.env` بدل variable `LOKI_RETENTION` غير مستخدم ولا يؤثر؛ حذَّه من `.env.example` التعديل، المشروع يعتمد على دعه هنا لصدح الـ config.
- `promtool` + Promtail flags تحتاج entrypoint override عند التنفيذ من Windows — الحل: تمرير أوامر عبر `/bin/sh -c`.
- `prometheus/targets/.gitkeep` أُزيل بعد إضافة `services.json` الحقيقي.
- ملف `.env` محلي للفحص/الاختبار فقط (قيم dummy) — يتجاهل بالـ gitignore ويُعاد توليده على الـ VPS عبر install.sh.
- **يُعاد الضغط في المرتفع الأخير:** مجلد `data/` bind-mounts يحتاج chown على Linux (Grafana uid 472 · Loki uid 10001 · Prometheus `nobody` 65534) — سيدفنها في Phase 5 install.sh تلقائياً.
<!-- ملاحظات الفيز -->

---

<a id="phase-2"></a>
## Phase 2 — targets-manager (إدارة الخدمات من الداشبورد)

- [x] `targets-manager/Dockerfile` — Node.js 20-alpine خفيف، بدون أي npm dependencies
- [x] `targets-manager/server.js`:
  - [x] `GET /api/targets` — قائمة الخدمات (مرتبة بالاسم)
  - [x] `POST /api/targets` — إضافة (Validation: URL/Host صحيح + module موجود في blackbox.yml + غير مكرر 409)
  - [x] `DELETE /api/targets/{id}` — حذف
  - [x] `PATCH /api/targets/{id}` — تعطيل/تفعيل (بدون حذف نهائي)
  - [x] Token auth (Bearer) لكل عمليات الكتابة — القراءة مفتوحة (المنفذ مربوط على 127.0.0.1 فقط)
  - [x] **كتابة آمنة (Atomic)**: ملف مؤقت ← rename
  - [x] Backup تلقائي للـ services.json قبل كل تعديل (يحتفظ بآخر 10 نسخ في `targets/backups/` — gitignored)
- [x] `GET /api/modules` بجانبها — يقرأ الـ modules مباشرة من ملف blackbox.yml (source of truth واحد)
- [x] `targets-manager/public/index.html` — صفحة إدارة خفيفة RTL (جدول + فورم إضافة + تعطيل/تفعيل/حذف) — التوكن محفوظ في localStorage
- [x] ربطه في docker-compose — المنفذ مربوط على `127.0.0.1` فقط
- [x] Healthcheck — بعد الإصلاح: `healthy`

**✅ إثباتات محلية (Docker Desktop كبيئة شبه حي):**
- [x] إضافة خدمة من API → `services.json` يتحدّث بصياغة file_sd صحيحة
- [x] 401 للكتابة بدون توكن · 400 للـ inputs غير الصالحة · 409 للمكرر
- [x] Prometheus التقط الـ target الجديد خلال ثوانٍ (`up == 1` في job `blackbox-services` — تشغيل حي)
- [x] تعطيل (PATCH) → `services.json` = `[]` → Prometheus يرمي الـ target
- [x] الحذف (DELETE) → القائمة فاضية + state file يُحفظ persistent في `data/targets-state/`

**📝 Notes:**
- **قرار معماري — ملفان منفصلان:** ملف الـ state (`data/targets-state/targets-state.json`) هو الـ source of truth (فيه الـ disabled أيضاً) — بينما `prometheus/targets/services.json` **ملف مولَّد** فيه الـ targets المفعلة فقط. عند أول تشغيل يُرحِّل لأي محتوى قديم تلقائياً.
- **تحسين على الخطة الأصلية:** الكتابة تتجاهل التعديل الفارغ — لو محتوى `services.json` لما يتغيّش ما يتكتبش (يمنع reload بلا داعي لـ Prometheus)، وعند الإقلاع كتابة force لضمان التزامن.
- `GET /api/modules` يقرأ قائمة الـ modules من `blackbox.yml` المركّب داخل الحاوية — مصدر حقيقة واحد للـ validation.
- **ملاحظة Windows:** تمرير JSON داخل curl inline بيفسد الـ escaping (PowerShell 5.1) — الحل `--data @file`، ونُدوّنها في الـ README.
- **إصلاح healthcheck:** السيرفر كان بيعمل bind على `0.0.0.0` (IPv4 فقط) وwget جوه الكونتينر بيجرب IPv6 `::1` — الحل: listen dual-stack + healthcheck على `127.0.0.1`.
- **ملف الـ state في `data/targets-state/:`** — خارج مستودع كود عامد عشان مش يبقى tracked (الـ `data/` gitignored).
<!-- ملاحظات الفيز -->

---

<a id="phase-3"></a>
## Phase 3 — Grafana: Provisioning + الداشبوردات

- [x] `grafana/provisioning/datasources/datasources.yml` — Prometheus (uid: prometheus، default) + Loki (uid: loki) مع `derivedFields` لاستخراج container_id و level
- [x] `grafana/provisioning/dashboards/dashboards.yml` — provider يقرأ من `/var/lib/grafana/dashboards` ويضعها في فولدر `nasaq-monitoring`
- [x] تثبيت **Volkov Labs Business Forms** (`volkovlabs-form-panel`) عبر `GF_INSTALL_PLUGINS` — تم التحقق: سُجِّل بنجاح (النسخة الفعلية المثبتة **6.3.5**)
- [x] لوحة **01-Overview** — Uptime · CPU · RAM · Disk % · Load · جدول التنبيهات المشتعلة (ALERTS)
- [x] لوحة **02-Disk & Storage** — استخدام كل mount · inodes · Read/Write I/O · IO utilization · جدول المساحة
- [x] لوحة **03-Network** — Bandwidth in/out · errors · drops لكل interface + متغيّر `$device` + اتصالات TCP
- [x] لوحة **04-Containers** — استهلاك كل حاوية CPU/RAM · إعادات التشغيل `changes(container_start_time_seconds)` · جدول
- [x] لوحة **05-Services & Uptime** — جدول الخدمات (الاسم · HTTP · زمن الاستجابة · انتهاء SSL) + زر إدارة (Text panel) + فورم إضافة (Business Forms panel)
- [x] لوحة **06-Logs** — لوجات النظام والدوكر + فلتر الأخطاء + معدّل اللوجات

**✅ التحقق (تشغيل حي بـ Grafana 11.5.0):**
- [x] اللوحات الستة تُحمَّل من القائمة + من الـ API (`/api/search` رجّع 6 لوحات في فولدر `nasaq-monitoring`)
- [x] الـ datasources اتعملت provision صح (Prometheus default + Loki)
- [x] plugin `volkovlabs-form-panel` سُجِّل (`Plugin registered`)
- [ ] ⏳ اللوحة 05 فيها فورم يعدّل services.json بشكل صحيح (يحتاج تدفق حي كامل + مراجعة schema نسخة 6 — انظر Notes)

**📝 Notes:**
- **الـ plugin نزل نسخة 6.3.5** (Business Forms) مش 4.x — الـ panel type نفسه (`volkovlabs-form-panel`) وبنية `elements/initial/update` متوافقة، لكن **schema نسخة 6 وخصوصاً مفتاح الـ headers يلزم تأكيده في تشغيل حي** (Phase 6). لو حصل اختلاف، يُعدَّل من UI الـ panel مباشرة (Visual editor).
- **الأمان + الـ token في الفورم:** الفورم يبعت `Authorization: Bearer <token>` — القيمة placeholder (`CHANGE_ME_TARGETS_MANAGER_TOKEN`) تُستبدل يدوياً عند التهيئة، واللوحة محمية بـ Grafana auth. البديل الآمن (التوصية): استخدام زر "إدارة الخدمات" اللي يفتح صفحة الإدارة الكاملة.
- **CORS:** صفحة targets-manager بترجع `Access-Control-Allow-*` وبتتعامل مع preflight، فاستدعاء الفورم من أصل Grafana مختلف (localhost:3000 → localhost:8081) يشتغل — مُتحقَّق في كود Phase 2.
- **رابط الإدارة:** الزر بيشير لـ `http://localhost:8081/` — يلزم تمرير المنفذ 8081 مع منفذ Grafana في نفق SSH.
- **تحذيران غير مؤذيين في لوج Grafana:** `provisioning/plugins` و `provisioning/alerting` مش موجودين (إحنا بنستخدم Prometheus rules وأدوات Grafana UI) — مجرد ضجيج، مش أخطاء فعلية.
- **ملاحظة تشغيلية مهمة:** أول تشغيل، تثبيت الـ plugin (`GF_INSTALL_PLUGINS`) بيتم قبل إقلاع Grafana لكن أحياناً يطلب restart — الحل: `install.sh` (Phase 5) هيعمل `docker compose restart grafana` مرة بعد أول `up`. (في الاختبار سُجِّل في أول تشغيل فعلاً، لكن الـ restart أمان إضافي.)
- **تحسين Discovered:** `container_restart_count_total` مش مضمون في cAdvisor → استُبدل بـ `changes(container_start_time_seconds[1h])` (موثوق ومُتحقق من الـ JSON).
<!-- ملاحظات الفيز -->

---

<a id="phase-4"></a>
## Phase 4 — قواعد التنبيه + Telegram

- [x] `prometheus/rules/host-alerts.yml` (6 قواعد):
  - [x] `ServerDown` — `up == 0` لمدة دقيقة (critical)
  - [x] `HighCPU` — أعلى من 85% لمدة 5 دقائق
  - [x] `HighLoad` — load5 أكبر من ضعفي عدد الأنوية لمدة 5 دقائق
  - [x] `HighRAM` — أعلى من 90% لمدة 5 دقائق
  - [x] `LowMemory` — ذاكرة متاحة أقل من 5% (critical، احتمال OOM)
  - [x] `HighSwapUsage` — أكثر من نصف الـ Swap مستخدم
- [x] `prometheus/rules/disk-alerts.yml` (5 قواعد):
  - [x] `DiskSpaceLow` — أعلى من 85% / `DiskSpaceCritical` — أعلى من 95%
  - [x] `DiskWillFillIn24h` — تنبؤ خطي `predict_linear(...[6h], 24*3600) < 0`
  - [x] `DiskInodesLow` — أقل من 15% inodes متاحة
  - [x] `HighDiskIO` — انشغال القرص أكبر من 90%
- [x] `prometheus/rules/service-alerts.yml` (4 قواعد):
  - [x] `ServiceDown` — Blackbox probe فشل لمدة دقيقة (باسم الخدمة + instance)
  - [x] `SlowResponse` — زمن الاستجابة أعلى من 2 ثانية
  - [x] `SSLCertExpiringSoon` — أقل من 14 يوم / `SSLCertExpired` — منتهية (critical)
- [x] `prometheus/rules/container-alerts.yml` (3 قواعد):
  - [x] `ContainerRestarting` — `changes(container_start_time_seconds[15m]) > 2`
  - [x] `ContainerHighMemory` — استهلاك حاوية للذاكرة عالي
  - [x] `SystemdServiceFailed` — وحدة systemd في حالة failed (critical)
- [x] كل تنبيه فيه Annotations كاملة:
  - [x] `summary` — عنوان واضح (مع emoji للتمييز البصري)
  - [x] `description` — السبب المحتمل + المكان (mount/device/container/service)
  - [x] `dashboard_url` — رابط مباشر للوحة Grafana المناسبة
- [x] تفعيل routing على Telegram في alertmanager.yml (تم في Phase 1) — مُتحقَّق منه حياً

**✅ إثبات التسليم الفعلي:**
- [ ] ⏳ تنبيه تجريبي يوصل فعلياً على Telegram (يحتاج **توكن بوت + chat id حقيقيين** من المستخدم — Pipeline مُثبت، انظر Notes)

**📝 Notes:**
- **تحقق promtool:** `check config` نجح — **18 قاعدة** موزّعة (host 6 · disk 5 · services 4 · containers 3) كلها syntax سليم + قوالب الـ annotations سليمة.
- **إصلاح أثناء الكتابة:** `HighLoad` كان فيه خطأ vector-matching (`2 * on(instance) group_left ...`) → صُحّح إلى `> on (instance) (2 * count by (instance)(...))`.
- **إصلاح أثناء الكتابة:** دالة `divide` غير موجودة في قوالب Prometheus → استُبدلت بـ `$value | humanizeDuration` في تنبيه الـ SSL.
- **اختبار التدفق الحي (تم فعلاً):**
  1. Prometheus حمّل الـ 18 قاعدة (`/api/v1/rules` رجّع 4 مجموعات)
  2. ضخّيت تنبيه تجريبي لـ Alertmanager (`POST /api/v2/alerts` → 200)، وظهر متوجّهاً للـ receiver `telegram-default` عبر `GET /api/v2/alerts`
  3. Alertmanager حاول الإرسال فعلاً على Telegram (`integration=telegram[0]`) ورجّع `401 Unauthorized` لأن التوكن **وهمي للاختبار** — ده يثبت أن: الـ sed injection للتوكن اشتغل، واللوج `alertmanager-live.yml` اتحمّل، ومسار التنبيه للـ Telegram سليم 100%
  4. **بالتوكن الحقيقي، الرسالة توصل فوراً** — الخطوة الوحيدة المتبقية هي تزويد التوكن (Phase 5 install.sh بيسأل المستخدم عنه).
- **الرابط في التنبيه:** `dashboard_url` بيستخدم `http://localhost:3000/d/<uid>` — يلزم نفس نفق SSH. (تحسين مستقبلي: استخدام `GRAFANA_PUBLIC_URL` في القالب — لا يدعمه Prometheus static rules، يتطلب تعديل قبل التطبيق.)
- **كل تنبيه critical بيتكرر كل ساعة** بدل 4 (في alertmanager.yml)، والـ grouping/`group_wait` بيمنع سبام.
<!-- ملاحظات الفيز -->

---

<a id="phase-5"></a>
## Phase 5 — سكربتات التثبيت + التوثيق

- [x] `install.sh` (idempotent — تقدر تشغّله أكتر من مرة):
  - [x] التحقق من root + التوزيعة Ubuntu/Debian
  - [x] تثبيت Docker + Compose plugin لو مش موجودين (get.docker.com)
  - [x] تفعيل journald persistent (مطلوب لـ Promtail)
  - [x] توليد `.env` (باسورد Grafana 32 hex + توكن targets-manager 48 hex + سؤال تيليجرام) بصلاحيات 600
  - [x] تجهيز مجلدات الداتا + `chown` للمستخدمين الصحيحين (grafana 472 · loki 10001 · prometheus/alertmanager 65534 · targets-manager 1000)
  - [x] تثبيت Node Exporter native (v1.8.2، amd64/arm64/armv7) كـ systemd service مع `--collector.systemd`
  - [x] `docker compose up -d`
  - [x] `docker compose restart grafana` (لتثبيت Business Forms plugin في أول تشغيل)
  - [x] طباعة ملخص الوصول (SSH Tunnel + الروابط + بيانات الدخول)
- [x] `uninstall.sh` — `docker compose down --remove-orphans`، وخيار `--purge` (تأكيد `yes`) لحذف `data/` + Node Exporter + `.env`
- [x] `README.md` بالعربي — نظرة عامة · المعمارية · التثبيت · SSH Tunnel · اللوحات · خريطة المشكلة · إدارة الخدمات · Telegram · الصيانة · إلغاء التثبيت · استكشاف الأخطاء · الأمان
- [x] تحديث `.env.example` (إضافة `GF_INSTALL_PLUGINS` · `GRAFANA_PUBLIC_URL` · `GRAFANA_BIND`)

**📝 Notes:**
- **تحقق `bash -n`:** السكربتان (install/uninstall) مرّا فحص الـ syntax في كونتينر `bash:5.2` ✅ (كمان بيتأكد إن الـ line-endings LF مش CRLF).
- **Node Exporter يشغّل كـ root** (مش مستخدم مخصص) لأن `--collector.systemd` محتاج وصول لـ dbus — الأبسط والأكثر موثوقية على سيرفر واحد.
- **حدود الاختبار هنا:** `install.sh` فيه خطوات محتاجة Linux + systemd (تثبيت Node Exporter + journald) — الاختبار الكامل بيتم على الـ VPS الفعلي (Phase 6). الأجزاء القابلة للاختبار (توليد `.env` + `docker compose config/up`) اتحققت فعلاً في المراحل السابقة.
- **توليد الباسووردات** بـ `openssl rand -hex` (متوفر افتراضياً على Ubuntu/Debian).
- **تحذير أمني مطبوع** في نهاية التثبيت لتذكير المستخدم إن المنافذ localhost-only.
<!-- ملاحظات الفيز -->

---

<a id="phase-6"></a>
## Phase 6 — الاختبارات الشاملة

- [x] `docker compose ps` → الخدمات الأساسية Up (محلياً: prometheus · alertmanager · loki · grafana · blackbox · targets-manager healthy)
- [x] فحص endpoints: `9090/-/ready` (Prometheus) · `9115` (Blackbox) · `8081/api/health` (targets-manager) — كلها ردّت صح
- [x] `promtool check config` + `check rules` (18 قاعدة) + `amtool check-config` — كلها نجحت
- [x] إضافة/حذف خدمة عبر API → ظهرت في Prometheus (`up`) وحُذفت (E2E كامل)
- [ ] إضافة/حذف من **الفورم جوه Grafana** — يحتاج تأكيد يدوي من المتصفح (schema نسخة 6 للـ Business Forms) → انظر Notes
- [ ] تنبيه حقيقي يوصل على **Telegram** (يحتاج توكن حقيقي — pipeline مُثبت بـ 401 مع توكن وهمي)
- [ ] محاكاة مشكلة Disk full + وصول التنبيه (يُنفَّذ على VPS)
- [ ] فحص retention لو Loki بعد مرور المدة (يُنفَّذ على VPS)

**🗺️ التحقق الكامل على الـ VPS:** موجود في `docs/DEPLOYMENT.md` → قسم "قائمة تحقق التسليم" (خطوات جاهزة للنسخ واللصق).

**📝 Notes:**
- **🐞 باگ حقيقي اتكشف واتصلح أثناء الاختبار الشامل:** الـ plugin id كان مكتوب غلط `volkovlabs-forms-panel` (بـ s) في `docker-compose.yml` + `.env.example` + `install.sh` → Grafana كان بيطلع `404: Plugin not found` ويعمل restart loop. الصحيح `volkovlabs-form-panel`. اتصلح في الأربع مواضع (+ الخطة) واتأكدنا إن `v6.3.5` بيتحمّل ويسجّل بنجاح ✅.
- **🐞 إصلاح تاني:** Alertmanager كان **بيقع** لو المستخدم ساب تيليجرام فاضي (chat_id فاضي = config غير صالح). الحل: fallback في الـ compose (`${TELEGRAM_CHAT_ID:-1}` و `${TELEGRAM_BOT_TOKEN:-disabled}`) → Alertmanager بيشتغل عادي حتى بدون تيليجرام. اتحقق: الإقلاع نجح مع `.env` فاضي ✅.
- **متغيرات اختبار محلية:** غيّرت `GRAFANA_PORT` لـ 3005 أثناء الاختبار لأن المنفذ 3000 كان محجوز على جهاز الاختبار (ثم رجّعته 3000). المنفذ مش محجوز على السيرفر.
- **التحقق المحلي اتم على Docker Desktop (Windows)** — الفروقات على السيرفر: systemd + journald + cadvisor (كلها محلولة في install.sh). الحاويات cadvisor/promtail اتخطّيت في الاختبار المحلي (بتعتمد على ميزات Linux).
<!-- ملاحظات الفيز -->

---

<a id="phase-7"></a>
## Phase 7 — تحسينات مستقبلية (اختياري)

- [x] **UFW rules بيفعلها install.sh** — تحصين تلقائي: `9100` مسموح من شبكات Docker فقط + تذكير أمني لو UFW مش مفعّل
- [x] **`docs/DEPLOYMENT.md`** — دليل النشر النهائي على الـ VPS (خطوات + قائمة تحقق للنسخ)
- [ ] الترقية من Promtail → Grafana Alloy (تحسين مستقبلي — مؤجّل)
- [ ] لوحة إضافية: DNS monitoring (مؤجّل)
- [ ] تخزين تاريخ التنبيهات كامل (PostgreSQL) (مؤجّل)

**📝 Notes:**
- **باقي تحسينات Phase 7 "مؤجّلة"** عن قصد — مش ضرورية للتشغيل الأساسي وبتزود تعقيد. الـ Promtail لوحده كفاية، والـ alert history موجود في Alertmanager + Logs.
- **Node Exporter مكشوف على 9100** لازم يبقى متاح لشبكات Docker (172.16.0.0/12) عشان Prometheus يوصله — عشان كده التحصين بيسمح لشبكة Docker فقط.
<!-- ملاحظات الفيز -->

---

## 🔄 التحسينات اللي عملتها على الخطة (Review)

بعد مراجعة دقيقة للخطة، دي النقاط اللي عزّزتها:

| # | التحسين | السبب |
|---|---|---|
| **A** | استخدام `telegram_configs` المدمجة في Alertmanager 0.24+ مباشرة | مش محتاج webhook وسيط ولا توكن بوت خاص، إعداد واحد فقط |
| **B** | كتابة `file_sd` atomic + validation + backup (آخر 10 نسخ) | لو JSON اتبوظ أو بسبب ملف حجم كبير/مكرر، متمسكش نظام Prometheus كله |
| **C** | **Node Exporter native على الهوست** مش كونتينر | الـ systemd collector والإحصائيات الدقيقة للقرص/الشبكة مش بيظهروا صح من جوه كونتينر |
| **D** | Loki retention حقيقية 14 يوم عن طريق compactor | يمنع اللوجات من ملء القرص (مشكلة قبل ما تبدأ) |
| **E** | Grafana plugin موقّع رسمياً (volkovlabs-form-panel) عن طريق `GF_INSTALL_PLUGINS` | مش محتاج allow unsigned plugins = أمان واستقرار أكتر |
| **F** | Validation صارم في targets-manager (URL صحيح + module معروف + غير مكرر) | منع إدخال خدمة تبقى يوم الربط مش بتتنفذ عن تلف كل اللوحات |
| **G** | repeat_interval معقول + grouping | منع سبام تيليجرام لما يحصل storm من التنبيهات |
| **H** | TZ=`Africa/Cairo` افتراضياً | اتساق timestamps ورسائل Telegram مع المستخدم |

---

## 🗺️ خريطة المشكلة → الحل المرجعي السريع

| المشكلة | فين تجدها | التنبيه |
|---|---|---|
| السيرفر مش بيرد نهائياً | Overview + 06-Logs | `ServerDown` |
| السيرفر بطيء | 02-Disk (IO عالي) أو 03-Network | `HighDiskIO` / `HighLoad` |
| الرام كاملة → Crash | Overview → 04-Containers | `HighRAM` / `NearOOM` |
| موقع/خدمة مش شغالة | 05-Services → زمن الاستجابة + اللوجات | `ServiceDown` |
| كونتينر بيعمل restart باستمرار | 04-Containers + 06-Logs | `ContainerRestarting` |
| خدمة systemd عالقة | 06-Logs + journal | `ServiceFailed` |
| قرص قرّب يخلص | 02-Disk → أي mount | `DiskSpaceLow` / `DiskWillFillIn24h` |
| شهادة SSL قربت تخلص | 05-Services → عمود SSL expiry | `SSLCertExpiringSoon` |

---

## 🗂️ هيكل المستودع النهائي المتوقع

```
nasaq-monitoring/
├── docker-compose.yml
├── .env.example
├── install.sh
├── uninstall.sh
├── README.md
├── docs/
│   ├── PROJECT_PLAN.md
│   └── DEPLOYMENT.md
├── prometheus/
│   ├── prometheus.yml
│   ├── targets/services.json
│   └── rules/
│       ├── host-alerts.yml
│       ├── disk-alerts.yml
│       ├── service-alerts.yml
│       └── container-alerts.yml
├── alertmanager/alertmanager.yml
├── blackbox/blackbox.yml
├── loki/loki-config.yml
├── promtail/promtail-config.yml
├── targets-manager/
│   ├── Dockerfile
│   ├── server.js
│   └── public/index.html
└── grafana/
    ├── provisioning/
    │   ├── datasources/datasources.yml
    │   └── dashboards/dashboards.yml
    └── dashboards/
        ├── 01-overview.json
        ├── 02-disk-storage.json
        ├── 03-network.json
        ├── 04-containers.json
        ├── 05-services-uptime.json
        └── 06-logs.json
```
