// Recupera la VOZ (Fish Audio) de un proyecto SIN la extension. Replica EXACTO la llamada del
// service worker (background/service-worker.js fishTTSWithTimestamps): endpoint with-timestamp,
// modelo s2-pro, reference_id del preset. Guarda <id>.mp3 + <id>.words.json en public/<slug>/voice/.
// Util cuando los clips ya estan pero falta el audio (p.ej. recuperar un job tras un fallo).
//
// Uso: node tools/fish-voice.mjs <ruta-al-json>   (la API key sale de secrets.local.json en la raiz)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");   // raiz del repo (donde vive secrets.local.json)
const ROOT = path.resolve(__dirname, "..");          // remotion-editor/

// Presets de voz (igual que lib/messaging.js FISH_PRESETS). Prioridad: preset del proyecto > default.
const FISH_PRESETS = { esqueletos: { voiceId: "53042fcee6b84e138e72db017d9e50a6", model: "s2-pro" } };

const jsonArg = process.argv[2];
if (!jsonArg) { console.error("Uso: node tools/fish-voice.mjs <ruta-al-json>"); process.exit(1); }
const jsonPath = path.resolve(jsonArg);
const proj = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, ""));
const apiKey = JSON.parse(fs.readFileSync(path.join(REPO, "secrets.local.json"), "utf8")).fishApiKey;
if (!apiKey) { console.error("Falta fishApiKey en secrets.local.json"); process.exit(1); }

const preset = proj.project?.preset || "";
const presetCfg = FISH_PRESETS[preset] || null;
const voiceId = presetCfg?.voiceId || "";
const model = presetCfg?.model || "s2-pro";
const slug = proj.project?.slug;
const outDir = path.join(ROOT, "public", slug, "voice");
fs.mkdirSync(outDir, { recursive: true });

const round3 = (x) => Math.round(x * 1000) / 1000;

async function fishTTSWithTimestamps(text) {
  const body = { text, format: "mp3", latency: "normal" };
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
const hookText = proj.hook?.voiceover;
if (typeof hookText === "string" && hookText.trim()) items.push({ id: "hook", text: hookText.trim() });
for (const s of proj.scenes || []) {
  const t = s.voiceover?.text;
  if (typeof t === "string" && t.trim()) items.push({ id: s.id, text: t.trim() });
}

console.log(`Fish: ${items.length} audios -> ${slug}/voice/ (preset "${preset}", modelo ${model})`);
let ok = 0, noWords = 0;
for (const it of items) {
  try {
    const { audio, words } = await fishTTSWithTimestamps(it.text);
    fs.writeFileSync(path.join(outDir, `${it.id}.mp3`), audio);
    let winfo = "sin timestamps";
    if (words.length) { fs.writeFileSync(path.join(outDir, `${it.id}.words.json`), JSON.stringify(words)); winfo = `${words.length} palabras`; }
    else noWords++;
    ok++;
    console.log(`  ✓ ${it.id}.mp3 (${Math.round(audio.length / 1024)} KB, ${winfo})`);
  } catch (e) {
    console.log(`  ✗ ${it.id}: ${e.message}`);
  }
}
console.log(`Listo: ${ok}/${items.length} audios.${noWords ? " " + noWords + " sin timestamps." : ""}`);
