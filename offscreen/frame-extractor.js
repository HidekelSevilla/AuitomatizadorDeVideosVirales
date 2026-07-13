// offscreen/frame-extractor.js
// Modulo C: extractor del ULTIMO frame de un video, corriendo en un documento offscreen (MV3).
// ES module. Importa constantes de mensajeria desde lib/messaging.js (no las redefine).
//
// Como lo crea el background (modulo D), para referencia:
//   await chrome.offscreen.createDocument({
//     url: "offscreen/frame-extractor.html",
//     reasons: ["BLOBS"],                 // dibujar/leer pixeles de un blob/video en <canvas>
//     justification: "extraer ultimo frame de video",
//   });
// Luego envia: chrome.runtime.sendMessage({ type: "extract_last_frame", url, sceneId })
// y recibe:    { ok:true, dataUrl, lastFrameFilename } | { ok:false, error }.

import { analyzeGrokImagePixels } from "../shared/grok-image-quality.mjs";

// La funcion pura no usa chrome.*; el handler de mensajes si.
// "extract_last_frame" no esta en lib/messaging.js (es interno background<->offscreen);
// igual usamos el string literal acordado en CONTRACT.md.

const EXTRACT_LAST_FRAME = "extract_last_frame";          // { url, sceneId }
const EXTRACT_LAST_FRAME_BUF = "extract_last_frame_buf";  // { buf:ArrayBuffer, mime, sceneId }
const INSPECT_IMAGE_BUF = "inspect_image_buf";             // { buf:ArrayBuffer, mime, thresholds? }
export const IMAGE_INSPECTION_MAX_EDGE = 128;

// Margen (s) que restamos a duration para evitar el frame negro/vacio del final exacto.
const SEEK_EPSILON = 0.05;
// Timeout defensivo: si el video no carga/seek en este tiempo, abortamos.
const EXTRACT_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// Funcion PURA (testeable desde Node con stubs de videoEl/canvasEl).
// No toca chrome.*, no crea elementos: recibe el <video> ya seekeado y un <canvas>.
// Dibuja el frame actual del video en el canvas y devuelve el dataURL PNG.
// ---------------------------------------------------------------------------
export function extractLastFrameFromVideoEl(videoEl, canvasEl) {
  const w = videoEl.videoWidth || 0;
  const h = videoEl.videoHeight || 0;
  if (!w || !h) {
    throw new Error("Video sin dimensiones (videoWidth/videoHeight = 0)");
  }
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener contexto 2d del canvas");
  ctx.drawImage(videoEl, 0, 0, w, h);
  return canvasEl.toDataURL("image/png");
}

// Calcula una muestra pequena preservando aspecto. No ampliamos imagenes pequenas: el caller puede
// usar sourceWidth/sourceHeight del diagnostico para aplicar aparte su piso de dimensiones.
export function imageInspectionSize(sourceWidth, sourceHeight, maxEdge = IMAGE_INSPECTION_MAX_EDGE) {
  const sw = Math.trunc(Number(sourceWidth));
  const sh = Math.trunc(Number(sourceHeight));
  const cap = Math.max(3, Math.trunc(Number(maxEdge)) || IMAGE_INSPECTION_MAX_EDGE);
  if (sw <= 0 || sh <= 0) throw new TypeError("Imagen sin dimensiones validas");
  const scale = Math.min(1, cap / Math.max(sw, sh));
  return {
    width: Math.max(3, Math.round(sw * scale)),
    height: Math.max(3, Math.round(sh * scale)),
  };
}

// Funcion separada para poder probar el muestreo/analisis sin Blob, DOM real ni chrome.*.
export function inspectDecodedImage(image, canvas, thresholds = {}) {
  const sourceWidth = Number(image?.naturalWidth || image?.width || 0);
  const sourceHeight = Number(image?.naturalHeight || image?.height || 0);
  const sample = imageInspectionSize(sourceWidth, sourceHeight);
  canvas.width = sample.width;
  canvas.height = sample.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo obtener contexto 2d para inspeccionar imagen");
  ctx.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
  const quality = analyzeGrokImagePixels(pixels, sample.width, sample.height, thresholds);
  return {
    ...quality,
    sourceWidth,
    sourceHeight,
    sampleWidth: sample.width,
    sampleHeight: sample.height,
  };
}

async function decodeImageBlob(blob) {
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);
    return { image: bitmap, dispose: () => bitmap.close?.() };
  }
  // Fallback para Chrome donde createImageBitmap no este disponible en el documento offscreen.
  return await new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const timer = setTimeout(() => finish(new Error("Timeout decodificando imagen")), EXTRACT_TIMEOUT_MS);
    let done = false;
    const dispose = () => { try { URL.revokeObjectURL(objectUrl); } catch (_e) {} };
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) { dispose(); reject(error); }
      else resolve({ image, dispose });
    };
    image.onload = () => finish(null);
    image.onerror = () => finish(new Error("No se pudo decodificar la imagen"));
    image.src = objectUrl;
  });
}

// Bytes remotos/locales -> Blob de origen-extension -> bitmap -> canvas legible. Esta ruta evita que
// assets.grok.com/imagine-public deje el canvas tainted por CORS en el content script.
export async function inspectImageBuffer(buf, mime = "image/jpeg", thresholds = {}) {
  const bytes = buf instanceof ArrayBuffer
    ? buf
    : (ArrayBuffer.isView(buf) ? buf : null);
  if (!bytes || bytes.byteLength <= 0) throw new TypeError("inspect_image_buf recibio un buffer vacio");
  const blob = new Blob([bytes], { type: mime || "image/jpeg" });
  const decoded = await decodeImageBlob(blob);
  try {
    const canvas = document.createElement("canvas");
    return inspectDecodedImage(decoded.image, canvas, thresholds);
  } finally {
    decoded.dispose?.();
  }
}

// ---------------------------------------------------------------------------
// Orquestacion con chrome/DOM: crea <video> oculto, seek al final, extrae frame.
// ---------------------------------------------------------------------------
function extractLastFrame(url, sceneId) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    let settled = false;
    let timer = null;

    // Limpia listeners/recursos y resuelve una sola vez.
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      try {
        video.removeAttribute("src");
        video.load(); // libera el recurso del video
      } catch (_e) { /* ignora */ }
      resolve(result);
    };

    const fail = (message) => finish({ ok: false, error: String(message) });

    const onLoadedData = () => {
      const duration = video.duration;
      if (!isFinite(duration) || duration <= 0) {
        // Sin duration fiable: intenta dibujar el frame actual ya cargado.
        onSeeked();
        return;
      }
      // Seek al ultimo frame util.
      const target = Math.max(0, duration - SEEK_EPSILON);
      try {
        video.currentTime = target;
      } catch (e) {
        fail("No se pudo hacer seek: " + (e?.message || e));
      }
    };

    const onSeeked = () => {
      try {
        const dataUrl = extractLastFrameFromVideoEl(video, canvas);
        finish({
          ok: true,
          dataUrl,
          lastFrameFilename: `${sceneId}_lastframe.png`,
        });
      } catch (e) {
        fail(e?.message || e);
      }
    };

    const onError = () => {
      const err = video.error;
      fail("Error cargando video" + (err ? ` (code ${err.code})` : ""));
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    // Config del video: muted + sin reproduccion, solo decode para frame.
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    // crossOrigin solo aplica a URLs http(s) remotas; los blob:/data: no lo necesitan
    // y ponerlo no estorba. Necesario para que el canvas no quede "tainted".
    if (/^https?:/i.test(url)) {
      video.crossOrigin = "anonymous";
    }

    timer = setTimeout(() => fail("Timeout extrayendo frame"), EXTRACT_TIMEOUT_MS);

    video.src = url;
  });
}

// ---------------------------------------------------------------------------
// Listener de mensajes: responde de forma asincrona (return true).
// ---------------------------------------------------------------------------
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === EXTRACT_LAST_FRAME) {
      extractLastFrame(message.url, message.sceneId).then(sendResponse);
      return true;
    }
    if (message.type === EXTRACT_LAST_FRAME_BUF) {
      // Bytes recibidos del background -> Blob de origen-extension -> objectURL
      // (canvas SIN taint, a diferencia de cargar la URL remota directamente).
      let objectUrl = null;
      try {
        const blob = new Blob([message.buf], { type: message.mime || "video/mp4" });
        objectUrl = URL.createObjectURL(blob);
      } catch (e) {
        sendResponse({ ok: false, error: "no se pudo crear Blob: " + (e?.message || e) });
        return true;
      }
      extractLastFrame(objectUrl, message.sceneId).then((res) => {
        try { URL.revokeObjectURL(objectUrl); } catch (_e) {}
        sendResponse(res);
      });
      return true;
    }
    if (message.type === INSPECT_IMAGE_BUF) {
      inspectImageBuffer(message.buf, message.mime, message.thresholds)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
      return true;
    }
    return; // no es para nosotros
  });
}
