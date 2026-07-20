import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { parseProject } from "../lib/json-loader.js";
import { validateQueueProject } from "../lib/queue-validator.js";

const CHARACTER_PROFILE = {
  age: "young adult, 24 years old",
  build: "lean work-hardened build",
  face: "oval clean-shaven face with tired dark-brown eyes",
  hair_or_skin: "short straight black hair and light olive skin",
  wardrobe: "rain-darkened gray industrial cleaner coverall and worn black work boots",
  materials: "matte cotton twill and black rubber gloves",
  colors: "charcoal gray, black, muted skin tones",
  marks: "small mole below the left eye",
};
const CHARACTER_SIGNATURE = Object.values(CHARACTER_PROFILE).join(", ");
const NEGATIVE_INVARIANTS = ["no altered mole", "no different hair color"];

const SCENARIO_PROFILE = {
  architecture: "underground municipal morgue with pale-green glazed tile walls",
  layout: "central stainless autopsy table aligned with a square floor drain and sealed cabinet banks",
  materials: "brushed stainless steel, poured concrete, frosted glass",
  anchors: "red evidence locker, yellow-black service-door stripe, twin ceiling rails",
  palette: "cold cyan, steel gray, restrained red",
};
const SCENARIO_SIGNATURE = Object.values(SCENARIO_PROFILE).join(", ");

const POSES = [
  ["guarded", { emotion: "guarded concern", body: "shoulders held tense", gaze: "eyes fixed ahead", hands: "gloved hands close to chest" }],
  ["alert", { emotion: "sharp alarm", body: "torso recoiling", gaze: "eyes tracking left", hands: "left hand raised defensively" }],
  ["focused", { emotion: "controlled focus", body: "weight planted forward", gaze: "eyes narrowed on evidence", hands: "both hands steady at waist" }],
  ["afraid", { emotion: "contained fear", body: "spine drawn back", gaze: "eyes lifted toward danger", hands: "fingers spread under tension" }],
  ["resolved", { emotion: "quiet resolve", body: "shoulders squared", gaze: "eyes locked on the threat", hands: "right fist closed" }],
  ["exhausted", { emotion: "visible exhaustion", body: "upper body slightly folded", gaze: "eyes lowered but attentive", hands: "one hand braced on a knee" }],
];

const VIEW_DEFS = [
  {
    id: "locker_axis", signature: "red evidence locker beyond the west end of the autopsy table",
    scale: "MEDIUM", camera: { elevation: "EYE_LEVEL", viewpoint: "FRONT", azimuth_deg: 0, lens_mm: 50, roll_deg: 0 },
  },
  {
    id: "drain_axis", signature: "square floor drain beside the south table leg and yellow evidence stripe",
    scale: "WIDE_MASTER", camera: { elevation: "LOW", viewpoint: "THREE_QUARTER_FRONT", azimuth_deg: 60, lens_mm: 35, roll_deg: 12 },
  },
  {
    id: "cabinet_axis", signature: "sealed cabinet bank beside the east frosted-glass partition",
    scale: "CLOSE", camera: { elevation: "HIGH", viewpoint: "PROFILE", azimuth_deg: 120, lens_mm: 70, roll_deg: -12 },
  },
  {
    id: "rail_axis", signature: "twin ceiling rails crossing above the north end of the steel table",
    scale: "FULL", camera: { elevation: "GROUND_LEVEL", viewpoint: "REAR_THREE_QUARTER", azimuth_deg: 190, lens_mm: 24, roll_deg: 12 },
  },
  {
    id: "door_axis", signature: "red quarantine door opposite the central table and sealed cabinets",
    scale: "TRUE_LONG", camera: { elevation: "TOP_DOWN", viewpoint: "POV", azimuth_deg: 250, lens_mm: 35, roll_deg: -12 },
  },
  {
    id: "glass_axis", signature: "frosted-glass partition beside the red locker and square drain",
    scale: "EXTREME_CLOSE", camera: { elevation: "KNEE_LEVEL", viewpoint: "OTS", azimuth_deg: 310, lens_mm: 85, roll_deg: 0 },
  },
];

const REQUIRED_NEGATIVES = [
  "no readable text", "no speech bubbles", "no captions", "no watermark", "no logo",
];

const PAGE_SPECS = [
  { family: "OTHER", layout: "FULL_BLEED", panels: 1, background: 0, anchor: "Full-bleed vertical webtoon panel" },
  { family: "WHITE_PAGE", layout: "WHITE_COMPOSITE_2", panels: 2, background: 45, anchor: "two-panel composite" },
  { family: "BLACK_PAGE", layout: "BLACK_INSET", panels: 1, background: 60, anchor: "one inset" },
  { family: "OTHER", layout: "SPLASH", panels: 1, background: 0, anchor: "Full-page vertical manhwa splash panel" },
  { family: "WHITE_PAGE", layout: "WHITE_INSET", panels: 1, background: 55, anchor: "one inset" },
  { family: "BLACK_PAGE", layout: "BLACK_COMPOSITE_2", panels: 2, background: 55, anchor: "two-panel composite" },
  { family: "OTHER", layout: "CHARACTER_CLOSEUP", panels: 1, background: 0, anchor: "Full-page vertical character close-up" },
  { family: "WHITE_PAGE", layout: "WHITE_TRIPTYCH", panels: 3, background: 35, anchor: "three-panel triptych" },
  { family: "BLACK_PAGE", layout: "BLACK_REVEAL_STRIP", panels: 1, background: 65, anchor: "one reveal strip" },
  { family: "OTHER", layout: "ENVIRONMENT_BREATHER", panels: 1, background: 0, anchor: "Full-page vertical environment breather" },
];

const SCALE_LANGUAGE = {
  MACRO: "macro shot", EXTREME_CLOSE: "extreme close-up", CLOSE: "close shot", MEDIUM: "medium shot",
  FULL: "full shot", WIDE_MASTER: "wide master", TRUE_LONG: "true long shot",
};
const ELEVATION_LANGUAGE = {
  EYE_LEVEL: "eye-level", LOW: "low-angle", HIGH: "high-angle", BIRDS_EYE: "bird's-eye",
  TOP_DOWN: "top-down", WORMS_EYE: "worm's-eye", KNEE_LEVEL: "knee-level", GROUND_LEVEL: "ground-level",
};
const VIEWPOINT_LANGUAGE = {
  FRONT: "front view", THREE_QUARTER_FRONT: "three-quarter front", PROFILE: "profile view",
  OTS: "over-the-shoulder", POV: "point-of-view", REAR: "rear view", REAR_THREE_QUARTER: "rear three-quarter",
};

function cameraBlock(camera) {
  return `scale=${camera.scale}; elevation=${camera.elevation}; viewpoint=${camera.viewpoint}; azimuth_deg=${camera.azimuth_deg}; lens_mm=${camera.lens_mm}; roll_deg=${camera.roll_deg}; dominant_subject=${camera.dominant_subject}; occupancy_pct=${camera.occupancy_pct}.`;
}

function posePrompt(performance) {
  return `${CHARACTER_SIGNATURE}. ${Object.values(performance).join(". ")}. ${NEGATIVE_INVARIANTS.join(", ")}, ${REQUIRED_NEGATIVES.join(", ")}. Korean manhwa character identity reference.`;
}

function viewPrompt(view) {
  const camera = { scale: "ENVIRONMENT_WIDE", ...view.camera, dominant_subject: "environment", occupancy_pct: 100 };
  return [
    `CAMERA: ${cameraBlock(camera)}`,
    "SUBJECTS: empty environment, no characters.",
    "ACTION: static identity plate with unchanged architectural anchors.",
    `ENVIRONMENT: ${SCENARIO_SIGNATURE}; ${view.signature}.`,
    "LIGHTING: cold ceiling fluorescence with restrained cyan bounce.",
    "STYLE: hand-drawn Korean manhwa illustration, crisp lineart, flat cel shading, vertical 9:16 composition.",
    `NEGATIVE: ${REQUIRED_NEGATIVES.join(", ")}, no people.`,
  ].join("\n");
}

function rollLanguage(roll) {
  if (Math.abs(roll) < 10) return "level camera roll";
  return roll > 0 ? "clockwise Dutch tilt" : "counterclockwise Dutch angle";
}

function shotFragment(panelId, camera, performance, view) {
  return `Panel ${panelId}: A ${SCALE_LANGUAGE[camera.scale]} from a ${ELEVATION_LANGUAGE[camera.elevation]} angle in ${VIEWPOINT_LANGUAGE[camera.viewpoint]}, using a ${camera.lens_mm}mm lens and ${rollLanguage(camera.roll_deg)}, frames ${CHARACTER_SIGNATURE}. The cleaner shows ${performance.emotion}; ${performance.body}; ${performance.gaze}; ${performance.hands}. He studies a sealed evidence pouch without breaking identity. The setting is ${SCENARIO_SIGNATURE}; ${view.signature}.`;
}

function pageOpening(spec) {
  if (spec.family === "WHITE_PAGE") {
    return `Pure white webtoon page with ${spec.anchor} and white space occupying ${spec.background}% of the canvas.`;
  }
  if (spec.family === "BLACK_PAGE") {
    return `Matte-black webtoon page with ${spec.anchor} and black space occupying ${spec.background}% of the canvas.`;
  }
  return `${spec.anchor} filling the 9:16 canvas without an outer reserved page margin.`;
}

function makeScene(spec, sceneIndex, firstShotIndex) {
  const sceneNumber = sceneIndex + 1;
  const [poseId, performance] = POSES[sceneIndex % POSES.length];
  const panelWord = ["", "one", "two", "three"][spec.panels];
  const composition = `Exactly ${panelWord} professionally framed image panel${spec.panels === 1 ? "" : "s"} form composition beat ${sceneNumber}, reading cleanly from top to bottom with a professional value hierarchy.`;
  const shots = Array.from({ length: spec.panels }, (_, shotIndex) => {
    const view = VIEW_DEFS[(firstShotIndex + shotIndex) % VIEW_DEFS.length];
    const camera = { scale: view.scale, ...view.camera, dominant_subject: "hero", occupancy_pct: 64 };
    const panelId = String.fromCharCode(65 + shotIndex);
    return {
      panel_id: panelId,
      content_role: ["PRIMARY", "REACTION", "DETAIL"][shotIndex],
      visible_entities: ["hero"],
      location_id: "morgue",
      view_id: view.id,
      camera,
      prompt_fragment: shotFragment(panelId, camera, performance, view),
    };
  });
  const prompt = [
    pageOpening(spec),
    composition,
    ...shots.map((shot) => shot.prompt_fragment),
    "Professional hand-drawn Korean manhwa webtoon page, 2D controlled flat cel shading, crisp inked lineart, cinematic lighting and finished fabric and material texture, consistent character design across every panel, vertical 9:16 composition.",
    `${NEGATIVE_INVARIANTS.join(", ")}; ${REQUIRED_NEGATIVES.join(", ")}; exactly the declared image panels.`,
  ].join(" ");
  const voiceText = `Beat narrativo ${sceneNumber}.`;
  return {
    id: `scene_${String(sceneNumber).padStart(2, "0")}`,
    type: "panel",
    render_mode: "static",
    references: {
      characters: [{ id: "hero", pose: poseId }],
      escenario: { id: "morgue", view: shots[0].view_id, geometry_authority: "GEOMETRY_LOCK" },
    },
    visual: { image_prompt: prompt },
    visual_plan: {
      native_page: {
        family: spec.family,
        layout: spec.layout,
        background_pct: spec.background,
        panel_count: spec.panels,
        composition,
      },
      shots,
    },
    continuity: {
      state_in: { hero: "inside_morgue", evidence: "sealed" },
      state_out: { hero: "inside_morgue", evidence: "sealed" },
      location_id: "morgue",
      lighting_id: "cold_fluorescent",
    },
    voiceover: { speaker: "narrador", text: voiceText },
    captions: { text: voiceText },
    editor_motion: { enabled: false, preset: "static", zoom: 1, pan: 0 },
    transition_in: "cut",
  };
}

function makeProject() {
  let shotIndex = 0;
  const scenes = PAGE_SPECS.map((spec, sceneIndex) => {
    const scene = makeScene(spec, sceneIndex, shotIndex);
    shotIndex += spec.panels;
    return scene;
  });
  scenes.push({
    id: "narrative_end",
    type: "narrative_card",
    card: { mode: "editor", text: "Continuará" },
    voiceover: { speaker: "narrador", text: "La puerta terminó de abrirse." },
    captions: { text: "La puerta terminó de abrirse." },
    editor_motion: { enabled: false, preset: "static", zoom: 1, pan: 0 },
    transition_in: "cut",
  });

  const dialogue = scenes.map((scene) => ({
    scene_id: scene.id,
    speaker: scene.voiceover.speaker,
    text: scene.voiceover.text,
  }));
  const views = Object.fromEntries(VIEW_DEFS.map((view) => [view.id, {
    mode: "generate",
    asset: `assets/escenarios/pagina_v7/morgue_${view.id}.png`,
    prompt_signature: view.signature,
    prompt: viewPrompt(view),
    camera_signature: {
      scale: "ENVIRONMENT_WIDE",
      ...view.camera,
      dominant_subject: "environment",
      occupancy_pct: 100,
    },
  }]));

  return {
    v7_contract: {
      version: "7.0",
      generation_mode: "GROK_NATIVE_PAGE",
      mode: "PILOT",
      pilot_panel_count: 10,
      canvas: { width: 720, height: 1280 },
      thresholds: {},
      runtime_adapter: { grok_native_full_page: true, page_blueprint_slots_integrated: false },
      page_mix: {
        basis: "TYPE_PANEL_ONLY",
        method: "LARGEST_REMAINDER",
        ratios: { white: 30, black: 30, other: 40 },
        counts: { white: 3, black: 3, other: 4 },
      },
    },
    project: {
      title: "Página V7 Grok native",
      preset: "manhwa",
      serie: "pagina_v7",
      slug: "pagina_v7_native",
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
        descriptor_profile: CHARACTER_PROFILE,
        prompt_signature: CHARACTER_SIGNATURE,
        negative_invariants: NEGATIVE_INVARIANTS,
        poses: Object.fromEntries(POSES.map(([id, performance]) => [id, {
          mode: "generate",
          asset: `assets/characters/pagina_v7/hero_${id}.png`,
          performance_signature: performance,
          prompt: posePrompt(performance),
        }])),
      },
    },
    escenarios: {
      morgue: {
        display_name: "Morgue",
        spatial_role: "PRIMARY",
        descriptor_profile: SCENARIO_PROFILE,
        prompt_signature: SCENARIO_SIGNATURE,
        views,
      },
    },
    ingredients: [],
    scenes,
    editing: { panel_motion: { enabled: true, cycle: ["slow_push_in"] } },
    tts_export: {
      provider: "elevenlabs",
      language: "es-MX",
      mode: "dialogue",
      model_id: "eleven_v3",
      elevenlabs_speed: 1,
      edit_speed: 1,
      voices: { narrador: "452WrNT9o8dphaYW5YGU" },
      dialogue,
      full_script: dialogue.map((row) => row.text).join("\n"),
    },
  };
}

function panelScenes(project) {
  return project.scenes.filter((scene) => scene.type === "panel");
}

function panelByFamily(project, family) {
  return panelScenes(project).find((scene) => scene.visual_plan.native_page.family === family);
}

function replaceShotFragment(scene, shotIndex, transform) {
  const oldFragment = scene.visual_plan.shots[shotIndex].prompt_fragment;
  const newFragment = transform(oldFragment);
  scene.visual_plan.shots[shotIndex].prompt_fragment = newFragment;
  scene.visual.image_prompt = scene.visual.image_prompt.replace(oldFragment, newFragment);
}

function assertRejected(label, mutate, expectedError) {
  const malformed = makeProject();
  mutate(malformed);
  const checked = validateQueueProject(malformed);
  assert.equal(checked.ok, false, `${label}: debe ser rechazado`);
  assert.ok(
    checked.errors.some((error) => error.includes(expectedError)),
    `${label}: falta error "${expectedError}"\n${checked.errors.join("\n")}`,
  );
}

const valid = makeProject();
const checked = validateQueueProject(valid);
assert.equal(checked.ok, true, checked.errors.join("\n"));

const silentVisualPage = makeProject();
delete silentVisualPage.scenes[1].voiceover;
delete silentVisualPage.scenes[1].captions;
silentVisualPage.tts_export.dialogue = silentVisualPage.scenes
  .filter((scene) => typeof scene?.voiceover?.text === "string" && scene.voiceover.text.trim())
  .map((scene) => ({
    scene_id: scene.id,
    speaker: scene.voiceover.speaker,
    text: scene.voiceover.text,
  }));
silentVisualPage.tts_export.full_script = silentVisualPage.tts_export.dialogue
  .map((row) => row.text)
  .join("\n");
const silentVisualPageCheck = validateQueueProject(silentVisualPage);
assert.equal(
  silentVisualPageCheck.ok,
  true,
  `Una pagina visual V7 silenciosa debe ser valida sin adulterar el guion:\n${silentVisualPageCheck.errors.join("\n")}`,
);

const families = panelScenes(valid).map((scene) => scene.visual_plan.native_page.family);
assert.deepEqual(
  {
    white: families.filter((family) => family === "WHITE_PAGE").length,
    black: families.filter((family) => family === "BLACK_PAGE").length,
    other: families.filter((family) => family === "OTHER").length,
  },
  { white: 3, black: 3, other: 4 },
);
assert.ok(panelScenes(valid).every((scene) => Object.keys(scene.visual).join() === "image_prompt"));
assert.ok(panelScenes(valid).every((scene) => Object.keys(scene.visual_plan).sort().join() === "native_page,shots"));
assert.ok(panelScenes(valid).every((scene) => {
  const firstShot = scene.visual_plan.shots[0];
  return scene.references.escenario.id === firstShot.location_id
    && scene.references.escenario.view === firstShot.view_id;
}), "GEOMETRY_LOCK positivo: la referencia runtime debe corresponder al primer shot");

const parsed = parseProject(valid);
assert.equal(parsed.ok, true, parsed.errors?.join("\n"));
const runtimePanels = parsed.scenes.filter((scene) => scene.sceneType === "panel");
assert.equal(runtimePanels.length, 10, "V7 debe conservar una tarea runtime por escena panel");
assert.equal(parsed.scenes.length, valid.scenes.length, "V7 no debe expandir escenas a celdas o padres de composición");
assert.ok(runtimePanels.every((scene) => !scene.id.includes("__cell_")));
assert.ok(runtimePanels.every((scene) => scene.isPageCell === false && scene.compositionOnly === false));
for (const runtimeScene of runtimePanels) {
  const rawScene = valid.scenes.find((scene) => scene.id === runtimeScene.id);
  assert.equal(runtimeScene.imagePrompt, rawScene.visual.image_prompt);
}

// Regression de cableado: ejecuta las funciones reales del service worker en un contexto aislado.
// Asi la prueba no replica la decision del runtime: si el dispatcher vuelve a enrutar V7 al compositor
// o si cambia la ruta canonica del still, falla aqui antes de llegar a Grok.
const serviceWorkerSource = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const sourceBetween = (startMarker, endMarker) => {
  const start = serviceWorkerSource.indexOf(startMarker);
  const end = serviceWorkerSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `falta marcador de inicio en service-worker.js: ${startMarker}`);
  assert.notEqual(end, -1, `falta marcador final en service-worker.js: ${endMarker}`);
  return serviceWorkerSource.slice(start, end);
};

const dispatchDeclaration = sourceBetween(
  "image: (scene, prevSceneId, refName) => {",
  "    animation: (scene) => {",
).replace(/^image:\s*/, "globalThis.dispatchV7Image = ").replace(/,\s*$/, ";");
const dispatchCalls = [];
const dispatchContext = {
  state: {
    project: { imageProvider: "grok" },
    config: { provider: "flow", dryRun: false },
  },
  runManhwaPageComposition: (scene) => dispatchCalls.push(["compose", scene.id]),
  runDryRunImage: (scene) => dispatchCalls.push(["dry", scene.id]),
  runGrokImage: (scene) => dispatchCalls.push(["grok", scene.id]),
  runRealImage: (scene) => dispatchCalls.push(["flow", scene.id]),
};
vm.runInNewContext(dispatchDeclaration, dispatchContext, { filename: "service-worker-image-dispatch.test.js" });
for (const runtimeScene of runtimePanels) dispatchContext.dispatchV7Image(runtimeScene, null, null);
assert.deepEqual(
  dispatchCalls,
  runtimePanels.map((scene) => ["grok", scene.id]),
  "cada escena V7 debe ir una vez a runGrokImage y nunca a runManhwaPageComposition",
);

const pathContext = { state: { project: { slug: valid.project.slug } } };
vm.runInNewContext(
  sourceBetween("function sceneStillRelativePath(", "async function invalidatePageParentForCell("),
  pathContext,
  { filename: "service-worker-still-path.test.js" },
);
assert.equal(
  pathContext.sceneStillRelativePath(runtimePanels[0], valid.project.slug),
  `remotion-editor/public/${valid.project.slug}/images/${runtimePanels[0].id}.jpg`,
);

let moveRequest = null;
const moveContext = {
  state: { config: { audioWriterUrl: "http://127.0.0.1:35729/save" } },
  DEFAULT_CONFIG: { audioWriterUrl: "http://127.0.0.1:35729/save" },
  fetch: async (url, options) => {
    moveRequest = { url, options };
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ ok: true, path: "saved", abspath: "C:/public/scene_01.jpg" }),
    };
  },
};
vm.runInNewContext(
  sourceBetween("async function moveStillToProject(", "async function moveGeneratedAssetToProject("),
  moveContext,
  { filename: "service-worker-move-still.test.js" },
);
await moveContext.moveStillToProject(
  "C:/Users/test/Downloads/scene_01.jpg",
  valid.project.slug,
  runtimePanels[0].id,
  runtimePanels[0].pageCellSource,
);
const moveUrl = new URL(moveRequest.url);
assert.equal(moveUrl.pathname, "/move");
assert.equal(
  moveUrl.searchParams.get("to"),
  `remotion-editor/public/${valid.project.slug}/images/${runtimePanels[0].id}.jpg`,
  "pageCellSource vacio debe publicar el JPG completo de Grok, no una celda",
);
assert.equal(moveRequest.options.method, "POST");

const grokRunnerSource = sourceBetween("async function runGrokImage(", "async function grokAnimationLikelyStarted(");
assert.doesNotMatch(grokRunnerSource, /\/manhwa\/compose-page/,
  "runGrokImage no puede llamar al endpoint de composicion V6");
assert.doesNotMatch(
  grokRunnerSource,
  /GROK_MAX_REFS|slice\(0,\s*GROK_MAX_REFS\)/,
  "runGrokImage no debe recortar las referencias locales a tres",
);
assert.match(
  grokRunnerSource,
  /refPaths\.push\(\.\.\.allRefs\)/,
  "runGrokImage debe enviar todas las referencias unicas declaradas",
);

const moreThanThreeReferences = makeProject();
moreThanThreeReferences.scenes[3].references.scenes = [
  { scene_id: "scene_01", use_for: ["continuity"], strength: "required" },
  { scene_id: "scene_02", use_for: ["continuity"], strength: "required" },
];
const moreThanThreeReferencesCheck = validateQueueProject(moreThanThreeReferences);
assert.equal(
  moreThanThreeReferencesCheck.ok,
  true,
  `Mas de tres referencias declaradas no deben bloquear la cola:\n${moreThanThreeReferencesCheck.errors.join("\n")}`,
);
assert.ok(
  !moreThanThreeReferencesCheck.errors.some((error) => /limite de Grok|referencias exceden/i.test(error)),
  `No debe reaparecer el antiguo limite fijo de referencias:\n${moreThanThreeReferencesCheck.errors.join("\n")}`,
);

const repeatedPoseIsEditorialQa = makeProject();
const guardedPerformance = Object.fromEntries(POSES).guarded;
for (const scene of panelScenes(repeatedPoseIsEditorialQa)) {
  const currentPoseId = scene.references.characters[0].pose;
  const currentPerformance = Object.fromEntries(POSES)[currentPoseId];
  scene.references.characters[0].pose = "guarded";
  for (let shotIndex = 0; shotIndex < scene.visual_plan.shots.length; shotIndex++) {
    replaceShotFragment(scene, shotIndex, (fragment) => {
      let next = fragment;
      for (const field of ["emotion", "body", "gaze", "hands"]) {
        next = next.replace(currentPerformance[field], guardedPerformance[field]);
      }
      return next;
    });
  }
}
const repeatedPoseCheck = validateQueueProject(repeatedPoseIsEditorialQa);
assert.equal(
  repeatedPoseCheck.ok,
  true,
  `La variedad artistica de poses no debe bloquear Node:\n${repeatedPoseCheck.errors.join("\n")}`,
);
assert.ok(
  !repeatedPoseCheck.errors.some((error) => /poses distintas|pose .*consecutivas/i.test(error)),
  `Node no debe ejecutar gates editoriales de variedad de pose:\n${repeatedPoseCheck.errors.join("\n")}`,
);

const justifiedIdentityOnly = makeProject();
justifiedIdentityOnly.scenes[0].references.escenario = {
  id: "morgue",
  view: "drain_axis",
  geometry_authority: "IDENTITY_ONLY",
  identity_only_reason: "material and palette identity only; the prompt and shot ledger control the new camera",
};
const justifiedIdentityOnlyCheck = validateQueueProject(justifiedIdentityOnly);
assert.equal(
  justifiedIdentityOnlyCheck.ok,
  true,
  `IDENTITY_ONLY justificado debe permitir una referencia no geometrica:\n${justifiedIdentityOnlyCheck.errors.join("\n")}`,
);

const secondaryCameraMetadataMismatch = makeProject();
const secondaryScene = secondaryCameraMetadataMismatch.scenes.find(
  (scene) => scene.visual_plan?.native_page.panel_count === 2,
);
const secondaryShot = secondaryScene.visual_plan.shots[1];
const oldSecondaryLens = secondaryShot.camera.lens_mm;
secondaryShot.camera.lens_mm = oldSecondaryLens + 30;
replaceShotFragment(
  secondaryScene,
  1,
  (fragment) => fragment.replace(`using a ${oldSecondaryLens}mm lens`, `using a ${secondaryShot.camera.lens_mm}mm lens`),
);
const secondaryCameraCheck = validateQueueProject(secondaryCameraMetadataMismatch);
assert.equal(
  secondaryCameraCheck.ok,
  true,
  `Una cámara secundaria audit-only no debe bloquear la cola:\n${secondaryCameraCheck.errors.join("\n")}`,
);
assert.ok(
  secondaryCameraCheck.warnings.some((warning) => warning.includes("QA editorial no bloqueante")
    && warning.includes("visual_plan.shots[1].camera contradice")),
  `La contradicción secundaria debe conservarse como warning:\n${secondaryCameraCheck.warnings.join("\n")}`,
);

const negativeCases = [
  ["sentinel", (p) => { p.scenes[0].visual.image_prompt = "COMPOSITION_ONLY_V7_FROM_DECLARED_SLOTS"; }, "sentinel"],
  ["page blueprint", (p) => { p.scenes[0].visual.page_blueprint = {}; }, "campo de compositor prohibido"],
  ["nested slots", (p) => { p.scenes[0].visual_plan.native_page.slots = []; }, "campo de compositor prohibido"],
  ["nested cells", (p) => { p.scenes[0].visual_plan.cells = []; }, "campo de compositor prohibido"],
  ["cell source", (p) => { p.scenes[0].visual_plan.audit_path = "images/cells/scene_01_A.jpg"; }, "residuo de celdas/compositor"],
  ["white marker", (p) => {
    const scene = panelByFamily(p, "WHITE_PAGE");
    scene.visual.image_prompt = scene.visual.image_prompt.replace("Pure white webtoon page", "Bright webtoon page");
  }, "WHITE_PAGE exige literalmente"],
  ["black marker", (p) => {
    const scene = panelByFamily(p, "BLACK_PAGE");
    scene.visual.image_prompt = scene.visual.image_prompt.replace("Matte-black webtoon page", "Dark webtoon page");
  }, "BLACK_PAGE exige literalmente"],
  ["other masquerades as white", (p) => {
    const scene = panelByFamily(p, "OTHER");
    scene.visual.image_prompt += " Pure white webtoon page.";
  }, "OTHER no puede declarar"],
  ["panel count mismatch", (p) => {
    const scene = p.scenes.find((item) => item.visual_plan?.native_page.layout === "WHITE_COMPOSITE_2");
    scene.visual_plan.native_page.panel_count = 1;
  }, "WHITE_COMPOSITE_2 exige 2"],
  ["ambiguous inset without exact image count", (p) => {
    const scene = p.scenes.find((item) => item.visual_plan?.native_page.layout === "BLACK_INSET");
    const oldComposition = scene.visual_plan.native_page.composition;
    const ambiguous = "One inset carries composition beat 3 with a professional value hierarchy.";
    scene.visual_plan.native_page.composition = ambiguous;
    scene.visual.image_prompt = scene.visual.image_prompt.replace(oldComposition, ambiguous);
  }, "one inset\" por si solo no cuenta"],
  ["name-only character", (p) => {
    replaceShotFragment(p.scenes[0], 0, (fragment) => fragment.replace(CHARACTER_SIGNATURE, "Hero"));
  }, "falta prompt_signature fisica completa"],
  ["relative environment", (p) => {
    replaceShotFragment(p.scenes[0], 0, (fragment) => `${fragment} Same morgue geometry and materials.`);
  }, "atajo ambiental relativo prohibido"],
  ["primary camera contradicts attached runtime view", (p) => {
    p.scenes[0].visual_plan.shots[0].camera.elevation = "HIGH";
    replaceShotFragment(p.scenes[0], 0, (fragment) => fragment.replace("eye-level", "high-angle"));
  }, "camera contradice escenarios"],
  ["runtime environment reference differs from first shot", (p) => {
    p.scenes[0].references.escenario.view = "drain_axis";
  }, "GEOMETRY_LOCK debe coincidir exactamente con el primer shot"],
  ["moving white page", (p) => {
    const scene = panelByFamily(p, "WHITE_PAGE");
    scene.editor_motion = { enabled: true, preset: "slow_zoom", zoom: 1.05, pan: 0 };
  }, "WHITE/BLACK ya vienen compuestas"],
  ["missing negative", (p) => {
    p.scenes[0].visual.image_prompt = p.scenes[0].visual.image_prompt.replace("no captions", "without captions");
  }, "token negativo literal obligatorio ausente: no captions"],
  ["machine seven-block scene prompt", (p) => {
    const prompt = p.scenes[0].visual.image_prompt;
    p.scenes[0].visual.image_prompt = [
      `CAMERA: ${prompt}`,
      "SUBJECTS: complete.",
      "ACTION: complete.",
      "ENVIRONMENT: complete.",
      "LIGHTING: complete.",
      "STYLE: complete.",
      "NEGATIVE: complete.",
    ].join("\n");
  }, "formato machine de siete bloques"],
  ["visual source", (p) => { p.scenes[0].visual.source = "images/scene_01.jpg"; }, "no pertenece al contrato V7 Grok-native"],
  ["wrong generation mode", (p) => { p.v7_contract.generation_mode = "COMPOSITOR"; }, "GROK_NATIVE_PAGE"],
  ["wrong adapter", (p) => { p.v7_contract.runtime_adapter.page_blueprint_slots_integrated = true; }, "debe ser false"],
  ["wrong mix count", (p) => { p.v7_contract.page_mix.counts.white = 4; }, "counts.white debe ser 3"],
  ["production runtime disguised as pilot", (p) => {
    p.project.target_runtime_seconds = 95;
  }, "V7 PILOT contradice project.target_runtime_seconds=95"],
  ["half-declared silent page", (p) => {
    delete p.scenes[0].captions;
  }, "debe declarar juntos voiceover y captions"],
  ["broken continuity", (p) => { p.scenes[1].continuity.state_in = { hero: "elsewhere" }; }, "state_in debe copiar exactamente"],
  ["missing prompt fragment", (p) => {
    p.scenes[0].visual_plan.shots[0].prompt_fragment += " A unique literal beat.";
  }, "prompt_fragment debe aparecer literal"],
  ["wrong multipanel label", (p) => {
    const scene = p.scenes.find((item) => item.visual_plan?.native_page.panel_count === 2);
    replaceShotFragment(scene, 1, (fragment) => fragment.replace("Panel B:", "Inset:") );
  }, "prefijo exacto \"Panel B:\""],
  ["missing layout anchor", (p) => {
    const scene = p.scenes.find((item) => item.visual_plan?.native_page.layout === "BLACK_REVEAL_STRIP");
    scene.visual.image_prompt = scene.visual.image_prompt.replace("one reveal strip", "a cinematic reveal");
  }, "layout BLACK_REVEAL_STRIP exige literalmente"],
  ["narrative visual", (p) => { p.scenes.at(-1).visual = { image_prompt: "forbidden" }; }, "narrative_card no puede llevar visual"],
];

for (const [label, mutate, expectedError] of negativeCases) {
  assertRejected(label, mutate, expectedError);
}

for (const phrase of ["Same place as before", "same room", "same environment", "same as before", "como antes", "el mismo lugar"]) {
  assertRejected(`relative phrase: ${phrase}`, (project) => {
    replaceShotFragment(project.scenes[0], 0, (fragment) => `${fragment} ${phrase}.`);
  }, "atajo ambiental relativo prohibido");
}

console.log("OK: V7 genera una pagina Grok por escena, no recorta referencias y deja la variedad de poses fuera del gate de Node");
