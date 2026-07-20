# Conocimiento — Director Visual Manhwa V7

## 1. Autoridad y salida

El Director traduce el `STORY_PACKET_V7` a un único JSON productor compatible con el preset manhwa. No cambia historia, orden causal, canon, estados, IDs ni `MONOLOGO_LOCKED`.

V7 usa una sola estrategia visual: `GROK_NATIVE_PAGE`. Cada escena visual hace una solicitud a Grok y recibe una página vertical terminada. El fondo blanco o negro, el espacio negativo, los paneles, los insets y las ilustraciones pertenecen al mismo `image_prompt`.

El archivo final esperado de `scene_07` es `images/scene_07.jpg`. No existe una segunda fase visual.

## 2. Estructura runtime preservada

La raíz conserva estas familias:

```text
project, pipeline, characters, ingredients, escenarios, scenes,
editing, narration_track, tts_export, v7_contract, production_lock, obligation_map
```

Reglas:

- `project.preset` es `manhwa`; aspecto `9:16`; FPS 30.
- `characters` es objeto.
- `ingredients` es arreglo tipado, nunca objeto.
- `escenarios` es objeto con views explícitas.
- `scenes` es arreglo.
- `tts_export` conserva el contrato V2.8.
- `visual` contiene exclusivamente `image_prompt`.
- `visual_plan` y `continuity` viven al nivel de la escena; son metadata de dirección y auditoría.
- `references` permanece al nivel de la escena para el runtime.
- `obligation_map` conserva `must_be_own_generated_page` del packet. Cuando es `true`, asigna una o más scene/page exclusivas y `may_share_page` debe ser `false`: la exclusividad impide compartir esas páginas con otra obligación, pero no limita la obligación a una sola página. No uses el campo legado `must_be_own_source`.

Contrato raíz:

```json
{
  "v7_contract": {
    "version": "7.0",
    "generation_mode": "GROK_NATIVE_PAGE",
    "mode": "PRODUCTION",
    "timeline_model": "NARRATION_VISUAL_TRACKS_V1",
    "production_panel_count": 43,
    "canvas": { "width": 720, "height": 1280 },
    "thresholds": {
      "min_non_eye_level_pct": 20,
      "min_non_frontal_pct": 35,
      "max_identical_signature_run": 2,
      "min_distinct_page_layouts": 6,
      "max_generation_attempts": 3,
      "min_camera_match_pct": 90,
      "min_distinct_camera_signatures": 6,
      "max_minor_failures_pilot": 1,
      "max_minor_failure_pct_production": 2
    },
    "runtime_adapter": {
      "grok_native_full_page": true,
      "page_blueprint_slots_integrated": false
    },
    "page_mix": {
      "basis": "TYPE_PANEL_ONLY",
      "method": "LARGEST_REMAINDER",
      "ratios": { "white": 30, "black": 30, "other": 40 },
      "counts": { "white": 13, "black": 13, "other": 17 }
    }
  }
}
```

`mode` admite `PILOT` o `PRODUCTION`, pero no es una elección libre del Director. El mapping obligatorio es:

- `packet_scope: PRODUCTION_PART` → `mode:"PRODUCTION"` → entre 30 y 55 escenas `type:"panel"`;
- `packet_scope: PILOT_FRAGMENT` → `mode:"PILOT"`, únicamente cuando el usuario pidió expresamente una prueba;
- `packet_scope: VALIDATOR_FIXTURE` → fixture interno, nunca salida publicable.

Una entrega con `project.target_runtime_seconds >= 60` jamás puede ser `PILOT`. Está prohibido cambiar una producción a `PILOT` o ajustar `pilot_panel_count` para legitimar pocas escenas.

Los `STORY_BEATS`, átomos y obligaciones describen unidades narrativas, no el número final de páginas. No hagas mapping 1:1 beat→scene. En producción, desglosa cada beat según sus cambios visuales en páginas de acción, reacción, detalle, revelación, relación o respiro hasta construir 30–55 escenas, sin inventar eventos ni modificar el monólogo.

Toda producción declara `production_panel_count` entre 30 y 55 y debe entregar exactamente ese número. Para una parte estándar de 90–100 segundos usa 43 salvo que el Story Packet justifique otra densidad. Declara `timeline_model:"NARRATION_VISUAL_TRACKS_V1"`: no es otro flujo, sino la separación interna entre las líneas inmutables de voz y las páginas que Grok muestra durante ellas.

El proveedor canónico es `pipeline.image_generation.tool:"grok"` en minúsculas. El preset Manhwa V7 no usa Flow para imágenes.

## 3. Estructura de cada escena visual

```json
{
  "id": "scene_12",
  "type": "panel",
  "render_mode": "static",
  "narration_ref": {
    "unit_id": "A012",
    "timing_weight": 1.25
  },
  "references": {
    "characters": [
      { "id": "cleaner", "pose": "fear_braced" }
    ],
    "escenario": {
      "id": "morgue",
      "view": "north_corridor",
      "geometry_authority": "GEOMETRY_LOCK"
    }
  },
  "visual": {
    "image_prompt": "One complete natural English prompt sent directly to Grok"
  },
  "visual_plan": {
    "native_page": {
      "family": "BLACK_PAGE",
      "layout": "BLACK_COMPOSITE_2",
      "background_pct": 60,
      "panel_count": 2,
      "composition": "exactly two image panels; one dominant encounter panel and one smaller reaction panel with black breathing room"
    },
    "shots": [
      {
        "panel_id": "A",
        "content_role": "PRIMARY",
        "visible_entities": ["cleaner", "eyeless_canine"],
        "location_id": "morgue",
        "view_id": "north_corridor",
        "camera": {
          "scale": "FULL",
          "elevation": "LOW",
          "viewpoint": "PROFILE",
          "azimuth_deg": 90,
          "lens_mm": 35,
          "roll_deg": 0,
          "dominant_subject": "eyeless_canine",
          "occupancy_pct": 70
        },
        "prompt_fragment": "Panel A: full-body shot, low-angle, profile view, level camera roll, using a 35mm lens..."
      },
      {
        "panel_id": "B",
        "content_role": "REACTION",
        "visible_entities": ["cleaner"],
        "location_id": "morgue",
        "view_id": "service_door_axis",
        "camera": {
          "scale": "CLOSE",
          "elevation": "HIGH",
          "viewpoint": "THREE_QUARTER_FRONT",
          "azimuth_deg": 25,
          "lens_mm": 75,
          "roll_deg": -12,
          "dominant_subject": "cleaner",
          "occupancy_pct": 78
        },
        "prompt_fragment": "Panel B: close shot, high-angle, three-quarter front view, subtle Dutch angle, using a 75mm lens..."
      }
    ]
  },
  "continuity": {
    "moment_id": "M_012",
    "state_in": {},
    "state_out": {},
    "identity_ids": ["cleaner", "eyeless_canine"],
    "location_id": "morgue",
    "lighting_id": "violet_alarm",
    "approved_reference_hashes": []
  },
  "transition_in": "cut",
  "editor_motion": {
    "enabled": false,
    "preset": "static",
    "zoom": 1,
    "pan": 0
  }
}
```

Claves exactas:

- `visual_plan` contiene solo `native_page` y `shots`.
- `native_page` contiene `family`, `layout`, `background_pct`, `panel_count`, `composition`.
- Cada shot contiene `panel_id`, `content_role`, `visible_entities`, `location_id`, `view_id`, `camera`, `prompt_fragment`.
- Cada camera contiene `scale`, `elevation`, `viewpoint`, `azimuth_deg`, `lens_mm`, `roll_deg`, `dominant_subject`, `occupancy_pct`.

## 4. Mezcla 30/30/40

Para `N` escenas `type:"panel"`:

1. calcula `N×0.30`, `N×0.30`, `N×0.40`;
2. toma los pisos;
3. reparte los restantes por residuo descendente;
4. en empate usa white, black, other.

Ejemplos:

- 10 → 3 WHITE, 3 BLACK, 4 OTHER.
- 43 → 13 WHITE, 13 BLACK, 17 OTHER.

Una `narrative_card` no entra en `N`.

Declara siempre `page_mix.basis:"TYPE_PANEL_ONLY"`; ningún otro tipo de escena entra en la mezcla.

Reglas de secuencia:

- máximo dos familias iguales seguidas;
- ningún layout idéntico en escenas adyacentes;
- al menos `min(6,N)` layouts distintos;
- entre 20% y 40% de páginas llevan dos o tres paneles;
- máximo `floor(0.10×N)` triptychs.

## 5. Familias y layouts

### WHITE_PAGE

`background_pct` entre 30 y 90.

- `WHITE_INSET`: 1 panel.
- `WHITE_COMPOSITE_2`: 2 paneles.
- `WHITE_ISOLATE`: 1 panel.
- `WHITE_FRAGMENT`: 1 panel.
- `WHITE_ACTION_STRIP_2`: 2 paneles.
- `WHITE_TRIPTYCH`: 3 paneles.

El prompt incluye literalmente:

```text
Pure white webtoon page
white space occupying N% of the canvas
```

También se acepta `N% untouched white space`.

### BLACK_PAGE

`background_pct` entre 45 y 75. El rango recomendado es 45–70.

- `BLACK_INSET`: 1 panel.
- `BLACK_COMPOSITE_2`: 2 paneles.
- `BLACK_REVEAL_STRIP`: 1 panel.
- `BLACK_FLOATING_DETAIL`: 2 paneles.
- `BLACK_TRIPTYCH`: 3 paneles.

El prompt incluye literalmente:

```text
Matte-black webtoon page
black space occupying N% of the canvas
```

### OTHER

`background_pct` es exactamente 0.

- `FULL_BLEED`: 1, ancla `Full-bleed vertical webtoon panel`.
- `SPLASH`: 1, ancla `Full-page vertical manhwa splash panel`.
- `CHARACTER_CLOSEUP`: 1, ancla `Full-page vertical character close-up`.
- `OBJECT_DETAIL`: 1, ancla `Full-page vertical object detail`.
- `ENVIRONMENT_BREATHER`: 1, ancla `Full-page vertical environment breather`.
- `TALL_ACTION`: 1, ancla `Tall vertical action panel`.

OTHER no declara espacio blanco o negro reservado.

## 6. Conteo inequívoco de paneles

Esta regla evita que una frase como `with one inset` produzca dos regiones inesperadas o un bocadillo cortado.

`native_page.composition` y `image_prompt` incluyen literalmente:

- 1 → `exactly one image panel`
- 2 → `exactly two image panels`
- 3 → `exactly three image panels`

Con 2 o 3, los fragmentos empiezan exactamente por `Panel A:`, `Panel B:` y `Panel C:`.

`with one inset` puede acompañar la instrucción, pero nunca sustituye el conteo exacto.

## 7. Ejemplos de prompts naturales

### WHITE_INSET

```text
Pure white webtoon page with one inset; white space occupying 55% of the canvas. exactly one image panel; one small inset panel containing the complete worried portrait and deliberate vertical breathing room. Panel A: close shot, eye-level angle, profile view, level camera roll, using a 70mm lens. A young Korean cleaner in his mid twenties, lean build, narrow tired face, short rain-wet black hair, gray industrial coverall with reflective seam, charcoal rubber gloves, muted gray and cold blue palette, small scar under the left eyebrow holds worn cash near his chest; brows lifted inward, jaw clenched, shoulders tense, gaze fixed on the money, both hands visible. Sealed municipal morgue service chamber with rectangular circulation, poured concrete, brushed steel and grated drains, autopsy table at the north wall, cold blue-gray palette; east service-door axis reveals the drain and steel wall anchors. Hand-drawn Korean manhwa webtoon illustration, 2D flat cel shading, crisp lineart, vertical 9:16 composition. no readable text, no speech bubbles, no captions, no watermark, no logo.
```

`WHITE_INSET` significa un solo panel pequeño insertado que contiene toda la acción. Si la intención es mostrar un retrato principal y un detalle separado del dinero, usa `WHITE_COMPOSITE_2`:

```text
Pure white webtoon page with two-panel composite; white space occupying 50% of the canvas. exactly two image panels; one dominant worried portrait and one smaller isolated money detail with deliberate vertical breathing room. Panel A: close shot, eye-level angle, profile view, level camera roll, using a 70mm lens. [FIRMA FÍSICA COMPLETA]; [EMOCIÓN, CUERPO, MIRADA Y MANOS]; [ESCENARIO ROOT]; [VIEW ABSOLUTA]. Panel B: macro, high-angle, point-of-view, level camera roll, using a 100mm lens. [FIRMA FÍSICA COMPLETA REPETIDA]; charcoal rubber-gloved hands hold the worn cash; [EMOCIÓN, CUERPO, MIRADA Y MANOS]; [ESCENARIO ROOT]; [VIEW ABSOLUTA]. Hand-drawn Korean manhwa webtoon illustration, 2D flat cel shading, crisp lineart, vertical 9:16 composition. no readable text, no speech bubbles, no captions, no watermark, no logo.
```

### BLACK_COMPOSITE_2

```text
Matte-black webtoon page with two-panel composite; black space occupying 60% of the canvas. exactly two image panels; one dominant confrontation panel and one smaller chest-detail panel with strong black breathing room. Panel A: full-body shot, low-angle, profile view, level camera roll, using a 35mm lens. [DESCRIPCIÓN FÍSICA COMPLETA DEL LIMPIADOR] faces [DESCRIPCIÓN FÍSICA COMPLETA DE LA CRIATURA SIN OJOS]; [EMOCIÓN, CUERPO, MIRADA Y MANOS]; [ESCENARIO ROOT]; [VIEW ABSOLUTA]. Panel B: macro, high-angle, point-of-view, subtle Dutch angle, using a 100mm lens. [DESCRIPCIÓN COMPLETA DE LA CRIATURA] with the violet chest seam opening; [VIEW ABSOLUTA]. Hand-drawn Korean manhwa webtoon illustration, 2D flat cel shading, crisp lineart, vertical 9:16 composition. no readable text, no speech bubbles, no captions, no watermark, no logo, no eyes, no eye sockets, no pupils.
```

### ENVIRONMENT_BREATHER

```text
Full-page vertical environment breather. exactly one image panel; a quiet spatial reset showing the entire service corridor before the next threat. Panel A: true long shot, high-angle, rear view, level camera roll, using a 24mm lens. [ESCENARIO ROOT COMPLETO]; [VIEW ABSOLUTA COMPLETA]. No person is visible. Hand-drawn Korean manhwa webtoon illustration, controlled lineart, vertical 9:16 composition. no readable text, no speech bubbles, no captions, no watermark, no logo.
```

En `scene.visual.image_prompt` no uses etiquetas `CAMERA:`, `SUBJECTS:`, `ACTION:` ni el formato máquina de siete líneas: la cámara se escribe como prosa natural. Esta prohibición no aplica a los prompts generadores de assets. Cada `escenarios.<id>.views.<view>.prompt` conserva exactamente siete líneas físicas, en este orden: `CAMERA:`, `SUBJECTS:`, `ACTION:`, `ENVIRONMENT:`, `LIGHTING:`, `STYLE:`, `NEGATIVE:`. Su línea `CAMERA:` coincide exactamente con `camera_signature`; `SUBJECTS:` incluye `empty environment` y `no characters`; `ACTION:` incluye `static identity plate`; `ENVIRONMENT:` repite las firmas raíz y de view.

## 8. Personajes y criaturas autosuficientes

Cada personaje recurrente contiene:

```json
{
  "descriptor_profile": {
    "age": "...",
    "build": "...",
    "face": "...",
    "hair_or_skin": "...",
    "wardrobe": "...",
    "materials": "...",
    "colors": "...",
    "marks": "..."
  },
  "prompt_signature": "...",
  "negative_invariants": ["..."],
  "poses": {}
}
```

`prompt_signature` incluye literalmente las ocho dimensiones. Cada pose contiene `performance_signature` con:

- `emotion`;
- `body`;
- `gaze`;
- `hands`.

Para cada personaje visible, su `prompt_fragment` repite la firma completa y los cuatro rasgos de performance. Escribir solamente `Mujin looks worried` es inválido.

Para una criatura sin ojos, sus invariantes pueden incluir `no eyes`, `no eye sockets`, `no pupils` y `no glowing facial marks`. Deben repetirse literalmente en el prompt final.

Variedad:

- para `A` apariciones de un personaje, usa al menos `min(6,A,ceil(sqrt(A)))` poses;
- la misma pose no aparece más de tres escenas seguidas;
- las performances de las poses son distintas y observables.

## 9. Escenarios y views

Cada escenario contiene:

```json
{
  "descriptor_profile": {
    "architecture": "...",
    "layout": "...",
    "materials": "...",
    "anchors": "...",
    "palette": "..."
  },
  "spatial_role": "PRIMARY",
  "prompt_signature": "...",
  "views": {}
}
```

Cada view posee una `prompt_signature` espacial absoluta. Describe arquitectura, conexiones cardinales, materiales y anchors; no dice `same place`, `same geometry` ni `same materials`.

Cada `prompt_fragment` repite la firma raíz y la firma de su `view_id`.

Una view generada conserva `camera_signature` y un prompt de asset estructurado. Este bloque no se envía como `scene.visual.image_prompt`:

```text
CAMERA: scale=ENVIRONMENT_WIDE; elevation=LOW; viewpoint=PROFILE; azimuth_deg=90; lens_mm=35; roll_deg=0; dominant_subject=environment; occupancy_pct=100.
SUBJECTS: empty environment, no characters.
ACTION: static identity plate with fixed architectural anchors.
ENVIRONMENT: [PROMPT_SIGNATURE RAÍZ COMPLETA]; [PROMPT_SIGNATURE DE VIEW COMPLETA].
LIGHTING: cold fluorescent ceiling illumination with restrained alarm spill.
STYLE: hand-drawn Korean manhwa environment reference, flat cel shading, crisp lineart, precise architecture and materials, high-resolution vertical 9:16 source.
NEGATIVE: no readable text, no speech bubbles, no watermark, no logo, no people, no movable walls.
```

La línea `CAMERA:` serializa exactamente los ocho valores de `camera_signature`; no los traduce ni redondea.

Mínimos de uso:

- PRIMARY: 6 views;
- SECONDARY: 3;
- INCIDENTAL: 1.

En un PRIMARY con al menos seis tomas, la misma view no supera dos usos consecutivos ni 35% del total.

## 10. Cámara natural y variedad

Enums:

- scale: `MACRO`, `EXTREME_CLOSE`, `CLOSE`, `MEDIUM`, `FULL`, `WIDE_MASTER`, `TRUE_LONG`;
- elevation: `EYE_LEVEL`, `LOW`, `HIGH`, `BIRDS_EYE`, `TOP_DOWN`, `WORMS_EYE`, `KNEE_LEVEL`, `GROUND_LEVEL`;
- viewpoint: `FRONT`, `THREE_QUARTER_FRONT`, `PROFILE`, `OTS`, `POV`, `REAR`, `REAR_THREE_QUARTER`.

Cada valor aparece también como frase natural:

- `CLOSE` → `close shot` o `close-up`;
- `LOW` → `low-angle`;
- `PROFILE` → `profile view`;
- roll menor de 10° → `level camera roll` o `level horizon`;
- roll expresivo → `Dutch angle`, `Dutch tilt` o `camera roll`.
- `lens_mm:70` → una frase natural literal como `using a 70mm lens` dentro del mismo `prompt_fragment`.

En una página multipanel, al menos un par de cámaras cambia dos dimensiones materiales. A lo largo de la secuencia:

- al menos 20% de tomas humanas no son eye-level;
- al menos 35% no son FRONT/THREE_QUARTER_FRONT;
- existen familias high, low, OTS/POV y profile/rear;
- existen al menos seis firmas de cámara distintas;
- al menos 60% de transiciones cambian dos dimensiones materiales;
- una firma exacta no se repite más de dos veces.

## 11. Motion

WHITE_PAGE y BLACK_PAGE usan exactamente:

```json
{
  "enabled": false,
  "preset": "static",
  "zoom": 1,
  "pan": 0
}
```

La página ya llega diseñada por Grok. El motion estático evita que el video recorte espacio negativo, bordes o insets.

OTHER puede ser estático. Si se mueve:

- preset `slow_zoom` o `slow_pan`;
- zoom entre 1 y 1.08;
- pan entre 0 y 0.03.

## 12. Continuidad, referencias y TTS

`scene.continuity.state_in` copia exactamente el `state_out` de la escena visual anterior. Cambiar location o lighting requiere `continuity_change_reason`.

`scene.references` usa IDs y poses/views existentes. Con `GEOMETRY_LOCK`, `scene.references.escenario.id/view` coincide exactamente con `visual_plan.shots[0].location_id/view_id`, y la cámara del primer shot es compatible con la `camera_signature` de esa view. El runtime adjunta esa única view como referencia ambiental primaria; si una página tiene paneles B/C con otros ángulos, sus fragmentos deben repetir la identidad espacial absoluta completa y no depender de que el runtime adjunte esas otras views. Las cámaras y `view_id` de B/C son metadata editorial: mantenlas coherentes cuando sea posible, pero su discrepancia solo produce una advertencia y nunca debe eliminar un ángulo profesional ya expresado correctamente en `visual.image_prompt`. `IDENTITY_ONLY` es excepcional, exige `identity_only_reason` y no supera 10%.

No reduzcas `scene.references` para obedecer un supuesto máximo de tres: V7 no tiene ese tope local. La extensión deduplica y adjunta todos los personajes, assets, ingredientes, la view ambiental y las escenas previas que pueda resolver, y comprueba que Grok haya creado todos los chips antes de enviar. Conserva únicamente referencias útiles y resolubles; si el proveedor no acepta una carga, el runtime debe fallar de forma explícita y nunca omitir silenciosamente la cuarta referencia.

`tts_export` declara:

```text
language, mode:"dialogue", model_id, elevenlabs_speed, edit_speed,
voices, dialogue, full_script
```

Producción usa una pista de narración inmutable:

```json
{
  "narration_track": {
    "version": "1.0",
    "canonicalization": "NFC_LF_UTF8_NO_TRAILING_LF",
    "join": "LF",
    "unit_count": 24,
    "units": [
      { "id": "A001", "speaker": "narrador", "text": "Primera línea exacta del MONOLOGO_LOCKED." }
    ]
  }
}
```

Cada unidad copia `atom_id` y `text_exact` de `MACHINE_LOCK_V7`, en el mismo orden y sin CR/LF interno. El join LF de `units[].text` es exactamente `tts_export.full_script` y `MONOLOGO_LOCKED`. Cada página `type:"panel"` omite `voiceover` y `captions` y declara un solo `narration_ref` con `unit_id` existente y `timing_weight>0`. Una unidad puede poseer varias páginas; cada unidad posee al menos una. El runtime alinea las unidades y distribuye su intervalo entre sus páginas sin cambiar la duración ni el texto.

`tts_export.dialogue` contiene una fila por unidad, usando como `scene_id` la primera página que esa unidad posee, y copia speaker/text exactos. No uses `full_script` en raíz ni `tts_export.voice_id` singular.

## 13. Gate del Director

Ejecuta:

```text
python "<RUTA_CONOCIMIENTOS>/validate_v7.py" --preflight "<project.json>"
```

Exit 0 y `PROMPT_RELEASE_V7` son obligatorios. No declares PASS por inspección informal.
