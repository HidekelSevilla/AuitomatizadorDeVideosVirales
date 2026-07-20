# Manhwa V6 — paquete limpio

Esta carpeta contiene únicamente lo que debes usar para configurar tus tres GPT y arrancar el flujo. No mezcles archivos V2.8, V3.2 o V5.3 en los Conocimientos de estos GPT.

## Configuración única

Antes de cargar V6, elimina de los Conocimientos de cada GPT las guías antiguas que ya tenía.

Para cada carpeta de rol:

1. abre `LISTO_PARA_CONFIGURAR`;
2. copia íntegro `PEGAR_EN_INSTRUCCIONES.md` al campo **Instrucciones** del GPT;
3. sube únicamente todos los archivos de `SUBIR_A_CONOCIMIENTOS`;
4. activa **Análisis de datos**.

Archivos que se suben:

- Showrunner: 2 archivos;
- Director Visual: 2 archivos;
- Auditor: 5 archivos.

## Flujo correcto

```text
Concepto/canon
  → Showrunner
  → STORY_PACKET_V6.md
  → Director Visual
  → JSON productor V6
  → Auditor (preflight y reparación)
  → JSON aprobado PROMPT_RELEASE_V6
  → queue / automatización
  → imágenes, celdas y páginas finales
```

El Showrunner no genera el JSON. El Director sí genera el JSON completo. El Auditor revisa y repara ese mismo JSON antes de colocarlo en la cola.

## Mensaje para iniciar en el Showrunner

Adjunta tu concepto o canon y envía:

```text
MODO AUTO — SHOWRUNNER MANHWA V6.

Convierte el concepto adjunto en un STORY_PACKET_V6 de producción. Respeta el canon, construye una historia causal y profesional, define MONOLOGO_LOCKED, continuidad, obligaciones visuales, emociones, acciones, escenarios y estados narrativos necesarios. Localiza validate_v6.py en tus Conocimientos y valida el archivo con --packet-only hasta obtener exit 0 y PACKET_READY_V6.

Entrega únicamente el STORY_PACKET_V6 completo como archivo Markdown y el resultado real del validador. No generes el JSON de producción.
```

## Mensaje para el Director Visual

Adjunta el `STORY_PACKET_V6.md` aprobado y envía:

```text
MODO AUTO — DIRECTOR VISUAL MANHWA V6.

Usa el STORY_PACKET_V6 adjunto como autoridad y no cambies MONOLOGO_LOCKED. Genera un único JSON productor completo, compatible con el runtime V2.8 y con metadata V6 aditiva. Incluye poses y emociones suficientes, escenarios con vistas y ángulos realmente distintos, ingredientes usados, referencias ejecutables, variedad de cámara, page_blueprint cuando corresponda, voces, dialogue y tts_export.full_script.

Localiza validate_v6.py en tus Conocimientos y corrige el JSON con --preflight hasta obtener exit 0 y PROMPT_RELEASE_V6. Entrega el JSON completo; no fragmentos ni instrucciones de composición manual.
```

## Mensaje para el Auditor

Adjunta el Story Packet y el JSON completo del Director, y envía:

```text
MODO AUTO_REPAIR_PREFLIGHT — AUDITOR MANHWA V6.

Audita y repara el mismo JSON completo. Comprueba estructura runtime V2.8, ingredients[], poses, emociones, escenarios/views, referencias resolubles, variedad de cámara, layouts multipanel, continuidad, voz, dialogue y tts_export.full_script. No cambies MONOLOGO_LOCKED.

Localiza validate_v6.py en tus Conocimientos y ejecuta --preflight hasta obtener exit 0 y PROMPT_RELEASE_V6. Devuelve el JSON final completo aprobado y un resumen de las reparaciones.
```

Solo el JSON final aprobado por el Auditor se coloca en `queue`.
