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
import { slugify } from "../shared/slug.mjs";   // FUENTE UNICA del slug (debe coincidir con la extension y el render)

const PORT = Number(process.env.FLOW_DEV_PORT) || 35729;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// Carpetas/archivos que NO disparan reload. (remotion-editor incluido: escribir audio/clips ahi
// NO debe recargar la extension.)
const IGNORE = [/[\\/]dev[\\/]/, /[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]tests[\\/]/, /[\\/]remotion-editor[\\/]/, /\.output$/];

// Solo se permite escribir dentro de esta carpeta via POST /save (sink de medios de la extension).
const PUBLIC_DIR = path.join(ROOT, "remotion-editor", "public");

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // POST /save?path=<rel> : la extension escribe un medio (ej. audio mp3) en la carpeta del proyecto.
  const u = new URL(req.url, `http://localhost:${PORT}`);
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
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return 4 * 1024;
  return 1;
}
function fileOk(p) {
  try { return fs.statSync(p).size >= minBytesFor(p); } catch { return false; }
}

function mediaComplete(p) {
  const slug = p.project?.slug || slugify(p.project?.title);
  const base = path.join(PUBLIC_SLUGS, slug);
  // schema nuevo historias: render_export.clip_order + scene_id. historias = image-only (images/<id>.jpg)
  // + voz continua (voice/full.mp3); otros presets = clips/<id>.mp4 + voz por escena (igual que antes).
  const stills = p.project?.preset === "historias";
  const order = p.render_export?.clip_order || p.capcut_export?.clip_order || (p.scenes || []).map((s) => s.id ?? s.scene_id);
  const need = [];
  for (const id of order) {
    need.push(path.join(base, stills ? "images" : "clips", `${id}.${stills ? "jpg" : "mp4"}`));
    if (!stills) need.push(path.join(base, "voice", `${id}.mp3`));
  }
  if (stills) need.push(path.join(base, "voice", "full.mp3"));
  if (p.hook) need.push(path.join(base, "voice", "hook.mp3"));
  return [...new Set(need)].every(fileOk);   // existe Y tamano plausible (no 0-byte/truncado)
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
