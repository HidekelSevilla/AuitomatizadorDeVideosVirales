# Auditoría profunda — 2026-07-07

Auditoría multi-agente (11 frentes, 112 hallazgos, 98 confirmados por verificación adversarial, 14 refutados)
sobre el working tree (incluye los cambios sin commitear previos). Fixes de bajo riesgo aplicados y verificados
con la suite (`npm test` verde) + revisión adversarial de los propios fixes.

---

## 1. Bugs encontrados (consolidados, por severidad)

### CRÍTICOS
| # | Bug | Estado |
|---|-----|--------|
| C1 | **Job re-tomado tras muerte del SW re-gasta TODO**: si el SW muere fuera del bucle de escenas (ingredientes/audio, `running=false`), el lock caduca (15 min), el job se relista, `onLoadJson` resetea todas las escenas a PENDING y se re-paga cada imagen/animación. | **FIXEADO** (rama `sameJob` en pollQueue reanuda el estado persistido) |
| C2 | **Carrera pollQueue vs resumeIfInterrupted al despertar**: pollQueue liberaba el heartbeat rancio, el resume abortaba en silencio y se cargaba OTRO job encima de la corrida a medias. | **FIXEADO** (`resumeInFlight`, heartbeat temprano, release-y-return) |

### ALTOS
| # | Bug | Estado |
|---|-----|--------|
| A1 | onRunAll ignoraba el fallo de audio: job marcado done + "medios listos" con full.mp3 ausente (bug real #4). | **FIXEADO** (onGenerateAudio devuelve boolean; onRunAll verifica en disco con `missingVoiceFiles()` y avisa ERROR → Telegram) |
| A2 | resumeIfInterrupted degradaba a ERROR animaciones de Grok YA pagadas (`grokFired`); el retry ofrecido re-disparaba y pagaba doble. | **FIXEADO** (con `grokVideoPostUrl` → IMAGE_DONE conservando flags: recoge sin re-pagar) |
| A3 | Retry-all limpiaba `videoUrl/grokFired` de escenas cuyo video pagado ya existía (fallo de descarga) → re-animaba (20-40 pts c/u). | **FIXEADO** (con videoUrl → ANIMATING solo-recoger) |
| A4 | Comandos remotos re-ejecutados cada 30s: cursor avanzaba DESPUÉS de ejecutar, sin guard de reentrada, y `Math.max` impedía adoptar el contador tras reiniciar el dev-server (bug real #5). | **FIXEADO** (busy guard + cursor-antes-de-ejecutar + asignación plana) |
| A5 | pollRemoteCommands corría 2 veces (bootstrap + alarma) aplicando cada comando dos veces (doble gasto TTS en `/audio`). | **FIXEADO** (`remotePollBusy`) |
| A6 | pollQueue reentrante: 2ª alarma en la ventana claim→onRunAll reclamaba OTRO job y pisaba `state.project/scenes`. | **FIXEADO** (`pollQueueBusy` + skip por `ingredientsRunning/resumeInFlight`) |
| A7 | COLLECT_IMAGE (recuperación) devolvía el primer `<img>` sin estabilización → recurrencia del bug del frame de RUIDO (bug real #7). | **FIXEADO** (mismas señales que generateImage: quiet + `dataImageLooksFinal`) |
| A8 | Notificaciones de Telegram morían para siempre tras reiniciar el dev-server (`lastEventId` nunca bajaba). | **FIXEADO** (reset al detectar `lastId` menor) |
| A9 | Retry "download" era no-op con la config default (parallelAnimation=false): escena varada en ANIMATING para siempre → el usuario escalaba a Reanimar y pagaba doble. | **FIXEADO** (el bucle secuencial ahora recoge ANIMATING+videoUrl) |
| A10 | Botones de retry activos durante una corrida viva cambiaban `queue.phase` debajo del bucle. | **FIXEADO** (guards en onRetryScene/onRetryAllErrors/onRunAll, con pausa sí se permite) |
| A11 | Corridas secuenciales SIN alarma keepAlive: MV3 suspendía el SW en las esperas largas de Grok (~6 min, debugger suelto). | **FIXEADO** (keepAlive en launchLoop/onRunAll; keepAliveTick también late el lock del job) |
| A12 | build.mjs vs extensión: el marcador `.full.mp3.extension-inflight.json` no lo escribe NADIE → doble generación ElevenLabs si el script tarda >10 min. | **PENDIENTE** (fix propuesto abajo) |
| A13 | dev-server congela TODO hasta 20 min (`spawnSync` de ElevenLabs en el handler HTTP): locks caducan, /save cae a Descargas, el bridge parece muerto. | **PENDIENTE** (requiere spawn async, riesgo medio) |
| A14 | El lock del job no late durante ingredientes/audio; `/queue/heartbeat` no resucita un lock ya borrado. | **PARCIAL** (keepAliveTick ahora late el lock; falta el fix del lado dev-server) |
| A15 | MP4 viejo en `out/` nunca se invalida al re-encolar un slug (bug real #11). | **PARCIAL** (Telegram ya avisa "MÁS VIEJO que los medios"; falta rename/stale en build.mjs) |
| A16 | animateFire: timeout de 14s para detectar "generación arrancó" → falso negativo re-dispara video pagado. | **PENDIENTE** (probe propuesto, riesgo medio) |

### MEDIOS (los más relevantes)
- `classifyError` ruteaba "still rechazado por dev-server" a environment → negaba el retry GRATIS de imagen (bug real #1, cadena completa). **FIXEADO**.
- onClearAll perdía `state.remote` → TypeError en el poll + replay de comandos. **FIXEADO**.
- resume/cooldown se saltaban los guards nuevos de reparación de fase (bug real #2/#3 por otra puerta). **FIXEADO** (repair + forceImagesPhase en resumeIfInterrupted/resumeAfterCooldown/runAnimationRetry).
- "Saltar" no se respetaba: cada arranque de fase de imágenes resucitaba las escenas saltadas. **FIXEADO** (`!s.skipped` en las reactivaciones).
- onGenerateAudio sin guard de reentrada → dobles generaciones concurrentes. **FIXEADO** (`audioBusy`).
- Autopiloto regeneraba TODO el audio en un re-run. **FIXEADO** (missingOnly en onRunAll).
- Audio que cae en Descargas (dev-server caído) contaba como éxito. **FIXEADO** (viaDownloads → return false + verificación en disco).
- /save aceptaba archivos de 0 bytes / mp3 diminutos con ok:true. **FIXEADO** (422 como /move).
- fish-voice.mjs: skip por `existsSync` → un mp3 de 0 bytes bloqueaba la regeneración para siempre; API key hardcodeada en el repo. **FIXEADO** (size-check; key solo de secrets — **rota la key vieja en fish.audio, quedó en el historial de git**).
- Telegram: backlog >100 updates re-ejecutaba comandos viejos al arrancar; getUpdates con error API giraba sin backoff; /status decía "full.mp3 OK" sobre 0 bytes. **FIXEADOS**.
- Subida de referencias fallida se degrada a WARN → escena se genera SIN refs en silencio. **PENDIENTE**.
- Handoff de animación puede adjuntar un chip rancio (CLEAR_REFS sin verificar en ese path). **PENDIENTE**.
- generateImage: si el loop de estabilización agota 180s, devuelve el frame actual SIN validación final. **PENDIENTE**.
- Umbral fijo 90KB rechaza stills legítimos de estilo plano (criptoclaro/manhwa oscuro) sin override. **PENDIENTE**.
- Mismatch de firma se reporta como "falta .media-signature.json" sin explicación ni vía manual de adopción. **PENDIENTE**.
- doneJobs permanente sin limpieza: JSON corregido con el mismo nombre se ignora EN SILENCIO. **PENDIENTE**.
- Adopción ciega de firma faltante (media vieja renderiza bajo JSON editado). **PENDIENTE**.
- Alarmas centrales tragan todos los errores (`.catch(() => {})`). **PENDIENTE** (logging).
- QuickEdit de la consola de Windows congela node (bug real #10): NO es bug del código; ver §5.

### BAJOS
- UX sidepanel: progreso image-only en 0% eterno, hero ciego a ingredientes/voz/cooldown, banner de hard-stop no re-derivable, ingredientes "Pendiente" con PNG en disco (hidratación parcial), "Animar todo" habilitado en presets image-only. **PENDIENTES** (lista concreta abajo).
- pollEvents consume eventos antes de confirmarse el envío (alerta perdida si Telegram falla). PENDIENTE.
- Ingredientes sin aspectRatio (heredan el ratio que Grok recuerde). PENDIENTE.
- Log ring puede perderse ~2s al morir el SW. PENDIENTE.

---

## 2. Cambios implementados (esta sesión)

### background/service-worker.js
1. **pollRemoteCommands**: guard `remotePollBusy`; cursor persistido ANTES de ejecutar (at-most-once); asignación plana (adopta contador tras restart del dev-server); init defensivo de `state.remote`.
2. **onClearAll**: preserva el cursor remoto.
3. **pollQueue**: guard `pollQueueBusy` (try/finally); skip por `ingredientsRunning`/`resumeInFlight`; el release de heartbeat rancio retorna el tick; **rama sameJob**: si el job reclamado es el mismo (`jobName` + slug validado) y hay progreso, NO recarga el JSON — repara y reanuda sin re-gastar.
4. **resumeIfInterrupted**: flag `resumeInFlight`; heartbeat inmediato; ANIMATING+`grokFired`+`grokVideoPostUrl` → IMAGE_DONE (recoge el video YA pagado sin re-disparar); mensaje claro cuando se pagó pero no se sabe dónde quedó; aplica reparaciones de fase.
5. **resumeAfterCooldown** y **runAnimationRetry**: mismas reparaciones (`repairMissingStillAssets` + `forceImagesPhaseIfPending`).
6. **onRetryAllErrors**: escenas con `videoUrl` → ANIMATING solo-recoger (no borra videoUrl/grokFired); guard de corrida activa.
7. **onRetryScene**: guard de corrida activa (con cola pausada sí se permite — flujo normal de recuperación).
8. **onRunAll**: guard contra corrida manual viva; audio con `missingOnly`; verificación en disco (`missingVoiceFiles()`) con ERROR ruidoso → Telegram; "medios listos" solo si la voz está completa; keepAlive activo toda la corrida.
9. **onGenerateAudio**: guard `audioBusy`; devuelve boolean (Descargas-fallback ya NO cuenta como éxito).
10. **Skip pegajoso**: `!s.skipped` en reactivaciones de onStartPhase/runPhaseToEnd y en los checks de pendientes.
11. **keepAlive secuencial**: alarma creada en launchLoop/onRunAll; keepAliveTick considera `loopRunning/autopilotBusy/ingredientsRunning` y late el lock del job.

### lib/orchestrator.js
12. `classifyError`: "still rechazado / demasiado pequeno / posible corrupto / descarga incompleta" → **generation** (retry gratis) ANTES del check de environment.
13. Fase animation: si no quedan IMAGE_DONE, recoge ANIMATING+`videoUrl` (no skipped) — los runners con videoUrl no re-disparan; salvaguarda anti-bucle generalizada a `statusBefore`.

### content/grok-driver.js
14. `collectImage`: acepta `cfg` y exige estabilización (quiet + `dataImageLooksFinal`); si no estabiliza devuelve `ok:false` (el SW reintenta) en vez de entregar ruido.

### dev/reload-server.mjs
15. POST /save: rechaza 422 payloads vacíos y mp3 < 4096 bytes (el SW cae a Descargas y ya no lo cuenta como éxito).

### scripts/telegram-bridge.mjs
16. pollEvents: detecta restart del dev-server y re-adopta el contador (las notificaciones ya no mueren).
17. syncTelegramOffset: drena TODO el backlog (paginado de a 100).
18. getUpdates: errores a nivel API (401/409/429) → log claro + backoff (respeta `retry_after`).
19. /video: aviso "este MP4 es MÁS VIEJO que los medios" cuando aplica.
20. /status: full.mp3 con size-check (detecta corrupto).
21. **Confirmación en dos pasos** para botones peligrosos (Reintentar/Saltar/Detener/Cola OFF/Hacer todo) — los comandos tecleados van directo.
22. Comandos nuevos: **/faltantes** y **/actual** (+ botones en el teclado de estado, + /help).

### remotion-editor/tools/fish-voice.mjs
23. Skip-existente con tamaño mínimo (4096 B); **API key hardcodeada eliminada** (solo secrets.local.json).

### sidepanel
24. Botón **"Solo faltantes"** (audio): genera únicamente los mp3 que faltan en disco (capacidad missingOnly del SW).

---

## 3. Tests agregados
`tests/orchestrator.test.mjs` (+6 asserts, suite completa verde):
- (m) still rechazado → `generation` (retry gratis); dev-server caído sigue siendo `environment`.
- (n) ANIMATING+videoUrl se recoge en el bucle secuencial SIN re-disparar.
- (n2) ANIMATING sin videoUrl NO se toca (decisión del SW).
- (n3) collect no-op → ERROR (sin bucle infinito).
- (n4) skipped no se recoge.

No testeable en unit (lógica dentro del SW, no extraída a lib/): cursor remoto, pollQueue sameJob, audio missingOnly.
Recomendación: extraer `remote-poll` y `queue-claim` a `lib/` como se hizo con el orchestrator.

## 4. Cómo verificar manualmente
1. **Recarga la extensión** (chrome://extensions) — el estado persiste; con unlimitedStorage no hay pérdida.
2. **Comandos remotos**: manda `/status` 2 veces por Telegram, reinicia el dev-server (`npm run dev`), manda `/reanudar` → debe ejecutarse UNA vez (log SW: sin replays cada 30s).
3. **Audio faltante**: borra un `scene_XX.mp3` de `remotion-editor/public/<slug>/voice/`, botón "Solo faltantes" → genera SOLO ese; repite con todo presente → "no gasto creditos".
4. **Retry sin re-gasto**: en una escena ERROR con clip ya en Flow/Grok, "Reintentar errores" → log debe decir fase animation y el runner "recojo sin re-animar".
5. **Telegram**: botón "Reintentar" → debe pedir confirmación; `/faltantes` y `/actual` responden; apaga el dev-server 30s y préndelo → los eventos siguen llegando.
6. **Still corrupto**: (simulado) un /save de mp3 con <4KB responde 422 y el SW loguea el fallo sin marcar éxito.

## 5. Riesgos pendientes (no tocados, por orden de dolor)
1. **A13 spawnSync 20 min en dev-server** (`/audio/generate-eleven`): congela locks/saves/bridge. Fix: `spawn` async + flag por slug. Riesgo medio → hacer con calma.
2. **A12 doble generación ElevenLabs** build.mjs vs extensión: escribir el marcador `.full.mp3.extension-inflight.json` en `/audio/generate-eleven` (start/done) — build.mjs YA lo lee.
3. **A16 animateFire falso negativo** re-dispara video pagado: subir timeout a ~40s + probe (VIDEO_SRCS vs grokAnimBefore) antes de permitir re-fire.
4. **Firma/medios**: mensaje claro de mismatch + `--adopt <slug>` + no adoptar a ciegas; umbral 90KB configurable por proyecto.
5. **doneJobs**: guardar `nombre@firma` para que un JSON corregido re-corra; o comando de limpieza.
6. **MP4 rancio en build.mjs**: renombrar `out/<slug>.mp4` a `.stale-<ts>.mp4` antes de re-render + `render-meta.json` con la firma.
7. **Refs de Grok**: fallo de subida debe fallar el intento (no WARN); verificación de chips en el handoff de animación; validación final tras agotar los 180s de estabilización.
8. **QuickEdit (bug real #10)**: desactiva "Modo de edición rápida" en las propiedades de la consola (o corre flowbot con `start /b` / como servicio). Es Windows, no el código: al seleccionar texto la consola PAUSA el proceso.
9. **Observabilidad**: logs a disco `logs/{grok,audio,render,remote}/YYYY-MM-DD.log` con runId por job (dev-server ya loguea a stdout; falta persistencia), snapshot de estado en errores.
10. **Sidepanel** (siguiente iteración de UI): progreso image-only cuenta DONE+IMAGE_DONE, hero con fase de voz/ingredientes/cooldown, "Reparar estado" (= repairMissingStillAssets + forceImagesPhase manual), indicadores dev-server/render-watch (GET /ping + mediaStatus), lista de faltantes.

## 6. Refutados destacables (NO son bugs)
- "El guard de carga de grok-driver ya evita message channel closed" (bug real #9: mitigado por `ensureContentScript` + reintentos existentes).
- "audio_missing regenera todo si el dev-server no responde": FALSO en el flujo actual — voiceFileOk falla → genera, pero el /save también falla → cae a Descargas sin gastar de más por diseño; igual quedó más protegido con el boolean.
- Los teclados viejos de Telegram ya no disparan retry directo (con la confirmación de esta sesión el riesgo residual bajó más).
