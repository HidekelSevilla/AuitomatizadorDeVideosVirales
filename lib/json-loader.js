// lib/json-loader.js
// Valida y normaliza el JSON crudo al modelo interno (SceneState). PURO: no toca chrome.*.
// Solo importa constantes de lib/messaging.js.
//
// Soporta DOS esquemas:
//   - NUEVO ("produccion"): scenes[].visual.{image_prompt,animation_prompt}, references.characters,
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
const INGREDIENT_TYPES = new Set(["character_edited", "entity", "location_plate"]);

// Extrae ids de un array de referencias que acepta strings ("huesito") u objetos ({character_id}/{ingredient_id}).
function refIdsFrom(arr, key) {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => (typeof c === "string" ? c : (c && typeof c[key] === "string" ? c[key] : null))).filter(Boolean);
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

  // scenes debe existir y no estar vacio.
  const rawScenes = rawJson.scenes;
  if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
    return { ok: false, errors: ["'scenes' debe ser un array no vacio."] };
  }

  // Mapa de personajes (esquema nuevo): character_id -> { display_name, reference_asset, ... }.
  const charMap = (rawJson.characters && typeof rawJson.characters === "object" && !Array.isArray(rawJson.characters))
    ? rawJson.characters : {};
  const hasCharMap = Object.keys(charMap).length > 0;
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
  if (Array.isArray(rawJson.ingredients)) {
    const outFiles = new Map();
    rawJson.ingredients.forEach((ing, k) => {
      const w = `ingredients[${k}]`;
      const iid = ing && typeof ing.id === "string" ? ing.id : null;
      const type = ing && typeof ing.type === "string" ? ing.type : null;
      if (!iid) { errors.push(`${w}: falta 'id' (string).`); return; }
      if (ingredientById.has(iid)) { errors.push(`${w}: 'id' duplicado '${iid}'.`); return; }
      if (!type || !INGREDIENT_TYPES.has(type)) {
        errors.push(`${w} (${iid}): 'type' invalido (usa character_edited|entity|location_plate).`); return;
      }
      const outputFile = typeof ing.output_file === "string" && ing.output_file.trim() ? ing.output_file.trim() : null;
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
        if (outFiles.has(outputFile)) warnings.push(`${w} (${iid}): 'output_file' colisiona con '${outFiles.get(outputFile)}'.`);
        else outFiles.set(outputFile, iid);
      }
      // imageUrl/imageFilePath se llenan en la FASE INGREDIENTES (tile de Flow / PNG en disco para Grok).
      const norm = { id: iid, type, base, prompt, outputFile: outputFile || "", imageUrl: null, imageFilePath: null };
      ingredients.push(norm);
      ingredientById.set(iid, norm);
    });
  }
  const hasIngredients = ingredients.length > 0;

  const allIds = rawScenes.map((s) => (s && typeof s.id === "string" ? s.id : null));
  const seenIds = new Set();
  const scenes = [];

  rawScenes.forEach((raw, i) => {
    const where = `scene[${i}]`;
    const id = raw && typeof raw.id === "string" ? raw.id : null;

    if (!id) {
      errors.push(`${where}: falta 'id' (string).`);
    } else if (seenIds.has(id)) {
      errors.push(`${where}: 'id' duplicado '${id}'.`);
    } else {
      seenIds.add(id);
    }

    // --- Prompts: NUEVO (visual.*) con fallback al VIEJO (image./animation.) ---
    const visual = raw && typeof raw.visual === "object" && raw.visual ? raw.visual : null;
    const image = raw && typeof raw.image === "object" && raw.image ? raw.image : {};
    const animation = raw && typeof raw.animation === "object" && raw.animation ? raw.animation : {};

    const imagePrompt = visual && typeof visual.image_prompt === "string" ? visual.image_prompt
      : (typeof image.prompt === "string" ? image.prompt : null);
    const animationPrompt = visual && typeof visual.animation_prompt === "string" ? visual.animation_prompt
      : (typeof animation.prompt === "string" ? animation.prompt : null);

    if (!imagePrompt) errors.push(`${where} (${id ?? "?"}): falta 'visual.image_prompt' (o 'image.prompt').`);
    if (!animationPrompt) errors.push(`${where} (${id ?? "?"}): falta 'visual.animation_prompt' (o 'animation.prompt').`);

    // --- Referencias de PERSONAJE (nuevo: references.characters; fallback: cast) ---
    // Acepta strings ("huesito_green") u objetos ({character_id}). Un id puede ser un personaje base
    // (en 'characters') O un ingrediente character_edited (el base ya "vestido"); el SW resuelve cual.
    const references = raw && typeof raw.references === "object" && raw.references ? raw.references : {};
    let characterRefIds = [];
    if (Array.isArray(references.characters) && references.characters.length) {
      characterRefIds = refIdsFrom(references.characters, "character_id");
    } else if (Array.isArray(raw && raw.cast) && raw.cast.length) {
      characterRefIds = refIdsFrom(raw.cast, "character_id");
    }
    const characterRefs = characterRefIds.map((cid) => {
      const isEdited = ingredientById.get(cid)?.type === "character_edited";
      if (hasCharMap && !charMap[cid] && !isEdited) {
        warnings.push(`${where} (${id ?? "?"}): character_id '${cid}' no esta en 'characters' ni es un ingrediente character_edited.`);
      }
      return charDisplayName(cid);
    });

    // --- Referencias de INGREDIENTE por escena (nuevo: references.ingredients = ids de entity/location_plate) ---
    const ingredientRefs = refIdsFrom(references.ingredients, "ingredient_id");
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
      // NUEVO: referencias explicitas por escena (lo que usa el flujo de Flow).
      characterRefs,            // nombres de Personaje de Flow (display_name) a adjuntar via "+"
      characterRefIds,          // ids originales del JSON (base o character_edited; el SW resuelve cual)
      ingredientRefs,           // NUEVO: ids de entity/location_plate a adjuntar en esta escena
      sceneRefs,                // [{ sceneId, useFor, strength }] -> adjuntar imagen de esa escena via ⋮
      // Metadatos (fases futuras).
      changeLevel: typeof raw.change_level === "string" ? raw.change_level : null,
      locationId: typeof raw.location_id === "string" ? raw.location_id : null,
      clipDurationS: typeof timeline.clip_duration_s === "number" ? timeline.clip_duration_s : defaultDur,
      timeLabel: typeof raw.time_label === "string" ? raw.time_label : null,
      voiceoverText: typeof voiceover.text === "string" ? voiceover.text : "",
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

  const rawProject = typeof rawJson.project === "object" && rawJson.project ? rawJson.project : {};
  const rawBible = typeof rawJson.character_bible === "object" && rawJson.character_bible ? rawJson.character_bible : {};
  const bibleName = typeof rawBible.name === "string" ? rawBible.name : "";

  const title = typeof rawProject.title === "string" ? rawProject.title : "";
  // slug: carpeta de medios en remotion-editor/public/<slug>/. Del JSON (project.slug) o del title.
  const slug = (typeof rawProject.slug === "string" && rawProject.slug.trim())
    ? rawProject.slug.trim() : slugify(title);
  // hook: bloque para generar hook.mp3 (hook.voiceover) y el montaje en Remotion. Se guarda tal cual.
  const hook = typeof rawJson.hook === "object" && rawJson.hook ? rawJson.hook : null;

  const project = {
    title,
    slug,
    hook,
    // preset: nombre de un "paquete" reutilizable (ej "esqueletos"). Se guarda; su comportamiento
    // (que voz/personajes/estilo aplica) se cableara cuando definas el mapeo de presets.
    preset: typeof rawProject.preset === "string" ? rawProject.preset : "",
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
      return t === "grok" || t === "flow" ? t : null;
    })(),
    // Mapa de personajes del proyecto (nuevo). En el nuevo esquema las refs van POR ESCENA.
    characters: charMap,
    // Biblioteca de ingredientes generados en sesion (vacia si el JSON no la trae). Fuente unica: este
    // array (el SW busca por id). [{ id, type, base, prompt, outputFile, imageUrl, imageFilePath }]. Ver FASE INGREDIENTES.
    ingredients,
    // Compat VIEJO: nombre unico de personaje (character_bible.name). Lo usa runRealImage si la
    // escena trae el ingrediente character_ref pero no referencias nuevas.
    characterName: bibleName,
    characterRef: null,
    // Bloques para fases futuras (se guardan tal cual, sin tocar).
    ttsExport: typeof rawJson.tts_export === "object" && rawJson.tts_export ? rawJson.tts_export : null,
    capcutExport: typeof rawJson.capcut_export === "object" && rawJson.capcut_export ? rawJson.capcut_export : null,
  };

  return { ok: true, project, scenes, warnings };
}
