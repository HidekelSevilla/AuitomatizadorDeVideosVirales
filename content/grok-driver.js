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
  // En modo VIDEO el boton de enviar del composer se relabela a "Crear video" (no "Enviar").
  const videoSubmitButton = () => [...document.querySelectorAll("button,[role=button]")].find((b) => b.getAttribute("aria-label") === "Crear video");

  // Tiles de error de Grok ("Hemos detectado actividad inusual" = rate-limit anti-abuso).
  function detectHardStop() {
    const t = document.body ? document.body.innerText : "";
    if (/actividad inusual|unusual activity/i.test(t)) return { type: RES.RATE_LIMIT }; // anti-abuso por ritmo: el SW aplica cooldown creciente y reanuda solo (no es falta de creditos)
    return null;
  }

  // Imagenes de RESULTADO (DOM verificado en vivo 2026-06-18). Discriminador por URL, robusto a ambas vistas:
  //  - GRID del compositor (p.ej. SIN referencia -> N variaciones): <img> con src data:image/...base64 (~720px).
  //  - Vista /imagine/post/<id> (p.ej. CON referencia): el RESULTADO generado es assets.grok.com/users/<uid>/
  //    >>>generated<<</<postid>/... (~832px). La REFERENCIA subida es /users/<uid>/<uuid>/content (SIN /generated/).
  // Por eso filtramos por `data:image` O `/generated/`: eso aisla los resultados y EXCLUYE la referencia subida,
  // el sidebar/historial (/users/<uid>/<uuid>/content?cache=1, sin /generated/) y el feed (imagine-public.x.ai).
  function resultImageEls() {
    const form = composeForm();
    return [...document.querySelectorAll("img")].filter((i) => {
      if (form && form.contains(i)) return false;
      if (i.naturalWidth < 400) return false;
      const src = i.currentSrc || i.src || "";
      return /^data:image/.test(src) || /assets\.grok\.com\/[^"']*\/generated\//.test(src);
    });
  }
  // id para deduplicar. Resultado de servidor -> el <postid> DESPUES de /generated/ (NO el segmento "generated").
  // data: url -> el src completo (la cabecera base64 coincide entre variaciones, el cuerpo difiere).
  const genId = (url) => { const m = (url || "").match(/\/generated\/([^/?]+)/); return m ? m[1] : (url || ""); };
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
  async function setPrompt(text, cfg) {
    const ed = promptEditable();
    if (!ed) throw new Error("no encuentro el prompt (contenteditable) de Grok");
    ed.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(ed);
    document.execCommand("delete");
    const t = text || "";
    // config.humanTyping OFF -> RAPIDO pero por FRAGMENTOS (Grok habilita "Enviar" por EVENTO de insercion;
    // un insert UNICO de todo el texto NO lo registra -> falla "el Enviar no registro"). ON (default) ->
    // fragmentos de 2-5 chars con jitter humano. Lo decide la config avanzada (la pasa el SW en driverCfg).
    if (cfg && cfg.humanTyping === false) {
      for (let i = 0; i < t.length; i += 12) document.execCommand("insertText", false, t.slice(i, i + 12));
    } else {
      for (let i = 0, typed = 0; i < t.length;) {
        const n = 2 + Math.floor(Math.random() * 4);
        const chunk = t.slice(i, i + n);
        document.execCommand("insertText", false, chunk);
        i += chunk.length; typed += chunk.length;
        await rsleep(40, 140);
        if (typed % 40 < n) await rsleep(200, 500);
      }
    }
    return norm(ed.innerText).length;
  }

  // Dispara "Enviar" (trusted) y verifica que el prompt se vacie (= enviado). El SW ya dejo las
  // referencias en el input[file] via CDP antes de llamarnos.
  async function fire(cfg) {
    const ed = promptEditable();
    const before = norm(ed?.innerText || "").length;
    const btn = sendButton();
    if (!btn) throw new Error('no encuentro el boton "Enviar" de Grok');
    ed && ed.focus();
    await rsleep(cfg?.reviewMinMs ?? 1200, cfg?.reviewMaxMs ?? 3500);   // pausa de "revisar" antes de enviar (config.reviewPause, anti-deteccion)
    await trustedClickEl(btn);
    // confirma envio: el prompt se vacia. Si tras el timeout SIGUE ~lleno, el clic "Enviar" no registro:
    // fallar CLARO (reintentable) en vez de seguir 180s esperando un resultado que no vendra (timeout enganoso).
    try { await waitFor(() => norm(promptEditable()?.innerText || "").length < Math.max(1, before - 3), { timeout: 8000 }); }
    catch (_e) {
      if (norm(promptEditable()?.innerText || "").length >= Math.max(1, before - 3)) {
        throw new Error("el Enviar de Grok no registro (el prompt no se vacio); reintenta");
      }
    }
  }

  // GENERATE_IMAGE: modo Imagen -> prompt -> Enviar -> espera una imagen de resultado NUEVA.
  async function generateImage({ prompt, cfg }) {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    // tras navegar al composer fresco, espera a que React monte prompt + boton Enviar
    await waitFor(() => promptEditable() && sendButton(), { timeout: 20000 });
    await setMode("Imagen");
    await setPrompt(prompt, cfg);
    const before = currentResultGenIds();
    await fire(cfg);
    // Espera a que aparezca la PRIMERA imagen nueva (cargada: naturalWidth>=400).
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      return resultImageEls().some((i) => !before.has(genId(i.src))) ? { hit: true } : null;
    }, { timeout: 180000 });
    if (found.type) return found; // parada dura
    // Grok SIN referencia genera VARIAS variaciones (tipicamente 4); CON referencia suele dar 1. Si tomamos
    // la 1a que cargue, es no-determinista (podria ser una a medio cargar). Dejamos "asentar" el grid:
    // esperamos a que el conteo de imagenes nuevas deje de crecer (estable 2 chequeos, tope ~8s) y elegimos
    // UNA de forma DETERMINISTA: la primera en orden DOM (arriba-izquierda del grid).
    let prev = -1, stable = 0;
    for (let k = 0; k < 10 && stable < 2; k++) {
      await sleep(800);
      const n = resultImageEls().filter((i) => !before.has(genId(i.src))).length;
      if (n > 0 && n === prev) stable++; else stable = 0;
      prev = n;
    }
    const freshEls = resultImageEls().filter((i) => !before.has(genId(i.src)));
    // Preferir el resultado GRANDE (en /post hay miniatura + grande del MISMO generado; queremos la grande,
    // full-res). Desempate por orden DOM (en el grid sin-ref: izquierda->derecha = 1a variacion).
    freshEls.sort((a, b) => {
      const wa = a.getBoundingClientRect().width, wb = b.getBoundingClientRect().width;
      if (Math.abs(wa - wb) > 20) return wb - wa;
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    });
    const chosen = freshEls[0];
    if (!chosen) return { ok: false, error: "no aparecio imagen nueva en Grok tras generar" };
    // Captura la URL del POST de esta imagen (Grok navega a /imagine/post/<id> al generar). Es la pagina
    // donde luego esta el boton "Hacer video"; guardarla evita derivarla mal de la URL del asset.
    let postUrl = null;
    try { postUrl = await waitFor(() => /\/imagine\/post\/[^/]+/.test(location.href) ? location.href : null, { timeout: 8000 }); }
    catch (_e) { /* no navego a /post: el SW derivara del genId como fallback */ }
    return { ok: true, data: { imageUrl: chosen.src, postUrl, variantCount: freshEls.length } };
  }

  // Toggle a modo VIDEO del composer: texto "Video" (composer /imagine) o aria-label "Video" (icono
  // camara del post de la imagen). Animar por aqui = UNA sola generacion dirigida (no el doble que
  // generaba "Hacer video" + "Crear video").
  function videoToggle() {
    return [...document.querySelectorAll("button,[role=button],[role=menuitemradio],[role=tab]")]
      .find((b) => visible(b) && (norm(b.innerText) === "Video" || b.getAttribute("aria-label") === "Video"));
  }

  // ANIMATE_FIRE: pone el composer en modo Video -> escribe el prompt -> "Enviar" (TRUSTED via CDP, como
  // generar imagen; el clic sintetico de Enviar es flaky). Grok navega al /post del video y genera en
  // sitio; el video lo recoge ANIMATE_COLLECT tras re-inyectar. El SW adjunta el debugger SOLO para este
  // clic y lo suelta antes de la espera larga (evita el congelamiento).
  async function animateFire({ prompt, cfg } = {}) {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    await waitFor(() => videoToggle(), { timeout: 20000 });
    await rsleep(500, 1200);
    // Cambiar a modo Video y CONFIRMAR (aria-checked="true"). El clic SINTETICO del toggle a veces NO registra
    // -> el composer se queda en modo Imagen, "Crear video" nunca aparece y mas abajo se cuelga esperando ese
    // boton (bug real 2026-06-18: la animacion se detuvo aqui). Reintenta: 1ro sintetico, luego TRUSTED (CDP).
    for (let k = 0; k < 4 && videoToggle()?.getAttribute("aria-checked") !== "true"; k++) {
      const el = videoToggle(); if (!el) break;
      if (k === 0) el.click(); else await trustedClickEl(el);
      await sleep(800);
    }
    if (videoToggle()?.getAttribute("aria-checked") !== "true") {
      throw new Error("no pude poner Grok en modo Video (el toggle no registro); reintenta");
    }
    await sleep(500);
    await waitFor(() => promptEditable(), { timeout: 8000 });
    if (prompt) await setPrompt(prompt, cfg);   // mismo tipeo (humano/instantaneo segun config) que en imagen
    await rsleep(cfg?.reviewMinMs ?? 1200, cfg?.reviewMaxMs ?? 3500);   // pausa de "revision" (config.reviewPause)
    const preUrl = location.href;
    const send = await waitFor(() => videoSubmitButton() || sendButton(), { timeout: 8000 });
    await trustedClickEl(send);       // trusted: el "Crear video"/Enviar sintetico a veces no registra
    // Confirma que la generacion ARRANCO: Grok navega al /post del video (o muestra "Generando %"/<video>).
    // Si NADA pasa en ~14s, el clic no registro -> fallar CLARO (reintentable) en vez de dejar a ANIMATE_COLLECT
    // esperando 6 min en vano. Un throw aqui SOLO ocurre si NO arranco: si arranca, alguna senal se cumple ya.
    const started = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      if (location.href !== preUrl && /\/imagine\/post\//.test(location.href)) return { ok: true };
      if (/Generando|Generating/i.test(document.body?.innerText || "")) return { ok: true };
      if (resultVideos().length > 0) return { ok: true };
      return null;
    }, { timeout: 14000 }).catch(() => null);
    if (started && started.type) return started;   // parada dura
    if (!started) throw new Error('el "Crear video" de Grok no arranco la generacion (el clic no registro); reintenta');
    return { ok: true, data: { fired: true } };
  }

  // ANIMATE_COLLECT: el SW re-inyecta este script en el /post del video; esperamos el <video> TERMINADO
  // (assets.grok.com/.../generated/<id>/generated_video.mp4, videoWidth>0 y duracion finita). La pagina
  // ya no navega durante la generacion, asi que el content script sobrevive toda la espera.
  async function animateCollect({ before } = {}) {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    const beforeSet = new Set(before || []);   // names de videos YA presentes al disparar: excluirlos = recoger el NUEVO
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      const v = resultVideos().find((x) => x.videoWidth > 0 && isFinite(x.duration) && x.duration > 0
        && /generated_video\.mp4|\/generated\//.test(x.currentSrc || x.src)
        && !beforeSet.has(vidName(x.currentSrc || x.src)));
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
