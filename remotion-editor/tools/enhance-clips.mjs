// Mejora los clips de Flow con IA (local, GPU): Real-ESRGAN (720->1440) + RIFE (24->48fps).
// Guarda los originales en clips_raw/ y reemplaza clips/ por las versiones mejoradas
// (el editor los usa solos, mismo nombre). Re-ejecutable: siempre parte del raw.
//
// Uso: node tools/enhance-clips.mjs <slug>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RE = path.join(ROOT, "tools", "realesrgan", "realesrgan-ncnn-vulkan.exe");
const RIFE = path.join(ROOT, "tools", "rife", "rife-ncnn-vulkan-20221029-windows", "rife-ncnn-vulkan.exe");
const WORK_ROOT = path.join(ROOT, "tools", "work");
const LOG_DIR = path.join(ROOT, "logs", "enhance");

const SCALE = Number(process.argv[3]) || 2; // 2 -> 1440, 4 -> 2880 (arg opcional)
const MODEL_RE = "realesr-animevideov3"; // ideal para video/animacion
const MODEL_RIFE = "rife-v4.6";
const OUT_FPS = 48; // 24 -> 48 (interpolado)
const STEP_TIMEOUT_MS = Math.max(60_000, Number(process.env.ENHANCE_STEP_TIMEOUT_MS || 15 * 60_000) || 15 * 60_000);

const slug = process.argv[2];
if (!slug) {
  console.error("Uso: node tools/enhance-clips.mjs <slug>");
  process.exit(1);
}
const safeSlug = slug.replace(/[^a-zA-Z0-9_.-]/g, "_");
const WORK = path.join(WORK_ROOT, safeSlug);
const clipsDir = path.join(ROOT, "public", slug, "clips");
const rawDir = path.join(ROOT, "public", slug, "clips_raw");
if (!fs.existsSync(clipsDir)) {
  console.error("No existe", clipsDir);
  process.exit(1);
}
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = path.join(LOG_DIR, `${slug}.log`);
fs.writeFileSync(LOG_FILE, `Mejorando clips de ${slug}\n`, "utf8");

const log = (message) => {
  console.log(message);
  fs.appendFileSync(LOG_FILE, `${message}\n`, "utf8");
};

const run = (cmd, args) => {
  fs.appendFileSync(LOG_FILE, `\n$ "${cmd}" ${args.map((a) => `"${a}"`).join(" ")}\n`, "utf8");
  const logFd = fs.openSync(LOG_FILE, "a");
  let r;
  try {
    r = spawnSync(cmd, args, {
      cwd: ROOT,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      timeout: STEP_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
  } finally {
    fs.closeSync(logFd);
  }
  if (r.error?.code === "ETIMEDOUT") {
    throw new Error(`timeout: ${path.basename(cmd)} (${Math.round(STEP_TIMEOUT_MS / 60000)} min). Log: ${path.relative(ROOT, LOG_FILE)}`);
  }
  if (r.status !== 0) throw new Error(`fallo: ${path.basename(cmd)} (${r.status}). Log: ${path.relative(ROOT, LOG_FILE)}`);
};

const resetWork = () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  for (const d of ["f", "up", "out"]) fs.mkdirSync(path.join(WORK, d), { recursive: true });
};

const hasPngFrames = (dir) => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /\.png$/i.test(f));

const clipFps = (f) => {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", f],
    { encoding: "utf8" }
  );
  return (r.stdout || "").trim();
};

const clips = fs.readdirSync(clipsDir).filter((f) => /\.mp4$/i.test(f)).sort();
log(`Mejorando clips de ${slug} (Real-ESRGAN x${SCALE} + RIFE -> ${OUT_FPS}fps). Log: ${path.relative(ROOT, LOG_FILE)}`);

for (const name of clips) {
  const raw = path.join(rawDir, name);
  const cur = path.join(clipsDir, name);
  // idempotente: si ya esta a 48fps (y respaldado), saltar
  if (fs.existsSync(raw) && clipFps(cur).startsWith(String(OUT_FPS))) {
    log(`  ${name}: ya mejorado, salto`);
    continue;
  }
  if (!fs.existsSync(raw)) fs.copyFileSync(cur, raw); // backup 1 vez (el original)
  resetWork();
  log(`  ${name}: extraer`);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, path.join(WORK, "f", "%08d.png")]);
  if (!hasPngFrames(path.join(WORK, "f"))) throw new Error(`${name}: ffmpeg no extrajo frames`);
  log(`  ${name}: upscale`);
  run(RE, ["-i", path.join(WORK, "f"), "-o", path.join(WORK, "up"), "-n", MODEL_RE, "-s", String(SCALE), "-f", "png"]);
  if (!hasPngFrames(path.join(WORK, "up"))) throw new Error(`${name}: Real-ESRGAN no produjo frames`);
  log(`  ${name}: interpolar`);
  run(RIFE, ["-i", path.join(WORK, "up"), "-o", path.join(WORK, "out"), "-m", MODEL_RIFE]);
  if (!hasPngFrames(path.join(WORK, "out"))) throw new Error(`${name}: RIFE no produjo frames`);
  log(`  ${name}: encode`);
  run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(OUT_FPS),
    "-i", path.join(WORK, "out", "%08d.png"),
    "-i", raw,
    "-map", "0:v", "-map", "1:a?",
    "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-shortest",
    path.join(clipsDir, name),
  ]);
  log(`  ${name}: OK`);
}

fs.rmSync(WORK, { recursive: true, force: true });
log(`Listo. Originales respaldados en ${path.relative(ROOT, rawDir)}`);
