// Reconstruye un JSON maestro desde los medios + sidecars .words.json (recuperacion).
// Deduplica las palabras (Fish manda snapshots acumulativos -> se quedo con el mas largo).
// Uso: node align/reconstruct-from-voice.mjs <slug> "<titulo>" > data/<archivo>.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const slug = process.argv[2];
const title = process.argv[3] || slug;
const voiceDir = path.join(ROOT, "public", slug, "voice");
const clipsDir = path.join(ROOT, "public", slug, "clips");

const NUM = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// dedup: parte en snapshots donde start retrocede; devuelve el snapshot mas largo
function dedup(words) {
  const snaps = [];
  let cur = [];
  for (const w of words) {
    if (cur.length && w.start < cur[cur.length - 1].start - 0.05) {
      snaps.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) snaps.push(cur);
  return snaps.reduce((a, b) => (b.length > a.length ? b : a), []);
}

function readWords(id) {
  const f = path.join(voiceDir, `${id}.words.json`);
  if (!fs.existsSync(f)) return null;
  const raw = JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));
  return dedup(raw).map((w) => ({ word: w.word.trim(), start: w.start, end: w.end }));
}

function timeLabel(words) {
  if (!words || words.length < 2) return undefined;
  const unit = cap(words[0].word.replace(/[^\p{L}]/gu, ""));
  const n = NUM[words[1].word.toLowerCase().replace(/[^\p{L}]/gu, "")] ?? words[1].word;
  return `${unit} ${n}`;
}

// escenas presentes
const sceneIds = fs
  .readdirSync(clipsDir)
  .filter((f) => /^scene_\d+\.mp4$/.test(f))
  .map((f) => f.replace(/\.mp4$/, ""))
  .sort();

const scenes = sceneIds.map((id) => {
  const words = readWords(id);
  return {
    id,
    time_label: timeLabel(words),
    voiceover: { text: words ? words.map((w) => w.word).join(" ") : "", words: words ?? undefined },
  };
});

const hookWords = readWords("hook");
const project = {
  project: { title, slug, preset: "esqueletos", aspect_ratio: "9:16", fps: 24, default_clip_duration_s: 4 },
  hook: {
    duration_s: 4,
    voiceover: hookWords ? hookWords.map((w) => w.word).join(" ") : "",
    words: hookWords ?? undefined,
    montage_sources: sceneIds.map((id) => ({ scene_id: id, clip_in_s: 1.0, clip_out_s: 1.8 })),
  },
  scenes,
  capcut_export: { clip_order: sceneIds, label_card_duration_s: 0.8 },
};

process.stdout.write(JSON.stringify(project, null, 2));
