import assert from "node:assert/strict";
import fs from "node:fs";

const sw = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const driver = fs.readFileSync(new URL("../content/grok-driver.js", import.meta.url), "utf8");

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
const recovery = section(sw, "async function recoverInterruptedGrokImageAttempts", "// image-only");
assert.doesNotMatch(recovery, /ACT\.GENERATE_IMAGE/);
assert.doesNotMatch(recovery, /status\s*=\s*SCENE_STATUS\.PENDING/);
assert.match(recovery, /owner\.status = SCENE_STATUS\.ERROR/);
assert.match(recovery, /owner\.noAutoRetry = true/);
assert.match(recovery, /state\.queue\.paused = true/);
assert.match(recovery, /state\.queue\.running = false/);
assert.match(recovery, /chrome\.tabs\.get\(owner\.grokImageAttempt\.tabId\)/,
  "la recuperacion debe volver al tab exacto que recibio Enter, no al Grok enfocado");

const persistedRecovery = section(sw, "async function recoverPersistedGrokResult", "async function adoptRecoveredGrokScene");
assert.ok(persistedRecovery.indexOf("attempt?.result?.imageUrl")
  < persistedRecovery.indexOf("ACT.COLLECT_IMAGE"),
"un resultado ya persistido debe revalidarse antes de consultar el DOM");
assert.doesNotMatch(persistedRecovery, /GENERATE_IMAGE|sendGrokGenerateImage/);

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

const manualRetry = section(sw, "async function onRetryIngredient", "async function runAnimationRetry");
assert.match(manualRetry, /ing\.noAutoRetry = false/);
assert.match(manualRetry, /runIngredientsPhase\(\{ forceIds: \[ingredientId\], ignorePaused: true \}\)/);

console.log("OK: Grok persiste submit/result y reinicia en recovery-only at-most-once");
