// Telegram bridge for Flow Scene Automator.
// No abre puertos: hace long polling hacia Telegram y manda comandos al puente local.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = process.env.FLOW_REMOTE_URL || "http://localhost:35729";
const SECRETS = path.join(ROOT, "secrets.local.json");
const OFFSET_FILE = path.join(ROOT, ".flowbot-telegram-offset.json");
const OUT_DIR = path.join(ROOT, "remotion-editor", "out");
const TELEGRAM_UPLOAD_LIMIT = 49 * 1024 * 1024;

function readSecrets() {
  try { return JSON.parse(fs.readFileSync(SECRETS, "utf8").replace(/^\uFEFF/, "")); }
  catch { return {}; }
}

const secrets = readSecrets();
const TOKEN = String(secrets.telegramBotToken || "").trim();
const allowed = new Set([
  secrets.telegramChatId,
  ...(Array.isArray(secrets.telegramAllowedUserIds) ? secrets.telegramAllowedUserIds : []),
].filter(Boolean).map(String));
const defaultChatId = String(secrets.telegramChatId || [...allowed][0] || "");

if (!TOKEN) {
  console.error("Falta telegramBotToken en secrets.local.json");
  process.exit(1);
}

function tgUrl(method) {
  return `https://api.telegram.org/bot${TOKEN}/${method}`;
}

function requestJson(method, url, body = null) {
  const lib = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = lib.request(url, {
      method,
      headers: data ? { "content-type": "application/json", "content-length": data.length } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try { resolve(raw ? JSON.parse(raw) : {}); }
        catch { resolve({ ok: false, error: raw || res.statusCode }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function loadOffset() {
  try {
    const j = JSON.parse(fs.readFileSync(OFFSET_FILE, "utf8"));
    return Math.max(0, Number(j.offset || 0));
  } catch { return 0; }
}

function saveOffset(offset) {
  try { fs.writeFileSync(OFFSET_FILE, JSON.stringify({ offset, savedAt: Date.now() }), "utf8"); }
  catch { /* noop */ }
}

async function syncTelegramOffset(savedOffset) {
  if (savedOffset > 0) return savedOffset;
  // Drena TODO el backlog: getUpdates pagina de a 100, asi que una sola pasada dejaba vivos los updates
  // 101+ y esos comandos VIEJOS se re-ejecutaban al arrancar (reintentos fantasma).
  let offset = 0;
  for (let i = 0; i < 20; i++) {
    const updates = await requestJson("POST", tgUrl("getUpdates"), { offset, timeout: 0, allowed_updates: ["message", "callback_query"] }).catch(() => null);
    const batch = updates?.result || [];
    if (!batch.length) break;
    offset = Math.max(0, ...batch.map((u) => Number(u.update_id || 0))) + 1;
  }
  if (offset) saveOffset(offset);
  return offset;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.headers.location) return resolve(download(res.headers.location));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function tg(method, body) {
  const out = await requestJson("POST", tgUrl(method), body);
  if (!out.ok) throw new Error(out.description || out.error || method);
  return out.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return tg("sendMessage", { chat_id: chatId, text: String(text).slice(0, 3900), ...extra });
}

async function answerCallbackQuery(id, text = "") {
  return tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

function keyboard(rows) {
  return { reply_markup: { inline_keyboard: rows } };
}

function mainKeyboard() {
  return keyboard([
    [{ text: "Estado", callback_data: "status" }, { text: "Panel", callback_data: "panel" }],
    [{ text: "Reanudar", callback_data: "resume" }, { text: "Reintentar", callback_data: "retry" }, { text: "Pausar", callback_data: "pause" }],
    [{ text: "Cola ON", callback_data: "queue_on" }, { text: "Cola OFF", callback_data: "queue_off" }],
    [{ text: "Audio faltante", callback_data: "audio_missing" }, { text: "Enviar video", callback_data: "send_video" }],
    [{ text: "Errores", callback_data: "errors" }, { text: "Logs", callback_data: "logs" }, { text: "Cola", callback_data: "queue" }],
  ]);
}

function errorKeyboard() {
  return keyboard([
    [{ text: "Reintentar", callback_data: "retry" }, { text: "Reanudar", callback_data: "resume" }],
    [{ text: "Panel", callback_data: "panel" }, { text: "Saltar", callback_data: "skip" }],
    [{ text: "Estado", callback_data: "status" }],
  ]);
}

function statusKeyboard() {
  return keyboard([
    [{ text: "Faltantes", callback_data: "missing" }, { text: "Actual", callback_data: "current" }],
    [{ text: "Panel", callback_data: "panel" }, { text: "Audio faltante", callback_data: "audio_missing" }],
    [{ text: "Reanudar", callback_data: "resume" }, { text: "Reintentar", callback_data: "retry" }],
    [{ text: "Enviar video", callback_data: "send_video" }, { text: "Menu", callback_data: "menu" }],
  ]);
}

function formatHelp() {
  return [
    "Flowbot - panel maestro",
    "",
    "Estado:",
    "/status o /estado - ver proyecto, fase y progreso",
    "/faltantes - que falta (imagenes, audio, render)",
    "/actual - que se esta generando ahora mismo",
    "/queue o /cola - ver JSONs pendientes",
    "/errores o /fallos - ver fallos activos",
    "/logs - ultimos eventos de la extension",
    "/ping o /salud - comprobar puente local",
    "",
    "Control:",
    "/pausar - pausa el autopiloto",
    "/reanudar - continua o avanza a la siguiente fase si ya puede",
    "/reintentar - reintenta el fallo activo",
    "/saltar - salta escena activa cuando aplica",
    "/detener - detiene la corrida actual",
    "/todo - ejecuta el boton Hacer todo",
    "/audio - genera solo audios faltantes",
    "",
    "Cola:",
    "/cola_on - activa modo cola",
    "/cola_off - desactiva modo cola",
    "",
    "Capturas:",
    "/panel - captura solo el panel derecho",
    "/shot - captura toda la pantalla",
    "/video - manda ultimo video o preview",
    "",
    "JSON:",
    "Manda un .json o pega el JSON completo para agregarlo a queue.",
    "/whoami - muestra chat_id y user_id",
  ].join("\n");
}

function commandLabel(command) {
  return ({
    pause: "pausar",
    resume: "reanudar",
    retry: "reintentar",
    skip: "saltar",
    stop: "detener",
    queue_on: "activar cola",
    queue_off: "desactivar cola",
    run_all: "hacer todo",
    audio_missing: "generar audio faltante",
  })[command] || command;
}

function formatQueueJobs(q) {
  if (!Array.isArray(q) || !q.length) return "Queue vacia.";
  return q.slice(0, 12).map((j, i) => {
    const status = j.valid === false ? `invalido (${(j.errors || []).length} error(es))`
      : j.mediaComplete ? "listo para render/node"
        : `faltan ${Array.isArray(j.missingMedia) ? j.missingMedia.length : "medios"}`;
    return `${i + 1}. ${j.name} | ${j.preset || "preset?"} | ${status}`;
  }).join("\n");
}

// Existe Y pesa lo minimo: existsSync solo daba "full.mp3 OK" sobre archivos de 0 bytes (corruptos).
function fileOk(p, minBytes = 1) {
  try { const st = fs.statSync(p); return st.isFile() && st.size >= minBytes; } catch { return false; }
}

function latestFileMtime(dir, exts = null) {
  let latest = 0;
  if (!fs.existsSync(dir)) return latest;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) latest = Math.max(latest, latestFileMtime(p, exts));
    else if (!exts || exts.includes(path.extname(f.name).toLowerCase())) {
      try { latest = Math.max(latest, fs.statSync(p).mtimeMs); } catch {}
    }
  }
  return latest;
}

function projectMediaSummary(s) {
  const slug = s?.project?.slug;
  if (!slug) return [];
  const preset = s?.project?.preset || "";
  const base = path.join(ROOT, "remotion-editor", "public", slug);
  const out = path.join(OUT_DIR, `${slug}.mp4`);
  const voice = path.join(base, "voice", "full.mp3");
  const mediaMtime = latestFileMtime(base, [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mp3", ".json"]);
  const lines = [];
  const continuousVoice = /^(manhwa|historias|criptoclaro|habitos|pov-historias)/.test(preset);
  if (continuousVoice) {
    lines.push(`Audio: ${fileOk(voice, 4096) ? "full.mp3 OK" : fs.existsSync(voice) ? "full.mp3 CORRUPTO (muy chico)" : "falta full.mp3"}`);
  } else {
    const voiceDir = path.join(base, "voice");
    const count = fs.existsSync(voiceDir) ? fs.readdirSync(voiceDir).filter((x) => x.toLowerCase().endsWith(".mp3")).length : 0;
    lines.push(`Audio: ${count} mp3`);
  }
  if (!fs.existsSync(out)) {
    lines.push("Render: no ha empezado");
  } else {
    const st = fs.statSync(out);
    const stale = mediaMtime && st.mtimeMs < mediaMtime;
    lines.push(`Render: ${stale ? "pendiente (hay MP4 viejo)" : "listo"} ${path.basename(out)} ${humanBytes(st.size)}`);
  }
  return lines;
}

function formatMissingSummary(s) {
  const counts = s?.scenes?.counts || {};
  const icounts = s?.ingredients?.counts || {};
  const sceneMissing = Number(counts.pending || 0) + Number(counts.generating_image || 0) + Number(counts.error || 0);
  const ingMissing = Number(s?.ingredients?.total || 0) - Number(icounts.done || 0);
  const missing = [];
  if (ingMissing > 0) missing.push(`${ingMissing} ingrediente(s)`);
  if (sceneMissing > 0) missing.push(`${sceneMissing} escena(s) de imagen/video`);
  const media = projectMediaSummary(s);
  return [
    `Estado claro: ${sceneMissing > 0 ? "generando medios; NO renderizando" : "medios de escenas completos"}`,
    `Faltan: ${missing.length ? missing.join(", ") : "sin pendientes de escenas/ingredientes"}`,
    ...media,
  ];
}

function formatLogs(st) {
  const logs = st?.state?.lastLogs;
  if (!Array.isArray(logs) || !logs.length) return "Sin logs remotos todavia.";
  return logs.slice(-10).map((x) => {
    const t = x.ts ? new Date(x.ts).toLocaleTimeString("es-MX", { hour12: false }) : "--:--:--";
    return `[${t}] ${x.level || "info"}: ${x.message || ""}`;
  }).join("\n");
}

function formatErrors(st) {
  const s = st?.state;
  if (!s) return "Sin snapshot remoto. Usa /ping para comprobar el puente.";
  const sceneErrors = Number(s.scenes?.counts?.error || 0);
  const ingredientErrors = Number(s.ingredients?.counts?.error || 0);
  const lines = [];
  if (!sceneErrors && !ingredientErrors && !s.activeScene?.error && !s.activeIngredient?.error) {
    return "No veo errores activos en la extension.";
  }
  lines.push(`Errores: escenas=${sceneErrors} ingredientes=${ingredientErrors}`);
  if (s.activeIngredient?.error) lines.push(`Ingrediente ${s.activeIngredient.id}: ${s.activeIngredient.error}`);
  if (s.activeScene?.error) lines.push(`Escena ${s.activeScene.id}: ${s.activeScene.error}`);
  lines.push("Usa /reintentar, /reanudar o /panel para revisar.");
  return lines.join("\n");
}

function multipartSendPhoto(chatId, filePath, caption = "") {
  return multipartSendFile("sendPhoto", "photo", chatId, filePath, caption, "image/png");
}

function multipartSendFile(method, fieldName, chatId, filePath, caption = "", contentType = "application/octet-stream", fields = {}) {
  return new Promise((resolve, reject) => {
    const boundary = "----flowbot" + Date.now().toString(16);
    const file = fs.readFileSync(filePath);
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
      ...Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${path.basename(filePath)}"\r\nContent-Type: ${contentType}\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const body = Buffer.concat(parts);
    const req = https.request(tgUrl(method), {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const out = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          out.ok ? resolve(out.result) : reject(new Error(out.description || `${method} fallo`));
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function allowedIdentity(from, chat, text = "") {
  if (!allowed.size) return /^\/whoami\b/i.test(text || "");
  return allowed.has(String(from?.id || "")) || allowed.has(String(chat?.id || ""));
}

function allowedMessage(msg) {
  return allowedIdentity(msg.from, msg.chat, msg.text || "");
}

async function localJson(method, pathName, body = null) {
  return requestJson(method, `${SERVER}${pathName}`, body);
}

async function queueJson(p, name) {
  return localJson("POST", "/queue/add", { json: p, name });
}

function humanBytes(n) {
  const v = Number(n || 0);
  if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${v} B`;
}

function latestMp4(preferredSlug = "") {
  const candidates = [];
  if (!fs.existsSync(OUT_DIR)) return null;
  if (preferredSlug) {
    const exact = path.join(OUT_DIR, `${preferredSlug}.mp4`);
    if (fs.existsSync(exact)) return exact;
  }
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (!name.toLowerCase().endsWith(".mp4")) continue;
    if (/\.stale-/.test(name)) continue;   // backups de renders viejos: no son "el ultimo video"
    const p = path.join(OUT_DIR, name);
    try { candidates.push({ p, mtime: fs.statSync(p).mtimeMs }); } catch {}
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.p || null;
}

function makePreview(src) {
  const base = path.basename(src, ".mp4").replace(/[^\w.-]+/g, "_");
  const attempts = [
    { seconds: 90, crf: "32", width: "720" },
    { seconds: 60, crf: "35", width: "540" },
    { seconds: 40, crf: "37", width: "480" },
  ];
  for (const a of attempts) {
    const out = path.join(os.tmpdir(), `${base}_preview_${a.seconds}s_${Date.now()}.mp4`);
    const r = spawnSync("ffmpeg", [
      "-y", "-i", src, "-t", String(a.seconds),
      "-vf", `scale=${a.width}:-2`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", a.crf,
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart", out,
    ], { windowsHide: true, encoding: "utf8" });
    if (r.status === 0 && fs.existsSync(out) && fs.statSync(out).size < TELEGRAM_UPLOAD_LIMIT) return out;
    try { fs.rmSync(out, { force: true }); } catch {}
  }
  return null;
}

async function sendLatestVideo(chatId) {
  const st = await localJson("GET", "/remote/state").catch(() => null);
  const slug = st?.state?.project?.slug || "";
  const file = latestMp4(slug);
  if (!file) return sendMessage(chatId, "No encontre videos .mp4 en remotion-editor/out.", mainKeyboard());
  const size = fs.statSync(file).size;
  const rel = path.relative(ROOT, file);
  const stale = mp4StalenessNote(file, slug);
  if (size < TELEGRAM_UPLOAD_LIMIT) {
    await multipartSendFile("sendVideo", "video", chatId, file, `${path.basename(file)}\n${humanBytes(size)}${stale}`, "video/mp4", { supports_streaming: "true" });
    return;
  }
  const preview = makePreview(file);
  if (preview) {
    try {
      await multipartSendFile("sendVideo", "video", chatId, preview, `Preview de ${path.basename(file)}\nOriginal: ${rel}\nTamano: ${humanBytes(size)}${stale}`, "video/mp4", { supports_streaming: "true" });
    } finally { try { fs.rmSync(preview, { force: true }); } catch {} }
    return;
  }
  return sendMessage(chatId, `El video pesa ${humanBytes(size)} y Telegram Bot no deja subir mas de 50 MB.\nOriginal: ${rel}${stale}`, mainKeyboard());
}

// Aviso de MP4 rancio: si algun medio del proyecto (imagenes/clips/voz/json) es MAS NUEVO que el MP4,
// el render esta pendiente y este archivo es de una version anterior (bug real: "MP4 viejo confundido
// con render nuevo").
function mp4StalenessNote(file, slug) {
  try {
    if (!slug) return "";
    const base = path.join(ROOT, "remotion-editor", "public", slug);
    const mediaMtime = latestFileMtime(base, [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mp3", ".json"]);
    const st = fs.statSync(file);
    if (mediaMtime && st.mtimeMs < mediaMtime) {
      const mins = Math.round((mediaMtime - st.mtimeMs) / 60000);
      return `\nOJO: este MP4 es MAS VIEJO que los medios del proyecto (${mins} min); el render nuevo aun no corre.`;
    }
  } catch { /* sin nota */ }
  return "";
}

function formatStatus(st, queue) {
  const s = st?.state;
  if (!s) return "Extension sin snapshot remoto todavia. Recarga la extension o espera 30s.";
  const q = s.queue || {};
  const ageSec = st?.updatedAt ? Math.round((Date.now() - Number(st.updatedAt)) / 1000) : null;
  const lines = [
    `Proyecto: ${s.project?.slug || s.project?.title || "(sin proyecto)"}`,
    `Cola: ${s.autoQueue ? "ON" : "OFF"} | running=${!!q.running} paused=${!!q.paused} phase=${q.phase || "-"}`,
    `Escenas: ${s.scenes?.total || 0} ${JSON.stringify(s.scenes?.counts || {})}`,
    `Ingredientes: ${s.ingredients?.total || 0} ${JSON.stringify(s.ingredients?.counts || {})}`,
  ];
  if (ageSec !== null) lines.push(`Snapshot: hace ${ageSec}s`);
  if (s.activeIngredient) lines.push(`Ingrediente: ${s.activeIngredient.id} ${s.activeIngredient.status}${s.activeIngredient.error ? " - " + s.activeIngredient.error : ""}`);
  if (s.activeScene) lines.push(`Escena: ${s.activeScene.id} ${s.activeScene.status}${s.activeScene.error ? " - " + s.activeScene.error : ""}`);
  lines.push(...formatMissingSummary(s));
  const jobs = Array.isArray(queue) ? queue.slice(0, 5).map((j) => `${j.name}${j.mediaComplete ? " (listo)" : ""}`).join(", ") : "";
  if (jobs) lines.push(`Queue: ${jobs}`);
  return lines.join("\n");
}

function captureScreen(cropPanel = false) {
  const out = path.join(os.tmpdir(), `flowbot-${Date.now()}.png`);
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if (${cropPanel ? "$true" : "$false"}) {
  $w = [Math]::Min(560, $b.Width)
  $x = $b.Right - $w
  $y = $b.Top
  $h = $b.Height
} else {
  $x = $b.Left; $y = $b.Top; $w = $b.Width; $h = $b.Height
}
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
$bmp.Save("${out.replace(/\\/g, "\\\\")}", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error((r.stderr || r.stdout || "screenshot fallo").toString());
  return out;
}

async function handleJsonPayload(chatId, text, name = "telegram_json") {
  const p = JSON.parse(text);
  const out = await queueJson(p, name);
  if (!out.ok) return sendMessage(chatId, `JSON rechazado: ${out.error || "error"}${out.errors ? "\n" + out.errors.join("\n") : ""}`);
  return sendMessage(chatId, `JSON agregado a queue: ${out.name}`);
}

async function handleDocument(msg) {
  const doc = msg.document;
  if (!doc?.file_name?.toLowerCase().endsWith(".json")) return sendMessage(msg.chat.id, "Manda un archivo .json.");
  const info = await tg("getFile", { file_id: doc.file_id });
  const buf = await download(`https://api.telegram.org/file/bot${TOKEN}/${info.file_path}`);
  const name = path.basename(doc.file_name, ".json");
  return handleJsonPayload(msg.chat.id, buf.toString("utf8"), name);
}

async function sendRemote(chatId, command) {
  const out = await localJson("POST", "/remote/command", { command, source: "telegram" });
  return sendMessage(chatId, out.ok ? `Comando enviado: ${commandLabel(command)}` : `No pude enviar: ${out.error}`, mainKeyboard());
}

// Acciones que gastan creditos o tiran trabajo: desde BOTON piden confirmacion (un teclado inline viejo
// de ayer puede disparar un retry hoy); tecleadas como comando (/reintentar) van directo (intencion clara).
const DANGEROUS_ACTIONS = new Set(["retry", "skip", "stop", "queue_off", "run_all"]);

function confirmKeyboard(action) {
  return keyboard([[
    { text: `Si, ${commandLabel(action)}`, callback_data: `confirm:${action}` },
    { text: "Cancelar", callback_data: "status" },
  ]]);
}

async function handleAction(chatId, action) {
  console.log(`[telegram] action ${action} chat=${chatId}`);
  if (action === "menu") return sendMessage(chatId, formatHelp(), mainKeyboard());
  if (action === "status") {
    const st = await localJson("GET", "/remote/state");
    const q = await localJson("GET", "/queue");
    return sendMessage(chatId, formatStatus(st, Array.isArray(q) ? q : []), statusKeyboard());
  }
  if (action === "missing") {
    const st = await localJson("GET", "/remote/state");
    const s = st?.state;
    if (!s) return sendMessage(chatId, "Extension sin snapshot remoto todavia.", mainKeyboard());
    return sendMessage(chatId, formatMissingSummary(s).join("\n"), statusKeyboard());
  }
  if (action === "current") {
    const st = await localJson("GET", "/remote/state");
    const s = st?.state;
    if (!s) return sendMessage(chatId, "Extension sin snapshot remoto todavia.", mainKeyboard());
    const q2 = s.queue || {};
    const lines = [
      `Proyecto: ${s.project?.slug || s.project?.title || "(sin proyecto)"}`,
      `Fase: ${q2.phase || "-"} ${q2.running ? "(corriendo)" : q2.paused ? "(PAUSADA)" : "(detenida)"}`,
    ];
    if (s.activeIngredient) lines.push(`Ingrediente actual: ${s.activeIngredient.id} ${s.activeIngredient.status}${s.activeIngredient.error ? " - " + s.activeIngredient.error : ""}`);
    if (s.activeScene) lines.push(`Escena actual: ${s.activeScene.id} ${s.activeScene.status}${s.activeScene.error ? " - " + s.activeScene.error : ""}`);
    if (!s.activeIngredient && !s.activeScene) lines.push("Nada generandose ahora mismo.");
    return sendMessage(chatId, lines.join("\n"), statusKeyboard());
  }
  if (action === "queue") {
    const q = await localJson("GET", "/queue");
    return sendMessage(chatId, formatQueueJobs(q), mainKeyboard());
  }
  if (action === "errors") {
    const st = await localJson("GET", "/remote/state");
    return sendMessage(chatId, formatErrors(st), errorKeyboard());
  }
  if (action === "logs") {
    const st = await localJson("GET", "/remote/state");
    return sendMessage(chatId, formatLogs(st), mainKeyboard());
  }
  if (action === "panel" || action === "shot") {
    const file = captureScreen(action === "panel");
    try { await multipartSendPhoto(chatId, file, action === "panel" ? "Panel derecho" : "Pantalla"); }
    finally { try { fs.rmSync(file, { force: true }); } catch {} }
    return;
  }
  if (action === "send_video") return sendLatestVideo(chatId);
  if (["pause", "resume", "retry", "skip", "stop", "queue_on", "queue_off", "run_all", "audio_missing"].includes(action)) {
    return sendRemote(chatId, action);
  }
  return sendMessage(chatId, `Accion no reconocida: ${action}`, mainKeyboard());
}

async function handleCallback(q) {
  const chatId = q.message?.chat?.id;
  if (!chatId) return;
  if (!allowedIdentity(q.from, q.message?.chat, "")) {
    await answerCallbackQuery(q.id, "No autorizado").catch(() => {});
    return sendMessage(chatId, `No autorizado. user_id=${q.from?.id} chat_id=${chatId}`);
  }
  await answerCallbackQuery(q.id).catch(() => {});
  const data = String(q.data || "menu");
  if (data.startsWith("confirm:")) return handleAction(chatId, data.slice("confirm:".length));
  if (DANGEROUS_ACTIONS.has(data)) return sendMessage(chatId, `Seguro que quieres ${commandLabel(data)}?`, confirmKeyboard(data));
  return handleAction(chatId, data);
}

async function command(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  console.log(`[telegram] message chat=${chatId} text=${text.slice(0, 80)}`);
  if (/^\/whoami\b/i.test(text)) return sendMessage(chatId, `chat_id=${chatId}\nuser_id=${msg.from?.id}`);
  if (!allowedMessage(msg)) return sendMessage(chatId, `No autorizado. user_id=${msg.from?.id} chat_id=${chatId}`);
  if (msg.document) return handleDocument(msg);
  if (text.startsWith("{")) return handleJsonPayload(chatId, text, "telegram_json");

  const cmd = text.split(/\s+/)[0].toLowerCase();
  if (["/start", "/help", "/ayuda", "/comandos", "/commands", "/menu"].includes(cmd)) return sendMessage(chatId, formatHelp(), mainKeyboard());
  const map = {
    "/pausar": "pause", "/pause": "pause",
    "/reanudar": "resume", "/resume": "resume",
    "/reintentar": "retry", "/retry": "retry",
    "/saltar": "skip", "/skip": "skip",
    "/detener": "stop", "/stop": "stop",
    "/cola_on": "queue_on", "/queue_on": "queue_on",
    "/cola_off": "queue_off", "/queue_off": "queue_off",
    "/todo": "run_all", "/run_all": "run_all",
    "/audio": "audio_missing", "/audio_faltante": "audio_missing", "/generar_audio": "audio_missing",
  };
  if (map[cmd]) return handleAction(chatId, map[cmd]);
  if (cmd === "/ping" || cmd === "/salud") {
    const st = await localJson("GET", "/remote/state").catch((e) => ({ ok: false, error: e.message }));
    const age = st?.updatedAt ? `${Math.round((Date.now() - Number(st.updatedAt)) / 1000)}s` : "sin snapshot";
    return sendMessage(chatId, `Bridge Telegram OK.\nServidor local: ${st?.ok ? "OK" : "sin respuesta"}\nSnapshot: ${age}`, mainKeyboard());
  }
  if (cmd === "/status" || cmd === "/estado") return handleAction(chatId, "status");
  if (cmd === "/faltantes" || cmd === "/missing" || cmd === "/falta") return handleAction(chatId, "missing");
  if (cmd === "/actual" || cmd === "/current" || cmd === "/ahora") return handleAction(chatId, "current");
  if (cmd === "/errores" || cmd === "/fallos" || cmd === "/errors") return handleAction(chatId, "errors");
  if (cmd === "/logs" || cmd === "/log") return handleAction(chatId, "logs");
  if (cmd === "/queue" || cmd === "/cola") return handleAction(chatId, "queue");
  if (cmd === "/shot" || cmd === "/screenshot") return handleAction(chatId, "shot");
  if (cmd === "/panel") return handleAction(chatId, "panel");
  if (cmd === "/video" || cmd === "/ultimo_video" || cmd === "/enviar_video") return handleAction(chatId, "send_video");
  return sendMessage(chatId, `No reconozco "${cmd || text}". Usa /help para ver comandos.`, mainKeyboard());
}

let lastEventId = 0;
async function initEvents() {
  const out = await localJson("GET", "/remote/events").catch(() => null);
  lastEventId = Number(out?.lastId || 0);
}

async function pollEvents() {
  if (!defaultChatId) return;
  const out = await localJson("GET", `/remote/events?since=${lastEventId}`).catch(() => null);
  if (!out?.ok || !Array.isArray(out.events)) return;
  // dev-server reiniciado: su contador de eventos vuelve a empezar. Sin este reset, lastEventId quedaba
  // por arriba para siempre y las notificaciones (errores incluidos) morian en silencio.
  const serverLast = Number(out.lastId || 0);
  if (serverLast < lastEventId) {
    console.warn(`[telegram] dev-server reinicio (events ${serverLast} < ${lastEventId}); re-adopto el contador.`);
    lastEventId = 0;
    return;
  }
  for (const e of out.events) {
    lastEventId = Math.max(lastEventId, Number(e.id || 0));
    if (e.level === "debug") continue;
    const snap = e.snapshot;
    const extra = snap?.activeIngredient ? `\nIngrediente: ${snap.activeIngredient.id} ${snap.activeIngredient.status}` : "";
    const buttons = e.level === "error" || e.level === "warn" ? errorKeyboard() : mainKeyboard();
    await sendMessage(defaultChatId, `[${e.level || "info"}] ${e.message || ""}${extra}`.trim(), buttons).catch(() => {});
  }
}

async function main() {
  await initEvents();
  if (defaultChatId) await sendMessage(defaultChatId, "Flowbot Telegram activo. Usa /help para ver comandos.", mainKeyboard()).catch(() => {});
  let offset = await syncTelegramOffset(loadOffset());
  setInterval(() => pollEvents().catch(() => {}), 5000);
  for (;;) {
    try {
      const updates = await requestJson("POST", tgUrl("getUpdates"), { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
      if (updates && updates.ok === false) {
        // Error a nivel API (401 token, 409 doble instancia, 429 rate limit): sin esto el loop giraba
        // caliente y en silencio. Backoff y log claro; retry_after si Telegram lo manda.
        const wait = Math.max(3, Number(updates.parameters?.retry_after || 0)) * 1000;
        console.error(`telegram getUpdates: [${updates.error_code}] ${updates.description || "error"} (espero ${wait / 1000}s)`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      for (const u of updates.result || []) {
        offset = Math.max(offset, u.update_id + 1);
        saveOffset(offset);
        if (u.message) await command(u.message).catch((e) => sendMessage(u.message.chat.id, `Error: ${e.message}`).catch(() => {}));
        if (u.callback_query) await handleCallback(u.callback_query).catch((e) => {
          const cid = u.callback_query.message?.chat?.id;
          if (cid) sendMessage(cid, `Error: ${e.message}`).catch(() => {});
        });
      }
    } catch (e) {
      console.error("telegram:", e?.message || e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
