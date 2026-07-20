// content/grok-driver.js
// Driver hermano de flow-driver.js para Grok Imagine (grok.com/imagine). Implementa el MISMO
// contrato ACT.* que espera el service worker (PING / GENERATE_IMAGE / ANIMATE), para que la cola
// y los runners secuenciales del SW sirvan igual cambiando solo config.provider.
//
// DIFERENCIAS CLAVE vs Flow (mapeadas en vivo 2026-06-16, ver memoria grok-future-animation):
//  - El compositor es UN <form>: prompt = [contenteditable] ("Ask Grok anything"); modos Imagen/Video
//    (role=radio, texto exacto); aspecto "Relación de aspecto"; generar = button aria-label "Enviar".
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
  const GROK_DRIVER_VERSION = "0.2.18-card-scoped-final-actions";
  if (window.__grokDriverVersion === GROK_DRIVER_VERSION) return;
  // Una recarga solo de la extension invalida el listener viejo pero conserva el `window` de la pagina.
  // El guard booleano anterior impedia inyectar el driver corregido hasta recargar Grok, destruyendo la
  // grilla que queriamos recuperar. Versionar el guard permite hot-upgrade sin navegar; desde esta version
  // tambien retiramos el listener previo cuando siga vivo para no responder dos veces.
  if (window.__grokDriverMessageListener) {
    try { chrome.runtime.onMessage.removeListener(window.__grokDriverMessageListener); } catch (_e) { /* contexto viejo invalidado */ }
  }
  window.__grokDriverLoaded = true;
  window.__grokDriverVersion = GROK_DRIVER_VERSION;

  // ACT replicado a mano (igual que flow-driver: el content script no importa modulos).
  const ACT = {
    PING: "act:ping",
    INSPECT_DOM: "act:inspect_dom",
    PREPARE_IMAGE: "act:prepare_image",
    GENERATE_IMAGE: "act:generate_image",
    COLLECT_IMAGE: "act:collect_image",
    ANIMATE: "act:animate",
    PREPARE_VIDEO: "act:prepare_video",
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
  const folded = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

  // Teclado real por CDP. A diferencia de execCommand/insertText sintetico, actualiza el estado
  // interno del editor React y permite enviar con Enter sin depender de coordenadas que quedan
  // obsoletas mientras terminan de procesarse las referencias.
  async function trustedKeyboard(payload) {
    const resp = await chrome.runtime.sendMessage({ type: "trusted_keyboard", ...(payload || {}) });
    if (!resp || !resp.ok) throw new Error("teclado trusted fallo: " + (resp?.error || "sin respuesta del background"));
  }

  // Barrera durable AT-MOST-ONCE para imagenes. El background persiste el intento y el snapshot
  // `before` ANTES de que este content script pulse Enter. Si el service worker muere despues del ACK,
  // al volver solo intentara recoger/validar esa generacion; nunca enviara otro Enter automaticamente.
  async function persistImageSubmitIntent(grokAttempt, beforeResultIds, preUrl) {
    if (!grokAttempt?.id || !grokAttempt?.ownerType || !grokAttempt?.ownerId) {
      throw new Error("Grok: falta marcador durable del intento; no envio Enter para evitar una generacion duplicada");
    }
    const resp = await chrome.runtime.sendMessage({
      type: "grok_image_submit_intent",
      attemptId: grokAttempt.id,
      ownerType: grokAttempt.ownerType,
      ownerId: grokAttempt.ownerId,
      before: [...beforeResultIds],
      preUrl,
    });
    if (!resp?.ok) {
      throw new Error("Grok: no pude persistir el intento antes de Enter; no envie la generacion (" + (resp?.error || "sin respuesta del background") + ")");
    }
  }

  async function reportImageSubmitObserved(grokAttempt, accepted, preUrl) {
    if (!grokAttempt?.id) return;
    const postUrl = location.href !== preUrl && /\/imagine\/post\//.test(location.href) ? location.href : null;
    try {
      await chrome.runtime.sendMessage({
        type: "grok_image_submit_observed",
        attemptId: grokAttempt.id,
        ownerType: grokAttempt.ownerType,
        ownerId: grokAttempt.ownerId,
        acceptedReason: accepted?.reason || null,
        postUrl,
      });
    } catch (_e) { /* best-effort: submitIssued ya quedo durable antes de Enter */ }
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
    // desincroniza y deja chips de la escena PREVIA. El siguiente handshake debe empezar desde cero.
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
  const promptEditable = () => document.querySelector('textarea[aria-label="Mensaje para obtener imagen"],textarea[aria-label="Message for image"],textarea[aria-label="Ask Grok anything"]')
    || document.querySelector('form textarea[aria-label]')
    || document.querySelector("form textarea")
    || document.querySelector('[contenteditable][role="textbox"][aria-label="Ask Grok anything"]')
    || document.querySelector('[contenteditable][role="textbox"][aria-label="Mensaje para obtener imagen"]')
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
    if (!form) return { count: 0, confirmedCount: 0, fileCount: 0, removeCount: 0, previewCount: 0 };
    const input = form.querySelector('input[type="file"][name="files"],input[type="file"]');
    const fileCount = Number(input?.files?.length || 0);
    const removeCount = removeImageButtons(form).length;
    const labelledPreviewButtons = [...form.querySelectorAll("button")].filter((b) =>
      /miniatura del elemento multimedia|input media thumbnail|image preview|vista previa de imagen/i
        .test(norm(b.getAttribute("aria-label"))),
    ).length;
    // input.files cambia INSTANTANEAMENTE al usar DOM.setFileInputFiles, antes de que Grok haya
    // consumido/subido la referencia. Solo un chip removible o preview etiquetado confirma que React
    // la acepto. Contar cualquier <img> del formulario producia falsos positivos por iconos/avatar.
    const previewCount = labelledPreviewButtons;
    // Los chips de una misma version de la UI usan una representacion consistente. Cuando existen
    // botones Remove son la fuente autoritativa para TODOS los adjuntos; previews queda como fallback
    // para una variante de UI que no exponga Remove (no se suman: ambos pueden describir el mismo chip).
    const confirmedCount = removeCount > 0 ? removeCount : previewCount;
    return { count: confirmedCount, confirmedCount, fileCount, removeCount, previewCount };
  }

  async function waitForRefs({ expected = 1, timeoutMs = 20000, stableMs = 700 } = {}) {
    const want = Math.max(1, Number(expected) || 1);
    const deadline = Date.now() + Math.max(100, Number(timeoutMs) || 20000);
    let stableSince = 0;
    let lastSignature = "";
    while (Date.now() < deadline) {
      const current = composerAttachmentState();
      const signature = `${current.removeCount}:${current.previewCount}`;
      if (current.confirmedCount >= want) {
        if (signature !== lastSignature) { lastSignature = signature; stableSince = Date.now(); }
        if (Date.now() - stableSince >= Math.max(0, Number(stableMs) || 0)) return { ok: true, data: current };
      } else {
        stableSince = 0;
        lastSignature = signature;
      }
      await sleep(150);
    }
    const current = composerAttachmentState();
    return { ok: false, error: `Grok no confirmo ${want} referencia(s) procesada(s) (File=${current.fileCount}, chips=${current.confirmedCount})` };
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
  //  - Post privado legacy: assets.grok.com/.../generated/<postid>/...
  //  - Visor julio-2026: assets.grok.com/users/<user>/<postid>/content?cache=1.
  //  - Post abierto desde una de las 4 variantes: imagine-public.x.ai/imagine-public/images/<postid>.jpg.
  // El ultimo solo cuenta dentro de main/article en /imagine/post; asi no confundimos el feed Descubrir.
  function resultImageEls(root = document) {
    const form = composeForm();
    return [...root.querySelectorAll("img")].filter((i) => {
      if (form && form.contains(i)) return false;
      if (i.naturalWidth < 400) return false;
      const src = i.currentSrc || i.src || "";
      if (/^data:image/.test(src) || /assets\.grok\.com\/[^"']*\/generated\//.test(src)) return true;
      const inMainResultArea = !!i.closest("main,article");
      const scopedToPost = /\/imagine\/post\//.test(location.pathname) && inMainResultArea;
      const titleLooksLikePrompt = !/^Imagine\s*-\s*Grok$/i.test(String(document.title || "").trim());
      const scopedToTitledGrid = /^\/imagine\/?$/i.test(location.pathname) && titleLooksLikePrompt && inMainResultArea;
      const contentEndpoint = /assets\.grok\.com\/users\/[^/]+\/[^/?#]+\/content(?:[?#]|$)/i.test(src);
      return (scopedToPost && /imagine-public\.x\.ai\/imagine-public\/images\//.test(src))
        || ((scopedToPost || scopedToTitledGrid) && contentEndpoint);
    });
  }
  // Grok habilita este bloque lateral solo cuando la variante seleccionada ya termino. Un unico boton
  // no basta (en UIs anteriores "Guardar" aparecia sobre frames intermedios): exigimos Descargar Y otra
  // accion final. Sigue siendo una senal adicional; nunca sustituye estabilidad ni validacion de bytes.
  function resultActionsReady(image = null) {
    const enabled = (button) => visible(button)
      && !button.disabled
      && button.getAttribute("aria-disabled") !== "true";
    const label = (button) => norm(button.innerText || button.getAttribute("aria-label") || "");
    const card = image?.closest?.('[class*="media-post-masonry-card"]') || null;
    if (card) {
      const cardButtons = [...card.querySelectorAll("button,[role=button]")].filter(enabled);
      const hasSave = cardButtons.some((button) => ["Guardar", "Save"].includes(label(button)));
      const hasCreateVideo = cardButtons.some((button) => ["Crear video", "Create video"].includes(label(button)));
      return hasSave && hasCreateVideo;
    }
    const buttons = [...document.querySelectorAll("button,[role=button]")].filter(enabled);
    const hasDownload = buttons.some((button) => ["Descargar", "Download"].includes(label(button)));
    const hasFinalAction = buttons.some((button) => [
      "Regenerar", "Regenerate", "Crear video", "Create video", "Animar", "Animate",
    ].includes(label(button)));
    return hasDownload && hasFinalAction;
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
    const server = s.match(/\/generated\/([^/?]+)/)
      || s.match(/\/users\/[^/]+\/([^/?#]+)\/content(?:[?#]|$)/i)
      || s.match(/\/images\/([^/?]+?)(?:\.[a-z]+)?(?:\?|$)/i);
    return server ? `post:${server[1]}` : /^data:image/.test(s) ? `data:${s.length}:${compactHash(s)}` : s;
  };
  // La UI nueva deja las cuatro variantes en /imagine y codifica el post exacto en el endpoint
  // /users/<user>/<post>/content. No hace falta esperar una navegacion que nunca ocurrira.
  const postUrlFromContentSrc = (url) => {
    const m = String(url || "").match(/\/users\/[^/]+\/([^/?#]+)\/content(?:[?#]|$)/i);
    return m ? `https://grok.com/imagine/post/${m[1]}` : null;
  };
  function currentResultGenIds() { return new Set(resultImageEls().map((i) => genId(i.src))); }

  // Cada envio de /imagine crea un bloque `prompt + grilla`. Mirar todas las <img> de la pagina
  // permitia que un bloque nuevo VACIO adoptara una variante distinta del prompt anterior. La clave
  // correcta no es el orden global de las imagenes sino el contenedor cuyo texto coincide con el
  // prompt exacto que acabamos de enviar.
  function promptResultGroups(prompt) {
    const wanted = norm(prompt);
    if (!wanted) return [];
    const groups = [];
    const leaves = [...document.querySelectorAll("span,p,div")].filter((el) => {
      if (norm(el.textContent) !== wanted) return false;
      return ![...el.children].some((child) => norm(child.textContent) === wanted);
    });
    for (const leaf of leaves) {
      let node = leaf.parentElement;
      for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
        const cls = String(node.className || "");
        const childCount = Number(node.children?.length || 0);
        // UI julio-2026: el bloque inmediato usa `relative` y tiene dos hijos (cabecera + lista).
        // El fallback con img/list conserva compatibilidad si Grok cambia las clases.
        const looksLikeResultBlock = childCount >= 2 && (/\brelative\b/.test(cls)
          || !!node.querySelector("img,[role=list],ul,ol"));
        if (!looksLikeResultBlock) continue;
        if (!groups.includes(node)) groups.push(node);
        break;
      }
    }
    return groups;
  }

  function latestPromptResultGroup(prompt) {
    const groups = promptResultGroups(prompt);
    return groups[groups.length - 1] || null;
  }

  // Con referencias, la UI julio-2026 navega directo a /imagine/post/<id>: el prompt queda como un
  // bloque hermano FUERA de <main>, mientras las 2 variantes viven dentro de main>article. Por eso no
  // existe el contenedor `prompt + grilla` de /imagine. La combinacion URL /post + texto exacto del
  // prompt en la pagina acota el resultado sin caer en imagenes de escenas anteriores.
  function postResultRootForPrompt(prompt) {
    if (!/\/imagine\/post\//.test(location.pathname)) return null;
    const wanted = norm(prompt);
    if (!wanted) return null;
    const exactPromptPresent = [...document.querySelectorAll("span,p,div")].some((el) => {
      if (norm(el.textContent) !== wanted) return false;
      return ![...el.children].some((child) => norm(child.textContent) === wanted);
    });
    if (!exactPromptPresent) return null;
    return document.querySelector("main article") || document.querySelector("main");
  }

  // UI julio-2026 sin referencias: Grok puede quitar el texto del prompt del DOM, mantener la grilla
  // en /imagine y poner el prompt exacto en document.title (`<prompt> - Grok`). El `before` durable del
  // intento sigue excluyendo todo lo que ya existia antes de Enter, asi que esta senal permite observar
  // solo las imagenes nuevas sin caer en una escena anterior ni en Descubrir.
  function titleResultRootForPrompt(prompt) {
    if (!/^\/imagine\/?$/i.test(location.pathname)) return null;
    const wanted = norm(prompt);
    if (!wanted) return null;
    const title = norm(String(document.title || "").replace(/\s+-\s+Grok\s*$/i, ""));
    if (title !== wanted) return null;
    return document.querySelector("main") || document;
  }

  // El visor nuevo ya no conserva el texto del prompt en el DOM del /post. Durante generateImage aun
  // podemos vincularlo de forma segura: es una navegacion NUEVA ocurrida despues del unico Enter de este
  // intento y distinta a la URL previa. Esta prueba causal solo se usa dentro de esa llamada; las
  // recuperaciones posteriores siguen exigiendo el postUrl persistido por el background.
  function submittedPostResultRoot(submitSignal) {
    const currentUrl = String(location.href || "");
    const preUrl = String(submitSignal?.preUrl || "");
    if (!preUrl || currentUrl === preUrl || !/\/imagine\/post\/[^/?#]+/i.test(currentUrl)) return null;
    const observedPostUrl = String(submitSignal?.postUrl || "");
    if (observedPostUrl && observedPostUrl !== currentUrl) return null;
    return document.querySelector("main article") || document.querySelector("main");
  }

  function promptGroupStillGenerating(group) {
    if (!group) return false;
    return /\b(?:generando|generating)(?:\s+(?:imagen|image))?(?:\s+\d{1,3}\s*%)?/i.test(String(group.innerText || ""))
      || !!group.querySelector('[role="progressbar"],[aria-busy="true"]');
  }

  function resultStillGenerating(img) {
    const generating = /\b(?:generando|generating)(?:\s+(?:imagen|image))?(?:\s+\d{1,3}\s*%)?/i;
    let node = img;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      if (generating.test(String(node.innerText || ""))) return true;
      if (node.querySelector?.('[role="progressbar"],[aria-busy="true"]')) return true;
    }
    // En la vista dedicada el progreso puede vivir en la barra lateral, fuera del arbol de <img>.
    return /\/imagine\/post\//.test(location.pathname)
      && generating.test(String(document.body?.innerText || ""));
  }

  function pickResultImage(exclude = new Set(), root = document) {
    const els = resultImageEls(root).filter((i) => !exclude.has(genId(i.currentSrc || i.src)));
    els.sort((a, b) => {
      const wa = a.getBoundingClientRect().width, wb = b.getBoundingClientRect().width;
      if (Math.abs(wa - wb) > 20) return wb - wa;
      // En /imagine los grupos nuevos se agregan al FINAL. En recuperaciones legacy puede faltar `before`;
      // ordenar primero el DOM antiguo hacia que scene_003 adoptara los bytes exactos de scene_002.
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1);
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

  function imageNoiseMetrics(data, w, h) {
    if (!data || data.length < w * h * 4 || w < 3 || h < 3) return null;
    const yv = new Float64Array(w * h);
    for (let i = 0, p = 0; p < yv.length; i += 4, p++) {
      yv[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    const a = [], b = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) { a.push(yv[i]); b.push(yv[i - 1]); }
      if (y > 0) { a.push(yv[i]); b.push(yv[i - w]); }
    }
    const mean = (xs) => xs.reduce((sum, v) => sum + v, 0) / Math.max(1, xs.length);
    const variance = (xs, m = mean(xs)) => xs.reduce((sum, v) => sum + (v - m) ** 2, 0) / Math.max(1, xs.length);
    const ma = mean(a), mb = mean(b), va = variance(a, ma), vb = variance(b, mb);
    let cov = 0, neighborDiff = 0;
    for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (b[i] - mb); neighborDiff += Math.abs(a[i] - b[i]); }
    const rho = va < 1e-6 || vb < 1e-6 ? 1 : (cov / Math.max(1, a.length)) / Math.sqrt(va * vb);
    const my = mean([...yv]), sigmaY = Math.sqrt(variance([...yv], my));

    const original = [], blurred = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      original.push(yv[i]);
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += yv[i + dy * w + dx];
      blurred.push(sum / 9);
    }
    const blurRatio = variance(blurred) / Math.max(variance(original), 1e-6);
    const roughness = (neighborDiff / Math.max(1, a.length)) / Math.max(sigmaY, 1);
    return { rho, blurRatio, roughness };
  }

  function pixelBufferLooksFinal(data, w, h, cfg) {
    const metrics = imageNoiseMetrics(data, w, h);
    if (!metrics) return false;
    // Umbrales calibrados contra 4,068 imagenes legitimas del repo: minimo abs(rho)=.500,
    // minimo blurRatio=.391 y maximo roughness=.646. El AND evita confundir escenas detalladas,
    // bordes duros o patrones periodicos con el grano provisional de Grok.
    const maxRho = Number(cfg?.grokNoiseMaxAbsRho) || 0.45;
    const maxBlurRatio = Number(cfg?.grokNoiseMaxBlurRatio) || 0.34;
    const minRoughness = Number(cfg?.grokNoiseMinRoughness) || 0.75;
    const isNoise = Math.abs(metrics.rho) < maxRho
      && metrics.blurRatio < maxBlurRatio
      && metrics.roughness > minRoughness;
    return !isNoise;
  }

  function elementPixelInspection(img, cfg) {
    if (!imageDimensionsLookFinal(img, cfg)) return { looksFinal: false, fingerprint: "dimensions" };
    const w = 96, h = 96;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    try {
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      // Huella de PIXELES, no del src: assets.grok.com muta bytes bajo la misma URL/post.
      let hash = 2166136261;
      for (let i = 0; i < data.length; i++) { hash ^= data[i]; hash = Math.imul(hash, 16777619); }
      return { looksFinal: pixelBufferLooksFinal(data, w, h, cfg), fingerprint: (hash >>> 0).toString(16).padStart(8, "0") };
    } catch (_e) {
      // assets.grok.com puede bloquear lectura de canvas por CORS. `null` significa desconocido,
      // no "ruido": en ese caso exigimos las senales DOM de finalizacion antes de aceptar.
      return null;
    }
  }

  function elementPixelsLookFinal(img, cfg) {
    const inspection = elementPixelInspection(img, cfg);
    return inspection === null ? null : inspection.looksFinal;
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
    return elementPixelsLookFinal(img, cfg) === true;
  }

  async function validatedImageCandidates(exclude, settledSrc, cfg, root = document) {
    const out = [];
    const seen = new Set();
    const push = (imageUrl, requiresByteValidation) => {
      if (!imageUrl || seen.has(imageUrl) || out.length >= 4) return;
      seen.add(imageUrl);
      out.push({ imageUrl, requiresByteValidation: !!requiresByteValidation });
    };
    // El frame que completo el settle va primero. Los demas se prueban sin otro Enter si la descarga
    // revela ruido; data: se puede inspeccionar aqui, URL servidor se marca obligatoriamente para bytes.
    const settledIsData = /^data:image/.test(settledSrc || "");
    push(settledSrc, !settledIsData);
    for (const el of resultImageEls(root)) {
      const src = el.currentSrc || el.src || "";
      if (!src || exclude.has(genId(src)) || seen.has(src) || resultStillGenerating(el)) continue;
      if (/^data:image/.test(src)) {
        if (await dataImageLooksFinal(src, cfg)) push(src, false);
      } else if (imageDimensionsLookFinal(el, cfg)) {
        const pixels = elementPixelsLookFinal(el, cfg);
        if (pixels !== false) push(src, pixels !== true);
      }
    }
    return out;
  }

  async function openImage({ before = [], prompt = "" } = {}) {
    const promptGroup = prompt ? latestPromptResultGroup(prompt) : null;
    if (prompt && !promptGroup) return { ok: false, error: "no encontre el bloque del prompt actual para abrir su imagen" };
    const img = pickResultImage(new Set(before || []), promptGroup || document);
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
  function modeToggle(name) {
    const aliases = name === "Imagen" ? new Set(["Imagen", "Image"])
      : name === "Video" ? new Set(["Video"])
      : new Set([name]);
    const root = composeForm() || document;
    const radios = [...root.querySelectorAll("[role=radio],[role=menuitemradio]")];
    const candidates = radios.length ? radios : [...root.querySelectorAll("button,[role=button]")];
    return candidates.find((e) => visible(e)
      && (aliases.has(norm(e.innerText)) || aliases.has(norm(e.getAttribute("aria-label")))));
  }

  async function setMode(name) {
    const el = modeToggle(name);
    if (el) { el.click(); await sleep(400); return true; }
    return false;
  }

  // La UI nueva borra los adjuntos al cambiar de modo. El background llama esto ANTES de subir las
  // referencias de imagen; generateImage lo repite idempotentemente para confirmar el estado.
  async function prepareImage() {
    await waitFor(() => promptEditable() && sendButton() && modeToggle("Imagen"), { timeout: 20000 });
    for (let k = 0; k < 4 && modeToggle("Imagen")?.getAttribute("aria-checked") !== "true"; k++) {
      const el = modeToggle("Imagen"); if (!el) break;
      if (k === 0) el.click(); else await trustedClickEl(el);
      await sleep(700);
    }
    if (modeToggle("Imagen")?.getAttribute("aria-checked") !== "true") {
      throw new Error("no pude poner Grok en modo Imagen (el toggle no registro); reintenta");
    }
    return { ok: true, data: { prepared: true } };
  }

  // Relacion de aspecto (menu Radix aria-label="Relación de aspecto"). Mapeado en vivo 2026-07-14: en modo
  // Imagen el menu trae "2:3 Alto", "3:2 Ancho", "1:1 Cuadrado", "9:16 Vertical", "16:9 Panorámico"
  // (role=menuitem). El .click() sintetico NO abre el menu -> hay que mandar PointerEvent (pointerdown+
  // pointerup). Idempotente: si el boton ya muestra el ratio pedido, no toca nada (Grok lo recuerda entre
  // generaciones). Debe llamarse DESPUES de setMode("Imagen"): las opciones dependen del modo.
  const controlButtonByLabel = (...labels) => {
    const wanted = new Set(labels.map(folded));
    return [...document.querySelectorAll("button")]
      .find((b) => visible(b) && wanted.has(folded(b.getAttribute("aria-label"))));
  };
  const aspectBtn = () => controlButtonByLabel("Relación de aspecto", "Aspect ratio");
  const imageCountBtn = () => controlButtonByLabel("Cantidad de imágenes", "Image count", "Number of images");
  const ptr = (el, type) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, isPrimary: true }));
  async function openControlMenu(buttonGetter) {
    for (let k = 0; k < 3 && buttonGetter()?.getAttribute("aria-expanded") !== "true"; k++) {
      const el = buttonGetter(); if (!el) break;
      ptr(el, "pointerdown"); ptr(el, "pointerup"); el.click();
      await sleep(300);
    }
    return buttonGetter()?.getAttribute("aria-expanded") === "true";
  }

  // Grok recuerda ×4/×8/×12 entre sesiones. La extension elige una de las cuatro variaciones ya
  // pagadas, asi que fija ×4 para no multiplicar el gasto por una preferencia manual anterior.
  async function setImageCount() {
    const want = "×4";
    const b = imageCountBtn();
    if (!b) return false;
    if (norm(b.innerText) === want) return true;
    if (!await openControlMenu(imageCountBtn)) return false;
    const item = [...document.querySelectorAll("[role=menuitem]")]
      .find((i) => norm(i.innerText) === want || norm(i.getAttribute("aria-label")) === want);
    if (!item) throw new Error('Grok: no encontre la opcion de cantidad "×4"');
    ptr(item, "pointerdown"); ptr(item, "pointerup"); item.click();
    await sleep(400);
    return norm(imageCountBtn()?.innerText || "") === want;
  }

  async function setAspect(aspectRatio) {
    const want = norm(aspectRatio || "");
    if (!want) return false;
    const b = aspectBtn();
    if (!b) return false;
    if (norm(b.innerText).startsWith(want)) return true;   // ya esta en el ratio pedido
    await openControlMenu(aspectBtn);
    const item = [...document.querySelectorAll("[role=menuitem]")].find((i) => norm(i.innerText).startsWith(want));
    if (!item) {
      const e = aspectBtn(); if (e?.getAttribute("aria-expanded") === "true") { ptr(e, "pointerdown"); ptr(e, "pointerup"); }  // cierra el menu
      throw new Error(`Grok: no encontre la opcion de aspecto "${want}"`);
    }
    ptr(item, "pointerdown"); ptr(item, "pointerup"); item.click();
    await sleep(400);
    return norm(aspectBtn()?.innerText || "").startsWith(want);
  }

  const promptText = (ed = promptEditable()) => norm(ed?.value ?? ed?.innerText ?? "");

  // Los chips de referencia hacen que Grok reemplace el ProseMirror completo aun DESPUES de que ya
  // aparecen como confirmados. Escribir de inmediato manda las teclas al nodo desmontado (o al body) y
  // produce el caracteristico 0/N. Exigir la misma identidad visible durante un intervalo corto evita
  // competir con ese render sin meter una espera fija larga en todas las generaciones.
  async function stablePromptEditable({ timeout = 10000, stableMs = 700 } = {}) {
    let candidate = null;
    let candidateSince = 0;
    return waitFor(() => {
      const current = promptEditable();
      if (!current?.isConnected || !visible(current)) {
        candidate = null;
        candidateSince = 0;
        return null;
      }
      if (current !== candidate) {
        candidate = current;
        candidateSince = Date.now();
        return null;
      }
      return Date.now() - candidateSince >= stableMs ? current : null;
    }, { timeout, interval: 100 });
  }

  // Escribe el prompt con teclado TRUSTED y foco TRUSTED. innerText por si solo no prueba que React lo
  // registro: execCommand podia dejar texto visible pero Enviar seguia usando estado vacio/antiguo.
  // Los reintentos son locales y ocurren ANTES de persistir/enviar Enter, por lo que no pueden duplicar
  // una generacion ni obligan a volver a subir las referencias.
  async function setPrompt(text, cfg) {
    const t = String(text || "").replace(/\r?\n/g, " ");
    const wanted = norm(t);
    const attempts = Math.min(4, Math.max(3, Number(cfg?.grokPromptWriteRetries) || 3));
    let actual = "";
    let detail = "";
    for (let attempt = 0; attempt < attempts; attempt++) {
      const ed = await stablePromptEditable({
        timeout: Number(cfg?.grokPromptEditorTimeoutMs) || 10000,
        stableMs: Number(cfg?.grokPromptEditorStableMs) || 700,
      }).catch(() => null);
      if (!ed) {
        detail = "editor no estable";
        continue;
      }
      if (promptText(ed) === wanted) return wanted.length;
      try {
        // focus() sintetico se pierde cuando el usuario cambia de ventana. El click CDP llega al tab de
        // Grok aunque no sea la ventana activa y fija document.activeElement justo antes del teclado.
        await trustedClickEl(ed);
      } catch (e) {
        detail = `foco trusted fallo: ${e?.message ?? e}`;
        await sleep(250);
        continue;
      }
      const focused = promptEditable();
      if (focused !== ed || !ed.isConnected) {
        detail = "Grok reemplazo el editor durante el foco";
        await sleep(250);
        continue;
      }
      // ProseMirror admite Input.insertText real de CDP. El background lo divide en bloques pero conserva
      // el 100% del texto. Esta funcion exige igualdad exacta antes de autorizar Enter. La ultima vuelta
      // usa keyDown por caracter como compatibilidad si Grok vuelve a cambiar de editor.
      const textMode = attempt < attempts - 1 ? "insertText" : "keys";
      await trustedKeyboard({
        text: t,
        replace: true,
        textMode,
        chunkChars: Number(cfg?.grokPromptChunkChars) || 480,
        chunkThresholdChars: Number(cfg?.grokPromptChunkThresholdChars) || 3000,
      });
      const registered = await waitFor(() => {
        const current = promptEditable();
        return current?.isConnected && promptText(current) === wanted ? current : null;
      }, { timeout: Number(cfg?.grokPromptRegisterTimeoutMs) || 3500, interval: 100 }).catch(() => null);
      if (registered) return wanted.length;
      actual = promptText();
      detail = promptEditable() !== ed ? "Grok reemplazo el editor durante la escritura" : "React no registro las teclas";
      await sleep(350);
    }
    throw new Error(`el prompt de Grok no se pudo reemplazar completo (${actual.length}/${wanted.length}; ${detail || "sin detalle"}); reintenta`);
  }

  // Dispara "Enviar" (trusted). Grok ya no siempre vacia el prompt al aceptar una generacion, asi que
  // confirmamos con varias senales: prompt reducido, boton deshabilitado/desmontado, navegacion, texto
  // Generando o un resultado nuevo. Solo fallamos cuando el prompt queda y NO aparece ninguna senal.
  async function fire(cfg, beforeResultIds = new Set(), grokAttempt = null) {
    const expectedPrompt = promptText();
    const before = expectedPrompt.length;
    const preUrl = location.href;
    // El boton aparece deshabilitado mientras React termina de registrar el contenteditable. Esperarlo
    // evita un click trusted prematuro que luego parece un fallo aleatorio de envio.
    const ready = await waitFor(() => {
      const b = sendButton();
      return (b && b.getAttribute("aria-disabled") !== "true" && !b.disabled) ? b : null;
    }, { timeout: 12000 }).catch(() => null);
    if (!ready) throw new Error('el boton "Enviar" de Grok no se habilito; reintenta');
    await rsleep(cfg?.reviewMinMs ?? 1200, cfg?.reviewMaxMs ?? 3500);   // pausa de "revisar" antes de enviar (config.reviewPause, anti-deteccion)
    // La pausa y un cambio de ventana pueden quitar el foco, y Grok puede volver a montar ProseMirror.
    // Revalidamos el prompt y damos foco trusted INMEDIATAMENTE antes de la frontera durable + Enter.
    const currentEditor = await stablePromptEditable({ timeout: 6000, stableMs: 250 }).catch(() => null);
    if (!currentEditor || promptText(currentEditor) !== expectedPrompt) {
      throw new Error("el prompt de Grok cambio antes de enviar; reintenta sin generar");
    }
    await trustedClickEl(currentEditor);
    if (promptEditable() !== currentEditor || !currentEditor.isConnected || promptText(currentEditor) !== expectedPrompt) {
      throw new Error("el prompt de Grok perdio el foco antes de enviar; reintenta sin generar");
    }
    // El ACK de storage es la frontera de gasto: solo despues se permite Enter. Un crash entre el ACK y
    // la tecla queda deliberadamente como intento ambiguo y exige recuperacion/revision manual; es mas
    // seguro bloquear una regeneracion que pagar/generar dos veces.
    await persistImageSubmitIntent(grokAttempt, beforeResultIds, preUrl);
    // Enter es primario: no depende de coordenadas ni de conservar un nodo que React puede reemplazar
    // durante la pausa de revision. Verificado que el mismo mecanismo corrige Slate de Flow.
    await trustedKeyboard({ key: "ENTER", releaseAfterKey: true });
    const acceptedSignal = () => {
      const promptLen = promptText();
      if (promptLen < Math.max(1, before - 3)) return { reason: "prompt liberado" };
      if (location.href !== preUrl && /\/imagine\/post\//.test(location.href)) return { reason: "navegacion a post" };
      if (resultImageEls().some((img) => !beforeResultIds.has(genId(img.currentSrc || img.src)))) return { reason: "resultado nuevo" };
      if (/Generando|Generating/i.test(document.body?.innerText || "")) return { reason: "estado generando" };
      const currentButton = sendButton();
      if (!currentButton || currentButton.disabled || currentButton.getAttribute("aria-disabled") === "true") return { reason: "submit ocupado" };
      return null;
    };
    const accepted = await waitFor(acceptedSignal, { timeout: 20000 }).catch(() => null);
    // AT-MOST-ONCE: nunca hacemos Enter + clic para el mismo intento. Si Grok acepto Enter pero
    // tarda en pintar la senal, el SW realiza un probe largo de resultados antes de recargar/reintentar.
    if (!accepted) throw new Error("el Enviar de Grok no registro (prompt retenido y sin senal de generacion); reintenta");
    await reportImageSubmitObserved(grokAttempt, accepted, preUrl);
    return {
      ...accepted,
      preUrl,
      postUrl: location.href !== preUrl && /\/imagine\/post\//.test(location.href) ? location.href : null,
    };
  }

  // GENERATE_IMAGE: modo Imagen -> prompt -> Enviar -> espera una imagen de resultado NUEVA.
  async function generateImage({ prompt, aspectRatio, cfg, rejectImageKeys = [], grokAttempt = null }) {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    // tras navegar al composer fresco, espera a que React monte prompt + boton Enviar
    await waitFor(() => promptEditable() && sendButton(), { timeout: 20000 });
    await prepareImage();
    // La nueva UI persiste ×4/×8/×12. Fijar ×4 evita generar de mas por una preferencia manual previa.
    try { await setImageCount(); }
    catch (e) { console.warn("[grok-driver] setImageCount:", e?.message ?? e); }
    // Aspecto (historias = 16:9). No fatal: si falla, Grok genera con el aspecto actual (lo recuerda).
    if (aspectRatio) {
      try { await setAspect(aspectRatio); }
      catch (e) { console.warn("[grok-driver] setAspect:", e?.message ?? e); }
    }
    await setPrompt(prompt, cfg);
    // La lista persistida viene del SW y contiene resultados YA asignados a ingredientes/escenas.
    // Es indispensable tras un hard reload: la grilla DOM puede quedar vacia y luego Grok volver a
    // montar el post anterior; sin esta memoria, ese asset viejo parece "nuevo" y termina asignado a
    // la escena actual (scene_01 repetida en scene_02, observado 2026-07-12).
    const before = currentResultGenIds();
    for (const key of (Array.isArray(rejectImageKeys) ? rejectImageKeys : [])) {
      if (key) before.add(String(key));
    }
    const submitSignal = await fire(cfg, before, grokAttempt);
    // Grok puede tardar mas de un minuto en montar el bloque `prompt + grilla`, y en algunos renders
    // REUTILIZA el mismo nodo React de un intento anterior con el mismo prompt. Comparar identidad de
    // nodos y esperar solo 30s produjo falsos negativos aun cuando las 4 imagenes aparecian despues.
    // La prueba segura es: prompt exacto + progreso o una clave de imagen que no estaba en `before`.
    const promptGroupHit = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return { hardStop: hs };
      const submittedPostRoot = submittedPostResultRoot(submitSignal);
      if (submittedPostRoot) return { group: submittedPostRoot, directPost: true, postUrl: location.href };
      const postRoot = postResultRootForPrompt(prompt);
      if (postRoot) return { group: postRoot, directPost: true, postUrl: location.href };
      const titleRoot = titleResultRootForPrompt(prompt);
      if (titleRoot) return { group: titleRoot, titleScoped: true };
      const groups = promptResultGroups(prompt);
      const group = [...groups].reverse().find((candidate) => promptGroupStillGenerating(candidate)
        || resultImageEls(candidate).some((img) => !before.has(genId(img.currentSrc || img.src))));
      return group ? { group } : null;
    }, { timeout: Number(cfg?.grokPromptGroupTimeoutMs) || 180000 }).catch(() => null);
    if (promptGroupHit?.hardStop) return promptGroupHit.hardStop;
    const promptGroup = promptGroupHit?.group || null;
    if (!promptGroup) {
      return { ok: false, error: "no aparecio el bloque del prompt actual en Grok; no tomo imagenes de escenas anteriores" };
    }
    // `fire` puede observar primero "prompt liberado" y la navegacion llegar unos segundos despues.
    // Persistimos el /post en cuanto el mismo generateImage lo ve, antes de cualquier settle/descarga.
    if (promptGroupHit?.postUrl && promptGroupHit.postUrl !== submitSignal?.postUrl) {
      await reportImageSubmitObserved(grokAttempt, { reason: "navegacion tardia a post" }, submitSignal?.preUrl || "");
      submitSignal.postUrl = promptGroupHit.postUrl;
    }
    // Espera a que aparezca la PRIMERA imagen nueva (cargada: naturalWidth>=400).
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      return resultImageEls(promptGroup).some((i) => !before.has(genId(i.src))) ? { hit: true } : null;
    }, { timeout: 180000 }).catch(() => null);
    if (!found) return { ok: false, error: "GROK_PROMPT_GROUP_EMPTY: Grok acepto el prompt pero su bloque no produjo imagenes; no tomo una escena anterior" };
    if (found.type) return found; // parada dura
    // Elige UNA imagen nueva de forma DETERMINISTA: la mas GRANDE (full-res; en /post hay miniatura + grande
    // del mismo generado), desempate por orden DOM (en el grid sin-ref: izquierda->derecha = 1a variacion).
    const pickFresh = () => pickResultImage(before, promptGroup);
    // CRITICO: Grok muestra un PLACEHOLDER de RUIDO mientras genera, y SOLO al final aparece la imagen real.
    // El placeholder de ruido puede ser ESTATICO y ya tener dimensiones finales. Tambien hay frames
    // progresivos cuyo `src` cambia sin crecer (mismo largo/uno mas corto), por eso reiniciamos el reloj
    // ante CUALQUIER cambio de URL y validamos pixeles; el boton Guardar por si solo no prueba nitidez.
    // Re-consultamos el nodo porque React puede reemplazarlo durante la difusion.
    const isData = (s) => /^data:/.test(s || "");
    const ACTION_READY_QUIET_MS = Number(cfg?.grokImageActionReadyQuietMs) || 5000;
    const MAX_MS = 180000, t0 = Date.now();
    let lastSrc = "", lastPixelFingerprint = "", lastChange = Date.now(), settledSrc = "", settledNeedsByteValidation = false;
    while (Date.now() - t0 < MAX_MS) {
      const hs = detectHardStop(); if (hs) return hs;
      const el = pickFresh();
      const cur = el ? (el.currentSrc || el.src || "") : "";
      const pixelInspection = cur && !isData(cur) ? elementPixelInspection(el, cfg) : null;
      const pixelFingerprint = pixelInspection?.fingerprint || "";
      if (cur !== lastSrc || (pixelFingerprint && pixelFingerprint !== lastPixelFingerprint)) {
        lastSrc = cur; lastPixelFingerprint = pixelFingerprint; lastChange = Date.now();
      }
      const idle = Date.now() - lastChange;
      if (cur && !resultStillGenerating(el)) {
        if (isData(cur) && resultActionsReady(el) && idle >= ACTION_READY_QUIET_MS
            && await dataImageLooksFinal(cur, cfg)) { settledSrc = cur; break; }
        if (!isData(cur) && imageDimensionsLookFinal(el, cfg)) {
          const pixels = pixelInspection === null ? null : pixelInspection.looksFinal;
          // CORS=null NO equivale a aprobado. Solo devolvemos un candidato en cuarentena para que el
          // SW valide sus bytes descargados; nunca se asigna ni se mueve a canonical en este punto.
          if (resultActionsReady(el) && (pixels === true || pixels === null) && idle >= ACTION_READY_QUIET_MS) {
            settledSrc = cur; settledNeedsByteValidation = pixels !== true; break;
          }
        }
      }
      await sleep(400);
    }
    const freshEls = resultImageEls(promptGroup).filter((i) => !before.has(genId(i.src)));
    if (!pickFresh()) return { ok: false, error: "no aparecio imagen nueva en Grok tras generar" };
    if (!settledSrc) return { ok: false, error: "la imagen nueva de Grok no se estabilizo (evito guardar ruido o un frame intermedio)" };
    // Captura la URL del POST de esta imagen (Grok navega a /imagine/post/<id> al generar). Es la pagina
    // donde luego esta el boton "Hacer video"; guardarla evita derivarla mal de la URL del asset.
    let postUrl = /\/imagine\/post\/[^/]+/.test(location.href) ? location.href : postUrlFromContentSrc(settledSrc);
    if (!postUrl) {
      try { postUrl = await waitFor(() => /\/imagine\/post\/[^/]+/.test(location.href) ? location.href : null, { timeout: 2500 }); }
      catch (_e) { /* no navego a /post: animacion subira el JPG o el SW derivara un legacy /generated */ }
    }
    // Devuelve EXACTAMENTE el src que supero la validacion. Antes se volvia a leer el nodo y un
    // re-render entre ambas lineas podia sustituirlo por otro frame aun no validado.
    const candidateImages = await validatedImageCandidates(before, settledSrc, cfg, promptGroup);
    return { ok: true, data: {
      imageUrl: settledSrc, postUrl, variantCount: freshEls.length,
      requiresByteValidation: settledNeedsByteValidation,
      candidateImages, promptScoped: true,
    } };
  }

  // COLLECT_IMAGE: via de RECUPERACION (canal caido / SW reiniciado a media generacion). Aplica las
  // MISMAS senales de estabilizacion que generateImage: antes devolvia el primer <img> grande sin
  // validar y recuperaba el placeholder de RUIDO o un frame a media difusion (recurrencia del bug de
  // scene_15/scene_30). data: -> quieto QUIET_DATA_MS + dataImageLooksFinal; servidor -> quieto largo.
  async function collectImage({ timeoutMs = 45000, requirePost = false, before = [], prompt = "", cfg } = {}) {
    const exclude = new Set(before || []);
    let promptGroup = null;
    if (prompt && !requirePost) {
      promptGroup = await waitFor(() => postResultRootForPrompt(prompt)
        || titleResultRootForPrompt(prompt)
        || latestPromptResultGroup(prompt), {
        // Respetar el timeout real pedido por el SW. Antes se truncaba silenciosamente a 15s aunque
        // recuperacion solicitara 180s, justo cuando Grok monta el bloque tarde bajo carga.
        timeout: Math.max(1000, timeoutMs),
      }).catch(() => null);
      if (!promptGroup) {
        return { ok: false, error: "no encontre el bloque del prompt actual; no tomo imagenes de escenas anteriores" };
      }
      // Recuperacion de un intento ya enviado: si el bloque exacto esta vacio y no muestra progreso,
      // esperar unos segundos por un montaje tardio. Si sigue vacio, es prueba positiva de que NO hay
      // asset recuperable; nunca caer al bloque previo.
      if (!resultImageEls(promptGroup).length && !promptGroupStillGenerating(promptGroup)) {
        const mountedLate = await waitFor(() => {
          if (resultImageEls(promptGroup).length || promptGroupStillGenerating(promptGroup)) return { ready: true };
          return null;
        }, { timeout: Math.max(1000, timeoutMs) }).catch(() => null);
        if (!mountedLate) {
          return { ok: false, error: "GROK_PROMPT_GROUP_EMPTY: el bloque exacto del prompt esta vacio; no tomo una imagen anterior" };
        }
      }
    }
    const resultRoot = promptGroup || document;
    const found = await waitFor(() => {
      const hs = detectHardStop(); if (hs) return hs;
      if (requirePost && !/\/imagine\/post\//.test(location.href)) return null;
      const el = pickResultImage(exclude, resultRoot);
      return el ? { hit: true } : null;
    }, { timeout: timeoutMs });
    if (found.type) return found;
    const isData = (s) => /^data:/.test(s || "");
    const ACTION_READY_QUIET_MS = Number(cfg?.grokImageActionReadyQuietMs) || 5000;
    const settleMax = Math.max(30000, timeoutMs);
    const t0 = Date.now();
    let lastSrc = "", lastPixelFingerprint = "", lastChange = Date.now(), settledSrc = "", settledNeedsByteValidation = false;
    while (Date.now() - t0 < settleMax) {
      const hs = detectHardStop(); if (hs) return hs;
      const el = pickResultImage(exclude, resultRoot);
      const cur = el ? (el.currentSrc || el.src || "") : "";
      const pixelInspection = cur && !isData(cur) ? elementPixelInspection(el, cfg) : null;
      const pixelFingerprint = pixelInspection?.fingerprint || "";
      if (cur !== lastSrc || (pixelFingerprint && pixelFingerprint !== lastPixelFingerprint)) {
        lastSrc = cur; lastPixelFingerprint = pixelFingerprint; lastChange = Date.now();
      }
      const idle = Date.now() - lastChange;
      if (cur && !resultStillGenerating(el)) {
        if (isData(cur) && resultActionsReady(el) && idle >= ACTION_READY_QUIET_MS
            && await dataImageLooksFinal(cur, cfg)) { settledSrc = cur; break; }
        if (!isData(cur) && imageDimensionsLookFinal(el, cfg)) {
          const pixels = pixelInspection === null ? null : pixelInspection.looksFinal;
          if (resultActionsReady(el) && (pixels === true || pixels === null) && idle >= ACTION_READY_QUIET_MS) {
            settledSrc = cur; settledNeedsByteValidation = pixels !== true; break;
          }
        }
      }
      await sleep(400);
    }
    const chosen = pickResultImage(exclude, resultRoot);
    if (!chosen) return { ok: false, error: "no encontre imagen generada actual en Grok" };
    if (!settledSrc) return { ok: false, error: "la imagen recuperada no se estabilizo (posible ruido/frame intermedio); reintenta" };
    const candidateImages = await validatedImageCandidates(exclude, settledSrc, cfg, resultRoot);
    return {
      ok: true,
      data: {
        imageUrl: settledSrc,
        postUrl: /\/imagine\/post\//.test(location.href) ? location.href : null,
        variantCount: resultImageEls(resultRoot).filter((i) => !exclude.has(genId(i.currentSrc || i.src))).length,
        recovered: true,
        requiresByteValidation: settledNeedsByteValidation,
        candidateImages,
        promptScoped: !!promptGroup || requirePost,
      },
    };
  }

  // Toggle a modo VIDEO del composer: texto "Video" (composer /imagine) o aria-label "Video" (icono
  // camara del post de la imagen). Animar por aqui = UNA sola generacion dirigida (no el doble que
  // generaba "Hacer video" + "Crear video").
  function videoToggle() {
    const root = composeForm() || document;
    return [...root.querySelectorAll("button,[role=button],[role=radio],[role=menuitemradio],[role=tab]")]
      .find((b) => visible(b) && (norm(b.innerText) === "Video" || b.getAttribute("aria-label") === "Video"));
  }

  // La UI de julio de 2026 BORRA los adjuntos al cambiar Imagen <-> Video. El background llama esta
  // preparacion ANTES de DOM.setFileInputFiles; animateFire la repite de forma idempotente para posts y
  // versiones anteriores de la UI.
  async function prepareVideo() {
    const hs0 = detectHardStop(); if (hs0) return hs0;
    await waitFor(() => videoToggle(), { timeout: 20000 });
    await rsleep(500, 1200);
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
    return { ok: true, data: { prepared: true } };
  }

  // ANIMATE_FIRE: pone el composer en modo Video -> escribe el prompt -> "Enviar" (TRUSTED via CDP, como
  // generar imagen; el clic sintetico de Enviar es flaky). Grok navega al /post del video y genera en
  // sitio; el video lo recoge ANIMATE_COLLECT tras re-inyectar. El SW adjunta el debugger SOLO para este
  // clic y lo suelta antes de la espera larga (evita el congelamiento).
  async function animateFire({ prompt, cfg, expectImage } = {}) {
    const prepared = await prepareVideo();
    if (prepared?.type) return prepared;
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
  const grokDriverMessageListener = (message, _sender, sendResponse) => {
    const type = message?.type;
    if (!type || !Object.values(ACT).includes(type)) return; // ignora lo que no es ACT.*
    (async () => {
      try {
        if (type === ACT.PING) return { ok: true, data: { pong: true, driver: "grok", url: location.href } };
        if (type === ACT.INSPECT_DOM) return inspect();
        if (type === ACT.PREPARE_IMAGE) return await prepareImage();
        if (type === ACT.GENERATE_IMAGE) return await generateImage(message);
        if (type === ACT.COLLECT_IMAGE) return await collectImage(message);
        if (type === ACT.PREPARE_VIDEO) return await prepareVideo();
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
  };
  window.__grokDriverMessageListener = grokDriverMessageListener;
  chrome.runtime.onMessage.addListener(grokDriverMessageListener);

  console.log("[grok-driver] cargado en", location.href);
})();
