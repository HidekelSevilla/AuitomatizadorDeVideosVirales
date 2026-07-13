import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = fs.mkdtempSync(path.join(ROOT, "assets", "__asset_store_test_"));
const relDir = path.relative(ROOT, testDir).replace(/\\/g, "/");
const publicTestDir = fs.mkdtempSync(path.join(ROOT, "remotion-editor", "public", "__asset_store_test_"));
const publicRelDir = path.relative(ROOT, publicTestDir).replace(/\\/g, "/");
const port = 39000 + (process.pid % 1000);
const server = spawn(process.execPath, ["dev/reload-server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, FLOW_DEV_PORT: String(port), FLOW_DEV_ALLOW_TEST_SOURCES: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
const base = `http://127.0.0.1:${port}`;
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const makeImage = (dest, mode = "smooth") => {
  const script = `
import os, sys
from PIL import Image
p, mode = sys.argv[1], sys.argv[2]
w = h = 720
if mode == "noise":
    im = Image.frombytes("RGB", (w, h), os.urandom(w*h*3))
else:
    y = Image.linear_gradient("L").resize((w, h))
    im = Image.merge("RGB", (y, y.point(lambda v: min(255, 30 + v//2)), y.point(lambda v: min(255, 70 + v//3))))
im.save(p, quality=92)
`;
  const out = spawnSync("python", ["-c", script, dest, mode], { encoding: "utf8", windowsHide: true });
  if (out.status !== 0) throw new Error(out.stderr || "no pude crear imagen de prueba");
};

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) return; } catch { /* arrancando */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("el dev-server de prueba no arranco");
}

try {
  await waitForServer();

  const forbiddenHomePath = path.join(os.homedir(), "imagen-fuera-de-downloads.jpg");
  const forbiddenValidation = await fetch(`${base}/image/validate?path=${encodeURIComponent(forbiddenHomePath)}`, { method: "POST" });
  assert.equal(forbiddenValidation.status, 403, "image/validate no debe leer cualquier archivo bajo HOME");

  const forbiddenMove = await fetch(`${base}/move?from=${encodeURIComponent(forbiddenHomePath)}&to=${encodeURIComponent(`${publicRelDir}/forbidden.jpg`)}`, { method: "POST" });
  assert.equal(forbiddenMove.status, 403, "move no debe copiar/borrar un origen arbitrario fuera de Downloads");
  const forbiddenAssetMove = await fetch(`${base}/asset/move?from=${encodeURIComponent(forbiddenHomePath)}&to=${encodeURIComponent(`${relDir}/forbidden.jpg`)}`, { method: "POST" });
  assert.equal(forbiddenAssetMove.status, 403, "asset/move no debe copiar/borrar un origen arbitrario fuera de Downloads");

  // Origen y destino identicos deben ser un no-op; antes asset/move terminaba borrando el canonical.
  const sameAsset = path.join(testDir, "same.jpg");
  makeImage(sameAsset, "smooth");
  const sameAssetHash = sha(fs.readFileSync(sameAsset));
  const sameAssetResponse = await fetch(`${base}/asset/move?from=${encodeURIComponent(sameAsset)}&to=${encodeURIComponent(`${relDir}/same.jpg`)}`, { method: "POST" });
  const sameAssetJson = await sameAssetResponse.json();
  assert.equal(sameAssetResponse.status, 200); assert.equal(sameAssetJson.noop, true);
  assert.equal(sha(fs.readFileSync(sameAsset)), sameAssetHash, "asset/move no debe borrar el canonical si from==dest");

  const samePublic = path.join(publicTestDir, "same.jpg");
  fs.writeFileSync(samePublic, Buffer.alloc(20_000, 0x62));
  const samePublicHash = sha(fs.readFileSync(samePublic));
  const sameMoveResponse = await fetch(`${base}/move?from=${encodeURIComponent(samePublic)}&to=${encodeURIComponent(`${publicRelDir}/same.jpg`)}`, { method: "POST" });
  const sameMoveJson = await sameMoveResponse.json();
  assert.equal(sameMoveResponse.status, 200); assert.equal(sameMoveJson.noop, true);
  assert.equal(sha(fs.readFileSync(samePublic)), samePublicHash, "move no debe borrar el archivo si from==dest");

  // Una descarga truncada no puede destruir el canonical bueno.
  const canonical = path.join(testDir, "stable.jpg");
  const good = Buffer.alloc(20_000, 0x31);
  const bad = path.join(testDir, "incoming-bad.jpg");
  fs.writeFileSync(canonical, good);
  fs.writeFileSync(bad, Buffer.alloc(100, 0x99));
  const rejected = await fetch(`${base}/asset/move?from=${encodeURIComponent(bad)}&to=${encodeURIComponent(`${relDir}/stable.jpg`)}`, { method: "POST" });
  assert.equal(rejected.status, 422);
  assert.equal(sha(fs.readFileSync(canonical)), sha(good), "el canonical debe sobrevivir intacto");
  assert.equal(fs.existsSync(bad), true, "el origen rechazado se conserva para diagnostico");

  // La validacion usa bytes decodificados + detector calibrado. El ruido no puede sustituir un
  // canonical aunque tenga resolucion/peso correctos.
  const qualityCanonical = path.join(testDir, "quality-stable.jpg");
  const qualityGood = path.join(testDir, "quality-good.jpg");
  const qualityNoise = path.join(testDir, "quality-noise.png");
  makeImage(qualityCanonical, "smooth"); makeImage(qualityGood, "smooth"); makeImage(qualityNoise, "noise");
  const canonicalQualityHash = sha(fs.readFileSync(qualityCanonical));
  const validQuality = await fetch(`${base}/image/validate?path=${encodeURIComponent(qualityGood)}`, { method: "POST" });
  const validQualityJson = await validQuality.json();
  assert.equal(validQuality.status, 200, JSON.stringify(validQualityJson)); assert.equal(validQualityJson.accepted, true);
  assert.match(validQualityJson.sha256, /^[0-9a-f]{64}$/);
  const rejectedQuality = await fetch(`${base}/image/validate?path=${encodeURIComponent(qualityNoise)}`, { method: "POST" });
  const rejectedQualityJson = await rejectedQuality.json();
  assert.equal(rejectedQuality.status, 422); assert.equal(rejectedQualityJson.isNoise, true);
  const noiseMove = await fetch(`${base}/asset/move?from=${encodeURIComponent(qualityNoise)}&to=${encodeURIComponent(`${relDir}/quality-stable.jpg`)}`, { method: "POST" });
  assert.equal(noiseMove.status, 422);
  assert.equal(sha(fs.readFileSync(qualityCanonical)), canonicalQualityHash,
    "el ruido de tamano completo no debe reemplazar el canonical");

  // Simula apagado entre canonical->backup y temp->canonical; /charfile debe terminar el swap.
  const recovered = path.join(testDir, "recover.png");
  const backup = `${recovered}.bak-999-111`;
  const temp = path.join(testDir, "recover.tmp-999-222.png");
  const oldBytes = Buffer.alloc(20_100, 0x41);
  const newBytes = Buffer.alloc(20_200, 0x42);
  fs.writeFileSync(backup, oldBytes);
  fs.writeFileSync(temp, newBytes);
  const recoveredResponse = await fetch(`${base}/charfile?path=${encodeURIComponent(`${relDir}/recover.png`)}`);
  const recoveredJson = await recoveredResponse.json();
  assert.equal(recoveredJson.ok, true);
  assert.equal(sha(fs.readFileSync(recovered)), sha(newBytes), "el temporal valido debe ganar al backup");
  assert.equal(recoveredJson.sha256, sha(newBytes));
  assert.equal(fs.existsSync(backup), false); assert.equal(fs.existsSync(temp), false);

  // La extension declarada puede venir en mayusculas; no debe producir Foo.PNG.jpg.
  const oldUpper = path.join(testDir, "Foo.PNG");
  const upperSource = path.join(testDir, "upper-source.jpg");
  fs.writeFileSync(oldUpper, Buffer.alloc(20_000, 0x50));
  makeImage(upperSource, "smooth");
  const upperBytes = fs.readFileSync(upperSource);
  const upperResponse = await fetch(`${base}/asset/move?from=${encodeURIComponent(upperSource)}&to=${encodeURIComponent(`${relDir}/Foo.PNG`)}`, { method: "POST" });
  const upperJson = await upperResponse.json();
  const upperFinal = path.join(testDir, "Foo.jpg");
  assert.equal(upperResponse.status, 200); assert.equal(upperJson.ok, true);
  assert.equal(fs.existsSync(upperFinal), true); assert.equal(fs.existsSync(oldUpper), false);
  assert.equal(sha(fs.readFileSync(upperFinal)), sha(upperBytes));
  assert.equal(fs.existsSync(path.join(testDir, "Foo.PNG.jpg")), false);

  console.log("OK: asset store rechaza ruido/rutas inseguras, conserva same-path y recupera apagones");
} finally {
  try { server.kill(); } catch { /* noop */ }
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(publicTestDir, { recursive: true, force: true });
}
