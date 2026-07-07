// dev/reload-server.mjs
// Dev-server de auto-reload. Vigila los archivos de la extension y, ante cualquier
// cambio, avisa por WebSocket al service worker para que llame chrome.runtime.reload().
// WebSocket implementado a mano (cero dependencias npm). Solo para desarrollo.
//
//   node dev/reload-server.mjs      (o: npm run dev)
//
// Mantenlo corriendo en una terminal mientras editas la extension.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { slugify } from "../shared/slug.mjs";   // FUENTE UNICA del slug (debe coincidir con la extension y el render)
import { getMediaRequirements, projectMediaSignature } from "../shared/media-requirements.mjs";
import { validateQueueProject } from "../lib/queue-validator.js";

const PORT = Number(process.env.FLOW_DEV_PORT) || 35729;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// Carpetas/archivos que NO disparan reload. (remotion-editor incluido: escribir audio/clips ahi
// NO debe recargar la extension.)
const IGNORE = [/[\\/]dev[\\/]/, /[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]tests[\\/]/, /[\\/]remotion-editor[\\/]/, /\.output$/];

// Solo se permite escribir dentro de esta carpeta via POST /save (sink de medios de la extension).
const PUBLIC_DIR = path.join(ROOT, "remotion-editor", "public");
const V3_AUDIO_CLEANUP_FILTER = process.env.ELEVENLABS_V3_AUDIO_CLEANUP_FILTER
  || "highpass=f=80,lowpass=f=12000,afftdn=nr=10:nf=-45:tn=1:gs=8,"
  + "deesser=i=0.25:m=0.5:f=0.45,"
  + "acompressor=threshold=0.08:ratio=1.6:attack=8:release=120,"
  + "alimiter=limit=0.95";

const clients = new Set();

// --- WebSocket minimo (solo enviamos frames de texto del server al cliente) ---

function wsAccept(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

function encodeTextFrame(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function broadcast(text) {
  const frame = encodeTextFrame(text);
  for (const sock of clients) {
    try { sock.write(frame); } catch { clients.delete(sock); }
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const remote = {
  state: null,
  stateUpdatedAt: 0,
  commandSeq: 0,
  commands: [],
  eventSeq: 0,
  events: [],
};

function readJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error("body demasiado grande")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

function pushRemoteEvent(event) {
  const item = { id: ++remote.eventSeq, ts: Date.now(), ...event };
  remote.events.push(item);
  if (remote.events.length > 200) remote.events.splice(0, remote.events.length - 200);
  return item;
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // POST /save?path=<rel> : la extension escribe un medio (ej. audio mp3) en la carpeta del proyecto.
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && u.pathname === "/remote/state") {
    sendJson(res, { ok: true, updatedAt: remote.stateUpdatedAt, state: remote.state });
    return;
  }

  if (req.method === "POST" && u.pathname === "/remote/state") {
    readJsonBody(req).then((body) => {
      remote.state = body?.state || body || null;
      remote.stateUpdatedAt = Date.now();
      sendJson(res, { ok: true });
    }).catch((e) => sendJson(res, { ok: false, error: String(e?.message || e) }, 400));
    return;
  }

  if (req.method === "POST" && u.pathname === "/remote/event") {
    readJsonBody(req).then((body) => {
      const item = pushRemoteEvent(body || {});
      sendJson(res, { ok: true, event: item });
    }).catch((e) => sendJson(res, { ok: false, error: String(e?.message || e) }, 400));
    return;
  }

  if (req.method === "GET" && u.pathname === "/remote/events") {
    const since = Number(u.searchParams.get("since") || 0);
    sendJson(res, { ok: true, events: remote.events.filter((e) => e.id > since), lastId: remote.eventSeq });
    return;
  }

  if (req.method === "POST" && u.pathname === "/remote/command") {
    readJsonBody(req).then((body) => {
      const command = String(body?.command || "").trim().toLowerCase();
      if (!command) return sendJson(res, { ok: false, error: "command requerido" }, 400);
      const item = { id: ++remote.commandSeq, ts: Date.now(), command, args: body?.args || {}, source: body?.source || "remote" };
      remote.commands.push(item);
      if (remote.commands.length > 200) remote.commands.splice(0, remote.commands.length - 200);
      log(`remote command #${item.id}: ${command}`);
      sendJson(res, { ok: true, command: item });
    }).catch((e) => sendJson(res, { ok: false, error: String(e?.message || e) }, 400));
    return;
  }

  if (req.method === "GET" && u.pathname === "/remote/commands") {
    const since = Number(u.searchParams.get("since") || 0);
    sendJson(res, { ok: true, commands: remote.commands.filter((c) => c.id > since), lastId: remote.commandSeq });
    return;
  }

  if (req.method === "POST" && u.pathname === "/queue/add") {
    readJsonBody(req).then((body) => {
      const p = body?.json;
      if (!p || typeof p !== "object" || Array.isArray(p)) return sendJson(res, { ok: false, error: "json requerido" }, 400);
      const checked = validateQueueProject(p, { fileExists: queueAssetExists });
      if (!checked.ok) return sendJson(res, { ok: false, error: "JSON invalido", errors: checked.errors }, 400);
      const rawName = body?.name || p.project?.slug || p.project?.title || "telegram_job";
      const name = slugify(String(rawName)).slice(0, 120) || `telegram_${Date.now()}`;
      const dest = path.join(QUEUE_DIR, `${name}.json`);
      if (fs.existsSync(dest) && !body?.overwrite) return sendJson(res, { ok: false, error: "ya existe", name }, 409);
      fs.mkdirSync(QUEUE_DIR, { recursive: true });
      fs.writeFileSync(dest, JSON.stringify(p, null, 2), "utf8");
      log(`cola: JSON agregado por remoto -> ${path.relative(ROOT, dest)}`);
      sendJson(res, { ok: true, name, path: path.relative(ROOT, dest), warnings: checked.warnings || [] });
    }).catch((e) => sendJson(res, { ok: false, error: String(e?.message || e) }, 400));
    return;
  }

  if (req.method === "POST" && u.pathname === "/save") {
    const rel = u.searchParams.get("path") || "";
    const dest = path.resolve(ROOT, rel);
    // Seguridad: solo dentro de remotion-editor/public (nada de ../ fuera del proyecto).
    if (dest !== PUBLIC_DIR && !dest.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("ruta no permitida");
      log(`RECHAZADO (fuera de public): ${rel}`);
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const buf = Buffer.concat(chunks);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: path.relative(ROOT, dest) }));
        log(`guardado ${path.relative(ROOT, dest)} (${buf.length} bytes)`);
      } catch (e) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(e?.message || e));
        log(`ERROR guardando ${rel}: ${e?.message || e}`);
      }
    });
    req.on("error", () => { try { res.writeHead(400); res.end("bad request"); } catch { /* noop */ } });
    return;
  }

  // POST /audio/cleanup-v3?path=<rel>&output_format=mp3_44100_192
  // Aplica el mismo filtro suave que tts/tts_elevenlabs.py al MP3 V3 guardado por la extension.
  if (req.method === "POST" && u.pathname === "/audio/cleanup-v3") {
    const rel = u.searchParams.get("path") || "";
    const outputFormat = u.searchParams.get("output_format") || "mp3_44100_192";
    const target = path.resolve(ROOT, rel);
    if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("ruta no permitida");
      log(`RECHAZADO cleanup-v3 (fuera de public): ${rel}`);
      return;
    }
    if (!fs.existsSync(target) || path.extname(target).toLowerCase() !== ".mp3") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("mp3 no existe");
      return;
    }
    const m = /^mp3_(\d+)_(\d+)$/i.exec(outputFormat);
    const ar = m ? m[1] : "44100";
    const br = m ? `${m[2]}k` : "192k";
    const parsed = path.parse(target);
    const raw = path.join(parsed.dir, `${parsed.name}.raw-v3${parsed.ext}`);
    const tmp = path.join(parsed.dir, `${parsed.name}.cleaning${parsed.ext}`);
    try {
      fs.copyFileSync(target, raw);
      const r = spawnSync("ffmpeg", ["-y", "-i", raw, "-af", V3_AUDIO_CLEANUP_FILTER,
        "-ar", ar, "-c:a", "libmp3lame", "-b:a", br, tmp], { encoding: "utf8" });
      if (r.status !== 0) throw new Error((r.stderr || r.stdout || `ffmpeg ${r.status}`).trim());
      fs.renameSync(tmp, target);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: path.relative(ROOT, target), backup: path.relative(ROOT, raw) }));
      log(`cleanup-v3 ${path.relative(ROOT, target)} -> ${ar}Hz/${br}`);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* noop */ }
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e?.message || e));
      log(`ERROR cleanup-v3 ${rel}: ${e?.message || e}`);
    }
    return;
  }

  // POST /audio/generate-eleven : genera/recupera public/<slug>/voice/full.mp3 desde Node, no desde
  // el service worker. Esto evita que Chrome MV3 mate la extension despues de gastar ElevenLabs.
  if (req.method === "POST" && u.pathname === "/audio/generate-eleven") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const jobName = String(body.jobName || "").trim();
        const remotionRoot = path.join(ROOT, "remotion-editor");
        let jsonPath = jobName ? queueJsonPath(jobName) : null;
        let label = jobName;
        if (body.projectJson && typeof body.projectJson === "object" && !Array.isArray(body.projectJson)) {
          const slug = slugify(body.projectJson?.project?.slug || body.projectJson?.project?.title || "manual");
          const tmpDir = path.join(remotionRoot, "tmp", "eleven-manual");
          fs.mkdirSync(tmpDir, { recursive: true });
          jsonPath = path.join(tmpDir, `${slug}.json`);
          fs.writeFileSync(jsonPath, JSON.stringify(body.projectJson, null, 2), "utf8");
          label = `manual:${slug}`;
        }
        if (!jsonPath || !fs.existsSync(jsonPath)) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `job no encontrado: ${jobName || "(vacio)"}` }));
          return;
        }
        let secrets = {};
        try { secrets = JSON.parse(fs.readFileSync(path.join(ROOT, "secrets.local.json"), "utf8").replace(/^ï»¿/, "")); } catch { /* noop */ }
        const key = String(secrets.elevenApiKey || "").trim();
        if (!key) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "falta elevenApiKey en secrets.local.json" }));
          return;
        }
        const py = fs.existsSync(path.join(remotionRoot, ".venv-eleven", "Scripts", "python.exe"))
          ? path.join(remotionRoot, ".venv-eleven", "Scripts", "python.exe")
          : "python";
        const relJson = path.relative(remotionRoot, jsonPath);
        log(`audio/generate-eleven: ${label} -> ${relJson}`);
        const r = spawnSync(py, ["tts/tts_elevenlabs.py", relJson], {
          cwd: remotionRoot,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
          timeout: Number(process.env.ELEVENLABS_NODE_TIMEOUT_MS || 20 * 60_000),
          env: {
            ...process.env,
            ELEVENLABS_API_KEY: key,
            ELEVENLABS_MAX_CONCURRENCY: process.env.ELEVENLABS_MAX_CONCURRENCY || "1",
          },
        });
        const ok = r.status === 0;
        if (!ok) log(`ERROR audio/generate-eleven ${label}: exit ${r.status ?? "error"}`);
        res.writeHead(ok ? 200 : 500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          ok,
          exitCode: r.status,
          error: r.error?.message || null,
          stdout: (r.stdout || "").slice(-4000),
          stderr: (r.stderr || "").slice(-4000),
        }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    });
    req.on("error", () => { try { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "bad request" })); } catch { /* noop */ } });
    return;
  }

  // POST /project/prepare-media : si el mismo slug se reutiliza con un JSON distinto,
  // archiva medios generados anteriores para no mezclar clips/stills/voz viejos con la corrida nueva.
  if (req.method === "POST" && u.pathname === "/project/prepare-media") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const p = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        const out = prepareProjectMedia(p);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...out }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    });
    req.on("error", () => { try { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "bad request" })); } catch { /* noop */ } });
    return;
  }

  // POST /move?from=<abs>&to=<rel> : mueve un archivo YA descargado (ej. clip de Flow en Descargas)
  // a la carpeta del proyecto. `from` = ruta absoluta (la da chrome.downloads.search en la extension).
  if (req.method === "POST" && u.pathname === "/move") {
    const from = u.searchParams.get("from") || "";
    const rel = u.searchParams.get("to") || "";
    const dest = path.resolve(ROOT, rel);
    if (dest !== PUBLIC_DIR && !dest.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("destino no permitido");
      log(`RECHAZADO move (fuera de public): ${rel}`);
      return;
    }
    try {
      if (!from || !fs.existsSync(from)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("origen no existe");
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(from, dest);
      // Integridad: si el archivo movido es sospechosamente pequeno (truncado/corrupto), lo descartamos
      // y NO borramos el origen (queda en Descargas para reintentar) -> savedOk=false aguas arriba.
      if (!fileOk(dest)) {
        const sz = (() => { try { return fs.statSync(dest).size; } catch { return 0; } })();
        try { fs.rmSync(dest, { force: true }); } catch { /* noop */ }
        res.writeHead(422, { "content-type": "text/plain" });
        res.end("archivo demasiado pequeno (posible corrupto/incompleto)");
        log(`RECHAZADO move (${sz}B < minimo): ${path.relative(ROOT, dest)} (origen conservado)`);
        return;
      }
      try { fs.unlinkSync(from); } catch { /* si Chrome aun lo tiene tomado, no es critico: queda copia en Descargas */ }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: path.relative(ROOT, dest) }));
      log(`movido ${path.basename(from)} -> ${path.relative(ROOT, dest)}`);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e?.message || e));
      log(`ERROR moviendo ${rel}: ${e?.message || e}`);
    }
    return;
  }

  // POST /asset/move?from=<abs>&to=<rel> : guarda una imagen generada como asset recurrente.
  // Solo permite escribir dentro de assets/. Si Grok entrega .jpg y el JSON pedia .png, guarda
  // el mismo basename como .jpg; el pipeline resuelve variantes de extension al consumirlo.
  if (req.method === "POST" && u.pathname === "/asset/move") {
    const from = u.searchParams.get("from") || "";
    const rel = u.searchParams.get("to") || "";
    const requested = path.resolve(ROOT, rel);
    const ASSETS = path.join(ROOT, "assets");
    const requestedExt = path.extname(requested).toLowerCase();
    if (requested === ASSETS || !requested.startsWith(ASSETS + path.sep) || ![".png", ".jpg", ".jpeg", ".webp"].includes(requestedExt)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("destino asset no permitido");
      log(`RECHAZADO asset/move: ${rel}`);
      return;
    }
    try {
      if (!from || !fs.existsSync(from)) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("origen no existe");
        return;
      }
      const sourceExt = path.extname(from).toLowerCase();
      const finalExt = [".png", ".jpg", ".jpeg", ".webp"].includes(sourceExt) ? sourceExt : requestedExt;
      const dest = path.join(path.dirname(requested), path.basename(requested, requestedExt) + finalExt);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(from, dest);
      if (!fileOk(dest)) {
        const sz = (() => { try { return fs.statSync(dest).size; } catch { return 0; } })();
        try { fs.rmSync(dest, { force: true }); } catch { /* noop */ }
        res.writeHead(422, { "content-type": "text/plain" });
        res.end("asset demasiado pequeno (posible corrupto/incompleto)");
        log(`RECHAZADO asset/move (${sz}B < minimo): ${path.relative(ROOT, dest)}`);
        return;
      }
      try { fs.unlinkSync(from); } catch { /* no critico */ }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: path.relative(ROOT, dest), abspath: dest }));
      log(`asset guardado ${path.relative(ROOT, dest)}`);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e?.message || e));
      log(`ERROR asset/move ${rel}: ${e?.message || e}`);
    }
    return;
  }

  // GET /secrets : la extension carga aqui la API key de Fish (y lo que pongas) desde
  // secrets.local.json en la raiz. NO se versiona. Si no existe, devuelve {}.
  if (req.method === "GET" && u.pathname === "/secrets") {
    let out = {};
    try {
      const raw = fs.readFileSync(path.join(ROOT, "secrets.local.json"), "utf8").replace(/^﻿/, "");
      out = JSON.parse(raw);
    } catch { /* sin archivo -> {} */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
    return;
  }

  // GET /queue : lista los trabajos de remotion-editor/queue/ (JSON sueltos o <carpeta>/project.json)
  // con un flag mediaComplete (¿ya estan TODOS los clips+voz en public/<slug>/?). La extension toma
  // el primer trabajo con mediaComplete=false y genera los medios; cuando estan, build.mjs renderiza.
  // Excluye los que tienen <json>.lock (ya tomados por la extension) para que NO se repitan.
  if (req.method === "GET" && u.pathname === "/queue") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(listQueue()));
    return;
  }

  // POST /queue/claim?name=X : la extension "reclama" un trabajo creando X.json.lock en disco.
  // Asi /queue deja de listarlo (no se repite) aunque el service worker se reinicie. build.mjs
  // borra el lock al renderizar+mover a done. Devuelve {ok:false} si ya estaba tomado (carrera).
  if (req.method === "POST" && u.pathname === "/queue/claim") {
    const name = u.searchParams.get("name") || "";
    const jp = queueJsonPath(name);
    res.writeHead(200, { "content-type": "application/json" });
    if (!jp) { res.end(JSON.stringify({ ok: false, error: "no existe en la cola" })); return; }
    const lock = jp + ".lock";
    if (fs.existsSync(lock)) { res.end(JSON.stringify({ ok: false, error: "ya tomado" })); return; }
    const checked = readQueueJob(name, jp);
    if (!checked.valid) {
      res.end(JSON.stringify({ ok: false, error: "JSON invalido", errors: checked.errors }));
      return;
    }
    try { fs.writeFileSync(lock, new Date().toISOString()); log(`cola: ${name} reclamado por la extension`); }
    catch (e) { res.end(JSON.stringify({ ok: false, error: String(e?.message || e) })); return; }
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /queue/heartbeat?name=X : la extension "toca" el lock mientras procesa el trabajo (mantiene
  // su mtime fresco). Asi un lock rancio (>LOCK_STALE_MS sin heartbeat) = corrida muerta -> se relista.
  if (req.method === "POST" && u.pathname === "/queue/heartbeat") {
    const name = u.searchParams.get("name") || "";
    const jp = queueJsonPath(name);
    res.writeHead(200, { "content-type": "application/json" });
    if (!jp) { res.end(JSON.stringify({ ok: false })); return; }
    const lock = jp + ".lock";
    try { if (fs.existsSync(lock)) { const t = new Date(); fs.utimesSync(lock, t, t); } res.end(JSON.stringify({ ok: true })); }
    catch { res.end(JSON.stringify({ ok: false })); }
    return;
  }

  // GET /charfile?path=<rel> : devuelve la ruta ABSOLUTA de una imagen de personaje (en assets/),
  // para que el SW la suba a Flow via CDP (DOM.setFileInputFiles necesita ruta absoluta del disco).
  if (req.method === "GET" && u.pathname === "/charfile") {
    const rel = u.searchParams.get("path") || "";
    const abs = path.resolve(ROOT, rel);
    // Seguridad: solo dentro de assets/.
    const ASSETS = path.join(ROOT, "assets");
    if (abs !== ASSETS && !abs.startsWith(ASSETS + path.sep)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "fuera de assets/" }));
      return;
    }
    // Agnostico a la extension: si la ruta exacta no existe, prueba el mismo nombre con otras
    // extensiones de imagen (asi da igual si el personaje es .png/.jpg/.jpeg/.webp).
    let found = fs.existsSync(abs) ? abs : null;
    if (!found) {
      const dir = path.dirname(abs);
      const base = path.basename(abs, path.extname(abs));
      for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
        const alt = path.join(dir, base + ext);
        if (fs.existsSync(alt) && alt.startsWith(ASSETS + path.sep)) { found = alt; break; }
      }
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(found ? { ok: true, abspath: found } : { ok: false, error: "no existe" }));
    return;
  }

  // GET /filebytes?path=<rel> : devuelve los BYTES de un archivo local (solo dentro de assets/ o
  // remotion-editor/public/), con CORS, para que una pagina (ej. grok.com) lo cargue como File y lo
  // suba como referencia, o reuse un clip/imagen ya guardado. Solo lectura.
  if (req.method === "GET" && u.pathname === "/filebytes") {
    const rel = u.searchParams.get("path") || "";
    const abs = path.resolve(ROOT, rel);
    const ASSETS = path.join(ROOT, "assets");
    const inAssets = abs.startsWith(ASSETS + path.sep);
    const inPublic = abs.startsWith(PUBLIC_DIR + path.sep);
    if (!(inAssets || inPublic) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no encontrado o fuera de assets/ y public/");
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mp3": "audio/mpeg" }[ext] || "application/octet-stream";
    try {
      const buf = fs.readFileSync(abs);
      res.writeHead(200, { "content-type": mime, "content-length": buf.length });
      res.end(buf);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e?.message || e));
    }
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("flow-dev-reload ok");
});

// --- Cola: replica la deteccion de medios de orchestrator/build.mjs (clips + voz por escena) ---

const QUEUE_DIR = path.join(ROOT, "remotion-editor", "queue");
const PUBLIC_SLUGS = path.join(ROOT, "remotion-editor", "public");
const ASSETS_DIR = path.join(ROOT, "assets");
const invalidQueueLog = new Map();
// Un lock sin heartbeat por mas de esto = corrida muerta (SW murio / onRunAll aborto) -> se relista
// el trabajo en vez de quedar invisible para siempre. Holgado para no relistar uno legitimamente lento.
const LOCK_STALE_MS = 15 * 60 * 1000;

// Tamano minimo plausible por tipo: atrapa descargas truncadas / archivos de 0 bytes sin ffprobe.
// Critico: `savedOk` y `mediaComplete` deben significar "archivo usable", no solo "existe" — si no,
// el render usa un clip roto y `cleanupFlowAfterDownload` borra la fuente cara confiando en un 0-byte.
function minBytesFor(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".mp4") return 50 * 1024;   // clip de video
  if (ext === ".mp3") return 2 * 1024;     // voz
  // Grok a veces descarga un placeholder de ruido de ~70-88KB antes del still real.
  // 90KB mantiene ese bloqueo sin rechazar assets validos que quedan apenas debajo de 100KB.
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return 90 * 1024;
  return 1;
}
function fileOk(p) {
  try { return fs.statSync(p).size >= minBytesFor(p); } catch { return false; }
}

const GENERATED_DIRS = ["images", "clips", "clips_raw", "voice"];

function mediaSignaturePath(slug) {
  return path.join(PUBLIC_SLUGS, slug, ".media-signature.json");
}

function readMediaSignature(slug) {
  try { return JSON.parse(fs.readFileSync(mediaSignaturePath(slug), "utf8")); } catch { return null; }
}

function writeMediaSignature(slug, signature, reason = "prepare") {
  const dir = path.join(PUBLIC_SLUGS, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mediaSignaturePath(slug), JSON.stringify({
    signature,
    reason,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

function generatedMediaExists(slug) {
  const base = path.join(PUBLIC_SLUGS, slug);
  return GENERATED_DIRS.some((d) => {
    const dir = path.join(base, d);
    try { return fs.existsSync(dir) && fs.readdirSync(dir).length > 0; } catch { return false; }
  });
}

function prepareProjectMedia(p) {
  const slug = p.project?.slug || slugify(p.project?.title || "project");
  const signature = projectMediaSignature(p);
  const current = readMediaSignature(slug);
  const base = path.join(PUBLIC_SLUGS, slug);
  let archived = false;
  let archiveRel = null;
  if (current && current.signature !== signature && generatedMediaExists(slug)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archive = path.join(base, "_media_archive", stamp);
    fs.mkdirSync(archive, { recursive: true });
    for (const d of GENERATED_DIRS) {
      const src = path.join(base, d);
      if (!fs.existsSync(src)) continue;
      fs.renameSync(src, path.join(archive, d));
    }
    archived = true;
    archiveRel = path.relative(ROOT, archive);
    log(`media reset ${slug}: ${current ? "firma distinta" : "sin firma previa"} -> ${archiveRel}`);
  }
  const reason = archived ? "archived-old-media"
    : !current && generatedMediaExists(slug) ? "adopted-existing-media"
      : "matched-or-empty";
  writeMediaSignature(slug, signature, reason);
  return { slug, signature, archived, archive: archiveRel };
}

function mediaComplete(p) {
  const { slug, requirements } = getMediaRequirements(p);
  const complete = requirements.every((r) => fileOk(path.join(PUBLIC_SLUGS, r.path)));
  if (!complete) return false;
  if (generatedMediaExists(slug)) return mediaSignatureOkOrAdopted(p, true);
  return true;
}

function mediaStatus(p, name) {
  const { slug, requirements } = getMediaRequirements(p, { fallbackName: name });
  const missingMedia = requirements.filter((r) => !fileOk(path.join(PUBLIC_SLUGS, r.path))).map((r) => r.path);
  if (generatedMediaExists(slug) && !mediaSignatureOkOrAdopted(p, missingMedia.length === 0)) {
    missingMedia.unshift(`${slug}/.media-signature.json`);
  }
  return { slug, mediaComplete: missingMedia.length === 0, missingMedia };
}

function mediaSignatureOkOrAdopted(p, canAdoptMissing) {
  const slug = p.project?.slug || slugify(p.project?.title || "project");
  const signature = projectMediaSignature(p);
  const current = readMediaSignature(slug);
  if (current?.signature === signature) return true;
  if (!current && canAdoptMissing) {
    writeMediaSignature(slug, signature, "adopted-existing-complete-media");
    return true;
  }
  return false;
}

function queueAssetExists(rel) {
  const abs = path.resolve(ROOT, rel || "");
  if (!(abs === ASSETS_DIR || abs.startsWith(ASSETS_DIR + path.sep))) return false;
  try { return fs.statSync(abs).isFile(); } catch { return false; }
}

function logInvalidQueueJob(name, jsonPath, errors) {
  let mtime = 0;
  try { mtime = fs.statSync(jsonPath).mtimeMs; } catch { /* noop */ }
  const sig = `${mtime}:${errors.join("|")}`;
  if (invalidQueueLog.get(name) === sig) return;
  invalidQueueLog.set(name, sig);
  log(`cola: "${name}" INVALIDO -> ${errors.slice(0, 3).join(" | ")}`);
}

function readQueueJob(name, jsonPath) {
  let p = null;
  try {
    p = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "").replace(/^ï»¿/, ""));
  } catch (e) {
    const errors = [`JSON parse error: ${e?.message || e}`];
    logInvalidQueueJob(name, jsonPath, errors);
    return { name, valid: false, runnable: false, errors, warnings: [], mediaComplete: false };
  }
  const checked = validateQueueProject(p, { fileExists: queueAssetExists });
  if (!checked.ok) {
    logInvalidQueueJob(name, jsonPath, checked.errors);
    return {
      name,
      slug: p.project?.slug || slugify(p.project?.title || name),
      valid: false,
      runnable: false,
      errors: checked.errors,
      warnings: checked.warnings,
      mediaComplete: false,
      provider: "grok",
      preset: p.project?.preset || "",
    };
  }
  const media = mediaStatus(p, name);
  return {
    name,
    slug: media.slug,
    json: p,
    valid: true,
    runnable: !media.mediaComplete,
    errors: [],
    warnings: checked.warnings,
    mediaComplete: media.mediaComplete,
    missingMedia: media.missingMedia,
    provider: "grok",
    preset: checked.preset,
  };
}

// Resuelve un nombre de trabajo a la ruta de su JSON (suelto o <carpeta>/project.json).
function queueJsonPath(name) {
  const asDir = path.join(QUEUE_DIR, name, "project.json");
  if (fs.existsSync(asDir)) return asDir;
  const asFile = path.join(QUEUE_DIR, name + ".json");
  if (fs.existsSync(asFile)) return asFile;
  return null;
}

function listQueue() {
  const jobs = [];
  if (!fs.existsSync(QUEUE_DIR)) return jobs;
  for (const entry of fs.readdirSync(QUEUE_DIR, { withFileTypes: true })) {
    let name = null, jsonPath = null;
    if (entry.isDirectory()) {
      const pj = path.join(QUEUE_DIR, entry.name, "project.json");
      if (fs.existsSync(pj)) { name = entry.name; jsonPath = pj; }
    } else if (entry.name.endsWith(".json")) {
      name = entry.name.replace(/\.json$/, ""); jsonPath = path.join(QUEUE_DIR, entry.name);
    }
    if (!jsonPath) continue;
    const lock = jsonPath + ".lock";
    if (fs.existsSync(lock)) {
      // Tomado por la extension -> no repetir... salvo que el lock este RANCIO (corrida muerta): relista.
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age < LOCK_STALE_MS) continue;
        fs.rmSync(lock, { force: true });
        log(`cola: lock rancio de "${name}" (${Math.round(age / 60000)} min) -> relistado`);
      } catch { continue; }
    }
    try {
      const p = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, ""));
      jobs.push({ name, slug: p.project?.slug || slugify(p.project?.title), json: p, mediaComplete: mediaComplete(p) });
    } catch { /* JSON invalido: lo ignora */ }
  }
  return jobs;
}

function listQueueValidated() {
  const jobs = [];
  if (!fs.existsSync(QUEUE_DIR)) return jobs;
  for (const entry of fs.readdirSync(QUEUE_DIR, { withFileTypes: true })) {
    let name = null, jsonPath = null;
    if (entry.isDirectory()) {
      const pj = path.join(QUEUE_DIR, entry.name, "project.json");
      if (fs.existsSync(pj)) { name = entry.name; jsonPath = pj; }
    } else if (entry.name.endsWith(".json")) {
      name = entry.name.replace(/\.json$/, ""); jsonPath = path.join(QUEUE_DIR, entry.name);
    }
    if (!jsonPath) continue;
    const lock = jsonPath + ".lock";
    if (fs.existsSync(lock)) {
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age < LOCK_STALE_MS) continue;
        fs.rmSync(lock, { force: true });
        log(`cola: lock rancio de "${name}" (${Math.round(age / 60000)} min) -> relistado`);
      } catch { continue; }
    }
    jobs.push(readQueueJob(name, jsonPath));
  }
  return jobs;
}

listQueue = listQueueValidated;

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return; }
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
  );
  clients.add(socket);
  log(`cliente conectado (${clients.size})`);
  socket.on("data", () => {});                 // ignoramos frames entrantes
  socket.on("close", () => { clients.delete(socket); });
  socket.on("error", () => { clients.delete(socket); });
});

server.listen(PORT, "127.0.0.1", () => {   // solo loopback: nada de exposicion a la LAN
  log(`escuchando en ws://localhost:${PORT}  (raiz: ${ROOT})`);
  log("edita archivos de la extension y se recargara sola. Ctrl+C para parar.");
});

// --- Watcher con debounce ---

let timer = null;
let pending = new Set();

fs.watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const rel = filename.toString();
  if (IGNORE.some((re) => re.test(path.sep + rel))) return;
  pending.add(rel);
  clearTimeout(timer);
  timer = setTimeout(() => {
    log(`cambios: ${[...pending].join(", ")} -> reload`);
    pending.clear();
    broadcast("reload");
  }, 150);
});

// --- Heartbeat: mantiene vivo el service worker MV3 (la actividad WS resetea su idle timer) ---

setInterval(() => broadcast("ping"), 20000);

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[dev-reload ${t}] ${msg}`);
}
