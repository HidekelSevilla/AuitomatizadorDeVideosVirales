// Genera timestamps por palabra (karaoke sincronizado) con whisper.cpp, 100% local.
// Para cada escena + hook: mp3 -> wav 16k mono -> whisper word-timestamps -> inyecta
// scenes[].voiceover.words / hook.words en el JSON maestro (en segundos, relativos al mp3).
// El editor (componente Karaoke) ya consume ese array; no se toca Remotion.
//
// Uso:
//   node align/whisper-align.mjs queue/mi-proyecto.json
//
// Primera corrida: descarga el binario de whisper.cpp (~prebuilt Windows) y el modelo
// (small ~488MB) una sola vez. Requiere ffmpeg en PATH.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  installWhisperCpp,
  downloadWhisperModel,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WHISPER_DIR = path.join(ROOT, "whisper.cpp");
const WHISPER_VERSION = "1.5.5"; // version con binario prebuilt para Windows
const MODEL = "small"; // multilingue; sube a "medium" si la sync no queda fina

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const jsonArg = process.argv[2];
if (!jsonArg) {
  console.error("Uso: node align/whisper-align.mjs <ruta-al-project.json>");
  process.exit(1);
}
const jsonPath = path.resolve(jsonArg);

function toWav(mp3, wav) {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", mp3, "-ar", "16000", "-ac", "1", wav],
    { shell: true }
  );
  return r.status === 0;
}

async function alignOne(mp3Path) {
  const wav = mp3Path.replace(/\.mp3$/i, ".16k.wav");
  if (!toWav(mp3Path, wav)) {
    console.log("  ! ffmpeg fallo en", path.basename(mp3Path));
    return null;
  }
  const out = await transcribe({
    inputPath: wav,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: MODEL,
    tokenLevelTimestamps: true,
    language: "es",
    splitOnWord: true,
  });
  fs.rmSync(wav, { force: true });
  const { captions } = toCaptions({ whisperCppOutput: out });
  return captions
    .map((c) => ({ word: (c.text ?? "").trim(), start: c.startMs / 1000, end: c.endMs / 1000 }))
    .filter((w) => w.word.length > 0);
}

async function main() {
  console.log("Preparando whisper.cpp (descarga una sola vez)...");
  await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false });
  await downloadWhisperModel({ folder: WHISPER_DIR, model: MODEL, printOutput: false });

  const p = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, ""));
  const slug = p.project?.slug || slugify(p.project?.title || "");
  const voiceDir = path.join(ROOT, "public", slug, "voice");

  if (p.hook && fs.existsSync(path.join(voiceDir, "hook.mp3"))) {
    const w = await alignOne(path.join(voiceDir, "hook.mp3"));
    if (w) {
      p.hook.words = w;
      console.log(`hook: ${w.length} palabras alineadas`);
    }
  }

  for (const s of p.scenes ?? []) {
    const mp3 = path.join(voiceDir, `${s.id}.mp3`);
    if (!fs.existsSync(mp3)) {
      console.log(`${s.id}: sin mp3, salto`);
      continue;
    }
    const w = await alignOne(mp3);
    if (w) {
      s.voiceover = s.voiceover ?? {};
      s.voiceover.words = w;
      console.log(`${s.id}: ${w.length} palabras alineadas`);
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(p, null, 2), "utf8");
  console.log("Listo. JSON actualizado con timestamps:", path.relative(ROOT, jsonPath));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
