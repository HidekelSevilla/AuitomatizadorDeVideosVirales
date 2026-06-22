// background/service-worker.js
// Orquestador (MODULO D). ES module. Es la unica fuente de verdad del AppState.
// Coordina panel <-> cola de escenas <-> (futuro) content script de Flow + offscreen.
//
// MV3: el service worker puede dormirse/reiniciarse en cualquier momento. Por eso:
//  - El AppState vive en chrome.storage.local[STORAGE_KEY], NO en memoria volatil.
//  - Rehidratamos al arrancar y persistimos en cada cambio.
//  - No confiamos en timers vivos: una guarda "running" persistida es la verdad,
//    y el bucle relee el state antes de cada paso.

import {
  CMD, EVT, ACT, RES,
  SCENE_STATUS, LOG_LEVEL,
  STORAGE_KEY, DEFAULT_CONFIG, FISH_PRESETS, pickPresetVoiceId, DEFAULT_VOICE_ID,
  makeInitialState, msg, jitterDelay,
} from "../lib/messaging.js";

import { parseProject } from "../lib/json-loader.js";
import { createOrchestrator } from "../lib/orchestrator.js";
import { planScene, nextSceneIndex, nextSceneIndexByStatus } from "../lib/queue.js";

// Auto-reload de desarrollo: inerte en produccion (Web Store inyecta `update_url`
// en el manifest en runtime; las extensiones descomprimidas no lo tienen).
if (!("update_url" in chrome.runtime.getManifest())) {
  import("../dev/reload-client.js").then((m) => m.startDevReload()).catch(() => {});
}

// ---------------------------------------------------------------------------
// Estado en memoria (cache del storage). La verdad persistida manda.
// ---------------------------------------------------------------------------

let state = null;          // cache de AppState; se rehidrata bajo demanda
let loopRunning = false;   // guarda anti-reentrada del bucle de ESCENAS en este worker vivo
let autopilotBusy = false; // guarda anti-reentrada de la CORRIDA COMPLETA (onRunAll: ingredientes + fases)

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

// Lee el AppState desde storage (o crea uno inicial). Mantiene la cache `state`.
async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  state = data[STORAGE_KEY] ?? makeInitialState();
  // Migracion: fusiona claves nuevas de DEFAULT_CONFIG (p.ej. videoModel, videoDuration) sin pisar
  // lo que el usuario ya configuro (sus valores guardados ganan).
  state.config = { ...DEFAULT_CONFIG, ...(state.config || {}) };
  // El default ANTERIOR era "Veo 3.1 - Fast" (elegido por mi, no por el usuario). Ahora el default
  // es Omni; migramos ese valor concreto para que el default real sea Omni (el usuario puede
  // cambiarlo en la UI cuando quiera).
  if (state.config.videoModel === "Veo 3.1 - Fast") state.config.videoModel = DEFAULT_CONFIG.videoModel;
  // HARDCODE (pedido del usuario 2026-06-18): estos valores NO se configuran desde el panel; se fuerzan
  // SIEMPRE (pisan lo guardado) para que el comportamiento sea estable. tope/hora alto (50), descanso CORTO
  // y POCO frecuente (~20-30s cada 25 generaciones), y el prompt siempre se PEGA (no se tipea). Si en el
  // futuro quieres reabrir esto a config, quita estas lineas y vuelve a exponer los inputs en el panel.
  state.config.maxGenerationsPerHour = 50;
  state.config.longBreakEvery = 25;
  state.config.longBreakMinMs = 20000;
  state.config.longBreakMaxMs = 30000;
  state.config.humanTyping = false;   // siempre pegar (los drivers ya pegan en fragmentos rapidos)
  // Migracion: campos nuevos de queue/pacing sin pisar lo guardado.
  state.queue = { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0, ...(state.queue || {}) };
  // Carriles: al (re)cargar el SW NINGUN carril corre todavia -> running forzado a false (evita carriles
  // "vivos" fantasma tras morir el SW; el heartbeat previo se conserva solo como referencia).
  {
    const _pl = state.lanes || {};
    state.lanes = {
      images: { running: false, heartbeatAt: _pl.images?.heartbeatAt || 0 },
      animation: { running: false, heartbeatAt: _pl.animation?.heartbeatAt || 0 },
    };
  }
  state.pacing = { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0, ...(state.pacing || {}) };
  state.metrics = { generations: 0, errors: 0, cooldownMs: 0, since: Date.now(), ...(state.metrics || {}) };
  // Rehidrata el ring de logs (clave separada) para que el historial sobreviva al sueno del SW.
  try { const lr = await chrome.storage.local.get(LOG_RING_KEY); if (Array.isArray(lr[LOG_RING_KEY])) logRing = lr[LOG_RING_KEY]; } catch (_e) { /* noop */ }
  // Defensa: si la cola quedo marcada running por un crash, no la creamos viva sola;
  // el panel debe re-emitir START. Pero conservamos el flag para diagnostico.
  return state;
}

// Garantiza que `state` este cargado (tras un reinicio del SW la cache es null).
async function ensureState() {
  if (!state) await loadState();
  return state;
}

// Persiste la cache actual en storage.
async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

// Carga la API key de Fish (y lo que haya) desde secrets.local.json via el dev-server.
// El archivo manda: si trae una key real, pisa la de config (asi no la pegas en el panel).
async function applySecrets() {
  await ensureState();
  try {
    const url = state.config.secretsUrl || DEFAULT_CONFIG.secretsUrl;
    const s = await fetch(url).then((r) => r.json());
    let changed = false;
    const key = (s?.fishApiKey || "").trim();
    if (key && !/^PEGA_AQUI/i.test(key) && key !== state.config.fishApiKey) {
      state.config.fishApiKey = key; changed = true;
    }
    if (typeof s?.fishVoiceId === "string" && s.fishVoiceId.trim() && s.fishVoiceId.trim() !== state.config.fishVoiceId) {
      state.config.fishVoiceId = s.fishVoiceId.trim(); changed = true;
    }
    if (changed) { await saveState(); log(LOG_LEVEL.INFO, "Secretos cargados desde secrets.local.json."); }
  } catch (_e) { /* dev-server no corre o sin archivo: se usa lo que haya en config */ }
}

// ---------------------------------------------------------------------------
// Helpers de emision hacia el panel (best-effort; el panel puede estar cerrado)
// ---------------------------------------------------------------------------

function emit(type, payload) {
  // No esperamos respuesta del panel; silenciamos lastError si no hay listener.
  try {
    chrome.runtime.sendMessage(msg(type, payload), () => void chrome.runtime.lastError);
  } catch (_e) {
    // panel cerrado u otro: ignorar
  }
}

function emitState() {
  emit(EVT.STATE_UPDATE, { state });
}

// Ring-buffer de logs persistido en clave PROPIA (no en AppState, que se reescribe decenas de veces).
// emit() es best-effort: si el panel esta cerrado (corridas desatendidas) el log se perdia. Ahora
// queda en disco y el panel lo rehidrata al abrir. Capacidad acotada.
const LOG_RING_KEY = "flow_log_ring_v1";
const LOG_RING_MAX = 400;
let logRing = [];
let logSaveTimer = null;
function scheduleLogSave() {
  if (logSaveTimer) return;
  logSaveTimer = setTimeout(() => {
    logSaveTimer = null;
    chrome.storage.local.set({ [LOG_RING_KEY]: logRing }).catch(() => {});
  }, 2000);
}
function log(level, message) {
  const entry = { level, ts: Date.now(), message };
  emit(EVT.LOG, entry);
  logRing.push(entry);
  if (logRing.length > LOG_RING_MAX) logRing.splice(0, logRing.length - LOG_RING_MAX);
  scheduleLogSave();
}

function emitSceneStatus(sceneId, status, error) {
  emit(EVT.SCENE_STATUS, { sceneId, status, error: error ?? null });
}

function emitProgress() {
  const total = state.scenes.length;
  const done = state.scenes.filter((s) => s.status === SCENE_STATUS.DONE).length;
  const current = state.scenes[state.queue.currentIndex];
  emit(EVT.PROGRESS, { done, total, currentSceneId: current ? current.id : null });
}

// Pequeno sleep usando el delay variable del contrato.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Apertura del side panel
// ---------------------------------------------------------------------------

// Comportamiento: al clickear el icono se abre el panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.warn("setPanelBehavior:", e));

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    // En algunos builds open() requiere windowId; fallback.
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (e2) {
      console.warn("sidePanel.open:", e, e2);
    }
  }
});

// ---------------------------------------------------------------------------
// Ciclo de vida del SW: rehidratar al instalar/arrancar
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => { loadState().then(resumeIfInterrupted); });
chrome.runtime.onStartup.addListener(() => { loadState().then(resumeIfInterrupted); });

// Si el SW murio a media corrida (esperas de hasta ~6 min), state.queue.running quedo true pero el
// bucle no existe -> la cola se cuelga en silencio y pollQueue se auto-bloquea. Al rehidratar,
// re-encolamos las escenas a medias SIN re-gasto y relanzamos el bucle.
async function resumeIfInterrupted() {
  await ensureState();
  if (loopRunning || !state.queue.running || state.queue.paused) return;
  for (const s of state.scenes) {
    if (s.status === SCENE_STATUS.GENERATING_IMAGE) s.status = SCENE_STATUS.PENDING;                       // imagen: regen gratis
    else if ((s.status === SCENE_STATUS.DOWNLOADING || s.status === SCENE_STATUS.EXTRACTING_FRAME) && s.videoUrl) s.status = SCENE_STATUS.ANIMATING; // re-recoge (no re-anima)
    else if (s.status === SCENE_STATUS.ANIMATING && !s.videoUrl) { s.status = SCENE_STATUS.ERROR; s.error = "interrumpido durante la animacion; revisa Flow y dale Re-descargar/Reanimar (puede ya estar el video)."; } // evita re-gasto silencioso
  }
  await saveState();
  log(LOG_LEVEL.INFO, "Reanudando corrida tras reinicio del service worker.");
  emitState();
  // Si la corrida era PARALELA (murio el SW durante la espera de Grok), reanuda en paralelo (idempotente
  // por status, no re-gasta) en vez del bucle secuencial; si no, el bucle unico de siempre.
  if (state.queue.mode === "parallel" && state.config.parallelPipeline) runPhasesParallel().catch((e) => log(LOG_LEVEL.ERROR, `Reanudacion paralela fallo: ${e?.message ?? e}`));
  else launchLoop();
}

// ---------------------------------------------------------------------------
// Router de mensajes (CMD.* del panel; RES.* del content)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  // Click TRUSTED (lo pide el content script para el boton Generar de Flow).
  if (type === "trusted_click") {
    trustedClick(_sender?.tab?.id, message.x, message.y)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  // GET_STATE necesita respuesta sincrona -> retornamos true y respondemos async.
  if (type === CMD.GET_STATE) {
    ensureState().then(() => sendResponse(state));
    return true;
  }

  // GET_LOG: el panel pide el historial de logs persistido (lo replica al abrir).
  if (type === CMD.GET_LOG) {
    ensureState().then(() => sendResponse(logRing));
    return true;
  }

  // El resto: procesa y RESPONDE con el AppState resultante, para que el panel
  // pueda renderizar de la respuesta directa (no solo del broadcast EVT.STATE_UPDATE).
  handleMessage(message)
    .then(() => { try { sendResponse(state); } catch (_e) {} })
    .catch((e) => {
      console.error("handleMessage error:", e);
      log(LOG_LEVEL.ERROR, `Error interno: ${e?.message ?? e}`);
      try { sendResponse(state); } catch (_e) {}
    });
  return true;
});

async function handleMessage(message) {
  await ensureState();
  const { type } = message;

  switch (type) {
    case CMD.LOAD_JSON:
      return onLoadJson(message);
    case CMD.LOAD_CHARACTER_REF:
      return onLoadCharacterRef(message);
    case CMD.SET_CONFIG:
      return onSetConfig(message);
    case CMD.START_IMAGES:
      return onStartPhase("images");
    case CMD.START_ANIMATION:
      return onStartPhase("animation");
    case CMD.START:
    case CMD.RESUME:
      return onStartOrResume();
    case CMD.PAUSE:
      return onPause();
    case CMD.STOP:
      return onStop();
    case CMD.RETRY_SCENE:
      return onRetryScene(message);
    case CMD.RETRY_ALL_ERRORS:
      return onRetryAllErrors();
    case CMD.SKIP_SCENE:
      return onSkipScene(message);
    case CMD.RESET_SCENES:
      return onResetScenes();
    case CMD.CLEAR_ALL:
      return onClearAll();
    case CMD.TOGGLE_INSPECTOR:
      return onToggleInspector(message);
    case CMD.GENERATE_AUDIO:
      return onGenerateAudio(message);
    case CMD.RUN_ALL:
      return onRunAll();

    // RES.* desde el content script (modo real). En scaffold rara vez llegan.
    case RES.CAPTCHA_DETECTED:
      return onHardStop("captcha", "Captcha detectado en Flow.");
    case RES.NO_CREDITS:
      return onHardStop("no_credits", "Sin creditos en Flow.");
    case RES.RATE_LIMIT:
      return onRateLimit("actividad inusual detectada (anti-abuso por ritmo).");
    case RES.ACTION_RESULT:
      // En modo real, los resultados de ACT.* se consumen via sendMessage directo
      // a la pestana (ver runRealScene). Aqui solo logueamos por si llegan sueltos.
      log(LOG_LEVEL.DEBUG, `RES.ACTION_RESULT suelto: ${JSON.stringify(message)}`);
      return;

    default:
      log(LOG_LEVEL.WARN, `Mensaje no manejado: ${type}`);
      return;
  }
}

// ---------------------------------------------------------------------------
// Handlers de comandos
// ---------------------------------------------------------------------------

async function onLoadJson(message) {
  const result = parseProject(message.json);
  if (!result.ok) {
    for (const err of result.errors) log(LOG_LEVEL.ERROR, `JSON invalido: ${err}`);
    return;
  }
  // Avisos no fatales (ej. referencia a un personaje/escena que no existe): se surfacean ANTES de
  // gastar puntos, no se tiran a la basura. El dato ya lo calcula parseProject.
  for (const w of result.warnings || []) log(LOG_LEVEL.WARN, `Aviso del JSON: ${w}`);
  // Preserva el characterRef ya cargado (el JSON nuevo no lo trae).
  const prevRef = state.project?.characterRef ?? null;
  state.project = { ...result.project, characterRef: prevRef };
  state.scenes = result.scenes;
  state.queue = { running: false, paused: false, currentIndex: 0 };
  // Reinicia el RITMO al cargar un JSON nuevo: cada video arranca "fresco". Antes solo se reseteaba queue,
  // asi que un 2o video en la misma hora HEREDABA windowCount/sessionGen/cooldown del anterior y disparaba
  // "Tope 50/hora: pausa 20 min" (o un descanso largo) de la nada. El tope/hora pasa a ser por-video.
  state.pacing = { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0 };
  // El JSON manda el proveedor (pipeline.image_generation.tool). Si lo declara, enruta a Flow o Grok;
  // si no, respeta el del panel. Asi la cola automatica mezcla JSON de Flow y Grok sin tocar nada.
  if (result.project.provider && result.project.provider !== state.config.provider) {
    state.config.provider = result.project.provider;
    log(LOG_LEVEL.INFO, `Proveedor segun JSON: ${result.project.provider}.`);
  }
  await saveState();
  log(LOG_LEVEL.INFO, `Proyecto cargado: "${state.project.title}" (${state.scenes.length} escenas).`);
  emitState();
  emitProgress();
}

async function onLoadCharacterRef(message) {
  const { name, dataUrl } = message;
  if (!state.project) {
    // Permite cargar la ref antes del JSON: creamos un project minimo.
    state.project = { title: "(sin proyecto)", aspectRatio: "9:16", characterRef: null };
  }
  state.project.characterRef = { name, dataUrl };
  await saveState();
  log(LOG_LEVEL.INFO, `Imagen de personaje cargada: ${name}`);
  emitState();
}

async function onSetConfig(message) {
  state.config = { ...state.config, ...(message.config ?? {}) };
  await saveState();
  log(LOG_LEVEL.INFO, `Config actualizada: ${JSON.stringify(message.config ?? {})}`);
  emitState();
}

async function onPause() {
  state.queue.paused = true;
  await saveState();
  log(LOG_LEVEL.INFO, "Cola pausada.");
  emitState();
}

async function onStop() {
  state.queue.paused = true;
  state.queue.running = false;
  await saveState();
  detachDebuggers();
  log(LOG_LEVEL.INFO, "Cola detenida.");
  emitState();
}

// Reintento por escena. mode:
//   "download" -> el video YA existe en Flow (animacion ok o reintentada a mano en Flow); solo
//                 recoge + descarga el clip. Mantiene imagen y video. NO re-anima (no gasta video).
//   "anim"     -> re-dispara la animacion usando la imagen YA generada. Mantiene imagen, borra video.
//   "image"    -> regenera la imagen desde cero (comportamiento clasico). Borra imagen y video.
// En "download"/"anim" se dispara la fase de animacion automaticamente (sin tocar otras escenas).
async function onRetryScene(message) {
  const scene = state.scenes.find((s) => s.id === message.sceneId);
  if (!scene) {
    log(LOG_LEVEL.WARN, `RETRY: escena no encontrada: ${message.sceneId}`);
    return;
  }
  scene.attempts = 0;
  scene.error = null;
  if (state.queue.errorSceneId === scene.id) state.queue.errorSceneId = null;

  const mode = message.mode || "image";

  if (mode === "download" && scene.videoUrl) {
    scene.status = SCENE_STATUS.ANIMATING;   // runParallelAnimation PASO 3 lo recoge (ANIMATING + videoUrl)
    await saveState();
    log(LOG_LEVEL.INFO, `Escena ${scene.id}: reintento SOLO descarga (mantengo el video de Flow).`);
    emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING);
    emitState();
    return runAnimationRetry();
  }

  if (mode === "anim" && scene.imageUrl) {
    scene.status = SCENE_STATUS.IMAGE_DONE;  // runParallelAnimation PASO 1 lo re-dispara
    scene.videoUrl = null;
    scene.clipFilename = null;
    scene.lastFrameFilename = null;
    scene.savedOk = false;
    scene.grokFired = false; scene.grokVideoPostUrl = null; scene.grokAnimBefore = null;  // re-animar LIMPIO: permitir re-disparo en Grok
    await saveState();
    log(LOG_LEVEL.INFO, `Escena ${scene.id}: reintento animacion (mantengo la imagen).`);
    emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE);
    emitState();
    return runAnimationRetry();
  }

  // mode "image" (o sin imagen/video que reutilizar): regenerar imagen desde cero.
  scene.status = SCENE_STATUS.PENDING;
  scene.imageUrl = null;
  scene.grokPostUrl = null;
  scene.videoUrl = null;
  scene.clipFilename = null;
  scene.lastFrameFilename = null;
  scene.savedOk = false;
  scene.grokFired = false; scene.grokVideoPostUrl = null; scene.grokAnimBefore = null;  // todo de cero: permitir re-disparo en Grok
  await saveState();
  log(LOG_LEVEL.INFO, `Escena ${scene.id} reseteada a PENDING (regenera imagen).`);
  emitSceneStatus(scene.id, SCENE_STATUS.PENDING);
  emitState();
}

// Arranca la fase de animacion para recoger/animar las escenas que YA estan en estado animable
// (IMAGE_DONE / ANIMATING+videoUrl). A diferencia de onStartPhase, NO reactiva las escenas en ERROR:
// asi un reintento por escena toca solo la que el usuario pidio.
async function runAnimationRetry() {
  state.queue.phase = "animation";
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  emitState();
  launchLoop();
}

// Re-encola TODAS las escenas en ERROR de un tiron (reemplaza la vieja reactivacion automatica que
// re-gastaba puntos sin querer). La confirmacion de costo la hace el panel ANTES de mandar el comando.
// imagen sin imageUrl -> PENDING (gratis); con imageUrl -> IMAGE_DONE (re-animar, cuesta).
async function onRetryAllErrors() {
  const errs = state.scenes.filter((s) => s.status === SCENE_STATUS.ERROR);
  if (!errs.length) { log(LOG_LEVEL.INFO, "No hay escenas en error para reintentar."); return; }
  let toAnimate = false;
  for (const s of errs) {
    s.attempts = 0; s.error = null;
    if (s.imageUrl) { s.status = SCENE_STATUS.IMAGE_DONE; s.videoUrl = null; s.clipFilename = null; s.lastFrameFilename = null; s.savedOk = false; s.grokFired = false; s.grokVideoPostUrl = null; s.grokAnimBefore = null; toAnimate = true; }
    else { s.status = SCENE_STATUS.PENDING; }
    emitSceneStatus(s.id, s.status);
  }
  state.queue.errorSceneId = null;
  state.queue.phase = toAnimate ? "animation" : "images";
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  log(LOG_LEVEL.INFO, `Reintentando ${errs.length} escena(s) en error (fase ${state.queue.phase}).`);
  emitState();
  launchLoop();
}

// Salta la escena en error: la deja marcada (queda en ERROR, no se reintenta) y reanuda el resto.
async function onSkipScene(message) {
  const scene = state.scenes.find((s) => s.id === message.sceneId) || state.scenes.find((s) => s.status === SCENE_STATUS.ERROR);
  if (scene) { scene.skipped = true; log(LOG_LEVEL.INFO, `Escena ${scene.id} saltada; continuo con el resto.`); }
  if (state.queue.errorSceneId === scene?.id) state.queue.errorSceneId = null;
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  emitState();
  launchLoop();
}

// Reinicia TODAS las escenas a PENDING (para regenerar todo desde cero).
async function onResetScenes() {
  for (const s of state.scenes) {
    s.status = SCENE_STATUS.PENDING;
    s.attempts = 0;
    s.error = null;
    s.imageUrl = null;
    s.grokPostUrl = null;
    s.clipFilename = null;
    s.lastFrameFilename = null;
  }
  state.queue = { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0 };
  for (const s of state.scenes) s.skipped = false;
  lastFrames.clear();
  detachDebuggers();
  await saveState();
  log(LOG_LEVEL.INFO, `Reiniciadas ${state.scenes.length} escenas a PENDIENTE.`);
  emitState();
  emitProgress();
}

// Borra TODO el estado: proyecto, escenas, personaje y config -> estado inicial.
async function onClearAll() {
  detachDebuggers();
  lastFrames.clear();
  logRing = [];
  state = makeInitialState();
  await chrome.storage.local.remove([STORAGE_KEY, LOG_RING_KEY]);
  await saveState();
  log(LOG_LEVEL.INFO, "Estado de la extension borrado por completo (estado inicial).");
  emitState();
  emitProgress();
}

async function onToggleInspector(message) {
  state.inspector = !!message.enabled;
  await saveState();
  log(LOG_LEVEL.INFO, `Inspector ${state.inspector ? "activado" : "desactivado"}.`);
  // En dry-run no hace nada con el DOM. En modo real, enviar ACT.INSPECT_DOM al content.
  emitState();
}

async function onHardStop(reason, message) {
  if (reason === "rate_limit") return onRateLimit(message);   // no es parada dura: cooldown creciente + reanuda solo
  state.queue.paused = true;
  state.queue.running = false;
  await saveState();
  log(LOG_LEVEL.ERROR, `PARADA DURA: ${message}`);
  emit(EVT.HARD_STOP, { reason, message });
  emitState();
}

// Rate-limit ("actividad inusual"): NO es falta de creditos. Pausa, aplica un cooldown CRECIENTE
// (5->15->45 min) y programa una reanudacion automatica via alarms. Tras 3 seguidos, parada dura.
async function onRateLimit(message) {
  await ensureState();
  state.pacing = state.pacing || { cooldownStep: 0 };
  const step = state.pacing.cooldownStep || 0;
  if (step >= 3) { state.pacing.cooldownStep = 0; await saveState(); return onHardStop("rate_limit", `${message} (persistente tras 3 cooldowns; paro).`); }
  const base = state.config.rateLimitCooldownMinMs ?? DEFAULT_CONFIG.rateLimitCooldownMinMs;
  const waitMs = base * Math.pow(3, step);              // 5 / 15 / 45 min
  state.pacing.cooldownStep = step + 1;
  state.pacing.cooldownUntil = Date.now() + waitMs;
  if (state.metrics) state.metrics.cooldownMs = (state.metrics.cooldownMs || 0) + waitMs;
  state.queue.paused = true;
  state.queue.running = false;
  await saveState();
  if (!state.config.parallelPipeline) detachDebuggers();   // en paralelo, cada carril suelta SU pestana en su finally (no tumbar al hermano a media CDP)
  const mins = Math.round(waitMs / 60000);
  log(LOG_LEVEL.WARN, `RATE-LIMIT: ${message} Enfriando ${mins} min y reanudo solo.`);
  emit(EVT.HARD_STOP, { reason: "rate_limit", message: `${message} Cooldown ${mins} min (reanuda solo).` });
  emitState();
  try { chrome.alarms.create("rateLimitResume", { when: state.pacing.cooldownUntil }); } catch (_e) {}
}

// Reanuda tras el cooldown del rate-limit (disparado por la alarma).
async function resumeAfterCooldown() {
  await ensureState();
  if (!state.pacing?.cooldownUntil || Date.now() < state.pacing.cooldownUntil) return;
  state.pacing.cooldownUntil = 0;
  if (state.queue.errorSceneId) { log(LOG_LEVEL.INFO, "Cooldown terminado, pero hay un fallo pendiente; no reanudo solo."); return; }
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  log(LOG_LEVEL.INFO, "Cooldown de rate-limit terminado: reanudando la cola.");
  emitState();
  if (state.queue.mode === "parallel" && state.config.parallelPipeline) runPhasesParallel().catch((e) => log(LOG_LEVEL.ERROR, `Reanudacion paralela fallo: ${e?.message ?? e}`));
  else launchLoop();
}

// Pausa "blanda" por fallo recuperable-a-mano (no captcha/sin-creditos): deja la cola PAUSADA para que
// pollQueue no jale mas trabajos y el autopiloto se detenga. El usuario arregla en Flow y reanuda.
async function pauseForError(message, sceneId = null) {
  state.queue.paused = true;
  state.queue.running = false;
  state.queue.errorSceneId = sceneId;
  if (sceneId && state.metrics) state.metrics.errors = (state.metrics.errors || 0) + 1;
  await saveState();
  if (!state.config.parallelPipeline) detachDebuggers();   // en paralelo, cada carril suelta SU pestana (no tumbar al hermano)
  log(LOG_LEVEL.WARN, `PAUSA por fallo: ${message}. Revisa y dale Reanudar / Saltar / Reintentar.`);
  emit(EVT.PAUSED_BY_ERROR, { sceneId, error: message });
  emitState();
}

// ---------------------------------------------------------------------------
// Bucle de cola
// ---------------------------------------------------------------------------

async function onStartOrResume() {
  state.queue.paused = false;
  state.queue.running = true;
  state.queue.errorSceneId = null;   // al reanudar, reconocemos el fallo; el resto continua (la escena en error queda marcada)
  if (!state.queue.phase) state.queue.phase = "images";
  await saveState();
  emitState();
  launchLoop();
}

// Arranca una FASE: "images" (genera todas las imagenes) o "animation" (anima las listas).
async function onStartPhase(phase) {
  state.queue.phase = phase;
  // Reactiva escenas en ERROR SOLO en la fase de imagenes (gratis). En animacion NO se reactiva:
  // re-animar gasta ~20-40 pts y debe ser decision explicita (boton por escena o RETRY_ALL_ERRORS),
  // no un efecto colateral de pulsar "Animar". (Auditoria: la pausa-ante-fallo se anulaba sola.)
  if (phase === "images") {
    for (const s of state.scenes) {
      if (s.status === SCENE_STATUS.ERROR && !s.imageUrl) { s.status = SCENE_STATUS.PENDING; s.attempts = 0; s.error = null; }
    }
  }
  state.queue.errorSceneId = null;
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  log(LOG_LEVEL.INFO, phase === "images"
    ? "FASE 1 iniciada: generar todas las imagenes (Nano Banana)."
    : "FASE 2 iniciada: animar las imagenes listas (Veo).");
  emitState();
  // FASE 0 (solo imagenes): genera los ingredientes del JSON antes de las escenas. No-op si no hay.
  if (phase === "images") {
    const ok = await runIngredientsPhase().catch((e) => { log(LOG_LEVEL.ERROR, `Ingredientes: ${e?.message ?? e}`); return false; });
    if (!ok) { await ensureState(); emitState(); return; }   // parada dura / pausa: no arranca el bucle de escenas
  }
  launchLoop();
}

// Wiring del orquestador (lib/orchestrator.js): le inyectamos el estado vivo, los emisores chrome.*,
// los runners (con el dispatch dry/grok/real resuelto aqui) y los efectos. El bucle/retry/ritmo viven
// alla (puros y testeables sin chrome.*); aqui solo conectamos las dependencias reales del SW.
const orchestrator = createOrchestrator({
  getState: () => state,
  saveState,
  emitState,
  emitProgress,
  emitSceneStatus,
  log,
  runners: {
    // Proveedor POR FASE: la imagen usa project.imageProvider y la animacion project.animationProvider
    // (fallback al global state.config.provider). Si ambos son iguales (JSON de un solo proveedor) -> flujo
    // actual identico. Si difieren (ej. imagen=flow, animacion=grok) -> desacople; el handoff lo resuelve
    // runRealImage (guarda la imagen a disco) + runGrokAnimation (la sube). Ver [[grok-pause-resume-parallel]].
    image: (scene, prevSceneId, refName) => {
      const imgProv = state.project?.imageProvider || state.config.provider;
      return state.config.dryRun ? runDryRunImage(scene, prevSceneId, refName)
        : imgProv === "grok" ? runGrokImage(scene)
          : runRealImage(scene, prevSceneId, refName);
    },
    animation: (scene) => {
      const animProv = state.project?.animationProvider || state.config.provider;
      return state.config.dryRun ? runDryRunAnimation(scene)
        : animProv === "grok" ? runGrokAnimation(scene)
          : runRealAnimation(scene);
    },
    parallelAnimation: () => runParallelAnimation(),
  },
  effects: {
    onHardStop: (reason, message) => onHardStop(reason, message),
    pauseForError: (message, sceneId) => pauseForError(message, sceneId),
    detachDebuggers: () => detachDebuggers(),
    detachProvider: (provider) => detachProvider(provider),   // pipeline paralelo: suelta solo SU pestana
    reportFailuresAtEnd: () => reportFailuresAtEnd(),
    heartbeatJobLock: () => heartbeatJobLock(),
  },
  loop: { isRunning: () => loopRunning, setRunning: (b) => { loopRunning = b; } },
  now: () => Date.now(),
  sleep: (ms) => delay(ms),
});

// Lanza el bucle si no hay otro corriendo en este worker. El guard loopRunning vive aqui porque lo
// comparten pollQueue/resumeIfInterrupted; el orquestador lo lee/escribe via deps.loop.
function launchLoop() {
  if (loopRunning) return;
  orchestrator.runQueue().catch((e) => {
    console.error("runQueue error:", e);
    log(LOG_LEVEL.ERROR, `Bucle abortado: ${e?.message ?? e}`);
    loopRunning = false;
  });
}

// ---------------------------------------------------------------------------
// Runner DRY-RUN: simula transiciones, no toca Flow ni content.
// ---------------------------------------------------------------------------

// FASE 1 (dry-run): genera imagen -> IMAGE_DONE. prev_frame no aplica (solo character_ref).
async function runDryRunImage(scene, prevSceneId, refName) {
  const steps = planScene(scene, null, refName).filter(
    (s) => s.action === "resolve_ingredients" || s.action === "generate_image"
  );
  for (const step of steps) {
    log(LOG_LEVEL.INFO, `[dry-run img ${scene.id}] ${step.action}: ${step.label}`);
    if (step.detail) log(LOG_LEVEL.DEBUG, `   detalle: ${JSON.stringify(step.detail)}`);
  }
  scene.status = SCENE_STATUS.GENERATING_IMAGE;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.GENERATING_IMAGE);
  emitState();
  await delay(jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, scene.attempts));

  scene.imageUrl = `dry://image/${scene.id}`;
  scene.status = SCENE_STATUS.IMAGE_DONE;
  scene.error = null;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE);
  emitState();
  emitProgress();
  log(LOG_LEVEL.INFO, `[dry-run img ${scene.id}] IMAGE_DONE`);
}

// FASE 2 (dry-run): anima -> descarga -> frame -> DONE.
async function runDryRunAnimation(scene) {
  const transitions = [SCENE_STATUS.ANIMATING, SCENE_STATUS.DOWNLOADING, SCENE_STATUS.EXTRACTING_FRAME];
  for (const status of transitions) {
    await ensureState();
    if (state.queue.paused || !state.queue.running) throw new Error("interrumpido por pausa/stop");
    scene.status = status;
    await saveState();
    emitSceneStatus(scene.id, status);
    emitState();
    log(LOG_LEVEL.INFO, `[dry-run anim ${scene.id}] ${status}`);
    await delay(jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, scene.attempts));
  }
  scene.clipFilename = `${scene.id}.mp4`;
  scene.lastFrameFilename = `${scene.id}_lastframe.png`;
  scene.status = SCENE_STATUS.DONE;
  scene.error = null;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.DONE);
  emitState();
  emitProgress();
  log(LOG_LEVEL.INFO, `[dry-run anim ${scene.id}] DONE -> ${scene.clipFilename} / ${scene.lastFrameFilename}`);
}

// ---------------------------------------------------------------------------
// Runner MODO REAL: envia ACT.* al content script de la pestana de Flow.
// En esta fase de scaffold el driver responde "no implementado": tratamos eso
// como error controlado (no rompe la cola). TODOs marcados para el driver real.
// ---------------------------------------------------------------------------

// FASE 1 (real): genera la imagen (Nano Banana, 0 puntos) -> IMAGE_DONE.
// prev_frame NO aplica aqui (el video no existe aun): solo character_ref.
async function runRealImage(scene, prevSceneId, refName) {
  void prevSceneId; void refName;
  const tab = await findFlowTab("flow");
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");
  await ensureContentScript(tab.id, "flow");
  // Pre-adjunta el depurador AHORA (no en el 1er click): asi la barra "depurando" ya esta presente
  // cuando el driver calcula las coordenadas del boton Generar -> click correcto al primer intento.
  await ensureDebugger(tab.id);

  // PERSONAJES (nuevo esquema): nombres de Personaje de Flow a adjuntar (display_name). El usuario
  // crea cada Personaje una vez por proyecto (subir un archivo por script es imposible: seguridad).
  // Compat VIEJO: si la escena no trae characterRefs pero si el ingrediente character_ref, usar el
  // nombre global (character_bible.name).
  // PERSONAJES: cada id de scene.characterRefIds es un personaje BASE (Personaje de Flow via "+") o un
  // ingrediente character_edited (el base ya "vestido" -> se adjunta su TILE generado via ⋮, NO el base).
  const ingOf = (id) => (state.project?.ingredients || []).find((g) => g.id === id) || null;
  const characterNames = [];
  const sceneRefImageUrls = [];
  const refIds = Array.isArray(scene.characterRefIds) ? scene.characterRefIds : [];
  for (let i = 0; i < refIds.length; i++) {
    const ing = ingOf(refIds[i]);
    if (ing && ing.type === "character_edited") {
      if (ing.imageUrl) sceneRefImageUrls.push(ing.imageUrl);
      else log(LOG_LEVEL.WARN, `${scene.id}: character_edited '${refIds[i]}' sin imagen (¿corrio la fase de ingredientes?); se omite.`);
    } else {
      const dn = (scene.characterRefs || [])[i];
      if (dn) characterNames.push(dn);   // display_name del Personaje base
    }
  }
  // Compat VIEJO: sin refs nuevas pero con el ingrediente character_ref -> nombre global de personaje.
  if (!characterNames.length && !sceneRefImageUrls.length && scene.imageIngredients?.includes("character_ref") && state.project?.characterName) {
    characterNames.push(state.project.characterName);
  }
  // INGREDIENTES de escena (entity/location_plate). Con project.reuse_ingredients el driver intenta
  // adjuntarlos por NOMBRE (id renombrado, reusable entre Partes) y si no por su TILE generado en este run.
  // Sin el flag -> solo por tile (flujo actual; Huesito intacto).
  const ingredientRefs = [];
  for (const rid of (scene.ingredientRefs || [])) {
    const ing = ingOf(rid);
    if (state.project?.reuseIngredients) {
      ingredientRefs.push({ name: rid, imageUrl: ing?.imageUrl || null });
      if (!ing?.imageUrl) log(LOG_LEVEL.WARN, `${scene.id}: ingrediente '${rid}' sin tile; se intentara por nombre.`);
    } else if (ing?.imageUrl) {
      sceneRefImageUrls.push(ing.imageUrl);
    } else {
      log(LOG_LEVEL.WARN, `${scene.id}: ingrediente '${rid}' sin imagen generada; se omite.`);
    }
  }
  // ESCENAS PREVIAS (legacy, desaconsejado con ingredientes): references.scenes[].sceneId -> imageUrl ya generada.
  for (const sr of (scene.sceneRefs || [])) {
    const ref = state.scenes.find((x) => x.id === sr.sceneId);
    if (ref?.imageUrl) sceneRefImageUrls.push(ref.imageUrl);
    else log(LOG_LEVEL.WARN, `${scene.id}: referencia a escena '${sr.sceneId}' sin imagen disponible (se omite).`);
  }
  const count = state.config.generationCount ?? DEFAULT_CONFIG.generationCount;
  const aspectRatio = state.project?.aspectRatio ?? "9:16";

  scene.status = SCENE_STATUS.GENERATING_IMAGE;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.GENERATING_IMAGE);
  emitState();
  const img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, {
    prompt: scene.imagePrompt, characterNames, sceneRefImageUrls, ingredientRefs, aspectRatio, count, cfg: driverCfg(),
  });
  scene.imageUrl = img?.imageUrl ?? null;
  // HANDOFF cross-proveedor (opt-in por JSON): si la animacion va en OTRO proveedor (animationProvider != "flow"),
  // guarda la imagen de Flow a disco para poder subirla alla (igual que runGrokImage). Flow->Flow NO paga esta
  // descarga -> flujo actual intacto. Falla con gracia: si no baja, imageFilePath queda null (no rompe nada).
  const animProv = state.project?.animationProvider || state.config.provider;   // proveedor EFECTIVO (igual que el dispatch)
  const slug = state.project?.slug || "proyecto";
  if (state.project?.imageOnly && scene.imageUrl) {
    // image-only (historias): la imagen ES el asset final -> a public/<slug>/images/ para el render (Ken Burns).
    try {
      const saved = await downloadImageForRef(scene.imageUrl, slug, scene.id);
      scene.imageFilePath = saved.abspath || null;
      const moved = await moveStillToProject(saved.abspath, slug, scene.id);
      scene.savedOk = moved.via === "server";
      if (moved.via === "server") log(LOG_LEVEL.INFO, `${scene.id}: still movido a public/${slug}/images/ (image-only).`);
      else log(LOG_LEVEL.WARN, `${scene.id}: still en Descargas (dev-server no responde); muevelo a public/${slug}/images/.`);
    } catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar/mover el still (${e?.message ?? e}).`); }
  } else if (animProv !== "flow" && scene.imageUrl) {
    // HANDOFF cross-proveedor: imagen de Flow a disco para subirla en el otro proveedor (Flow->Flow no paga esto).
    try {
      const saved = await downloadImageForRef(scene.imageUrl, slug, scene.id);
      scene.imageFilePath = saved.abspath || null;
      log(LOG_LEVEL.INFO, `${scene.id}: imagen de Flow guardada a disco para handoff a ${animProv}.`);
    } catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar la imagen de Flow a disco para handoff (${e?.message ?? e}).`); }
  }
  scene.status = SCENE_STATUS.IMAGE_DONE;
  scene.error = null;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE);
  emitState();
  emitProgress();
  log(LOG_LEVEL.INFO, `Imagen lista (${scene.id}).`);
}

// FASE 2 (real): anima la imagen de la escena (Veo, ~20 puntos), descarga el clip y
// extrae el ultimo frame. Pasa scene.imageUrl para que el driver ubique el tile correcto.
async function runRealAnimation(scene) {
  const tab = await findFlowTab("flow");
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");

  // HANDOFF NO SOPORTADO: Flow solo anima tiles de SU grilla, no imagenes subidas de otro proveedor.
  // Si la imagen se genero en Grok, su URL/tile JAMAS aparece en Flow -> fallar CLARO y no-reintentable
  // (classifyError mapea 'no soportado'/'handoff' a selector) para no quemar el intento ni re-disparar nada.
  const imgProv = state.project?.imageProvider || state.config.provider;
  if (imgProv !== "flow") {
    throw new Error(`handoff imagen=${imgProv} -> animacion=flow no soportado (Flow solo anima imagenes generadas en Flow); pon animacion=${imgProv} o genera la imagen en flow`);
  }

  await ensureContentScript(tab.id, "flow");
  await ensureDebugger(tab.id);  // pre-adjunta para que el 1er click Generar caiga bien (barra ya presente)

  const count = state.config.generationCount ?? DEFAULT_CONFIG.generationCount;
  const aspectRatio = state.project?.aspectRatio ?? "9:16";
  // Modelo y duracion elegidos en la UI (texto exacto de Flow). Fallback al default.
  const model = state.config.videoModel ?? DEFAULT_CONFIG.videoModel;
  const duration = state.config.videoDuration ?? DEFAULT_CONFIG.videoDuration;

  // 1) ANIMATE — IDEMPOTENTE: separamos FIRE (paga) de COLLECT y persistimos scene.videoUrl tras mapear el
  // video nuevo. Si un intento previo ya disparo+mapeo (scene.videoUrl presente), NO re-disparamos: saltamos
  // a recoger/descargar. Asi un fallo de collect/descarga NO re-gasta puntos (antes ACT.ANIMATE acoplaba
  // fire+collect y el reintento re-animaba: hasta 80 pts/escena).
  if (!scene.videoUrl) {
    scene.status = SCENE_STATUS.ANIMATING;
    await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING); emitState();
    log(LOG_LEVEL.INFO, `Animando ${scene.id} con "${model}" (${duration})...`);
    let before = [];
    try { before = (await sendActOrFail(tab.id, ACT.VIDEO_SRCS, {}))?.srcs || []; } catch (_e) {}
    const res = await sendActOrFail(tab.id, ACT.ANIMATE_FIRE, {
      prompt: scene.animationPrompt, model, duration, aspectRatio, count, imageUrl: scene.imageUrl, cfg: driverCfg(),
    });
    if (res?.cost) log(LOG_LEVEL.INFO, `${scene.id}: ${res.cost}`);
    detachDebugger(tab.id);   // soltar ANTES de la espera larga del video (su retencion congelaba la pestana)
    const mapped = await sendActOrFail(tab.id, ACT.MAP_NEW_VIDEOS, { before, total: 1 });
    const src = (mapped?.srcs || [])[0];
    if (!src) throw new Error("no aparecio el video nuevo tras animar (¿Flow lo encolo o bloqueo?)");
    scene.videoUrl = src;     // PERSISTIR -> idempotencia: si lo de abajo falla, el reintento recoge sin re-disparar
    await saveState();
  } else {
    log(LOG_LEVEL.INFO, `${scene.id}: ya animado en un intento previo; recojo sin re-disparar (no re-gasto).`);
  }

  // 2) RECOGER (espera fin del video) + DESCARGAR via chrome.downloads (cookies de sesion; sin host perms).
  scene.status = SCENE_STATUS.DOWNLOADING;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DOWNLOADING); emitState();
  const collected = await sendActOrFail(tab.id, ACT.ANIMATE_COLLECT, { videoUrl: scene.videoUrl });
  const videoUrl = collected?.videoUrl || scene.videoUrl;
  scene.clipFilename = `${scene.id}.mp4`;
  {
    const clipSlug = state.project?.slug || "proyecto";
    const saved = await downloadClipToProject(videoUrl, clipSlug, scene.id);
    scene.savedOk = saved.via === "server";   // true solo si quedo en public/<slug>/clips/ (no en Descargas)
    log(LOG_LEVEL.INFO, `clip ${scene.id}.mp4 -> ${saved.path}`);
    if (saved.via === "downloads") log(LOG_LEVEL.WARN, `(quedo en Descargas; corre 'flowbot start' para que caiga en public/${clipSlug}/clips/)`);
  }
  await saveState();
  await delay(jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, scene.attempts));

  // 3) DONE (la extraccion de ultimo frame se quito: el flujo de ingredientes no la usa)
  scene.status = SCENE_STATUS.DONE;
  scene.error = null;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.DONE);
  emitState();
  emitProgress();
}

// ---------------------------------------------------------------------------
// Runners GROK (provider="grok"). Grok SI acepta archivos por codigo, asi que el SW SUBE las
// referencias (personaje + imagenes de escenas previas) por CDP DOM.setFileInputFiles antes de
// generar/animar. Secuencial (config.parallelAnimation=false). Ver [[grok-future-animation]].
// SHAKEOUT EN VIVO PENDIENTE (selectores/tiempos/9:16 confirmados parcialmente).
// ---------------------------------------------------------------------------

// Resuelve la ruta ABSOLUTA en disco de un asset de personaje (assets/...) via el dev-server.
async function resolveCharFile(rel) {
  const base = state.config.charFileUrl || DEFAULT_CONFIG.charFileUrl;
  const res = await fetch(`${base}?path=${encodeURIComponent(rel)}`).then((r) => r.json()).catch(() => null);
  if (!res?.ok) throw new Error(`no encuentro ${rel} (¿corre el dev-server?)`);
  return res.abspath;
}

// Descarga la imagen generada por Grok a Descargas/<slug>/images/<id>.jpg y devuelve su ruta ABSOLUTA
// (chrome.downloads manda cookies; assets.grok.com las exige). Esa ruta se reusa como REFERENCIA por
// CDP en escenas siguientes (continuidad). No se mueve a public/ (no la necesita el render).
async function downloadImageForRef(url, slug, id) {
  const dlId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename: `${slug}/images/${id}.jpg`, saveAs: false, conflictAction: "overwrite" }, (theId) => {
      const e = chrome.runtime.lastError; if (e) return reject(new Error(e.message)); resolve(theId);
    });
  });
  const item = await waitDownloadComplete(dlId);
  if (!item || item.state !== "complete" || !item.filename) throw new Error("la descarga de la imagen no completo");
  return { abspath: item.filename };
}

// image-only (historias): mueve el still YA descargado (abspath en Descargas) a
// remotion-editor/public/<slug>/images/<id>.jpg, que es de donde el render (Ken Burns) lee el PNG/JPG.
// Mismo mecanismo que los clips (dev-server /move). Si el dev-server no corre, queda en Descargas (fallback).
async function moveStillToProject(absFrom, slug, id) {
  const to = `remotion-editor/public/${slug}/images/${id}.jpg`;
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  try {
    const res = await fetch(`${base}/move?from=${encodeURIComponent(absFrom)}&to=${encodeURIComponent(to)}`, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (res.ok && j && j.ok) return { via: "server", path: to };
  } catch (_e) { /* dev-server no corre: queda en Descargas */ }
  return { via: "downloads", path: absFrom };
}

// FASE 1 (Grok): sube referencias (personaje + escenas previas) por CDP -> genera imagen (modo Imagen).
async function runGrokImage(scene) {
  const tab = await findFlowTab("grok");
  if (!tab) throw new Error("No hay pestana de Grok abierta (grok.com/imagine). Abrela y reintenta.");
  await ensureGrokCompositor(tab.id); // vuelve al composer fresco (tras la escena previa quedo en /imagine/post/<id>)
  await ensureContentScript(tab.id, "grok");
  await ensureDebugger(tab.id);

  // Referencias a subir por CDP: personaje(s) base O su character_edited (PNG en disco) + ingredientes + escenas previas.
  const refPaths = [];
  const chars = state.project?.characters || {};
  const ingOf = (id) => (state.project?.ingredients || []).find((g) => g.id === id) || null;
  const refIds = Array.isArray(scene.characterRefIds) ? scene.characterRefIds : [];
  for (let i = 0; i < refIds.length; i++) {
    const ing = ingOf(refIds[i]);
    if (ing && ing.type === "character_edited") {
      if (ing.imageFilePath) refPaths.push(ing.imageFilePath);   // el base ya "vestido", en disco
      else log(LOG_LEVEL.WARN, `${scene.id}: character_edited '${refIds[i]}' sin imagen en disco (¿corrio la fase de ingredientes?); se omite.`);
    } else {
      const nm = (scene.characterRefs || [])[i];
      const entry = Object.values(chars).find((c) => c && c.display_name === nm);
      if (entry?.reference_asset) {
        try { const p = await resolveCharFile(entry.reference_asset); if (p) refPaths.push(p); }
        catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no resolvi ref de personaje "${nm}": ${e?.message ?? e}`); }
      }
    }
  }
  if (!refPaths.length && !refIds.length) { // compat: sin refs declaradas, usa el 1er personaje del mapa
    const first = Object.values(chars)[0];
    if (first?.reference_asset) { try { const p = await resolveCharFile(first.reference_asset); if (p) refPaths.push(p); } catch (_e) {} }
  }
  // INGREDIENTES de escena (entity/location_plate): subir su PNG en disco.
  for (const rid of (scene.ingredientRefs || [])) {
    const ing = ingOf(rid);
    if (ing?.imageFilePath) refPaths.push(ing.imageFilePath);
    else log(LOG_LEVEL.WARN, `${scene.id}: ingrediente '${rid}' sin imagen en disco; se omite.`);
  }
  for (const sr of (scene.sceneRefs || [])) {
    const ref = state.scenes.find((x) => x.id === sr.sceneId);
    if (ref?.imageFilePath) refPaths.push(ref.imageFilePath);
    else log(LOG_LEVEL.WARN, `${scene.id}: ref a escena '${sr.sceneId}' sin imagen en disco; se omite.`);
  }

  scene.status = SCENE_STATUS.GENERATING_IMAGE;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.GENERATING_IMAGE); emitState();

  if (refPaths.length) {
    try { await sendActOrFail(tab.id, ACT.CLEAR_REFS, {}); } catch (_e) {}
    try { await cdpSetFileInput(tab.id, refPaths); log(LOG_LEVEL.INFO, `${scene.id}: ${refPaths.length} referencia(s) subidas a Grok.`); }
    catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude subir referencias (${e?.message ?? e}); genero sin ellas.`); }
  }
  // Aspecto: del JSON (project.aspect_ratio). historias sin aspect_ratio -> 16:9 (documental horizontal).
  const aspectRatio = state.project?.aspectRatio || (state.project?.preset === "historias" ? "16:9" : "9:16");
  const img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, { prompt: scene.imagePrompt, aspectRatio, cfg: driverCfg() });
  const imageUrl = img?.imageUrl;
  if (!imageUrl) throw new Error("Grok no devolvio URL de imagen");
  if (img?.variantCount > 1) log(LOG_LEVEL.INFO, `${scene.id}: Grok genero ${img.variantCount} variaciones; uso la 1a (determinista).`);
  scene.imageUrl = imageUrl;
  scene.grokPostUrl = img?.postUrl || null;   // URL real del post (para animar con "Hacer video" sin derivar mal)
  try {
    const slug = state.project?.slug || "proyecto";
    const saved = await downloadImageForRef(imageUrl, slug, scene.id);
    scene.imageFilePath = saved.abspath || null;
    // image-only (historias): la imagen ES el asset final -> moverla a public/<slug>/images/ para el render.
    if (state.project?.imageOnly && saved.abspath) {
      const moved = await moveStillToProject(saved.abspath, slug, scene.id);
      scene.savedOk = moved.via === "server";
      if (moved.via === "server") log(LOG_LEVEL.INFO, `${scene.id}: still movido a public/${slug}/images/ (image-only).`);
      else log(LOG_LEVEL.WARN, `${scene.id}: still en Descargas (dev-server no responde); muevelo a public/${slug}/images/ o corre flowbot.`);
    }
  } catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar/mover la imagen (${e?.message ?? e}).`); }
  scene.status = SCENE_STATUS.IMAGE_DONE; scene.error = null;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE); emitState(); emitProgress();
  log(LOG_LEVEL.INFO, `Imagen Grok lista (${scene.id}).`);
}

// FASE 2 (Grok): anima con el boton "Hacer video" SOBRE el post de la imagen (asi anima Grok; NO es
// "modo Video"). Al disparar, Grok navega a un /post/<videoId> nuevo y genera en sitio -> re-inyectamos
// y recolectamos el <video> ahi. Clic sintetico (sin debugger) -> sin congelamiento de la pestana.
async function runGrokAnimation(scene) {
  const tab = await findFlowTab("grok");
  if (!tab) throw new Error("No hay pestana de Grok abierta (grok.com/imagine). Abrela y reintenta.");

  // IDEMPOTENCIA (no re-gastar puntos): el FIRE (que paga) solo corre la 1a vez. scene.grokFired se marca
  // tras un disparo exitoso; si un reintento entra con grokFired (o con scene.videoUrl ya recogido), NO
  // re-disparamos: recogemos en el /post del video (scene.grokVideoPostUrl) o re-descargamos.
  if (!scene.videoUrl && !scene.grokFired) {
    // HANDOFF cross-proveedor: si la imagen NO se genero en Grok (imageProvider != "grok") no hay /post que
    // abrir -> composer fresco + subir la imagen de disco por CDP (Grok SI anima imagenes subidas, spike OK).
    const imgProv = state.project?.imageProvider || state.config.provider;   // proveedor EFECTIVO (igual que el dispatch)
    const uploadedImage = imgProv !== "grok";
    if (uploadedImage) {
      if (!scene.imageFilePath && scene.imageUrl) {
        // imageFilePath se perdio (p.ej. reinicio del SW): re-baja la imagen a disco antes de rendirse.
        try { const slug = state.project?.slug || "proyecto"; const saved = await downloadImageForRef(scene.imageUrl, slug, scene.id); scene.imageFilePath = saved.abspath || null; } catch (_e) {}
      }
      if (!scene.imageFilePath) throw new Error("falta la imagen en disco para subir a Grok (handoff); regenera la imagen");
      await ensureGrokCompositor(tab.id);          // composer fresco (sin /post)
      await ensureContentScript(tab.id, "grok");
      await ensureDebugger(tab.id);                // CDP para subir el archivo + el clic TRUSTED
      try { await sendActOrFail(tab.id, ACT.CLEAR_REFS, {}); } catch (_e) {}
      await cdpSetFileInput(tab.id, [scene.imageFilePath]);
      log(LOG_LEVEL.INFO, `${scene.id}: imagen subida a Grok para animar (handoff desde ${imgProv}).`);
    } else {
      // camino actual (imagen generada en Grok): navegar al /post real capturado al generar (o derivarlo
      // del genId del asset; preferimos el capturado porque no siempre coincide con el id del post).
      let postUrl = scene.grokPostUrl;
      if (!postUrl) {
        const m = (scene.imageUrl || "").match(/generated\/([^/?]+)/);
        if (!m) throw new Error("no puedo ubicar el post de la imagen en Grok (regenera la imagen para capturarlo)");
        postUrl = `https://grok.com/imagine/post/${m[1]}`;
      }
      await navigateTab(tab.id, postUrl);
      await ensureContentScript(tab.id, "grok");
      await ensureDebugger(tab.id);   // solo para el clic TRUSTED; se suelta antes de la espera
    }

    scene.status = SCENE_STATUS.ANIMATING;
    await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING); emitState();
    log(LOG_LEVEL.INFO, `Animando ${scene.id} en Grok (modo Video + prompt)...`);

    // Snapshot de los videos YA presentes y la URL actual ANTES de disparar: COLLECT recoge solo el NUEVO
    // (no un video viejo del DOM) y solo persistimos el /post si la navegacion cambio de pagina.
    let before = [];
    try { before = (await sendActOrFail(tab.id, ACT.VIDEO_SRCS, {}))?.srcs || []; } catch (_e) {}
    scene.grokAnimBefore = before;
    let preUrl = ""; try { preUrl = (await chrome.tabs.get(tab.id))?.url || ""; } catch (_e) {}

    // FIRE: composer a modo Video -> prompt -> Enviar (trusted). Grok navega al /post del video y genera.
    // La navegacion puede matar el content script ANTES de responder: eso NO es fallo (el disparo ocurrio),
    // seguimos a recolectar. Los errores REALES (no encuentro toggle/Enviar) si se relanzan.
    try {
      await sendActOrFail(tab.id, ACT.ANIMATE_FIRE, { prompt: scene.animationPrompt, cfg: driverCfg() });
    } catch (e) {
      const msg = e?.message ?? String(e);
      if (/no respondio|message port|closed|sin respuesta/i.test(msg)) log(LOG_LEVEL.WARN, `${scene.id}: fire sin respuesta (navegacion); continuo a recolectar.`);
      else { detachDebugger(tab.id); throw e; }
    }

    // Soltamos el debugger de ESTA pestana ANTES de la espera larga del video (su retencion congelaba la
    // pestana). Por-pestana (no global) para no tumbar el debugger del otro carril en modo paralelo.
    detachDebugger(tab.id);

    // El disparo (que paga) ya ocurrio -> marcamos para que NINGUN reintento posterior re-dispare (no re-gasto),
    // incluso si abajo no logramos capturar el /post del video.
    scene.grokFired = true;
    await saveState();

    // Capturar el /post del VIDEO recien creado (solo si la navegacion cambio de pagina) -> idempotencia:
    // si la recoleccion/descarga falla, el reintento recoge AHI sin re-disparar (sin re-gasto).
    await delay(4000);
    try { const t = await chrome.tabs.get(tab.id); const u = t?.url || ""; if (/\/imagine\/post\//.test(u) && u !== preUrl) { scene.grokVideoPostUrl = u; await saveState(); } } catch (_e) {}
  } else {
    log(LOG_LEVEL.INFO, `${scene.id}: ya disparado en Grok; recojo sin re-animar (no re-gasto).`);
    if (!scene.videoUrl && scene.grokVideoPostUrl) await navigateTab(tab.id, scene.grokVideoPostUrl);
  }

  // RECOGER el <video> NUEVO terminado (idempotente: si ya lo teniamos de un intento previo, no re-recogemos).
  if (!scene.videoUrl) {
    await ensureContentScript(tab.id, "grok");
    const vid = await sendActOrFail(tab.id, ACT.ANIMATE_COLLECT, { before: scene.grokAnimBefore || [] });
    const videoUrl = vid?.videoUrl;
    if (!videoUrl) throw new Error("Grok no devolvio URL de video");
    scene.videoUrl = videoUrl;
    await saveState();
  }

  scene.status = SCENE_STATUS.DOWNLOADING;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DOWNLOADING); emitState();
  scene.clipFilename = `${scene.id}.mp4`;
  const slug = state.project?.slug || "proyecto";
  const saved = await downloadClipToProject(scene.videoUrl, slug, scene.id);
  scene.savedOk = saved.via === "server";
  log(LOG_LEVEL.INFO, `clip ${scene.id}.mp4 -> ${saved.path}`);
  if (saved.via === "downloads") log(LOG_LEVEL.WARN, `(quedo en Descargas; corre 'flowbot start' para que caiga en public/${slug}/clips/)`);

  scene.status = SCENE_STATUS.DONE; scene.error = null;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DONE); emitState(); emitProgress();
}

// FASE 2 PARALELA: dispara TODAS las animaciones SIN esperar (las escenas no dependen entre si),
// mapea cada video a su escena POR ORDEN, y recoge (descarga + frame). Rapido SI Flow permite
// generar varias a la vez. Idempotente: IMAGE_DONE -> disparar+mapear; ANIMATING con videoUrl -> recoger.
async function runParallelAnimation() {
  const tab = await findFlowTab("flow");
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");
  await ensureContentScript(tab.id, "flow");
  await ensureDebugger(tab.id);  // pre-adjunta para que el 1er click Generar caiga bien (barra ya presente)

  const model = state.config.videoModel ?? DEFAULT_CONFIG.videoModel;
  const duration = state.config.videoDuration ?? DEFAULT_CONFIG.videoDuration;
  const count = state.config.generationCount ?? DEFAULT_CONFIG.generationCount;
  const aspectRatio = state.project?.aspectRatio ?? "9:16";

  const toFire = state.scenes.filter((s) => s.status === SCENE_STATUS.IMAGE_DONE);
  if (toFire.length) {
    // Snapshot de videos/posters EXISTENTES antes de disparar (para detectar los nuevos).
    let before = [];
    try { before = (await sendActOrFail(tab.id, ACT.VIDEO_SRCS, {}))?.srcs || []; } catch (_e) {}

    // PASO 1 — disparar todas SIN esperar.
    log(LOG_LEVEL.INFO, `Disparando ${toFire.length} animaciones en paralelo (${model}, ${duration})...`);
    for (const scene of toFire) {
      await ensureState();
      if (!state.queue.running || state.queue.paused) return;
      scene.status = SCENE_STATUS.ANIMATING; scene.videoUrl = null;
      await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING); emitState();
      try {
        const res = await sendActOrFail(tab.id, ACT.ANIMATE_FIRE, {
          prompt: scene.animationPrompt, model, duration, aspectRatio, count, imageUrl: scene.imageUrl, cfg: driverCfg(),
        });
        if (res?.cost) log(LOG_LEVEL.INFO, `${scene.id}: ${res.cost}`);
        log(LOG_LEVEL.INFO, `${scene.id}: animacion disparada.`);
      } catch (e) {
        if (e?.hardStop) { await onHardStop(e.hardStop, e?.message ?? String(e)); return; }
        scene.status = SCENE_STATUS.ERROR; scene.error = e?.message ?? String(e);
        await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.ERROR, scene.error); emitState();
        log(LOG_LEVEL.WARN, `${scene.id} fallo al disparar: ${scene.error}`);
        // Corta la rafaga AL PRIMER fallo (no seguir disparando = menos huella anti-bot).
        if (state.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure) { await pauseForError(`${scene.id} fallo al disparar: ${scene.error}`, scene.id); return; }
      }
      await delay(jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, 0));
    }

    // Ya disparamos todo: NO se necesitan mas clicks trusted. Soltamos el debugger para que la
    // pestaña salga de modo depuracion durante la espera larga (era una causa del congelamiento).
    detachDebuggers();

    // PASO 2 — mapear los videos nuevos a las escenas POR ORDEN (Flow muestra lo mas nuevo primero,
    // asi que el orden DOM es inverso al de disparo -> revertimos).
    const fired = toFire.filter((s) => s.status === SCENE_STATUS.ANIMATING);
    if (fired.length) {
      log(LOG_LEVEL.INFO, `Esperando que aparezcan los ${fired.length} videos...`);
      let newSrcs = [];
      let lastDiag = null;
      try {
        const mapped = await sendActOrFail(tab.id, ACT.MAP_NEW_VIDEOS, { before, total: fired.length });
        newSrcs = mapped?.srcs || [];
        if (mapped?.diag) lastDiag = mapped.diag;
        // Si faltan videos, suele ser Flow marcando tiles con error ("actividad inusual" = anti-abuso por
        // rafaga, NO contenido). Clicamos su "Reintentar" PROPIO (re-dispara en sitio, suele pasar) y
        // re-mapeamos. Hasta flowRetryRounds rondas. Re-adjuntamos el debugger SOLO para el clic trusted.
        const maxRounds = state.config.flowRetryRounds ?? DEFAULT_CONFIG.flowRetryRounds ?? 3;
        for (let round = 0; round < maxRounds && newSrcs.length < fired.length; round++) {
          await ensureState();
          if (!state.queue.running || state.queue.paused) break;
          await ensureDebugger(tab.id);                                       // re-adjunta (su settle de 800ms evita coords corridas)
          const r = await sendActOrFail(tab.id, ACT.RETRY_FAILED_TILES, {});
          detachDebuggers();                                                  // soltar antes de la espera larga (evita congelamiento)
          if (!r?.clicked) break;                                             // no hay tiles con "Reintentar" -> no insistir
          log(LOG_LEVEL.INFO, `Flow marco errores: reintento ronda ${round + 1}/${maxRounds} (${r.clicked} tile(s)); reesperando videos...`);
          const again = await sendActOrFail(tab.id, ACT.MAP_NEW_VIDEOS, { before, total: fired.length });
          newSrcs = again?.srcs || [];
          if (again?.diag) lastDiag = again.diag;
        }
        if (lastDiag && newSrcs.length < fired.length) await saveFailedDiag(lastDiag);  // aun faltan -> deja el DOM capturado
      }
      catch (e) { if (e?.hardStop) { await onHardStop(e.hardStop, e?.message ?? String(e)); return; } }
      // Mapeo por ORDEN solo si aparecieron TODOS (correspondencia 1:1 disparo<->aparicion garantizada).
      // Si faltan, el orden es AMBIGUO: un hueco interno cruzaria el clip de una escena a otra EN SILENCIO.
      // Preferimos fallar fuerte (dejar sin videoUrl -> ERROR + reintento manual) a corromper el video.
      if (newSrcs.length === fired.length) {
        const inFireOrder = newSrcs.slice().reverse();
        fired.forEach((scene, i) => { scene.videoUrl = inFireOrder[i] || null; });
        log(LOG_LEVEL.INFO, `Mapeados ${newSrcs.length}/${fired.length} videos por orden.`);
      } else {
        log(LOG_LEVEL.WARN, `Flow entrego ${newSrcs.length}/${fired.length} videos: NO mapeo por orden (evito clips cruzados a escenas equivocadas). Esas escenas quedan para reintentar.`);
      }
      await saveState();
    }
  }

  // Escenas disparadas que no recibieron video mapeado -> ERROR claro (probable: Flow las encolo).
  for (const s of state.scenes.filter((x) => x.status === SCENE_STATUS.ANIMATING && !x.videoUrl)) {
    s.status = SCENE_STATUS.ERROR; s.error = "no aparecio su video (¿Flow encolo las generaciones?)";
    await saveState(); emitSceneStatus(s.id, SCENE_STATUS.ERROR, s.error); emitState();
    log(LOG_LEVEL.WARN, `${s.id}: ${s.error}`);
  }

  // PASO 3 — recoger cada video (ANIMATING con videoUrl): espera fin + descarga mp4 + frame -> DONE.
  const toCollect = state.scenes.filter((s) => s.status === SCENE_STATUS.ANIMATING && s.videoUrl);
  if (toCollect.length) log(LOG_LEVEL.INFO, `Recogiendo ${toCollect.length} videos...`);
  for (const scene of toCollect) {
    await ensureState();
    if (!state.queue.running || state.queue.paused) return;
    try {
      scene.status = SCENE_STATUS.DOWNLOADING;
      await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DOWNLOADING); emitState();
      const res = await sendActOrFail(tab.id, ACT.ANIMATE_COLLECT, { videoUrl: scene.videoUrl });
      const videoUrl = res?.videoUrl || scene.videoUrl;
      scene.clipFilename = `${scene.id}.mp4`;
      const clipSlug = state.project?.slug || "proyecto";
      const savedClip = await downloadClipToProject(videoUrl, clipSlug, scene.id);
      scene.savedOk = savedClip.via === "server";   // true solo si quedo en public/<slug>/clips/
      if (savedClip.via === "downloads") log(LOG_LEVEL.WARN, `clip ${scene.id} quedo en Descargas (dev-server no respondio): ${savedClip.path}`);
      scene.status = SCENE_STATUS.DONE; scene.error = null;
      await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DONE); emitState(); emitProgress();
      log(LOG_LEVEL.INFO, `${scene.id}: video listo (${scene.clipFilename}).`);
    } catch (e) {
      if (e?.hardStop) { await onHardStop(e.hardStop, e?.message ?? String(e)); return; }
      scene.status = SCENE_STATUS.ERROR; scene.error = e?.message ?? String(e);
      await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.ERROR, scene.error); emitState();
      log(LOG_LEVEL.WARN, `${scene.id} fallo al recoger: ${scene.error}`);
    }
  }

  // PAUSA-EN-FALLO (modo paralelo): si tras los reintentos quedaron escenas sin video, PAUSA la cola
  // (no jala mas trabajos ni sigue el autopiloto). En animacion, las ERROR aqui son de ESTA corrida
  // (runPhaseToEnd ya reactivo las viejas a IMAGE_DONE antes de empezar).
  if (state.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure) {
    const errs = state.scenes.filter((s) => s.status === SCENE_STATUS.ERROR);
    if (errs.length) await pauseForError(`${errs.length} escena(s) sin video tras reintentos: ${errs.map((s) => s.id).join(", ")}`, errs[0].id);
  }
}

// ---------------------------------------------------------------------------
// Modo real: descarga y extraccion de frame
// ---------------------------------------------------------------------------

// Frames extraidos en esta corrida: sceneId -> dataUrl (prev_frame de la siguiente).
// En memoria (los dataUrl son grandes; no se persisten). Si el SW reinicia mid-run,
// la cadena prev_frame se pierde y la escena dependiente fallara/reintentara.
const lastFrames = new Map();

// Descarga una URL (o dataURL) como `filename` via chrome.downloads.
function downloadUrl(url, filename) {
  return new Promise((resolve, reject) => {
    try {
      chrome.downloads.download({ url, filename, saveAs: false, conflictAction: "uniquify" }, (id) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(id);
      });
    } catch (e) { reject(e); }
  });
}

// ---------------------------------------------------------------------------
// Fish Audio (TTS): el service worker llama api.fish.audio DIRECTO (no scraping).
// Por cada escena (y el hook) -> 1 mp3 guardado como <id>.mp3 en la carpeta del proyecto.
// ---------------------------------------------------------------------------

// Llama al endpoint de Fish con TIMESTAMPS (SSE) -> { audio: Uint8Array (mp3), words: [{word,start,end}] }.
// Cada evento SSE trae: audio_base64 (chunk de audio a concatenar EN ORDEN), alignment.segments
// (1 palabra c/u con start/end en seg RELATIVOS al chunk) y chunk_audio_offset_sec (offset global).
// Acumulamos los bytes y, por palabra, start/end + offset (en segundos, sin multiplicar por nada).
async function fishTTSWithTimestamps(text, { apiKey, voiceId, model, speed }) {
  const body = { text, format: "mp3", latency: "normal" };
  if (voiceId) body.reference_id = voiceId;   // la VOZ; vacio = voz por defecto de Fish
  // OPT-IN: velocidad de habla (Fish prosody.speed, 0.5-2.0). Solo si != 1 -> sin el campo, body intacto
  // (comportamiento previo para todos los JSON que no traen audio.voice_speed). historias v2 usa 0.9.
  if (speed && speed !== 1) body.prosody = { speed };
  const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "model": model || "s1" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.message || j.detail || JSON.stringify(j); } catch (_e) {}
    throw new Error(`Fish Audio ${res.status}: ${detail}`);
  }
  const raw = await res.text();   // SSE completo (el stream cierra al terminar la generacion)
  const audioParts = [];
  const words = [];
  for (const block of raw.split(/\n\n/)) {
    const data = block.split(/\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data || data === "[DONE]") continue;
    let ev; try { ev = JSON.parse(data); } catch (_e) { continue; }
    if (ev.audio_base64) audioParts.push(base64ToBytes(ev.audio_base64));
    const offset = typeof ev.chunk_audio_offset_sec === "number" ? ev.chunk_audio_offset_sec : 0;
    const segs = (ev.alignment && Array.isArray(ev.alignment.segments)) ? ev.alignment.segments : [];
    for (const sg of segs) {
      const w = (sg.text || "").trim();
      if (!w) continue;
      words.push({ word: w, start: round3((sg.start || 0) + offset), end: round3((sg.end || 0) + offset) });
    }
  }
  const total = audioParts.reduce((n, a) => n + a.length, 0);
  if (!total) throw new Error("Fish no devolvio audio (stream vacio)");
  const audio = new Uint8Array(total);
  let p = 0; for (const a of audioParts) { audio.set(a, p); p += a.length; }
  return { audio, words };
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function round3(x) { return Math.round((Number(x) || 0) * 1000) / 1000; }

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// Guarda un archivo de voz (mp3 o .words.json) en public/<slug>/voice/<filename>.
// 1) writer local (dev-server) -> ruta EXACTA; 2) fallback chrome.downloads (Descargas/<slug>/voice/).
// body = Uint8Array/ArrayBuffer (audio) o string (json). mime = "audio/mpeg" | "application/json".
async function saveVoiceFile(slug, filename, body, mime) {
  const relPath = `remotion-editor/public/${slug}/voice/${filename}`;
  const writerUrl = state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl;
  try {
    const res = await fetch(`${writerUrl}?path=${encodeURIComponent(relPath)}`, {
      method: "POST", headers: { "Content-Type": mime || "application/octet-stream" }, body,
    });
    // Solo cuenta como guardado si es NUESTRO endpoint /save (responde {ok:true}). Un dev-server
    // viejo responde 200 "ok" en texto SIN escribir -> lo tratamos como fallo y caemos a Descargas.
    if (res.ok) {
      const j = await res.json().catch(() => null);
      if (j && j.ok) return { via: "server", path: relPath };
    }
  } catch (_e) { /* dev-server no corre: caemos a Descargas */ }
  let dataUrl;
  if (typeof body === "string") {
    const bytes = new TextEncoder().encode(body);   // UTF-8 seguro (acentos en .words.json)
    dataUrl = `data:${mime || "application/json"};base64,${arrayBufferToBase64(bytes.buffer)}`;
  } else {
    const ab = body instanceof Uint8Array ? body.buffer : body;
    dataUrl = `data:${mime || "audio/mpeg"};base64,${arrayBufferToBase64(ab)}`;
  }
  await downloadUrl(dataUrl, `${slug}/voice/${filename}`);
  return { via: "downloads", path: `Descargas/${slug}/voice/${filename}` };
}

// Guarda el diagnostico de tiles fallidos (capturado por el driver cuando faltan videos) en
// public/debug/, para mapear despues el "Reintentar" propio de Flow. Loguea un resumen al panel.
async function saveFailedDiag(diag) {
  if (!diag) return;
  const nT = (diag.tiles || []).length, nR = (diag.retryButtons || []).length;
  log(LOG_LEVEL.WARN, `DIAG fallo de video: ${nT} tile(s) con texto de error, ${nR} boton(es) de reintento detectados.`);
  for (const b of (diag.retryButtons || [])) log(LOG_LEVEL.INFO, `  boton reintento?: "${b.text}"${b.aria ? ` [aria=${b.aria}]` : ""}`);
  const relPath = `remotion-editor/public/debug/failed-tiles-${Date.now()}.json`;
  const writerUrl = state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl;
  try {
    const res = await fetch(`${writerUrl}?path=${encodeURIComponent(relPath)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(diag, null, 2),
    });
    if (res.ok) { const j = await res.json().catch(() => null); if (j && j.ok) { log(LOG_LEVEL.INFO, `DIAG guardado en ${relPath}`); return; } }
  } catch (_e) { /* dev-server caido */ }
  log(LOG_LEVEL.WARN, "DIAG no se pudo guardar (dev-server caido). Revisa el log de arriba.");
}

// Genera la voz de cada escena (+ hook) con Fish Audio. limit -> solo las primeras N escenas (prueba).
async function onGenerateAudio(message) {
  await applySecrets();   // recarga la key desde secrets.local.json por si el dev-server arranco tarde
  const apiKey = (state.config.fishApiKey || "").trim();
  if (!apiKey) { log(LOG_LEVEL.ERROR, "Fish Audio: falta tu API key. Revisa secrets.local.json y que 'flowbot start' este corriendo."); return; }

  // Voz: config.fishVoiceId (si la pegaste) GANA; si no, la del preset (project.preset); si no, DEFAULT_VOICE_ID.
  // NUNCA queda vacio: aunque el JSON olvide "preset", SIEMPRE usa la voz default (no la generica de Fish).
  const preset = state.project?.preset || "";
  const presetCfg = FISH_PRESETS[preset] || null;
  const cfgVoice = (state.config.fishVoiceId || "").trim();
  const presetVoice = pickPresetVoiceId(presetCfg);
  const voiceId = cfgVoice || presetVoice || DEFAULT_VOICE_ID;
  const model = state.config.fishModel || presetCfg?.model || DEFAULT_CONFIG.fishModel;
  const src = cfgVoice ? "config" : (presetVoice ? `preset "${preset}"` : "DEFAULT (sin preset)");
  log(LOG_LEVEL.INFO, `Fish Audio: voz desde ${src} (${voiceId}).`);
  if (!presetVoice && !cfgVoice) {
    log(LOG_LEVEL.WARN, `Fish Audio: el JSON no trae "preset" -> usando voz default ${DEFAULT_VOICE_ID}. Agrega "preset":"esqueletos" al JSON.`);
  }

  const slug = state.project?.slug || "proyecto";
  const limit = (typeof message.limit === "number" && message.limit > 0) ? message.limit : null;
  const includeHook = message.includeHook !== false;

  // Lista de items {id, text}: hook (si aplica) + escenas con voiceover, en orden.
  const items = [];
  // hook.voiceover acepta string ("...") U objeto ({ text: "..." }) igual que las escenas (scenes[].voiceover.text).
  const hv = state.project?.hook?.voiceover;
  const hookText = typeof hv === "string" ? hv : (hv && typeof hv.text === "string" ? hv.text : "");
  if (includeHook && hookText.trim()) items.push({ id: "hook", text: hookText.trim() });
  const withVoice = (state.scenes || []).filter((s) => (s.voiceoverText || "").trim());
  for (const s of (limit ? withVoice.slice(0, limit) : withVoice)) items.push({ id: s.id, text: s.voiceoverText.trim() });

  // historias VOZ-CONTINUA: UNA sola generacion desde tts_export.full_script -> full.mp3 + full.words.json
  // (NO 1 mp3 por escena). La narracion suena continua, sin costura entre cortes. El editor mapea cada imagen
  // a su ventana con align/inject-words.mjs (de los timestamps de Fish). Otros presets: 1 mp3 por escena (igual).
  const fullScript = state.project?.ttsExport?.full_script;
  if (preset === "historias" && typeof fullScript === "string" && fullScript.trim()) {
    items.splice(0, items.length, { id: "full", text: fullScript.trim() });
    log(LOG_LEVEL.INFO, "historias: 1 voz continua desde tts_export.full_script -> full.mp3 + full.words.json (sin costura entre escenas).");
  }

  if (!items.length) { log(LOG_LEVEL.WARN, "No hay textos de voz (scenes[].voiceover.text) para generar."); return; }

  log(LOG_LEVEL.INFO, `Fish Audio: generando ${items.length} audio(s)+timestamps -> ${slug}/voice/ (modelo ${model})...`);
  let okCount = 0, viaDownloads = false, noWords = 0;
  for (const it of items) {
    await ensureState();
    try {
      const { audio, words } = await fishTTSWithTimestamps(it.text, { apiKey, voiceId, model, speed: state.project?.voiceSpeed ?? 1 });
      const savedMp3 = await saveVoiceFile(slug, `${it.id}.mp3`, audio, "audio/mpeg");
      if (savedMp3.via === "downloads") viaDownloads = true;
      // Sidecar de palabras: solo si Fish devolvio alignment. Sin el, el editor usa karaoke estimado.
      let wordsInfo = "sin timestamps";
      if (words.length) {
        const savedWords = await saveVoiceFile(slug, `${it.id}.words.json`, JSON.stringify(words), "application/json");
        if (savedWords.via === "downloads") viaDownloads = true;
        wordsInfo = `${words.length} palabras`;
      } else { noWords++; }
      okCount++;
      log(LOG_LEVEL.INFO, `voz lista: ${it.id}.mp3 (${Math.round(audio.length / 1024)} KB, ${wordsInfo}) -> ${savedMp3.path}`);
    } catch (e) {
      log(LOG_LEVEL.WARN, `voz fallo (${it.id}): ${e?.message ?? e}`);
    }
  }
  log(LOG_LEVEL.INFO, `Fish Audio: ${okCount}/${items.length} audios listos.`);
  if (noWords) log(LOG_LEVEL.WARN, `${noWords} sin timestamps (el editor usara karaoke estimado para esas escenas).`);
  if (viaDownloads) log(LOG_LEVEL.WARN, `Algunos cayeron en Descargas/${slug}/voice/ (el dev-server no respondio). Corre 'npm run dev' o muevelos a remotion-editor/public/${slug}/voice/.`);
}

// Espera a que una descarga de chrome.downloads termine; devuelve el item (con .filename ABSOLUTO).
function waitDownloadComplete(id, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => chrome.downloads.search({ id }, (items) => {
      const it = items && items[0];
      if (it && (it.state === "complete" || it.state === "interrupted")) return resolve(it);
      if (Date.now() - start > timeoutMs) return resolve(it || null);
      setTimeout(check, 500);
    });
    check();
  });
}

// Descarga un clip de Flow y, si el dev-server corre, lo MUEVE a remotion-editor/public/<slug>/clips/.
// chrome.downloads maneja cookies+redirect (probado); el dev-server (acceso a disco) lo reubica al
// proyecto. Si el dev-server no responde, el clip queda en Descargas/<slug>/clips/<id>.mp4 (fallback).
async function downloadClipToProject(url, slug, id) {
  const filename = `${id}.mp4`;
  const downloadsRel = `${slug}/clips/${filename}`;
  const dlId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename: downloadsRel, saveAs: false, conflictAction: "overwrite" }, (theId) => {
      const e = chrome.runtime.lastError; if (e) return reject(new Error(e.message)); resolve(theId);
    });
  });
  const item = await waitDownloadComplete(dlId);
  if (!item || item.state !== "complete" || !item.filename) return { via: "downloads", path: `Descargas/${downloadsRel}` };
  const to = `remotion-editor/public/${slug}/clips/${filename}`;
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  try {
    const res = await fetch(`${base}/move?from=${encodeURIComponent(item.filename)}&to=${encodeURIComponent(to)}`, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (res.ok && j && j.ok) return { via: "server", path: to };
  } catch (_e) { /* dev-server no corre: queda en Descargas */ }
  return { via: "downloads", path: item.filename };
}

// Garantiza un offscreen document para extraer frames (DOM fuera de pantalla).
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen/frame-extractor.html"),
    reasons: ["BLOBS"],
    justification: "Extraer el ultimo frame del video generado.",
  });
}

// Extrae el ultimo frame: el background descarga los BYTES (host_permissions de
// labs.google) y los pasa al offscreen, que crea un Blob URL de origen-extension
// (canvas SIN taint) para dibujar y exportar PNG.
// CONFIRMAR en corrida real: si el video se sirve desde un CDN distinto (p.ej.
// *.googleusercontent.com), hay que anadir ese host a host_permissions del manifest.
async function extractLastFrame(videoUrl, sceneId) {
  await ensureOffscreen();
  const resp = await fetch(videoUrl, { credentials: "include" });
  if (!resp.ok) throw new Error(`fetch video ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const mime = resp.headers.get("content-type") || "video/mp4";
  return await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "extract_last_frame_buf", buf, mime, sceneId }, (r) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!r || !r.ok) return reject(new Error(r?.error || "offscreen sin respuesta"));
      resolve(r.dataUrl);
    });
  });
}

// Envia un ACT.* a la pestana y espera RES.ACTION_RESULT. Lanza Error si falla
// o si el driver responde no-implementado. Detecta parada dura via RES especiales.
async function sendActOrFail(tabId, action, payload) {
  let resp;
  try {
    resp = await sendToTab(tabId, msg(action, payload));
  } catch (e) {
    throw new Error(`content no respondio a ${action}: ${e?.message ?? e}`);
  }

  // El stub del driver responde {ok:false, error:'no implementado ...'}.
  if (!resp) {
    throw new Error(`sin respuesta del content para ${action}`);
  }
  if (resp.type === RES.CAPTCHA_DETECTED) {
    const err = new Error("captcha"); err.hardStop = "captcha"; throw err;
  }
  if (resp.type === RES.NO_CREDITS) {
    const err = new Error("no_credits"); err.hardStop = "no_credits"; throw err;
  }
  if (resp.type === RES.RATE_LIMIT) {
    const err = new Error("rate_limit"); err.hardStop = "rate_limit"; throw err;
  }
  if (resp.ok === false) {
    throw new Error(resp.error ?? `accion ${action} fallo`);
  }
  return resp.data ?? resp;
}

// Promesa sobre chrome.tabs.sendMessage.
function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        resolve(resp ?? null);
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Navega la pestana a una URL y espera a que cargue (para ir a la home antes de "Nuevo proyecto").
function navigateTab(tabId, url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(onUpdated); clearTimeout(timer); setTimeout(resolve, 1500); };
    const onUpdated = (id, info) => { if (id === tabId && info.status === "complete") finish(); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    const timer = setTimeout(finish, 15000);
    chrome.tabs.update(tabId, { url }, () => void chrome.runtime.lastError);
  });
}

// Busca la pestana del PROVEEDOR activo: Flow (labs.google) o Grok (grok.com). Prefiere la activa.
async function findFlowTab(provider) {
  const pattern = (provider || state.config.provider) === "grok" ? "https://grok.com/*" : "https://labs.google/*";
  try {
    const tabs = await chrome.tabs.query({ url: pattern });
    return tabs.find((t) => t.active) ?? tabs[0] ?? null;
  } catch (e) {
    console.warn("findFlowTab:", e);
    return null;
  }
}

// Garantiza que el content script (driver) este presente en la pestana. Si no responde
// al PING, lo inyecta on-demand con chrome.scripting (evita depender de recargar la pestana
// tras recargar la extension). El guard del PING evita doble-inyeccion (listeners duplicados).
async function ensureContentScript(tabId, provider) {
  try {
    const r = await sendToTab(tabId, msg(ACT.PING));
    if (r && r.ok) return;
  } catch (_e) { /* sin listener: inyectar */ }
  const files = (provider || state.config.provider) === "grok"
    ? ["content/grok-driver.js"]
    : ["content/selectors.config.js", "content/flow-driver.js"];
  await chrome.scripting.executeScript({ target: { tabId }, files });
  // Pequena espera para que registre el onMessage.
  await delay(300);
}

// Grok navega a /imagine/post/<id> tras CADA generacion; ese composer de detalle NO tiene boton
// "Enviar". Antes de generar/animar la siguiente escena volvemos a grok.com/imagine (composer fresco).
async function ensureGrokCompositor(tabId) {
  let tab = null;
  try { tab = await chrome.tabs.get(tabId); } catch (_e) {}
  if (/^https:\/\/grok\.com\/imagine\/?($|\?)/.test(tab?.url || "")) return; // ya en el composer fresco
  await new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url: "https://grok.com/imagine" }, () => {
      const e = chrome.runtime.lastError; if (e) return reject(new Error(e.message)); resolve();
    });
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    let t = null; try { t = await chrome.tabs.get(tabId); } catch (_e) {}
    if (t && t.status === "complete" && /grok\.com\/imagine/.test(t.url || "")) break;
    await delay(300);
  }
  await delay(1200); // hidratacion React del composer
}

// ---------------------------------------------------------------------------
// Click TRUSTED via chrome.debugger (CDP). Flow exige isTrusted=true para "Generar"
// (anti-bot); un click sintetico del content script no funciona. CDP Input.* SI es trusted.
// El content script nos pide el click pasando coords; mantenemos el debugger adjunto
// durante la corrida (Chrome muestra la barra "esta depurando este navegador").
// ---------------------------------------------------------------------------

const attachedTabs = new Set();

function debuggerAttach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      const e = chrome.runtime.lastError;
      if (e && !/already attached/i.test(e.message)) return reject(new Error(e.message));
      resolve();
    });
  });
}

function debuggerSend(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params ?? {}, (res) => {
      const e = chrome.runtime.lastError;
      if (e) return reject(new Error(e.message));
      resolve(res);
    });
  });
}

async function ensureDebugger(tabId) {
  if (attachedTabs.has(tabId)) return;
  // GUARDA ANTI-CUELGUE: nunca mas de 2 sesiones CDP adjuntas a la vez (3 crasheaban el renderer; en el
  // pipeline paralelo son 1 por proveedor = 2 max). Si ya hay 2 en OTRAS pestanas, esperamos a que se libere.
  const t0 = Date.now();
  while (attachedTabs.size >= 2 && !attachedTabs.has(tabId) && Date.now() - t0 < 60000) {
    await delay(500);
  }
  // Limite DURO: NO adjuntar una 3a sesion (es lo que crashea el renderer). Lanzar -> classifyError lo trata
  // como 'environment' (no reintentable) -> pausa controlada en vez de tumbar la pestana.
  if (attachedTabs.size >= 2 && !attachedTabs.has(tabId)) throw new Error("no se pudo adjuntar el debugger: 2 sesiones CDP ya ocupadas (limite anti-cuelgue)");
  await debuggerAttach(tabId);
  attachedTabs.add(tabId);
  // Al adjuntar por 1a vez, Chrome muestra la barra "...esta depurando este navegador" que EMPUJA
  // la pagina ~30px hacia abajo. Si calculamos coordenadas antes de que aparezca, el 1er click
  // trusted cae corrido (Flow no recibia el prompt hasta el 2do intento). Esperamos a que asiente.
  await new Promise((r) => setTimeout(r, 800));
}

// Click trusted en coordenadas (CSS px del viewport).
async function trustedClick(tabId, x, y) {
  if (tabId == null) throw new Error("trusted_click sin tabId");
  await ensureDebugger(tabId);
  await debuggerSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await debuggerSend(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await debuggerSend(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

function detachDebuggers() {
  for (const tabId of attachedTabs) {
    chrome.debugger.detach({ tabId }, () => void chrome.runtime.lastError);
  }
  attachedTabs.clear();
}

// Detach de UNA sola pestana (para el pipeline paralelo: un carril NO debe soltar el debugger del otro).
function detachDebugger(tabId) {
  if (tabId == null) return;
  chrome.debugger.detach({ tabId }, () => void chrome.runtime.lastError);
  attachedTabs.delete(tabId);
}

// Suelta SOLO el debugger de la(s) pestana(s) de un proveedor (lo usa runLane al terminar su carril).
// Itera attachedTabs y filtra por el HOST del proveedor (NO findFlowTab(.active), que podia devolver otra
// pestana si el usuario cambio el foco durante la espera larga -> se soltaba el debugger equivocado y la
// sesion CDP real quedaba fugada, taponando el limite de 2 sesiones). Si la URL no resuelve, NO la tocamos
// (la limpia el detach global al final del paralelo) para no arriesgar la pestana del carril hermano.
async function detachProvider(provider) {
  const host = (provider || state.config.provider) === "grok" ? "grok.com" : "labs.google";
  for (const tabId of [...attachedTabs]) {
    let url = ""; try { url = (await chrome.tabs.get(tabId))?.url || ""; } catch (_e) {}
    if (url && url.includes(host)) detachDebugger(tabId);
  }
}

// Limpia si el usuario cierra DevTools / se despega el debugger.
chrome.debugger?.onDetach?.addListener((src) => {
  if (src?.tabId != null) attachedTabs.delete(src.tabId);
});
chrome.tabs?.onRemoved?.addListener((tabId) => attachedTabs.delete(tabId));

// ---------------------------------------------------------------------------
// Reporte final de fallos
// ---------------------------------------------------------------------------

function reportFailuresAtEnd() {
  const failed = state.scenes.filter((s) => s.status === SCENE_STATUS.ERROR);
  if (failed.length === 0) {
    log(LOG_LEVEL.INFO, "Todas las escenas completadas sin errores.");
    return;
  }
  const ids = failed.map((s) => `${s.id} (${s.error ?? "sin detalle"})`).join(", ");
  log(LOG_LEVEL.WARN, `Escenas con error: ${ids}`);
}

// ---------------------------------------------------------------------------
// AUTOPILOTO: proyecto+personajes en Flow -> imagenes -> animacion -> audio, encadenado.
// Cada fase usa los runners ya probados; aqui solo las encadenamos y esperamos a que terminen.
// ---------------------------------------------------------------------------

// Corre UNA fase de la cola hasta que termina (await). Devuelve false si hubo parada dura.
async function runPhaseToEnd(phase) {
  await ensureState();
  // image-only (historias): no hay paso de animacion; los stills SON el asset final. Saltar la fase la
  // invoque quien la invoque (autopiloto, fallback del paralelo, reanudacion). Gateado -> otros presets intactos.
  if (phase === "animation" && state.project?.imageOnly) {
    log(LOG_LEVEL.INFO, "Fase de animacion omitida (preset image-only / historias).");
    return true;
  }
  state.queue.phase = phase;
  // Reactiva ERROR SOLO en imagenes (gratis). En animacion NO (evita re-gasto silencioso de puntos).
  if (phase === "images") {
    for (const s of state.scenes) {
      if (s.status === SCENE_STATUS.ERROR && !s.imageUrl) { s.status = SCENE_STATUS.PENDING; s.attempts = 0; s.error = null; }
    }
  }
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  emitState();
  await orchestrator.runQueue();  // vuelve cuando la fase termina o se pausa (parada dura)
  await ensureState();
  return !state.queue.paused;  // paused = parada dura (captcha / sin creditos)
}

// PIPELINE PARALELO (flag config.parallelPipeline): un carril genera imagenes en un proveedor y OTRO anima
// en el otro A LA VEZ (carriles por fase, status disjuntos -> sin colision). Guardas: keepAlive (no muere
// el SW en la espera de Grok), detach por pestana (cada carril suelta SOLO el suyo), semaforo CDP max 2.
async function runPhasesParallel() {
  await ensureState();
  const imgProv = state.project?.imageProvider || state.config.provider;
  const animProv = state.project?.animationProvider || state.config.provider;
  // GUARDA: el paralelo SOLO tiene sentido con proveedores DISTINTOS (pestanas/sesiones CDP distintas).
  // Mismo proveedor = misma pestana/cuenta -> 2 sesiones CDP a la misma pestana corrompen y cuelgan, y
  // los carriles comparten el bucket de ritmo. Caemos a SECUENCIAL (comportamiento probado).
  if (imgProv === animProv) {
    log(LOG_LEVEL.WARN, `Pipeline paralelo necesita proveedores DISTINTOS (imagen y animacion son '${imgProv}'); corro SECUENCIAL.`);
    return (await runPhaseToEnd("images")) && (await runPhaseToEnd("animation"));
  }
  // Reactiva ERROR SOLO en escenas sin imagen aun (re-gen de imagen = gratis); las que ya tienen imagen y
  // fallaron al animar quedan en ERROR (no re-gasta video en silencio).
  for (const s of state.scenes) {
    if (s.status === SCENE_STATUS.ERROR && !s.skipped && !s.imageUrl) { s.status = SCENE_STATUS.PENDING; s.attempts = 0; s.error = null; }
  }
  state.queue.paused = false;
  state.queue.running = true;
  state.queue.mode = "parallel";   // marcador para que resumeIfInterrupted reanude en paralelo (no secuencial)
  state.queue.heartbeatAt = Date.now();
  loopRunning = true;   // ocupa el worker: pollQueue/launchLoop no encienden el bucle UNICO en paralelo
  await saveState();
  emitState();
  try { chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 }); } catch (_e) {}
  log(LOG_LEVEL.INFO, `PIPELINE PARALELO: imagenes en ${imgProv} + animacion en ${animProv} a la vez.`);
  // allSettled: si un carril rechaza, esperamos a que el OTRO termine de verdad (su try/finally garantiza
  // running=false), en vez de dejarlo huerfano gastando mientras creemos que la corrida acabo.
  const results = await Promise.allSettled([
    orchestrator.runLane({ laneId: "images", phase: "images", provider: imgProv }),
    orchestrator.runLane({ laneId: "animation", phase: "animation", provider: animProv }),
  ]);
  for (const r of results) if (r.status === "rejected") log(LOG_LEVEL.ERROR, `Carril fallo: ${r.reason?.message ?? r.reason}`);
  loopRunning = false;
  try { chrome.alarms.clear("keepAlive"); } catch (_e) {}
  detachDebuggers();   // ambos carriles ya terminaron (allSettled) -> soltar todo
  await ensureState();
  state.queue.running = false;
  state.queue.mode = null;
  await saveState();
  reportFailuresAtEnd();
  emitState(); emitProgress();
  return !state.queue.paused;
}

// Prepara Flow: proyecto nuevo + personajes del proyecto. Degrada con gracia si esos pasos aun
// no estan mapeados (usa el proyecto abierto / el personaje creado a mano).
async function ensureFlowReady() {
  const tab = await findFlowTab();
  if (!tab) throw new Error("abre Flow (labs.google) en una pestana y reintenta");

  // MODO REUSE: usa el proyecto ABIERTO (con Huesito/Socrates ya creados). No crea proyecto ni sube
  // personajes (Flow no acepta el archivo por codigo de forma fiable). El compositor entra a modo
  // normal solo (configureComposer cierra el panel Agente). El driver adjunta los personajes por nombre.
  if (state.config.flowReuseProject) {
    await ensureContentScript(tab.id);
    log(LOG_LEVEL.INFO, "AUTOPILOTO: usando el proyecto Flow ABIERTO (personajes pre-creados). No creo proyecto.");
    return;
  }

  // Proyecto NUEVO: navegamos a la home de Flow y clic "Nuevo proyecto" -> /project/<id>.
  let freshProject = false;
  try {
    await navigateTab(tab.id, state.config.flowUrl || DEFAULT_CONFIG.flowUrl);
    await ensureContentScript(tab.id);
    await sendActOrFail(tab.id, ACT.NEW_PROJECT, { title: state.project?.title || "Auto" });
    freshProject = true;
    log(LOG_LEVEL.INFO, "Proyecto nuevo creado en Flow.");
  } catch (e) {
    log(LOG_LEVEL.WARN, `Proyecto nuevo no disponible (${e?.message ?? e}). Uso el proyecto Flow abierto.`);
    await ensureContentScript(tab.id);
  }

  // Personajes del proyecto: crear cada uno subiendo su png via CDP. En proyecto NUEVO no hace
  // falta checar si existe (esta vacio); en modo degradado (proyecto abierto) si checamos.
  const chars = state.project?.characters || {};
  for (const [id, c] of Object.entries(chars)) {
    const name = (c && c.display_name) || id;
    try {
      if (!freshProject) {
        const has = await sendActOrFail(tab.id, ACT.HAS_CHARACTER, { name });
        if (has?.exists) { log(LOG_LEVEL.INFO, `Personaje "${name}" ya existe en el proyecto.`); continue; }
      }
      await createCharacterInFlow(tab.id, id, c, name);
      log(LOG_LEVEL.INFO, `Personaje "${name}" creado en Flow.`);
    } catch (e) {
      log(LOG_LEVEL.WARN, `Personaje "${name}": ${e?.message ?? e}. Si ya lo creaste a mano, el driver lo reutiliza.`);
    }
  }
}

// Sube la imagen del personaje a Flow (CDP) y crea el Personaje con su nombre.
async function createCharacterInFlow(tabId, id, c, name) {
  const rel = (c && c.reference_asset) || `assets/characters/${id}_ref.png`;
  const base = (state.config.charFileUrl || DEFAULT_CONFIG.charFileUrl);
  const fileRes = await fetch(`${base}?path=${encodeURIComponent(rel)}`).then((r) => r.json()).catch(() => null);
  if (!fileRes?.ok) throw new Error(`no encuentro ${rel} (¿corre el dev-server y existe el png?)`);
  await sendActOrFail(tabId, ACT.REVEAL_UPLOAD_INPUT, {});   // el driver abre el dialogo y deja el input listo
  await cdpSetFileInput(tabId, fileRes.abspath);              // CDP: setea el archivo local en el input[type=file]
  await sendActOrFail(tabId, ACT.CREATE_CHARACTER, { name }); // el driver termina de crear el Personaje
}

// Pone un archivo LOCAL en el primer input[type=file] de la pagina via CDP (lo unico que puede
// subir archivos del disco; un content script no puede por seguridad). Requiere el debugger adjunto.
async function cdpSetFileInput(tabId, absPath) {
  await ensureDebugger(tabId);
  await debuggerSend(tabId, "DOM.enable", {});
  const { root } = await debuggerSend(tabId, "DOM.getDocument", { depth: -1 });
  const { nodeId } = await debuggerSend(tabId, "DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"]' });
  if (!nodeId) throw new Error("no hay input[type=file] visible (¿abrio el dialogo de subida?)");
  const files = Array.isArray(absPath) ? absPath : [absPath];
  await debuggerSend(tabId, "DOM.setFileInputFiles", { files, nodeId });
}

// Config de tipeo/pausa que se PASA a los drivers (los content scripts NO leen state.config). Asi la
// configuracion avanzada (humanTyping ON/OFF, reviewPause) controla de verdad como tipean el prompt y
// cuanto esperan antes de Enviar. Ausente en el payload -> el driver usa sus defaults (= comportamiento previo).
function driverCfg() {
  const c = state.config || {};
  return {
    humanTyping: c.humanTyping !== false,
    reviewMinMs: c.reviewPauseMinMs ?? DEFAULT_CONFIG.reviewPauseMinMs,
    reviewMaxMs: c.reviewPauseMaxMs ?? DEFAULT_CONFIG.reviewPauseMaxMs,
  };
}

// Encadena TODO el flujo de un proyecto ya cargado: Flow listo -> imagenes -> animacion -> audio.
// FASE INGREDIENTES (opcional, ANTES de imagenes): genera character_edited / entity / location_plate UNA
// vez y guarda su imagen en state.project.ingredients[] (Flow: imageUrl = tile reutilizable via ⋮; Grok:
// imageFilePath = PNG en disco reutilizable por CDP). Idempotente: salta los que ya tienen imagen (sobrevive
// pausa/reinicio del SW). Las imagenes NO gastan puntos (solo la animacion) -> fase barata. JSON sin
// 'ingredients' = no-op (flujo actual intacto). Devuelve false si hubo parada dura / pausa.
async function runIngredientsPhase() {
  await ensureState();
  const ings = state.project?.ingredients || [];
  if (!ings.length) return true;                       // sin ingredientes -> no-op
  const provider = state.project?.imageProvider || state.config.provider;

  if (state.config.dryRun) {
    for (const ing of ings) log(LOG_LEVEL.INFO, `[dry-run] ingrediente ${ing.id} (${ing.type}) -> ${ing.outputFile}`);
    return true;
  }

  // Idempotencia: ya generado = tiene imageUrl (Flow) o imageFilePath (Grok). Saga: la imagen persiste en
  // state; entre videos distintos se re-genera (las imagenes son gratis) -> reuso en-disco entre Partes pendiente.
  const hasImg = (g) => (provider === "grok" ? !!g.imageFilePath : !!g.imageUrl);
  const pending = ings.filter((g) => !hasImg(g));
  if (!pending.length) { log(LOG_LEVEL.INFO, `Ingredientes: ${ings.length} ya generados; no re-genero.`); return true; }
  log(LOG_LEVEL.INFO, `FASE INGREDIENTES (${provider}): generando ${pending.length}/${ings.length}...`);

  const tab = await findFlowTab(provider);
  if (!tab) throw new Error(`No hay pestana de ${provider === "grok" ? "Grok" : "Flow"} abierta para generar ingredientes.`);
  await ensureContentScript(tab.id, provider);
  if (provider !== "grok") await ensureDebugger(tab.id);   // Flow: pre-adjunta una vez (Grok lo hace por item)

  const aspectRatio = state.project?.aspectRatio ?? "9:16";
  const count = state.config.generationCount ?? DEFAULT_CONFIG.generationCount;
  const chars = state.project?.characters || {};
  const slug = state.project?.slug || "proyecto";
  // SIN ritmo artificial entre ingredientes: cada generacion de Grok YA tarda ~20s (espaciado natural), y
  // meter encima el interSceneDelay+warmup hacia la fase eterna (~8 min para 10) y parecia congelada. El
  // ritmo configurado SIGUE aplicando entre ESCENAS (produccion sostenida); aqui no hace falta. La red de
  // seguridad reactiva (onRateLimit / "actividad inusual") cubre cualquier rafaga.
  for (const ing of pending) {
    await ensureState();
    if (state.queue.paused) return false;
    try {
      if (provider === "grok") {
        await ensureGrokCompositor(tab.id);              // composer fresco (la generacion previa dejo /post)
        await ensureContentScript(tab.id, "grok");
        await ensureDebugger(tab.id);
        try { await sendActOrFail(tab.id, ACT.CLEAR_REFS, {}); } catch (_e) {}
        // character_edited: subir el PNG base como referencia para "vestirlo" con edit_prompt.
        if (ing.type === "character_edited" && ing.base) {
          const entry = chars[ing.base];
          if (entry?.reference_asset) {
            const p = await resolveCharFile(entry.reference_asset);
            await cdpSetFileInput(tab.id, [p]);
            log(LOG_LEVEL.INFO, `Ingrediente ${ing.id}: base '${ing.base}' subido a Grok para vestirlo.`);
          } else log(LOG_LEVEL.WARN, `Ingrediente ${ing.id}: base '${ing.base}' sin reference_asset; genero sin referencia.`);
        }
        const img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, { prompt: ing.prompt, cfg: driverCfg() });
        if (!img?.imageUrl) throw new Error("Grok no devolvio URL de imagen");
        if (img?.variantCount > 1) log(LOG_LEVEL.INFO, `Ingrediente ${ing.id}: Grok genero ${img.variantCount} variaciones; uso la 1a (determinista).`);
        ing.imageUrl = img.imageUrl;
        const saved = await downloadImageForRef(img.imageUrl, slug, `ingredient_${ing.id}`);
        ing.imageFilePath = saved.abspath || null;
        detachDebugger(tab.id);
      } else {
        // Flow: character_edited usa el Personaje base como referencia "+"; entity/plate sin referencia.
        const characterNames = (ing.type === "character_edited" && ing.base && chars[ing.base]?.display_name)
          ? [chars[ing.base].display_name] : [];
        const img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, { prompt: ing.prompt, characterNames, sceneRefImageUrls: [], aspectRatio, count, cfg: driverCfg() });
        if (!img?.imageUrl) throw new Error("Flow no devolvio URL de imagen");
        ing.imageUrl = img.imageUrl;   // tile en la grilla de Flow (se adjunta luego en las escenas via ⋮)
      }
      await saveState();
      log(LOG_LEVEL.INFO, `Ingrediente listo: ${ing.id} (${ing.type}).`);
    } catch (e) {
      detachDebugger(tab.id);
      if (e?.hardStop) { await onHardStop(e.hardStop, e?.message); return false; }
      log(LOG_LEVEL.ERROR, `Ingrediente ${ing.id} fallo: ${e?.message ?? e}`);
      await pauseForError(`ingrediente ${ing.id}: ${e?.message ?? e}`, null);
      return false;
    }
  }
  if (provider !== "grok") detachDebugger(tab.id);
  log(LOG_LEVEL.INFO, "FASE INGREDIENTES completa.");
  return true;
}

async function onRunAll() {
  // Guard anti-reentrada de la CORRIDA COMPLETA. pollQueue se dispara por alarma; mientras esta corrida
  // await-ea la fase de INGREDIENTES (donde loopRunning aun es false), una 2a alarma tomaba OTRO job y
  // cargaba su JSON encima -> pisaba state.project y reventaba el ingrediente en curso ("message channel
  // closed"). autopilotBusy cubre TODO onRunAll (ingredientes + fases), no solo el bucle de escenas.
  if (autopilotBusy) { log(LOG_LEVEL.WARN, "AUTOPILOTO: ya hay una corrida activa; ignoro la reentrada."); return; }
  autopilotBusy = true;
  try {
  await applySecrets();
  await ensureState();
  if (!state.project || !state.scenes?.length) { log(LOG_LEVEL.WARN, "AUTOPILOTO: no hay proyecto cargado."); return; }
  log(LOG_LEVEL.INFO, `AUTOPILOTO: "${state.project.title}" — preparando Flow...`);

  try { await ensureFlowReady(); }
  catch (e) { log(LOG_LEVEL.ERROR, `AUTOPILOTO detenido: ${e?.message ?? e}`); return; }

  // FASE 0: ingredientes (si el JSON los trae). Antes de imagenes; no-op si no hay. Parada dura -> detener.
  try { if (!(await runIngredientsPhase())) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en ingredientes."); return; } }
  catch (e) { log(LOG_LEVEL.ERROR, `AUTOPILOTO detenido en ingredientes: ${e?.message ?? e}`); return; }

  // image-only (historias): el paralelo no aplica (no hay carril de animacion); forzar secuencial.
  if (state.config.parallelPipeline && !state.project?.imageOnly) {
    // Carriles a la vez: imagenes en un proveedor + animacion en el otro.
    if (!(await runPhasesParallel())) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido (parada dura en pipeline paralelo)."); return; }
  } else {
    log(LOG_LEVEL.INFO, "AUTOPILOTO: generando imagenes...");
    if (!(await runPhaseToEnd("images"))) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en imagenes (parada dura)."); return; }

    if (state.project?.imageOnly) {
      log(LOG_LEVEL.INFO, "AUTOPILOTO: preset image-only (historias) -> sin animacion.");
    } else {
      log(LOG_LEVEL.INFO, "AUTOPILOTO: animando...");
      if (!(await runPhaseToEnd("animation"))) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en animacion (parada dura)."); return; }
    }
  }

  log(LOG_LEVEL.INFO, "AUTOPILOTO: generando voz (Fish)...");
  await onGenerateAudio({ includeHook: true });

  // Limpieza de Flow: SOLO si TODOS los clips se descargaron al proyecto (savedOk). Salvaguarda:
  // si falta alguno, NO borra nada (se preservan los medios en Flow para no perder trabajo).
  // La ANIMACION es la fase que deja medios pesados en Flow: gateamos por el proveedor de animacion
  // POR FASE (no el global config.provider), igual que el dispatch. Asi imagen=flow/anim=grok NO borra
  // imagenes de Flow por error, e imagen=grok/anim=flow SI limpia los videos que quedaron en Flow.
  const cleanupAnimProv = state.project?.animationProvider || state.config.provider;
  if (state.config.cleanupFlowAfterDownload && cleanupAnimProv !== "grok") {
    await ensureState();
    const total = state.scenes.length;
    const ok = state.scenes.filter((s) => s.savedOk).length;
    if (total > 0 && ok === total) {
      log(LOG_LEVEL.INFO, `AUTOPILOTO: ${ok}/${total} clips descargados; limpiando medios de Flow...`);
      const tab = await findFlowTab("flow");
      if (tab) {
        try {
          const r = await sendActOrFail(tab.id, ACT.CLEANUP_MEDIA, {});
          log(LOG_LEVEL.INFO, `Flow limpiado: ${r?.removed ?? 0} medios a la papelera.`);
        } catch (e) { log(LOG_LEVEL.WARN, `Limpieza de Flow fallo: ${e?.message ?? e}`); }
      }
    } else {
      log(LOG_LEVEL.WARN, `AUTOPILOTO: NO limpio Flow (descargados ${ok}/${total}). Se preservan los medios.`);
    }
  }

  log(LOG_LEVEL.INFO, "AUTOPILOTO: medios listos en remotion-editor/public/. El orquestador (build.mjs --watch) renderiza el video.");
  } finally { autopilotBusy = false; }
}

// ---------------------------------------------------------------------------
// Cola: el SW saca trabajos del dev-server y los corre solos (si config.autoQueue).
// ---------------------------------------------------------------------------

const processedJobs = new Set();   // nombres ya tomados en esta vida del SW (evita repetir)

async function pollQueue() {
  await ensureState();
  if (!state.config.autoQueue) return;
  if (state.queue.paused) return;                    // pausa (manual o por fallo): NO jalar mas trabajos
  if (autopilotBusy) return;                        // corrida completa en curso (incl. ingredientes): no tomar otro job
  if (loopRunning) return;                          // bucle vivo en este worker: no encimar
  // "running" persistido solo cuenta si el latido es reciente; si esta rancio, el bucle murio -> lo reseteamos.
  if (state.queue.running) {
    const fresh = (Date.now() - (state.queue.heartbeatAt || 0)) < 120000;
    if (fresh) return;
    state.queue.running = false; await saveState();
    log(LOG_LEVEL.WARN, "Cola marcada 'running' sin bucle vivo (latido rancio): la libero.");
  }
  let jobs;
  try { jobs = await fetch(state.config.queueUrl || DEFAULT_CONFIG.queueUrl).then((r) => r.json()); }
  catch (_e) { return; }                              // dev-server caido
  const job = (jobs || []).find((j) => j && !j.mediaComplete && !processedJobs.has(j.name));
  if (!job) return;
  processedJobs.add(job.name);
  // Reclama el trabajo (crea <json>.lock en disco) para que NO se repita aunque el SW reinicie.
  const claimUrl = (state.config.queueUrl || DEFAULT_CONFIG.queueUrl) + "/claim";
  const claimed = await fetch(`${claimUrl}?name=${encodeURIComponent(job.name)}`, { method: "POST" })
    .then((r) => r.json()).catch(() => null);
  if (!claimed?.ok) { log(LOG_LEVEL.DEBUG, `cola: "${job.name}" ya estaba tomado, salto.`); return; }
  log(LOG_LEVEL.INFO, `AUTOPILOTO: tomando "${job.name}" de la cola.`);
  state.queue.jobName = job.name;   // para heartbeat del lock (SCALE-02) y diagnostico
  await saveState();
  await onLoadJson({ json: job.json });
  await onRunAll();
  state.queue.jobName = null;       // corrida terminada/pausada: deja de latir el lock
  await saveState();
}

// Mantiene fresco el lock del trabajo en curso (dev-server lo relista si el lock se vuelve rancio).
async function heartbeatJobLock() {
  const name = state.queue?.jobName;
  if (!name) return;
  const base = state.config.queueUrl || DEFAULT_CONFIG.queueUrl;
  try { await fetch(`${base}/heartbeat?name=${encodeURIComponent(name)}`, { method: "POST" }); } catch (_e) {}
}

// Alarma periodica (sobrevive al sueno del SW; min ~30s). Gateada por config.autoQueue.
chrome.alarms?.create?.("queuePoll", { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm?.addListener((a) => {
  if (a.name === "queuePoll") pollQueue().catch(() => {});
  else if (a.name === "rateLimitResume") resumeAfterCooldown().catch(() => {});
  else if (a.name === "keepAlive") keepAliveTick().catch(() => {});
});

// Mantiene VIVO el SW durante el pipeline paralelo: la espera de ~6min de Grok sin eventos chrome.* puede
// matar el worker MV3. La alarma (evento periodico) lo revive y de paso refresca state.queue.heartbeatAt
// para que pollQueue no trate la corrida como rancia. Se auto-apaga cuando no queda ningun carril vivo.
async function keepAliveTick() {
  await ensureState();
  const anyLane = state.lanes && (state.lanes.images?.running || state.lanes.animation?.running);
  if (!anyLane) { try { chrome.alarms.clear("keepAlive"); } catch (_e) {} return; }
  state.queue.heartbeatAt = Date.now();
  await saveState();
}

// Arranque inicial: rehidrata cuando el modulo se evalua y reanuda si quedo una corrida a medias.
loadState().then(() => { applySecrets(); resumeIfInterrupted(); });
