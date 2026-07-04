# Contrato para el generador de JSON — preset `pov-historias`

Reels/videos POV históricos en **primera persona**, **fotorrealistas**. Clon del flujo de
`habitos_finanzas` (Grok imagen → Grok image-to-video → ElevenLabs voz continua) con dos diferencias duras:

1. **TODAS las escenas se animan** (`render_mode: "animated"` en el 100%). No existe `"static"` aquí.
2. **POV puro, sin personaje visible**: nunca se ve al protagonista a cámara (solo sus manos/cuerpo en primer
   plano y lo que "ve"). No hay `type: "character"` persistente.

Además: sin texto horneado ni carteles → los subtítulos los dibuja Remotion (karaoke). Al arranque del video
hay un **fundido de negro → primera imagen** (~1.3s, "despertar"), automático, no se configura.

Acepta **9:16 (vertical)** y **16:9 (horizontal)**; lo decide `project.aspect_ratio`.

## 1. Idioma
Voiceover y `full_script` en **español** con ñ y tildes (UTF-8). Los prompts de imagen/animación en **inglés**.

## 2. Estructura raíz (en este orden)
`project`, `pipeline`, `ingredients`, `scenes`, `render_export`, `tts_export`.

## 3. `project`
```json
{
  "slug": "tenochtitlan_1519_pov_parte1",   // minúsculas, números, _ o -
  "title": "POV: Despiertas en Tenochtitlan, 1519 (Parte 1)",
  "language": "es-MX",
  "preset": "pov-historias",                // EXACTO (con guion)
  "aspect_ratio": "9:16",                   // "9:16" vertical  |  "16:9" horizontal
  "fps": 30,
  "reuse_ingredients": true                 // opcional; reusa ingredientes por nombre entre Partes
}
```

## 4. `pipeline` (fijo para este preset)
```json
{
  "image_generation": { "tool": "grok" },
  "animation": { "tool": "grok", "mode": "image_to_video" }
}
```

## 5. `ingredients[]` — solo lugares y objetos (SE GENERAN con Grok)
Nada de `type: "character"`. Un ingrediente por escenario o entidad que aparezca.
```json
{
  "id": "adobe_room",
  "type": "location_plate",                 // "location_plate" = escenario · "entity" = objeto/persona-figurante
  "reference_asset": "assets/ingredients/adobe_room.png",   // OBLIGATORIO: ruta donde el pipeline guarda el PNG
  "generation_prompt": "Photorealistic dim Aztec adobe room at dawn … empty (no people). Vertical 9:16 plate. no text, no watermark.",
  "regenerate": true
}
```
- `type` permitido aquí: **`location_plate`** (escenarios) y **`entity`** (objetos o figurantes como el
  mensajero). NO uses `location` ni `character` (el loader los rechaza / no aplican).
- `reference_asset` es obligatorio aunque `regenerate: true` — es la ruta de salida del PNG que genera Grok.
- Un figurante recurrente (p. ej. `mensajero_azteca`) va como `entity` y se referencia en las escenas donde salga.

## 6. `scenes[]` (cada escena — TODAS animadas)
```json
{
  "id": "scene_01",
  "render_mode": "animated",                // SIEMPRE "animated" en este preset
  "references": { "ingredients": ["adobe_room"] },   // ids de ingredients de esta escena (strings)
  "image_prompt": "First-person POV shot … <BLOQUE POV/STYLE en inglés> … Vertical 9:16.",
  "animation": {
    "engine": "grok_video",
    "duration_s": 6,
    "source": "this_scene_image",
    "prompt": "KEY ACTION (first 2s): … keep the viewer's body EXACTLY as in the source image. Vertical 9:16.",
    "trim_to_audio": true,
    "loop": false,
    "fallback": "static_source_image"
  },
  "voiceover": { "text": "Amanecer. Abres los ojos… y algo se siente mal.", "speaker": "narrador" }
}
```

### Reglas de escena (las valida el pipeline)
- `render_mode` = **`"animated"`** siempre → el bloque `animation` con su `prompt` es **obligatorio**.
- `references.ingredients` es un array de **strings** (ids); opcional pero recomendado (los que salgan en la escena).
- `image_prompt` en primera persona ("First-person POV shot, the viewer's own hands …") y **cierra** con
  `Vertical 9:16.` o `Horizontal 16:9.` según el formato.
- **Sin texto horneado**: NO metas frases-cartel dentro del `image_prompt`. Mantén
  `no text, no subtitles, no watermark, no logo`. Los subtítulos los pone el editor solo (karaoke).
- Plano/acción distinta por escena (no repitas el mismo encuadre consecutivo).

### Duración de cada escena
La marca **la voz**: cada escena dura lo que tarda ElevenLabs en narrar su `voiceover.text` (voz continua,
alineada con WhisperX). Para una escena más corta, escribe una frase más corta — no hay campo de "segundos por
escena" en este preset. El clip de Grok (`duration_s: 6`) se recorta/loopea a esa ventana automáticamente.

## 7. `render_export`
```json
{
  "renderer": "remotion_ffmpeg",
  "clip_order": ["scene_01", "scene_02", "scene_03"]   // OBLIGATORIO, sin duplicados, cubre todas las escenas
}
```

## 8. `tts_export` (ElevenLabs, voz continua)
```json
{
  "engine": "elevenlabs",
  "model_id": "eleven_v3",
  "voice_id": "8mBRP99B2Ng2QwsJMFQl",
  "voice_settings": { "stability": 0.0, "similarity_boost": 0.75, "style": 0.0, "speed": 1.2 },
  "language_code": "es",
  "output_format": "mp3_44100_192",
  "seed": 777,
  "full_script": "Amanecer. Abres los ojos… y algo se siente mal. Sales a la calle. …"
}
```
- `full_script` = **concatenación EXACTA** de todos los `voiceover.text` en el orden de `clip_order`, unidos
  por un espacio. Si no coincide carácter a carácter, el validador lo rechaza.
- Los tags de emoción de ElevenLabs V3 (`[urgent]`, `[whispers]`, …) van DENTRO del texto y también en
  `full_script`; V3 los interpreta (no los pronuncia). Guiones largos (>4800 chars) → usa
  `"model_id": "eleven_multilingual_v2"` con la misma voz, `speed: 1.15` y re-puntúa bien.
- Para V3, la edición local aplica limpieza de audio automática después de ElevenLabs.

## 9. Campos que NO sirven aquí (no los pongas)
- `scene_target_seconds`, `grok_clip_seconds` → solo los lee `novela-coreana`; en pov-historias no hacen nada.
- Cualquier `on_screen_text` / cartel → este preset no hornea texto ni dibuja carteles.

## 10. Diferencia 9:16 vs 16:9
Cambia SOLO `project.aspect_ratio` y el cierre de cada prompt (`Vertical 9:16.` ↔ `Horizontal 16:9.`). La
edición (fundido de despertar, voz continua, subtítulos, animación de todas las escenas) es idéntica.

Ejemplo completo mínimo: `pov_historias_ejemplo.json` (en esta misma carpeta).
