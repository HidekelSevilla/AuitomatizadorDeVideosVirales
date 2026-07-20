// Test del orquestador puro (lib/orchestrator.js) con deps FALSAS y reloj SIMULADO (sin esperas reales).
// Cubre las rutas que gastan puntos / pausan / recuperan. node tests/orchestrator.test.mjs
import assert from "node:assert";
import { SCENE_STATUS } from "../lib/messaging.js";
import { createOrchestrator, classifyError, unresolvedAnimationScenes } from "../lib/orchestrator.js";

const S = SCENE_STATUS;
const scene = (id) => ({ id, status: S.PENDING, attempts: 0, error: null });

// La cola puede continuar escenas independientes despues de un fallo de animacion, pero al final el
// ERROR debe seguir siendo una barrera: no se marca el JSON completo ni se toma el siguiente trabajo.
{
  const done = { ...scene("done"), status: S.DONE, renderMode: "animated" };
  const failed = { ...scene("failed"), status: S.ERROR, skipped: true, renderMode: "animated" };
  const staticDone = { ...scene("static"), status: S.IMAGE_DONE, renderMode: "static" };
  assert.deepEqual(
    unresolvedAnimationScenes([done, failed, staticDone], { perSceneRender: true }).map((s) => s.id),
    ["failed"],
    "barrera de animacion conserva incluso un fallo saltado hasta que exista su clip",
  );
  assert.deepEqual(
    unresolvedAnimationScenes([staticDone], { imageOnly: true, perSceneRender: true }),
    [],
    "preset image-only no exige clips de animacion",
  );
}

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
    project: opts.project || null,
  };
  const calls = { sleep: [], pauseForError: [], onHardStop: [], beforeFinalAnimationRetry: 0, image: 0, animation: 0, parallel: 0 };
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
      beforeFinalAnimationRetry: async () => { calls.beforeFinalAnimationRetry++; },
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
// handoff de proveedores invalido = determinista -> NO reintentable (no re-disparar nada pagado).
assert.equal(classifyError("handoff imagen=grok -> animacion=flow no soportado"), "selector");

// (a) retry de generacion en ANIMACION: falla 2 veces y al 3er intento OK -> 2 backoffs, sin pausa.
{
  const sc = scene("s1"); sc.status = S.IMAGE_DONE; sc.imageUrl = "img://s1";
  let n = 0;
  const h = harness({ scenes: [sc], phase: "animation", animation: async (s) => { if (n++ < 2) throw new Error("la IA fallo"); s.status = S.DONE; } });
  await h.orch.processSceneWithRetries(sc, null, null, "animation");
  assert.equal(h.calls.animation, 3, "a: 3 intentos");
  assert.equal(h.calls.sleep.length, 2, "a: 2 backoffs");
  assert.equal(h.calls.pauseForError.length, 0, "a: sin pausa");
  assert.equal(sc.status, S.DONE, "a: termino OK");
}

// (b) fail-fast selector en IMAGEN: 1 intento, SIN backoff; se difiere para seguir independientes.
{
  const h = harness({ scenes: [scene("s1")], image: async () => { throw new Error("no encuentro el boton X"); } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 1, "b: 1 intento (no reintenta)");
  assert.equal(h.calls.sleep.length, 0, "b: sin backoff");
  assert.equal(h.calls.pauseForError.length, 0, "b: no pausa a mitad de la fase de imagenes");
  assert.equal(h.state.scenes[0].status, S.ERROR, "b: ERROR");
}

// (c) fallo de generacion de IMAGEN: se difiere tras 1 intento; la segunda pasada la gestiona runQueue.
{
  const h = harness({ scenes: [scene("s1")], image: async () => { throw new Error("timeout esperando"); } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 1, "c: un intento antes de seguir con independientes");
  assert.equal(h.calls.sleep.length, 0, "c: sin backoff bloqueante");
  assert.equal(h.calls.pauseForError.length, 0, "c: difiere la pausa hasta terminar independientes");
  assert.equal(h.state.scenes[0].status, S.ERROR, "c: ERROR");
}

// (d) hardStop: aborta sin reintentar.
{
  const h = harness({ scenes: [scene("s1")], image: async () => { const e = new Error("captcha"); e.hardStop = "captcha"; throw e; } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 1, "d: 1 intento");
  assert.equal(h.calls.onHardStop.length, 1, "d: hardStop");
  assert.equal(h.calls.sleep.length, 0, "d: sin backoff");
  assert.equal(h.state.scenes[0].status, S.PENDING, "d: queda reanudable, no GENERATING_IMAGE eterno");
  assert.equal(h.state.scenes[0].attempts, 0, "d: una cuota/captcha no consume intento de generacion");
}

// (d2) Resultado ambiguo de Grok: se difiere sin re-enviar consecutivamente; runQueue concede al final
// un unico intento nuevo autorizado por la politica de completar imagenes.
{
  const h = harness({ scenes: [scene("s1")], image: async () => {
    const e = new Error("Grok pudo haber generado la imagen"); e.noAutoRetry = true; throw e;
  } });
  await h.orch.processSceneWithRetries(h.state.scenes[0], null, null, "images");
  assert.equal(h.calls.image, 1, "d2: no duplica consecutivamente la generacion ambigua");
  assert.equal(h.calls.sleep.length, 0, "d2: sin backoff");
  assert.equal(h.calls.pauseForError.length, 0, "d2: deja seguir independientes antes de pausar al cierre");
  assert.equal(h.state.scenes[0].status, S.ERROR, "d2: queda visible como ERROR");
}

// (d3) Un fallo de ANIMACION se difiere para no detener las escenas independientes.
{
  const sc = scene("s1"); sc.status = S.IMAGE_DONE; sc.imageUrl = "img://s1";
  const h = harness({ scenes: [sc], phase: "animation", animation: async () => { throw new Error("no encuentro el boton Animar"); } });
  await h.orch.processSceneWithRetries(sc, null, null, "animation");
  assert.equal(h.calls.animation, 1, "d3: animacion fail-fast");
  assert.equal(h.calls.pauseForError.length, 0, "d3: animacion no pausa a mitad de la fase");
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
  const sc = scene("s1"); sc.status = S.IMAGE_DONE; sc.imageUrl = "img://s1";
  const h = harness({ scenes: [sc], phase: "animation", config: { parallelAnimation: true } });
  await h.orch.runQueue();
  assert.equal(h.calls.parallel, 1, "f: parallelAnimation invocado");
  assert.equal(h.calls.animation, 0, "f: animation NO invocado");
  assert.equal(h.state.queue.running, false, "f: fase paralela termino");
}

// (f2) El tope preventivo de 50/hora conserva una pausa corta, limitada a 3 minutos. Los cooldowns
// reales por rate-limit viven en otra ruta y no se reducen con esta preferencia de ritmo.
{
  const h = harness({ config: { maxGenerationsPerHour: 1, maxHourlyPauseMs: 180000 } });
  await h.orch.applyPacingAfterScene();
  assert.equal(h.calls.sleep.reduce((sum, ms) => sum + ms, 0), 180000, "f2: pausa preventiva limitada a 3 minutos");
}

// (g) pausa a mitad de espera: interruptibleDelay corta antes del total si se pausa.
{
  const h = harness();
  h.state.queue.paused = true;     // ya pausado -> primer chequeo corta
  const done = await h.orch.interruptibleDelay(10000);
  assert.equal(done, false, "g: interrumpido por pausa devuelve false");
  assert.equal(h.calls.sleep.length, 0, "g: no durmio");
}

// (h) PIPELINE PARALELO: carril imagenes (flow) + carril animacion (grok) a la vez sobre 2 escenas.
// Status DISJUNTOS (PENDING vs IMAGE_DONE) -> sin colision; el consumidor espera al productor; todo DONE.
{
  const h = harness({ scenes: [scene("s1"), scene("s2")] });
  await Promise.all([
    h.orch.runLane({ laneId: "images", phase: "images", provider: "flow" }),
    h.orch.runLane({ laneId: "animation", phase: "animation", provider: "grok" }),
  ]);
  assert.equal(h.state.scenes.filter((s) => s.status === S.DONE).length, 2, "h: ambas escenas DONE");
  assert.equal(h.calls.image, 2, "h: 2 imagenes generadas");
  assert.equal(h.calls.animation, 2, "h: 2 animaciones");
  assert.ok(h.state.pacing.byProvider && h.state.pacing.byProvider.flow, "h: bucket de ritmo por proveedor (flow)");
  assert.equal(h.state.lanes.images.running, false, "h: carril imagenes termino");
  assert.equal(h.state.lanes.animation.running, false, "h: carril animacion termino");
}

// (i) consumidor (animacion) sin productor vivo ni trabajo: termina, NO se cuelga (no hay busy-wait infinito).
{
  const sc = scene("s1"); sc.status = S.DONE;
  const h = harness({ scenes: [sc] });
  await h.orch.runLane({ laneId: "animation", phase: "animation", provider: "grok" });
  assert.equal(h.calls.animation, 0, "i: nada que animar");
  assert.equal(h.state.lanes.animation.running, false, "i: termino sin colgarse");
}

// (j) IDEMPOTENCIA anti-re-gasto: un runner que ya "disparo" (scene.videoUrl set) NO re-dispara al
// reintentar tras un fallo POSTERIOR (collect/descarga). Modela el contrato de runRealAnimation/runGrokAnimation:
// el FIRE (que paga) solo corre si no hay video previo; un fallo de recoleccion recoge sin re-gastar.
{
  let fires = 0, collectFails = 1;
  const animation = async (s) => {
    if (!s.videoUrl) { fires++; s.videoUrl = "vid://" + s.id; }              // FIRE paga: solo sin video previo
    if (collectFails-- > 0) throw new Error("timeout esperando el video");   // collect falla 1 vez (post-fire)
    s.status = S.DONE;
  };
  const sc = scene("s1"); sc.status = S.IMAGE_DONE;
  const h = harness({ scenes: [sc], phase: "animation", animation });
  await h.orch.processSceneWithRetries(sc, null, null, "animation");
  assert.equal(fires, 1, "j: disparo UNA sola vez pese al reintento (no re-gasto de puntos)");
  assert.equal(sc.status, S.DONE, "j: termino DONE al recoger en el reintento");
}

// (k) SALVAGUARDA anti-bucle: un runner que NO avanza se difiere, recibe una sola pasada final y pausa
// solamente si vuelve a fallar (sin bucle infinito).
{
  const sc = scene("s1"); sc.status = S.IMAGE_DONE; sc.imageUrl = "img://s1";
  const noop = async () => { /* no toca el status -> queda en IMAGE_DONE (target de animacion) */ };
  const h = harness({ scenes: [sc], phase: "animation", animation: noop });
  await h.orch.runQueue();
  assert.equal(sc.status, S.ERROR, "k: escena no-op marcada ERROR (no se cuelga el bucle)");
  assert.equal(h.calls.animation, 2, "k: intento inicial + una pasada final");
  assert.equal(h.calls.beforeFinalAnimationRetry, 1, "k: reinicio proveedor antes de la pasada final");
  assert.equal(h.calls.pauseForError.length, 1, "k: pauso solo tras fallar tambien la pasada final");
  assert.equal(h.state.queue.running, false, "k: el bucle no quedo girando");
}

// (k2) Una animacion fallida no bloquea las demas: se procesa al final una sola vez y puede recuperarse.
{
  const a = scene("a"); a.status = S.IMAGE_DONE; a.imageUrl = "img://a";
  const b = scene("b"); b.status = S.IMAGE_DONE; b.imageUrl = "img://b";
  const order = [];
  const h = harness({ scenes: [a, b], phase: "animation", config: { maxRetries: 0 }, animation: async (s) => {
    order.push(s.id);
    if (s.id === "a" && !s.animationFinalRetryUsed) throw new Error("timeout esperando condicion en Grok");
    s.status = S.DONE;
  } });
  await h.orch.runQueue();
  assert.deepEqual(order, ["a", "b", "a"], "k2: termina independiente antes del reintento final");
  assert.equal(h.calls.beforeFinalAnimationRetry, 1, "k2: una sola recarga previa");
  assert.equal(h.state.scenes.every((s) => s.status === S.DONE), true, "k2: ambas animaciones completas");
  assert.equal(h.state.queue.paused, false, "k2: no pausa si la pasada final funciona");
}

// (l) HIBRIDO Manhwa: en fase animacion, escenas static no deben llamar runner ni aplicar Ritmo.
{
  const st = scene("static_01"); st.status = S.IMAGE_DONE; st.renderMode = "static";
  const an = scene("anim_01"); an.status = S.IMAGE_DONE; an.renderMode = "animated";
  const h = harness({ scenes: [st, an], phase: "animation", project: { perSceneRender: true } });
  await h.orch.runQueue();
  assert.equal(st.status, S.DONE, "l: static marcada DONE");
  assert.equal(an.status, S.DONE, "l: animated marcada DONE");
  assert.equal(h.calls.animation, 1, "l: solo anima la escena animated");
  assert.equal(h.calls.sleep.includes(1000), false, "l: no aplica ritmo por static no-op");
  assert.equal(h.state.pacing.sessionGen, 0, "l: static no cuenta como generacion");
}

// (m) classifyError: still RECHAZADO por integridad ("dev-server" en el texto) debe ser 'generation'
// (retry de imagen GRATIS), NO 'environment' (fail-fast que negaba el reintento). Bug real #1.
assert.equal(classifyError("still rechazado por dev-server: archivo demasiado pequeno (posible corrupto/incompleto)"), "generation", "m: still rechazado -> generation");
assert.equal(classifyError("dev-server no responde"), "environment", "m: dev-server caido sigue siendo environment");

// (n) RECUPERACION SIN RE-GASTO: en fase animation sin IMAGE_DONE, una escena ANIMATING con videoUrl
// (retry "download" / SW muerto tras el fire) debe ser recogida por el bucle secuencial. Antes solo el
// runner paralelo (off por default) la veia -> quedaba varada en ANIMATING para siempre.
{
  const sc = scene("s1"); sc.status = S.ANIMATING; sc.videoUrl = "https://flow/video.mp4";
  let fired = 0;
  const collect = async (s) => { if (!s.videoUrl) fired++; s.status = S.DONE; };  // como los runners reales: con videoUrl NO re-dispara
  const h = harness({ scenes: [sc], phase: "animation", animation: collect });
  await h.orch.runQueue();
  assert.equal(sc.status, S.DONE, "n: ANIMATING+videoUrl recogida y DONE");
  assert.equal(fired, 0, "n: NO re-disparo la animacion (no re-gasto)");
  assert.equal(h.calls.animation, 1, "n: paso por el runner de animacion");
  assert.equal(h.state.queue.running, false, "n: la fase termino");
}

// (n2) la escena ANIMATING SIN videoUrl NO debe ser elegida (re-animarla seria gasto): fase termina sola.
{
  const sc = scene("s1"); sc.status = S.ANIMATING; sc.videoUrl = null;
  const h = harness({ scenes: [sc], phase: "animation" });
  await h.orch.runQueue();
  assert.equal(h.calls.animation, 0, "n2: no toco la escena ANIMATING sin video");
  assert.equal(sc.status, S.ANIMATING, "n2: la deja como esta (decision del SW/resume)");
}

// (n3) anti-bucle tambien en la recuperacion: si el collect no avanza la escena (sigue ANIMATING), se
// marca ERROR en vez de re-elegirla infinitamente.
{
  const sc = scene("s1"); sc.status = S.ANIMATING; sc.videoUrl = "https://flow/video.mp4";
  const noop = async () => { /* no avanza */ };
  const h = harness({ scenes: [sc], phase: "animation", animation: noop });
  await h.orch.runQueue();
  assert.equal(sc.status, S.ERROR, "n3: collect no-op marcada ERROR (sin bucle infinito)");
  assert.equal(h.state.queue.running, false, "n3: el bucle salio");
}

// (n4) escena ANIMATING+videoUrl pero SKIPPED no se recoge.
{
  const sc = scene("s1"); sc.status = S.ANIMATING; sc.videoUrl = "x"; sc.skipped = true;
  const h = harness({ scenes: [sc], phase: "animation" });
  await h.orch.runQueue();
  assert.equal(h.calls.animation, 0, "n4: skipped no se toca");
}

// (o) Un fallo de imagen NO impide producir las independientes. Al final recibe exactamente UN intento
// adicional; si vuelve a fallar, la fase pausa y no queda marcada como finalizada.
{
  const callsById = [];
  const h = harness({ scenes: [scene("s1"), scene("s2"), scene("s3")], image: async (s) => {
    callsById.push(s.id);
    if (s.id === "s1") throw new Error("no encuentro el boton Generar");
    s.imageUrl = `img://${s.id}`; s.status = S.IMAGE_DONE;
  } });
  await h.orch.runQueue();
  assert.equal(callsById.filter((id) => id === "s1").length, 2, "o: s1 tuvo intento inicial + uno final");
  assert.equal(callsById.filter((id) => id === "s2").length, 1, "o: s2 independiente termino");
  assert.equal(callsById.filter((id) => id === "s3").length, 1, "o: s3 independiente termino");
  assert.equal(h.state.scenes[1].status, S.IMAGE_DONE, "o: s2 lista");
  assert.equal(h.state.scenes[2].status, S.IMAGE_DONE, "o: s3 lista");
  assert.equal(h.state.queue.paused, true, "o: pausa solo al cierre por s1 pendiente");
}

// (p) Si la segunda pasada recupera el fallo, la fase termina normalmente.
{
  let s1Calls = 0;
  const h = harness({ scenes: [scene("s1"), scene("s2")], image: async (s) => {
    if (s.id === "s1" && s1Calls++ === 0) throw new Error("timeout esperando imagen");
    s.imageUrl = `img://${s.id}`; s.status = S.IMAGE_DONE;
  } });
  await h.orch.runQueue();
  assert.equal(s1Calls, 2, "p: s1 se recupero en el intento final");
  assert.equal(h.state.scenes.every((s) => s.status === S.IMAGE_DONE), true, "p: todas las imagenes listas");
  assert.equal(h.state.queue.paused, false, "p: sin pausa si la recuperacion funciono");
  assert.equal(h.state.queue.running, false, "p: fase finalizada");
}

// (q) Referencia hacia una escena POSTERIOR: bloquea solo a la consumidora y adelanta trabajo independiente.
{
  const dependent = scene("s1"); dependent.sceneRefs = [{ sceneId: "s3" }];
  const order = [];
  const h = harness({ scenes: [dependent, scene("s2"), scene("s3")], image: async (s) => {
    order.push(s.id); s.imageUrl = `img://${s.id}`; s.status = S.IMAGE_DONE;
  } });
  await h.orch.runQueue();
  assert.deepEqual(order, ["s2", "s3", "s1"], "q: s1 espera su referencia; s2 y s3 avanzan");
  assert.equal(h.state.queue.paused, false, "q: termina al resolverse la dependencia");
}

// (r) Si falla la imagen base, su dependiente nunca se envia; las no relacionadas si terminan.
{
  const source = scene("s1");
  const dependent = scene("s2"); dependent.sceneRefs = [{ sceneId: "s1" }];
  const order = [];
  const h = harness({ scenes: [source, dependent, scene("s3")], image: async (s) => {
    order.push(s.id);
    if (s.id === "s1") throw new Error("no encuentro el boton Generar");
    s.imageUrl = `img://${s.id}`; s.status = S.IMAGE_DONE;
  } });
  await h.orch.runQueue();
  assert.equal(order.filter((id) => id === "s1").length, 2, "r: base intento inicial + final");
  assert.equal(order.includes("s2"), false, "r: dependiente no se genera sin la referencia");
  assert.equal(order.includes("s3"), true, "r: independiente si se genera");
  assert.equal(h.state.queue.paused, true, "r: se detiene antes de la fase siguiente");
}

// (s) Resultado ambiguo: termina las demas y hace UN intento final; si vuelve a fallar, pausa.
{
  const order = [];
  const h = harness({ scenes: [scene("s1"), scene("s2")], image: async (s) => {
    order.push(s.id);
    if (s.id === "s1") { const e = new Error("resultado posiblemente generado"); e.noAutoRetry = true; throw e; }
    s.imageUrl = `img://${s.id}`; s.status = S.IMAGE_DONE;
  } });
  await h.orch.runQueue();
  assert.deepEqual(order, ["s1", "s2", "s1"], "s: termina s2 y concede un unico segundo Enter a s1");
  assert.equal(h.state.queue.paused, true, "s: pausa solo despues de fallar tambien el intento final");
  assert.equal(h.state.scenes[0].imageFinalRetryUsed, true, "s: la marca evita un tercer intento/bucle");
}

// (s2) Si el segundo Enter resuelve el resultado ambiguo, todas las imagenes terminan sin pausa.
{
  const order = [];
  let s1Calls = 0;
  const h = harness({ scenes: [scene("s1"), scene("s2")], image: async (s) => {
    order.push(s.id);
    if (s.id === "s1" && s1Calls++ === 0) {
      const e = new Error("message channel closed"); e.noAutoRetry = true; throw e;
    }
    s.imageUrl = `img://${s.id}`; s.status = S.IMAGE_DONE;
  } });
  await h.orch.runQueue();
  assert.deepEqual(order, ["s1", "s2", "s1"], "s2: segunda pasada ocurre despues de independientes");
  assert.equal(h.state.scenes.every((s) => s.status === S.IMAGE_DONE), true, "s2: todas las imagenes quedaron listas");
  assert.equal(h.state.queue.paused, false, "s2: no pausa cuando el intento final funciona");
}

// (t) Un ciclo de referencias no gira ni genera sin referencias: se diagnostica y pausa.
{
  const a = scene("a"); a.sceneRefs = [{ sceneId: "b" }];
  const b = scene("b"); b.sceneRefs = [{ sceneId: "a" }];
  const h = harness({ scenes: [a, b] });
  await h.orch.runQueue();
  assert.equal(h.calls.image, 0, "t: no genero escenas con ciclo");
  assert.equal(h.state.queue.paused, true, "t: ciclo bloquea la fase con error visible");
}

console.log("OK: orchestrator - retries, fallos diferidos, segunda pasada, dependencias, barrera de fase, hard-stop, ritmo, idempotencia y anti-bucle.");
