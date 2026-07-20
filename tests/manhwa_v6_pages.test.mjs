import assert from "node:assert/strict";

import { parseProject } from "../lib/json-loader.js";
import { validateQueueProject } from "../lib/queue-validator.js";
import { getMediaRequirements, projectMediaSignature } from "../shared/media-requirements.mjs";

const raw = {
  v6_contract: {
    version: "6.0",
    runtime_adapter: { page_blueprint_slots_integrated: true },
  },
  project: {
    title: "Pagina V6 runtime",
    preset: "manhwa",
    serie: "pagina_v6",
    slug: "pagina_v6_p1",
    language: "es-MX",
    aspect_ratio: "9:16",
    fps: 30,
    part: 1,
  },
  pipeline: {
    image_generation: { tool: "grok" },
    animation: { tool: "none" },
    tts: { tool: "elevenlabs", voice_id: "452WrNT9o8dphaYW5YGU", language: "es-MX" },
  },
  characters: {
    hero: {
      display_name: "Hero",
      poses: {
        tense: {
          mode: "generate",
          asset: "assets/characters/pagina_v6/hero_tense.png",
          prompt: "Full body Korean manhwa character reference, tense expression, neutral background.",
        },
      },
    },
  },
  escenarios: {
    room: {
      display_name: "Room",
      views: {
        high: {
          mode: "generate",
          asset: "assets/escenarios/pagina_v6/room_high.png",
          prompt: "Empty room from a high three-quarter angle, Korean manhwa background plate.",
        },
      },
    },
  },
  ingredients: [
    {
      id: "black_mark",
      type: "entity",
      output_file: "assets/ingredients/pagina_v6/black_mark.png",
      generation_prompt: "Black supernatural hand mark, isolated Korean manhwa prop reference.",
    },
  ],
  scenes: [
    {
      id: "scene_01",
      type: "panel",
      render_mode: "static",
      references: { characters: [{ id: "hero", pose: "tense" }] },
      visual: {
        image_prompt: "SHOT: high-angle profile medium shot of Hero noticing the black mark.",
        page_blueprint: {
          version: "6.0",
          template: "STACKED_2",
          composition_revision: 1,
          background: "#111111",
          gutter_px: 12,
          safe_area: { top: 0.02, right: 0.02, bottom: 0.02, left: 0.02 },
          reading_order: ["A", "B"],
          slots: [
            {
              id: "A",
              source: "images/cells/scene_01_A.jpg",
              prompt: "SHOT: high-angle profile medium shot of Hero noticing the black mark.",
              references: {
                characters: [{ id: "hero", pose: "tense" }],
                escenario: { id: "room", view: "high" },
              },
              x: 0.02, y: 0.02, w: 0.96, h: 0.46,
              fit: "cover", focal_point: { x: 0.5, y: 0.5 }, shape: "rect", z: 0,
              rotation_deg: 0, border_px: 2, border_color: "#000000", radius_px: 0,
            },
            {
              id: "B",
              source: "images/cells/scene_01_B.jpg",
              prompt: "SHOT: extreme close-up of the black mark opening across Hero's palm.",
              references: {
                characters: [{ id: "hero", pose: "tense" }],
                ingredients: [{ ingredient_id: "black_mark" }],
              },
              x: 0.02, y: 0.52, w: 0.96, h: 0.46,
              fit: "cover", focal_point: { x: 0.5, y: 0.5 }, shape: "rect", z: 0,
              rotation_deg: 0, border_px: 2, border_color: "#000000", radius_px: 0,
            },
          ],
        },
      },
      voiceover: { speaker: "narrador", text: "La marca abrió los ojos." },
      captions: { text: "La marca abrió los ojos." },
      editor_motion: { enabled: false, preset: "static", zoom: 1, pan: 0 },
      transition_in: "cut",
    },
  ],
  editing: { panel_motion: { enabled: true, cycle: ["slow_push_in"] } },
  tts_export: {
    provider: "elevenlabs",
    mode: "dialogue",
    model_id: "eleven_v3",
    voices: { narrador: "452WrNT9o8dphaYW5YGU" },
    dialogue: [{ scene_id: "scene_01", speaker: "narrador", text: "La marca abrió los ojos." }],
    full_script: "La marca abrió los ojos.",
  },
};

{
  const checked = validateQueueProject(raw);
  assert.equal(checked.ok, true, checked.errors.join("\n"));
  assert.equal(checked.warnings.length, 0, checked.warnings.join("\n"));
}

{
  const disabled = structuredClone(raw);
  disabled.v6_contract.runtime_adapter.page_blueprint_slots_integrated = false;
  const checked = validateQueueProject(disabled);
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.some((error) => error.includes("page_blueprint_slots_integrated=true")), checked.errors.join("\n"));
}

for (const [label, mutate, expectedError] of [
  ["page summary", (project) => { project.scenes[0].visual.image_prompt = "Page summary for scene_01"; }, "no puede ser \"Page summary\""],
  ["template", (project) => { project.scenes[0].visual.page_blueprint.template = "STAKCED_2"; }, "template invalido"],
  ["reading_order", (project) => { project.scenes[0].visual.page_blueprint.reading_order = ["A", "NO_EXISTE"]; }, "reading_order debe cubrir"],
  ["geometry", (project) => { project.scenes[0].visual.page_blueprint.slots[0].x = 9; }, "geometria x/y/w/h"],
  ["background color", (project) => { project.scenes[0].visual.page_blueprint.background = "negro"; }, "background debe usar #RRGGBB"],
  ["border color", (project) => { project.scenes[0].visual.page_blueprint.slots[0].border_color = "rgb(0,0,0)"; }, "border_color debe usar #RRGGBB"],
  ["cardinality", (project) => { project.scenes[0].visual.page_blueprint.slots.pop(); }, "requiere exactamente 2"],
  ["static motion", (project) => { project.scenes[0].editor_motion.extra = true; }, "editor_motion exacto"],
  ["ingredient bucket", (project) => { project.ingredients[0].output_file = "assets/characters/pagina_v6/black_mark.png"; }, "output_file debe vivir bajo assets/ingredients/pagina_v6/"],
]) {
  const malformed = structuredClone(raw);
  mutate(malformed);
  const checked = validateQueueProject(malformed);
  assert.equal(checked.ok, false, `${label}: el preflight no debe diferir el error hasta despues de gastar celdas`);
  assert.ok(checked.errors.some((error) => error.includes(expectedError)), checked.errors.join("\n"));
}

const parsed = parseProject(raw);
assert.equal(parsed.ok, true, parsed.errors?.join("\n"));
assert.deepEqual(parsed.scenes.map((scene) => scene.id), ["scene_01__cell_a", "scene_01__cell_b", "scene_01"]);
const [cellA, cellB, page] = parsed.scenes;
assert.equal(cellA.isPageCell, true);
assert.equal(cellA.pageCellSource, "images/cells/scene_01_A.jpg");
assert.match(cellA.imagePrompt, /high-angle profile/);
assert.deepEqual(cellA.characterRefIds, ["hero"]);
assert.equal(cellB.pageCellSource, "images/cells/scene_01_B.jpg");
assert.deepEqual(cellB.ingredientRefs, ["black_mark"]);
assert.equal(page.compositionOnly, true);
assert.deepEqual(page.pageCellIds, ["scene_01__cell_a", "scene_01__cell_b"]);
assert.deepEqual(page.sceneRefs.map((ref) => ref.sceneId), page.pageCellIds);
assert.equal(page.voiceoverText, "La marca abrió los ojos.");

const media = getMediaRequirements(raw).requirements.map((item) => item.path);
assert.ok(media.includes("pagina_v6_p1/images/scene_01.jpg"));
assert.ok(media.includes("pagina_v6_p1/voice/full.mp3"));
assert.equal(media.some((item) => item.includes("__cell_")), false);

const changedSlot = structuredClone(raw);
changedSlot.scenes[0].visual.page_blueprint.slots[0].prompt += " Changed camera.";
assert.notEqual(projectMediaSignature(changedSlot), projectMediaSignature(raw));

console.log("OK: manhwa V6 page_blueprint se aplana, genera celdas internas y conserva un solo JPG editorial");
