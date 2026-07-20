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

// El contrato humano suele escribir "Grok" con mayuscula. El loader debe normalizarlo y nunca caer al
// proveedor global guardado (que podria ser Flow) por una diferencia de casing.
{
  const providerCase = parseProject({
    project: { title: "Proveedor Grok", preset: "manhwa" },
    pipeline: { image_generation: { tool: "Grok" } },
    scenes: [{ id: "s1", visual: { image_prompt: "pagina Grok" } }],
  });
  assert.equal(providerCase.ok, true, providerCase.errors?.join("\n"));
  assert.equal(providerCase.project.provider, "grok");
  assert.equal(providerCase.project.imageProvider, "grok");
}

// Una corrida comparativa puede exigir un proyecto Flow realmente nuevo aunque la preferencia global
// sea reutilizar el abierto. El flag se conserva normalizado para que el SW pueda fallar cerrado.
{
  const freshFlow = parseProject({
    project: { title: "Flow limpio", serie: "flow_limpio", force_new_flow_project: true },
    pipeline: { image_generation: { tool: "flow" }, animation: { tool: "none" } },
    scenes: [{ id: "s1", visual: { image_prompt: "imagen de prueba" } }],
  });
  assert.equal(freshFlow.ok, true, freshFlow.errors?.join("\n"));
  assert.equal(freshFlow.project.forceNewFlowProject, true);
  assert.equal(freshFlow.project.imageProvider, "flow");
  assert.equal(freshFlow.project.imageOnly, true);
}

// --- Dry-run no debe romper con el esquema nuevo y debe reflejar las refs ---
const plan = dryRunPlan(parsed.scenes, null);
assert.equal(plan.length, 6, "plan de 6 escenas");
const s2refs = plan[1].steps.find((st) => st.action === "resolve_ingredients").detail.refs;
assert.ok(s2refs.includes("Huesito"), "dry-run scene_02 muestra el personaje Huesito");
assert.ok(s2refs.includes("scene_01 (escena)"), "dry-run scene_02 muestra ref a scene_01");

// ---------------------------------------------------------------------------
// FLUJO DE INGREDIENTES (nuevo, opcional). Biblioteca ingredients[] + references.ingredients.
// Aditivo: un JSON sin 'ingredients' se comporta igual (cubierto por el ejemplo de arriba: 0 warnings).
// ---------------------------------------------------------------------------

// (i1) ingredientes validos: se parsean a project.ingredients y references.ingredients -> scene.ingredientRefs.
{
  const r = parseProject({
    project: { title: "Huesito P1", serie: "huesito", part: 2 },
    characters: { huesito: { display_name: "Huesito", reference_asset: "assets/characters/huesito_ref.png" } },
    ingredients: [
      { id: "huesito_green", type: "character_edited", base: "huesito", edit_prompt: "green hoodie", output_file: "assets/ingredients/huesito_green.png" },
      { id: "alien", type: "entity", generation_prompt: "black alien", output_file: "assets/ingredients/alien.png", persistent: true, regenerate: false },
      { id: "plate_reforma", type: "location_plate", generation_prompt: "reforma empty", output_file: "assets/ingredients/plate_reforma.png", regenerate: true },
    ],
    scenes: [{ id: "s1", visual: { image_prompt: "p", animation_prompt: "a" }, references: { characters: ["huesito_green"], ingredients: ["plate_reforma", "alien"], scenes: [] } }],
  });
  assert.equal(r.ok, true, `i1: ok. errores: ${JSON.stringify(r.errors)}`);
  assert.equal(r.warnings.length, 0, `i1: sin warnings. ${JSON.stringify(r.warnings)}`);
  assert.equal(r.project.ingredients.length, 3, "i1: 3 ingredientes en el proyecto");
  assert.equal(r.project.seriesId, "huesito"); assert.equal(r.project.part, 2,
    "i1: serie/parte se conservan para asociar el proyecto Flow de P2");
  const ce = r.project.ingredients.find((g) => g.id === "huesito_green");
  assert.equal(ce.type, "character_edited"); assert.equal(ce.base, "huesito");
  assert.equal(ce.prompt, "green hoodie", "i1: edit_prompt -> prompt");
  assert.equal(ce.imageUrl, null); assert.equal(ce.imageFilePath, null, "i1: campos runtime arrancan null");
  assert.equal(r.project.ingredients.find((g) => g.id === "alien").persistent, true,
    "i1: la intencion de persistencia no se pierde al normalizar");
  assert.equal(r.project.ingredients.find((g) => g.id === "plate_reforma").regeneratePending, true,
    "i1: regenerate:true debe impedir rehidratar el asset episodico viejo");
  assert.deepEqual(r.scenes[0].ingredientRefs, ["plate_reforma", "alien"], "i1: ingredientRefs por escena");
  // references.characters con un id de character_edited NO debe warnear (es valido, no es base).
  assert.deepEqual(r.scenes[0].characterRefIds, ["huesito_green"], "i1: characterRefIds conserva el id editado");
}

// (i2) errores estructurales en ingredients -> ok:false (no rompe JSONs viejos, solo el bloque nuevo).
{
  const r = parseProject({
    project: { title: "X" }, characters: { huesito: { display_name: "Huesito" } },
    ingredients: [
      { id: "bad1", type: "nope", output_file: "a.png" },
      { id: "bad2", type: "entity" },
      { id: "bad3", type: "character_edited", base: "noexiste", output_file: "c.png" },
    ],
    scenes: [{ id: "s1", visual: { image_prompt: "p", animation_prompt: "a" } }],
  });
  assert.equal(r.ok, false, "i2: ok:false por ingredientes invalidos");
  assert.ok(r.errors.some((e) => /bad1.*type' invalido/.test(e)), "i2: type invalido");
  assert.ok(r.errors.some((e) => /bad2.*output_file/.test(e)), "i2: falta output_file");
  assert.ok(r.errors.some((e) => /bad2.*generation_prompt/.test(e)), "i2: entity sin generation_prompt");
  assert.ok(r.errors.some((e) => /bad3.*base.*no esta/.test(e)), "i2: base inexistente");
}

// (i3) una colision de output_file es fatal: P2 no puede decidir que identidad debe hidratar.
{
  const r = parseProject({
    project: { title: "X" }, characters: { huesito: { display_name: "Huesito" } },
    ingredients: [
      { id: "alien", type: "entity", generation_prompt: "x", output_file: "dup.png" },
      { id: "ship", type: "entity", generation_prompt: "y", output_file: "dup.png" },
    ],
    scenes: [{ id: "s1", visual: { image_prompt: "p", animation_prompt: "a" }, references: { ingredients: ["fantasma"], scenes: [{ scene_id: "s1" }] } }],
  });
  assert.equal(r.ok, false, "i3: ok:false por identidad de output_file ambigua");
  assert.ok(r.errors.some((e) => /colisiona/.test(e)), "i3: colision de output_file fatal");
}

// (i4) contratos que anidan project.series tambien deben conservar el enlace P1 -> P2.
{
  const r = parseProject({
    project: { title: "Saga P2", series: { id: "saga_nested", part: 2 } },
    scenes: [{ id: "s1", visual: { image_prompt: "p", animation_prompt: "a" } }],
  });
  assert.equal(r.ok, true); assert.equal(r.project.seriesId, "saga_nested"); assert.equal(r.project.part, 2);
}

// (i5) el grafo manhwa generado tampoco puede escribir dos identidades al mismo asset.
{
  const duplicate = "assets/characters/saga/pose_duplicada.png";
  const r = parseProject({
    project: { title: "Saga", preset: "manhwa" },
    characters: {
      hero: {
        display_name: "Hero", reference_asset: "assets/characters/saga/hero.jpg",
        poses: {
          uno: { mode: "generate", asset: duplicate, prompt: "pose one" },
          dos: { mode: "generate", asset: duplicate, prompt: "pose two" },
        },
      },
    },
    scenes: [{ id: "s1", visual: { image_prompt: "p", animation_prompt: "a" } }],
  });
  assert.equal(r.ok, false, "i5: dos nodos generados con el mismo output deben fallar");
  assert.ok(r.errors.some((e) => /asset generado.*colisiona/.test(e)));
}

console.log("OK schema v2: prompts, personajes, refs de escena, metadatos y FLUJO DE INGREDIENTES cableados correctamente.");
