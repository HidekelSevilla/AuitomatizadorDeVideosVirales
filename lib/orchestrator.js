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
//   effects: { onHardStop(reason,msg), pauseForError(msg,sceneId), detachDebuggers(), reportFailuresAtEnd(), heartbeatJobLock() }
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
  if (/no hay pestana|dev-server|debugger|no se pudo adjuntar|pestana de (flow|grok)/i.test(r)) return "environment";
  if (/no encuentro|no existe el|selector|el editor|boton|button|contenteditable|chip de ajustes|menu de esta/i.test(r)) return "selector";
  return "generation";
}

export function createOrchestrator(deps) {
  // Espera larga PERO interrumpible: relee el state cada ~2s para respetar pausa/stop y actualiza el
  // heartbeat (asi pollQueue sabe que el loop sigue vivo aunque el SW se duerma entre escenas).
  async function interruptibleDelay(totalMs) {
    let waited = 0, sinceSave = 0;
    while (waited < totalMs) {
      const state = deps.getState();
      if (!state.queue.running || state.queue.paused) return false;
      const step = Math.min(2000, totalMs - waited);   // chequea pausa cada ~2s
      await deps.sleep(step);
      waited += step; sinceSave += step;
      if (sinceSave >= 15000) { state.queue.heartbeatAt = deps.now(); await deps.saveState(); deps.effects.heartbeatJobLock(); sinceSave = 0; }  // latido cada ~15s
    }
    const state = deps.getState();
    state.queue.heartbeatAt = deps.now(); await deps.saveState();
    return true;
  }

  // Ritmo humano sostenido entre escenas (anti-deteccion). Inter-escena con jitter, warmup mas lento,
  // descanso largo cada N, y tope por hora. Contadores en state.pacing (persisten; el SW MV3 se duerme).
  async function applyPacingAfterScene() {
    const state = deps.getState();
    const c = state.config;
    const p = state.pacing = state.pacing || { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0 };
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
      if (restMs > waitMs) { deps.log(LOG_LEVEL.WARN, `Tope ${c.maxGenerationsPerHour}/hora: pauso ${Math.round(restMs / 60000)} min.`); waitMs = restMs; }
      p.windowStart = now + restMs; p.windowCount = 0;
    }
    await deps.saveState();
    deps.log(LOG_LEVEL.DEBUG, `Ritmo: espero ${Math.round(waitMs / 1000)}s antes de la siguiente escena.`);
    await interruptibleDelay(waitMs);
  }

  // Ejecuta una escena reintentando hasta config.maxRetries con backoff. El dispatch dry/grok/real lo
  // resuelve el SW dentro de deps.runners.image/animation (el orquestador no conoce provider).
  async function processSceneWithRetries(scene, prevSceneId, refName, phase) {
    const maxRetries = deps.getState().config.maxRetries ?? DEFAULT_CONFIG.maxRetries;

    while (scene.attempts <= maxRetries) {
      const state = deps.getState();
      if (state.queue.paused || !state.queue.running) return;

      scene.attempts += 1;
      try {
        if (phase === "animation") await deps.runners.animation(scene);
        else await deps.runners.image(scene, prevSceneId, refName);
        return; // Exito: la escena queda DONE dentro del runner.
      } catch (e) {
        const reason = e?.message ?? String(e);

        if (e?.hardStop) { await deps.effects.onHardStop(e.hardStop, reason); return; }

        // Fallo NO-reintentable (entorno/selector): reintentar solo gasta tiempo -> fail-fast + pausa.
        const kind = classifyError(reason);
        if (kind !== "generation") {
          scene.status = SCENE_STATUS.ERROR; scene.error = reason; scene.attempts = maxRetries + 1;
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason); deps.emitState();
          deps.log(LOG_LEVEL.ERROR, `Escena ${scene.id}: fallo no-reintentable (${kind}): ${reason}`);
          if (state.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure) await deps.effects.pauseForError(`escena ${scene.id} (${kind}): ${reason}`, scene.id);
          return;
        }

        scene.error = reason;
        await deps.saveState();
        deps.log(LOG_LEVEL.WARN, `Escena ${scene.id} intento ${scene.attempts}/${maxRetries + 1} fallo: ${reason}`);

        if (scene.attempts > maxRetries) {
          scene.status = SCENE_STATUS.ERROR;
          await deps.saveState();
          deps.emitSceneStatus(scene.id, SCENE_STATUS.ERROR, reason);
          deps.emitState();
          deps.log(LOG_LEVEL.ERROR, `Escena ${scene.id} marcada ERROR tras agotar reintentos.`);
          if (state.config.pauseOnFailure ?? DEFAULT_CONFIG.pauseOnFailure) await deps.effects.pauseForError(`escena ${scene.id} fallo: ${reason}`, scene.id);
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

      // ANIMACION PARALELA: dispara todas y recoge en una pasada. Tras esto no quedan IMAGE_DONE.
      if (phase === "animation" && !state.config.dryRun && (state.config.parallelAnimation ?? false) && state.config.provider !== "grok") {
        await deps.runners.parallelAnimation();
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
      const idx = nextSceneIndexByStatus(state.scenes, 0, target);
      if (idx === -1) {
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
      const prevSceneId = idx > 0 ? state.scenes[idx - 1].id : null;
      const refName = state.project?.characterRef?.name ?? null;

      await processSceneWithRetries(scene, prevSceneId, refName, phase);

      // Si una parada dura ocurrio durante el proceso, salimos.
      const s3 = deps.getState();
      if (s3.queue.paused || !s3.queue.running) {
        deps.log(LOG_LEVEL.INFO, "Bucle detenido tras procesar escena.");
        break;
      }

      // RITMO HUMANO: si queda otra escena por hacer, espera (anti-deteccion). Sin espera al final.
      const phaseNow = s3.queue.phase || "images";
      const targetNow = phaseNow === "animation" ? SCENE_STATUS.IMAGE_DONE : SCENE_STATUS.PENDING;
      if (!s3.config.dryRun && nextSceneIndexByStatus(s3.scenes, 0, targetNow) !== -1) {
        await applyPacingAfterScene();
      }
    }

    deps.loop.setRunning(false);
  }

  return { runQueue, processSceneWithRetries, applyPacingAfterScene, interruptibleDelay };
}
