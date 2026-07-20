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
  STORAGE_KEY, DEFAULT_CONFIG, resolveFishVoice, DEFAULT_VOICE_ID,
  makeInitialState, msg, jitterDelay, chunkTextForTrustedInput,
} from "../lib/messaging.js";

import { validateQueueProject } from "../lib/queue-validator.js";
import { createOrchestrator, sceneHasImage, unresolvedAnimationScenes, unresolvedImageScenes } from "../lib/orchestrator.js";
import { planScene, nextSceneIndex, nextSceneIndexByStatus } from "../lib/queue.js";
import { chooseProviderTab } from "../lib/provider-tabs.js";
import { minMediaBytes } from "../shared/media-requirements.mjs";
import { parseFishTimestampSse } from "../lib/fish-timestamp-sse.js";

// Visible en /remote/state para no ejecutar pruebas destructivas contra una instancia de Chrome que
// aun conserve un service worker/content script anterior.
const EXTENSION_BUILD = "0.2.58-2026-07-20-fish-s2.1-pro";

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
let ingredientsRunning = false; // guarda anti-reentrada de la fase/boton de INGREDIENTES
let remotePollBusy = false; // guarda anti-reentrada de pollRemoteCommands (bootstrap + alarma cada 30s)
let pollQueueBusy = false;  // guarda anti-reentrada de pollQueue (la ventana claim->onRunAll dura minutos)
let audioBusy = false;      // guarda anti-reentrada de onGenerateAudio (2 triggers = doble gasto de creditos)
let resumeInFlight = false; // resumeIfInterrupted en curso: pollQueue NO debe liberar/reclamar mientras tanto
let directedRecoveryBusy = false; // evita que Reanudar/Hacer todo naveguen Grok mientras un retry recolecta un resultado pagado
const providerTabIds = { flow: null, grok: null }; // ancla por corrida: cambiar de ventana no cambia la pestana objetivo

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
  // Migracion 2026-07-20: S2.1 Pro reemplaza globalmente al anterior S2 Pro.
  // Sin esta migracion, chrome.storage conservaria "s2-pro" aunque cambie DEFAULT_CONFIG.
  if (!state.config.fishModel || state.config.fishModel === "s2-pro") {
    state.config.fishModel = DEFAULT_CONFIG.fishModel;
  }
  // El default ANTERIOR era "Veo 3.1 - Fast" (elegido por mi, no por el usuario). Ahora el default
  // es Omni; migramos ese valor concreto para que el default real sea Omni (el usuario puede
  // cambiarlo en la UI cuando quiera).
  if (state.config.videoModel === "Veo 3.1 - Fast") state.config.videoModel = DEFAULT_CONFIG.videoModel;
  // HARDCODE (pedido del usuario 2026-06-18): estos valores NO se configuran desde el panel; se fuerzan
  // SIEMPRE (pisan lo guardado) para que el comportamiento sea estable. tope/hora alto (50), descanso CORTO
  // y POCO frecuente (~20-30s cada 25 generaciones), y el prompt siempre se PEGA (no se tipea). Si en el
  // futuro quieres reabrir esto a config, quita estas lineas y vuelve a exponer los inputs en el panel.
  state.config.maxGenerationsPerHour = 50;
  state.config.maxHourlyPauseMs = 180000;   // al tope/hora: pausa MAX 3 min; conserva el freno sin detener tanto la cola.
  state.config.longBreakEvery = 25;
  state.config.longBreakMinMs = 20000;
  state.config.longBreakMaxMs = 30000;
  state.config.humanTyping = false;   // siempre pegar (los drivers ya pegan en fragmentos rapidos)
  // Migracion: campos nuevos de queue/pacing sin pisar lo guardado.
  state.queue = { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0, doneJobs: [], ...(state.queue || {}) };
  // Carriles: al (re)cargar el SW NINGUN carril corre todavia -> running forzado a false (evita carriles
  // "vivos" fantasma tras morir el SW; el heartbeat previo se conserva solo como referencia).
  {
    const _pl = state.lanes || {};
    state.lanes = {
      images: { running: false, heartbeatAt: _pl.images?.heartbeatAt || 0 },
      animation: { running: false, heartbeatAt: _pl.animation?.heartbeatAt || 0 },
    };
  }
  state.pacing = { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0, grokGenCount: 0, flowGenCount: 0, ...(state.pacing || {}) };
  state.metrics = { generations: 0, errors: 0, cooldownMs: 0, since: Date.now(), ...(state.metrics || {}) };
  state.remote = { lastCommandId: 0, ...(state.remote || {}) };
  state.flowProjects = { ...(state.flowProjects || {}) };
  for (const record of Object.values(state.flowProjects)) {
    const canonical = canonicalFlowProjectUrl(record?.projectUrl || "");
    if (canonical) { record.projectUrl = canonical; record.projectId = flowProjectIdFromUrl(canonical); }
  }
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
    // ElevenLabs V3 (preset historias): key propia, distinta de Fish. Aditivo: sin ella, historias usa Fish.
    const ek = (s?.elevenApiKey || "").trim();
    if (ek && !/^PEGA_AQUI/i.test(ek) && ek !== state.config.elevenApiKey) {
      state.config.elevenApiKey = ek; changed = true;
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
  scheduleRemoteState();
}

// Ring-buffer de logs persistido en clave PROPIA (no en AppState, que se reescribe decenas de veces).
// emit() es best-effort: si el panel esta cerrado (corridas desatendidas) el log se perdia. Ahora
// queda en disco y el panel lo rehidrata al abrir. Capacidad acotada.
const LOG_RING_KEY = "flow_log_ring_v1";
const LOG_RING_MAX = 400;
let logRing = [];
let logSaveTimer = null;
let remoteStateTimer = null;
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
  // Los WARN/ERROR suelen ser la unica pista de una corrida que mata/reinicia el worker. Persistirlos
  // inmediatamente evita perder justo el error por el debounce de 2s; INFO/DEBUG siguen agrupados.
  if (level === LOG_LEVEL.ERROR || level === LOG_LEVEL.WARN) {
    chrome.storage.local.set({ [LOG_RING_KEY]: logRing }).catch(() => {});
  } else {
    scheduleLogSave();
  }
  if (level === LOG_LEVEL.ERROR || level === LOG_LEVEL.WARN || /PAUSA|PARADA|AUTOPILOTO detenido|medios listos/i.test(message || "")) {
    postRemoteEvent({ level, message, ts: entry.ts }).catch(() => {});
  }
}

function remoteBase() {
  return (state?.config?.remoteControlUrl || DEFAULT_CONFIG.remoteControlUrl || "").replace(/\/$/, "");
}

function compactStatusCounts(items = []) {
  return items.reduce((acc, x) => {
    const k = x?.status || "unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function remoteSnapshot() {
  const ingredients = state?.project?.ingredients || [];
  const activeIngredient = ingredients.find((g) => g.status === SCENE_STATUS.GENERATING_IMAGE)
    || ingredients.find((g) => g.status === SCENE_STATUS.ERROR)
    || null;
  const activeScene = state?.scenes?.[state?.queue?.currentIndex || 0] || state?.scenes?.find((s) => s.status === SCENE_STATUS.ERROR) || null;
  return {
    extensionBuild: EXTENSION_BUILD,
    project: state?.project ? {
      title: state.project.title,
      slug: state.project.slug,
      preset: state.project.preset,
      provider: state.project.imageProvider || state.config?.provider,
    } : null,
    queue: state?.queue || null,
    autoQueue: !!state?.config?.autoQueue,
    fishModel: state?.config?.fishModel || DEFAULT_CONFIG.fishModel,
    scenes: { total: state?.scenes?.length || 0, counts: compactStatusCounts(state?.scenes || []) },
    ingredients: { total: ingredients.length, counts: compactStatusCounts(ingredients) },
    activeScene: activeScene ? { id: activeScene.id, status: activeScene.status, error: activeScene.error || null } : null,
    activeIngredient: activeIngredient ? { id: activeIngredient.id, status: activeIngredient.status, error: activeIngredient.error || null } : null,
    lastLogs: logRing.slice(-12),
    updatedAt: Date.now(),
  };
}

function scheduleRemoteState() {
  if (remoteStateTimer) return;
  remoteStateTimer = setTimeout(() => {
    remoteStateTimer = null;
    postRemoteState().catch(() => {});
  }, 1000);
}

async function postRemoteState() {
  if (!state) return;
  const base = remoteBase();
  if (!base) return;
  await fetch(`${base}/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state: remoteSnapshot() }),
  }).catch(() => {});
}

async function postRemoteEvent(event) {
  if (!state) return;
  const base = remoteBase();
  if (!base) return;
  await fetch(`${base}/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...event, snapshot: remoteSnapshot() }),
  }).catch(() => {});
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
  if (resumeInFlight) return;
  resumeInFlight = true;
  try {
  await ensureState();
  // Grok es AT-MOST-ONCE: GENERATING_IMAGE ya no significa "imagen gratis, vuelve a enviarla". Primero
  // adopta/revalida el resultado del intento persistido. Si no aparece, ERROR+pausa; el usuario decide.
  if (!(await recoverInterruptedGrokImageAttempts())) return;
  if (!state.queue.running) {
    const interruptedIngredients = (state.project?.ingredients || [])
      .filter((ing) => ing.status === SCENE_STATUS.GENERATING_IMAGE);
    if (interruptedIngredients.length) {
      for (const ing of interruptedIngredients) {
        ing.status = SCENE_STATUS.ERROR;
        ing.error = "interrumpido por reinicio/apagado durante la generacion; usa Reintentar para recuperar sin reutilizar el asset viejo";
        ing.regeneratePending = true;
        ing.imageUrl = null;
        ing.imageFilePath = null;
      }
      state.queue.paused = true;
      await saveState();
      log(LOG_LEVEL.WARN, `Apagado detectado durante ${interruptedIngredients.length} ingrediente(s): quedan en Error/Reintentar, no genero de nuevo en silencio.`);
      emitState();
      return;
    }
  }
  if (loopRunning || !state.queue.running || state.queue.paused) return;
  // Latido fresco YA: pollQueue (alarma del mismo despertar) veia el heartbeat rancio, liberaba
  // running=false y este resume abortaba en silencio -> la corrida a medias se abandonaba.
  state.queue.heartbeatAt = Date.now();
  const imageProvider = state.project?.imageProvider || state.config.provider;
  const grokAtMostOnce = imageProvider === "grok" && !state.config.dryRun;
  for (const s of state.scenes) {
    // Flow conserva su reparacion historica. Grok ya se resolvio arriba por recuperacion-only y JAMAS
    // debe llegar a PENDING automatico tras un restart.
    if (s.status === SCENE_STATUS.GENERATING_IMAGE && !grokAtMostOnce) s.status = SCENE_STATUS.PENDING;
    else if ((s.status === SCENE_STATUS.DOWNLOADING || s.status === SCENE_STATUS.EXTRACTING_FRAME) && s.videoUrl) s.status = SCENE_STATUS.ANIMATING; // re-recoge (no re-anima)
    else if (s.status === SCENE_STATUS.ANIMATING && !s.videoUrl && s.grokFired && s.grokVideoPostUrl) {
      // El disparo en Grok YA se pago y sabemos donde quedo el post: recoger sin re-animar.
      // runGrokAnimation salta el FIRE (grokFired) y navega a grokVideoPostUrl a recolectar.
      s.status = SCENE_STATUS.IMAGE_DONE;
    }
    else if (s.status === SCENE_STATUS.ANIMATING && !s.videoUrl) {
      s.status = SCENE_STATUS.ERROR;
      s.error = s.grokFired
        ? "interrumpido tras disparar la animacion en Grok (YA se pago, pero no se donde quedo). Busca el video en Grok antes de Reanimar."
        : "interrumpido durante la animacion; revisa Flow y dale Re-descargar/Reanimar (puede ya estar el video).";
      s.errorPhase = "animation";
    } // evita re-gasto silencioso
  }
  await saveState();
  log(LOG_LEVEL.INFO, "Reanudando corrida tras reinicio del service worker.");
  emitState();
  // Mismas reparaciones que onStartOrResume: stills que faltan en disco vuelven a PENDING y si hay
  // pendientes la fase NO puede ser animation (evita reanudar en la fase equivocada).
  await repairMissingStillAssetsBeforeResume("reinicio del service worker");
  if (forceImagesPhaseIfPending("reinicio del service worker")) await saveState();
  if (!(await ensureProviderForPhase(state.queue.phase || "images", "reanudar tras reinicio"))) return;
  if (!(await ensureIngredientsBeforeSceneLoop("reinicio del service worker"))) return;
  // Si la corrida era PARALELA (murio el SW durante la espera de Grok), reanuda en paralelo (idempotente
  // por status, no re-gasta) en vez del bucle secuencial; si no, el bucle unico de siempre.
  if (state.queue.mode === "parallel" && state.config.parallelPipeline) runPhasesParallel().catch((e) => log(LOG_LEVEL.ERROR, `Reanudacion paralela fallo: ${e?.message ?? e}`));
  else launchLoop();
  } finally { resumeInFlight = false; }
}

// ---------------------------------------------------------------------------
// Router de mensajes (CMD.* del panel; RES.* del content)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  // Click TRUSTED (lo pide el content script para el boton Generar de Flow).
  if (type === "trusted_click") {
    trustedClick(_sender?.tab?.id, message.x, message.y, { releaseAfterClick: !!message.releaseAfterClick })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  // Teclado TRUSTED para los editores React de Flow y Grok. Las mutaciones sinteticas podian dejar
  // texto visible sin actualizar el estado que habilita/ejecuta Crear o Enviar.
  if (type === "trusted_keyboard") {
    trustedKeyboard(_sender?.tab?.id, message)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  // Handshake durable solicitado por grok-driver JUSTO ANTES de pulsar Enter. El content espera este
  // ACK (saveState terminado); por eso, aun si MV3 mata/reinicia el worker inmediatamente despues, el
  // siguiente arranque sabe que el envio pudo ocurrir y solo intenta recuperar, nunca re-generar.
  if (type === "grok_image_submit_intent") {
    persistGrokImageSubmitIntent(message, _sender)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  if (type === "grok_image_submit_observed") {
    persistGrokImageSubmitObserved(message, _sender)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  // El content de Flow abre su selector "+" y pide al SW colocar un archivo LOCAL en el input
  // oculto del dialogo. Es el mismo canal CDP confiable usado por Grok, acotado al tab remitente.
  if (type === "flow_set_file_input") {
    const files = Array.isArray(message.files) ? message.files.filter(Boolean) : [];
    cdpSetFileInput(_sender?.tab?.id, files, message.selector || '[role="dialog"] input[type="file"][accept*="image"]')
      .then(() => sendResponse({ ok: true, count: files.length }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  if (type === "flow_file_fingerprint") {
    getLocalFileStatus(message.filePath)
      .then((info) => sendResponse({ ok: true, fingerprint: info.sha256 || `${info.size}:${info.mtimeMs}` }))
      .catch((e) => sendResponse({ ok: false, error: e?.message ?? String(e) }));
    return true;
  }

  // GET_STATE necesita respuesta sincrona -> retornamos true y respondemos async.
  if (type === CMD.GET_STATE) {
    ensureState().then(async () => {
      await hydrateExistingIngredientFiles().catch(() => false);
      sendResponse(state);
    });
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
    case CMD.RETRY_INGREDIENT:
      return onRetryIngredient(message);
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

async function pollRemoteCommands() {
  // Sin este guard, el bootstrap del SW + la alarma de 30s corren DOS pasadas con el mismo cursor y
  // aplican cada comando dos veces (un "audio" doble = doble gasto de creditos TTS).
  if (remotePollBusy) return;
  remotePollBusy = true;
  try {
    await ensureState();
    const base = remoteBase();
    if (!base) return;
    state.remote = state.remote || { lastCommandId: 0 };   // onClearAll pudo dejar el estado sin `remote`
    const since = Number(state.remote.lastCommandId || 0);
    const data = await fetch(`${base}/commands?since=${encodeURIComponent(since)}`).then((r) => r.json()).catch(() => null);
    // Latido del snapshot en cada tick (30s): /estado en Telegram ya no depende de que haya actividad
    // (antes el snapshot quedaba rancio/nulo tras reiniciar el dev-server con la extension ociosa).
    scheduleRemoteState();
    const commands = Array.isArray(data?.commands) ? data.commands : [];
    if (!commands.length) return;
    for (const c of commands.sort((a, b) => a.id - b.id)) {
      // Cursor ANTES de ejecutar (at-most-once): un comando largo (run_all/audio, minutos) dejaba el
      // cursor viejo visible a la siguiente alarma -> se re-ejecutaba cada 30s (reintentos fantasma).
      // Asignacion PLANA (no Math.max): si el dev-server reinicio, sus ids vuelven a empezar y el cursor
      // debe poder BAJAR para adoptarlos; con Math.max se re-servia el mismo lote hasta agotar su TTL.
      state.remote.lastCommandId = Number(c.id || 0);
      await saveState();
      try {
        await applyRemoteCommand(c);
        // Ack a Telegram: el "Comando enviado" del bridge solo significa "encolado en el dev-server";
        // esto confirma que la extension lo RECIBIO (los encolados expiran a los 5 min en silencio).
        postRemoteEvent({ level: "info", message: `Remote: "${c.command}" recibido por la extension.`, ts: Date.now() }).catch(() => {});
      } catch (e) {
        log(LOG_LEVEL.ERROR, `Remote ${c.command}: ${e?.message ?? e}`);
      } finally {
        scheduleRemoteState();
      }
    }
  } finally {
    remotePollBusy = false;
  }
}

async function applyRemoteCommand(c) {
  const command = String(c?.command || "").toLowerCase();
  log(LOG_LEVEL.INFO, `Remote: ${command}`);
  // Lanza una operacion LARGA sin bloquear el poll de comandos: pollRemoteCommands sostiene remotePollBusy
  // mientras await-ea; si esperaramos a run_all (horas) o audio (minutos), un "pausar"/"detener" remoto NO
  // se procesaria hasta que terminara. Estas ops ya tienen su propio guard (autopilotBusy/audioBusy/loopRunning)
  // y el cursor ya avanzo antes de ejecutar, asi que no se re-disparan. El .catch evita un unhandled rejection.
  const bg = (p) => { Promise.resolve(p).catch((e) => log(LOG_LEVEL.ERROR, `Remote ${command} (bg): ${e?.message ?? e}`)); };
  if (["pause", "pausar"].includes(command)) return onPause();
  if (["stop", "detener"].includes(command)) return onStop();
  if (["resume", "reanudar", "start"].includes(command)) return bg(onStartOrResume());
  // Entrada remota deliberadamente acotada a la fase gratuita de imagenes. La comparativa Flow
  // nunca debe usar RUN_ALL porque eso podria encadenar animacion o audio.
  if (["start_images", "generar_imagenes", "images_only", "solo_imagenes"].includes(command)) {
    return bg(onStartPhase("images"));
  }
  if (["run_all", "hacer_todo", "todo"].includes(command)) return bg(onRunAll());
  if (["audio_missing", "audio_faltante", "generate_audio_missing", "audio"].includes(command)) return bg(onGenerateAudio({ includeHook: true, missingOnly: true }));
  if (["audio_all", "generate_audio"].includes(command)) return bg(onGenerateAudio({ includeHook: true }));
  if (["load_json", "cargar_json", "load_project", "cargar_proyecto"].includes(command)) {
    const projectJson = c?.args?.json;
    if (!projectJson || typeof projectJson !== "object" || Array.isArray(projectJson)) {
      log(LOG_LEVEL.WARN, "Remote cargar_json: falta args.json valido.");
      return;
    }
    return onLoadJson({ json: projectJson });
  }
  if (["retry", "reintentar"].includes(command)) return bg(onRemoteRetry(c.args || {}));
  if (["recover_grok_post", "recuperar_post_grok", "adoptar_post_grok"].includes(command)) {
    return bg(onRemoteRecoverGrokPost(c.args || {}));
  }
  if (["release_grok_recovery", "liberar_recuperacion_grok"].includes(command)) {
    return onRemoteReleaseGrokRecovery(c.args || {});
  }
  if (["skip", "saltar"].includes(command)) return onRemoteSkip(c.args || {});
  if (["grok_reload", "recargar_grok", "grok"].includes(command)) return bg(onRemoteGrokReload());
  if (["flow_reload", "recargar_flow", "flow"].includes(command)) return bg(onRemoteFlowReload());
  if (["extension_reload", "recargar_extension"].includes(command)) {
    await saveState();
    log(LOG_LEVEL.INFO, `Remote: recargo la extension (build ${EXTENSION_BUILD}); el estado ya quedo persistido.`);
    setTimeout(() => chrome.runtime.reload(), 250);
    return;
  }
  if (["queue_on", "cola_on"].includes(command)) {
    await onSetConfig({ config: { autoQueue: true } });
    return bg(pollQueue());
  }
  if (["queue_off", "cola_off"].includes(command)) return onSetConfig({ config: { autoQueue: false } });
  if (["status", "estado"].includes(command)) { scheduleRemoteState(); return; }
  log(LOG_LEVEL.WARN, `Remote: comando no permitido: ${command}`);
}

// Adopta un /post YA pagado y visualmente identificado. Esta via nunca llama GENERATE_IMAGE: solo
// fija la URL exacta en la barrera durable y reutiliza el recuperador/validador normal de la escena.
async function onRemoteRecoverGrokPost(args = {}) {
  await ensureState();
  const sceneId = String(args.sceneId || "");
  const postUrl = String(args.postUrl || "");
  if (!/^https:\/\/(?:www\.)?grok\.com\/imagine\/post\/[a-z0-9-]+(?:[/?#].*)?$/i.test(postUrl)) {
    log(LOG_LEVEL.WARN, "Remote recuperar_post_grok: postUrl no es un /imagine/post valido de Grok.");
    return;
  }
  const scene = (state.scenes || []).find((s) => s.id === sceneId);
  if (!scene) { log(LOG_LEVEL.WARN, `Remote recuperar_post_grok: escena no encontrada: ${sceneId}.`); return; }
  if (sceneHasImage(scene)) {
    log(LOG_LEVEL.WARN, `Remote recuperar_post_grok: ${sceneId} ya tiene imagen; no la sobrescribo.`);
    return;
  }
  const rejectImageKeys = scene.grokImageAttempt?.before?.length
    ? [...scene.grokImageAttempt.before]
    : knownGrokImageKeys({ excludeSceneId: scene.id });
  if (!scene.grokImageAttempt) scene.grokImageAttempt = newGrokImageAttempt("scene", scene.id, rejectImageKeys);
  scene.grokImageAttempt.submitIssued = true;
  scene.grokImageAttempt.issuedAt = scene.grokImageAttempt.issuedAt || Date.now();
  scene.grokImageAttempt.postUrl = postUrl;
  scene.grokImageAttempt.stage = "manual_exact_post_recovery";
  scene.grokImageAttempt.noAutoRetry = true;
  scene.status = SCENE_STATUS.ERROR;
  scene.error = `recuperacion dirigida desde ${postUrl}`;
  scene.errorPhase = "images";
  scene.noAutoRetry = true;
  state.queue.paused = true;
  state.queue.running = false;
  await saveState(); emitState();
  log(LOG_LEVEL.INFO, `Escena ${sceneId}: adopto el post exacto ya generado; NO envio Enter.`);
  return onRetryScene({ sceneId, mode: "image", recoverOnly: true });
}

// Salida de emergencia dirigida despues de comprobar que el DOM ya no conserva grilla ni /post.
// No genera: solo elimina la barrera ambigua, deja ERROR accionable y reinicia el worker para cancelar
// cualquier COLLECT_IMAGE largo que aun estuviera esperando. El siguiente Retry explicito crea UN intento.
async function onRemoteReleaseGrokRecovery(args = {}) {
  await ensureState();
  const ingredientId = String(args.ingredientId || "");
  const ing = (state.project?.ingredients || []).find((g) => g.id === ingredientId);
  if (!ing) { log(LOG_LEVEL.WARN, `Liberar recuperacion Grok: ingrediente no encontrado: ${ingredientId}.`); return; }
  ing.grokImageAttempt = null;
  ing.status = SCENE_STATUS.ERROR;
  ing.error = "la generacion anterior ya no conserva grilla ni post recuperable; Reintentar autoriza una generacion nueva";
  ing.noAutoRetry = false;
  ing.regeneratePending = true;
  state.queue.paused = true;
  state.queue.running = false;
  directedRecoveryBusy = false;
  await saveState();
  log(LOG_LEVEL.WARN, `Ingrediente ${ingredientId}: recuperacion agotada y liberada; NO envie Enter. El siguiente Reintentar autoriza uno nuevo.`);
  emitState();
  setTimeout(() => chrome.runtime.reload(), 250);
}

async function onRemoteRetry(args = {}) {
  await ensureState();
  // Dirigido: /reintentar <escena> desde Telegram. Modo SEGURO por estado: video ya pagado -> solo
  // recoger/descargar; imagen ok y fallo de animacion -> re-animar (el usuario confirmo el costo en el
  // bridge); sin imagen -> regenerar desde cero (gratis).
  if (args.sceneId) {
    const s = (state.scenes || []).find((x) => x.id === args.sceneId);
    if (!s) { log(LOG_LEVEL.WARN, `Remote reintentar: escena no encontrada: ${args.sceneId}`); return; }
    const requestedMode = ["image", "anim", "download"].includes(args.mode) ? args.mode : null;
    const mode = args.recoverOnly ? "image"
      : requestedMode || (s.videoUrl ? "download" : (sceneHasImage(s) && s.errorPhase !== "images") ? "anim" : "image");
    return onRetryScene({ sceneId: args.sceneId, mode, recoverOnly: !!args.recoverOnly });
  }
  if (args.ingredientId) return onRetryIngredient({ ingredientId: args.ingredientId, recoverOnly: !!args.recoverOnly });
  const ing = (state.project?.ingredients || []).find((g) => g.status === SCENE_STATUS.ERROR);
  if (ing) return onRetryIngredient({ ingredientId: ing.id });
  if ((state.scenes || []).some((s) => s.status === SCENE_STATUS.ERROR)) return onRetryAllErrors();
  if (state.queue?.paused) return onStartOrResume();
  log(LOG_LEVEL.INFO, "Remote reintentar: no hay error activo.");
}

async function onRemoteSkip(args = {}) {
  await ensureState();
  if (args.sceneId) return onSkipScene({ sceneId: args.sceneId });
  const ing = (state.project?.ingredients || []).find((g) => g.status === SCENE_STATUS.ERROR);
  if (ing) {
    log(LOG_LEVEL.WARN, `Remote saltar: no salto ingredientes automaticamente (${ing.id}); usa reintentar o corrige el JSON.`);
    return;
  }
  return onSkipScene({});
}

// Recarga Grok de cero DESDE EL TELEFONO (el cuelgue tipico de grok.com/imagine) y, si la corrida estaba
// pausada por fallo, reanuda sola. Seguro contra re-gasto: los runners son idempotentes (grokFired/videoUrl).
async function onRemoteGrokReload() {
  await ensureState();
  if ((autopilotBusy || loopRunning || ingredientsRunning) && !state.queue.paused) {
    log(LOG_LEVEL.WARN, "Remote grok_reload: hay una corrida activa; pausa primero (/pausar) para no matar la generacion en curso.");
    return;
  }
  const tab = await findFlowTab("grok");
  if (!tab) { log(LOG_LEVEL.WARN, "Remote grok_reload: no hay pestana de Grok abierta."); return; }
  detachDebugger(tab.id);
  try { await hardReloadGrok(tab.id); }
  catch (e) { log(LOG_LEVEL.WARN, `Remote grok_reload: la recarga fallo (${e?.message ?? e}).`); return; }
  if (state.pacing) state.pacing.grokGenCount = 0;
  await saveState();
  log(LOG_LEVEL.INFO, "Remote: Grok recargado de cero.");
  if (state.queue?.paused) {
    log(LOG_LEVEL.INFO, "Remote grok_reload: la corrida estaba pausada; reanudo.");
    await onStartOrResume();
  }
}

// Recarga el MISMO proyecto de Flow solo cuando no hay una accion cara en vuelo. A diferencia de
// ensureFlowReady, nunca crea ni cambia de proyecto: sirve para liberar el renderer y recuperar el DOM.
async function onRemoteFlowReload() {
  await ensureState();
  if ((autopilotBusy || loopRunning || ingredientsRunning) && !state.queue.paused) {
    log(LOG_LEVEL.WARN, "Remote flow_reload: hay una corrida activa; pausa primero para no cortar la generacion en curso.");
    return;
  }
  const tab = await findFlowTab("flow");
  if (!tab) { log(LOG_LEVEL.WARN, "Remote flow_reload: no hay pestana del proyecto Flow asociado."); return; }
  try { await hardReloadFlow(tab.id); }
  catch (e) { log(LOG_LEVEL.WARN, `Remote flow_reload: la recarga fallo (${e?.message ?? e}).`); return; }
  state.pacing = state.pacing || {};
  state.pacing.flowGenCount = 0;
  await saveState();
  log(LOG_LEVEL.INFO, "Remote: proyecto Flow recargado sin regenerar medios.");
}

// ---------------------------------------------------------------------------
// Handlers de comandos
// ---------------------------------------------------------------------------

async function onLoadJson(message) {
  // Una carga remota/panel puede llegar justo mientras resumeIfInterrupted esta recolectando un asset
  // ya pagado. Sustituir state.project en ese instante deja al recuperador escribiendo sobre objetos
  // huerfanos: el JPG se guarda, pero el estado nuevo sigue GENERATING y luego lo marca ERROR. Esperar
  // conserva tanto el JSON solicitado como el resultado; hydrateExistingIngredientFiles lo adoptara.
  if (resumeInFlight || directedRecoveryBusy) {
    log(LOG_LEVEL.WARN, "Carga de JSON aplazada: estoy cerrando una recuperacion Grok ya pagada.");
    const waitUntil = Date.now() + 240000;
    while ((resumeInFlight || directedRecoveryBusy) && Date.now() < waitUntil) await delay(250);
    if (resumeInFlight || directedRecoveryBusy) {
      log(LOG_LEVEL.ERROR, "Carga de JSON cancelada: la recuperacion Grok no cerro en 4 minutos; vuelve a cargarlo cuando termine.");
      return;
    }
  }
  const checked = validateQueueProject(message.json);
  if (!checked.ok) {
    for (const err of checked.errors) log(LOG_LEVEL.ERROR, `JSON invalido: ${err}`);
    return;
  }
  const result = checked.parsed;
  // Avisos no fatales (ej. referencia a un personaje/escena que no existe): se surfacean ANTES de
  // gastar puntos, no se tiran a la basura. El dato ya lo calcula parseProject.
  for (const w of result.warnings || []) log(LOG_LEVEL.WARN, `Aviso del JSON: ${w}`);
  // Preserva el characterRef ya cargado (el JSON nuevo no lo trae).
  const prevRef = state.project?.characterRef ?? null;
  const prevQueue = state.queue || {};
  state.project = { ...result.project, characterRef: prevRef };
  state.scenes = result.scenes;
  // jobName/jobSlug SOLO se preservan si el JSON cargado corresponde al job reclamado (la cola carga el
  // json del job -> mismo slug). Un JSON manual de OTRO proyecto los dejaba rancios y la reanudacion
  // automatica de la cola actuaba sobre el job equivocado.
  const keepJob = !!prevQueue.jobName && (!prevQueue.jobSlug || prevQueue.jobSlug === result.project.slug);
  state.queue = { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0, doneJobs: prevQueue.doneJobs || [], jobName: keepJob ? prevQueue.jobName : null, jobSlug: keepJob ? (prevQueue.jobSlug || null) : null };  // preserva cola/doneJobs/lock
  // Reinicia el RITMO al cargar un JSON nuevo: cada video arranca "fresco". Antes solo se reseteaba queue,
  // asi que un 2o video en la misma hora HEREDABA windowCount/sessionGen/cooldown del anterior y disparaba
  // "Tope 50/hora: pausa 20 min" (o un descanso largo) de la nada. El tope/hora pasa a ser por-video.
  state.pacing = { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0, grokGenCount: 0, flowGenCount: 0 };
  // El JSON manda el proveedor (pipeline.image_generation.tool). Si lo declara, enruta a Flow o Grok;
  // si no, respeta el del panel. Asi la cola automatica mezcla JSON de Flow y Grok sin tocar nada.
  if (result.project.provider && result.project.provider !== state.config.provider) {
    state.config.provider = result.project.provider;
    log(LOG_LEVEL.INFO, `Proveedor segun JSON: ${result.project.provider}.`);
  }
  const prepared = await prepareProjectMedia(message.json).catch((e) => {
    log(LOG_LEVEL.WARN, `No pude preparar medios del slug (${e?.message ?? e}); continuo.`);
    return null;
  });
  if (prepared?.runtimeSnapshot) state.project.runtimeSnapshot = prepared.runtimeSnapshot;
  await hydrateExistingIngredientFiles({ emit: false }).catch(() => false);
  await rehydrateScenesFromDisk().catch((e) => log(LOG_LEVEL.WARN, `Rehidratacion desde disco fallo (${e?.message ?? e}); continuo sin ella.`));
  await saveState();
  log(LOG_LEVEL.INFO, `Proyecto cargado: "${state.project.title}" (${state.scenes.length} escenas).`);
  emitState();
  emitProgress();
}

async function prepareProjectMedia(projectJson) {
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  const res = await fetch(`${base}/project/prepare-media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(projectJson),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error || res.statusText);
  if (j.archived) log(LOG_LEVEL.WARN, `Slug ${j.slug}: medios anteriores archivados por JSON distinto -> ${j.archive}`);
  return j;
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
  // Marca una pausa EXPLICITA, distinta de la pausa automatica por error. Los retries dirigidos
  // pueden reanudar solos tras reparar un fallo, pero nunca deben deshacer un clic de Pausa que
  // llego mientras estaban cerrando la generacion actual.
  state.queue.pauseRequestedAt = Date.now();
  await saveState();
  const activeIngredient = (state.project?.ingredients || []).find((g) => g.status === SCENE_STATUS.GENERATING_IMAGE);
  log(LOG_LEVEL.INFO, activeIngredient
    ? `Pausa solicitada: cierro ${activeIngredient.id} sin perder la generacion ya enviada; no iniciare el siguiente ingrediente.`
    : "Cola pausada.");
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
  // Guard de corrida activa (mismo criterio que onRetryIngredient): un retry a media corrida cambiaba
  // queue.phase debajo del bucle vivo. Con la cola PAUSADA (flujo normal de recuperacion) si se permite.
  if (autopilotBusy || loopRunning || ingredientsRunning) {
    log(LOG_LEVEL.WARN, state.queue.paused
      ? `Escena ${scene.id}: la pausa ya se registro, pero la accion actual aun esta cerrando; espera a que termine antes de reintentar.`
      : `Escena ${scene.id}: hay una corrida activa; pausa o espera a que termine antes de reintentar.`);
    emitState();
    return;
  }
  const mode = message.mode || "image";
  const imageProvider = state.project?.imageProvider || state.config.provider;
  const recoverOnly = !!message.recoverOnly;
  if (mode === "image") {
    // Un retry de imagen no puede seguir contando el canonical anterior como exito. En celdas V6,
    // ademas invalida la pagina derivada: de lo contrario se mejora la celda pero Remotion conserva
    // el JPG compuesto viejo (o la barrera avanza tras un retry fallido porque imageFilePath seguia vivo).
    scene.imageFilePath = null;
    scene.savedOk = false;
    await invalidatePageParentForCell(scene, `retry de ${scene.id}`);
  }

  // Igual que ingredientes: si Enter ya se confirmo, Reintentar primero RECUPERA esa generacion.
  // Borrar el intento aqui hacia que un fallo de deteccion/descarga pagara otra imagen y dejara la
  // anterior huerfana en Grok.
  if (mode === "image" && imageProvider === "grok"
      && (scene.grokImageAttempt?.submitIssued || recoverOnly)) {
    const rejectImageKeys = scene.grokImageAttempt?.before?.length
      ? [...scene.grokImageAttempt.before]
      : knownGrokImageKeys({ excludeSceneId: scene.id });
    // Estados legacy podian perder el marcador al fallar la deteccion. `recoverOnly` reconstruye una
    // barrera que permite SOLO COLLECT+validacion; nunca pasa por GENERATE_IMAGE.
    if (!scene.grokImageAttempt) {
      scene.grokImageAttempt = newGrokImageAttempt("scene", scene.id, rejectImageKeys);
      scene.grokImageAttempt.submitIssued = true;
      scene.grokImageAttempt.stage = "manual_recovery_only";
      scene.grokImageAttempt.issuedAt = Date.now();
    }
    log(LOG_LEVEL.INFO, `Escena ${scene.id}: recuperando la generacion ya enviada; NO envio otro Enter.`);
    scene.status = SCENE_STATUS.GENERATING_IMAGE;
    scene.error = null;
    await saveState(); emitState();
    try {
      let tab = null;
      if (scene.grokImageAttempt?.tabId != null) {
        try {
          const exact = await chrome.tabs.get(scene.grokImageAttempt.tabId);
          if (/^https:\/\/(?:www\.)?grok\.com\//i.test(exact?.url || "")) tab = exact;
        } catch (_e) { /* el tab exacto ya no existe */ }
      }
      if (!tab) {
        try { tab = await findFlowTab("grok"); } catch (_e) { tab = null; }
      }
      const img = await recoverPersistedGrokResult(tab, scene, "scene", rejectImageKeys, `Escena ${scene.id}`);
      if (state.queue.errorSceneId === scene.id) state.queue.errorSceneId = null;
      await adoptRecoveredGrokScene(scene, img, rejectImageKeys);
      log(LOG_LEVEL.INFO, `Escena ${scene.id} recuperada; la cola permanece pausada para revision.`);
    } catch (e) {
      const detail = e?.message ?? String(e);
      const confirmedEmptyPromptGroup = /GROK_PROMPT_GROUP_EMPTY/i.test(detail);
      const recoveredOnlyPreviousScene = /todas las variantes ya generadas fueron rechazadas[\s\S]*duplica exactamente una escena previa/i.test(detail);
      const confirmedNoUsableOutput = confirmedEmptyPromptGroup || recoveredOnlyPreviousScene;
      scene.status = SCENE_STATUS.ERROR;
      scene.error = recoveredOnlyPreviousScene
        ? "Grok no produjo una imagen nueva utilizable: el unico post recuperable duplica exactamente otra escena. Regen img queda habilitado para una nueva generacion solo si tu la confirmas."
        : confirmedEmptyPromptGroup
          ? "Grok acepto el prompt, pero su bloque quedo vacio y no existe una imagen correcta que recuperar. Regen img enviara una nueva generacion solo si tu la confirmas."
          : `no pude recuperar la generacion ya pagada: ${detail}`;
      scene.errorPhase = "images";
      scene.noAutoRetry = !confirmedNoUsableOutput;
      if (confirmedNoUsableOutput) {
        // El DOM demostro que no hay asset nuevo (bloque vacio o unico post = bytes de otra escena).
        // Ya no hay un intento ambiguo que proteger; un clic MANUAL puede generar una vez. Nunca aqui.
        scene.grokImageAttempt = null;
      } else {
        scene.grokImageAttempt.noAutoRetry = true;
        scene.grokImageAttempt.stage = "recovery_failed";
      }
      state.queue.paused = true;
      state.queue.running = false;
      state.queue.errorSceneId = scene.id;
      await saveState(); emitState();
      log(LOG_LEVEL.ERROR, `Escena ${scene.id}: ${scene.error}. No se envio otra generacion.`);
    }
    return;
  }

  scene.attempts = 0;
  scene.error = null;
  if (state.queue.errorSceneId === scene.id) state.queue.errorSceneId = null;

  if (mode === "download" && scene.videoUrl) {
    scene.status = SCENE_STATUS.ANIMATING;   // runParallelAnimation PASO 3 lo recoge (ANIMATING + videoUrl)
    await saveState();
    log(LOG_LEVEL.INFO, `Escena ${scene.id}: reintento SOLO descarga (mantengo el video de Flow).`);
    emitSceneStatus(scene.id, SCENE_STATUS.ANIMATING);
    emitState();
    return runAnimationRetry(scene);
  }

  if (mode === "anim" && sceneHasImage(scene)) {
    scene.animationFinalRetryUsed = false;
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
  return runAnimationRetry(scene);
  }

  // mode "image" (o sin imagen/video que reutilizar): regenerar imagen desde cero.
  scene.status = SCENE_STATUS.PENDING;
  scene.grokImageAttempt = null;
  scene.noAutoRetry = false;
  scene.imageFinalRetryUsed = false;
  scene.animationFinalRetryUsed = false;
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

// Reintento por ingrediente. No arranca escenas: solo regenera ese ingrediente y actualiza el estado
// para que luego las escenas usen el asset nuevo.
async function onRetryIngredient(message) {
  const ingredientId = message.ingredientId || message.id;
  const recoverOnly = !!message.recoverOnly;
  const ing = (state.project?.ingredients || []).find((g) => g.id === ingredientId);
  if (!ing) {
    log(LOG_LEVEL.WARN, `RETRY: ingrediente no encontrado: ${ingredientId}`);
    return;
  }
  const activeIngredient = (state.project?.ingredients || []).some((g) => g.status === SCENE_STATUS.GENERATING_IMAGE);
  const ingredientPhaseActive = ingredientsRunning || ((autopilotBusy || state.queue.running) && activeIngredient);
  if (ingredientPhaseActive) {
    if (recoverOnly) {
      // Recuperar solo es una sonda sin costo. Si el mismo ingrediente sigue en vuelo, convertirla
      // en `retryQueued` mandaria otro Enter al terminar y duplicaria una imagen ya pagada.
      log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId}: la recuperacion sin generar espera a que cierre la accion actual; NO encole otro Enter.`);
      emitState();
      return;
    }
    // El clic ya es una intencion suficiente: persistirlo en vez de obligar al usuario a acertar el
    // intervalo de milisegundos entre dos ingredientes. Conservamos el asset vigente hasta que el turno
    // encolado realmente empiece, para no romper referencias de la generacion que esta cerrando.
    ing.regeneratePending = true;
    ing.retryQueued = true;
    await saveState();
    log(LOG_LEVEL.INFO, state.queue.paused
      ? `Ingrediente ${ingredientId}: Rehacer quedo encolado; correra al reanudar, despues de cerrar la generacion actual.`
      : `Ingrediente ${ingredientId}: Rehacer quedo encolado y correra al terminar el ingrediente actual.`);
    emitState();
    return;
  }
  if (autopilotBusy || loopRunning) {
    log(LOG_LEVEL.WARN, state.queue.paused
      ? `Ingrediente ${ingredientId}: la corrida aun esta cerrando la accion en curso; espera antes de rehacerlo.`
      : `Ingrediente ${ingredientId}: espera a que termine o pausa la corrida antes de rehacerlo.`);
    emitState();
    return;
  }

  if (!(await ensureProviderForPhase("images", `Rehacer ingrediente ${ingredientId}`))) return;

  const wasError = ing.status === SCENE_STATUS.ERROR;   // el retry viene de un fallo (no de un rehacer estetico)
  const imageProvider = state.project?.imageProvider || state.config.provider;
  // Capturar la revision ANTES de cualquier recuperacion larga. Si el usuario pulsa Pausa mientras
  // inspeccionamos el intento viejo, esa pausa cancela tambien el fallback que enviaria un Enter nuevo.
  const pauseRequestedAtStart = Number(state.queue.pauseRequestedAt || 0);
  let recoveryFailedForAuthorizedRetry = false;
  // Una recuperacion manual ya fallo y dejo `recovery_failed`: el SIGUIENTE clic explicito en
  // Reintentar es la autorizacion que prometia el log para enviar un Enter nuevo. Antes el codigo
  // ignoraba esa autorizacion y volvia a recuperar eternamente el mismo intento imposible.
  if (imageProvider === "grok" && ing.grokImageAttempt?.submitIssued
      && ing.grokImageAttempt?.stage === "recovery_failed" && !recoverOnly) {
    log(LOG_LEVEL.WARN, `Ingrediente ${ingredientId}: la recuperacion anterior ya fallo; este Reintentar autoriza UNA generacion nueva.`);
    ing.grokImageAttempt = null;
    ing.noAutoRetry = false;
  } else if (imageProvider === "grok" && ing.grokImageAttempt?.submitIssued
      && ing.grokImageAttempt?.stage === "recovery_failed" && recoverOnly) {
    ing.grokImageAttempt.stage = "manual_recovery_only";
    log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId}: vuelvo a inspeccionar el intento original con el detector actualizado; NO envio Enter.`);
  }
  // Si Grok ya recibio Enter y persistio candidatos, "Reintentar" significa volver a descargar/validar
  // ESE resultado. Borrar grokImageAttempt aqui causaba una segunda generacion pagada por un simple fallo
  // de nombre/ruta/red durante la descarga.
  if (imageProvider === "grok" && ing.grokImageAttempt?.submitIssued) {
    const rejectImageKeys = ing.grokImageAttempt?.before?.length
      ? [...ing.grokImageAttempt.before]
      : knownGrokImageKeys({ excludeIngredientId: ing.id });
    log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId}: recuperando la generacion ya enviada; NO envio otro Enter.`);
    ing.status = SCENE_STATUS.GENERATING_IMAGE;
    ing.error = null;
    await saveState(); emitState();
    directedRecoveryBusy = true;
    try {
      let tab = null;
      try { tab = await findFlowTab("grok"); } catch (_e) { tab = null; }
      const recoveryProjectSlug = state.project?.slug || null;
      const img = await recoverPersistedGrokResult(tab, ing, "ingredient", rejectImageKeys, `Ingrediente ${ingredientId}`);
      if (state.project?.slug !== recoveryProjectSlug) throw new Error("el proyecto cambio durante la recuperacion; no adopto el asset en otro JSON");
      const liveIng = grokAttemptOwner("ingredient", ingredientId);
      if (!liveIng) throw new Error(`el ingrediente ${ingredientId} desaparecio durante la recuperacion`);
      if (!liveIng.grokImageAttempt && ing.grokImageAttempt) liveIng.grokImageAttempt = ing.grokImageAttempt;
      await adoptRecoveredGrokIngredient(liveIng, img, rejectImageKeys);
    } catch (e) {
      const detail = e?.message ?? e;
      const userPausedDuringRecovery = Number(state.queue.pauseRequestedAt || 0) > pauseRequestedAtStart;
      // `recoverOnly` nunca genera. En cambio, Reintentar/Rehacer es autorizacion explicita para UN
      // nuevo Enter si la sonda del resultado viejo tampoco encuentra un asset comprobable. Antes se
      // exigian dos clics: el primero solo fallaba recuperando y dejaba recovery_failed; parecia trabado.
      if (!recoverOnly && !userPausedDuringRecovery) {
        recoveryFailedForAuthorizedRetry = true;
        ing.grokImageAttempt = null;
        ing.noAutoRetry = false;
        log(LOG_LEVEL.WARN, `Ingrediente ${ingredientId}: la recuperacion no encontro un asset verificable (${detail}); este Reintentar autoriza UN intento nuevo.`);
      } else {
        ing.status = SCENE_STATUS.ERROR;
        ing.error = `no pude recuperar la generacion ya pagada: ${detail}`;
        ing.noAutoRetry = true;
        ing.grokImageAttempt.noAutoRetry = true;
        ing.grokImageAttempt.stage = "recovery_failed";
        state.queue.paused = true;
        state.queue.running = false;
        await saveState(); emitState();
        log(LOG_LEVEL.ERROR, userPausedDuringRecovery
          ? `Ingrediente ${ingredientId}: ${ing.error}. Respeto la Pausa; no envie otra generacion.`
          : `Ingrediente ${ingredientId}: ${ing.error}. No se envio otra generacion.`);
        return;
      }
    } finally {
      directedRecoveryBusy = false;
    }
    if (!recoveryFailedForAuthorizedRetry && wasError && state.queue.paused) {
      if (state.queue.jobName && state.config.autoQueue
          && (!state.queue.jobSlug || state.queue.jobSlug === state.project?.slug)) {
        state.queue.paused = false;
        await saveState(); emitState();
        log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId} recuperado: la cola reanuda "${state.queue.jobName}".`);
        pollQueue().catch(() => {});
      } else {
        log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId} recuperado; la corrida permanece bajo control manual.`);
      }
    }
    if (!recoveryFailedForAuthorizedRetry) return;
  }
  ing.regeneratePending = true; // persiste aunque el SW muera; no rehidratar el canonical viejo hasta reemplazarlo
  ing.grokImageAttempt = null;
  ing.noAutoRetry = false;
  ing.imageUrl = null;
  ing.imageFilePath = null;
  ing.status = SCENE_STATUS.PENDING;
  ing.error = null;
  state.queue.errorSceneId = null;
  await saveState();
  emitState();

  log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId}: reintentando generacion manual.`);
  const ok = await runIngredientsPhase({ forceIds: [ingredientId], ignorePaused: true });
  await ensureState();
  emitState();
  // Auto-reanudacion: si el retry vino de un fallo que dejo la corrida PAUSADA y salio bien, continuar
  // solo. Antes quedaba "regenerado" + pausado para siempre y parecia que la extension se colgaba.
  const userPausedDuringRetry = Number(state.queue.pauseRequestedAt || 0) > pauseRequestedAtStart;
  if (ok && wasError && state.queue.paused && !userPausedDuringRetry) {
    // Rama de cola SOLO si el job reclamado corresponde al proyecto cargado (jobSlug ancla); un jobName
    // rancio de otro proyecto mandaba a pollQueue a reclamar/correr un job ajeno.
    if (state.queue.jobName && state.config.autoQueue
        && (!state.queue.jobSlug || state.queue.jobSlug === state.project?.slug)) {
      // Job de la cola: despausar y dejar que pollQueue reanude la corrida completa (fases + audio + done).
      state.queue.paused = false;
      state.queue.errorSceneId = null;
      await saveState();
      log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId} recuperado: la cola reanuda "${state.queue.jobName}".`);
      emitState();
      pollQueue().catch(() => {});
    } else {
      log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId} recuperado: reanudo la corrida.`);
      await onStartOrResume();
    }
  } else if (ok && userPausedDuringRetry) {
    log(LOG_LEVEL.INFO, `Ingrediente ${ingredientId} listo; respeto la Pausa solicitada durante su generacion.`);
  }
}

// Arranca la fase de animacion para recoger/animar las escenas que YA estan en estado animable
// (IMAGE_DONE / ANIMATING+videoUrl). A diferencia de onStartPhase, NO reactiva las escenas en ERROR:
// asi un reintento por escena toca solo la que el usuario pidio.
async function runAnimationRetry(scene) {
  if (!scene) throw new Error("Reintentar animacion requiere una escena dirigida");
  if (!(await ensureProviderForPhase("animation", "Reintentar animacion"))) return;
  state.queue.phase = "animation";
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  emitState();
  log(LOG_LEVEL.INFO, `Reintento dirigido: proceso SOLO la animacion de ${scene.id}; no arranco imagenes pendientes.`);
  try {
    if (state.project?.perSceneRender && scene.renderMode !== "animated") {
      await markStaticSceneDone(scene);
    } else {
      const animProv = state.project?.animationProvider || state.config.provider;
      if (state.config.dryRun) await runDryRunAnimation(scene);
      else if (animProv === "grok") await runGrokAnimation(scene);
      else await runRealAnimation(scene);
    }
  } catch (e) {
    if (e?.hardStop) await onHardStop(e.hardStop, e?.message ?? String(e));
    else {
      scene.status = SCENE_STATUS.ERROR;
      scene.error = e?.message ?? String(e);
      scene.errorPhase = "animation";
      state.queue.paused = true;
      state.queue.errorSceneId = scene.id;
      log(LOG_LEVEL.ERROR, `Reintento dirigido ${scene.id} fallo: ${scene.error}`);
    }
  } finally {
    state.queue.running = false;
    await saveState();
    emitState();
    emitProgress();
  }
}

// Re-encola TODAS las escenas en ERROR de un tiron (reemplaza la vieja reactivacion automatica que
// re-gastaba puntos sin querer). La confirmacion de costo la hace el panel ANTES de mandar el comando.
// imagen sin imageUrl -> PENDING (gratis); con imageUrl -> IMAGE_DONE (re-animar, cuesta).
async function onRetryAllErrors() {
  const ingredientErrors = (state.project?.ingredients || []).filter((g) => g.status === SCENE_STATUS.ERROR);
  // El boton global tambien debe servir durante FASE INGREDIENTES. Antes solo miraba escenas y respondia
  // "No hay escenas en error" aunque un ingrediente fuera exactamente lo que mantenia todo bloqueado.
  // Procesamos uno: al terminar, la reanudacion normal continuara los restantes sin solapar Enter.
  if (ingredientErrors.length) {
    log(LOG_LEVEL.INFO, `Reintentar errores: atiendo primero el ingrediente ${ingredientErrors[0].id}.`);
    return onRetryIngredient({ ingredientId: ingredientErrors[0].id });
  }
  const errs = state.scenes.filter((s) => s.status === SCENE_STATUS.ERROR);
  if (!errs.length) { log(LOG_LEVEL.INFO, "No hay ingredientes ni escenas en error para reintentar."); return; }
  // Mismo guard que onRetryScene: no cambiar fase/estados debajo de un bucle vivo (con pausa si se permite).
  if (autopilotBusy || loopRunning || ingredientsRunning) {
    log(LOG_LEVEL.WARN, state.queue.paused
      ? "Reintentar errores: la pausa ya se registro, pero la accion actual aun esta cerrando; espera un momento."
      : "Reintentar errores: hay una corrida activa; pausa o espera a que termine.");
    emitState();
    return;
  }
  let toImages = false;
  let toAnimate = false;
  for (const s of errs) {
    s.attempts = 0; s.error = null; s.animationFinalRetryUsed = false;
    const retryAsImage = s.errorPhase === "images" || !sceneHasImage(s);
    if (!retryAsImage && sceneHasImage(s) && s.videoUrl) {
      // El video YA se pago (fallo la descarga/guardado, no la animacion): SOLO recoger/descargar,
      // igual que el retry por escena en modo "download". NO limpiar videoUrl/grokFired: eso re-dispara
      // la animacion y cobra 20-40 pts otra vez por un clip que ya existe.
      s.status = SCENE_STATUS.ANIMATING;
      s.clipFilename = null;
      s.lastFrameFilename = null;
      s.savedOk = false;
      toAnimate = true;
    } else if (!retryAsImage && sceneHasImage(s)) {
      if (s.grokFired && s.grokVideoPostUrl) {
        // El FIRE YA se pago y sabemos donde quedo el post: NO limpiar grokFired (re-dispararia y cobraria
        // 20-40 pts otra vez). IMAGE_DONE + flags intactos -> el runner salta el fire y recolecta ahi
        // (mismo tratamiento que resumeIfInterrupted).
        s.status = SCENE_STATUS.IMAGE_DONE;
        s.videoUrl = null;
        s.clipFilename = null;
        s.lastFrameFilename = null;
        s.savedOk = false;
      } else {
        s.status = SCENE_STATUS.IMAGE_DONE;
        s.videoUrl = null;
        s.clipFilename = null;
        s.lastFrameFilename = null;
        s.savedOk = false;
        s.grokFired = false;
        s.grokVideoPostUrl = null;
        s.grokAnimBefore = null;
      }
      toAnimate = true;
    } else {
      await invalidatePageParentForCell(s, `reintento de error ${s.id}`);
      s.status = SCENE_STATUS.PENDING;
      s.grokImageAttempt = null;
      s.noAutoRetry = false;
      s.imageFinalRetryUsed = false;
      s.animationFinalRetryUsed = false;
      s.imageUrl = null;
      s.imageFilePath = null;
      s.grokPostUrl = null;
      s.videoUrl = null;
      s.clipFilename = null;
      s.lastFrameFilename = null;
      s.savedOk = false;
      s.grokFired = false;
      s.grokVideoPostUrl = null;
      s.grokAnimBefore = null;
      toImages = true;
    }
    s.errorPhase = null;
    emitSceneStatus(s.id, s.status);
  }
  state.queue.errorSceneId = null;
  state.queue.phase = toImages || (state.scenes || []).some((s) => s.status === SCENE_STATUS.PENDING) ? "images" : (toAnimate ? "animation" : "images");
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  log(LOG_LEVEL.INFO, `Reintentando ${errs.length} escena(s) en error (fase ${state.queue.phase}).`);
  emitState();
  // Si estos eran errores de imagen, el usuario espera un flujo desatendido: al quedar TODAS
  // resueltas se permite el cambio de fase. Si este intento vuelve a fallar, el barrier de
  // completedImagePhaseCanAnimate() lo deja en images y nunca se gasta una animacion incompleta.
  launchLoop({ continueToAnimation: toImages });
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
    s.imageFilePath = null;
    s.grokPostUrl = null;
    s.clipFilename = null;
    s.lastFrameFilename = null;
    // Tambien el estado de VIDEO: sin esto, la animacion veia el videoUrl viejo, saltaba el fire y pegaba
    // el clip anterior a la imagen regenerada (o fallaba con la URL expirada).
    s.videoUrl = null;
    s.savedOk = false;
    s.grokFired = false;
    s.grokVideoPostUrl = null;
    s.grokAnimBefore = null;
    s.grokImageAttempt = null;
    s.noAutoRetry = false;
    s.imageFinalRetryUsed = false;
    s.animationFinalRetryUsed = false;
  }
  state.queue = { running: false, paused: false, currentIndex: 0, phase: "images", errorSceneId: null, heartbeatAt: 0, doneJobs: state.queue?.doneJobs || [] };
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
  const prevRemote = state?.remote;   // preservar el cursor de comandos remotos: si vuelve a 0, el
  state = makeInitialState();         // dev-server re-sirve los comandos vivos (TTL 5 min) = replay
  state.remote = { lastCommandId: prevRemote?.lastCommandId || 0 };
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
  // WARN (no INFO): asi llega a Telegram; el usuario recibio "reanuda solo" y sin esto nunca se enteraba
  // de que la reanudacion se cancelo por el fallo pendiente.
  if (state.queue.errorSceneId) { log(LOG_LEVEL.WARN, "Cooldown terminado, pero hay un fallo pendiente; NO reanudo solo. Revisa /errores y dale Reintentar/Reanudar."); return; }
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  log(LOG_LEVEL.INFO, "Cooldown de rate-limit terminado: reanudando la cola.");
  emitState();
  // Mismas reparaciones que onStartOrResume/resumeIfInterrupted antes de relanzar el bucle.
  await repairMissingStillAssetsBeforeResume("cooldown");
  if (forceImagesPhaseIfPending("cooldown")) await saveState();
  if (!(await ensureIngredientsBeforeSceneLoop("cooldown"))) return;
  if (state.queue.mode === "parallel" && state.config.parallelPipeline) runPhasesParallel().catch((e) => log(LOG_LEVEL.ERROR, `Reanudacion paralela fallo: ${e?.message ?? e}`));
  else launchLoop();
}

function completedImagePhaseCanAnimate() {
  if ((state.queue?.phase || "images") !== "images") return false;
  if (!state.scenes?.length) return false;
  if (!state.scenes.some((s) => s.status === SCENE_STATUS.IMAGE_DONE)) return false;
  if (state.scenes.some((s) => [SCENE_STATUS.PENDING, SCENE_STATUS.GENERATING_IMAGE, SCENE_STATUS.ERROR].includes(s.status))) return false;
  const hasAnimated = state.scenes.some((s) => s.renderMode === "animated");
  if (state.project?.imageOnly && !hasAnimated) return false;
  return true;
}

async function advanceCompletedImagesToAnimationIfNeeded(reason) {
  if (!completedImagePhaseCanAnimate()) return false;
  state.queue.phase = "animation";
  state.queue.currentIndex = 0;
  state.queue.running = true;
  state.queue.paused = false;
  state.queue.errorSceneId = null;
  await saveState();
  log(LOG_LEVEL.INFO, `Auto-avance: imagenes completas; paso a animacion (${reason}).`);
  emitState();
  return true;
}

function isRenderableStillScene(scene) {
  if (!scene || scene.sceneType === "narrative_card") return false;
  // Escenas ANIMADAS quedan fuera tambien en imageOnly: su asset final es el clip (clips/<id>.mp4), no el
  // still. Antes, un .jpg fuente borrado de disco reseteaba la escena ENTERA (videoUrl/grokFired incluidos)
  // aunque el clip pagado siguiera intacto -> re-gasto de imagen + animacion.
  if (state.project?.imageOnly) return scene.renderMode !== "animated";
  return !!state.project?.perSceneRender && scene.renderMode !== "animated";
}

function sceneStillRelativePath(scene, slug = state.project?.slug || "proyecto") {
  const source = String(scene?.pageCellSource || "").replace(/\\/g, "/");
  if (scene?.isPageCell && /^images\/cells\/[a-z0-9][a-z0-9_.-]*\.(?:jpg|jpeg|png|webp)$/i.test(source) && !source.includes("..")) {
    return `remotion-editor/public/${slug}/${source}`;
  }
  return `remotion-editor/public/${slug}/images/${scene.id}.jpg`;
}

async function invalidatePageParentForCell(cell, reason = "celda modificada") {
  if (!cell?.isPageCell || !cell.pageParentId) return null;
  const parent = (state.scenes || []).find((scene) => scene.id === cell.pageParentId && scene.compositionOnly);
  if (!parent) return null;
  const wasResolved = parent.status !== SCENE_STATUS.PENDING || sceneHasImage(parent) || parent.savedOk;
  parent.status = SCENE_STATUS.PENDING;
  parent.attempts = 0;
  parent.error = null;
  parent.errorPhase = null;
  parent.imageUrl = null;
  parent.imageFilePath = null;
  parent.grokPostUrl = null;
  parent.videoUrl = null;
  parent.clipFilename = null;
  parent.lastFrameFilename = null;
  parent.savedOk = false;
  parent.grokFired = false;
  parent.grokVideoPostUrl = null;
  parent.grokAnimBefore = null;
  parent.grokImageAttempt = null;
  parent.noAutoRetry = false;
  parent.imageFinalRetryUsed = false;
  if (wasResolved) {
    emitSceneStatus(parent.id, SCENE_STATUS.PENDING);
    log(LOG_LEVEL.INFO, `${parent.id}: composicion invalidada (${reason}); se reconstruira despues de sus celdas.`);
  }
  const slug = state.project?.slug || "";
  if (slug) {
    const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
    try {
      const res = await fetch(`${base}/manhwa/invalidate-page`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, sceneId: parent.id, reason }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) throw new Error(body?.error || res.statusText);
    } catch (error) {
      log(LOG_LEVEL.WARN, `${parent.id}: no pude limpiar atomically JPG/composition/mask (${error?.message ?? error}); compose-page volvera a invalidarlos antes de publicar.`);
    }
  }
  return parent;
}

async function repairMissingStillAssetsBeforeResume(reason) {
  const slug = state.project?.slug || "";
  if (!slug || (!state.project?.imageOnly && !state.project?.perSceneRender)) return 0;
  let repaired = 0;
  for (const scene of state.scenes || []) {
    if (![SCENE_STATUS.DONE, SCENE_STATUS.IMAGE_DONE].includes(scene.status)) continue;
    if (!isRenderableStillScene(scene)) continue;
    const rel = sceneStillRelativePath(scene, slug);
    if (await publicFileOk(rel, 4096)) continue;
    scene.status = SCENE_STATUS.PENDING;
    scene.attempts = 0;
    scene.error = null;
    scene.imageUrl = null;
    scene.imageFilePath = null;
    scene.grokPostUrl = null;
    scene.videoUrl = null;
    scene.clipFilename = null;
    scene.lastFrameFilename = null;
    scene.savedOk = false;
    scene.grokFired = false;
    scene.grokVideoPostUrl = null;
    scene.grokAnimBefore = null;
    await invalidatePageParentForCell(scene, `asset faltante ${scene.id}`);
    repaired++;
    emitSceneStatus(scene.id, SCENE_STATUS.PENDING);
  }
  if (repaired) {
    state.queue.phase = "images";
    log(LOG_LEVEL.WARN, `Auto-reparacion (${reason}): ${repaired} still(s) faltante(s) reencolado(s) a imagenes.`);
    await saveState();
    emitState();
  }
  return repaired;
}

// Rehidratacion desde disco al cargar un JSON: si el asset final de una escena ya existe en
// remotion-editor/public/<slug>/ (corrida anterior interrumpida, re-carga del mismo JSON), se marca la
// escena como hecha en vez de regenerar y RE-GASTAR. Espejo de hydrateExistingIngredientFiles pero para
// escenas. prepareProjectMedia archiva la carpeta si el JSON cambio -> solo se rehidrata media del MISMO
// contenido. Sin dev-server corriendo es no-op (publicFileStatus devuelve null).
async function rehydrateScenesFromDisk() {
  const slug = state.project?.slug;
  if (!slug || !state.scenes?.length) return 0;
  const animProv = state.project?.animationProvider || state.config.provider;
  let doneCount = 0, stillCount = 0;
  for (const scene of state.scenes) {
    if (scene.status !== SCENE_STATUS.PENDING || scene.sceneType === "narrative_card") continue;
    const stillRel = sceneStillRelativePath(scene, slug);
    if (scene.compositionOnly) {
      const cellsReady = (scene.pageCellIds || []).every((cellId) => {
        const cell = state.scenes.find((candidate) => candidate.id === cellId);
        return sceneHasImage(cell);
      });
      // No adoptes un JPG compuesto viejo si falta una fuente: primero recupera/regenera la celda y
      // vuelve a componer. Adoptarlo aqui dejaba parent DONE y la celda nueva nunca llegaba al resultado.
      if (!cellsReady) continue;
    }
    if (isRenderableStillScene(scene)) {
      // El still ES el asset final (imageOnly / hibrido estatico).
      const st = await publicFileStatus(stillRel);
      if (st?.abspath && Number(st.size || 0) >= minMediaBytes(stillRel)) {
        scene.status = SCENE_STATUS.DONE;
        scene.imageFilePath = st.abspath;
        scene.savedOk = true;
        scene.error = null;
        doneCount++;
      }
      continue;
    }
    // Escena animada: el clip es el asset final.
    const clipRel = `remotion-editor/public/${slug}/clips/${scene.id}.mp4`;
    if (await publicFileOk(clipRel, minMediaBytes(clipRel))) {
      scene.status = SCENE_STATUS.DONE;
      scene.clipFilename = `${scene.id}.mp4`;
      scene.savedOk = true;
      scene.error = null;
      doneCount++;
      continue;
    }
    // Sin clip pero con el still en public/ y animacion en Grok: IMAGE_DONE con la ruta en disco -> la
    // fase de animacion SUBE la imagen por CDP (handoff, no necesita /post). Flow anima desde su tile
    // en la grilla, no desde disco -> no aplica.
    if (animProv === "grok") {
      const st = await publicFileStatus(stillRel);
      if (st?.abspath && Number(st.size || 0) >= minMediaBytes(stillRel)) {
        scene.status = SCENE_STATUS.IMAGE_DONE;
        scene.imageFilePath = st.abspath;
        scene.error = null;
        stillCount++;
      }
    }
  }
  if (doneCount || stillCount) {
    log(LOG_LEVEL.INFO, `Rehidratacion desde disco: ${doneCount} escena(s) ya completa(s)${stillCount ? ` y ${stillCount} still(s) listos para animar` : ""} -> no se regeneran (sin re-gasto).`);
  }
  return doneCount + stillCount;
}

function forceImagesPhaseIfPending(reason) {
  if ((state.queue?.phase || "images") !== "animation") return false;
  const hasPendingImages = unresolvedImageScenes(state.scenes).length > 0;
  if (!hasPendingImages) return false;
  state.queue.phase = "images";
  log(LOG_LEVEL.WARN, `Auto-correccion (${reason}): habia escenas pendientes; vuelvo a fase images.`);
  return true;
}

function providerForPhase(phase) {
  return phase === "animation"
    ? (state.project?.animationProvider || state.config.provider || DEFAULT_CONFIG.provider)
    : (state.project?.imageProvider || state.config.provider || DEFAULT_CONFIG.provider);
}

async function ensureProviderForPhase(phase, reason) {
  const provider = providerForPhase(phase);
  try {
    await ensureProviderReady(provider);
    return true;
  } catch (e) {
    state.queue.running = false;
    state.queue.paused = true;
    await saveState();
    log(LOG_LEVEL.ERROR, `${reason}: no pude preparar ${provider === "flow" ? "el proyecto Flow correcto" : "Grok"} (${e?.message ?? e}).`);
    emitState();
    return false;
  }
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
  if (directedRecoveryBusy) {
    log(LOG_LEVEL.WARN, "Reanudar: la recuperacion dirigida de Grok aun esta cerrando; no navego la pestana ni inicio otra corrida.");
    emitState();
    return;
  }
  const pauseRequestedAtStart = Number(state.queue.pauseRequestedAt || 0);
  await repairMissingStillAssetsBeforeResume("reanudar");
  forceImagesPhaseIfPending("reanudar");
  if (!(await ensureProviderForPhase(state.queue.phase || "images", "Reanudar"))) return;
  if (Number(state.queue.pauseRequestedAt || 0) > pauseRequestedAtStart) {
    state.queue.paused = true;
    await saveState();
    log(LOG_LEVEL.INFO, "Reanudar termino de preparar el proveedor, pero respeto la Pausa solicitada mientras esperaba.");
    emitState();
    return;
  }
  state.queue.paused = false;
  state.queue.running = true;
  state.queue.errorSceneId = null;   // al reanudar, reconocemos el fallo; el resto continua (la escena en error queda marcada)
  if (!state.queue.phase) state.queue.phase = "images";
  await saveState();
  emitState();
  if (!(await ensureIngredientsBeforeSceneLoop("reanudar"))) return;
  const advancedToAnimation = await advanceCompletedImagesToAnimationIfNeeded("reanudar");
  if (advancedToAnimation && !(await ensureProviderForPhase("animation", "Auto-avance al reanudar"))) return;
  // Si aun faltaba rehacer una imagen, dejamos que el bucle la cierre y solo entonces hacemos
  // el auto-avance. Esto cubre Reanudar despues de un fallo sin requerir otro clic del usuario.
  launchLoop({ continueToAnimation: !advancedToAnimation && state.queue.phase === "images" });
}

// Arranca una FASE: "images" (genera todas las imagenes) o "animation" (anima las listas).
async function onStartPhase(phase) {
  const pauseRequestedAtStart = Number(state.queue.pauseRequestedAt || 0);
  if (phase === "animation" && unresolvedImageScenes(state.scenes).length) {
    log(LOG_LEVEL.WARN, "Animacion pedida con escenas pendientes; vuelvo a generar imagenes primero.");
    phase = "images";
  }
  state.queue.phase = phase;
  // Reactiva escenas en ERROR SOLO en la fase de imagenes (gratis). En animacion NO se reactiva:
  // re-animar gasta ~20-40 pts y debe ser decision explicita (boton por escena o RETRY_ALL_ERRORS),
  // no un efecto colateral de pulsar "Animar". (Auditoria: la pausa-ante-fallo se anulaba sola.)
  if (phase === "images") {
    for (const s of state.scenes) {
      if (s.status === SCENE_STATUS.ERROR && !s.skipped && !sceneHasImage(s)) {
        s.status = SCENE_STATUS.PENDING; s.attempts = 0; s.error = null;
        s.grokImageAttempt = null; s.noAutoRetry = false; s.imageFinalRetryUsed = false; // accion explicita del usuario: autoriza un intento nuevo
      }   // !skipped: respetar "Saltar" (antes se resucitaban)
    }
  }
  if (!(await ensureProviderForPhase(phase, `Arrancar fase ${phase}`))) return;
  if (Number(state.queue.pauseRequestedAt || 0) > pauseRequestedAtStart) {
    state.queue.paused = true;
    await saveState();
    log(LOG_LEVEL.INFO, `Fase ${phase}: proveedor listo, pero respeto la Pausa solicitada mientras esperaba.`);
    emitState();
    return;
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
    if (!(await ensureFlowReferenceLibraryBeforeSceneLoop("arrancar la fase de imagenes"))) return;
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
      if (scene.compositionOnly) return runManhwaPageComposition(scene);
      const imgProv = state.project?.imageProvider || state.config.provider;
      return state.config.dryRun ? runDryRunImage(scene, prevSceneId, refName)
        : imgProv === "grok" ? runGrokImage(scene)
          : runRealImage(scene, prevSceneId, refName);
    },
    animation: (scene) => {
      // HIBRIDO criptoclaro_reel: una escena estatica NO se anima (su still es el asset final) -> DONE sin gastar.
      // Defensa; normalmente runPhaseToEnd ya las marco DONE antes del bucle (no llegan aqui como IMAGE_DONE).
      if (state.project?.perSceneRender && scene.renderMode !== "animated") return markStaticSceneDone(scene);
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
    beforeFinalAnimationRetry: async () => {
      const provider = state.project?.animationProvider || state.config.provider;
      if (provider !== "grok" || state.config.dryRun) return;
      const tab = await findFlowTab("grok");
      if (!tab) throw new Error("no hay pestana de Grok para la recarga final");
      detachDebugger(tab.id);
      await hardReloadGrok(tab.id);
      if (state.pacing) state.pacing.grokGenCount = 0;
      await saveState();
      log(LOG_LEVEL.INFO, "Grok: recarga limpia antes de la segunda pasada final de animaciones.");
    },
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
function launchLoop({ continueToAnimation = false } = {}) {
  if (loopRunning) return;
  // keepAlive TAMBIEN en secuencial: la espera de ~6 min de Grok (debugger suelto, sin eventos chrome.*)
  // mataba el SW MV3 a media corrida. La alarma lo revive/mantiene; keepAliveTick se auto-apaga al final.
  try { chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 }); } catch (_e) {}
  orchestrator.runQueue()
    .then(async () => {
      if (!continueToAnimation) return;
      await ensureState();
      // Incluye el barrier estricto: ningun PENDING/GENERATING/ERROR permite iniciar video.
      if (!(await advanceCompletedImagesToAnimationIfNeeded("reintento final de imagenes"))) return;
      if (!(await ensureProviderForPhase("animation", "Auto-avance tras reintento de imagenes"))) return;
      launchLoop();
    })
    .catch((e) => {
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
  if (scene.skipImageGeneration) {
    scene.status = SCENE_STATUS.DONE; scene.error = null;
    await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DONE); emitState(); emitProgress();
    log(LOG_LEVEL.INFO, `${scene.id}: narrative_card editor -> sin generacion de imagen.`);
    return;
  }
  let tab = await findFlowTab("flow");
  // Una pestana puede cerrarse entre escenas (reinicio de Chrome, limpieza del controlador o cierre
  // accidental). Si el proyecto ya esta asociado, ensureFlowReady lo reabre de forma idempotente.
  if (!tab) {
    await ensureFlowReady();
    tab = await findFlowTab("flow");
  }
  if (!tab) throw new Error("No hay pestana de Flow abierta (labs.google). Abre Flow y reintenta.");
  // La comparativa A/B depende de la biblioteca persistente del proyecto (medios nombrados y
  // Characters). La recarga preventiva deja esa biblioteca visible en el grid, pero el selector "+"
  // tarda en rehidratarla y puede encadenar falsos "personaje no encontrado". En este modo la recarga
  // manual sigue disponible, siempre con la cola pausada.
  if (state.project?.comparisonVariant !== "flow_images_only"
      && (state.pacing?.flowGenCount || 0) >= FLOW_RELOAD_EVERY) {
    log(LOG_LEVEL.INFO, `Flow: recargando el mismo proyecto tras ${FLOW_RELOAD_EVERY} generaciones (libero memoria sin repetir assets).`);
    try {
      await hardReloadFlow(tab.id);
      state.pacing.flowGenCount = 0;
      await saveState();
    } catch (e) {
      log(LOG_LEVEL.WARN, `Flow: recarga preventiva fallo (${e?.message ?? e}); sigo con el proyecto actual.`);
    }
  }
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
  const localReferencePaths = [];
  const localReferenceNamesByPath = new Map();
  const validationReferencePaths = [];
  const flowReferenceNameForAsset = (asset) => state.project?.flowReferenceNames?.[
    String(asset || "").replace(/\\/g, "/").toLowerCase()
  ] || "";
  const addLocalReference = (filePath, name = "") => {
    if (!filePath) return;
    localReferencePaths.push(filePath);
    if (name) localReferenceNamesByPath.set(filePath, name);
  };
  const refIds = Array.isArray(scene.characterRefIds) ? scene.characterRefIds : [];
  const characterAssetKeys = new Set((scene.characterReferenceAssets || [])
    .filter(Boolean).map((asset) => String(asset).replace(/\\/g, "/").toLowerCase()));
  for (let i = 0; i < refIds.length; i++) {
    const ing = ingOf(refIds[i]);
    if (ing && ing.type === "character_edited") {
      if (ing.imageFilePath) validationReferencePaths.push(ing.imageFilePath);
      if (ing.imageUrl) sceneRefImageUrls.push(ing.imageUrl);
      else if (ing.imageFilePath) addLocalReference(ing.imageFilePath, ing.flowName || `Personaje — ${ing.id}`);
      else log(LOG_LEVEL.WARN, `${scene.id}: character_edited '${refIds[i]}' sin imagen (¿corrio la fase de ingredientes?); se omite.`);
    } else {
      const dn = (scene.characterRefs || [])[i];
      if (state.project?.comparisonVariant === "flow_images_only") {
        // Cada pose exacta es un Character persistente con nombre propio. No usamos el nombre base:
        // dos poses del mismo actor pueden tener ropa, heridas u objetos incompatibles.
        const asset = (scene.characterReferenceAssets || [])[i] || "";
        const exactName = flowReferenceNameForAsset(asset);
        const effectiveName = exactName ? (flowCharacterRecord(exactName)?.alias || exactName) : "";
        if (effectiveName) characterNames.push(effectiveName);
        else if (dn) log(LOG_LEVEL.WARN, `${scene.id}: pose de '${dn}' sin nombre Flow exacto; no adjunto el personaje base para evitar una identidad incorrecta.`);
      } else if (dn) characterNames.push(dn);
    }
  }
  // Compat VIEJO: sin refs nuevas pero con el ingrediente character_ref -> nombre global de personaje.
  if (!characterNames.length && !sceneRefImageUrls.length && scene.imageIngredients?.includes("character_ref") && state.project?.characterName) {
    characterNames.push(state.project.characterName);
  }
  // Ingrediente de ESTA corrida: tile remoto exacto. Ingrediente rehidratado de P1/P2: archivo local.
  // El disco es la memoria de serie; entity/location_plate no se buscan como Personajes de Flow.
  const ingredientRefs = [];
  for (const rid of (scene.ingredientRefs || [])) {
    const ing = ingOf(rid);
    if (ing?.imageFilePath) validationReferencePaths.push(ing.imageFilePath);
    if (ing?.imageUrl) {
      ingredientRefs.push({ id: rid, name: ing.flowName || rid, imageUrl: ing.imageUrl });
    } else if (ing?.imageFilePath) {
      addLocalReference(ing.imageFilePath, ing.flowName || `Referencia — ${rid}`);
    } else {
      log(LOG_LEVEL.WARN, `${scene.id}: ingrediente '${rid}' sin imagen generada; se omite.`);
    }
  }
  // Assets locales declarados por la escena (escenario, props, sistema_ui). Grok ya los subia;
  // Flow ahora usa el selector multimedia + CDP y los confirma como chips antes de generar.
  for (const rel of (scene.referenceAssets || [])) {
    // Las poses ya se adjuntan como Characters. Adjuntarlas tambien como medios crea dos anclas
    // contradictorias y Flow termina transfiriendo ropa/heridas entre personajes.
    if (state.project?.comparisonVariant === "flow_images_only"
        && characterAssetKeys.has(String(rel).replace(/\\/g, "/").toLowerCase())) continue;
    const generated = (state.project?.ingredients || []).find((g) => g.outputFile
      && String(g.outputFile).replace(/\\/g, "/") === String(rel).replace(/\\/g, "/"));
    if (generated?.imageFilePath) validationReferencePaths.push(generated.imageFilePath);
    if (generated?.imageUrl) {
      if (!ingredientRefs.some((ref) => ref.id === generated.id)) {
        ingredientRefs.push({ id: generated.id, name: generated.flowName || generated.id, imageUrl: generated.imageUrl });
      }
      continue;
    }
    try {
      const p = await resolveCharFileFlexible(rel);
      if (p) { addLocalReference(p, flowReferenceNameForAsset(rel)); validationReferencePaths.push(p); }
    }
    catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no resolvi asset local de Flow "${rel}": ${e?.message ?? e}`); }
  }
  // ESCENAS PREVIAS (legacy, desaconsejado con ingredientes): references.scenes[].sceneId -> imageUrl ya generada.
  for (const sr of (scene.sceneRefs || [])) {
    const ref = state.scenes.find((x) => x.id === sr.sceneId);
    if (ref?.imageFilePath) validationReferencePaths.push(ref.imageFilePath);
    if (ref?.imageUrl) sceneRefImageUrls.push(ref.imageUrl);
    else if (ref?.imageFilePath) addLocalReference(ref.imageFilePath, `Escena — ${sr.sceneId}`);
    else log(LOG_LEVEL.WARN, `${scene.id}: referencia a escena '${sr.sceneId}' sin imagen disponible (se omite).`);
  }
  const uniqueSceneRefImageUrls = [...new Set(sceneRefImageUrls.filter(Boolean))];
  const uniqueLocalReferencePaths = [...new Set(localReferencePaths.filter(Boolean))];
  const uniqueLocalReferenceNames = uniqueLocalReferencePaths.map((p) => localReferenceNamesByPath.get(p) || "");
  for (const p of uniqueLocalReferencePaths) validationReferencePaths.push(p);
  const uniqueValidationReferencePaths = [...new Set(validationReferencePaths.filter(Boolean))];
  const count = state.config.generationCount ?? DEFAULT_CONFIG.generationCount;
  const aspectRatio = state.project?.aspectRatio ?? "9:16";

  scene.status = SCENE_STATUS.GENERATING_IMAGE;
  await saveState();
  emitSceneStatus(scene.id, SCENE_STATUS.GENERATING_IMAGE);
  emitState();
  let img;
  try {
    img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, {
      prompt: scene.imagePrompt, characterNames, sceneRefImageUrls: uniqueSceneRefImageUrls, ingredientRefs,
      localReferencePaths: uniqueLocalReferencePaths, localReferenceNames: uniqueLocalReferenceNames,
      resultName: `Escena — ${scene.id}`, aspectRatio, count,
      model: state.project?.imageModel || "Nano Banana Pro", cfg: driverCfg(),
    });
  } catch (e) {
    if (!/FLOW_CLIENT_ERROR/i.test(e?.message ?? String(e))) throw e;
    // La SPA de Flow puede caer por memoria y dejar una pagina de error sin compositor. No enviamos
    // nada desde esa pagina: recargamos el MISMO proyecto para que las escenas independientes sigan;
    // esta escena queda diferida y usa el unico reintento final del orquestador.
    log(LOG_LEVEL.WARN, `${scene.id}: Flow sufrio una excepcion del cliente; recargo el mismo proyecto antes de continuar.`);
    await hardReloadFlow(tab.id);
    state.pacing = state.pacing || {};
    state.pacing.flowGenCount = 0;
    await saveState();
    throw new Error(`FLOW_CLIENT_ERROR_RECOVERED: ${e?.message ?? e}`);
  }
  if (img?.attachmentAudit) {
    log(LOG_LEVEL.INFO, `${scene.id}: Flow verifico ${img.attachmentAudit.count} referencia(s): ${img.attachmentAudit.labels.join(" | ")}.`);
  }
  for (const warning of (img?.renameWarnings || [])) log(LOG_LEVEL.WARN, `${scene.id}: ${warning}`);
  const candidateImageUrl = img?.imageUrl ?? null;
  if (!candidateImageUrl) throw new Error("Flow no devolvio URL de imagen");
  state.pacing = state.pacing || {};
  state.pacing.flowGenCount = (state.pacing.flowGenCount || 0) + 1;
  await saveState();
  const validated = await downloadValidatedFlowImage(candidateImageUrl, state.project?.slug || "proyecto", scene.id, {
    referencePaths: uniqueValidationReferencePaths,
    label: `Escena ${scene.id}`,
  });
  scene.imageUrl = candidateImageUrl;
  // HANDOFF cross-proveedor (opt-in por JSON): si la animacion va en OTRO proveedor (animationProvider != "flow"),
  // guarda la imagen de Flow a disco para poder subirla alla (igual que runGrokImage). Flow->Flow NO paga esta
  // descarga -> flujo actual intacto. Falla con gracia: si no baja, imageFilePath queda null (no rompe nada).
  const animProv = state.project?.animationProvider || state.config.provider;   // proveedor EFECTIVO (igual que el dispatch)
  const slug = state.project?.slug || "proyecto";
  if (state.project?.imageOnly && scene.imageUrl) {
    // image-only (historias): la imagen ES el asset final -> a public/<slug>/images/ para el render (Ken Burns).
    try {
      const moved = await moveStillToProject(validated.abspath, slug, scene.id, scene.pageCellSource);
      scene.imageFilePath = moved.abspath || validated.abspath || null;
      scene.savedOk = moved.via === "server";
      if (moved.via === "server") log(LOG_LEVEL.INFO, `${scene.id}: still movido a public/${slug}/images/ (image-only).`);
      else log(LOG_LEVEL.WARN, `${scene.id}: still en Descargas (dev-server no responde); muevelo a public/${slug}/images/.`);
    } catch (e) {
      if (isRejectedStillError(e)) {
        scene.imageUrl = null;
        scene.imageFilePath = null;
        scene.savedOk = false;
        throw e;
      }
      log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar/mover el still (${e?.message ?? e}).`);
    }
  } else if (animProv !== "flow" && scene.imageUrl) {
    // HANDOFF cross-proveedor: imagen de Flow a disco para subirla en el otro proveedor (Flow->Flow no paga esto).
    try {
      scene.imageFilePath = validated.abspath || null;
      log(LOG_LEVEL.INFO, `${scene.id}: imagen de Flow guardada a disco para handoff a ${animProv}.`);
    } catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar la imagen de Flow a disco para handoff (${e?.message ?? e}).`); }
  } else {
    // Aunque Flow vaya a animar su propio tile, conservar el candidato validado permite auditar y
    // usarlo como referencia tras un reinicio sin volver a confiar solamente en el DOM.
    scene.imageFilePath = validated.abspath || null;
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
async function resolveCharFileInfo(rel) {
  const base = state.config.charFileUrl || DEFAULT_CONFIG.charFileUrl;
  const res = await fetch(`${base}?path=${encodeURIComponent(rel)}`).then((r) => r.json()).catch(() => null);
  if (!res?.ok) throw new Error(`no encuentro ${rel} (¿corre el dev-server?)`);
  return res;
}

async function getLocalFileStatus(filePath) {
  await ensureState();
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  const res = await fetch(`${base}/file-status?path=${encodeURIComponent(filePath || "")}`);
  const info = await res.json().catch(() => null);
  if (!res.ok || !info?.ok) throw new Error(info?.error || `no pude inspeccionar ${filePath || "archivo"}`);
  return info;
}

async function resolveCharFile(rel) {
  return (await resolveCharFileInfo(rel)).abspath;
}

async function resolveCharFileFlexible(rel) {
  const candidates = [rel];
  const m = String(rel || "").match(/^(.*)\.(png|jpg|jpeg|webp)$/i);
  if (m) {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const alt = `${m[1]}.${ext}`;
      if (!candidates.includes(alt)) candidates.push(alt);
    }
  }
  for (const candidate of candidates) {
    try { return await resolveCharFile(candidate); } catch (_e) {}
  }
  throw new Error(`no encuentro ${rel} ni variante png/jpg/jpeg/webp`);
}

// Descarga la imagen generada por Grok a Descargas/<slug>/images/<id>.jpg y devuelve su ruta ABSOLUTA
// (chrome.downloads manda cookies; assets.grok.com las exige). Esa ruta se reusa como REFERENCIA por
// CDP en escenas siguientes (continuidad). No se mueve a public/ (no la necesita el render).
async function downloadImageForRef(url, slug, id, { quarantine = false, variant = 0, cacheBust = false } = {}) {
  const safeSlug = String(slug || "proyecto").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 100) || "proyecto";
  const safeId = String(id || "image").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 100) || "image";
  const filename = quarantine
    ? `${safeSlug}/images/grok-candidates/${safeId}_${Date.now()}_v${Math.max(1, Number(variant) || 1)}.jpg`
    : `${safeSlug}/images/${safeId}.jpg`;
  let downloadUrl = url;
  if (cacheBust && /^https?:/i.test(String(url || ""))) {
    try {
      const fresh = new URL(url);
      fresh.searchParams.set("_flow_quality_probe", `${Date.now()}_${variant}`);
      downloadUrl = fresh.href;
    } catch (_e) { /* usa URL original */ }
  }
  const dlId = await new Promise((resolve, reject) => {
    chrome.downloads.download({ url: downloadUrl, filename, saveAs: false, conflictAction: quarantine ? "uniquify" : "overwrite" }, (theId) => {
      const e = chrome.runtime.lastError; if (e) return reject(new Error(e.message)); resolve(theId);
    });
  });
  const item = await waitDownloadComplete(dlId);
  if (!item || item.state !== "complete" || !item.filename) throw new Error("la descarga de la imagen no completo");
  return { abspath: item.filename, downloadId: dlId };
}

async function validateDownloadedImage(abspath, { provider = "imagen", referencePaths = [] } = {}) {
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  const query = new URLSearchParams({ path: abspath || "" });
  for (const reference of [...new Set((referencePaths || []).filter(Boolean))]) {
    query.append("reference", reference);
  }
  let res;
  try {
    res = await fetch(`${base}/image/validate?${query.toString()}`, { method: "POST" });
  } catch (e) {
    throw new Error(`no pude validar la imagen ${provider}: flowbot no responde (${e?.message ?? e})`);
  }
  const body = await res.text().catch(() => "");
  let json = null;
  try { json = body ? JSON.parse(body) : null; } catch (_e) {}
  if (res.ok && json?.accepted) {
    if (!/^[0-9a-f]{64}$/i.test(String(json.sha256 || ""))) throw new Error("el verificador no devolvio SHA-256 de los bytes");
    return json;
  }
  if (res.status === 422) return { ...(json || {}), accepted: false, error: json?.error || body || "imagen rechazada" };
  throw new Error(`no pude validar la imagen ${provider} (${res.status}): ${json?.error || body || res.statusText}`);
}

async function validateDownloadedGrokImage(abspath) {
  return validateDownloadedImage(abspath, { provider: "Grok" });
}

async function removeRejectedDownload(downloadId) {
  if (!downloadId || !chrome.downloads.removeFile) return;
  await new Promise((resolve) => chrome.downloads.removeFile(downloadId, () => resolve()));
}

async function downloadValidatedFlowImage(imageUrl, slug, id, { referencePaths = [], label = id } = {}) {
  const saved = await downloadImageForRef(imageUrl, slug, id, { quarantine: true, variant: 1 });
  const validation = await validateDownloadedImage(saved.abspath, { provider: "Flow", referencePaths });
  if (!validation?.accepted) {
    await removeRejectedDownload(saved.downloadId);
    const duplicate = validation?.duplicateReference?.path
      ? ` (coincide con ${validation.duplicateReference.path})` : "";
    throw new Error(`${label}: imagen Flow rechazada: ${validation?.error || validation?.reason || "no parece final"}${duplicate}`);
  }
  return { ...saved, validation };
}

async function downloadValidatedGrokCandidate(img, slug, id, {
  rejectImageKeys = [], rejectImageHashes = [], label = id,
} = {}) {
  const raw = Array.isArray(img?.candidateImages) && img.candidateImages.length
    ? img.candidateImages : [{ imageUrl: img?.imageUrl, requiresByteValidation: true }];
  if (img?.imageUrl && !raw.some((x) => (typeof x === "string" ? x : x?.imageUrl) === img.imageUrl)) {
    raw.unshift({ imageUrl: img.imageUrl, requiresByteValidation: !!img?.requiresByteValidation });
  }
  const candidates = [];
  const seen = new Set();
  for (const entry of raw) {
    const imageUrl = typeof entry === "string" ? entry : entry?.imageUrl;
    if (!imageUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    if ((rejectImageKeys || []).includes(grokImageKey(imageUrl))) continue;
    candidates.push({ imageUrl, requiresByteValidation: typeof entry === "string" ? true : !!entry?.requiresByteValidation });
  }
  if (!candidates.length) throw new Error(`${label}: Grok no devolvio ninguna variante nueva utilizable`);

  const rejected = [];
  const blockedHashes = new Set((rejectImageHashes || []).map((x) => String(x || "").toLowerCase()).filter(Boolean));
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    let rejectReason = "la imagen siguio siendo ruido/frame intermedio";
    // Una imagen que YA pasa el analisis local de bytes es final: no hay que descargarla otras tres veces
    // solo para comparar hashes. Ese settle redundante provocaba 4-12 descargas visibles por escena y luego
    // borraba los temporales. Si la muestra es ruido de verdad, esperamos y volvemos a probar LA MISMA URL
    // (Grok puede mutarla, como ocurrio en scene_39), hasta cuatro observaciones y sin otro Enter.
    for (let sample = 1; sample <= 4; sample++) {
      if (sample > 1) await delay(5000);
      let saved = null, downloadError = null;
      // Una descarga rota no dice nada sobre la generacion. Reintentar solo el MISMO URL/candidato;
      // nunca volver al wrapper de UI ni enviar Enter por un fallo de red/disco.
      for (let downloadAttempt = 1; downloadAttempt <= 3 && !saved; downloadAttempt++) {
        try {
          saved = await downloadImageForRef(candidate.imageUrl, slug, id, {
            quarantine: true, variant: (i + 1) * 100 + sample * 10 + downloadAttempt,
            cacheBust: sample > 1 || downloadAttempt > 1,
          });
        } catch (e) {
          downloadError = e;
          log(LOG_LEVEL.WARN, `${label}: descarga de variante ${i + 1}, muestra ${sample} fallo (${downloadAttempt}/3); ${downloadAttempt < 3 ? "reintento el mismo asset" : "agote descargas"}.`);
          if (downloadAttempt < 3) await delay(1200);
        }
      }
      if (!saved) {
        const guardedDownload = new Error(`${label}: no pude descargar la variante ya generada tras 3 intentos (${downloadError?.message ?? downloadError ?? "fallo desconocido"})`);
        guardedDownload.noAutoRetry = true; // una sonda fallida no autoriza otro Enter/gasto
        throw guardedDownload;
      }
      let validation;
      try { validation = await validateDownloadedGrokImage(saved.abspath); }
      catch (e) {
        await removeRejectedDownload(saved.downloadId);
        e.noAutoRetry = true; // sin verificador no es seguro pagar otra generacion
        throw e;
      }
      if (!validation.accepted) {
        rejectReason = validation.error || "ruido/frame intermedio";
        await removeRejectedDownload(saved.downloadId);
        if (sample < 4) {
          log(LOG_LEVEL.WARN, `${label}: variante ${i + 1} aun no es final (${rejectReason}); espero y compruebo el mismo resultado (${sample}/4), sin regenerar.`);
        }
        continue;
      }
      const byteHash = String(validation.sha256 || "").toLowerCase();
      if (byteHash && blockedHashes.has(byteHash)) {
        rejectReason = `duplica exactamente una escena previa (${byteHash.slice(0, 12)})`;
        await removeRejectedDownload(saved.downloadId);
        log(LOG_LEVEL.WARN, `${label}: variante ${i + 1} rechazada porque sus bytes ya pertenecen a otra escena; pruebo otra variante, sin regenerar.`);
        break;
      }
      if (i > 0) log(LOG_LEVEL.WARN, `${label}: variante ${i + 1}/${candidates.length} aprobada; reutilice la generacion existente sin otro Enter.`);
      return { ...candidate, ...saved, validation, variantIndex: i, variantCount: candidates.length };
    }
    rejected.push(`v${i + 1}: ${rejectReason}`);
    log(LOG_LEVEL.WARN, `${label}: descarte variante ${i + 1}/${candidates.length} por calidad/estabilidad (${rejectReason}); pruebo otra ya generada.`);
  }
  const error = new Error(`${label}: todas las variantes ya generadas fueron rechazadas; no genero otra automaticamente (${rejected.join("; ")})`);
  error.noAutoRetry = true;
  throw error;
}

async function knownSceneImageHashes({ excludeSceneId = null } = {}) {
  const hashes = new Set();
  const slug = state.project?.slug || "proyecto";
  for (const scene of (state.scenes || [])) {
    if (!scene?.id || scene.id === excludeSceneId) continue;
    const candidates = [...new Set([
      scene.imageFilePath,
      sceneStillRelativePath(scene, slug),
    ].filter(Boolean))];
    for (const filePath of candidates) {
      try {
        const info = await getLocalFileStatus(filePath);
        if (info?.sha256) hashes.add(String(info.sha256).toLowerCase());
        break;
      } catch (_e) { /* prueba la ruta canonica */ }
    }
  }
  return [...hashes];
}

async function recoverPersistedGrokResult(tab, owner, ownerType, rejectImageKeys, label) {
  const attempt = owner.grokImageAttempt;
  const expectedPrompt = ownerType === "scene" ? owner?.imagePrompt : owner?.prompt;
  if (attempt?.result?.imageUrl && (attempt.result.promptScoped === true || !expectedPrompt)) {
    log(LOG_LEVEL.INFO, `${label}: reanudo la validacion de candidatos persistidos; NO envio Enter.`);
    return attempt.result;
  }
  if (attempt?.result?.imageUrl && expectedPrompt) {
    log(LOG_LEVEL.WARN, `${label}: descarto el candidato legacy sin vinculo al prompt y verifico su bloque exacto; NO envio Enter.`);
  }
  if (!attempt?.submitIssued) {
    throw new Error("el reinicio ocurrio antes de confirmar el Enter; no reenvio automaticamente");
  }
  if (!tab) throw new Error("no hay pestana de Grok para recuperar el resultado ya enviado");
  let exactPost = false;
  if (attempt.postUrl) {
    let currentUrl = "";
    try { currentUrl = (await chrome.tabs.get(tab.id))?.url || ""; } catch (_e) {}
    if (currentUrl !== attempt.postUrl) await navigateTab(tab.id, attempt.postUrl);
    exactPost = true;
  }
  await ensureContentScript(tab.id, "grok");
  const before = [...new Set([...(attempt.before || []), ...(rejectImageKeys || [])])];
  const recoveryTimeoutMs = attempt.stage === "manual_recovery_only" ? 45000 : 180000;
  const recovered = await sendActOrFail(tab.id, ACT.COLLECT_IMAGE, {
    cfg: driverCfg(),
    before,
    prompt: exactPost ? "" : (expectedPrompt || ""),
    requirePost: exactPost,
    timeoutMs: recoveryTimeoutMs,
  });
  if (!recovered?.imageUrl) throw new Error("Grok no mostro un resultado recuperable del intento ya enviado");
  await persistGrokAttemptResult(owner, recovered);
  log(LOG_LEVEL.INFO, `${label}: resultado del intento interrumpido recuperado; NO envie otro Enter.`);
  return recovered;
}

async function adoptRecoveredGrokScene(scene, img, rejectImageKeys) {
  const slug = state.project?.slug || "proyecto";
  const rejectImageHashes = await knownSceneImageHashes({ excludeSceneId: scene.id });
  const chosen = await downloadValidatedGrokCandidate(img, slug, scene.id, {
    rejectImageKeys, rejectImageHashes, label: `${scene.id} (recuperacion)`,
  });
  rejectDuplicateGrokImage(scene.id, chosen.imageUrl, rejectImageKeys);
  scene.imageUrl = chosen.imageUrl;
  scene.grokPostUrl = chosen.variantIndex === 0 ? (img?.postUrl || null) : null;
  scene.imageFilePath = chosen.abspath || null;
  if (chosen.abspath) {
    const moved = await moveStillToProject(chosen.abspath, slug, scene.id, scene.pageCellSource);
    scene.imageFilePath = moved.abspath || chosen.abspath;
    if (state.project?.imageOnly) scene.savedOk = moved.via === "server";
    if (moved.via === "server") log(LOG_LEVEL.INFO, `${scene.id}: still recuperado y guardado en public/${slug}/images/.`);
    else log(LOG_LEVEL.WARN, `${scene.id}: still recuperado quedo en Descargas; corre flowbot para moverlo al proyecto.`);
  }
  if (state.pacing) state.pacing.grokGenCount = (state.pacing.grokGenCount || 0) + 1;
  scene.status = state.project?.imageOnly ? SCENE_STATUS.DONE : SCENE_STATUS.IMAGE_DONE;
  scene.error = null;
  scene.errorPhase = null;
  scene.noAutoRetry = false;
  scene.grokImageAttempt = null;
  await saveState();
  emitSceneStatus(scene.id, scene.status);
  emitState();
  emitProgress();
  log(LOG_LEVEL.INFO, `Imagen Grok recuperada tras reinicio (${scene.id}); cero reenvios.`);
}

async function adoptRecoveredGrokIngredient(ing, img, rejectImageKeys) {
  const slug = state.project?.slug || "proyecto";
  const saved = await downloadValidatedGrokCandidate(img, slug, `ingredient_${ing.id}`, {
    rejectImageKeys, label: `Ingrediente ${ing.id} (recuperacion)`,
  });
  rejectDuplicateGrokImage(`Ingrediente ${ing.id}`, saved.imageUrl, rejectImageKeys);
  ing.imageUrl = saved.imageUrl;
  if (ing.outputFile) {
    const moved = await moveGeneratedAssetToProject(saved.abspath, ing.outputFile);
    ing.imageFilePath = moved.abspath || await resolveCharFileFlexible(ing.outputFile);
  } else {
    ing.imageFilePath = saved.abspath || null;
  }
  ing.regeneratePending = false;
  ing.status = SCENE_STATUS.DONE;
  ing.error = null;
  ing.noAutoRetry = false;
  ing.grokImageAttempt = null;
  await saveState();
  emitState();
  log(LOG_LEVEL.INFO, `Ingrediente Grok recuperado tras reinicio (${ing.id}); cero reenvios.`);
}

// Devuelve false cuando deja el estado en ERROR+pausa. Nunca cambia un GENERATING_IMAGE de Grok a
// PENDING: incluso estados legacy (sin marker) se consideran ambiguos y se sondean una sola vez.
async function recoverInterruptedGrokImageAttempts() {
  const provider = state.project?.imageProvider || state.config.provider;
  if (provider !== "grok" || state.config.dryRun) return true;
  const interrupted = [];
  for (const ing of (state.project?.ingredients || [])) {
    if (ing.status === SCENE_STATUS.GENERATING_IMAGE) interrupted.push({ ownerType: "ingredient", owner: ing, label: `Ingrediente ${ing.id}` });
  }
  for (const scene of (state.scenes || [])) {
    if (scene.status === SCENE_STATUS.GENERATING_IMAGE) interrupted.push({ ownerType: "scene", owner: scene, label: scene.id });
  }
  if (!interrupted.length) return true;

  let tab = null;
  try { tab = await findFlowTab("grok"); } catch (_e) { tab = null; }
  let failed = 0;
  let firstSceneError = null;
  for (const item of interrupted) {
    const { ownerType, owner, label } = item;
    const rejectImageKeys = owner.grokImageAttempt?.before?.length
      ? [...owner.grokImageAttempt.before]
      : knownGrokImageKeys(ownerType === "scene" ? { excludeSceneId: owner.id } : { excludeIngredientId: owner.id });
    // Migracion defensiva de estados creados por versiones anteriores: GENERATING ya pudo pulsar Enter.
    // Se sondea como ambiguo y, si no aparece resultado, se bloquea en vez de volverlo PENDING.
    if (!owner.grokImageAttempt) {
      owner.grokImageAttempt = newGrokImageAttempt(ownerType, owner.id, rejectImageKeys);
      owner.grokImageAttempt.stage = "legacy_interrupted";
      owner.grokImageAttempt.submitIssued = true;
      owner.grokImageAttempt.issuedAt = Date.now();
      await saveState();
    }
    try {
      // Tras reiniciar se pierde providerTabIds, pero el handshake guardo el tab exacto que recibio Enter.
      // Preferirlo impide adoptar una imagen nueva de OTRA pestana Grok que el usuario haya enfocado.
      let attemptTab = owner.grokImageAttempt?.tabId != null && !owner.grokImageAttempt?.postUrl ? null : tab;
      if (owner.grokImageAttempt?.tabId != null) {
        try {
          const exact = await chrome.tabs.get(owner.grokImageAttempt.tabId);
          if (/^https:\/\/(?:www\.)?grok\.com\//i.test(exact?.url || "")) attemptTab = exact;
        } catch (_e) { /* tab cerrado: no sondear otra pestana; podria pertenecer a otra corrida */ }
      }
      const recoveryProjectSlug = state.project?.slug || null;
      const img = await recoverPersistedGrokResult(attemptTab, owner, ownerType, rejectImageKeys, label);
      if (state.project?.slug !== recoveryProjectSlug) throw new Error("el proyecto cambio durante la recuperacion; no adopto el asset en otro JSON");
      // Re-resolver despues del await: onLoadJson pudo rehidratar el mismo proyecto con objetos nuevos.
      // Adoptar sobre `owner` (referencia vieja) guardaba el archivo pero no actualizaba el AppState vivo.
      const liveOwner = grokAttemptOwner(ownerType, owner.id);
      if (!liveOwner) throw new Error(`${label} ya no existe en el estado vivo`);
      if (!liveOwner.grokImageAttempt && owner.grokImageAttempt) liveOwner.grokImageAttempt = owner.grokImageAttempt;
      if (ownerType === "scene") await adoptRecoveredGrokScene(liveOwner, img, rejectImageKeys);
      else await adoptRecoveredGrokIngredient(liveOwner, img, rejectImageKeys);
    } catch (e) {
      failed++;
      const detail = e?.message ?? String(e);
      owner.status = SCENE_STATUS.ERROR;
      owner.error = `interrumpido tras un intento Grok: ${detail}. No se envio otra generacion; revisa Grok y usa Reintentar solo si hace falta.`;
      owner.noAutoRetry = true;
      if (ownerType === "scene") {
        owner.errorPhase = "images";
        firstSceneError ||= owner.id;
      } else {
        owner.regeneratePending = true;
        owner.imageUrl = null;
        owner.imageFilePath = null;
      }
      owner.grokImageAttempt = owner.grokImageAttempt || newGrokImageAttempt(ownerType, owner.id, rejectImageKeys);
      owner.grokImageAttempt.stage = "recovery_failed";
      owner.grokImageAttempt.noAutoRetry = true;
      owner.grokImageAttempt.recoveryError = detail;
      owner.grokImageAttempt.recoveryFailedAt = Date.now();
      log(LOG_LEVEL.WARN, `${label}: no adopte el intento interrumpido (${detail}); ERROR+pausa, sin otro Enter.`);
    }
  }
  detachDebugger(tab?.id);
  if (!failed) return true;
  state.queue.paused = true;
  state.queue.running = false;
  if (firstSceneError) state.queue.errorSceneId = firstSceneError;
  await saveState();
  emitState();
  return false;
}

// Mueve el still YA descargado (abspath en Descargas) a una ruta canonica y devuelve su ruta absoluta.
// Tambien se hace para escenas animadas: las escenas siguientes y la animacion necesitan una referencia
// que siga existiendo despues de que /move borre el temporal de Descargas.
async function moveStillToProject(absFrom, slug, id, relativeImagePath = "") {
  const source = String(relativeImagePath || "").replace(/\\/g, "/");
  const safeSource = /^images\/cells\/[a-z0-9][a-z0-9_.-]*\.(?:jpg|jpeg|png|webp)$/i.test(source) && !source.includes("..")
    ? source : `images/${id}.jpg`;
  const to = `remotion-editor/public/${slug}/${safeSource}`;
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  try {
    const res = await fetch(`${base}/move?from=${encodeURIComponent(absFrom)}&to=${encodeURIComponent(to)}`, { method: "POST" });
    const body = await res.text().catch(() => "");
    const j = body ? (() => { try { return JSON.parse(body); } catch (_e) { return null; } })() : null;
    if (res.ok && j && j.ok) return { via: "server", path: j.path || to, abspath: j.abspath || null };
    if (res.status === 422) throw new Error(`still rechazado por dev-server: ${body || res.statusText}`);
  } catch (e) {
    if (isRejectedStillError(e)) throw e;
    /* dev-server no corre: queda en Descargas */
  }
  return { via: "downloads", path: absFrom, abspath: absFrom };
}

async function moveGeneratedAssetToProject(absFrom, relAssetPath) {
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  const res = await fetch(`${base}/asset/move?from=${encodeURIComponent(absFrom)}&to=${encodeURIComponent(relAssetPath)}`, { method: "POST" });
  const body = await res.text().catch(() => "");
  const j = body ? (() => { try { return JSON.parse(body); } catch (_e) { return null; } })() : null;
  if (!res.ok || !j?.ok) throw new Error(`no pude guardar asset ${relAssetPath}: ${body || res.statusText}`);
  return { via: "server", path: j.path || relAssetPath, abspath: j.abspath || null };
}

function isRejectedStillError(e) {
  return /still rechazado|archivo demasiado pequeno|posible corrupto|incompleto|ruido de difusion|imagen rechazada/i.test(String(e?.message ?? e));
}

// FASE 1 (Grok): sube referencias (personaje + escenas previas) por CDP -> genera imagen (modo Imagen).
// V6 manhwa: las celdas se generan como tareas internas. Cuando todas existen, esta tarea llama al
// compositor local dentro de la MISMA fase de imagenes y publica images/<scene_id>.jpg para Remotion.
async function runManhwaPageComposition(scene) {
  if (!scene?.pageBlueprint || !Array.isArray(scene.pageCellIds) || !scene.pageCellIds.length) {
    throw new Error(`${scene?.id || "pagina"}: composicion V6 sin pageBlueprint/celdas normalizadas`);
  }
  if (state.config.dryRun) {
    scene.imageUrl = `dry://composition/${scene.id}`;
    scene.status = SCENE_STATUS.IMAGE_DONE;
    scene.error = null;
    await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE); emitState(); emitProgress();
    log(LOG_LEVEL.INFO, `[dry-run ${scene.id}] pagina compuesta desde ${scene.pageCellIds.length} celda(s).`);
    return;
  }
  for (const cellId of scene.pageCellIds) {
    const cell = state.scenes.find((candidate) => candidate.id === cellId);
    if (!cell?.imageFilePath) throw new Error(`${scene.id}: falta la celda generada ${cellId}; no compongo una pagina incompleta`);
  }

  scene.status = SCENE_STATUS.GENERATING_IMAGE;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.GENERATING_IMAGE); emitState();
  const slug = state.project?.slug || "proyecto";
  const base = (state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl).replace(/\/save$/, "");
  let res;
  try {
    res = await fetch(`${base}/manhwa/compose-page`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobName: state.queue?.jobName || "",
        runtimeSnapshot: state.project?.runtimeSnapshot || "",
        slug,
        sceneId: scene.id,
      }),
    });
  } catch (e) {
    throw new Error(`${scene.id}: flowbot no responde para componer la pagina (${e?.message ?? e})`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) throw new Error(`${scene.id}: compositor V6 fallo: ${body?.error || res.statusText}`);
  const stillRel = `remotion-editor/public/${slug}/images/${scene.id}.jpg`;
  const st = await publicFileStatus(stillRel);
  if (!st?.abspath || Number(st.size || 0) < minMediaBytes(stillRel)) {
    throw new Error(`${scene.id}: el compositor no publico un JPG final utilizable`);
  }
  scene.imageFilePath = st.abspath;
  scene.imageUrl = body.imageUrl || null;
  scene.savedOk = true;
  scene.status = SCENE_STATUS.IMAGE_DONE;
  scene.error = null;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE); emitState(); emitProgress();
  log(LOG_LEVEL.INFO, `${scene.id}: pagina manhwa compuesta (${scene.pageCellIds.length} celdas) -> public/${slug}/images/${scene.id}.jpg.`);
}

// HIBRIDO criptoclaro_reel: marca una escena ESTATICA como terminada (su still ya es el asset final, no se
// anima). DONE limpio (no IMAGE_DONE) para que el bucle no la vuelva a elegir. No gasta puntos.
async function markStaticSceneDone(scene) {
  scene.status = SCENE_STATUS.DONE; scene.error = null;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DONE); emitState(); emitProgress();
  log(LOG_LEVEL.INFO, `${scene.id}: escena estatica (render_mode != animated) -> lista sin animar.`);
}

async function runGrokImage(scene) {
  if (scene.skipImageGeneration) {
    scene.status = SCENE_STATUS.DONE; scene.error = null;
    await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.DONE); emitState(); emitProgress();
    log(LOG_LEVEL.INFO, `${scene.id}: narrative_card editor -> sin generacion de imagen.`);
    return;
  }
  const tab = await findFlowTab("grok");
  if (!tab) throw new Error("No hay pestana de Grok abierta (grok.com/imagine). Abrela y reintenta.");
  // Cada GROK_RELOAD_EVERY imagenes recarga la pestana de cero (anti-cuelgue por acumulacion en el renderer).
  // TAMBIEN recarga si esta llamada es un REINTENTO (attempts>=2): el intento anterior fallo y la causa
  // tipica es la pestana colgada; sin recargar, los N reintentos fallaban igual y se pausaba todo.
  const isRetryAttempt = (scene.attempts || 0) >= 2;
  if (isRetryAttempt || (state.pacing?.grokGenCount || 0) >= GROK_RELOAD_EVERY) {
    log(LOG_LEVEL.INFO, isRetryAttempt
      ? `Grok: recargando la pestana de cero antes de reintentar ${scene.id} (intento ${scene.attempts}).`
      : `Grok: recargando la pestana de cero tras ${GROK_RELOAD_EVERY} imagenes (anti-cuelgue).`);
    try { await hardReloadGrok(tab.id); } catch (e) { log(LOG_LEVEL.WARN, `Grok: recarga anti-cuelgue fallo (${e?.message ?? e}); sigo sin recargar.`); }
    state.pacing.grokGenCount = 0;
    await saveState();
  }
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
        try { const p = await resolveCharFileFlexible(entry.reference_asset); if (p) refPaths.push(p); }
        catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no resolvi ref de personaje "${nm}": ${e?.message ?? e}`); }
      }
    }
  }
  if (!refPaths.length && !refIds.length) { // compat: sin refs declaradas, usa el 1er personaje del mapa
    const first = Object.values(chars)[0];
    if (first?.reference_asset) { try { const p = await resolveCharFileFlexible(first.reference_asset); if (p) refPaths.push(p); } catch (_e) {} }
  }
  // INGREDIENTES de escena (entity/location_plate): subir su PNG en disco.
  for (const rid of (scene.ingredientRefs || [])) {
    const ing = ingOf(rid);
    if (ing?.imageFilePath) refPaths.push(ing.imageFilePath);
    else log(LOG_LEVEL.WARN, `${scene.id}: ingrediente '${rid}' sin imagen en disco; se omite.`);
  }
  // ESCENARIO + assets sueltos (sistema_ui): son INGREDIENTES base y se adjuntan antes que las escenas
  // previas para conservar un orden estable y fácil de auditar.
  for (const rel of (scene.referenceAssets || [])) {
    try { const p = await resolveCharFileFlexible(rel); if (p) refPaths.push(p); }
    catch (e) { log(LOG_LEVEL.WARN, `${scene.id}: no resolvi asset de referencia "${rel}": ${e?.message ?? e}`); }
  }
  // ESCENAS PREVIAS (references.scenes): continuidad, MENOR prioridad -> al final del array.
  const sceneRefPaths = [];
  for (const sr of (scene.sceneRefs || [])) {
    const ref = state.scenes.find((x) => x.id === sr.sceneId);
    if (ref?.imageFilePath) sceneRefPaths.push(ref.imageFilePath);
    else log(LOG_LEVEL.WARN, `${scene.id}: ref a escena '${sr.sceneId}' sin imagen en disco; se omite.`);
  }
  // Adjunta todas las referencias únicas declaradas. No existe un recorte local fijo: el handshake
  // WAIT_FOR_REFS confirma que Grok haya creado exactamente todos los chips solicitados y falla de forma
  // explícita si el proveedor rechaza la carga, en vez de generar silenciosamente sin ingredientes.
  const allRefs = [...new Set([...refPaths, ...sceneRefPaths].filter(Boolean))];
  refPaths.length = 0;
  refPaths.push(...allRefs);

  scene.status = SCENE_STATUS.GENERATING_IMAGE;
  await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.GENERATING_IMAGE); emitState();

  // Aspecto: del JSON (project.aspect_ratio). historias sin aspect_ratio -> 16:9 (documental horizontal).
  const aspectRatio = state.project?.aspectRatio || ((state.project?.preset === "historias" || state.project?.preset === "criptoclaro") ? "16:9" : "9:16");
  const rejectImageKeys = knownGrokImageKeys({ excludeSceneId: scene.id });
  const rejectImageHashes = await knownSceneImageHashes({ excludeSceneId: scene.id });
  scene.grokImageAttempt = newGrokImageAttempt("scene", scene.id, rejectImageKeys);
  await saveState();
  let img;
  try {
    img = await sendGrokGenerateImageWithUiRetry(tab.id, {
      prompt: scene.imagePrompt,
      aspectRatio,
      rejectImageKeys,
      grokAttempt: { id: scene.grokImageAttempt.id, ownerType: "scene", ownerId: scene.id },
      cfg: driverCfg(),
    }, { refPaths, label: scene.id });
  } catch (e) {
    // Antes del handshake durable sabemos que Enter NO se envio, de modo que el orquestador puede hacer
    // su retry seguro. Despues del ACK cualquier fallo es ambiguo y debe bloquear el auto-retry.
    if (scene.grokImageAttempt?.submitIssued && !e?.confirmedNoUsableOutput) e.noAutoRetry = true;
    else {
      // GROK_PROMPT_GROUP_EMPTY demuestra que el bloque exacto del prompt quedo sin imagen. No existe
      // un asset pagado que proteger: liberar la barrera permite la segunda pasada al final de IMAGENES.
      scene.grokImageAttempt = null;
      if (e?.confirmedNoUsableOutput) scene.noAutoRetry = false;
    }
    await saveState();
    throw e;
  }
  try {
    if (!img?.imageUrl) {
      const e = new Error("Grok no devolvio URL de imagen despues de enviar; no genero otra automaticamente");
      e.noAutoRetry = true;
      throw e;
    }
    // CRITICO: persistir URLs/candidatos ANTES de la validacion larga de bytes. Si el SW muere durante
    // las muestras SHA, el arranque revalida exactamente estos assets ya pagados sin depender del DOM.
    await persistGrokAttemptResult(scene, img);
    const slug = state.project?.slug || "proyecto";
  // Nunca asignar imageUrl por DOM/boton: descargar a cuarentena, analizar bytes y, si falla,
  // recorrer las otras variantes YA pagadas antes de considerar otra generacion.
  const chosen = await downloadValidatedGrokCandidate(img, slug, scene.id, {
    rejectImageKeys, rejectImageHashes, label: scene.id,
  });
  const imageUrl = chosen.imageUrl;
  rejectDuplicateGrokImage(scene.id, imageUrl, rejectImageKeys);
  if ((img?.variantCount || chosen.variantCount) > 1) {
    log(LOG_LEVEL.INFO, `${scene.id}: Grok genero ${img?.variantCount || chosen.variantCount} variaciones; uso la ${chosen.variantIndex + 1}a validada.`);
  }
  scene.imageUrl = imageUrl;
  // El post capturado solo corresponde con certeza a la primera elegida por el driver. Para otra
  // variante animamos subiendo el archivo validado, evitando abrir/animar la variante equivocada.
  scene.grokPostUrl = chosen.variantIndex === 0 ? (img?.postUrl || null) : null;
  try {
    scene.imageFilePath = chosen.abspath || null;
    // Guardar SIEMPRE con nombre canonico. Antes /move borraba el temporal pero imageFilePath seguia
    // apuntando a ese archivo inexistente, rompiendo referencias y animaciones posteriores.
    if (chosen.abspath) {
      const moved = await moveStillToProject(chosen.abspath, slug, scene.id, scene.pageCellSource);
      scene.imageFilePath = moved.abspath || chosen.abspath;
      if (state.project?.imageOnly) scene.savedOk = moved.via === "server";
      if (moved.via === "server") log(LOG_LEVEL.INFO, `${scene.id}: still guardado en public/${slug}/images/.`);
      else log(LOG_LEVEL.WARN, `${scene.id}: still en Descargas (dev-server no responde); muevelo a public/${slug}/images/ o corre flowbot.`);
    }
  } catch (e) {
    if (isRejectedStillError(e)) {
      scene.imageUrl = null;
      scene.imageFilePath = null;
      scene.grokPostUrl = null;
      scene.savedOk = false;
      throw e;
    }
    log(LOG_LEVEL.WARN, `${scene.id}: no pude guardar/mover la imagen (${e?.message ?? e}).`);
  }
    if (state.pacing) state.pacing.grokGenCount = (state.pacing.grokGenCount || 0) + 1;   // contador anti-cuelgue (recarga cada N imagenes)
    scene.status = SCENE_STATUS.IMAGE_DONE; scene.error = null; scene.grokImageAttempt = null;
    await saveState(); emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE); emitState(); emitProgress();
    log(LOG_LEVEL.INFO, `Imagen Grok lista (${scene.id}).`);
  } catch (e) {
    if (scene.grokImageAttempt?.submitIssued && !e?.confirmedNoUsableOutput) e.noAutoRetry = true;
    else if (e?.confirmedNoUsableOutput) {
      scene.grokImageAttempt = null;
      scene.noAutoRetry = false;
    }
    await saveState();
    throw e;
  }
}

// FASE 2 (Grok): anima con el boton "Hacer video" SOBRE el post de la imagen (asi anima Grok; NO es
// "modo Video"). Al disparar, Grok navega a un /post/<videoId> nuevo y genera en sitio -> re-inyectamos
// y recolectamos el <video> ahi. Clic sintetico (sin debugger) -> sin congelamiento de la pestana.
// Probe anti doble-gasto: tras un FIRE que reporto "no arranco", busca evidencia de que la generacion
// SI arranco (y se pago) antes de dejar que un reintento la re-dispare. Barato: URL del /post (sin content
// script) + VIDEO_SRCS best-effort. Devuelve {started, reason, postUrl}.
async function grokAnimationLikelyStarted(tabId, preUrl, before) {
  // Margen para que la UI pinte las senales: el "no arranco" del driver suele ser un timeout apretado y
  // probear en caliente daba falso negativo -> re-disparo de una animacion YA pagada (doble gasto).
  await delay(3000);
  try {
    const t = await chrome.tabs.get(tabId);
    const u = t?.url || "";
    if (/\/imagine\/post\//.test(u) && u !== preUrl) return { started: true, reason: "navego al /post del video", postUrl: u };
  } catch (_e) { /* noop */ }
  try {
    await ensureContentScript(tabId, "grok");
    const srcs = (await sendActOrFail(tabId, ACT.VIDEO_SRCS, {}))?.srcs || [];
    const beforeSet = new Set(before || []);
    if (srcs.some((s) => !beforeSet.has(s))) return { started: true, reason: "aparecio un video nuevo en el DOM", postUrl: null };
  } catch (_e) { /* content script pudo morir en la navegacion */ }
  // Misma senal que usa el driver para confirmar arranque: el texto "Generando/Generating" en la pagina.
  // El probe no la miraba y era la ventana tipica del falso negativo.
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => (document.body?.innerText || "").slice(0, 20000) });
    if (/generando|generating/i.test(r?.result || "")) return { started: true, reason: "la pagina muestra 'Generando'", postUrl: null };
  } catch (_e) { /* pestana sin acceso: sin senal extra */ }
  return { started: false, reason: "", postUrl: null };
}

async function runGrokAnimation(scene) {
  const tab = await findFlowTab("grok");
  if (!tab) throw new Error("No hay pestana de Grok abierta (grok.com/imagine). Abrela y reintenta.");

  // IDEMPOTENCIA (no re-gastar puntos): el FIRE (que paga) solo corre la 1a vez. scene.grokFired se marca
  // tras un disparo exitoso; si un reintento entra con grokFired (o con scene.videoUrl ya recogido), NO
  // re-disparamos: recogemos en el /post del video (scene.grokVideoPostUrl) o re-descargamos.
  if (!scene.videoUrl && !scene.grokFired) {
    const preset = state.project?.preset || "";
    const shouldReloadBeforeAnim = state.project?.perSceneRender || /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(preset);
    if (shouldReloadBeforeAnim) {
      log(LOG_LEVEL.INFO, `Grok: recarga limpia antes de animar ${scene.id} (evita estado residual de imagenes).`);
      try { await hardReloadGrok(tab.id); }
      catch (e) {
        log(LOG_LEVEL.WARN, `Grok: recarga previa a animacion fallo (${e?.message ?? e}); intento con composer fresco.`);
        await ensureGrokCompositor(tab.id);
      }
    }
    // HANDOFF cross-proveedor: si la imagen NO se genero en Grok (imageProvider != "grok") no hay /post que
    // abrir -> composer fresco + subir la imagen de disco por CDP (Grok SI anima imagenes subidas, spike OK).
    const imgProv = state.project?.imageProvider || state.config.provider;   // proveedor EFECTIVO (igual que el dispatch)
    // Imagen generada en Grok -> normalmente se anima navegando a su /imagine/post. Pero si Grok DIFUNDIO la
    // imagen IN-PLACE (sale como data URL, sin navegar a /post) NO hay post que abrir; si tenemos el still
    // (data URL o ruta en disco) animamos SUBIENDOLO como el handoff cross-proveedor (no necesita post).
    const canNavigatePost = !!scene.grokPostUrl || /generated\//.test(scene.imageUrl || "");
    const uploadedImage = imgProv !== "grok" || (!canNavigatePost && (!!scene.imageFilePath || !!scene.imageUrl));
    if (uploadedImage) {
      // (Re)baja el still a disco si falta la ruta (reinicio del SW) O si la imagen es un data URL (Grok in-place:
      // la ruta previa pudo moverse a public/ y quedar obsoleta). downloadImageForRef sirve para data: y assets.grok.com.
      if (scene.imageUrl && (!scene.imageFilePath || /^data:/.test(scene.imageUrl))) {
        try { const slug = state.project?.slug || "proyecto"; const saved = await downloadImageForRef(scene.imageUrl, slug, scene.id); scene.imageFilePath = saved.abspath || scene.imageFilePath; } catch (_e) {}
      }
      if (!scene.imageFilePath) throw new Error("falta la imagen en disco para subir a Grok; regenera la imagen");
      await ensureGrokCompositor(tab.id);          // composer fresco (sin /post)
      await ensureContentScript(tab.id, "grok");
      await ensureDebugger(tab.id);                // CDP para subir el archivo + el clic TRUSTED
      // Grok julio-2026 borra cualquier adjunto al cambiar Imagen <-> Video. Preparar el modo ANTES de
      // subir el still; ANIMATE_FIRE lo confirma otra vez de forma idempotente, sin tocar el archivo.
      await sendActOrFail(tab.id, ACT.PREPARE_VIDEO, {});
      await clearGrokRefsOrFail(tab.id, scene.id);
      await cdpSetFileInput(tab.id, [scene.imageFilePath]);
      const attached = await sendActOrFail(tab.id, ACT.WAIT_FOR_REFS, { expected: 1, timeoutMs: 30000 });
      log(LOG_LEVEL.INFO, `${scene.id}: imagen subida y confirmada en Grok para animar (handoff desde ${imgProv}; ${attached?.confirmedCount || attached?.count || 1} chip).`);
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
      await sendActOrFail(tab.id, ACT.ANIMATE_FIRE, { prompt: scene.animationPrompt, cfg: driverCfg(), expectImage: uploadedImage });
    } catch (e) {
      const msg = e?.message ?? String(e);
      if (/no respondio|message port|closed|sin respuesta/i.test(msg)) log(LOG_LEVEL.WARN, `${scene.id}: fire sin respuesta (navegacion); continuo a recolectar.`);
      else {
        // "no arranco" puede ser un FALSO NEGATIVO (Grok tardo mas que el timeout): probe antes de re-disparar.
        // Si hay evidencia de que la generacion arranco (y se pago), NO relanzamos: marcamos grokFired abajo y
        // recogemos. Solo si NO hay evidencia relanzamos el error (fallo real, reintento libre).
        const probe = await grokAnimationLikelyStarted(tab.id, preUrl, scene.grokAnimBefore);
        if (probe.started) {
          log(LOG_LEVEL.WARN, `${scene.id}: "${msg}" pero la animacion SI arranco (${probe.reason}); NO re-disparo, recojo.`);
          if (probe.postUrl) { scene.grokVideoPostUrl = probe.postUrl; }
        } else {
          detachDebugger(tab.id); throw e;
        }
      }
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
// Cada evento SSE trae audio incremental. alignment es un snapshot ACUMULATIVO por chunk_seq:
// el parser compartido conserva solo el snapshot mas reciente de cada chunk para no duplicar subtitulos.
async function fishTTSWithTimestamps(text, { apiKey, voiceId, model, speed }) {
  const body = { text, format: "mp3", latency: "normal" };
  if (voiceId) body.reference_id = voiceId;   // la VOZ; vacio = voz por defecto de Fish
  // OPT-IN: velocidad de habla (Fish prosody.speed, 0.5-2.0). Solo si != 1 -> sin el campo, body intacto
  // (comportamiento previo para todos los JSON que no traen audio.voice_speed). historias v2 usa 0.9.
  if (speed && speed !== 1) body.prosody = { speed };
  const res = await fetch("https://api.fish.audio/v1/tts/stream/with-timestamp", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "model": model || DEFAULT_CONFIG.fishModel },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.message || j.detail || JSON.stringify(j); } catch (_e) {}
    throw new Error(`Fish Audio ${res.status}: ${detail}`);
  }
  const raw = await res.text();   // SSE completo (el stream cierra al terminar la generacion)
  const parsed = parseFishTimestampSse(raw);
  const audioParts = parsed.audioBase64Parts.map(base64ToBytes);
  const words = parsed.words;
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

async function cleanupV3VoiceFile(slug, filename, outputFormat) {
  const relPath = `remotion-editor/public/${slug}/voice/${filename}`;
  const writerUrl = state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl;
  let base = "http://localhost:35729";
  try { base = new URL(writerUrl).origin; } catch (_e) { /* fallback */ }
  try {
    const res = await fetch(`${base}/audio/cleanup-v3?path=${encodeURIComponent(relPath)}&output_format=${encodeURIComponent(outputFormat || "mp3_44100_192")}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    const j = await res.json().catch(() => null);
    if (!j?.ok) throw new Error("respuesta invalida");
    log(LOG_LEVEL.INFO, `ElevenLabs V3: limpieza de ruido aplicada -> ${j.path}`);
    return true;
  } catch (e) {
    log(LOG_LEVEL.WARN, `ElevenLabs V3: no pude aplicar limpieza de ruido (${e?.message ?? e}); sigo con audio crudo.`);
    return false;
  }
}

async function publicFileStatus(relPath) {
  const writerUrl = state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl;
  let base = "http://localhost:35729";
  try { base = new URL(writerUrl).origin; } catch (_e) { /* fallback */ }
  try {
    const res = await fetch(`${base}/file-status?path=${encodeURIComponent(relPath)}`);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j?.ok ? j : null;
  } catch (_e) {
    return null;
  }
}

async function publicFileOk(relPath, minBytes = 1) {
  const j = await publicFileStatus(relPath);
  return !!j && Number(j.size || 0) >= minBytes;
}

async function voiceFileOk(slug, filename) {
  const minBytes = filename.toLowerCase().endsWith(".mp3") ? 4096 : 2;
  return publicFileOk(`remotion-editor/public/${slug}/voice/${filename}`, minBytes);
}

// Verifica EN DISCO (via dev-server) que la voz del proyecto este completa: full.mp3 para presets de
// voz continua; 1 mp3 por escena con voiceover (+hook) para el resto. Devuelve la lista de faltantes.
// Ojo: con el dev-server caido reporta todo como faltante (el render tampoco los veria).
async function missingVoiceFiles() {
  const slug = state.project?.slug || "proyecto";
  const preset = state.project?.preset || "";
  const fullScript = state.project?.ttsExport?.full_script;
  const continuous = /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(preset) && typeof fullScript === "string" && fullScript.trim();
  if (continuous) return (await voiceFileOk(slug, "full.mp3")) ? [] : ["full.mp3"];
  const missing = [];
  const hv = state.project?.hook?.voiceover;
  const hookText = typeof hv === "string" ? hv : (hv && typeof hv.text === "string" ? hv.text : "");
  if (hookText.trim() && !(await voiceFileOk(slug, "hook.mp3"))) missing.push("hook.mp3");
  for (const s of (state.scenes || []).filter((x) => (x.voiceoverText || "").trim())) {
    if (!(await voiceFileOk(slug, `${s.id}.mp3`))) missing.push(`${s.id}.mp3`);
  }
  return missing;
}

function currentProjectAsElevenJson() {
  const p = state.project || {};
  const tts = p.ttsExport || {};
  const scenes = (state.scenes || []).filter((s) => !s.isPageCell).map((s) => ({
    id: s.id,
    type: s.sceneType || "panel",
    card: s.sceneType === "narrative_card" ? { mode: s.cardMode || "editor", text: s.cardText || "" } : undefined,
    render_mode: s.renderMode || "static",
    visual: { image_prompt: s.imagePrompt || "" },
    animation_prompt: s.animationPrompt || "",
    timeline: { clip_duration_s: s.clipDurationS || p.defaultClipDurationS || 4 },
    voiceover: s.narrationRef?.unitId ? undefined
      : { text: s.voiceoverText || "", ...(s.voiceoverSpeaker ? { speaker: s.voiceoverSpeaker } : {}) },
    captions: s.narrationRef?.unitId ? undefined : (s.captionsText ? { text: s.captionsText } : undefined),
    narration_ref: s.narrationRef?.unitId
      ? { unit_id: s.narrationRef.unitId, timing_weight: s.narrationRef.timingWeight }
      : undefined,
  }));
  return {
    project: {
      title: p.title || "proyecto",
      preset: p.preset || "",
      slug: p.slug || "proyecto",
      language: p.language || tts.language || "es-419",
      aspect_ratio: p.aspectRatio || "9:16",
      fps: p.fps || 30,
      default_clip_duration_s: p.defaultClipDurationS || 4,
    },
    pipeline: {
      image_generation: { tool: p.imageProvider || p.provider || state.config.provider || "grok" },
      animation: { tool: p.animationProvider || "grok" },
      tts: { tool: "elevenlabs", voice_id: tts.voice_id, language: tts.language || p.language || "es-419" },
      editing: { tool: "remotion" },
    },
    scenes,
    narration_track: p.narrationTrack || undefined,
    render_export: { clip_order: scenes.map((s) => s.id).filter(Boolean) },
    tts_export: { ...tts, engine: "elevenlabs" },
  };
}

async function generateElevenViaNode(payload) {
  const bodyPayload = typeof payload === "string" ? { jobName: payload } : (payload || {});
  if (!bodyPayload.jobName && !bodyPayload.projectJson) return false;
  const writerUrl = state.config.audioWriterUrl || DEFAULT_CONFIG.audioWriterUrl;
  let base = "http://localhost:35729";
  try { base = new URL(writerUrl).origin; } catch (_e) { /* fallback */ }
  const res = await fetch(`${base}/audio/generate-eleven`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
  });
  const body = await res.text().catch(() => "");
  const j = body ? (() => { try { return JSON.parse(body); } catch (_e) { return null; } })() : null;
  if (!res.ok || !j?.ok) throw new Error(j?.error || j?.stderr || body || `HTTP ${res.status}`);
  if (j.stdout) {
    const line = String(j.stdout).split(/\r?\n/).filter(Boolean).slice(-1)[0];
    if (line) log(LOG_LEVEL.INFO, `ElevenLabs Node: ${line.slice(0, 220)}`);
  }
  return true;
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

// ---------------------------------------------------------------------------
// ElevenLabs V3 (TTS, preset historias en modo Natural). El SW llama api.elevenlabs.io DIRECTO.
// Produce los MISMOS archivos que Fish (full.mp3 + full.words.json) -> el resto del pipeline no cambia.
// V3 NO tiene request stitching: si full_script > ~3000 chars se parte por escena y se concatenan los mp3.
// ---------------------------------------------------------------------------
// V3 admite hasta 5000 chars/request -> cortamos a 4800 (margen): asi MUCHOS guiones caben en 1 bloque = sin seam.
// OJO: previous_text/next_text NO estan soportados en eleven_v3 (la API responde 400 unsupported_model). Para el
// seam cuando se parte: chunking balanceado + mismo seed + concat limpio.
const ELEVEN_MAX_CHARS = 4800, ELEVEN_MIN_CHARS = 250, ELEVEN_DEFAULT_VOICE = "8mBRP99B2Ng2QwsJMFQl";
const ELEVEN_MANHWA_VOICE = "452WrNT9o8dphaYW5YGU";
const ELEVEN_MANHWA_V3_SPEED = 1.3;

function stripTags(s) { return String(s || "").replace(/\[[^\]]*\]/g, "").replace(/<[^>]*>/g, ""); }  // [tags] v3 y <break/> SSML v2 (el texto a la API SÍ los conserva; esto es solo para alinear/contar palabras)

// Parte el full_script en bloques <= max cortando en limite de escena (texto crudo, con tags). BALANCEADO:
// si hay que partir, reparte en N=ceil(total/max) bloques de tamano PAREJO (no uno enorme + uno diminuto),
// para que ningun bloque sea muy corto (V3 se desestabiliza con <250 chars) y el seam sea menos notorio.
function chunkHistorias(fullScript, sceneTexts, maxChars = ELEVEN_MAX_CHARS) {
  const texts = (sceneTexts || []).filter(Boolean);
  if (fullScript.length <= maxChars || texts.length <= 1) return [fullScript];
  const nChunks = Math.ceil(fullScript.length / maxChars);
  const target = fullScript.length / nChunks; // tamano objetivo por bloque (reparto parejo)
  const chunks = [];
  let cur = "";
  for (const t of texts) {
    const cand = cur ? `${cur} ${t}` : t;
    if (cur && cand.length > maxChars) { chunks.push(cur); cur = t; }                      // tope duro
    else if (cur && cur.length >= target && chunks.length < nChunks - 1) { chunks.push(cur); cur = t; } // balance
    else cur = cand;
  }
  if (cur) {
    if (chunks.length && cur.length < ELEVEN_MIN_CHARS) chunks[chunks.length - 1] += ` ${cur}`;
    else chunks.push(cur);
  }
  return chunks.length ? chunks : [fullScript];
}

// alignment char-level de V3 -> palabras [{word,start,end}] (IGNORA los tags: no se hablan ni cuentan tiempo).
function elevenWordsFromAlignment(al) {
  const chars = al.characters || [];
  const starts = al.character_start_times_seconds || [];
  const ends = al.character_end_times_seconds || [];
  const text = chars.join("");
  const isTag = new Array(chars.length).fill(false);
  const re = /\[[^\]]*\]/g; let m;
  while ((m = re.exec(text)) !== null) { for (let i = m.index; i < m.index + m[0].length; i++) isTag[i] = true; }
  const words = []; let buf = [];
  const flush = () => {
    if (buf.length) {
      const spoken = buf.filter((i) => !isTag[i]);
      const token = buf.map((i) => chars[i]).join("").replace(/\[[^\]]*\]/g, "").trim();
      if (spoken.length && token) words.push({ word: token, start: starts[spoken[0]], end: ends[spoken[spoken.length - 1]] });
    }
    buf = [];
  };
  for (let i = 0; i < chars.length; i++) { if (/\s/.test(chars[i])) flush(); else buf.push(i); }
  flush();
  const duration = ends.length ? ends[ends.length - 1] : (words.length ? words[words.length - 1].end : 0);
  return { chunkWords: words, duration };
}

// convert normal (sin timestamps) -> Uint8Array mp3. Fallback cuando V3 no soporta with-timestamps.
async function elevenConvert(text, o) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${o.voiceId}?output_format=${encodeURIComponent(o.outputFormat)}`;
  const body = { text, model_id: o.modelId, language_code: o.languageCode, voice_settings: o.voiceSettings, seed: o.seed };
  if (o.previousText) body.previous_text = o.previousText;   // continuidad del seam (SOLO v2/turbo/flash; v3 los rechaza)
  if (o.nextText) body.next_text = o.nextText;
  const res = await fetch(url, { method: "POST", headers: { "xi-api-key": o.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { let d = `HTTP ${res.status}`; try { d = JSON.stringify(await res.json()); } catch (_e) {} throw new Error(`ElevenLabs convert ${res.status}: ${d}`); }
  return new Uint8Array(await res.arrayBuffer());
}

// Forced Alignment API -> palabras del audio (cuando with-timestamps no esta disponible en V3).
async function elevenForcedAlignment(audio, text, apiKey) {
  const fd = new FormData();
  fd.append("file", new Blob([audio], { type: "audio/mpeg" }), "audio.mp3");
  fd.append("text", text);
  const res = await fetch("https://api.elevenlabs.io/v1/forced-alignment", { method: "POST", headers: { "xi-api-key": apiKey }, body: fd });
  if (!res.ok) { let d = `HTTP ${res.status}`; try { d = JSON.stringify(await res.json()); } catch (_e) {} throw new Error(`ElevenLabs forced-alignment ${res.status}: ${d}`); }
  const j = await res.json();
  const words = (Array.isArray(j.words) ? j.words : [])
    .map((w) => ({ word: (w.text || "").trim(), start: Number(w.start) || 0, end: Number(w.end) || 0 }))
    .filter((w) => w.word);
  return { chunkWords: words, duration: words.length ? words[words.length - 1].end : 0 };
}

// 1 bloque -> { audio:Uint8Array, chunkWords, duration }. Intenta with-timestamps; si V3 no lo soporta,
// cae a convert + forced-alignment (texto SIN tags). Errores transitorios se propagan (los maneja el caller).
async function elevenTTSWithTimestamps(text, o) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${o.voiceId}/with-timestamps?output_format=${encodeURIComponent(o.outputFormat)}`;
  const body = { text, model_id: o.modelId, language_code: o.languageCode, voice_settings: o.voiceSettings, seed: o.seed };
  if (o.previousText) body.previous_text = o.previousText;   // continuidad del seam (SOLO v2/turbo/flash; v3 los rechaza)
  if (o.nextText) body.next_text = o.nextText;
  const res = await fetch(url, { method: "POST", headers: { "xi-api-key": o.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) {
    const j = await res.json();
    const al = j.alignment || {};
    if (j.audio_base64 && Array.isArray(al.characters) && al.characters.length) {
      const { chunkWords, duration } = elevenWordsFromAlignment(al);
      return { audio: base64ToBytes(j.audio_base64), chunkWords, duration };
    }
    if (j.audio_base64) { // dio audio pero sin alignment -> forced-alignment
      const audio = base64ToBytes(j.audio_base64);
      return { audio, ...(await elevenForcedAlignment(audio, stripTags(text), o.apiKey)) };
    }
  } else if (![400, 404, 405, 422, 501].includes(res.status)) { // transitorio (429/5xx/red): propaga
    let d = `HTTP ${res.status}`; try { d = JSON.stringify(await res.json()); } catch (_e) {}
    throw new Error(`ElevenLabs ${res.status}: ${d}`);
  }
  // with-timestamps no soportado por V3 -> convert + forced-alignment
  const audio = await elevenConvert(text, o);
  return { audio, ...(await elevenForcedAlignment(audio, stripTags(text), o.apiKey)) };
}

// historias: genera full.mp3 + full.words.json con ElevenLabs V3 desde tts_export (voice/seed/settings del JSON).
async function generateHistoriasEleven(fullScript, sceneTexts, slug, tts, apiKey) {
  const vs = tts.voice_settings || {};
  const modelId = tts.model_id || "eleven_v3";
  const preset = state.project?.preset || "";
  const forceChannelVoice = /^(historias|criptoclaro|habitos|pov-historias)/.test(preset);
  const defaultVoice = preset === "manhwa" ? ELEVEN_MANHWA_VOICE : ELEVEN_DEFAULT_VOICE;
  const o = {
    apiKey,
    // manhwa: voz de narrador POR SERIE (tts_export.voices.narrador; voice_id ya viene resuelto por el loader).
    voiceId: preset === "manhwa" ? ((tts.voices?.narrador || "").trim() || (tts.voice_id || "").trim() || ELEVEN_MANHWA_VOICE) : forceChannelVoice ? ELEVEN_DEFAULT_VOICE : ((tts.voice_id || "").trim() || defaultVoice),
    modelId,
    languageCode: tts.language_code || "es",
    outputFormat: tts.output_format || "mp3_44100_192",
    seed: Number.isInteger(tts.seed) ? tts.seed : 42,
    voiceSettings: { stability: vs.stability ?? (modelId === "eleven_v3" ? 0 : 0.45), similarity_boost: vs.similarity_boost ?? 0.75, style: vs.style ?? (modelId === "eleven_v3" ? 0 : 0.25), use_speaker_boost: vs.use_speaker_boost ?? true },
  };
  if (forceChannelVoice) {
    if (modelId === "eleven_v3") {
      o.voiceSettings = { stability: 0, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1.2 };
    } else {
      o.voiceSettings.speed = 1.15;
    }
  } else if (preset === "manhwa" && o.voiceId === ELEVEN_MANHWA_VOICE && modelId === "eleven_v3" && typeof vs.speed !== "number") {
    o.voiceSettings.speed = ELEVEN_MANHWA_V3_SPEED;
  } else if (typeof vs.speed === "number") {
    o.voiceSettings.speed = vs.speed;
  }
  // v3 NO soporta stitching y se desestabiliza con texto largo -> tope 4800 y el seam (si parte) es inevitable.
  // v2 (y turbo/flash) SI soportan previous_text/next_text y aceptan ~10000 chars/request -> tope 9000; si se
  // parte, cada bloque recibe el contexto vecino para que el seam sea CONTINUO. El orquestador elige el modelo
  // por tamano de guion (tts_export.model_id): <5000 -> eleven_v3 (tags); >5000 -> eleven_multilingual_v2 (puntuacion).
  const isV3 = o.modelId === "eleven_v3";
  const maxChars = isV3 ? ELEVEN_MAX_CHARS : 9000;
  const chunks = chunkHistorias(fullScript, sceneTexts, maxChars);
  log(LOG_LEVEL.INFO, `ElevenLabs ${o.modelId}: voz ${o.voiceId} (seed ${o.seed}, ${o.outputFormat}) -> ${chunks.length} bloque(s) -> ${slug}/voice/full.mp3`);
  const audioParts = [], words = []; let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    await ensureState();
    // Contexto del seam SOLO para no-v3 (v2/turbo/flash); en v3 va undefined -> el body no los manda (v3 los rechaza).
    o.previousText = (!isV3 && i > 0) ? chunks[i - 1].slice(-600) : undefined;
    o.nextText = (!isV3 && i < chunks.length - 1) ? chunks[i + 1].slice(0, 600) : undefined;
    const { audio, chunkWords, duration } = await elevenTTSWithTimestamps(chunks[i], o);
    audioParts.push(audio);
    for (const w of chunkWords) words.push({ word: w.word, start: round3(w.start + offset), end: round3(w.end + offset) });
    offset += duration;
    log(LOG_LEVEL.INFO, `  bloque ${i + 1}/${chunks.length}: ${Math.round(audio.length / 1024)} KB, ${chunkWords.length} palabras`);
  }
  const total = audioParts.reduce((n, a) => n + a.length, 0);
  if (!total) throw new Error("ElevenLabs no devolvio audio");
  const audio = new Uint8Array(total); let p = 0; for (const a of audioParts) { audio.set(a, p); p += a.length; }
  const savedMp3 = await saveVoiceFile(slug, "full.mp3", audio, "audio/mpeg");
  if (isV3) {
    if (savedMp3.via === "server") await cleanupV3VoiceFile(slug, "full.mp3", o.outputFormat);
    else log(LOG_LEVEL.WARN, "ElevenLabs V3: limpieza de ruido requiere dev-server; el MP3 quedo en Descargas sin postproceso.");
  }
  const savedWords = await saveVoiceFile(slug, "full.words.json", JSON.stringify(words), "application/json");
  log(LOG_LEVEL.INFO, `voz V3 lista: full.mp3 (${Math.round(audio.length / 1024)} KB, ${words.length} palabras) -> ${savedMp3.path}`);
  if (savedMp3.via === "downloads" || savedWords.via === "downloads") {
    log(LOG_LEVEL.WARN, `Voz en Descargas (dev-server caido): muevela a remotion-editor/public/${slug}/voice/.`);
  }
  log(LOG_LEVEL.INFO, "historias: ahora corre  node align/inject-words.mjs <json>  y renderiza.");
}

// Genera la voz de cada escena (+ hook) con Fish Audio. limit -> solo las primeras N escenas (prueba).
// Devuelve true si TODO el audio pedido quedo generado (o ya existia); false si algo fallo o si ya
// habia otra generacion en curso. Los callers (onRunAll, remoto) usan el boolean para NO dar por
// buenos medios de voz que no existen.
async function onGenerateAudio(message = {}) {
  // Anti-reentrada: panel + comando remoto + autopiloto pueden coincidir; dos generaciones
  // concurrentes duplican el gasto de creditos TTS y se pisan los archivos.
  if (audioBusy) { log(LOG_LEVEL.WARN, "Audio: ya hay una generacion en curso; ignoro la reentrada."); return false; }
  audioBusy = true;
  try {
  await applySecrets();   // recarga la key desde secrets.local.json por si el dev-server arranco tarde
  const missingOnly = !!message.missingOnly;

  // historias + ElevenLabs V3: si el JSON pide engine "elevenlabs", la voz va por V3 (NO requiere key de Fish).
  // Bloque con scope propio (_*) para no chocar con las const del flujo Fish de abajo.
  {
    const _tts = state.project?.ttsExport || {};
    const _fs = _tts.full_script;
    const _preset = state.project?.preset || "";
    const _wantsEleven = (/^(historias|criptoclaro|habitos|pov-historias)/.test(_preset) && _tts.engine === "elevenlabs")
      || (_preset === "manhwa" && _tts.engine === "elevenlabs");
    if (_wantsEleven && typeof _fs === "string" && _fs.trim()) {
      const elevenKey = (state.config.elevenApiKey || "").trim();
      if (!elevenKey) { log(LOG_LEVEL.ERROR, "ElevenLabs: el JSON pide engine \"elevenlabs\" pero falta elevenApiKey en secrets.local.json."); return false; }
      const _slug = state.project?.slug || "proyecto";
      if (missingOnly && await voiceFileOk(_slug, "full.mp3")) {
        log(LOG_LEVEL.INFO, `Audio faltante: ${_slug}/voice/full.mp3 ya existe; no genero de nuevo.`);
        return true;
      }
      const _texts = (state.scenes || []).filter((s) => (s.voiceoverText || "").trim()).map((s) => s.voiceoverText.trim());
      try {
        const payload = state.queue?.jobName
          ? { jobName: state.queue.jobName }
          : { projectJson: currentProjectAsElevenJson() };
        const label = state.queue?.jobName || `${_slug} (manual)`;
        log(LOG_LEVEL.INFO, `ElevenLabs: delegando voz a Node local (${label}) para evitar perdida por service worker.`);
        await generateElevenViaNode(payload);
        log(LOG_LEVEL.INFO, `ElevenLabs Node listo -> ${_slug}/voice/full.mp3`);
        return true;
      } catch (e) {
        log(LOG_LEVEL.ERROR, `ElevenLabs Node fallo: ${e?.message ?? e}`);
        return false;
      }
    }
    if (_preset === "manhwa") {
      log(LOG_LEVEL.ERROR, "manhwa requiere tts_export.full_script y pipeline.tts.tool \"elevenlabs\".");
      return false;
    }
  }

  const apiKey = (state.config.fishApiKey || "").trim();
  if (!apiKey) { log(LOG_LEVEL.ERROR, "Fish Audio: falta tu API key. Revisa secrets.local.json y que 'flowbot start' este corriendo."); return false; }

  // Voz normal: config.fishVoiceId GANA. Los presets forceVoice (novelas-coreanas-eng) ignoran
  // cualquier override y fuerzan su voiceId para no cambiar de narradora entre videos.
  // NUNCA queda vacio: aunque el JSON olvide "preset", SIEMPRE usa la voz default (no la generica de Fish).
  const preset = state.project?.preset || "";
  const cfgVoice = (state.config.fishVoiceId || "").trim();
  const { voiceId, source: src, presetCfg } = resolveFishVoice(preset, cfgVoice);
  const model = state.config.fishModel || presetCfg?.model || DEFAULT_CONFIG.fishModel;
  log(LOG_LEVEL.INFO, `Fish Audio: voz desde ${src} (${voiceId}).`);
  if (!presetCfg?.voiceId && !cfgVoice) {
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
  if (/^(historias|criptoclaro|habitos|pov-historias)/.test(preset || "") && typeof fullScript === "string" && fullScript.trim()) {
    items.splice(0, items.length, { id: "full", text: fullScript.trim() });
    log(LOG_LEVEL.INFO, "historias: 1 voz continua desde tts_export.full_script -> full.mp3 + full.words.json (sin costura entre escenas).");
  }

  if (!items.length) { log(LOG_LEVEL.WARN, "No hay textos de voz (scenes[].voiceover.text) para generar."); return true; }   // sin voz que generar = nada que fallar

  if (missingOnly) {
    const original = items.length;
    const missing = [];
    for (const it of items) {
      if (!(await voiceFileOk(slug, `${it.id}.mp3`))) missing.push(it);
    }
    items.splice(0, items.length, ...missing);
    const skipped = original - items.length;
    if (!items.length) {
      log(LOG_LEVEL.INFO, `Audio faltante: todos los mp3 ya existen (${skipped}); no gasto creditos.`);
      return true;
    }
    log(LOG_LEVEL.INFO, `Audio faltante: genero ${items.length}; omito ${skipped} existente(s).`);
  }

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
  // Solo cuenta como exito si TODOS los audios quedaron Y en el proyecto (los que caen en Descargas
  // NO los ve el render: el caller debe avisar en vez de dar los medios por listos).
  return okCount === items.length && !viaDownloads;
  } finally { audioBusy = false; }
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
    const body = await res.text().catch(() => "");
    const j = body ? (() => { try { return JSON.parse(body); } catch (_e) { return null; } })() : null;
    if (res.ok && j && j.ok) return { via: "server", path: to };
    // 422 = el dev-server RECHAZO el clip (truncado/0-bytes). Antes se trataba igual que "dev-server
    // caido" y la escena quedaba DONE con un video roto en silencio. Propagar -> reintento (re-descarga
    // sin re-animar: videoUrl ya esta).
    if (res.status === 422) throw new Error(`clip rechazado por dev-server (posible corrupto, descarga incompleta): ${body || res.statusText}`);
  } catch (e) {
    if (/clip rechazado/i.test(String(e?.message ?? e))) throw e;
    /* dev-server no corre: queda en Descargas */
  }
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

function isClosedImageChannelError(e) {
  return /content no respondio a act:generate_image|message channel closed|message port closed|Extension context invalidated|Receiving end does not exist/i
    .test(e?.message ?? String(e));
}

function isNoNewGrokImageError(e) {
  return /no aparecio imagen nueva en Grok tras generar|imagen nueva de Grok no se estabilizo|GROK_PROMPT_GROUP_EMPTY|no aparecio el bloque del prompt actual/i.test(e?.message ?? String(e));
}

function isGrokSendNotRegisteredError(e) {
  return /Enviar de Grok no registro|prompt no se vacio/i.test(e?.message ?? String(e));
}

function isGrokSafeComposerError(e) {
  return /prompt de Grok no se pudo reemplazar|prompt de Grok cambio antes de enviar|prompt de Grok perdio el foco antes de enviar|boton "?Enviar"? de Grok no se habilito|teclado trusted fallo|foco trusted fallo/i
    .test(e?.message ?? String(e));
}

// Debe producir exactamente las mismas claves compactas que content/grok-driver.js::genId.
// El SW conserva estas claves aunque /imagine se recargue y el DOM pierda su snapshot "before".
function grokImageKey(url) {
  const s = String(url || "");
  const server = s.match(/\/generated\/([^/?]+)/)
    || s.match(/\/users\/[^/]+\/([^/?#]+)\/content(?:[?#]|$)/i)
    || s.match(/\/images\/([^/?]+?)(?:\.[a-z]+)?(?:\?|$)/i);
  if (server) return `post:${server[1]}`;
  if (!/^data:image/.test(s)) return s;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `data:${s.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function newGrokImageAttempt(ownerType, ownerId, rejectImageKeys = []) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id: `grok-image-${random}`,
    ownerType,
    ownerId,
    provider: "grok",
    stage: "preparing",
    submitIssued: false,
    before: [...new Set((rejectImageKeys || []).filter(Boolean))],
    preUrl: null,
    createdAt: Date.now(),
    issuedAt: null,
    result: null,
  };
}

function grokAttemptOwner(ownerType, ownerId) {
  if (ownerType === "scene") return (state?.scenes || []).find((s) => s?.id === ownerId) || null;
  if (ownerType === "ingredient") return (state?.project?.ingredients || []).find((g) => g?.id === ownerId) || null;
  return null;
}

async function persistGrokImageSubmitIntent(message, sender) {
  await ensureState();
  const senderUrl = sender?.tab?.url || sender?.url || "";
  if (senderUrl && !/^https:\/\/(?:www\.)?grok\.com\//i.test(senderUrl)) {
    throw new Error("origen no-Grok rechazo el marcador de envio");
  }
  const owner = grokAttemptOwner(message?.ownerType, message?.ownerId);
  if (!owner) throw new Error(`no encuentro ${message?.ownerType || "owner"} ${message?.ownerId || ""}`);
  const attempt = owner.grokImageAttempt;
  if (!attempt || attempt.id !== message?.attemptId) {
    throw new Error("el intento Grok ya no coincide con el estado persistido");
  }
  if (owner.status !== SCENE_STATUS.GENERATING_IMAGE) {
    throw new Error(`el intento Grok no esta activo (estado ${owner.status || "desconocido"})`);
  }
  // Idempotente: si el mismo content re-entrega el mensaje por una reconexion, conserva el primer
  // `issuedAt` y amplia `before`; nunca crea otro intento ni autoriza un segundo Enter con otro id.
  const reportedBefore = Array.isArray(message?.before) ? message.before.filter(Boolean) : [];
  attempt.before = [...new Set([...(attempt.before || []), ...reportedBefore])];
  attempt.preUrl = message?.preUrl || attempt.preUrl || senderUrl || null;
  attempt.submitIssued = true;
  attempt.stage = "submit_issued";
  attempt.issuedAt = attempt.issuedAt || Date.now();
  attempt.tabId = sender?.tab?.id ?? attempt.tabId ?? null;
  await saveState();
}

async function persistGrokImageSubmitObserved(message, sender) {
  await ensureState();
  const owner = grokAttemptOwner(message?.ownerType, message?.ownerId);
  const attempt = owner?.grokImageAttempt;
  if (!attempt || attempt.id !== message?.attemptId || !attempt.submitIssued) {
    throw new Error("el intento Grok observado ya no coincide con el estado persistido");
  }
  // Solo aceptar un /post de grok.com comunicado por el mismo tab del handshake. Una URL exacta permite
  // volver al resultado correcto incluso si el usuario cambio de pestaña antes del restart.
  const postUrl = String(message?.postUrl || "");
  if (postUrl && /^https:\/\/(?:www\.)?grok\.com\/imagine\/post\//i.test(postUrl)
      && (attempt.tabId == null || attempt.tabId === sender?.tab?.id)) {
    attempt.postUrl = postUrl;
  }
  attempt.stage = "submit_observed";
  attempt.acceptedReason = message?.acceptedReason || attempt.acceptedReason || null;
  attempt.observedAt = attempt.observedAt || Date.now();
  await saveState();
}

// OPEN_IMAGE navega al post correcto cerrando deliberadamente el canal del content script. Guardar la
// URL desde el background en cuanto aparece permite recuperarla tras otra navegacion, un cierre del SW o
// un segundo cierre de canal, sin volver a enviar Enter.
async function persistDiscoveredGrokPost(grokAttempt, tabId, postUrl) {
  if (!grokAttempt?.id || !/^https:\/\/(?:www\.)?grok\.com\/imagine\/post\//i.test(postUrl || "")) return false;
  const owner = grokAttemptOwner(grokAttempt.ownerType, grokAttempt.ownerId);
  const attempt = owner?.grokImageAttempt;
  if (!attempt || attempt.id !== grokAttempt.id || !attempt.submitIssued) return false;
  if (attempt.tabId != null && attempt.tabId !== tabId) return false;
  attempt.tabId = tabId;
  attempt.postUrl = postUrl;
  attempt.stage = "post_discovered";
  attempt.postDiscoveredAt = Date.now();
  await saveState();
  return true;
}

function persistedGrokResult(img) {
  if (!img?.imageUrl) return null;
  return {
    imageUrl: img.imageUrl,
    postUrl: img.postUrl || null,
    variantCount: Number(img.variantCount || 0),
    requiresByteValidation: !!img.requiresByteValidation,
    candidateImages: Array.isArray(img.candidateImages) ? img.candidateImages : [],
    recovered: !!img.recovered,
    promptScoped: img.promptScoped === true,
  };
}

async function persistGrokAttemptResult(owner, img) {
  if (!owner?.grokImageAttempt || !img?.imageUrl) return;
  owner.grokImageAttempt.submitIssued = true;
  owner.grokImageAttempt.stage = "validating_candidates";
  owner.grokImageAttempt.result = persistedGrokResult(img);
  owner.grokImageAttempt.resultCapturedAt = Date.now();
  await saveState();
}

function knownGrokImageKeys({ excludeSceneId = null, excludeIngredientId = null } = {}) {
  const urls = [];
  for (const s of (state?.scenes || [])) {
    if (s?.id !== excludeSceneId && s?.imageUrl) urls.push(s.imageUrl);
  }
  for (const ing of (state?.project?.ingredients || [])) {
    if (ing?.id !== excludeIngredientId && ing?.imageUrl) urls.push(ing.imageUrl);
  }
  return [...new Set(urls.map(grokImageKey).filter(Boolean))];
}

function rejectDuplicateGrokImage(ownerLabel, imageUrl, rejectImageKeys) {
  const key = grokImageKey(imageUrl);
  if (!key || !(rejectImageKeys || []).includes(key)) return;
  throw new Error(`${ownerLabel}: Grok devolvio un asset ya asignado (${key}); rechazo el duplicado y reintento con la pestana limpia`);
}

async function collectGrokPostWithReconnect(tabId, payload, postUrl) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const readyUntil = Date.now() + 15000;
    let exactReady = false;
    while (Date.now() < readyUntil) {
      try {
        const tab = await chrome.tabs.get(tabId);
        exactReady = tab?.url === postUrl && tab?.status === "complete";
      } catch (_e) { exactReady = false; }
      if (exactReady) break;
      await delay(300);
    }
    if (!exactReady) throw new Error(`el post descubierto no termino de cargar: ${postUrl}`);
    await delay(600 + attempt * 500);
    await ensureContentScript(tabId, "grok");
    try {
      return await sendActOrFail(tabId, ACT.COLLECT_IMAGE, {
        cfg: payload?.cfg,
        before: payload?.before || [],
        requirePost: true,
        timeoutMs: 45000,
      });
    } catch (e) {
      lastError = e;
      if (!isClosedImageChannelError(e) || attempt >= 2) throw e;
      log(LOG_LEVEL.WARN, `Grok: el /post correcto cerro el canal al montar; reconecto y recolecto el mismo post (${attempt + 2}/3), sin regenerar.`);
    }
  }
  throw lastError || new Error("no pude recolectar el post descubierto");
}

async function sendGrokGenerateImage(tabId, payload) {
  let before = [];
  try { before = (await sendActOrFail(tabId, ACT.IMAGE_KEYS, {}))?.keys || []; } catch (_e) {}
  before = [...new Set([...before, ...((payload?.rejectImageKeys || []).filter(Boolean))])];
  try {
    return await sendActOrFail(tabId, ACT.GENERATE_IMAGE, payload);
  } catch (e) {
    const closedChannel = isClosedImageChannelError(e);
    const noNewImage = isNoNewGrokImageError(e);
    const sendNotRegistered = isGrokSendNotRegisteredError(e);
    if (!closedChannel && !noNewImage && !sendNotRegistered) throw e;
    const reason = closedChannel ? "cerro el canal durante generate_image"
      : noNewImage ? "no reporto imagen nueva tras generar"
        : "no confirmo el envio; antes de recargar compruebo si arranco tarde";
    log(LOG_LEVEL.WARN, `Grok ${reason}; intento recuperar la imagen ya generada (${e?.message ?? e}).`);
    await delay(closedChannel ? 3000 : 1500);
    try {
      await ensureContentScript(tabId, "grok");
      const recovered = await sendActOrFail(tabId, ACT.COLLECT_IMAGE, {
        cfg: payload?.cfg,
        before,
        prompt: payload?.prompt || "",
        requirePost: false,
        timeoutMs: sendNotRegistered ? 45000 : 60000,
      });
      if (recovered?.imageUrl) {
        log(LOG_LEVEL.INFO, `Grok: imagen ya generada recuperada desde ${recovered.postUrl ? "/post" : "la grilla de 4 variantes"}; NO regenero.`);
        return recovered;
      }
    } catch (recoverErr) {
      log(LOG_LEVEL.WARN, `Grok: no pude recuperar imagen tras fallo de deteccion (${recoverErr?.message ?? recoverErr}).`);
    }
    // Segunda via: abrir la primera tarjeta nueva. Grok convierte el data: de la grilla en un post con
    // URL JPG directa (imagine-public.x.ai), equivalente al boton Descargar que verificamos en vivo.
    try {
      let postUrl = "";
      try { postUrl = (await chrome.tabs.get(tabId))?.url || ""; } catch (_e) {}
      if (!/\/imagine\/post\//.test(postUrl)) {
        try { await sendActOrFail(tabId, ACT.OPEN_IMAGE, { before, prompt: payload?.prompt || "" }); } catch (_e) { /* navegar cierra el canal */ }
        const t0 = Date.now();
        while (Date.now() - t0 < 12000) {
          try { postUrl = (await chrome.tabs.get(tabId))?.url || ""; } catch (_e) {}
          if (/\/imagine\/post\//.test(postUrl)) break;
          await delay(300);
        }
      }
      if (/\/imagine\/post\//.test(postUrl)) {
        // Persistir ANTES de consultar el DOM: navegar a /post invalida el content script y fue la causa
        // de scene_15 (imagen visible/pagada pero post perdido al cerrarse collect_image).
        await persistDiscoveredGrokPost(payload?.grokAttempt, tabId, postUrl);
        const opened = await collectGrokPostWithReconnect(tabId, {
          cfg: payload?.cfg,
          before,
        }, postUrl);
        if (opened?.imageUrl) {
          log(LOG_LEVEL.INFO, "Grok: adopte la primera variante abriendo su post descargable; NO regenero.");
          return opened;
        }
      }
    } catch (openErr) {
      log(LOG_LEVEL.WARN, `Grok: tampoco pude adoptar la primera variante desde su post (${openErr?.message ?? openErr}).`);
    }
    // El bloque EXACTO del prompt existe pero quedo vacio: no hay una imagen actual que duplicar. Este
    // caso puede ir a la segunda pasada automatica DESPUES de terminar las escenas independientes.
    if (/GROK_PROMPT_GROUP_EMPTY/i.test(e?.message ?? String(e))) {
      const emptyResult = new Error(e?.message ?? String(e));
      emptyResult.confirmedNoUsableOutput = true;
      throw emptyResult;
    }
    // Si Enter pudo registrarse, la ausencia de senal sigue siendo AMBIGUA aun despues de los probes.
    // Nunca devolver el error original al wrapper (lo interpretaba como permiso para recargar+Enter).
    if (sendNotRegistered) {
      const guardedSubmit = new Error(`${e?.message ?? e}. El envio pudo haberse aceptado; no recargo ni envio Enter otra vez. Pausa y revisa Grok.`);
      guardedSubmit.noAutoRetry = true;
      throw guardedSubmit;
    }
    const guarded = new Error(`${e?.message ?? e}. Grok pudo haber generado la imagen; no la reenvio automaticamente para evitar duplicarla.`);
    guarded.noAutoRetry = true;
    throw guarded;
  }
}

async function clearGrokRefsOrFail(tabId, label) {
  // Limpiar las referencias de la escena PREVIA antes de subir las nuevas. Verificar que quedaron 0 chips
  // para que nunca se mezclen con las referencias de la escena actual; reintentar 1 vez.
  let cleared = false;
  for (let k = 0; k < 2 && !cleared; k++) {
    try {
      const r = await sendActOrFail(tabId, ACT.CLEAR_REFS, {});
      cleared = (r?.data?.left ?? r?.left ?? 0) === 0;
    } catch (_e) { cleared = false; }
    if (!cleared) await new Promise((res) => setTimeout(res, 300));
  }
  if (!cleared) throw new Error(`${label}: Grok conserva referencias previas; recarga y reintenta para no mezclar escenas`);
}

async function prepareGrokImageAttempt(tabId, refPaths, label) {
  await ensureGrokCompositor(tabId);
  await ensureContentScript(tabId, "grok");
  await ensureDebugger(tabId);
  // Grok julio-2026 elimina adjuntos al cambiar Video -> Imagen. Seleccionar y confirmar Imagen ANTES
  // de limpiar/subir; generateImage vuelve a comprobarlo sin cambiar el modo si ya esta activo.
  await sendActOrFail(tabId, ACT.PREPARE_IMAGE, {});
  await clearGrokRefsOrFail(tabId, label);
  if (refPaths?.length) {
    try {
      await cdpSetFileInput(tabId, refPaths);
      const attached = await sendActOrFail(tabId, ACT.WAIT_FOR_REFS, {
        expected: refPaths.length,
        timeoutMs: 30000,
      });
      log(LOG_LEVEL.INFO, `${label}: ${refPaths.length} referencia(s) procesadas y confirmadas en Grok (${attached?.confirmedCount || attached?.count || refPaths.length} chips).`);
    } catch (e) {
      // Antes: WARN + "genero sin ellas" -> imagen SIN personaje/escenario que terminaba DONE como si
      // nada (perdida de continuidad indetectable). Fallar el intento: el reintento recarga y re-sube.
      throw new Error(`no pude subir referencias a Grok (${e?.message ?? e})`);
    }
  }
}

async function sendGrokGenerateImageWithUiRetry(tabId, payload, options = {}) {
  const refPaths = options.refPaths || [];
  const label = options.label || "Grok";
  const maxUiRetries = Math.max(0, Number(options.maxUiRetries ?? 2) || 0);
  for (let attempt = 0; attempt <= maxUiRetries; attempt++) {
    await prepareGrokImageAttempt(tabId, refPaths, label);
    try {
      return await sendGrokGenerateImage(tabId, payload);
    } catch (e) {
      if (e?.noAutoRetry) throw e;
      const safeComposerFailure = isGrokSafeComposerError(e);
      if (!safeComposerFailure || attempt >= maxUiRetries) throw e;
      log(LOG_LEVEL.WARN, `${label}: agotados los reintentos locales de foco/escritura; recargo /imagine y reintento seguro (${attempt + 2}/${maxUiRetries + 1}).`);
      try { await hardReloadGrok(tabId); }
      catch (reloadErr) {
        log(LOG_LEVEL.WARN, `${label}: recarga Grok fallo (${reloadErr?.message ?? reloadErr}); intento volver al composer.`);
        await ensureGrokCompositor(tabId);
      }
      await delay(1200);
    }
  }
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

function flowProjectIdFromUrl(url) {
  return String(url || "").match(/\/flow\/project\/([0-9a-f-]{6,})/i)?.[1] || null;
}

function canonicalFlowProjectUrl(url) {
  try {
    const u = new URL(String(url || ""));
    const id = flowProjectIdFromUrl(u.href);
    if (!id) return "";
    const prefix = u.pathname.match(new RegExp(`^(.*\\/flow\\/project\\/${id})`, "i"))?.[1];
    if (!prefix) return "";
    u.pathname = prefix;
    u.search = "";
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch (_e) { return ""; }
}

function flowSeriesKey() {
  return String(state?.project?.comparisonSeriesId || state?.project?.seriesId || "").trim() || null;
}

// Busca la pestana del PROVEEDOR activo. Para Flow, una asociacion serie -> projectId persistida manda
// sobre el foco y sobre el ancla volatil, de modo que reiniciar Chrome/SW o abrir dos proyectos no mueve P2.
async function findFlowTab(provider, options = {}) {
  const isGrok = (provider || state.config.provider) === "grok";
  const key = isGrok ? "grok" : "flow";
  const pattern = isGrok ? "https://grok.com/*" : "https://labs.google/*";
  try {
    const tabs = await chrome.tabs.query({ url: pattern });
    const seriesKey = !isGrok ? flowSeriesKey() : null;
    const expected = state.project?.flowProjectId
      ? { projectId: state.project.flowProjectId, projectUrl: state.project.flowProjectUrl }
      : (seriesKey ? state.flowProjects?.[seriesKey] : null);
    const expectedId = expected?.projectId || null;
    let chosen = chooseProviderTab(tabs, key, providerTabIds[key], expectedId);
    if (!isGrok && expectedId && flowProjectIdFromUrl(chosen?.url) !== expectedId && !options.allowUnassociated) {
      return null;
    }
    if (!isGrok && expected?.projectUrl && flowProjectIdFromUrl(chosen?.url) === expectedId
        && chosen.url !== expected.projectUrl) {
      await navigateTab(chosen.id, expected.projectUrl);
      chosen = await chrome.tabs.get(chosen.id);
      if (flowProjectIdFromUrl(chosen.url) !== expectedId
          || canonicalFlowProjectUrl(chosen.url) !== expected.projectUrl) return null;
    }
    providerTabIds[key] = chosen?.id ?? null;
    return chosen;
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
  if (/^https:\/\/grok\.com\/imagine\/?($|\?)/.test(tab?.url || "")) {
    // La URL no basta: una pestana CRASHEADA ("Aw, Snap") conserva su ultima URL y el short-circuit la
    // daba por buena; todo lo demas fallaba con errores genericos. Ping real al renderer antes de confiar.
    try { await chrome.scripting.executeScript({ target: { tabId }, func: () => true }); return; }
    catch (_e) { log(LOG_LEVEL.WARN, "Grok: la pestana no responde (¿crasheada?); la re-navego."); }
  }
  await new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url: "https://grok.com/imagine" }, () => {
      const e = chrome.runtime.lastError; if (e) return reject(new Error(e.message)); resolve();
    });
  });
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 20000) {
    let t = null; try { t = await chrome.tabs.get(tabId); } catch (_e) {}
    if (t && t.status === "complete" && /grok\.com\/imagine/.test(t.url || "")) { ready = true; break; }
    await delay(300);
  }
  if (!ready) throw new Error("Grok no termino de cargar el compositor en 20s");
  await delay(1200); // hidratacion React del composer
}

// Anti-cuelgue: recarga la pestana de Grok DESDE CERO cada N imagenes. Tras muchas generaciones el heap del
// renderer acumula data: urls de los resultados (cada una cientos de KB) y la pagina se pone lenta/se cuelga.
// Navega a /imagine (documento nuevo = heap limpio) y luego fuerza un reload con bypass de cache (assets
// frescos). El debugger se auto-detacha al navegar (onDetach limpia attachedTabs) y el caller reinyecta
// content script + debugger despues. NO se llama en el poll loop de animacion (alli congela, ver
// memoria flow-tab-freeze): solo entre generaciones de imagen, que es donde se acumulan.
async function hardReloadGrok(tabId) {
  const waitComplete = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      let t = null; try { t = await chrome.tabs.get(tabId); } catch (_e) {}
      if (t && t.status === "complete" && /grok\.com\/imagine/.test(t.url || "")) return true;
      await delay(300);
    }
    return false;
  };
  await new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url: "https://grok.com/imagine" }, () => {
      const e = chrome.runtime.lastError; if (e) return reject(new Error(e.message)); resolve();
    });
  });
  if (!(await waitComplete(25000))) throw new Error("Grok no termino la navegacion limpia en 25s");
  await new Promise((resolve) => chrome.tabs.reload(tabId, { bypassCache: true }, () => { void chrome.runtime.lastError; resolve(); }));
  if (!(await waitComplete(25000))) throw new Error("Grok no termino la recarga sin cache en 25s");
  await delay(1500); // hidratacion React del composer
}

// Flow tambien acumula previews, uploads y data: URLs en corridas largas. Una recarga del MISMO
// proyecto libera el heap del renderer sin perder tiles ni volver a generar nada. Solo se llama entre
// generaciones; nunca durante un submit/descarga. El siguiente GENERATE_IMAGE vuelve a comprobar
// Nano Banana Pro, 9:16 y modo Agente apagado antes de pulsar Crear.
async function hardReloadFlow(tabId) {
  detachDebugger(tabId);
  await delay(120);
  await new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, { bypassCache: true }, () => {
      const e = chrome.runtime.lastError;
      if (e) return reject(new Error(e.message));
      resolve();
    });
  });
  const t0 = Date.now();
  let ready = false;
  while (Date.now() - t0 < 25000) {
    let tab = null;
    try { tab = await chrome.tabs.get(tabId); } catch (_e) {}
    if (tab && tab.status === "complete" && /labs\.google\/fx\/.+\/flow\/project\//i.test(tab.url || "")) {
      ready = true;
      break;
    }
    await delay(300);
  }
  if (!ready) throw new Error("Flow no termino de recargar el proyecto en 25s");
  await delay(1800); // hidratacion de la grilla y del composer
  await ensureContentScript(tabId, "flow");
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
async function trustedClick(tabId, x, y, { releaseAfterClick = false } = {}) {
  if (tabId == null) throw new Error("trusted_click sin tabId");
  await ensureDebugger(tabId);
  try {
    await debuggerSend(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await debuggerSend(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    await debuggerSend(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  } finally {
    // Grok solo necesita CDP para que el click sea trusted. Retener la sesion durante los 20-360s de
    // generacion hacia que la pestana y otras ventanas se sintieran lentas y podia ocupar el limite CDP.
    if (releaseAfterClick) detachDebugger(tabId);
  }
}

async function trustedKeyboard(tabId, { text = null, key = null, replace = false, releaseAfterKey = false, textMode = "keys", chunkChars = 480, chunkThresholdChars = 3000 } = {}) {
  if (tabId == null) throw new Error("trusted_keyboard sin tabId");
  await ensureDebugger(tabId);
  const press = async ({ key: k, code, text: typed, modifiers = 0, windowsVirtualKeyCode }) => {
    const base = { key: k, code: code || "", modifiers, windowsVirtualKeyCode: windowsVirtualKeyCode || 0 };
    await debuggerSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown", ...base,
      ...(typed != null ? { text: typed, unmodifiedText: typed } : {}),
    });
    await debuggerSend(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
  };
  try {
    if (replace) {
      // Ctrl+A + Backspace con eventos de teclado reales: limpia el valor de Slate, no solo su DOM.
      await debuggerSend(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Control", code: "ControlLeft", modifiers: 2, windowsVirtualKeyCode: 17 });
      await press({ key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
      await debuggerSend(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Control", code: "ControlLeft", modifiers: 0, windowsVirtualKeyCode: 17 });
      await press({ key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    }
    if (text != null) {
      const normalizedText = String(text).replace(/\r?\n/g, " ");
      if (textMode === "insertText") {
        // Grok usa Tiptap/ProseMirror. Un payload CDP grande puede quedar escrito parcialmente aunque
        // el protocolo responda OK. Enviamos el texto COMPLETO en bloques pequenos, en el mismo foco,
        // y el content script verifica despues igualdad exacta antes de autorizar Enter.
        // Flow/Slate no pide este modo y conserva keyDown por caracter.
        const threshold = Math.max(1, Math.floor(Number(chunkThresholdChars) || 3000));
        const chunks = Array.from(normalizedText).length > threshold
          ? chunkTextForTrustedInput(normalizedText, chunkChars)
          : [normalizedText];
        for (let i = 0; i < chunks.length; i++) {
          await debuggerSend(tabId, "Input.insertText", { text: chunks[i] });
          if (i + 1 < chunks.length) await delay(35);
        }
      } else {
        for (const ch of normalizedText) {
          if (ch === " ") await press({ key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 });
          else await press({ key: ch, text: ch });
        }
      }
    }
    if (key) {
      const upper = String(key).toUpperCase();
      if (upper === "ENTER") await press({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      else if (upper === "BACKSPACE") await press({ key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      else await press({ key: String(key), text: String(key) });
    }
  } finally {
    if (releaseAfterKey) detachDebugger(tabId);
  }
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
chrome.tabs?.onRemoved?.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (providerTabIds.grok === tabId) providerTabIds.grok = null;
  if (providerTabIds.flow === tabId) providerTabIds.flow = null;
});

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

// Corre UNA fase de la cola hasta que termina (await). Devuelve false si hubo parada dura o si quedo
// una imagen requerida sin resolver. La barrera impide pasar a animacion/audio con referencias rotas.
async function runPhaseToEnd(phase) {
  await ensureState();
  if (phase === "images" && !(await ensureFlowReferenceLibraryBeforeSceneLoop("autopiloto de imagenes"))) return false;
  if (phase !== "images") {
    const unresolved = unresolvedImageScenes(state.scenes);
    if (unresolved.length) {
      state.queue.running = false;
      state.queue.paused = true;
      state.queue.errorSceneId = unresolved[0]?.id || null;
      await saveState();
      log(LOG_LEVEL.ERROR, `No inicio ${phase}: faltan ${unresolved.length} imagen(es) (${unresolved.slice(0, 8).map((s) => s.id).join(", ")}).`);
      emitState(); emitProgress();
      return false;
    }
  }
  // image-only (historias): no hay paso de animacion; los stills SON el asset final. Saltar la fase la
  // invoque quien la invoque (autopiloto, fallback del paralelo, reanudacion). Gateado -> otros presets intactos.
  if (phase === "animation") {
    const hasAnimated = state.scenes.some((s) => s.renderMode === "animated");
    if (state.project?.imageOnly && !hasAnimated) {
      log(LOG_LEVEL.INFO, "Fase de animacion omitida (preset image-only / historias).");
      return true;
    }
    // HIBRIDO criptoclaro_reel: las escenas estaticas (su still es el asset final) pasan a DONE para que el
    // bucle SOLO anime las "animated" -> sin gasto de video ni ritmo perdido en no-ops.
    if (state.project?.perSceneRender) {
      for (const s of state.scenes) {
        if (s.renderMode !== "animated" && s.status === SCENE_STATUS.IMAGE_DONE) {
          s.status = SCENE_STATUS.DONE; s.error = null;
          if (state.project?.preset === "manhwa") log(LOG_LEVEL.INFO, `${s.id}: manhwa static -> sin job de animacion.`);
        }
      }
      await saveState(); emitState();
    }
  }
  state.queue.phase = phase;
  // No resucitar ERROR aqui: el orquestador ya administra una unica segunda pasada automatica por
  // escena. Otra ejecucion silenciosa podria duplicar una generacion ambigua de Grok. Los botones
  // explicitos Reintentar/Regen img si reinician esa autorizacion.
  state.queue.paused = false;
  state.queue.running = true;
  await saveState();
  emitState();
  await orchestrator.runQueue();  // vuelve cuando la fase termina o se pausa (parada dura)
  await ensureState();
  const unresolved = phase === "images"
    ? unresolvedImageScenes(state.scenes)
    : phase === "animation"
      ? unresolvedAnimationScenes(state.scenes, state.project)
      : [];
  if (unresolved.length && !state.queue.paused) {
    state.queue.running = false;
    state.queue.paused = true;
    state.queue.errorSceneId = unresolved[0]?.id || null;
    await saveState(); emitState(); emitProgress();
    log(LOG_LEVEL.ERROR, phase === "images"
      ? `Barrera de imagenes: ${unresolved.length} escena(s) siguen incompletas; no avanzo de fase.`
      : `Barrera de animacion: faltan ${unresolved.length} clip(s) (${unresolved.slice(0, 8).map((s) => s.id).join(", ")}). Conservo el trabajo y NO tomo el siguiente JSON.`);
  }
  return !state.queue.paused && unresolved.length === 0;
}

// El viejo pipeline iniciaba animaciones mientras aun habia imagenes en vuelo. Eso viola la barrera de
// dependencias: si una imagen base falla, sus consumidoras y la fase pagada de animacion no deben arrancar.
// Conservamos el flag/API por compatibilidad, pero ahora ejecuta las dos fases con barrera secuencial.
async function runPhasesParallel() {
  await ensureState();
  const imgProv = state.project?.imageProvider || state.config.provider;
  const animProv = state.project?.animationProvider || state.config.provider;
  state.queue.mode = null;
  log(LOG_LEVEL.INFO, `Pipeline con barrera segura: termino todas las imagenes en ${imgProv} antes de animar en ${animProv}.`);
  return (await runPhaseToEnd("images")) && (await runPhaseToEnd("animation"));
}

async function rememberFlowProject(tabId, explicitUrl = "") {
  let url = explicitUrl;
  if (!url) { try { url = (await chrome.tabs.get(tabId))?.url || ""; } catch (_e) {} }
  const projectId = flowProjectIdFromUrl(url);
  if (!projectId) return null;
  const projectUrl = canonicalFlowProjectUrl(url);
  if (!projectUrl) return null;
  const seriesKey = flowSeriesKey();
  if (seriesKey) {
    const previous = state.flowProjects?.[seriesKey] || {};
    state.flowProjects = { ...(state.flowProjects || {}), [seriesKey]: {
      ...previous, projectId, projectUrl,
      characters: previous.projectId === projectId ? (previous.characters || {}) : {},
      referenceLibrarySignature: previous.projectId === projectId ? (previous.referenceLibrarySignature || "") : "",
      referenceLibraryCount: previous.projectId === projectId ? (previous.referenceLibraryCount || 0) : 0,
      updatedAt: Date.now(),
    } };
  }
  if (state.project.flowProjectId && state.project.flowProjectId !== projectId) state.project.flowCharacters = {};
  state.project.flowProjectId = projectId;
  state.project.flowProjectUrl = projectUrl;
  await saveState();
  return seriesKey ? state.flowProjects[seriesKey] : { projectId, projectUrl };
}

function flowCharacterRecord(name) {
  const seriesKey = flowSeriesKey();
  return seriesKey ? state.flowProjects?.[seriesKey]?.characters?.[name]
    : state.project?.flowCharacters?.[name];
}

function applyFlowCharacterAlias(characterId, configuredName, effectiveName) {
  if (state.project?.characters?.[characterId]) {
    state.project.characters[characterId].flowConfiguredName = configuredName;
    state.project.characters[characterId].display_name = effectiveName;
  }
  for (const scene of (state.scenes || [])) {
    for (let i = 0; i < (scene.characterRefIds || []).length; i++) {
      if (scene.characterRefIds[i] === characterId) scene.characterRefs[i] = effectiveName;
    }
  }
}

async function rememberFlowCharacter(configuredName, effectiveName, fileInfo) {
  const seriesKey = flowSeriesKey();
  const project = seriesKey ? state.flowProjects?.[seriesKey] : state.project;
  if (!project || !configuredName || !effectiveName || !fileInfo) return;
  const field = seriesKey ? "characters" : "flowCharacters";
  project[field] = { ...(project[field] || {}), [configuredName]: {
    alias: effectiveName, verified: true,
    sha256: fileInfo.sha256 || "", size: fileInfo.size || 0, mtimeMs: fileInfo.mtimeMs || 0,
    abspath: fileInfo.abspath || "", updatedAt: Date.now(),
  } };
  await saveState();
}

// Prepara Flow: proyecto nuevo + personajes del proyecto. La asociacion serie -> proyecto persiste
// fuera del JSON cargado, por lo que P2 vuelve al mismo proyecto incluso tras reiniciar el worker.
async function ensureFlowReady() {
  const seriesKey = flowSeriesKey();
  const associated = state.project?.flowProjectId
    ? { projectId: state.project.flowProjectId, projectUrl: state.project.flowProjectUrl }
    : (seriesKey ? state.flowProjects?.[seriesKey] : null);
  const mustCreateFreshProject = !!state.project?.forceNewFlowProject && !associated?.projectId;
  let tab = await findFlowTab("flow", { allowUnassociated: true });
  if (!tab && associated?.projectUrl) {
    log(LOG_LEVEL.WARN, `Flow: la pestana del proyecto asociado no estaba abierta; la reabro automaticamente (${associated.projectId}).`);
    // Slate/React ignora Input.dispatchKeyEvent si la pagina se monto completamente en segundo plano.
    // Abrimos activa una sola vez al recuperar el proyecto y esperamos la hidratacion de la UI.
    tab = await chrome.tabs.create({ url: associated.projectUrl, active: true });
    providerTabIds.flow = tab?.id ?? null;
    if (tab?.id != null) {
      await navigateTab(tab.id, associated.projectUrl);
      tab = await chrome.tabs.get(tab.id);
      await chrome.tabs.update(tab.id, { active: true });
      await delay(2200);
    }
  }
  if (!tab) throw new Error("abre Flow (labs.google) en una pestana y reintenta");

  let freshProject = false;
  // MODO REUSE: conserva el proyecto ABIERTO, pero ahora SI sincroniza los personajes que falten.
  // Verificado en vivo 2026-07-12: Flow mantiene cada personaje en /character/<id> y luego permite
  // recuperarlo por nombre desde el selector "+". DOM.setFileInputFiles alimenta el input oculto.
  if (!mustCreateFreshProject && (state.config.flowReuseProject || state.project?.flowProjectId || associated?.projectId)) {
    const currentId = flowProjectIdFromUrl(tab.url);
    const currentBase = canonicalFlowProjectUrl(tab.url);
    if (associated?.projectUrl && (currentId !== associated.projectId || currentBase !== associated.projectUrl || tab.url !== currentBase)) {
      log(LOG_LEVEL.INFO, `Flow: vuelvo al proyecto asociado a la serie "${seriesKey}" (${associated.projectId}).`);
      await navigateTab(tab.id, associated.projectUrl);
      tab = await chrome.tabs.get(tab.id);
      if (flowProjectIdFromUrl(tab.url) !== associated.projectId
          || canonicalFlowProjectUrl(tab.url) !== associated.projectUrl) {
        throw new Error(`Flow redirigio a otro proyecto; esperaba ${associated.projectId} y no cambio la asociacion`);
      }
    }
    if (!flowProjectIdFromUrl(tab.url)) {
      throw new Error("Flow reuse requiere una pestana /project/<id>; abre el proyecto de la serie o desactiva flowReuseProject");
    }
    const baseUrl = canonicalFlowProjectUrl(tab.url);
    if (baseUrl && tab.url !== baseUrl) {
      await navigateTab(tab.id, baseUrl);
      tab = await chrome.tabs.get(tab.id);
    }
    if (state.project?.comparisonVariant === "flow_images_only") {
      await chrome.tabs.update(tab.id, { active: true });
      await delay(900);
    }
    await ensureContentScript(tab.id);
    await rememberFlowProject(tab.id, tab.url || "");
    log(LOG_LEVEL.INFO, "AUTOPILOTO: usando el proyecto Flow ABIERTO; sincronizo personajes faltantes en su memoria.");
  } else {
    // Proyecto NUEVO: navegamos a la home de Flow y clic "Nuevo proyecto" -> /project/<id>.
    try {
      await navigateTab(tab.id, state.config.flowUrl || DEFAULT_CONFIG.flowUrl);
      await ensureContentScript(tab.id);
      const created = await sendActOrFail(tab.id, ACT.NEW_PROJECT, { title: state.project?.title || "Auto" });
      tab = await chrome.tabs.get(tab.id);
      await rememberFlowProject(tab.id, created?.url || tab.url || "");
      freshProject = true;
      log(LOG_LEVEL.INFO, "Proyecto nuevo creado en Flow.");
    } catch (e) {
      if (mustCreateFreshProject) {
        throw new Error(`Flow no pudo crear el proyecto nuevo exigido por el JSON (${e?.message ?? e}); no usare el proyecto anterior`);
      }
      log(LOG_LEVEL.WARN, `Proyecto nuevo no disponible (${e?.message ?? e}). Uso el proyecto Flow abierto.`);
      await ensureContentScript(tab.id);
      try { tab = await chrome.tabs.get(tab.id); await rememberFlowProject(tab.id, tab.url || ""); } catch (_e) {}
    }
  }

  // En la comparativa las poses se convierten en Characters DESPUES de precargar/renombrar todos
  // los medios. La UI actual de Flow crea el Character desde "Añadir desde el proyecto".
  if (state.project?.comparisonVariant === "flow_images_only") {
    log(LOG_LEVEL.INFO, "Flow A/B: proyecto listo; primero precargare medios y despues creare Characters desde esa biblioteca.");
    return;
  }

  // Personajes del proyecto: crear cada uno subiendo su png via CDP. En proyecto NUEVO no hace
  // falta checar si existe (esta vacio); en modo degradado (proyecto abierto) si checamos.
  const chars = state.project?.characters || {};
  for (const [id, c] of Object.entries(chars)) {
    const configuredName = (c && (c.flowConfiguredName || c.display_name)) || id;
    try {
      const rel = (c && c.reference_asset) || `assets/characters/${id}_ref.png`;
      const fileInfo = await resolveCharFileInfo(rel);
      const remembered = flowCharacterRecord(configuredName);
      const sameRecipe = remembered?.verified && remembered?.sha256 && fileInfo.sha256
        && remembered.sha256 === fileInfo.sha256;
      let effectiveName = sameRecipe ? (remembered.alias || configuredName) : configuredName;
      let exists = false;
      if (!freshProject && sameRecipe) {
        exists = !!(await sendActOrFail(tab.id, ACT.HAS_CHARACTER, { name: effectiveName }))?.exists;
      } else if (!freshProject) {
        const originalExists = !!(await sendActOrFail(tab.id, ACT.HAS_CHARACTER, { name: configuredName }))?.exists;
        if (originalExists) {
          const suffix = (fileInfo.sha256 || `${fileInfo.size || 0}${fileInfo.mtimeMs || 0}`).slice(0, 8);
          effectiveName = `${configuredName}__${suffix}`;
          exists = !!(await sendActOrFail(tab.id, ACT.HAS_CHARACTER, { name: effectiveName }))?.exists;
          log(LOG_LEVEL.WARN, `Personaje "${configuredName}" no tenia identidad verificable; uso alias estable "${effectiveName}" para no adjuntar un retrato homonimo.`);
        }
      }
      if (!exists) {
        const created = await createCharacterInFlow(tab.id, id, c, effectiveName, fileInfo);
        Object.assign(fileInfo, created || {});
        log(LOG_LEVEL.INFO, `Personaje "${effectiveName}" creado en Flow.`);
      } else log(LOG_LEVEL.INFO, `Personaje "${effectiveName}" ya existe y coincide con la identidad recordada.`);
      applyFlowCharacterAlias(id, configuredName, effectiveName);
      await rememberFlowCharacter(configuredName, effectiveName, fileInfo);
    } catch (e) {
      throw new Error(`Personaje "${configuredName}" no quedo listo en Flow: ${e?.message ?? e}`);
    }
  }
}

async function ensureProviderReady(provider) {
  if (provider === "grok") {
    const tab = await findFlowTab("grok");
    if (!tab) throw new Error("abre Grok (grok.com/imagine) en una pestana y reintenta");
    await ensureGrokCompositor(tab.id);
    await ensureContentScript(tab.id, "grok");
    log(LOG_LEVEL.INFO, "AUTOPILOTO: Grok listo.");
    return;
  }
  await ensureFlowReady();
}

// Sube la imagen del personaje a Flow (CDP) y crea el Personaje con su nombre.
async function createCharacterInFlow(tabId, id, c, name, resolvedInfo = null) {
  const rel = (c && c.reference_asset) || `assets/characters/${id}_ref.png`;
  const info = resolvedInfo || await resolveCharFileInfo(rel);
  const absPath = info.abspath;
  await sendActOrFail(tabId, ACT.REVEAL_UPLOAD_INPUT, {});
  await cdpSetFileInput(tabId, absPath, 'input[type="file"][accept="image/*"]');
  await sendActOrFail(tabId, ACT.CREATE_CHARACTER, { name });
  return info;
  const base = (state.config.charFileUrl || DEFAULT_CONFIG.charFileUrl);
  const fileRes = await fetch(`${base}?path=${encodeURIComponent(rel)}`).then((r) => r.json()).catch(() => null);
  if (!fileRes?.ok) throw new Error(`no encuentro ${rel} (¿corre el dev-server y existe el png?)`);
  await sendActOrFail(tabId, ACT.REVEAL_UPLOAD_INPUT, {});   // el driver abre el dialogo y deja el input listo
  await cdpSetFileInput(tabId, fileRes.abspath);              // CDP: setea el archivo local en el input[type=file]
  await sendActOrFail(tabId, ACT.CREATE_CHARACTER, { name }); // el driver termina de crear el Personaje
}

// Tras PRELOAD_REFERENCES, convierte cada pose usada por las escenas en un Character persistente.
// Exclusivo de la comparativa Flow: el Grok path no llama esta funcion y el flujo Flow legacy conserva
// createCharacterInFlow. La UI actual reutiliza el medio ya nombrado, sin picker nativo ni otro upload.
async function ensureFlowComparisonCharacters(tabId) {
  if (state.project?.comparisonVariant !== "flow_images_only") return 0;
  const posesByAsset = new Map();
  for (const scene of (state.scenes || [])) {
    for (const asset of (scene.characterReferenceAssets || [])) {
      if (!asset) continue;
      const key = String(asset).replace(/\\/g, "/").toLowerCase();
      const name = state.project?.flowReferenceNames?.[key] || "";
      if (name && !posesByAsset.has(key)) posesByAsset.set(key, { asset, name });
    }
  }
  log(LOG_LEVEL.INFO, `Flow A/B: convirtiendo ${posesByAsset.size} pose(s) nombradas en Characters persistentes...`);
  for (const { asset, name } of posesByAsset.values()) {
    try {
      const absPath = await resolveCharFileFlexible(asset);
      const fileInfo = await getLocalFileStatus(absPath);
      fileInfo.abspath = absPath;
      const remembered = flowCharacterRecord(name);
      const sameRecipe = remembered?.verified && remembered?.sha256 && fileInfo.sha256
        && remembered.sha256 === fileInfo.sha256;
      let effectiveName = sameRecipe ? (remembered.alias || name) : name;
      let exists = sameRecipe
        ? !!(await sendActOrFail(tabId, ACT.HAS_CHARACTER, { name: effectiveName }))?.exists
        : false;
      if (!sameRecipe) {
        const homonym = !!(await sendActOrFail(tabId, ACT.HAS_CHARACTER, { name }))?.exists;
        if (homonym) {
          effectiveName = `${name}__${(fileInfo.sha256 || `${fileInfo.size || 0}${fileInfo.mtimeMs || 0}`).slice(0, 8)}`;
          exists = !!(await sendActOrFail(tabId, ACT.HAS_CHARACTER, { name: effectiveName }))?.exists;
        }
      }
      if (!exists) {
        await sendActOrFail(tabId, ACT.CREATE_CHARACTER_FROM_MEDIA, { name: effectiveName, mediaName: name });
        log(LOG_LEVEL.INFO, `Pose "${effectiveName}" creada desde el medio "${name}" y verificada como Character.`);
      } else {
        log(LOG_LEVEL.INFO, `Pose "${effectiveName}" ya existe y coincide con el archivo local.`);
      }
      await rememberFlowCharacter(name, effectiveName, fileInfo);
    } catch (e) {
      throw new Error(`Pose Flow "${name}" no quedo lista: ${e?.message ?? e}`);
    }
  }
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const baseUrl = canonicalFlowProjectUrl(tab?.url || state.project?.flowProjectUrl || "");
  if (baseUrl) {
    await navigateTab(tabId, baseUrl);
    await delay(1200);
    await ensureContentScript(tabId, "flow");
  }
  log(LOG_LEVEL.INFO, `Flow A/B: ${posesByAsset.size}/${posesByAsset.size} poses listas como Characters; escenarios y props quedan como medios nombrados.`);
  return posesByAsset.size;
}

// Pone archivos LOCALES en el input elegido de la pagina via CDP. El selector explicito evita
// confundir el input de personaje con el multimedia general de Flow.
async function cdpSetFileInput(tabId, absPath, selector = 'input[type="file"]') {
  await ensureDebugger(tabId);
  await debuggerSend(tabId, "DOM.enable", {});
  const { root } = await debuggerSend(tabId, "DOM.getDocument", { depth: -1 });
  const { nodeId } = await debuggerSend(tabId, "DOM.querySelector", { nodeId: root.nodeId, selector });
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
    // SIEMPRE pegar el prompt (decision del usuario). Fijo en false para que NINGUN reset de estado (clear,
    // makeInitialState, 2a iteracion) reviva el tipeo lento: el default de config.humanTyping es true y antes
    // se colaba como `!== false` -> true -> tipeo. Esto lo hace inmune.
    humanTyping: false,
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
async function ensureIngredientsBeforeSceneLoop(reason = "arrancar escenas") {
  await ensureState();
  if (!state.project?.ingredients?.length) return ensureFlowReferenceLibraryBeforeSceneLoop(reason);
  const ok = await runIngredientsPhase().catch((e) => {
    log(LOG_LEVEL.ERROR, `Ingredientes antes de ${reason}: ${e?.message ?? e}`);
    return false;
  });
  if (!ok) {
    await ensureState();
    const ingredientFailed = (state.project?.ingredients || []).some((g) => g.status === SCENE_STATUS.ERROR);
    if (state.queue?.paused && !ingredientFailed) {
      // Una pausa solicitada mientras Grok termina el item actual es una salida normal. Antes se pintaba
      // como ERROR y el panel parecia averiado aunque el asset en vuelo se hubiera guardado bien.
      log(LOG_LEVEL.INFO, `Escenas en espera: fase de ingredientes pausada (${reason}).`);
    } else {
      log(LOG_LEVEL.ERROR, `No arranco escenas: ingredientes incompletos (${reason}).`);
    }
    emitState();
    return false;
  }
  return ensureFlowReferenceLibraryBeforeSceneLoop(reason);
}

// Flow conserva una biblioteca por proyecto. Para sus corridas cargamos y nombramos todos los
// ingredientes de disco ANTES de la primera escena. Grok queda fuera por el guard de proveedor.
async function ensureFlowReferenceLibraryBeforeSceneLoop(reason = "arrancar escenas") {
  await ensureState();
  const provider = state.project?.imageProvider || state.config.provider;
  if (provider !== "flow" || state.config.dryRun) return true;

  const itemsByPath = new Map();
  const addItem = (path, name) => {
    if (!path) return;
    const key = String(path).replace(/\\/g, "/").toLowerCase();
    if (!itemsByPath.has(key)) itemsByPath.set(key, { path, name: name || "" });
    else if (name && !itemsByPath.get(key).name) itemsByPath.get(key).name = name;
  };
  for (const ing of (state.project?.ingredients || [])) {
    if (ing.imageFilePath) addItem(ing.imageFilePath, ing.flowName || `Referencia — ${ing.id}`);
  }
  for (const scene of (state.scenes || [])) {
    for (const rel of (scene.referenceAssets || [])) {
      try {
        const path = await resolveCharFileFlexible(rel);
        const name = state.project?.flowReferenceNames?.[String(rel).replace(/\\/g, "/").toLowerCase()] || "";
        addItem(path, name);
      } catch (e) {
        log(LOG_LEVEL.WARN, `Biblioteca Flow: no resolvi "${rel}" (${e?.message ?? e}).`);
      }
    }
  }
  const items = [...itemsByPath.values()];
  if (!items.length) return true;

  const fingerprints = [];
  for (const item of items) {
    const info = await getLocalFileStatus(item.path);
    fingerprints.push(`${String(item.path).replace(/\\/g, "/").toLowerCase()}:${info.sha256 || `${info.size}:${info.mtimeMs}`}:${item.name}`);
  }
  const signature = fingerprints.join("|");
  const seriesKey = flowSeriesKey();
  const record = seriesKey ? state.flowProjects?.[seriesKey] : null;
  if (record?.projectId === state.project?.flowProjectId && record?.referenceLibrarySignature === signature) {
    log(LOG_LEVEL.INFO, `Biblioteca Flow: ${items.length} referencias ya estaban cargadas y nombradas; reutilizo el proyecto.`);
    return true;
  }

  try {
    const tab = await findFlowTab("flow");
    if (!tab) throw new Error("no encuentro la pestaña del proyecto Flow asociado");
    await ensureContentScript(tab.id, "flow");
    await ensureDebugger(tab.id);
    log(LOG_LEVEL.INFO, `Biblioteca Flow: precargando y nombrando ${items.length} ingredientes antes de ${reason}...`);
    const result = await sendActOrFail(tab.id, ACT.PRELOAD_REFERENCES, {
      localReferencePaths: items.map((item) => item.path),
      localReferenceNames: items.map((item) => item.name),
      model: state.project?.imageModel || "Nano Banana Pro",
    });
    if (result?.count !== items.length) throw new Error(`Flow confirmo ${result?.count ?? 0}/${items.length} referencias`);
    await ensureFlowComparisonCharacters(tab.id);
    if (seriesKey && state.flowProjects?.[seriesKey]) {
      state.flowProjects[seriesKey].referenceLibrarySignature = signature;
      state.flowProjects[seriesKey].referenceLibraryCount = items.length;
      state.flowProjects[seriesKey].referenceLibraryUpdatedAt = Date.now();
    }
    await saveState();
    log(LOG_LEVEL.INFO, `Biblioteca Flow lista: ${items.length}/${items.length} ingredientes subidos, renombrados y verificados.`);
    emitState();
    return true;
  } catch (e) {
    state.queue.running = false;
    state.queue.paused = true;
    await saveState();
    log(LOG_LEVEL.ERROR, `No inicio escenas: la biblioteca Flow no quedo completa (${e?.message ?? e}).`);
    emitState();
    return false;
  }
}

function ingredientAutoRetryProtected(ing) {
  return !!(ing?.noAutoRetry
    || ing?.grokImageAttempt?.noAutoRetry
    || (ing?.status === SCENE_STATUS.ERROR && ing?.grokImageAttempt?.submitIssued)
    || (ing?.status === SCENE_STATUS.ERROR && ing?.grokImageAttempt?.stage === "recovery_failed"));
}

async function hydrateExistingIngredientFiles(options = {}) {
  await ensureState();
  const ings = state.project?.ingredients || [];
  const forceIds = new Set(options.forceIds || []);
  if (!ings.length) return false;

  let changed = false;
  for (const ing of ings) {
    if (forceIds.has(ing.id)) {
      // `forceIds` solo viene de Reintentar ingrediente: es la autorizacion explicita para abandonar
      // el intento ambiguo anterior y permitir uno nuevo. Reanudar normal nunca entra en esta rama.
      if (ing.noAutoRetry || ing.grokImageAttempt) {
        ing.noAutoRetry = false;
        ing.grokImageAttempt = null;
        changed = true;
      }
      if (!ing.regeneratePending) { ing.regeneratePending = true; changed = true; }
      if (ing.imageFilePath || ing.imageUrl || ing.status || ing.error) {
        ing.imageFilePath = null;
        ing.imageUrl = null;
        ing.status = SCENE_STATUS.PENDING;
        ing.error = null;
        changed = true;
      }
      continue;
    }
    // Un restart pudo dejar una generacion ya enviada pero no recuperable. No ocultar ese ERROR
    // rehidratando el canonical viejo ni convertirlo indirectamente en candidato automatico.
    if (ingredientAutoRetryProtected(ing)) continue;
    // No revivir el canonical anterior durante una regeneracion pedida ni mientras una generacion esta
    // en vuelo. Si falla, ERROR + regeneratePending quedan visibles y el usuario puede reintentar.
    if (ing.regeneratePending || ing.status === SCENE_STATUS.GENERATING_IMAGE) continue;
    if (!ing.outputFile) continue;
    try {
      const imageFilePath = await resolveCharFileFlexible(ing.outputFile);
      if (ing.imageFilePath !== imageFilePath || ing.status !== SCENE_STATUS.DONE || ing.error) {
        ing.imageFilePath = imageFilePath;
        ing.status = SCENE_STATUS.DONE;
        ing.error = null;
        changed = true;
        log(LOG_LEVEL.INFO, `Ingrediente ${ing.id}: asset existente ${ing.outputFile} -> no se regenera.`);
      }
    } catch (_e) {
      if (ing.imageFilePath || ing.status === SCENE_STATUS.DONE) {
        ing.imageFilePath = null;
        if (!ing.imageUrl) ing.status = SCENE_STATUS.PENDING;
        changed = true;
      }
    }
  }
  if (changed) {
    await saveState();
    if (options.emit !== false) emitState();
  }
  return changed;
}

async function runIngredientsPhase(options = {}) {
  if (ingredientsRunning) {
    log(LOG_LEVEL.WARN, "Ingredientes: ya hay una fase activa; ignoro la reentrada.");
    return false;
  }
  ingredientsRunning = true;
  try {
  await ensureState();
  const ings = state.project?.ingredients || [];
  if (!ings.length) return true;                       // sin ingredientes -> no-op
  const provider = state.project?.imageProvider || state.config.provider;
  const forceIds = new Set(options.forceIds || []);

  if (state.config.dryRun) {
    for (const ing of ings) log(LOG_LEVEL.INFO, `[dry-run] ingrediente ${ing.id} (${ing.type}) -> ${ing.outputFile}`);
    return true;
  }

  // Disco = fuente de verdad entre Partes y despues de cleanup de Flow. El tile remoto solo es una
  // optimizacion de la corrida actual; si output_file existe no se vuelve a gastar una generacion.
  await hydrateExistingIngredientFiles({ forceIds });
  const hasImg = (g) => !!g.imageFilePath || !!g.imageUrl;
  const protectedIngredients = forceIds.size ? [] : ings.filter(ingredientAutoRetryProtected);
  if (protectedIngredients.length) {
    state.queue.paused = true;
    state.queue.running = false;
    await saveState();
    log(LOG_LEVEL.WARN, `Ingredientes protegidos tras intento ambiguo: ${protectedIngredients.map((g) => g.id).join(", ")}. Reanudar NO los regenera; usa Reintentar en cada ingrediente para autorizar un nuevo Enter.`);
    emitState();
    return false;
  }
  const pending = forceIds.size ? ings.filter((g) => forceIds.has(g.id))
    : ings.filter((g) => !ingredientAutoRetryProtected(g) && (g.regeneratePending || !hasImg(g)));
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
  const ingRetries = new Map();   // fallos pre-submit de composer admiten mas recargas: no gastan imagen
  for (let ingIndex = 0; ingIndex < pending.length; ingIndex++) {
    const ing = pending[ingIndex];
    const isLastIngredient = ings.length > 1 && ing.id === ings[ings.length - 1]?.id;
    await ensureState();
    if (state.queue.paused && !options.ignorePaused) return false;
    try {
      const forceThisIngredient = forceIds.has(ing.id) || !!ing.regeneratePending || !!ing.retryQueued;
      // Si el retry fue encolado antes de entrar a este turno, consumir el marcador aqui. Un segundo clic
      // DURANTE esta generacion vuelve a ponerlo en true y se insertara otra vez al terminar.
      ing.retryQueued = false;
      ing.status = SCENE_STATUS.GENERATING_IMAGE;
      ing.error = null;
      ing.imageUrl = forceThisIngredient ? null : ing.imageUrl;
      ing.imageFilePath = forceThisIngredient ? null : ing.imageFilePath;
      await saveState();
      emitState();

      if (provider === "grok") {
        const reloadByCount = (state.pacing?.grokGenCount || 0) >= GROK_RELOAD_EVERY;
        if (reloadByCount || isLastIngredient) {
          const reason = isLastIngredient ? "antes del ultimo ingrediente" : `tras ${GROK_RELOAD_EVERY} generaciones`;
          log(LOG_LEVEL.INFO, `Grok: recargando la pestana de cero ${reason} (anti-cuelgue).`);
          try { await hardReloadGrok(tab.id); } catch (e) { log(LOG_LEVEL.WARN, `Grok: recarga anti-cuelgue fallo (${e?.message ?? e}); sigo sin recargar.`); }
          state.pacing.grokGenCount = 0;
          await saveState();
        }
        const refPaths = [];
        // character_edited: subir el PNG base como referencia para "vestirlo" con edit_prompt.
        if (ing.type === "character_edited" && ing.base) {
          const entry = chars[ing.base];
          if (entry?.reference_asset) {
            const p = await resolveCharFileFlexible(entry.reference_asset);
            refPaths.push(p);
            log(LOG_LEVEL.INFO, `Ingrediente ${ing.id}: base '${ing.base}' subido a Grok para vestirlo.`);
          } else log(LOG_LEVEL.WARN, `Ingrediente ${ing.id}: base '${ing.base}' sin reference_asset; genero sin referencia.`);
        }
        for (const rel of (ing.referenceAssets || [])) {
          try {
            const p = await resolveCharFileFlexible(rel);
            refPaths.push(p);
          } catch (e) {
            log(LOG_LEVEL.WARN, `Ingrediente ${ing.id}: no resolvi referencia "${rel}" (${e?.message ?? e}); sigo sin ella.`);
          }
        }
        const rejectImageKeys = knownGrokImageKeys({ excludeIngredientId: ing.id });
        ing.grokImageAttempt = newGrokImageAttempt("ingredient", ing.id, rejectImageKeys);
        await saveState();
        let img;
        try {
          img = await sendGrokGenerateImageWithUiRetry(tab.id, {
            prompt: ing.prompt,
            aspectRatio,
            rejectImageKeys,
            grokAttempt: { id: ing.grokImageAttempt.id, ownerType: "ingredient", ownerId: ing.id },
            cfg: driverCfg(),
          }, { refPaths, label: `Ingrediente ${ing.id}` });
        } catch (e) {
          if (ing.grokImageAttempt?.submitIssued) e.noAutoRetry = true;
          else ing.grokImageAttempt = null;
          await saveState();
          throw e;
        }
        if (!img?.imageUrl) {
          const e = new Error("Grok no devolvio URL de imagen despues de enviar; no genero otra automaticamente");
          e.noAutoRetry = true;
          throw e;
        }
        await persistGrokAttemptResult(ing, img);
        const saved = await downloadValidatedGrokCandidate(img, slug, `ingredient_${ing.id}`, {
          rejectImageKeys, label: `Ingrediente ${ing.id}`,
        });
        rejectDuplicateGrokImage(`Ingrediente ${ing.id}`, saved.imageUrl, rejectImageKeys);
        if ((img?.variantCount || saved.variantCount) > 1) {
          log(LOG_LEVEL.INFO, `Ingrediente ${ing.id}: Grok genero ${img?.variantCount || saved.variantCount} variaciones; uso la ${saved.variantIndex + 1}a validada.`);
        }
        ing.imageUrl = saved.imageUrl;
        if (ing.outputFile) {
          const moved = await moveGeneratedAssetToProject(saved.abspath, ing.outputFile);
          ing.imageFilePath = moved.abspath || await resolveCharFileFlexible(ing.outputFile);
          log(LOG_LEVEL.INFO, `Ingrediente ${ing.id} guardado para reuso: ${moved.path}.`);
        } else {
          ing.imageFilePath = saved.abspath || null;
        }
        detachDebugger(tab.id);
        if (state.pacing) state.pacing.grokGenCount = (state.pacing.grokGenCount || 0) + 1;
      } else {
        if (state.project?.comparisonVariant !== "flow_images_only"
            && (state.pacing?.flowGenCount || 0) >= FLOW_RELOAD_EVERY) {
          log(LOG_LEVEL.INFO, `Flow: recargando el mismo proyecto tras ${FLOW_RELOAD_EVERY} generaciones de ingredientes (libero memoria).`);
          try {
            await hardReloadFlow(tab.id);
            await ensureDebugger(tab.id);
            state.pacing.flowGenCount = 0;
            await saveState();
          } catch (reloadError) {
            log(LOG_LEVEL.WARN, `Flow: recarga preventiva de ingredientes fallo (${reloadError?.message ?? reloadError}); sigo.`);
          }
        }
        // Flow: character_edited usa el Personaje base como referencia "+"; entity/plate sin referencia.
        const characterNames = (ing.type === "character_edited" && ing.base && chars[ing.base]?.display_name)
          ? [chars[ing.base].display_name] : [];
        const sceneRefImageUrls = [];
        const ingredientRefs = [];
        const localReferencePaths = [];
        const localReferenceNamesByPath = new Map();
        const validationReferencePaths = [];
        if (ing.type === "character_edited" && ing.base && chars[ing.base]?.reference_asset) {
          try {
            const basePath = await resolveCharFileFlexible(chars[ing.base].reference_asset);
            if (basePath) validationReferencePaths.push(basePath);
          } catch (_e) { /* createCharacterInFlow ya valida la referencia base */ }
        }
        for (const rel of (ing.referenceAssets || [])) {
          const dep = ings.find((g) => g !== ing && g.outputFile
            && String(g.outputFile).replace(/\\/g, "/") === String(rel).replace(/\\/g, "/"));
          if (dep?.imageFilePath) validationReferencePaths.push(dep.imageFilePath);
          if (dep?.imageUrl) {
            ingredientRefs.push({ name: dep.flowName || dep.id, imageUrl: dep.imageUrl });
            continue;
          }
          try {
            const p = await resolveCharFileFlexible(rel);
            if (p) {
              localReferencePaths.push(p);
              localReferenceNamesByPath.set(p, dep?.flowName || state.project?.flowReferenceNames?.[
                String(rel || "").replace(/\\/g, "/").toLowerCase()
              ] || "");
              validationReferencePaths.push(p);
            }
          }
          catch (e) { log(LOG_LEVEL.WARN, `Ingrediente ${ing.id}: no resolvi referencia Flow "${rel}" (${e?.message ?? e}).`); }
        }
        const uniqueLocalReferencePaths = [...new Set(localReferencePaths)];
        const img = await sendActOrFail(tab.id, ACT.GENERATE_IMAGE, {
          prompt: ing.prompt, characterNames, sceneRefImageUrls, ingredientRefs,
          localReferencePaths: uniqueLocalReferencePaths,
          localReferenceNames: uniqueLocalReferencePaths.map((p) => localReferenceNamesByPath.get(p) || ""),
          resultName: ing.flowName || `Referencia — ${ing.id}`, aspectRatio, count,
          model: state.project?.imageModel || "Nano Banana Pro", cfg: driverCfg(),
        });
        for (const warning of (img?.renameWarnings || [])) log(LOG_LEVEL.WARN, `Ingrediente ${ing.id}: ${warning}`);
        if (!img?.imageUrl) throw new Error("Flow no devolvio URL de imagen");
        state.pacing = state.pacing || {};
        state.pacing.flowGenCount = (state.pacing.flowGenCount || 0) + 1;
        await saveState();
        const saved = await downloadValidatedFlowImage(img.imageUrl, slug, `ingredient_${ing.id}`, {
          referencePaths: [...new Set(validationReferencePaths.filter(Boolean))],
          label: `Ingrediente ${ing.id}`,
        });
        ing.imageUrl = img.imageUrl;
        if (ing.outputFile) {
          const moved = await moveGeneratedAssetToProject(saved.abspath, ing.outputFile);
          ing.imageFilePath = moved.abspath || await resolveCharFileFlexible(ing.outputFile);
          log(LOG_LEVEL.INFO, `Ingrediente Flow ${ing.id} guardado para reuso: ${moved.path}.`);
        } else ing.imageFilePath = saved.abspath || null;
      }
      ing.regeneratePending = false;
      ing.status = SCENE_STATUS.DONE;
      ing.error = null;
      ing.noAutoRetry = false;
      ing.grokImageAttempt = null;
      await saveState();
      emitState();
      log(LOG_LEVEL.INFO, `Ingrediente listo: ${ing.id} (${ing.type}).`);
      // Rehacer puede pulsarse mientras este await estaba en Grok. Insertar esos pedidos justo despues
      // del ingrediente actual; si Pausa ya esta activa, el guard del siguiente ciclo los deja pendientes
      // y persistidos para Reanudar.
      const queued = ings.filter((candidate) => candidate.retryQueued);
      if (queued.length) {
        for (const candidate of queued) {
          candidate.retryQueued = false;
          candidate.regeneratePending = true;
        }
        const notAlreadyAhead = queued.filter((candidate) => !pending.slice(ingIndex + 1).includes(candidate));
        pending.splice(ingIndex + 1, 0, ...notAlreadyAhead);
        await saveState();
        emitState();
        log(LOG_LEVEL.INFO, `Rehacer encolado: ${queued.map((candidate) => candidate.id).join(", ")}.`);
      }
    } catch (e) {
      detachDebugger(tab.id);
      // Cualquier fallo posterior al ACK pre-Enter (incluye validacion/move) pertenece a una generacion
      // que ya pudo ejecutarse. No dejar que el retry reactivo de ingredientes mande otro Enter.
      if (provider === "grok" && ing.grokImageAttempt?.submitIssued) e.noAutoRetry = true;
      ing.imageUrl = null;
      ing.imageFilePath = null;
      ing.status = SCENE_STATUS.ERROR;
      ing.error = e?.message ?? String(e);
      if (e?.noAutoRetry) {
        ing.noAutoRetry = true;
        if (ing.grokImageAttempt) {
          ing.grokImageAttempt.noAutoRetry = true;
          if (ing.grokImageAttempt.stage !== "recovery_failed") ing.grokImageAttempt.stage = "failed_after_submit";
        }
      }
      await saveState();
      emitState();
      if (e?.hardStop) { await onHardStop(e.hardStop, e?.message); return false; }
      // Rehacer pulsado MIENTRAS este mismo ingrediente estaba en vuelo ya es autorizacion explicita
      // para una nueva generacion. Si el intento viejo termina ambiguo, consumir ese pedido una sola vez
      // en lugar de protegerlo eternamente como recovery_failed. Una Pausa lo deja PENDING para Reanudar.
      if (provider === "grok" && e?.noAutoRetry && ing.retryQueued) {
        ing.retryQueued = false;
        ing.regeneratePending = true;
        ing.grokImageAttempt = null;
        ing.noAutoRetry = false;
        ing.status = SCENE_STATUS.PENDING;
        ing.error = null;
        await saveState();
        emitState();
        log(LOG_LEVEL.WARN, state.queue.paused
          ? `Ingrediente ${ing.id}: el intento ambiguo ya cerro; Rehacer estaba encolado y correra UNA vez al reanudar.`
          : `Ingrediente ${ing.id}: el intento ambiguo ya cerro; consumo Rehacer encolado y hago UN intento nuevo.`);
        if (state.queue.paused) return false;
        try { await hardReloadGrok(tab.id); } catch (re) { log(LOG_LEVEL.WARN, `Recarga de Grok fallo (${re?.message ?? re}); reintento igual.`); }
        if (state.pacing) state.pacing.grokGenCount = 0;
        ingIndex--;
        continue;
      }
      // Reintento REACTIVO (solo Grok, antes de Enter): un fallo de composer no gasta imagen, asi que
      // admite dos recargas completas. Otros fallos conservan una sola para no ocultar problemas reales.
      const tries = ingRetries.get(ing.id) || 0;
      const maxReactiveRetries = isGrokSafeComposerError(e) ? 2 : 1;
      if (provider === "grok" && tries < maxReactiveRetries && !e?.noAutoRetry) {
        ingRetries.set(ing.id, tries + 1);
        log(LOG_LEVEL.WARN, `Ingrediente ${ing.id} fallo (${e?.message ?? e}); recargo Grok de cero y reintento (${tries + 2}/${maxReactiveRetries + 1}).`);
        try { await hardReloadGrok(tab.id); } catch (re) { log(LOG_LEVEL.WARN, `Recarga de Grok fallo (${re?.message ?? re}); reintento igual.`); }
        if (tries > 0) await delay(2500);
        if (state.pacing) state.pacing.grokGenCount = 0;
        ing.status = SCENE_STATUS.PENDING;
        ing.error = null;
        await saveState();
        emitState();
        ingIndex--;   // repite este mismo ingrediente
        continue;
      }
      // Las imagenes de Flow no consumen puntos. Un upload confundido con resultado, un frame
      // incompleto o un cierre puntual de canal se puede reintentar de forma acotada sin detener
      // toda la biblioteca; dos intentos extra bastan para recuperarse sin crear un bucle infinito.
      if (provider === "flow" && tries < 2) {
        if (state.queue.paused) return false;
        ingRetries.set(ing.id, tries + 1);
        log(LOG_LEVEL.WARN, `Ingrediente Flow ${ing.id} fallo (${e?.message ?? e}); recargo y reintento (${tries + 2}/3).`);
        try {
          await chrome.tabs.reload(tab.id);
          await delay(2500);
          await ensureContentScript(tab.id, "flow");
        } catch (reloadError) {
          log(LOG_LEVEL.WARN, `Recarga de Flow fallo (${reloadError?.message ?? reloadError}); reintento igual.`);
        }
        ing.status = SCENE_STATUS.PENDING;
        ing.error = null;
        await saveState(); emitState();
        ingIndex--;
        continue;
      }
      if (e?.noAutoRetry) log(LOG_LEVEL.WARN, `Ingrediente ${ing.id}: no re-genero automaticamente porque Grok pudo haber creado ya el asset.`);
      log(LOG_LEVEL.ERROR, `Ingrediente ${ing.id} fallo: ${e?.message ?? e}`);
      await pauseForError(`ingrediente ${ing.id}: ${e?.message ?? e}`, null);
      return false;
    }
  }
  if (provider !== "grok") detachDebugger(tab.id);
  // forceIds (retry manual) NO es la fase completa: solo se regenero ese/esos ingrediente(s).
  log(LOG_LEVEL.INFO, forceIds.size
    ? `Ingrediente(s) regenerado(s): ${[...forceIds].join(", ")}.`
    : "FASE INGREDIENTES completa.");
  return true;
  } finally {
    ingredientsRunning = false;
  }
}

async function onRunAll() {
  // Guard anti-reentrada de la CORRIDA COMPLETA. pollQueue se dispara por alarma; mientras esta corrida
  // await-ea la fase de INGREDIENTES (donde loopRunning aun es false), una 2a alarma tomaba OTRO job y
  // cargaba su JSON encima -> pisaba state.project y reventaba el ingrediente en curso ("message channel
  // closed"). autopilotBusy cubre TODO onRunAll (ingredientes + fases), no solo el bucle de escenas.
  if (autopilotBusy) { log(LOG_LEVEL.WARN, "AUTOPILOTO: ya hay una corrida activa; ignoro la reentrada."); return; }
  if (directedRecoveryBusy) {
    log(LOG_LEVEL.WARN, "AUTOPILOTO: hay una recuperacion dirigida de Grok activa; espero a que cierre antes de navegar o reanudar.");
    return;
  }
  // Tambien contra una corrida MANUAL viva (boton de fase / retry): sin esto, "Hacer todo" arrancaba la
  // fase de ingredientes ENCIMA del bucle de escenas en curso y ambos mutaban state.scenes a la vez.
  if ((loopRunning || ingredientsRunning) && !state.queue?.paused) {
    log(LOG_LEVEL.WARN, "AUTOPILOTO: hay una corrida manual activa; pausa o espera a que termine antes de 'Hacer todo'.");
    return;
  }
  autopilotBusy = true;
  try {
  // keepAlive durante TODA la corrida (ingredientes + audio incluidos, donde loopRunning=false).
  try { chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 }); } catch (_e) {}
  await applySecrets();
  await ensureState();
  if (!state.project || !state.scenes?.length) { log(LOG_LEVEL.WARN, "AUTOPILOTO: no hay proyecto cargado."); return; }
  const provider = state.project?.imageProvider || state.config.provider || DEFAULT_CONFIG.provider;
  log(LOG_LEVEL.INFO, `AUTOPILOTO: "${state.project.title}" - preparando ${provider === "grok" ? "Grok" : "Flow"}...`);

  try { await ensureProviderReady(provider); }
  catch (e) { log(LOG_LEVEL.ERROR, `AUTOPILOTO detenido: ${e?.message ?? e}`); return; }

  // FASE 0: ingredientes (si el JSON los trae). Antes de imagenes; no-op si no hay. Parada dura -> detener.
  try {
    if (!(await runIngredientsPhase())) {
      await ensureState();
      const ingredientFailed = (state.project?.ingredients || []).some((g) => g.status === SCENE_STATUS.ERROR);
      log(state.queue?.paused && !ingredientFailed ? LOG_LEVEL.INFO : LOG_LEVEL.ERROR,
        state.queue?.paused && !ingredientFailed
          ? "AUTOPILOTO pausado durante ingredientes."
          : "AUTOPILOTO detenido en ingredientes.");
      return;
    }
  }
  catch (e) { log(LOG_LEVEL.ERROR, `AUTOPILOTO detenido en ingredientes: ${e?.message ?? e}`); return; }

  // image-only (historias): el paralelo no aplica (no hay carril de animacion); forzar secuencial.
  if (state.config.parallelPipeline && !state.project?.imageOnly) {
    // Carriles a la vez: imagenes en un proveedor + animacion en el otro.
    if (!(await runPhasesParallel())) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido (parada dura en pipeline paralelo)."); return; }
  } else {
    log(LOG_LEVEL.INFO, "AUTOPILOTO: generando imagenes...");
    if (!(await runPhaseToEnd("images"))) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en imagenes (parada dura)."); return; }

    if (state.project?.imageOnly && !state.scenes.some((s) => s.renderMode === "animated")) {
      log(LOG_LEVEL.INFO, "AUTOPILOTO: preset image-only (historias) -> sin animacion.");
    } else {
      log(LOG_LEVEL.INFO, "AUTOPILOTO: animando...");
      if (!(await runPhaseToEnd("animation"))) { log(LOG_LEVEL.ERROR, "AUTOPILOTO detenido en animacion (parada dura)."); return; }
    }
  }

  log(LOG_LEVEL.INFO, "AUTOPILOTO: generando voz...");
  // missingOnly: en un re-run (job reanudado) NO regenerar mp3 que ya existen (gasto de creditos).
  // En una corrida fresca no existe nada -> genera todo igual que antes.
  const audioOk = await onGenerateAudio({ includeHook: true, missingOnly: true });
  const missingVoice = await missingVoiceFiles();
  if (!audioOk || missingVoice.length) {
    // ERROR (no INFO): llega al panel y a Telegram via remote events. El job se marca done igualmente
    // (re-tomarlo re-gastaria imagenes/animaciones); la via de recuperacion es "audio faltante"
    // (Telegram /audio o el boton del panel), que solo genera lo que falta.
    const detail = missingVoice.length
      ? `faltan: ${missingVoice.slice(0, 5).join(", ")}${missingVoice.length > 5 ? ` y ${missingVoice.length - 5} mas` : ""}`
      : "la generacion reporto fallo";
    log(LOG_LEVEL.ERROR, `AUTOPILOTO: AUDIO INCOMPLETO (${detail}). El render NO va a arrancar sin la voz. Reintenta con "audio faltante" (/audio en Telegram) cuando el problema este resuelto.`);
  }

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

  if (audioOk && !missingVoice.length) {
    log(LOG_LEVEL.INFO, "AUTOPILOTO: medios listos en remotion-editor/public/. El orquestador (build.mjs --watch) renderiza el video.");
  } else {
    log(LOG_LEVEL.WARN, "AUTOPILOTO: imagenes/clips listos pero la VOZ quedo incompleta; el render espera hasta completar el audio.");
  }
  return true;   // corrida COMPLETA OK -> la cola marca el job como hecho (no re-tomarlo aunque el SW se duerma). Los `return` previos (fallos) devuelven undefined.
  } finally { autopilotBusy = false; }
}

// ---------------------------------------------------------------------------
// Cola: el SW saca trabajos del dev-server y los corre solos (si config.autoQueue).
// ---------------------------------------------------------------------------

const processedJobs = new Set();   // nombres ya tomados en esta vida del SW (evita repetir)
const GROK_RELOAD_EVERY = 3;       // recarga frecuente: Grok acumula estado y se traba tras varias imagenes
const FLOW_RELOAD_EVERY = 6;       // Flow acumula previews/uploads; recargar el mismo proyecto libera su renderer

function queueJobUsesGrok(job) {
  const p = job?.json?.project || {};
  const pipeline = job?.json?.pipeline || {};
  const preset = p.preset || "";
  const provider = p.provider || p.image_provider || p.imageProvider || pipeline.image_generation?.tool || "";
  const animProvider = p.animation_provider || p.animationProvider || pipeline.animation?.tool || "";
  return /^(historias|criptoclaro|habitos|pov-historias|manhwa)/.test(preset)
    || /^grok/i.test(provider)
    || /^grok/i.test(animProvider);
}

async function resetGrokForQueueJob(job) {
  if (!queueJobUsesGrok(job)) return;
  const tab = await findFlowTab("grok");
  if (!tab) { log(LOG_LEVEL.WARN, `Cola: "${job.name}" usa Grok pero no hay pestana abierta para reiniciar.`); return; }
  log(LOG_LEVEL.INFO, `Cola: reinicio limpio de Grok antes de "${job.name}".`);
  try {
    detachDebugger(tab.id);
    await hardReloadGrok(tab.id);
    if (state.pacing) state.pacing.grokGenCount = 0;
    await saveState();
  } catch (e) {
    log(LOG_LEVEL.WARN, `Cola: reinicio de Grok fallo (${e?.message ?? e}); sigo con composer fresco.`);
    try { await ensureGrokCompositor(tab.id); } catch (_e) {}
  }
}

async function pollQueue() {
  await ensureState();
  if (!state.config.autoQueue) return;
  if (state.queue.paused) return;                    // pausa (manual o por fallo): NO jalar mas trabajos
  if (autopilotBusy) return;                        // corrida completa en curso (incl. ingredientes): no tomar otro job
  if (loopRunning) return;                          // bucle vivo en este worker: no encimar
  if (ingredientsRunning) return;                   // fase de ingredientes viva (no marca loopRunning): no encimar
  if (resumeInFlight) return;                       // resumeIfInterrupted reparando una corrida a medias: no pisarla
  // Guard de reentrada PROPIO: autopilotBusy no se enciende hasta onRunAll, pero entre el claim y onRunAll
  // hay awaits de minutos (hardReloadGrok, prepareProjectMedia). Una 2a alarma en esa ventana reclamaba
  // OTRO job y su onLoadJson pisaba state.project/scenes del primero.
  if (pollQueueBusy) return;
  pollQueueBusy = true;
  try {
  // "running" persistido solo cuenta si el latido es reciente; si esta rancio, el bucle murio -> lo reseteamos.
  if (state.queue.running) {
    const fresh = (Date.now() - (state.queue.heartbeatAt || 0)) < 120000;
    if (fresh) return;
    state.queue.running = false; await saveState();
    log(LOG_LEVEL.WARN, "Cola marcada 'running' sin bucle vivo (latido rancio): la libero.");
    return;   // este tick SOLO libera; el siguiente decide (da chance a resumeIfInterrupted de ganar la carrera)
  }
  // JOB A MEDIAS PERSISTIDO (fallo previo, aborto o SW reiniciado): REANUDAR esa corrida en vez de
  // reclamar otro JSON. Antes: el lock ocultaba el job del listado del dev-server y la cola saltaba al
  // siguiente JSON; onLoadJson del nuevo pisaba el estado del job a medias y, al relistarse por lock
  // rancio, se recargaba de cero -> re-gasto de todo lo ya pagado.
  if (state.queue.jobName) {
    const projSlug = state.project?.slug || null;
    if (!projSlug || (state.queue.jobSlug && projSlug !== state.queue.jobSlug)) {
      // El proyecto cargado ya no corresponde al job (JSON cambiado a mano / claim interrumpido antes de
      // cargar). No hay progreso que proteger: soltar el job; su lock caduca y se relista para un claim limpio.
      log(LOG_LEVEL.WARN, `cola: el proyecto cargado (${projSlug || "ninguno"}) no corresponde al job "${state.queue.jobName}"; lo suelto (se relistara solo).`);
      processedJobs.delete(state.queue.jobName);   // que ESTA vida del SW pueda re-reclamarlo al relistarse
      state.queue.jobName = null;
      state.queue.jobSlug = null;
      await saveState();
    } else {
      const jobName = state.queue.jobName;
      log(LOG_LEVEL.INFO, `AUTOPILOTO: reanudando trabajo a medias "${jobName}" (sin re-gastar lo hecho).`);
      await repairMissingStillAssetsBeforeResume("reanudacion de job a medias");
      forceImagesPhaseIfPending("reanudacion de job a medias");
      await saveState();
      const ok = await onRunAll().catch((e) => { log(LOG_LEVEL.ERROR, `AUTOPILOTO: excepcion no manejada: ${e?.message ?? e}`); return false; });
      await finishQueueJob(jobName, ok);
      return;
    }
  }
  let jobs;
  try { jobs = await fetch(state.config.queueUrl || DEFAULT_CONFIG.queueUrl).then((r) => r.json()); }
  catch (_e) { return; }                              // dev-server caido
  // doneJobs (PERSISTENTE en storage) = jobs ya completados por el autopiloto; processedJobs (en memoria) = guard
  // de esta vida del SW. Al dormir el SW se borra processedJobs, pero doneJobs sobrevive -> NO se re-toma un job
  // ya hecho aunque su media aun no este "complete" (el render local va aparte y tarda).
  const doneJobs = state.queue.doneJobs || [];
  const job = (jobs || []).find((j) => j && j.valid !== false && j.runnable !== false && !j.mediaComplete && !processedJobs.has(j.name) && !doneJobs.includes(j.name));
  if (!job) return;
  processedJobs.add(job.name);
  // Reclama el trabajo (crea <json>.lock en disco) para que NO se repita aunque el SW reinicie.
  const claimUrl = (state.config.queueUrl || DEFAULT_CONFIG.queueUrl) + "/claim";
  const claimed = await fetch(`${claimUrl}?name=${encodeURIComponent(job.name)}`, { method: "POST" })
    .then((r) => r.json()).catch(() => null);
  if (!claimed?.ok) { log(LOG_LEVEL.DEBUG, `cola: "${job.name}" ya estaba tomado, salto.`); return; }
  log(LOG_LEVEL.INFO, `AUTOPILOTO: tomando "${job.name}" de la cola.`);
  // MISMO job a medias (el SW murio fuera del bucle de escenas y el lock caduco): NO recargar el JSON.
  // onLoadJson resetearia TODAS las escenas a PENDING y se re-gastaria cada imagen/animacion ya pagada.
  // Se reanuda el estado persistido (los runners son idempotentes por status). Verificamos que el JSON del
  // job corresponda al proyecto cargado (mismo slug) para no reanudar escenas de otro proyecto.
  const sameJob = (state.scenes || []).length > 0
    && (state.scenes || []).some((s) => s.status !== SCENE_STATUS.PENDING)
    && (() => { try { const chk = validateQueueProject(job.json); return chk.ok && chk.parsed.project.slug === state.project?.slug; } catch (_e) { return false; } })();
  await resetGrokForQueueJob(job);
  // jobName se CONSERVA hasta completar (fallos incluidos): asi la cola reanuda ESTE job en el siguiente
  // tick en vez de tomar otro JSON. jobSlug ancla el job al proyecto cargado (guard de la reanudacion).
  state.queue.jobName = job.name;
  state.queue.jobSlug = job.slug || null;
  await saveState();
  if (sameJob) {
    log(LOG_LEVEL.WARN, `AUTOPILOTO: "${job.name}" ya estaba a medias; reanudo el progreso persistido (sin re-gastar lo hecho).`);
    await repairMissingStillAssetsBeforeResume("re-claim del mismo job");
    forceImagesPhaseIfPending("re-claim del mismo job");
    await saveState();
  } else {
    await onLoadJson({ json: job.json });
  }
  const ok = await onRunAll().catch((e) => { log(LOG_LEVEL.ERROR, `AUTOPILOTO: excepcion no manejada: ${e?.message ?? e}`); return false; });
  await finishQueueJob(job.name, ok);
  } finally { pollQueueBusy = false; }
}

// Ultima barrera antes de soltar un trabajo: el status en memoria no basta. Un canal de Chrome puede
// cerrarse justo despues de que Grok termine y dejar la escena marcada DONE sin que el clip haya llegado
// todavia a public/. Si falta el asset final, rehidrata la escena desde el still y conserva el mismo job
// para que el siguiente tick lo repare; nunca autoriza avanzar al JSON siguiente.
async function reconcileMissingFinalSceneMedia() {
  const slug = state.project?.slug || "";
  if (!slug) return [];
  const missing = [];
  for (const scene of state.scenes || []) {
    if (!scene || scene.sceneType === "narrative_card") continue;
    const finalIsStill = isRenderableStillScene(scene);
    const rel = finalIsStill
      ? sceneStillRelativePath(scene, slug)
      : `remotion-editor/public/${slug}/clips/${scene.id}.mp4`;
    if (await publicFileOk(rel, minMediaBytes(rel))) continue;

    missing.push(scene.id);
    scene.savedOk = false;
    scene.error = `asset final ausente en disco: ${rel}`;
    scene.errorPhase = finalIsStill ? "images" : "animation";
    scene.videoUrl = null;
    scene.clipFilename = null;
    scene.grokVideoPostUrl = null;
    scene.grokAnimBefore = null;

    if (finalIsStill) {
      scene.status = SCENE_STATUS.PENDING;
      scene.imageUrl = null;
      scene.imageFilePath = null;
      scene.grokPostUrl = null;
      scene.grokFired = false;
      emitSceneStatus(scene.id, SCENE_STATUS.PENDING, scene.error);
      continue;
    }

    const stillRel = sceneStillRelativePath(scene, slug);
    const still = await publicFileStatus(stillRel);
    if (still?.abspath && Number(still.size || 0) >= minMediaBytes(stillRel)) {
      scene.status = SCENE_STATUS.IMAGE_DONE;
      scene.imageFilePath = still.abspath;
      emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE, scene.error);
    } else {
      scene.status = SCENE_STATUS.PENDING;
      scene.imageUrl = null;
      scene.imageFilePath = null;
      scene.grokPostUrl = null;
      scene.grokFired = false;
      emitSceneStatus(scene.id, SCENE_STATUS.PENDING, scene.error);
    }
  }
  return missing;
}

// Cierra el ciclo de un job de la cola tras onRunAll. Exito -> doneJobs + soltar jobName. Fallo -> CONSERVA
// jobName (la cola reanuda ese job en vez de tomar otro) y, si el aborto fue SILENCIOSO (sin pausa y sin
// corrida viva: sin pestana del proveedor, proyecto no cargado, etc.), pausa la cola para que el usuario lo
// vea; sin esto, pollQueue saltaba al siguiente JSON a los 30s dejando el actual a medias.
async function finishQueueJob(name, ok) {
  await ensureState();
  if (ok) {
    const missing = await reconcileMissingFinalSceneMedia();
    if (missing.length) {
      state.queue.doneJobs = (state.queue.doneJobs || []).filter((job) => job !== name);
      state.queue.jobName = name;
      state.queue.jobSlug = state.project?.slug || state.queue.jobSlug || null;
      state.queue.running = false;
      state.queue.paused = false;
      state.queue.errorSceneId = missing[0];
      state.queue.phase = unresolvedImageScenes(state.scenes).length ? "images" : "animation";
      log(LOG_LEVEL.ERROR, `AUTOPILOTO: "${name}" no puede cerrarse; faltan ${missing.length} asset(s) finales en disco: ${missing.join(", ")}. Se reintentara el mismo trabajo sin avanzar.`);
      await saveState();
      emitState();
      emitProgress();
      return;
    }
    state.queue.doneJobs = state.queue.doneJobs || [];
    if (!state.queue.doneJobs.includes(name)) state.queue.doneJobs.push(name);
    state.queue.jobName = null;       // corrida terminada: deja de latir el lock
    state.queue.jobSlug = null;
    log(LOG_LEVEL.INFO, `AUTOPILOTO: "${name}" completado; no se re-tomara.`);
  } else if (!state.queue.paused && !loopRunning && !autopilotBusy && !ingredientsRunning) {
    await pauseForError(`el autopiloto aborto "${name}" sin terminar; revisa el log, arregla la causa y dale Reanudar`, null);
  }
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
chrome.alarms?.create?.("remoteControlPoll", { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm?.addListener((a) => {
  if (a.name === "queuePoll") pollQueue().catch((e) => log(LOG_LEVEL.ERROR, `pollQueue fallo: ${e?.message ?? e}`));
  else if (a.name === "remoteControlPoll") pollRemoteCommands().catch(() => {});
  else if (a.name === "rateLimitResume") resumeAfterCooldown().catch(() => {});
  else if (a.name === "keepAlive") keepAliveTick().catch(() => {});
});

// Mantiene VIVO el SW durante el pipeline paralelo: la espera de ~6min de Grok sin eventos chrome.* puede
// matar el worker MV3. La alarma (evento periodico) lo revive y de paso refresca state.queue.heartbeatAt
// para que pollQueue no trate la corrida como rancia. Se auto-apaga cuando no queda ningun carril vivo.
async function keepAliveTick() {
  await ensureState();
  const anyLane = state.lanes && (state.lanes.images?.running || state.lanes.animation?.running);
  const seqAlive = loopRunning || autopilotBusy || ingredientsRunning;   // corrida secuencial/ingredientes/audio viva
  if (!anyLane && !seqAlive) { try { chrome.alarms.clear("keepAlive"); } catch (_e) {} return; }
  state.queue.heartbeatAt = Date.now();
  await saveState();
  heartbeatJobLock();   // el lock del job tambien late en ingredientes/audio (antes caducaba a los 15 min ahi)
}

// Arranque inicial: rehidrata cuando el modulo se evalua y reanuda si quedo una corrida a medias.
loadState().then(() => { applySecrets(); postRemoteState(); pollRemoteCommands(); resumeIfInterrupted(); });
