// Inyecta los timestamps por palabra que dejó Fish (sidecars <id>.words.json)
// dentro del JSON maestro -> scenes[].voiceover.words / hook.words.
// Los sidecars los genera la extension al llamar /v1/tts/stream/with-timestamp
// (ver docs/fish-timestamps-spec.md). El editor ya consume voiceover.words.
//
// Uso:
//   node align/inject-words.mjs queue/mi-proyecto.json

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { slugify } from "../../shared/slug.mjs";   // FUENTE UNICA del slug
import {
  allocateWeightedFrameWindows,
  assertContiguousFrameWindows,
} from "./narration-visual-timing.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Duracion REAL del audio (segundos) via ffprobe. 0 si no se puede medir.
const probeDuration = (file) => {
  try { return parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`).toString().trim()) || 0; }
  catch { return 0; }
};

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

// ---- historias VOZ-CONTINUA: de las palabras del audio maestro (full.words.json) construye una ventana
// {start,end} por escena. OJO: Fish manda el alignment ACUMULATIVO por chunk -> full.words.json trae
// DUPLICADOS (mas palabras que el texto real). Por eso NO se puede mapear por conteo; se ALINEA POR
// CONTENIDO: se camina el texto real (orden = guion = audio) contra el stream de Fish, saltando los
// duplicados/artefactos de Fish. Cada token de texto recibe su timestamp real. La ventana de la escena =
// [primer token, primer token de la sig.]; la ultima llega al fin del audio. scene.voiceover.words queda
// rebasada a la ventana (para el karaoke). ----
const round3 = (x) => Math.round(x * 1000) / 1000;
const _stripTags = (s) => (s || "").replace(/\[[^\]]*\]/g, " ").replace(/<[^>]*>/g, " ");  // [tags] v3 y <break/> SSML v2 -> no son palabras
// normaliza para COMPARAR: minusculas, sin acentos (combining marks), solo letras/numeros.
const _normWord = (s) => (s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
// token "limpio" para MOSTRAR en el karaoke (conserva acentos/ñ, quita puntuacion de borde).
const _displayWord = (s) => (s || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const continuousLeadS = (p) => {
  const raw = p.render_export?.caption_lead_s ?? p.editing?.caption_lead_s ?? p.project?.caption_lead_s ?? p.audio?.caption_lead_s;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.min(0.5, raw));
  return p.project?.preset === "manhwa" ? 0.16 : 0;
};

// Fish (stream with-timestamp) manda VENTANAS DESLIZANTES SOLAPADAS: cada chunk reenvia palabras recientes
// con su timestamp ABSOLUTO, asi que la misma palabra aparece repetida con identico start/end. Se reconstruye
// la transcripcion real dedupeando por (start,end,palabra) y ordenando por tiempo. (576 crudas -> ~300 reales.)
const dedupeAbsolute = (fish) => {
  const seen = new Set();
  const out = [];
  for (const x of fish) {
    const k = `${x.start}|${x.end}|${_normWord(x.word)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
};

function buildTiming(p, fishRaw, realDur = 0) {
  const fish = dedupeAbsolute(fishRaw);
  // REESCALA a la duracion REAL del audio: los timestamps de ElevenLabs V3 pueden venir ~8% mas largos que
  // el mp3 encodeado (ej. atlantida: alineacion 60.24s vs audio real 55.68s). Si no se corrige, las imagenes
  // se desfasan progresivamente y la ultima queda en silencio (cola muda). Una palabra NO puede terminar
  // despues del fin del audio -> escalamos todos los tiempos por (audio_real / alineacion).
  const alignMax = fish.reduce((m, w) => Math.max(m, w.end), 0);
  if (realDur > 0 && alignMax > 0 && Math.abs(alignMax - realDur) > 0.15) {
    const k = realDur / alignMax;
    for (const w of fish) { w.start *= k; w.end *= k; }
    console.log(`  · timestamps reescalados x${k.toFixed(4)} (alineacion ${alignMax.toFixed(2)}s -> audio real ${realDur.toFixed(2)}s)`);
  }
  const lead = continuousLeadS(p);
  if (lead > 0) {
    for (const w of fish) {
      w.start = Math.max(0, w.start - lead);
      w.end = Math.max(w.start + 0.02, w.end - lead);
    }
    console.log(`  · karaoke adelantado ${lead.toFixed(2)}s (${p.project?.preset})`);
  }
  // schema nuevo historias: orden en render_export.clip_order; escenas con scene_id (alias de id).
  const sid = (s) => s.id ?? s.scene_id;
  const order = p.render_export?.clip_order || p.capcut_export?.clip_order || (p.scenes || []).map(sid);
  const byId = Object.fromEntries((p.scenes || []).map((s) => [sid(s), s]));
  const scenes = order.map((id) => byId[id]).filter(Boolean);
  const audioDuration = fish.reduce((m, w) => Math.max(m, w.end), 0);
  const LOOKAHEAD = 12; // ventana para saltar duplicados/artefactos de Fish al buscar el siguiente token

  // Manhwa V7 production: narration and visual pagination are independent
  // tracks. Align the immutable narration units first, then partition each
  // narration interval among its owned Grok pages using deterministic integer
  // frames. This prevents fake silent scenes, overlaps and 43x4s fallbacks.
  const decoupledV7 = p.v7_contract?.timeline_model === "NARRATION_VISUAL_TRACKS_V1";
  if (decoupledV7) {
    const units = Array.isArray(p.narration_track?.units) ? p.narration_track.units : [];
    if (!units.length) throw new Error("NARRATION_VISUAL_TRACKS_V1 requires narration_track.units");
    const fps = Number.isInteger(p.project?.fps) && p.project.fps > 0 ? p.project.fps : 30;
    const alignedByUnit = new Map();
    let trackCursor = 0;
    for (const unit of units) {
      const aligned = [];
      const tokens = _stripTags(unit?.text).split(/\s+/).filter(Boolean);
      for (const orig of tokens) {
        const token = _normWord(orig);
        if (!token) continue;
        let found = -1;
        for (let index = trackCursor; index < Math.min(fish.length, trackCursor + LOOKAHEAD); index++) {
          if (_normWord(fish[index].word) === token) { found = index; break; }
        }
        if (found >= 0) {
          aligned.push({ word: _displayWord(orig), start: fish[found].start, end: fish[found].end });
          trackCursor = found + 1;
        } else {
          aligned.push({ word: _displayWord(orig), start: null, end: null });
        }
      }
      alignedByUnit.set(unit.id, aligned);
    }

    const firstTs = (unit) => {
      const aligned = alignedByUnit.get(unit.id) || [];
      const first = aligned.find((word) => word.start != null);
      return first ? first.start : null;
    };
    const unitIntervals = new Map();
    let previousEnd = 0;
    for (let unitIndex = 0; unitIndex < units.length; unitIndex++) {
      const unit = units[unitIndex];
      const startRaw = unitIndex === 0 ? 0 : firstTs(unit);
      const nextStart = unitIndex < units.length - 1 ? firstTs(units[unitIndex + 1]) : audioDuration;
      if (startRaw == null || nextStart == null || nextStart <= startRaw || startRaw < previousEnd - 0.001) {
        throw new Error(`cannot derive monotonic narration interval for ${unit.id}`);
      }
      const aligned = alignedByUnit.get(unit.id) || [];
      let cursor = 0;
      while (cursor < aligned.length) {
        if (aligned[cursor].start != null) { cursor++; continue; }
        let runEnd = cursor;
        while (runEnd < aligned.length && aligned[runEnd].start == null) runEnd++;
        const left = cursor > 0 ? (aligned[cursor - 1].end ?? aligned[cursor - 1].start) : startRaw;
        const right = runEnd < aligned.length ? aligned[runEnd].start : nextStart;
        const span = Math.max(0.001, right - left);
        const count = runEnd - cursor;
        for (let offset = 0; offset < count; offset++) {
          aligned[cursor + offset].start = left + (span * (offset + 1)) / (count + 1);
          aligned[cursor + offset].end = left + (span * (offset + 2)) / (count + 1);
        }
        cursor = runEnd;
      }
      const startFrame = unitIndex === 0 ? 0 : Math.round(startRaw * fps);
      const endFrame = unitIndex === units.length - 1
        ? Math.round((realDur > 0 ? realDur : audioDuration) * fps)
        : Math.round(nextStart * fps);
      if (endFrame <= startFrame) throw new Error(`narration unit ${unit.id} has no positive frame interval`);
      unitIntervals.set(unit.id, { startFrame, endFrame, aligned });
      previousEnd = nextStart;
    }

    const sceneIds = new Set(scenes.map((scene) => sid(scene)));
    const scheduled = [];
    for (const unit of units) {
      const ownedPages = scenes
        .filter((scene) => scene?.narration_ref?.unit_id === unit.id)
        .map((scene) => ({
          id: sid(scene),
          scene,
          timingWeight: scene.narration_ref.timing_weight,
        }));
      if (!ownedPages.length) throw new Error(`narration unit ${unit.id} owns no visual pages`);
      if (ownedPages.some((page) => !sceneIds.has(page.id))) throw new Error(`invalid visual page for ${unit.id}`);
      const interval = unitIntervals.get(unit.id);
      const windows = allocateWeightedFrameWindows(interval.startFrame, interval.endFrame, ownedPages);
      assertContiguousFrameWindows(windows, interval.startFrame, interval.endFrame);
      for (const window of windows) {
        const page = ownedPages.find((candidate) => candidate.id === window.id);
        const startSeconds = window.startFrame / fps;
        const endSeconds = window.endFrame / fps;
        const words = interval.aligned
          .filter((word) => {
            const middleFrame = Math.round((((word.start ?? startSeconds) + (word.end ?? startSeconds)) / 2) * fps);
            return middleFrame >= window.startFrame && middleFrame < window.endFrame;
          })
          .map((word) => ({
            word: word.word,
            start: round3(Math.max(startSeconds, word.start) - startSeconds),
            end: round3(Math.min(endSeconds, word.end) - startSeconds),
          }))
          .filter((word) => word.word && word.end > word.start);
        page.scene._window = { start: round3(startSeconds), end: round3(endSeconds) };
        page.scene._frame_window = { start: window.startFrame, end: window.endFrame, fps };
        page.scene._narration = {
          unit_id: unit.id,
          speaker: unit.speaker,
          text: words.map((word) => word.word).join(" "),
          words,
        };
        scheduled.push(window);
      }
    }
    scheduled.sort((left, right) => left.startFrame - right.startFrame);
    assertContiguousFrameWindows(scheduled, 0, Math.round((realDur > 0 ? realDur : audioDuration) * fps));
    p.audio = p.audio || {};
    p.audio._continuous = true;
    p.audio._master = "voice/full.mp3";
    p.audio._visual_timing_model = "NARRATION_VISUAL_TRACKS_V1";
    return scenes.length;
  }

  let fi = 0; // cursor en el stream de Fish
  // 1) alinear: cada escena -> sus tokens con timestamp absoluto (o null si no se halla)
  for (const sc of scenes) {
    const tokens = _stripTags(sc.voiceover?.text).split(/\s+/).filter(Boolean);
    const aligned = [];
    for (const orig of tokens) {
      const tn = _normWord(orig);
      if (!tn) continue;
      let found = -1;
      for (let k = fi; k < Math.min(fish.length, fi + LOOKAHEAD); k++) {
        if (_normWord(fish[k].word) === tn) { found = k; break; }
      }
      if (found >= 0) { aligned.push({ word: _displayWord(orig), start: fish[found].start, end: fish[found].end }); fi = found + 1; }
      else aligned.push({ word: _displayWord(orig), start: null, end: null });
    }
    sc.__aligned = aligned;
  }
  // 2) ventanas: start = primer token con timestamp de la escena; end = start de la siguiente; ultima = fin.
  const firstTs = (sc) => { const a = (sc.__aligned || []).find((w) => w.start != null); return a ? a.start : null; };
  for (let si = 0; si < scenes.length; si++) {
    const sc = scenes[si];
    let startRaw = si === 0 ? 0 : (firstTs(sc) ?? scenes[si - 1]._window?.end ?? 0);
    let endRaw = si < scenes.length - 1 ? (firstTs(scenes[si + 1]) ?? null) : audioDuration;
    if (endRaw == null || endRaw <= startRaw) endRaw = audioDuration; // degrada sin solape
    sc._window = { start: round3(startRaw), end: round3(endRaw) };

    // RELLENO de huecos: Fish (ventanas deslizantes) a veces NO emite algunas palabras (ej "a todo el pueblo")
    // -> quedarian SIN caption (el narrador las dice y no aparece subtitulo). El texto es la fuente de verdad:
    // a cada palabra sin timestamp se le INTERPOLA un tiempo entre sus vecinas con timestamp (o los bordes de
    // la ventana). Asi NINGUNA palabra hablada queda sin subtitulo. NO se descarta ninguna.
    const aligned = sc.__aligned || [];
    const n = aligned.length;
    let k = 0;
    while (k < n) {
      if (aligned[k].start != null) { k++; continue; }
      let j = k; while (j < n && aligned[j].start == null) j++; // [k, j) = run consecutivo de nulls
      const leftT = k > 0 ? (aligned[k - 1].end ?? aligned[k - 1].start) : startRaw;
      const rightT = j < n ? aligned[j].start : endRaw;
      const span = Math.max(0.001, rightT - leftT);
      const cnt = j - k;
      for (let m = 0; m < cnt; m++) {
        aligned[k + m].start = leftT + (span * (m + 1)) / (cnt + 1);
        aligned[k + m].end = leftT + (span * (m + 2)) / (cnt + 1);
      }
      k = j;
    }
    sc.voiceover = sc.voiceover || {};
    sc.voiceover.words = aligned.map((w) => ({ word: w.word, start: round3(w.start - startRaw), end: round3(w.end - startRaw) }));
    delete sc.__aligned;
  }
  p.audio = p.audio || {};
  p.audio._continuous = true;
  p.audio._master = "voice/full.mp3";
  return scenes.length;
}

const p = JSON.parse(fs.readFileSync(jsonPath, "utf8").replace(/^﻿/, ""));
const slug = p.project?.slug || slugify(p.project?.title || "");
const voiceDir = path.join(ROOT, "public", slug, "voice");
// opening: voces en public/<assets_slug>/voice/ (fallback: la carpeta del proyecto).
const openingVoiceDir = p.opening?.assets_slug ? path.join(ROOT, "public", p.opening.assets_slug, "voice") : voiceDir;

// historias VOZ-CONTINUA: si existe el audio maestro (full.words.json), construir ventanas por escena y salir.
// No se inyecta palabra por escena desde sidecars per-escena (no los hay en este modo).
const _isHistorias = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(p.project?.preset || "") || p.pipeline?.tts?.mode === "single_file_from_full_script";  // voz continua
if (_isHistorias) {
  const fullWords = readWords(voiceDir, "full");
  if (fullWords && fullWords.length) {
    const realDur = probeDuration(path.join(voiceDir, "full.mp3"));
    const ns = buildTiming(p, fullWords, realDur);
    fs.writeFileSync(jsonPath, JSON.stringify(p, null, 2), "utf8");
    console.log(`Voz continua: ${fullWords.length} palabras -> ${ns} ventanas de escena (audio maestro voice/full.mp3) en`, path.relative(ROOT, jsonPath));
    process.exit(0);
  }
  console.log("historias: no hay voice/full.words.json -> cae al modo por escena (genera la voz continua con tools/fish-voice.mjs)");
}

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
