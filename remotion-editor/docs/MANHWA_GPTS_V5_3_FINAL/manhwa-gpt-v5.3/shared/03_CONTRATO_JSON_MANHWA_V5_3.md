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
          "prompt": "young Korean man with short black hair and a gray work coverall. Exactly one character, full body from hair to soles, orthographic front eye-level view, neutral relaxed expression, both open empty hands visible, both feet visible, clean and dry, even studio illumination, isolated on a seamless neutral medium-gray background, no environment, no additional characters, no readable text. Hand-drawn Korean manhwa webtoon character design, 2D flat cel shading, crisp inked lineart, consistent anatomy and proportions."
        },
        "outfit_trabajo": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_outfit_trabajo.png",
          "reference_pose": "base",
          "pose_role": "outfit",
          "prompt": "young Korean man with short black hair and a gray work coverall. Same face, same hair, same outfit as the reference. Exactly one character standing at eye level, isolated on a seamless neutral medium-gray background, no environment, no additional characters, no readable text. Hand-drawn Korean manhwa webtoon character design, 2D flat cel shading, crisp inked lineart, consistent anatomy and proportions."
        },
        "rescue_strain": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_rescue_strain.png",
          "reference_pose": "outfit_trabajo",
          "pose_role": "performance",
          "prompt": "young Korean man with short black hair and a gray work coverall. Same face, same hair, same outfit as the reference. He pulls backward with tense eyebrows, clenched jaw, raised shoulders and both empty hands apart. Isolated on a seamless neutral medium-gray background, no environment, no additional characters, no readable text. Hand-drawn Korean manhwa webtoon character design, 2D flat cel shading, crisp inked lineart, consistent anatomy and proportions."
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
          "prompt": "compact red industrial scanner with one cracked black handle. Exactly one object, complete object fully visible, unheld, clean and dry, orthographic front eye-level view, even studio illumination, isolated on a seamless neutral medium-gray background, no environment, no additional characters, no hands, no people, no effects, no readable text. Korean manhwa webtoon prop design, 2D flat cel shading, crisp inked lineart, consistent shape and proportions."
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

`existing` exige el manifest real como tercer argumento. Contiene `manifest_version:"5.3"`, `manifest_id`, `series_id` y `through_part` igual a Parte actual−1. Cada `asset.id` y `escenario.id` superior aparece una sola vez; todas sus poses o views viven dentro de esa entrada. ID de asset, `prompt_signature`, pose/view, `pose_role`/`view_type`, ruta, serie y SHA deben coincidir; una ruta plausible no basta. El manifest de salida de la Parte usa otro nombre `through_pNN` y nunca sobrescribe la entrada. El nombre de archivo y el `manifest_id` `through_pNN` son convención operativa; los gates mecánicos enlazan bytes/SHA, `series_id`, `through_part` y entradas exactas.

Reglas:

- asset nuevo = generate
- asset ya producido = existing
- una derivada usa reference_pose
- rutas bajo la serie
- los personajes recurrentes tienen base
- `base` es identidad neutral; una pose usada en peligro/acción puede ser una `performance_pose` derivada
- el id de pose describe el estado (`rescue_strain`, `power_agony`, `pinned_struggling`, `impact_airborne`), no solo el outfit
- una pose de acción no ordena `neutral expression`, `neutral mouth` o `posture remains neutral`
- toda derivada humana `generate` incluye literalmente `same face, same hair, same outfit as the reference`; toda criatura derivada incluye `same anatomy, same markings, same colors as the reference`; todo prop/container derivado incluye `same shape, same materials, same colors as the reference`
- criaturas recurrentes registran estados físicamente distintos de preparación, ataque/impacto y consecuencia
- si una criatura participa en acción, las refs usan `charge` en anticipación, `attack` en trayectoria/contacto, `impact` en consecuencia y `collapse` tras neutralizarla; declarar poses sin usarlas no cumple
- `asset_type` es obligatorio: `human`, `creature`, `prop`, `container` o `ui`
- `prompt_signature` es obligatorio: frase inglesa estable de 6–12 palabras con forma, color/outfit y rasgo distintivo, sin nombre, acción, emoción ni estado temporal
- cada ID visible repite literalmente su `prompt_signature` en `visual.image_prompt`, incluso si llega por `references.scenes`; `display_name` nunca basta
- cada pose `generate`, base o derivada, también contiene literalmente la misma `prompt_signature`
- todo `asset_type: container` declara `transparent: true|false`; si es true, continuidad y prompt fijan ocupantes interior/exterior
- `pose_role` es obligatorio: `base`, `outfit`, `performance`, `trapped`, `charge`, `attack`, `impact`, `collapse` o `state`
- un humano tiene `pose_role: base`; una criatura recurrente cubre `base`, `trapped`, `charge`, `attack`, `impact` y `collapse`
- una actuación distinta de `NONE`/`NEUTRAL_INTENTIONAL` referencia `pose_role: performance`, nunca `base`
- `reference_pose` apunta a una pose existente del mismo registro y nunca a sí misma
- toda pose derivada `generate` aparece en al menos una referencia de escena con fase, emoción y estado compatibles; pose derivada sin uso o usada solo para justificar cuotas es inválida y se elimina
- una misma derivada no representa estados materiales o actuaciones incompatibles; el reporte enlaza cada `asset_id/pose` con sus `scene_id`

Fórmulas obligatorias para `generate`:

- toda pose human/creature/prop/container, también derivada: `isolated on a seamless neutral medium-gray background, no environment, no additional characters, no readable text`; clima, escenario y luz dramática viven en la escena
- human base: `Exactly one character, full body from hair to soles, orthographic front eye-level view, neutral relaxed expression, both open empty hands visible, both feet visible, clean and dry, even studio illumination`
- creature base: `Exactly one creature, complete body fully visible, neutral resting state, all limbs visible, clean and dry, even studio illumination`
- prop base: `Exactly one object, complete object fully visible, unheld, clean and dry, orthographic front eye-level view, even studio illumination`; container base cambia `unheld` por `empty`; ambos sin manos, persona, ocupante, efecto ni texto
- ui base: `Exactly one interface frame, no text, dark neutral background, no people, no environment`
- STYLE HARD human: `Hand-drawn Korean manhwa webtoon character design, 2D flat cel shading, crisp inked lineart, consistent anatomy and proportions.`
- STYLE HARD creature: `Hand-drawn Korean manhwa webtoon creature design, 2D flat cel shading, crisp inked lineart, consistent anatomy and proportions.`
- STYLE HARD prop/container: `Korean manhwa webtoon prop design, 2D flat cel shading, crisp inked lineart, consistent shape and proportions.`
- STYLE HARD UI: `Korean manhwa webtoon interface asset design, 2D flat cel shading, crisp inked lineart, high contrast.`
- STYLE HARD view: `Korean manhwa webtoon background illustration, 2D flat cel shading, crisp inked lineart, painted environment detail.`

Cada prompt `generate`, base o derivado, contiene literalmente el ancla de su tipo. Human/creature/prop/container mantienen fondo gris medio, `even studio illumination`, `no environment` y prohíben rim light, clima, hora, localización o luz de escena. El ancla no reemplaza estas fórmulas. En views, `painted environment detail` describe solo arquitectura y no invalida la plate vacía.

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
          "prompt": "Empty environment plate, no people, no creatures, no vehicles, no readable text. Wide master shot, eye-level angle, front view of a concrete service corridor at rainy midnight, with amber ceiling light cast from above and distinct foreground, midground and background architecture. Korean manhwa webtoon background illustration, 2D flat cel shading, crisp inked lineart, painted environment detail."
        },
        "corridor_left_oblique": {
          "mode": "generate",
          "asset": "assets/escenarios/id_de_serie/escenario_a_corridor_left_oblique.png",
          "reference_view": "corridor_front_eye",
          "view_type": "plate",
          "prompt": "Empty environment plate, no people, no creatures, no vehicles, no readable text. Wide master shot, eye-level angle, three-quarter front view from the corridor's left side at rainy midnight, preserving door positions as amber ceiling light falls from above. Korean manhwa webtoon background illustration, 2D flat cel shading, crisp inked lineart, painted environment detail."
        }
      }
    }
  }
}
~~~

Una view se define por cámara. reference_view solo se usa cuando la nueva plate debe conservar arquitectura compatible.

Cada view exige `mode`, `asset`, `view_type: "plate"` y prompt cuando es `generate`; la ruta vive bajo `assets/escenarios/<serie>/`. Todo prompt generado contiene `Empty environment plate, no people, no creatures, no vehicles, no readable text`, además de arquitectura, cámara, hora y luz. `reference_view` apunta a otra view existente y no a sí misma.

Toda view declarada, `generate` o `existing`, aparece realmente en `references.escenario` de al menos un panel; view sin uso es inválida y se elimina. El master de entrada/cambio de lugar o eje usa una view compatible, y tras cuatro CLOSE/MACRO/fragmentos existe reanclaje con view o scene ref compatible. Una view cuenta solo por referencia efectiva: mencionarla en prompt o crearla en assets no paga continuidad.

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

El prompt debe explicar cada referencia humana: `prompt_signature`, acción, lado/profundidad y límites. El motor no conoce `display_name`. Si un contenedor transparente es visible, su clave `<id>.occupants` aparece en continuidad; cada ocupante actual es visible/referenciado. Con uno, usa `<firma> is the only person inside the transparent container`; cada otro humano visible usa `<firma> remains completely outside the transparent container`.

No menciones como visible a un personaje con identidad si no puedes referenciarlo en un panel cargado. Las multitudes genéricas sin continuidad son la única excepción.

Con cuatro o más identidades necesarias, nunca comprimas ni sacrifiques una referencia al azar. Primero crea un ancla de relación con dos figuras. Después crea el master del mismo `moment_id` usando esa `references.scenes` como una imagen heredada, más las referencias del protagonista y de la criatura; omite la plate y describe el lugar literalmente. Si aun así no caben, divide la geografía en dos paneles causales. Cada panel sigue limitado a tres imágenes.

El límite de tres imágenes no permite eliminar ni sustituir el actor, target o prop causal descrito por la voz. Prioridad de refs: actor y target identificables, tercera identidad/prop causal, luego escenario/decoración. Si las tres esenciales impiden una plate, intercala un master ancla o usa una scene ref del mismo `moment_id`; nunca cambies quién actúa, sobre quién o con qué.

Cardinalidad y utilería son físicas. Singular/plural y cantidades explícitas se ven como cuerpos u objetos distintos y ubicables. Todo prop recurrente o decisivo sostenido, apuntado, abierto, extendido, roto o usado aparece en `references.assets` con pose/estado compatibles y en el contacto del prompt. `as if holding/aiming`, manos vacías, mangas sueltas o efectos sin el objeto no cumplen.

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
    "scale_anchor": "the scanner height is one-tenth of the adult body height",
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
    "voice_facts": [
      {
        "atom_id": "atom_07",
        "actor_id": "personaje_a",
        "action": "detects",
        "receiver_or_target_id": "objeto_a",
        "source_id": "personaje_a",
        "direction": "screen_left_midground_to_screen_right_background",
        "result": "threat_identified",
        "causal_participants": ["personaje_a", "objeto_a"],
        "required_visual_tokens": ["violet crack on the trapped object"],
        "resolved_from_atom_id": null
      }
    ],
    "must_show": ["personaje_a", "objeto_a"],
    "offscreen_policy": {
      "mode": "FORBIDDEN",
      "allowed_ids": [],
      "reason": ""
    },
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
- panel estándar con más de 13 palabras es inválido; solo master admite hasta 16
- duración estimada: `palabras × 60 / (150 × edit_speed)`; normal máximo 4.3 s, master 5 s y composite 5.2 s
- cada panel muestra un instante; excepción: `WHITE_COMPOSITE_2` y `WHITE_ACTION_STRIP_2` contienen exactamente dos instantes simples separados en `subpanels` A/B
- cada claim físico del `voiceover.text` coincide con `voice_facts`, `must_show`, `atomic_action`, entidades, performances, referencias y prompt; segmentar nunca autoriza ilustrar otro actor, target o resultado

### 7.1 Metadatos verificables obligatorios

`visual_plan` y `continuity` se guardan dentro de cada panel. Remotion los ignora; el validador los usa para impedir que una palabra suelta en el prompt pague una cuota.

Enums cerrados:

- `page_layout`: `FULL_BLEED`, `WHITE_INSET`, `WHITE_COMPOSITE_2`, `WHITE_ISOLATE`, `WHITE_FRAGMENT`, `WHITE_ACTION_STRIP_2`, `BLACK_INSET`, `TALL_ACTION`.
- `shot_scale`: `MACRO`, `EXTREME_CLOSE`, `CLOSE`, `MEDIUM`, `FULL`, `WIDE_MASTER`, `TRUE_LONG`.
- `camera_elevation`: `EYE_LEVEL`, `LOW`, `HIGH`, `BIRDS_EYE`, `TOP_DOWN`, `WORMS_EYE`, `KNEE_LEVEL`, `GROUND_LEVEL`.
- `viewpoint`: `FRONT`, `THREE_QUARTER_FRONT`, `PROFILE`, `SIDE`, `OTS`, `BEHIND`, `REAR_THREE_QUARTER`, `POV`.
- `camera_roll`: `LEVEL` o `DUTCH`.
- `scale_anchor` es `""` cuando no aplica. En TRUE_LONG y en BIRDS_EYE/TOP_DOWN amplios contiene una comparación inglesa literal de 5–18 palabras entre dos clases de escala. Usa formas aceptadas: `one–nine tenths/fifths/quarters/thirds`, `half`, `twice`, `same height`, `same body scale` o `same size`; no porcentajes ni decimales. Compara nouns claros de humano, criatura, vehículo, arquitectura o prop, por ejemplo `the adult body is one-third of the convoy vehicle length`.
- `performances[].mode`: `NONE`, `NEUTRAL_INTENTIONAL`, `REACTION`, `RELATIONSHIP`, `EFFORT`, `SHOCK`, `COST`. En alta tensión declara cada humano visible con ojos/cejas, boca/mandíbula y cuerpo; los cues aparecen literalmente en el prompt.
- `high_tension` no es discrecional: es true en amenaza, decisión, manifestación, acción, payoff, costo, cliffhanger y en fases anticipación→consecuencia; allí ningún humano visible usa `NONE`/`NEUTRAL_INTENTIONAL`.
- `reaction_to` es `null` salvo reacción causal; cuando existe apunta a una `scene_id` anterior, nunca futura.
- `action.phase`: `NONE`, `GEOGRAPHY`, `ANTICIPATION`, `TRAJECTORY`, `CONTACT`, `CONSEQUENCE`, `REACTION`. Cada `sequence_id` activo demuestra las seis fases en orden.
- `action.origin_third` y `action.destination_third`: `NONE`, `UPPER`, `MIDDLE`, `LOWER`.
- la fase se prueba en prompt/continuidad: GEOGRAPHY ubica actores; ANTICIPATION prepara sin contacto; TRAJECTORY muestra desplazamiento/dirección sin resultado; CONTACT nombra punto y dirección; CONSEQUENCE muta estado y resultado físico; REACTION enlaza `reaction_to`. Escribir solo el enum no paga.
- `approach.stage`: `NONE`, `SPACE`, `BODY`, `EMOTION`, `FRAGMENT`, `ADDITIONAL`. Una rampa comparte `ramp_id` y dirección en 3–5 panels consecutivos: SPACE usa TRUE_LONG/FULL con sujeto 8–22%; BODY, FULL/MEDIUM con 35–55%; EMOTION, CLOSE/EXTREME_CLOSE con 65–90%. El shot extra usa otro beat y un ID propio, por ejemplo `{"stage":"ADDITIONAL","ramp_id":"additional_01","direction":"toward screen-right exit"}`; no comparte ID con la rampa.
- `beat`: `HOOK`, `WORLD`, `LACK`, `NORMALITY`, `DETONATOR`, `THREAT`, `PRESSURE`, `BOND`, `DECISION`, `PERCEPTION`, `PREPARATION`, `MANIFESTATION`, `ACTION`, `PAYOFF`, `CONSEQUENCE`, `COST`, `CLIFFHANGER`, `TRANSITION`.
- beats obligatorios al menos una vez: `HOOK`, `DETONATOR`, `THREAT`, `DECISION`, `MANIFESTATION`, `PAYOFF`, `COST`, `CLIFFHANGER`.
- `long_role`: `NONE`, `WORLD`, `THREAT`, `GEOGRAPHY`, `CLIMAX`, `CONSEQUENCE`.
- `fragment_subject`: `NONE`, `EYES`, `MOUTH_JAW`, `HAND_CONTACT`, `FOOT_CONTACT`, `WOUND_MARK`, `PROP_DECISIVE`.
- `fragment_role`: `NONE`, `DECISION`, `EMOTION`, `INFORMATION`, `CONTACT`, `COST`.
- `low_density_kind`: `NONE`, `REACTION`, `ENVIRONMENT`, `SILENT_LONG`.
- `continuity.space_type`: `INTERIOR`, `EXTERIOR`, `ABSTRACT`.
- `continuity.voice_facts` es una lista con un claim por átomo físico agrupado. Cada claim usa exactamente `atom_id`, `actor_id`, `action`, `receiver_or_target_id`, `source_id`, `direction`, `result`, `causal_participants[]`, `required_visual_tokens[]` y `resolved_from_atom_id`. Los IDs nullable son `null`, no `environment`, cuando la voz realmente carece de participante identificable.
- `resolved_from_atom_id` apunta al átomo anterior que resuelve pronombre, sujeto tácito o elipsis; es `null` cuando el referente es explícito. Nunca hereda de una imagen inventada.
- `required_visual_tokens` lista conceptos físicos narrados sin ID propio —objeto, soporte, superficie, abertura, dinero, residuo o estado visible— y siempre existe, aunque sea `[]`. Se copia del lock sin omisiones. Cada token aparece literal o con equivalente visual inequívoco en el prompt del claim; efecto, ropa o parte corporal genéricos no lo pagan. Solo requiere ref si además es prop recurrente/identitario/decisivo.
- `must_show` es la unión sin duplicados de `causal_participants` de todos los claims. `visible_entities` contiene esos IDs salvo excepción offscreen válida.
- `offscreen_policy.mode`: `FORBIDDEN` o `ALLOWED_FILMABLE`. Por defecto y en todo `HOOK` físico es `FORBIDDEN`. `ALLOWED_FILMABLE` exige que la propia voz declare ausencia/invisibilidad, `allowed_ids` sea subconjunto de `must_show` y `reason` describa fuente, dirección y efecto observables. Nunca se usa por límite de refs.
- `white.composition`: `UPPER_LEFT`, `LOWER_RIGHT`, `CENTER_HIGH`, `SIDE_STRIP`, `OPPOSITE_CORNERS`, `STACKED_OFFSET`, `DIAGONAL_STRIP`, `LOWER_RIGHT_ISOLATE`. En una Parte usa al menos dos valores.

Porcentajes y distancias son números, no texto. Los blancos usan `white.canvas_pct/panel_count/composition`; BLACK_INSET usa `black.canvas_pct`; TRUE_LONG usa `long_scale`; TALL_ACTION usa vector y tercios en `action`. `WHITE_COMPOSITE_2` y `WHITE_ACTION_STRIP_2` exigen dos `subpanels` A/B con momento, plano, elevación, viewpoint, roll, performance y fase propios; el resto usa `subpanels: []`. La tira conserva dos microinstantes ascendentes dentro de una sola fase exterior: anticipación→trayectoria o consecuencia→reacción; trayectoria→contacto está prohibido.

Ejemplo de `subpanels` para `WHITE_COMPOSITE_2` (no reutilizar sus fases como `WHITE_ACTION_STRIP_2`):

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

### 7.2 Compuerta semántica VOZ→IMAGEN

`voiceover.text` manda. El Director copia `MACHINE_LOCK_V5_3.voice_visual_lock` por `atom_id` si existe; si falta, deriva claims literalmente y falla cerrado ante ambigüedad. El lock contiene una entrada por átomo: `atom_id`, `text_exact`, `kind`, `claims[]`, `must_show[]` y `offscreen_policy`; `text_exact` coincide byte por byte con el átomo y cada claim usa el esquema de `continuity.voice_facts`. Antes de componer resuelve pronombres, sujetos tácitos y elipsis entre átomos. Un panel con varios átomos concatena sus claims y une `must_show`; no elige una sola “idea central” para omitir los demás. Entradas `CARD`/`CONTROL` se validan por su contrato propio, no se copian a un panel.

La cadena pasa solo si:

- cada claim declara actor, acción, receptor/target, fuente, dirección, resultado y causales correctos;
- `atomic_action` representa el claim del instante sin cambiar actor, receptor, fuente o resultado;
- `must_show` une todos los causales y estos aparecen en `visible_entities`, performances, refs y prompt, salvo IDs enumerados por `ALLOWED_FILMABLE` válido;
- cada `required_visual_tokens` del claim aparece en su prompt como sustantivo/estado físico literal o equivalente inequívoco; `offscreen_policy` no lo exime;
- el prompt repite cada `prompt_signature`, conserva cardinalidad y abre con sujeto nominal + verbo finito + receptor/target explícito;
- contacto, origen/destino y resultado son visibles; `state_after` registra cambios y la siguiente escena los hereda;
- composite/strip conserva identidades en ambos subpanels, salvo cambio narrado.

En un HOOK, muerte, elección, transferencia, ataque, rescate o descubrimiento afirmados se muestran como evento actual. No pueden pagarse con reacción aislada, símbolo, amenaza posterior, montaje temático ni consecuencia futura. Ejemplos generales: `X murió frente a mí` obliga a mostrar X muriendo/terminal y al testigo en relación espacial; `me eligió` hereda X desde el átomo anterior y muestra la acción dirigida X→receptor. Si ambos eventos están agrupados y no caben, se separan sin cambiar el monólogo.

No paga: target sustituido por ropa/sombra/efecto; actor o fuente omitidos; energía ambiental cuando la voz atribuye la fuente a alguien; preparación por resultado; singular por plural; objeto/superficie/abertura/dinero narrados ausentes; prop inexistente; estado material contrario. Ref, ledger y prompt distinguen enrollado/extendido, cerrado/abierto, vacío/ocupado, intacto/roto, suelto/sostenido y seco/mojado.

Revisión lingüística final del prompt: cada oración inglesa tiene sujeto inequívoco, verbo finito y objeto o complemento físico válido. Falla una pila nominal, verbo transitivo sin objeto, preposición ausente, modificador colgante, posesivo/pronombre ambiguo o verbo aplicado al objeto equivocado.

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
    "background": "black",
    "role": "title",
    "story_beat_id": "B01"
  },
  "voiceover": {
    "text": "[pause] TÍTULO O FRASE"
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

`runtime_target_sec` copia literalmente `MACHINE_LOCK_V5_3.runtime_range_seconds`; el runtime recomputado debe caer dentro y `runtime_estimate_sec` debe coincidir con ese cálculo con tolerancia ±0.5 s. `target_runtime_seconds` es la meta editorial y su desviación se reporta, pero el rango bloqueado define el PASS. El preset puede ignorar font o position. No dependas de esos campos para identidad visual.

`payoff_scene_id` apunta a un panel cuyo `visual_plan.beat` es `PAYOFF`. `payoff_start_pct` es `segundos estimados acumulados antes de ese panel / runtime recomputado`, coincide con tolerancia ±0.01 y nunca supera `0.75`. Gates temporales: la card de título termina a ≤8 s y su índice cero-based es ≤`max(2,floor(total_scenes×0.20))`; `THREAT` inicia a ≤25 s; `DECISION`, a ≤45 s; `MANIFESTATION`, antes o en 60%; `PAYOFF`, antes o en 75%.

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

El `MONOLOGO_LOCKED` V5.3 usa átomos narrativos separados por `\n\n`. No se normaliza ni se aplica `.strip()` al construir escenas. Para preservar un separador al abrir una nueva escena, la izquierda conserva un LF final:

~~~text
voiceover_A.text = "Átomo A.\n"
voiceover_B.text = "Átomo B."
join con "\n"       = "Átomo A.\n\nÁtomo B."
~~~

Si dos átomos permanecen en la misma escena, `voiceover.text` conserva literalmente `"Átomo A.\n\nÁtomo B."`. Un tag nunca forma una escena de cero palabras: permanece unido a su átomo vecino. Cada átomo ya llega prevalidado por el Showrunner; el Director elige únicamente cómo agrupar átomos contiguos dentro de los rangos de ventana. Si no hay partición contractual, devuelve el packet al Showrunner y no modifica el monólogo.

## 13. Presupuesto TTS

Cuenta caracteres con tags.

- Después del preflight, el pipeline de TTS divide internamente `full_script` en límites de escena cercanos a 4,800 caracteres; ese chunking es comportamiento de runtime, no un campo ni un gate del JSON V5.3.
- Si una sola escena excede el máximo, el motor intenta cortarla al final de una oración y reconcatena el audio sin alterar el `full_script` validado.
- `tts_blocks` no forma parte del contrato activo y no debe emitirse.
- Más de 8,000 caracteres siempre genera un warning editorial no bloqueante: recorta o plantea otra parte; una petición expresa puede aceptar el warning, no eliminarlo.

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
- toda pose derivada y toda view declarada tienen uso real compatible
- referencias máximo tres
- ninguna restricción de refs elimina actor, target o prop causal narrado
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
- VOZ→IMAGEN copia/deriva todos los claims en `voice_facts`, resuelve referencias entre átomos y pasa `must_show`/`offscreen_policy`, `required_visual_tokens`, actor/acción/receptor/fuente/dirección/resultado por atomic_action, visibles, performances, refs y prompt
- cardinalidad, props y estados físicos coinciden; prompts pasan revisión sujeto+verbo+objeto
- entradas/cambios y rachas de cuatro closes/fragments tienen reanclaje real; cero views sin uso
- secuencias major, rampas, cuotas mínimas/máximas y distribución pasan desde metadatos estructurados
- cola final declarada = 0.45 s
