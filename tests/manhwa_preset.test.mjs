import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseProject } from "../lib/json-loader.js";
import { validateQueueProject } from "../lib/queue-validator.js";
import { getMediaRequirements } from "../shared/media-requirements.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dirname, "..", "remotion-editor", "data", "manhwa_test.json");
const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
const MANHWA_DEFAULT_VOICE = "452WrNT9o8dphaYW5YGU";

const assets = new Set([
  "assets/characters/serie_test/kael_base.png",
  "assets/characters/serie_test/kael_espada.png",
  "assets/escenarios/serie_test/salon_clases.png",
]);
const fileExists = (rel) => assets.has(rel);

{
  const res = validateQueueProject(raw, { fileExists });
  assert.equal(res.ok, true, res.errors.join("\n"));
  assert.equal(res.provider, "grok");
  assert.equal(res.animationProvider, "grok");
  console.log("VALIDATION_OK manhwa assets presentes");
}

{
  const jpgVariants = new Set([
    "assets/characters/serie_test/kael_base.jpg",
    "assets/characters/serie_test/kael_espada.jpg",
    "assets/escenarios/serie_test/salon_clases.jpg",
  ]);
  const res = validateQueueProject(raw, { fileExists: (rel) => jpgVariants.has(rel) });
  assert.equal(res.ok, true, res.errors.join("\n"));
  console.log("EXTENSION_VARIANT_OK png declarado puede existir como jpg");
}

{
  const missing = "assets/characters/serie_test/kael_espada.png";
  const res = validateQueueProject(raw, { fileExists: (rel) => rel !== missing && fileExists(rel) });
  assert.equal(res.ok, false);
  const msg = res.errors.find((e) => e.includes(`no existe ${missing}`));
  assert.ok(msg, res.errors.join("\n"));
  console.log(`MISSING_ASSET_ERROR ${msg}`);
}

{
  // references.assets (sistema_ui): resuelve contra characters.<id>.poses y adjunta su asset
  const withAsset = structuredClone(raw);
  withAsset.characters.sistema_ui = {
    poses: { base: { mode: "existing", asset: "assets/characters/serie_test/sistema_ui_base.png" } },
  };
  withAsset.scenes[0].references.assets = [{ id: "sistema_ui", pose: "base" }];
  const assetsPlus = new Set([...assets, "assets/characters/serie_test/sistema_ui_base.png"]);
  const res = validateQueueProject(withAsset, { fileExists: (rel) => assetsPlus.has(rel) });
  assert.equal(res.ok, true, res.errors.join("\n"));
  assert.equal(res.warnings.some((w) => w.includes("characters.sistema_ui") && w.includes("ninguna escena")), false, res.warnings.join("\n"));
  const p2 = parseProject(withAsset);
  assert.equal(p2.ok, true, p2.errors?.join("\n"));
  const s01 = p2.scenes.find((s) => s.id === "scene_01");
  assert.ok(s01.referenceAssets.includes("assets/characters/serie_test/sistema_ui_base.png"), s01.referenceAssets.join(", "));
  console.log("REFERENCES_ASSETS_OK sistema_ui adjunto via references.assets");

  // pose inexistente en references.assets -> error
  withAsset.scenes[0].references.assets = [{ id: "sistema_ui", pose: "no_existe" }];
  const resBad = validateQueueProject(withAsset, { fileExists: (rel) => assetsPlus.has(rel) });
  assert.equal(resBad.ok, false);
  assert.ok(resBad.errors.some((e) => e.includes('no tiene pose "no_existe"')), resBad.errors.join("\n"));
  console.log("REFERENCES_ASSETS_BAD_POSE_ERROR_OK");
}

{
  // personaje/asset declarado pero no referenciado por ninguna escena -> warning
  const unused = structuredClone(raw);
  unused.characters.sistema_ui = {
    poses: { base: { mode: "existing", asset: "assets/characters/serie_test/sistema_ui_base.png" } },
  };
  const assetsPlus = new Set([...assets, "assets/characters/serie_test/sistema_ui_base.png"]);
  const res = validateQueueProject(unused, { fileExists: (rel) => assetsPlus.has(rel) });
  assert.equal(res.ok, true, res.errors.join("\n"));
  assert.ok(res.warnings.some((w) => w.includes("characters.sistema_ui") && w.includes("ninguna escena")), res.warnings.join("\n"));
  console.log("UNUSED_CHARACTER_WARNING_OK");
}

{
  // typo en editor_motion.preset / panel_motion.cycle -> error (antes caia en silencio a pan_lr)
  const typo = structuredClone(raw);
  typo.scenes[3].editor_motion.preset = "bottom_left_top_right";
  const res = validateQueueProject(typo, { fileExists });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('editor_motion.preset invalido "bottom_left_top_right"')), res.errors.join("\n"));

  const typoCycle = structuredClone(raw);
  typoCycle.editing.panel_motion.cycle.push("pan_diagonal");
  const res2 = validateQueueProject(typoCycle, { fileExists });
  assert.equal(res2.ok, false);
  assert.ok(res2.errors.some((e) => e.includes("editing.panel_motion.cycle[5]")), res2.errors.join("\n"));
  console.log("MOTION_PRESET_VALIDATION_OK typo -> error");
}

const parsed = parseProject(raw);
assert.equal(parsed.ok, true, parsed.errors?.join("\n"));
assert.equal(parsed.project.preset, "manhwa");
assert.equal(parsed.project.imageOnly, true);
assert.equal(parsed.project.perSceneRender, true);
assert.equal(parsed.project.ttsExport.engine, "elevenlabs");
assert.equal(parsed.project.ttsExport.voice_id, MANHWA_DEFAULT_VOICE);
assert.equal(parsed.project.ttsExport.model_id, "eleven_multilingual_v2");
assert.equal(parsed.project.ttsExport.elevenlabs_speed, 1.0);
assert.deepEqual(parsed.project.ttsExport.voice_settings, {
  stability: 0.5,
  similarity_boost: 0.4,
  style: 0.7,
  use_speaker_boost: true,
});
console.log(`MANHWA_DEFAULT_VOICE ${parsed.project.ttsExport.voice_id}`);

assert.equal(
  parsed.project.flowReferenceNames["assets/characters/serie_test/kael_base.png"],
  "Personaje — Kael — Base",
);
assert.equal(
  parsed.project.flowReferenceNames["assets/characters/serie_test/kael_herido.png"],
  "Personaje — Kael — Herido",
);
assert.equal(
  parsed.project.flowReferenceNames["assets/escenarios/serie_test/salon_clases.png"],
  "Escenario — Salon de clases — Base",
);
assert.equal(
  parsed.project.flowReferenceNames["assets/escenarios/serie_test/salon_contrapicado.png"],
  "Escenario — Salon de clases — Contrapicado",
);
assert.equal(
  parsed.project.ingredients.find((g) => g.outputFile.endsWith("kael_herido.png"))?.flowName,
  "Personaje — Kael — Herido",
);
assert.equal(
  parsed.project.ingredients.find((g) => g.outputFile.endsWith("salon_contrapicado.png"))?.flowName,
  "Escenario — Salon de clases — Contrapicado",
);
console.log("FLOW_SEMANTIC_MEDIA_NAMES_OK personajes y escenarios");

{
  const withoutDominantBase = structuredClone(raw);
  withoutDominantBase.characters.kael.poses.herido.reference_pose = false;
  withoutDominantBase.escenarios.salon.views.contrapicado.reference_view = false;
  const isolated = parseProject(withoutDominantBase);
  assert.equal(isolated.ok, true, isolated.errors?.join("\n"));
  const wounded = isolated.project.ingredients.find((g) => g.outputFile.endsWith("kael_herido.png"));
  const lowAngle = isolated.project.ingredients.find((g) => g.outputFile.endsWith("salon_contrapicado.png"));
  assert.deepEqual(wounded.referenceAssets, []);
  assert.deepEqual(lowAngle.referenceAssets, []);
  console.log("MANHWA_POSE_AND_VIEW_REFERENCE_OPT_OUT_OK");
}

// tts_export.voice_id "suelto" sigue sin pasar (guard anti-voz-accidental del generador de JSON)
const parsedWithOtherVoice = parseProject({
  ...raw,
  tts_export: { ...(raw.tts_export || {}), voice_id: "OTRA_VOZ_NO_DEBE_PASAR" },
});
assert.equal(parsedWithOtherVoice.ok, true, parsedWithOtherVoice.errors?.join("\n"));
assert.equal(parsedWithOtherVoice.project.ttsExport.voice_id, MANHWA_DEFAULT_VOICE);
console.log("MANHWA_FORCE_VOICE_OK");

// voz de narrador POR SERIE: tts_export.voices.narrador gana sobre pipeline.tts.voice_id
const parsedNarradora = parseProject({
  ...raw,
  tts_export: { ...(raw.tts_export || {}), voices: { narrador: "VOZ_NARRADORA_SERIE" } },
  pipeline: { ...(raw.pipeline || {}), tts: { ...(raw.pipeline?.tts || {}), voice_id: "VOZ_PIPELINE" } },
});
assert.equal(parsedNarradora.ok, true, parsedNarradora.errors?.join("\n"));
assert.equal(parsedNarradora.project.ttsExport.voice_id, "VOZ_NARRADORA_SERIE");

// sin voices.narrador, pipeline.tts.voice_id declara la voz de la serie
const parsedPipelineVoice = parseProject({
  ...raw,
  pipeline: { ...(raw.pipeline || {}), tts: { ...(raw.pipeline?.tts || {}), voice_id: "VOZ_PIPELINE" } },
});
assert.equal(parsedPipelineVoice.ok, true, parsedPipelineVoice.errors?.join("\n"));
assert.equal(parsedPipelineVoice.project.ttsExport.voice_id, "VOZ_PIPELINE");
console.log("MANHWA_NARRATOR_VOICE_PER_SERIES_OK");
const parsedDialogue = parseProject({
  ...raw,
  scenes: raw.scenes.map((s, i) => ({
    ...s,
    voiceover: { ...(s.voiceover || {}), speaker: i === 1 ? "sistema" : "narrador" },
  })),
  tts_export: { ...(raw.tts_export || {}), mode: "dialogue", voices: { narrador: MANHWA_DEFAULT_VOICE, sistema: "iOeCMakiJ4CctfQaM9yd" } },
});
assert.equal(parsedDialogue.ok, true, parsedDialogue.errors?.join("\n"));
assert.equal(parsedDialogue.scenes[1].voiceoverSpeaker, "sistema");
console.log("MANHWA_DIALOGUE_SPEAKER_OK");
assert.equal(raw.editing.panel_motion.enabled, true);
assert.equal(raw.scenes[3].editor_motion.preset, "bottom_left_to_top_right");
console.log("EDITOR_MOTION_OK default global + override por escena");
assert.deepEqual(parsed.project.ingredients.filter((g) => g.type === "manhwa_asset").map((g) => g.outputFile), [
  "assets/characters/serie_test/kael_herido.png",
  "assets/escenarios/serie_test/salon_contrapicado.png",
]);
console.log(`ASSET_GENERATE ${parsed.project.ingredients.filter((g) => g.type === "manhwa_asset").map((g) => g.outputFile).join(", ")}`);

const scenes = Object.fromEntries(parsed.scenes.map((s) => [s.id, s]));
assert.deepEqual(scenes.scene_01.referenceAssets, [
  "assets/characters/serie_test/kael_base.png",
  "assets/escenarios/serie_test/salon_clases.png",
]);
assert.deepEqual(scenes.scene_01.characterReferenceAssets, [
  "assets/characters/serie_test/kael_base.png",
]);
assert.deepEqual(scenes.scene_04.referenceAssets, [
  "assets/characters/serie_test/kael_herido.png",
  "assets/escenarios/serie_test/salon_contrapicado.png",
]);
assert.deepEqual(scenes.scene_04.characterReferenceAssets, [
  "assets/characters/serie_test/kael_herido.png",
]);
assert.equal(scenes.scene_03.sceneType, "narrative_card");
assert.equal(scenes.scene_03.skipImageGeneration, true);

const media = getMediaRequirements(raw);
const paths = media.requirements.map((r) => r.path);
assert.ok(paths.includes("manhwa_test/images/scene_01.jpg"));
assert.ok(paths.includes("manhwa_test/images/scene_02.jpg"));
assert.ok(paths.includes("manhwa_test/clips/scene_04.mp4"));
assert.ok(paths.includes("manhwa_test/voice/full.mp3"));
assert.equal(paths.some((p) => p.includes("scene_03")), false);
console.log(`MEDIA_REQUIRED ${paths.join(", ")}`);
console.log("CARD_EDITOR scene_03 -> no image requirement, no Grok image call");

const animationJobs = raw.scenes.filter((s) => s.type === "panel" && s.render_mode === "animated").map((s) => s.id);
const staticPanels = raw.scenes.filter((s) => s.type === "panel" && s.render_mode !== "animated").map((s) => s.id);
assert.deepEqual(animationJobs, ["scene_04"]);
for (const id of staticPanels) console.log(`SKIP_ANIMATION ${id}`);
for (const id of animationJobs) console.log(`ANIM_JOB ${id}`);

const buildSource = readFileSync(join(__dirname, "..", "remotion-editor", "orchestrator", "build.mjs"), "utf8");
const ttsConfigSource = readFileSync(join(__dirname, "..", "remotion-editor", "tts", "config.py"), "utf8");
const prepareFlowSource = readFileSync(join(__dirname, "..", "scripts", "prepare-ladron-flow-v2-final.mjs"), "utf8");
const viralVideoSource = readFileSync(join(__dirname, "..", "remotion-editor", "src", "viral", "ViralVideo.tsx"), "utf8");
assert.match(buildSource, /preset === "manhwa"[\s\S]*return 1\.25;/);
assert.match(ttsConfigSource, /MANHWA_V2_SPEED[\s\S]*"1\.0"/);
assert.match(ttsConfigSource, /MANHWA_DIALOGUE_EDIT_SPEED[\s\S]*"1\.25"/);
assert.match(prepareFlowSource, /elevenlabs_speed:\s*1\.0/);
assert.match(prepareFlowSource, /edit_speed:\s*1\.25/);
assert.match(prepareFlowSource, /music_volume:\s*0\.0325/);
assert.match(viralVideoSource, /MANHWA_MUSIC_VOL = 0\.0325/);
console.log("MANHWA_DEFAULTS voice=1.00 edit=1.25 music=0.0325");

console.log("OK: manhwa preset");
