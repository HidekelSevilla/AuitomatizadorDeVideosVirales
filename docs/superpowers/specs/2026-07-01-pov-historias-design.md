# Preset `pov-historias` — diseño

## Objetivo
Integrar un preset nuevo `pov-historias` (reels POV históricos, primera persona, fotorrealista) en el pipeline
extensión + Remotion, clonando el flujo de `habitos_finanzas` (Grok imagen → Grok image-to-video → ElevenLabs
voz continua), con dos diferencias: **todas** las escenas se animan siempre (nunca estáticas) y **no hay
personaje visible** (POV puro). Aditivo y aislado: ningún preset existente (`historias`, `criptoclaro`,
`habitos_finanzas`, `esqueletos`, `novela-coreana`, `frutinovelas`) cambia de comportamiento.

## Contrato del JSON

- `project.preset: "pov-historias"` — un solo nombre para ambas orientaciones (como `habitos_finanzas`, no
  hace falta variante `_reel`).
- `project.aspect_ratio: "9:16"` o `"16:9"` decide vertical/horizontal (mecanismo genérico ya existente,
  sin cambios de código).
- **Cada escena** trae obligatoriamente `render_mode: "animated"` + su bloque `animation` (mismo shape que
  las escenas animadas de `habitos_finanzas`: `engine: "grok_video"`, `duration_s`, `source: "this_scene_image"`,
  `prompt`, `trim_to_audio: true`, `fallback: "static_source_image"`). No existen escenas `"static"` en este
  preset — el generador de JSON nunca debe emitir ese valor aquí.
- `ingredients[]`: solo `type: "entity"` / `type: "location"` (props, lugares, objetos que el POV "ve").
  Sin `type: "character"` persistente — nunca se ve al protagonista a cámara. Referenciar ingredientes por
  escena queda **opcional** (no se fuerza como en `habitos_finanzas`).
- Texto: nada horneado en el `image_prompt`, sin cartel de título/`time_label`/`intro_card`. Sí subtítulos
  dinámicos (karaoke) dibujados por Remotion, igual que `historias`.
- Voz: `tts_export.engine: "elevenlabs"` + `tts_export.full_script` continuo (mismo mecanismo de voz única
  que `habitos_finanzas`, sin costuras entre escenas). El `voice_id` lo decide el JSON — pov-historias NO
  fuerza la voz fija de canal que usan historias/criptoclaro/habitos.
- Transición de apertura ("despertar"): fundido negro→primera imagen, ~1.3s fijos, no configurable desde
  el JSON, una sola vez al inicio del video completo (no por escena, no por "parte").

## Cambios de código

Patrón existente para sumar una familia de preset (usado hoy para unir `historias`/`criptoclaro`/`habitos`):
un regex `/^(historias|criptoclaro|habitos)/` repetido literalmente en ~9 sitios que decide "esta familia usa
voz continua (full.mp3) + media por escena tipo imagen-o-clip". Se agrega `pov-historias` como alternativa
adicional del MISMO regex en cada uno de estos sitios (edición aditiva, sin quitar ni reordenar nada):

1. `shared/media-requirements.mjs:3` — `STILL_PRESET_RE` (fuente "canonica", aunque varios callers no la
   importan y repiten el literal).
2. `lib/json-loader.js:132` — flag `imageOnly`.
3. `background/service-worker.js:1600` — gate de disparo de ElevenLabs V3 directo desde la extensión.
4. `background/service-worker.js:1645` — fallback de voz continua vía Fish (por si falta la key de ElevenLabs).
5. `remotion-editor/orchestrator/build.mjs:75` — flag `stills` (resolución de medios por escena).
6. `remotion-editor/orchestrator/build.mjs:241` — skip de enhance IA (Real-ESRGAN+RIFE); pov-historias hereda
   el mismo trade-off que `habitos_finanzas` (sin enhance en sus clips, aunque sean video).
7. `remotion-editor/orchestrator/build.mjs:281` — gate de re-alineado WhisperX/whisper.cpp sobre `full.mp3`.
8. `dev/reload-server.mjs:290` — resolución de medios del dev-server (preview local).
9. `remotion-editor/align/inject-words.mjs:161` — `_isHistorias` (inyecta `voiceover.words` por escena desde
   `full.words.json`; ya tiene fallback por `pipeline.tts.mode`, se agrega el prefijo explícito por consistencia).
10. `remotion-editor/tools/fish-voice.mjs:116` — `isHistorias` (mismo fallback de Fish continuo).
11. `remotion-editor/tts/tts_elevenlabs.py:93` — `is_historias()` (activa el módulo de voz continua si se
    corre el script standalone).

**Exclusión deliberada:** `remotion-editor/tts/tts_elevenlabs.py:102` (`uses_channel_voice()`) NO se toca.
Esa función fuerza la voz oficial fija del canal historias/habitos aunque el JSON pida otra; pov-historias
debe respetar siempre el `voice_id` que traiga su propio `tts_export`.

Como el contrato exige `render_mode: "animated"` en el 100% de las escenas, el flag "stills" de esta familia
nunca resuelve a imagen estática para pov-historias: `sceneMediaPath`/`isAnimated` (en
`shared/media-requirements.mjs` y `build.mjs`) siempre devuelven `clips/<id>.mp4`. Se reusa el mecanismo
híbrido de `habitos_finanzas` sin lógica de dispatch nueva — ni en `json-loader.js` (`perSceneRender`) ni en
`service-worker.js` (línea 659, `markStaticSceneDone`) ni en `ViralVideo.tsx` (línea 640, `SceneClip` vs
`KenBurnsImage`).

## Remotion

- Nueva entrada en `remotion-editor/src/viral/presets.ts`:
  ```ts
  "pov-historias": {
    captionBase: "#FFFFFF",
    captionHotBg: "#E8B84B",
    captionHotText: "#111111",
    showLabelCard: false,
    labelCardBg: "#000000",
    labelCardColor: "#FFFFFF",
    stills: true,
    captions: true,
    wakeIntro: true,
  }
  ```
  (`stills: true` + `captions: true` reproduce exactamente el combo ya soportado por
  `(!preset.stills || preset.captions)` en `ViralVideo.tsx:551,664` → karaoke ON. `showLabelCard: false` +
  ausencia de `scene.intro_card`/`time_label` en el JSON → sin carteles, ya que esos solo se dibujan cuando
  `!preset.stills`.)
- Nuevo campo opcional `wakeIntro?: boolean` en la interfaz `Preset` (`presets.ts`), default ausente/false
  para todos los demás presets — cero efecto en ellos.
- Nuevo componente `WakeIntroOverlay` en `ViralVideo.tsx` (mismo patrón que `FlashOverlay`, línea ~392):
  capa negra a pantalla completa, opacidad interpolada de 1→0 en los primeros `WAKE_INTRO_S` (1.3s), render
  condicionado a `preset.wakeIntro`, montado como el ÚLTIMO hijo del `<AbsoluteFill>` raíz (línea ~796) para
  quedar por encima de música/voz/imágenes/escenas. Es puramente visual: no retrasa audio ni el inicio real
  de la escena 1, solo la tapa visualmente durante el fade.

## Validación

- `lib/queue-validator.js:4` — agregar `"pov-historias"` a `ALLOWED_PRESETS`.
- NO se extiende el bloque `if (preset === "habitos_finanzas")` (líneas 110-124) que fuerza
  `ingredients[]` no vacío y `references.ingredients` obligatorio por escena — pov-historias queda con el
  mismo comportamiento que `historias`/`criptoclaro` (sin esa validación forzada), consistente con que no
  tiene personaje persistente que amarrar.

## Qué NO cambia
Ningún regex existente pierde alternativas ni cambia de orden. Ningún preset actual (`esqueletos`,
`frutinovelas`, `novela-coreana`, `historias`, `historias_reel`, `criptoclaro`, `criptoclaro_reel`,
`habitos_finanzas`) obtiene el flag `wakeIntro` ni cambia su resolución de medios/voz. La regex
`uses_channel_voice()` de Python queda intacta para los presets que ya la usan.

## Plan de verificación
1. `node --test tests/queue_validator.test.mjs` (u equivalente) antes y después del cambio — deben seguir
   pasando los casos existentes de `historias`/`criptoclaro`/`habitos_finanzas`.
2. Cargar un JSON de ejemplo `pov-historias` (16:9 y 9:16) por `lib/json-loader.js` y
   `shared/media-requirements.mjs` → confirmar `imageOnly: true`, `perSceneRender: true`,
   `hasAnimated: true` y que `getMediaRequirements` pide `clips/<id>.mp4` para TODAS las escenas (nunca
   `images/<id>.jpg`) + `voice/full.mp3`.
3. Confirmar en `remotion-editor/src/viral/presets.ts`/`ViralVideo.tsx` que el preset registra y que
   `pnpm exec tsc --noEmit` (o el chequeo de tipos que use el proyecto) no rompe por el campo nuevo
   `wakeIntro`.
4. Render de humo (`npx remotion render ViralVideo ...` o preview de Remotion Studio) con el JSON de ejemplo
   para confirmar visualmente: fundido negro→imagen al inicio, subtítulos dibujados, sin carteles, clips
   animados en toda la duración.
5. Correr los flujos existentes (`historias`, `criptoclaro`, `habitos_finanzas`) sin cambios para confirmar
   que no hay regresión (spot-check de logs/salida, no hace falta regenerar assets reales).

## Documentación a producir durante la implementación
- `remotion-editor/docs/pov_historias_creador-json.md` — contrato completo para quien redacte los JSON
  (mismo formato que `habitos_finanzas_creador-json.md`), incluyendo el bloque STYLE, reglas de escena y
  ejemplo de `render_export`/`tts_export`.
- Un JSON de ejemplo mínimo (1-2 escenas) versión 9:16 para probar el flujo end-to-end.
