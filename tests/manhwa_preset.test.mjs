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

const parsed = parseProject(raw);
assert.equal(parsed.ok, true, parsed.errors?.join("\n"));
assert.equal(parsed.project.preset, "manhwa");
assert.equal(parsed.project.imageOnly, true);
assert.equal(parsed.project.perSceneRender, true);
assert.equal(parsed.project.ttsExport.engine, "elevenlabs");
assert.equal(parsed.project.ttsExport.voice_id, MANHWA_DEFAULT_VOICE);
console.log(`MANHWA_DEFAULT_VOICE ${parsed.project.ttsExport.voice_id}`);

const parsedWithOtherVoice = parseProject({
  ...raw,
  tts_export: { ...(raw.tts_export || {}), voice_id: "OTRA_VOZ_NO_DEBE_PASAR" },
  pipeline: { ...(raw.pipeline || {}), tts: { ...(raw.pipeline?.tts || {}), voice_id: "OTRA_VOZ_PIPELINE" } },
});
assert.equal(parsedWithOtherVoice.ok, true, parsedWithOtherVoice.errors?.join("\n"));
assert.equal(parsedWithOtherVoice.project.ttsExport.voice_id, MANHWA_DEFAULT_VOICE);
console.log("MANHWA_FORCE_VOICE_OK");
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
assert.deepEqual(scenes.scene_04.referenceAssets, [
  "assets/characters/serie_test/kael_herido.png",
  "assets/escenarios/serie_test/salon_contrapicado.png",
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

console.log("OK: manhwa preset");
