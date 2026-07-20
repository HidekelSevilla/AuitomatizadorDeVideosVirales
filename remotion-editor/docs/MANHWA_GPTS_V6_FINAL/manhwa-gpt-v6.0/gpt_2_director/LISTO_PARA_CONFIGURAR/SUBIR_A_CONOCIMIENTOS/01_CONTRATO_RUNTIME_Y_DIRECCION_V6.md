# Contrato canónico del Director Visual Manhwa V6

## 1. Un único JSON: V2.8 ejecutable + V6 aditivo

```json
{
  "project": {},
  "pipeline": {},
  "characters": {},
  "ingredients": [],
  "escenarios": {},
  "scenes": [],
  "editing": {},
  "tts_export": {},
  "v6_contract": {},
  "production_lock": {},
  "obligation_map": []
}
```

Ubicación HARD: `ingredients` es arreglo; personajes conservan `poses`; escenarios conservan `views`; referencias ejecutables viven en cada panel/slot; voz vive en `tts_export.voices.narrador` o `pipeline.tts.voice_id`; guion completo vive en `tts_export.full_script`. Metadata V6 nunca sustituye estas claves.

## 2. Cabecera runtime

```json
{
  "project": {
    "title": "Título Parte 1",
    "preset": "manhwa",
    "serie": "serie_estable",
    "slug": "serie_parte_01",
    "language": "es-419",
    "aspect_ratio": "9:16",
    "fps": 30,
    "part": 1,
    "reuse_ingredients": true
  },
  "pipeline": {
    "image_generation": {"tool": "grok"},
    "animation": {"tool": "none"},
    "tts": {"tool": "elevenlabs", "voice_id": "VOICE_APROBADA", "language": "es-419"},
    "editing": {"tool": "capcut"}
  }
}
```

## 3. Personajes con poses utilizables

```json
{
  "characters": {
    "iseok": {
      "display_name": "Iseok",
      "poses": {
        "base_neutral": {
          "mode": "generate",
          "asset": "assets/characters/serie/iseok_base_neutral.png",
          "prompt": "Full-body neutral identity reference of Iseok ..."
        },
        "fear_profile": {
          "mode": "generate",
          "asset": "assets/characters/serie/iseok_fear_profile.png",
          "reference_pose": "base_neutral",
          "prompt": "Same Iseok, same face, hair, proportions and outfit, fearful profile ..."
        },
        "resolve_action": {
          "mode": "generate",
          "asset": "assets/characters/serie/iseok_resolve_action.png",
          "reference_pose": "base_neutral",
          "prompt": "Same Iseok ... resolved expression and defensive action stance ..."
        }
      }
    }
  }
}
```

Cada pose tiene `mode`, `asset`, `prompt`; una derivada tiene `reference_pose`. No uses solo `display_name/prompt_signature/mode`.

Las bases usan fondo neutral, identidad legible y cero props no canónicos. Las variantes no hornean el escenario completo ni una composición que después domine el nuevo plano.

Cobertura profesional:

- protagonista recurrente: base + ≥4 variantes usadas de orientación, emoción, acción y estado;
- secundario recurrente: base + ≥2 variantes usadas;
- herida, transformación, ropa o poder persistente: variante propia desde la causa;
- miedo, rabia, dolor, determinación, sospecha o alivio decisivos tienen apoyo compatible;
- la misma pose no domina más de dos fuentes seguidas salvo MATCH motivado.

## 4. Escenarios con vistas/ángulos

```json
{
  "escenarios": {
    "morgue_cleanup_room": {
      "display_name": "Sala de limpieza de la morgue",
      "views": {
        "wide_base": {
          "mode": "generate",
          "asset": "assets/escenarios/serie/morgue_wide_base.png",
          "prompt": "Empty morgue cleanup room, wide establishing view ...",
          "camera_signature": {"elevation": "EYE_LEVEL", "viewpoint": "FRONT"}
        },
        "reverse_high": {
          "mode": "generate",
          "asset": "assets/escenarios/serie/morgue_reverse_high.png",
          "reference_view": "wide_base",
          "prompt": "Same architecture, new reverse high-angle view ...",
          "camera_signature": {"elevation": "HIGH", "viewpoint": "REAR_THREE_QUARTER"}
        },
        "floor_low_profile": {
          "mode": "generate",
          "asset": "assets/escenarios/serie/morgue_floor_low_profile.png",
          "reference_view": "wide_base",
          "prompt": "Same architecture, new floor-level profile view ...",
          "camera_signature": {"elevation": "GROUND_LEVEL", "viewpoint": "PROFILE"}
        }
      }
    }
  }
}
```

Cada view tiene `mode`, `asset`, `prompt`; una derivada tiene `reference_view`. Lugar principal recurrente: ≥4 views usadas —master, eje/reversa, alta, baja—. Lugar secundario recurrente: ≥2. Una root `reference_asset` puede representar base existente, pero las tomas recurrentes siguen necesitando views compatibles. Cambio de niebla/color no cuenta como view.

Las plates de escenario no contienen personajes recurrentes ni texto legible y muestran arquitectura/geografía suficientes para continuidad.

## 5. Ingredients como arreglo

Tipos runtime: `character`, `character_edited`, `entity`, `location_plate`, `style_frame`.

```json
{
  "ingredients": [
    {
      "id": "palm_mouth_open",
      "type": "entity",
      "generation_prompt": "Recurring supernatural palm-mouth in open state ...",
      "output_file": "assets/ingredients/serie/palm_mouth_open.png",
      "persistent": true,
      "regenerate": false
    },
    {
      "id": "iseok_bloodied_uniform",
      "type": "character_edited",
      "base": "iseok",
      "edit_prompt": "Keep Iseok identity; apply canonical torn bloodied uniform ...",
      "output_file": "assets/characters/serie/iseok_bloodied_uniform.png",
      "persistent": true,
      "regenerate": false
    }
  ]
}
```

Todo prop, criatura, UI, símbolo, arma, transformación o state visual recurrente tiene ingrediente. IDs/rutas son únicos. Un incidente no recurrente puede quedar en prompt.

Rutas HARD por tipo: `character` y `character_edited` -> `assets/characters/<serie>/`; `location_plate` -> `assets/escenarios/<serie>/`; `entity` y `style_frame` -> `assets/ingredients/<serie>/`. `ingredients/` sin el prefijo `assets/` y `assets/entities/` son rutas invalidas para este runtime.

## 6. Referencias runtime por fuente

```json
{
  "references": {
    "characters": [{"id": "iseok", "pose": "fear_profile"}],
    "ingredients": [{"ingredient_id": "palm_mouth_open"}],
    "escenario": {"id": "morgue_cleanup_room", "view": "floor_low_profile"},
    "assets": []
  }
}
```

Todo panel y slot contiene al menos una referencia resoluble. SFX/abstracción usa `entity`, `style_frame` o asset explícito. Todo ID/pose/view existe. Máximo tres referencias materiales por fuente. `references_v6` solo califica role/authority/hash; no reemplaza el objeto anterior.

## 7. Panel full-bleed completo

```json
{
  "id": "scene_01",
  "type": "panel",
  "render_mode": "static",
  "references": {
    "characters": [{"id": "iseok", "pose": "fear_profile"}],
    "ingredients": [{"ingredient_id": "palm_mouth_open"}],
    "escenario": {"id": "morgue_cleanup_room", "view": "floor_low_profile"}
  },
  "visual": {
    "source": "images/scene_01.jpg",
    "image_prompt": "SHOT: ground-level profile full shot ...",
    "shot_ledger": {
      "shot_id": "scene_01",
      "sequence_id": "SEQ_THREAT_01",
      "purpose": "DISCOVERY",
      "dominant_subject": "palm_mouth_open",
      "scale": "FULL",
      "elevation": "GROUND_LEVEL",
      "viewpoint": "PROFILE",
      "roll": "LEVEL",
      "occupancy_pct": 42,
      "human_subject_visible": true,
      "quota_eligible": true,
      "camera_intent": "make the hidden threat dominate the worker's escape route",
      "change_mode": "START",
      "change_from_shot_id": null,
      "axis_id": "morgue_axis_A",
      "screen_direction": "hero faces screen-right"
    },
    "references_v6": [],
    "continuity_lock": {}
  },
  "voiceover": {"speaker": "narrador", "text": "Texto exacto."},
  "captions": {"text": "Texto exacto.", "highlight_words": []},
  "editor_motion": {"enabled": true, "preset": "slow_push_in", "zoom": 1.04, "pan": 2},
  "transition_in": "cut"
}
```

`visual.image_prompt` nunca es `Page summary`, resumen, nota ni placeholder.

## 8. Página compuesta integrada

```json
{
  "v6_contract": {
    "version": "6.0",
    "mode": "PRODUCTION",
    "runtime_adapter": {
      "base_contract": "MANHWA_V2_8_ADDITIVE_V6",
      "single_json": true,
      "page_blueprint_slots_integrated": true,
      "slot_references_required": true
    }
  }
}
```

Cada escena compuesta conserva todos los campos runtime del panel y añade:

```json
{
  "page_blueprint": {
    "version": "6.0",
    "composition_revision": 1,
    "template": "STACKED_2",
    "background": "#ffffff",
    "reading_order": ["A", "B"],
    "gutter_px": 24,
    "safe_area": {"left": 0.04, "right": 0.04, "top": 0.04, "bottom": 0.16},
    "slots": [
      {
        "id": "A",
        "source": "images/cells/scene_12_A.jpg",
        "prompt": "SHOT: high-angle wide ...",
        "x": 0.06, "y": 0.05, "w": 0.88, "h": 0.32,
        "fit": "cover",
        "focal_point": {"x": 0.50, "y": 0.42},
        "shape": "rect", "z": 1, "rotation_deg": 0,
        "border_px": 4, "border_color": "#111111", "radius_px": 0,
        "references": {
          "characters": [{"id": "iseok", "pose": "fear_profile"}],
          "ingredients": [{"ingredient_id": "palm_mouth_open"}],
          "escenario": {"id": "morgue_cleanup_room", "view": "reverse_high"},
          "assets": []
        },
        "shot_ledger": {},
        "references_v6": [],
        "continuity_lock": {}
      }
    ]
  }
}
```

Cada slot tiene referencias runtime y V6. `STACKED_2/ASYM_2`=2 slots, `STACKED_3`=3, `BLACK_INSET/WHITE_ISOLATE`=1. Cada slot efectivo ≥260×240 px y ≥12% del canvas. Motion de página: `enabled:false,preset:static,zoom:1,pan:0`.

La automatización aplana slots, genera `images/cells/`, compone `scene_XX.jpg` y escribe `scene_XX.composition.json` antes de Remotion. No existe paso manual de composición. El journal append-only de generación no se presume; sin procedencia factual, postflight devuelve `BLOCKED_PROVENANCE`. Si falta bandera/capacidad multipanel, falla cerrado.

## 9. Cámara y ritmo

Enums:

- propósito: `MASTER`, `DISCOVERY`, `POV`, `RELATION`, `REACTION`, `INSERT`, `ANTICIPATION`, `TRAJECTORY`, `CONTACT`, `IMPACT`, `CONSEQUENCE`, `ISOLATION`, `PUNCTUATION`;
- escala: `MACRO`, `EXTREME_CLOSE`, `CLOSE`, `MEDIUM`, `FULL`, `WIDE_MASTER`, `TRUE_LONG`;
- elevación: `EYE_LEVEL`, `LOW`, `HIGH`, `BIRDS_EYE`, `TOP_DOWN`, `WORMS_EYE`, `KNEE_LEVEL`, `GROUND_LEVEL`;
- viewpoint: `FRONT`, `THREE_QUARTER_FRONT`, `PROFILE`, `OTS`, `POV`, `REAR`, `REAR_THREE_QUARTER`;
- cambio: `START`, `MATCH`, `CONTRAST`.

`CONTRAST` cambia ≥2 dimensiones; `MATCH` conserva continuidad con razón. Producción: ≥20% fuentes humanas no-eye-level, ≥35% no-frontales y evidencia de familias alta, baja, OTS/POV y perfil/espalda. Máximo dos firmas perceptivamente iguales seguidas.

Ritmo de páginas: 25–35% no-full-bleed y al menos tres templates no-full-bleed distribuidos en inicio/medio/final. `FULL_BLEED` para master/impacto/escala; `STACKED_2` causa→efecto; `ASYM_2` dominante+prueba; `STACKED_3` progresión simple; `WHITE_ISOLATE` decisión/soledad; `BLACK_INSET` amenaza/silencio.

## 10. Prompt de fuente

Inglés, normalmente 55–105 palabras, un solo instante:

```text
SHOT + sujeto/verbo/target → cámara/distancia/ocupación → emoción/contactos
→ eje/capas → lugar/hora → luz/paleta → estilo manhwa 2D → no readable text
```

Describe emoción mediante ojos, mandíbula, hombros, manos, respiración y vector corporal. En slots no menciona página, panel A/B, bordes, gutters, collage ni máscara.

## 11. TTS correcto

```json
{
  "tts_export": {
    "language": "es-419",
    "mode": "dialogue",
    "model_id": "eleven_v3",
    "elevenlabs_speed": 1.0,
    "edit_speed": 1.4,
    "voices": {"narrador": "VOICE_APROBADA"},
    "dialogue": [
      {"scene_id": "scene_01", "speaker": "narrador", "text": "Texto exacto."}
    ],
    "full_script": "Texto exacto."
  }
}
```

Cada fila coincide con `scene.voiceover`; `full_script` es la unión con LF. No moverlo a la raíz. No usar solo `tts_export.voice_id`.

## 12. Release

Preflight rechaza schema runtime roto, referencias vacías/no resolubles, recursos insuficientes, `Page summary`, cámara sin función, slots sin referencias, TTS desplazado o continuidad inválida. Solo exit 0 entrega `PROMPT_RELEASE_V6`.
