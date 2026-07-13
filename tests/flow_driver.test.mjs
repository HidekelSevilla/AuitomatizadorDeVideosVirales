import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content/flow-driver.js", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const devServerSource = fs.readFileSync(new URL("../dev/reload-server.mjs", import.meta.url), "utf8");
const instrumented = source.replace(/\}\)\(\);\s*$/, "globalThis.__flowTest = { slateValue, mediaKey, characterFileInputEl, onNewCharacterPage };})();");
const noop = () => {};
let testFileInputs = [];
let testHeadings = [];
const context = {
  chrome: { runtime: { onMessage: { addListener: noop }, sendMessage: async () => ({ ok: true }) } },
  console: { log: noop, warn: noop },
  document: {
    querySelectorAll: (selector) => selector === 'input[type="file"]' ? testFileInputs
      : selector === "h1,h2,main" ? testHeadings : [],
    querySelector: () => null, documentElement: {}, body: {},
  },
  getComputedStyle: () => ({ visibility: "visible", display: "block" }),
  InputEvent: class {}, KeyboardEvent: class {}, MouseEvent: class {}, MutationObserver: class { observe() {} disconnect() {} },
  PointerEvent: class {}, setInterval, clearInterval, setTimeout,
  URL, location: { pathname: "/fx/es/tools/flow/project/test", href: "https://labs.google/fx/es/tools/flow/project/test" },
  window: { FLOW_SELECTORS: {}, getSelection: () => ({ removeAllRanges: noop, addRange: noop }) },
};
vm.runInNewContext(instrumented, context, { filename: "content/flow-driver.js" });

const zeroWidthOnly = { querySelectorAll: () => [] };
const registered = { querySelectorAll: () => [{ textContent: "PROMPT RECONOCIDO" }] };
assert.equal(context.__flowTest.slateValue(zeroWidthOnly), "", "el texto visual zero-width no cuenta como prompt registrado");
assert.equal(context.__flowTest.slateValue(registered), "PROMPT RECONOCIDO", "data-slate-string si cuenta como valor real");
assert.equal(context.__flowTest.mediaKey("https://labs.google/api/media?name=asset-123"), "asset-123",
  "la identidad estable debe usar name y no la URL de redireccion completa");
const mediaInput = { getAttribute: () => "video/*,image/*,.heic" };
const characterInput = { getAttribute: () => "image/*" };
testFileInputs = [mediaInput, characterInput];
assert.equal(context.__flowTest.characterFileInputEl(), characterInput,
  "debe elegir el input dedicado de personaje, no el multimedia global");
testHeadings = [{ innerText: "Crea y reutiliza personajes para que tus vídeos tengan coherencia." }];
assert.equal(context.__flowTest.onNewCharacterPage(), true, "debe reconocer la pantalla nueva de Personajes por su encabezado");
assert.match(source, /trusted_keyboard/, "Flow debe escribir mediante teclado trusted");
assert.match(source, /releaseAfterKey: true/, "Flow debe soltar el debugger despues de Enter");
assert.match(source, /flow_set_file_input/, "Flow debe poder subir referencias locales por el canal CDP");
assert.match(source, /function composerRoot\(\)/,
  "los chips deben contarse dentro del compositor, no entre miniaturas globales");
assert.match(source, /liveInput\.focus\(\);\s*placeCaretEnd\(liveInput\)/,
  "Flow debe recuperar el foco de Slate despues de adjuntar referencias y antes de Enter");
const submitSource = source.slice(source.indexOf("async function submitComposer"), source.indexOf("async function dataUrlToFile"));
assert.doesNotMatch(submitSource, /trustedClickEl/,
  "despues de Enter no debe existir un segundo gesto de click que duplique la generacion");
assert.match(source, /referenceChipCount\(\) > before/,
  "cada referencia adicional debe incrementar el conteo, no conformarse con que exista cualquier chip");
assert.match(source, /Flow no limpio todas las referencias heredadas/,
  "si no se pueden quitar chips heredados debe abortar en vez de mezclar escenas");
assert.match(source, /!beforeOptions\.has\(optionKey\(o\)\).*naturalWidth > 0/s,
  "una subida local debe producir una opcion nueva y decodificada, no solo coincidir por basename");
assert.match(source, /a\[href\*="\/edit\/"\]/,
  "la deteccion de resultado debe excluir previews/chips y limitarse a medios editables de la grilla");
assert.match(source, /currentResultImgs\(referenceKeys\)/,
  "el thumbnail de una referencia subida no puede adoptarse como resultado generado");
assert.match(source, /flow_local_reference_bindings_v1/,
  "la misma ruta local debe recordar su mediaKey por proyecto en lugar de re-subirse por escena");
assert.match(source, /flow_file_fingerprint/,
  "el cache local debe invalidarse si cambia el contenido aunque la ruta sea la misma");
assert.match(source, /imageUrl: result\.img\.currentSrc \|\| result\.img\.src/,
  "si Flow usa srcset debe persistirse la imagen realmente renderizada");
assert.match(source, /resultOption\.getAttribute\("aria-selected"\)/,
  "un personaje ya preseleccionado no debe deseleccionarse al adjuntarlo");
assert.match(source, /characterFileInputEl/, "la carga de personaje debe usar un input dedicado");
assert.match(serviceWorkerSource, /localReferencePaths: uniqueLocalReferencePaths/,
  "el runner de Flow debe pasar assets locales declarados por la escena");
assert.match(serviceWorkerSource, /Ingrediente Flow \$\{ing\.id\} guardado para reuso/,
  "todos los ingredientes Flow deben persistir su outputFile para P2");
assert.match(serviceWorkerSource, /const hasImg = \(g\) => !!g\.imageFilePath \|\| !!g\.imageUrl/,
  "Flow debe considerar listo un ingrediente rehidratado desde disco");
assert.match(serviceWorkerSource, /flowProjects.*projectId/s,
  "la serie debe recordar su projectId de Flow entre reinicios y Partes");
assert.match(serviceWorkerSource, /ensureProviderForPhase\(state\.queue\.phase \|\| "images", "reanudar tras reinicio"\)/,
  "reanudar despues de un apagado debe volver a preparar el proyecto Flow asociado");
assert.match(serviceWorkerSource, /ing\.regeneratePending = true/,
  "una regeneracion manual debe bloquear la rehidratacion del canonical viejo hasta reemplazarlo");
assert.match(devServerSource, /\.tmp-\$\{process\.pid\}/,
  "asset\/move debe validar un temporal antes de reemplazar el canonical");
assert.match(devServerSource, /function recoverAssetSwap/,
  "charfile debe recuperar un intercambio interrumpido entre backup y canonical");
assert.match(devServerSource, /path\.basename\(requested, actualRequestedExt\)/,
  "una extension solicitada en mayusculas no debe duplicarse en el basename final");
assert.match(serviceWorkerSource, /input\[type="file"\]\[accept="image\/\*"\]/,
  "CDP debe apuntar al input de personaje y no al primer file input global");

console.log("OK: Flow usa teclado trusted, memoria de personajes y referencias locales por CDP");
