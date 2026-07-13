import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateQueueProject } from "../../../../lib/queue-validator.js";

const input = process.argv[2];
if (!input) {
  console.error("Uso: node validate_v5.mjs <proyecto.json>");
  process.exit(2);
}

const absolute = path.resolve(input);
const raw = JSON.parse(fs.readFileSync(absolute, "utf8"));
const contract = validateQueueProject(raw);
const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
const panels = scenes.filter((s) => s?.type === "panel");
const cards = scenes.filter((s) => s?.type === "narrative_card");

const ASSUMED_RAW_WPM = 150;
const PANEL_WORD_GUIDE_MAX = 14;
const BREATH_RATIO_MIN = 0.22;
const BREATH_RATIO_MAX = 0.35;

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function promptOf(scene) {
  return String(scene?.visual?.image_prompt || "");
}

function spokenWords(text) {
  const withoutAudioTags = String(text || "").replace(/\[[^\]\r\n]+\]/g, " ");
  return withoutAudioTags.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const shotRe = /\b(extreme close-up|close-up|macro|medium(?:-wide|-full)?|full-body|full body|wide(?: establishing)?|extreme-wide|device shot)\b/i;
const angleRe = /\b(eye-level|low(?:-oblique)?(?: angle)?|high(?:-oblique)?(?: angle)?|bird'?s-eye|top-down|over-the-shoulder|OTS|from behind|rear(?: view)?|profile|side(?: angle| view|-profile)?|POV|dutch tilt|worm'?s-eye|knee-level|ground-level)\b/i;
const timeRe = /\b(dawn|sunrise|morning|noon|afternoon|sunset|dusk|evening|night|midnight|pre-dawn|daytime|nighttime)\b/i;
const closeRe = /\b(extreme close-up|close-up|macro)\b/i;
const compositeRe = /\b(exactly two (?:separate )?(?:rectangular )?(?:sub-?panels|panels|frames)|two separate rectangular panels|two-?panel (?:white )?(?:composite|layout)|split (?:white )?page with two panels)\b/i;
const whiteRe = /\b(pure white|white page|white background|white canvas|white inset|white composite|white negative space|large white negative space|manga page layout)\b/i;
const detailRe = /\b(body detail|detail shot|insert shot|object detail|hand detail|eye detail|macro(?: shot| close-up)?|extreme close-up of (?:the |a |an |his |her )?(?:hand|hands|eye|eyes|mouth|wound|mark|fissure|object|badge|scanner|boot|foot|finger|fingers))\b/i;
const deviceRe = /\b(device shot|screen insert|interface (?:fills|occupies|dominates)|scanner (?:display|screen)|tablet screen|phone screen|monitor screen|display close-up)\b/i;
const blackSepiaRe = /\b(solid pure black|black inset|sepia-toned|sepia memory)\b/i;
const actionRe = /\b(attacks?|strikes?|lunges?|charges?|sprints?|runs?|jumps?|leaps?|falls?|drops?|slams?|hits?|kicks?|punches?|grabs?|pulls?|pushes?|throws?|launches?|fires?|shoots?|aims?|swings?|cuts?|slashes?|breaks?|shatters?|cracks?|collapses?|bends?|drags?|slides?|resists?|reaches?|catches?|explodes?|bursts?|tears?|rips?|twists?|dodges?|blocks?|grips?|claws?|rushes?|flings?|struggles?|strains?|extracts?|converges?|wraps?)\b/i;
const actionAssetRe = /\b(action-state|action pose|attack pose|combat stance|rifle ready|weapon ready|running pose|lunging pose|fighting pose)\b/i;
const neutralExpressionRe = /\b(neutral(?: relaxed| controlled| disciplined| calm)? expression|neutral (?:closed )?mouth|expressionless|blank expression|blank face|emotionless|calm expression|relaxed expression|impassive expression)\b/i;
const characterDescriptionRe = /\b(man|woman|boy|girl|child|worker|cleaner|barrendero|captain|officer|agent|prisoner|villain|orchestrator|guardian|creature|monster|dog|quadruped|young|older|tall|short|lean|muscular|athletic|stocky|slim|hair|eyes|face|scar|coverall|uniform|armor|armour|jacket|coat|shirt|trousers|pants|boots|gloves|helmet|collar|restraints|harness|ponytail|bloodied|injured|marked|wet gray|wet grey|reflective)\b/i;
const nonNameTokens = new Set([
  "captain", "capitana", "capitan", "officer", "oficial", "agent", "agente",
  "the", "el", "la", "one", "un", "una", "resto", "activo", "nino", "nina",
]);

const prompts = panels.map(promptOf);
const missing = {
  shot: panels.filter((s) => !shotRe.test(promptOf(s))).map((s) => s.id),
  angle: panels.filter((s) => !angleRe.test(promptOf(s))).map((s) => s.id),
  time: panels.filter((s) => !timeRe.test(promptOf(s))).map((s) => s.id),
};

const normalized = prompts.map((p) => p.trim().toLowerCase().replace(/\s+/g, " "));
const duplicates = normalized.flatMap((p, i) => p && normalized.indexOf(p) !== i ? [panels[i]?.id] : []);

let closeRun = 0;
let maxCloseRun = 0;
for (const prompt of prompts) {
  closeRun = closeRe.test(prompt) ? closeRun + 1 : 0;
  maxCloseRun = Math.max(maxCloseRun, closeRun);
}

const composites = panels.filter((s) => compositeRe.test(String(s?.visual?.image_prompt || "")));
const voiceTexts = scenes.map((s) => String(s?.voiceover?.text || "")).filter(Boolean);
const joined = voiceTexts.join("\n");
const fullScript = String(raw?.tts_export?.full_script || "");
const promptWordCounts = prompts.map((p) => p.trim() ? p.trim().split(/\s+/).length : 0);

const configuredEditSpeed = Number(raw?.tts_export?.edit_speed);
const editSpeed = Number.isFinite(configuredEditSpeed) && configuredEditSpeed > 0
  ? configuredEditSpeed
  : 1;
const sceneTiming = scenes.map((scene) => {
  const words = spokenWords(scene?.voiceover?.text).length;
  const rawSeconds = words * 60 / ASSUMED_RAW_WPM;
  return {
    scene_id: scene?.id,
    type: scene?.type,
    words,
    estimated_raw_seconds: round(rawSeconds),
    estimated_edited_seconds: round(rawSeconds / editSpeed),
  };
});
const panelTiming = sceneTiming.filter((entry) => entry.type === "panel");
const overlongPanels = panelTiming
  .filter((entry) => entry.words > PANEL_WORD_GUIDE_MAX)
  .map((entry) => ({ ...entry, guide_max_words: PANEL_WORD_GUIDE_MAX }));
const totalSpokenWords = sceneTiming.reduce((sum, entry) => sum + entry.words, 0);
const estimatedRawSeconds = totalSpokenWords * 60 / ASSUMED_RAW_WPM;

const breathTreatments = {
  cards: cards.map((scene) => scene.id),
  composites: panels.filter((scene) => compositeRe.test(promptOf(scene))).map((scene) => scene.id),
  white: panels.filter((scene) => whiteRe.test(promptOf(scene))).map((scene) => scene.id),
  detail: panels.filter((scene) => detailRe.test(promptOf(scene))).map((scene) => scene.id),
  device: panels.filter((scene) => deviceRe.test(promptOf(scene))).map((scene) => scene.id),
  black_or_sepia: panels.filter((scene) => blackSepiaRe.test(promptOf(scene))).map((scene) => scene.id),
};
const breathSceneIds = [...new Set(Object.values(breathTreatments).flat())];
const breathPanelIds = breathSceneIds.filter((id) => panels.some((panel) => panel.id === id));
const breathRatio = scenes.length ? breathSceneIds.length / scenes.length : 0;

function collectActionPoseRuns() {
  const completed = [];
  let active = new Map();

  const finish = (key, run) => {
    if (run.scene_ids.length >= 2) completed.push({
      character_id: run.character_id,
      pose: run.pose,
      scene_ids: run.scene_ids,
      length: run.scene_ids.length,
    });
    active.delete(key);
  };

  for (const scene of scenes) {
    const isActionPanel = scene?.type === "panel" && actionRe.test(promptOf(scene));
    const references = isActionPanel && Array.isArray(scene?.references?.characters)
      ? scene.references.characters
      : [];
    const current = new Map(references
      .filter((reference) => reference?.id && reference?.pose)
      .map((reference) => [`${reference.id}:${reference.pose}`, reference]));

    for (const [key, run] of [...active]) {
      if (!current.has(key)) finish(key, run);
    }
    for (const [key, reference] of current) {
      const run = active.get(key);
      if (run) run.scene_ids.push(scene.id);
      else active.set(key, {
        character_id: reference.id,
        pose: reference.pose,
        scene_ids: [scene.id],
      });
    }
  }
  for (const [key, run] of [...active]) finish(key, run);
  return completed;
}

const actionPoseRuns = collectActionPoseRuns();
const suspiciousActionPoseRuns = actionPoseRuns.filter((run) => run.length >= 3);

const neutralExpressionInActionPrompts = panels
  .filter((scene) => actionRe.test(promptOf(scene)) && neutralExpressionRe.test(promptOf(scene)))
  .map((scene) => scene.id);
const neutralExpressionInActionAssets = [];
for (const [characterId, character] of Object.entries(raw?.characters || {})) {
  for (const [pose, asset] of Object.entries(character?.poses || {})) {
    const assetPrompt = String(asset?.prompt || "");
    const actionAsset = pose !== "base"
      && (actionAssetRe.test(assetPrompt) || actionAssetRe.test(pose.replaceAll("_", " ")) || actionRe.test(assetPrompt));
    if (actionAsset && neutralExpressionRe.test(assetPrompt)) {
      neutralExpressionInActionAssets.push({ character_id: characterId, pose });
    }
  }
}

function properNameAliases(character) {
  const normalizedName = normalizeForMatch(character?.display_name);
  const tokens = normalizedName.split(" ").filter((token) => token && !nonNameTokens.has(token));
  if (tokens.length < 2) return [];
  const aliases = new Set([tokens.join(" ")]);
  if (tokens.length > 2) aliases.add(tokens.slice(-2).join(" "));
  return [...aliases].sort((a, b) => b.length - a.length);
}

const nameOnlyCharacterReferences = [];
for (const scene of panels) {
  const normalizedPrompt = normalizeForMatch(promptOf(scene));
  const references = Array.isArray(scene?.references?.characters) ? scene.references.characters : [];
  const allAliases = references.flatMap((reference) =>
    properNameAliases(raw?.characters?.[reference?.id]).map((alias) => ({ id: reference?.id, alias })));

  for (const reference of references) {
    const character = raw?.characters?.[reference?.id];
    const aliases = properNameAliases(character);
    const alias = aliases.find((candidate) => normalizedPrompt.includes(candidate));
    if (!alias) continue;

    const nameIndex = normalizedPrompt.indexOf(alias);
    let localStart = Math.max(0, nameIndex - 90);
    let localEnd = Math.min(normalizedPrompt.length, nameIndex + alias.length + 140);
    for (const other of allAliases) {
      if (other.id === reference.id) continue;
      const before = normalizedPrompt.lastIndexOf(other.alias, nameIndex - 1);
      const after = normalizedPrompt.indexOf(other.alias, nameIndex + alias.length);
      if (before >= localStart) localStart = Math.max(localStart, before + other.alias.length);
      if (after >= 0 && after < localEnd) localEnd = Math.min(localEnd, after);
    }
    const localContext = normalizedPrompt.slice(localStart, localEnd);
    if (!characterDescriptionRe.test(localContext)) {
      nameOnlyCharacterReferences.push({
        scene_id: scene.id,
        character_id: reference.id,
        display_name: character?.display_name || reference.id,
        heuristic: "proper name present without a nearby role, body, face, hair or outfit cue",
      });
    }
  }
}

const warnings = [];
const recommendations = [];
if (overlongPanels.length) warnings.push({
  code: "OVERLONG_VOICEOVER_PANELS",
  message: `Panel voiceover exceeds the ${PANEL_WORD_GUIDE_MAX}-word pacing guide.`,
  scene_ids: overlongPanels.map((entry) => entry.scene_id),
});
if (scenes.length && breathRatio < BREATH_RATIO_MIN) warnings.push({
  code: "LOW_BREATH_RATIO",
  message: `Detected breath ratio ${round(breathRatio, 3)} is below the usual ${BREATH_RATIO_MIN}-${BREATH_RATIO_MAX} range.`,
});
if (scenes.length && breathRatio > BREATH_RATIO_MAX) warnings.push({
  code: "HIGH_BREATH_RATIO",
  message: `Detected breath ratio ${round(breathRatio, 3)} is above the usual ${BREATH_RATIO_MIN}-${BREATH_RATIO_MAX} range.`,
});
if (suspiciousActionPoseRuns.length) warnings.push({
  code: "REUSED_ACTION_POSE_RUN",
  message: "The same referenced action pose is reused for three or more consecutive action panels.",
  runs: suspiciousActionPoseRuns,
});
if (neutralExpressionInActionPrompts.length || neutralExpressionInActionAssets.length) warnings.push({
  code: "NEUTRAL_EXPRESSION_DURING_ACTION",
  message: "Neutral-expression wording appears in an action prompt or action asset; verify intentional emotion and body language.",
  scene_ids: neutralExpressionInActionPrompts,
  assets: neutralExpressionInActionAssets,
});
if (actionPoseRuns.some((run) => run.length === 2)) recommendations.push({
  code: "REVIEW_TWO_PANEL_ACTION_POSE_REUSE",
  message: "Two-panel reuse can be valid continuity, but verify that the action state visibly changes.",
  runs: actionPoseRuns.filter((run) => run.length === 2),
});
if (nameOnlyCharacterReferences.length) recommendations.push({
  code: "DESCRIBE_REFERENCED_CHARACTERS",
  message: "A proper name is used without a nearby role, body, face, hair or outfit cue. Add a compact identity descriptor so the image model maps references unambiguously.",
  references: nameOnlyCharacterReferences,
});

const promptStructuralIssues = [
  ...missing.shot,
  ...missing.angle,
  ...missing.time,
  ...duplicates,
];
const legacyStatus = contract.ok && joined === fullScript && duplicates.length === 0 ? "CONTRACT_PASS" : "FAIL";
const promptStatus = promptStructuralIssues.length
  ? "FAIL"
  : warnings.length || recommendations.length
    ? "PASS_WITH_WARNINGS"
    : "PASS";

const report = {
  file: absolute,
  status: legacyStatus,
  statuses: {
    contract: contract.ok ? "PASS" : "FAIL",
    script_integrity: joined === fullScript ? "PASS" : "FAIL",
    prompt: promptStatus,
    render: "NOT_RUN",
    release: legacyStatus === "FAIL" || promptStatus === "FAIL"
      ? "NOT_READY"
      : "PROMPT_REVIEWED_RENDER_NOT_RUN",
  },
  contract: { ok: contract.ok, errors: contract.errors, warnings: contract.warnings },
  counts: {
    scenes: scenes.length,
    panels: panels.length,
    cards: cards.length,
    full_script_characters: fullScript.length,
    max_references: Math.max(0, ...scenes.map((s) =>
      (s?.references?.characters?.length || 0)
      + (s?.references?.assets?.length || 0)
      + (s?.references?.escenario ? 1 : 0)
      + (s?.references?.scenes?.length || 0))),
  },
  integrity: { full_script_exact: joined === fullScript },
  timing: {
    assumptions: {
      raw_wpm: ASSUMED_RAW_WPM,
      edit_speed: editSpeed,
      effective_wpm: round(ASSUMED_RAW_WPM * editSpeed, 1),
      panel_word_guide_max: PANEL_WORD_GUIDE_MAX,
    },
    total_spoken_words: totalSpokenWords,
    estimated_raw_seconds: round(estimatedRawSeconds),
    estimated_edited_seconds: round(estimatedRawSeconds / editSpeed),
    per_scene: sceneTiming,
    per_panel: panelTiming,
    overlong_panels: overlongPanels,
  },
  prompts: {
    missing,
    duplicates,
    max_close_macro_run: maxCloseRun,
    word_count_min: promptWordCounts.length ? Math.min(...promptWordCounts) : 0,
    word_count_max: promptWordCounts.length ? Math.max(...promptWordCounts) : 0,
    word_count_average: promptWordCounts.length ? Number((promptWordCounts.reduce((a, b) => a + b, 0) / promptWordCounts.length).toFixed(1)) : 0,
    reused_action_pose_runs: actionPoseRuns,
    suspicious_reused_action_pose_runs: suspiciousActionPoseRuns,
    neutral_expression_in_action_prompts: neutralExpressionInActionPrompts,
    neutral_expression_in_action_assets: neutralExpressionInActionAssets,
    name_only_character_references: nameOnlyCharacterReferences,
  },
  rhythm: {
    detected_breath_panels: breathPanelIds,
    narrative_cards: cards.map((s) => s.id),
    detected_breath_ratio: round(breathRatio, 3),
    expected_ratio_range: [BREATH_RATIO_MIN, BREATH_RATIO_MAX],
    breath_treatments: breathTreatments,
    white_composites: composites.map((s) => s.id),
  },
  advisories: { warnings, recommendations },
  render_dependent: "NOT_RUN",
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "FAIL" ? 1 : 0);
