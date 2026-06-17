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
    HAS_CHARACTER: "act:has_character",
    REVEAL_UPLOAD_INPUT: "act:reveal_upload_input",
    CLEANUP_MEDIA: "act:cleanup_media",
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

  // ------------------------------------------------------------------ utils ---
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Espera ALEATORIA (anti-deteccion): rompe la periodicidad de los sleep fijos. El content script no
  // puede importar jitterDelay del modulo, asi que va local.
  const rsleep = (min, max) => sleep(Math.round(min + Math.random() * Math.max(0, max - min)));
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

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
  async function trustedClickEl(el) {
    if (!el) throw new Error("trustedClickEl: nodo nulo");
    el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(200);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const resp = await chrome.runtime.sendMessage({ type: "trusted_click", x, y });
    if (!resp || !resp.ok) throw new Error("click trusted fallo: " + (resp?.error || "sin respuesta del background"));
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

  // Escribe en el editor Slate. CONFIRMADO: Slate IGNORA execCommand/mutaciones directas del
  // DOM; SOLO registra texto via eventos `beforeinput`. A veces no "pega" (foco/timing), asi que
  // verificamos y reintentamos. Devuelve true si el texto quedo escrito.
  async function typeInSlate(el, text) {
    for (let attempt = 0; attempt < 3; attempt++) {
      el.focus();
      placeCaretEnd(el);
      // Limpia lo que haya (Slate borra en su caret). Acotado; se detiene al quedar vacio.
      for (let i = 0; i < 220; i++) {
        const cur = norm(el.innerText);
        if (!cur || /^¿Qu/.test(cur)) break; // vacio o placeholder "¿Qué quieres crear?"
        el.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true }));
      }
      // TIPEO HUMANO: en fragmentos de 2-5 chars con jitter (no de golpe = firma de bot). Slate SOLO
      // registra via beforeinput; un evento por fragmento simula pulsaciones. Pausa extra cada ~40 chars.
      let typed = 0;
      for (let i = 0; i < text.length;) {
        const n = 2 + Math.floor(Math.random() * 4); // 2..5
        const chunk = text.slice(i, i + n);
        el.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: chunk, bubbles: true, cancelable: true }));
        i += chunk.length; typed += chunk.length;
        await rsleep(40, 140);
        if (typed % 40 < n) await rsleep(200, 500); // micro-pausa de "pensar"
      }
      await sleep(300);
      if (norm(el.innerText).includes(text.slice(0, Math.min(12, text.length)))) return true; // exito
      await rsleep(250, 500);
    }
    return false;
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
    const findAgent = () => [...document.querySelectorAll("button")].find((b) => norm(b.innerText) === "Agente");
    if (!findAgent()) {
      const close = [...document.querySelectorAll("button")]
        .find((b) => /^(cerrar|close)$/i.test((b.getAttribute("aria-label") || "").trim()));
      if (close) {
        realClick(clickable(close));
        await sleep(1000);
        if (!findAgent()) { try { await trustedClickEl(close); await sleep(1000); } catch (_e) {} }
      }
    }
    const agent = findAgent();
    if (agent && agent.getAttribute("aria-pressed") === "true") {
      try { await trustedClickEl(agent); } catch (_e) { realClick(agent); }
      await sleep(900);
    }
  }

  // ---------------------------------------------------- compositor / ajustes ---
  // Abre el popover de ajustes y fija modo (image|video[+frames]), aspect y conteo.
  async function configureComposer({ mode, aspectRatio, count }) {
    const s = SEL();
    await ensureNormalMode();   // cierra panel Agente + apaga modo agente -> compositor normal
    const chip = resolve(s.modelSettingsChip);
    if (!chip) throw new Error("no encuentro el chip de ajustes (modelSettingsChip)");
    realClick(clickable(chip));
    await waitFor(() => resolve(s.imageModeTab) || resolve(s.videoModeTab), { timeout: 5000 });

    if (mode === "image") {
      const t = resolve(s.imageModeTab);
      if (t) realClick(clickable(t));
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
  function currentResultImgs() {
    return [...document.querySelectorAll('img[alt="Imagen generada"], img[alt="Generated image"], img[src*="getMediaUrlRedirect"]')];
  }

  // --------------------------------------------------------- referencias ------
  // Imagenes del proyecto en la grilla (generadas o subidas). Multi-idioma.
  function allProjectImgs() {
    return [...document.querySelectorAll('img[alt="Imagen generada"], img[alt="Generated image"], img[alt^="Un contenido multimedia"], img[alt^="A media"], img[src*="getMediaUrlRedirect"]')];
  }

  // Hay al menos un chip de referencia adjunto en el compositor (CONFIRMADO).
  function referenceChipPresent() {
    return !!resolve(SEL().referenceChip);
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

  // Adjunta una imagen YA presente en el proyecto como referencia: hover su tile ->
  // ⋮ -> "Añadir a la petición" -> espera el chip en el compositor. CONFIRMADO 2026-06-14.
  async function attachTileToPrompt(tileImg) {
    const s = SEL();
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
    await waitFor(() => referenceChipPresent(), { timeout: 5000 });
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
    // 1) Abre el selector de recursos con el "+" del compositor.
    const plus = resolve(s.openMediaDialogButton);
    if (!plus) throw new Error('no encuentro el boton "+" del compositor (openMediaDialogButton)');
    realClick(clickable(plus));
    await sleep(900);

    // 2) Localiza el CONTENEDOR del selector (no por coordenadas: la ventana del usuario puede ser
    //    muy ancha). El selector contiene el BUSCADOR y el boton CTA; su ancestro comun = el panel.
    const findSearch = () => [...document.querySelectorAll("input")]
      .filter((i) => visible(i) && i.getBoundingClientRect().top > 60)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
    let search = findSearch();
    const cta0 = resolve(s.addToPromptButton);
    let pickerRoot = cta0 ? cta0.closest('[role="dialog"]') : null;
    if (!pickerRoot && search && cta0) {
      let n = search;
      while (n && n !== document.body) { if (n.contains(cta0)) { pickerRoot = n; break; } n = n.parentElement; }
    }
    if (!pickerRoot) pickerRoot = (search && search.closest('[role="dialog"]')) || null;
    if (!pickerRoot) throw new Error('no encuentro el panel del selector "+" (¿abrio el selector de recursos?)');

    // 3) Filtra por nombre en el buscador (best-effort; aunque no filtre, igual buscamos por nombre).
    if (characterName && search) {
      search.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(search, characterName); else search.value = characterName;
      search.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(900);
    }

    // 4) Elige el resultado DENTRO del panel: preferir el PERSONAJE (texto "Personaje"/"Carácter"/
    //    "Character"); si no, lo que no sea la imagen ".png". Menor area = elemento mas especifico.
    const nameLc = (characterName || "").toLowerCase();
    const result = await waitFor(() => {
      const rows = [...pickerRoot.querySelectorAll('[role="option"],[role="menuitem"],li,button,div,span')]
        .filter((e) => {
          const t = norm(e.innerText);
          return visible(e) && t.length > 0 && t.length < 30 && (!nameLc || t.toLowerCase().includes(nameLc));
        });
      if (!rows.length) return null;
      // El PERSONAJE: contiene "Personaje"/"Carácter"/"Character" y NO la palabra imagen/.png (eso
      // excluye los contenedores que juntan ambos resultados "Huesito.png Imagen Huesito Personaje").
      const charRows = rows.filter((e) => { const t = norm(e.innerText); return /personaje|car[aá]cter|character/i.test(t) && !/\.png|imagen|image/i.test(t); });
      const noImg = rows.filter((e) => !/\.png|imagen|image/i.test(norm(e.innerText)));
      const pool = charRows.length ? charRows : (noImg.length ? noImg : rows);
      return pool.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (ra.width * ra.height) - (rb.width * rb.height);
      })[0];
    }, { timeout: 5000 }).catch(() => null);
    if (!result) throw new Error(`no encuentro el personaje "${characterName || ""}" en el selector "+" (¿esta creado en ESTE proyecto con ese nombre?)`);
    realClick(clickable(result));
    await sleep(700);

    // 4) CTA del selector: "Agregar a la instrucción" / "Añadir a la petición" / "Add to prompt".
    const addBtn = resolve(s.addToPromptButton);
    if (!addBtn) throw new Error('no encuentro "Agregar a la instrucción"/"Add to prompt" en el selector');
    realClick(clickable(addBtn));
    await waitFor(() => referenceChipPresent(), { timeout: 6000 });
  }

  // ------------------------------------------------------------- acciones -----
  async function generateImage({ prompt, characterNames, sceneRefImageUrls, useCharacterRef, characterName, aspectRatio, count }) {
    const s = SEL();
    const hs = detectHardStop(); if (hs) return hs;

    await configureComposer({ mode: "image", aspectRatio, count: count || 1 });

    // ORDEN: primero el prompt, DESPUES las referencias. typeInSlate BORRA el editor antes de escribir,
    // asi que si adjuntaramos antes, borrariamos sus menciones/chips. Adjuntar al final deja el
    // prompt limpio + las menciones/chips de personaje(s) y de escena(s) previa(s).
    const input = resolve(s.promptInput);
    if (!input) throw new Error("no encuentro el editor de prompt (promptInput)");
    realClick(input);
    const okType = await typeInSlate(input, prompt);
    if (!okType) throw new Error("no pude escribir el prompt en el editor (Slate)");
    await sleep(300);

    // PERSONAJES: lista de nombres (Personaje de Flow). Cada uno se adjunta via el selector "+".
    // (El usuario crea cada Personaje una vez por proyecto; subir un archivo por script es imposible.)
    // Compat: si llega useCharacterRef+characterName (esquema viejo), se trata como [characterName].
    const names = (Array.isArray(characterNames) && characterNames.length)
      ? characterNames
      : (useCharacterRef && characterName ? [characterName] : []);
    for (const name of names) {
      try { await attachCharacterReference(name); await sleep(300); }
      catch (e) { return { ok: false, error: `referencia personaje "${name}": ${e.message}` }; }
    }

    // ESCENAS PREVIAS: imagenes YA en el proyecto -> su ⋮ -> "Añadir a la peticion" (attachTileToPrompt).
    // Se ubican por su media-name (name=<id>) ya que las imagenes generadas no tienen nombre visible.
    const sceneUrls = Array.isArray(sceneRefImageUrls) ? sceneRefImageUrls.filter(Boolean) : [];
    for (const url of sceneUrls) {
      try {
        // Busca la imagen de la escena previa haciendo scroll (puede haberse salido del DOM).
        const tile = await findResultImageScrolling(url, allProjectImgs);
        if (!tile) throw new Error("la imagen de la escena referenciada no aparece ni con scroll (¿se genero antes?)");
        await attachTileToPrompt(tile);
        await sleep(300);
      } catch (e) { return { ok: false, error: `referencia escena: ${e.message}` }; }
    }
    await sleep(400);

    // Tras adjuntar referencias (que pudieron hacer scroll), volvemos arriba: la imagen NUEVA aparece
    // al tope y la deteccion before/after la lee del DOM; si quedaramos abajo no la veriamos.
    try { const sc = findResultsScroller(); if (sc) sc.scrollTo({ top: 0 }); await sleep(300); } catch (_e) {}
    const before = new Set(currentResultImgs().map((i) => i.src));
    const gen = resolve(s.generateButton);
    if (!gen) throw new Error("no encuentro el boton generar (generateButton)");
    await rsleep(1200, 3500);   // pausa humana de "revisar" antes de generar (anti-deteccion)
    await trustedClickEl(gen);

    // Espera el nuevo resultado o una parada dura.
    const result = await waitFor(() => {
      const stop = detectHardStop(); if (stop) return stop;
      const fresh = currentResultImgs().filter((i) => i.naturalWidth > 0 && !before.has(i.src));
      return fresh.length ? { img: fresh[fresh.length - 1] } : null;
    }, { timeout: 180000 });

    if (result.type) return result; // parada dura
    return { ok: true, data: { imageUrl: result.img.src } };
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
    const match = () => pool().find((i) => i.src === imageUrl || mediaName(i.src) === want);
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
  async function animateFire({ prompt, aspectRatio, count, imageUrl, model, duration }) {
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
      const okType = await typeInSlate(input, prompt);
      if (!okType) throw new Error("no pude escribir el prompt de animacion (Slate)");
      await sleep(400);
    }

    const gen = resolve(s.generateButton);
    if (!gen) throw new Error("no encuentro el boton generar para animar");
    await rsleep(1200, 3500);   // pausa humana de "revisar" antes de animar (anti-deteccion)
    await trustedClickEl(gen);

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
  async function animate(args) {
    const fired = await animateFire(args);
    if (fired.type) return fired;       // parada dura
    if (!fired.ok) return fired;        // error
    const collected = await animateCollect({ videoUrl: fired.data.videoUrl });
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
  // PENDIENTE DE MAPEAR EN VIVO (sesion con Flow abierto + modo inspector): la UI de
  // "nuevo proyecto" y "crear Personaje" de Flow no esta mapeada. Hasta entonces estos
  // devuelven no-implementado y el autopiloto degrada (usa el proyecto/personaje ya hechos).

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

  // El input[type=file] de subida es OCULTO -> resolve() (que exige visible) no lo ve; lo tomamos directo.
  function fileInputEl() {
    return document.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"]');
  }

  // Navega a la seccion Caracteres del proyecto actual (SPA, sin recargar).
  async function gotoCharacters() {
    const s = SEL();
    const sec = resolve(s.charactersSection);
    if (sec) { realClick(clickable(sec)); await sleep(1500); }
  }

  // ¿Existe ya un Personaje con ese nombre en el proyecto? Va a Caracteres y busca el nombre exacto.
  async function hasCharacter({ name }) {
    await gotoCharacters();
    const want = (name || "").trim().toLowerCase();
    const exists = [...document.querySelectorAll("span,div,p,h3")].some((e) => {
      if (e.childNodes.length !== 1 || e.firstChild?.nodeType !== 3) return false;
      return (e.innerText || "").trim().toLowerCase() === want;
    });
    return { ok: true, data: { exists } };
  }

  // Abre la pantalla de "Nuevo personaje" y deja el input[type=file] presente, para que el background
  // ponga la imagen via CDP (DOM.setFileInputFiles). Proyecto vacio -> Caracteres ya abre la subida;
  // con personajes -> hay que clicar el tile "Nuevo personaje".
  async function revealUploadInput() {
    const s = SEL();
    await gotoCharacters();
    if (!fileInputEl()) {
      const tile = resolve(s.newCharacterTile);
      if (tile) { realClick(clickable(tile)); await sleep(1500); }
    }
    const input = await waitFor(() => fileInputEl(), { timeout: 8000 }).catch(() => null);
    if (!input) throw new Error("no aparecio el input[type=file] de personaje (Caracteres)");
    return { ok: true, data: { ready: true } };
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
    realClick(clickable(done));
    await waitFor(() => !/\/character\//.test(location.href), { timeout: 8000 }).catch(() => {});
    await sleep(1000);
    return { ok: true, data: { name } };
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
        if (type === ACT.CLEANUP_MEDIA) return await cleanupMedia(message);
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
