// ════════════════════════════════════════════════════════════════
//  nasaq-monitoring — targets-manager
//  إدارة الخدمات المراقَبة (Blackbox targets) عن طريق REST API
//  تُستخدم من صفحة الإدارة ومن Data Manipulation Panel في Grafana.
//
//  الحقيقةالمصدر (source of truth): /data/state/targets-state.json
//  الملف المولَّد لبروميتاِس:      /data/targets/services.json
//    — جميع الـ targets المفعّلة فقط كتابةً atomic (tmp→rename)
//    + نسخ احتياطي قبل أي تعديل (آخر 10 نسخ).
// ════════════════════════════════════════════════════════════════
const http = require("http");
const fsp = require("fs/promises");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "8080", 10);
const TOKEN = String(process.env.TARGETS_MANAGER_TOKEN || "").trim();
const TARGETS_DIR = process.env.TARGETS_DIR || "/data/targets";
const STATE_DIR = process.env.STATE_DIR || "/data/state";
const BLACKBOX_FILE = process.env.BLACKBOX_FILE || "/etc/blackbox/blackbox.yml";
const STATE_FILE = path.join(STATE_DIR, "targets-state.json");
const SERVICES_FILE = path.join(TARGETS_DIR, "services.json");
const BACKUPS_DIR = path.join(TARGETS_DIR, "backups");
const MAX_BACKUPS = 10;
// بيانات بوت التيليجرام المُدارة من صفحة الإدارة (تتفوق على .env عند وجودها)
const TELEGRAM_FILE = path.join(STATE_DIR, "telegram.env");
const ALERTMANAGER_URL = String(
  process.env.ALERTMANAGER_URL || "http://alertmanager:9093"
).replace(/\/$/, "");

if (!TOKEN) {
  console.error("FATAL: TARGETS_MANAGER_TOKEN is required (from .env)");
  process.exit(1);
}

let state = { targets: [] };
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ───────────────────────── أدوات ─────────────────────────
function idFor(target, mod) {
  return crypto
    .createHash("sha1")
    .update(target + "|" + mod)
    .digest("hex")
    .slice(0, 12);
}

// قراءة قائمة الـ modules من ملف blackbox.yml (مصداق الحقيقة نفسه)
// + ما يُعطى من env MODULES (مفصولة بفواصل) — الدمج بينهما
function readModules() {
  const mods = [];
  const push = (m) => {
    if (m && !mods.includes(m)) mods.push(m);
  };
  (process.env.MODULES || "").split(",").forEach((s) => push(s.trim()));
  try {
    const content = fs.readFileSync(BLACKBOX_FILE, "utf8");
    const idx = content.search(/^modules:\s*$/m);
    if (idx >= 0) {
      const sect = content.slice(idx + "modules:".length);
      const re = /^ {2}([A-Za-z0-9_]+):\s*(?:#.*)?$/gm;
      let m;
      while ((m = re.exec(sect)) !== null) push(m[1]);
    }
  } catch (e) {
    log("WARN: cannot parse blackbox.yml:", e.message);
  }
  return mods;
}

function validateTarget(target, mod) {
  try {
    if (/^http/.test(mod)) {
      const u = new URL(target);
      if (!/^https?:$/.test(u.protocol)) throw new Error("proto");
    } else if (mod === "tcp_connect") {
      if (!/^[A-Za-z0-9.\-]+:[0-9]{1,5}$/.test(target)) throw new Error("tcp");
    } else {
      // icmp وأي أنواع مستقبلية
      if (!/^[A-Za-z0-9.\-]+$/.test(target)) throw new Error("host");
    }
  } catch {
    return `target غير صالح لنوع الفحص (${mod})`;
  }
  return null;
}

function validateServiceName(s) {
  return /^[A-Za-z0-9_.\-]{1,64}$/.test(s || "")
    ? null
    : "اسم الخدمة: حروف إنجليزية/أرقام/نقطة/_ فقط، حتى 64 حرفاً";
}

// ───────────────────────── تيليجرام ─────────────────────────
// الصياغة مقيدة عمداً (بدون مسافات/علامات) لسلامة التضمين في sed والـ shell.
function validBotToken(t) {
  return /^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(String(t || ""));
}
function validChatId(c) {
  return /^-?\d{1,20}$/.test(String(c || ""));
}
// { source: "page"|"env", token, chat_id } — التوكن الكامل لا يغادر الخادم أبداً
function readTelegram() {
  try {
    const content = fs.readFileSync(TELEGRAM_FILE, "utf8");
    const tok = (/^TELEGRAM_BOT_TOKEN='([^']*)'/m.exec(content) || [])[1] || "";
    const chat = (/^TELEGRAM_CHAT_ID='([^']*)'/m.exec(content) || [])[1] || "";
    if (tok && validBotToken(tok) && validChatId(chat))
      return { source: "page", token: tok, chat_id: chat };
  } catch {}
  return { source: "env", token: "", chat_id: "" };
}
async function writeTelegram(tok, chat) {
  const body = `TELEGRAM_BOT_TOKEN='${tok}'\nTELEGRAM_CHAT_ID='${chat}'\n`;
  await fsp.writeFile(TELEGRAM_FILE + ".tmp", body);
  await fsp.rename(TELEGRAM_FILE + ".tmp", TELEGRAM_FILE);
}

// ───────────────────────── الملفات ─────────────────────────
async function ensureDirs() {
  await fsp.mkdir(TARGETS_DIR, { recursive: true });
  await fsp.mkdir(STATE_DIR, { recursive: true });
  await fsp.mkdir(BACKUPS_DIR, { recursive: true });
}

async function loadState() {
  try {
    state = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));
  } catch {
    // أول تشغيل: ترحيل من services.json الموجودة يدوياً (كلها مفعّلة)
    const migrated = [];
    try {
      const arr = JSON.parse(await fsp.readFile(SERVICES_FILE, "utf8"));
      for (const g of arr || []) {
        for (const t of g.targets || []) {
          const labels = g.labels || {};
          migrated.push({
            id: idFor(t, labels.module || ""),
            target: t,
            service: labels.service || t,
            module: labels.module || "http_2xx",
            type: labels.type || "website",
            enabled: true,
            created_at: new Date().toISOString(),
          });
        }
      }
    } catch {}
    state = { targets: migrated };
    log("state file not found, migrated", migrated.length, "targets");
  }
  if (!Array.isArray(state.targets)) state.targets = [];
}

async function backupServices() {
  try {
    await fsp.copyFile(
      SERVICES_FILE,
      path.join(BACKUPS_DIR, "backup-" + Date.now() + ".json")
    );
  } catch {}
  try {
    const names = (await fsp.readdir(BACKUPS_DIR)).sort();
    while (names.length > MAX_BACKUPS) {
      await fsp.unlink(path.join(BACKUPS_DIR, names.shift()));
    }
  } catch {}
}

// كتابة atomic: نفس المحتوى ≈ بدون كتابة (لا reload بلا داعٍ لبروميتاِس)
async function regenerate(force) {
  const enabled = state.targets.filter((t) => t.enabled !== false);
  const out = enabled.map((t) => ({
    targets: [t.target],
    labels: {
      service: t.service,
      module: t.module,
      ...(t.type ? { type: t.type } : {}),
    },
  }));
  const json = JSON.stringify(out, null, 2) + "\n";
  let current = null;
  try {
    current = await fsp.readFile(SERVICES_FILE, "utf8");
  } catch {}
  if (force || current !== json) {
    await backupServices();
    await fsp.writeFile(SERVICES_FILE + ".tmp", json);
    await fsp.rename(SERVICES_FILE + ".tmp", SERVICES_FILE);
    log("services.json regenerated:", out.length, "entries");
  }
  const sjson = JSON.stringify(state, null, 2) + "\n";
  try {
    await fsp.writeFile(STATE_FILE + ".tmp", sjson);
    await fsp.rename(STATE_FILE + ".tmp", STATE_FILE);
  } catch (e) {
    log("WARN state write:", e.message);
  }
}

// ───────────────────────── HTTP ─────────────────────────
function send(res, code, body, type) {
  const headers = {
    "x-content-type-options": "nosniff",
  };
  if (type) headers["content-type"] = type;
  res.writeHead(code, headers);
  res.end(body);
}

function sendJSON(res, code, obj, reqOrigin) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": reqOrigin ? reqOrigin : "*",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  });
  res.end(JSON.stringify(obj));
}

function authorized(req) {
  const h = String(req.headers["authorization"] || "");
  return h === "Bearer " + TOKEN;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 65536) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const origin = req.headers["origin"];
  const p = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": origin ? origin : "*",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400",
    });
    return res.end();
  }

  try {
    // الملفات الثابتة (صفحة الإدارة)
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      const html = await fsp.readFile(
        path.join(__dirname, "public", "index.html")
      );
      return send(res, 200, html, "text/html; charset=utf-8");
    }

    if (p === "/api/health") {
      return sendJSON(res, 200, { ok: true, ts: new Date().toISOString() });
    }

    // تحقق من التوكن (تستخدمه صفحة الدخول قبل عرض اللوحة)
    if (p === "/api/auth/verify") {
      if (!authorized(req))
        return sendJSON(res, 401, { ok: false, error: "توكن غير صحيح أو مفقود" });
      return sendJSON(res, 200, { ok: true });
    }

    if (p === "/api/modules") {
      return sendJSON(res, 200, { modules: readModules() });
    }

    // ── إعدادات بوت التيليجرام (تُطبق على Alertmanager خلال ~15 ثانية) ──
    if (p === "/api/telegram") {
      if (req.method === "GET") {
        const cur = readTelegram();
        return sendJSON(res, 200, {
          source: cur.source,
          token_set: cur.source === "page",
          token_suffix: cur.source === "page" ? cur.token.slice(-4) : "",
          chat_id: cur.source === "page" ? cur.chat_id : "",
        });
      }
      if (!authorized(req))
        return sendJSON(res, 401, { error: "توكن غير صحيح أو مفقود" });
      if (req.method === "POST") {
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch {
          return sendJSON(res, 400, { error: "JSON غير صالح" });
        }
        const cur = readTelegram();
        // التوكن الفارغ = إبقاء الحالي (يشترط وجود إعداد محفوظ)
        const tok = String((body || {}).bot_token || "").trim();
        const chat = String((body || {}).chat_id || "").trim();
        const finalTok = tok || cur.token;
        if (!finalTok)
          return sendJSON(res, 400, { error: "أدخل توكن البوت أولاً" });
        if (!validBotToken(finalTok))
          return sendJSON(res, 400, { error: "صيغة التوكن غير صحيحة (مثال: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)" });
        if (!validChatId(chat))
          return sendJSON(res, 400, { error: "Chat ID غير صالح (أرقام فقط، وسالب للجروبات)" });
        await writeTelegram(finalTok, chat);
        log("telegram settings saved (chat_id " + chat + ")");
        return sendJSON(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        try {
          await fsp.unlink(TELEGRAM_FILE);
        } catch {}
        log("telegram settings reverted to .env");
        return sendJSON(res, 200, { ok: true });
      }
      return sendJSON(res, 405, { error: "method not allowed" });
    }

    // تنبيه تجريبي عبر Alertmanager الحالي (للتحقق بعد الحفظ)
    if (p === "/api/telegram/test") {
      if (!authorized(req))
        return sendJSON(res, 401, { error: "توكن غير صحيح أو مفقود" });
      if (req.method !== "POST")
        return sendJSON(res, 405, { error: "method not allowed" });
      try {
        const r = await fetch(ALERTMANAGER_URL + "/api/v2/alerts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify([
            {
              labels: { alertname: "PageTest", severity: "info", service: "targets-page" },
              annotations: {
                summary: "test from management page",
                description: "If you got this, the Telegram bot settings are working.",
              },
            },
          ]),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) throw new Error("alertmanager status " + r.status);
        return sendJSON(res, 200, { ok: true });
      } catch (e) {
        log("telegram test failed:", e.message);
        return sendJSON(res, 502, { error: "تعذر الوصول لـ Alertmanager: " + e.message });
      }
    }

    if (p === "/api/targets") {
      if (req.method === "GET") {
        const list = state.targets
          .map((t) => ({
            id: t.id,
            target: t.target,
            service: t.service,
            module: t.module,
            type: t.type || "website",
            enabled: t.enabled !== false,
            created_at: t.created_at,
          }))
          .sort((a, b) => a.service.localeCompare(b.service));
        return sendJSON(res, 200, { count: list.length, targets: list });
      }

      if (req.method === "POST") {
        if (!authorized(req)) return sendJSON(res, 401, { error: "توكن غير صحيح أو مفقود" });
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch {
          return sendJSON(res, 400, { error: "JSON غير صالح" });
        }
        const { target, service, module: mod, type } = body || {};
        const modules = readModules();

        if (!modules.includes(mod))
          return sendJSON(res, 400, { error: `module غير معروف. المتاح: ${modules.join(", ")}` });
        const errName = validateServiceName(service);
        if (errName) return sendJSON(res, 400, { error: errName });
        const errTarget = validateTarget(String(target || ""), mod);
        if (errTarget) return sendJSON(res, 400, { error: errTarget });

        const id = idFor(String(target), mod);
        if (state.targets.some((t) => t.id === id))
          return sendJSON(res, 409, { error: "الخدمة موجودة مسبقاً بنفس العنوان والفحص", id });

        const entry = {
          id,
          target: String(target),
          service: String(service),
          module: mod,
          type: String(type || "website"),
          enabled: true,
          created_at: new Date().toISOString(),
        };
        state.targets.push(entry);
        await regenerate(false);
        log("added", entry.id, entry.target, entry.module);
        return sendJSON(res, 201, { ok: true, id, entry });
      }
    }

    let m;
    if ((m = p.match(/^\/api\/targets\/([A-Za-z0-9]+)$/))) {
      const id = m[1];
      const idx = state.targets.findIndex((t) => t.id === id);
      if (req.method === "PATCH") {
        if (!authorized(req)) return sendJSON(res, 401, { error: "توكن غير صحيح أو مفقود" });
        if (idx < 0) return sendJSON(res, 404, { error: "الخدمة غير موجودة" });
        let body;
        try {
          body = JSON.parse((await readBody(req)) || "{}");
        } catch {
          return sendJSON(res, 400, { error: "JSON غير صالح" });
        }
        if (typeof body.enabled === "boolean")
          state.targets[idx].enabled = body.enabled;
        await regenerate(false);
        log("patched", id, state.targets[idx].enabled);
        return sendJSON(res, 200, { ok: true, entry: state.targets[idx] });
      }
      if (req.method === "DELETE") {
        if (!authorized(req)) return sendJSON(res, 401, { error: "توكن غير صحيح أو مفقود" });
        if (idx < 0) return sendJSON(res, 404, { error: "الخدمة غير موجودة" });
        const removed = state.targets.splice(idx, 1)[0];
        await regenerate(false);
        log("deleted", id, removed.target);
        return sendJSON(res, 200, { ok: true, removed: removed.id });
      }
      return sendJSON(res, 405, { error: "method not allowed" });
    }

    return sendJSON(res, 404, { error: "not found" });
  } catch (e) {
    log("ERROR", req.method, p, e.message);
    return sendJSON(res, 500, { error: "خطأ داخلي: " + e.message });
  }
});

// ───────────────────────── الإقلاع ─────────────────────────
(async () => {
  await ensureDirs();
  await loadState();
  await regenerate(true); // ضمان أن services.json متزامنة عند الإقلاع
  server.listen(PORT, () =>
    log(`targets-manager listening on :${PORT} (dual-stack)`)
  );
})();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
