// Hace que Fish Audio diga un texto suelto y lo guarda como mp3 (para carteles narrados, ej "Parte dos").
// Misma llamada que fish-voice.mjs (with-timestamp, s2-pro, voz default). Uso:
//   node tools/fish-say.mjs "<texto>" <slug> <archivo.mp3> [voiceId]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_VOICE_ID = "5e95c590cfcb46ab927a9ec7b35a88c7";

const [text, slug, fileArg, voiceArg] = process.argv.slice(2);
if (!text || !slug || !fileArg) {
  console.error('Uso: node tools/fish-say.mjs "<texto>" <slug> <archivo.mp3> [voiceId]');
  process.exit(1);
}
const apiKey = JSON.parse(fs.readFileSync(path.join(REPO, "secrets.local.json"), "utf8")).fishApiKey;
if (!apiKey) { console.error("Falta fishApiKey en secrets.local.json"); process.exit(1); }
const voiceId = (voiceArg || DEFAULT_VOICE_ID).trim();

const outDir = path.join(ROOT, "public", slug, "voice");
fs.mkdirSync(outDir, { recursive: true });

const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", model: "s2-pro" },
  body: JSON.stringify({ text, reference_id: voiceId, format: "mp3", latency: "normal" }),
});
if (!res.ok) { console.error(`Fish ${res.status}: ${await res.text()}`); process.exit(1); }

const parts = [];
for (const block of (await res.text()).split(/\n\n/)) {
  const data = block.split(/\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
  if (!data || data === "[DONE]") continue;
  let ev; try { ev = JSON.parse(data); } catch { continue; }
  if (ev.audio_base64) parts.push(Buffer.from(ev.audio_base64, "base64"));
}
const audio = Buffer.concat(parts);
if (!audio.length) { console.error("Fish no devolvio audio"); process.exit(1); }
fs.writeFileSync(path.join(outDir, fileArg), audio);
console.log(`OK: ${slug}/voice/${fileArg} (${Math.round(audio.length / 1024)} KB, voz ${voiceId}) "${text}"`);
