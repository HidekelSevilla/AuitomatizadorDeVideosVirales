// content/flow-driver.js
// Driver del DOM de Google Flow. Content script NO-module (comparte scope con
// content/selectors.config.js, que define window.FLOW_SELECTORS).
//
// Recibe ACT.* desde el background (chrome.tabs.sendMessage) y responde
//   { ok:true, data:{...} } | { ok:false, error } | { type: RES.CAPTCHA_DETECTED|RES.NO_CREDITS }
//
// Selectores: window.FLOW_SELECTORS (mapeados en vivo 2026-06-14).
// CONFIRMADO: generacion de imagen (Nano Banana) de punta a punta.
// UNVERIFIED: subida/seleccion de referencia, animacion (Veo) y descarga -> requieren
//   una corrida con puntos para afinar; van marcados y con errores controlados.

(() => {
  "use strict";

  // Valores de mensaje (espejo de lib/messaging.js; el content script no puede importar ES modules).
  const ACT = {
    PING: "act:ping",
    INSPECT_DOM: "act:inspect_dom",
    NEW_PROJECT: "act:new_project",
    CREATE_CHARACTER: "act:create_character",
    CREATE_CHARACTER_FROM_MEDIA: "act:create_character_from_media",
    HAS_CHARACTER: "act:has_character",
    REVEAL_UPLOAD_INPUT: "act:reveal_upload_input",
    CLEANUP_MEDIA: "act:cleanup_media",
    PRELOAD_REFERENCES: "act:preload_references",
    GENERATE_IMAGE: "act:generate_image",
    ANIMATE: "act:animate",
    ANIMATE_FIRE: "act:animate_fire",
    VIDEO_SRCS: "act:video_srcs",
    MAP_NEW_VIDEOS: "act:map_new_videos",
    RETRY_FAILED_TILES: "act:retry_failed_tiles",
    ANIMATE_COLLECT: "act:animate_collect",
    DOWNLOAD_CLIP: "act:download_clip",
  };
  const RES = { CAPTCHA: "res:captcha", NO_CREDITS: "res:no_credits" };

  const SEL = () => window.FLOW_SELECTORS || {};
  const LOCAL_REF_CACHE_KEY = "flow_local_reference_bindings_v1";
  const localReferenceCache = new Map();
  const namedMediaCache = new Map();
  let localReferenceCacheLoaded = false;

  // ------------------------------------------------------------------ utils ---
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Espera ALEATORIA (anti-deteccion): rompe la periodicidad de los sleep fijos. El content script no
  // puede importar jitterDelay del modulo, asi que va local.
  const rsleep = (min, max) => sleep(Math.round(min + Math.random() * Math.max(0, max - min)));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

  function projectMediaScope() {
    return location.pathname.match(/\/flow\/project\/([0-9a-f-]{6,})/i)?.[1] || "unknown";
  }

  function localReferenceCacheId(filePath) {
    return `${projectMediaScope()}|${String(filePath || "").replace(/\\/g, "/").toLowerCase()}`;
  }

  async function loadLocalReferenceCache() {
    if (localReferenceCacheLoaded) return;
    localReferenceCacheLoaded = true;
    try {
      const saved = (await chrome.storage.local.get(LOCAL_REF_CACHE_KEY))?.[LOCAL_REF_CACHE_KEY] || {};
      for (const [key, value] of Object.entries(saved)) if (value?.url) localReferenceCache.set(key, value);
    } catch (_e) { /* cache opcional */ }
  }

  async function rememberLocalReference(filePath, mediaUrls, fingerprint = "", name = "") {
    const url = (mediaUrls || []).find(Boolean);
    if (!url) return;
    await loadLocalReferenceCache();
    localReferenceCache.set(localReferenceCacheId(filePath), { url, fingerprint, name: norm(name), updatedAt: Date.now() });
    const newest = [...localReferenceCache.entries()]
      .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, 250);
    try { await chrome.storage.local.set({ [LOCAL_REF_CACHE_KEY]: Object.fromEntries(newest) }); } catch (_e) { /* opcional */ }
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  // Ejecuta una estrategia de selector y devuelve nodos candidatos.
  function queryByStrategy(s) {
    try {
      if (s.by === "css") return [...document.querySelectorAll(s.value)];
      if (s.by === "role") {
        let els = [...document.querySelectorAll(`[role="${s.value}"]`)];
        if (s.text) els = els.filter((e) => norm(e.innerText).includes(s.text));
        return els;
      }
      if (s.by === "tab") {
        return [...document.querySelectorAll('button[role="tab"]')]
          .filter((e) => norm(e.innerText).includes(s.text));
      }
      if (s.by === "text") {
        return [...document.querySelectorAll(s.tag || "*")]
          .filter((e) => norm(e.innerText).includes(s.value));
      }
      if (s.by === "textExact") {
        return [...document.querySelectorAll(s.tag || "*")]
          .filter((e) => norm(e.innerText) === s.value);
      }
    } catch (_e) { /* selector invalido */ }
    return [];
  }

  // Resuelve un array de estrategias: primer nodo VISIBLE y mas especifico (texto mas corto).
  function resolve(specs) {
    for (const s of specs || []) {
      const els = queryByStrategy(s).filter(visible);
      if (els.length) {
        els.sort((a, b) => norm(a.innerText).length - norm(b.innerText).length);
        return els[0];
      }
    }
    return null;
  }

  // Nodo clickable mas cercano: primero boton/menuitem/tab/link; si no, el ancestro mas
  // cercano con cursor:pointer (Flow usa <div>/<span> clickables sin rol, p.ej. el sidebar).
  function clickable(el) {
    const direct = el.closest("button,[role=menuitem],[role=button],[role=tab],a");
    if (direct) return direct;
    let e = el;
    for (let i = 0; i < 5 && e && e.nodeType === 1; i++) {
      try { if (getComputedStyle(e).cursor === "pointer") return e; } catch (_e) {}
      e = e.parentElement;
    }
    return el;
  }

  // Click con secuencia de PUNTERO real (Flow/React ignora element.click() en pestanas).
  function realClick(el) {
    if (!el) throw new Error("realClick: nodo nulo");
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const o = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true,
    };
    el.dispatchEvent(new PointerEvent("pointerover", o));
    el.dispatchEvent(new PointerEvent("pointerenter", o));
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...o, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...o, buttons: 0 }));
  }

  // Click TRUSTED via el background (chrome.debugger / CDP). Necesario para "Generar":
  // Flow exige isTrusted=true (anti-bot) y un click sintetico NO funciona ahi.
  async function trustedClickEl(el, { releaseAfterClick = false } = {}) {
    if (!el) throw new Error("trustedClickEl: nodo nulo");
    el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(200);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const resp = await chrome.runtime.sendMessage({ type: "trusted_click", x, y, releaseAfterClick });
    if (!resp || !resp.ok) throw new Error("click trusted fallo: " + (resp?.error || "sin respuesta del background"));
  }

  async function trustedKeyboard(payload) {
    const resp = await chrome.runtime.sendMessage({ type: "trusted_keyboard", ...payload });
    if (!resp || !resp.ok) throw new Error("teclado trusted fallo: " + (resp?.error || "sin respuesta del background"));
  }

  function hover(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: "mouse" };
    el.dispatchEvent(new PointerEvent("pointerover", o));
    el.dispatchEvent(new PointerEvent("pointerenter", o));
    el.dispatchEvent(new MouseEvent("mouseover", o));
    el.dispatchEvent(new MouseEvent("mouseenter", o));
    el.dispatchEvent(new MouseEvent("mousemove", o));
  }

  function pressEscape() {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
  }

  // Espera a que predicate() devuelva algo truthy (MutationObserver + polling + timeout).
  function waitFor(predicate, { timeout = 120000, interval = 400 } = {}) {
    return new Promise((resolveP, rejectP) => {
      const t0 = Date.now();
      let done = false;
      const finish = (fn, arg) => { if (done) return; done = true; obs.disconnect(); clearInterval(iv); fn(arg); };
      const check = () => {
        let v = null;
        try { v = predicate(); } catch (_e) { v = null; }
        if (v) finish(resolveP, v);
        return !!v;
      };
      const obs = new MutationObserver(() => check());
      const iv = setInterval(() => {
        if (check()) return;
        if (Date.now() - t0 > timeout) finish(rejectP, new Error("timeout esperando condicion"));
      }, interval);
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      check();
    });
  }

  function placeCaretEnd(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function slateValue(el) {
    return norm([...el?.querySelectorAll?.('[data-slate-string="true"]') || []]
      .map((n) => n.textContent || "").join(""));
  }

  // Slate puede dejar texto visible en nodos que no llevan data-slate-string (por ejemplo, durante
  // una rehidratacion de React). La verificacion anterior no lo veia y podia considerar limpio un
  // editor que visualmente aun contenia residuos. Quitamos solo el placeholder y auditamos TODO el
  // texto restante del editor.
  function slateVisibleValue(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll?.('[data-slate-placeholder="true"]').forEach((node) => node.remove());
    return norm(String(clone.textContent || "").replace(/\uFEFF/g, ""));
  }

  // Escribe en el editor Slate. CONFIRMADO: Slate IGNORA execCommand/mutaciones directas del
  // DOM; SOLO registra texto via eventos `beforeinput`. A veces no "pega" (foco/timing), asi que
  // verificamos y reintentamos. Devuelve true si el texto quedo escrito.
  async function typeInSlate(el, text, cfg) {
    // Flow cambio Slate: InputEvent/insertText sintetico puede dejar texto VISIBLE dentro de
    // data-slate-zero-width sin actualizar el estado React. La flecha sigue aria-disabled=true.
    // Teclas CDP trusted crean data-slate-string y habilitan Crear (verificado en vivo 2026-07-11).
    const wanted = String(text || "").replace(/\r?\n/g, " ");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
      // "Borrar peticion" puede reemplazar el contenteditable. Siempre escribir en el nodo VIVO,
      // no en la referencia capturada antes de limpiar.
      el = resolve(SEL().promptInput) || el;
      el.focus();
      placeCaretEnd(el);
      await trustedKeyboard({ text: wanted, replace: true });
      await sleep(250);
      const slateText = slateValue(el);
      const visibleText = slateVisibleValue(el);
      const gen = resolve(SEL().generateButton);
      if (norm(slateText) === norm(wanted) && norm(visibleText) === norm(wanted)
          && gen?.getAttribute("aria-disabled") !== "true") return true;
      } catch (_e) { /* reintenta con teclado trusted; nunca anexa mediante eventos sinteticos */ }
      await sleep(300);
    }
    return false;
  }

  // Flow conserva texto y chips tras un fallo de subida. Ctrl+A no siempre alcanza todos los nodos
  // Slate, pero el boton oficial "Borrar peticion" si restablece el estado React completo.
  async function clearComposerRequest() {
    const root = composerRoot() || document;
    const clearBtn = [...root.querySelectorAll('button,[role="button"]')].find((b) => {
      if (!visible(b)) return false;
      const label = norm(b.innerText);
      const icon = norm(b.querySelector('i')?.innerText).split(/\s+/)[0];
      return icon === "close" && /borrar petici|clear (prompt|request)/i.test(label);
    });
    const inputBefore = resolve(SEL().promptInput);
    const alreadyEmpty = !slateValue(inputBefore) && !slateVisibleValue(inputBefore)
      && referenceChipCount() === 0;
    if (!clearBtn && alreadyEmpty) return true;
    if (clearBtn) {
      try { await trustedClickEl(clickable(clearBtn)); } catch (_e) { realClick(clickable(clearBtn)); }
    } else {
      // Fallback cerrado: limpiar el editor con Ctrl+A/Backspace trusted y quitar chips uno por uno.
      if (inputBefore) {
        inputBefore.focus();
        await trustedKeyboard({ text: "", replace: true });
      }
      await clearReferenceChips();
    }
    const cleared = await waitFor(() => {
      const input = resolve(SEL().promptInput);
      return !slateValue(input) && !slateVisibleValue(input) && referenceChipCount() === 0 ? true : null;
    }, { timeout: 6000 }).catch(() => null);
    if (!cleared) throw new Error('Flow no limpio por completo la peticion anterior');
    return true;
  }

  async function submitComposer(input, gen, cfg, expectedPrompt = "") {
    let liveInput = resolve(SEL().promptInput) || input;
    let liveGen = resolve(SEL().generateButton) || gen;
    if (!liveGen) throw new Error("no encuentro el boton generar");
    const before = slateValue(liveInput);
    const visibleBefore = slateVisibleValue(liveInput);
    if (!before) throw new Error("Flow no registro texto antes de enviar");
    if (expectedPrompt && (norm(before) !== norm(String(expectedPrompt).replace(/\r?\n/g, " "))
        || norm(visibleBefore) !== norm(String(expectedPrompt).replace(/\r?\n/g, " ")))) {
      throw new Error(`Flow altero, acumulo o duplico el prompt antes de enviar `
        + `(Slate=${before.length}, visible=${visibleBefore.length}, esperado=${String(expectedPrompt).length}); no envie Enter`);
    }
    const enabled = await waitFor(() => {
      const b = resolve(SEL().generateButton);
      return b && b.getAttribute("aria-disabled") !== "true" ? b : null;
    }, { timeout: 8000 }).catch(() => null);
    if (!enabled) throw new Error("Flow mostro el prompt pero no lo registro en Slate (Crear sigue deshabilitado)");

    await rsleep(cfg?.reviewMinMs ?? 1200, cfg?.reviewMaxMs ?? 3500);
    // Los selectores de referencias dejan el foco en una opcion/CTA y React puede reemplazar Slate.
    // Re-resolver y enfocar el editor vivo justo antes de Enter evita que la tecla caiga en el dialogo.
    liveInput = resolve(SEL().promptInput) || liveInput;
    liveInput.focus();
    placeCaretEnd(liveInput);
    await trustedKeyboard({ key: "ENTER", releaseAfterKey: true });
    const accepted = await waitFor(() => {
      const after = slateValue(resolve(SEL().promptInput));
      const b = resolve(SEL().generateButton);
      return !after || after.length < Math.max(2, before.length / 2)
        || b?.disabled || b?.getAttribute("aria-disabled") === "true" ? true : null;
    }, { timeout: 8000 }).catch(() => null);
    // Enter es el UNICO gesto de envio. Si Flow tarda en limpiar Slate, el caller sigue esperando el
    // resultado hasta 180 s; nunca hacemos clic despues porque un envio aceptado pero lento gastaria dos
    // generaciones. Si Enter de verdad no entro, termina en timeout recuperable sin doble gasto.
    return !!accepted;
  }

  async function dataUrlToFile(dataUrl, name) {
    const blob = await (await fetch(dataUrl)).blob();
    const type = blob.type || "image/png";
    return new File([blob], name, { type });
  }

  // ----------------------------------------------------------- paradas duras ---
  // Devuelve {type:RES.*} si hay parada dura, o null.
  function detectHardStop() {
    const s = SEL();
    if (resolve(s.captchaIndicator)) return { type: RES.CAPTCHA };
    if (resolve(s.noCreditsIndicator)) return { type: RES.NO_CREDITS };
    const pageText = norm(document.body?.innerText || "");
    if (/application error:\s*a client-side exception has occurred|se produjo una excepci[oó]n del lado del cliente/i.test(pageText)) {
      return { ok: false, error: "FLOW_CLIENT_ERROR: la aplicacion de Flow sufrio una excepcion del cliente antes de completar la escena" };
    }
    return null;
  }

  function detectConsent() {
    return !!resolve(SEL().consentDialog);
  }

  // Al crear/entrar a un proyecto, Flow abre el panel "Agente" (sesion) y el modo agente ON, lo que
  // OCULTA el compositor normal. Esto: 1) cierra el panel de sesion (boton aria-label "Cerrar") para
  // revelar el compositor; 2) apaga el toggle "Agente" si esta encendido (aria-pressed=true). OJO: el
  // toggle "Agente" SOLO responde a click TRUSTED (CDP); el sintetico no lo apaga. Idempotente.
  async function ensureNormalMode() {
    const findAgent = () => [...document.querySelectorAll("button")]
      .find((b) => /^(agente|agent)$/i.test(norm(b.innerText)));
    if (!findAgent()) {
      const close = [...document.querySelectorAll("button")]
        .find((b) => /^(cerrar|close)$/i.test((b.getAttribute("aria-label") || "").trim()));
      if (close) {
        realClick(clickable(close));
        await sleep(1000);
        if (!findAgent()) { try { await trustedClickEl(close); await sleep(1000); } catch (_e) {} }
      }
    }
    const agent = await waitFor(() => findAgent(), { timeout: 5000 }).catch(() => null);
    if (!agent) throw new Error("Flow no mostro el control Agente; no puedo confirmar que este apagado");
    if (agent && agent.getAttribute("aria-pressed") === "true") {
      try { await trustedClickEl(agent); } catch (_e) { realClick(agent); }
      const disabled = await waitFor(() => {
        const live = findAgent();
        return live && live.getAttribute("aria-pressed") !== "true" ? live : null;
      }, { timeout: 5000 }).catch(() => null);
      if (!disabled) throw new Error("Flow no apago el modo Agente; cancelo antes de generar");
    }
    if (findAgent()?.getAttribute("aria-pressed") === "true") {
      throw new Error("Flow conserva el modo Agente activo; cancelo antes de generar");
    }
  }

  function normalizeNanoBananaModel(value) {
    const text = norm(typeof value === "string" ? value : (value?.innerText || value?.textContent || ""))
      .replace(/arrow_drop_down/gi, " ").replace(/\s+/g, " ").trim();
    if (/(?:^|\s)Nano Banana Pro(?:\s|$)/i.test(text)) return "Nano Banana Pro";
    if (/(?:^|\s)Nano Banana 2 Lite(?:\s|$)/i.test(text)) return "Nano Banana 2 Lite";
    if (/(?:^|\s)Nano Banana 2(?:\s|$)/i.test(text)) return "Nano Banana 2";
    return "";
  }

  function exactNanoBananaModel(el, requestedModel) {
    const expected = normalizeNanoBananaModel(requestedModel || "Nano Banana Pro");
    return !!expected && normalizeNanoBananaModel(el) === expected;
  }

  // Flow puede conservar el ultimo modelo usado por OTRO proyecto. Seleccionamos el modelo declarado
  // por el JSON y verificamos el dropdown vivo; nunca cambiamos silenciosamente a Pro/2/Lite.
  async function ensureNanoBananaModel(s, requestedModel) {
    const target = normalizeNanoBananaModel(requestedModel || "Nano Banana Pro");
    if (!target) throw new Error(`modelo de imagen Flow no soportado: ${requestedModel || "(vacio)"}`);
    let dropdown = resolve(s.modelDropdown);
    if (!dropdown) throw new Error("Flow no mostro el selector de modelo de imagen");
    if (!exactNanoBananaModel(dropdown, target)) {
      realClick(clickable(dropdown));
      const option = await waitFor(() => [...document.querySelectorAll('[role="option"],[role="menuitem"],li,button')]
        .find((el) => visible(el) && exactNanoBananaModel(el, target)), { timeout: 5000 }).catch(() => null);
      if (!option) throw new Error(`${target} no aparece entre los modelos de Flow`);
      realClick(clickable(option));
      await sleep(500);
      dropdown = resolve(s.modelDropdown);
    }
    if (!dropdown || !exactNanoBananaModel(dropdown, target)) {
      throw new Error(`Flow no confirmo ${target}; cancelo antes de generar`);
    }
  }

  // ---------------------------------------------------- compositor / ajustes ---
  // Abre el popover de ajustes y fija modo (image|video[+frames]), aspect y conteo.
  async function configureComposer({ mode, aspectRatio, count, imageModel }) {
    const s = SEL();
    await ensureNormalMode();   // cierra panel Agente + apaga modo agente -> compositor normal
    const chip = resolve(s.modelSettingsChip);
    if (!chip) throw new Error("no encuentro el chip de ajustes (modelSettingsChip)");
    realClick(clickable(chip));
    await waitFor(() => resolve(s.imageModeTab) || resolve(s.videoModeTab), { timeout: 5000 });

    if (mode === "image") {
      const t = resolve(s.imageModeTab);
      if (!t) throw new Error("Flow no mostro el modo Imagen");
      realClick(clickable(t));
      await sleep(300);
      await ensureNanoBananaModel(s, imageModel);
    } else {
      const v = resolve(s.videoModeTab);
      if (v) realClick(clickable(v));
      await sleep(300);
      const f = resolve(s.framesSubTab); // frame-to-video
      if (f) realClick(clickable(f));
    }
    await sleep(300);

    const aspKey = "aspect_" + String(aspectRatio || "9:16").replace(":", "_"); // 9:16 -> aspect_9_16
    if (s[aspKey]) { const a = resolve(s[aspKey]); if (a) realClick(clickable(a)); }
    await sleep(200);

    const cntKey = "count_" + (count || 1) + "x"; // 1 -> count_1x
    if (s[cntKey]) { const c = resolve(s[cntKey]); if (c) realClick(clickable(c)); }
    await sleep(200);

    pressEscape();
    await sleep(300);
  }

  // srcs de imagenes generadas actualmente en la grilla. Multi-idioma: alt ES/EN + patron de URL
  // de media de Flow (getMediaUrlRedirect, agnostico). El diff antes/despues en generateImage
  // distingue la imagen NUEVA de las preexistentes (referencias, personaje).
  function mediaKey(src) {
    try {
      const u = new URL(String(src || ""), location.href);
      return u.searchParams.get("name") || u.href;
    } catch (_e) { return String(src || ""); }
  }

  // En la grilla actual de Flow una referencia RECIEN SUBIDA usa el mismo alt="Imagen generada"
  // y el mismo enlace /edit/ que un resultado. Su tarjeta, sin embargo, conserva el nombre del archivo.
  // Excluirla aqui evita adoptar el upload como si Nano Banana hubiera terminado en 800 ms.
  function isUploadedMediaTile(img) {
    if (!img) return false;
    const key = mediaKey(img.currentSrc || img.src || "");
    // Al renombrar un upload como "Personaje — ..."/"Escenario — ...", Flow deja de mostrar la
    // extension original. La identidad durable del cache sigue demostrando que es una referencia.
    if (key && [...localReferenceCache.values()].some((entry) => mediaKey(entry?.url || "") === key)) return true;
    let node = img;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const label = [node.innerText, node.textContent, node.getAttribute?.("aria-label"), node.getAttribute?.("title")]
        .filter(Boolean).join(" ").replace(/\s+/g, " ");
      if (/(?:^|[\s(])[^\s<>:"/\\|?*]+\.(?:jpe?g|png|webp|heic)(?:[\s)]|$)/i.test(label)) return true;
    }
    return false;
  }

  function currentResultImgs(excludedKeys = null) {
    const root = composerRoot();
    return [...document.querySelectorAll('img[alt="Imagen generada"], img[alt="Generated image"], img[src*="getMediaUrlRedirect"]')]
      .filter((img) => !!img.closest('a[href*="/edit/"]'))
      .filter((img) => !root?.contains(img) && !img.closest('[role="dialog"]'))
      .filter((img) => !isUploadedMediaTile(img))
      .filter((img) => !excludedKeys?.has(mediaKey(img.currentSrc || img.src || "")));
  }

  function composerMediaButton() {
    const buttons = [...document.querySelectorAll("button")].filter(visible);
    const exact = buttons.find((button) => norm(button.innerText).split(/\s+/)[0] === "add_2");
    if (exact) return exact;
    // Fallback acotado por cercania al editor. No tomar el boton global "Añadir archivo multimedia"
    // de la cabecera: ese dispara el selector nativo de Windows y bloquea toda la cola.
    const input = resolve(SEL().promptInput);
    if (!input) return null;
    const ir = input.getBoundingClientRect();
    return buttons
      .filter((button) => button.getAttribute("aria-haspopup") === "dialog")
      .filter((button) => {
        const label = norm(button.innerText);
        return !/a.adir archivo multimedia|upload media/i.test(label);
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        return Math.abs(ar.top - ir.top) - Math.abs(br.top - ir.top);
      })[0] || null;
  }

  function generationErrorTilesForPrompt(prompt = "") {
    const needle = norm(String(prompt || "")).slice(0, 80);
    return [...document.querySelectorAll("button")].filter((button) => {
      if (!visible(button) || !/(?:warning\s+)?(?:error|failed|fallo)/i.test(norm(button.innerText))) return false;
      if (!needle) return true;
      let node = button;
      for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
        if (norm(node.innerText || node.textContent || "").includes(needle)) return true;
      }
      return false;
    });
  }

  // --------------------------------------------------------- referencias ------
  // Imagenes del proyecto en la grilla (generadas o subidas). Multi-idioma.
  function allProjectImgs() {
    return [...document.querySelectorAll('img[alt="Imagen generada"], img[alt="Generated image"], img[alt^="Un contenido multimedia"], img[alt^="A media"], img[src*="getMediaUrlRedirect"]')];
  }

  function projectTileImgs() {
    const root = composerRoot();
    return allProjectImgs()
      .filter((img) => !!img.closest('a[href*="/edit/"]'))
      .filter((img) => !root?.contains(img) && !img.closest('[role="dialog"]'));
  }

  // Hay al menos un chip de referencia adjunto en el compositor (CONFIRMADO).
  function referenceChipPresent() {
    return referenceChipCount() > 0;
  }

  function composerRoot() {
    const input = resolve(SEL().promptInput);
    const plus = composerMediaButton();
    const gen = resolve(SEL().generateButton);
    let node = input;
    for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      if ((!plus || node.contains(plus)) && (!gen || node.contains(gen))) return node;
    }
    return input?.parentElement || null;
  }

  function referenceChipElements() {
    const chipSel = (SEL().referenceChip || []).filter((x) => x.by === "css").map((x) => x.value).join(",");
    const root = composerRoot();
    return chipSel && root ? [...root.querySelectorAll(chipSel)].filter(visible) : [];
  }

  function referenceChipCount() {
    return referenceChipElements().length;
  }

  function referenceChipKeys() {
    return referenceChipElements().map((img) => mediaKey(img.currentSrc || img.src || "")).filter(Boolean);
  }

  function flowReferenceKind(label = "") {
    const value = norm(label).toLowerCase();
    if (/^(personaje|character)\s/.test(value)) return "character";
    if (/^(escenario|environment|location)\s/.test(value)) return "environment";
    if (/^(escena|scene)\s/.test(value)) return "scene";
    return "asset";
  }

  // Flow/Nano Banana recibe imagenes en orden, pero el nombre semantico del tile no siempre llega al
  // modelo. Este prefijo enlaza de forma explicita cada chip con su rol sin resumir ni reescribir el
  // prompt original. Evita que dos personajes se fusionen o que un escenario dicte la identidad.
  function flowPromptWithReferenceMap(prompt, referencePlan = []) {
    if (!referencePlan.length) return String(prompt || "");
    const roles = referencePlan.map((entry, index) => {
      const label = norm(entry?.label) || `Reference ${index + 1}`;
      const kind = entry?.kind || flowReferenceKind(label);
      const rule = kind === "character"
        ? "character identity/appearance/pose only"
        : kind === "environment"
          ? "location/materials/lighting only"
          : kind === "scene"
            ? "requested continuity only; do not clone composition"
            : "named object/visual element only";
      return `[${index + 1}] ${label} = ${rule}`;
    });
    return [
      `REFERENCE ROLES (metadata, not additional scene prompts): ${roles.join("; ")}. Keep identities separate; references never override composition.`,
      "SCENE PROMPT (verbatim):",
      String(prompt || ""),
    ].join("\n");
  }

  function auditAttachedReferences(referenceManifest = []) {
    const chipKeys = referenceChipKeys();
    if (chipKeys.length !== referenceManifest.length) {
      throw new Error(`Flow adjunto ${chipKeys.length}/${referenceManifest.length} referencias; no envie la generacion`);
    }
    const actual = new Set(chipKeys);
    const missing = referenceManifest.filter((entry) => {
      const expected = (entry?.mediaKeys || []).filter(Boolean);
      return !expected.length || !expected.some((key) => actual.has(key));
    });
    if (missing.length) {
      throw new Error(`Flow cambio o confundio ${missing.length} referencia(s): ${missing.map((entry) => entry.label).join(", ")}; no envie la generacion`);
    }
    if (actual.size !== chipKeys.length) {
      throw new Error("Flow duplico una referencia en el compositor; no envie la generacion");
    }
    return { count: chipKeys.length, chipKeys, labels: referenceManifest.map((entry) => entry.label) };
  }

  // Quita TODOS los chips de referencia del compositor (la "X" de cada chip = boton con icono "cancel").
  // CRITICO: Flow NO limpia los chips entre generaciones; sin esto una escena HEREDA los chips de la
  // anterior (o de un intento fallido) -> al re-adjuntar el personaje Flow lo DEDUPLICA (el contador no
  // sube -> "timeout esperando condicion") y se mezclan referencias de otras escenas. Verificado en vivo
  // 2026-06-20: el contenedor del chip trae un boton cuyo 1er token de innerText es "cancel".
  async function clearReferenceChips() {
    for (let guard = 0; guard < 20 && referenceChipElements().length; guard++) {
      const chip = referenceChipElements()[0];
      const root = composerRoot();
      const isRemoveButton = (b) => {
        const label = `${norm(b?.innerText)} ${norm(b?.getAttribute?.("aria-label") || "")}`;
        return !!b && visible(b) && /(^|\s)(cancel|close|remove|cerrar|quitar)(\s|$)/i.test(label);
      };
      let btn = chip.closest('button,[role="button"]');
      if (!isRemoveButton(btn)) btn = null;
      let n = chip.parentElement;
      for (let i = 0; !btn && i < 6 && n && n !== root; i++, n = n.parentElement) {
        btn = [...n.querySelectorAll('button,[role="button"]')].find(isRemoveButton) || null;
      }
      if (!btn || (root && !root.contains(btn))) {
        throw new Error(`Flow conserva ${referenceChipCount()} referencia(s), pero no expone su boton para quitarlas`);
      }
      const before = referenceChipCount();
      try { await trustedClickEl(clickable(btn)); } catch (_e) { realClick(clickable(btn)); }
      const removed = await waitFor(() => referenceChipCount() < before ? true : null, { timeout: 5000 }).catch(() => null);
      if (!removed) throw new Error(`Flow no quito una referencia heredada (${before} siguen visibles)`);
    }
    if (referenceChipCount()) throw new Error(`Flow no limpio todas las referencias heredadas (${referenceChipCount()} restantes)`);
    return true;
  }

  // Sube una referencia LOCAL al selector multimedia de Flow usando CDP en el background y la
  // adjunta solo cuando Flow ya creo una opcion real. Nunca acepta input.files como confirmacion:
  // eso cambia antes de que React termine de consumir/subir el archivo.
  async function attachCachedLocalReference(filePath, cachedUrl, cachedName = "") {
    const s = SEL();
    const plus = composerMediaButton();
    if (!plus) throw new Error('no encuentro el boton "+" para reutilizar la referencia local');
    const before = referenceChipCount();
    realClick(clickable(plus));
    const dialog = await waitFor(() => [...document.querySelectorAll('[role="dialog"]')].find(visible), { timeout: 6000 });
    const uploadsTab = [...dialog.querySelectorAll('[role="tab"]')].find((e) => {
      const t = norm(e.innerText);
      return /(^|\s)(subidas|uploads)(\s|$)/i.test(t) || t.split(/\s+/)[0] === "drive_folder_upload";
    });
    if (uploadsTab && uploadsTab.getAttribute("aria-selected") !== "true") {
      realClick(clickable(uploadsTab));
      await sleep(350);
    }
    const filename = String(filePath || "").split(/[\\/]/).pop() || "";
    const stem = filename.replace(/\.[^.]+$/, "").toLowerCase();
    const semanticName = norm(cachedName);
    const searchTerm = semanticName || filename;
    const search = [...dialog.querySelectorAll('input[type="text"]')].find(visible);
    if (search && searchTerm) {
      search.focus();
      await trustedKeyboard({ text: searchTerm, replace: true });
      await waitFor(() => norm(search.value) === norm(searchTerm) ? true : null, { timeout: 4000 });
      await sleep(350);
    }
    const wantedKey = mediaKey(cachedUrl || "");
    const option = await waitFor(() => {
      const opts = [...dialog.querySelectorAll('[role="option"]')].filter(visible);
      const exact = opts.find((o) => wantedKey && [...o.querySelectorAll("img")]
        .some((i) => mediaKey(i.currentSrc || i.src || "") === wantedKey));
      // Si existe una identidad cacheada, el nombre NO es un fallback seguro: Flow puede conservar
      // dos uploads con el mismo nombre semantico y escoger el equivocado. Fallar aqui hace que el
      // caller busque el tile exacto o vuelva a subir el archivo, sin enviar una referencia cruzada.
      if (wantedKey) return exact || null;
      return opts.find((o) => semanticName && norm(o.innerText).toLowerCase().includes(semanticName.toLowerCase()))
        || opts.find((o) => stem && norm(o.innerText).toLowerCase().includes(stem)) || null;
    }, { timeout: 6000 }).catch(() => null);
    if (!option) {
      pressEscape();
      throw new Error(`Flow no encontro '${filename}' en Subidas para reutilizarlo`);
    }
    const mediaUrls = [...option.querySelectorAll("img")].map((i) => i.currentSrc || i.src || "").filter(Boolean);
    if (option.getAttribute("aria-selected") !== "true") {
      try { await trustedClickEl(clickable(option)); } catch (_e) { realClick(clickable(option)); }
      await sleep(250);
    }
    const findCta = () => resolve(s.addToPromptButton)
      || [...document.querySelectorAll('button,[role="button"]')].find((b) => visible(b)
        && /a.adir a la petic|agregar a la (petic|instrucc)|add to (prompt|instruction)/i.test(norm(b.innerText)));
    if (referenceChipCount() <= before) {
      const cta = await waitFor(() => {
        const b = findCta();
        return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null;
      }, { timeout: 6000 }).catch(() => null);
      if (!cta) throw new Error(`Flow encontro '${filename}', pero no habilito Anadir a la peticion`);
      try { await trustedClickEl(clickable(cta)); } catch (_e) { realClick(clickable(cta)); }
    }
    await waitFor(() => referenceChipCount() > before ? true : null, { timeout: 8000 });
    return { mediaUrls: mediaUrls.length ? mediaUrls : [cachedUrl].filter(Boolean) };
  }

  async function attachLocalReference(filePath, displayName = "") {
    const s = SEL();
    const plus = composerMediaButton();
    if (!plus) throw new Error('no encuentro el boton "+" para subir la referencia local');
    await loadLocalReferenceCache();
    const fingerprintReply = await chrome.runtime.sendMessage({ type: "flow_file_fingerprint", filePath }).catch(() => null);
    const fingerprint = fingerprintReply?.ok ? fingerprintReply.fingerprint : "";
    const cached = localReferenceCache.get(localReferenceCacheId(filePath));
    if (cached?.url && fingerprint && cached.fingerprint === fingerprint) {
      try {
        const attached = await attachCachedLocalReference(filePath, cached.url, cached.name || displayName);
        const renameWarning = cached.name === norm(displayName)
          ? null : await renameAttachedMedia(attached, displayName);
        await rememberLocalReference(filePath, attached?.mediaUrls || [cached.url], fingerprint,
          renameWarning ? (cached.name || "") : displayName);
        return { ...attached, renameWarning };
      } catch (_e) { /* fallback al tile exacto y, si no, a subir de nuevo */ }
      const cachedTile = await findResultImageScrolling(cached.url, allProjectImgs).catch(() => null);
      if (cachedTile) {
        try {
          const attached = await attachTileToPrompt(cachedTile);
          let renameWarning = null;
          if (cached.name !== norm(displayName)) {
            try { await renameMediaTile(cachedTile, displayName); }
            catch (e) { renameWarning = e?.message || String(e); }
          }
          await rememberLocalReference(filePath, attached?.mediaUrls || [cached.url], fingerprint,
            renameWarning ? (cached.name || "") : displayName);
          return { ...attached, renameWarning };
        } catch (_e) { /* el menu de mosaico cambio; continua al selector/subida */ }
      }
    }
    try { const sc = findResultsScroller(); if (sc) sc.scrollTo({ top: 0 }); await sleep(250); } catch (_e) {}
    const chipsBefore = referenceChipCount();
    const projectKeysBefore = new Set(projectTileImgs().map((i) => mediaKey(i.currentSrc || i.src || "")));
    realClick(clickable(plus));
    let dialog = await waitFor(() => [...document.querySelectorAll('[role="dialog"]')].find(visible), { timeout: 6000 });
    const filename = String(filePath || "").split(/[\\/]/).pop() || "";

    // Flow mantiene el input multimedia global montado aun cuando el selector interno "+" esta
    // abierto. Se llena DIRECTAMENTE por CDP. Nunca hacemos click en "Subir archivos multimedia":
    // ese click llama input.click() y deja abierto el picker nativo de Windows encima de Chrome.
    const mediaInput = [...document.querySelectorAll('input[type="file"]')].find((el) => {
      const accept = norm(el.getAttribute("accept")).toLowerCase();
      return accept.includes("image") && (accept.includes("video") || accept.includes("heic") || el.multiple);
    });
    if (!mediaInput) throw new Error("Flow no expuso el input multimedia interno; cierro sin abrir el selector nativo");
    const accept = mediaInput.getAttribute("accept") || "";
    const fileSelector = `input[type="file"][accept="${CSS.escape(accept)}"]`;
    const upload = await chrome.runtime.sendMessage({
      type: "flow_set_file_input",
      files: [filePath],
      selector: fileSelector,
    });
    if (!upload?.ok) throw new Error(`Flow no pudo colocar '${filename}' en el selector (${upload?.error || "sin respuesta"})`);

    // No elegimos una opcion "fresca" del dialogo: un upload anterior puede terminar tarde y ocupar
    // ese lugar. Esperamos el UNICO tile nuevo del proyecto, completamente decodificado y estable, y
    // adjuntamos exactamente ese mediaKey. Asi la biblioteca se serializa de verdad.
    let stableUploadKey = "", stableUploadSince = 0;
    const uploadedTile = await waitFor(() => {
      const fresh = projectTileImgs().filter((img) => {
        const key = mediaKey(img.currentSrc || img.src || "");
        return key && !projectKeysBefore.has(key) && img.complete && img.naturalWidth >= 256 && img.naturalHeight >= 256;
      });
      if (fresh.length !== 1) { stableUploadKey = ""; stableUploadSince = 0; return null; }
      const key = mediaKey(fresh[0].currentSrc || fresh[0].src || "");
      if (key !== stableUploadKey) { stableUploadKey = key; stableUploadSince = Date.now(); return null; }
      return Date.now() - stableUploadSince >= 1800 ? fresh[0] : null;
    }, { timeout: 45000 }).catch(() => null);
    if (!uploadedTile) throw new Error(`Flow no estabilizo el upload unico de '${filename}'`);
    pressEscape();
    await sleep(350);
    const mediaUrls = [uploadedTile.currentSrc || uploadedTile.src || ""].filter(Boolean);
    const uploadedKey = mediaKey(mediaUrls[0]);
    let renameWarning = null;
    try { await renameMediaTile(uploadedTile, displayName); }
    catch (e) { renameWarning = e?.message || String(e); }

    if (referenceChipCount() > chipsBefore) {
      const newChipKeys = referenceChipKeys();
      if (referenceChipCount() !== chipsBefore + 1 || !newChipKeys.includes(uploadedKey)) {
        throw new Error(`Flow adjunto otro recurso mientras subia '${filename}'`);
      }
    } else {
      await attachTileToPrompt(uploadedTile);
    }
    await rememberLocalReference(filePath, mediaUrls, fingerprint, renameWarning ? "" : displayName);
    return { mediaUrls, renameWarning };
  }

  // Encuentra el ⋮ ("more_vert") del TILE indicado: hace hover sobre el tile y toma el boton
  // cuyo CENTRO cae DENTRO del rect de la imagen (en X e Y). CRITICO en grilla: filtrar solo por
  // posicion vertical agarra el ⋮ de OTRA COLUMNA -> animaba/adjuntaba la imagen equivocada.
  // Devuelve null si no aparece tras hover.
  async function tileMoreButton(tileImg) {
    const tile = tileImg.closest("div,li") || tileImg;
    try { tileImg.scrollIntoView({ block: "center" }); } catch (_e) {}
    await sleep(250);
    hover(tile);
    hover(tileImg);
    try {
      return await waitFor(() => {
        const tr = tileImg.getBoundingClientRect();
        const onTile = [...document.querySelectorAll("button,[role=button]")]
          // CRITICO: el ⋮ es un boton con texto CORTO ("more_vert" / "more_vert Más"). Su CONTENEDOR
          // (el tile entero, a veces un <button>) tambien "incluye" more_vert en su innerText pero es
          // largo y su centro = centro de la imagen -> clicarlo NO abre menu. Exigimos texto corto.
          .filter((b) => { const t = norm(b.innerText); return t.startsWith("more_vert") && t.length < 20 && visible(b); })
          .filter((b) => {
            const r = b.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            return cx >= tr.left - 8 && cx <= tr.right + 8 && cy >= tr.top - 8 && cy <= tr.bottom + 8;
          })
          // el ⋮ del tile esta arriba-derecha: preferir el de menor 'top' (y mas a la derecha).
          .sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (rb.left - ra.left); });
        return onTile.length ? onTile[0] : null;
      }, { timeout: 4000 });
    } catch (_e) { return null; }
  }

  // Flow conserva los nombres de medios en el proyecto y los muestra al volver a adjuntarlos. Poner un
  // nombre semantico (Personaje/Escenario + identidad + pose/vista) evita que el modelo reciba una pila
  // indistinguible de "Imagen generada". Mapeado en vivo 2026-07-19:
  //   hover tile -> ⋮ -> "Cambiar nombre" -> input "Texto editable" -> "Hecho".
  async function renameMediaTile(tileImg, requestedName) {
    const name = norm(requestedName).slice(0, 120);
    if (!tileImg || !name) return { renamed: false, skipped: true };
    const key = mediaKey(tileImg.currentSrc || tileImg.src || "");
    if (key && namedMediaCache.get(key) === name) return { renamed: true, changed: false, cached: true };

    const more = await tileMoreButton(tileImg);
    if (!more) throw new Error(`no encontre el menu del medio para nombrarlo "${name}"`);
    realClick(clickable(more));
    await sleep(250);
    const renameItem = await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')]
      .find((e) => visible(e) && (/cambiar nombre|rename/i.test(norm(e.innerText))
        || norm(e.innerText).split(/\s+/)[0] === "whiteboard")), { timeout: 4000 }).catch(() => null);
    if (!renameItem) { pressEscape(); throw new Error('Flow no mostro "Cambiar nombre" para el medio'); }
    realClick(clickable(renameItem));

    const dialog = await waitFor(() => [...document.querySelectorAll('[role="dialog"]')].find((d) => visible(d)
      && d.querySelector('input[type="text"][aria-label="Texto editable"],input[type="text"]')), { timeout: 5000 });
    const input = dialog.querySelector('input[type="text"][aria-label="Texto editable"],input[type="text"]');
    const current = norm(input?.value || "");
    const buttons = () => [...dialog.querySelectorAll('button')].filter(visible);
    const done = () => buttons().find((b) => /(^|\s)(done|hecho|guardar|save)(\s|$)/i.test(norm(b.innerText)));
    const cancel = () => buttons().find((b) => /(^|\s)(close|cancelar|cancel)(\s|$)/i.test(norm(b.innerText)));
    if (current === name) {
      const close = cancel();
      if (close) realClick(clickable(close)); else pressEscape();
      await waitFor(() => !visible(dialog), { timeout: 4000 }).catch(() => null);
      if (key) namedMediaCache.set(key, name);
      return { renamed: true, changed: false };
    }

    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, name); else input.value = name;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: name }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(250);
    const save = done();
    if (!save) throw new Error('Flow abrio el nombre, pero no mostro "Hecho"');
    realClick(clickable(save));
    const closed = await waitFor(() => !visible(dialog) ? true : null, { timeout: 6000 }).catch(() => null);
    if (!closed) throw new Error(`Flow no confirmo el nombre "${name}"`);
    if (key) namedMediaCache.set(key, name);
    return { renamed: true, changed: true };
  }

  async function renameAttachedMedia(attached, displayName) {
    const name = norm(displayName);
    const url = (attached?.mediaUrls || []).find(Boolean);
    if (!name || !url) return null;
    try {
      const tile = await findResultImageScrolling(url, allProjectImgs);
      if (!tile) throw new Error("el tile subido no aparece en la grilla");
      await renameMediaTile(tile, name);
      return null;
    } catch (e) {
      return `no pude nombrar la referencia "${name}" (${e?.message || e})`;
    }
  }

  // Adjunta una imagen YA presente en el proyecto como referencia: hover su tile ->
  // ⋮ -> "Añadir a la petición" -> espera el chip en el compositor. CONFIRMADO 2026-06-14.
  async function attachTileToPrompt(tileImg) {
    const s = SEL();
    const before = referenceChipCount();
    const mediaUrls = [tileImg.currentSrc || tileImg.src || ""].filter(Boolean);
    const more = await tileMoreButton(tileImg);
    if (!more) throw new Error("no encuentro el ⋮ de este tile (hover/grilla)");
    realClick(clickable(more));
    await sleep(300);
    let add = resolve(s.menuAddToPrompt);
    if (!add) {
      // Fallback multi-idioma: item del menu ABIERTO cuyo ICONO (1er token) es exactamente "add"
      // ("add Añadir a la petición" / "add Add to prompt"). Distinto de "add_2 Crear".
      add = [...document.querySelectorAll('[role="menuitem"],[role="option"]')]
        .find((e) => visible(e) && norm(e.innerText).split(/\s+/)[0] === "add");
    }
    if (!add) throw new Error('no encuentro "Añadir a la petición"/"Add to prompt" en el menu (¿es este tile un Personaje real, no una plantilla?)');
    realClick(clickable(add));
    await waitFor(() => referenceChipCount() > before, { timeout: 5000 });
    return { mediaUrls };
  }

  // Adjunta el PERSONAJE de Flow al prompt via el SELECTOR DE RECURSOS (boton "+"). CONFIRMADO
  // 2026-06-14 end-to-end con eventos SINTETICOS: clic en "+" (openMediaDialogButton) abre el
  // selector; al filtrar por el NOMBRE en su buscador aparecen "<nombre>.png · Imagen" y el
  // PERSONAJE ("@<nombre>", icono accessibility_new); elegir el Personaje + boton "Agregar a la
  // instrucción" adjunta el chip img[alt="Imagen de referencia del personaje"].
  // (Antes intente con "@" en el editor, pero Slate solo abre el selector con tecla REAL, no con
  // beforeinput sintetico -> fallaba. El boton "+" abre el MISMO selector con un clic sintetico.)
  // Robusto a idioma: usa el nombre (character_bible.name). NOTA: los personajes son POR-PROYECTO.
  async function attachCharacterReference(characterName) {
    const s = SEL();
    try {
      // 1) Abre el selector de recursos con el "+" del compositor.
      const plus = composerMediaButton();
      if (!plus) throw new Error('no encuentro el boton "+" del compositor (openMediaDialogButton)');
      try { await trustedClickEl(clickable(plus)); } catch (_e) { realClick(clickable(plus)); }

      // Flow mantiene otros buscadores visibles en la pagina. El buscador correcto siempre vive dentro
      // del dialogo que contiene las pestañas Todos/Imagenes/Caracteres/Subidas.
      const findPickerRoot = () => [...document.querySelectorAll('[role="dialog"]')]
        .find((dialog) => visible(dialog) && dialog.querySelector('[role="tab"]')
          && dialog.querySelector('input,[role="textbox"]')) || null;
      let pickerRoot = await waitFor(findPickerRoot, { timeout: 6000 }).catch(() => null);
      if (!pickerRoot) throw new Error('no encuentro el panel del selector "+" (¿abrio el selector de recursos?)');

      // La biblioteca contiene tanto el upload "Imagen" como el Character con el MISMO nombre. Entrar
      // explicitamente a Caracteres elimina la ambiguedad y evita que Flow adjunte la foto suelta.
      const characterTab = [...pickerRoot.querySelectorAll('[role="tab"]')]
        .find((tab) => visible(tab) && /car[aá]cteres|characters/i.test(norm(tab.innerText)));
      if (!characterTab) throw new Error('no encuentro la pestaña Characters en el selector de recursos');
      let reopenPicker = false;
      if (characterTab.getAttribute("aria-selected") !== "true") {
        try { await trustedClickEl(clickable(characterTab)); } catch (_e) { realClick(clickable(characterTab)); }
        const selected = await waitFor(() => characterTab.getAttribute("aria-selected") === "true" ? true : null,
          { timeout: 5000 }).catch(() => null);
        // React a veces ignora el primer cambio de pestaña aunque el clic sea trusted. Todavia no se
        // envio nada: cerrar y reabrir el picker una vez es seguro y evita diferir dos escenas seguidas.
        if (!selected) reopenPicker = true;
        else {
          pickerRoot = findPickerRoot() || pickerRoot;
          await sleep(450);
        }
      }

      const findSearch = () => [...pickerRoot.querySelectorAll('input,[role="textbox"]')]
        .find((input) => visible(input) && /buscar recursos|search (assets|resources)/i.test(
          `${input.getAttribute?.("aria-label") || ""} ${input.getAttribute?.("placeholder") || ""}`))
        || [...pickerRoot.querySelectorAll("input")].find(visible)
        || null;
      let search = reopenPicker ? null : findSearch();
      if (!search && !reopenPicker) throw new Error('no encuentro "Buscar recursos" dentro del selector de Characters');

      const nameLc = norm(characterName).toLowerCase();
      const setSearch = async (inp, val) => {
        if (!inp) return false;
        inp.focus();
        await trustedKeyboard({ text: val, replace: true });
        const live = findSearch() || inp;
        return !!(await waitFor(() => norm(live.value) === norm(val) ? true : null, { timeout: 3500 }).catch(() => null));
      };
      const findResult = () => [...pickerRoot.querySelectorAll('[role="option"]')].find((option) => {
        if (!visible(option)) return false;
        const alts = [...option.querySelectorAll("img")].map((img) => norm(img.alt).toLowerCase());
        const lines = norm(option.innerText).split(/\r?\n/).map((line) => norm(line).toLowerCase());
        const text = norm(option.innerText).toLowerCase();
        return !!nameLc && (alts.includes(nameLc) || lines.includes(nameLc)
          || text === `${nameLc} ${nameLc}` || text.startsWith(`${nameLc} ${nameLc} `));
      }) || null;

      let result = null;
      for (let attempt = 0; !reopenPicker && attempt < 3 && !result; attempt++) {
        search = findSearch() || search;
        if (attempt) { await setSearch(search, ""); await sleep(180); }
        await setSearch(search, characterName);
        await sleep(attempt === 0 ? 900 : 550);
        result = await waitFor(findResult, { timeout: 3500 }).catch(() => null);
      }

      // Flow a veces deja el selector de Characters visualmente abierto pero sin hidratar sus
      // opciones. Repetir la busqueda dentro de ese mismo modal no lo recupera. Como todavia no se
      // ha escrito ni enviado el prompt, es seguro cerrar y reabrir UNA sola vez el selector.
      if (!result) {
        pressEscape();
        await waitFor(() => !findPickerRoot() ? true : null, { timeout: 2500 }).catch(() => null);
        await sleep(220);

        const retryPlus = composerMediaButton();
        if (!retryPlus) throw new Error('no encuentro el boton "+" al reabrir el selector de Characters');
        try { await trustedClickEl(clickable(retryPlus)); } catch (_e) { realClick(clickable(retryPlus)); }
        pickerRoot = await waitFor(findPickerRoot, { timeout: 6000 }).catch(() => null);
        if (!pickerRoot) throw new Error('Flow no reabrio el selector de Characters');

        const retryCharacterTab = [...pickerRoot.querySelectorAll('[role="tab"]')]
          .find((tab) => visible(tab) && /car[aá]cteres|characters/i.test(norm(tab.innerText)));
        if (!retryCharacterTab) throw new Error('no encuentro la pestaña Characters al reabrir el selector');
        if (retryCharacterTab.getAttribute("aria-selected") !== "true") {
          try { await trustedClickEl(clickable(retryCharacterTab)); } catch (_e) { realClick(clickable(retryCharacterTab)); }
          const retrySelected = await waitFor(
            () => retryCharacterTab.getAttribute("aria-selected") === "true" ? true : null,
            { timeout: 5000 }
          ).catch(() => null);
          if (!retrySelected) throw new Error('Flow no activo Characters al reabrir el selector');
          pickerRoot = findPickerRoot() || pickerRoot;
          await sleep(450);
        }

        search = findSearch();
        if (!search) throw new Error('no encuentro "Buscar recursos" al reabrir Characters');
        await setSearch(search, "");
        await sleep(200);
        await setSearch(search, characterName);
        await sleep(1000);
        result = await waitFor(findResult, { timeout: 5000 }).catch(() => null);
      }
      if (!result) {
        const selectedTab = [...pickerRoot.querySelectorAll('[role="tab"]')]
          .find((tab) => tab.getAttribute("aria-selected") === "true");
        const visibleOptions = [...pickerRoot.querySelectorAll('[role="option"]')]
          .filter(visible).slice(0, 8).map((option) => norm(option.innerText)).filter(Boolean);
        throw new Error(`no encuentro el personaje "${characterName || ""}" en Characters `
          + `(pestaña=${norm(selectedTab?.innerText) || "ninguna"}; busqueda=${norm(findSearch()?.value) || "vacia"}; `
          + `opciones=${visibleOptions.join(" | ") || "ninguna"})`);
      }

      const mediaUrls = [...result.querySelectorAll("img")].map((i) => i.currentSrc || i.src || "").filter(Boolean);
      const countChips = () => referenceChipCount();
      const before = countChips();
      // La busqueda actual preselecciona el unico Character. Un segundo clic lo deseleccionaria.
      const resultOption = result.closest?.('[role="option"]') || result;
      if (resultOption.getAttribute("aria-selected") !== "true") {
        try { await trustedClickEl(clickable(result)); } catch (_e) { realClick(clickable(result)); }
      }

      const labelRe = /agregar a la instrucc|a.adir a la petic|agregar a la petic|add to prompt|add to your prompt|add to instruction/i;
      const findAddCta = () => [...pickerRoot.querySelectorAll('button,[role="button"]')]
        .find((element) => visible(element) && labelRe.test(norm(element.innerText)))
        || null;
      await waitFor(() => countChips() > before || findAddCta(), { timeout: 6000 }).catch(() => null);
      if (countChips() <= before) {
        const addBtn = findAddCta();
        if (!addBtn) throw new Error('no encuentro "Añadir a la petición" dentro del selector de Characters');
        try { await trustedClickEl(clickable(addBtn)); } catch (_e) { realClick(clickable(addBtn)); }
        await waitFor(() => countChips() > before, { timeout: 6000 });
      }
      return { mediaUrls };
    } catch (error) {
      // Un picker abierto tapa el selector de modelo de la escena siguiente y convierte un fallo aislado
      // en una cascada. Siempre cerramos el modal antes de devolver el error al service worker.
      pressEscape();
      await sleep(180);
      throw error;
    }
  }

  // ------------------------------------------------------------- acciones -----
  async function preloadReferences({ localReferencePaths, localReferenceNames, model }) {
    const paths = Array.isArray(localReferencePaths) ? localReferencePaths.filter(Boolean) : [];
    const names = Array.isArray(localReferenceNames) ? localReferenceNames : [];
    await configureComposer({ mode: "image", imageModel: model });
    await clearComposerRequest();
    await clearReferenceChips();
    const loaded = [];
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      const label = norm(names[index]) || String(path).split(/[\\/]/).pop() || `Referencia ${index + 1}`;
      const attached = await attachLocalReference(path, label);
      if (attached?.renameWarning) {
        throw new Error(`Flow cargo "${label}", pero no pudo renombrarlo (${attached.renameWarning})`);
      }
      const mediaKeys = [...new Set((attached?.mediaUrls || []).map(mediaKey).filter(Boolean))];
      const audit = auditAttachedReferences([{ label, kind: flowReferenceKind(label), mediaKeys }]);
      loaded.push({ label, mediaKey: audit.chipKeys[0] });
      await clearReferenceChips();
    }
    await clearComposerRequest();
    return { ok: true, data: { count: loaded.length, references: loaded } };
  }

  async function generateImage({ prompt, characterNames, sceneRefImageUrls, ingredientRefs, localReferencePaths, localReferenceNames, resultName, useCharacterRef, characterName, aspectRatio, count, model, cfg }) {
    const s = SEL();
    const hs = detectHardStop(); if (hs) return hs;

    // Recuperacion defensiva: si un intento anterior perdio el canal con el selector abierto, Escape
    // devuelve Flow al compositor. Es inocuo cuando no hay ningun modal.
    pressEscape();
    await sleep(120);
    await configureComposer({ mode: "image", aspectRatio, count: count || 1, imageModel: model });

    const localPaths = Array.isArray(localReferencePaths) ? localReferencePaths : [];
    const localNames = Array.isArray(localReferenceNames) ? localReferenceNames : [];
    const names = (Array.isArray(characterNames) && characterNames.length)
      ? characterNames
      : (useCharacterRef && characterName ? [characterName] : []);
    const refs = (ingredientRefs || []).filter((ref) => ref && ref.name);
    const sceneUrls = Array.isArray(sceneRefImageUrls) ? sceneRefImageUrls.filter(Boolean) : [];
    const basename = (path) => String(path || "").split(/[\\/]/).pop() || "Referencia local";
    const characterLabel = (name) => /^(personaje|character)\s/i.test(norm(name))
      ? norm(name) : `Personaje — ${name}`;
    // En Flow los Characters son anclas semanticas mas fuertes que una foto suelta. Los adjuntamos
    // primero y dejamos escenarios/props despues, en el mismo orden que declaramos al modelo.
    const referencePlan = [
      ...names.map((name) => ({ label: characterLabel(name), kind: "character" })),
      ...localPaths.map((path, index) => ({ label: localNames[index] || basename(path), kind: flowReferenceKind(localNames[index] || "") })),
      ...refs.map((ref) => ({ label: ref.name, kind: flowReferenceKind(ref.name) })),
      ...sceneUrls.map((_url, index) => ({ label: `Escena previa — referencia ${index + 1}`, kind: "scene" })),
    ];
    const flowPrompt = flowPromptWithReferenceMap(prompt, referencePlan);

    // ORDEN: primero el prompt, DESPUES las referencias. typeInSlate BORRA el editor antes de escribir,
    // asi que si adjuntaramos antes, borrariamos sus menciones/chips. Adjuntar al final deja el
    // prompt limpio + las menciones/chips de personaje(s) y de escena(s) previa(s).
    let input = resolve(s.promptInput);
    if (!input) throw new Error("no encuentro el editor de prompt (promptInput)");
    await clearComposerRequest();
    input = resolve(s.promptInput);
    if (!input) throw new Error("Flow reemplazo el editor al limpiar y no mostro uno nuevo");
    realClick(input);
    const okType = await typeInSlate(input, flowPrompt, cfg);
    if (!okType) throw new Error("no pude escribir el prompt en el editor (Slate)");
    await sleep(300);

    // Limpia chips heredados (de la escena previa o de un intento fallido) ANTES de adjuntar los de
    // ESTA escena: Flow no los limpia solo y arrastrarlos rompe el conteo de chips y mezcla referencias.
    await clearReferenceChips();
    const referenceKeys = new Set();
    const referenceManifest = [];
    const renameWarnings = [];
    const failReference = async (error) => {
      pressEscape();
      await sleep(120);
      await clearReferenceChips().catch(() => {});
      await clearComposerRequest().catch(() => {});
      return { ok: false, error };
    };
    const rememberReference = (attached, planned) => {
      const mediaKeys = [];
      for (const url of (attached?.mediaUrls || [])) {
        const key = mediaKey(url);
        if (key) { referenceKeys.add(key); mediaKeys.push(key); }
      }
      referenceManifest.push({ label: planned?.label || "Referencia", kind: planned?.kind || "asset", mediaKeys: [...new Set(mediaKeys)] });
    };

    // PERSONAJES: lista de nombres guardados en la memoria "Caracteres" del proyecto.
    // Compat: si llega useCharacterRef+characterName (esquema viejo), se trata como [characterName].
    for (let nameIndex = 0; nameIndex < names.length; nameIndex++) {
      const name = names[nameIndex];
      try { rememberReference(await attachCharacterReference(name), referencePlan[nameIndex]); await sleep(300); }
      catch (e) { return await failReference(`referencia personaje "${name}": ${e.message}`); }
    }

    // REFERENCIAS LOCALES (escenarios/sistema/continuidad cross-provider): se suben por el mismo
    // DOM.setFileInputFiles y se adjuntan DESPUES de los Characters, respetando referencePlan.
    for (let localIndex = 0; localIndex < localPaths.length; localIndex++) {
      const filePath = localPaths[localIndex];
      try {
        const attached = await attachLocalReference(filePath, localNames[localIndex] || "");
        rememberReference(attached, referencePlan[names.length + localIndex]);
        if (attached?.renameWarning) renameWarnings.push(attached.renameWarning);
        await sleep(300);
      }
      catch (e) { return await failReference(`referencia local "${filePath}": ${e.message}`); }
    }

    // Los ingredientes generados en ESTA corrida se adjuntan por identidad de tile. Los rehidratados de
    // otra Parte llegan por localReferencePaths: entity/location_plate no son Personajes de Flow.
    for (let refIndex = 0; refIndex < refs.length; refIndex++) {
      const ref = refs[refIndex];
      if (!ref.imageUrl) return await failReference(`ingrediente "${ref.name}": sin tile ni archivo local`);
      try {
        const tile = await findResultImageScrolling(ref.imageUrl, allProjectImgs);
        if (!tile) throw new Error("no aparece ni con scroll");
        try { await renameMediaTile(tile, ref.name); }
        catch (renameError) { renameWarnings.push(`ingrediente "${ref.name}": ${renameError?.message || renameError}`); }
        rememberReference(await attachTileToPrompt(tile), referencePlan[names.length + localPaths.length + refIndex]);
        await sleep(300);
      } catch (e2) { return await failReference(`ingrediente "${ref.name}": no pude adjuntar su tile exacto (${e2.message})`); }
    }

    // ESCENAS PREVIAS: imagenes YA en el proyecto -> su ⋮ -> "Añadir a la peticion" (attachTileToPrompt).
    // Se ubican por su media-name (name=<id>) ya que las imagenes generadas no tienen nombre visible.
    for (let sceneRefIndex = 0; sceneRefIndex < sceneUrls.length; sceneRefIndex++) {
      const url = sceneUrls[sceneRefIndex];
      const refKey = mediaKey(url); if (refKey) referenceKeys.add(refKey);
      try {
        // Busca la imagen de la escena previa haciendo scroll (puede haberse salido del DOM).
        const tile = await findResultImageScrolling(url, allProjectImgs);
        if (!tile) throw new Error("la imagen de la escena referenciada no aparece ni con scroll (¿se genero antes?)");
        rememberReference(await attachTileToPrompt(tile), referencePlan[names.length + localPaths.length + refs.length + sceneRefIndex]);
        await sleep(300);
      } catch (e) { return await failReference(`referencia escena: ${e.message}`); }
    }
    await sleep(400);
    const attachmentAudit = auditAttachedReferences(referenceManifest);

    // Tras adjuntar referencias (que pudieron hacer scroll), volvemos arriba: la imagen NUEVA aparece
    // al tope y la deteccion before/after la lee del DOM; si quedaramos abajo no la veriamos.
    try { const sc = findResultsScroller(); if (sc) sc.scrollTo({ top: 0 }); await sleep(300); } catch (_e) {}
    const before = new Set(currentResultImgs(referenceKeys).map((i) => mediaKey(i.currentSrc || i.src || "")));
    const errorTilesBefore = generationErrorTilesForPrompt(flowPrompt).length;
    const gen = resolve(s.generateButton);
    if (!gen) throw new Error("no encuentro el boton generar (generateButton)");
    const submitted = await submitComposer(input, gen, cfg, flowPrompt);
    if (!submitted) {
      throw new Error("Flow no confirmo el envio del prompt; no adoptare una referencia subida como resultado");
    }

    // Espera el nuevo resultado o una parada dura.
    let stableKey = "", stableSince = 0;
    const result = await waitFor(() => {
      const stop = detectHardStop(); if (stop) return stop;
      if (generationErrorTilesForPrompt(flowPrompt).length > errorTilesBefore) {
        return { generationError: true };
      }
      const fresh = currentResultImgs(referenceKeys).filter((i) => i.complete && i.naturalWidth >= 256
        && i.naturalHeight >= 256 && !before.has(mediaKey(i.currentSrc || i.src || "")));
      if (!fresh.length) { stableKey = ""; stableSince = 0; return null; }
      const img = fresh[0];
      const key = mediaKey(img.currentSrc || img.src || "");
      if (key !== stableKey) { stableKey = key; stableSince = Date.now(); return null; }
      return Date.now() - stableSince >= 3000 ? { img } : null;
    }, { timeout: 180000 });

    if (result.type || result?.ok === false) return result; // parada dura o caida de la SPA
    if (result.generationError) throw new Error("Flow mostro Error en la tarjeta de esta generacion");
    if (resultName) {
      try { await renameMediaTile(result.img, resultName); }
      catch (renameError) { renameWarnings.push(`resultado "${resultName}": ${renameError?.message || renameError}`); }
    }
    return { ok: true, data: { imageUrl: result.img.currentSrc || result.img.src, renameWarnings, attachmentAudit } };
  }

  // Selecciona el modelo de video en el dropdown del compositor (chip -> dropdown -> opcion).
  // NO toca los tabs de modo (Vídeo/Fotogramas), asi no suelta el frame adjunto por "Animar".
  // modelText = texto exacto del modelo (p.ej. "Veo 3.1 - Fast"). Devuelve el costo leido o null.
  // CONFIRMADO 2026-06-14: opciones = [Omni Flash, Veo 3.1 - Lite/Fast/Quality], menuitems "volume_up <modelo>".
  async function selectVideoModel(modelText, duration) {
    if (!modelText && !duration) return null;
    const s = SEL();
    const chip = resolve(s.modelSettingsChip);
    if (!chip) return null; // sin chip no podemos cambiar nada; se usa el default de Flow
    realClick(clickable(chip));
    await sleep(500);
    // Modelo: abre el dropdown y elige la opcion que contenga el texto pedido.
    if (modelText) {
      const dd = resolve(s.modelDropdown);
      if (dd) {
        realClick(clickable(dd));
        await sleep(500);
        const opt = [...document.querySelectorAll('[role="option"],[role="menuitem"],li,button')]
          .find((e) => visible(e) && norm(e.innerText).includes(modelText));
        if (opt) { realClick(clickable(opt)); await sleep(600); }
      }
    }
    // Duracion: tab flow_tab_slider_trigger con texto exacto "4s"/"6s"/... Solo existe en modelos
    // que la soportan (Omni). Si no esta (p.ej. Veo), es no-op.
    if (duration) {
      const durTab = [...document.querySelectorAll('.flow_tab_slider_trigger,[class*="slider_trigger"],[role="tab"]')]
        .find((e) => visible(e) && norm(e.innerText) === duration);
      if (durTab) { realClick(clickable(durTab)); await sleep(400); }
    }
    const costEl = resolve(s.creditCostText);
    const cost = costEl ? norm(costEl.innerText) : null;
    pressEscape();
    await sleep(300);
    return cost;
  }

  // Captura el ULTIMO frame del <video> terminado como PNG dataURL. CONFIRMADO 2026-06-14:
  // el canvas NO queda tainted (toDataURL funciona), asi que extraemos el frame aqui en el
  // content script (sin offscreen ni fetch en background, que choca con CORS del redirect).
  async function captureLastFrame(video) {
    const target = Math.max(0, (video.duration || 8) - 0.05);
    try { video.pause(); } catch (_e) {}
    await new Promise((res) => {
      const on = () => { video.removeEventListener("seeked", on); res(); };
      video.addEventListener("seeked", on);
      try { video.currentTime = target; } catch (_e) { res(); }
      setTimeout(res, 2500); // tope: dibuja lo que haya
    });
    const c = document.createElement("canvas");
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }

  // Videos de resultado (excluye banners de marketing gstatic).
  function nonBannerVideos() {
    return [...document.querySelectorAll("video")]
      .filter((v) => (v.currentSrc || v.src) && !/gstatic/.test(v.currentSrc || v.src || ""));
  }

  // Posters/miniaturas de video (aparecen ANTES que el <video> cargado). Multi-idioma.
  function videoPosters() {
    return [...document.querySelectorAll('img[alt^="Miniatura"], img[alt="Video thumbnail"], img[alt^="Video"]')]
      .filter((i) => (i.src || "") && /getMediaUrlRedirect/.test(i.src || ""));
  }

  // Extrae el identificador (name=<id>) de una URL de media de Flow, para emparejar poster<->video.
  function mediaName(url) {
    const m = (url || "").match(/name=([^&]+)/);
    return m ? m[1] : (url || "");
  }

  // Contenedor con SCROLL de la grilla de resultados. Flow VIRTUALIZA: con muchas imagenes, los
  // tiles viejos salen del DOM al hacer scroll -> currentResultImgs() solo ve los visibles. Subimos
  // desde un img de resultado hasta el primer ancestro con overflow-y scrollable y contenido alto.
  function findResultsScroller() {
    const probe = currentResultImgs()[0] || allProjectImgs()[0];
    let el = probe ? probe.parentElement : null;
    for (let i = 0; el && i < 14; i++) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 40) return el;
      el = el.parentElement;
    }
    // Fallback: el contenedor scrollable mas alto de la pagina.
    let best = null, bestH = 0;
    for (const e of document.querySelectorAll("main, section, div")) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 200 && e.scrollHeight > bestH) {
        best = e; bestH = e.scrollHeight;
      }
    }
    return best;
  }

  // Encuentra el img de resultado por su src (o por name=<id>), HACIENDO SCROLL por la grilla hasta
  // que su tile entre al DOM. Resuelve el bug de "la imagen ya no esta en pantalla" al animar muchas
  // escenas (las primeras se descargan del DOM). Devuelve el img centrado, o null si no aparece.
  async function findResultImageScrolling(imageUrl, pool = currentResultImgs) {
    const want = mediaName(imageUrl);
    const match = () => pool().find((i) => {
      const src = i.currentSrc || i.src || "";
      return src === imageUrl || mediaName(src) === want;
    });
    let hit = match();
    if (hit) { hit.scrollIntoView({ block: "center" }); await sleep(250); return match() || hit; }

    const scroller = findResultsScroller();
    if (!scroller) return null;
    scroller.scrollTo({ top: 0 });
    await sleep(350);
    const step = Math.max(240, Math.floor(scroller.clientHeight * 0.8));
    for (let i = 0; i < 80; i++) {
      hit = match();
      if (hit) { hit.scrollIntoView({ block: "center" }); await sleep(300); return match() || hit; }
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      if (scroller.scrollTop >= maxTop - 2) break;   // llegamos al fondo sin encontrarla
      scroller.scrollBy({ top: step });
      await sleep(350);                               // deja que Flow renderice los tiles nuevos
    }
    return match();
  }

  // DISPARA la animacion de la imagen indicada y devuelve la URL de SU video SIN esperar a que
  // termine de generarse. Asi el orquestador puede disparar todas las escenas (paralelo) y luego
  // recogerlas. ⋮ -> "Animar" (acotado a ESA imagen) -> modelo/duracion -> prompt -> generar ->
  // espera a que aparezca el NUEVO <video> (su URL) para mapearlo a esta escena.
  async function animateFire({ prompt, aspectRatio, count, imageUrl, model, duration, cfg }) {
    const s = SEL();
    const hs = detectHardStop(); if (hs) return hs;

    let target;
    if (imageUrl) {
      // Busca la imagen aunque se haya salido del DOM (Flow virtualiza la grilla): scroll hasta hallarla.
      target = await findResultImageScrolling(imageUrl);
      if (!target) throw new Error("no encuentro la imagen de esta escena ni haciendo scroll por la grilla (¿se borro de Flow o aun no termino de generarse?).");
    } else {
      const imgs = currentResultImgs();
      if (!imgs.length) throw new Error("no hay imagen generada para animar");
      target = imgs[imgs.length - 1];
    }
    const more = await tileMoreButton(target);
    if (!more) throw new Error("no encuentro el ⋮ de la imagen de esta escena (grilla)");
    realClick(clickable(more));
    await sleep(300);
    const animar = resolve(s.menuAnimate);
    if (!animar) throw new Error('no encuentro "Animar"/"Animate" en el menu de esta imagen');
    realClick(clickable(animar));
    await sleep(800);

    void aspectRatio; void count;
    let cost = null;
    try { cost = await selectVideoModel(model, duration); } catch (_e) {}
    const input = resolve(s.promptInput);
    if (input) {
      realClick(input);
      const okType = await typeInSlate(input, prompt, cfg);
      if (!okType) throw new Error("no pude escribir el prompt de animacion (Slate)");
      await sleep(400);
    }

    const gen = resolve(s.generateButton);
    if (!gen) throw new Error("no encuentro el boton generar para animar");
    await submitComposer(input, gen, cfg);

    // FIRE-AND-FORGET: NO esperamos NADA (ni poster ni video). En la grilla el poster/video recien
    // aparece casi al terminar, asi que esperar aqui = secuencial. Solo damos un respiro para que la
    // generacion se registre y el compositor se limpie, y volvemos -> el orquestador dispara la
    // siguiente escena de inmediato. El mapeo video<->escena se hace despues por ORDEN (MAP_NEW_VIDEOS).
    await sleep(2500);
    // Volvemos al tope: los videos nuevos salen arriba (mas nuevo primero) y MAP_NEW_VIDEOS los lee
    // del DOM; si quedaramos al fondo (por haber buscado una imagen vieja) no estarian cargados.
    try { const sc = findResultsScroller(); if (sc) sc.scrollTo({ top: 0 }); } catch (_e) {}
    return { ok: true, data: { cost } };
  }

  // Snapshot de los identificadores (name=<id>) de videos+posters ACTUALES, en orden DOM.
  function videoMediaNames() {
    const names = [];
    for (const el of [...nonBannerVideos(), ...videoPosters()]) {
      const n = mediaName(el.currentSrc || el.src);
      if (n && !names.includes(n)) names.push(n);
    }
    return names;
  }
  function videoSrcs() {
    return { ok: true, data: { srcs: videoMediaNames() } };
  }

  // DIAGNOSTICO: cuando aparecen MENOS videos que los disparados, suele ser que Flow bloqueo una
  // generacion (falso positivo de politica) y muestra un tile de ERROR con su propio "Reintentar".
  // No conocemos aun ese DOM, asi que lo CAPTURAMOS para poder mapear despues el clic exacto. Vuelca
  // tiles con texto de fallo (+ sus botones) y, por separado, botones de toda la pagina cuyo texto o
  // aria-label parezca de reintento. Best-effort, acotado en tamaño.
  function captureFailedTiles() {
    const FAIL = /(infring|no se pudo|no pudo|pol[ií]tic|policy|reintent|vuelve a intentar|int[eé]nta(lo)? de nuevo|try again|retry|rechaz|reject|bloque|block|fall[oó]|error|sensible|content)/i;
    const RETRY = /(reintent|vuelve a intentar|int[eé]nta(lo)? de nuevo|try again|retry|regenerar|regenerate)/i;
    const trim = (s) => (s || "").replace(/\s+/g, " ").trim();
    const tiles = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("div,section,article,li")) {
      const t = trim(el.innerText);
      if (!t || t.length > 300) continue;          // tiles, no contenedores enormes
      if (!FAIL.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 80) continue;  // ignora chips/labels minusculos
      const key = (el.className || "") + "|" + t.slice(0, 40);
      if (seen.has(key)) continue; seen.add(key);
      const buttons = [...el.querySelectorAll("button,[role=button]")].map((b) => ({
        text: trim(b.innerText).slice(0, 50), aria: b.getAttribute("aria-label") || null,
      }));
      tiles.push({ text: t.slice(0, 200), rect: { w: Math.round(r.width), h: Math.round(r.height) }, buttons, html: (el.outerHTML || "").slice(0, 2000) });
      if (tiles.length >= 8) break;
    }
    const retryButtons = [...document.querySelectorAll("button,[role=button]")]
      .filter((b) => visible(b) && (RETRY.test(b.innerText || "") || RETRY.test(b.getAttribute("aria-label") || "")))
      .map((b) => { const r = b.getBoundingClientRect(); return { text: trim(b.innerText).slice(0, 50), aria: b.getAttribute("aria-label") || null, x: Math.round(r.left), y: Math.round(r.top) }; })
      .slice(0, 12);
    return { url: location.href, videoCount: nonBannerVideos().length, tiles, retryButtons };
  }

  // Clica el "Reintentar" PROPIO de Flow en cada tile con error. El boton es <button> con <i>refresh</i>
  // + <span>Reintentar</span> (innerText "refresh Reintentar"); lo distinguimos de "undo Reutilizar
  // peticion" y "delete_forever Eliminar". Re-dispara la MISMA generacion en el sitio -> suele pasar a
  // la 2a (el error "actividad inusual" es anti-abuso por rafaga, no de contenido). Click TRUSTED (como
  // Generar; el sintetico no basta). Escalonado para no volver a disparar el limite de golpe.
  async function retryFailedTiles() {
    const isRetry = (b) => { const t = norm(b.innerText); return /^refresh\b/.test(t) && /(reintentar|try again)/.test(t); };
    const find = () => [...document.querySelectorAll("button")].filter((b) => visible(b) && isRetry(b));
    let clicked = 0;
    for (const b of find()) {
      try { await trustedClickEl(b); clicked++; }
      catch (_e) { try { realClick(clickable(b)); clicked++; } catch (__e) {} }
      await rsleep(5000, 12000);   // espaciado amplio: no re-disparar el "actividad inusual" de golpe
    }
    return { ok: true, data: { clicked, remaining: find().length } };
  }

  // Espera a que aparezcan `total` generaciones NUEVAS (name no presente en `before`) y devuelve sus
  // names en orden DOM (Flow suele poner lo mas nuevo primero). Best-effort: si no aparecen todas en
  // el tiempo dado, devuelve las que haya. Asi el orquestador mapea video<->escena por orden.
  async function mapNewVideos({ before, total }) {
    // Asegura el tope: los videos nuevos aparecen arriba; si la grilla quedo scrolleada no estarian en el DOM.
    try { const sc = findResultsScroller(); if (sc) sc.scrollTo({ top: 0 }); } catch (_e) {}
    const beforeSet = new Set(before || []);
    const want = total || 1;
    const hardCap = 240000;   // 4 min tope absoluto
    const stableMs = 45000;   // si no aparece uno nuevo en 45s (y ya hay >=1), devolvemos lo que haya
    const startedAt = Date.now();
    let best = [];
    let lastGrowAt = Date.now();
    while (true) {
      const stop = detectHardStop(); if (stop) return stop;
      // SOLO lectura: los videos terminados ya traen `src` (no hace falta load()). Antes
      // llamabamos v.load() en cada poll sobre videos en plena generacion -> thrash del
      // reproductor de Flow -> fuga de memoria -> la pestaña crasheaba ("Aw snap"). Quitado.
      const fresh = videoMediaNames().filter((n) => !beforeSet.has(n));
      if (fresh.length > best.length) { best = fresh; lastGrowAt = Date.now(); }
      if (fresh.length >= want) return { ok: true, data: { srcs: fresh } };
      const now = Date.now();
      // Flow puede producir MENOS videos que los disparados (limita/descarta). No colgamos:
      // si dejaron de aparecer nuevos, devolvemos los que haya y las escenas sin video -> ERROR.
      if (best.length >= 1 && now - lastGrowAt > stableMs) return { ok: true, data: { srcs: best, diag: best.length < want ? captureFailedTiles() : null } };
      if (now - startedAt > hardCap) return { ok: true, data: { srcs: best, diag: best.length < want ? captureFailedTiles() : null } };
      await sleep(3000);
    }
  }

  // RECOGE el video de una animacion ya disparada (por su src). Espera a que termine de generarse
  // (en la grilla el <video> esta lazy: width 0 hasta que se carga; lo empujamos UNA vez con load()),
  // y extrae su ultimo frame. CONFIRMADO 2026-06-14.
  async function animateCollect({ videoUrl }) {
    if (!videoUrl) throw new Error("animateCollect sin videoUrl");
    // El videoUrl puede ser el src del POSTER (capturado al disparar); el <video> comparte el
    // mismo name=<id>. Emparejamos por ese identificador.
    const wantName = mediaName(videoUrl);
    const nudged = new Set();
    const result = await waitFor(() => {
      const stop = detectHardStop(); if (stop) return stop;
      const v = nonBannerVideos().find((x) => mediaName(x.currentSrc || x.src) === wantName);
      if (!v) return null;
      if (v.videoWidth > 0 && v.duration > 0 && isFinite(v.duration)) return { video: v };
      if (!nudged.has(v.src)) { nudged.add(v.src); try { v.preload = "auto"; v.load(); } catch (_e) {} }
      return null;
    }, { timeout: 360000 });
    if (result.type) return result; // parada dura
    let lastFrameDataUrl = null;
    try { lastFrameDataUrl = await captureLastFrame(result.video); } catch (_e) {}
    return { ok: true, data: { videoUrl: result.video.currentSrc || result.video.src, lastFrameDataUrl } };
  }

  // Secuencial (no-paralelo): dispara Y espera el mismo video. Usado si parallelAnimation=false.
  // animateFire es fire-and-forget (ya NO devuelve videoUrl), asi que mapeamos el video nuevo por
  // diferencia (snapshot antes -> dispara -> aparece 1 nuevo) igual que el flujo batch, y lo recogemos.
  async function animate(args) {
    const before = videoMediaNames();
    const fired = await animateFire(args);
    if (fired.type) return fired;       // parada dura
    if (!fired.ok) return fired;        // error
    const mapped = await mapNewVideos({ before, total: 1 });
    if (mapped.type) return mapped;     // parada dura
    const src = (mapped.data?.srcs || [])[0];
    if (!src) return { ok: false, error: "no aparecio el video nuevo tras animar (¿Flow lo encolo o bloqueo?)" };
    const collected = await animateCollect({ videoUrl: src });
    if (collected.type) return collected;
    if (!collected.ok) return collected;
    return { ok: true, data: { ...collected.data, cost: fired.data.cost } };
  }

  // Devuelve la URL del ultimo video para que el BACKGROUND descargue via chrome.downloads
  // (mas fiable que clicar "Descargar", que abriria el dialogo nativo del SO). UNVERIFIED.
  async function downloadClip() {
    const vids = [...document.querySelectorAll("video[src]")];
    if (!vids.length) throw new Error("no hay video para descargar");
    const v = vids[vids.length - 1];
    return { ok: true, data: { url: v.currentSrc || v.src } };
  }

  // Modo inspector: lista candidatos del DOM actual para mapear selectores.
  function inspect() {
    const grab = (sel, label) =>
      [...document.querySelectorAll(sel)].slice(0, 30).map((e) => ({
        label,
        tag: e.tagName.toLowerCase(),
        role: e.getAttribute("role"),
        text: norm(e.innerText).slice(0, 30),
        aria: e.getAttribute("aria-label"),
        testid: e.getAttribute("data-testid"),
        cls: (e.className || "").toString().split(/\s+/).filter((c) => /flow|trigger|tab|menu/i.test(c)).join(" "),
        visible: visible(e),
      }));
    const candidates = [
      ...grab('button[role="tab"]', "tab"),
      ...grab("button", "button").filter((b) => b.visible).slice(0, 20),
      ...grab('[role="menuitem"]', "menuitem"),
      ...grab('input[type="file"]', "fileInput"),
      ...grab('[role="textbox"],[contenteditable="true"]', "textbox"),
    ];
    return { ok: true, data: { candidates, mappedAt: window.FLOW_SELECTORS_MAPPED_AT || null } };
  }

  // ------------------------------------------------- proyecto / personaje -----
  // Mapeado en vivo: Flow guarda cada personaje en /character/<id>, permite renombrarlo con
  // "Nombre del personaje" + "Hecho" y lo reutiliza por nombre desde el selector "+".

  // Crea un proyecto nuevo: clic "Nuevo proyecto" (pagina de inicio) -> Flow navega a /project/<id>.
  // El background debe dejar la pestana en la home antes de llamar esto.
  async function newProject() {
    const s = SEL();
    const btn = resolve(s.newProjectButton);
    if (!btn) throw new Error('no encuentro "Nuevo proyecto" (¿la pestana esta en la pagina de inicio de Flow?)');
    const before = location.href;
    realClick(clickable(btn));
    await waitFor(() => location.href !== before && /\/project\/[0-9a-f-]{6,}/.test(location.href), { timeout: 15000 });
    await sleep(1500);
    await ensureNormalMode();   // cierra el panel Agente y apaga el modo agente del proyecto nuevo
    return { ok: true, data: { url: location.href } };
  }

  // El input de PERSONAJE es oculto y acepta exactamente image/*. No usar el primer file input global:
  // el proyecto mantiene otro input multimedia (video+image) y antes CDP podia cargar ahi el personaje.
  function characterFileInputEl() {
    return [...document.querySelectorAll('input[type="file"]')].find((i) =>
      norm(i.getAttribute("accept") || "").toLowerCase() === "image/*",
    ) || null;
  }

  function onNewCharacterPage() {
    if (/\/character\/(?:new|create)(?:\/|$)/i.test(location.pathname)) return true;
    return [...document.querySelectorAll("h1,h2,main")].some((e) =>
      /crea y reutiliza personajes|create and reuse characters/i.test(norm(e.innerText)),
    );
  }

  function characterCards() {
    return [...document.querySelectorAll('a[href*="/character/"]')]
      .filter(visible)
      .map((a) => a.closest("button") || a);
  }

  // Navega a la seccion Caracteres del proyecto actual (SPA, sin recargar).
  async function gotoCharacters() {
    const s = SEL();
    const sec = resolve(s.charactersSection);
    if (sec) {
      realClick(clickable(sec));
      const reached = await waitFor(() => onNewCharacterPage() || resolve(s.newCharacterTile)
        || characterCards().length > 0, { timeout: 6000 }).catch(() => null);
      if (!reached) throw new Error("Flow no termino de abrir la biblioteca de Caracteres");
    }
  }

  // ¿Existe ya un Personaje con ese nombre en el proyecto? Va a Caracteres y busca el nombre exacto.
  async function hasCharacter({ name }) {
    await gotoCharacters();
    const want = (name || "").trim().toLowerCase();
    const exists = characterCards().some((card) => {
      const labels = [...[...card.querySelectorAll("img")].map((i) => norm(i.alt)),
        ...norm(card.innerText).split(/\r?\n/).map(norm)];
      return labels.some((label) => label.toLowerCase() === want);
    });
    return { ok: true, data: { exists } };
  }

  // Abre la pantalla de "Nuevo personaje" y deja el input[type=file] presente, para que el background
  // ponga la imagen via CDP (DOM.setFileInputFiles). Proyecto vacio -> Caracteres ya abre la subida;
  // con personajes -> hay que clicar el tile "Nuevo personaje".
  async function revealUploadInput() {
    const s = SEL();
    await gotoCharacters();
    if (!onNewCharacterPage() || !characterFileInputEl()) {
      const tile = resolve(s.newCharacterTile);
      if (tile) { realClick(clickable(tile)); await sleep(1500); }
    }
    const input = await waitFor(() => onNewCharacterPage() && characterFileInputEl(), { timeout: 8000 }).catch(() => null);
    if (!input) throw new Error("no aparecio el input[type=file] de personaje (Caracteres)");
    return { ok: true, data: { ready: true, accept: input.getAttribute("accept") || "" } };
  }

  // Tras subir la imagen (el background la puso via CDP), espera el editor, escribe el NOMBRE
  // (setter de React) y clica "Hecho" para guardar el personaje y volver al proyecto.
  async function createCharacter({ name }) {
    const s = SEL();
    const nameInput = await waitFor(
      () => resolve(s.characterNameInput) || document.querySelector('input[placeholder="Nombre del personaje"]'),
      { timeout: 40000 }
    );
    nameInput.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(nameInput, name || ""); else nameInput.value = name || "";
    nameInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
    nameInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(600);
    const done = resolve(s.characterDoneButton);
    if (!done) throw new Error('no encuentro el boton "Hecho" del personaje');
    const beforeUrl = location.href;
    await trustedClickEl(done, { releaseAfterClick: true });
    await waitFor(() => location.href !== beforeUrl && !/\/character\//.test(location.href), { timeout: 12000 });
    await sleep(700);
    const verified = await hasCharacter({ name });
    if (!verified?.data?.exists) throw new Error(`Flow salio del editor, pero no confirmo el personaje "${name}" en la biblioteca`);
    return { ok: true, data: { name } };
  }

  // UI actual de Flow (2026-07-19): "Subir" ya no lleva directo al editor del Character. La ruta
  // estable es reutilizar un medio que YA fue precargado y nombrado en este proyecto:
  // Nuevo personaje -> Añadir desde el proyecto -> buscar nombre exacto -> Añadir al personaje ->
  // editor /character/<id> -> nombre -> Hecho. No abre el picker nativo ni vuelve a subir bytes.
  async function createCharacterFromProjectMedia({ name, mediaName }) {
    const s = SEL();
    await gotoCharacters();
    if (!onNewCharacterPage()) {
      const tile = resolve(s.newCharacterTile);
      if (!tile) throw new Error('no encuentro "Nuevo personaje" en la biblioteca de Characters');
      realClick(clickable(tile));
      await waitFor(() => onNewCharacterPage(), { timeout: 8000 });
      await sleep(600);
    }

    const addFromProject = [...document.querySelectorAll('button,[role="button"]')].find((b) =>
      visible(b) && /a.adir desde el proyecto|add from (the )?project/i.test(norm(b.innerText)));
    if (!addFromProject) throw new Error('no encuentro "Añadir desde el proyecto" en Nuevo personaje');
    realClick(clickable(addFromProject));
    const dialog = await waitFor(() => [...document.querySelectorAll('[role="dialog"]')].find((d) =>
      visible(d) && /a.adir a la petici|add to prompt/i.test(norm(d.innerText))), { timeout: 7000 });
    const search = [...dialog.querySelectorAll('input[type="text"],input')].find((i) => visible(i)
      && /buscar recursos|search (assets|resources|media)/i.test(norm(i.getAttribute('aria-label') || i.placeholder || '')))
      || [...dialog.querySelectorAll('input')].find(visible);
    if (!search) throw new Error('no encuentro "Buscar recursos" al crear el Character');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    search.focus();
    if (setter) setter.call(search, mediaName || name || ""); else search.value = mediaName || name || "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(700);

    const want = norm(mediaName || name).toLowerCase();
    const option = await waitFor(() => [...dialog.querySelectorAll('[role="option"]')].find((o) => {
      const labels = [...[...o.querySelectorAll('img')].map((img) => norm(img.alt).toLowerCase()),
        ...norm(o.innerText).split(/\r?\n/).map((line) => norm(line).toLowerCase())];
      return visible(o) && labels.includes(want);
    }) || null, { timeout: 8000 });
    if (option.getAttribute('aria-selected') !== 'true') {
      realClick(clickable(option));
      await sleep(250);
    }
    const add = [...dialog.querySelectorAll('button,[role="button"]')].find((b) => visible(b)
      && /a.adir al personaje|add to character/i.test(norm(b.innerText)));
    if (!add || add.disabled || add.getAttribute('aria-disabled') === 'true') {
      throw new Error(`Flow encontro "${mediaName}", pero no habilito "Añadir al personaje"`);
    }
    const beforeUrl = location.href;
    await trustedClickEl(add, { releaseAfterClick: true });
    await waitFor(() => location.href !== beforeUrl && /\/character\/[0-9a-f-]+/i.test(location.href), { timeout: 30000 });
    return createCharacter({ name });
  }

  // Borra del proyecto las IMAGENES GENERADAS y los VIDEOS (no toca personajes: estos son <img>
  // alt="Huesito"/"Socrates", no <video>). Por tile: hover -> ⋮ -> "Mover a la papelera" (borra al
  // instante, sin confirmacion). Re-consulta el DOM cada vuelta (al borrar cambia). OJO: el poster
  // del video (img[alt^="Miniatura"]) esta OCULTO (rect 0x0) -> visible() lo descarta; el tile real
  // es el <video> (nonBannerVideos), que SI tiene el ⋮ "more_vert más" -> antes solo borraba imgs.
  async function cleanupMedia() {
    const s = SEL();
    const targets = () => [
      ...document.querySelectorAll('img[alt="Imagen generada"], img[alt="Generated image"]'),
      ...nonBannerVideos(),
    ].filter((e) => visible(e) && !e.hasAttribute("data-clean-skip"));
    let removed = 0;
    for (let i = 0; i < 300; i++) {
      const list = targets();
      if (!list.length) break;
      const tile = list[0];
      let more = null;
      try { more = await tileMoreButton(tile); } catch (_e) { more = null; }
      if (!more) { tile.setAttribute("data-clean-skip", "1"); continue; }   // no pude; saltar este
      realClick(clickable(more));
      await sleep(400);
      const trash = resolve(s.menuMoveToTrash);
      if (!trash) { pressEscape(); tile.setAttribute("data-clean-skip", "1"); continue; }
      realClick(clickable(trash));
      await sleep(900);
      removed++;
    }
    return { ok: true, data: { removed } };
  }

  // ----------------------------------------------------------- listener -------
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = message?.type;
    if (!type || !Object.values(ACT).includes(type)) return; // ignora lo que no es ACT.*

    (async () => {
      try {
        if (type === ACT.PING) return { ok: true, data: { pong: true, url: location.href } };
        if (type === ACT.INSPECT_DOM) return inspect();
        if (type === ACT.NEW_PROJECT) return await newProject(message);
        if (type === ACT.HAS_CHARACTER) return await hasCharacter(message);
        if (type === ACT.REVEAL_UPLOAD_INPUT) return await revealUploadInput(message);
        if (type === ACT.CREATE_CHARACTER) return await createCharacter(message);
        if (type === ACT.CREATE_CHARACTER_FROM_MEDIA) return await createCharacterFromProjectMedia(message);
        if (type === ACT.CLEANUP_MEDIA) return await cleanupMedia(message);
        if (type === ACT.PRELOAD_REFERENCES) return await preloadReferences(message);
        if (type === ACT.GENERATE_IMAGE) return await generateImage(message);
        if (type === ACT.ANIMATE) return await animate(message);
        if (type === ACT.ANIMATE_FIRE) return await animateFire(message);
        if (type === ACT.VIDEO_SRCS) return videoSrcs();
        if (type === ACT.MAP_NEW_VIDEOS) return await mapNewVideos(message);
        if (type === ACT.RETRY_FAILED_TILES) return await retryFailedTiles(message);
        if (type === ACT.ANIMATE_COLLECT) return await animateCollect(message);
        if (type === ACT.DOWNLOAD_CLIP) return await downloadClip(message);
        return { ok: false, error: `accion desconocida: ${type}` };
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    })().then(sendResponse);

    return true; // respuesta async
  });

  console.log("[flow-driver] cargado. Selectores:", window.FLOW_SELECTORS ? "ok" : "FALTAN");
})();
