// Recupera la VOZ (Fish Audio) de un proyecto SIN la extension. Replica EXACTO la llamada del
// service worker (background/service-worker.js fishTTSWithTimestamps): endpoint with-timestamp,
// modelo s2-pro, reference_id del preset. Guarda <id>.mp3 + <id>.words.json en public/<slug>/voice/.
// Util cuando los clips ya estan pero falta el audio (p.ej. recuperar un job tras un fallo).
//
// Uso: node tools/fish-voice.mjs <ruta-al-json> [voiceId]   (la API key sale de secrets.local.json en la raiz)
//   [voiceId] opcional: FUERZA esa voz (reference_id) en vez del azar 50/50 del preset (util para pruebas o series).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");   // raiz del repo (donde vive secrets.local.json)
const ROOT = path.resolve(__dirname, "..");          // remotion-editor/

// Presets de voz (igual que lib/messaging.js FISH_PRESETS). Prioridad: arg > preset del proyecto > DEFAULT_VOICE_ID.
// Voz nueva como UNICA default (preferida; anterior 53042fcee6b84e138e72db017d9e50a6). Override con [voiceId].
const FISH_PRESETS = {
  esqueletos: { voiceId: "5e95c590cfcb46ab927a9ec7b35a88c7", model: "s2-pro" },
  // novela-coreana: 1 voz (narradora calida).
  "novela-coreana": { voiceId: "bfed5c0810a347dbb62e8ccce7f59c48", model: "s2-pro" },
  // historias: narrador grave de documental (DEBE coincidir con lib/messaging.js FISH_PRESETS).
  historias: { voiceId: "35199d5438854f5d9157c500479ab684", model: "s2-pro" },
};
const DEFAULT_VOICE_ID = "5e95c590cfcb46ab927a9ec7b35a88c7";   // fallback GARANTIZADO: nunca voz generica de Fish

const jsonArg = process.argv[2];
if (!jsonArg) { console.error("Uso: node tools/fish-voice.mjs <ruta-al-json>"); process.exit(1); }
const jsonPath = path.resolve(jsonArg);
const proj = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, ""));
// API key: secrets.local.json si existe; si no, fallback HARDCODE local (uso personal).
const apiKey = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, "secrets.local.json"), "utf8")).fishApiKey; }
  catch { return ""; }
})() || "d4e19ba180a5403a9bd203c28def4d0f";
if (!apiKey) { console.error("Falta fishApiKey"); process.exit(1); }

const preset = proj.project?.preset || "";
const presetCfg = FISH_PRESETS[preset] || null;
const _voiceIds = presetCfg?.voiceIds || (presetCfg?.voiceId ? [presetCfg.voiceId] : []);
const _voiceArg = (process.argv[3] || "").trim();   // override opcional: fuerza una voz especifica
const voiceId = _voiceArg || (_voiceIds.length ? _voiceIds[Math.floor(Math.random() * _voiceIds.length)] : DEFAULT_VOICE_ID);
const model = presetCfg?.model || "s2-pro";
const slug = proj.project?.slug;
const outDir = path.join(ROOT, "public", slug, "voice");
fs.mkdirSync(outDir, { recursive: true });
// opening compartido por serie: su voz vive en public/<assets_slug>/voice/ (fallback: la del proyecto).
// Se genera UNA vez; en Partes siguientes ya existe y se salta. Sin assets_slug -> misma carpeta del proyecto.
const openingOutDir = proj.opening?.assets_slug
  ? path.join(ROOT, "public", proj.opening.assets_slug, "voice")
  : outDir;
fs.mkdirSync(openingOutDir, { recursive: true });

// Velocidad de habla EN LA GENERACION (Fish prosody.speed, 0.5-2.0; default 1.0 = sin cambio). Distinto de
// audio.voice_rate (playbackRate en el render, que ademas sube el pitch). Subir voice_speed acelera la voz
// SIN cambiar el tono. Las etiquetas de emocion lentas ([reflective], [measured pacing]) la frenan.
// DEFAULT 1.0 = SIN prosody. La prosody de Fish (0.9/0.95) mete warble/"vibroso"; solo se aplica si el JSON
// trae audio.voice_speed explicito. Para voz mas lenta NO usar prosody (guion mas pausado en su lugar).
const ttsSpeed = Number(proj.audio?.voice_speed) || 1;

const round3 = (x) => Math.round(x * 1000) / 1000;

async function fishTTSWithTimestamps(text) {
  const body = { text, format: "mp3", latency: "normal" };
  if (ttsSpeed !== 1) body.prosody = { speed: ttsSpeed };
  if (voiceId) body.reference_id = voiceId;
  const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", model: model || "s1" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.message || j.detail || JSON.stringify(j); } catch {}
    throw new Error(`Fish Audio ${res.status}: ${detail}`);
  }
  const raw = await res.text();
  const audioParts = [];
  const words = [];
  for (const block of raw.split(/\n\n/)) {
    const data = block.split(/\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data || data === "[DONE]") continue;
    let ev; try { ev = JSON.parse(data); } catch { continue; }
    if (ev.audio_base64) audioParts.push(Buffer.from(ev.audio_base64, "base64"));
    const offset = typeof ev.chunk_audio_offset_sec === "number" ? ev.chunk_audio_offset_sec : 0;
    const segs = ev.alignment && Array.isArray(ev.alignment.segments) ? ev.alignment.segments : [];
    for (const sg of segs) {
      const w = (sg.text || "").trim();
      if (!w) continue;
      words.push({ word: w, start: round3((sg.start || 0) + offset), end: round3((sg.end || 0) + offset) });
    }
  }
  const audio = Buffer.concat(audioParts);
  if (!audio.length) throw new Error("Fish no devolvio audio (stream vacio)");
  return { audio, words };
}

const items = [];
// hook.voiceover acepta string ("...") U objeto ({ text: "..." }) igual que las escenas.
const hv = proj.hook?.voiceover;
const hookText = typeof hv === "string" ? hv : (hv && typeof hv.text === "string" ? hv.text : "");
if (hookText.trim()) items.push({ id: "hook", text: hookText.trim() });
// opening (novela-coreana): voz de las escenas del opening, mismo formato que scenes. Aditivo: sin
// opening no agrega nada. speaker se ignora (Fase 1: una sola voz del preset).
for (const s of proj.opening?.scenes || []) {
  const t = s.voiceover?.text;
  if (typeof t === "string" && t.trim()) items.push({ id: s.id, text: t.trim(), dir: openingOutDir });
}
for (const s of proj.scenes || []) {
  const t = s.voiceover?.text;
  if (typeof t === "string" && t.trim()) items.push({ id: s.id, text: t.trim() });
}
// historias VOZ-CONTINUA: una sola generacion desde tts_export.full_script (NO 1 mp3 por escena). El editor
// mapea cada imagen a su ventana via los timestamps de Fish -> la narracion no tiene costura entre cortes.
// Sale full.mp3 + full.words.json. Otros presets: intacto (1 mp3 por escena/hook como siempre).
const isHistorias = (proj.project?.preset === "historias")
  || (proj.pipeline?.tts?.mode === "single_file_from_full_script");
const fullScript = proj.tts_export?.full_script;
if (isHistorias && typeof fullScript === "string" && fullScript.trim()) {
  items.splice(0, items.length, { id: "full", text: fullScript.trim() });
  console.log("historias: 1 voz continua desde tts_export.full_script -> full.mp3 + full.words.json");
}
// ONLY_IDS=hook,scene_01,... -> regraba SOLO esas (deja el resto intacto). Vacio = todas.
const onlyIds = (process.env.ONLY_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (onlyIds.length) {
  const before = items.length;
  items.splice(0, items.length, ...items.filter((it) => onlyIds.includes(it.id)));
  console.log(`ONLY_IDS: regrabando ${items.length}/${before} (${onlyIds.join(",")})`);
}

console.log(`Fish: ${items.length} audios -> ${slug}/voice/ (preset "${preset}", voz ${voiceId || "default"}, modelo ${model})`);
let ok = 0, noWords = 0;
for (const it of items) {
  const dir = it.dir || outDir;   // opening compartido -> su propia carpeta; el resto -> la del proyecto
  if (fs.existsSync(path.join(dir, `${it.id}.mp3`))) { console.log(`  · ${it.id}.mp3 ya existe, lo salto`); continue; }
  try {
    const { audio, words } = await fishTTSWithTimestamps(it.text);
    fs.writeFileSync(path.join(dir, `${it.id}.mp3`), audio);
    let winfo = "sin timestamps";
    if (words.length) { fs.writeFileSync(path.join(dir, `${it.id}.words.json`), JSON.stringify(words)); winfo = `${words.length} palabras`; }
    else noWords++;
    ok++;
    console.log(`  ✓ ${it.id}.mp3 (${Math.round(audio.length / 1024)} KB, ${winfo})`);
  } catch (e) {
    console.log(`  ✗ ${it.id}: ${e.message}`);
  }
}
console.log(`Listo: ${ok}/${items.length} audios.${noWords ? " " + noWords + " sin timestamps." : ""}`);
