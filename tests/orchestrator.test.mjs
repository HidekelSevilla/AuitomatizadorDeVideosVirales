// Test del orquestador puro (lib/orchestrator.js) con deps FALSAS y reloj SIMULADO (sin esperas reales).
// Cubre las rutas que gastan puntos / pausan / recuperan. node tests/orchestrator.test.mjs
import assert from "node:assert";
import { SCENE_STATUS } from "../lib/messaging.js";
import { createOrchestrator, classifyError } from "../lib/orchestrator.js";

const S = SCENE_STATUS;
const scene = (id) => ({ id, status: S.PENDING, attempts: 0, error: null });

// Harness: state vivo + deps falsas. jitter neutralizado con min===max -> delays deterministas.
function harness(opts = {}) {
  const state = {
    config: {
      maxRetries: 3, delayMinMs: 10, delayMaxMs: 10, pauseOnFailure: true,
      interSceneDelayMinMs: 1000, interSceneDelayMaxMs: 1000, warmupCount: 0,
      longBreakEvery: 0, maxGenerationsPerHour: 0, dryRun: false, provider: "flow",
      parallelAnimation: false, ...(opts.config || {}),
    },
    scenes: opts.scenes || [],
    queue: { running: true, paused: false, phase: opts.phase || "images", currentIndex: 0, heartbeatAt: 0 },
    pacing: { windowStart: 0, windowCount: 0, sessionGen: 0, cooldownUntil: 0, cooldownStep: 0 },
    metrics: { generations: 0, errors: 0, cooldownMs: 0, since: 0 },
    project: null,
  };
  const calls = { sleep: [], pauseForError: [], onHardStop: [], image: 0, animation: 0, parallel: 0 };
  const clock = { t: 0 };
  let loopRunning = false;
  const imageRunner = opts.image || (async (s) => { s.status = S.IMAGE_DONE; });
  const animRunner = opts.animation || (async (s) => { s.status = S.DONE; });
  const deps = {
    getState: () => state,
    saveState: async () => {},
    emitState() {}, emitProgress() {}, emitSceneStatus() {}, log() {},
    runners: {
      image: async (...a) => { calls.image++; return imageRunner(...a); },
      animation: async (...a) => { calls.animation++; return animRunner(...a); },
      parallelAnimation: async () => { calls.parallel++; },
    },
    effects: {
      onHardStop: async (reason) => { calls.onHardStop.push(reason); state.queue.paused = true; state.queue.running = false; },
      pauseForError: async (_m, id) => { calls.pauseForError.push(id); state.queue.paused = true; state.queue.running = false; },
      detachDebuggers() {}, reportFailuresAtEnd() {}, heartbeatJobLock() {},
    },
    loop: { isRunning: () => loopRunning, setRunning: (b) => { loopRunning = b; } },
    now: () => clock.t,
    sleep: async (ms) => { calls.sleep.push(ms); clock.t += ms; },
  };
  return { state, calls, clock, orch: createOrchestrator(deps) };
}

// classifyError (pura)
assert.equal(classifyError("no hay pestana de Flow abierta"), "environment");
assert.equal(classifyError("no encuentro el boton generar"), "selector");
assert.equal(classifyError("timeout esperando el video"), "generation");

// (a) retry de generacion: falla 2 veces y al 3er intento OK -> 2 backoffs, sin pausa.
{
  let n = 0;
  const h = harness({ scenes: [scene("s1")], image: async (s) => { if (n++ < 2) throw new Error("la IA fallo"); s.status = S.IMAGE_DONE; } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 3, "a: 3 intentos");
  assert.equal(h.calls.sleep.length, 2, "a: 2 backoffs");
  assert.equal(h.calls.pauseForError.length, 0, "a: sin pausa");
  assert.equal(h.state.scenes[0].status, S.IMAGE_DONE, "a: termino OK");
}

// (b) fail-fast selector: 1 intento, SIN backoff, pausa inmediata.
{
  const h = harness({ scenes: [scene("s1")], image: async () => { throw new Error("no encuentro el boton X"); } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 1, "b: 1 intento (no reintenta)");
  assert.equal(h.calls.sleep.length, 0, "b: sin backoff");
  assert.equal(h.calls.pauseForError.length, 1, "b: pausa");
  assert.equal(h.state.scenes[0].status, S.ERROR, "b: ERROR");
}

// (c) reintentos agotados (generation): 4 intentos, 3 backoffs, ERROR + pausa.
{
  const h = harness({ scenes: [scene("s1")], image: async () => { throw new Error("timeout esperando"); } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 4, "c: 4 intentos (1+3)");
  assert.equal(h.calls.sleep.length, 3, "c: 3 backoffs");
  assert.equal(h.calls.pauseForError.length, 1, "c: pausa");
  assert.equal(h.state.scenes[0].status, S.ERROR, "c: ERROR");
}

// (d) hardStop: aborta sin reintentar.
{
  const h = harness({ scenes: [scene("s1")], image: async () => { const e = new Error("captcha"); e.hardStop = "captcha"; throw e; } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 1, "d: 1 intento");
  assert.equal(h.calls.onHardStop.length, 1, "d: hardStop");
  assert.equal(h.calls.sleep.length, 0, "d: sin backoff");
}

// (e) ritmo entre escenas: 2 PENDING -> tras la 1a, espera interSceneDelay; contadores +1.
{
  const h = harness({ scenes: [scene("s1"), scene("s2")] });
  await h.orch.runQueue();
  assert.ok(h.calls.sleep.includes(1000), "e: durmio interSceneDelay 1000 entre escenas");
  assert.equal(h.state.pacing.sessionGen, 1, "e: 1 pacing (solo entre las 2)");
  assert.equal(h.state.metrics.generations, 1, "e: metrica generations");
  assert.equal(h.state.queue.running, false, "e: fase termino");
}

// (f) rama paralela: anima por parallelAnimation, NO por animation; termina running=false.
{
  const sc = scene("s1"); sc.status = S.IMAGE_DONE;
  const h = harness({ scenes: [sc], phase: "animation", config: { parallelAnimation: true } });
  await h.orch.runQueue();
  assert.equal(h.calls.parallel, 1, "f: parallelAnimation invocado");
  assert.equal(h.calls.animation, 0, "f: animation NO invocado");
  assert.equal(h.state.queue.running, false, "f: fase paralela termino");
}

// (g) pausa a mitad de espera: interruptibleDelay corta antes del total si se pausa.
{
  const h = harness();
  h.state.queue.paused = true;     // ya pausado -> primer chequeo corta
  const done = await h.orch.interruptibleDelay(10000);
  assert.equal(done, false, "g: interrumpido por pausa devuelve false");
  assert.equal(h.calls.sleep.length, 0, "g: no durmio");
}

console.log("OK: orchestrator - classifyError, retry, fail-fast, agotado, hardStop, ritmo, paralelo, pausa.");
