import { parseProject } from "./json-loader.js";
import { getClipOrder, sceneId } from "../shared/media-requirements.mjs";

const CONTINUOUS_PRESET_RE = /^(historias|criptoclaro|habitos|pov-historias)/;
const CLASSIC_PRESETS = new Set(["esqueletos", "novela-coreana"]);
const ALLOWED_PRESETS = new Set(["historias", "historias_reel", "criptoclaro", "criptoclaro_reel", "habitos_finanzas", "pov-historias", "manhwa", ...CLASSIC_PRESETS]);
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
// Presets de motion validos en ViralVideo.tsx (kenBurnsTransform); un typo caeria en silencio al default pan_lr.
const MANHWA_MOTION_PRESETS = new Set([
  "bottom_to_top", "top_to_bottom", "bottom_left_to_top_right", "bottom_right_to_top_left",
  "top_left_to_bottom_right", "top_right_to_bottom_left", "slow_push_in", "slow_pull_out", "static",
  "punch_in", "shake", // acentos de impacto (2026-07: punch_in = golpe de zoom que asienta; shake = temblor decayente)
  // alias que kenBurnsTransform tambien renderiza (compat con JSONs viejos/externos):
  "pan_lr", "pan_left_right", "pan_rl", "pan_right_left", "tilt_down", "static_hold", "push_in", "pull_out",
]);
// Transiciones de entrada por escena (manhwa). "flash" tambien lo dispara solo el render al abrir la ventana del sistema.
const MANHWA_TRANSITIONS = new Set(["cut", "crossfade", "dip_black", "flash"]);
const SAFE_SLUG_SEGMENT = /^[a-z0-9_][a-z0-9_-]*$/;
const VALID_ASPECTS = new Set(["9:16", "16:9"]);

function cleanString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeText(v) {
  return cleanString(v).replace(/\s+/g, " ");
}

function providerFromAnimationTool(tool) {
  const t = cleanString(tool).toLowerCase();
  if (!t || t === "none") return t || null;
  if (t === "grok" || t === "grok_video" || t === "grok-video" || t.startsWith("grok_")) return "grok";
  if (t === "flow") return "flow";
  return null;
}

function ingredientId(ing) {
  return cleanString(ing?.id) || cleanString(ing?.ingredient_id);
}

function ingredientRefIds(refs) {
  if (!Array.isArray(refs)) return [];
  return refs.map((r) => (typeof r === "string" ? r : cleanString(r?.ingredient_id) || cleanString(r?.id))).filter(Boolean);
}

function safeAssetPath(rel) {
  const p = cleanString(rel).replace(/\\/g, "/");
  return !!p && !p.includes("..") && /^assets\/characters\/[^/]+\.(png|jpg|jpeg|webp)$/i.test(p);
}

function characterAssetExists(rel, fileExists) {
  if (!fileExists) return true;
  if (fileExists(rel)) return true;
  const m = cleanString(rel).match(/^(.*)\.(png|jpg|jpeg|webp)$/i);
  if (!m) return false;
  return ["png", "jpg", "jpeg", "webp"].some((ext) => fileExists(`${m[1]}.${ext}`));
}

function validateCharacterAsset(errors, label, rel, fileExists) {
  if (!safeAssetPath(rel)) {
    errors.push(`${label}: reference_asset debe apuntar a assets/characters/*.png|jpg|jpeg|webp.`);
    return;
  }
  if (!characterAssetExists(rel, fileExists)) errors.push(`${label}: no existe ${rel} ni variante .png/.jpg/.jpeg/.webp con el mismo nombre.`);
}

function safeManhwaAssetPath(rel, bucket) {
  const p = cleanString(rel).replace(/\\/g, "/");
  const root = bucket === "escenarios" ? "escenarios" : "characters";
  return !!p && !p.includes("..") && new RegExp(`^assets/${root}/[^/]+/[^/]+\\.(png|jpg|jpeg|webp)$`, "i").test(p);
}

function validateManhwaAsset(errors, label, rel, bucket, fileExists, serie = "") {
  const normalized = cleanString(rel).replace(/\\/g, "/");
  if (!safeManhwaAssetPath(rel, bucket)) {
    errors.push(`${label}: debe apuntar a assets/${bucket}/<serie>/<archivo>.png|jpg|jpeg|webp.`);
    return;
  }
  if (serie && !normalized.startsWith(`assets/${bucket}/${serie}/`)) errors.push(`${label}: debe vivir bajo assets/${bucket}/${serie}/.`);
  if (fileExists && !characterAssetExists(rel, fileExists)) errors.push(`${label}: no existe ${rel} ni variante .png/.jpg/.jpeg/.webp con el mismo nombre.`);
}

function stringArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
}

function manhwaAssetDef(v) {
  if (typeof v === "string") return { mode: "existing", asset: cleanString(v), prompt: "", referenceKey: "", referenceAssets: [] };
  if (!v || typeof v !== "object" || Array.isArray(v)) return { mode: "", asset: "", prompt: "", referenceKey: "", referenceAssets: [] };
  const prompt = cleanString(v.prompt) || cleanString(v.generation_prompt) || cleanString(v.image_prompt);
  return {
    mode: cleanString(v.mode) || (prompt ? "generate" : "existing"),
    asset: cleanString(v.asset) || cleanString(v.reference_asset) || cleanString(v.output_file),
    prompt,
    referenceKey: cleanString(v.reference_pose) || cleanString(v.reference_view),
    referenceAssets: stringArray(v.reference_assets),
  };
}

function validateManhwaAssetDef(errors, label, raw, bucket, fileExists, serie) {
  const def = manhwaAssetDef(raw);
  if (!["existing", "generate"].includes(def.mode)) errors.push(`${label}: mode debe ser "existing" o "generate".`);
  validateManhwaAsset(errors, `${label}.asset`, def.asset, bucket, def.mode === "existing" ? fileExists : null, serie);
  if (def.mode === "generate" && !def.prompt) errors.push(`${label}: mode "generate" requiere prompt.`);
  for (const [i, rel] of def.referenceAssets.entries()) {
    validateManhwaAsset(errors, `${label}.reference_assets[${i}]`, rel, bucket, fileExists, serie);
  }
  return def;
}

function manhwaEscenarioViews(e) {
  const views = {};
  if (typeof e?.reference_asset === "string") views.base = e.reference_asset;
  if (e?.views && typeof e.views === "object" && !Array.isArray(e.views)) Object.assign(views, e.views);
  return views;
}

function manhwaEscenarioRef(v) {
  if (typeof v === "string") return { id: cleanString(v), view: "base" };
  if (!v || typeof v !== "object") return { id: "", view: "" };
  return { id: cleanString(v.id), view: cleanString(v.view) || "base" };
}

function hasAssetGraphSchema(rawJson) {
  const chars = rawJson?.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters) ? rawJson.characters : {};
  const hasPoses = Object.values(chars).some((c) => c?.poses && typeof c.poses === "object" && !Array.isArray(c.poses));
  const hasEscenarios = rawJson?.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios)
    && Object.keys(rawJson.escenarios).length > 0;
  return hasPoses || hasEscenarios;
}

function projectSerie(rawProject) {
  return cleanString(rawProject?.serie) || cleanString(rawProject?.series?.id);
}

function safeSlug(slug, allowPath = false) {
  if (!slug || slug.includes("..") || slug.includes("\\") || slug.startsWith("/") || slug.endsWith("/")) return false;
  if (!allowPath) return SAFE_ID.test(slug);
  return slug.split("/").every((part) => SAFE_SLUG_SEGMENT.test(part));
}

export function validateQueueProject(rawJson, options = {}) {
  const errors = [];
  const warnings = [];
  const parsed = parseProject(rawJson);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors || ["JSON invalido."], warnings, parsed: null };
  }

  const rawProject = rawJson?.project || {};
  const preset = cleanString(rawProject.preset);
  const isManhwa = preset === "manhwa";
  const isNovelaV2 = preset === "novela-coreana" && hasAssetGraphSchema(rawJson);
  const usesAssetGraph = isManhwa || isNovelaV2;
  const continuousPreset = CONTINUOUS_PRESET_RE.test(preset) || isManhwa;
  const classicPreset = CLASSIC_PRESETS.has(preset);
  const slug = cleanString(rawProject.slug) || parsed.project.slug;
  if (parsed.warnings?.length) {
    if (classicPreset || isManhwa) warnings.push(...parsed.warnings);
    else errors.push(...parsed.warnings.map((w) => `warning fatal: ${w}`));
  }
  if (!preset || !ALLOWED_PRESETS.has(preset)) errors.push(`preset no permitido para cola: "${preset || "(vacio)"}".`);
  if (!safeSlug(slug, classicPreset)) errors.push(`project.slug invalido: "${slug || "(vacio)"}". Usa minusculas, numeros, _ o -${classicPreset ? " y / para subcarpetas" : ""}.`);
  if (!cleanString(rawProject.title)) errors.push("project.title es obligatorio.");
  if (!VALID_ASPECTS.has(cleanString(rawProject.aspect_ratio))) errors.push(`project.aspect_ratio invalido: "${rawProject.aspect_ratio || ""}".`);

  const imageTool = cleanString(rawJson?.pipeline?.image_generation?.tool).toLowerCase();
  if (usesAssetGraph && imageTool !== "grok") {
    errors.push(`${isManhwa ? "manhwa" : "novela-coreana v2"} requiere pipeline.image_generation.tool "grok" (actual: "${imageTool || "(vacio)"}").`);
  } else if (continuousPreset && imageTool !== "grok") {
    errors.push(`Presets de voz continua requieren pipeline.image_generation.tool "grok" (actual: "${imageTool || "(vacio)"}").`);
  } else if (classicPreset && !["flow", "grok"].includes(imageTool)) {
    errors.push(`Presets clasicos requieren pipeline.image_generation.tool "flow" o "grok" (actual: "${imageTool || "(vacio)"}").`);
  }

  const scenes = Array.isArray(rawJson?.scenes) ? rawJson.scenes : [];
  const sceneIds = scenes.map(sceneId);
  const sceneSet = new Set();
  for (const [i, id] of sceneIds.entries()) {
    if (!id || !SAFE_ID.test(id)) errors.push(`scene[${i}]: id/scene_id invalido "${id || "(vacio)"}".`);
    if (sceneSet.has(id)) errors.push(`scene[${i}]: id duplicado "${id}".`);
    sceneSet.add(id);
  }

  const hasAnimated = scenes.some((s) => s?.render_mode === "animated");
  const animationTool = rawJson?.pipeline?.animation?.tool;
  const animationProvider = providerFromAnimationTool(animationTool);
  if (classicPreset) {
    if (!["flow", "grok"].includes(animationProvider || "")) {
      errors.push(`Presets clasicos requieren pipeline.animation.tool "flow" o "grok" (actual: "${animationTool || "(vacio)"}").`);
    } else if (imageTool === "grok" && animationProvider === "flow") {
      errors.push("Handoff imagen=grok -> animacion=flow no soportado; usa grok/grok o flow/grok.");
    }
  } else if (hasAnimated && animationProvider !== "grok") {
    errors.push(`Escenas animated requieren pipeline.animation.tool grok/grok_video (actual: "${animationTool || "(vacio)"}").`);
  } else if (!hasAnimated && animationTool && !["grok", "none", null].includes(animationProvider)) {
    errors.push(`pipeline.animation.tool no permitido en modo Grok: "${animationTool}".`);
  }
  for (const s of scenes) {
    if (s?.render_mode === "animated") {
      const prompt = cleanString(s?.animation_prompt) || cleanString(s?.animation?.prompt) || cleanString(s?.visual?.animation_prompt);
      if (!prompt) errors.push(`${sceneId(s)}: render_mode animated requiere animation_prompt, animation.prompt o visual.animation_prompt.`);
    }
  }

  const order = getClipOrder(rawJson);
  const hasRenderOrder = Array.isArray(rawJson?.render_export?.clip_order) && rawJson.render_export.clip_order.length > 0;
  const hasCapcutOrder = Array.isArray(rawJson?.capcut_export?.clip_order) && rawJson.capcut_export.clip_order.length > 0;
  if (!hasRenderOrder && !hasCapcutOrder && !isManhwa && !isNovelaV2) {
    errors.push("render_export.clip_order o capcut_export.clip_order es obligatorio y no puede estar vacio.");
  }
  const orderSet = new Set(order);
  if (orderSet.size !== order.length) errors.push("render_export.clip_order tiene escenas duplicadas.");
  for (const id of order) if (!sceneSet.has(id)) errors.push(`render_export.clip_order apunta a escena inexistente: "${id}".`);
  for (const id of sceneIds) if (!orderSet.has(id)) errors.push(`render_export.clip_order no incluye la escena: "${id}".`);

  const byId = new Map(scenes.map((s) => [sceneId(s), s]));
  for (const id of order) {
    if (!normalizeText(byId.get(id)?.voiceover?.text)) errors.push(`${id}: voiceover.text es obligatorio.`);
  }
  const joinedScript = normalizeText(order.map((id) => byId.get(id)?.voiceover?.text || "").join(" "));
  const fullScript = normalizeText(rawJson?.tts_export?.full_script);
  if (continuousPreset) {
    if (!fullScript) errors.push("tts_export.full_script es obligatorio.");
    else if (joinedScript && fullScript !== joinedScript) errors.push("tts_export.full_script no coincide con la union de voiceover.text en render_export.clip_order.");
  }
  if (continuousPreset && cleanString(rawJson?.tts_export?.mode).toLowerCase() === "dialogue") {
    const dialogue = Array.isArray(rawJson?.tts_export?.dialogue) ? rawJson.tts_export.dialogue : [];
    const voiceKeys = new Set(["narrador", "voz_general", "general", "sistema", "system", "ia", "ai", ...Object.keys(rawJson?.tts_export?.voices || {})]);
    for (const [i, row] of dialogue.entries()) {
      const sid = cleanString(row?.scene_id) || cleanString(row?.id);
      const speaker = cleanString(row?.speaker) || "narrador";
      if (sid && !sceneSet.has(sid)) errors.push(`tts_export.dialogue[${i}]: scene_id inexistente "${sid}".`);
      else if (sid) {
        const sceneText = normalizeText(byId.get(sid)?.voiceover?.text);
        const rowText = normalizeText(row?.text);
        if (sceneText && rowText && sceneText !== rowText) errors.push(`tts_export.dialogue[${i}]: text no coincide con ${sid}.voiceover.text.`);
      }
      if (!voiceKeys.has(speaker)) errors.push(`tts_export.dialogue[${i}]: speaker "${speaker}" no esta en tts_export.voices.`);
      if (!cleanString(row?.text)) errors.push(`tts_export.dialogue[${i}]: falta text.`);
    }
    if (!dialogue.length) {
      for (const [i, s] of scenes.entries()) {
        const speaker = cleanString(s?.voiceover?.speaker);
        if (speaker && !voiceKeys.has(speaker)) errors.push(`scene[${i}]: voiceover.speaker "${speaker}" no esta en tts_export.voices.`);
      }
    }
  }

  if (preset === "habitos_finanzas") {
    if (!Array.isArray(rawJson.ingredients) || rawJson.ingredients.length === 0) errors.push("habitos_finanzas requiere ingredients[] no vacio.");
    const ingById = new Map(Array.isArray(rawJson.ingredients) ? rawJson.ingredients.map((ing) => [ingredientId(ing), ing]) : []);
    ingById.delete("");
    for (const [i, ing] of Array.isArray(rawJson.ingredients) ? rawJson.ingredients.entries() : []) {
      const iid = ingredientId(ing);
      if (!iid || !SAFE_ID.test(iid)) errors.push(`ingredients[${i}]: ingredient_id/id invalido.`);
      if (ing?.type === "character") validateCharacterAsset(errors, `ingredients[${i}] (${iid})`, ing.reference_asset, options.fileExists);
    }
    for (const s of scenes) {
      const refs = ingredientRefIds(s?.references?.ingredients);
      if (refs.length === 0) errors.push(`${sceneId(s)}: habitos_finanzas requiere references.ingredients.`);
      for (const rid of refs) if (!ingById.has(rid)) errors.push(`${sceneId(s)}: references.ingredients apunta a ingrediente inexistente "${rid}".`);
    }
  }

  if (usesAssetGraph) {
    const label = isManhwa ? "manhwa" : "novela-coreana v2";
    const serie = projectSerie(rawProject);
    if (!SAFE_ID.test(serie)) errors.push(`${label} requiere project.serie o project.series.id valido (actual: "${rawProject.serie || rawProject.series?.id || "(vacio)"}").`);
    const ttsTool = cleanString(rawJson?.pipeline?.tts?.tool).toLowerCase();
    if (isManhwa && ttsTool && ttsTool !== "elevenlabs") errors.push(`manhwa requiere pipeline.tts.tool "elevenlabs" (actual: "${ttsTool}").`);
    if (isNovelaV2 && ttsTool && !["fish", "fish_audio", "fishaudio"].includes(ttsTool)) errors.push(`novela-coreana v2 mantiene Fish Audio; no uses pipeline.tts.tool "${ttsTool}".`);
    if (isNovelaV2 && cleanString(rawJson?.tts_export?.mode).toLowerCase() === "dialogue") errors.push("novela-coreana v2 usa una sola voz Fish; no uses tts_export.mode dialogue.");

    const manhwaChars = rawJson?.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters) ? rawJson.characters : {};
    const escenarios = rawJson?.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios) ? rawJson.escenarios : {};
    const poseDefs = new Map();
    const escenarioViewDefs = new Map();

    for (const [cid, c] of Object.entries(manhwaChars)) {
      const poses = c?.poses && typeof c.poses === "object" && !Array.isArray(c.poses) ? c.poses : null;
      if (!poses || Object.keys(poses).length === 0) errors.push(`characters.${cid}: ${label} requiere poses{} no vacio.`);
      for (const [pose, rel] of Object.entries(poses || {})) {
        const def = validateManhwaAssetDef(errors, `characters.${cid}.poses.${pose}`, rel, "characters", options.fileExists, serie);
        poseDefs.set(`${cid}:${pose}`, def);
      }
      for (const [pose, rawPose] of Object.entries(poses || {})) {
        const def = manhwaAssetDef(rawPose);
        if (def.mode === "generate" && def.referenceKey && !poses[def.referenceKey]) {
          errors.push(`characters.${cid}.poses.${pose}: reference_pose "${def.referenceKey}" no existe.`);
        }
      }
    }
    for (const [eid, e] of Object.entries(escenarios)) {
      const views = manhwaEscenarioViews(e);
      if (!Object.keys(views).length) errors.push(`escenarios.${eid}: requiere reference_asset o views{}.`);
      for (const [view, rawView] of Object.entries(views)) {
        const def = validateManhwaAssetDef(errors, `escenarios.${eid}.views.${view}`, rawView, "escenarios", options.fileExists, serie);
        escenarioViewDefs.set(`${eid}:${view}`, def);
      }
      for (const [view, rawView] of Object.entries(views)) {
        const def = manhwaAssetDef(rawView);
        if (def.mode === "generate" && def.referenceKey && !views[def.referenceKey]) {
          errors.push(`escenarios.${eid}.views.${view}: reference_view "${def.referenceKey}" no existe.`);
        }
      }
    }

    if (isManhwa) {
      const cycle = rawJson?.editing?.panel_motion?.cycle;
      for (const [i, name] of (Array.isArray(cycle) ? cycle : []).entries()) {
        if (!MANHWA_MOTION_PRESETS.has(cleanString(name))) errors.push(`editing.panel_motion.cycle[${i}]: preset de motion invalido "${name}" (validos: ${[...MANHWA_MOTION_PRESETS].join(", ")}).`);
      }
    }

    const referencedCharIds = new Set();
    for (const s of scenes) {
      const id = sceneId(s);
      const type = cleanString(s?.type) || "panel";
      if (isManhwa && !["panel", "narrative_card"].includes(type)) errors.push(`${id}: type invalido "${type}".`);
      if (isNovelaV2 && type !== "panel") errors.push(`${id}: novela-coreana v2 anima todas las escenas; no uses type "${type}".`);
      if (type === "narrative_card") {
        const mode = cleanString(s?.card?.mode) || "editor";
        if (!normalizeText(s?.card?.text)) errors.push(`${id}: narrative_card requiere card.text.`);
        if (!["editor", "generated"].includes(mode)) errors.push(`${id}: card.mode invalido "${mode}".`);
        // las refs de una card no se validan (la card no genera imagen) pero SI cuentan como "referenciado"
        // para no dar el warning espurio de asset-sin-usar (caso sistema_ui referenciado solo en una card).
        for (const ref of [...(Array.isArray(s?.references?.characters) ? s.references.characters : []),
                           ...(Array.isArray(s?.references?.assets) ? s.references.assets : [])]) {
          const rid = typeof ref === "string" ? cleanString(ref) : cleanString(ref?.id);
          if (rid) referencedCharIds.add(rid);
        }
        continue;
      }

      const renderMode = cleanString(s?.render_mode) || (isManhwa ? "static" : "animated");
      if (!["static", "animated"].includes(renderMode)) errors.push(`${id}: render_mode invalido "${renderMode}".`);
      const imagePrompt = cleanString(s?.image_prompt) || cleanString(s?.image?.prompt) || cleanString(s?.visual?.image_prompt);
      const animPrompt = cleanString(s?.animation_prompt) || cleanString(s?.animation?.prompt) || cleanString(s?.visual?.animation_prompt);
      if (!imagePrompt) errors.push(`${id}: panel requiere visual.image_prompt.`);
      if ((renderMode === "animated" || isNovelaV2) && !animPrompt) errors.push(`${id}: panel animated requiere visual.animation_prompt.`);
      if (isManhwa && renderMode === "static" && animPrompt) warnings.push(`${id}: panel static trae animation_prompt; se ignora.`);
      if (isNovelaV2 && cleanString(s?.render_mode) && renderMode !== "animated") errors.push(`${id}: novela-coreana v2 debe animarse; usa render_mode "animated" o omite el campo.`);
      const motionPreset = cleanString(s?.editor_motion?.preset) || cleanString(s?.edition_motion?.preset);
      if (isManhwa && motionPreset && !MANHWA_MOTION_PRESETS.has(motionPreset)) errors.push(`${id}: editor_motion.preset invalido "${motionPreset}" (validos: ${[...MANHWA_MOTION_PRESETS].join(", ")}).`);
      const transitionIn = cleanString(s?.transition_in);
      if (isManhwa && transitionIn && !MANHWA_TRANSITIONS.has(transitionIn)) errors.push(`${id}: transition_in invalido "${transitionIn}" (validos: ${[...MANHWA_TRANSITIONS].join(", ")}).`);

      let v2ReferenceCount = 0;
      for (const ref of Array.isArray(s?.references?.characters) ? s.references.characters : []) {
        const cid = typeof ref === "string" ? ref : cleanString(ref?.id) || cleanString(ref?.character_id);
        const pose = typeof ref === "string" ? "" : cleanString(ref?.pose);
        if (!cid) { errors.push(`${id}: references.characters contiene una referencia sin id.`); continue; }
        if (!manhwaChars[cid]) { errors.push(`${id}: references.characters apunta a personaje inexistente "${cid}".`); continue; }
        referencedCharIds.add(cid);
        if (!pose) { errors.push(`${id}: references.characters.${cid} requiere pose.`); continue; }
        if (!manhwaChars[cid]?.poses?.[pose]) errors.push(`${id}: personaje "${cid}" no tiene pose "${pose}".`);
        if (pose && !poseDefs.has(`${cid}:${pose}`)) errors.push(`${id}: pose "${cid}.${pose}" no esta normalizada.`);
        v2ReferenceCount++;
      }
      // references.assets es un mecanismo del preset manhwa (sistema_ui). En novela v2 se ignora (como
      // antes del fix 2026-07-06) para no rechazar JSONs que el render tolera.
      if (isManhwa) for (const [k, ref] of (Array.isArray(s?.references?.assets) ? s.references.assets : []).entries()) {
        const aid = typeof ref === "string" ? cleanString(ref) : cleanString(ref?.id) || cleanString(ref?.asset_id);
        const pose = (typeof ref === "string" ? "" : cleanString(ref?.pose)) || "base";
        if (!aid) { errors.push(`${id}: references.assets[${k}] sin id.`); continue; }
        if (!manhwaChars[aid]) { errors.push(`${id}: references.assets apunta a asset inexistente "${aid}" (debe declararse en characters).`); continue; }
        referencedCharIds.add(aid);
        if (!manhwaChars[aid]?.poses?.[pose]) errors.push(`${id}: asset "${aid}" no tiene pose "${pose}".`);
        v2ReferenceCount++;
      }
      const escRef = manhwaEscenarioRef(s?.references?.escenario);
      if (escRef.id && !escenarios[escRef.id]) errors.push(`${id}: references.escenario apunta a escenario inexistente "${escRef.id}".`);
      else if (escRef.id && !escenarioViewDefs.has(`${escRef.id}:${escRef.view}`)) errors.push(`${id}: escenario "${escRef.id}" no tiene view "${escRef.view}".`);
      else if (escRef.id) v2ReferenceCount++;
      v2ReferenceCount += ingredientRefIds(s?.references?.ingredients).length;
      if (isNovelaV2 && v2ReferenceCount === 0) errors.push(`${id}: novela-coreana v2 requiere al menos una referencia valida (personaje pose, escenario view o ingrediente).`);
    }

    // Un personaje/asset declarado que ninguna escena referencia se genera pero nunca se adjunta (caso
    // sistema_ui). Solo manhwa: en novela v2 el opening compartido puede referenciar fuera de scenes[].
    if (isManhwa) for (const cid of Object.keys(manhwaChars)) {
      if (!referencedCharIds.has(cid)) warnings.push(`characters.${cid}: declarado pero ninguna escena lo referencia (references.characters / references.assets).`);
    }
  }

  // manhwa: audio.music_cues (cambio de cama musical a mitad del video). El render omite en silencio los
  // cues cuyo archivo no existe; aqui se atajan los errores de CONTRATO (escena inexistente, orden, exceso).
  const musicCues = rawJson?.audio?.music_cues;
  if (isManhwa && musicCues != null) {
    if (!Array.isArray(musicCues)) {
      errors.push("audio.music_cues debe ser un array de { at_scene, file }.");
    } else {
      const idxOf = new Map(sceneIds.map((id, i) => [id, i]));
      let prev = -1;
      for (const [i, cue] of musicCues.entries()) {
        const at = cleanString(cue?.at_scene);
        const file = cleanString(cue?.file);
        if (!at || !idxOf.has(at)) errors.push(`audio.music_cues[${i}]: at_scene "${at || "(vacio)"}" no existe en scenes[].`);
        if (!file) errors.push(`audio.music_cues[${i}]: falta file (ej. "music/manhwa_tension.mp3").`);
        else if (!file.startsWith("music/")) warnings.push(`audio.music_cues[${i}]: "${file}" no empieza con "music/" (biblioteca compartida); se resolvera relativo a public/<slug>/.`);
        const idx = idxOf.get(at);
        if (idx !== undefined) {
          if (idx <= prev) warnings.push(`audio.music_cues[${i}]: at_scene "${at}" no va DESPUES del cue anterior (deben seguir el orden de scenes[]).`);
          prev = Math.max(prev, idx);
        }
      }
      if (musicCues.length > 3) warnings.push(`audio.music_cues: ${musicCues.length} cambios de musica; max recomendado 2-3 por Parte (mas se siente robotico).`);
    }
  }

  const chars = rawJson?.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters) ? rawJson.characters : {};
  for (const [cid, c] of Object.entries(chars)) {
    if (c?.reference_asset) validateCharacterAsset(errors, `characters.${cid}`, c.reference_asset, options.fileExists);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    parsed,
    project: parsed.project,
    scenes: parsed.scenes,
    preset,
    slug,
    provider: imageTool || "grok",
    imageProvider: imageTool || "grok",
    animationProvider: classicPreset ? animationProvider : (hasAnimated ? "grok" : "none"),
    hasAnimated,
  };
}
