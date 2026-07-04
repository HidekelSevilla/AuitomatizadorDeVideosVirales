# Auditoria extensa del aplicativo

Fecha: 2026-06-30  
Alcance revisado: extension Chrome MV3, side panel, drivers Flow/Grok, dev-server local, cola, TTS Fish/ElevenLabs y editor Remotion.

> Nota: no repito ningun secreto real en este documento. Detecte una API key hardcodeada y la marco como riesgo sin exponerla.

## Resumen ejecutivo

El proyecto ya no es solo un scaffold: hoy tiene un pipeline bastante completo:

- Extension MV3 con side panel y service worker.
- Orquestador de fases: imagenes, animacion, audio y cola automatica.
- Drivers DOM para Google Flow y Grok Imagine.
- Dev-server local para secrets, queue, escritura/movimiento de medios y autoreload.
- Editor Remotion con presets de formato, voz continua, karaoke, stills, clips hibridos y orquestador de render.

Fortalezas claras:

- Separacion razonable entre parser/cola puros (`lib/`) y efectos Chrome/DOM.
- Tests unitarios utiles para parser, dry-run, transiciones y orquestador.
- Idempotencia parcial para evitar re-gastar puntos al fallar descarga/colecta.
- Buenas salvaguardas contra archivos truncados en `dev/reload-server.mjs` y `remotion-editor/orchestrator/build.mjs`.
- Cola con lock + heartbeat, lo cual es una base correcta para automatizacion larga.

Riesgos principales:

1. Hay una API key real hardcodeada en `lib/messaging.js`.
2. TypeScript falla en Remotion.
3. El dev-server y el orquestador no calculan igual los medios requeridos para proyectos hibridos.
4. Remotion copia todo `public/` (~9.7 GB) incluso para un smoke test de 236 KB.
5. La documentacion/contrato todavia prometen `last_frame`/`prev_frame`, pero el modo real ya no extrae ultimo frame.
6. Hay comandos con `shell:true` construidos con strings derivados de JSON/rutas.
7. La extension usa permisos muy potentes (`debugger`, `downloads`, `unlimitedStorage`) sin perfil dev/prod.

## Checks ejecutados

- `npm test`: OK.
- `node --check` en `background/service-worker.js`, `lib/json-loader.js`, `lib/orchestrator.js`, `dev/reload-server.mjs`, `remotion-editor/orchestrator/build.mjs`: OK.
- `.\node_modules\.bin\tsc.cmd --noEmit` en `remotion-editor`: FALLA.
- `npm --prefix remotion-editor audit --omit=dev`: FALLA por 6 vulnerabilidades high en `ws` via Remotion 4.0.477.
- `npm --prefix remotion-editor outdated --json`: Remotion 4.0.484 disponible.
- `npm --prefix remotion-editor run smoke`: OK, pero copio ~9.7 GB de `public/`.
- `node remotion-editor/orchestrator/build.mjs --status`: cola actual incompleta; jobs `habitos_finanzas` requieren clips `.mp4` en escenas `render_mode:"animated"`.
- Validacion con `parseProject()` sobre JSONs del repo: 32 JSON con `scenes`, 4 invalidos para el parser de extension, 1 warning.

## Hallazgos criticos

### CRIT-01: API key real hardcodeada

Evidencia:

- `lib/messaging.js:186`: `DEFAULT_CONFIG.fishApiKey` contiene una key real.
- `remotion-editor/tools/fish-say.mjs`, `remotion-editor/tools/voice-compare.mjs` y `remotion-editor/tools/fish-voice.mjs`: tambien tienen fallback hardcodeado.
- `background/service-worker.js:97-113`: carga secrets desde `localhost`, pero si falla usa lo que haya en config.
- `sidepanel/panel.js:156`: la key se reinyecta en el input.
- `sidepanel/panel.js:700-701`: la key se guarda en `chrome.storage.local`.

Impacto:

- Si el repo se comparte o se commitea, la key queda expuesta.
- Si alguien exporta el estado de Chrome, tambien puede quedar expuesta.
- Si la key ya estuvo en git local o en logs, conviene asumir compromiso.

Accion recomendada:

- Rotar la key.
- Volver `fishApiKey` a `""` en `DEFAULT_CONFIG`.
- Quitar todos los fallbacks hardcodeados de `remotion-editor/tools/*`.
- Cargar secrets solo desde `secrets.local.json` o variables de entorno del dev-server.
- En UI, mostrar `********` y nunca rehidratar el valor real.
- No guardar secrets persistentes en `chrome.storage.local`; guardar solo `hasFishKey: true` y pedir al dev-server que firme/ejecute TTS.

### CRIT-02: Remotion no pasa TypeScript

Evidencia:

- `remotion-editor/src/Root.tsx:45`: `ViralVideo` no encaja con `LooseComponentType<Record<string, unknown>>`.
- `remotion-editor/src/Root.tsx:51`: `calcViralMetadata` no encaja con `CalculateMetadataFunction<Record<string, unknown>>`.
- `remotion-editor/src/viral/ViralVideo.tsx:159`: `ViralProps` no satisface `Record<string, unknown>`.
- `remotion-editor/src/viral/ViralVideo.tsx:790`: `continuous` puede ser `undefined`.

Impacto:

- No puedes usar typecheck como gate de calidad.
- Cambios de props/render pueden romperse sin detectarse hasta runtime.

Accion recomendada:

- Tipar `Composition` con genericos compatibles o adaptar `ViralProps` a `Record<string, unknown>`.
- Cambiar `const continuous = !!preset.stills && !!props.audio?._continuous && !!props.audio?._master`.
- Agregar script `typecheck` y hacerlo gate antes de render/commit.

### CRIT-03: `mediaComplete()` difiere entre dev-server y build

Evidencia:

- `dev/reload-server.mjs:276-290`: si el preset es `habitos`, exige `images/<id>.jpg` para todas las escenas.
- `remotion-editor/orchestrator/build.mjs:62-82`: si la escena tiene `render_mode:"animated"`, exige `clips/<id>.mp4`.
- La cola actual tiene jobs `habitos_finanzas` con muchas escenas `render_mode:"animated"`.

Impacto:

- La extension puede creer que un trabajo ya esta completo cuando aun faltan clips animados.
- O el orquestador puede bloquear render mientras la cola deja de ofrecer el job.

Accion recomendada:

- Crear un helper unico, por ejemplo `shared/media-requirements.mjs`.
- Usarlo desde `dev/reload-server.mjs`, `remotion-editor/orchestrator/build.mjs` y tests.
- Agregar test con un JSON `habitos_finanzas` hibrido que exija imagenes para static y clips para animated.

### CRIT-04: Remotion copia 9.7 GB de `public/` por render

Evidencia:

- `npm run smoke` genero `out/smoke-test.mp4` de 235.6 KB.
- Durante el render Remotion copio `public/` hasta ~9.7 GB.
- `remotion-editor/public` tiene 3488 archivos y suma 9,710,624,974 bytes.
- `remotion-editor/remotion.config.ts` no limita `publicDir`.

Impacto:

- Render lento aunque el video use pocos assets.
- Mucho I/O en disco, mas riesgo de fallos y desgaste.
- Escala mal con cola larga.

Accion recomendada:

- Separar assets por job y renderizar con public dir minimo por slug.
- Alternativa: generar un `render-public/<slug>` temporal con symlinks/copia selectiva.
- Mantener `public/music` y `public/sfx` compartidos, pero no copiar todos los proyectos historicos.
- Agregar un smoke test que no use el `public` completo.

### CRIT-05: contrato `last_frame`/`prev_frame` esta desalineado

Evidencia:

- `README.md` y `CONTRACT.md` dicen que se descarga clip y se extrae `{id}_lastframe.png`.
- `background/service-worker.js:911`: el modo real dice que se quito la extraccion de ultimo frame.
- `background/service-worker.js:1714-1742`: existe `extractLastFrame()`, pero no hay llamadas a esa funcion.
- `offscreen/frame-extractor.js` existe y responde mensajes, pero queda como codigo muerto.
- `tests/dryrun.test.mjs` sigue validando `extract_frame`.

Impacto:

- El esquema viejo con `prev_frame` queda prometido pero no funciona en modo real.
- La continuidad visual puede depender de refs de escenas/ingredientes, no de ultimo frame, pero eso no esta documentado como cambio de contrato.

Accion recomendada:

- Decidir una de dos:
  - O eliminar `prev_frame` del contrato real y limpiar offscreen/tests/docs.
  - O reactivar extraccion y guardar `lastFrameFilename`/archivo real en `public/<slug>/frames/`.
- Si se mantiene, persistir los frames o URLs por escena, no solo en memoria.

## Hallazgos altos

### HIGH-01: vulnerabilidad high en dependencias Remotion

Evidencia:

- `npm --prefix remotion-editor audit --omit=dev` reporta `ws` vulnerable.
- Afecta cadena `@remotion/renderer`, `@remotion/cli`, `@remotion/studio`, `@remotion/bundler`.
- Remotion actual: 4.0.477; disponible: 4.0.484.

Impacto:

- Riesgo mayor si Studio/dev server queda accesible o si se abren recursos no confiables.

Accion recomendada:

- Subir Remotion y paquetes `@remotion/*` a 4.0.484 en bloque.
- Re-ejecutar `npm audit`, smoke y render real.

### HIGH-02: comandos shell con strings derivados de JSON/rutas

Evidencia:

- `remotion-editor/orchestrator/build.mjs:112`: `spawnSync(..., shell:true)` con `slug`.
- `remotion-editor/orchestrator/build.mjs:130`: `ffprobe` string con ruta.
- `remotion-editor/orchestrator/build.mjs:179-181`: `npx remotion render ... --props="${rel(job.jsonPath)}"` con `shell:true`.
- `remotion-editor/orchestrator/build.mjs:206-208`: `ffmpeg` string con rutas y speed.
- `remotion-editor/align/inject-words.mjs:20`: `execSync` con ruta.

Impacto:

- Si un JSON/ruta/slug malicioso llega a la cola, puede romper comandos o inyectar shell.
- Aunque sea uso local, los JSON son generados por IA y deberian tratarse como input no confiable.

Accion recomendada:

- Usar `spawnSync(cmd, args, { shell:false })`.
- Validar `project.slug` con whitelist: `[a-z0-9_-]+`.
- Validar `scene.id` igual.
- Prohibir comillas, separadores, `..`, slash y backslash en IDs/slug.

### HIGH-03: permisos de extension muy potentes

Evidencia:

- `manifest.json:6-15`: `downloads`, `unlimitedStorage`, `debugger`, `alarms`, etc.
- `manifest.json:17-23`: host permissions para Flow, Grok, assets, Fish, ElevenLabs y localhost.
- `background/service-worker.js:1877-1930`: CDP `chrome.debugger` para clicks trusted.

Impacto:

- `debugger` muestra barra de Chrome y da mucho poder sobre pestañas permitidas.
- Si la extension se distribuye, la confianza requerida es alta.

Accion recomendada:

- Separar manifest dev/local vs prod.
- Mantener `debugger` solo en build local no distribuible.
- Documentar claramente que requiere sesion abierta y control de pestaña.
- Reducir host permissions por proveedor activo si se puede.

### HIGH-04: selectores DOM fragiles y externos

Evidencia:

- `content/selectors.config.js:1-10`: reconoce que Flow usa texto visible y clases minificadas.
- `content/selectors.config.js:254-263`: deteccion de creditos no confirmada.
- `content/grok-driver.js:17`: pendiente confirmar 9:16, patron de URL y tiempos.
- `content/flow-driver.js:884`: `DOWNLOAD_CLIP` aun marcado `UNVERIFIED`.

Impacto:

- Cualquier deploy de Flow/Grok puede romper produccion.
- Los fallos pueden aparecer despues de gastar puntos o generar medias incompletas.

Accion recomendada:

- Crear paginas fake/fixtures DOM para Flow y Grok y testear cada ACT.
- Agregar comando `healthcheck provider` que valide selectores antes de correr.
- Guardar diagnostico HTML/screenshot al primer fallo de selector.
- Tratar `noCreditsIndicator` como parada dura solo cuando este confirmado por DOM real.

### HIGH-05: config visible que no siempre se cumple

Evidencia:

- `lib/orchestrator.js:152`: comentario dice `concurrency = 1`.
- `lib/messaging.js:157`: config expone `concurrency: 1-2`.
- `sidepanel/panel.js:664`: UI permite cambiar concurrencia.
- `lib/messaging.js:197`: `autoQueuePollMs`, pero `background/service-worker.js` usa alarma fija `periodInMinutes: 0.5`.

Impacto:

- El usuario cree controlar cosas que el sistema ignora.
- Dificulta depurar ritmo/costos.

Accion recomendada:

- Ocultar controles no implementados.
- O implementar concurrencia real con locks por escena.
- Usar `autoQueuePollMs` o eliminarlo.

## Hallazgos medios

### MED-01: schema sprawl

Evidencia:

- `parseProject()` soporta esquema viejo, nuevo, historias, criptoclaro, habitos, image-only, hibrido.
- 4 JSON en `remotion-editor/data` son invalidos para el parser de extension, aunque sirven como props de render.

Impacto:

- Es facil meter un JSON al flujo equivocado.
- Los contratos de generacion y render estan mezclados.

Accion recomendada:

- Agregar `schema_version` y `pipeline.intent`: `generation_project` vs `render_props`.
- Usar Zod/JSON Schema por tipo.
- Validar cola con schema correcto antes de reclamar jobs.

### MED-02: `queue/` no esta ignorado completo

Evidencia:

- `.gitignore` ignora `remotion-editor/queue/*.lock`, pero no los JSON de queue.
- `git status` muestra `remotion-editor/queue/` como untracked.

Impacto:

- Puedes commitear jobs privados por accidente.

Accion recomendada:

- Si la cola es runtime local, ignorar `remotion-editor/queue/`.
- Si quieres ejemplos versionados, moverlos a `examples/queue/`.

### MED-03: logs y state pueden crecer o contener datos sensibles

Evidencia:

- `background/service-worker.js` persiste state completo en `chrome.storage.local`.
- `LOG_RING_MAX = 400`.
- Se loguean configs (`onSetConfig`) con JSON de cambios.

Impacto:

- Un cambio de config puede loguear claves si no se filtra.
- Debug local queda con datos sensibles.

Accion recomendada:

- Redactar `fishApiKey`, `elevenApiKey`, URLs firmadas y data URLs.
- Separar `state.runtime`, `state.secrets`, `state.logs`.

### MED-04: recuperacion tras reinicio aun depende de estados parciales

Evidencia:

- `resumeIfInterrupted()` reencola algunos estados y marca otros como error.
- `lastFrames` en memoria se pierde al reiniciar.
- `grokPostUrl`, `videoUrl`, `imageFilePath` existen pero no hay ledger uniforme por escena.

Impacto:

- Reinicios MV3 o Chrome pueden dejar escenas en estados que requieren intervencion manual.

Accion recomendada:

- Crear `scene.artifacts`: `{ image, postUrl, videoUrl, filePath, savedOk, providerJobId }`.
- Persistir cada transicion con evento y timestamp.
- Hacer reanudacion basada en artifacts, no solo `status`.

### MED-05: limpieza de Flow depende de `savedOk`

Evidencia:

- `background/service-worker.js:2276-2289`: limpia Flow si todos los `savedOk` estan true.
- `savedOk` se setea por escena en distintos runners.

Impacto:

- Si la definicion de "media completa" difiere por formato, puedes no limpiar nunca o limpiar mal.

Accion recomendada:

- Basar limpieza en el mismo helper de requisitos de medios.
- Antes de borrar, verificar cada archivo con tamaño + ffprobe cuando sea video.

## Mejoras recomendadas por area

### Extension

1. Sacar secrets del cliente.
2. Dividir manifests: `manifest.dev.json` con `debugger`; `manifest.prod.json` sin debugger si no se distribuye.
3. Convertir configs hardcodeadas de ritmo en perfil declarativo: `safe`, `fast`, `manual`.
4. Agregar `provider healthcheck` antes de RUN_ALL.
5. El side panel deberia mostrar:
   - proveedor por fase: imagen y animacion,
   - costo estimado por fase,
   - escena actual + artifact actual,
   - bloqueos recuperables vs no recuperables.
6. Mejorar reintentos:
   - reintento de selector: no reintentar automaticamente,
   - reintento de generacion: backoff,
   - reintento de descarga: nunca re-generar.
7. No usar controles de UI que no tengan efecto real.

### Generacion de imagen/video

1. Usar un `ProviderAdapter` comun:
   - `generateImage(scene, refs)`,
   - `animate(scene, imageArtifact)`,
   - `collect(jobId)`,
   - `download(artifact)`,
   - `healthcheck()`.
2. Guardar artifacts por escena desde el primer resultado.
3. Cachear imagenes/voz por hash de prompt + refs + voz + modelo.
4. Para prompts:
   - validador de longitud,
   - deteccion de texto requerido,
   - reglas por preset,
   - bloqueo si falta `reference_asset`.
5. Para Grok/Flow:
   - guardar `postUrl` y `asset id`, no depender solo de DOM visible.
   - diagnostico automatico en fallo: DOM reducido + URL + screenshot si se puede.

### Edicion y render

1. Resolver el problema de `public/` gigante.
2. Unificar calculo de requisitos de medios.
3. Typecheck como gate.
4. Agregar render smoke especifico para `ViralVideo` con public minimo.
5. Validar assets antes de render:
   - imagen decodifica,
   - mp3 duracion > 0,
   - mp4 ffprobe OK,
   - dimensiones esperadas.
6. Mejorar outputs:
   - thumbnail,
   - reporte JSON del render,
   - duracion final,
   - LUFS,
   - lista de medios usados.

### Audio/TTS

1. Abstraer Fish y ElevenLabs en `TtsProvider`.
2. Cache por `text + voice + model + speed`.
3. Redactar keys en logs.
4. Medir drift entre timestamps y duracion real, guardar metrica.
5. Si alignment falla, bloquear render o marcar como karaoke estimado explicitamente.

### Cola y operacion

1. Estados de job: `queued`, `claimed`, `generating_media`, `media_ready`, `rendering`, `done`, `failed`.
2. Archivo `job.state.json` junto al JSON.
3. No depender solo de locks `.lock`.
4. `build.mjs --status --json` para UI.
5. Dashboard simple local para ver queue, missing media y ultimos errores.

## Plan recomendado

### Fase 0: hoy

1. Rotar Fish API key y sacarla de `lib/messaging.js`.
2. Arreglar TypeScript de Remotion.
3. Crear helper unico `media-requirements.mjs` y reemplazar `mediaComplete()`/`inspect()`.
4. Reducir `public/` copiado por Remotion.
5. Actualizar Remotion a 4.0.484 y correr audit.

### Fase 1: estabilidad

1. Versionar schemas.
2. Agregar tests de JSON hibrido.
3. Agregar healthcheck DOM para Flow/Grok.
4. Redactar logs/configs sensibles.
5. Limpiar docs obsoletas de `prev_frame` o reactivar la feature.

### Fase 2: escalado

1. Provider adapters.
2. Artifact ledger persistente por escena.
3. Cache de TTS e imagenes.
4. Queue state machine.
5. Dashboard operativo.

### Fase 3: calidad de video

1. Analizador automatico de duracion/ritmo por escena.
2. Scoring de hook, pacing, silencios y caption drift.
3. Render profiles por plataforma: Shorts, Reels, largo 16:9.
4. Export con thumbnail, metadata y reporte final.

## Conclusion

El proyecto tiene buena base y ya resuelve problemas dificiles: automatizacion larga, recuperacion parcial, TTS con timestamps, render por presets y pipeline hibrido. La deuda mas peligrosa no esta en "faltan features", sino en contratos duplicados y estados no unificados: secrets, media requirements, schemas, artifacts y renders.

Mi orden de arreglo seria:

1. Seguridad de secrets.
2. Typecheck + CI local.
3. Media requirements unico.
4. Public dir selectivo para Remotion.
5. Decidir oficialmente si `prev_frame` vive o muere.
