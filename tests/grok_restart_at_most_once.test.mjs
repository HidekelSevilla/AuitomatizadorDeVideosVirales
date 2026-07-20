import assert from "node:assert/strict";
import fs from "node:fs";

const sw = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const driver = fs.readFileSync(new URL("../content/grok-driver.js", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../sidepanel/panel.js", import.meta.url), "utf8");

const section = (source, start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `seccion ausente: ${start}`);
  return source.slice(a, b);
};

// La barrera debe quedar durable ANTES de la unica tecla que puede gastar/generar.
const fire = section(driver, "async function fire", "async function generateImage");
const markerAt = fire.indexOf("persistImageSubmitIntent(");
const enterAt = fire.indexOf('trustedKeyboard({ key: "ENTER"');
assert.ok(markerAt >= 0 && enterAt > markerAt,
  "el content debe esperar el ACK persistido antes de pulsar Enter");
assert.equal((fire.match(/key: "ENTER"/g) || []).length, 1,
  "un intento de imagen Grok solo puede contener un Enter");

const persistIntent = section(sw, "async function persistGrokImageSubmitIntent", "function persistedGrokResult");
assert.match(persistIntent, /attempt\.submitIssued = true/);
assert.match(persistIntent, /attempt\.stage = "submit_issued"/);
assert.match(persistIntent, /await saveState\(\)/,
  "el ACK solo puede responder despues de persistir submitIssued/before/preUrl");

// El resultado se guarda antes de los ~55s de descargas/hashes; un apagado en esa ventana revalida
// los mismos URLs y no depende de que el DOM siga montado.
const sceneRunner = section(sw, "async function runGrokImage", "async function grokAnimationLikelyStarted");
assert.ok(sceneRunner.indexOf("persistGrokAttemptResult(scene, img)")
  < sceneRunner.indexOf("downloadValidatedGrokCandidate(img, slug, scene.id"));
assert.match(sceneRunner, /grokAttempt: \{ id: scene\.grokImageAttempt\.id, ownerType: "scene"/);

const ingredientRunner = section(sw, "async function runIngredientsPhase", "async function onRunAll");
assert.ok(ingredientRunner.indexOf("persistGrokAttemptResult(ing, img)")
  < ingredientRunner.indexOf("downloadValidatedGrokCandidate(img, slug, `ingredient_\$\{ing\.id\}`"));
assert.match(ingredientRunner, /grokAttempt: \{ id: ing\.grokImageAttempt\.id, ownerType: "ingredient"/);

// Restart de Grok = recovery-only. No puede existir ACT.GENERATE_IMAGE ni una transicion automatica
// a PENDING dentro del recuperador; si el probe falla queda ERROR+pausa+noAutoRetry.
const recovery = section(sw, "async function recoverInterruptedGrokImageAttempts", "async function moveStillToProject");
assert.doesNotMatch(recovery, /ACT\.GENERATE_IMAGE/);
assert.doesNotMatch(recovery, /status\s*=\s*SCENE_STATUS\.PENDING/);
assert.match(recovery, /owner\.status = SCENE_STATUS\.ERROR/);
assert.match(recovery, /owner\.noAutoRetry = true/);
assert.match(recovery, /state\.queue\.paused = true/);
assert.match(recovery, /state\.queue\.running = false/);
assert.match(recovery, /chrome\.tabs\.get\(owner\.grokImageAttempt\.tabId\)/,
  "la recuperacion debe volver al tab exacto que recibio Enter, no al Grok enfocado");
assert.match(recovery, /const liveOwner = grokAttemptOwner\(ownerType, owner\.id\)[\s\S]*adoptRecoveredGrokIngredient\(liveOwner/,
  "tras un await largo debe adoptar sobre el owner vivo, no sobre una referencia sustituida por onLoadJson");

const persistedRecovery = section(sw, "async function recoverPersistedGrokResult", "async function adoptRecoveredGrokScene");
assert.ok(persistedRecovery.indexOf("attempt?.result?.imageUrl")
  < persistedRecovery.indexOf("ACT.COLLECT_IMAGE"),
"un resultado ya persistido debe revalidarse antes de consultar el DOM");
assert.doesNotMatch(persistedRecovery, /GENERATE_IMAGE|sendGrokGenerateImage/);
assert.match(persistedRecovery, /attempt\.result\.promptScoped === true/,
  "un candidato legacy global no puede reutilizarse sin demostrar su vinculo al prompt");
assert.match(persistedRecovery, /prompt: exactPost \? "" : \(expectedPrompt \|\| ""\)/,
  "la recuperacion desde la grilla debe buscar el bloque del prompt exacto");
assert.match(persistedRecovery, /attempt\.stage === "manual_recovery_only" \? 45000 : 180000/,
  "una segunda sonda manual no debe congelar la interfaz otros tres minutos");

const latePostRecovery = section(sw, "async function collectGrokPostWithReconnect", "async function sendGrokGenerateImage");
assert.match(latePostRecovery, /for \(let attempt = 0; attempt < 3; attempt\+\+\)/,
  "un /post que invalida el content script debe reconectarse sin generar otra vez");
assert.doesNotMatch(latePostRecovery, /GENERATE_IMAGE|key: "ENTER"/,
  "reconectar al post exacto solo puede recolectar, nunca volver a generar");
const sendGrok = section(sw, "async function sendGrokGenerateImage", "async function clearGrokRefsOrFail");
assert.ok(sendGrok.indexOf("persistDiscoveredGrokPost(payload?.grokAttempt, tabId, postUrl)")
  < sendGrok.indexOf("collectGrokPostWithReconnect(tabId"),
  "la URL exacta debe persistirse antes de una recoleccion que puede cerrar el canal");

const resume = section(sw, "async function resumeIfInterrupted", "// ---------------------------------------------------------------------------\n// Router de mensajes");
assert.match(resume, /recoverInterruptedGrokImageAttempts\(\)/);
assert.match(resume, /grokAtMostOnce = imageProvider === "grok" && !state\.config\.dryRun/);
assert.match(resume, /GENERATING_IMAGE && !grokAtMostOnce/,
  "solo Grok real bloquea la reparacion GENERATING_IMAGE -> PENDING; Flow/dry-run no cambian");
assert.doesNotMatch(resume, /GENERATING_IMAGE\) s\.status = SCENE_STATUS\.PENDING/,
  "Grok no debe revivir a PENDING automaticamente tras reinicio");

// Un ingrediente ambiguo tampoco puede colarse por `regeneratePending` al pulsar Reanudar. Solo el
// forceId emitido por el boton Reintentar limpia la proteccion y autoriza otro Enter.
const protectionSource = section(sw, "function ingredientAutoRetryProtected", "async function hydrateExistingIngredientFiles");
const protectionFn = Function("SCENE_STATUS", `${protectionSource}; return ingredientAutoRetryProtected;`)({ ERROR: "error" });
assert.equal(protectionFn({ status: "error", noAutoRetry: true, regeneratePending: true }), true);
assert.equal(protectionFn({ status: "error", grokImageAttempt: { stage: "recovery_failed" } }), true);
assert.equal(protectionFn({ status: "error", grokImageAttempt: { submitIssued: true } }), true,
  "un fallo ambiguo normal, aun sin restart, tambien debe quedar fuera de Reanudar");
assert.equal(protectionFn({ status: "pending", regeneratePending: true }), false);

const hydrate = section(sw, "async function hydrateExistingIngredientFiles", "async function runIngredientsPhase");
assert.match(hydrate, /if \(forceIds\.has\(ing\.id\)\)[\s\S]*?ing\.noAutoRetry = false;[\s\S]*?ing\.grokImageAttempt = null;/,
  "solo forceIds debe limpiar la barrera persistida");
assert.match(hydrate, /if \(ingredientAutoRetryProtected\(ing\)\) continue;/,
  "la hidratacion normal no debe tapar el ERROR con un canonical viejo");

const ingredientsPhase = section(sw, "async function runIngredientsPhase", "async function onRunAll");
assert.match(ingredientsPhase, /protectedIngredients[\s\S]*?state\.queue\.paused = true;[\s\S]*?return false;/,
  "Reanudar debe detenerse ante un ingrediente protegido");
assert.match(ingredientsPhase, /forceIds\.size \? ings\.filter\(\(g\) => forceIds\.has\(g\.id\)\)/,
  "el retry manual dirigido debe seguir seleccionando su ingrediente");
assert.match(ingredientsPhase, /!ingredientAutoRetryProtected\(g\) && \(g\.regeneratePending \|\| !hasImg\(g\)\)/,
  "el pending automatico debe excluir intentos ambiguos aunque tengan regeneratePending");
assert.match(ingredientsPhase, /if \(e\?\.noAutoRetry\)[\s\S]*?ing\.noAutoRetry = true;[\s\S]*?failed_after_submit/,
  "un fallo posterior al submit debe persistir la barrera antes de pausar");
assert.match(ingredientsPhase, /e\?\.noAutoRetry && ing\.retryQueued[\s\S]*ing\.grokImageAttempt = null[\s\S]*correra UNA vez al reanudar/,
  "Rehacer encolado durante el intento debe sobrevivir a un cierre ambiguo y autorizar solo el siguiente Enter");

const manualRetry = section(sw, "async function onRetryIngredient", "async function runAnimationRetry");
assert.match(manualRetry, /if \(recoverOnly\)[\s\S]*NO encole otro Enter[\s\S]*return;/,
  "recoverOnly durante una generacion no puede convertirse en un Rehacer pagado encolado");
assert.match(manualRetry, /ing\.regeneratePending = true;[\s\S]*ing\.retryQueued = true;[\s\S]*Rehacer quedo encolado/,
  "Rehacer durante ingredientes debe persistirse en vez de ignorar el clic");
assert.ok(manualRetry.indexOf("ing.grokImageAttempt?.submitIssued")
  < manualRetry.indexOf("ing.grokImageAttempt = null"),
  "Reintentar debe intentar recuperar el resultado persistido antes de autorizar otra generacion");
assert.match(manualRetry, /recoverPersistedGrokResult\([\s\S]*adoptRecoveredGrokIngredient/,
  "un fallo de descarga debe volver a validar/adoptar el candidato ya pagado sin otro Enter");
assert.match(manualRetry, /ing\.noAutoRetry = false/);
assert.match(manualRetry, /runIngredientsPhase\(\{ forceIds: \[ingredientId\], ignorePaused: true \}\)/);
assert.match(manualRetry, /stage === "recovery_failed"[\s\S]*este Reintentar autoriza UNA generacion nueva[\s\S]*ing\.grokImageAttempt = null/,
  "el segundo retry manual debe poder salir de una recuperacion imposible y autorizar un solo Enter nuevo");
assert.match(manualRetry, /recoverOnly[\s\S]*stage = "manual_recovery_only"[\s\S]*NO envio Enter/,
  "una recuperacion dirigida con detector actualizado debe conservar el intento original y no regenerar");
assert.match(manualRetry, /directedRecoveryBusy = true[\s\S]*finally \{[\s\S]*directedRecoveryBusy = false/,
  "una recuperacion manual debe bloquear navegaciones concurrentes y liberar siempre la guarda");
assert.match(manualRetry, /pauseRequestedAtStart[\s\S]*userPausedDuringRetry[\s\S]*respeto la Pausa solicitada/,
  "un retry reparado no debe reanudar la corrida si el usuario pulso Pausa mientras cerraba");
assert.match(manualRetry, /recoveryFailedForAuthorizedRetry[\s\S]*este Reintentar autoriza UN intento nuevo/,
  "un solo Reintentar debe recuperar primero y, si no hay asset comprobable, autorizar exactamente una generacion nueva");
assert.match(manualRetry, /userPausedDuringRecovery[\s\S]*Respeto la Pausa; no envie otra generacion/,
  "Pausa durante la recuperacion debe cancelar el fallback pagado del mismo clic");

const pauseHandler = section(sw, "async function onPause", "async function onStop");
assert.match(pauseHandler, /state\.queue\.pauseRequestedAt = Date\.now\(\)/,
  "Pausa debe dejar una marca durable que distinga el clic del usuario de una pausa automatica por error");
const resumeHandler = section(sw, "async function onStartOrResume", "async function onStartPhase");
assert.match(resumeHandler, /pauseRequestedAtStart[\s\S]*ensureProviderForPhase[\s\S]*respeto la Pausa solicitada mientras esperaba/,
  "Pausa debe ganar aunque Reanudar todavia este preparando o navegando el proveedor");
const phaseHandler = section(sw, "async function onStartPhase", "const orchestrator");
assert.match(phaseHandler, /pauseRequestedAtStart[\s\S]*ensureProviderForPhase[\s\S]*respeto la Pausa solicitada mientras esperaba/,
  "Pausa debe ganar tambien mientras START_IMAGES prepara el proveedor");

const ingredientUi = section(panel, "function renderIngredients", "function renderScenes");
assert.match(ingredientUi, /items\.some\(\(ing\) => ing\.status === SCENE_STATUS\.GENERATING_IMAGE\)/,
  "el panel debe reconocer una fase de ingredientes activa aunque queue.running aun no se haya actualizado");
assert.match(ingredientUi, /Rehacer después[\s\S]*retry\.disabled = false/,
  "Rehacer debe permanecer disponible y encolarse durante la fase de ingredientes");
const queueButtons = section(panel, "function renderQueueButtons", "function renderProgress");
assert.match(queueButtons, /const running = !!queue\.running \|\| ingredientActive/,
  "Pausa debe habilitarse cuando un ingrediente esta generando aunque queue.running sea false");

const manualSceneRetry = section(sw, "async function onRetryScene", "async function onRetryIngredient");
assert.ok(manualSceneRetry.indexOf("scene.grokImageAttempt?.submitIssued")
  < manualSceneRetry.indexOf("scene.grokImageAttempt = null"),
  "Reintentar escena debe recuperar el resultado pagado antes de autorizar otra imagen");
assert.match(manualSceneRetry, /recoverPersistedGrokResult\([\s\S]*adoptRecoveredGrokScene/,
  "un fallo de deteccion/descarga de escena no debe provocar otro Enter");
assert.match(manualSceneRetry, /la cola permanece pausada para revision/,
  "recuperar una escena manualmente no debe reanudar toda la corrida por sorpresa");
assert.match(manualSceneRetry, /scene\.grokImageAttempt\?\.submitIssued \|\| recoverOnly/,
  "recoverOnly debe rescatar estados legacy que perdieron el marcador sin autorizar GENERATE_IMAGE");
assert.match(manualSceneRetry, /stage = "manual_recovery_only"/);
assert.match(manualSceneRetry, /recoveredOnlyPreviousScene[\s\S]*confirmedNoUsableOutput[\s\S]*scene\.grokImageAttempt = null/,
  "si el unico post recuperable son bytes de otra escena debe liberar Regen img, no quedar atrapado recuperandolo");
assert.match(section(sw, "async function onRemoteRetry", "async function onRemoteSkip"),
  /recoverOnly: !!args\.recoverOnly/,
  "el control remoto debe poder pedir una adopcion sin regenerar");
assert.match(section(sw, "async function onRemoteRetry", "async function onRemoteSkip"),
  /ingredientId: args\.ingredientId, recoverOnly: !!args\.recoverOnly/,
  "el control remoto debe poder recuperar tambien un ingrediente sin autorizar Enter");
assert.match(section(sw, "async function onRemoteRetry", "async function onRemoteSkip"),
  /args\.recoverOnly \? "image"/,
  "recoverOnly debe reemplazar una imagen duplicada sin caer por error en reanimacion");
assert.match(section(sw, "async function onRemoteRetry", "async function onRemoteSkip"),
  /requestedMode \|\| \(s\.videoUrl/,
  "el control dirigido debe poder retirar una imagen incorrecta sin lanzar animacion");

const remoteCommands = section(sw, "async function applyRemoteCommand", "async function onRemoteRetry");
assert.match(remoteCommands, /\["load_json", "cargar_json", "load_project", "cargar_proyecto"\]/,
  "el canal local debe poder restaurar el JSON tras una recarga de desarrollo");
assert.match(remoteCommands, /return onLoadJson\(\{ json: projectJson \}\)/,
  "la restauracion remota debe reutilizar la misma validacion/carga del panel");
assert.match(remoteCommands, /\["extension_reload", "recargar_extension"\]/,
  "tras la primera carga manual, las siguientes actualizaciones deben poder recargarse sin pedir otro paso al usuario");
assert.match(remoteCommands, /\["recover_grok_post", "recuperar_post_grok", "adoptar_post_grok"\]/,
  "un post pagado identificado debe poder adoptarse de forma dirigida sin otro Enter");
assert.match(remoteCommands, /\["release_grok_recovery", "liberar_recuperacion_grok"\]/,
  "una recuperacion sin DOM ni post debe poder salir de GENERATING sin enviar Enter");
assert.ok(remoteCommands.indexOf("await saveState()") < remoteCommands.indexOf("chrome.runtime.reload()"),
  "la auto-recarga debe persistir el proyecto antes de reiniciar el worker");
const loadJsonHandler = section(sw, "async function onLoadJson", "async function prepareProjectMedia");
assert.match(loadJsonHandler, /resumeInFlight \|\| directedRecoveryBusy[\s\S]*while \(\(resumeInFlight \|\| directedRecoveryBusy\)/,
  "cargar JSON debe esperar una recuperacion pagada para no sustituir sus objetos de estado");

const directedAnimation = section(sw, "async function runAnimationRetry", "// Re-encola TODAS las escenas");
assert.match(directedAnimation, /proceso SOLO la animacion de \$\{scene\.id\}/,
  "reanimar una escena no debe arrancar la cola completa");
assert.doesNotMatch(directedAnimation, /forceImagesPhaseIfPending|launchLoop/,
  "un retry dirigido no puede generar las imagenes pendientes de otras escenas");
assert.match(sw, /extensionBuild: EXTENSION_BUILD/,
  "el estado remoto debe declarar la version realmente cargada en Chrome");
const retryAll = section(sw, "async function onRetryAllErrors", "async function onSkipScene");
assert.match(retryAll, /ingredientErrors[\s\S]*onRetryIngredient\(\{ ingredientId: ingredientErrors\[0\]\.id \}\)/,
  "Reintentar errores debe atender ingredientes antes de afirmar que no hay escenas en error");
assert.match(retryAll, /launchLoop\(\{ continueToAnimation: toImages \}\)/,
  "tras reparar los errores de imagen debe auto-avanzar solo si la barrera queda completa");
const startOrResume = section(sw, "async function onStartOrResume", "// Arranca una FASE");
assert.match(startOrResume, /directedRecoveryBusy/,
  "Reanudar no debe recargar Grok encima de una recuperacion dirigida");
assert.match(startOrResume, /advancedToAnimation[\s\S]*ensureProviderForPhase\("animation"[\s\S]*continueToAnimation/,
  "Reanudar debe preparar el proveedor de video y auto-avanzar despues de cerrar la ultima imagen");
const launchQueue = section(sw, "function launchLoop", "// ---------------------------------------------------------------------------\n// Runner DRY-RUN");
assert.match(launchQueue, /advanceCompletedImagesToAnimationIfNeeded\("reintento final de imagenes"\)[\s\S]*ensureProviderForPhase\("animation"[\s\S]*launchLoop\(\)/,
  "el auto-avance debe pasar la barrera, preparar animacion y recien entonces lanzar el siguiente bucle");
assert.ok(sw.includes("/\\/users\\/[^/]+\\/([^/?#]+)\\/content"),
  "el worker debe deduplicar el endpoint /content nuevo por id de post, no por query cache");

const downloadRef = section(sw, "async function downloadImageForRef", "async function validateDownloadedGrokImage");
assert.doesNotMatch(downloadRef, /\.grok-candidates/,
  "Chrome rechaza componentes ocultos en downloads.download con Invalid filename");
assert.match(downloadRef, /images\/grok-candidates\//,
  "la cuarentena debe usar una carpeta valida para chrome.downloads");
assert.match(downloadRef, /const safeSlug =/,
  "el slug que entra a chrome.downloads debe estar saneado");

console.log("OK: Grok persiste submit/result y reinicia en recovery-only at-most-once");
