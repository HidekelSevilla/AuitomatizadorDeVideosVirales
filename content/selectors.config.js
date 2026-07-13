// content/selectors.config.js
// Selectores REALES de Google Flow (labs.google/fx/tools/flow), mapeados contra el
// DOM en vivo el 2026-06-14. NO es un ES module: script plano que define
// window.FLOW_SELECTORS para que flow-driver.js lo lea.
//
// Realidad del sitio: los controles NO tienen aria-label ni data-testid estables.
// Solo hay TEXTO VISIBLE (icono Material Symbol + etiqueta) y clases minificadas
// (sc-xxxx). El unico fragmento de clase semantico observado es
// "flow_tab_slider_trigger" (todas las pestanas: modo, aspect, conteo, sub-modos).
// Por eso la estrategia principal aqui es POR TEXTO.
//
// Estrategias soportadas (las interpreta resolveSelector() en flow-driver.js):
//   { by:"css",       value:"<sel>" }                  -> querySelector(value), primer visible
//   { by:"role",      value:"<role>", text?:"<t>" }    -> [role=value], opcional innerText incluye t
//   { by:"tab",       text:"<t>" }                     -> button[role=tab].flow_tab_slider_trigger cuyo innerText INCLUYE t
//   { by:"text",      value:"<t>", tag?:"button" }     -> elemento (tag opcional) cuyo innerText INCLUYE t
//   { by:"textExact", value:"<t>", tag?:"button" }     -> innerText === t (trim)
// El driver prueba las estrategias en orden y se queda con el primer nodo VISIBLE.
//
// IMPORTANTE: las clases "sc-..." cambian en cada deploy de Flow; las dejamos solo
// como ultimo recurso. Si algo se rompe, re-mapear con el modo Inspector.

window.FLOW_SELECTORS = {
  // ===========================================================================
  // CONFIRMADO contra el DOM real
  // ===========================================================================

  // Editor de prompt. OJO: es un editor Slate (contenteditable), NO un <textarea>.
  // El driver debe escribir con insertText/beforeinput o pegar, no asignar .value.
  promptInput: [
    { by: "css", value: '[data-slate-editor="true"][role="textbox"]' },
    { by: "css", value: '[contenteditable="true"][role="textbox"]' },
    { by: "role", value: "textbox" },
  ],
  promptInputType: "slate",          // pista para flow-driver: usar insertText, no .value

  // Boton "+" del compositor: abre la biblioteca de recursos (para subir/elegir refs).
  // innerText real: "add_2\nCrear" (icono add_2). aria-haspopup="dialog".
  openMediaDialogButton: [
    { by: "css", value: 'button[aria-haspopup="dialog"]' },  // distingue el "+" del compositor
    { by: "text", value: "add_2", tag: "button" },
  ],

  // Dentro del dialogo de recursos: dispara la subida (revela el input file).
  uploadMediaButton: [
    { by: "text", value: "Subir archivos multimedia" },
  ],

  // Input file de subida de imagenes (character_ref / prev_frame). Oculto; SOLO
  // existe cuando el dialogo de recursos esta abierto. Es image/*, multiple.
  // El driver lo llena con DataTransfer + evento 'change' (no abre el picker nativo).
  attachFileInput: [
    { by: "css", value: 'input[type="file"][accept*="image"]' },
    { by: "css", value: 'input[type="file"]' },
  ],

  // Boton de envio/generar del compositor (la flecha ->). innerText: "arrow_forward\nCrear".
  generateButton: [
    { by: "text", value: "arrow_forward", tag: "button" },
  ],

  // Chip que abre el popover de ajustes (modo/aspect/conteo/modelo).
  // innerText cambia segun estado: "🍌 Nano Banana Pro\ncrop_9_16\nx2" o "Veo 3.1 - Fast...".
  modelSettingsChip: [
    { by: "text", value: "Nano Banana", tag: "button" },
    { by: "text", value: "Veo", tag: "button" },
    // Fallback robusto: el chip SIEMPRE lleva el icono de aspecto (p.ej. proyecto nuevo
    // arranca en "Vídeo crop_9_16 1x", sin "Veo"/"Nano Banana"). Antes de abrir el popover
    // solo el chip tiene este texto (los tabs de aspecto aparecen DESPUES de abrirlo).
    { by: "text", value: "crop_9_16", tag: "button" },
    { by: "text", value: "crop_16_9", tag: "button" },
  ],

  // --- Pestanas dentro del popover de ajustes (todas flow_tab_slider_trigger) ---
  // El icono de Material (image/play_circle/crop_free/chrome_extension) va en el texto del tab
  // y es IGUAL en ES/EN -> primario; texto ES/EN de respaldo.
  imageModeTab:   [{ by: "tab", text: "image" }, { by: "tab", text: "Imagen" }, { by: "tab", text: "Image" }],
  videoModeTab:   [{ by: "tab", text: "play_circle" }, { by: "tab", text: "Vídeo" }, { by: "tab", text: "Video" }],
  framesSubTab:   [{ by: "tab", text: "crop_free" }, { by: "tab", text: "Fotogramas" }, { by: "tab", text: "Frames" }],
  ingredientsSubTab: [{ by: "tab", text: "chrome_extension" }, { by: "tab", text: "Ingredientes" }, { by: "tab", text: "Ingredients" }],

  // Aspect ratio: pasar el valor al construir (p.ej. "9:16"). Aqui los conocidos.
  aspect_9_16: [{ by: "tab", text: "9:16" }],             // "crop_9_16\n9:16"
  aspect_16_9: [{ by: "tab", text: "16:9" }],
  aspect_1_1:  [{ by: "tab", text: "1:1" }],
  aspect_3_4:  [{ by: "tab", text: "3:4" }],
  aspect_4_3:  [{ by: "tab", text: "4:3" }],

  // Conteo de variaciones por generacion (innerText exacto).
  count_1x: [{ by: "textExact", value: "1x", tag: "button" }],
  count_2x: [{ by: "textExact", value: "x2", tag: "button" }],
  count_3x: [{ by: "textExact", value: "x3", tag: "button" }],
  count_4x: [{ by: "textExact", value: "x4", tag: "button" }],

  // Dropdown de modelo dentro del popover. innerText: "<modelo>\narrow_drop_down".
  modelDropdown: [
    { by: "text", value: "arrow_drop_down", tag: "button" },
  ],

  // Texto del costo: "La generación consumirá N puntos". Util para leer el costo
  // antes de generar y para detectar 0 puntos (imagen) vs N (video).
  creditCostText: [
    { by: "text", value: "consumirá" },    // ES ("La generación consumirá N puntos")
    { by: "text", value: "will use" },     // EN aprox
    { by: "text", value: "credits" },      // EN aprox
  ],

  // ===========================================================================
  // CONFIRMADO en corrida real (generacion de imagen, 0 puntos, 2026-06-14)
  // ===========================================================================

  // Imagen generada (resultado). CONFIRMADO: <img alt="Imagen generada">, src desde
  // labs.google/fx/api/trpc/media.getMediaUrlRedirect..., dimensiones reales 768x1376 (9:16).
  // Su PRESENCIA en la grilla = generacion completada (no hay spinner observable aparte).
  resultImage: [
    { by: "css", value: 'img[alt="Imagen generada"]' },             // ES
    { by: "css", value: 'img[alt="Generated image"]' },             // EN
    { by: "css", value: 'img[src*="getMediaUrlRedirect"]' },        // agnostico al idioma (URL de media de Flow)
  ],
  // CONFIRMADO 2026-06-14 (corrida real, Veo 3.1 Lite): <video src> con URL https real
  // (media.getMediaUrlRedirect?name=<id>). El <video> aparece a ~29% (videoWidth=0) y se
  // completa con videoWidth>0 (720x1280, 8s, readyState 4). Poster = img[alt="Miniatura del vídeo"].
  resultVideo: [
    { by: "css", value: "video[src]" },
    { by: "css", value: 'img[alt="Miniatura del vídeo"]' },
  ],
  // Indicador de completado = aparicion del resultImage. El driver espera (MutationObserver)
  // a que exista img[alt="Imagen generada"] con naturalWidth>0.
  completedIndicator: [
    { by: "css", value: 'img[alt="Imagen generada"]' },
  ],

  // Menu contextual del tile. Se abre con el boton ⋮ ("Más") que aparece al HOVER sobre el
  // tile (3 botones: favorito, intercambiar, y ⋮). El menu es [role="menu"] / [role="menuitem"]
  // con texto "icono etiqueta" (p.ej. "download Descargar").
  resultTileMoreButton: [
    { by: "text", value: "more_vert", tag: "button" },     // ⋮ ; tooltip "Más"
  ],
  // Multi-idioma: el ICONO de Material va en el innerText y es IGUAL en ES/EN -> selector primario.
  menuAnimate: [
    { by: "text", value: "motion_blur" },          // icono (multi-idioma)
    { by: "text", value: "Animar" },               // ES
    { by: "text", value: "Animate" },              // EN
  ],
  menuAddToPrompt: [
    { by: "text", value: "Añadir a la petición" }, // ES
    { by: "text", value: "Add to prompt" },        // EN
    { by: "text", value: "Add to your prompt" },   // EN alt
  ],
  downloadButton: [
    { by: "text", value: "download" },             // icono (multi-idioma)
    { by: "text", value: "Descargar" },            // ES
    { by: "text", value: "Download" },             // EN
  ],

  // Boton CTA del SELECTOR "@" para meter un Personaje/medio al prompt. CONFIRMADO 2026-06-14:
  // el texto varia por locale ("Agregar a la instrucción" / "Añadir a la petición" / EN).
  addToPromptButton: [
    { by: "text", value: "Agregar a la instrucción", tag: "button" },
    { by: "text", value: "Añadir a la petición", tag: "button" },
    { by: "text", value: "Agregar a la petición", tag: "button" },
    { by: "text", value: "Add to prompt", tag: "button" },
    { by: "text", value: "Add to instruction", tag: "button" },
  ],
  menuMoveToTrash: [
    { by: "text", value: "Mover a la papelera" },  // ES
    { by: "text", value: "Move to trash" },        // EN
  ],

  // Chip de referencia adjunta en el compositor (CONFIRMADO 2026-06-14). Su presencia =
  // hay una imagen adjunta para el proximo prompt. Para adjuntar: ⋮ del tile -> menuAddToPrompt.
  // NOTA: subir un archivo externo via DataTransfer dio "error" con una imagen sintetica de
  // prueba; con una imagen real deberia persistir. Si la subida automatica falla, el usuario
  // puede arrastrar/crear el personaje en Flow una vez y el driver solo lo adjunta con ⋮.
  referenceChip: [
    { by: "css", value: 'img[alt^="Un contenido multimedia"]' },          // chip ref IMAGEN (ES)
    { by: "css", value: 'img[alt^="A media"]' },                           // chip ref IMAGEN (EN, aprox)
    { by: "css", value: 'img[alt="Imagen de referencia del personaje"]' }, // chip ref PERSONAJE (ES)
    { by: "css", value: 'img[alt="Character reference image"]' },          // chip ref PERSONAJE (EN, aprox)
  ],

  // Navegacion del sidebar del proyecto (CONFIRMADO 2026-06-14).
  // OJO: NO son <button>; son <div>/<span> clickables (cursor:pointer). Sin tag -> el
  // driver matchea el texto y clickable() sube al ancestro con cursor:pointer.
  // Multi-idioma: el ICONO de Material va en el innerText y NO cambia con el idioma -> primario.
  charactersSection: [
    { by: "text", value: "accessibility_new" },    // icono (multi-idioma)
    { by: "text", value: "Caracteres" },           // ES
    { by: "text", value: "Characters" },           // EN
  ],
  uploadsSection: [
    { by: "text", value: "Subidas" },              // ES
    { by: "text", value: "Uploads" },              // EN
  ],
  allContentSection: [
    { by: "text", value: "dashboard" },            // icono de "Todo el contenido" (multi-idioma)
    { by: "text", value: "Todo el contenido" },    // ES
    { by: "text", value: "All content" },          // EN
    { by: "text", value: "All media" },            // EN alt
  ],

  // --- CREAR PROYECTO / PERSONAJE (mapeado en vivo 2026-06-15) ---
  // "Nuevo proyecto": boton en la pagina de inicio de Flow. Al clicarlo crea el proyecto y navega
  // a /project/<id>. innerText real: "add_2 Nuevo proyecto".
  newProjectButton: [
    { by: "text", value: "Nuevo proyecto", tag: "button" },  // ES
    { by: "text", value: "New project", tag: "button" },     // EN
  ],
  // Tile "+ Nuevo personaje" dentro de Caracteres cuando YA hay personajes (DIV clickable,
  // innerText "add Nuevo personaje"). En proyecto vacio, Caracteres abre directo la pantalla de subir.
  newCharacterTile: [
    { by: "text", value: "Nuevo personaje" },      // ES
    { by: "text", value: "New character" },        // EN
  ],
  // Campo de nombre del personaje en el editor (/character/<id>). input con placeholder.
  // Se escribe con el setter nativo de React (probado), no con .value directo.
  characterNameInput: [
    { by: "css", value: 'input[placeholder="Nombre del personaje"]' },  // ES
    { by: "css", value: 'input[placeholder="Character name"]' },        // EN
  ],
  // Boton "Hecho" (arriba der.) que guarda el personaje y vuelve al proyecto.
  characterDoneButton: [
    { by: "textExact", value: "Hecho", tag: "button" },  // ES
    { by: "textExact", value: "Done", tag: "button" },   // EN
    { by: "textExact", value: "Listo", tag: "button" },  // ES alt
  ],

  // PERSONAJE DE REFERENCIA: el background sube el archivo local al input oculto mediante CDP,
  // Flow lo guarda UNA vez en la memoria "Caracteres" del proyecto y el driver lo REUTILIZA
  // "Subidas" via ⋮ -> "Añadir a la petición" en cada escena. CONFIRMADO 2026-06-14:
  // la imagen subida ("descarga (1).png") aparece en Subidas con su ⋮ y "Añadir a la petición".

  // RUTA DE INGREDIENTES (revisada con datos reales): para usar una imagen YA en el proyecto
  // (p.ej. prev_frame) como referencia, NO hace falta re-subir: abrir su menu ⋮ ->
  // "Añadir a la petición". Para character_ref (archivo local) subir una vez (DataTransfer ->
  // input.files -> change; aceptar consentDialog la 1a vez) y luego "Añadir a la petición".
  // ANIMAR (revisado): menu ⋮ -> "Animar" abre el flujo de video con la imagen como frame.
  // [Sub-flujo de Animar y comportamiento exacto de Descargar: CONFIRMAR en corrida de video.]

  // ===========================================================================
  // PARADAS DURAS
  // ===========================================================================

  // Captcha: la pagina SIEMPRE tiene un <textarea id="g-recaptcha-response"> (reCAPTCHA
  // invisible) -> su presencia NO basta. Detectar el reto VISIBLE (iframe de desafio).
  captchaIndicator: [
    { by: "css", value: 'iframe[title*="recaptcha" i]' },  // el iframe de challenge visible
    { by: "css", value: 'iframe[src*="recaptcha/api2/bframe"]' },
    { by: "text", value: "Verifica que eres" },            // ES
    { by: "text", value: "Verify you" },                   // EN aprox
  ],

  // Sin creditos. TODO: confirmar el texto exacto cuando ocurra. Senal fiable: el
  // boton Crear deshabilitado + un aviso de limite/puntos insuficientes.
  noCreditsIndicator: [
    { by: "text", value: "Sin puntos" },                   // ES, SIN CONFIRMAR
    { by: "text", value: "puntos insuficientes" },         // ES, SIN CONFIRMAR
    { by: "text", value: "Has alcanzado" },                // ES, SIN CONFIRMAR
    { by: "text", value: "out of credits" },               // EN, SIN CONFIRMAR
    { by: "text", value: "not enough" },                   // EN, SIN CONFIRMAR
    { by: "text", value: "run out" },                      // EN, SIN CONFIRMAR
  ],

  // Dialogo legal "Aviso" (CONFIRMADO): aparece en la PRIMERA subida de imagen de la
  // cuenta ("Asegurate de tener los derechos necesarios..."). Aceptar un consentimiento
  // legal NO se automatiza a la ligera: el driver debe DETECTARLO y PARAR/avisar al
  // usuario en el panel (parada blanda), salvo que el usuario ya lo haya aceptado una
  // vez de forma manual (es por cuenta, una sola vez).
  consentDialog: [
    { by: "css", value: '[role="dialog"]' },               // CONFIRMADO: heading "Aviso" (agnostico)
    { by: "text", value: "derechos necesarios" },          // ES
    { by: "text", value: "necessary rights" },             // EN aprox
  ],
  consentAcceptButton: [
    { by: "textExact", value: "Acepto", tag: "button" },   // ES
    { by: "textExact", value: "I accept", tag: "button" }, // EN aprox
    { by: "textExact", value: "Accept", tag: "button" },   // EN aprox
  ],
  consentCancelButton: [
    { by: "textExact", value: "Cancelar", tag: "button" }, // ES
    { by: "textExact", value: "Cancel", tag: "button" },   // EN
  ],
};

// Secuencias de alto nivel (documentacion para flow-driver.js; el driver real las implementa):
//
// GENERAR IMAGEN (Nano Banana, 0 puntos):
//   1. click modelSettingsChip -> popover
//   2. click imageModeTab; click aspect_9_16 (o el del JSON); elegir modelo en modelDropdown si != Nano Banana Pro
//   3. cerrar popover (Escape)
//   4. (ingredientes) click openMediaDialogButton -> uploadMediaButton -> attachFileInput (DataTransfer)
//      -> seleccionar las imagenes subidas como referencia [PASO A CONFIRMAR en corrida real]
//   5. escribir prompt en promptInput (Slate: insertText)
//   6. click generateButton; esperar completedIndicator (MutationObserver + timeout)
//
// ANIMAR (Veo, frame-to-video, ~40 puntos):
//   1. click modelSettingsChip -> popover
//   2. click videoModeTab -> click framesSubTab; aspect; modelo "Veo 3.1 - Fast" en modelDropdown
//   3. cargar la imagen generada como primer frame [PASO A CONFIRMAR en corrida real]
//   4. escribir animation.prompt; click generateButton; esperar completado
//   5. descargar (downloadButton) [A CONFIRMAR]
// Notas de automatizacion (CONFIRMADAS en vivo el 2026-06-14):
//  - Los controles tipo pestana (.flow_tab_slider_trigger) NO responden a un
//    element.click() programatico (React ignora el click sintetico). El driver debe
//    despachar una secuencia de PUNTERO real: pointerdown -> mousedown -> mouseup ->
//    click (con pointerId, bubbles) sobre el nodo.
//  - Subir referencia: crear File desde dataURL -> DataTransfer -> input.files ->
//    dispatchEvent(new Event('change',{bubbles:true})). Flow lo procesa correctamente.
//    La PRIMERA subida dispara consentDialog "Aviso" (ver arriba).
//  - El prompt es Slate (contenteditable): escribir con insertText/beforeinput o pegar.
//  - Costo: imagen (Nano Banana Pro) = 0 puntos; video (Veo 3.1 Fast) 1x = 20, x2 = 40.
window.FLOW_SELECTORS_MAPPED_AT = "2026-06-14";
