// lib/queue.js
// Planificacion de la cola: resuelve ingredientes y arma el plan de acciones por escena.
// PURO: no toca chrome.*. Solo importa constantes de lib/messaging.js.

import { INGREDIENT, SCENE_STATUS } from "./messaging.js";

// Resuelve los tokens de ingredientes de UNA escena a nombres concretos.
// -> { refs: string[], missing: string[] }
//   character_ref -> characterRefName (o a missing[] si null)
//   prev_frame    -> `${prevSceneId}_lastframe.png` (se OMITE sin error si prevSceneId == null)
export function resolveIngredients(scene, prevSceneId, characterRefName) {
  const refs = [];
  const missing = [];
  const tokens = Array.isArray(scene.imageIngredients) ? scene.imageIngredients : [];

  for (const tok of tokens) {
    if (tok === INGREDIENT.CHARACTER_REF) {
      if (characterRefName) refs.push(characterRefName);
      else missing.push(INGREDIENT.CHARACTER_REF);
    } else if (tok === INGREDIENT.PREV_FRAME) {
      // En la 1a escena no hay frame previo: se omite silenciosamente.
      if (prevSceneId != null) refs.push(`${prevSceneId}_lastframe.png`);
    }
    // Tokens desconocidos se ignoran aqui (json-loader ya advirtio).
  }

  // NUEVO esquema: referencias explicitas por escena (vacias en el esquema viejo -> no-op).
  for (const name of (Array.isArray(scene.characterRefs) ? scene.characterRefs : [])) refs.push(name);
  for (const sr of (Array.isArray(scene.sceneRefs) ? scene.sceneRefs : [])) refs.push(`${sr.sceneId} (escena)`);

  return { refs, missing };
}

// Plan ordenado de acciones de UNA escena.
// -> Step[] donde Step = { action, label, detail }
export function planScene(scene, prevSceneId, characterRefName) {
  const { refs, missing } = resolveIngredients(scene, prevSceneId, characterRefName);
  const clipFilename = `${scene.id}.mp4`;
  const lastFrameFilename = `${scene.id}_lastframe.png`;

  return [
    {
      action: "resolve_ingredients",
      label: "Resolver ingredientes",
      detail: { refs, missing },
    },
    {
      action: "generate_image",
      label: "Generar imagen (Nano Banana)",
      detail: { prompt: scene.imagePrompt, model: scene.imageModel, references: refs },
    },
    {
      action: "animate",
      label: "Animar (Veo)",
      detail: { prompt: scene.animationPrompt, model: scene.animationModel },
    },
    {
      action: "download",
      label: "Descargar clip",
      detail: { clipFilename },
    },
    {
      action: "extract_frame",
      label: "Extraer ultimo frame",
      detail: { lastFrameFilename },
    },
  ];
}

// Plan completo del proyecto: encadena prev_frame escena a escena.
// -> [{ sceneId, steps: Step[] }]  (escena 0 sin prev_frame; escena i usa scenes[i-1].id)
export function dryRunPlan(scenes, characterRefName) {
  const list = Array.isArray(scenes) ? scenes : [];
  return list.map((scene, i) => {
    const prevSceneId = i > 0 ? list[i - 1].id : null;
    return { sceneId: scene.id, steps: planScene(scene, prevSceneId, characterRefName) };
  });
}

// Maquina de estados de la escena como FUENTE DE VERDAD pura y testeable. Hoy las transiciones viven
// dispersas y a mano en runRealAnimation/runParallelAnimation/onRetryScene/resumeIfInterrupted (el SW),
// donde un estado mal puesto re-gasta puntos o cuelga la cola. Esto las documenta en un solo lugar.
// NO es una FSM estricta que rechace (el orquestador es unico); devuelve el estado resultante de un
// evento, o el MISMO estado si el evento no aplica (para poder validar/loguear divergencias).
// Eventos: start_image, image_ready, start_anim, video_ready, downloaded, framed, fail,
//          retry_image, retry_anim, retry_download, reset.
const SCENE_TRANSITIONS = {
  [SCENE_STATUS.PENDING]:           { start_image: SCENE_STATUS.GENERATING_IMAGE },
  [SCENE_STATUS.GENERATING_IMAGE]:  { image_ready: SCENE_STATUS.IMAGE_DONE, fail: SCENE_STATUS.ERROR },
  [SCENE_STATUS.IMAGE_DONE]:        { start_anim: SCENE_STATUS.ANIMATING, fail: SCENE_STATUS.ERROR },
  [SCENE_STATUS.ANIMATING]:         { video_ready: SCENE_STATUS.DOWNLOADING, fail: SCENE_STATUS.ERROR },
  [SCENE_STATUS.DOWNLOADING]:       { downloaded: SCENE_STATUS.EXTRACTING_FRAME, fail: SCENE_STATUS.ERROR },
  [SCENE_STATUS.EXTRACTING_FRAME]:  { framed: SCENE_STATUS.DONE, fail: SCENE_STATUS.ERROR },
  [SCENE_STATUS.DONE]:              {},
  [SCENE_STATUS.ERROR]:             {},
};
// Eventos de reintento/reset validos desde CUALQUIER estado (no dependen del actual).
const ANY_STATE_EVENTS = {
  reset: SCENE_STATUS.PENDING,           // regenerar todo desde cero (gratis)
  retry_image: SCENE_STATUS.PENDING,     // regenerar imagen (gratis)
  retry_anim: SCENE_STATUS.IMAGE_DONE,   // re-animar con la imagen ya generada (cuesta puntos)
  retry_download: SCENE_STATUS.ANIMATING,// solo recoger+descargar el video que ya existe (no re-anima)
};
export function sceneTransition(status, event) {
  if (event in ANY_STATE_EVENTS) return ANY_STATE_EVENTS[event];
  const next = SCENE_TRANSITIONS[status];
  return next && event in next ? next[event] : status; // evento no aplicable -> sin cambio
}

// Avanza el indice de la cola saltando escenas DONE.
// Devuelve el indice de la siguiente escena ejecutable desde fromIndex, o -1.
export function nextSceneIndex(scenes, fromIndex) {
  const list = Array.isArray(scenes) ? scenes : [];
  const start = Math.max(0, fromIndex | 0);
  for (let i = start; i < list.length; i++) {
    if (list[i].status !== SCENE_STATUS.DONE) return i;
  }
  return -1;
}

// Siguiente escena cuyo status === targetStatus (para fases). -1 si no hay.
export function nextSceneIndexByStatus(scenes, fromIndex, targetStatus) {
  const list = Array.isArray(scenes) ? scenes : [];
  const start = Math.max(0, fromIndex | 0);
  for (let i = start; i < list.length; i++) {
    if (list[i].status === targetStatus) return i;
  }
  return -1;
}
