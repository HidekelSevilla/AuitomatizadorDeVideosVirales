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

async function sendMessage(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text: String(text).slice(0, 3900) });
}

function formatHelp() {
  return [
    "Flowbot - comandos disponibles",
    "",
    "Estado:",
    "/status o /estado - ver proyecto, fase y progreso",
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
    "",
    "Cola:",
    "/cola_on - activa modo cola",
    "/cola_off - desactiva modo cola",
    "",
    "Capturas:",
    "/panel - captura solo el panel derecho",
    "/shot - captura toda la pantalla",
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
  return new Promise((resolve, reject) => {
    const boundary = "----flowbot" + Date.now().toString(16);
    const file = fs.readFileSync(filePath);
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="screenshot.png"\r\nContent-Type: image/png\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const body = Buffer.concat(parts);
    const req = https.request(tgUrl("sendPhoto"), {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const out = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          out.ok ? resolve(out.result) : reject(new Error(out.description || "sendPhoto fallo"));
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function allowedMessage(msg) {
  if (!allowed.size) return /^\/whoami\b/i.test(msg.text || "");
  return allowed.has(String(msg.from?.id || "")) || allowed.has(String(msg.chat?.id || ""));
}

async function localJson(method, pathName, body = null) {
  return requestJson(method, `${SERVER}${pathName}`, body);
}

async function queueJson(p, name) {
  return localJson("POST", "/queue/add", { json: p, name });
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

async function command(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (/^\/whoami\b/i.test(text)) return sendMessage(chatId, `chat_id=${chatId}\nuser_id=${msg.from?.id}`);
  if (!allowedMessage(msg)) return sendMessage(chatId, `No autorizado. user_id=${msg.from?.id} chat_id=${chatId}`);
  if (msg.document) return handleDocument(msg);
  if (text.startsWith("{")) return handleJsonPayload(chatId, text, "telegram_json");

  const cmd = text.split(/\s+/)[0].toLowerCase();
  if (["/start", "/help", "/ayuda", "/comandos", "/commands"].includes(cmd)) return sendMessage(chatId, formatHelp());
  const map = {
    "/pausar": "pause", "/pause": "pause",
    "/reanudar": "resume", "/resume": "resume",
    "/reintentar": "retry", "/retry": "retry",
    "/saltar": "skip", "/skip": "skip",
    "/detener": "stop", "/stop": "stop",
    "/cola_on": "queue_on", "/queue_on": "queue_on",
    "/cola_off": "queue_off", "/queue_off": "queue_off",
    "/todo": "run_all", "/run_all": "run_all",
  };
  if (map[cmd]) {
    const out = await localJson("POST", "/remote/command", { command: map[cmd], source: "telegram" });
    return sendMessage(chatId, out.ok ? `Comando enviado: ${commandLabel(map[cmd])}` : `No pude enviar: ${out.error}`);
  }
  if (cmd === "/ping" || cmd === "/salud") {
    const st = await localJson("GET", "/remote/state").catch((e) => ({ ok: false, error: e.message }));
    const age = st?.updatedAt ? `${Math.round((Date.now() - Number(st.updatedAt)) / 1000)}s` : "sin snapshot";
    return sendMessage(chatId, `Bridge Telegram OK.\nServidor local: ${st?.ok ? "OK" : "sin respuesta"}\nSnapshot: ${age}`);
  }
  if (cmd === "/status" || cmd === "/estado") {
    const st = await localJson("GET", "/remote/state");
    const q = await localJson("GET", "/queue");
    return sendMessage(chatId, formatStatus(st, Array.isArray(q) ? q : []));
  }
  if (cmd === "/errores" || cmd === "/fallos" || cmd === "/errors") {
    const st = await localJson("GET", "/remote/state");
    return sendMessage(chatId, formatErrors(st));
  }
  if (cmd === "/logs" || cmd === "/log") {
    const st = await localJson("GET", "/remote/state");
    return sendMessage(chatId, formatLogs(st));
  }
  if (cmd === "/queue" || cmd === "/cola") {
    const q = await localJson("GET", "/queue");
    return sendMessage(chatId, formatQueueJobs(q));
  }
  if (cmd === "/shot" || cmd === "/screenshot" || cmd === "/panel") {
    const file = captureScreen(cmd === "/panel");
    try { await multipartSendPhoto(chatId, file, cmd === "/panel" ? "Panel derecho" : "Pantalla"); }
    finally { try { fs.rmSync(file, { force: true }); } catch {} }
    return;
  }
  return sendMessage(chatId, `No reconozco "${cmd || text}". Usa /help para ver comandos.`);
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
  for (const e of out.events) {
    lastEventId = Math.max(lastEventId, Number(e.id || 0));
    if (e.level === "debug") continue;
    const snap = e.snapshot;
    const extra = snap?.activeIngredient ? `\nIngrediente: ${snap.activeIngredient.id} ${snap.activeIngredient.status}` : "";
    await sendMessage(defaultChatId, `[${e.level || "info"}] ${e.message || ""}${extra}`.trim()).catch(() => {});
  }
}

async function main() {
  await initEvents();
  if (defaultChatId) await sendMessage(defaultChatId, "Flowbot Telegram activo. Usa /help para ver comandos.").catch(() => {});
  let offset = 0;
  setInterval(() => pollEvents().catch(() => {}), 5000);
  for (;;) {
    try {
      const updates = await requestJson("POST", tgUrl("getUpdates"), { offset, timeout: 25, allowed_updates: ["message"] });
      for (const u of updates.result || []) {
        offset = Math.max(offset, u.update_id + 1);
        if (u.message) await command(u.message).catch((e) => sendMessage(u.message.chat.id, `Error: ${e.message}`).catch(() => {}));
      }
    } catch (e) {
      console.error("telegram:", e?.message || e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
