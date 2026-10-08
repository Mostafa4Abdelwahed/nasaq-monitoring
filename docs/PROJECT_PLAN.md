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
| [1](#phase-1) | الستاك الأساسي (Compose + إعدادات المجمّعات) | `[ ]` |
| [2](#phase-2) | targets-manager (تعديل الخدمات من الداشبورد) | `[ ]` |
| [3](#phase-3) | Grafana: Provisioning + الـ 6 لوحات | `[ ]` |
| [4](#phase-4) | قواعد التنبيه + Telegram | `[ ]` |
| [5](#phase-5) | سكربتات التثبيت + README بالعربي | `[ ]` |
| [6](#phase-6) | الاختبارات الشاملة | `[ ]` |
| [7](#phase-7) | تحسينات مستقبلية (اختياري) | `[ ]` |

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

- [ ] `docker-compose.yml` — 9 خدمات: Node Exporter (native على الهوست — انظر التحسين C)، cAdvisor، Blackbox Exporter، Prometheus، Alertmanager، Grafana، targets-manager، Loki، Promtail
- [ ] `prometheus/prometheus.yml` — مع `file_sd_configs` على مجلد targets + `refresh_interval: 30s`
- [ ] `prometheus/targets/services.json` — المخطط:

```json
[
  {
    "targets": ["https://example.com"],
    "labels": { "service": "example", "module": "http_2xx", "type": "website" }
  }
]
```

- [ ] `blackbox/blackbox.yml` — Modules: `http_2xx` · `http_2xx_ssl` (يفحص صلاحية TLS) · `tcp_connect` · `icmp`
- [ ] `alertmanager/alertmanager.yml` — `telegram_configs` (مدعوم رسمياً من Alertmanager 0.24+) + grouping + repeat_interval
- [ ] `loki/loki-config.yml` — schema + compactor + **retention حقيقي 14 يوم** (منع اللوجات من ملء القرص — انظر التحسين D)
- [ ] `promtail/promtail-config.yml` — سحب من: systemd journal · ملفات /var/log · لوجات دوكر + حفظ positions في volume
- [ ] **Node Exporter native على الهوست** (مش كونتينر) — عشان systemd collector والإحصائيات الدقيقة. install.sh هيتولى تثبيته كـ systemd service

**✅ الفيز مكتمل لما:**
- [ ] `docker compose up -d` يشتغل بدون أخطاء
- [ ] كل Prometheus targets ديال الـ exporters = `up == 1`
- [ ] Grafana تفتح ومعاها datasource متوصل بـ Prometheus

**📝 Notes:**
<!-- ملاحظات الفيز -->

---

<a id="phase-2"></a>
## Phase 2 — targets-manager (إدارة الخدمات من الداشبورد)

- [ ] `targets-manager/Dockerfile` — Node.js 20-alpine خفيف
- [ ] `targets-manager/server.js`:
  - [ ] `GET /api/targets` — قائمة الخدمات (مرتبة)
  - [ ] `POST /api/targets` — إضافة (Validation: URL/Host صحيح + module موجود في blackbox.yml + غير مكرر)
  - [ ] `DELETE /api/targets/{id}` — حذف
  - [ ] `PATCH /api/targets/{id}` — تعطيل/تفعيل (بدون حذف نهائي)
  - [ ] Token auth (Bearer) لكل العمليات عدا القراءة
  - [ ] **كتابة آمنة (Atomic)**: حفظ في ملف مؤقت ← rename ← Prometheus يلتقطها بدون restart
  - [ ] Backup تلقائي للـ `services.json` قبل كل تعديل (يحتفظ بآخر 10 نسخ)
- [ ] `targets-manager/public/index.html` — صفحة إدارة خفيفة (جدول + فورم إضافة + أزرار حذف/تعطيل)
- [ ] ربطه في docker-compose مع sharing مجلد `prometheus/targets`

**✅ الفيز مكتمل لما:**
- [ ] إضافة خدمة من الصفحة → `services.json` يتحدّث
- [ ] Prometheus يلتقط الـ target الجديد خلال 30 ثانية كحد أقصى
- [ ] أي كتابة عبر curl بدون توكن = مرفوضة 401

**📝 Notes:**
<!-- ملاحظات الفيز -->

---

<a id="phase-3"></a>
## Phase 3 — Grafana: Provisioning + الداشبوردات

- [ ] `grafana/provisioning/datasources/datasources.yml` — Prometheus + Loki (مع `derivedFields` للانتقال للوج namespace/container مباشرة)
- [ ] تثبيت **Volkov Labs Data Manipulation Panel** (`volkovlabs-forms-panel`) عبر `GF_INSTALL_PLUGINS` — plugin موقّع رسمياً (انظر التحسين E)
- [ ] لوحة **01-Overview** — Uptime · CPU · RAM · Disk % · Load · حالة التنبيهات الحية
- [ ] لوحة **02-Disk & Storage** — كل mount منفصل · inodes · Read/Write I/O · توقّع الامتلاء
- [ ] لوحة **03-Network** — Bandwidth in/out · أخطاء · drops لكل interface
- [ ] لوحة **04-Containers** — استهلاك كل كونتينر CPU/RAM · restarts · الحالة
- [ ] لوحة **05-Services & Uptime** — جدول الخدمات من Blackbox (الاسم · HTTP code · زمن الاستجابة · انتهاء SSL) + فورم إضافة (الـ plugin) + زر Manage Services
- [ ] لوحة **06-Logs** — استعلامات Loki مربوطة بمعرّفات المقياس

**✅ الفيز مكتمل لما:**
- [ ] اللوحات الستة تفتح من القائمة بدون أخطاء
- [ ] الداتا تتحدث حية (refresh 15s على Overview)
- [ ] اللوحة 05 فيها فورم يعدّل services.json بشكل صحيح

**📝 Notes:**
<!-- ملاحظات الفيز -->

---

<a id="phase-4"></a>
## Phase 4 — قواعد التنبيه + Telegram

- [ ] `prometheus/rules/host-alerts.yml`:
  - [ ] `ServerDown` — `up == 0` لمدة دقيقة
  - [ ] `HighCPU` — أعلى من 85% لمدة 5 دقائق
  - [ ] `HighLoad` — load1 أكبر من ضعفي عدد الأنوية لمدة 5 دقائق
  - [ ] `HighRAM` / `NearOOM` — ذاكرة متاحة حرجة أو بدء الاعتماد على swap
- [ ] `prometheus/rules/disk-alerts.yml`:
  - [ ] `DiskSpaceLow` — أقل من 15% / حرج أقل من 5%
  - [ ] `DiskWillFillIn24h` — تنبؤ خطي بامتلاء خلال 24 ساعة
  - [ ] `DiskInodesLow` — عدد الـ inodes متاح حرج
  - [ ] `HighDiskIO` — queue depth أو utilization مرتفع
- [ ] `prometheus/rules/service-alerts.yml`:
  - [ ] `ServiceDown` — Blackbox probe فشل لمدة دقيقة (باسم الخدمة)
  - [ ] `SlowResponse` — زمن الاستجابة تجاوز حد ثابت
  - [ ] `SSLCertExpiringSoon` — أقل من 14 يوم
- [ ] `prometheus/rules/container-alerts.yml`:
  - [ ] `ContainerRestarting` — عدد restarts زاد في آخر 15 دقيقة
  - [ ] `ServiceFailed` — وحدة systemd في حالة failed
- [ ] كل تنبيه فيه Annotations كاملة:
  - [ ] `summary` — عنوان واضح
  - [ ] `description` — السبب المحتمل + المكان (mount/container/service)
  - [ ] `dashboard_url` — **رابط مباشر للوحة Grafana ذاتها** (باستخدام uid للوحة)
- [ ] تفعيل routing على Telegram في alertmanager.yml (token + chat id من .env) + تجميع معقول للتنبيهات

**✅ الفيز مكتمل لما:**
- [ ] تنبيه تجريبي فعلي يوصل على Telegram

**📝 Notes:**
<!-- ملاحظات الفيز -->

---

<a id="phase-5"></a>
## Phase 5 — سكربتات التثبيت + التوثيق

- [ ] `install.sh`:
  - [ ] التحقق من root + التوزيعة Ubuntu/Debian
  - [ ] تثبيت Docker + Compose plugin لو مش موجودين
  - [ ] توليد `.env` (باسورد Grafana عشوائي 32 حرف + توكن targets-manager + جمع token/chat id تيليجرام من المستخدم)
  - [ ] تثبيت Node Exporter native كـ systemd service
  - [ ] `docker compose up -d`
  - [ ] طباعة ملخص الوصول خطوة بخطوة (SSH Tunnel + الروابط)
- [ ] `uninstall.sh` — إيقاف الحاويات وإزالتها، وخيار `--purge` لحذف الداتا كاملة
- [ ] `README.md` بالعربي — التشغيل اليدوي · التثبيت الأول · الوصول الآمن للوحة · دليل استكشاف المشاكل السريع

**📝 Notes:**
<!-- ملاحظات الفيز -->

---

<a id="phase-6"></a>
## Phase 6 — الاختبارات الشاملة

- [ ] `docker compose ps` → كل الخدمات Up وhealthy
- [ ] فحص endpoints: `9100/metrics` (Node) · `9090/-/ready` (Prometheus) · `9115` (Blackbox)
- [ ] تنبيه `ServerDown` تجريبي يوصل فعلياً على Telegram
- [ ] إضافة/حذف خدمة من: (1) صفحة الإدارة (2) الفورم جوه Grafana — والاختيار التلقائي شغال
- [ ] محاكاة مشكلة: دسك يقوم يتملى (ملفات مؤقتة) والتنبيه يوصل
- [ ] `promtool check rules` + `amtool check-config` على كل ملفات التكوين
- [ ] فحص retention لو Loki: عمل لوجات تجريبية والانتظار للتأكد من الحذف

**📝 Notes:**
<!-- ملاحظات الفيز -->

---

<a id="phase-7"></a>
## Phase 7 — تحسينات مستقبلية (اختياري)

- [ ] الترقية من Promtail → Grafana Alloy (بديل حديث أخف)
- [ ] UFW rules بيفعلها الـ install.sh
- [ ] لوحة إضافية: DNS monitoring
- [ ] تخزين تاريخ التنبيهات كامل (PostgreSQL)

**📝 Notes:**
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
| **E** | Grafana plugin موقّع رسمياً (volkovlabs-forms-panel) عن طريق `GF_INSTALL_PLUGINS` | مش محتاج allow unsigned plugins = أمان واستقرار أكتر |
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
│   └── PROJECT_PLAN.md
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
