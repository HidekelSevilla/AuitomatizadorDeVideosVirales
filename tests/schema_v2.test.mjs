// tests/schema_v2.test.mjs
// Test del esquema NUEVO de produccion: parseProject sobre el JSON con visual.*, references.*,
// characters, cast, voiceover, tts_export. Verifica el cableado para el flujo de Flow.
// Ejecutar: node tests/schema_v2.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseProject } from "../lib/json-loader.js";
import { dryRunPlan } from "../lib/queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplePath = join(__dirname, "..", "examples", "qpasaria_energeticas_prod_v2.json");
const raw = JSON.parse(readFileSync(examplePath, "utf8"));

const parsed = parseProject(raw);
assert.equal(parsed.ok, true, `parseProject deberia ok:true. Errores: ${JSON.stringify(parsed.errors)}`);
assert.equal(parsed.scenes.length, 6, "deberia parsear 6 escenas");
assert.equal(parsed.project.aspectRatio, "9:16", "aspectRatio desde project.aspect_ratio");
assert.equal(parsed.warnings.length, 0, `no deberia haber warnings: ${JSON.stringify(parsed.warnings)}`);

// Mapa de personajes disponible para resolver display_name.
assert.equal(parsed.project.characters.huesito.display_name, "Huesito", "characters.huesito.display_name");

// --- Prompts desde visual.* ---
for (const sc of parsed.scenes) {
  assert.ok(sc.imagePrompt.length > 0, `${sc.id}: imagePrompt no vacio (visual.image_prompt)`);
  assert.ok(sc.animationPrompt.length > 0, `${sc.id}: animationPrompt no vacio (visual.animation_prompt)`);
  assert.equal(sc.clipDurationS, 4, `${sc.id}: clip de 4s`);
}

// --- Referencias de personaje: cada escena adjunta "Huesito" (display_name, no el id) ---
for (const sc of parsed.scenes) {
  assert.deepEqual(sc.characterRefs, ["Huesito"], `${sc.id}: characterRefs = ["Huesito"]`);
  assert.deepEqual(sc.characterRefIds, ["huesito"], `${sc.id}: characterRefIds = ["huesito"]`);
}

// --- Referencias de escena previa ---
const byId = Object.fromEntries(parsed.scenes.map((s) => [s.id, s]));
assert.deepEqual(byId.scene_01.sceneRefs, [], "scene_01 no referencia ninguna escena");
assert.equal(byId.scene_02.sceneRefs.length, 1, "scene_02 referencia 1 escena");
assert.equal(byId.scene_02.sceneRefs[0].sceneId, "scene_01", "scene_02 -> scene_01");
assert.equal(byId.scene_02.sceneRefs[0].strength, "strong", "scene_02 ref fuerte");
assert.equal(byId.scene_05.sceneRefs[0].sceneId, "scene_04", "scene_05 -> scene_04");
assert.equal(byId.scene_06.sceneRefs[0].sceneId, "scene_04", "scene_06 -> scene_04 (no scene_05)");

// --- Metadatos para fases futuras ---
assert.equal(byId.scene_01.voiceoverText, "Hora uno. Al principio se siente perfecto: energia fria, dulce y explosiva.");
assert.equal(byId.scene_05.locationId, "mental_energy_space", "scene_05 cambia de location");
assert.equal(byId.scene_05.changeLevel, "major");
assert.equal(parsed.project.ttsExport.full_script.length, 6, "tts_export.full_script con 6 lineas");
assert.deepEqual(parsed.project.capcutExport.clip_order, ["scene_01","scene_02","scene_03","scene_04","scene_05","scene_06"]);

// --- Dry-run no debe romper con el esquema nuevo y debe reflejar las refs ---
const plan = dryRunPlan(parsed.scenes, null);
assert.equal(plan.length, 6, "plan de 6 escenas");
const s2refs = plan[1].steps.find((st) => st.action === "resolve_ingredients").detail.refs;
assert.ok(s2refs.includes("Huesito"), "dry-run scene_02 muestra el personaje Huesito");
assert.ok(s2refs.includes("scene_01 (escena)"), "dry-run scene_02 muestra ref a scene_01");

console.log("OK schema v2: prompts, personajes, refs de escena y metadatos cableados correctamente.");
