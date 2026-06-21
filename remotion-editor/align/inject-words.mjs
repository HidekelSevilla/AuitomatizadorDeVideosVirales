// Inyecta los timestamps por palabra que dejó Fish (sidecars <id>.words.json)
// dentro del JSON maestro -> scenes[].voiceover.words / hook.words.
// Los sidecars los genera la extension al llamar /v1/tts/stream/with-timestamp
// (ver docs/fish-timestamps-spec.md). El editor ya consume voiceover.words.
//
// Uso:
//   node align/inject-words.mjs queue/mi-proyecto.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../../shared/slug.mjs";   // FUENTE UNICA del slug

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const jsonArg = process.argv[2];
if (!jsonArg) {
  console.error("Uso: node align/inject-words.mjs <ruta-al-project.json>");
  process.exit(1);
}
const jsonPath = path.resolve(jsonArg);

const readWords = (voiceDir, id) => {
  const f = path.join(voiceDir, `${id}.words.json`);
  if (!fs.existsSync(f)) return null;
  try {
    const arr = JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
    if (!Array.isArray(arr)) return null;
    const words = arr
      .filter((w) => w && typeof w.word === "string" && typeof w.start === "number" && typeof w.end === "number")
      .map((w) => ({ word: w.word.trim(), start: w.start, end: w.end }))
      .filter((w) => w.word.length > 0);
    return words.length ? words : null;
  } catch (e) {
    console.log(`  ! ${id}.words.json invalido: ${e.message}`);
    return null;
  }
};

const p = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, ""));
const slug = p.project?.slug || slugify(p.project?.title || "");
const voiceDir = path.join(ROOT, "public", slug, "voice");
// opening: voces en public/<assets_slug>/voice/ (fallback: la carpeta del proyecto).
const openingVoiceDir = p.opening?.assets_slug ? path.join(ROOT, "public", p.opening.assets_slug, "voice") : voiceDir;

let n = 0;
if (p.hook) {
  const w = readWords(voiceDir, "hook");
  if (w) {
    p.hook.words = w;
    n++;
    console.log(`hook: ${w.length} palabras (Fish)`);
  }
}
// opening primero (mismo formato que scenes); inyecta sus words si existen.
for (const s of p.opening?.scenes ?? []) {
  const w = readWords(openingVoiceDir, s.id);
  if (w) {
    s.voiceover = s.voiceover ?? {};
    s.voiceover.words = w;
    n++;
    console.log(`${s.id}: ${w.length} palabras (Fish, opening)`);
  }
}
for (const s of p.scenes ?? []) {
  const w = readWords(voiceDir, s.id);
  if (w) {
    s.voiceover = s.voiceover ?? {};
    s.voiceover.words = w;
    n++;
    console.log(`${s.id}: ${w.length} palabras (Fish)`);
  } else {
    console.log(`${s.id}: sin sidecar .words.json (karaoke estimado o usar whisper-align)`);
  }
}

if (n === 0) {
  console.log("No se encontro ningun sidecar .words.json en", path.relative(ROOT, voiceDir));
} else {
  fs.writeFileSync(jsonPath, JSON.stringify(p, null, 2), "utf8");
  console.log(`Listo. ${n} bloque(s) inyectado(s) en`, path.relative(ROOT, jsonPath));
}
