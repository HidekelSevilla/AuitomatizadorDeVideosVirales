// lib/orchestrator.js
// Orquestacion PURA y TESTEABLE del bucle de la cola, extraida de background/service-worker.js (#7 del
// roadmap senior). NO toca chrome.* / fetch / Date / setTimeout / Math.random: TODO efecto entra por el
// objeto `deps` inyectado. El SW le pasa deps reales; los tests le pasan deps falsas con reloj simulado.
//
// REGLA #1: preservar comportamiento exacto (mismas pausas, mismo gasto de puntos, misma recuperacion).
//
// deps = {
//   getState(): AppState            // MISMA referencia viva (no clon): las funciones mutan state in-place
//   saveState(): Promise<void>
//   emitState(), emitProgress(), emitSceneStatus(id,status,error?), log(level,msg)
//   runners: { image(scene,prevSceneId,refName), animation(scene), parallelAnimation() }  // dispatch lo arma el SW
//   effects: { onHardStop(reason,msg), pauseForError(msg,sceneId), beforeFinalAnimationRetry(scenes),
//              detachDebuggers(), reportFailuresAtEnd(), heartbeatJobLock() }
//   loop: { isRunning(): bool, setRunning(b): void }   // loopRunning vive en el SW (compartido con pollQueue)
//   now(): number, sleep(ms): Promise<void>
// }

import { nextSceneIndexByStatus } from "./queue.js";
import { jitterDelay, SCENE_STATUS, LOG_LEVEL, DEFAULT_CONFIG } from "./messaging.js";

// Clasifica un error para decidir si reintentar tiene sentido. PURA (sin deps), tambien export suelto.
//   'environment' -> no hay pestana/dev-server/debugger: reintentar 3x con backoff es inutil.
//   'selector'    -> DOM/boton no encontrado = bug determinista: reintentar no lo arregla.
//   'generation'  -> la IA fallo / rate puntual / timing: SI vale reintentar.
export function classifyError(reason) {
  const r = (reason || "").toLowerCase();
  // Still/asset RECHAZADO por integridad ("archivo demasiado pequeno"/corrupto): lo malo fue la DESCARGA,
  // no el entorno (aunque el mensaje diga "dev-server") -> regenerar la imagen SI vale (es gratis).
  // Va ANTES del check de environment para que "rechazado por dev-server" no caiga en fail-fast.
  if (/still rechazado|demasiado pequeno|posible corrupto|descarga incompleta/i.test(r)) return "generation";
  // Canal muerto (pestana navegada/crasheada, content script desaparecido): reintentar a ciegas repetia
  // esperas de hasta 6 min contra una pestana muerta -> fail-fast como problema de entorno.
  if (/message channel closed|message port closed|receiving end does not exist/i.test(r)) return "environment";
  if (/no hay pestana|dev-server|debugger|no se pudo adjuntar|pestana de (flow|grok)/i.test(r)) return "environment";
  // 'no soportado'/'handoff' = combinacion de proveedores invalida (config), determinista: NO reintentar (no re-disparar nada pagado).
  if (/no encuentro|no existe el|selector|el editor|boton|button|contenteditable|chip de ajustes|menu de esta|no soportado|handoff/i.test(r)) return "selector";
  return "generation";
}

// Una referencia de escena solo esta lista cuando existe un asset que los runners puedan adjuntar.
// El status por si solo NO basta: un IMAGE_DONE sin URL/ruta fue precisamente una de las causas de
// referencias omitidas y generaciones visualmente incorrectas.
export function sceneHasImage(scene) {
  return !!(scene?.imageUrl || scene?.imageFilePath);
}

function imagePhaseComplete(scene) {
  if (sceneHasImage(scene)) return true;
  return [
    SCENE_STATUS.IMAGE_DONE,
    SCENE_STATUS.ANIMATING,
    SCENE_STATUS.DOWNLOADING,
    SCENE_STATUS.EXTRACTING_FRAME,
    SCENE_STATUS.DONE,
  ].includes(scene?.status);
}

export function unresolvedImageDependencies(scenes, scene) {
  const byId = new Map((Array.isArray(scenes) ? scenes : []).map((s) => [s.id, s]));
  const ids = [];
  for (const ref of (Array.isArray(scene?.sceneRefs) ? scene.sceneRefs : [])) {
    if (!ref?.sceneId) continue;
    const source = byId.get(ref.sceneId);
    if (!source || !sceneHasImage(source)) ids.push(ref.sceneId);
  }
  return [...new Set(ids)];
}

export function nextRunnableImageIndex(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  for (let i = 0; i < list.length; i++) {
    const scene = list[i];
    if (scene.status !== SCENE_STATUS.PENDING || scene.skipped) continue;
    if (unresolvedImageDependencies(list, scene).length === 0) return i;
  }
  return -1;
}

export function unresolvedImageScenes(scenes) {
  return (Array.isArray(scenes) ? scenes : []).filter((s) => !s.skipped && !imagePhaseComplete(s));
}

// Barrera de cierre de animacion. A diferencia de imagenes, una escena saltada sigue siendo un medio
// requerido por el render: "Saltar" solo permite terminar las escenas independientes; no convierte el
// trabajo incompleto en exitoso ni autoriza a la cola a tomar el JSON siguiente.
export function unresolvedAnimationScenes(scenes, project = null) {
  const list = Array.isArray(scenes) ? scenes : [];
  const hasAnimated = list.some((s) => s?.renderMode === "animated");
  if (project?.imageOnly && !hasAnimated) return [];
  return list.filter((s) => {
    if (project?.perSceneRender && s?.renderMode !== "animated") return false;
    return s?.status !== SCENE_STATUS.DONE;
  });
}

function canUseFinalImageRetry(scene) {
  if (!scene || scene.skipped || scene.status !== SCENE_STATUS.ERROR || sceneHasImage(scene)) return false;
  // Politica de imagenes: el usuario prefiere completar la corrida aunque un cierre de canal haya dejado
  // una generacion huerfana. Se autoriza UN segundo Enter al final, despues de terminar independientes.
  // imageFinalRetryUsed impide un bucle/gasto ilimitado. Animacion no usa esta ruta.
  return !scene.imageFinalRetryUsed;
}

function canUseFinalAnimationRetry(scene) {
  if (!scene || scene.skipped || scene.status !== SCENE_STATUS.ERROR || !sceneHasImage(scene)) return false;
  return scene.errorPhase === "animation" && !scene.animationFinalRetryUsed;
}

export function createOrchestrator(deps) {
  // Checks por defecto del bucle UNICO (runQueue). Los carriles paralelos (runLane) inyectan los suyos.
  const queueActive = () => { const s = deps.getState(); return !!s.queue.running && !s.queue.paused; };
  const queueBeat = () => { deps.getState().queue.heartbeatAt = deps.now(); };

  // Espera larga PERO interrumpible: chequea actividad cada ~2s para respetar pausa/stop y late el
  // heartbeat (asi pollQueue sabe que sigue vivo aunque el SW se duerma). isActive/onBeat inyectables
  // para que los carriles miren SU propio running/heartbeat; default = el bucle unico (comportamiento exacto).
  async function interruptibleDelay(totalMs, isActive = queueActive, onBeat = queueBeat) {
    let waited = 0, sinceSave = 0;
    while (waited < totalMs) {
      if (!isActive()) return false;
      const step = Math.min(2000, totalMs - waited);   // chequea pausa cada ~2s
      await deps.sleep(step);
      waited += step; sinceSave += step;
      if (sinceSave >= 15000) { onBeat(); await deps.saveState(); deps.effects.heartbeatJobLock(); sinceSave = 0; }  // latido cada ~15s
    }
    onBeat(); await deps.saveState();
    return true;
  }

  // Ritmo humano sostenido entre escenas (anti-deteccion). Inter-escena con jitter, warmup mas lento,
  // descanso largo cada N, y tope por hora. Contadores en state.pacing (persisten; el SW MV3 se duerme).
  async function applyPacingAfterScene(provider, isActive = queueActive, onBeat = queueBeat) {
    const state = deps.getState();
    const c = state.config;
    // Bucket de ritmo: global (state.pacing) por defecto = comportamiento exacto. Si se pasa `provider`
    // (carriles paralelos), bucket SEPARADO por proveedor (state.pacing.byProvider[provider]) para que el
    // tope/hora y los descansos de Flow y Grok NO se mezclen al correr a la vez.
    let p;
    if (provider) {
      state.pacing = state.pacing || {};
      state.pacing.byProvider = state.pacing.byProvider || {};
      // Bucket por proveedor SOLO para ritmo (ventana/hora + sessionGen). El cooldown de rate-limit es
      // INTENCIONALMENTE GLOBAL (onRateLimit pausa AMBOS carriles y escala 5->15->45 min en state.pacing
      // raiz); no duplicamos cooldownUntil/cooldownStep aqui para no sugerir un aislamiento que no existe.
      p = state.pacing.byProvider[provider] = state.pacing.byProvider[provider] || { windowStart: 0, windowCount: 0, sessionGen: 0 };
    } else {
      p = state.pacing = state.pacing || { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0 };
    }
    const now = deps.now();
    if (!p.windowStart || now - p.windowStart > 3600000) { p.windowStart = now; p.windowCount = 0; }
    p.windowCount += 1;
    p.sessionGen += 1;
    if (state.metrics) { state.metrics.generations = (state.metrics.generations || 0) + 1; if (!state.metrics.since) state.metrics.since = now; }

    let waitMs;
    if ((c.longBreakEvery ?? 0) > 0 && p.sessionGen % c.longBreakEvery === 0) {
      waitMs = jitterDelay(c.longBreakMinMs, c.longBreakMaxMs, p.sessionGen);
      deps.log(LOG_LEVEL.INFO, `Descanso anti-deteccion: ${Math.round(waitMs / 1000)}s (tras ${p.sessionGen} generaciones).`);
    } else {
      waitMs = jitterDelay(c.interSceneDelayMinMs, c.interSceneDelayMaxMs, p.sessionGen);
      if (p.sessionGen <= (c.warmupCount ?? 0)) waitMs = Math.round(waitMs * 1.5); // arranque suave
    }
    if ((c.maxGenerationsPerHour ?? 0) > 0 && p.windowCount >= c.maxGenerationsPerHour) {
      const restMs = Math.max(0, 3600000 - (now - p.windowStart));
      // Tope de pausa: si maxHourlyPauseMs esta puesto, NO esperar toda la hora -> pausa MAX ese valor y arrancar
      // ventana nueva tras la pausa (mas throughput, menos anti-deteccion; pedido del usuario). Sin el flag = igual que antes.
      const pauseMs = (c.maxHourlyPauseMs ?? 0) > 0 ? Math.min(restMs, c.maxHourlyPauseMs) : restMs;
      if (pauseMs > waitMs) { deps.log(LOG_LEVEL.WARN, `Tope ${c.maxGenerationsPerHour}/hora: pauso ${Math.round(pauseMs / 60000)} min.`); waitMs = pauseMs; }
      p.windowStart = now + pauseMs; p.windowCount = 0;
    }
    await deps.saveState();
    deps.log(LOG_LEVEL.DEBUG, `Ritmo: espero ${Math.round(waitMs / 1000)}s antes de la siguiente escena.`);
    await interruptibleDelay(waitMs, isActive, onBeat);
  }

  async function completeStaticAnimationNoops() {
    const state = deps.getState();
    if (!state.project?.perSceneRender) return 0;
    let changed = 0;
    for (const s of state.scenes || []) {
      if (s.status === SCENE_STATUS.IMAGE_DONE && s.renderMode !== "animated") {
        s.status = SCENE_STATUS.DONE;
        s.error = null;
        changed++;
        deps.emitSceneStatus(s.id, SCENE_STATUS.DONE);
      }
    }
    if (!changed) return 0;
    await deps.saveState();
    deps.emitState();
    deps.emitProgress();
    deps.log(LOG_LEVEL.INFO, `Animacion: ${changed} escena(s) estatica(s) listas sin animar ni aplicar ritmo.`);
    return changed;
  }

  // Ejecuta una escena reintentando hasta config.maxRetries con backoff. El dispatch dry/grok/real lo
  // resuelve el SW dentro de deps.runners.image/animation (el orquestador no conoce provider).
  async function processSceneWithRetries(scene, prevSceneId, refName, phase, isActive = queueActive) {
    const maxRetries = deps.getState().config.maxRetries ?? DEFAULT_CONFIG.maxRetries;

    const pauseOrDefer = async (state, message) => {
      if (phase === "images") {
        deps.log(LOG_LEVEL.WARN, `${message}. Continuo con las imagenes independientes; esta escena se revisara al final.`);
        return;
      }
      // Un clip fallido ya no bloquea las otras animaciones. Se conserva la imagen y el intento,
      // se completan las escenas independientes y al cierre se concede UN reenvio limpio. Si esa
      // segunda pasada tambien falla, animationFinalRetryUsed hace que recien entonces se pause.
      if (phase === "animation" && !scene.animationFinalRetryUsed) {
        deps.log(LOG_LEVEL.WARN, `${message}. Continuo con las animaciones independientes; reiniciare Grok y reintentare esta escena una sola vez al final.`);
        return;
      }
      if (state.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure) await deps.effects.pauseForError(message, scene.id);
    };

    while (scene.attempts <= maxRetries) {
      const state = deps.getState();
      if (!isActive()) return;

      scene.attempts += 1;
      try {
        if (phase === "animation") await deps.runners.animation(scene);
        else await deps.runners.image(scene, prevSceneId, refName);
        return; // Exito: la escena queda DONE dentro del runner.
      } catch (e) {
        const reason = e?.message ?? String(e);

        if (e?.hardStop) {
          // CAPTCHA/cuota/rate-limit cortan antes de obtener un medio util. No dejar la tarjeta en
          // GENERATING_IMAGE para siempre: debe quedar PENDING y reanudable en el mismo punto cuando
          // desaparezca el bloqueo. Tampoco consume un intento de generacion.
          scene.status = SCENE_STATUS.PENDING;
          scene.error = `bloqueada por ${e.hardStop}: ${reason}`;
          scene.errorPhase = phase;
          scene.attempts = Math.max(0, Number(scene.attempts || 0) - 1);
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.PENDING, scene.error);
          deps.emitState();
          await deps.effects.onHardStop(e.hardStop, reason);
          return;
        }

        // El click pudo llegar a Grok pero se perdio el canal antes de adoptar el asset. Reintentar aqui
        // generaria una segunda imagen. Pausamos para recuperar/revisar, nunca re-enviamos ambiguamente.
        if (e?.noAutoRetry) {
          scene.status = SCENE_STATUS.ERROR; scene.error = reason; scene.attempts = maxRetries + 1;
          scene.errorPhase = phase;
          scene.noAutoRetry = true;
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason); deps.emitState();
          deps.log(LOG_LEVEL.ERROR, `Escena ${scene.id}: resultado posiblemente generado; bloqueo reintento automatico para evitar duplicado.`);
          await pauseOrDefer(state, `escena ${scene.id}: ${reason}`);
          return;
        }

        // Fallo NO-reintentable (entorno/selector): reintentar solo gasta tiempo -> fail-fast + pausa.
        const kind = classifyError(reason);
        if (kind !== "generation") {
          scene.status = SCENE_STATUS.ERROR; scene.error = reason; scene.attempts = maxRetries + 1;
          scene.errorPhase = phase;
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason); deps.emitState();
          deps.log(LOG_LEVEL.ERROR, `Escena ${scene.id}: fallo no-reintentable (${kind}): ${reason}`);
          await pauseOrDefer(state, `escena ${scene.id} (${kind}): ${reason}`);
          return;
        }

        // En imagenes no quemar maxRetries consecutivos bloqueando toda la cola. El primer fallo
        // recuperable se difiere; runQueue termina las independientes y concede UN intento final.
        if (phase === "images") {
          scene.status = SCENE_STATUS.ERROR;
          scene.error = reason;
          scene.errorPhase = phase;
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason); deps.emitState();
          deps.log(LOG_LEVEL.WARN, `Escena ${scene.id}: fallo de imagen diferido tras el primer intento: ${reason}. Reintento automatico reservado para la segunda pasada final.`);
          await pauseOrDefer(state, `escena ${scene.id} fallo: ${reason}`);
          return;
        }

        scene.error = reason;
        await deps.saveState();
        deps.log(LOG_LEVEL.WARN, `Escena ${scene.id} intento ${scene.attempts}/${maxRetries + 1} fallo: ${reason}`);

        if (scene.attempts > maxRetries) {
          scene.status = SCENE_STATUS.ERROR;
          scene.errorPhase = phase;
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason);
          deps.emitState();
          deps.log(LOG_LEVEL.ERROR, `Escena ${scene.id} marcada ERROR tras agotar reintentos.`);
          await pauseOrDefer(state, `escena ${scene.id} fallo: ${reason}`);
          return;
        }

        const base = jitterDelay(state.config.delayMinMs, state.config.delayMaxMs, scene.attempts);
        const backoff = base * Math.pow(2, scene.attempts - 1);
        deps.log(LOG_LEVEL.INFO, `Backoff ${backoff}ms antes de reintentar ${scene.id}.`);
        await deps.sleep(backoff);
      }
    }
  }

  // Bucle principal. Relee el state en cada iteracion (no confia en timers vivos). concurrency = 1.
  async function runQueue() {
    deps.loop.setRunning(true);
    deps.log(LOG_LEVEL.INFO, "Bucle de cola iniciado.");

    while (true) {
      const state = deps.getState();
      state.queue.heartbeatAt = deps.now();   // latido: pollQueue distingue loop vivo de "running" huerfano
      deps.effects.heartbeatJobLock();         // mantiene fresco el lock del job (no se relista por rancio)

      if (!state.queue.running || state.queue.paused) {
        deps.log(LOG_LEVEL.INFO, "Bucle detenido (paused/stop).");
        break;
      }

      const phase = state.queue.phase || "images";
      if (phase === "animation") await completeStaticAnimationNoops();

      // ANIMACION PARALELA: dispara todas y recoge en una pasada. Tras esto no quedan IMAGE_DONE.
      if (phase === "animation" && !state.config.dryRun && (state.config.parallelAnimation ?? false) && (state.project?.animationProvider || state.config.provider) !== "grok") {
        // Sin este catch, una excepcion no contemplada subia hasta el .catch mudo de la alarma: el bucle
        // moria sin pausa, sin log y con el job de la cola colgado (solo se relistaba por lock rancio).
        try { await deps.runners.parallelAnimation(); }
        catch (e) {
          if (e?.hardStop) { await deps.effects.onHardStop(e.hardStop, e?.message ?? String(e)); break; }
          deps.log(LOG_LEVEL.ERROR, `Animacion paralela abortada: ${e?.message ?? e}`);
          await deps.effects.pauseForError(`animacion paralela: ${e?.message ?? e}`, null);
          break;
        }
        const s2 = deps.getState();
        if (!s2.queue.running || s2.queue.paused) break; // pausa/stop -> salir; resume re-entra
        s2.queue.running = false;
        await deps.saveState();
        deps.effects.detachDebuggers();
        deps.effects.reportFailuresAtEnd();
        deps.log(LOG_LEVEL.INFO, "Fase 'animation' (paralela) finalizada.");
        deps.emitState();
        deps.emitProgress();
        break;
      }

      const target = phase === "animation" ? SCENE_STATUS.IMAGE_DONE : SCENE_STATUS.PENDING;
      let idx = phase === "images"
        ? nextRunnableImageIndex(state.scenes)
        : nextSceneIndexByStatus(state.scenes, 0, target);
      // RECUPERACION SIN RE-GASTO (fase animation): si no quedan IMAGE_DONE, recoger las ANIMATING con
      // video YA pagado (retry "download", SW interrumpido tras el fire). Antes solo el runner paralelo
      // las recogia (parallelAnimation off por default) -> quedaban varadas en ANIMATING para siempre.
      // Los runners con videoUrl saltan el disparo y van directo a recolectar/descargar (idempotentes).
      if (idx === -1 && phase === "animation") {
        idx = (state.scenes || []).findIndex((s) => s.status === SCENE_STATUS.ANIMATING && s.videoUrl && !s.skipped);
      }
      if (idx === -1) {
        if (phase === "images") {
          const finalRetry = (state.scenes || []).filter(canUseFinalImageRetry);
          if (finalRetry.length) {
            const maxRetries = state.config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
            for (const scene of finalRetry) {
              scene.status = SCENE_STATUS.PENDING;
              // La segunda pasada es UN solo intento adicional, no otro bloque completo de maxRetries.
              scene.attempts = maxRetries;
              scene.error = null;
              scene.errorPhase = "images";
              // El intento ambiguo anterior ya tuvo oportunidad de recuperarse. La segunda pasada es una
              // autorizacion deliberada para generar de nuevo, por lo que debe retirar su barrera durable.
              scene.grokImageAttempt = null;
              scene.noAutoRetry = false;
              scene.imageFinalRetryUsed = true;
              deps.emitSceneStatus(scene.id, SCENE_STATUS.PENDING);
            }
            await deps.saveState();
            deps.emitState(); deps.emitProgress();
            deps.log(LOG_LEVEL.WARN, `Segunda pasada de imagenes: reintento una sola vez ${finalRetry.length} fallo(s): ${finalRetry.map((s) => s.id).join(", ")}.`);
            continue;
          }

          const unresolved = unresolvedImageScenes(state.scenes);
          if (unresolved.length) {
            const details = unresolved.slice(0, 8).map((scene) => {
              const blockedBy = unresolvedImageDependencies(state.scenes, scene);
              return blockedBy.length ? `${scene.id} (espera ${blockedBy.join("+")})` : scene.id;
            }).join(", ");
            const first = unresolved.find((s) => s.status === SCENE_STATUS.ERROR) || unresolved[0];
            deps.log(LOG_LEVEL.ERROR, `Fase de imagenes incompleta: ${details}${unresolved.length > 8 ? ` y ${unresolved.length - 8} mas` : ""}. No avanzo a animacion/audio.`);
            await deps.effects.pauseForError(`imagenes incompletas: ${details}`, first?.id || null);
            deps.effects.reportFailuresAtEnd();
            break;
          }
        }

        if (phase === "animation") {
          const finalRetry = (state.scenes || []).filter(canUseFinalAnimationRetry);
          if (finalRetry.length) {
            // La primera corrida y sus intentos de recuperacion ya terminaron. El usuario prefiere
            // completar desatendido y autoriza un unico reenvio fresco por clip al final. Reiniciar el
            // proveedor una vez evita heredar el composer/post atascado que causo la tanda de fallos.
            try { await deps.effects.beforeFinalAnimationRetry?.(finalRetry); }
            catch (e) { deps.log(LOG_LEVEL.WARN, `No pude reiniciar el proveedor antes de la pasada final de animacion (${e?.message ?? e}); continuo con compositor fresco por escena.`); }
            const maxRetries = state.config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
            for (const scene of finalRetry) {
              scene.status = SCENE_STATUS.IMAGE_DONE;
              scene.attempts = maxRetries; // exactamente un intento nuevo
              scene.error = null;
              scene.errorPhase = "animation";
              scene.animationFinalRetryUsed = true;
              // Autorizacion deliberada de un video NUEVO: el intento anterior ya fue recuperado hasta
              // agotarse. Limpiar estas marcas evita que el runner vuelva a esperar el post roto.
              scene.videoUrl = null;
              scene.clipFilename = null;
              scene.lastFrameFilename = null;
              scene.savedOk = false;
              scene.grokFired = false;
              scene.grokVideoPostUrl = null;
              scene.grokAnimBefore = null;
              deps.emitSceneStatus(scene.id, SCENE_STATUS.IMAGE_DONE);
            }
            state.queue.errorSceneId = null;
            await deps.saveState();
            deps.emitState(); deps.emitProgress();
            deps.log(LOG_LEVEL.WARN, `Segunda pasada de animaciones: Grok reiniciado; reenvio una sola vez ${finalRetry.length} clip(s): ${finalRetry.map((s) => s.id).join(", ")}.`);
            continue;
          }
        }

        state.queue.running = false;
        await deps.saveState();
        deps.effects.detachDebuggers();
        deps.effects.reportFailuresAtEnd();
        deps.log(LOG_LEVEL.INFO, `Fase '${phase}' finalizada: no quedan escenas en estado '${target}'.`);
        deps.emitState();
        deps.emitProgress();
        break;
      }

      state.queue.currentIndex = idx;
      await deps.saveState();
      deps.emitProgress();

      const scene = state.scenes[idx];
      const statusBefore = scene.status;   // puede ser target O ANIMATING (recuperacion de video pagado)
      const prevSceneId = idx > 0 ? state.scenes[idx - 1].id : null;
      const refName = state.project?.characterRef?.name ?? null;

      await processSceneWithRetries(scene, prevSceneId, refName, phase);

      // Si una parada dura ocurrio durante el proceso, salimos.
      const s3 = deps.getState();
      if (s3.queue.paused || !s3.queue.running) {
        deps.log(LOG_LEVEL.INFO, "Bucle detenido tras procesar escena.");
        break;
      }

      // SALVAGUARDA ANTI-BUCLE: si la escena NO avanzo (sigue en el status con el que fue ELEGIDA), el runner
      // hizo no-op -> seria re-elegida para siempre (bug observado: animacion girando sin avanzar). La marcamos
      // ERROR y pausamos (mensaje claro) en vez de quemar tiempo girando.
      const processed = s3.scenes[idx];
      if (processed && processed.status === statusBefore) {
        processed.status = SCENE_STATUS.ERROR;
        processed.error = processed.error || "el runner no avanzo la escena (no-op)";
        processed.errorPhase = phase;
        processed.attempts = (deps.getState().config.maxRetries ?? DEFAULT_CONFIG.maxRetries) + 1;
        // En imagenes un no-op puede significar que el proveedor si recibio el prompt. No se vuelve a
        // enviar automaticamente: continuamos las independientes y paramos al final para recuperacion.
        if (phase === "images") processed.noAutoRetry = true;
        await deps.saveState();
        deps.emitSceneStatus(processed.id, SCENE_STATUS.ERROR, processed.error); deps.emitState();
        deps.log(LOG_LEVEL.ERROR, `Escena ${processed.id}: el runner no la avanzo (no-op) -> ERROR (evito bucle infinito).`);
        if (phase === "animation" && !processed.animationFinalRetryUsed) {
          deps.log(LOG_LEVEL.WARN, `Escena ${processed.id}: no-op diferido; continuo las animaciones independientes y la reintentare al final.`);
        } else if (phase !== "images" && (s3.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure)) {
          await deps.effects.pauseForError(`escena ${processed.id}: el runner no avanzo`, processed.id);
          break;
        }
        continue;
      }

      // RITMO HUMANO: si queda otra escena por hacer, espera (anti-deteccion). Sin espera al final.
      const phaseNow = s3.queue.phase || "images";
      const targetNow = phaseNow === "animation" ? SCENE_STATUS.IMAGE_DONE : SCENE_STATUS.PENDING;
      const hasMore = phaseNow === "images"
        ? (nextRunnableImageIndex(s3.scenes) !== -1 || s3.scenes.some(canUseFinalImageRetry))
        : nextSceneIndexByStatus(s3.scenes, 0, targetNow) !== -1;
      if (!s3.config.dryRun && hasMore) {
        await applyPacingAfterScene();
      }
    }

    deps.loop.setRunning(false);
  }

  // CARRIL de UNA fase fija para el PIPELINE PARALELO (flag config.parallelPipeline). laneConfig =
  // { laneId:'images'|'animation', phase, provider }. Consume escenas de UN solo status (PENDING o
  // IMAGE_DONE); los dos carriles miran status DISJUNTOS -> nunca compiten por la misma escena (sin lock).
  // El consumidor (animation) NO termina mientras el productor (images) siga vivo o queden ANIMATING en
  // vuelo. Ritmo/heartbeat POR carril (state.lanes[laneId]); el SW lanza ambos con Promise.all y finaliza.
  async function runLane(laneConfig) {
    const { laneId, phase, provider } = laneConfig;
    const ensureLane = () => { const s = deps.getState(); s.lanes = s.lanes || {}; s.lanes[laneId] = s.lanes[laneId] || { running: false, heartbeatAt: 0 }; return s.lanes[laneId]; };
    const laneActive = () => { const s = deps.getState(); return !!s.queue.running && !s.queue.paused && !!(s.lanes && s.lanes[laneId] && s.lanes[laneId].running); };
    const laneBeat = () => { ensureLane().heartbeatAt = deps.now(); };

    ensureLane().running = true;
    await deps.saveState();
    deps.log(LOG_LEVEL.INFO, `Carril '${laneId}' (${provider}) iniciado.`);
    const target = phase === "animation" ? SCENE_STATUS.IMAGE_DONE : SCENE_STATUS.PENDING;

    try {
      while (true) {
        const state = deps.getState();
        laneBeat();
        deps.effects.heartbeatJobLock();
        if (!laneActive()) { deps.log(LOG_LEVEL.INFO, `Carril '${laneId}' detenido (paused/stop).`); break; }
        if (phase === "animation") await completeStaticAnimationNoops();

        const idx = phase === "images" ? nextRunnableImageIndex(state.scenes) : nextSceneIndexByStatus(state.scenes, 0, target);
        if (idx === -1) {
          // Sin trabajo AHORA. El consumidor (animation) NO termina si el productor (images) sigue vivo o
          // hay escenas ANIMATING en vuelo -> espera y reintenta. El productor (images) si termina.
          const producerAlive = phase === "animation" && !!(state.lanes && state.lanes.images && state.lanes.images.running);
          const inFlight = phase === "animation" && nextSceneIndexByStatus(state.scenes, 0, SCENE_STATUS.ANIMATING) !== -1;
          if (producerAlive || inFlight) { await interruptibleDelay(1500, laneActive, laneBeat); continue; }
          break;
        }

        if (phase === "images") { state.queue.currentIndex = idx; await deps.saveState(); }  // espejo UI = carril productor
        deps.emitProgress();

        const scene = state.scenes[idx];
        const prevSceneId = idx > 0 ? state.scenes[idx - 1].id : null;
        const refName = state.project?.characterRef?.name ?? null;
        await processSceneWithRetries(scene, prevSceneId, refName, phase, laneActive);

        if (!laneActive()) break;
        const s3 = deps.getState();
        if (!s3.config.dryRun && nextSceneIndexByStatus(s3.scenes, 0, target) !== -1) await applyPacingAfterScene(provider, laneActive, laneBeat);
      }
    } finally {
      // SIEMPRE marca el carril detenido (aunque algo lance dentro): si no, el consumidor busy-waitearia
      // sobre un productor fantasma (lanes.images.running=true para siempre) y la corrida moriria en silencio.
      ensureLane().running = false;
      await deps.saveState();
      deps.effects.detachProvider?.(provider);   // suelta SOLO el debugger de la pestana de ESTE proveedor (no el del otro carril)
      deps.log(LOG_LEVEL.INFO, `Carril '${laneId}' finalizado.`);
    }
  }

  return { runQueue, runLane, processSceneWithRetries, applyPacingAfterScene, interruptibleDelay };
}
