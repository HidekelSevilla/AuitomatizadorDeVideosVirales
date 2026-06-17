# Contrato interno de modulos (fase andamiaje)

Fuente de verdad de mensajeria/estado: `lib/messaging.js`. **No redefinas** esas constantes; impórtalas.
Todos los modulos JS (excepto content scripts) son **ES modules** (`import`/`export`).
Esquema JSON de entrada: ver `examples/qpasaria_esqueleto_schema_v1.json`.

Plataforma: Windows. No uses APIs de Node en codigo de extension (no `fs`, no `path`).
Las funciones PURAS de `lib/` deben poder importarse desde Node para tests (sin tocar `chrome.*`).

---

## lib/json-loader.js  (modulo B)

```js
// Valida y normaliza el JSON crudo al modelo interno. PURO (no chrome.*).
export function parseProject(rawJson) // -> { ok: true, project, scenes } | { ok: false, errors: string[] }
```

- `project`: `{ title, aspectRatio, characterRef: null }` (toma `project.aspect_ratio`).
- `scenes`: array de `SceneState` (ver forma en `lib/messaging.js`) con `status: SCENE_STATUS.PENDING`,
  `attempts: 0`, `error: null`, `clipFilename: null`, `lastFrameFilename: null`.
- Mapea: `image.prompt`->imagePrompt, `image.ingredients`->imageIngredients, `image.model`->imageModel,
  `animation.prompt`->animationPrompt, `animation.model`->animationModel, `continuity_from`->continuityFrom.
- Valida: existe `scenes` no vacio; cada escena tiene `id` unico, `image.prompt`, `animation.prompt`.
  Ingredientes solo pueden ser `INGREDIENT.CHARACTER_REF` o `INGREDIENT.PREV_FRAME` (warn, no error, si hay otros).
- Ignora `hook`, `narration`, `caption_style`, `assembly`.

## lib/queue.js  (modulo B)  — PURO, node-testable

```js
// Resuelve los tokens de ingredientes de UNA escena a nombres de archivo concretos.
export function resolveIngredients(scene, prevSceneId, characterRefName)
// -> { refs: string[], missing: string[] }
//   character_ref -> characterRefName (o "missing" si null)
//   prev_frame    -> `${prevSceneId}_lastframe.png`  (se OMITE sin error si prevSceneId == null)

// Plan ordenado de acciones de UNA escena (para dry-run y para el orquestador real).
export function planScene(scene, prevSceneId, characterRefName)
// -> Step[] donde Step = { action, label, detail }
//   acciones en orden: "resolve_ingredients", "generate_image", "animate", "download", "extract_frame"
//   download.detail incluye clipFilename = `${scene.id}.mp4`
//   extract_frame.detail incluye lastFrameFilename = `${scene.id}_lastframe.png`

// Plan completo del proyecto: encadena prev_frame escena a escena.
export function dryRunPlan(scenes, characterRefName)
// -> [{ sceneId, steps: Step[] }]  (escena 1 sin prev_frame; escena N usa scene[N-1].id)

// Avanza el indice de la cola saltando escenas DONE. Devuelve el indice de la
// siguiente escena ejecutable o -1 si no hay mas.
export function nextSceneIndex(scenes, fromIndex)
```

`queue.js` y `json-loader.js` **no** importan `chrome`. Solo `lib/messaging.js`.

## background/service-worker.js  (modulo D)  — orquestador

- ES module. Importa de `lib/messaging.js`, `lib/json-loader.js`, `lib/queue.js`.
- Abre el side panel al click del action icon (`chrome.sidePanel`).
- Mantiene `AppState` en `chrome.storage.local[STORAGE_KEY]`; carga al iniciar, persiste en cada cambio.
- Escucha `chrome.runtime.onMessage` para todos los `CMD.*`:
  - `LOAD_JSON`: usa `parseProject`; si ok, setea state.project/scenes; emite `EVT.STATE_UPDATE`. Si error, `EVT.LOG` nivel error.
  - `LOAD_CHARACTER_REF`: guarda `{name, dataUrl}` en `project.characterRef`.
  - `SET_CONFIG`: merge en `state.config`.
  - `START`/`RESUME`: arranca el bucle de cola. `PAUSE`/`STOP`: detiene. `RETRY_SCENE`: resetea esa escena a PENDING.
  - `GET_STATE`: responde el snapshot (callback sincrono -> `sendResponse(state)`, retorna `true`).
  - `TOGGLE_INSPECTOR`: guarda flag; (en dry-run no hace nada con el DOM).
- **Bucle de cola** (respeta `config.concurrency`, por ahora 1):
  - Para cada escena PENDING en orden: emite `EVT.SCENE_STATUS` por cada transicion
    (GENERATING_IMAGE -> ANIMATING -> DOWNLOADING -> EXTRACTING_FRAME -> DONE), `EVT.PROGRESS`, y `EVT.LOG`.
  - Entre pasos espera `jitterDelay(config.delayMinMs, config.delayMaxMs)`.
  - **Modo dry-run (`config.dryRun === true`)**: NO toca Flow ni content script. Usa `planScene`
    para loguear cada Step via `EVT.LOG` y simula las transiciones de estado con los delays. Marca DONE.
    `clipFilename`/`lastFrameFilename` se rellenan con los nombres planificados (sin descargar de verdad).
  - **Modo real (dry-run false)**: aqui iria el envio de `ACT.*` al content script. En esta fase deja
    un TODO claro y un fallback que, si no hay content driver, registra error controlado (no rompe la cola).
  - Reintentos: hasta `config.maxRetries` con backoff; al agotar, marca ERROR y continua con la siguiente.
  - Para dura: si llega `RES.CAPTCHA_DETECTED` o `RES.NO_CREDITS`, emite `EVT.HARD_STOP`, pausa la cola.
- **Importante (MV3):** el service worker puede reiniciarse; rehidrata `AppState` desde storage al arrancar
  y no guardes timers vivos en memoria como unica fuente de verdad.

## offscreen/frame-extractor.html + .js  (modulo C)

- `frame-extractor.html`: documento minimo que carga `frame-extractor.js` como `<script type="module">`.
- Extrae el ULTIMO frame de un video: recibe `{ type: "extract_last_frame", url, sceneId }` via
  `chrome.runtime.onMessage`, crea `<video>` (muted, preload auto), hace seek al final
  (`currentTime = duration - epsilon`), dibuja en `<canvas>` del tamano del video, exporta `toDataURL("image/png")`
  y responde `{ ok: true, dataUrl, lastFrameFilename: `${sceneId}_lastframe.png` }` o `{ ok:false, error }`.
- Maneja `seeked`/`loadeddata`/`error`/timeout. No requiere UI visible.
- Expón ademas una funcion pura `extractLastFrameFromVideoEl(videoEl, canvasEl)` para poder testearla.
- Documenta como el background crea el offscreen doc (`chrome.offscreen.createDocument` con reason `BLOBS`/`DOM_PARSER`).

## sidepanel/index.html + panel.js + styles.css  (modulo A)

- ES module (`<script type="module" src="panel.js">`). Importa constantes de `../lib/messaging.js`.
- UI:
  - Cargar `.json` (input file -> parse a objeto -> `send(CMD.LOAD_JSON,{json})`).
  - Cargar imagen de personaje (input file -> `FileReader` a dataURL -> `CMD.LOAD_CHARACTER_REF`).
  - Lista de escenas con badge de estado (mapea `SCENE_STATUS`), boton "Reintentar" por escena.
  - Controles: Iniciar, Pausar, Reanudar, Detener.
  - Barra de progreso global (`EVT.PROGRESS`).
  - Log en vivo con timestamps (`EVT.LOG`), autoscroll.
  - Toggle "Dry-run" (default ON) -> `CMD.SET_CONFIG {dryRun}`. Toggle "Inspector" -> `CMD.TOGGLE_INSPECTOR`.
  - Config basica: resolucion, delay min/max, concurrencia, maxRetries -> `CMD.SET_CONFIG`.
  - Banner rojo prominente ante `EVT.HARD_STOP` (captcha / sin creditos): la extension NO intenta resolver.
- Al abrir: `send(CMD.GET_STATE)` y renderiza. Escucha `chrome.runtime.onMessage` para `EVT.*`.
- Estilo limpio, oscuro, sin frameworks externos (vanilla JS + CSS). Sin dependencias de red.
