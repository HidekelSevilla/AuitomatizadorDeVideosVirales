# Spec del JSON — preset `videos_asmr` (Higgsfield / Kling 3.0 encadenado)

> Pégale ESTE documento a tu chat generador de JSON. Es la especificación exacta para que
> escriba videos ASMR encadenados que el pipeline puede correr sin alucinar.

## Qué es este preset

Video largo armado por **clips cortos encadenados**. Cada clip es un video de **máximo 7 segundos**
generado en Higgsfield (Kling 3.0, Multi-shot ON, audio ON). El truco de continuidad:

> El **último frame** de cada clip se usa como **primer frame (start frame)** del siguiente.

Por eso NO hay "imagen por escena" como en otros presets: el start frame del clip N **es** la última
imagen del clip N-1 (la extrae el pipeline automáticamente). Solo el **clip 1** puede arrancar de una
imagen semilla del personaje (`seed_image`) o de puro texto.

Resultado: una escena continua (mismo set, mismo personaje) donde cada clip avanza UNA acción.

---

## La regla de oro contra la alucinación

El modelo alucina cuando le pides varias cosas a la vez o no le dices qué YA existe en cuadro
(por eso ponía "la carpa encima de la fogata y luego rehacía la fogata"). Para evitarlo, **cada clip
debe**:

1. **UNA sola acción principal** (no "arma la carpa Y corta leña Y prende el fuego"). Una.
2. Decir **qué ya está en cuadro** (viene heredado del frame anterior) en `continuity_note`, para que
   el modelo NO lo vuelva a crear.
3. Decir **qué NO hacer / qué no mover** en `avoid` (ej: "no reconstruyas la fogata; ya existe").
4. **Disposición espacial explícita**: dónde está cada objeto ("la fogata abajo-izquierda, la carpa a
   la derecha, los árboles al fondo"). Repetir las MISMAS posiciones en todos los clips.
5. Repetir el **bloque de personaje** (`character.bible`) en cada prompt: misma ropa, colores, edad,
   estilo. El generador debe incrustarlo en cada `animation_prompt`.
6. Sonidos **ASMR concretos** y diegéticos (que el objeto en cuadro produce), en `asmr`.

Consistencia del personaje = (a) `seed_image` en el clip 1 + (b) el encadenado de frames lo arrastra
solo + (c) el `bible` repetido en cada prompt. Las tres capas juntas.

---

## Estructura del JSON

```jsonc
{
  "project": {
    "title": "ASMR — Acampar en el bosque (Ghibli)",
    "slug": "asmr_acampar_ghibli",          // carpeta de medios en remotion-editor/public/<slug>/
    "preset": "videos_asmr",                 // <- OBLIGATORIO, activa este flujo
    "aspect_ratio": "9:16",                  // "9:16" (Reels/Shorts) o "16:9"
    "language": "es-MX"
  },

  "pipeline": {
    // Este preset es solo-video encadenado. No hay fase de imagen por escena.
    "animation": {
      "tool": "higgsfield",                  // <- proveedor del clip (Higgsfield/Kling)
      "model": "kling-3.0",
      "multishot": true,                     // Multi-shot ON (varias tomas dentro del clip)
      "audio": true                          // audio ASMR generado por Kling
    }
  },

  // Bloque de personaje: el generador lo incrusta TEXTUALMENTE en cada animation_prompt.
  "character": {
    "name": "excursionista",
    "bible": "Studio Ghibli hand-painted anime style, a young hiker around 20, short brown hair, cream rolled-up shirt, blue trousers, leather belt, soft warm cinematic lighting, consistent same character every shot",
    "seed_image": "characters/excursionista_ghibli.png"  // OPCIONAL: still del clip 1 (en public/<slug>/characters/ o assets/). Si falta, el clip 1 es texto->video.
  },

  // Pista de música global OPCIONAL (se mezcla en la edición final, no en el clip).
  "audio": { "music_file": "music/bosque.mp3", "music_volume": 0.15 },

  "scenes": [
    {
      "scene_id": "s1",
      "duration_s": 7,                       // <= 7 (tope que pediste). Kling admite 3-15.
      "visual": {
        // UNA acción. Incluye personaje (bible), layout espacial y los sonidos ASMR.
        "animation_prompt": "Studio Ghibli hand-painted anime style. The young hiker walks the last steps into a forest clearing and stops, looking around. Tall trees in the background, soft afternoon light. ASMR: crunchy footsteps on dry leaves and twigs, distant birdsong. Smooth slow cinematic camera."
      },
      "asmr": ["crunchy footsteps on leaves", "a twig snapping", "distant birds"],
      "continuity_note": "Primer clip. Establece el claro del bosque y al personaje.",
      "avoid": "no tent or fire yet; keep it simple, just arriving"
    },
    {
      "scene_id": "s2",
      "duration_s": 7,
      "visual": {
        "animation_prompt": "Studio Ghibli hand-painted anime style, same young hiker, same forest clearing. The hiker crouches and places smooth grey stones one by one in a circle on the ground to build a fire pit. Trees in the background, warm light. ASMR: stones clacking together, soft grunts, leaves rustling."
      },
      "asmr": ["stones clacking", "pebbles settling", "leaves rustling"],
      "continuity_note": "Arranca del frame final de s1: el personaje ya está de pie en el claro. NO recrear el bosque, ya existe.",
      "avoid": "do not build a tent here; only the stone fire ring on the ground, lower-center of frame"
    },
    {
      "scene_id": "s3",
      "duration_s": 7,
      "visual": {
        "animation_prompt": "Studio Ghibli hand-painted anime style, same young hiker, same clearing with the finished stone fire ring already on the ground (lower-center). The hiker unrolls a beige tent canvas and raises it to the RIGHT side of the clearing, away from the fire ring. ASMR: fabric rustling, tent poles clicking together, soft footsteps."
      },
      "asmr": ["fabric rustle", "tent poles clicking", "footsteps on dirt"],
      "continuity_note": "El anillo de piedras YA está hecho desde s2 (abajo-centro). La carpa va a la DERECHA, separada del fogón.",
      "avoid": "do NOT place the tent on top of the fire ring; do NOT rebuild the stones; tent goes to the right"
    },
    {
      "scene_id": "s4",
      "duration_s": 7,
      "visual": {
        "animation_prompt": "Studio Ghibli hand-painted anime style, same young hiker, the pitched beige tent on the right and the stone fire ring lower-center. The hiker splits a small log with a hatchet, then stacks the firewood inside the ring and the first small campfire flames crackle to life. ASMR: crisp axe thwack, wood splitting, logs tumbling, fire crackling."
      },
      "asmr": ["axe thwack", "wood splitting", "fire crackling"],
      "continuity_note": "La carpa (derecha) y el anillo de piedras (abajo-centro) YA existen. Solo agregar leña + fuego dentro del anillo.",
      "avoid": "do not move or rebuild the tent or the stone ring; the fire goes INSIDE the existing ring"
    }
  ]
}
```

---

## Campos (referencia rápida)

| Campo | Quién lo usa | Notas |
|---|---|---|
| `project.preset` | pipeline | DEBE ser `"videos_asmr"`. |
| `project.aspect_ratio` | driver | `"9:16"` o `"16:9"`. Lo toma el clip 1; los demás heredan del frame. |
| `pipeline.animation.tool` | router | `"higgsfield"`. |
| `pipeline.animation.multishot` / `audio` | driver | toggles de la UI (ON/ON). |
| `character.bible` | generador | se incrusta en CADA `animation_prompt`. |
| `character.seed_image` | driver | start frame del clip 1 (opcional). |
| `scenes[].duration_s` | driver | **<= 7**. |
| `scenes[].visual.animation_prompt` | driver | el prompt del clip. UNA acción + bible + layout + ASMR. |
| `scenes[].asmr` | generador/edición | lista de sonidos (refuerza el prompt; útil para la mezcla final). |
| `scenes[].continuity_note` | generador | qué YA está en cuadro (heredado). Reduce alucinación. |
| `scenes[].avoid` | generador | qué NO hacer/mover. Reduce alucinación. |

> El **encadenado** (sacar el último frame y ponerlo de start frame del siguiente) lo hace el pipeline
> SOLO. El generador NO pone rutas de frames; solo escribe prompts coherentes con `continuity_note`.

---

## Checklist para el generador (antes de entregar el JSON)

- [ ] Cada `animation_prompt` describe **UNA** acción principal.
- [ ] Cada `animation_prompt` empieza con el estilo + el `character.bible` (mismo personaje).
- [ ] Posiciones de objetos **idénticas** entre clips (fogón abajo-centro, carpa derecha, etc.).
- [ ] `continuity_note` dice qué ya existe; `avoid` dice qué no recrear/mover.
- [ ] Sonidos ASMR concretos y diegéticos en `asmr` y mencionados en el prompt.
- [ ] `duration_s` <= 7 en todas.
- [ ] La secuencia de acciones tiene orden lógico (no prendas el fuego antes de poner la leña).
