// sidepanel/panel.js
// UI del side panel. ES module. Importa el contrato compartido; no redefine constantes.
import { CMD, EVT, SCENE_STATUS, DEFAULT_CONFIG, VIDEO_MODELS, VIDEO_DURATIONS, FISH_PRESETS, DEFAULT_VOICE_ID, send, msg } from '../lib/messaging.js';

// ---------------------------------------------------------------------------
// Referencias al DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const el = {
  hardStopBanner: $('hardStopBanner'),
  hardStopMsg: $('hardStopMsg'),
  hardStopClose: $('hardStopClose'),
  dryRunBanner: $('dryRunBanner'),
  errorBanner: $('errorBanner'),
  errorBannerMsg: $('errorBannerMsg'),
  btnErrResume: $('btnErrResume'),
  btnErrSkip: $('btnErrSkip'),
  btnErrRetryAll: $('btnErrRetryAll'),
  statusHero: $('statusHero'),
  statusDot: $('statusDot'),
  statusTitle: $('statusTitle'),
  statusSub: $('statusSub'),
  providerChip: $('providerChip'),
  modelSelect: $('modelSelect'),
  durationSelect: $('durationSelect'),
  estScenes: $('estScenes'),
  estCost: $('estCost'),
  estDuration: $('estDuration'),
  btnClearAll: $('btnClearAll'),
  projectTitle: $('projectTitle'),
  jsonInput: $('jsonInput'),
  jsonStatus: $('jsonStatus'),
  charInput: $('charInput'),
  charName: $('charName'),
  charThumb: $('charThumb'),
  dropzone: $('dropzone'),
  btnRunAll: $('btnRunAll'),
  toggleAutoQueue: $('toggleAutoQueue'),
  btnImages: $('btnImages'),
  btnAnimate: $('btnAnimate'),
  btnPause: $('btnPause'),
  btnResume: $('btnResume'),
  btnStop: $('btnStop'),
  btnReset: $('btnReset'),
  progressFill: $('progressFill'),
  progressLabel: $('progressLabel'),
  toggleDryRun: $('toggleDryRun'),
  toggleInspector: $('toggleInspector'),
  toggleParallel: $('toggleParallel'),
  cfgResolution: $('cfgResolution'),
  cfgConcurrency: $('cfgConcurrency'),
  cfgDelayMin: $('cfgDelayMin'),
  cfgDelayMax: $('cfgDelayMax'),
  cfgMaxRetries: $('cfgMaxRetries'),
  cfgGenerationCount: $('cfgGenerationCount'),
  cfgInterMin: $('cfgInterMin'),
  cfgInterMax: $('cfgInterMax'),
  queueList: $('queueList'),
  btnQueueRefresh: $('btnQueueRefresh'),
  btnLogCopy: $('btnLogCopy'),
  phaseTracker: $('phaseTracker'),
  confirmOverlay: $('confirmOverlay'),
  confirmMsg: $('confirmMsg'),
  confirmYes: $('confirmYes'),
  confirmNo: $('confirmNo'),
  fishApiKey: $('fishApiKey'),
  fishVoiceId: $('fishVoiceId'),
  voiceHint: $('voiceHint'),
  fishModel: $('fishModel'),
  providerSelect: $('providerSelect'),
  btnAudioTest: $('btnAudioTest'),
  btnAudioMissing: $('btnAudioMissing'),
  btnAudioAll: $('btnAudioAll'),
  ingredientsCard: $('ingredientsCard'),
  ingredientsSummary: $('ingredientsSummary'),
  ingredientList: $('ingredientList'),
  sceneList: $('sceneList'),
  log: $('log'),
};

// Nombre del archivo JSON cargado (el state no lo trae; lo guardamos local).
let loadedJsonName = '';
// Ultimas escenas renderizadas (para calcular costo de animacion al confirmar).
let lastScenes = [];
// Ultima config recibida (para conocer el modelo elegido al confirmar animacion).
let lastConfig = DEFAULT_CONFIG;
// Escena que se esta procesando ahora (para el foco visual; se reaplica tras cada re-render).
let currentSceneId = null;

// Etiqueta legible + clase de color por estado de escena.
const STATUS_LABEL = {
  [SCENE_STATUS.PENDING]: 'Pendiente',
  [SCENE_STATUS.GENERATING_IMAGE]: 'Generando imagen',
  [SCENE_STATUS.IMAGE_DONE]: 'Imagen lista',
  [SCENE_STATUS.ANIMATING]: 'Animando',
  [SCENE_STATUS.DOWNLOADING]: 'Descargando',
  [SCENE_STATUS.EXTRACTING_FRAME]: 'Extrayendo frame',
  [SCENE_STATUS.DONE]: 'Listo',
  [SCENE_STATUS.ERROR]: 'Error',
};

// Glyph por estado (a11y: no depender solo del color). Se antepone a la etiqueta.
const STATUS_GLYPH = {
  [SCENE_STATUS.PENDING]: '○',
  [SCENE_STATUS.GENERATING_IMAGE]: '◐',
  [SCENE_STATUS.IMAGE_DONE]: '◑',
  [SCENE_STATUS.ANIMATING]: '◐',
  [SCENE_STATUS.DOWNLOADING]: '↓',
  [SCENE_STATUS.EXTRACTING_FRAME]: '◧',
  [SCENE_STATUS.DONE]: '✓',
  [SCENE_STATUS.ERROR]: '✕',
};
const badgeLabel = (status) => {
  const g = STATUS_GLYPH[status];
  const l = STATUS_LABEL[status] || status;
  return g ? `${g} ${l}` : l;
};

// ---------------------------------------------------------------------------
// Render del snapshot de estado
// ---------------------------------------------------------------------------
function render(state) {
  if (!state) return;

  // Proyecto
  el.projectTitle.textContent = state.project?.title || 'Sin proyecto';

  // Feedback de carga
  const sceneCount = (state.scenes || []).length;
  if (sceneCount > 0) {
    const namePart = loadedJsonName ? `${loadedJsonName} — ` : '';
    el.jsonStatus.textContent = `Cargado: ${namePart}${sceneCount} escenas`;
  } else {
    el.jsonStatus.textContent = 'Sin JSON cargado';
  }

  const ref = state.project?.characterRef;
  setCharPreview(ref?.name || '', ref?.dataUrl || '');

  // Config -> inputs
  const cfg = state.config || DEFAULT_CONFIG;
  lastConfig = cfg;
  el.toggleDryRun.checked = cfg.dryRun;
  el.toggleInspector.checked = !!state.inspector;
  el.toggleParallel.checked = cfg.parallelAnimation ?? DEFAULT_CONFIG.parallelAnimation;
  el.toggleAutoQueue.checked = cfg.autoQueue ?? DEFAULT_CONFIG.autoQueue;
  el.cfgResolution.value = cfg.downloadResolution;
  el.cfgConcurrency.value = cfg.concurrency;
  el.cfgDelayMin.value = cfg.delayMinMs;
  el.cfgDelayMax.value = cfg.delayMaxMs;
  el.cfgMaxRetries.value = cfg.maxRetries;
  el.cfgGenerationCount.value = cfg.generationCount ?? DEFAULT_CONFIG.generationCount;
  el.cfgInterMin.value = cfg.interSceneDelayMinMs ?? DEFAULT_CONFIG.interSceneDelayMinMs;
  el.cfgInterMax.value = cfg.interSceneDelayMaxMs ?? DEFAULT_CONFIG.interSceneDelayMaxMs;
  el.modelSelect.value = cfg.videoModel ?? DEFAULT_CONFIG.videoModel;
  el.durationSelect.value = cfg.videoDuration ?? DEFAULT_CONFIG.videoDuration;
  el.providerSelect.value = cfg.provider ?? DEFAULT_CONFIG.provider;
  // No piso lo que el usuario esta escribiendo: solo seteo si el campo no tiene foco.
  if (document.activeElement !== el.fishApiKey) el.fishApiKey.value = cfg.fishApiKey ?? '';
  if (document.activeElement !== el.fishVoiceId) el.fishVoiceId.value = cfg.fishVoiceId ?? '';
  el.fishModel.value = cfg.fishModel ?? DEFAULT_CONFIG.fishModel;
  renderVoiceHint(state, cfg);

  // Banner de simulacion: obvio cuando dry-run esta activo.
  el.dryRunBanner.classList.toggle('hidden', !cfg.dryRun);

  // Chip de proveedor (lo define el JSON; aqui solo se refleja).
  const prov = cfg.provider ?? DEFAULT_CONFIG.provider;
  el.providerChip.textContent = prov === 'grok' ? 'Grok' : 'Flow';
  el.providerChip.classList.toggle('grok', prov === 'grok');

  lastScenes = state.scenes || [];
  renderIngredients(state.project?.ingredients || [], state.queue || {});
  renderScenes(lastScenes);
  renderQueueButtons(state.queue || { running: false, paused: false }, lastScenes);
  renderProgress(lastScenes);
  renderHero(state);
  renderPhaseTracker(state);
  refreshQueue();
  updateEstimate();
}

// Hero de estado en vivo + banner de recuperacion. Lee state.queue (running/paused/phase/errorSceneId).
function renderHero(state) {
  const q = state.queue || {};
  const scenes = state.scenes || [];
  const errs = scenes.filter((s) => s.status === SCENE_STATUS.ERROR);
  const ingredientErrs = (state.project?.ingredients || []).filter((ing) => ing.status === SCENE_STATUS.ERROR);
  const done = scenes.filter((s) => s.status === SCENE_STATUS.DONE).length;
  const phaseLabel = (q.phase === 'animation') ? 'Animando' : 'Generando imagenes';

  // Banner de recuperacion: visible cuando NO corre y hay un fallo pendiente (errorSceneId o escenas en error).
  const blocked = !q.running && (!!q.errorSceneId || errs.length > 0 || ingredientErrs.length > 0);
  if (blocked && (scenes.length || ingredientErrs.length)) {
    const who = q.errorSceneId || errs[0]?.id || '';
    const errScene = scenes.find((s) => s.id === who);
    const errIngredient = !who && ingredientErrs[0];
    el.errorBannerMsg.textContent = errIngredient
      ? ` ingrediente ${errIngredient.id}: ${errIngredient.error || 'fallo'}`
      : who ? ` ${who}: ${errScene?.error || 'fallo'}` : ` ${errs.length} escena(s) en error.`;
    el.errorBanner.classList.remove('hidden');
    el.btnErrSkip.dataset.sceneId = who;
    el.btnErrSkip.classList.toggle('hidden', !!errIngredient);
  } else {
    el.errorBanner.classList.add('hidden');
    el.btnErrSkip?.classList.remove('hidden');
  }

  // Hero de estado.
  const hero = el.statusHero;
  hero.classList.remove('running', 'paused', 'done');
  if (!scenes.length) { hero.classList.add('hidden'); return; }
  hero.classList.remove('hidden');
  if (q.running && !q.paused) {
    hero.classList.add('running');
    el.statusTitle.textContent = currentSceneId ? `${phaseLabel} — ${currentSceneId}` : phaseLabel;
    el.statusSub.textContent = `${done}/${scenes.length} listas`;
  } else if (blocked) {
    hero.classList.add('paused');
    el.statusTitle.textContent = 'En pausa por un fallo';
    el.statusSub.textContent = 'Revisa y dale Reanudar / Saltar / Reintentar';
  } else if (done >= scenes.length && scenes.length) {
    hero.classList.add('done');
    el.statusTitle.textContent = 'Completado';
    el.statusSub.textContent = `${done}/${scenes.length} escenas`;
  } else {
    el.statusTitle.textContent = 'Listo';
    el.statusSub.textContent = `${done}/${scenes.length} hechas`;
  }

  // Metricas de produccion acumuladas (throughput): generaciones, errores, tiempo en cooldown.
  const m = state.metrics || {};
  if (m.generations) {
    const cd = m.cooldownMs ? `, ${Math.round(m.cooldownMs / 60000)}m cooldown` : '';
    el.statusSub.textContent += ` · ${m.generations} gen, ${m.errors || 0} err${cd}`;
  }
}

// Marca la escena activa (foco visual). Se reaplica tras cada renderScenes (replaceChildren la borra).
function setActiveScene(id) {
  currentSceneId = id || null;
  for (const li of el.sceneList.querySelectorAll('.scene-item.active')) li.classList.remove('active');
  if (!id) return;
  const li = el.sceneList.querySelector(`li[data-id="${id}"]`);
  if (li) { li.classList.add('active'); li.scrollIntoView({ block: 'nearest' }); }
}

// Confirmacion in-app (Promise<boolean>). Reemplaza window.confirm (que se ve mal en un side panel MV3).
function confirmInline(message, yesLabel = 'Confirmar') {
  return new Promise((resolve) => {
    el.confirmMsg.textContent = message;
    el.confirmYes.textContent = yesLabel;
    el.confirmOverlay.classList.remove('hidden');
    const done = (val) => {
      el.confirmOverlay.classList.add('hidden');
      el.confirmYes.removeEventListener('click', onYes);
      el.confirmNo.removeEventListener('click', onNo);
      resolve(val);
    };
    const onYes = () => done(true);
    const onNo = () => done(false);
    el.confirmYes.addEventListener('click', onYes);
    el.confirmNo.addEventListener('click', onNo);
  });
}

// Tracker de fases en vivo (Imagenes -> Animar -> Voz). Voz no es fase de cola (handler aparte) -> neutral.
function renderPhaseTracker(state) {
  const scenes = state.scenes || [];
  const q = state.queue || {};
  const has = scenes.length > 0;
  const imagesDone = has && scenes.every((s) => s.imageUrl || s.status === SCENE_STATUS.DONE);
  const animDone = has && scenes.every((s) => s.status === SCENE_STATUS.DONE);
  const running = !!q.running && !q.paused;
  const steps = el.phaseTracker.querySelectorAll('.phase-step');
  const set = (name, cls) => {
    const node = [...steps].find((x) => x.dataset.phase === name);
    if (!node) return;
    node.classList.remove('done', 'active');
    if (cls) node.classList.add(cls);
  };
  set('images', imagesDone ? 'done' : (running && q.phase === 'images' ? 'active' : ''));
  set('animation', animDone ? 'done' : (running && q.phase === 'animation' ? 'active' : ''));
  set('voice', '');
  const lines = el.phaseTracker.querySelectorAll('.phase-line');
  lines.forEach((l) => l.classList.remove('done'));
  if (imagesDone && lines[0]) lines[0].classList.add('done');
  if (animDone && lines[1]) lines[1].classList.add('done');
}

// Lista los JSON de la cola del dev-server (la misma que vigila pollQueue). El panel puede consultar
// localhost:35729 directo (CORS abierto + host permission). Best-effort: si el dev-server no corre, lo dice.
let lastQueueFetch = 0;
async function refreshQueue(force = false) {
  if (!force && Date.now() - lastQueueFetch < 3000) return; // throttle: render() se dispara mucho durante una corrida
  lastQueueFetch = Date.now();
  const url = (lastConfig && lastConfig.queueUrl) || DEFAULT_CONFIG.queueUrl;
  let jobs = [];
  try { jobs = await fetch(url).then((r) => r.json()); } catch (_e) { jobs = null; }
  el.queueList.replaceChildren();
  const empty = (txt) => { const li = document.createElement('li'); li.className = 'queue-empty'; li.textContent = txt; el.queueList.append(li); };
  if (jobs === null) return empty('Dev-server no responde (corre "flowbot start").');
  if (!Array.isArray(jobs) || !jobs.length) return empty('Cola vacia. Suelta JSON en remotion-editor/queue/.');
  for (const j of jobs) {
    const prov = j?.provider || j?.json?.pipeline?.image_generation?.tool;
    const li = document.createElement('li');
    li.className = 'queue-item' + (j.mediaComplete ? ' done' : '') + (j.valid === false ? ' invalid' : '');
    const name = document.createElement('span'); name.className = 'q-name'; name.textContent = j.name;
    li.append(name);
    if (prov === 'grok' || prov === 'flow') {
      const chip = document.createElement('span'); chip.className = 'q-prov' + (prov === 'grok' ? ' grok' : ''); chip.textContent = prov;
      li.append(chip);
    }
    const st = document.createElement('span'); st.className = 'muted'; st.textContent = j.mediaComplete ? '✓ hecho' : 'pendiente';
    const firstError = Array.isArray(j.errors) && j.errors.length ? j.errors[0] : '';
    st.textContent = j.valid === false ? `invalido: ${firstError || 'JSON invalido'}`
      : j.mediaComplete ? 'hecho'
      : Array.isArray(j.missingMedia) ? `${j.missingMedia.length} faltan`
      : 'pendiente';
    li.append(st);
    el.queueList.append(li);
  }
}

// Pobla los selectores de modelo y duracion (una vez).
function populateModels() {
  el.modelSelect.replaceChildren();
  for (const m of VIDEO_MODELS) {
    const opt = document.createElement('option');
    opt.value = m.flowText; // texto exacto que el driver busca en Flow
    opt.textContent = `${m.label}${m.hint ? ` · ${m.hint}` : ''}`;
    el.modelSelect.append(opt);
  }
  el.durationSelect.replaceChildren();
  for (const d of VIDEO_DURATIONS) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    el.durationSelect.append(opt);
  }
}

// Costo aprox por escena segun modelo + duracion (el real lo confirma Flow antes de generar).
// Omni varia por duracion (confirmado: 4s=7, 8s=12); los Veo usan su pts fijo.
function perSceneCost(model, durationLabel) {
  if (!model) return null;
  if (model.id === 'omni') return ({ '4s': 7, '6s': 10, '8s': 12, '10s': 15 })[durationLabel] ?? 7;
  return model.pts;
}

// Costo + duracion estimados para animar las escenas con imagen lista.
function updateEstimate() {
  const n = (lastScenes || []).filter((s) => s.status === SCENE_STATUS.IMAGE_DONE).length;
  const gen = clampInt(el.cfgGenerationCount.value, 1, 4);
  const model = VIDEO_MODELS.find((m) => m.flowText === el.modelSelect.value);
  const dur = el.durationSelect.value || DEFAULT_CONFIG.videoDuration;
  const per = perSceneCost(model, dur);
  el.estScenes.textContent = String(n);
  el.estCost.textContent = per != null ? `~${n * per * gen} pts` : (n > 0 ? 'costo variable' : '— pts');
  const secs = n * (parseInt(dur, 10) || 8);
  el.estDuration.textContent = secs >= 60 ? `~${Math.round(secs / 6) / 10} min` : `~${secs} s`;
}

// Muestra que voz se usara: lo pegado en el panel gana; si no, la del preset del JSON; si no, default.
function renderVoiceHint(state, cfg) {
  if (!el.voiceHint) return;
  const manual = (cfg.fishVoiceId || '').trim();
  const preset = state.project?.preset || '';
  const presetVoice = FISH_PRESETS[preset]?.voiceId || '';
  let txt;
  if (manual) txt = `Voz: la pegada aqui (${manual.slice(0, 10)}...).`;
  else if (presetVoice) txt = `Voz: preset "${preset}" (${presetVoice.slice(0, 10)}...). Modelo ${FISH_PRESETS[preset]?.model || cfg.fishModel}.`;
  else if (preset) txt = `Preset "${preset}" sin voz -> usa voz DEFAULT (${DEFAULT_VOICE_ID.slice(0, 10)}...).`;
  else txt = `Tu JSON no trae "preset" -> usa voz DEFAULT (${DEFAULT_VOICE_ID.slice(0, 10)}...). Para otra, pega un reference_id o agrega "preset":"esqueletos".`;
  el.voiceHint.textContent = txt;
}

function ingredientReady(ing) {
  return ing?.status === SCENE_STATUS.DONE || !!(ing?.imageFilePath || ing?.imageUrl);
}

function ingredientStatus(ing) {
  if (ing?.status === SCENE_STATUS.GENERATING_IMAGE) return { key: 'generating_image', text: 'Generando imagen' };
  if (ing?.status === SCENE_STATUS.ERROR) return { key: 'error', text: 'Error' };
  if (ing?.status === SCENE_STATUS.DONE) return { key: 'done', text: 'Listo' };
  if (ing?.imageFilePath) return { key: 'done', text: 'Archivo listo' };
  if (ing?.imageUrl) return { key: 'image_done', text: 'Imagen lista' };
  return { key: 'pending', text: 'Pendiente' };
}

function renderIngredients(ingredients, queue = {}) {
  const items = ingredients || [];
  el.ingredientsCard?.classList.toggle('hidden', items.length === 0);
  if (!el.ingredientList || !el.ingredientsSummary) return;
  el.ingredientList.replaceChildren();
  const ready = items.filter(ingredientReady).length;
  el.ingredientsSummary.textContent = `${ready} / ${items.length}`;
  const busy = !!queue.running && !queue.paused;

  for (const ing of items) {
    const st = ingredientStatus(ing);
    const li = document.createElement('li');
    li.className = 'scene-item ingredient-item' + (st.key === 'generating_image' ? ' active' : '');
    li.dataset.id = ing.id || '';

    const thumb = document.createElement(ing.imageUrl ? 'img' : 'div');
    thumb.className = 'scene-thumb ingredient-thumb';
    if (ing.imageUrl) {
      thumb.src = ing.imageUrl;
      thumb.alt = ing.id || 'ingrediente';
      thumb.addEventListener('error', () => {
        const ph = document.createElement('div');
        ph.className = 'scene-thumb ingredient-thumb';
        ph.textContent = ing.imageFilePath ? 'file' : '-';
        thumb.replaceWith(ph);
      });
    } else {
      thumb.textContent = ing.imageFilePath ? 'file' : '-';
    }

    const info = document.createElement('div');
    info.className = 'scene-info';

    const title = document.createElement('span');
    title.className = 'scene-id';
    title.textContent = ing.id || '(sin id)';

    const badge = document.createElement('span');
    badge.className = `badge status-${st.key}`;
    badge.textContent = st.text;
    info.append(title, badge);

    if (ing.error) {
      const err = document.createElement('span');
      err.className = 'scene-error';
      err.textContent = ing.error;
      info.append(err);
    }

    const meta = document.createElement('span');
    meta.className = 'scene-meta';
    meta.textContent = [ing.type, ing.outputFile].filter(Boolean).join(' -> ');
    if (meta.textContent) info.append(meta);

    const actions = document.createElement('div');
    actions.className = 'scene-actions';
    const retry = document.createElement('button');
    retry.className = 'btn small';
    retry.textContent = 'Rehacer';
    retry.title = 'Regenera solo este ingrediente y sobrescribe el asset si aplica.';
    retry.disabled = busy || st.key === 'generating_image';
    retry.addEventListener('click', () => send(msg(CMD.RETRY_INGREDIENT, { ingredientId: ing.id })));
    actions.append(retry);

    li.append(thumb, info, actions);
    el.ingredientList.append(li);
  }
}

function renderScenes(scenes) {
  el.sceneList.replaceChildren();
  for (const s of scenes) {
    const li = document.createElement('li');
    li.className = 'scene-item' + (s.id === currentSceneId ? ' active' : '') + (s.skipped ? ' skipped' : '');
    li.dataset.id = s.id;

    // Miniatura: usa la imagen generada si hay (puede no cargar por cookies/CORS -> placeholder).
    const thumb = document.createElement(s.imageUrl ? 'img' : 'div');
    thumb.className = 'scene-thumb';
    if (s.imageUrl) {
      thumb.src = s.imageUrl;
      thumb.alt = s.id;
      thumb.addEventListener('error', () => {
        const ph = document.createElement('div');
        ph.className = 'scene-thumb';
        ph.textContent = 'n/a';
        thumb.replaceWith(ph);
      });
    } else {
      thumb.textContent = '—';
    }

    const info = document.createElement('div');
    info.className = 'scene-info';
    const title = document.createElement('span');
    title.className = 'scene-id';
    title.textContent = s.id;
    const badge = document.createElement('span');
    badge.className = `badge status-${s.status}`;
    badge.textContent = badgeLabel(s.status);
    info.append(title, badge);

    if (s.error) {
      const err = document.createElement('span');
      err.className = 'scene-error';
      err.textContent = s.error;
      info.append(err);
    }

    const actions = document.createElement('div');
    actions.className = 'scene-actions';
    const addRetry = (label, mode, tip) => {
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = label;
      b.title = tip;
      b.addEventListener('click', () => send(msg(CMD.RETRY_SCENE, { sceneId: s.id, mode })));
      actions.append(b);
    };
    // El video ya existe en Flow (animacion ok o reintentada a mano): re-recoger + descargar, sin re-animar.
    if (s.videoUrl) addRetry('Re-descargar', 'download', 'Vuelve a recoger y descargar el video que ya existe en Flow (no re-anima, no gasta).');
    // La imagen ya existe: re-disparar la animacion sin regenerar la imagen.
    if (s.imageUrl) addRetry('Reanimar', 'anim', 'Vuelve a animar con la imagen ya generada (no la regenera).');
    // Siempre disponible: regenerar la imagen desde cero.
    addRetry(s.imageUrl ? 'Regen img' : 'Reintentar', 'image', 'Regenera la imagen desde cero.');

    li.append(thumb, info, actions);
    el.sceneList.append(li);
  }
}

function renderQueueButtons(queue, scenes) {
  const running = !!queue.running;
  const paused = !!queue.paused;
  const hasPending = (scenes || []).some((s) => s.status === SCENE_STATUS.PENDING);
  const hasImages = (scenes || []).some((s) => s.status === SCENE_STATUS.IMAGE_DONE);
  el.btnImages.disabled = running || !hasPending;
  el.btnAnimate.disabled = running || !hasImages;
  el.btnPause.disabled = !running || paused;
  el.btnResume.disabled = !paused;
  el.btnStop.disabled = !running;
  el.btnReset.disabled = running || (scenes || []).length === 0;
}

function renderProgress(scenes) {
  const total = scenes.length;
  const done = scenes.filter((s) => s.status === SCENE_STATUS.DONE).length;
  setProgress(done, total);
}

function setProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressLabel.textContent = `${done} / ${total}`;
}

// ---------------------------------------------------------------------------
// Log con timestamp + autoscroll
// ---------------------------------------------------------------------------
function appendLog(level, ts, message) {
  // Autoscroll REAL: solo baja si el usuario ya estaba al fondo (si esta leyendo arriba, no lo movemos).
  const atBottom = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 28;
  const line = document.createElement('div');
  line.className = `log-line log-${level || 'info'}`;
  const time = new Date(ts || Date.now()).toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  el.log.append(line);
  if (atBottom) el.log.scrollTop = el.log.scrollHeight;
}

// ---------------------------------------------------------------------------
// Banner de parada dura
// ---------------------------------------------------------------------------
function showHardStop(reason, message) {
  const reasonText = reason === 'no_credits' ? 'Sin creditos'
    : reason === 'rate_limit' ? 'Actividad inusual (enfriando)'
    : 'Captcha detectado';
  el.hardStopMsg.textContent = `${reasonText}: ${message || ''}`.trim();
  el.hardStopBanner.classList.remove('hidden');
}

function hideHardStop() {
  el.hardStopBanner.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Lectura de archivos
// ---------------------------------------------------------------------------
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Miniatura + nombre del personaje. Sin dataUrl -> placeholder gris.
function setCharPreview(name, dataUrl) {
  if (dataUrl) {
    el.charThumb.src = dataUrl;
    el.charThumb.classList.remove('placeholder');
    el.charName.textContent = name || '';
  } else {
    el.charThumb.removeAttribute('src');
    el.charThumb.classList.add('placeholder');
    el.charName.textContent = 'Sin imagen';
  }
}

// Procesa un File: JSON -> LOAD_JSON, imagen -> LOAD_CHARACTER_REF. Render con la respuesta.
async function handleFile(file) {
  if (!file) return;
  const isJson = file.type === 'application/json' || /\.json$/i.test(file.name);
  const isImage = file.type.startsWith('image/');

  if (isJson) {
    try {
      const text = await readFileAsText(file);
      const json = JSON.parse(text);
      loadedJsonName = file.name;
      const st = await send(msg(CMD.LOAD_JSON, { json }));
      if (st) render(st);
    } catch (err) {
      appendLog('error', Date.now(), `JSON invalido: ${err.message}`);
    }
  } else if (isImage) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const st = await send(msg(CMD.LOAD_CHARACTER_REF, { name: file.name, dataUrl }));
      if (st) render(st);
      else setCharPreview(file.name, dataUrl);
    } catch (err) {
      appendLog('error', Date.now(), `Imagen invalida: ${err.message}`);
    }
  } else {
    appendLog('warn', Date.now(), `Archivo no soportado: ${file.name}`);
  }
}

// ---------------------------------------------------------------------------
// Listeners de UI
// ---------------------------------------------------------------------------
function wireInputs() {
  // Cargar JSON
  el.jsonInput.addEventListener('change', async (e) => {
    await handleFile(e.target.files?.[0]);
    e.target.value = '';
  });

  // Cargar imagen de personaje
  el.charInput.addEventListener('change', async (e) => {
    await handleFile(e.target.files?.[0]);
    e.target.value = '';
  });

  wireDragDrop();

  // Cerrar el banner de parada dura.
  el.hardStopClose.addEventListener('click', hideHardStop);

  // Limpiar TODO el estado de la extension.
  el.btnClearAll.addEventListener('click', async () => {
    if (!(await confirmInline('Borrar TODO el estado (JSON, escenas, personaje, config)?\nNo afecta lo ya creado en Flow.', 'Borrar'))) return;
    loadedJsonName = '';
    hideHardStop();
    el.log.replaceChildren();
    const st = await send(msg(CMD.CLEAR_ALL));
    if (st) render(st);
  });

  // Autopiloto: encadena todo de un tiron.
  el.btnRunAll.addEventListener('click', async () => {
    if (lastConfig.dryRun) { appendLog('warn', Date.now(), 'Dry-run activo: el autopiloto solo simulara.'); }
    if (!(await confirmInline('AUTOPILOTO: prepara Flow, genera imagenes, ANIMA (gasta puntos) y crea la voz (creditos Fish), todo seguido.\n\n¿Continuar?', 'Hacer todo'))) return;
    hideHardStop();
    send(msg(CMD.RUN_ALL));
  });

  // Botones de fase
  el.btnImages.addEventListener('click', () => { hideHardStop(); send(msg(CMD.START_IMAGES)); });
  el.btnAnimate.addEventListener('click', async () => {
    const n = lastScenes.filter((s) => s.status === SCENE_STATUS.IMAGE_DONE).length;
    if (n === 0) { appendLog('warn', Date.now(), 'No hay imagenes listas para animar.'); return; }
    const gen = clampInt(el.cfgGenerationCount.value, 1, 4);
    const model = VIDEO_MODELS.find((m) => m.flowText === el.modelSelect.value);
    const dur = el.durationSelect.value || DEFAULT_CONFIG.videoDuration;
    const per = perSceneCost(model, dur);
    const costStr = per != null ? `~${n * per * gen} puntos` : 'costo variable (lo confirma Flow)';
    const dry = lastConfig.dryRun ? '\n\n[SIMULACION: dry-run activo, no toca Flow]' : '';
    if (await confirmInline(`Vas a ANIMAR ${n} escena(s) con ${model ? model.label : 'el modelo elegido'} (${dur}).\nCosto estimado: ${costStr}.${dry}\n\n¿Continuar?`, `Animar (${costStr})`)) {
      hideHardStop();
      send(msg(CMD.START_ANIMATION));
    }
  });
  el.btnPause.addEventListener('click', () => send(msg(CMD.PAUSE)));
  el.btnResume.addEventListener('click', () => send(msg(CMD.RESUME)));
  el.btnStop.addEventListener('click', () => send(msg(CMD.STOP)));

  // Banner de recuperacion por fallo.
  el.btnErrResume.addEventListener('click', async () => {
    el.errorBanner.classList.add('hidden');
    const st = await send(msg(CMD.RESUME)); if (st) render(st);
  });
  el.btnErrSkip.addEventListener('click', async () => {
    el.errorBanner.classList.add('hidden');
    const st = await send(msg(CMD.SKIP_SCENE, { sceneId: el.btnErrSkip.dataset.sceneId || null })); if (st) render(st);
  });
  el.btnErrRetryAll.addEventListener('click', async () => {
    const errs = (lastScenes || []).filter((s) => s.status === SCENE_STATUS.ERROR);
    const anim = errs.filter((s) => s.imageUrl);
    if (anim.length) {
      const model = VIDEO_MODELS.find((m) => m.flowText === el.modelSelect.value);
      const per = perSceneCost(model, el.durationSelect.value || DEFAULT_CONFIG.videoDuration);
      const costStr = per != null ? `~${anim.length * per} puntos` : 'costo variable';
      if (!(await confirmInline(`Reintentar ${errs.length} escena(s) en error.\n${anim.length} re-ANIMARAN (cuesta ${costStr}).\n\n¿Continuar?`, 'Reintentar'))) return;
    }
    el.errorBanner.classList.add('hidden');
    const st = await send(msg(CMD.RETRY_ALL_ERRORS)); if (st) render(st);
  });
  el.btnReset.addEventListener('click', async () => {
    if (!(await confirmInline('Reiniciar todas las escenas a "Pendiente"? Esto NO borra lo ya generado en Flow; solo permite volver a generar.', 'Reiniciar'))) return;
    hideHardStop();
    const st = await send(msg(CMD.RESET_SCENES));
    if (st) render(st);
  });

  // Toggles
  el.toggleDryRun.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { dryRun: e.target.checked } }));
  });
  el.toggleInspector.addEventListener('change', (e) => {
    send(msg(CMD.TOGGLE_INSPECTOR, { enabled: e.target.checked }));
  });
  el.toggleParallel.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { parallelAnimation: e.target.checked } }));
  });
  el.toggleAutoQueue.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { autoQueue: e.target.checked } }));
  });

  // Modelo de video -> guarda y refresca el estimado.
  el.modelSelect.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { videoModel: e.target.value } }));
    updateEstimate();
  });

  // Duracion del video -> guarda y refresca el estimado.
  el.providerSelect.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { provider: e.target.value } }));
  });
  el.durationSelect.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { videoDuration: e.target.value } }));
    updateEstimate();
  });

  // Config numerica/seleccion -> SET_CONFIG en cada cambio
  el.cfgResolution.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { downloadResolution: e.target.value } }));
  });
  el.cfgConcurrency.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { concurrency: clampInt(e.target.value, 1, 2) } }));
  });
  el.cfgDelayMin.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { delayMinMs: clampInt(e.target.value, 0) } }));
  });
  el.cfgDelayMax.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { delayMaxMs: clampInt(e.target.value, 0) } }));
  });
  el.cfgMaxRetries.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { maxRetries: clampInt(e.target.value, 0) } }));
  });
  el.cfgGenerationCount.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { generationCount: clampInt(e.target.value, 1, 4) } }));
    updateEstimate();
  });

  // Palancas de ritmo / anti-deteccion. (Tipeo, tope/hora y descanso estan HARDCODEADOS en el SW: ya no se exponen.)
  el.cfgInterMin.addEventListener('change', (e) => send(msg(CMD.SET_CONFIG, { config: { interSceneDelayMinMs: clampInt(e.target.value, 0) } })));
  el.cfgInterMax.addEventListener('change', (e) => send(msg(CMD.SET_CONFIG, { config: { interSceneDelayMaxMs: clampInt(e.target.value, 0) } })));

  // Cola automatica: refrescar lista a mano.
  el.btnQueueRefresh.addEventListener('click', () => refreshQueue(true));

  // Log: filtros (Todo/Warn/Error) + copiar.
  for (const b of document.querySelectorAll('.log-filter[data-filter]')) {
    b.addEventListener('click', () => {
      document.querySelectorAll('.log-filter[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
      el.log.className = `log filter-${b.dataset.filter}`;
    });
  }
  el.btnLogCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.log.innerText); el.btnLogCopy.textContent = 'Copiado ✓'; setTimeout(() => { el.btnLogCopy.textContent = 'Copiar'; }, 1200); }
    catch (_e) { appendLog('warn', Date.now(), 'No pude copiar el log al portapapeles.'); }
  });

  // Config de Fish Audio (voz). 'change' = al salir del campo -> guarda.
  el.fishApiKey.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { fishApiKey: e.target.value.trim() } }));
  });
  el.fishVoiceId.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { fishVoiceId: e.target.value.trim() } }));
  });
  el.fishModel.addEventListener('change', (e) => {
    send(msg(CMD.SET_CONFIG, { config: { fishModel: e.target.value } }));
  });

  // Audio: prueba (solo la 1a escena, sin hook) y completo (hook + todas).
  el.btnAudioTest.addEventListener('click', () => {
    if (!el.fishApiKey.value.trim()) { appendLog('error', Date.now(), 'Falta tu API key de Fish (Configuracion).'); return; }
    send(msg(CMD.GENERATE_AUDIO, { limit: 1, includeHook: false }));
  });
  el.btnAudioAll.addEventListener('click', async () => {
    if (!el.fishApiKey.value.trim()) { appendLog('error', Date.now(), 'Falta tu API key de Fish (Configuracion).'); return; }
    const n = (lastScenes || []).filter((s) => (s.voiceoverText || '').trim()).length;
    if (!(await confirmInline(`Vas a generar la voz de ${n} escena(s) + hook con Fish Audio (usa creditos Fish).\n\n¿Continuar?`, 'Generar voz'))) return;
    send(msg(CMD.GENERATE_AUDIO, { includeHook: true }));
  });
  // Solo faltantes: el SW verifica en disco (via dev-server) que mp3 existen y genera SOLO los que
  // faltan -> recuperar un audio caido no re-gasta creditos de los que ya estan.
  el.btnAudioMissing?.addEventListener('click', () => {
    send(msg(CMD.GENERATE_AUDIO, { includeHook: true, missingOnly: true }));
  });
}

// ---------------------------------------------------------------------------
// Drag & drop: dropzone visible + toda la ventana del panel
// ---------------------------------------------------------------------------
function wireDragDrop() {
  // Evita que el navegador abra el archivo al arrastrarlo sobre la ventana.
  document.addEventListener('dragover', (e) => e.preventDefault());

  const dz = el.dropzone;
  const activate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.add('dragover');
  };
  const deactivate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('dragover');
  };

  dz.addEventListener('dragenter', activate);
  dz.addEventListener('dragover', activate);
  dz.addEventListener('dragleave', deactivate);

  // Soltar sobre la dropzone o sobre cualquier parte del documento.
  const onDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      await handleFile(file);
    }
  };
  dz.addEventListener('drop', onDrop);
  document.addEventListener('drop', onDrop);
}

function clampInt(value, min, max) {
  let n = parseInt(value, 10);
  if (Number.isNaN(n)) n = min;
  if (n < min) n = min;
  if (max != null && n > max) n = max;
  return n;
}

// ---------------------------------------------------------------------------
// Recepcion de eventos desde el background
// ---------------------------------------------------------------------------
function wireRuntime() {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;
    switch (message.type) {
      case EVT.STATE_UPDATE:
        render(message.state);
        break;
      case EVT.SCENE_STATUS:
        updateSceneBadge(message.sceneId, message.status, message.error);
        break;
      case EVT.PROGRESS:
        setProgress(message.done, message.total);
        setActiveScene(message.currentSceneId);
        break;
      case EVT.LOG:
        appendLog(message.level, message.ts, message.message);
        break;
      case EVT.HARD_STOP:
        showHardStop(message.reason, message.message);
        break;
      case EVT.PAUSED_BY_ERROR:
        setActiveScene(null);
        if (el.errorBannerMsg) el.errorBannerMsg.textContent = message.sceneId ? ` ${message.sceneId}: ${message.error || 'fallo'}` : ` ${message.error || 'fallo'}`;
        if (el.btnErrSkip) el.btnErrSkip.dataset.sceneId = message.sceneId || '';
        el.btnErrSkip?.classList.toggle('hidden', !message.sceneId);
        el.errorBanner?.classList.remove('hidden');
        break;
      default:
        break;
    }
  });
}

// Actualiza solo el badge de una escena (parche fino sin re-render completo).
function updateSceneBadge(sceneId, status, error) {
  const li = el.sceneList.querySelector(`li[data-id="${sceneId}"]`);
  if (!li) return;
  const badge = li.querySelector('.badge');
  if (badge) {
    badge.className = `badge status-${status}`;
    badge.textContent = badgeLabel(status);
  }
  let errEl = li.querySelector('.scene-error');
  if (error) {
    if (!errEl) {
      errEl = document.createElement('span');
      errEl.className = 'scene-error';
      li.querySelector('.scene-info').append(errEl);
    }
    errEl.textContent = error;
  } else if (errEl) {
    errEl.remove();
  }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
async function init() {
  populateModels();
  wireInputs();
  wireRuntime();
  const state = await send(msg(CMD.GET_STATE));
  render(state);
  // Replica el historial persistido (logs que ocurrieron con el panel cerrado).
  try {
    const history = await send(msg(CMD.GET_LOG));
    if (Array.isArray(history) && history.length) {
      el.log.replaceChildren();
      for (const e of history) appendLog(e.level, e.ts, e.message);
    }
  } catch (_e) { /* sin historial */ }
}

init();
