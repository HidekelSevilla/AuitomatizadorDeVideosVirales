// Orquestador de la cola: vigila queue/, verifica que cada trabajo tenga TODOS
// sus medios (clips de Flow + audios de Fish + musica + sfx) y dispara el render.
// NO toca la extension: solo lee carpetas y llama a Remotion. Sin dependencias externas.
//
// Uso:
//   node orchestrator/build.mjs            -> procesa todos los trabajos listos (una vez)
//   node orchestrator/build.mjs --status   -> solo reporta que falta en cada trabajo
//   node orchestrator/build.mjs --watch     -> daemon: revisa la cola cada 5s
//   node orchestrator/build.mjs ./data/x.json -> procesa ese JSON puntual

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const QUEUE = path.join(ROOT, "queue");
const DONE = path.join(ROOT, "done");
const OUT = path.join(ROOT, "out");
const PUBLIC = path.join(ROOT, "public");

const args = process.argv.slice(2);
const STATUS_ONLY = args.includes("--status");
const WATCH = args.includes("--watch");
const explicit = args.find((a) => !a.startsWith("--"));

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

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
  const order = p.capcut_export?.clip_order || (p.scenes || []).map((s) => s.id);

  const need = [];
  for (const id of order) {
    need.push(path.join(base, "clips", `${id}.mp4`));
    need.push(path.join(base, "voice", `${id}.mp3`));
  }
  if (p.hook) need.push(path.join(base, "voice", "hook.mp3"));
  if (p.audio?.music_file) need.push(path.join(base, p.audio.music_file));
  if (p.audio?.transition_sfx) need.push(path.join(PUBLIC, "sfx", p.audio.transition_sfx));
  for (const s of p.scenes || []) for (const c of s.sfx || []) need.push(path.join(PUBLIC, "sfx", c.file));

  const missing = [...new Set(need)].filter((f) => !fs.existsSync(f));
  return { slug, missing };
}

const ENHANCE_EXE = path.join(ROOT, "tools", "realesrgan", "realesrgan-ncnn-vulkan.exe");

function enhanceIfNeeded(job, slug) {
  if (!fs.existsSync(ENHANCE_EXE)) return; // tools de IA no instalados -> sin enhance
  let p;
  try {
    p = JSON.parse(fs.readFileSync(job.jsonPath, "utf8").replace(/^﻿/, ""));
  } catch {
    return;
  }
  if (p.project?.enhance === false) return; // opt-out por proyecto
  console.log("  mejorando clips con IA (Real-ESRGAN + RIFE, solo los nuevos)...");
  spawnSync(`node tools/enhance-clips.mjs "${slug}"`, { cwd: ROOT, stdio: "inherit", shell: true });
  // los clips quedan a 48fps -> el output tambien
  if (p.project && p.project.fps !== 48) {
    p.project.fps = 48;
    fs.writeFileSync(job.jsonPath, JSON.stringify(p, null, 2), "utf8");
  }
}

function injectWords(job) {
  // Mete los timestamps por palabra de Fish (sidecars <id>.words.json) al JSON, si los hay.
  spawnSync(`node align/inject-words.mjs "${rel(job.jsonPath)}"`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

function render(job, slug) {
  // --concurrency limitado para no saturar la PC (especialmente si se genera en paralelo)
  const cmd = `npx remotion render ViralVideo "out/${slug}.mp4" --props="${rel(job.jsonPath)}" --concurrency=6`;
  console.log("  > " + cmd);
  return spawnSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true }).status === 0;
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
      info = inspect(job);
    } catch (e) {
      console.log(`X ${job.name}: JSON invalido (${e.message})`);
      continue;
    }
    if (info.missing.length) {
      console.log(`... ${job.name} (slug ${info.slug}): faltan ${info.missing.length} archivos`);
      for (const m of info.missing.slice(0, 12)) console.log("     - " + rel(m));
      if (info.missing.length > 12) console.log(`     ... y ${info.missing.length - 12} mas`);
      continue;
    }
    if (STATUS_ONLY) {
      console.log(`OK ${job.name} (slug ${info.slug}): listo para renderizar`);
      continue;
    }
    console.log(`>> ${job.name} (slug ${info.slug}): todo listo, procesando...`);
    enhanceIfNeeded(job, info.slug);
    injectWords(job);
    if (render(job, info.slug)) {
      console.log(`OK ${job.name}: out/${info.slug}.mp4`);
      moveDone(job);
    } else {
      console.log(`X ${job.name}: fallo el render`);
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
