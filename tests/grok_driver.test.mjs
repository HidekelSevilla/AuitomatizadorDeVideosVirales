import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content/grok-driver.js", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const instrumentedSource = source.replace(/\}\)\(\);\s*$/, "globalThis.__grokTest = { imageDimensionsLookFinal, imageNoiseMetrics, pixelBufferLooksFinal, resultStillGenerating, resultActionsReady, titledGridVariantsReady, genId, postUrlFromContentSrc, pickResultImage, promptResultGroups, latestPromptResultGroup, postResultRootForPrompt, titleResultRootForPrompt, submittedPostResultRoot };})();");

let messageListener = null;
const editable = { closest: () => form, innerText: "" };
const send = { getAttribute: (name) => name === "aria-label" ? "Enviar" : null, disabled: false };
const fileInput = { files: { length: 2 } };
let confirmedRefs = 2;
const removeButtons = Array.from({ length: 2 }, () => ({
  getAttribute: (name) => name === "aria-label" ? "Remove image" : null,
}));
const form = {
  contains: () => false,
  querySelector(selector) {
    if (selector.includes('input[type="file"]')) return fileInput;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "button,[role=button]") return [send, ...removeButtons.slice(0, confirmedRefs)];
    if (selector === "button") return removeButtons.slice(0, confirmedRefs);
    return [];
  },
};
let images = [];
let postArticle = null;
const videos = [
  {
    currentSrc: "https://imagine-public.x.ai/imagine-public/share-videos/feed_hd.mp4",
    src: "https://imagine-public.x.ai/imagine-public/share-videos/feed_hd.mp4",
  },
  {
    currentSrc: "https://assets.grok.com/users/test/generated/post-123/generated_video.mp4",
    src: "https://assets.grok.com/users/test/generated/post-123/generated_video.mp4",
  },
];

const document = {
  title: "Imagine - Grok",
  body: { innerText: "" },
  documentElement: {},
  querySelector(selector) {
    if (selector === '[contenteditable][role="textbox"][aria-label="Ask Grok anything"]') return editable;
    if (selector === "form") return form;
    if (selector === "main article") return postArticle;
    if (selector === "main") return postArticle;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "video") return videos;
    if (selector === "img") return images;
    return [];
  },
};

const context = {
  chrome: {
    runtime: {
      onMessage: { addListener(fn) { messageListener = fn; } },
      sendMessage: async () => ({ ok: true }),
    },
  },
  console: { log() {}, warn() {} },
  document,
  getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  Image: class {},
  isFinite,
  location: { href: "https://grok.com/imagine", pathname: "/imagine" },
  Math,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
  PointerEvent: class {},
  setInterval,
  clearInterval,
  setTimeout,
  window: {},
};

vm.runInNewContext(instrumentedSource, context, { filename: "content/grok-driver.js" });
assert.equal(typeof messageListener, "function", "el driver debe registrar su listener");
assert.match(source, /GROK_DRIVER_VERSION[\s\S]*__grokDriverVersion[\s\S]*removeListener\(window\.__grokDriverMessageListener\)/,
  "el driver debe actualizarse sin recargar Grok ni perder una grilla generada");
assert.match(source, /const textMode = attempt < attempts - 1 \? "insertText" : "keys";[\s\S]*trustedKeyboard\(\{[\s\S]*text: t,[\s\S]*textMode,[\s\S]*chunkChars:/,
  "Grok debe escribir el prompt completo por bloques y conservar keyDown como respaldo");
assert.match(serviceWorkerSource, /textMode === "insertText"[\s\S]*chunkThresholdChars[\s\S]*Array\.from\(normalizedText\)\.length > threshold[\s\S]*chunkTextForTrustedInput[\s\S]*for \(let i = 0; i < chunks\.length; i\+\+\)[\s\S]*"Input\.insertText"/,
  "el background debe conservar un pegado hasta 3k y dividir solo los prompts mayores sin recortarlos");
assert.match(serviceWorkerSource, /const maxReactiveRetries = isGrokSafeComposerError\(e\) \? 2 : 1/,
  "un 0\/N pre-submit debe recargar y reintentarse mas veces sin pausar la corrida al primer ciclo");
assert.match(source, /async function stablePromptEditable\([\s\S]*current !== candidate[\s\S]*stableMs/,
  "Grok debe esperar que ProseMirror deje de reemplazarse tras procesar referencias");
assert.match(source, /for \(let attempt = 0; attempt < attempts; attempt\+\+\)[\s\S]*await trustedClickEl\(ed\)[\s\S]*trustedKeyboard\(\{[\s\S]*text: t,[\s\S]*textMode,/,
  "la escritura debe recuperar foco real y reintentarse localmente antes de recargar o generar");
const composerFireSource = source.slice(source.indexOf("async function fire"), source.indexOf("async function generateImage"));
assert.match(composerFireSource, /await rsleep[\s\S]*stablePromptEditable[\s\S]*await trustedClickEl\(currentEditor\)[\s\S]*persistImageSubmitIntent[\s\S]*trustedKeyboard\(\{ key: "ENTER"/,
  "despues de la pausa de revision debe recuperar foco justo antes de la frontera durable y Enter");
assert.match(source, /textarea\[aria-label="Mensaje para obtener imagen"\]/,
  "Grok debe soportar el composer nuevo basado en textarea con aria-label en espanol");
assert.match(source, /controlButtonByLabel\("Relación de aspecto", "Aspect ratio"\)/,
  "Grok debe reconocer el selector de aspecto actual en espanol e ingles");
assert.match(source, /async function setImageCount\(\)/,
  "Grok debe fijar explicitamente las cuatro variaciones de la UI actual");
assert.match(source, /await setImageCount\(\)/,
  "generateImage debe normalizar la cantidad antes de enviar");
assert.match(source, /PREPARE_IMAGE: "act:prepare_image"/,
  "Grok debe preparar Imagen antes de subir referencias porque el cambio de modo las borra");
assert.match(source, /async function prepareImage\(\)/,
  "Grok debe confirmar el modo Imagen antes de adjuntar referencias");
assert.match(source, /PREPARE_VIDEO: "act:prepare_video"/,
  "Grok debe exponer una preparacion de Video separada para subir el still despues del cambio de modo");
assert.match(source, /async function prepareVideo\(\)/,
  "Grok debe confirmar el modo Video antes de adjuntar la imagen");
assert.match(source, /trustedKeyboard\(\{ key: "ENTER", releaseAfterKey: true \}\)/,
  "Enter trusted debe ser la via primaria de envio de Grok");
const fireSource = source.slice(source.indexOf("async function fire"), source.indexOf("async function generateImage"));
assert.doesNotMatch(fireSource, /trustedClickEl\((?:ready|sendButton\(\)|currentButton)/,
  "un intento no debe hacer Enter y luego clicar Enviar: produciria doble gasto si la senal tarda");
assert.match(fireSource, /trustedClickEl\(currentEditor\)/,
  "el click permitido en fire solo recupera el foco del editor; no acciona Enviar");
assert.equal(context.__grokTest.imageDimensionsLookFinal({ complete: true, naturalWidth: 144, naturalHeight: 256 }), false,
  "el preview progresivo 144x256 de /post no debe aceptarse como resultado final");
assert.equal(context.__grokTest.imageDimensionsLookFinal({ complete: true, naturalWidth: 720, naturalHeight: 1280 }), true,
  "la salida final 720x1280 debe aceptarse");

const exactGridPrompt = "EMPTY sterile office, no people";
const gridRoot = {
  innerText: "",
  querySelector: () => null,
  querySelectorAll: (selector) => selector === "img" ? images : [],
};
const gridImage = (id) => ({
  complete: true,
  naturalWidth: 720,
  naturalHeight: 1280,
  currentSrc: `data:image/jpeg;base64,FINAL_VARIANT_${id}`,
  src: `data:image/jpeg;base64,FINAL_VARIANT_${id}`,
  innerText: "",
  parentElement: null,
});
postArticle = gridRoot;
document.title = `${exactGridPrompt} - Grok`;
images = [1, 2, 3, 4].map(gridImage);
assert.equal(context.__grokTest.titledGridVariantsReady(exactGridPrompt, gridRoot, new Set(), {}), true,
  "la cuadrilla exacta de cuatro variantes finales debe saltar la espera de botones inexistentes");
images = [1, 2, 3].map(gridImage);
assert.equal(context.__grokTest.titledGridVariantsReady(exactGridPrompt, gridRoot, new Set(), {}), false,
  "tres variantes no prueban que la cuadrilla x4 haya terminado");
images = [1, 2, 3, 4].map(gridImage);
assert.equal(context.__grokTest.titledGridVariantsReady("otro prompt", gridRoot, new Set(), {}), false,
  "la cuadrilla rapida nunca debe adoptar resultados de otro prompt");
postArticle = null;
document.title = "Imagine - Grok";
images = [];

// El boton Guardar aparece tambien sobre frames intermedios: nunca debe puentear el analisis visual.
const generateSource = source.slice(source.indexOf("async function generateImage"), source.indexOf("async function collectImage"));
assert.doesNotMatch(generateSource, /resultCardReady\(el\)\s*\|\|\s*await dataImageLooksFinal/,
  "Guardar no debe convertir un placeholder de ruido en resultado final");
assert.doesNotMatch(source, /function resultCardReady/,
  "ningun boton Guardar/Descargar debe actuar como verificador de calidad");
assert.match(generateSource, /imageUrl: settledSrc/,
  "debe devolver el mismo src validado, no releer un nodo que React pudo sustituir");
assert.match(generateSource, /candidateImages/,
  "debe devolver variantes ya generadas para probarlas sin otro Enter");
assert.match(source, /pixelFingerprint !== lastPixelFingerprint/,
  "una URL mutable debe reiniciar el settle cuando cambian sus pixeles");
assert.match(source, /DOCUMENT_POSITION_FOLLOWING \? 1 : -1/,
  "la recuperacion sin before debe preferir el grupo mas reciente, no una escena antigua");
assert.match(source, /function promptResultGroups\(prompt\)/,
  "Grok debe relacionar cada cuadrilla con el prompt que la creo");
assert.match(generateSource, /resultImageEls\(promptGroup\)/,
  "generateImage solo puede observar imagenes dentro del bloque del prompt actual");
assert.doesNotMatch(generateSource, /promptGroupsBefore/,
  "no debe exigir un nodo React nuevo: Grok puede reutilizar el bloque del mismo prompt");
assert.match(generateSource, /!before\.has\(genId\(img\.currentSrc \|\| img\.src\)\)/,
  "el bloque actual se reconoce por una clave de imagen nueva, no por identidad del nodo");
assert.match(generateSource, /grokPromptGroupTimeoutMs[\s\S]*180000/,
  "Grok puede tardar mas de 30s en montar el bloque; debe esperar hasta tres minutos");
assert.match(generateSource, /postResultRootForPrompt\(prompt\)/,
  "una generacion con referencia debe adoptar directamente su /post en vez de esperar la grilla normal");
assert.match(generateSource, /submittedPostResultRoot\(submitSignal\)/,
  "el /post nuevo debe vincularse al Enter actual aunque Grok ya no repita el prompt en su DOM");
assert.match(generateSource, /titleResultRootForPrompt\(prompt\)/,
  "la grilla nueva debe vincularse por el titulo exacto cuando Grok quita el prompt del DOM");
assert.match(generateSource, /navegacion tardia a post/,
  "la URL del post debe persistirse aunque aparezca despues del primer ACK del submit");
assert.match(generateSource, /postUrlFromContentSrc\(settledSrc\)/,
  "el endpoint content debe dar el post exacto sin esperar una navegacion inexistente");
assert.match(generateSource, /finalUiReady = resultActionsReady\(el\)[\s\S]*titledGridVariantsReady\(prompt, promptGroup, before, cfg\)[\s\S]*isData\(cur\) && finalUiReady[\s\S]*dataImageLooksFinal/,
  "un data URL solo puede usar acciones finales o una cuadrilla x4 exacta y aun debe validar sus pixeles");
assert.match(source, /hasSave && hasCreateVideo/,
  "la grilla debe exigir Guardar + Crear video dentro de la misma tarjeta");
assert.match(source, /hasDownload && hasFinalAction/,
  "Descargar solo no basta: debe existir otra accion final habilitada");
assert.match(generateSource, /timeout: 2500/,
  "una grilla inline no debe esperar ocho segundos por un post que no abrira");
const collectSource = source.slice(source.indexOf("async function collectImage"), source.indexOf("function inspect"));
assert.doesNotMatch(collectSource, /Math\.min\(Math\.max\(1000, timeoutMs\), 15000\)/,
  "recuperacion no debe truncar a 15s el timeout de 180s pedido por el worker");
assert.match(collectSource, /timeout: Math\.max\(1000, timeoutMs\)/,
  "recuperacion debe respetar la espera larga solicitada");
assert.match(collectSource, /titledGridVariantsReady\(prompt, resultRoot, exclude, cfg\)[\s\S]*isData\(cur\) && finalUiReady[\s\S]*dataImageLooksFinal/,
  "la recuperacion debe reconocer la cuadrilla x4 exacta sin omitir la validacion visual");
assert.match(source, /GROK_PROMPT_GROUP_EMPTY:[\s\S]*no tomo una imagen anterior/,
  "un bloque vacio debe fallar explicitamente en vez de adoptar otra escena");
assert.match(serviceWorkerSource, /images\/grok-candidates\//,
  "las descargas sin validar deben ir a cuarentena y no al canonical");
assert.doesNotMatch(serviceWorkerSource, /previous\.matches >= 4|sample <= 12/,
  "una imagen valida no debe provocar cuatro o doce descargas redundantes");
assert.match(serviceWorkerSource, /sample <= 4/,
  "solo una muestra rechazada puede volver a comprobarse, con un limite corto");
const sendGrokSource = serviceWorkerSource.slice(serviceWorkerSource.indexOf("async function sendGrokGenerateImage("),
  serviceWorkerSource.indexOf("async function clearGrokRefsOrFail"));
assert.match(sendGrokSource, /guardedSubmit\.noAutoRetry = true/,
  "un Enter ambiguo debe terminar en pausa, nunca autorizar otro envio");
const grokUiRetrySource = serviceWorkerSource.slice(serviceWorkerSource.indexOf("async function sendGrokGenerateImageWithUiRetry"),
  serviceWorkerSource.indexOf("function sendToTab"));
assert.doesNotMatch(grokUiRetrySource, /isGrokSendNotRegisteredError|ambiguousSubmit/,
  "el wrapper de UI solo puede reintentar fallos previos al submit");
const candidateValidationSource = serviceWorkerSource.slice(serviceWorkerSource.indexOf("async function downloadValidatedGrokCandidate"),
  serviceWorkerSource.indexOf("async function moveStillToProject"));
assert.match(candidateValidationSource, /if \(!validation\.accepted\)[\s\S]*?continue;/,
  "una muestra ruidosa debe seguir observando la URL mutable");
assert.match(candidateValidationSource, /return \{ \.\.\.candidate, \.\.\.saved, validation/,
  "la primera descarga que pasa calidad debe aceptarse sin repetirla");
assert.match(candidateValidationSource, /blockedHashes\.has\(byteHash\)/,
  "la URL no basta: una escena con bytes identicos a otra debe rechazarse");
assert.match(serviceWorkerSource, /knownSceneImageHashes\(\{ excludeSceneId: scene\.id \}\)/,
  "la validacion debe cargar hashes canonicos aunque el estado haya perdido las URLs de Grok");
assert.match(candidateValidationSource, /downloadAttempt <= 3/,
  "un fallo de descarga debe reintentar el mismo candidato sin otro Enter");
assert.match(candidateValidationSource, /guardedDownload\.noAutoRetry = true/,
  "agotar descargas debe pausar, no regenerar");
assert.ok(serviceWorkerSource.indexOf("downloadValidatedGrokCandidate(img, slug, scene.id")
  < serviceWorkerSource.indexOf("scene.imageUrl = imageUrl"),
"la escena no debe adoptar imageUrl antes de validar la descarga");
assert.match(serviceWorkerSource, /scene\.imageFilePath = moved\.abspath \|\| chosen\.abspath/,
  "imageFilePath debe apuntar al canonical despues de mover y borrar el temporal");

const rgba = (w, h, rgbAt) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = rgbAt(x, y);
    const i = (y * w + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return out;
};
const smooth = rgba(24, 24, (x, y) => [70 + x * 2, 80 + y * 2, 110 + x]);
const highContrastScene = rgba(24, 24, (x) => x < 12 ? [5, 5, 5] : [245, 245, 245]);
let randomState = 0xC0D3;
const rand = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState >>> 24; };
const noise = rgba(24, 24, () => [rand(), rand(), rand()]);
const checker = rgba(24, 24, (x, y) => ((x + y) % 2 ? [255, 10, 230] : [0, 245, 20]));
assert.equal(context.__grokTest.pixelBufferLooksFinal(smooth, 24, 24), true,
  "una imagen con estructura suave debe pasar el detector");
assert.equal(context.__grokTest.pixelBufferLooksFinal(highContrastScene, 24, 24), true,
  "un borde real de alto contraste no debe confundirse con ruido repartido por todo el cuadro");
assert.equal(context.__grokTest.pixelBufferLooksFinal(checker, 24, 24), true,
  "un patron periodico con correlacion negativa fuerte no debe confundirse con ruido aleatorio");
assert.equal(context.__grokTest.pixelBufferLooksFinal(noise, 24, 24), false,
  "el grano de alta frecuencia debe rechazarse aunque tenga dimensiones finales");
assert.equal(context.__grokTest.resultStillGenerating({ innerText: "Generando imagen 92%", parentElement: null }), true,
  "no debe aceptar una imagen mientras su tarjeta siga mostrando progreso");
assert.equal(context.__grokTest.resultStillGenerating({ innerText: "Guardar", parentElement: null }), false,
  "una tarjeta final sin progreso no debe quedar bloqueada");

function invoke(message) {
  return new Promise((resolve) => {
    const asyncResponse = messageListener(message, {}, resolve);
    assert.equal(asyncResponse, true);
  });
}

const inspect = await invoke({ type: "act:inspect_dom" });
assert.equal(inspect.ok, true);
assert.equal(inspect.data.hasPrompt, true);
assert.equal(inspect.data.hasSend, true);
assert.equal(inspect.data.videos, 1, "el feed Descubrir no debe contar como resultado de animacion");
assert.equal(inspect.data.attachments.count, 2, "debe reconocer dos chips ya procesados por Grok");

const refs = await invoke({ type: "act:wait_for_refs", expected: 2, timeoutMs: 100, stableMs: 0 });
assert.equal(refs.ok, true);
assert.equal(refs.data.fileCount, 2);

// FileList solo NO prueba que React haya consumido/subido las referencias.
confirmedRefs = 0;
const prematureRefs = await invoke({ type: "act:wait_for_refs", expected: 2, timeoutMs: 100, stableMs: 0 });
assert.equal(prematureRefs.ok, false, "no debe confirmar referencias solo porque input.files ya cambio");
confirmedRefs = 2;

const srcs = await invoke({ type: "act:video_srcs" });
assert.deepEqual([...srcs.data.srcs], ["post-123"]);

// Las cuatro variantes data: deben viajar como huellas compactas, nunca como base64 gigantes.
const dataSrc = `data:image/jpeg;base64,${"A".repeat(60000)}B`;
images = [{
  currentSrc: dataSrc, src: dataSrc, naturalWidth: 720, naturalHeight: 1280,
  getBoundingClientRect: () => ({ width: 333, height: 592 }),
  compareDocumentPosition: () => 0,
  closest: () => null,
}];
const keys = await invoke({ type: "act:image_keys" });
assert.equal(keys.ok, true);
assert.equal(keys.data.keys.length, 1);
assert.match(keys.data.keys[0], /^data:\d+:[0-9a-f]{8}$/);
assert.ok(keys.data.keys[0].length < 40, "la huella no debe incluir el data URL completo");

// Una clave persistida por el SW debe seguir excluyendo el asset tras recargar /imagine, incluso si
// ya no estaba presente cuando el content tomo su snapshot inicial. Esto evita scene_01 -> scene_02.
const oldDataKey = context.__grokTest.genId(dataSrc);
assert.equal(context.__grokTest.pickResultImage(new Set([oldDataKey])), null,
  "un resultado ya asignado no debe volver a elegirse como imagen nueva");

// La escena actual puede tener un bloque vacio mientras el anterior conserva variantes distintas.
// El selector debe devolver el contenedor exacto y el picker acotado no puede ver las imagenes viejas.
const promptText = "CLEAR LITERAL SCENE — escena tres sin texto";
const promptLeaf = { textContent: promptText, children: [], parentElement: null };
const promptHeader = { textContent: promptText, children: [promptLeaf], parentElement: null, className: "sticky", querySelector: () => null };
const promptList = { textContent: "", children: [], parentElement: null, querySelectorAll: () => [] };
const promptGroup = {
  textContent: promptText, innerText: promptText, children: [promptHeader, promptList], parentElement: null,
  className: "flex flex-col gap-3 mb-1 relative", querySelector: () => null, querySelectorAll: () => [],
};
promptLeaf.parentElement = promptHeader; promptHeader.parentElement = promptGroup; promptList.parentElement = promptGroup;
const originalDocumentQueryAll = document.querySelectorAll.bind(document);
document.querySelectorAll = (selector) => selector === "span,p,div" ? [promptLeaf] : originalDocumentQueryAll(selector);
assert.equal(context.__grokTest.latestPromptResultGroup(promptText), promptGroup,
  "debe ubicar el bloque por igualdad exacta del prompt");
assert.equal(context.__grokTest.pickResultImage(new Set(), promptGroup), null,
  "un bloque actual vacio no puede caer a imagenes globales del prompt anterior");
document.querySelectorAll = originalDocumentQueryAll;

// Con referencia, Grok separa el prompt (fuera de main) y las variantes (main>article). El /post exacto
// debe ser un scope valido inmediato; antes esta forma esperaba 180s y luego 60s de recuperacion.
const postPrompt = "young Korean man with short black hair gray coverall";
const postPromptLeaf = { textContent: postPrompt, children: [] };
postArticle = { querySelectorAll: () => [] };
context.location.pathname = "/imagine/post/current-reference-result";
context.location.href = "https://grok.com/imagine/post/current-reference-result";
document.querySelectorAll = (selector) => selector === "span,p,div" ? [postPromptLeaf] : originalDocumentQueryAll(selector);
assert.equal(context.__grokTest.postResultRootForPrompt(postPrompt), postArticle,
  "el prompt exacto + /post debe devolver directamente el article de variantes");
document.querySelectorAll = originalDocumentQueryAll;
postArticle = null;

// Al abrir una variante, Grok sirve el JPG desde imagine-public.x.ai; dentro de /post SI es resultado.
const publicSrc = "https://imagine-public.x.ai/imagine-public/images/post-public-1.jpg";
context.location.pathname = "/imagine/post/post-public-1";
context.location.href = "https://grok.com/imagine/post/post-public-1";
images = [{
  currentSrc: publicSrc, src: publicSrc, naturalWidth: 720, naturalHeight: 1280,
  getBoundingClientRect: () => ({ width: 473, height: 840 }),
  compareDocumentPosition: () => 0,
  closest: (selector) => selector === "main,article" ? {} : null,
}];
const postKeys = await invoke({ type: "act:image_keys" });
assert.deepEqual([...postKeys.data.keys], ["post:post-public-1"]);

// UI julio-2026: el visor sirve la imagen final desde /users/<user>/<post>/content y ya no muestra
// el prompt enviado. Debe reconocerse solo dentro del /post y conservar una clave estable por post.
const contentPostId = "d5028df7-6dbc-466d-85a7-e5f27eef7a13";
const contentSrc = `https://assets.grok.com/users/user-1/${contentPostId}/content?cache=1`;
assert.equal(context.__grokTest.postUrlFromContentSrc(contentSrc), `https://grok.com/imagine/post/${contentPostId}`,
  "el endpoint /content debe derivar su post exacto sin esperar navegacion");
images = [{
  currentSrc: contentSrc, src: contentSrc, naturalWidth: 720, naturalHeight: 1280,
  getBoundingClientRect: () => ({ width: 473, height: 840 }),
  compareDocumentPosition: () => 0,
  closest: (selector) => selector === "main,article" ? {} : null,
}];
const contentPostKeys = await invoke({ type: "act:image_keys" });
assert.deepEqual([...contentPostKeys.data.keys], [`post:${contentPostId}`]);
postArticle = { querySelectorAll: () => images };
assert.equal(context.__grokTest.submittedPostResultRoot({ preUrl: "https://grok.com/imagine", postUrl: null }), postArticle,
  "la navegacion nueva a /post debe bastar durante el mismo submit aunque el prompt ya no exista en el DOM");
assert.equal(context.__grokTest.submittedPostResultRoot({ preUrl: context.location.href, postUrl: null }), null,
  "una recuperacion fuera del submit no debe adoptar ciegamente el post que ya estaba abierto");
postArticle = null;

// Sin referencias, la UI nueva conserva el prompt exacto solo en document.title. La huella `before`
// acota despues las imagenes nuevas; un titulo diferente nunca puede abrir el scope global.
context.location.pathname = "/imagine";
context.location.href = "https://grok.com/imagine";
document.title = `${postPrompt} - Grok`;
assert.equal(context.__grokTest.titleResultRootForPrompt(postPrompt), document,
  "el titulo exacto debe recuperar la grilla actual aunque no exista un bloque de prompt");
assert.equal(context.__grokTest.titleResultRootForPrompt("otro prompt"), null,
  "un titulo de otra generacion no puede adoptar la grilla actual");
const inlineContentKeys = await invoke({ type: "act:image_keys" });
assert.deepEqual([...inlineContentKeys.data.keys], [`post:${contentPostId}`],
  "el endpoint /content debe reconocerse tambien en la grilla principal titulada de /imagine");
document.title = "Imagine - Grok";
const genericHomeKeys = await invoke({ type: "act:image_keys" });
assert.deepEqual([...genericHomeKeys.data.keys], [],
  "un /content del inicio generico no puede confundirse con una generacion actual");

console.log("OK: grok driver filtra feed, confirma adjuntos y reconoce grilla/post con huellas compactas");
