# Plan de validación mecánica V4

## Principio

El GPT crea y compila. El validador cuenta y rechaza. Una regla medible que solo vive en prosa se incumplirá de forma silenciosa.

## Resultado medido del JSON auditado

Archivo: `queue/segundo_portador_parte_01_CONTRATO_LIMPIO.json`.

El validador actual devuelve `ok: true`, cero errores y únicamente 17 warnings por combinar `references.scenes` con ingredientes. Por eso estas comprobaciones deben incorporarse al código y no quedar como casillas editoriales.

### Correcto

- JSON válido.
- 76 escenas: 75 paneles y 1 card.
- IDs únicos y secuenciales.
- Ninguna escena supera tres referencias.
- Todos los paneles son estáticos y no contienen `animation_prompt`.
- `full_script` y `dialogue[]` reflejan exactamente los voiceovers.
- `full_script`: 3.294 caracteres; cabe en una generación de voz.
- Todos los prompts declaran plano, ángulo y hora.
- 30/75 paneles no muestran al protagonista de cuerpo.

### Fallos que el validador actual dejó pasar

- 3/5 personajes carecen de pose `base`.
- 14/14 prompts de assets incluyen `at night` pese a pedir fondo gris.
- 0/14 declara expresión neutral.
- Solo 1/14 declara manos vacías.
- 9/14 assets usan encuadre medium; solo 2 son full.
- 45/74 paneles con escenario usan una cámara incompatible con la view.
- 71/80 referencias de personaje tienen escala/ángulo incompatible con el panel.
- 63/75 prompts superan 80 palabras; promedio aproximado 84–85.
- 75/75 repiten fondo pintado, rim light, alto contraste y tres capas.
- 0 paneles blancos, 0 paneles negros, 0 sepia y 1 sola card.
- 52/75 son medium o close-up.
- Hay rachas de hasta 10 medium/close sin reanclaje.
- 73/75 paneles declaran `editor_motion.enabled:false`, anulando el movimiento global.
- El monólogo supera en alrededor de 24% el objetivo editorial de 430 palabras.
- Una view de Mapo carga 43,5% de sus escenas y una del centro 42,9%.

## Validaciones HARD propuestas

### Contrato

- `CONTRACT_FIELDS`: campos permitidos por tipo y top-level.
- `ID_ORDER`: ids, slug, parte y orden.
- `ASSET_PATH`: rutas dentro de la serie.
- `REF_EXISTS`: toda pose/view/escena referenciada existe.
- `REF_COUNT`: error por encima de 3.
- `TTS_MIRROR`: unión exacta de voiceovers, dialogue espejo y speaker válido.
- `TTS_BUDGET`: bloques y cortes dentro del límite vigente.
- `STATIC_ONLY`: paneles static, sin animation prompt; cards sin campos de panel.

### Assets

- `BASE_MISSING`: todo personaje recurrente tiene `base`.
- `BASE_DIRTY`: base con hora narrativa, clima, localización, acción, poder, sangre, texto o prop de escena.
- `BASE_GEOMETRY`: base declara full body, frontal/orthographic, manos, pies y expresión neutral.
- `DERIVED_SCOPE`: derivada cambia outfit/estado y conserva sheet técnico.
- `DYNAMIC_PROP_IN_PLATE`: plate no hornea estados narrativos móviles.

### Referencias y continuidad

- `PLATE_CAMERA_CONFLICT`: metadata de view incompatible con cámara objetivo.
- `CHAR_REF_CAMERA_RISK`: referencia medium/close en master wide.
- `SCENE_REF_RELATION`: `references.scenes` solo mismo instante/estado y con delta explícito.
- `PROP_STATE_CONFLICT`: asset/plate incompatible con el estado vigente.
- `BODY_PART_OWNER`: parte corporal sin propietario, lado o contacto.

### Ejecución

- `LOCAL_MOTION_FALSE`: máximo tres overrides falsos; el resto omite el campo y hereda el ciclo global.
- `PROMPT_EMPTY_OR_DUPLICATE`: prompt ausente o duplicado.
- `PROMPT_WORDS_HARD`: error solo en extremos configurables; objetivo normal 45–70.

## Warnings editoriales

Estos avisos no deben invalidar automáticamente una parte:

- `REF_COUNT_AT_LIMIT`: exactamente tres referencias.
- `TARGET_WORDS`: desviación sobre el objetivo aprobado.
- `TIGHT_RUN`: más de cuatro medium/close sin full/wide o layout de respiro.
- `SHOT_REPEAT`: repetición funcional sin información nueva.
- `BREATH_SHARE`: menos de 25% o más de 40% de tratamientos respirables.
- `VIEW_DOMINANCE`: una view supera 40% dentro de un escenario intensivo.
- `STYLE_MONOCULTURE`: una única ancla visual en todas las clases de panel.
- `LOCATION_DOMINANCE`: una sola localización ocupa casi toda la parte sin estrategia de bottle episode.
- `BIRDSEYE_BUDGET`: más de dos extremos cenitales sin justificación.
- `RASTER_TEXT_RISK`: badge, pantalla o letrero generado sin revisión/overlay.

## Metadata mínima que falta

Para validar compatibilidad sin “interpretar” prosa, cada asset debería poder exponer metadata normalizada fuera del prompt:

```json
{
  "asset_class": "character_identity|character_state|environment_plate|dynamic_prop",
  "shot_size": "full|medium|close|wide|macro",
  "angle": "front|profile|rear|high|low|birdseye|ots|neutral",
  "camera_height": "ground|eye|elevated|overhead",
  "contains_dynamic_state": false
}
```

Esto requiere ampliar contrato/pipeline y no debe añadirse al JSON vigente hasta implementarse.

## QC visual post-render

Un prompt correcto no garantiza un archivo correcto. Antes de usar un asset:

1. ¿Aparece exactamente el sujeto solicitado?
2. ¿El fondo corresponde a la clase del asset?
3. ¿Cabe cabeza, manos y pies?
4. ¿La ropa y el estado son los canónicos?
5. ¿Hay personajes, texto o escenario no pedidos?
6. ¿La escala relativa es creíble?

El archivo `hayoon_capsule_sleep.jpg` auditado contiene un callejón, guardianes y un camión, no a Ha-yoon en una cápsula. Ese caso debe fallar por inspección visual aunque el prompt sea sintácticamente correcto.

## Riesgo de asociación incorrecta de resultados Grok

La recuperación actual recoge cualquier imagen visible en una ruta `/imagine/post/` cuando se cierra el canal, sin correlacionarla con el intento, prompt o post esperado. Después la guarda bajo el asset activo. Esto puede convertir un resultado anterior en el archivo del ingrediente reintentado.

Corrección recomendada para el pipeline:

- registrar `post_id`/URL antes de disparar
- aceptar solo un `post_id` nuevo creado por ese intento
- transportar un token de correlación hasta `COLLECT_IMAGE`
- no recuperar una imagen si la ruta no cambió desde el intento
- verificar el contenido del asset antes de marcarlo `DONE`

## Orden de implementación

1. Bases obligatorias y QC de assets.
2. Correlación de resultados Grok.
3. Compatibilidad de cámara de refs/plates.
4. Override local de motion.
5. Clases de panel y warnings de ritmo.
6. Layouts editoriales y overlays.
