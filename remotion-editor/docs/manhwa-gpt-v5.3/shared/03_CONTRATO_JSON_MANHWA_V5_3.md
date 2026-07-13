# Contrato JSON Manhwa V5.3

Este archivo canónico define forma mecánica. No contiene ideas de historia.

## 1. Campos raíz

Obligatorios:

- project
- production_lock
- pipeline
- characters
- escenarios
- scenes
- editing
- tts_export

Opcional si el proyecto lo usa:

- audio

No inventes campos raíz.

## 1.1 Production lock

El Director recibe también el archivo `STORY_PACKET`. Calcula los hashes sobre los bytes reales y sobre el bloque `MONOLOGO_LOCKED` extraído. El validador recibe ambos archivos; no basta con que el JSON se compare consigo mismo.

~~~json
{
  "production_lock": {
    "handoff_version": "5.3",
    "packet_id": "serie_parte_01_v5_3",
    "source_packet_sha256": "SHA256_DEL_ARCHIVO_ADJUNTO",
    "monologue_sha256": "SHA256_UTF8_DEL_MONOLOGO_EXACTO",
    "approved_voice_id": "ID_APROBADO"
  }
}
~~~

`packet_id`, `source_packet_sha256`, `monologue_sha256` y `approved_voice_id` deben coincidir con el packet adjunto. Un placeholder, un hash de otro archivo o una voz no autorizada bloquean. `asset_manifest_sha256` se omite en P1 sin `existing`; es obligatorio y coincide con el tercer archivo real cuando cualquier asset/view usa `existing`.

~~~json
{
  "production_lock": {
    "asset_manifest_sha256": "SHA256_DEL_MANIFEST_REAL_SOLO_CUANDO_HAY_EXISTING"
  }
}
~~~

## 2. Project

~~~json
{
  "project": {
    "title": "Título visible",
    "preset": "manhwa",
    "serie": "id_de_serie",
    "slug": "id_de_serie_parte_01",
    "language": "es-419",
    "aspect_ratio": "9:16",
    "fps": 30,
    "part": 1
  }
}
~~~

Reglas:

- serie en snake_case
- slug = serie + parte_NN
- part numérico
- preset siempre manhwa

## 3. Pipeline

~~~json
{
  "pipeline": {
    "image_generation": { "tool": "grok" },
    "animation": { "tool": "grok" },
    "tts": {
      "tool": "elevenlabs",
      "voice_id": "ID_APROBADO",
      "language": "es-419"
    },
    "editing": { "tool": "capcut" }
  }
}
~~~

No inventes voice_id.

## 4. Registro de assets

El pipeline actual declara personajes, props, UI y objetos reutilizables dentro de characters, todos con poses. Por compatibilidad con el validador vigente, todos sus archivos usan la carpeta `assets/characters/<serie>/`, incluso cuando el registro representa un prop. No inventes `assets/props/` hasta que el pipeline lo soporte.

### Generate

~~~json
{
  "characters": {
    "personaje_a": {
      "display_name": "Personaje A",
      "asset_type": "human",
      "prompt_signature": "young Korean man with short black hair and a gray work coverall",
      "poses": {
        "base": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_base.png",
          "pose_role": "base",
          "prompt": "..."
        },
        "outfit_trabajo": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_outfit_trabajo.png",
          "reference_pose": "base",
          "pose_role": "outfit",
          "prompt": "..."
        },
        "rescue_strain": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_rescue_strain.png",
          "reference_pose": "outfit_trabajo",
          "pose_role": "performance",
          "prompt": "..."
        }
      }
    },
    "objeto_a": {
      "display_name": "Objeto A",
      "asset_type": "prop",
      "prompt_signature": "compact red industrial scanner with one cracked black handle",
      "poses": {
        "base": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/objeto_a_base.png",
          "pose_role": "base",
          "prompt": "..."
        }
      }
    }
  }
}
~~~

### Existing

~~~json
{
  "mode": "existing",
  "asset": "assets/characters/id_de_serie/personaje_a_base.png",
  "pose_role": "base"
}
~~~

`existing` exige el `EXISTING_ASSET_MANIFEST_V5_3.json` real como tercer argumento del validador. ID, pose/view, `pose_role`/`view_type`, ruta, serie y SHA deben coincidir; una ruta plausible no basta.

Reglas:

- asset nuevo = generate
- asset ya producido = existing
- una derivada usa reference_pose
- rutas bajo la serie
- los personajes recurrentes tienen base
- `base` es identidad neutral; una pose usada en peligro/acción puede ser una `performance_pose` derivada
- el id de pose describe el estado (`rescue_strain`, `power_agony`, `pinned_struggling`, `impact_airborne`), no solo el outfit
- una pose de acción no ordena `neutral expression`, `neutral mouth` o `posture remains neutral`
- toda derivada humana `generate` incluye `same face, same hair, same outfit as the reference`; objetos/criaturas conservan forma y colores equivalentes
- criaturas recurrentes registran estados físicamente distintos de preparación, ataque/impacto y consecuencia
- `asset_type` es obligatorio: `human`, `creature`, `prop`, `container` o `ui`
- `prompt_signature` es obligatorio: frase inglesa estable de 4–30 palabras con forma, color/outfit y rasgo distintivo, sin nombre, acción, emoción ni estado temporal
- cada ID visible repite literalmente su `prompt_signature` en `visual.image_prompt`, incluso si llega por `references.scenes`; `display_name` nunca basta
- todo `asset_type: container` declara `transparent: true|false`; si es true, continuidad y prompt fijan ocupantes interior/exterior
- `pose_role` es obligatorio: `base`, `outfit`, `performance`, `trapped`, `charge`, `attack`, `impact`, `collapse` o `state`
- un humano tiene `pose_role: base`; una criatura recurrente cubre `base`, `trapped`, `charge`, `attack`, `impact` y `collapse`
- una actuación distinta de `NONE`/`NEUTRAL_INTENTIONAL` referencia `pose_role: performance`, nunca `base`
- `reference_pose` apunta a una pose existente del mismo registro y nunca a sí misma

## 5. Escenarios y views

~~~json
{
  "escenarios": {
    "escenario_a": {
      "display_name": "Escenario A",
      "views": {
        "corridor_front_eye": {
          "mode": "generate",
          "asset": "assets/escenarios/id_de_serie/escenario_a_corridor_front_eye.png",
          "view_type": "plate",
          "prompt": "..."
        },
        "corridor_left_oblique": {
          "mode": "generate",
          "asset": "assets/escenarios/id_de_serie/escenario_a_corridor_left_oblique.png",
          "reference_view": "corridor_front_eye",
          "view_type": "plate",
          "prompt": "..."
        }
      }
    }
  }
}
~~~

Una view se define por cámara. reference_view solo se usa cuando la nueva plate debe conservar arquitectura compatible.

Cada view exige `mode`, `asset`, `view_type: "plate"` y prompt cuando es `generate`; la ruta vive bajo `assets/escenarios/<serie>/`. `reference_view` apunta a otra view existente y no a sí misma.

## 6. Referencias de escena

~~~json
{
  "references": {
    "characters": [
      { "id": "personaje_a", "pose": "rescue_strain" }
    ],
    "assets": [
      { "id": "objeto_a", "pose": "base" }
    ],
    "escenario": {
      "id": "escenario_a",
      "view": "corridor_left_oblique"
    }
  }
}
~~~

Todos los miembros son opcionales.

El máximo total es tres imágenes:

- cada character cuenta uno
- cada asset cuenta uno
- escenario cuenta uno
- cada scene cuenta uno

No adjuntes una referencia incompatible solo porque queda espacio.

El prompt debe explicar visualmente cada referencia humana: firma física/outfit, acción, lado/profundidad y relación con límites. El motor no conoce `display_name`. En cápsulas, vehículos o habitaciones declara quién es el único ocupante interior y quién permanece completamente fuera.

No menciones como visible a un personaje con identidad si no puedes referenciarlo en un panel cargado. Las multitudes genéricas sin continuidad son la única excepción.

Con cuatro o más identidades necesarias, nunca comprimas ni sacrifiques una referencia al azar. Primero crea un ancla de relación con dos figuras. Después crea el master del mismo `moment_id` usando esa `references.scenes` como una imagen heredada, más las referencias del protagonista y de la criatura; omite la plate y describe el lugar literalmente. Si aun así no caben, divide la geografía en dos paneles causales. Cada panel sigue limitado a tres imágenes.

references.scenes:

- apunta únicamente a una escena anterior
- conserva el mismo instante y posiciones
- el prompt fuerza un plano o ángulo diferente
- el prompt empieza su continuidad con `Same exact moment and same character positions as the scene reference, now seen from ...`
- no se encadenan tres o más referencias de escena consecutivas

## 7. Panel

~~~json
{
  "id": "scene_01",
  "type": "panel",
  "render_mode": "static",
  "references": {
    "characters": [
      { "id": "personaje_a", "pose": "rescue_strain" }
    ],
    "assets": [
      { "id": "objeto_a", "pose": "base" }
    ],
    "escenario": {
      "id": "escenario_a",
      "view": "corridor_left_oblique"
    }
  },
  "editor_motion": {
    "enabled": true,
    "preset": "slow_push_in",
    "zoom": 1.04,
    "pan": 2
  },
  "transition_in": "cut",
  "visual_plan": {
    "story_beat_id": "B03",
    "beat": "THREAT",
    "narrative_function": "amenaza",
    "page_layout": "FULL_BLEED",
    "shot_scale": "TRUE_LONG",
    "camera_elevation": "EYE_LEVEL",
    "viewpoint": "SIDE",
    "camera_roll": "LEVEL",
    "dominant_subject_id": "objeto_a",
    "location_id": "tunnel_hazard_zone",
    "axis_id": "tunel_eje_a",
    "moment_id": "perro_latente_01",
    "subject_pct": 15,
    "high_tension": true,
    "performances": [
      {
        "entity_id": "personaje_a",
        "mode": "EFFORT",
        "eyes_brows": "brows lifted inward and eyes fixed screen-right",
        "mouth_jaw": "jaw clenched",
        "body_cue": "shoulders raised and weight held back",
        "reaction_to": null
      }
    ],
    "long_role": "THREAT",
    "fragment_subject": "NONE",
    "fragment_role": "NONE",
    "low_density_kind": "NONE",
    "action": {
      "phase": "GEOGRAPHY",
      "sequence_id": "rescate_01",
      "vector_pct": 0,
      "origin_third": "NONE",
      "destination_third": "NONE"
    },
    "approach": { "stage": "NONE", "ramp_id": null, "direction": "" },
    "white": null,
    "black": null,
    "long_scale": {
      "distance_m": 18,
      "environment_pct": 76,
      "full_body": true,
      "air": true,
      "ground_contact": true,
      "three_layers": true,
      "relative_scale": true
    },
    "subpanels": []
  },
  "continuity": {
    "location_id": "tunnel_hazard_zone",
    "axis_id": "tunel_eje_a",
    "time": "rainy midnight",
    "light_state": "amber_work_left_violet_threat_right",
    "space_type": "INTERIOR",
    "transition_bridge": false,
    "light_change_reason": "",
    "visible_entities": ["personaje_a", "objeto_a"],
    "state_before": {
      "personaje_a.power": "none",
      "objeto_a.threat": "trapped_active"
    },
    "atomic_action": {
      "actor_id": "personaje_a",
      "verb": "detects",
      "target_id": "objeto_a",
      "origin": "screen_left_midground",
      "trajectory_or_contact": "line_of_sight",
      "destination": "screen_right_background",
      "result": "threat_identified"
    },
    "state_change_reason": {},
    "state_after": {
      "personaje_a.power": "none",
      "objeto_a.threat": "trapped_active"
    }
  },
  "visual": {
    "image_prompt": "..."
  },
  "voiceover": {
    "text": "Texto exacto."
  }
}
~~~

Reglas:

- type panel
- render_mode static
- visual.image_prompt obligatorio
- animation_prompt prohibido
- transition_in opcional
- cut es el default
- acción/impacto 2–8 palabras; fragmento/reacción 2–9; estándar 5–13; master 7–16; white composite 4–14
- panel normal con más de 16 palabras es inválido para V5.3
- duración estimada: `palabras × 60 / (150 × edit_speed)`; normal máximo 4.3 s, master 5 s y composite 5.2 s
- cada panel muestra un instante; excepción: `WHITE_COMPOSITE_2` y `WHITE_ACTION_STRIP_2` contienen exactamente dos instantes simples separados en `subpanels` A/B

### 7.1 Metadatos verificables obligatorios

`visual_plan` y `continuity` se guardan dentro de cada panel. Remotion los ignora; el validador los usa para impedir que una palabra suelta en el prompt pague una cuota.

Enums cerrados:

- `page_layout`: `FULL_BLEED`, `WHITE_INSET`, `WHITE_COMPOSITE_2`, `WHITE_ISOLATE`, `WHITE_FRAGMENT`, `WHITE_ACTION_STRIP_2`, `BLACK_INSET`, `TALL_ACTION`.
- `shot_scale`: `MACRO`, `EXTREME_CLOSE`, `CLOSE`, `MEDIUM`, `FULL`, `WIDE_MASTER`, `TRUE_LONG`.
- `camera_elevation`: `EYE_LEVEL`, `LOW`, `HIGH`, `BIRDS_EYE`, `TOP_DOWN`, `WORMS_EYE`, `KNEE_LEVEL`, `GROUND_LEVEL`.
- `viewpoint`: `FRONT`, `THREE_QUARTER_FRONT`, `PROFILE`, `SIDE`, `OTS`, `BEHIND`, `REAR_THREE_QUARTER`, `POV`.
- `camera_roll`: `LEVEL` o `DUTCH`.
- `performances[].mode`: `NONE`, `NEUTRAL_INTENTIONAL`, `REACTION`, `RELATIONSHIP`, `EFFORT`, `SHOCK`, `COST`. En alta tensión declara cada humano visible con ojos/cejas, boca/mandíbula y cuerpo; los cues aparecen literalmente en el prompt.
- `reaction_to` es `null` salvo reacción causal; cuando existe apunta a una `scene_id` anterior, nunca futura.
- `action.phase`: `NONE`, `GEOGRAPHY`, `ANTICIPATION`, `TRAJECTORY`, `CONTACT`, `CONSEQUENCE`, `REACTION`. Cada `sequence_id` activo demuestra las seis fases en orden.
- `approach.stage`: `NONE`, `SPACE`, `BODY`, `EMOTION`, `FRAGMENT`, `ADDITIONAL`. Una rampa comparte `ramp_id` y dirección en 3–5 panels consecutivos; `ADDITIONAL` usa otro beat.
- `beat`: `HOOK`, `WORLD`, `LACK`, `NORMALITY`, `DETONATOR`, `THREAT`, `PRESSURE`, `BOND`, `DECISION`, `PERCEPTION`, `PREPARATION`, `MANIFESTATION`, `ACTION`, `PAYOFF`, `CONSEQUENCE`, `COST`, `CLIFFHANGER`, `TRANSITION`.
- `long_role`: `NONE`, `WORLD`, `THREAT`, `GEOGRAPHY`, `CLIMAX`, `CONSEQUENCE`.
- `fragment_subject`: `NONE`, `EYES`, `MOUTH_JAW`, `HAND_CONTACT`, `FOOT_CONTACT`, `WOUND_MARK`, `PROP_DECISIVE`.
- `fragment_role`: `NONE`, `DECISION`, `EMOTION`, `INFORMATION`, `CONTACT`, `COST`.
- `low_density_kind`: `NONE`, `REACTION`, `ENVIRONMENT`, `SILENT_LONG`.
- `white.composition`: `UPPER_LEFT`, `LOWER_RIGHT`, `CENTER_HIGH`, `SIDE_STRIP`, `OPPOSITE_CORNERS`, `STACKED_OFFSET`, `DIAGONAL_STRIP`, `LOWER_RIGHT_ISOLATE`. En una Parte usa al menos dos valores.

Porcentajes y distancias son números, no texto. Los blancos usan `white.canvas_pct/panel_count/composition`; BLACK_INSET usa `black.canvas_pct`; TRUE_LONG usa `long_scale`; TALL_ACTION usa vector y tercios en `action`. `WHITE_COMPOSITE_2` y `WHITE_ACTION_STRIP_2` exigen dos `subpanels` A/B con momento, plano, elevación, viewpoint, roll, performance y fase propios; el resto usa `subpanels: []`. La tira conserva dos microinstantes ascendentes dentro de una sola fase exterior: anticipación→trayectoria o consecuencia→reacción; trayectoria→contacto está prohibido.

~~~json
{
  "subpanels": [
  {
    "subpanel_id": "A",
    "moment_id": "anticipation_01",
    "dominant_subject_id": "personaje_a",
    "shot_scale": "CLOSE",
    "camera_elevation": "HIGH",
    "viewpoint": "PROFILE",
    "camera_roll": "LEVEL",
    "performances": [{"entity_id":"personaje_a","mode":"EFFORT","eyes_brows":"...","mouth_jaw":"...","body_cue":"...","reaction_to":null}],
    "action_phase": "ANTICIPATION"
  },
  {
    "subpanel_id": "B",
    "moment_id": "contact_01",
    "dominant_subject_id": "personaje_a",
    "shot_scale": "MACRO",
    "camera_elevation": "EYE_LEVEL",
    "viewpoint": "SIDE",
    "camera_roll": "LEVEL",
    "performances": [{"entity_id":"personaje_a","mode":"SHOCK","eyes_brows":"...","mouth_jaw":"...","body_cue":"...","reaction_to":"scene_08"}],
    "action_phase": "CONTACT"
  }
  ]
}
~~~

Las fases de subpanel describen los dos instantes pero no sustituyen ni pagan una fase de la secuencia exterior; solo `visual_plan.action.phase` cuenta para el gate major. El prompt contiene secciones `Panel A:` y `Panel B:` coherentes.

`state_before` y `state_after` son mapas planos de claves canónicas (`entidad.propiedad`) a estados presentes en `MACHINE_LOCK_V5_3.state_contract`. Son escalares JSON salvo claves `.occupants`, que usan listas únicas de IDs. Toda clave que cambia copia **literalmente** su `caused_by` en `state_change_reason[key]` y lo representa en `atomic_action`. La siguiente declaración comienza con el último valor conocido.

El prompt debe concordar con los metadatos: layout, plano, ángulo, distancia, ocupación, blanco, entidades, fase y estado. Declarar datos válidos que el prompt contradice es FAIL.

Presets de editor_motion permitidos:

- bottom_to_top
- top_to_bottom
- bottom_left_to_top_right
- bottom_right_to_top_left
- top_left_to_bottom_right
- top_right_to_bottom_left
- slow_push_in
- slow_pull_out
- static
- punch_in
- shake

punch_in y shake solo se usan en impactos.

Todo `WHITE_*` y `BLACK_INSET` usa `editor_motion: {"enabled": false, "preset": "static", "zoom": 1, "pan": 0}` para conservar márgenes y composición. El movimiento global no debe recortar estas páginas.

El render manhwa conserva una cola final de 0.45 segundos después del audio/última palabra, sosteniendo la última imagen. Esta cola es de edición; no se añade al `full_script`, no altera timestamps y no genera otra escena.

## 8. Narrative card

~~~json
{
  "id": "scene_02",
  "type": "narrative_card",
  "card": {
    "text": "TÍTULO O FRASE",
    "mode": "editor",
    "role": "title",
    "story_beat_id": "B01"
  },
  "voiceover": {
    "text": "Título o frase. [pause]"
  }
}
~~~

Una card usa texto literal de 2–7 palabras y no contiene:

- render_mode
- references
- visual
- editor_motion
- motion
- transition visual inventada

card.text va limpio, sin tags. voiceover.text conserva tags.

`card.role` es `title` o `narrative`; `card.story_beat_id` enlaza la card al `MACHINE_LOCK_V5_3.beat_order`. Debe existir exactamente un título y al menos una card narrativa. `card.text` aparece literalmente en su `voiceover.text` una vez retirados los tags; máximo tres líneas. Las cards no llevan `visual_plan` ni `continuity`; su layout negro es implícito y fiable en el editor.

En V5.3 hay 2–4 `narrative_card` según duración. Una es el título y al menos una es una frase narrativa no-título. Estas cards son los paneles negros de texto fiables; no se encarga lettering largo a Grok/Aurora.

## 9. Editor global

~~~json
{
  "editing": {
    "caption_style": {
      "enabled": true,
      "font": "Montserrat ExtraBold",
      "size": 64,
      "position": "center_lower",
      "max_words_on_screen": 4
    },
    "narrative_card_style": {
      "font": "Montserrat",
      "size": 72,
      "max_width": "72%",
      "max_lines": 3
    },
    "panel_motion": {
      "enabled": true,
      "apply_to": "all_panels",
      "static_zoom": 1.04,
      "static_pan": 4,
      "animated_zoom": 1.02,
      "animated_pan": 2,
      "cycle": [
        "bottom_to_top",
        "top_to_bottom",
        "bottom_left_to_top_right",
        "top_right_to_bottom_left",
        "slow_push_in"
      ]
    },
    "timing_budget": {
      "runtime_target_sec": [90, 100],
      "runtime_estimate_sec": 97,
      "payoff_scene_id": "scene_31",
      "payoff_start_pct": 0.737,
      "final_visual_tail_sec": 0.45
    }
  }
}
~~~

`runtime_target_sec` copia literalmente `MACHINE_LOCK_V5_3.runtime_range_seconds`; `runtime_estimate_sec` debe caer dentro y aproximarse a `target_runtime_seconds`. El preset puede ignorar font o position. No dependas de esos campos para identidad visual.

`editing.timing_budget.final_visual_tail_sec` es la fuente contractual única y vale exactamente `0.45`. Si `audio.final_visual_tail_sec` también existe, debe reflejar `0.45`.

## 10. TTS de una voz

Se usa cuando no existe sistema ni segunda voz.

En escenas:

~~~json
{
  "voiceover": {
    "text": "[tense] Texto del narrador."
  }
}
~~~

No lleva speaker, voices, dialogue ni voice_id. En modo single, la voz autorizada se lee de `pipeline.tts.voice_id`.

~~~json
{
  "tts_export": {
    "language": "es-419",
    "mode": "single",
    "model_id": "eleven_v3",
    "voice_settings": { "speed": 1.0 },
    "edit_speed": 1.4,
    "full_script": "[tense] Texto del narrador.\nSegunda línea."
  }
}
~~~

No contiene voices, dialogue ni elevenlabs_speed. En single, `voice_settings.speed` es el campo efectivo para la velocidad de generación.

## 11. TTS multivoz

Solo se usa cuando existe al menos una línea real de sistema o una segunda voz y el Story Packet incluye `approved_voices` con todos sus IDs. Sin ese mapping el proyecto permanece `single` o se bloquea; jamás se inventa una voz.

Cada escena con voz lleva speaker:

~~~json
{
  "voiceover": {
    "speaker": "sistema",
    "text": "[cold] EVENTO DETECTADO."
  }
}
~~~

~~~json
{
  "tts_export": {
    "language": "es-419",
    "mode": "dialogue",
    "model_id": "eleven_v3",
    "elevenlabs_speed": 1.0,
    "edit_speed": 1.4,
    "voices": {
      "narrador": "ID_NARRADOR_APROBADO",
      "sistema": "ID_SISTEMA_APROBADO"
    },
    "dialogue": [
      {
        "scene_id": "scene_01",
        "speaker": "narrador",
        "text": "Texto idéntico al voiceover."
      },
      {
        "scene_id": "scene_02",
        "speaker": "sistema",
        "text": "[cold] EVENTO DETECTADO."
      }
    ],
    "full_script": "Texto idéntico al voiceover.\n[cold] EVENTO DETECTADO."
  }
}
~~~

Reglas:

- no inventar speakers
- dialogue tiene una entrada por escena con voz
- scene_id, speaker y text son espejo exacto
- cold pertenece solo al sistema

## 12. Full script

full_script es la unión exacta de todos los voiceover.text en orden, separados por salto de línea.

Si se cambia un tag, signo o palabra en una escena, se actualiza full_script.

## 13. Presupuesto TTS

Cuenta caracteres con tags.

- El pipeline divide automáticamente `full_script` en límites de escena cercanos a 4,800 caracteres.
- Si una sola escena excede el máximo, el motor intenta cortarla al final de una oración.
- La concatenación de los fragmentos reproduce `full_script` exactamente.
- `tts_blocks` no forma parte del contrato activo y no debe emitirse.
- Más de 8,000 caracteres es un warning editorial para un short: recorta o plantea otra parte, salvo petición expresa.

multilingual_v2 no se usa.

## 14. Transiciones

transition_in:

- cut: default
- dip_black: salto claro de tiempo o lugar
- crossfade: recuerdo
- flash: impacto justificado

No uses dip_black para cada cambio de imagen.

## 15. Audio opcional

~~~json
{
  "audio": {
    "music_file": "music/cama_base.mp3",
    "music_volume": 0.18,
    "music_cues": [
      { "at_scene": "scene_18", "file": "music/tension.mp3" }
    ]
  }
}
~~~

No añadas cues por costumbre. Cero a tres es suficiente.

## 16. Validación contractual

Antes de entregar:

- JSON parsea
- top-level permitido
- production_lock coincide con el Story Packet adjunto
- IDs únicos y ordenados
- poses y views existen
- referencias máximo tres
- assets usan existing/generate correctamente
- props aparecen en references.assets
- panels static sin animation_prompt
- cards limpias
- mode TTS corresponde a las voces
- cold no aparece en narrador
- dialogue, si existe, es espejo
- full_script es exacto
- presupuesto de caracteres correcto
- cada panel contiene visual_plan y continuity coherentes con prompt y escenas vecinas
- secuencias major, rampas, cuotas mínimas/máximas y distribución pasan desde metadatos estructurados
- cola final declarada = 0.45 s
