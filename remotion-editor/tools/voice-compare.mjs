// Genera la MISMA narracion (tts_export.full_script) con una voz forzada, para comparar timbre A/B.
// NO toca los renders existentes: escribe en pruebas/voice-compare/<outName>.mp3. Settings = produccion
// (s2.1-pro, prosody 1.0 / SIN prosody = sin warble). Reusa la logica de fish-voice.mjs.
// Uso: node tools/voice-compare.mjs <ruta-json> <voiceId> <outName>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFishTimestampSse } from "../../lib/fish-timestamp-sse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(__dirname, "..");
const apiKey = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, "secrets.local.json"), "utf8")).fishApiKey; }
  catch { return ""; }
})() || "d4e19ba180a5403a9bd203c28def4d0f";

const [, , jsonArg, voiceId, outName] = process.argv;
if (!jsonArg || !voiceId || !outName) { console.error("Uso: node tools/voice-compare.mjs <json> <voiceId> <outName>"); process.exit(1); }

const proj = JSON.parse(fs.readFileSync(path.resolve(jsonArg), "utf8").replace(/^﻿/, ""));
const text = (proj.tts_export?.full_script || (proj.scenes || []).map((s) => s.voiceover?.text).filter(Boolean).join(" ")).trim();
if (!text) { console.error("Sin texto"); process.exit(1); }

const outDir = path.join(ROOT, "pruebas", "voice-compare");
fs.mkdirSync(outDir, { recursive: true });

const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", model: "s2.1-pro" },
  body: JSON.stringify({ text, format: "mp3", latency: "normal", reference_id: voiceId }),
});
if (!res.ok) { console.error("Fish", res.status, await res.text()); process.exit(1); }

const parsed = parseFishTimestampSse(await res.text());
const parts = parsed.audioBase64Parts.map((part) => Buffer.from(part, "base64"));
const audio = Buffer.concat(parts);
if (!audio.length) { console.error("Stream vacio"); process.exit(1); }
const out = path.join(outDir, `${outName}.mp3`);
fs.writeFileSync(out, audio);
console.log(`OK ${path.relative(ROOT, out)} (${Math.round(audio.length / 1024)} KB, voz ${voiceId})`);
