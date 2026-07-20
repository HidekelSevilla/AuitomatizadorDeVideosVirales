import assert from "node:assert/strict";

import { validateQueueProject } from "../lib/queue-validator.js";
import { getMediaRequirements, projectMediaSignature } from "../shared/media-requirements.mjs";

function baseProject() {
  return {
    project: {
      title: "Test habitos",
      slug: "test_habitos",
      preset: "habitos_finanzas",
      aspect_ratio: "16:9",
    },
    pipeline: {
      image_generation: { tool: "grok" },
      animation: { tool: "grok_video" },
      audio: { tool: "elevenlabs" },
    },
    ingredients: [
      {
        ingredient_id: "protagonista_base",
        type: "character",
        reference_asset: "assets/characters/protagonista_base.png",
        generation_prompt: "personaje manual",
      },
      {
        ingredient_id: "telefono",
        type: "entity",
        reference_asset: "assets/ingredients/telefono.png",
        generation_prompt: "telefono simple",
      },
    ],
    scenes: [
      {
        scene_id: "scene_01",
        render_mode: "static",
        image_prompt: "imagen estatica",
        references: { ingredients: [{ ingredient_id: "protagonista_base" }, { ingredient_id: "telefono" }] },
        voiceover: { text: "Primera frase." },
      },
      {
        scene_id: "scene_02",
        render_mode: "animated",
        image_prompt: "imagen animada",
        animation: { prompt: "movimiento sutil" },
        references: { ingredients: [{ ingredient_id: "protagonista_base" }] },
        voiceover: { text: "Segunda frase." },
      },
    ],
    render_export: { clip_order: ["scene_01", "scene_02"] },
    tts_export: { full_script: "Primera frase. Segunda frase." },
  };
}

const fileExists = (rel) => rel === "assets/characters/protagonista_base.png";

{
  const p = baseProject();
  const res = validateQueueProject(p, { fileExists });
  assert.equal(res.ok, true, res.errors.join("\n"));
  assert.equal(res.provider, "grok");
  assert.equal(res.animationProvider, "grok");

  const media = getMediaRequirements(p);
  assert.ok(media.requirements.some((r) => r.path === "test_habitos/images/scene_01.jpg"));
  assert.ok(media.requirements.some((r) => r.path === "test_habitos/clips/scene_02.mp4"));
  assert.ok(media.requirements.some((r) => r.path === "test_habitos/voice/full.mp3"));
}

{
  const p = baseProject();
  p.pipeline.image_generation.tool = "flow";
  const res = validateQueueProject(p, { fileExists });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('pipeline.image_generation.tool "grok"')));
}

{
  const p = baseProject();
  delete p.scenes[1].animation;
  const res = validateQueueProject(p, { fileExists });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("animation.prompt") || e.includes("render_mode")));
}

{
  const p = baseProject();
  p.tts_export.full_script = "Texto distinto.";
  const res = validateQueueProject(p, { fileExists });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("full_script")));
}

{
  const p = baseProject();
  const res = validateQueueProject(p, { fileExists: () => false });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("no existe assets/characters/protagonista_base.png")));
}

{
  const p = baseProject();
  p.tts_export.elevenlabs_speed = 1.15;
  p.tts_export.edit_speed = 1.0;
  const original = projectMediaSignature(p);

  p.tts_export.edit_speed = 1.4;
  assert.equal(projectMediaSignature(p), original);

  p.tts_export.elevenlabs_speed = 1.2;
  assert.notEqual(projectMediaSignature(p), original);
}

{
  const p = {
    project: { title: "Flow limpio", slug: "flow_limpio", preset: "manhwa", serie: "flow_limpio", aspect_ratio: "9:16", comparison_variant: "flow_images_only" },
    pipeline: { image_generation: { tool: "flow" }, animation: { tool: "none" }, tts: { tool: "elevenlabs" } },
    scenes: [{ id: "scene_01", type: "panel", render_mode: "static", visual: { image_prompt: "panel vertical terminado" }, voiceover: { speaker: "narrador", text: "Hola." } }],
    tts_export: { full_script: "Hola.", dialogue: [{ scene_id: "scene_01", speaker: "narrador", text: "Hola." }] },
  };
  const res = validateQueueProject(p, { fileExists: () => true });
  assert.equal(res.ok, true, res.errors.join("\n"));
  assert.equal(res.provider, "flow");
  assert.equal(res.animationProvider, "none", "una comparativa solo-imagen debe declarar que no anima");
}

console.log("OK: queue validator");
