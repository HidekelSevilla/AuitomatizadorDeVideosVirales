import fs from "node:fs";
import path from "node:path";
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

const shotRe = /\b(extreme close-up|close-up|macro|medium(?:-wide|-full)?|full-body|full body|wide(?: establishing)?|extreme-wide|device shot)\b/i;
const angleRe = /\b(eye-level|low(?:-oblique)?(?: angle)?|high(?:-oblique)?(?: angle)?|bird'?s-eye|top-down|over-the-shoulder|OTS|from behind|rear(?: view)?|profile|side(?: angle| view|-profile)?|POV|dutch tilt|worm'?s-eye|knee-level|ground-level)\b/i;
const timeRe = /\b(dawn|sunrise|morning|noon|afternoon|sunset|dusk|evening|night|midnight|pre-dawn|daytime|nighttime)\b/i;
const closeRe = /\b(extreme close-up|close-up|macro)\b/i;
const compositeRe = /\b(exactly two|two (?:separate |tall )?(?:rectangular |vertical )?panels|two-panel|two panel)\b/i;
const breathRe = /\b(pure white|white page|manga page|white background|solid pure black|black inset|sepia-toned|device shot|interface occupies|body detail|onomatopoeia|negative space|environmental transition)\b/i;
const actionRe = /\b(strikes?|hits?|lunges?|attacks?|impact|recoils?|launches?|throws?|pulls?|pushes?|grabs?|rescues?|explodes?|breaks?|collapses?|falls?|drops?|twists? airborne|discharges?|extracts?|aims?|turns? every rifle)\b/i;
const reactionRe = /\b(reaction|stares?|gasps?|recoils?|trembl|tears?|jaw|brows?|eyes? wide|lips? parted|shaken|terrified|fear|shock|exhausted|defiant)\b/i;
const neutralRe = /\b(neutral (?:expression|mouth|face|posture|standing posture)|posture remains neutral|neutral relaxed expression)\b/i;
const containerRe = /\b(capsule|vehicle|truck|car|room|chamber|cell|cockpit|cradle)\b/i;
const insideRelationRe = /\b(inside|within|occupant|cradle|restrained in|from the capsule)\b/i;
const outsideRelationRe = /\b(outside|completely out|on (?:the )?(?:wet )?(?:pavement|floor|ground)|meters? away|clear gap)\b/i;

const stripTags = (s) => String(s || "").replace(/\[[^\]]*\]/g, " ").replace(/<[^>]*>/g, " ");
const spokenWords = (s) => stripTags(s).trim().split(/\s+/).filter(Boolean).length;
const promptOf = (s) => String(s?.visual?.image_prompt || "");
const refsOf = (s) => [
  ...(s?.references?.characters || []).map((r) => ({ group: "characters", ...r })),
  ...(s?.references?.assets || []).map((r) => ({ group: "assets", ...r })),
];

const posePrompts = new Map();
const displayNames = new Map();
for (const [id, entry] of Object.entries(raw.characters || {})) {
  displayNames.set(id, String(entry?.display_name || id));
  for (const [pose, data] of Object.entries(entry?.poses || {})) {
    posePrompts.set(`${id}/${pose}`, String(data?.prompt || ""));
  }
}

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

const breaths = panels.filter((s) => breathRe.test(promptOf(s)));
const composites = panels.filter((s) => compositeRe.test(promptOf(s)));
const voiceTexts = scenes.map((s) => String(s?.voiceover?.text || "")).filter(Boolean);
const joined = voiceTexts.join("\n");
const fullScript = String(raw?.tts_export?.full_script || "");
const promptWordCounts = prompts.map((p) => p.trim() ? p.trim().split(/\s+/).length : 0);
const editSpeed = Number(raw?.tts_export?.edit_speed || 1.4) || 1.4;

let endingAudio = { checked: false, required_final_tail_seconds: 0.45 };
try {
  const slug = String(raw?.project?.slug || "");
  const voiceDir = path.resolve(process.cwd(), "public", slug, "voice");
  const meta = JSON.parse(fs.readFileSync(path.join(voiceDir, "full.tts-meta.json"), "utf8"));
  const alignedWords = JSON.parse(fs.readFileSync(path.join(voiceDir, "full.words.json"), "utf8"));
  const lastWordEnd = Array.isArray(alignedWords)
    ? alignedWords.reduce((m, w) => Math.max(m, Number(w?.end || 0)), 0)
    : 0;
  const sourceDuration = Number(meta?.duration_s || 0);
  const sourceMargin = Math.max(0, sourceDuration - lastWordEnd);
  endingAudio = {
    checked: true,
    required_final_tail_seconds: 0.45,
    source_duration_seconds: Number(sourceDuration.toFixed(3)),
    last_word_end_seconds: Number(lastWordEnd.toFixed(3)),
    source_margin_seconds: Number(sourceMargin.toFixed(3)),
    source_margin_after_edit_seconds: Number((sourceMargin / editSpeed).toFixed(3)),
    needs_timeline_tail: sourceMargin / editSpeed < 0.35,
  };
} catch {
  // El JSON puede validarse antes de generar TTS; en ese caso queda pendiente.
}

const sceneLoad = scenes.map((s) => {
  const words = spokenWords(s?.voiceover?.text);
  const prompt = promptOf(s);
  const isCard = s?.type === "narrative_card";
  const isComposite = compositeRe.test(prompt);
  const isAction = actionRe.test(prompt);
  const isReaction = reactionRe.test(prompt) || closeRe.test(prompt);
  const kind = isCard ? "card" : isComposite ? "composite" : isAction ? "action" : isReaction ? "reaction" : /\b(master|anchor)\b/i.test(prompt) ? "master" : "standard";
  const maxWords = { card: 8, composite: 22, action: 9, reaction: 10, master: 18, standard: 14 }[kind];
  const maxSeconds = { card: 3, composite: 6, action: 3, reaction: 4, master: 5, standard: 4.5 }[kind];
  const estimatedSeconds = Number((words * 60 / (150 * editSpeed)).toFixed(2));
  return { id: s.id, kind, words, estimated_seconds: estimatedSeconds, max_words: maxWords, max_seconds: maxSeconds,
    over_words: words > maxWords, over_seconds: estimatedSeconds > maxSeconds,
    hard_over_18_normal: !isCard && !isComposite && words > 18 };
});

const overlong = sceneLoad.filter((x) => x.over_words || x.over_seconds);
const hardOverlong = sceneLoad.filter((x) => x.hard_over_18_normal);

const neutralActionPoseRisks = [];
const poseUse = new Map();
for (const s of panels) {
  const action = actionRe.test(promptOf(s));
  for (const ref of refsOf(s)) {
    const key = `${ref.id}/${ref.pose}`;
    if (!poseUse.has(key)) poseUse.set(key, []);
    poseUse.get(key).push(s.id);
    if (action && neutralRe.test(posePrompts.get(key) || "")) neutralActionPoseRisks.push({ scene_id: s.id, pose: key });
  }
}
const repeatedPoses = [...poseUse.entries()]
  .filter(([, ids]) => ids.length >= 3)
  .map(([pose, ids]) => ({ pose, uses: ids.length, scene_ids: ids }));

const occupancyRisks = panels
  .filter((s) => {
    const prompt = promptOf(s);
    return (s?.references?.characters?.length || 0) >= 2
      && containerRe.test(prompt)
      && insideRelationRe.test(prompt)
      && !outsideRelationRe.test(prompt);
  })
  .map((s) => s.id);

const unreferencedNamedActors = [];
for (const s of panels) {
  const prompt = promptOf(s).toLowerCase();
  const referenced = new Set((s?.references?.characters || []).map((r) => r.id));
  for (const [id, name] of displayNames.entries()) {
    if (referenced.has(id)) continue;
    const usable = name.toLowerCase();
    if (usable.length >= 4 && prompt.includes(usable)) unreferencedNamedActors.push({ scene_id: s.id, id, display_name: name });
  }
}

const tags = fullScript.match(/\[([^\]]+)\]/g) || [];
const spanishTagHints = /\[(pausa|grave|urgente|tenso|agitado|desesperado|sorprendido|susurrando)\]/i;
const nonEnglishTagRisks = tags.filter((t) => spanishTagHints.test(t));
const countedBreaths = new Set([...breaths.map((s) => s.id), ...cards.map((s) => s.id)]);
const breathRatio = scenes.length ? Number((countedBreaths.size / scenes.length).toFixed(3)) : 0;

const mechanicalPass = contract.ok && joined === fullScript && duplicates.length === 0;
const promptPass = mechanicalPass
  && hardOverlong.length === 0
  && missing.shot.length === 0
  && missing.angle.length === 0
  && missing.time.length === 0
  && occupancyRisks.length === 0
  && neutralActionPoseRisks.length === 0
  && nonEnglishTagRisks.length === 0;

const report = {
  file: absolute,
  status: mechanicalPass ? "CONTRACT_PASS" : "FAIL",
  preflight_status: promptPass ? "PROMPT_RELEASE" : "PROMPT_REPAIR_REQUIRED",
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
  prompts: {
    missing,
    duplicates,
    max_close_macro_run: maxCloseRun,
    word_count_min: promptWordCounts.length ? Math.min(...promptWordCounts) : 0,
    word_count_max: promptWordCounts.length ? Math.max(...promptWordCounts) : 0,
    word_count_average: promptWordCounts.length ? Number((promptWordCounts.reduce((a, b) => a + b, 0) / promptWordCounts.length).toFixed(1)) : 0,
    occupancy_role_map_risks: occupancyRisks,
    unreferenced_named_actors: unreferencedNamedActors,
  },
  timing: {
    method: "estimate_150_raw_wpm",
    edit_speed: editSpeed,
    scenes: sceneLoad,
    overlong,
    hard_over_18_normal: hardOverlong.map((x) => x.id),
  },
  performance: {
    neutral_pose_used_in_action: neutralActionPoseRisks,
    poses_used_3plus_times: repeatedPoses,
    note: "La emoción y anatomía efectivas requieren renders.",
  },
  rhythm: {
    detected_breath_panels: breaths.map((s) => s.id),
    narrative_cards: cards.map((s) => s.id),
    detected_breath_count: countedBreaths.size,
    detected_breath_ratio: breathRatio,
    target_ratio: "0.20-0.28",
    white_composites: composites.map((s) => s.id),
  },
  tts: { audio_tags: tags, non_english_tag_risks: nonEnglishTagRisks, ending_audio: endingAudio },
  render_dependent: "RENDER_PENDING",
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.status === "FAIL" ? 1 : 0);
