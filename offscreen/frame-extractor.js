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

// La funcion pura no usa chrome.*; el handler de mensajes si.
// "extract_last_frame" no esta en lib/messaging.js (es interno background<->offscreen);
// igual usamos el string literal acordado en CONTRACT.md.

const EXTRACT_LAST_FRAME = "extract_last_frame";          // { url, sceneId }
const EXTRACT_LAST_FRAME_BUF = "extract_last_frame_buf";  // { buf:ArrayBuffer, mime, sceneId }

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
    return; // no es para nosotros
  });
}
