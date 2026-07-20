// Hace que Fish Audio diga un texto suelto y lo guarda como mp3 (para carteles narrados, ej "Parte dos").
// Misma llamada que fish-voice.mjs (with-timestamp, s2.1-pro, voz default). Uso:
//   node tools/fish-say.mjs "<texto>" <slug> <archivo.mp3> [voiceId]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFishTimestampSse } from "../../lib/fish-timestamp-sse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_VOICE_ID = "5e95c590cfcb46ab927a9ec7b35a88c7";

const [text, slug, fileArg, voiceArg] = process.argv.slice(2);
if (!text || !slug || !fileArg) {
  console.error('Uso: node tools/fish-say.mjs "<texto>" <slug> <archivo.mp3> [voiceId]');
  process.exit(1);
}
// API key: secrets.local.json si existe; si no, fallback HARDCODE local (uso personal).
const apiKey = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, "secrets.local.json"), "utf8")).fishApiKey; }
  catch { return ""; }
})() || "d4e19ba180a5403a9bd203c28def4d0f";
if (!apiKey) { console.error("Falta fishApiKey"); process.exit(1); }
const voiceId = (voiceArg || DEFAULT_VOICE_ID).trim();

const outDir = path.join(ROOT, "public", slug, "voice");
fs.mkdirSync(outDir, { recursive: true });

// SAY_SPEED=0.95 -> velocidad de habla (prosody.speed) igual que el render; default 1.
const sayBody = { text, reference_id: voiceId, format: "mp3", latency: "normal" };
const saySpeed = Number(process.env.SAY_SPEED) || 1;
if (saySpeed !== 1) sayBody.prosody = { speed: saySpeed };
const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", model: "s2.1-pro" },
  body: JSON.stringify(sayBody),
});
if (!res.ok) { console.error(`Fish ${res.status}: ${await res.text()}`); process.exit(1); }

const parsed = parseFishTimestampSse(await res.text());
const parts = parsed.audioBase64Parts.map((part) => Buffer.from(part, "base64"));
const audio = Buffer.concat(parts);
if (!audio.length) { console.error("Fish no devolvio audio"); process.exit(1); }
fs.writeFileSync(path.join(outDir, fileArg), audio);
console.log(`OK: ${slug}/voice/${fileArg} (${Math.round(audio.length / 1024)} KB, voz ${voiceId}) "${text}"`);
