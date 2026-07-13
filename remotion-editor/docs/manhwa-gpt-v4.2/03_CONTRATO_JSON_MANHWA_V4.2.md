# Contrato JSON Manhwa V4.2

Este archivo define forma mecánica. No contiene ideas de historia.

## 1. Campos raíz

Obligatorios:

- project
- pipeline
- characters
- escenarios
- scenes
- editing
- tts_export

Opcional si el proyecto lo usa:

- audio

No inventes campos raíz.

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
      "poses": {
        "base": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_base.png",
          "prompt": "..."
        },
        "outfit_trabajo": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/personaje_a_outfit_trabajo.png",
          "reference_pose": "base",
          "prompt": "..."
        }
      }
    },
    "objeto_a": {
      "display_name": "Objeto A",
      "poses": {
        "base": {
          "mode": "generate",
          "asset": "assets/characters/id_de_serie/objeto_a_base.png",
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
  "asset": "assets/characters/id_de_serie/personaje_a_base.png"
}
~~~

Reglas:

- asset nuevo = generate
- asset ya producido = existing
- una derivada usa reference_pose
- rutas bajo la serie
- los personajes recurrentes tienen base

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
          "prompt": "..."
        },
        "corridor_left_oblique": {
          "mode": "generate",
          "asset": "assets/escenarios/id_de_serie/escenario_a_corridor_left_oblique.png",
          "reference_view": "corridor_front_eye",
          "prompt": "..."
        }
      }
    }
  }
}
~~~

Una view se define por cámara. reference_view solo se usa cuando la nueva plate debe conservar arquitectura compatible.

## 6. Referencias de escena

~~~json
{
  "references": {
    "characters": [
      { "id": "personaje_a", "pose": "outfit_trabajo" }
    ],
    "assets": [
      { "id": "objeto_a", "pose": "base" }
    ],
    "escenario": {
      "id": "escenario_a",
      "view": "corridor_left_oblique"
    },
    "scenes": [
      { "scene_id": "scene_08" }
    ]
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

references.scenes:

- apunta únicamente a una escena anterior
- conserva el mismo instante y posiciones
- el prompt fuerza un plano o ángulo diferente
- no se encadenan tres o más referencias de escena consecutivas

## 7. Panel

~~~json
{
  "id": "scene_01",
  "type": "panel",
  "render_mode": "static",
  "references": {
    "characters": [
      { "id": "personaje_a", "pose": "outfit_trabajo" }
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

## 8. Narrative card

~~~json
{
  "id": "scene_02",
  "type": "narrative_card",
  "card": {
    "text": "TÍTULO O FRASE",
    "mode": "editor"
  },
  "voiceover": {
    "text": "Título o frase. [pause]"
  }
}
~~~

Una card no contiene:

- render_mode
- references
- visual
- editor_motion
- motion
- transition visual inventada

card.text va limpio, sin tags. voiceover.text conserva tags.

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
      "max_lines": 4
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
    }
  }
}
~~~

El preset puede ignorar font o position. No dependas de esos campos para identidad visual.

## 10. TTS de una voz

Se usa cuando no existe sistema ni segunda voz.

En escenas:

~~~json
{
  "voiceover": {
    "text": "[dark] Texto del narrador."
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
    "full_script": "[dark] Texto del narrador.\nSegunda línea."
  }
}
~~~

No contiene voices, dialogue ni elevenlabs_speed. En single, `voice_settings.speed` es el campo efectivo para la velocidad de generación.

## 11. TTS multivoz

Solo se usa cuando existe al menos una línea real de sistema o una segunda voz aprobada.

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
