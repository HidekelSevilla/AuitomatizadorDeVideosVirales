// content/grok-driver.js
// Driver hermano de flow-driver.js para Grok Imagine (grok.com/imagine). Implementa el MISMO
// contrato ACT.* que espera el service worker (PING / GENERATE_IMAGE / ANIMATE), para que la cola
// y los runners secuenciales del SW sirvan igual cambiando solo config.provider.
//
// DIFERENCIAS CLAVE vs Flow (mapeadas en vivo 2026-06-16, ver memoria grok-future-animation):
//  - El compositor es UN <form>: prompt = [contenteditable] ("Ask Grok anything"); modos Imagen/Video
//    (role=menuitemradio, texto exacto); aspecto "Relación de aspecto"; generar = button aria-label "Enviar".
//  - Las REFERENCIAS (personaje + escenas previas) las sube el SW via CDP DOM.setFileInputFiles al
//    input[type=file][name=files] ANTES de mandar GENERATE_IMAGE/ANIMATE. Grok SI procesa archivos
//    puestos por codigo (a diferencia de Flow). Aparece un chip con boton aria-label "Remove image".
//  - Generar exige click TRUSTED (como "Generar" de Flow): trustedClickEl pide el click al SW (CDP).
//  - Resultados de imagen: <img src*="assets.grok.com/users/.../generated/<genid>/image.jpg"> (~832px,
//    fuera del <form>). Resultados de video: <video> con src de assets.grok.com (lo descarga el SW via
//    chrome.downloads, que SI manda cookies; assets.grok.com requiere sesion).
//
// PENDIENTE DE SHAKEOUT EN VIVO: confirmar 9:16, el patron exacto de URL del VIDEO y los tiempos.

(() => {
  if (window.__grokDriverLoaded) return;
  window.__grokDriverLoaded = true;

  // ACT replicado a mano (igual que flow-driver: el content script no importa modulos).
  const ACT = {
    PING: "act:ping",
    INSPECT_DOM: "act:inspect_dom",
    GENERATE_IMAGE: "act:generate_image",
    ANIMATE: "act:animate",
    ANIMATE_FIRE: "act:animate_fire",
    ANIMATE_COLLECT: "act:animate_collect",
    VIDEO_SRCS: "act:video_srcs",
    CLEAR_REFS: "act:clear_refs",
  };
  const RES = { CAPTCHA: "res:captcha", NO_CREDITS: "res:no_credits", RATE_LIMIT: "res:rate_limit" };

  // ------------------------------------------------------------------ utils ---
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rsleep = (min, max) => sleep(Math.round(min + Math.random() * Math.max(0, max - min)));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };

  function waitFor(predicate, { timeout = 120000, interval = 500 } = {}) {
    return new Promise((resolveP, rejectP) => {
      const t0 = Date.now();
      let done = false;
      const finish = (fn, arg) => { if (done) return; done = true; obs.disconnect(); clearInterval(iv); fn(arg); };
      const check = () => { let v = null; try { v = predicate(); } catch (_e) { v = null; } if (v) finish(resolveP, v); return !!v; };
      const obs = new MutationObserver(() => check());
      const iv = setInterval(() => { if (check()) return; if (Date.now() - t0 > timeout) finish(rejectP, new Error("timeout esperando condicion en Grok")); }, interval);
      try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true }); } catch (_e) {}
      check();
    });
  }

  // Click TRUSTED via el background (CDP). Grok exige isTrusted para "Enviar" (anti-bot), igual que Flow.
  async function trustedClickEl(el) {
    if (!el) throw new Error("trustedClickEl: nodo nulo");
    el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(200);
    const r = el.getBoundingClientRect();
    const resp = await chrome.runtime.sendMessage({ type: "trusted_click", x: r.left + r.width / 2, y: r.top + r.height / 2 });
    if (!resp || !resp.ok) throw new Error("click trusted fallo: " + (resp?.error || "sin respuesta del background"));
  }

  // Quita las referencias adjuntas (chips con boton aria-label "Remove image") del compositor, para
  // que el SW pueda setear un set nuevo por CDP sin acumular las de la escena previa.
  async function clearRefs() {
    let n = 0;
    for (const b of [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === "Remove image")) {
      try { b.click(); n++; await sleep(200); } catch (_e) {}
    }
    return { ok: true, data: { removed: n } };
  }

  // -------------------------------------------------------------- deteccion ---
  const composeForm = () => document.querySelector("form");
  const promptEditable = () => document.querySelector("form [contenteditable]") || document.querySelector("[contenteditable]");
  const sendButton = () => [...document.querySelectorAll("button,[role=button]")].find((b) => b.getAttribute("aria-label") === "Enviar");

  // Tiles de error de Grok ("Hemos detectado actividad inusual" = rate-limit anti-abuso).
  function detectHardStop() {
    const t = document.body ? document.body.innerText : "";
    if (/actividad inusual|unusual activity/i.test(t)) return { type: RES.RATE_LIMIT }; // anti-abuso por ritmo: el SW aplica cooldown creciente y reanuda solo (no es falta de creditos)
    return null;
  }

  // Imagenes de RESULTADO (generadas): assets.grok.com/.../generated/<genid>/image... FUERA del compositor.
  function resultImageEls() {
    const form = composeForm();
    return [...document.querySelectorAll('img[src*="assets.grok.com"]')].filter(
      (i) => /\/generated\//.test(i.src) && !/profile-picture/.test(i.src) && i.naturalWidth >= 400 && !(form && form.contains(i))
    );
  }
  // id de generacion para deduplicar/comparar antes/despues.
  const genId = (url) => { const m = (url || "").match(/generated\/([^/?]+)/); return m ? m[1] : (url || ""); };
  function currentResultGenIds() { return new Set(resultImageEls().map((i) => genId(i.src))); }

  // Videos de resultado (excluye banners gstatic). Grok sirve el video desde assets.grok.com.
  function resultVideos() {
    return [...document.querySelectorAll("video")].filter((v) => {
      const s = v.currentSrc || v.src || "";
      return s && !/gstatic/.test(s);
    });
  }
  const vidName = (url) => { const m = (url || "").match(/generated\/([^/?]+)/) || (url || "").match(/name=([^&]+)/); return m ? m[1] : (url || ""); };
  function currentVideoNames() { return new Set(resultVideos().map((v) => vidName(v.currentSrc || v.src))); }

  // ------------------------------------------------------------- acciones -----
  // Selecciona el modo (radio "Imagen" / "Video") por texto exacto.
  async function setMode(name) {
    const el = [...document.querySelectorAll("[role=menuitemradio],button,[role=button]")]
      .find((e) => visible(e) && norm(e.innerText) === name);
    if (el) { el.click(); await sleep(400); return true; }
    return false;
  }

  // Escribe el prompt en el contenteditable (execCommand registra en el editor React; .innerText no basta).
  async function setPrompt(text) {
    const ed = promptEditable();
    if (!ed) throw new Error("no encuentro el prompt (contenteditable) de Grok");
    ed.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(ed);
    document.execCommand("delete");
    // TIPEO HUMANO: fragmentos de 2-5 chars con jitter (no de golpe = firma de bot).
    const t = text || "";
    for (let i = 0, typed = 0; i < t.length;) {
      const n = 2 + Math.floor(Math.random() * 4);
      const chunk = t.slice(i, i + n);
      document.execCommand("insertText", false, chunk);
      i += chunk.length; typed += chunk.length;
      await rsleep(40, 140);
      if (typed % 40 < n) await rsleep(200, 500);
    }
    return norm(ed.innerText).length;
  }

  // Dispara "Enviar" (trusted) y verifica que el prompt se vacie (= enviado). El SW ya dejo las
  // referencias en el input[file] via CDP antes de llamarnos.
  async function fire() {
    const ed = promptEditable();
    const before = norm(ed?.innerText || "").length;
    const btn = sendButton();
    if (!btn) throw new Error('no encuentro el boton "Enviar" de Grok');
    ed && ed.focus();
    await rsleep(1200, 3500);   // pausa humana de "revisar" antes de enviar (anti-deteccion)
    await trustedClickEl(btn);
    // confirma envio: el prompt se vacia
    try { await waitFor(() => norm(promptEditable()?.innerText || "").length < Math.max(1, before - 3), { timeout: 8000 }); }
    catch (_e) { /* puede que no se vacie en algunos estados; seguimos a esperar el resultado */ }
  }

  // GENERATE_IMAGE: modo Imagen -> prompt -> Enviar -> espera una imagen de resultado NUEVA.
  async function generateImage({ prompt }) {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    // tras navegar al composer fresco, espera a que React monte prompt + boton Enviar
    await waitFor(() => promptEditable() && sendButton(), { timeout: 20000 });
    await setMode("Imagen");
    await setPrompt(prompt);
    const before = currentResultGenIds();
    await fire();
    // espera una imagen generada cuyo genId no estaba antes (cargada: naturalWidth>=400)
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      const fresh = resultImageEls().find((i) => !before.has(genId(i.src)));
      return fresh ? { url: fresh.src } : null;
    }, { timeout: 180000 });
    if (found.type) return found; // parada dura
    return { ok: true, data: { imageUrl: found.url } };
  }

  // El boton "Hacer video" sobre el POST de una imagen (asi anima Grok; NO es "modo Video + Enviar").
  function makeVideoButton() {
    return [...document.querySelectorAll("button,[role=button]")]
      .find((b) => visible(b) && (b.getAttribute("aria-label") === "Hacer video" || /^hacer video$/i.test(norm(b.innerText))));
  }

  // ANIMATE_FIRE: clic en "Hacer video" (clic SINTETICO basta, no requiere CDP/debugger). Grok NAVEGA a
  // un /post/<videoId> nuevo y genera EN SITIO -> este content script muere con la navegacion, por eso
  // NO esperamos el video aqui (lo recoge ANIMATE_COLLECT tras re-inyectar el SW en el /post nuevo).
  async function animateFire() {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    const btn = await waitFor(() => makeVideoButton(), { timeout: 20000 });
    await rsleep(800, 2000);   // pausa humana antes de animar
    btn.click();
    await sleep(1500);          // deja que dispare/navegue antes de devolver
    return { ok: true, data: { fired: true } };
  }

  // ANIMATE_COLLECT: el SW re-inyecta este script en el /post del video; esperamos el <video> TERMINADO
  // (assets.grok.com/.../generated/<id>/generated_video.mp4, videoWidth>0 y duracion finita). La pagina
  // ya no navega durante la generacion, asi que el content script sobrevive toda la espera.
  async function animateCollect() {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      const v = resultVideos().find((x) => x.videoWidth > 0 && isFinite(x.duration) && x.duration > 0 && /generated_video\.mp4|\/generated\//.test(x.currentSrc || x.src));
      return v ? { url: v.currentSrc || v.src } : null;
    }, { timeout: 360000 });
    if (found.type) return found;
    return { ok: true, data: { videoUrl: found.url } };
  }

  function inspect() {
    return { ok: true, data: {
      url: location.href,
      hasPrompt: !!promptEditable(),
      hasSend: !!sendButton(),
      results: resultImageEls().length,
      videos: resultVideos().length,
    } };
  }

  // ----------------------------------------------------------- listener -------
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = message?.type;
    if (!type || !Object.values(ACT).includes(type)) return; // ignora lo que no es ACT.*
    (async () => {
      try {
        if (type === ACT.PING) return { ok: true, data: { pong: true, driver: "grok", url: location.href } };
        if (type === ACT.INSPECT_DOM) return inspect();
        if (type === ACT.GENERATE_IMAGE) return await generateImage(message);
        if (type === ACT.ANIMATE || type === ACT.ANIMATE_FIRE) return await animateFire(message);
        if (type === ACT.ANIMATE_COLLECT) return await animateCollect(message);
        if (type === ACT.CLEAR_REFS) return await clearRefs();
        if (type === ACT.VIDEO_SRCS) return { ok: true, data: { srcs: [...currentVideoNames()] } };
        return { ok: false, error: `accion no soportada en grok-driver: ${type}` };
      } catch (e) {
        if (e && e.type) return e; // parada dura (RES.*)
        return { ok: false, error: e?.message ?? String(e) };
      }
    })().then(sendResponse);
    return true; // respuesta async
  });

  console.log("[grok-driver] cargado en", location.href);
})();
