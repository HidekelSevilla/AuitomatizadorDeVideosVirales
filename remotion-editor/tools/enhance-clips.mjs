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
const WORK = path.join(ROOT, "tools", "work");

const SCALE = Number(process.argv[3]) || 2; // 2 -> 1440, 4 -> 2880 (arg opcional)
const MODEL_RE = "realesr-animevideov3"; // ideal para video/animacion
const MODEL_RIFE = "rife-v4.6";
const OUT_FPS = 48; // 24 -> 48 (interpolado)

const slug = process.argv[2];
if (!slug) {
  console.error("Uso: node tools/enhance-clips.mjs <slug>");
  process.exit(1);
}
const clipsDir = path.join(ROOT, "public", slug, "clips");
const rawDir = path.join(ROOT, "public", slug, "clips_raw");
if (!fs.existsSync(clipsDir)) {
  console.error("No existe", clipsDir);
  process.exit(1);
}
fs.mkdirSync(rawDir, { recursive: true });

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error(`fallo: ${path.basename(cmd)} (${r.status})`);
};

const resetWork = () => {
  fs.rmSync(WORK, { recursive: true, force: true });
  for (const d of ["f", "up", "out"]) fs.mkdirSync(path.join(WORK, d), { recursive: true });
};

const clipFps = (f) => {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", f],
    { encoding: "utf8" }
  );
  return (r.stdout || "").trim();
};

const clips = fs.readdirSync(clipsDir).filter((f) => /\.mp4$/i.test(f)).sort();
console.log(`Mejorando clips de ${slug} (Real-ESRGAN x${SCALE} + RIFE -> ${OUT_FPS}fps)`);

for (const name of clips) {
  const raw = path.join(rawDir, name);
  const cur = path.join(clipsDir, name);
  // idempotente: si ya esta a 48fps (y respaldado), saltar
  if (fs.existsSync(raw) && clipFps(cur).startsWith(String(OUT_FPS))) {
    console.log(`  ${name}: ya mejorado, salto`);
    continue;
  }
  if (!fs.existsSync(raw)) fs.copyFileSync(cur, raw); // backup 1 vez (el original)
  resetWork();
  process.stdout.write(`  ${name}: extraer`);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, path.join(WORK, "f", "%08d.png")]);
  process.stdout.write(" -> upscale");
  run(RE, ["-i", path.join(WORK, "f"), "-o", path.join(WORK, "up"), "-n", MODEL_RE, "-s", String(SCALE), "-f", "png"]);
  process.stdout.write(" -> interpolar");
  run(RIFE, ["-i", path.join(WORK, "up"), "-o", path.join(WORK, "out"), "-m", MODEL_RIFE]);
  process.stdout.write(" -> encode");
  run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(OUT_FPS),
    "-i", path.join(WORK, "out", "%08d.png"),
    "-i", raw,
    "-map", "0:v", "-map", "1:a?",
    "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-shortest",
    path.join(clipsDir, name),
  ]);
  console.log(" OK");
}

fs.rmSync(WORK, { recursive: true, force: true });
console.log("Listo. Originales respaldados en", path.relative(ROOT, rawDir));
