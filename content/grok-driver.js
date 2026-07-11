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
    COLLECT_IMAGE: "act:collect_image",
    ANIMATE: "act:animate",
    ANIMATE_FIRE: "act:animate_fire",
    ANIMATE_COLLECT: "act:animate_collect",
    VIDEO_SRCS: "act:video_srcs",
    CLEAR_REFS: "act:clear_refs",
    WAIT_FOR_REFS: "act:wait_for_refs",
    IMAGE_KEYS: "act:image_keys",
    OPEN_IMAGE: "act:open_image",
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
  async function trustedClickEl(el, { releaseAfterClick = false } = {}) {
    if (!el) throw new Error("trustedClickEl: nodo nulo");
    el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(200);
    const r = el.getBoundingClientRect();
    const resp = await chrome.runtime.sendMessage({
      type: "trusted_click",
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      releaseAfterClick,
    });
    if (!resp || !resp.ok) throw new Error("click trusted fallo: " + (resp?.error || "sin respuesta del background"));
  }

  // Quita las referencias adjuntas (chips con boton aria-label "Remove image") del compositor, para
  // que el SW pueda setear un set nuevo por CDP sin acumular las de la escena previa.
  const REMOVE_IMAGE_LABELS = new Set(["Remove image", "Quitar imagen", "Eliminar imagen"]);
  const removeImageButtons = (root = document) => [...root.querySelectorAll("button")]
    .filter((b) => REMOVE_IMAGE_LABELS.has(norm(b.getAttribute("aria-label"))));

  async function clearRefs() {
    const removeBtns = () => removeImageButtons(composeForm() || document);
    let removed = 0;
    // BUCLE re-consultando cada vuelta: clicar un chip re-renderiza la lista, asi que un snapshot unico se
    // desincroniza y deja chips de la escena PREVIA -> se acumulan y Grok rechaza por pasar de 3 refs.
    for (let pass = 0; pass < 12; pass++) {
      const btns = removeBtns();
      if (!btns.length) break;
      try { btns[0].click(); removed++; } catch (_e) {}
      await sleep(180);
    }
    const attachment = composerAttachmentState();
    const left = attachment.count;
    return { ok: left === 0, data: { removed, left, attachment } };
  }

  // -------------------------------------------------------------- deteccion ---
  // Grok agrega mas superficies alrededor de Imagine (busqueda, proyectos, feed). Mantener todos los
  // controles acotados al composer evita tomar botones homonimos de esas superficies.
  const promptEditable = () => document.querySelector('[contenteditable][role="textbox"][aria-label="Ask Grok anything"]')
    || document.querySelector("form [contenteditable]")
    || document.querySelector("[contenteditable]");
  const composeForm = () => promptEditable()?.closest("form") || document.querySelector("form");
  const composerButtons = () => [...(composeForm()?.querySelectorAll("button,[role=button]") || [])];
  const sendButton = () => composerButtons().find((b) => ["Enviar", "Send"].includes(b.getAttribute("aria-label")));
  // En modo VIDEO el boton de enviar del composer se relabela a "Crear video" (no "Enviar").
  const videoSubmitButton = () => composerButtons().find((b) => ["Crear video", "Create video"].includes(b.getAttribute("aria-label")));

  // Evidencia de adjuntos compatible con la UI actual de Grok en espanol e ingles. DOM.setFileInputFiles
  // puede conservar los File, o React puede consumirlos y reemplazarlos por previews/chips combinados.
  function composerAttachmentState() {
    const form = composeForm();
    if (!form) return { count: 0, fileCount: 0, removeCount: 0, previewCount: 0 };
    const input = form.querySelector('input[type="file"][name="files"],input[type="file"]');
    const fileCount = Number(input?.files?.length || 0);
    const removeCount = removeImageButtons(form).length;
    const previewImages = [...form.querySelectorAll("img")].filter((img) => visible(img)).length;
    const labelledPreviewButtons = [...form.querySelectorAll("button")].filter((b) =>
      /miniatura del elemento multimedia|input media thumbnail|image preview|vista previa de imagen/i
        .test(norm(b.getAttribute("aria-label"))),
    ).length;
    const previewCount = Math.max(previewImages, labelledPreviewButtons);
    return { count: Math.max(fileCount, removeCount, previewCount), fileCount, removeCount, previewCount };
  }

  async function waitForRefs({ expected = 1, timeoutMs = 15000 } = {}) {
    const want = Math.max(1, Number(expected) || 1);
    const state = await waitFor(() => {
      const current = composerAttachmentState();
      return current.count >= want ? current : null;
    }, { timeout: timeoutMs }).catch(() => null);
    if (!state) return { ok: false, error: `Grok no confirmo ${want} referencia(s) adjunta(s)` };
    return { ok: true, data: state };
  }

  // Tiles de error de Grok ("Hemos detectado actividad inusual" = rate-limit anti-abuso).
  function detectHardStop() {
    const t = document.body ? document.body.innerText : "";
    if (/actividad inusual|unusual activity/i.test(t)) return { type: RES.RATE_LIMIT }; // anti-abuso por ritmo: el SW aplica cooldown creciente y reanuda solo (no es falta de creditos)
    // Captcha (grok.com usa Cloudflare Turnstile): antes NO se detectaba y el pipeline quemaba los
    // reintentos con backoff contra el muro antes de pausar con un error generico.
    if (document.querySelector('iframe[src*="challenges.cloudflare.com"], #cf-chl-widget, .cf-turnstile')
      || /verify (you are|you're) human|verifica que eres humano|confirma que eres humano/i.test(t)) {
      return { type: RES.CAPTCHA };
    }
    // Sin creditos / limite de generaciones (best-effort por texto, conservador para evitar falsos positivos).
    if (/reached your (daily |generation )?limit|l[ií]mite (diario|de generaciones) alcanzado|out of credits|sin cr[eé]ditos/i.test(t)) {
      return { type: RES.NO_CREDITS };
    }
    return null;
  }

  // Imagenes de RESULTADO. Grok usa tres formas distintas segun la vista:
  //  - GRID del compositor (p.ej. SIN referencia -> N variaciones): <img> con src data:image/...base64 (~720px).
  //  - Post privado: assets.grok.com/.../generated/<postid>/...
  //  - Post abierto desde una de las 4 variantes: imagine-public.x.ai/imagine-public/images/<postid>.jpg.
  // El ultimo solo cuenta dentro de main/article en /imagine/post; asi no confundimos el feed Descubrir.
  function resultImageEls() {
    const form = composeForm();
    return [...document.querySelectorAll("img")].filter((i) => {
      if (form && form.contains(i)) return false;
      if (i.naturalWidth < 400) return false;
      const src = i.currentSrc || i.src || "";
      if (/^data:image/.test(src) || /assets\.grok\.com\/[^"']*\/generated\//.test(src)) return true;
      return /\/imagine\/post\//.test(location.pathname)
        && !!i.closest("main,article")
        && /imagine-public\.x\.ai\/imagine-public\/images\//.test(src);
    });
  }
  // Clave compacta para deduplicar. Antes guardabamos el data: COMPLETO en Sets/mensajes (cientos de KB x4),
  // haciendo pesado el worker. FNV-1a conserva una huella pequena y estable.
  function compactHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const genId = (url) => {
    const s = url || "";
    const server = s.match(/\/generated\/([^/?]+)/) || s.match(/\/images\/([^/?]+?)(?:\.[a-z]+)?(?:\?|$)/i);
    return server ? `post:${server[1]}` : /^data:image/.test(s) ? `data:${s.length}:${compactHash(s)}` : s;
  };
  function currentResultGenIds() { return new Set(resultImageEls().map((i) => genId(i.src))); }

  function resultCardReady(img) {
    let node = img;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      if (node.querySelector?.('button[aria-label="Guardar"],button[aria-label="Save"]')) return true;
    }
    return false;
  }

  function pickResultImage(exclude = new Set()) {
    const els = resultImageEls().filter((i) => !exclude.has(genId(i.currentSrc || i.src)));
    els.sort((a, b) => {
      const wa = a.getBoundingClientRect().width, wb = b.getBoundingClientRect().width;
      if (Math.abs(wa - wb) > 20) return wb - wa;
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    });
    return els[0] || null;
  }

  function imageDimensionsLookFinal(img, cfg) {
    // Grok abre /post antes de terminar: durante "Generando 75%" observamos una miniatura 144x256.
    // Tambien puede reemplazarla por previews progresivos mas grandes. Los resultados finales actuales
    // son 720x1280 (o el equivalente horizontal/cuadrado), asi que el borde corto es una senal estable
    // e independiente del peso/ruido. Se puede bajar por config si Grok cambia su resolucion de salida.
    const minShortEdge = Number(cfg?.grokImageMinShortEdge) || 640;
    return !!img && img.complete !== false
      && Math.min(Number(img.naturalWidth) || 0, Number(img.naturalHeight) || 0) >= minShortEdge;
  }

  async function dataImageLooksFinal(src, cfg) {
    if (!/^data:image/.test(src || "")) return true;
    // Una imagen valida minimalista puede pesar 50-80KB (confirmado en vivo); el viejo piso de 160KB
    // rechazaba 3 de 4 variantes terminadas. 8KB solo descarta datos truncados.
    const minLen = Number(cfg?.grokImageMinDataUrlLength) || 8192;
    if (src.length < minLen) return false;

    const img = new Image();
    img.decoding = "async";
    img.src = src;
    try {
      if (img.decode) await img.decode();
      else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    } catch (_e) {
      return false;
    }
    if (!imageDimensionsLookFinal(img, cfg)) return false;

    const w = 96, h = 96;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, w, h);
    let data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (_e) { return false; }

    // Placeholder de Grok = grano multicolor: mucha diferencia pixel-a-pixel en casi toda la imagen.
    let diff = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const a = (y * w + x) * 4, b = a - 4;
        diff += Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
        n += 3;
      }
    }
    const avgDiff = diff / Math.max(1, n);
    const maxAvgDiff = Number(cfg?.grokImageMaxNoiseAvgDiff) || 60;
    return avgDiff <= maxAvgDiff;
  }

  async function openImage({ before = [] } = {}) {
    const img = pickResultImage(new Set(before || []));
    if (!img) return { ok: false, error: "no encontre una imagen nueva para abrir" };
    let target = img;
    for (let depth = 0; target?.parentElement && depth < 7; depth++) {
      const parent = target.parentElement;
      const cls = String(parent.className || "");
      target = parent;
      if (/media-post-masonry-card/.test(cls) || ["BUTTON", "A"].includes(target.tagName)) break;
    }
    target.click();
    return { ok: true, data: { clicked: true, key: genId(img.currentSrc || img.src) } };
  }

  // Videos de resultado. El feed "Descubrir" tambien monta <video> (imagine-public.x.ai); contarlos
  // hacia que ANIMATE_FIRE declarara exito inmediatamente aunque el click no hubiese registrado.
  // Los resultados privados/finales de una generacion salen de assets.grok.com bajo /generated/.
  function resultVideos() {
    return [...document.querySelectorAll("video")].filter((v) => {
      const s = v.currentSrc || v.src || "";
      return /https:\/\/assets\.grok\.com\/[^"']*\/generated\//i.test(s);
    });
  }
  const vidName = (url) => { const m = (url || "").match(/generated\/([^/?]+)/) || (url || "").match(/name=([^&]+)/); return m ? m[1] : (url || ""); };
  function currentVideoNames() { return new Set(resultVideos().map((v) => vidName(v.currentSrc || v.src))); }

  // ------------------------------------------------------------- acciones -----
  // Selecciona el modo (radio "Imagen" / "Video") por texto exacto.
  async function setMode(name) {
    const aliases = name === "Imagen" ? new Set(["Imagen", "Image"])
      : name === "Video" ? new Set(["Video"])
      : new Set([name]);
    const root = composeForm() || document;
    const radios = [...root.querySelectorAll("[role=radio],[role=menuitemradio]")];
    const candidates = radios.length ? radios : [...root.querySelectorAll("button,[role=button]")];
    const el = candidates.find((e) => visible(e)
      && (aliases.has(norm(e.innerText)) || aliases.has(norm(e.getAttribute("aria-label")))));
    if (el) { el.click(); await sleep(400); return true; }
    return false;
  }

  // Relacion de aspecto (menu Radix aria-label="Relación de aspecto"). Mapeado en vivo 2026-06-20: en modo
  // Imagen el menu trae "2:3 Alto", "3:2 Ancho", "1:1 Cuadrado", "9:16 Vertical", "16:9 Panorámico"
  // (role=menuitem). El .click() sintetico NO abre el menu -> hay que mandar PointerEvent (pointerdown+
  // pointerup). Idempotente: si el boton ya muestra el ratio pedido, no toca nada (Grok lo recuerda entre
  // generaciones). Debe llamarse DESPUES de setMode("Imagen"): las opciones dependen del modo.
  const aspectBtn = () => document.querySelector('button[aria-label="Relación de aspecto"]');
  const ptr = (el, type) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, isPrimary: true }));
  async function setAspect(aspectRatio) {
    const want = norm(aspectRatio || "");
    if (!want) return false;
    const b = aspectBtn();
    if (!b) return false;
    if (norm(b.innerText).startsWith(want)) return true;   // ya esta en el ratio pedido
    for (let k = 0; k < 3 && aspectBtn()?.getAttribute("aria-expanded") !== "true"; k++) {
      const el = aspectBtn(); if (!el) break;
      ptr(el, "pointerdown"); ptr(el, "pointerup"); el.click();
      await sleep(300);
    }
    const item = [...document.querySelectorAll("[role=menuitem]")].find((i) => norm(i.innerText).startsWith(want));
    if (!item) {
      const e = aspectBtn(); if (e?.getAttribute("aria-expanded") === "true") { ptr(e, "pointerdown"); ptr(e, "pointerup"); }  // cierra el menu
      throw new Error(`Grok: no encontre la opcion de aspecto "${want}"`);
    }
    ptr(item, "pointerdown"); ptr(item, "pointerup"); item.click();
    await sleep(400);
    return norm(aspectBtn()?.innerText || "").startsWith(want);
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
      // PEGADO RAPIDO: en trozos GRANDES (cap 200, minimo 2 trozos). Antes era de a 12 chars -> en un prompt
      // largo de historias eran ~50-60 inserciones, cada execCommand re-renderiza el editor React (se veia
      // "tecleando" lento). Pocos trozos = casi instantaneo. Sigue fragmentado: un insert UNICO de todo no
      // registra el prompt en Grok (-> "el Enviar no registro").
      const step = Math.max(1, Math.min(200, Math.ceil(t.length / 2)));
      for (let i = 0; i < t.length; i += step) document.execCommand("insertText", false, t.slice(i, i + step));
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
    const actual = norm(ed.innerText);
    if (actual !== norm(t)) {
      throw new Error(`el prompt de Grok no se pudo reemplazar completo (${actual.length}/${norm(t).length}); reintenta`);
    }
    return actual.length;
  }

  // Dispara "Enviar" (trusted). Grok ya no siempre vacia el prompt al aceptar una generacion, asi que
  // confirmamos con varias senales: prompt reducido, boton deshabilitado/desmontado, navegacion, texto
  // Generando o un resultado nuevo. Solo fallamos cuando el prompt queda y NO aparece ninguna senal.
  async function fire(cfg, beforeResultIds = new Set()) {
    const ed = promptEditable();
    const before = norm(ed?.innerText || "").length;
    const preUrl = location.href;
    // El boton aparece deshabilitado mientras React termina de registrar el contenteditable. Esperarlo
    // evita un click trusted prematuro que luego parece un fallo aleatorio de envio.
    const btn = await waitFor(() => {
      const b = sendButton();
      return (b && b.getAttribute("aria-disabled") !== "true" && !b.disabled) ? b : null;
    }, { timeout: 12000 }).catch(() => null);
    if (!btn) throw new Error('el boton "Enviar" de Grok no se habilito; reintenta');
    ed && ed.focus();
    await rsleep(cfg?.reviewMinMs ?? 1200, cfg?.reviewMaxMs ?? 3500);   // pausa de "revisar" antes de enviar (config.reviewPause, anti-deteccion)
    await trustedClickEl(btn, { releaseAfterClick: true });
    const accepted = await waitFor(() => {
      const promptLen = norm(promptEditable()?.innerText || "").length;
      if (promptLen < Math.max(1, before - 3)) return { reason: "prompt liberado" };
      if (location.href !== preUrl && /\/imagine\/post\//.test(location.href)) return { reason: "navegacion a post" };
      if (resultImageEls().some((img) => !beforeResultIds.has(genId(img.currentSrc || img.src)))) return { reason: "resultado nuevo" };
      if (/Generando|Generating/i.test(document.body?.innerText || "")) return { reason: "estado generando" };
      const currentButton = sendButton();
      if (!currentButton || currentButton.disabled || currentButton.getAttribute("aria-disabled") === "true") return { reason: "submit ocupado" };
      return null;
    }, { timeout: 12000 }).catch(() => null);
    if (!accepted) throw new Error("el Enviar de Grok no registro (prompt retenido y sin senal de generacion); reintenta");
    return accepted;
  }

  // GENERATE_IMAGE: modo Imagen -> prompt -> Enviar -> espera una imagen de resultado NUEVA.
  async function generateImage({ prompt, aspectRatio, cfg }) {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    // tras navegar al composer fresco, espera a que React monte prompt + boton Enviar
    await waitFor(() => promptEditable() && sendButton(), { timeout: 20000 });
    await setMode("Imagen");
    // Aspecto (historias = 16:9). No fatal: si falla, Grok genera con el aspecto actual (lo recuerda).
    if (aspectRatio) {
      try { await setAspect(aspectRatio); }
      catch (e) { console.warn("[grok-driver] setAspect:", e?.message ?? e); }
    }
    await setPrompt(prompt, cfg);
    const before = currentResultGenIds();
    await fire(cfg, before);
    // Espera a que aparezca la PRIMERA imagen nueva (cargada: naturalWidth>=400).
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      return resultImageEls().some((i) => !before.has(genId(i.src))) ? { hit: true } : null;
    }, { timeout: 180000 });
    if (found.type) return found; // parada dura
    // Elige UNA imagen nueva de forma DETERMINISTA: la mas GRANDE (full-res; en /post hay miniatura + grande
    // del mismo generado), desempate por orden DOM (en el grid sin-ref: izquierda->derecha = 1a variacion).
    const pickFresh = () => pickResultImage(before);
    // CRITICO: Grok muestra un PLACEHOLDER de RUIDO mientras genera, y SOLO al final aparece la imagen real.
    // El placeholder de ruido es ESTATICO (su `data:` src NO muta) y CHICO (~77KB) vs la imagen final GRANDE
    // (~200-400KB). "Esperar a que el src se estabilice" NO basta: el ruido fijo ya esta estable -> se descargaba
    // ruido (scene_15, scene_30). Senal robusta: el TAMANO del dato (largo del data: url) CRECE de ruido->final.
    // Aceptamos cuando: el largo CRECIO al menos una vez (ruido->detalle) Y luego se estabilizo QUIET_DATA_MS. Para
    // URLs de servidor (/generated/) tambien esperamos estabilidad larga: Grok puede exponer un asset intermedio.
    // Re-consultamos el
    // nodo por si Grok lo reemplaza. isData = data: url (grid sin-ref); el resto = URL de servidor.
    // OJO: la difusion data: NO es ruido->final atomico; muestra frames PROGRESIVOS (ruido->medio->nitido). Si hace
    // una PAUSA a media difusion mas larga que el settle, se descargaba un frame medio (todavia con grano, ej. b41).
    // Por eso el settle del caso data: es mayor (QUIET_DATA_MS): que la pausa tenga que durar mas para colarse.
    const isData = (s) => /^data:/.test(s || "");
    const QUIET_SERVER_MS = Number(cfg?.grokImageServerQuietMs) || 10000;
    const QUIET_DATA_MS = 10000, MAX_MS = 180000, IDLE_DONE = 20000, t0 = Date.now();
    let maxLen = -1, lastGrow = Date.now(), grew = false, settled = false;
    while (Date.now() - t0 < MAX_MS) {
      const hs = detectHardStop(); if (hs) return hs;
      const el = pickFresh();
      const cur = el ? (el.currentSrc || el.src || "") : "";
      if (cur.length > maxLen) { if (maxLen >= 0) grew = true; maxLen = cur.length; lastGrow = Date.now(); }
      const idle = Date.now() - lastGrow;
      if (cur && !isData(cur) && idle >= QUIET_SERVER_MS && imageDimensionsLookFinal(el, cfg)) { settled = true; break; } // URL final + dimensiones finales
      else if (cur && isData(cur) && grew && idle >= QUIET_DATA_MS && (resultCardReady(el) || await dataImageLooksFinal(cur, cfg))) { settled = true; break; } // data: crecio y la tarjeta ya ofrece Guardar
      else if (cur && isData(cur) && !grew && idle >= IDLE_DONE && (resultCardReady(el) || await dataImageLooksFinal(cur, cfg))) { settled = true; break; } // minimalistas pueden quedar en 50-80KB sin crecer
      await sleep(400);
    }
    const freshEls = resultImageEls().filter((i) => !before.has(genId(i.src)));
    const chosen = pickFresh();
    if (!chosen) return { ok: false, error: "no aparecio imagen nueva en Grok tras generar" };
    if (!settled) return { ok: false, error: "la imagen nueva de Grok no se estabilizo (evito guardar ruido o un frame intermedio)" };
    // Captura la URL del POST de esta imagen (Grok navega a /imagine/post/<id> al generar). Es la pagina
    // donde luego esta el boton "Hacer video"; guardarla evita derivarla mal de la URL del asset.
    let postUrl = null;
    try { postUrl = await waitFor(() => /\/imagine\/post\/[^/]+/.test(location.href) ? location.href : null, { timeout: 8000 }); }
    catch (_e) { /* no navego a /post: el SW derivara del genId como fallback */ }
    return { ok: true, data: { imageUrl: chosen.currentSrc || chosen.src, postUrl, variantCount: freshEls.length } };
  }

  // COLLECT_IMAGE: via de RECUPERACION (canal caido / SW reiniciado a media generacion). Aplica las
  // MISMAS senales de estabilizacion que generateImage: antes devolvia el primer <img> grande sin
  // validar y recuperaba el placeholder de RUIDO o un frame a media difusion (recurrencia del bug de
  // scene_15/scene_30). data: -> quieto QUIET_DATA_MS + dataImageLooksFinal; servidor -> quieto largo.
  async function collectImage({ timeoutMs = 45000, requirePost = false, before = [], cfg } = {}) {
    const exclude = new Set(before || []);
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      if (requirePost && !/\/imagine\/post\//.test(location.href)) return null;
      const el = pickResultImage(exclude);
      return el ? { hit: true } : null;
    }, { timeout: timeoutMs });
    if (found.type) return found;
    const isData = (s) => /^data:/.test(s || "");
    const QUIET_SERVER_MS = Number(cfg?.grokImageServerQuietMs) || 10000;
    const QUIET_DATA_MS = 10000;
    const settleMax = Math.max(30000, timeoutMs);
    const t0 = Date.now();
    let maxLen = -1, lastGrow = Date.now(), settled = false;
    while (Date.now() - t0 < settleMax) {
      const hs = detectHardStop(); if (hs) return hs;
      const el = pickResultImage(exclude);
      const cur = el ? (el.currentSrc || el.src || "") : "";
      if (cur.length > maxLen) { maxLen = cur.length; lastGrow = Date.now(); }
      const idle = Date.now() - lastGrow;
      if (cur && !isData(cur) && idle >= QUIET_SERVER_MS && imageDimensionsLookFinal(el, cfg)) { settled = true; break; }
      if (cur && isData(cur) && idle >= QUIET_DATA_MS && (resultCardReady(el) || await dataImageLooksFinal(cur, cfg))) { settled = true; break; }
      await sleep(400);
    }
    const chosen = pickResultImage(exclude);
    if (!chosen) return { ok: false, error: "no encontre imagen generada actual en Grok" };
    if (!settled) return { ok: false, error: "la imagen recuperada no se estabilizo (posible ruido/frame intermedio); reintenta" };
    return {
      ok: true,
      data: {
        imageUrl: chosen.currentSrc || chosen.src,
        postUrl: /\/imagine\/post\//.test(location.href) ? location.href : null,
        variantCount: resultImageEls().filter((i) => !exclude.has(genId(i.currentSrc || i.src))).length,
        recovered: true,
      },
    };
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
  async function animateFire({ prompt, cfg, expectImage } = {}) {
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
    // HANDOFF (imagen subida por CDP): si "Crear video" se clickea ANTES de que la imagen se adjunte/procese,
    // Grok NO-OPEA el clic (no arma la generacion) y ninguna senal de arranque aparece -> fallaba 4/4
    // determinista ("el clic no registro"). Esperamos el chip "Remove image" (= imagen adjunta) antes de disparar.
    if (expectImage) {
      const attached = await waitFor(() => {
        const current = composerAttachmentState();
        return current.count > 0 ? current : null;
      }, { timeout: 15000 }).catch(() => null);
      if (!attached) throw new Error("la imagen subida no se adjunto al composer de Grok (sin File ni preview); reintenta");
      await sleep(800);   // settle del preview antes de armar el video
    }
    // Espera a que el boton EXISTA y este ARMABLE (no aria-disabled/disabled): un boton presente pero inerte
    // mientras la imagen procesa hace que el clic no registre.
    const send = await waitFor(() => {
      const b = videoSubmitButton() || sendButton();
      return (b && b.getAttribute("aria-disabled") !== "true" && !b.disabled) ? b : null;
    }, { timeout: 12000 });
    const videosBeforeFire = currentVideoNames();
    await trustedClickEl(send, { releaseAfterClick: true }); // suelta CDP al instante: cambiar de ventana no deja Grok frenado
    // Confirma que la generacion ARRANCO: Grok navega al /post del video (o muestra "Generando %"/<video>).
    // Si NADA pasa en ~40s (Grok a veces tarda en navegar/pintar "Generando"), el clic no registro -> fallar
    // CLARO. El timeout de 14s daba FALSOS NEGATIVOS: el clic SI registro (video pagado) pero Grok tardo mas,
    // el SW no marcaba grokFired y el auto-retry re-disparaba -> DOBLE gasto. Devolvemos maybeStarted para que
    // el SW haga un probe antes de re-disparar en vez de asumir que no arranco.
    const startedTimeout = Number(cfg?.grokAnimStartedTimeoutMs) || 40000;
    const started = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      if (location.href !== preUrl && /\/imagine\/post\//.test(location.href)) return { ok: true };
      if (/Generando|Generating/i.test(document.body?.innerText || "")) return { ok: true };
      if (resultVideos().some((v) => !videosBeforeFire.has(vidName(v.currentSrc || v.src)))) return { ok: true };
      return null;
    }, { timeout: startedTimeout }).catch(() => null);
    if (started && started.type) return started;   // parada dura
    if (!started) {
      // Pista para el SW: ¿la URL YA es un /post de video? (posible arranque no detectado por texto/video aun).
      const maybeStarted = /\/imagine\/post\//.test(location.href) && location.href !== preUrl;
      const e = new Error('el "Crear video" de Grok no arranco la generacion (el clic no registro); reintenta');
      e.maybeStarted = maybeStarted;
      e.postUrl = maybeStarted ? location.href : null;
      throw e;
    }
    return { ok: true, data: { fired: true, postUrl: /\/imagine\/post\//.test(location.href) ? location.href : null } };
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
      attachments: composerAttachmentState(),
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
        if (type === ACT.COLLECT_IMAGE) return await collectImage(message);
        if (type === ACT.ANIMATE || type === ACT.ANIMATE_FIRE) return await animateFire(message);
        if (type === ACT.ANIMATE_COLLECT) return await animateCollect(message);
        if (type === ACT.CLEAR_REFS) return await clearRefs();
        if (type === ACT.WAIT_FOR_REFS) return await waitForRefs(message);
        if (type === ACT.IMAGE_KEYS) return { ok: true, data: { keys: [...currentResultGenIds()] } };
        if (type === ACT.OPEN_IMAGE) return await openImage(message);
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
