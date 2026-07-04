import { slugify } from "./slug.mjs";

export const STILL_PRESET_RE = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/;

export function sceneId(scene) {
  return scene && typeof scene.id === "string" ? scene.id
    : scene && typeof scene.scene_id === "string" ? scene.scene_id
    : "";
}

export function isStillPreset(preset) {
  return STILL_PRESET_RE.test(preset || "");
}

export function isAnimatedScene(scene) {
  return scene?.render_mode === "animated";
}

export function isEditorNarrativeCard(scene) {
  return scene?.type === "narrative_card" && (scene?.card?.mode || "editor") !== "generated";
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function shortHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function scenePrompt(scene) {
  return scene?.visual?.image_prompt || scene?.image_prompt || scene?.prompt || "";
}

export function projectMediaSignature(projectJson) {
  const scenes = Array.isArray(projectJson?.scenes) ? projectJson.scenes : [];
  const byId = new Map(scenes.map((s) => [sceneId(s), s]));
  const mediaScenes = getClipOrder(projectJson).map((id) => {
    const s = byId.get(id) || { id };
    return {
      id,
      type: s.type || "",
      render_mode: s.render_mode || "",
      image_prompt: scenePrompt(s),
      animation_prompt: s.animation_prompt || s.animationPrompt || "",
      voiceover: s.voiceover?.text || "",
      speaker: s.voiceover?.speaker || "",
      card: s.card?.text || "",
    };
  });
  const tts = projectJson?.tts_export || {};
  const basis = {
    slug: projectJson?.project?.slug || slugify(projectJson?.project?.title || "project"),
    preset: projectJson?.project?.preset || "",
    aspect_ratio: projectJson?.project?.aspect_ratio || projectJson?.project?.aspectRatio || "",
    clip_order: getClipOrder(projectJson),
    scenes: mediaScenes,
    tts: {
      mode: tts.mode || "",
      model_id: tts.model_id || "",
      voice_id: tts.voice_id || "",
      voices: tts.voices || null,
      voice_settings: tts.voice_settings || tts.settings || null,
      elevenlabs_speed: tts.elevenlabs_speed || null,
      edit_speed: tts.edit_speed || null,
      full_script: tts.full_script || "",
      dialogue: Array.isArray(tts.dialogue) ? tts.dialogue.map((d) => ({
        scene_id: d?.scene_id || d?.id || "",
        speaker: d?.speaker || "",
        voice_id: d?.voice_id || "",
        text: d?.text || "",
      })) : [],
    },
  };
  return shortHash(stableStringify(basis));
}

export function getClipOrder(projectJson) {
  const scenes = Array.isArray(projectJson?.scenes) ? projectJson.scenes : [];
  const order = projectJson?.render_export?.clip_order || projectJson?.capcut_export?.clip_order;
  return Array.isArray(order) ? order : scenes.map(sceneId).filter(Boolean);
}

function sceneMediaPath(slug, scene, stills) {
  const id = sceneId(scene);
  if (!id) return null;
  if (stills && isEditorNarrativeCard(scene)) return null;
  if (stills && isAnimatedScene(scene)) return `${slug}/clips/${id}.mp4`;
  if (stills) return `${slug}/images/${id}.jpg`;
  return `${slug}/clips/${id}.mp4`;
}

export function getMediaRequirements(projectJson, options = {}) {
  const fallbackName = options.fallbackName || "project";
  const slug = projectJson?.project?.slug || slugify(projectJson?.project?.title || fallbackName);
  const scenes = Array.isArray(projectJson?.scenes) ? projectJson.scenes : [];
  const sceneById = new Map(scenes.map((s) => [sceneId(s), s]));
  const stills = isStillPreset(projectJson?.project?.preset || "");
  const requirements = [];
  const add = (relPath, kind, extra = {}) => {
    if (!relPath) return;
    requirements.push({ path: relPath.split("\\").join("/"), kind, ...extra });
  };

  for (const id of getClipOrder(projectJson)) {
    const scene = sceneById.get(id) || { id };
    add(sceneMediaPath(slug, scene, stills), isAnimatedScene(scene) ? "clip" : (stills ? "image" : "clip"), { sceneId: id });
    if (!stills) add(`${slug}/voice/${id}.mp3`, "voice", { sceneId: id });
  }
  if (stills) add(`${slug}/voice/full.mp3`, "voice");

  const openingBase = projectJson?.opening?.assets_slug || slug;
  for (const s of projectJson?.opening?.scenes || []) {
    const sid = sceneId(s);
    add(sceneMediaPath(openingBase, s, stills), isAnimatedScene(s) ? "opening_clip" : (stills ? "opening_image" : "opening_clip"), { sceneId: sid });
    add(`${openingBase}/voice/${sid}.mp3`, "opening_voice", { sceneId: sid });
  }

  if (projectJson?.hook) add(`${slug}/voice/hook.mp3`, "voice_hook");
  if (projectJson?.audio?.music_file) add(`${slug}/${projectJson.audio.music_file}`, "music");
  if (projectJson?.audio?.transition_sfx) add(`sfx/${projectJson.audio.transition_sfx}`, "sfx");
  for (const s of scenes) {
    for (const c of s?.sfx || []) add(`sfx/${c.file}`, "sfx", { sceneId: sceneId(s) });
  }

  const seen = new Set();
  return {
    slug,
    requirements: requirements.filter((r) => {
      if (seen.has(r.path)) return false;
      seen.add(r.path);
      return true;
    }),
  };
}
