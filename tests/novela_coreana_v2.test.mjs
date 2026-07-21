import assert from "node:assert/strict";
import fs from "node:fs";

import { parseProject } from "../lib/json-loader.js";
import { validateQueueProject } from "../lib/queue-validator.js";
import { FISH_PRESETS, resolveFishVoice } from "../lib/messaging.js";
import { getMediaRequirements } from "../shared/media-requirements.mjs";

const FISH_NOVELA_VOICE = "bfed5c0810a347dbb62e8ccce7f59c48";
const FISH_ENGLISH_NOVELA_VOICE = "933563129e564b19a115bedd57b7406a";

const raw = {
  project: {
    title: "La Heredera Oculta - Parte 1",
    preset: "novela-coreana",
    serie: "heredera_oculta",
    slug: "heredera_oculta_parte_01",
    language: "es",
    aspect_ratio: "9:16",
    fps: 30,
    reuse_ingredients: true,
    grok_clip_seconds: "6",
    scene_target_seconds: 4,
    voice_ceiling_seconds: "5",
  },
  pipeline: {
    image_generation: { tool: "grok" },
    animation: { tool: "grok" },
    tts: { tool: "fish" },
  },
  characters: {
    soo_yeon: {
      display_name: "Soo-yeon",
      poses: {
        base: {
          mode: "existing",
          asset: "assets/characters/heredera_oculta/soo_yeon_base.png",
        },
        llorando_gala: {
          mode: "generate",
          asset: "assets/characters/heredera_oculta/soo_yeon_llorando_gala.png",
          reference_pose: "base",
          prompt: "Same Korean melodrama character, same face and hair, elegant gala dress, restrained tears, realistic East-Asian, neutral studio background.",
        },
      },
    },
  },
  escenarios: {
    gran_salon: {
      display_name: "Gran salon",
      views: {
        base: {
          mode: "existing",
          asset: "assets/escenarios/heredera_oculta/gran_salon_base.png",
        },
        desde_escalera: {
          mode: "generate",
          asset: "assets/escenarios/heredera_oculta/gran_salon_desde_escalera.png",
          reference_view: "base",
          prompt: "Same luxury hotel ballroom, new camera position from the staircase looking down, warm chandelier lighting, empty set, realistic Korean melodrama.",
        },
      },
    },
  },
  scenes: [
    {
      id: "scene_01",
      references: {
        characters: [{ id: "soo_yeon", pose: "base" }],
        escenario: { id: "gran_salon", view: "base" },
        scenes: [],
      },
      visual: {
        image_prompt: "Using the provided Soo-yeon in the provided grand ballroom: full body low-angle shot, restrained shock, elegant Korean family melodrama. No text. Vertical 9:16.",
        animation_prompt: "ACTION (within 4 seconds): Soo-yeon freezes, slowly lifts her chin, breathes shallowly, mouth closed, not speaking. Keep face exactly as provided. Vertical 9:16.",
      },
      voiceover: { text: "[low, cold, tense] Esa noche, todos descubrieron mi apellido.", speaker: "narrador" },
      captions: { text: "MI APELLIDO", highlight_words: ["apellido"] },
    },
    {
      id: "scene_02",
      render_mode: "animated",
      references: {
        characters: [{ id: "soo_yeon", pose: "llorando_gala" }],
        escenario: { id: "gran_salon", view: "desde_escalera" },
        scenes: [],
      },
      visual: {
        image_prompt: "Using the provided Soo-yeon in the provided grand ballroom staircase view: medium close-up from profile right, contained tears, guests blurred behind her. No text. Vertical 9:16.",
        animation_prompt: "ACTION (within 4 seconds): Soo-yeon turns her face to the right, one tear falls, she speaks with restrained dignity. IMPORTANT: ONLY Soo-yeon moves her mouth. Vertical 9:16.",
      },
      voiceover: { text: "No vine a pedir perdon. Vine a reclamarlo todo.", speaker: "narrador" },
      captions: { text: "", highlight_words: [] },
    },
  ],
  audio: { voice_speed: 1.25, voice_rate: 1, music_volume: 0 },
  tts_export: {
    mode: "per_scene",
    voice_id: FISH_NOVELA_VOICE,
    note: "Una sola voz femenina narra todas las escenas.",
  },
};

const existing = new Set([
  "assets/characters/heredera_oculta/soo_yeon_base.png",
  "assets/escenarios/heredera_oculta/gran_salon_base.png",
]);
const fileExists = (rel) => existing.has(rel);

const validated = validateQueueProject(raw, { fileExists });
assert.equal(validated.ok, true, validated.errors.join("\n"));
assert.equal(validated.provider, "grok");
assert.equal(validated.animationProvider, "grok");

const parsed = parseProject(raw);
assert.equal(parsed.ok, true, parsed.errors?.join("\n"));
assert.equal(parsed.project.preset, "novela-coreana");
assert.equal(parsed.project.imageOnly, false);
assert.equal(parsed.project.perSceneRender, false);
assert.equal(parsed.project.voiceSpeed, 1.25);
assert.equal(parsed.project.ttsExport.voice_id, FISH_NOVELA_VOICE);
assert.deepEqual(FISH_PRESETS["novela-coreana"], {
  voiceId: FISH_NOVELA_VOICE,
  model: "s2.1-pro",
});

const generatedAssets = parsed.project.ingredients
  .filter((g) => g.type === "manhwa_asset")
  .map((g) => g.outputFile);
assert.deepEqual(generatedAssets, [
  "assets/characters/heredera_oculta/soo_yeon_llorando_gala.png",
  "assets/escenarios/heredera_oculta/gran_salon_desde_escalera.png",
]);

const scenes = Object.fromEntries(parsed.scenes.map((s) => [s.id, s]));
assert.equal(scenes.scene_01.renderMode, "animated");
assert.deepEqual(scenes.scene_01.referenceAssets, [
  "assets/characters/heredera_oculta/soo_yeon_base.png",
  "assets/escenarios/heredera_oculta/gran_salon_base.png",
]);
assert.deepEqual(scenes.scene_02.referenceAssets, [
  "assets/characters/heredera_oculta/soo_yeon_llorando_gala.png",
  "assets/escenarios/heredera_oculta/gran_salon_desde_escalera.png",
]);

const mediaPaths = getMediaRequirements(raw).requirements.map((r) => r.path);
assert.ok(mediaPaths.includes("heredera_oculta_parte_01/clips/scene_01.mp4"));
assert.ok(mediaPaths.includes("heredera_oculta_parte_01/clips/scene_02.mp4"));
assert.ok(mediaPaths.includes("heredera_oculta_parte_01/voice/scene_01.mp3"));
assert.ok(mediaPaths.includes("heredera_oculta_parte_01/voice/scene_02.mp3"));
assert.equal(mediaPaths.some((p) => p.endsWith("/voice/full.mp3")), false);

// Ritmo editorial por defecto: Fish genera la diccion con voice_speed y el finalizador compacta
// todo el montaje a 1.10x. Un project.speed explicito sigue teniendo prioridad en build.mjs.
const buildSource = fs.readFileSync(new URL("../remotion-editor/orchestrator/build.mjs", import.meta.url), "utf8");
assert.match(buildSource, /if \(typeof p\.project\?\.speed === "number"\) return p\.project\.speed;[\s\S]*const finalSpeed = p\.project\?\.speed_final;[\s\S]*\["novela-coreana", "novelas-coreanas-eng"\]\.includes\(p\.project\?\.preset\)\) return 1\.10;/);
assert.equal(mediaPaths.some((p) => p.includes("/images/")), false);

// Ambos presets agrupan captions en bloques de 3..4 palabras y usan 60% del tamano historico.
const englishRaw = structuredClone(raw);
englishRaw.project.preset = "novelas-coreanas-eng";
englishRaw.project.language = "en";
englishRaw.tts_export.voice_id = "otra_voz_que_debe_ser_ignorada";
const englishValidated = validateQueueProject(englishRaw, { fileExists });
assert.equal(englishValidated.ok, true, englishValidated.errors.join("\n"));
const englishParsed = parseProject(englishRaw);
assert.equal(englishParsed.ok, true, englishParsed.errors?.join("\n"));
assert.equal(englishParsed.project.preset, "novelas-coreanas-eng");
assert.equal(englishParsed.project.voiceSpeed, 1.25);
assert.equal(englishParsed.scenes.every((scene) => scene.renderMode === "animated"), true);
assert.equal(englishParsed.project.ttsExport.voice_id, FISH_ENGLISH_NOVELA_VOICE);
assert.deepEqual(FISH_PRESETS["novelas-coreanas-eng"], {
  voiceId: FISH_ENGLISH_NOVELA_VOICE,
  model: "s2.1-pro",
  forceVoice: true,
});
assert.equal(resolveFishVoice("novelas-coreanas-eng", "otra_voz_de_config").voiceId, FISH_ENGLISH_NOVELA_VOICE);
const englishMediaPaths = getMediaRequirements(englishRaw).requirements.map((r) => r.path);
assert.deepEqual(englishMediaPaths, mediaPaths);
const presetsSource = fs.readFileSync(new URL("../remotion-editor/src/viral/presets.ts", import.meta.url), "utf8");
assert.match(presetsSource, /"novela-coreana"[\s\S]*?captionMinWords:\s*3,[\s\S]*?captionMaxWords:\s*4,[\s\S]*?captionScale:\s*0\.6,/);
assert.match(presetsSource, /"novelas-coreanas-eng"[\s\S]*?captionMinWords:\s*3,[\s\S]*?captionMaxWords:\s*4,[\s\S]*?captionScale:\s*0\.6,/);
const fishToolSource = fs.readFileSync(new URL("../remotion-editor/tools/fish-voice.mjs", import.meta.url), "utf8");
assert.match(fishToolSource, /const voiceId = presetCfg\?\.forceVoice \? _presetVoice : \(_voiceArg \|\| _presetVoice \|\| DEFAULT_VOICE_ID\);/);

const badVoice = validateQueueProject({
  ...raw,
  pipeline: { ...raw.pipeline, tts: { tool: "elevenlabs" } },
}, { fileExists });
assert.equal(badVoice.ok, false);
assert.ok(badVoice.errors.some((e) => /Fish Audio/.test(e)), badVoice.errors.join("\n"));

console.log("OK: novela-coreana v2 asset graph + Fish per-scene");
