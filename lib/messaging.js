// lib/messaging.js
// Contrato compartido de mensajeria y estado entre side panel <-> background <-> content/offscreen.
// ES module. Importado por background/service-worker.js, sidepanel/panel.js, offscreen/frame-extractor.js.
// Los content scripts (no-module) replican estas mismas STRINGS literalmente; los valores aqui son la fuente de verdad.

// ---------------------------------------------------------------------------
// Tipos de mensaje
// ---------------------------------------------------------------------------

// Panel -> Background (comandos de usuario)
export const CMD = Object.freeze({
  LOAD_JSON: "cmd:load_json",            // { json: object }  -> valida y carga proyecto
  LOAD_CHARACTER_REF: "cmd:load_char",   // { name, dataUrl } -> registra imagen de personaje
  SET_CONFIG: "cmd:set_config",          // { config: Partial<Config> }
  START: "cmd:start",                    // reanuda la fase actual de la cola
  START_IMAGES: "cmd:start_images",      // FASE 1: genera todas las imagenes (Nano Banana, gratis)
  START_ANIMATION: "cmd:start_animation",// FASE 2: anima todas las imagenes listas (Veo, cuesta puntos)
  PAUSE: "cmd:pause",
  RESUME: "cmd:resume",
  STOP: "cmd:stop",
  RETRY_SCENE: "cmd:retry_scene",        // { sceneId, mode?: "image"|"anim"|"download" } (default "image")
  RETRY_ALL_ERRORS: "cmd:retry_all_errors", // re-encola TODAS las escenas en ERROR (imagen->PENDING, anim->IMAGE_DONE). Confirmacion de costo en el panel.
  SKIP_SCENE: "cmd:skip_scene",          // { sceneId } marca la escena en error como saltada y reanuda el resto
  RESET_SCENES: "cmd:reset_scenes",      // reinicia TODAS las escenas a PENDING (para regenerar)
  CLEAR_ALL: "cmd:clear_all",            // borra TODO el estado (proyecto, escenas, personaje, config) -> estado inicial
  GET_STATE: "cmd:get_state",            // -> responde STATE_UPDATE
  GET_LOG: "cmd:get_log",                // -> responde el ring-buffer de logs persistido (historial al abrir el panel)
  TOGGLE_INSPECTOR: "cmd:toggle_inspector", // { enabled: boolean }
  GENERATE_AUDIO: "cmd:generate_audio",  // { limit?: number, includeHook?: boolean } -> Fish Audio TTS por escena
  RUN_ALL: "cmd:run_all",                // AUTOPILOTO: proyecto+personajes en Flow -> imagenes -> animacion -> audio, encadenado
});

// Background -> Panel (eventos hacia la UI)
export const EVT = Object.freeze({
  STATE_UPDATE: "evt:state_update",      // { state: AppState }  (snapshot completo)
  SCENE_STATUS: "evt:scene_status",      // { sceneId, status, error? }
  PROGRESS: "evt:progress",              // { done, total, currentSceneId }
  LOG: "evt:log",                        // { level, ts, message }
  HARD_STOP: "evt:hard_stop",            // { reason: "captcha" | "no_credits" | "rate_limit", message }
  PAUSED_BY_ERROR: "evt:paused_by_error",// { sceneId, error } pausa blanda por fallo recuperable (hero de recuperacion en el panel)
  INSPECTOR_RESULT: "evt:inspector_result", // { candidates: [...] }
});

// Background -> Content (acciones sobre el DOM de Flow). Stub en esta fase (dry-run no lo usa).
export const ACT = Object.freeze({
  PING: "act:ping",
  INSPECT_DOM: "act:inspect_dom",        // { } -> INSPECTOR_RESULT
  NEW_PROJECT: "act:new_project",        // { title } -> crea proyecto nuevo en Flow (pendiente de mapear en vivo)
  CREATE_CHARACTER: "act:create_character", // { name, fileInputReady } -> sube img + crea Personaje (CDP + UI, mapear en vivo)
  HAS_CHARACTER: "act:has_character",     // { name } -> { exists } ¿ya existe ese Personaje en el proyecto?
  REVEAL_UPLOAD_INPUT: "act:reveal_upload_input", // abre el dialogo de subida y deja el input[type=file] listo (para CDP)
  CLEANUP_MEDIA: "act:cleanup_media",     // borra imagenes generadas + videos del proyecto (NO personajes) -> papelera
  GENERATE_IMAGE: "act:generate_image",  // { prompt, characterNames:[], sceneRefImageUrls:[], aspectRatio, count }
  ANIMATE: "act:animate",                // { prompt, model, aspectRatio }  (secuencial: dispara Y espera)
  ANIMATE_FIRE: "act:animate_fire",      // dispara la animacion y vuelve YA (sin esperar nada)
  VIDEO_SRCS: "act:video_srcs",          // -> {srcs:[...]} snapshot de videos/posters actuales (antes de disparar)
  MAP_NEW_VIDEOS: "act:map_new_videos",  // {before, total} espera a que aparezcan los nuevos -> {srcs:[...] en orden DOM}
  RETRY_FAILED_TILES: "act:retry_failed_tiles", // clica el "Reintentar" de Flow en tiles con error ("actividad inusual"/media) -> {clicked, remaining}
  CLEAR_REFS: "act:clear_refs",          // (Grok) quita las referencias adjuntas del compositor (botones "Remove image")
  ANIMATE_COLLECT: "act:animate_collect",// { videoUrl } espera a que ESE video termine -> {videoUrl, lastFrameDataUrl}
  DOWNLOAD_CLIP: "act:download_clip",    // { resolution }
});

// Content -> Background (resultados / alertas)
export const RES = Object.freeze({
  ACTION_RESULT: "res:action_result",    // { ok, action, data?, error? }
  CAPTCHA_DETECTED: "res:captcha",
  NO_CREDITS: "res:no_credits",
  RATE_LIMIT: "res:rate_limit",          // "actividad inusual"/anti-abuso por ritmo: cooldown creciente, NO es falta de creditos
});

// ---------------------------------------------------------------------------
// Enums de estado de escena
// ---------------------------------------------------------------------------

export const SCENE_STATUS = Object.freeze({
  PENDING: "pending",                 // sin imagen aun
  GENERATING_IMAGE: "generating_image",
  IMAGE_DONE: "image_done",           // imagen lista; pendiente de animar (fase 2)
  ANIMATING: "animating",
  DOWNLOADING: "downloading",
  EXTRACTING_FRAME: "extracting_frame",
  DONE: "done",                       // clip + lastframe listos
  ERROR: "error",
});

export const LOG_LEVEL = Object.freeze({
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  DEBUG: "debug",
});

// ---------------------------------------------------------------------------
// Tokens de ingredientes (image.ingredients en el JSON)
// ---------------------------------------------------------------------------

export const INGREDIENT = Object.freeze({
  CHARACTER_REF: "character_ref",  // -> character_bible.reference_asset (imagen del usuario)
  PREV_FRAME: "prev_frame",        // -> {scene_anterior}_lastframe.png (no existe en la 1a escena)
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const STORAGE_KEY = "flow_auto_state_v1";

// Modelos de video disponibles en Flow (texto EXACTO del dropdown, confirmado 2026-06-14).
// El driver elige el modelo buscando este texto en el menu. Costos aprox a 1x (varia):
//   Omni Flash ~ ? · Veo 3.1 - Lite ~10 · Veo 3.1 - Fast ~20 · Veo 3.1 - Quality ~mas.
// pts = costo aprox por escena (estimado para la UI; el costo REAL lo lee el driver de Flow antes
// de generar). Omni varia por duracion (4s=7, 8s=12, confirmado 2026-06-14) -> ver perSceneCost en panel.
export const VIDEO_MODELS = Object.freeze([
  { id: "omni",    flowText: "Omni Flash",        label: "Omni Flash",      hint: "con audio · permite 4s", pts: 7 },
  { id: "lite",    flowText: "Veo 3.1 - Lite",    label: "Veo 3.1 Lite",    hint: "barato",                 pts: 10 },
  { id: "fast",    flowText: "Veo 3.1 - Fast",    label: "Veo 3.1 Fast",    hint: "equilibrado",            pts: 20 },
  { id: "quality", flowText: "Veo 3.1 - Quality", label: "Veo 3.1 Quality", hint: "máxima calidad",         pts: null },
]);

// Duracion del clip (texto EXACTO de los tabs flow_tab_slider_trigger de Flow). Solo aplica a
// modelos que la soportan (p.ej. Omni Flash); Veo usa duracion fija (~8s) y el driver la ignora.
export const VIDEO_DURATIONS = Object.freeze(["4s", "6s", "8s", "10s"]);

// Presets reutilizables: project.preset -> voz de Fish por defecto (reference_id + modelo).
// Prioridad al generar audio: config.fishVoiceId (si lo pegas) > preset > DEFAULT_VOICE_ID.
// NUNCA cae en la voz generica de Fish: si el JSON olvida "preset", igual usa la voz default.
// Para agregar/editar un preset, pon aqui el reference_id (el id en fish.audio/m/<id>).
export const FISH_PRESETS = Object.freeze({
  // Voz nueva como UNICA default (el usuario la prefirio sobre la anterior 53042fcee6b84e138e72db017d9e50a6).
  esqueletos: { voiceId: "5e95c590cfcb46ab927a9ec7b35a88c7", model: "s2-pro" },
});

// Voz default GARANTIZADA: ultimo fallback cuando no hay config ni preset. Nunca vacio.
export const DEFAULT_VOICE_ID = "5e95c590cfcb46ab927a9ec7b35a88c7";
export const DEFAULT_VOICE_MODEL = "s2-pro";

// Elige UNA voz del preset. Con varias (voiceIds) -> aleatorio uniforme (~50/50 si son dos). El SW lo
// llama UNA sola vez por video, asi que TODAS las escenas+hook de ese video quedan con la MISMA voz.
// Compat: si el preset solo trae voiceId (string), devuelve esa.
export function pickPresetVoiceId(presetCfg) {
  if (!presetCfg) return "";
  const ids = Array.isArray(presetCfg.voiceIds) && presetCfg.voiceIds.length
    ? presetCfg.voiceIds
    : (presetCfg.voiceId ? [presetCfg.voiceId] : []);
  return ids.length ? ids[Math.floor(Math.random() * ids.length)] : "";
}

export const DEFAULT_CONFIG = Object.freeze({
  downloadResolution: "720p",   // resolucion de descarga del clip en Flow
  delayMinMs: 1500,             // delay variable minimo entre micro-acciones
  delayMaxMs: 4000,             // delay variable maximo entre micro-acciones
  concurrency: 1,               // 1-2 escenas a la vez
  maxRetries: 3,                // reintentos con backoff por escena
  // --- RITMO HUMANO / ANTI-DETECCION (Flow Y Grok). Lo lento es intencional: evita el flag "actividad
  //     inusual". Todo configurable; estos contadores se persisten en state.pacing (el SW MV3 se duerme). ---
  humanTyping: true,            // tipea el prompt por fragmentos con jitter (no de golpe = firma de bot)
  reviewPauseMinMs: 1200,       // "pausa de revision" aleatoria antes de pulsar Generar/Enviar
  reviewPauseMaxMs: 3500,
  interSceneDelayMinMs: 10000,  // espera entre escenas (tras completar una, antes de la siguiente)
  interSceneDelayMaxMs: 25000,
  warmupCount: 2,               // las primeras N escenas de la sesion esperan +50% (arranque suave)
  longBreakEvery: 25,           // cada N generaciones, un descanso CORTO (pedido del usuario: poco frecuente)
  longBreakMinMs: 20000,
  longBreakMaxMs: 30000,
  maxGenerationsPerHour: 50,    // tope por ventana de 60 min; al alcanzarlo, pausa hasta que se libere
  rateLimitCooldownMinMs: 300000, // cooldown base al detectar rate-limit (crece 1x/3x/9x: 5/15/45 min)
  generationCount: 1,           // variaciones por generacion en Flow (1x). Video 1x = 20 puntos, x2 = 40.
  videoModel: "Omni Flash",     // modelo de video por defecto (texto exacto del dropdown); ver VIDEO_MODELS
  videoDuration: "4s",          // duracion por defecto (tab de Flow). Solo modelos que la soportan (Omni).
  // SECUENCIAL por defecto (2026-06-16): dispara y ESPERA cada video uno por uno. Mas lento, pero
  // evita el "actividad inusual" (rate-limit por rafaga) Y el mis-mapeo video<->escena (no hay mapeo
  // por orden: cada clip se recoge justo tras su disparo). true = paralelo (rapido, con auto-retry+pausa).
  parallelAnimation: false,
  flowRetryRounds: 3,           // si Flow marca tiles con error ("actividad inusual"), cuantas rondas de "Reintentar" propio intenta antes de rendirse.
  pauseOnFailure: true,         // si una escena agota reintentos (o faltan videos tras flowRetryRounds), PAUSA la cola (no jala mas trabajos) para que revises Flow y reanudes.
  dryRun: false,                // true = simula y loguea, no toca Flow. Por defecto OFF (corridas reales).
  flowUrl: "https://labs.google/fx/tools/flow", // confirmar contra el sitio real
  // Fish Audio (TTS). El service worker llama api.fish.audio directo (no scraping). La API key la
  // pega el usuario; se guarda local en chrome.storage. La voz es el reference_id (id de modelo Fish).
  fishApiKey: "",               // Bearer token de api.fish.audio (se carga de secrets.local.json via dev-server)
  fishVoiceId: "",              // reference_id de la voz (id de modelo; vacio = voz por defecto de Fish)
  fishModel: "s2-pro",          // modelo TTS de Fish: "s1" o "s2-pro" (siempre S2 Pro por defecto)
  // Puente local para escribir el mp3 EXACTAMENTE en remotion-editor/public/<slug>/voice/.
  // Es el dev-server (npm run dev). Si no corre, se cae a chrome.downloads (carpeta Descargas).
  audioWriterUrl: "http://localhost:35729/save",
  // Autopiloto: el dev-server vigila la cola y sirve secretos/personajes; el SW los consulta.
  secretsUrl: "http://localhost:35729/secrets",   // GET -> { fishApiKey, ... } desde secrets.local.json
  queueUrl: "http://localhost:35729/queue",       // GET -> [{ name, slug, json, mediaComplete }] de remotion-editor/queue
  charFileUrl: "http://localhost:35729/charfile", // GET ?id=<char> -> ruta ABSOLUTA del png en assets/characters (para subirlo a Flow via CDP)
  autoQueue: false,             // true = el SW saca trabajos de la cola y corre todo solo (activar tras mapear Flow en vivo)
  autoQueuePollMs: 12000,       // cada cuanto consulta la cola
  // Flow: "reuse" = usa el proyecto ABIERTO (con personajes pre-creados; NO crea proyecto/personaje,
  // que Flow no deja subir por codigo de forma fiable). "new" = crea proyecto + sube personajes (futuro).
  flowReuseProject: true,
  // Tras descargar TODOS los clips del video, borra los medios generados del proyecto Flow (papelera)
  // para no saturarlo. SALVAGUARDA: si NO se descargaron todos, NO borra nada.
  cleanupFlowAfterDownload: true,
  // Proveedor de generacion/animacion: "flow" (Google Flow, default) o "grok" (Grok Imagine).
  // Grok: el SW sube referencias por CDP (Grok SI acepta archivos por codigo), genera imagen (modo
  // Imagen) y anima (modo Video) en grok.com; usa el grok-driver. Ver [[grok-future-animation]].
  provider: "flow",
  grokUrl: "https://grok.com/imagine",
  // PIPELINE PARALELO (opt-in, default OFF = comportamiento actual INTACTO). Cuando ON, un carril genera
  // imagenes en un proveedor mientras OTRO carril anima en el otro, a la vez (carriles por fase). El
  // proveedor de cada fase sale del JSON (pipeline.image_generation.tool / pipeline.animation.tool).
  // Ver el plan en [[grok-pause-resume-parallel]]. Mientras este OFF, el SW ignora todo esto.
  parallelPipeline: false,
});

// Forma del estado persistido en chrome.storage.local[STORAGE_KEY]:
//
// AppState = {
//   project: {
//     title: string,
//     aspectRatio: string,                 // project.aspect_ratio
//     characterRef: { name, dataUrl } | null,
//   } | null,
//   scenes: SceneState[],
//   config: Config,
//   queue: { running: boolean, paused: boolean, currentIndex: number },
//   inspector: boolean,
// }
//
// SceneState = {
//   id: string,
//   imagePrompt: string,                   // visual.image_prompt (o image.prompt viejo)
//   animationPrompt: string,               // visual.animation_prompt (o animation.prompt viejo)
//   characterRefs: string[],               // NUEVO: nombres de Personaje de Flow a adjuntar (display_name)
//   characterRefIds: string[],             // ids originales del JSON
//   sceneRefs: [{ sceneId, useFor, strength }],  // NUEVO: imagenes de escenas previas a adjuntar
//   changeLevel, locationId, clipDurationS, timeLabel,
//   voiceoverText, captionsText, editNotes,      // para fases futuras (Fish Audio / CapCut)
//   imageIngredients: string[], imageModel, animationModel, continuityFrom,  // compat esquema viejo
//   status: SCENE_STATUS,
//   attempts: number,
//   error: string | null,
//   imageUrl: string | null,               // src de la imagen generada (fase 1)
//   videoUrl: string | null,               // src del video disparado (fase 2 paralela)
//   clipFilename: string | null,           // "{id}.mp4"
//   lastFrameFilename: string | null,      // "{id}_lastframe.png"
// }

export function makeInitialState() {
  return {
    project: null,
    scenes: [],
    config: { ...DEFAULT_CONFIG },
    queue: { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0 },
    // Carriles del PIPELINE PARALELO (flag config.parallelPipeline): un carril por fase, cada uno con su
    // running/heartbeat. Vacios mientras el flag este OFF (no se usan). Ver [[grok-pause-resume-parallel]].
    lanes: { images: { running: false, heartbeatAt: 0 }, animation: { running: false, heartbeatAt: 0 } },
    // Contadores de ritmo (anti-deteccion), persistidos porque el SW MV3 se duerme entre acciones.
    pacing: { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0 },
    // Metricas acumuladas de produccion (throughput): generaciones OK, errores, ms perdidos en cooldown.
    metrics: { generations: 0, errors: 0, cooldownMs: 0, since: 0 },
    inspector: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers de mensajeria
// ---------------------------------------------------------------------------

// Envia un mensaje y resuelve con la respuesta (o null si no hay listener).
export function send(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        // Silencia "Receiving end does not exist" cuando el panel esta cerrado.
        void chrome.runtime.lastError;
        resolve(resp ?? null);
      });
    } catch (_e) {
      resolve(null);
    }
  });
}

// Construye un mensaje { type, ...payload }.
export function msg(type, payload = {}) {
  return { type, ...payload };
}

// Delay aleatorio dentro de [minMs, maxMs]. Usa el indice para variar de forma
// determinista cuando no hay Math.random disponible (p.ej. en tests).
export function jitterDelay(minMs, maxMs, seed = 0) {
  const span = Math.max(0, maxMs - minMs);
  const r = typeof globalThis.crypto?.getRandomValues === "function"
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff
    : ((seed * 2654435761) % 1000) / 1000;
  return Math.round(minMs + r * span);
}
