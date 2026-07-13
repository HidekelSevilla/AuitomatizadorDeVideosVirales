// lib/json-loader.js
// Valida y normaliza el JSON crudo al modelo interno (SceneState). PURO: no toca chrome.*.
// Solo importa constantes de lib/messaging.js.
//
// Soporta DOS esquemas:
//   - NUEVO ("produccion"): scenes[].visual.{image_prompt,animation_prompt}, scenes[].animation_prompt,
//     references.characters,
//     references.scenes, cast, top-level "characters" (id -> {display_name,...}), voiceover, captions,
//     tts_export, capcut_export. Las referencias son EXPLICITAS por escena.
//   - VIEJO (compat): scenes[].image.{prompt,ingredients,model}, animation.{prompt,model},
//     continuity_from, character_bible.name.
// Para el flujo de Flow (imagen+animacion) solo se usan: prompts + referencias (personajes y escenas).
// El resto (voiceover/captions/tts/capcut) se guarda tal cual para fases futuras (Fish Audio, CapCut).

import { SCENE_STATUS, INGREDIENT } from "./messaging.js";
import { slugify } from "../shared/slug.mjs";   // FUENTE UNICA del slug (debe coincidir con el render)

// Tokens de ingrediente reconocidos del esquema VIEJO (los demas generan warning, no error).
const KNOWN_INGREDIENTS = new Set([INGREDIENT.CHARACTER_REF, INGREDIENT.PREV_FRAME]);

// Tipos de la biblioteca NUEVA "ingredients[]" (lo que el pipeline genera en sesion).
// style_frame (historias): la "pagina" de codice reutilizable; se genera de cero (generation_prompt) y se
// adjunta como referencia por escena igual que entity/location_plate. Aditivo: no afecta a otros presets.
const INGREDIENT_TYPES = new Set(["character_edited", "entity", "location_plate", "style_frame"]);
const STILL_PRESET_RE = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/;
const MANHWA_DEFAULT_VOICE_ID = "452WrNT9o8dphaYW5YGU";

function providerFromTool(tool) {
  const t = typeof tool === "string" ? tool.trim().toLowerCase() : "";
  if (t === "grok" || t === "flow") return t;
  if (t === "grok_video" || t === "grok-video" || t.startsWith("grok_")) return "grok";
  return null;
}

// Extrae ids de un array de referencias que acepta strings ("huesito") u objetos ({character_id}/{ingredient_id}).
function refIdsFrom(arr, key) {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => (typeof c === "string" ? c : (c && typeof c[key] === "string" ? c[key] : null))).filter(Boolean);
}

function cleanString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function manhwaGeneratedCardPrompt(text) {
  return `Korean manhwa/webtoon narrative title card, pure black background, centered clean white lettering reading exactly "${text}", elegant dramatic spacing, no other text, no logo, no watermark.`;
}

function stringArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
}

function manhwaAssetDef(v) {
  if (typeof v === "string") return { mode: "existing", asset: v.trim(), prompt: "", referenceAssets: [], referenceKey: "" };
  if (!v || typeof v !== "object" || Array.isArray(v)) return { mode: "", asset: "", prompt: "", referenceAssets: [], referenceKey: "" };
  const mode = cleanString(v.mode) || (cleanString(v.prompt) || cleanString(v.generation_prompt) || cleanString(v.image_prompt) ? "generate" : "existing");
  return {
    mode,
    asset: cleanString(v.asset) || cleanString(v.reference_asset) || cleanString(v.output_file),
    prompt: cleanString(v.prompt) || cleanString(v.generation_prompt) || cleanString(v.image_prompt),
    referenceAssets: stringArray(v.reference_assets),
    referenceKey: cleanString(v.reference_pose) || cleanString(v.reference_view),
  };
}

function manhwaScenarioRef(v) {
  if (typeof v === "string") return { id: v.trim(), view: "base" };
  if (!v || typeof v !== "object") return { id: "", view: "" };
  return { id: cleanString(v.id), view: cleanString(v.view) || "base" };
}

function hasPoseGraph(charMap) {
  return Object.values(charMap).some((c) => c?.poses && typeof c.poses === "object" && !Array.isArray(c.poses));
}

// Valida y normaliza rawJson.
// -> { ok: true, project, scenes, warnings } | { ok: false, errors: string[] }
export function parseProject(rawJson) {
  const errors = [];
  const warnings = [];

  // El raw debe ser un objeto.
  if (rawJson == null || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return { ok: false, errors: ["El JSON raiz debe ser un objeto."] };
  }
  const rawProject = typeof rawJson.project === "object" && rawJson.project ? rawJson.project : {};
  const preset = typeof rawProject.preset === "string" ? rawProject.preset : "";
  const isManhwa = preset === "manhwa";

  // scenes debe existir y no estar vacio.
  const rawScenes = rawJson.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    return { ok: false, errors: ["'scenes' debe ser un array no vacio."] };
  }

  // Mapa de personajes (esquema nuevo): character_id -> { display_name, reference_asset, ... }.
  // COPIA mutable: los ingredientes type:"character" (blueprint habitos_finanzas) se inyectan aqui abajo.
  const charMap = { ...((rawJson.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters))
    ? rawJson.characters : {}) };
  // Pre-pass: un ingrediente type:"character" es un PERSONAJE recurrente PRE-HECHO (asset en disco,
  // regenerate:false) — NO se genera. Se inyecta al charMap para reusar el mecanismo de personaje (Flow "+"
  // / Grok sube su reference_asset por CDP). Sus references.ingredients por escena se enrutan a characterRefs
  // (no ingredientRefs). Aditivo: presets sin type:"character" quedan EXACTAMENTE igual.
  const characterIngredientIds = new Set();
  if (Array.isArray(rawJson.ingredients)) {
    for (const ing of rawJson.ingredients) {
      if (!ing || ing.type !== "character") continue;
      const cid = typeof ing.id === "string" ? ing.id : (typeof ing.ingredient_id === "string" ? ing.ingredient_id : null);
      if (!cid) continue;
      const refAsset = typeof ing.reference_asset === "string" ? ing.reference_asset
        : (typeof ing.output_file === "string" ? ing.output_file : null);
      if (!charMap[cid]) charMap[cid] = { display_name: cid, reference_asset: refAsset };
      characterIngredientIds.add(cid);
    }
  }
  const hasCharMap = Object.keys(charMap).length > 0;
  const hasEscenarioGraph = rawJson.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios)
    && Object.keys(rawJson.escenarios).length > 0;
  const usesAssetGraph = isManhwa || (preset === "novela-coreana" && (hasPoseGraph(charMap) || hasEscenarioGraph));
  const assetGraphPrefix = isManhwa ? "manhwa" : "novela";
  // El nombre que el driver tipea en el selector "+" de Flow es el display_name (p.ej. "Huesito").
  const charDisplayName = (id) => {
    const c = charMap[id];
    return (c && typeof c.display_name === "string" && c.display_name) ? c.display_name : id;
  };

  // --- Biblioteca de INGREDIENTES (nuevo, OPCIONAL): lo que el pipeline genera en sesion ---
  // character_edited = el personaje base "vestido" (se genera usando el base como referencia + edit_prompt);
  // entity / location_plate = se generan de cero con generation_prompt. Aditivo: un JSON sin 'ingredients'
  // deja todo igual (array vacio, cero validaciones nuevas, cero warnings sobre references.scenes).
  const ingredients = [];
  const ingredientById = new Map();
  const outputOwners = new Map();
  const outputIdentity = (p) => String(p || "").replace(/\\/g, "/").toLowerCase();
  if (Array.isArray(rawJson.ingredients)) {
    rawJson.ingredients.forEach((ing, k) => {
      const w = `ingredients[${k}]`;
      const type = ing && typeof ing.type === "string" ? ing.type : null;
      if (type === "character") return;   // personaje pre-hecho: ya inyectado al charMap (pre-pass), no se genera aqui
      // id / output_file aceptan los alias del blueprint (ingredient_id / reference_asset).
      const iid = ing && typeof ing.id === "string" ? ing.id
        : (ing && typeof ing.ingredient_id === "string" ? ing.ingredient_id : null);
      if (!iid) { errors.push(`${w}: falta 'id' (string).`); return; }
      if (ingredientById.has(iid)) { errors.push(`${w}: 'id' duplicado '${iid}'.`); return; }
      if (!type || !INGREDIENT_TYPES.has(type)) {
        errors.push(`${w} (${iid}): 'type' invalido (usa character|character_edited|entity|location_plate|style_frame).`); return;
      }
      const outputFile = (typeof ing.output_file === "string" && ing.output_file.trim()) ? ing.output_file.trim()
        : (typeof ing.reference_asset === "string" && ing.reference_asset.trim() ? ing.reference_asset.trim() : null);
      if (!outputFile) errors.push(`${w} (${iid}): falta 'output_file'.`);
      let base = null;
      let prompt = "";
      if (type === "character_edited") {
        base = typeof ing.base === "string" ? ing.base : null;
        prompt = typeof ing.edit_prompt === "string" ? ing.edit_prompt : "";
        if (!base) errors.push(`${w} (${iid}): character_edited requiere 'base' (id de un personaje de 'characters').`);
        else if (hasCharMap && !charMap[base]) errors.push(`${w} (${iid}): 'base' '${base}' no esta en 'characters'.`);
        if (!prompt) errors.push(`${w} (${iid}): character_edited requiere 'edit_prompt'.`);
      } else {
        prompt = typeof ing.generation_prompt === "string" ? ing.generation_prompt : "";
        if (!prompt) errors.push(`${w} (${iid}): ${type} requiere 'generation_prompt'.`);
      }
      if (outputFile) {
        const outKey = outputIdentity(outputFile);
        if (outputOwners.has(outKey)) errors.push(`${w} (${iid}): 'output_file' colisiona con '${outputOwners.get(outKey)}'. Cada ingrediente necesita un archivo unico.`);
        else outputOwners.set(outKey, iid);
      }
      // imageUrl/imageFilePath se llenan en la FASE INGREDIENTES (tile de Flow / PNG en disco para Grok).
      const norm = {
        id: iid, type, base, prompt, outputFile: outputFile || "",
        persistent: typeof ing?.persistent === "boolean" ? ing.persistent : null,
        regenerate: ing?.regenerate === true,
        regeneratePending: ing?.regenerate === true || ing?.persistent === false,
        imageUrl: null, imageFilePath: null,
      };
      ingredients.push(norm);
      ingredientById.set(iid, norm);
    });
  }

  const manhwaPoseDefs = new Map();
  const manhwaEscenarioDefs = new Map();
  if (usesAssetGraph) {
    const addGeneratedAsset = (id, prompt, outputFile, referenceAssets) => {
      if (!id || ingredientById.has(id)) return;
      const outKey = outputIdentity(outputFile);
      if (outputFile && outputOwners.has(outKey)) {
        errors.push(`asset generado ${id}: output_file '${outputFile}' colisiona con '${outputOwners.get(outKey)}'.`);
        return;
      }
      const norm = { id, type: "manhwa_asset", base: null, prompt, outputFile, referenceAssets, imageUrl: null, imageFilePath: null };
      ingredients.push(norm);
      ingredientById.set(id, norm);
      if (outputFile) outputOwners.set(outKey, id);
    };

    for (const [cid, c] of Object.entries(charMap)) {
      const poses = c?.poses && typeof c.poses === "object" && !Array.isArray(c.poses) ? c.poses : {};
      for (const [pose, rawPose] of Object.entries(poses)) {
        const def = manhwaAssetDef(rawPose);
        manhwaPoseDefs.set(`${cid}:${pose}`, def);
      }
      for (const [pose, rawPose] of Object.entries(poses)) {
        const def = manhwaAssetDef(rawPose);
        if (def.mode !== "generate") continue;
        const refs = [...def.referenceAssets];
        const refPose = def.referenceKey || (pose !== "base" ? "base" : "");
        const refDef = refPose ? manhwaPoseDefs.get(`${cid}:${refPose}`) : null;
        if (refDef?.asset) refs.push(refDef.asset);
        addGeneratedAsset(`${assetGraphPrefix}_character_${cid}_${pose}`, def.prompt, def.asset, refs);
      }
    }

    const escenarios = rawJson.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios) ? rawJson.escenarios : {};
    for (const [eid, e] of Object.entries(escenarios)) {
      const views = e?.views && typeof e.views === "object" && !Array.isArray(e.views) ? e.views : {};
      if (typeof e?.reference_asset === "string" && !views.base) {
        manhwaEscenarioDefs.set(`${eid}:base`, manhwaAssetDef(e.reference_asset));
      }
      for (const [view, rawView] of Object.entries(views)) {
        manhwaEscenarioDefs.set(`${eid}:${view}`, manhwaAssetDef(rawView));
      }
      for (const [view, rawView] of Object.entries(views)) {
        const def = manhwaAssetDef(rawView);
        if (def.mode !== "generate") continue;
        const refs = [...def.referenceAssets];
        const refView = def.referenceKey || (view !== "base" ? "base" : "");
        const refDef = refView ? manhwaEscenarioDefs.get(`${eid}:${refView}`) : null;
        if (refDef?.asset) refs.push(refDef.asset);
        addGeneratedAsset(`${assetGraphPrefix}_escenario_${eid}_${view}`, def.prompt, def.asset, refs);
      }
    }
  }
  const hasIngredients = ingredients.length > 0;
  // image-only (preset historias / pipeline.animation.tool === "none"): NO hay paso de video, asi que
  // las escenas NO traen animation_prompt y el autopiloto debe saltar la fase de animacion. Gateado:
  // sin esto (otros presets) -> comportamiento intacto (animation_prompt sigue siendo obligatorio).
  const animTool = rawJson.pipeline && rawJson.pipeline.animation && rawJson.pipeline.animation.tool;
  const imageOnly = animTool === "none" || STILL_PRESET_RE.test(preset);  // historias* / criptoclaro* / habitos* / pov-historias / manhwa
  // HIBRIDO (historias/criptoclaro/habitos): render por escena. Solo activo en presets image-only que ADEMAS declaran
  // render_mode por escena -> algunas escenas son video ("animated") y el resto still. Otros presets: false (intacto).
  const perSceneRender = imageOnly && rawScenes.some((s) => s && typeof s.render_mode === "string");

  // schema nuevo historias: el id de escena puede venir como scene_id (alias de id).
  const sceneIdOf = (s) => (s && typeof s.id === "string" ? s.id : (s && typeof s.scene_id === "string" ? s.scene_id : null));
  const allIds = rawScenes.map(sceneIdOf);
  const seenIds = new Set();
  const scenes = [];

  rawScenes.forEach((raw, i) => {
    const where = `scene[${i}]`;
    const id = sceneIdOf(raw);

    if (!id) {
      errors.push(`${where}: falta 'id' (o 'scene_id') (string).`);
    } else if (seenIds.has(id)) {
      errors.push(`${where}: 'id' duplicado '${id}'.`);
    } else {
      seenIds.add(id);
    }

    // --- Prompts: NUEVO (visual.*) con fallback al VIEJO (image./animation.) ---
    const visual = raw && typeof raw.visual === "object" && raw.visual ? raw.visual : null;
    const image = raw && typeof raw.image === "object" && raw.image ? raw.image : {};
    const animation = raw && typeof raw.animation === "object" && raw.animation ? raw.animation : {};
    const sceneType = isManhwa && raw?.type === "narrative_card" ? "narrative_card" : "panel";
    const card = raw && typeof raw.card === "object" && raw.card ? raw.card : {};
    const cardText = cleanString(card.text);
    const cardMode = sceneType === "narrative_card" && card.mode === "generated" ? "generated" : "editor";
    const needsGeneratedImage = sceneType !== "narrative_card" || cardMode === "generated";

    // schema nuevo historias: image_prompt puede venir en la RAIZ de la escena (no bajo visual.)
    let imagePrompt = visual && typeof visual.image_prompt === "string" ? visual.image_prompt
      : (raw && typeof raw.image_prompt === "string" ? raw.image_prompt
      : (typeof image.prompt === "string" ? image.prompt : null));
    const animationPrompt = visual && typeof visual.animation_prompt === "string" ? visual.animation_prompt
      : (raw && typeof raw.animation_prompt === "string" ? raw.animation_prompt
      : (typeof animation.prompt === "string" ? animation.prompt : null));
    if (isManhwa && sceneType === "narrative_card" && cardMode === "generated" && !imagePrompt && cardText) {
      imagePrompt = manhwaGeneratedCardPrompt(cardText);
    }

    if (needsGeneratedImage && !imagePrompt) errors.push(`${where} (${id ?? "?"}): falta 'visual.image_prompt' (o 'image.prompt').`);
    if (!animationPrompt && !imageOnly && sceneType !== "narrative_card") errors.push(`${where} (${id ?? "?"}): falta 'visual.animation_prompt' (o 'animation.prompt').`);
    if (perSceneRender && raw.render_mode === "animated" && !animationPrompt) errors.push(`${where} (${id ?? "?"}): render_mode "animated" requiere 'animation_prompt' (o 'visual.animation_prompt' / 'animation.prompt').`);
    if (isManhwa && sceneType === "panel" && raw.render_mode !== "animated" && animationPrompt) warnings.push(`${where} (${id ?? "?"}): panel static trae animation_prompt; se ignora.`);
    if (isManhwa && sceneType === "narrative_card" && !cardText) errors.push(`${where} (${id ?? "?"}): narrative_card requiere card.text.`);

    // --- Referencias de PERSONAJE (nuevo: references.characters; fallback: cast) ---
    // Acepta strings ("huesito_green") u objetos ({character_id}). Un id puede ser un personaje base
    // (en 'characters') O un ingrediente character_edited (el base ya "vestido"); el SW resuelve cual.
    const references = raw && typeof raw.references === "object" && raw.references ? raw.references : {};
    let characterRefIds = [];
    const referenceAssets = [];
    if (usesAssetGraph && sceneType === "panel" && Array.isArray(references.characters) && references.characters.length) {
      characterRefIds = references.characters
        .map((c) => (typeof c === "string" ? c : cleanString(c?.id) || cleanString(c?.character_id)))
        .filter(Boolean);
      for (const c of references.characters) {
        if (!c || typeof c === "string") continue;
        const cid = cleanString(c.id) || cleanString(c.character_id);
        const pose = cleanString(c.pose);
        const ref = cid && pose ? (manhwaPoseDefs.get(`${cid}:${pose}`)?.asset || "") : "";
        if (ref) referenceAssets.push(ref);
      }
    } else if (Array.isArray(references.characters) && references.characters.length) {
      characterRefIds = refIdsFrom(references.characters, "character_id");
    } else if (Array.isArray(raw && raw.cast) && raw.cast.length) {
      characterRefIds = refIdsFrom(raw.cast, "character_id");
    }
    // references.ingredients que apuntan a un ingrediente type:"character" (personaje pre-hecho) son refs de
    // PERSONAJE, no de prop -> se mueven a characterRefIds (el SW las adjunta por reference_asset).
    const allIngRefIds = refIdsFrom(references.ingredients, "ingredient_id");
    const charRefsFromIng = allIngRefIds.filter((rid) => characterIngredientIds.has(rid));
    if (charRefsFromIng.length) characterRefIds = [...characterRefIds, ...charRefsFromIng];
    const characterRefs = characterRefIds.map((cid) => {
      const isEdited = ingredientById.get(cid)?.type === "character_edited";
      if (hasCharMap && !charMap[cid] && !isEdited) {
        warnings.push(`${where} (${id ?? "?"}): character_id '${cid}' no esta en 'characters' ni es un ingrediente character_edited.`);
      }
      return charDisplayName(cid);
    });

    // --- Referencias de INGREDIENTE por escena (entity/location_plate; YA sin los type:"character") ---
    const ingredientRefs = allIngRefIds.filter((rid) => !characterIngredientIds.has(rid));
    for (const rid of ingredientRefs) {
      if (!ingredientById.has(rid)) {
        warnings.push(`${where} (${id ?? "?"}): references.ingredients apunta a '${rid}' que no esta en 'ingredients'.`);
      }
    }

    // --- Referencias de ESCENA previa (nuevo: references.scenes) ---
    let sceneRefs = [];
    if (Array.isArray(references.scenes)) {
      sceneRefs = references.scenes
        .map((s) => (s && typeof s.scene_id === "string"
          ? { sceneId: s.scene_id, useFor: Array.isArray(s.use_for) ? s.use_for : [], strength: typeof s.strength === "string" ? s.strength : null }
          : null))
        .filter(Boolean);
      for (const sr of sceneRefs) {
        if (!allIds.includes(sr.sceneId)) {
          warnings.push(`${where} (${id ?? "?"}): references.scenes apunta a '${sr.sceneId}' inexistente.`);
        }
      }
    }
    // Con el flujo de ingredientes activo, referenciar escenas completas clona composicion (lo que se quiere evitar).
    if (hasIngredients && sceneRefs.length) {
      warnings.push(`${where} (${id ?? "?"}): usa references.scenes junto al flujo de ingredientes (desaconsejado: clona la composicion de esa escena).`);
    }
    if (usesAssetGraph && sceneType === "panel") {
      const escRef = manhwaScenarioRef(references.escenario);
      const escDef = escRef.id ? manhwaEscenarioDefs.get(`${escRef.id}:${escRef.view}`) : null;
      if (escDef?.asset) referenceAssets.push(escDef.asset);
      // references.assets: assets sueltos (p.ej. sistema_ui) que resuelven contra characters.<id>.poses
      // igual que references.characters, pero solo adjuntan su tile (no son personajes de la escena).
      for (const a of Array.isArray(references.assets) ? references.assets : []) {
        const aid = typeof a === "string" ? cleanString(a) : (cleanString(a?.id) || cleanString(a?.asset_id));
        const pose = (typeof a === "string" ? "" : cleanString(a?.pose)) || "base";
        const ref = aid ? (manhwaPoseDefs.get(`${aid}:${pose}`)?.asset || "") : "";
        if (ref) referenceAssets.push(ref);
        else warnings.push(`${where} (${id ?? "?"}): references.assets apunta a '${aid || "?"}:${pose}' que no existe en characters.<id>.poses.`);
      }
    }

    // --- VIEJO esquema: ingredientes (tokens crudos; warning si desconocidos) ---
    const imageIngredients = Array.isArray(image.ingredients) ? image.ingredients.slice() : [];
    for (const tok of imageIngredients) {
      if (!KNOWN_INGREDIENTS.has(tok)) {
        warnings.push(`${where} (${id ?? "?"}): ingrediente desconocido '${tok}' (ignorado).`);
      }
    }

    // --- Metadatos para fases futuras (Fish Audio / CapCut). No se usan en el flujo de Flow. ---
    const voiceover = raw && typeof raw.voiceover === "object" && raw.voiceover ? raw.voiceover : {};
    const captions = raw && typeof raw.captions === "object" && raw.captions ? raw.captions : {};
    const timeline = raw && typeof raw.timeline === "object" && raw.timeline ? raw.timeline : {};
    const defaultDur = typeof (rawJson.project && rawJson.project.default_clip_duration_s) === "number"
      ? rawJson.project.default_clip_duration_s : 4;

    scenes.push({
      id: id ?? "",
      imagePrompt: imagePrompt ?? "",
      animationPrompt: animationPrompt ?? "",
      sceneType,
      cardText,
      cardMode,
      skipImageGeneration: isManhwa && sceneType === "narrative_card" && cardMode === "editor",
      // HIBRIDO historias/manhwa: "animated" -> clip de video. Novela-coreana v2 anima todo.
      renderMode: (raw.render_mode === "animated" || (preset === "novela-coreana" && usesAssetGraph)) ? "animated" : "static",
      // NUEVO: referencias explicitas por escena (lo que usa el flujo de Flow).
      characterRefs,            // nombres de Personaje de Flow (display_name) a adjuntar via "+"
      characterRefIds,          // ids originales del JSON (base o character_edited; el SW resuelve cual)
      ingredientRefs,           // NUEVO: ids de entity/location_plate a adjuntar en esta escena
      sceneRefs,                // [{ sceneId, useFor, strength }] -> adjuntar imagen de esa escena via ⋮
      referenceAssets,
      // Metadatos (fases futuras).
      changeLevel: typeof raw.change_level === "string" ? raw.change_level : null,
      locationId: typeof raw.location_id === "string" ? raw.location_id : null,
      clipDurationS: typeof timeline.clip_duration_s === "number" ? timeline.clip_duration_s : defaultDur,
      timeLabel: typeof raw.time_label === "string" ? raw.time_label : null,
      voiceoverText: typeof voiceover.text === "string" ? voiceover.text : "",
      voiceoverSpeaker: typeof voiceover.speaker === "string" ? voiceover.speaker.trim() : "",
      captionsText: typeof captions.text === "string" ? captions.text : "",
      editNotes: typeof raw.edit_notes === "string" ? raw.edit_notes : "",
      // VIEJO (compat dry-run / runRealImage).
      imageIngredients,
      imageModel: typeof image.model === "string" ? image.model : "",
      animationModel: typeof animation.model === "string" ? animation.model : "",
      continuityFrom: typeof raw.continuity_from === "string" ? raw.continuity_from : null,
      // runtime.
      status: SCENE_STATUS.PENDING,
      attempts: 0,
      error: null,
      imageUrl: null,            // src de la imagen generada (fase 1) para animar (fase 2)
      videoUrl: null,            // src del video disparado (fase 2 paralela) para recogerlo despues
      clipFilename: null,
      lastFrameFilename: null,
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const rawBible = typeof rawJson.character_bible === "object" && rawJson.character_bible ? rawJson.character_bible : {};
  const bibleName = typeof rawBible.name === "string" ? rawBible.name : "";

  const title = typeof rawProject.title === "string" ? rawProject.title : "";
  // slug: carpeta de medios en remotion-editor/public/<slug>/. Del JSON (project.slug) o del title.
  const slug = (typeof rawProject.slug === "string" && rawProject.slug.trim())
    ? rawProject.slug.trim() : slugify(title);
  // hook: bloque para generar hook.mp3 (hook.voiceover) y el montaje en Remotion. Se guarda tal cual.
  const hook = typeof rawJson.hook === "object" && rawJson.hook ? rawJson.hook : null;

  // Normaliza el mapa de personajes: garantiza display_name (cae al id si falta) para que la FASE
  // INGREDIENTES adjunte la base por el "+" de Flow aunque el JSON omita display_name. ANTES fallaba
  // EN SILENCIO: con display_name ausente generaba el character_edited SIN la referencia de la base
  // (skeleton generico, sin error). Avisa para que el orquestador lo ponga explicito.
  const charactersNorm = {};
  for (const [cid, c] of Object.entries(charMap)) {
    const hasDn = c && typeof c.display_name === "string" && c.display_name.trim();
    if (!hasDn) warnings.push(`characters.${cid}: falta 'display_name'; uso el id "${cid}" para adjuntar la base en Flow (ponlo explicito en el JSON).`);
    charactersNorm[cid] = { ...c, display_name: hasDn ? c.display_name : cid };
  }

  const rawTtsExport = typeof rawJson.tts_export === "object" && rawJson.tts_export ? rawJson.tts_export : null;
  const pipelineTts = rawJson.pipeline && typeof rawJson.pipeline.tts === "object" && rawJson.pipeline.tts ? rawJson.pipeline.tts : null;
  const ttsExport = isManhwa
    ? {
      ...(rawTtsExport || {}),
      engine: cleanString(rawTtsExport?.engine) || (cleanString(pipelineTts?.tool).toLowerCase() === "elevenlabs" ? "elevenlabs" : ""),
      // Voz del narrador POR SERIE (ej. protagonista femenina): tts_export.voices.narrador o
      // pipeline.tts.voice_id; sin declarar -> voz oficial manhwa. tts_export.voice_id "suelto"
      // sigue ignorado: es el guard anti-voz-accidental del generador de JSON.
      voice_id: cleanString(rawTtsExport?.voices?.narrador) || cleanString(pipelineTts?.voice_id) || MANHWA_DEFAULT_VOICE_ID,
      language: cleanString(rawTtsExport?.language) || cleanString(pipelineTts?.language) || cleanString(rawProject.language),
    }
    : rawTtsExport;

  const project = {
    title,
    slug,
    seriesId: cleanString(rawProject.serie) || cleanString(rawProject.series_id)
      || cleanString(rawProject.series?.id)
      || cleanString(rawJson.series?.id),
    part: Number.isFinite(Number(rawProject.part ?? rawProject.series?.part ?? rawJson.series?.part))
      ? Number(rawProject.part ?? rawProject.series?.part ?? rawJson.series?.part) : null,
    hook,
    // preset: nombre de un "paquete" reutilizable (ej "esqueletos"). Se guarda; su comportamiento
    // (que voz/personajes/estilo aplica) se cableara cuando definas el mapeo de presets.
    preset,
    // image-only (historias / animation.tool none): el SW salta la animacion y manda el still a public/.
    imageOnly,
    // HIBRIDO historias/criptoclaro/habitos: render por escena (algunas "animated" = video, el resto still). false = flujo intacto.
    perSceneRender,
    // velocidad de GENERACION de la voz en Fish (prosody.speed). DEFAULT 1.0 = SIN prosody. OJO: la prosody
    // de Fish (ralentizar a 0.9/0.95) METE WARBLE/"vibroso" — confirmado vs voz a 1.0 limpia. Para una voz
    // mas lenta NO usar prosody; escribir el guion mas pausado. novela-coreana default 1.25; otros 1.0.
    voiceSpeed: Number(rawJson.audio && rawJson.audio.voice_speed) || (preset === "novela-coreana" ? 1.25 : 1),
    aspectRatio: typeof rawProject.aspect_ratio === "string" ? rawProject.aspect_ratio : "",
    language: typeof rawProject.language === "string" ? rawProject.language : "",
    fps: typeof rawProject.fps === "number" ? rawProject.fps : null,
    defaultClipDurationS: typeof rawProject.default_clip_duration_s === "number" ? rawProject.default_clip_duration_s : 4,
    // Reuso de ingredientes entre Partes (series): con true, el driver de Flow intenta adjuntar cada
    // ingrediente por NOMBRE (su id, si lo renombraste en el proyecto para reusarlo) y, si no esta, por su
    // tile generado en este run. Default false -> flujo actual intacto (solo por tile; Huesito sin cambios).
    reuseIngredients: rawProject.reuse_ingredients === true,
    // proveedor de generacion: de pipeline.image_generation.tool ("grok"|"flow"). null = usa el global.
    // El autopiloto (pollQueue) enruta cada JSON al proveedor que declara aqui.
    provider: (() => {
      const t = rawJson.pipeline && rawJson.pipeline.image_generation && rawJson.pipeline.image_generation.tool;
      return t === "grok" || t === "flow" ? t : null;
    })(),
    // Proveedor POR FASE (desacople imagen vs animacion: ej. imagenes en Flow, animar en Grok). null = global.
    // El SW solo los distingue si DIFIEREN (handoff por disco); si son iguales o ausentes -> flujo de un solo
    // proveedor (comportamiento actual). Aditivo: nadie los lee aun hasta cablear el pipeline. Ver [[grok-pause-resume-parallel]].
    imageProvider: (() => {
      const t = rawJson.pipeline && rawJson.pipeline.image_generation && rawJson.pipeline.image_generation.tool;
      return t === "grok" || t === "flow" ? t : null;
    })(),
    animationProvider: (() => {
      const t = rawJson.pipeline && rawJson.pipeline.animation && rawJson.pipeline.animation.tool;
      return providerFromTool(t);
    })(),
    // Mapa de personajes del proyecto (nuevo). En el nuevo esquema las refs van POR ESCENA.
    characters: charactersNorm,
    escenarios: rawJson.escenarios && typeof rawJson.escenarios === "object" && !Array.isArray(rawJson.escenarios) ? rawJson.escenarios : {},
    // Biblioteca de ingredientes generados en sesion (vacia si el JSON no la trae). Fuente unica: este
    // array (el SW busca por id). [{ id, type, base, prompt, outputFile, imageUrl, imageFilePath }]. Ver FASE INGREDIENTES.
    ingredients,
    // Compat VIEJO: nombre unico de personaje (character_bible.name). Lo usa runRealImage si la
    // escena trae el ingrediente character_ref pero no referencias nuevas.
    characterName: bibleName,
    characterRef: null,
    // Bloques para fases futuras (se guardan tal cual, sin tocar).
    ttsExport,
    // schema nuevo historias: render_export renombra capcut_export (mismo shape: clip_order, etc.).
    capcutExport: (typeof rawJson.render_export === "object" && rawJson.render_export) ? rawJson.render_export
      : (typeof rawJson.capcut_export === "object" && rawJson.capcut_export ? rawJson.capcut_export : null),
  };

  return { ok: true, project, scenes, warnings };
}
