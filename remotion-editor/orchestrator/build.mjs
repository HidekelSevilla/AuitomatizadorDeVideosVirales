// Orquestador de la cola: vigila queue/, verifica que cada trabajo tenga TODOS
// sus medios (clips de Flow + audios de Fish + musica + sfx) y dispara el render.
// NO toca la extension: solo lee carpetas y llama a Remotion. Sin dependencias externas.
//
// Uso:
//   node orchestrator/build.mjs            -> procesa todos los trabajos listos (una vez)
//   node orchestrator/build.mjs --status   -> solo reporta que falta en cada trabajo
//   node orchestrator/build.mjs --watch     -> daemon: revisa la cola cada 5s
//   node orchestrator/build.mjs --clips-only ./queue/x.json -> render explicito sin exigir voz externa
//   node orchestrator/build.mjs ./data/x.json -> procesa ese JSON puntual

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { slugify } from "../../shared/slug.mjs";   // FUENTE UNICA del slug (debe coincidir con la extension)
import { getMediaRequirements, projectMediaSignature, minMediaBytes } from "../../shared/media-requirements.mjs";
import {
  novelaOutroAudioFolder,
  novelaOutroFolder,
  numberedNovelaOutroAudios,
  numberedNovelaOutros,
  selectNumberedNovelaOutro,
  selectNumberedNovelaOutroAudio,
} from "../../shared/novela-outro.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUEUE = path.join(ROOT, "queue");
const DONE = path.join(ROOT, "done");
const OUT = path.join(ROOT, "out");
const PUBLIC = path.join(ROOT, "public");
const LOGS = path.join(ROOT, "logs");
const NOVELA_OUTROS = path.join(ROOT, "finals-novela-coreana");
const NOVELA_OUTRO_TRANSITION_S = 0.35;
const BUILD_LOCK_STALE_MS = Math.max(5 * 60_000, Number(process.env.BUILD_LOCK_STALE_MS || 2 * 60 * 60_000) || 2 * 60 * 60_000);

const args = process.argv.slice(2);
const STATUS_ONLY = args.includes("--status");
const WATCH = args.includes("--watch");
const CLIPS_ONLY = args.includes("--clips-only");
const explicit = args.find((a) => !a.startsWith("--"));

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const repoRoot = path.resolve(ROOT, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/^ï»¿/, ""));
}

// Integridad: "existe Y tamano plausible" (atrapa 0-byte/truncados antes de renderizar con basura).
// Piso central compartido con el dev-server (shared/media-requirements). El ruido de Grok lo bloquea el
// driver antes de descargar, asi que el piso de imagen es BAJO (paneles oscuros legitimos pesan poco);
// override por env MIN_STILL_BYTES o project.min_still_bytes (proyecto en scope via fileOkFor).
function fileOk(p, projectJson = null) {
  try { return fs.statSync(p).size >= minMediaBytes(p, projectJson); } catch { return false; }
}

function mediaDurationSeconds(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ], { encoding: "utf8", windowsHide: true });
  const duration = Number.parseFloat((result.stdout || "").trim());
  return result.status === 0 && Number.isFinite(duration) && duration > 0 ? duration : null;
}

function prepareNovelaOutro(project, slug, postRenderSpeed = 1) {
  const folderName = novelaOutroFolder(project.project?.preset);
  const audioFolderName = novelaOutroAudioFolder(project.project?.preset);
  if (!folderName) return null;
  const sourceDir = path.join(NOVELA_OUTROS, folderName);
  const names = fs.existsSync(sourceDir)
    ? fs.readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
    : [];
  const files = numberedNovelaOutros(names);
  if (!files.length) {
    console.log(`  (sin final ${folderName}: agrega 1.mp4, 2.mp4... en ${rel(sourceDir)}; renderizo sin CTA)`);
    return null;
  }

  const missing = [];
  const available = new Set(files.map((file) => file.number));
  for (let number = 1; number <= files[files.length - 1].number; number++) {
    if (!available.has(number)) missing.push(number);
  }
  if (missing.length) console.log(`  (aviso: faltan finales numerados ${missing.join(", ")} en ${rel(sourceDir)}; uso los existentes)`);

  const selected = selectNumberedNovelaOutro(names, `${slug}|${project.project?.title || ""}`);
  if (!selected) return null;
  const source = path.join(sourceDir, selected.name);
  const duration = mediaDurationSeconds(source);
  if (!duration) {
    console.log(`  (final ${folderName}/${selected.name} invalido o ffprobe no pudo leerlo; renderizo sin CTA)`);
    return null;
  }

  const targetDir = path.join(PUBLIC, slug, "outro");
  const target = path.join(targetDir, "final.mp4");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`  final ${folderName}: ${selected.name} (seleccion ${selected.number} de ${selected.count}, ${duration.toFixed(2)}s)`);

  let selectedAudio = null;
  let audioDuration = null;
  if (audioFolderName) {
    const audioDir = path.join(NOVELA_OUTROS, audioFolderName);
    const audioNames = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
      : [];
    const audioFiles = numberedNovelaOutroAudios(audioNames);
    if (!audioFiles.length) {
      console.log(`  (sin audio ${audioFolderName}: agrega 1.mp3, 2.mp3... en ${rel(audioDir)}; uso solo el audio del clip al 50%)`);
    } else {
      const audioMissing = [];
      const audioAvailable = new Set(audioFiles.map((file) => file.number));
      for (let number = 1; number <= audioFiles[audioFiles.length - 1].number; number++) {
        if (!audioAvailable.has(number)) audioMissing.push(number);
      }
      if (audioMissing.length) console.log(`  (aviso: faltan audios numerados ${audioMissing.join(", ")} en ${rel(audioDir)}; uso los existentes)`);

      selectedAudio = selectNumberedNovelaOutroAudio(audioNames, `${slug}|${project.project?.title || ""}|audio-cta`);
      if (selectedAudio) {
        const audioSource = path.join(audioDir, selectedAudio.name);
        audioDuration = mediaDurationSeconds(audioSource);
        if (audioDuration) {
          fs.copyFileSync(audioSource, path.join(targetDir, "voice.mp3"));
          console.log(`  audio ${audioFolderName}: ${selectedAudio.name} (seleccion ${selectedAudio.number} de ${selectedAudio.count}, ${audioDuration.toFixed(2)}s)`);
        } else {
          console.log(`  (audio ${audioFolderName}/${selectedAudio.name} invalido; uso solo el audio del clip al 50%)`);
          selectedAudio = null;
        }
      }
    }
  }

  return {
    src: `${slug}/outro/final.mp4`,
    duration_s: Math.max(duration, audioDuration || 0),
    video_duration_s: duration,
    transition_s: NOVELA_OUTRO_TRANSITION_S,
    post_render_speed: Number.isFinite(postRenderSpeed)
      ? Math.max(0.5, Math.min(3, postRenderSpeed))
      : 1,
    selected_number: selected.number,
    clip_volume: 0.5,
    ...(selectedAudio && audioDuration ? {
      audio_src: `${slug}/outro/voice.mp3`,
      audio_duration_s: audioDuration,
      audio_selected_number: selectedAudio.number,
      voice_volume: 1,
    } : {}),
    language: project.project?.preset === "novela-coreana" ? "esp" : "eng",
  };
}

function ensureDirs() {
  for (const d of [QUEUE, DONE, OUT]) fs.mkdirSync(d, { recursive: true });
}

function findJobs() {
  if (explicit) {
    const jsonPath = path.resolve(explicit);
    return [{ name: path.basename(jsonPath).replace(/\.json$/, ""), jsonPath, dir: null }];
  }
  const jobs = [];
  if (!fs.existsSync(QUEUE)) return jobs;
  for (const entry of fs.readdirSync(QUEUE, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const p = path.join(QUEUE, entry.name, "project.json");
      if (fs.existsSync(p)) jobs.push({ name: entry.name, jsonPath: p, dir: path.join(QUEUE, entry.name) });
    } else if (entry.name.endsWith(".json")) {
      jobs.push({ name: entry.name.replace(/\.json$/, ""), jsonPath: path.join(QUEUE, entry.name), dir: null });
    }
  }
  return jobs;
}

function inspect(job) {
  const p = JSON.parse(fs.readFileSync(job.jsonPath, "utf8").replace(/^﻿/, ""));
  const slug = p.project?.slug || slugify(p.project?.title || job.name);
  const base = path.join(PUBLIC, slug);
  // schema nuevo historias: orden en render_export.clip_order; escenas con scene_id (alias de id).
  const order = p.render_export?.clip_order || p.capcut_export?.clip_order || (p.scenes || []).map((s) => s.id ?? s.scene_id);
  // historias: image-only (stills + Ken Burns en el editor). El medio por escena es images/<id>.png, NO clips/<id>.mp4.
  const stills = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(p.project?.preset || "");  // historias* / criptoclaro* / habitos* / pov-historias / manhwa
  // HIBRIDO criptoclaro_reel: una escena con render_mode "animated" es un clip de video (clips/<id>.mp4); el resto, still.
  const sceneById = Object.fromEntries((p.scenes || []).map((s) => [s.id ?? s.scene_id, s]));
  const isAnimated = (id) => stills && sceneById[id]?.render_mode === "animated";
  const sceneMedia = (dir, id) => isAnimated(id) ? path.join(dir, "clips", `${id}.mp4`)
    : stills ? path.join(dir, "images", `${id}.jpg`) : path.join(dir, "clips", `${id}.mp4`);

  const need = [];
  for (const id of order) {
    need.push(sceneMedia(base, id));
    // historias VOZ-CONTINUA: la voz es 1 mp3 maestro (voice/full.mp3), no 1 por escena.
    if (!stills) need.push(path.join(base, "voice", `${id}.mp3`));
  }
  if (stills) need.push(path.join(base, "voice", "full.mp3"));
  // opening: medios en public/<assets_slug>/ (fallback: la carpeta del proyecto). Pre-generado y reusable.
  const openingBase = p.opening?.assets_slug ? path.join(PUBLIC, p.opening.assets_slug) : base;
  for (const s of p.opening?.scenes || []) {
    const sid = s.id ?? s.scene_id;
    need.push(sceneMedia(openingBase, sid));
    need.push(path.join(openingBase, "voice", `${sid}.mp3`));
  }
  if (p.hook) need.push(path.join(base, "voice", "hook.mp3"));
  if (p.audio?.music_file) need.push(path.join(base, p.audio.music_file));
  if (p.audio?.transition_sfx) need.push(path.join(PUBLIC, "sfx", p.audio.transition_sfx));
  for (const s of p.scenes || []) for (const c of s.sfx || []) need.push(path.join(PUBLIC, "sfx", c.file));

  const missing = [...new Set(need)].filter((f) => !fileOk(f, p));
  return { slug, missing };
}

const ENHANCE_EXE = path.join(ROOT, "tools", "realesrgan", "realesrgan-ncnn-vulkan.exe");

function inspectValidated(job) {
  const p = readJson(job.jsonPath);
  const { slug, requirements } = getMediaRequirements(p, { fallbackName: job.name });
  // Recuperacion dirigida: si el usuario pide editar desde clips existentes, la voz externa deja de
  // ser una barrera. El render conserva el audio propio de cada clip y NO vuelve a tocar Grok.
  // Es opt-in por CLI para no convertir silenciosamente todas las novelas futuras en videos sin narrador.
  const requiredForRun = CLIPS_ONLY
    ? requirements.filter((r) => !["voice", "voice_hook", "opening_voice"].includes(r.kind))
    : requirements;
  const missingRequirements = requiredForRun
    .map((r) => ({ ...r, fullPath: path.join(PUBLIC, r.path) }))
    .filter((r) => !fileOk(r.fullPath, p));
  if (generatedMediaExists(slug) && !mediaSignatureOkOrAdopted(slug, p, missingRequirements.length === 0)) {
    missingRequirements.unshift({
      path: `${slug}/.media-signature.json`,
      kind: "media_signature",
      fullPath: path.join(PUBLIC, slug, ".media-signature.json"),
    });
  }
  return { slug, missing: missingRequirements.map((r) => r.fullPath), missingRequirements };
}

const GENERATED_DIRS = ["images", "clips", "clips_raw", "voice"];
function generatedMediaExists(slug) {
  const base = path.join(PUBLIC, slug);
  return GENERATED_DIRS.some((d) => {
    const dir = path.join(base, d);
    try { return fs.existsSync(dir) && fs.readdirSync(dir).length > 0; } catch { return false; }
  });
}

function writeMediaSignature(slug, signature, reason) {
  const dir = path.join(PUBLIC, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".media-signature.json"), JSON.stringify({
    signature,
    reason,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}

function mediaSignatureOkOrAdopted(slug, p, canAdoptMissing) {
  const signature = projectMediaSignature(p);
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(PUBLIC, slug, ".media-signature.json"), "utf8"));
    return meta.signature === signature;
  } catch {
    if (!canAdoptMissing) return false;
    writeMediaSignature(slug, signature, "adopted-existing-complete-media");
    return true;
  }
}

function readElevenApiKey() {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, "secrets.local.json"), "utf8").replace(/^\uFEFF/, "").replace(/^Ã¯Â»Â¿/, "");
    const s = JSON.parse(raw);
    return (s.elevenApiKey || "").trim();
  } catch { return ""; }
}

function generateMissingAudio(job, info) {
  if (process.env.AUTO_GENERATE_MISSING_AUDIO === "0") {
    console.log("  falta voice/full.mp3; auto-generacion de audio desactivada");
    return false;
  }
  const missing = info.missingRequirements || [];
  if (!missing.length) return false;
  const onlyFullVoice = missing.length === 1
    && missing[0].kind === "voice"
    && /\/voice\/full\.mp3$/i.test(missing[0].path);
  if (!onlyFullVoice) return false;

  let p;
  try { p = readJson(job.jsonPath); } catch { return false; }
  const fullMp3 = missing[0].fullPath;
  if (fileOk(fullMp3)) {
    try { fs.rmSync(path.join(path.dirname(fullMp3), ".full.mp3.missing-since.json"), { force: true }); } catch { /* noop */ }
    return true;
  }

  fs.mkdirSync(path.dirname(fullMp3), { recursive: true });
  const lock = path.join(path.dirname(fullMp3), ".full.mp3.autogen.lock");
  const stateFile = path.join(path.dirname(fullMp3), ".full.mp3.autogen.json");
  const missingSinceFile = path.join(path.dirname(fullMp3), ".full.mp3.missing-since.json");
  const extensionInflightFile = path.join(path.dirname(fullMp3), ".full.mp3.extension-inflight.json");
  const jsonMtime = fs.statSync(job.jsonPath).mtimeMs;
  const tx = p.tts_export || {};
  const pt = p.pipeline?.tts || {};
  const attemptKey = JSON.stringify({
    jsonPath: path.resolve(job.jsonPath),
    jsonMtime,
    engine: tx.engine || pt.tool || "",
    model: tx.model_id || pt.model_id || "",
    voice: tx.voice_id || pt.voice_id || "",
  });
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (state.status === "failed" && state.attemptKey === attemptKey && process.env.AUTO_GENERATE_MISSING_AUDIO_RETRY !== "1") {
      console.log("  falta voice/full.mp3; autogeneracion ya fallo una vez para este JSON, no reintento automatico");
      return false;
    }
  } catch { /* sin estado previo */ }
  if (fs.existsSync(lock)) {
    console.log("  falta voice/full.mp3; ya hay una generacion de audio en curso");
    return false;
  }
  try {
    const inflight = JSON.parse(fs.readFileSync(extensionInflightFile, "utf8"));
    const age = Date.now() - (Number(inflight.startedAtMs) || 0);
    const maxAge = Math.max(5 * 60_000, Number(process.env.AUTO_GENERATE_MISSING_AUDIO_EXTENSION_WAIT_MS || 25 * 60_000) || 25 * 60_000);
    if (inflight.status === "running" && age >= 0 && age < maxAge) {
      console.log(`  falta voice/full.mp3; ElevenLabs sigue en curso en la extension (${Math.ceil((maxAge - age) / 60000)} min max antes de fallback)`);
      return false;
    }
  } catch { /* sin marker de extension */ }

  const graceMin = Math.max(0, Number(process.env.AUTO_GENERATE_MISSING_AUDIO_GRACE_MIN || 10) || 0);
  const graceMs = graceMin * 60 * 1000;
  const now = Date.now();
  let missingSince = now;
  try {
    const marker = JSON.parse(fs.readFileSync(missingSinceFile, "utf8"));
    if (marker.attemptKey === attemptKey && typeof marker.missingSinceMs === "number") {
      missingSince = marker.missingSinceMs;
    }
  } catch { /* primer ciclo donde se detecta solo full.mp3 faltante */ }
  if (missingSince === now) {
    fs.writeFileSync(missingSinceFile, JSON.stringify({
      attemptKey,
      missingSinceMs: missingSince,
      missingSince: new Date(missingSince).toISOString(),
      graceMin,
    }, null, 2));
  }
  const elapsedMs = now - missingSince;
  if (elapsedMs < graceMs) {
    const remainingMin = Math.ceil((graceMs - elapsedMs) / 60000);
    console.log(`  falta voice/full.mp3; espero a la extension ${remainingMin} min mas antes de autogenerar`);
    return false;
  }

  const run = (cmd, env = process.env) => {
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), attemptKey }, null, 2));
    const startedAt = new Date().toISOString();
    try {
      const r = spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true, env });
      const ok = r.status === 0 && fileOk(fullMp3);
      fs.writeFileSync(stateFile, JSON.stringify({
        status: ok ? "ok" : "failed",
        attemptKey,
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: r.status,
      }, null, 2));
      return ok;
    } finally {
      try { fs.rmSync(lock, { force: true }); } catch { /* noop */ }
    }
  };

  const elevenPreset = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(p.project?.preset || "");
  const wantsEleven = p.tts_export?.engine === "elevenlabs"
    || p.pipeline?.tts?.tool === "elevenlabs"
    || elevenPreset
    || /^eleven/i.test(p.tts_export?.model_id || "");
  if (wantsEleven) {
    const key = readElevenApiKey();
    if (!key) {
      console.log("  falta full.mp3, pero no hay elevenApiKey en secrets.local.json");
      return false;
    }
    const py = fs.existsSync(path.join(ROOT, ".venv-eleven", "Scripts", "python.exe"))
      ? path.join(ROOT, ".venv-eleven", "Scripts", "python.exe")
      : "python";
    console.log("  falta voice/full.mp3; generando con ElevenLabs como la extension...");
    return run(`"${py}" tts/tts_elevenlabs.py "${rel(job.jsonPath)}"`, {
      ...process.env,
      ELEVENLABS_API_KEY: key,
      ELEVENLABS_MAX_CONCURRENCY: process.env.ELEVENLABS_MAX_CONCURRENCY || "1",
    });
  }

  console.log("  falta voice/full.mp3; generando con Fish como la extension...");
  return run(`node tools/fish-voice.mjs "${rel(job.jsonPath)}"`);
}

function acquireBuildLock(slug) {
  const dir = path.join(PUBLIC, slug);
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, ".build.lock");
  try {
    if (fs.existsSync(lock)) {
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      let lockPid = null;
      try {
        const parsed = JSON.parse(fs.readFileSync(lock, "utf8"));
        const candidate = Number(parsed?.pid);
        if (Number.isSafeInteger(candidate) && candidate > 0) lockPid = candidate;
      } catch { /* lock legacy o truncado: conserva el fallback por antiguedad */ }
      let ownerAlive = null;
      if (lockPid != null) {
        try { process.kill(lockPid, 0); ownerAlive = true; }
        catch (e) { ownerAlive = e?.code === "EPERM"; }
      }
      // Un apagado/cierre abrupto no ejecuta releaseBuildLock. Antes ese archivo bloqueaba el slug
      // durante dos horas aunque su PID ya no existiera. Si el owner murio, retirarlo de inmediato;
      // para locks legacy sin PID y procesos vivos se conserva el limite temporal anterior.
      if (ownerAlive === false) {
        console.log(`... ${slug}: retiro build lock huerfano del PID ${lockPid}`);
        fs.rmSync(lock, { force: true });
      } else if (age < BUILD_LOCK_STALE_MS) {
        console.log(`... ${slug}: build/enhance ya esta corriendo en otro proceso; salto este ciclo`);
        return null;
      } else {
        fs.rmSync(lock, { force: true });
      }
    }
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), slug }, null, 2));
    return lock;
  } catch (e) {
    console.log(`... ${slug}: no pude crear build lock (${e?.message || e}); salto este ciclo`);
    return null;
  }
}

function releaseBuildLock(lock) {
  if (!lock) return;
  try { fs.rmSync(lock, { force: true }); } catch { /* noop */ }
}

function enhanceIfNeeded(job, slug) {
  if (!fs.existsSync(ENHANCE_EXE)) return; // tools de IA no instalados -> sin enhance
  let p;
  try {
    p = JSON.parse(fs.readFileSync(job.jsonPath, "utf8").replace(/^﻿/, ""));
  } catch {
    return;
  }
  if (p.project?.enhance === false) return; // opt-out por proyecto
  const preset = p.project?.preset || "";
  if (/^(historias|criptoclaro|habitos|pov-historias)/.test(preset)) return; // image-only base: sin enhance de clips
  if (["novela-coreana", "novelas-coreanas-eng"].includes(preset)) return; // evita deformar rostros lejanos con Real-ESRGAN/RIFE.
  const enhanceEnv = { ...process.env, ENHANCE_STEP_TIMEOUT_MS: process.env.ENHANCE_STEP_TIMEOUT_MS || String(15 * 60_000) };
  if (preset === "manhwa") {
    const animatedClipNames = (p.scenes || [])
      .filter((s) => s?.type !== "narrative_card" && s?.render_mode === "animated")
      .map((s) => `${s.id ?? s.scene_id}.mp4`)
      .filter(Boolean);
    const clipsDir = path.join(PUBLIC, slug, "clips");
    const wanted = new Set(animatedClipNames.map((f) => f.toLowerCase()));
    const hasClips = fs.existsSync(clipsDir)
      && fs.readdirSync(clipsDir).some((f) => wanted.has(f.toLowerCase()));
    if (!animatedClipNames.length || !hasClips) return;
    enhanceEnv.ENHANCE_CLIP_FILTER = animatedClipNames.join(";");
  }
  console.log("  mejorando clips con IA (Real-ESRGAN + RIFE, solo los nuevos)...");
  const enhanceTimeoutMs = Math.max(60_000, Number(process.env.ENHANCE_TIMEOUT_MS || 45 * 60_000) || 45 * 60_000);
  const enhanced = spawnSync(`node tools/enhance-clips.mjs "${slug}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    windowsHide: true,
    timeout: enhanceTimeoutMs,
    killSignal: "SIGKILL",
    env: enhanceEnv,
  });
  if (enhanced.error?.code === "ETIMEDOUT") {
    console.log(`  (enhance timeout ${Math.round(enhanceTimeoutMs / 60000)} min; renderizo con clips actuales)`);
    return;
  }
  if (enhanced.status !== 0) {
    console.log("  (enhance omitido/fallido; renderizo con clips actuales)");
    return;
  }
  // los clips quedan a 48fps -> el output tambien
  if (p.project && p.project.fps !== 48) {
    p.project.fps = 48;
    fs.writeFileSync(job.jsonPath, JSON.stringify(p, null, 2), "utf8");
  }
}

// Ajusta timeline.clip_duration_s de cada escena a la duracion REAL del clip (ffprobe). Grok genera
// clips de ~6s aunque el JSON declare 4 -> sin esto el clip se sobre-ralentiza y se pierde el final.
function syncClipDurations(job, slug) {
  let p;
  try { p = JSON.parse(fs.readFileSync(job.jsonPath, "utf8").replace(/^﻿/, "")); } catch { return; }
  const base = path.join(PUBLIC, slug, "clips");
  const stills = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(p.project?.preset || "");
  let changed = false;
  const probe = (s, clipsDir) => {
    if (stills && s?.render_mode !== "animated") return;
    const id = s.id ?? s.scene_id;
    if (!id) return;
    const clip = path.join(clipsDir, `${id}.mp4`);
    if (!fs.existsSync(clip)) return;
    const r = spawnSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${clip}"`, { encoding: "utf8", shell: true });
    const dur = Math.round(parseFloat((r.stdout || "").trim()) * 100) / 100;
    if (!isFinite(dur) || dur <= 0) return;
    s.timeline = s.timeline || {};
    if (s.timeline.clip_duration_s !== dur) { s.timeline.clip_duration_s = dur; changed = true; }
  };
  for (const s of p.scenes || []) probe(s, base);
  // opening: clips en public/<assets_slug>/clips/ (fallback: la carpeta del proyecto). Mismo ajuste por ffprobe.
  const openingClips = p.opening?.assets_slug ? path.join(PUBLIC, p.opening.assets_slug, "clips") : base;
  for (const s of p.opening?.scenes || []) probe(s, openingClips);
  if (changed) fs.writeFileSync(job.jsonPath, JSON.stringify(p, null, 2), "utf8");
}

function runWhisperXLogged(wxPy, job, mp3, wordsOut, slug) {
  const timeoutMs = Math.max(60_000, Number(process.env.WHISPERX_TIMEOUT_MS || 20 * 60_000) || 20 * 60_000);
  const logDir = path.join(LOGS, "whisperx");
  const logFile = path.join(logDir, `${slug}.log`);
  fs.mkdirSync(logDir, { recursive: true });
  const args = ["align/whisperx-align.py", rel(job.jsonPath), mp3, wordsOut];
  const r = spawnSync(wxPy, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    windowsHide: true,
  });
  fs.writeFileSync(logFile, [
    `$ "${wxPy}" ${args.map((a) => `"${a}"`).join(" ")}`,
    `exitCode=${r.status ?? ""}`,
    r.error ? `error=${r.error.code || ""} ${r.error.message || r.error}` : "",
    "",
    "[stdout]",
    r.stdout || "",
    "",
    "[stderr]",
    r.stderr || "",
  ].join("\n"), "utf8");
  return { ...r, logFile, timeoutMs };
}

// historias VOZ-CONTINUA: re-alinea el karaoke sobre full.mp3 con timestamps COMPLETOS (sin las omisiones de
// Fish) -> sobreescribe full.words.json. CASCADA por precision: (1) WhisperX (forced-alignment wav2vec2, ~30ms,
// si esta el venv .venv-wx) -> (2) whisper.cpp (transcripcion local) -> (3) si ambos fallan queda el de Fish
// (lo escribio fish-voice). Solo historias con full.mp3. Otros presets: no se toca.
function whisperAlignFull(job) {
  let p;
  try { p = JSON.parse(fs.readFileSync(job.jsonPath, "utf8").replace(/^﻿/, "")); } catch { return; }
  if (!/^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(p.project?.preset || "")) return;
  const slug = p.project?.slug || slugify(p.project?.title || job.name);
  const mp3 = path.join(PUBLIC, slug, "voice", "full.mp3");
  const wordsOut = path.join(PUBLIC, slug, "voice", "full.words.json");
  const elevenWords = path.join(PUBLIC, slug, "voice", "full.eleven.words.json");
  const elevenMeta = path.join(PUBLIC, slug, "voice", "full.tts-meta.json");
  if (!fileOk(mp3)) return;
  const wxPy = path.join(ROOT, ".venv-wx", "Scripts", "python.exe");
  const okWordsFile = (f) => { try { return fs.statSync(f).size > 1024; } catch { return false; } };
  const okWords = () => okWordsFile(wordsOut);
  const isEleven = String(p.pipeline?.tts?.tool || "").toLowerCase() === "elevenlabs" || !!p.tts_export?.voice_id;
  let trustedElevenWords = false;
  try {
    const meta = JSON.parse(fs.readFileSync(elevenMeta, "utf8"));
    const paths = Array.isArray(meta.paths_used) ? meta.paths_used : [];
    const alignmentSource = String(meta.alignment_source || "");
    trustedElevenWords = meta.source === "elevenlabs"
      && (paths.some((x) => /with_timestamps|forced_alignment/i.test(String(x)))
        || /forced_alignment/i.test(alignmentSource));
  } catch { /* sin meta: no confiar */ }
  if (isEleven && trustedElevenWords && okWordsFile(elevenWords)) {
    fs.copyFileSync(elevenWords, wordsOut);
    console.log("  usando timestamps nativos de ElevenLabs (sin pisarlos con WhisperX)");
    return;
  }
  if (fs.existsSync(wxPy)) {
    console.log("  alineando karaoke con WhisperX (log en logs/whisperx; timeout 20 min)...");
    const r = runWhisperXLogged(wxPy, job, mp3, wordsOut, slug);
    if (r.status === 0 && okWords()) {
      console.log(`  WhisperX listo (${rel(r.logFile)})`);
      return;
    }
    const why = r.error?.code === "ETIMEDOUT" ? `timeout ${Math.round(r.timeoutMs / 60000)} min` : `exit ${r.status ?? "error"}`;
    console.log(`  (WhisperX ${why} -> whisper.cpp; log: ${rel(r.logFile)})`);
  }
  console.log("  alineando karaoke con whisper.cpp (full.mp3)...");
  spawnSync(`node align/whisper-full.mjs "${rel(job.jsonPath)}"`, { cwd: ROOT, stdio: "inherit", shell: true });
}

function injectWords(job) {
  // Mete los timestamps por palabra (sidecars <id>.words.json; historias: full.words.json) al JSON, si los hay.
  spawnSync(`node align/inject-words.mjs "${rel(job.jsonPath)}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

function render(job, slug) {
  // MP4 rancio: si ya existe out/<slug>.mp4 de un render anterior (JSON viejo), lo apartamos a
  // .stale-<ts>.mp4 ANTES de renderizar. Asi out/<slug>.mp4 SOLO existe cuando lo produjo ESTE render,
  // y nada (Telegram "Enviar video", etc.) confunde un render viejo con uno fresco. Si el render falla,
  // no queda un mp4 rancio haciendose pasar por nuevo (queda el backup por si acaso).
  const dest = path.join(OUT, `${slug}.mp4`);
  if (fs.existsSync(dest)) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.renameSync(dest, path.join(OUT, `${slug}.stale-${stamp}.mp4`));
      try { fs.rmSync(path.join(OUT, `${slug}.render-meta.json`), { force: true }); } catch { /* noop */ }
    } catch (e) { console.log(`  (no pude apartar el mp4 anterior: ${e?.message || e})`); }
  }
  // --concurrency limitado para no saturar la PC (especialmente si se genera en paralelo)
  let propsPath = job.jsonPath;
  let runtimeProps = null;
  const sourceProps = readJson(job.jsonPath);
  const isNovelaJob = novelaOutroFolder(sourceProps.project?.preset) !== null;
  if (CLIPS_ONLY || isNovelaJob) {
    const p = sourceProps;
    if (CLIPS_ONLY) p.audio = { ...(p.audio || {}), _omit_scene_voice: true };
    // Es metadata exclusivamente de runtime: nunca confiamos en una ruta inyectada en el JSON de cola.
    delete p._novelaOutro;
    if (isNovelaJob) {
      const outro = prepareNovelaOutro(p, slug, videoSpeed(job));
      if (outro) p._novelaOutro = outro;
    }
    const runtimeDir = path.join(ROOT, "tmp", "build-runtime");
    fs.mkdirSync(runtimeDir, { recursive: true });
    runtimeProps = path.join(runtimeDir, `${slug}.${CLIPS_ONLY ? "clips-only" : "runtime"}.json`);
    fs.writeFileSync(runtimeProps, JSON.stringify(p, null, 2), "utf8");
    propsPath = runtimeProps;
    if (CLIPS_ONLY) console.log("  modo clips-only: omito la voz externa y conservo el audio propio de los clips");
  }
  const cmd = `npx remotion render ViralVideo "out/${slug}.mp4" --props="${rel(propsPath)}" --concurrency=6`;
  console.log("  > " + cmd);
  try {
    return spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true }).status === 0;
  } finally {
    if (runtimeProps) try { fs.rmSync(runtimeProps, { force: true }); } catch { /* temporal no critico */ }
  }
}

// Sello del render: firma del JSON que lo produjo. Permite distinguir un mp4 fresco de uno viejo cuando el
// slug se re-encola con un JSON editado (out/ NO se archiva en prepare-media, solo public/).
function writeRenderMeta(job, slug) {
  try {
    const p = readJson(job.jsonPath);
    fs.writeFileSync(path.join(OUT, `${slug}.render-meta.json`), JSON.stringify({
      signature: projectMediaSignature(p),
      finishedAt: new Date().toISOString(),
      job: job.name,
    }, null, 2), "utf8");
  } catch (e) { console.log(`  (no pude escribir render-meta: ${e?.message || e})`); }
}

// VELOCIDAD del video final. Historias SIEMPRE se finaliza a 1.20x: ningun valor speed del JSON
// puede sobrescribir ese ritmo. En los demas presets, los overrides del JSON siguen ganando.
function videoSpeed(job) {
  try {
    const p = JSON.parse(fs.readFileSync(job.jsonPath, "utf8").replace(/^﻿/, ""));
    if (/^historias/.test(p.project?.preset || "")) return 1.20;
    if (typeof p.project?.speed === "number") return p.project.speed;
    const finalSpeed = p.project?.speed_final;
    if (typeof finalSpeed === "number") return finalSpeed;
    const ttsSpeed = p.tts_export?.edit_speed ?? p.tts_export?.video_speed;
    if (typeof ttsSpeed === "number") return ttsSpeed;
    if (["novela-coreana", "novelas-coreanas-eng"].includes(p.project?.preset)) return 1.10;
    if (p.project?.preset === "manhwa" && p.tts_export?.mode === "dialogue") return 1.25; // fallback manhwa dialogue sin velocidad declarada
    return 1;
  } catch { return 1; }
}

// Remotion renderiza al FPS del proyecto. El finalizador debe conservarlo cuando aplica setpts; antes
// forzaba 24 fps y descartaba cuadros de proyectos manhwa declarados a 30 fps.
function projectFps(job) {
  try {
    const p = readJson(job.jsonPath);
    const requested = Number(p.project?.fps);
    if (Number.isFinite(requested) && requested >= 1 && requested <= 120) return requested;
  } catch { /* JSON ya fue validado; fallback defensivo */ }
  return 24;
}

// Finaliza el mp4: loudnorm a -14 LUFS SIEMPRE (feed consistente) + VELOCIDAD si speed != 1.0. A 1.0 solo
// re-codifica audio (-c:v copy = rapido). Con velocidad: setpts (video) + atempo (audio, mismo tono) -> 1 solo
// re-encode (crf 18, casi sin perdida en stills). IMPORTANTE: loudnorm RESAMPLEA a 96kHz por defecto -> forzar
// -ar 48000 y -b:a 192k o el AAC queda sub-codificado y la voz suena "vibrosa".
function finalizeVideo(slug, speed = 1, requestedFps = 24) {
  const src = path.join(OUT, `${slug}.mp4`);
  if (!fs.existsSync(src)) return;
  const tmp = path.join(OUT, `${slug}.norm.mp4`);
  const fast = !speed || Math.abs(speed - 1) < 0.001;
  const fps = Number.isFinite(requestedFps) && requestedFps >= 1 && requestedFps <= 120
    ? requestedFps
    : 24;
  const cmd = fast
    ? `ffmpeg -y -i "${src}" -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 -c:v copy -c:a aac -b:a 192k "${tmp}"`
    : `ffmpeg -y -i "${src}" -filter_complex "[0:v]setpts=PTS/${speed}[v];[0:a]atempo=${speed},loudnorm=I=-14:TP=-1.5:LRA=11[a]" -map "[v]" -map "[a]" -r ${fps} -ar 48000 -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k "${tmp}"`;
  const r = spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 1024) {
    fs.rmSync(src, { force: true });
    fs.renameSync(tmp, src);
    console.log(fast ? "  audio normalizado a -14 LUFS" : `  velocidad ${speed}x + audio normalizado a -14 LUFS`);
  } else {
    try { fs.rmSync(tmp, { force: true }); } catch { /* noop */ }
    console.log("  (finalize omitido: ffmpeg fallo o no disponible)");
  }
}

function moveDone(job) {
  fs.mkdirSync(DONE, { recursive: true });
  // Borra el lock de la cola (lo creo la extension al reclamar el trabajo); ya se renderizo.
  try { fs.rmSync(job.jsonPath + ".lock", { force: true }); } catch { /* sin lock: ok */ }
  if (job.dir) {
    const dest = path.join(DONE, job.name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(job.dir, dest);
  } else {
    // JSON suelto: moverlo a done/ para no re-renderizarlo en bucle en modo watch
    const dest = path.join(DONE, path.basename(job.jsonPath));
    // GUARD: si el origen YA es ese archivo en done/ (re-render directo `build.mjs done/x.json`), NO mover:
    // rmSync(dest) borraria el propio JSON y el rename tiraria ENOENT -> se autodestruia el maestro (perdida de datos).
    if (path.resolve(dest) === path.resolve(job.jsonPath)) return;
    fs.rmSync(dest, { force: true });
    fs.renameSync(job.jsonPath, dest);
  }
}

function processOnce() {
  const jobs = findJobs();
  if (!jobs.length) {
    console.log("Cola vacia (pon trabajos en queue/<nombre>/project.json).");
    return;
  }
  for (const job of jobs) {
    let info;
    try {
      info = inspectValidated(job);
    } catch (e) {
      console.log(`X ${job.name}: JSON invalido (${e.message})`);
      continue;
    }
    if (STATUS_ONLY) {
      if (info.missing.length) {
        console.log(`... ${job.name} (slug ${info.slug}): faltan ${info.missing.length} archivos`);
        for (const m of info.missing.slice(0, 12)) console.log("     - " + rel(m));
        if (info.missing.length > 12) console.log(`     ... y ${info.missing.length - 12} mas`);
        continue;
      }
      console.log(`OK ${job.name} (slug ${info.slug}): listo para renderizar`);
      continue;
    }
    const buildLock = acquireBuildLock(info.slug);
    if (!buildLock) continue;
    try {
      if (info.missing.length && generateMissingAudio(job, info)) {
        info = inspectValidated(job);
      }
      if (info.missing.length) {
        console.log(`... ${job.name} (slug ${info.slug}): faltan ${info.missing.length} archivos`);
        for (const m of info.missing.slice(0, 12)) console.log("     - " + rel(m));
        if (info.missing.length > 12) console.log(`     ... y ${info.missing.length - 12} mas`);
        continue;
      }
      console.log(`>> ${job.name} (slug ${info.slug}): todo listo, procesando...`);
      enhanceIfNeeded(job, info.slug);
      syncClipDurations(job, info.slug);
      whisperAlignFull(job);   // historias: timestamps completos con whisper antes de mapear ventanas
      injectWords(job);
      if (render(job, info.slug)) {
        finalizeVideo(info.slug, videoSpeed(job), projectFps(job)); // loudnorm + velocidad, conservando FPS del proyecto
        writeRenderMeta(job, info.slug);             // sella el mp4 con la firma del JSON (fresco vs viejo)
        console.log(`OK ${job.name}: out/${info.slug}.mp4`);
        moveDone(job);
      } else {
        console.log(`X ${job.name}: fallo el render`);
      }
    } finally {
      releaseBuildLock(buildLock);
    }
  }
}

ensureDirs();
if (WATCH) {
  console.log("Orquestador en modo watch (Ctrl+C para salir). Revisando cada 5s...");
  processOnce();
  setInterval(processOnce, 5000);
} else {
  processOnce();
}
