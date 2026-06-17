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
  STORAGE_KEY, DEFAULT_CONFIG, FISH_PRESETS,
  makeInitialState, msg, jitterDelay,
} from "../lib/messaging.js";

import { parseProject } from "../lib/json-loader.js";
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
let loopRunning = false;   // guarda anti-reentrada del bucle en este worker vivo

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
  // Migracion: campos nuevos de queue/pacing sin pisar lo guardado.
  state.queue = { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0, ...(state.queue || {}) };
  state.pacing = { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0, ...(state.pacing || {}) };
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

function log(level, message) {
  emit(EVT.LOG, { level, ts: Date.now(), message });
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
  launchLoop();
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
  // Preserva el characterRef ya cargado (el JSON nuevo no lo trae).
  const prevRef = state.project?.characterRef ?? null;
  state.project = { ...result.project, characterRef: prevRef };
  state.scenes = result.scenes;
  state.queue = { running: false, paused: false, currentIndex: 0 };
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
    await saveState();
    log(LOG_LEVEL.INFO, `Escena ${scene.id}: reintento animacion (mantengo la imagen).`);
    emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE);
    emitState();
    return runAnimationRetry();
  }

  // mode "image" (o sin imagen/video que reutilizar): regenerar imagen desde cero.
  scene.status = SCENE_STATUS.PENDING;
  scene.imageUrl = null;
  scene.videoUrl = null;
  scene.clipFilename = null;
  scene.lastFrameFilename = null;
  scene.savedOk = false;
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
    if (s.imageUrl) { s.status = SCENE_STATUS.IMAGE_DONE; s.videoUrl = null; s.clipFilename = null; s.lastFrameFilename = null; s.savedOk = false; toAnimate = true; }
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
  state = makeInitialState();
  await chrome.storage.local.remove(STORAGE_KEY);
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
  state.queue.paused = true;
  state.queue.running = false;
  await saveState();
  detachDebuggers();
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
  launchLoop();
}

// Pausa "blanda" por fallo recuperable-a-mano (no captcha/sin-creditos): deja la cola PAUSADA para que
// pollQueue no jale mas trabajos y el autopiloto se detenga. El usuario arregla en Flow y reanuda.
async function pauseForError(message, sceneId = null) {
  state.queue.paused = true;
  state.queue.running = false;
  state.queue.errorSceneId = sceneId;
  await saveState();
  detachDebuggers();
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
  launchLoop();
}

// Lanza el bucle si no hay otro corriendo en este worker.
function launchLoop() {
  if (loopRunning) return;
  runQueue().catch((e) => {
    console.error("runQueue error:", e);
    log(LOG_LEVEL.ERROR, `Bucle abortado: ${e?.message ?? e}`);
    loopRunning = false;
  });
}

// Espera larga PERO interrumpible: relee el state cada 1s para respetar pausa/stop y actualiza el
// heartbeat (asi pollQueue sabe que el loop sigue vivo aunque el SW se duerma entre escenas).
async function interruptibleDelay(totalMs) {
  let waited = 0, sinceSave = 0;
  while (waited < totalMs) {
    await ensureState();
    if (!state.queue.running || state.queue.paused) return false;
    const step = Math.min(2000, totalMs - waited);   // chequea pausa cada ~2s
    await delay(step);
    waited += step; sinceSave += step;
    if (sinceSave >= 15000) { state.queue.heartbeatAt = Date.now(); await saveState(); sinceSave = 0; }  // latido cada ~15s
  }
  state.queue.heartbeatAt = Date.now(); await saveState();
  return true;
}

// Ritmo humano sostenido entre escenas (anti-deteccion). Inter-escena con jitter, warmup mas lento,
// descanso largo cada N, y tope por hora. Contadores en state.pacing (persisten; el SW MV3 se duerme).
async function applyPacingAfterScene() {
  const c = state.config;
  const p = state.pacing = state.pacing || { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0 };
  const now = Date.now();
  if (!p.windowStart || now - p.windowStart > 3600000) { p.windowStart = now; p.windowCount = 0; }
  p.windowCount += 1;
  p.sessionGen += 1;

  let waitMs;
  if ((c.longBreakEvery ?? 0) > 0 && p.sessionGen % c.longBreakEvery === 0) {
    waitMs = jitterDelay(c.longBreakMinMs, c.longBreakMaxMs, p.sessionGen);
    log(LOG_LEVEL.INFO, `Descanso anti-deteccion: ${Math.round(waitMs / 1000)}s (tras ${p.sessionGen} generaciones).`);
  } else {
    waitMs = jitterDelay(c.interSceneDelayMinMs, c.interSceneDelayMaxMs, p.sessionGen);
    if (p.sessionGen <= (c.warmupCount ?? 0)) waitMs = Math.round(waitMs * 1.5); // arranque suave
  }
  if ((c.maxGenerationsPerHour ?? 0) > 0 && p.windowCount >= c.maxGenerationsPerHour) {
    const restMs = Math.max(0, 3600000 - (now - p.windowStart));
    if (restMs > waitMs) { log(LOG_LEVEL.WARN, `Tope ${c.maxGenerationsPerHour}/hora: pauso ${Math.round(restMs / 60000)} min.`); waitMs = restMs; }
    p.windowStart = now + restMs; p.windowCount = 0;
  }
  await saveState();
  log(LOG_LEVEL.DEBUG, `Ritmo: espero ${Math.round(waitMs / 1000)}s antes de la siguiente escena.`);
  await interruptibleDelay(waitMs);
}

// Bucle principal. Relee el state en cada iteracion (no confia en timers vivos).
// concurrency se respeta como 1 por ahora: procesa una escena a la vez en orden.
async function runQueue() {
  loopRunning = true;
  log(LOG_LEVEL.INFO, "Bucle de cola iniciado.");

  while (true) {
    await ensureState();
    state.queue.heartbeatAt = Date.now();   // latido: pollQueue distingue loop vivo de "running" huerfano

    // Respeta pausa/stop releyendo la verdad persistida.
    if (!state.queue.running || state.queue.paused) {
      log(LOG_LEVEL.INFO, "Bucle detenido (paused/stop).");
      break;
    }

    // Selecciona la siguiente escena segun la FASE:
    //   images    -> escenas PENDING (genera imagen)
    //   animation -> escenas IMAGE_DONE (anima)
    const phase = state.queue.phase || "images";

    // ANIMACION PARALELA: las escenas NO dependen entre si -> disparamos todas y recogemos en una
    // sola pasada (mucho mas rapido). Tras esto no quedan IMAGE_DONE y la fase termina.
    if (phase === "animation" && !state.config.dryRun && (state.config.parallelAnimation ?? false) && state.config.provider !== "grok") {
      await runParallelAnimation();
      await ensureState();
      if (!state.queue.running || state.queue.paused) break; // pausa/stop -> salir; resume re-entra
      state.queue.running = false;
      await saveState();
      detachDebuggers();
      reportFailuresAtEnd();
      log(LOG_LEVEL.INFO, "Fase 'animation' (paralela) finalizada.");
      emitState();
      emitProgress();
      break;
    }

    const target = phase === "animation" ? SCENE_STATUS.IMAGE_DONE : SCENE_STATUS.PENDING;
    const idx = nextSceneIndexByStatus(state.scenes, 0, target);
    if (idx === -1) {
      state.queue.running = false;
      await saveState();
      detachDebuggers();
      reportFailuresAtEnd();
      log(LOG_LEVEL.INFO, `Fase '${phase}' finalizada: no quedan escenas en estado '${target}'.`);
      emitState();
      emitProgress();
      break;
    }

    state.queue.currentIndex = idx;
    await saveState();
    emitProgress();

    const scene = state.scenes[idx];
    const prevSceneId = idx > 0 ? state.scenes[idx - 1].id : null;
    const refName = state.project?.characterRef?.name ?? null;

    // Procesa la escena (dry-run o real) con reintentos+backoff, segun la fase.
    await processSceneWithRetries(scene, prevSceneId, refName, phase);

    // Si una parada dura ocurrio durante el proceso, salimos.
    await ensureState();
    if (state.queue.paused || !state.queue.running) {
      log(LOG_LEVEL.INFO, "Bucle detenido tras procesar escena.");
      break;
    }

    // RITMO HUMANO: si queda otra escena por hacer, espera (anti-deteccion). Sin espera al final.
    const phaseNow = state.queue.phase || "images";
    const targetNow = phaseNow === "animation" ? SCENE_STATUS.IMAGE_DONE : SCENE_STATUS.PENDING;
    if (!state.config.dryRun && nextSceneIndexByStatus(state.scenes, 0, targetNow) !== -1) {
      await applyPacingAfterScene();
    }
  }

  loopRunning = false;
}

// Ejecuta una escena reintentando hasta config.maxRetries con backoff.
async function processSceneWithRetries(scene, prevSceneId, refName, phase) {
  const maxRetries = state.config.maxRetries ?? DEFAULT_CONFIG.maxRetries;

  while (scene.attempts <= maxRetries) {
    // Re-chequea pausa antes de cada intento.
    await ensureState();
    if (state.queue.paused || !state.queue.running) return;

    scene.attempts += 1;
    try {
      if (state.config.dryRun) {
        if (phase === "animation") await runDryRunAnimation(scene);
        else await runDryRunImage(scene, prevSceneId, refName);
      } else if (state.config.provider === "grok") {
        if (phase === "animation") await runGrokAnimation(scene);
        else await runGrokImage(scene);
      } else {
        if (phase === "animation") await runRealAnimation(scene);
        else await runRealImage(scene, prevSceneId, refName);
      }
      // Exito: la escena queda DONE dentro del runner.
      return;
    } catch (e) {
      const reason = e?.message ?? String(e);

      // Parada dura: no se reintenta, se aborta la cola.
      if (e?.hardStop) {
        await onHardStop(e.hardStop, reason);
        return;
      }

      scene.error = reason;
      await saveState();
      log(LOG_LEVEL.WARN, `Escena ${scene.id} intento ${scene.attempts}/${maxRetries + 1} fallo: ${reason}`);

      if (scene.attempts > maxRetries) {
        // Agotados los reintentos -> ERROR.
        scene.status = SCENE_STATUS.ERROR;
        await saveState();
        emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason);
        emitState();
        log(LOG_LEVEL.ERROR, `Escena ${scene.id} marcada ERROR tras agotar reintentos.`);
        // PAUSA-EN-FALLO: no seguir generando ni jalar mas trabajos; el usuario revisa Flow y reanuda.
        if (state.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure) await pauseForError(`escena ${scene.id} fallo: ${reason}`, scene.id);
        return;
      }

      // Backoff exponencial con jitter antes del siguiente intento.
      const base = jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, scene.attempts);
      const backoff = base * Math.pow(2, scene.attempts - 1);
      log(LOG_LEVEL.INFO, `Backoff ${backoff}ms antes de reintentar ${scene.id}.`);
      await delay(backoff);
    }
  }
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
  const tab = await findFlowTab();
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");
  await ensureContentScript(tab.id);
  // Pre-adjunta el depurador AHORA (no en el 1er click): asi la barra "depurando" ya esta presente
  // cuando el driver calcula las coordenadas del boton Generar -> click correcto al primer intento.
  await ensureDebugger(tab.id);

  // PERSONAJES (nuevo esquema): nombres de Personaje de Flow a adjuntar (display_name). El usuario
  // crea cada Personaje una vez por proyecto (subir un archivo por script es imposible: seguridad).
  // Compat VIEJO: si la escena no trae characterRefs pero si el ingrediente character_ref, usar el
  // nombre global (character_bible.name).
  let characterNames = Array.isArray(scene.characterRefs) ? scene.characterRefs.filter(Boolean) : [];
  if (!characterNames.length && scene.imageIngredients?.includes("character_ref") && state.project?.characterName) {
    characterNames = [state.project.characterName];
  }
  // ESCENAS PREVIAS (nuevo): resolver references.scenes[].sceneId -> la imageUrl ya generada de esa
  // escena (las imagenes se generan EN ORDEN, asi que la referenciada ya existe). Se adjuntara en Flow.
  const sceneRefImageUrls = [];
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
    prompt: scene.imagePrompt, characterNames, sceneRefImageUrls, aspectRatio, count,
  });
  scene.imageUrl = img?.imageUrl ?? null;
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
  const tab = await findFlowTab();
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");
  await ensureContentScript(tab.id);
  await ensureDebugger(tab.id);  // pre-adjunta para que el 1er click Generar caiga bien (barra ya presente)

  const count = state.config.generationCount ?? DEFAULT_CONFIG.generationCount;
  const aspectRatio = state.project?.aspectRatio ?? "9:16";
  // Modelo y duracion elegidos en la UI (texto exacto de Flow). Fallback al default.
  const model = state.config.videoModel ?? DEFAULT_CONFIG.videoModel;
  const duration = state.config.videoDuration ?? DEFAULT_CONFIG.videoDuration;

  // 1) ANIMATE
  scene.status = SCENE_STATUS.ANIMATING;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING);
  emitState();
  log(LOG_LEVEL.INFO, `Animando ${scene.id} con "${model}" (${duration})...`);
  const vid = await sendActOrFail(tab.id, ACT.ANIMATE, {
    prompt: scene.animationPrompt, model, duration, aspectRatio, count, imageUrl: scene.imageUrl,
  });
  const videoUrl = vid?.videoUrl;
  if (!videoUrl) throw new Error("animacion sin URL de video");
  if (vid?.cost) log(LOG_LEVEL.INFO, `${scene.id}: ${vid.cost}`);
  await delay(jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, scene.attempts));

  // 2) DESCARGAR via chrome.downloads (usa cookies de sesion; no requiere host perms).
  scene.status = SCENE_STATUS.DOWNLOADING;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.DOWNLOADING);
  emitState();
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

  // 3) EXTRAER ULTIMO FRAME (background fetch -> offscreen, evita taint CORS). Best-effort.
  scene.status = SCENE_STATUS.EXTRACTING_FRAME;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.EXTRACTING_FRAME);
  emitState();
  scene.lastFrameFilename = `${scene.id}_lastframe.png`;
  try {
    // Preferimos el frame capturado por el driver (canvas en la pagina, sin CORS). Fallback al
    // fetch en background + offscreen por si el driver no lo pudo capturar.
    const frameDataUrl = vid?.lastFrameDataUrl || await extractLastFrame(videoUrl, scene.id);
    if (frameDataUrl) {
      lastFrames.set(scene.id, frameDataUrl);
      await downloadUrl(frameDataUrl, scene.lastFrameFilename);
    }
  } catch (e) {
    log(LOG_LEVEL.WARN, `Extraccion de frame fallo (${scene.id}): ${e?.message ?? e}.`);
  }

  // 4) DONE
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

// FASE 1 (Grok): sube referencias (personaje + escenas previas) por CDP -> genera imagen (modo Imagen).
async function runGrokImage(scene) {
  const tab = await findFlowTab();
  if (!tab) throw new Error("No hay pestana de Grok abierta (grok.com/imagine). Abrela y reintenta.");
  await ensureGrokCompositor(tab.id); // vuelve al composer fresco (tras la escena previa quedo en /imagine/post/<id>)
  await ensureContentScript(tab.id);
  await ensureDebugger(tab.id);

  // Referencias a subir: personaje(s) + imagenes de escenas previas (ya en disco).
  const refPaths = [];
  const chars = state.project?.characters || {};
  for (const nm of (scene.characterRefs || [])) {
    const entry = Object.values(chars).find((c) => c && c.display_name === nm);
    if (entry?.reference_asset) {
      try { const p = await resolveCharFile(entry.reference_asset); if (p) refPaths.push(p); }
      catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no resolvi ref de personaje "${nm}": ${e?.message ?? e}`); }
    }
  }
  if (!refPaths.length) { // compat: sin characterRefs, usa el 1er personaje del mapa
    const first = Object.values(chars)[0];
    if (first?.reference_asset) { try { const p = await resolveCharFile(first.reference_asset); if (p) refPaths.push(p); } catch (_e) {} }
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
  const img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, { prompt: scene.imagePrompt });
  const imageUrl = img?.imageUrl;
  if (!imageUrl) throw new Error("Grok no devolvio URL de imagen");
  scene.imageUrl = imageUrl;
  try {
    const slug = state.project?.slug || "proyecto";
    const saved = await downloadImageForRef(imageUrl, slug, scene.id);
    scene.imageFilePath = saved.abspath || null;
  } catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar la imagen para refs (${e?.message ?? e}).`); }
  scene.status = SCENE_STATUS.IMAGE_DONE; scene.error = null;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE); emitState(); emitProgress();
  log(LOG_LEVEL.INFO, `Imagen Grok lista (${scene.id}).`);
}

// FASE 2 (Grok): sube la imagen de la escena como base (CDP) -> anima (modo Video) -> descarga clip.
async function runGrokAnimation(scene) {
  const tab = await findFlowTab();
  if (!tab) throw new Error("No hay pestana de Grok abierta (grok.com/imagine). Abrela y reintenta.");
  await ensureGrokCompositor(tab.id); // composer fresco para animar (Video + Enviar con la imagen como ref)
  await ensureContentScript(tab.id);
  await ensureDebugger(tab.id);

  scene.status = SCENE_STATUS.ANIMATING;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING); emitState();
  if (scene.imageFilePath) {
    try { await sendActOrFail(tab.id, ACT.CLEAR_REFS, {}); } catch (_e) {}
    try { await cdpSetFileInput(tab.id, [scene.imageFilePath]); }
    catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude subir la imagen base (${e?.message ?? e}); Grok animara desde el prompt.`); }
  } else {
    log(LOG_LEVEL.WARN, `${scene.id}: sin imagen en disco; Grok animara solo desde el prompt.`);
  }
  log(LOG_LEVEL.INFO, `Animando ${scene.id} en Grok...`);
  const vid = await sendActOrFail(tab.id, ACT.ANIMATE, { prompt: scene.animationPrompt });
  const videoUrl = vid?.videoUrl;
  if (!videoUrl) throw new Error("Grok no devolvio URL de video");

  scene.status = SCENE_STATUS.DOWNLOADING;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DOWNLOADING); emitState();
  scene.clipFilename = `${scene.id}.mp4`;
  const slug = state.project?.slug || "proyecto";
  const saved = await downloadClipToProject(videoUrl, slug, scene.id);
  scene.savedOk = saved.via === "server";
  log(LOG_LEVEL.INFO, `clip ${scene.id}.mp4 -> ${saved.path}`);
  if (saved.via === "downloads") log(LOG_LEVEL.WARN, `(quedo en Descargas; corre 'flowbot start' para que caiga en public/${slug}/clips/)`);

  scene.status = SCENE_STATUS.EXTRACTING_FRAME;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.EXTRACTING_FRAME); emitState();
  scene.lastFrameFilename = `${scene.id}_lastframe.png`;
  try {
    const frameDataUrl = await extractLastFrame(videoUrl, scene.id);
    if (frameDataUrl) { lastFrames.set(scene.id, frameDataUrl); await downloadUrl(frameDataUrl, scene.lastFrameFilename); }
  } catch (e) { log(LOG_LEVEL.WARN, `Frame fallo (${scene.id}): ${e?.message ?? e}.`); }

  scene.status = SCENE_STATUS.DONE; scene.error = null;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DONE); emitState(); emitProgress();
}

// FASE 2 PARALELA: dispara TODAS las animaciones SIN esperar (las escenas no dependen entre si),
// mapea cada video a su escena POR ORDEN, y recoge (descarga + frame). Rapido SI Flow permite
// generar varias a la vez. Idempotente: IMAGE_DONE -> disparar+mapear; ANIMATING con videoUrl -> recoger.
async function runParallelAnimation() {
  const tab = await findFlowTab();
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");
  await ensureContentScript(tab.id);
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
          prompt: scene.animationPrompt, model, duration, aspectRatio, count, imageUrl: scene.imageUrl,
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
      const inFireOrder = newSrcs.slice().reverse();
      fired.forEach((scene, i) => { scene.videoUrl = inFireOrder[i] || null; });
      await saveState();
      log(LOG_LEVEL.INFO, `Mapeados ${newSrcs.length}/${fired.length} videos por orden.`);
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
      scene.lastFrameFilename = `${scene.id}_lastframe.png`;
      try {
        const frameDataUrl = res?.lastFrameDataUrl;
        if (frameDataUrl) { lastFrames.set(scene.id, frameDataUrl); await downloadUrl(frameDataUrl, scene.lastFrameFilename); }
      } catch (e) { log(LOG_LEVEL.WARN, `Frame fallo (${scene.id}): ${e?.message ?? e}.`); }
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
async function fishTTSWithTimestamps(text, { apiKey, voiceId, model }) {
  const body = { text, format: "mp3", latency: "normal" };
  if (voiceId) body.reference_id = voiceId;   // la VOZ; vacio = voz por defecto de Fish
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

  // Voz: config.fishVoiceId (si la pegaste) GANA; si no, la del preset (project.preset); si no, default.
  const preset = state.project?.preset || "";
  const presetCfg = FISH_PRESETS[preset] || null;
  const voiceId = (state.config.fishVoiceId || "").trim() || (presetCfg?.voiceId || "");
  const model = state.config.fishModel || presetCfg?.model || DEFAULT_CONFIG.fishModel;
  if (voiceId) {
    const src = (state.config.fishVoiceId || "").trim() ? "config" : `preset "${preset}"`;
    log(LOG_LEVEL.INFO, `Fish Audio: voz desde ${src}.`);
  } else {
    log(LOG_LEVEL.WARN, `Fish Audio: sin voz (ni config ni preset "${preset}") -> voz por defecto de Fish.`);
  }

  const slug = state.project?.slug || "proyecto";
  const limit = (typeof message.limit === "number" && message.limit > 0) ? message.limit : null;
  const includeHook = message.includeHook !== false;

  // Lista de items {id, text}: hook (si aplica) + escenas con voiceover, en orden.
  const items = [];
  const hookText = state.project?.hook?.voiceover;
  if (includeHook && typeof hookText === "string" && hookText.trim()) items.push({ id: "hook", text: hookText.trim() });
  const withVoice = (state.scenes || []).filter((s) => (s.voiceoverText || "").trim());
  for (const s of (limit ? withVoice.slice(0, limit) : withVoice)) items.push({ id: s.id, text: s.voiceoverText.trim() });

  if (!items.length) { log(LOG_LEVEL.WARN, "No hay textos de voz (scenes[].voiceover.text) para generar."); return; }

  log(LOG_LEVEL.INFO, `Fish Audio: generando ${items.length} audio(s)+timestamps -> ${slug}/voice/ (modelo ${model})...`);
  let okCount = 0, viaDownloads = false, noWords = 0;
  for (const it of items) {
    await ensureState();
    try {
      const { audio, words } = await fishTTSWithTimestamps(it.text, { apiKey, voiceId, model });
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
async function findFlowTab() {
  const pattern = state.config.provider === "grok" ? "https://grok.com/*" : "https://labs.google/*";
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
async function ensureContentScript(tabId) {
  try {
    const r = await sendToTab(tabId, msg(ACT.PING));
    if (r && r.ok) return;
  } catch (_e) { /* sin listener: inyectar */ }
  const files = state.config.provider === "grok"
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
  await runQueue();            // vuelve cuando la fase termina o se pausa (parada dura)
  await ensureState();
  return !state.queue.paused;  // paused = parada dura (captcha / sin creditos)
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

// Encadena TODO el flujo de un proyecto ya cargado: Flow listo -> imagenes -> animacion -> audio.
async function onRunAll() {
  await applySecrets();
  await ensureState();
  if (!state.project || !state.scenes?.length) { log(LOG_LEVEL.WARN, "AUTOPILOTO: no hay proyecto cargado."); return; }
  log(LOG_LEVEL.INFO, `AUTOPILOTO: "${state.project.title}" — preparando Flow...`);

  try { await ensureFlowReady(); }
  catch (e) { log(LOG_LEVEL.ERROR, `AUTOPILOTO detenido: ${e?.message ?? e}`); return; }

  log(LOG_LEVEL.INFO, "AUTOPILOTO: generando imagenes...");
  if (!(await runPhaseToEnd("images"))) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en imagenes (parada dura)."); return; }

  log(LOG_LEVEL.INFO, "AUTOPILOTO: animando...");
  if (!(await runPhaseToEnd("animation"))) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en animacion (parada dura)."); return; }

  log(LOG_LEVEL.INFO, "AUTOPILOTO: generando voz (Fish)...");
  await onGenerateAudio({ includeHook: true });

  // Limpieza de Flow: SOLO si TODOS los clips se descargaron al proyecto (savedOk). Salvaguarda:
  // si falta alguno, NO borra nada (se preservan los medios en Flow para no perder trabajo).
  if (state.config.cleanupFlowAfterDownload && state.config.provider !== "grok") {
    await ensureState();
    const total = state.scenes.length;
    const ok = state.scenes.filter((s) => s.savedOk).length;
    if (total > 0 && ok === total) {
      log(LOG_LEVEL.INFO, `AUTOPILOTO: ${ok}/${total} clips descargados; limpiando medios de Flow...`);
      const tab = await findFlowTab();
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
}

// ---------------------------------------------------------------------------
// Cola: el SW saca trabajos del dev-server y los corre solos (si config.autoQueue).
// ---------------------------------------------------------------------------

const processedJobs = new Set();   // nombres ya tomados en esta vida del SW (evita repetir)

async function pollQueue() {
  await ensureState();
  if (!state.config.autoQueue) return;
  if (state.queue.paused) return;                    // pausa (manual o por fallo): NO jalar mas trabajos
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
  await onLoadJson({ json: job.json });
  await onRunAll();
}

// Alarma periodica (sobrevive al sueno del SW; min ~30s). Gateada por config.autoQueue.
chrome.alarms?.create?.("queuePoll", { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm?.addListener((a) => {
  if (a.name === "queuePoll") pollQueue().catch(() => {});
  else if (a.name === "rateLimitResume") resumeAfterCooldown().catch(() => {});
});

// Arranque inicial: rehidrata cuando el modulo se evalua y reanuda si quedo una corrida a medias.
loadState().then(() => { applySecrets(); resumeIfInterrupted(); });
