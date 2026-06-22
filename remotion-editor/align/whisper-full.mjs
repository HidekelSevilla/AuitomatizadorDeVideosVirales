// historias VOZ-CONTINUA: transcribe el audio maestro (full.mp3) con whisper.cpp -> full.words.json con
// timestamps por palabra de TODAS las palabras habladas. A diferencia de Fish (with-timestamp), whisper NO
// omite palabras, asi que el karaoke queda completo y bien alineado. 100% local (binario prebuilt + modelo).
//
// Uso: node align/whisper-full.mjs <ruta-al-project.json>   (WHISPER_MODEL=medium para mas precision)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { installWhisperCpp, downloadWhisperModel, transcribe, toCaptions } from "@remotion/install-whisper-cpp";
import { slugify } from "../../shared/slug.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WHISPER_DIR = path.join(ROOT, "whisper.cpp");
const WHISPER_VERSION = "1.5.5";
const MODEL = process.env.WHISPER_MODEL || "small";

const jsonArg = process.argv[2];
if (!jsonArg) { console.error("Uso: node align/whisper-full.mjs <ruta-al-project.json>"); process.exit(1); }
const p = JSON.parse(fs.readFileSync(path.resolve(jsonArg), "utf8").replace(/^﻿/, ""));
const slug = p.project?.slug || slugify(p.project?.title || "");
const voiceDir = path.join(ROOT, "public", slug, "voice");
const mp3 = path.join(voiceDir, "full.mp3");
if (!fs.existsSync(mp3)) { console.error("No existe", mp3, "(genera la voz con tools/fish-voice.mjs primero)"); process.exit(1); }

function toWav(src, wav) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ar", "16000", "-ac", "1", wav], { shell: true });
  return r.status === 0;
}

const main = async () => {
  await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
  await downloadWhisperModel({ folder: WHISPER_DIR, model: MODEL, printOutput: false });
  const wav = mp3.replace(/\.mp3$/i, ".16k.wav");
  if (!toWav(mp3, wav)) { console.error("ffmpeg fallo al convertir a wav 16k"); process.exit(1); }
  const out = await transcribe({
    inputPath: wav, whisperPath: WHISPER_DIR, whisperCppVersion: WHISPER_VERSION,
    model: MODEL, tokenLevelTimestamps: true, language: "es", splitOnWord: true,
  });
  fs.rmSync(wav, { force: true });
  const { captions } = toCaptions({ whisperCppOutput: out });
  const words = captions
    .map((c) => ({ word: (c.text ?? "").trim(), start: c.startMs / 1000, end: c.endMs / 1000 }))
    .filter((w) => w.word.length > 0);
  fs.writeFileSync(path.join(voiceDir, "full.words.json"), JSON.stringify(words), "utf8");
  console.log(`whisper (${MODEL}): ${words.length} palabras -> ${slug}/voice/full.words.json`);
};
main().catch((e) => { console.error(e); process.exit(1); });
