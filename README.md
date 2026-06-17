# Flow Scene Automator (extension Chrome MV3)

Automatiza Google Flow para generar, **escena por escena**, los clips de un video viral a partir de un JSON.
Por cada escena: genera imagen (Nano Banana) -> anima (Veo) -> descarga `{id}.mp4` -> extrae `{id}_lastframe.png`
para dar continuidad a la siguiente escena.

> Esta extension cubre **solo la etapa de escenas** del pipeline. El hook, la voz (ElevenLabs) y el
> ensamblado final (FFmpeg) son etapas posteriores y NO se hacen aqui.

## Estado actual (fase andamiaje)

- ✅ Andamiaje MV3: manifest, mensajeria, side panel, parser/validador del JSON, cola.
- ✅ **Modo dry-run**: recorre la cola y loguea el flujo completo de las escenas **sin tocar Flow**.
- ✅ Offscreen frame-extractor (extrae el ultimo frame de un video via `<video>`+`<canvas>`).
- ✅ Stubs de `content/flow-driver.js` y `content/selectors.config.js` (con modo inspector pendiente).
- ⏳ **Pendiente**: el driver real de Flow (paso final, se itera contra el DOM real) y cablear el
  offscreen al modo real para encadenar `prev_frame`.

Verificado: `node --check` pasa en los 8 modulos y `npm test` (dry-run de 6 escenas) pasa.

## Cargar la extension

1. Chrome -> `chrome://extensions`.
2. Activa **Modo desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** -> selecciona esta carpeta (`AuitomatizadorDeVideosVirales`).
4. Abre `https://labs.google/fx/tools/flow` (confirmar URL) e inicia sesion en tu cuenta de Google.
5. Click en el icono de la extension para abrir el **side panel**.

## Uso

1. En el panel, **Cargar JSON** -> elige tu archivo (ej. `examples/qpasaria_esqueleto_schema_v1.json`).
2. **Cargar imagen de personaje** (`character_ref`) -> la imagen canonica del personaje.
3. Deja **Dry-run = ON** la primera vez: pulsa **Iniciar** y observa el log; debe describir, por cada
   escena, los 5 pasos (resolver ingredientes, generar imagen, animar, descargar, extraer frame) sin
   tocar Flow.
4. Cuando el driver real este mapeado, desactiva Dry-run para automatizar de verdad.

Controles: Iniciar / Pausar / Reanudar / Detener, y **Reintentar** por escena.
Config: resolucion de descarga, delays min/max, concurrencia (1-2), reintentos.

## Probar la logica sin Chrome

```
node tests/dryrun.test.mjs      # o: npm test
```

## Mapear selectores (cuando Flow cambie su DOM)

Flow es un SPA con clases minificadas que cambian con cada deploy. **No edites el codigo del driver**;
edita solo **`content/selectors.config.js`**:

- Cada accion (campo de prompt, boton generar, input de archivo, indicador de "completado", boton de
  descarga, etc.) tiene **multiples estrategias de fallback** (por `aria-label`, `role`, texto visible,
  `data-*`, y `class` como ultimo recurso).
- Activa el **modo inspector** desde el panel para resaltar y loguear los elementos candidatos del DOM
  actual de Flow y copiar los selectores reales. *(Inspector: TODO en el stub del driver.)*

## Seguridad

- Delays variables entre acciones y concurrencia limitada (1-2) para no saturar la cuenta.
- **CAPTCHA / verificacion de bot -> PARADA DURA**: la extension avisa en el panel y **no** intenta
  resolverlo ni evadirlo.
- **Sin creditos -> pausa y avisa**, no reintenta en bucle.

## Estructura

```
manifest.json
background/service-worker.js     orquestador: cola, estado, dry-run, descargas
content/flow-driver.js           driver del DOM de Flow (STUB en esta fase)
content/selectors.config.js      selectores editables por el usuario
offscreen/frame-extractor.*      extrae el ultimo frame del clip
sidepanel/index.html|panel.js|styles.css   UI: carga JSON/personaje, controles, progreso, log
lib/messaging.js                 contrato compartido (mensajes, estado, config)
lib/json-loader.js               parser/validador del JSON  (puro, node-testable)
lib/queue.js                     resolucion de ingredientes y plan de escenas (puro)
examples/qpasaria_*.json         JSON de ejemplo (mock, 6 escenas)
tests/dryrun.test.mjs            test node del plan dry-run
CONTRACT.md                      spec interna de los modulos
```

## A confirmar contra el Flow real

- URL y rutas exactas de Flow y de cada modo (imagen vs frame-to-video).
- Selectores reales (por eso el modo inspector).
- Mecanica de subida de ingredientes (file input oculto vs drag-drop).
- Como expone Flow "generacion completada" y el boton/opcion de descarga.
- Nombres reales de modelos y aspect ratio en la UI.
