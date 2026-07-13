import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../content/grok-driver.js", import.meta.url), "utf8");
const serviceWorkerSource = fs.readFileSync(new URL("../background/service-worker.js", import.meta.url), "utf8");
const instrumentedSource = source.replace(/\}\)\(\);\s*$/, "globalThis.__grokTest = { imageDimensionsLookFinal, imageNoiseMetrics, pixelBufferLooksFinal, resultStillGenerating, genId, pickResultImage };})();");

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
  body: { innerText: "" },
  documentElement: {},
  querySelector(selector) {
    if (selector === '[contenteditable][role="textbox"][aria-label="Ask Grok anything"]') return editable;
    if (selector === "form") return form;
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
assert.match(source, /trustedKeyboard\(\{ text: t, replace: true \}\)/,
  "Grok debe registrar el prompt con teclado trusted, no solo mutar innerText");
assert.match(source, /trustedKeyboard\(\{ key: "ENTER", releaseAfterKey: true \}\)/,
  "Enter trusted debe ser la via primaria de envio de Grok");
const fireSource = source.slice(source.indexOf("async function fire"), source.indexOf("async function generateImage"));
assert.doesNotMatch(fireSource, /trustedClickEl/,
  "un intento no debe hacer Enter y luego clic: produciria doble gasto si la senal tarda");
assert.equal(context.__grokTest.imageDimensionsLookFinal({ complete: true, naturalWidth: 144, naturalHeight: 256 }), false,
  "el preview progresivo 144x256 de /post no debe aceptarse como resultado final");
assert.equal(context.__grokTest.imageDimensionsLookFinal({ complete: true, naturalWidth: 720, naturalHeight: 1280 }), true,
  "la salida final 720x1280 debe aceptarse");

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
assert.match(serviceWorkerSource, /\.grok-candidates/,
  "las descargas sin validar deben ir a cuarentena y no al canonical");
assert.match(serviceWorkerSource, /previous\.matches >= 4/,
  "deben coincidir cuatro huellas consecutivas antes de aceptar bytes mutables");
assert.match(serviceWorkerSource, /sample <= 12/,
  "debe haber margen para que un placeholder tardio mute y luego estabilice cuatro hashes");
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
assert.match(candidateValidationSource, /if \(!validation\.accepted\)[\s\S]*?previous = null;[\s\S]*?continue;/,
  "una muestra ruidosa debe reiniciar la racha y seguir observando la URL mutable");
assert.match(candidateValidationSource, /downloadAttempt <= 3/,
  "un fallo de descarga debe reintentar el mismo candidato sin otro Enter");
assert.match(candidateValidationSource, /guardedDownload\.noAutoRetry = true/,
  "agotar descargas debe pausar, no regenerar");
assert.ok(serviceWorkerSource.indexOf("downloadValidatedGrokCandidate(img, slug, scene.id")
  < serviceWorkerSource.indexOf("scene.imageUrl = imageUrl"),
"la escena no debe adoptar imageUrl antes de validar la descarga");

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

console.log("OK: grok driver filtra feed, confirma adjuntos y reconoce grilla/post con huellas compactas");
