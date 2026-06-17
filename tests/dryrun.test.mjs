// tests/dryrun.test.mjs
// Test node-puro del modulo B: parseProject + dryRunPlan sobre el JSON de ejemplo.
// Ejecutar: node tests/dryrun.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseProject } from "../lib/json-loader.js";
import { dryRunPlan } from "../lib/queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplePath = join(__dirname, "..", "examples", "qpasaria_esqueleto_schema_v1.json");
const raw = JSON.parse(readFileSync(examplePath, "utf8"));

// Parsea el proyecto.
const parsed = parseProject(raw);
assert.equal(parsed.ok, true, "parseProject deberia devolver ok:true");
assert.equal(parsed.scenes.length, 6, "deberia parsear 6 escenas");
assert.equal(parsed.project.aspectRatio, "9:16", "aspectRatio mapeado desde aspect_ratio");

// Genera el plan dry-run con un nombre de personaje cualquiera.
const characterRefName = "Leo_ref.png";
const plan = dryRunPlan(parsed.scenes, characterRefName);
assert.equal(plan.length, 6, "el plan deberia tener 6 escenas");

// scene_01: el paso resolve_ingredients NO debe incluir prev_frame.
const s1 = plan[0];
assert.equal(s1.sceneId, "scene_01");
const s1Refs = s1.steps.find((st) => st.action === "resolve_ingredients").detail.refs;
assert.ok(
  !s1Refs.some((r) => r.endsWith("_lastframe.png")),
  "scene_01 NO debe incluir ningun *_lastframe.png"
);
assert.ok(s1Refs.includes(characterRefName), "scene_01 debe incluir el character_ref");

// scene_02: debe encadenar 'scene_01_lastframe.png'.
const s2 = plan[1];
assert.equal(s2.sceneId, "scene_02");
const s2Refs = s2.steps.find((st) => st.action === "resolve_ingredients").detail.refs;
assert.ok(
  s2Refs.includes("scene_01_lastframe.png"),
  "scene_02 debe incluir 'scene_01_lastframe.png'"
);

// Verifica nombres de clip y frame de cada escena.
for (const { sceneId, steps } of plan) {
  const dl = steps.find((st) => st.action === "download").detail.clipFilename;
  const fr = steps.find((st) => st.action === "extract_frame").detail.lastFrameFilename;
  assert.equal(dl, `${sceneId}.mp4`);
  assert.equal(fr, `${sceneId}_lastframe.png`);
}

// Imprime el plan de las 6 escenas.
console.log("=== Plan dry-run (6 escenas) ===");
for (const { sceneId, steps } of plan) {
  console.log(`\n[${sceneId}]`);
  for (const st of steps) {
    console.log(`  - ${st.action}: ${st.label} ${JSON.stringify(st.detail)}`);
  }
}

console.log("\nOK: todos los asserts pasaron.");
