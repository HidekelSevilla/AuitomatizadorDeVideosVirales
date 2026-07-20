import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content/flow-driver.js", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const devServerSource = fs.readFileSync(new URL("../dev/reload-server.mjs", import.meta.url), "utf8");
const instrumented = source.replace(/\}\)\(\);\s*$/, "globalThis.__flowTest = { slateValue, mediaKey, isUploadedMediaTile, normalizeNanoBananaModel, exactNanoBananaModel, flowReferenceKind, flowPromptWithReferenceMap, characterFileInputEl, composerMediaButton, onNewCharacterPage };})();");
const noop = () => {};
let testFileInputs = [];
let testHeadings = [];
let testButtons = [];
const context = {
  chrome: { runtime: { onMessage: { addListener: noop }, sendMessage: async () => ({ ok: true }) } },
  console: { log: noop, warn: noop },
  document: {
    querySelectorAll: (selector) => selector === 'input[type="file"]' ? testFileInputs
      : selector === "button" ? testButtons
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
const uploadCard = {
  innerText: "favorite more_vert image tunel_obelisco_puerta_sellada.jpg",
  textContent: "favorite more_vert image tunel_obelisco_puerta_sellada.jpg",
  parentElement: null,
  getAttribute: () => "",
};
const uploadedImg = { innerText: "", textContent: "", parentElement: uploadCard, getAttribute: () => "" };
const generatedCard = { innerText: "", textContent: "", parentElement: null, getAttribute: () => "" };
const generatedImg = { innerText: "", textContent: "", parentElement: generatedCard, getAttribute: () => "" };
assert.equal(context.__flowTest.isUploadedMediaTile(uploadedImg), true,
  "una tarjeta con filename es una referencia subida, aunque Flow la llame Imagen generada");
assert.equal(context.__flowTest.isUploadedMediaTile(generatedImg), false,
  "un resultado sin filename visible debe permanecer elegible");
assert.match(source, /localReferenceCache\.values\(\)[\s\S]*mediaKey\(entry\?\.url/,
  "un upload renombrado debe seguir excluido de los resultados por su mediaKey durable");
assert.equal(context.__flowTest.exactNanoBananaModel({ innerText: "Nano Banana Pro arrow_drop_down" }, "Nano Banana Pro"), true);
assert.equal(context.__flowTest.exactNanoBananaModel({ innerText: "Nano Banana 2 crop_9_16 1x" }, "Nano Banana 2"), true);
assert.equal(context.__flowTest.exactNanoBananaModel({ innerText: "Nano Banana 2 Lite arrow_drop_down" }, "Nano Banana 2"), false);
const mappedPrompt = context.__flowTest.flowPromptWithReferenceMap("ORIGINAL PROMPT", [
  { label: "Personaje — Ji-ho — Corriendo", kind: "character" },
  { label: "Escenario — Túnel — Pasillo", kind: "environment" },
]);
assert.match(mappedPrompt, /\[1\] Personaje — Ji-ho — Corriendo/,
  "Flow debe explicar al modelo que el primer chip corresponde al personaje correcto");
assert.match(mappedPrompt, /\[2\] Escenario — Túnel — Pasillo/,
  "Flow debe separar la referencia de escenario de las identidades");
assert.ok(mappedPrompt.endsWith("ORIGINAL PROMPT"),
  "el contrato de referencias no debe resumir ni reemplazar el prompt original");
const mediaInput = { getAttribute: () => "video/*,image/*,.heic" };
const characterInput = { getAttribute: () => "image/*" };
testFileInputs = [mediaInput, characterInput];
assert.equal(context.__flowTest.characterFileInputEl(), characterInput,
  "debe elegir el input dedicado de personaje, no el multimedia global");
testHeadings = [{ innerText: "Crea y reutiliza personajes para que tus vídeos tengan coherencia." }];
assert.equal(context.__flowTest.onNewCharacterPage(), true, "debe reconocer la pantalla nueva de Personajes por su encabezado");
const topbarMedia = {
  innerText: "add Añadir archivo multimedia", getAttribute: (name) => name === "aria-haspopup" ? "dialog" : null,
  getBoundingClientRect: () => ({ width: 40, height: 40, top: 20 }),
};
const composerPlus = {
  innerText: "add_2 Crear", getAttribute: (name) => name === "aria-haspopup" ? "dialog" : null,
  getBoundingClientRect: () => ({ width: 40, height: 40, top: 900 }),
};
testButtons = [topbarMedia, composerPlus];
assert.equal(context.__flowTest.composerMediaButton(), composerPlus,
  "debe usar el + junto a Agente, nunca Añadir archivo multimedia de la cabecera");
assert.match(source, /trusted_keyboard/, "Flow debe escribir mediante teclado trusted");
assert.doesNotMatch(source, /textMode\s*:\s*["']insertText["']/,
  "Flow/Slate debe conservar keyDown por caracter; el modo atomico es exclusivo de Grok/ProseMirror");
assert.match(source, /releaseAfterKey: true/, "Flow debe soltar el debugger despues de Enter");
assert.match(source, /flow_set_file_input/, "Flow debe poder subir referencias locales por el canal CDP");
assert.match(source, /async function preloadReferences/,
  "Flow debe preparar su biblioteca persistente antes de empezar las escenas");
assert.match(source, /auditAttachedReferences\(\[\{ label, kind: flowReferenceKind\(label\), mediaKeys \}\]\)/,
  "cada ingrediente precargado debe verificarse por identidad antes de soltar su chip");
assert.doesNotMatch(source, /realClick\(clickable\(uploadBtn\)\)/,
  "subir una referencia no debe abrir el picker nativo de Windows");
assert.match(source, /Flow no expuso el input multimedia interno; cierro sin abrir el selector nativo/,
  "si cambia el DOM debe fallar cerrado en vez de abrir una ventana del sistema");
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
assert.match(source, /auditAttachedReferences\(referenceManifest\)/,
  "antes de Enter debe verificar cantidad e identidad de todos los chips adjuntos");
assert.match(source, /Flow adjunto \$\{chipKeys\.length\}\/\$\{referenceManifest\.length\} referencias/,
  "Flow debe fallar cerrado si falta o sobra cualquier referencia");
assert.match(source, /fresh\.length !== 1[\s\S]*Date\.now\(\) - stableUploadSince >= 1800/,
  "una subida local debe producir un unico tile nuevo, decodificado y estable antes de continuar");
assert.match(source, /referenceChipCount\(\) !== chipsBefore \+ 1 \|\| !newChipKeys\.includes\(uploadedKey\)/,
  "el chip automatico de una subida debe corresponder al mediaKey del tile exacto");
assert.match(source, /a\[href\*="\/edit\/"\]/,
  "la deteccion de resultado debe excluir previews/chips y limitarse a medios editables de la grilla");
assert.match(source, /currentResultImgs\(referenceKeys\)/,
  "el thumbnail de una referencia subida no puede adoptarse como resultado generado");
assert.match(source, /filter\(\(img\) => !isUploadedMediaTile\(img\)\)/,
  "la deteccion DOM debe excluir explicitamente tarjetas de uploads con filename");
assert.match(source, /if \(!submitted\)[\s\S]*Flow no confirmo el envio del prompt/,
  "si Enter no fue confirmado no debe empezar a esperar/adoptar un resultado");
assert.match(source, /Date\.now\(\) - stableSince >= 3000/,
  "el resultado debe estabilizarse varios segundos antes de descargarlo");
assert.match(source, /generationErrorTilesForPrompt\(flowPrompt\)\.length > errorTilesBefore/,
  "una tarjeta Error nueva debe cortar la espera y activar el retry acotado");
assert.match(source, /Flow no confirmo \$\{target\}/,
  "el modelo de imagen solicitado debe verificarse y fallar cerrado");
assert.match(source, /Flow conserva el modo Agente activo/,
  "el modo Agente debe verificarse apagado antes de cada solicitud");
assert.match(source, /flow_local_reference_bindings_v1/,
  "la misma ruta local debe recordar su mediaKey por proyecto en lugar de re-subirse por escena");
assert.match(source, /attachCachedLocalReference\(filePath, cached\.url, cached\.name \|\| displayName\)/,
  "una referencia renombrada debe buscarse por su nombre semantico y no por el basename viejo");
assert.match(source, /if \(wantedKey\) return exact \|\| null/,
  "un cache con mediaKey no debe caer por nombre a otro upload duplicado");
assert.match(source, /flow_file_fingerprint/,
  "el cache local debe invalidarse si cambia el contenido aunque la ruta sea la misma");
assert.match(source, /Cambiar nombre[\s\S]*Texto editable[\s\S]*Hecho/,
  "cada referencia debe poder recibir un nombre semantico mediante el dialogo real de Flow");
assert.match(source, /attachLocalReference\(filePath, localNames\[localIndex\]/,
  "las referencias subidas desde disco deben conservar su nombre semantico");
assert.ok(source.indexOf("for (let nameIndex = 0; nameIndex < names.length; nameIndex++)")
  < source.indexOf("for (let localIndex = 0; localIndex < localPaths.length; localIndex++)"),
"Flow debe adjuntar primero Characters y despues escenarios/props");
assert.match(source, /renameMediaTile\(result\.img, resultName\)/,
  "la salida generada debe nombrarse antes de guardarse y reutilizarse");
assert.match(source, /imageUrl: result\.img\.currentSrc \|\| result\.img\.src/,
  "si Flow usa srcset debe persistirse la imagen realmente renderizada");
assert.match(source, /resultOption\.getAttribute\("aria-selected"\)/,
  "un personaje ya preseleccionado no debe deseleccionarse al adjuntarlo");
assert.match(source, /car\[aá\]cteres\|characters[\s\S]*querySelectorAll\('\[role="option"\]'\)/,
  "el adjunto debe entrar a Characters y no confundir el Character con el upload de igual nombre");
assert.match(source, /setSearch = async[\s\S]*trustedKeyboard\(\{ text: val, replace: true \}\)/,
  "la busqueda de Characters debe usar teclas trusted porque React ignora eventos sinteticos tras recargas");
assert.match(source, /function slateVisibleValue[\s\S]*data-slate-placeholder[\s\S]*textContent/,
  "Flow debe auditar todo el texto visible del editor, no solo data-slate-string");
assert.match(source, /input = resolve\(s\.promptInput\)[\s\S]*clearComposerRequest\(\)[\s\S]*input = resolve\(s\.promptInput\)/,
  "despues de limpiar debe re-resolver el Slate que React pudo reemplazar");
assert.match(source, /Flow altero, acumulo o duplico el prompt antes de enviar/,
  "el envio debe bloquear cualquier residuo visible de prompts anteriores");
assert.match(source, /client-side exception[\s\S]*FLOW_CLIENT_ERROR:/,
  "el driver debe distinguir una caida de la SPA de un selector vacio");
assert.match(serviceWorkerSource, /FLOW_CLIENT_ERROR[\s\S]*hardReloadFlow\(tab\.id\)[\s\S]*FLOW_CLIENT_ERROR_RECOVERED/,
  "una excepcion del cliente debe recargar el mismo proyecto antes de seguir con escenas independientes");
assert.match(source, /REFERENCE ROLES \(metadata, not additional scene prompts\)[\s\S]*SCENE PROMPT \(verbatim\)/,
  "las referencias deben declararse como metadatos compactos sin reescribir el prompt original");
assert.match(source, /trustedClickEl\(clickable\(characterTab\)\)[\s\S]*aria-selected[\s\S]*if \(!selected\) reopenPicker = true/,
  "la pestaña Characters debe activarse con click trusted y reabrirse si React ignora el cambio");
assert.match(source, /if \(!result\) \{[\s\S]*pressEscape\(\)[\s\S]*retryPlus[\s\S]*retryCharacterTab[\s\S]*waitFor\(findResult, \{ timeout: 5000 \}\)/,
  "si el picker no hidrata opciones debe cerrarse y reabrirse una sola vez antes de fallar");
assert.match(source, /if \(!selected\) reopenPicker = true[\s\S]*!reopenPicker && attempt < 3/,
  "si React ignora la pestaña Characters debe reabrir el picker antes de diferir la escena");
assert.match(source, /search\.focus\(\);\s*await trustedKeyboard\(\{ text: searchTerm, replace: true \}\)/,
  "la busqueda de escenarios subidos debe usar teclas trusted y conservar la identidad exacta");
assert.match(source, /catch \(error\)[\s\S]*pressEscape\(\)[\s\S]*throw error/,
  "si falla el selector de Character debe cerrar el modal para no romper la escena siguiente");
assert.match(source, /const failReference = async[\s\S]*clearReferenceChips\(\)\.catch/,
  "un adjunto fallido debe limpiar chips parciales antes de continuar con otra escena");
assert.match(source, /characterFileInputEl/, "la carga de personaje debe usar un input dedicado");
assert.match(serviceWorkerSource, /localReferencePaths: uniqueLocalReferencePaths/,
  "el runner de Flow debe pasar assets locales declarados por la escena");
assert.match(serviceWorkerSource, /localReferenceNames: uniqueLocalReferenceNames/,
  "el runner debe alinear cada asset local con su nombre semantico");
assert.match(serviceWorkerSource, /provider !== "flow"[\s\S]*PRELOAD_REFERENCES/,
  "la biblioteca anticipada debe ser exclusiva de Flow y no alterar Grok");
assert.match(serviceWorkerSource, /comparisonVariant === "flow_images_only"[\s\S]*characterReferenceAssets[\s\S]*characterNames\.push\(effectiveName\)/,
  "la comparativa debe usar cada pose exacta como Character persistente");
assert.match(serviceWorkerSource, /comparisonVariant !== "flow_images_only"[\s\S]*flowGenCount[\s\S]*FLOW_RELOAD_EVERY/,
  "la comparativa con biblioteca persistente no debe recargar Flow entre escenas");
assert.match(serviceWorkerSource, /characterAssetKeys\.has[\s\S]*continue/,
  "una pose usada como Character no debe adjuntarse otra vez como medio");
assert.match(serviceWorkerSource, /convirtiendo \$\{posesByAsset\.size\} pose\(s\) nombradas en Characters persistentes/,
  "Flow debe crear y nombrar todas las poses antes de la primera escena");
assert.match(source, /async function createCharacterFromProjectMedia[\s\S]*Añadir desde el proyecto[\s\S]*Añadir al personaje/,
  "la UI actual debe crear Characters desde los medios ya precargados y nombrados");
assert.match(serviceWorkerSource, /referenceLibrarySignature/,
  "Flow debe reutilizar la biblioteca del proyecto cuando los archivos no cambiaron");
assert.match(serviceWorkerSource, /model: state\.project\?\.imageModel \|\| "Nano Banana Pro"/,
  "cada generacion Flow debe recibir el modelo exacto declarado por el JSON");
assert.match(serviceWorkerSource, /resultName: `Escena — \$\{scene\.id\}`/,
  "cada resultado de escena debe quedar identificable en la biblioteca de Flow");
assert.match(serviceWorkerSource, /async function runRealImage[\s\S]*scene\.skipImageGeneration/,
  "Flow debe omitir narrative_card editor igual que Grok");
assert.match(serviceWorkerSource, /downloadValidatedFlowImage\(candidateImageUrl[\s\S]*referencePaths: uniqueValidationReferencePaths/,
  "una escena Flow debe validar bytes contra todas sus referencias antes de aceptarse");
assert.match(serviceWorkerSource, /forceNewFlowProject[\s\S]*mustCreateFreshProject/,
  "una serie comparativa nueva no debe heredar el proyecto Flow actualmente abierto");
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
assert.match(devServerSource, /reason: "duplicates_reference"/,
  "el servidor debe rechazar una salida que sea una recompresion de la referencia");
assert.match(serviceWorkerSource, /input\[type="file"\]\[accept="image\/\*"\]/,
  "CDP debe apuntar al input de personaje y no al primer file input global");

console.log("OK: Flow usa teclado trusted, memoria de personajes y referencias locales por CDP");
