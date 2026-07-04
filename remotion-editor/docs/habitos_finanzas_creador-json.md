# Contrato para el generador de JSON — preset `habitos_finanzas`

Pega esto a tu chat que genera los JSON. Define exactamente lo que el pipeline (extensión Flow/Grok → ElevenLabs → render Remotion) ya acepta y valida. Si te sales de aquí, el JSON puede no cargar o el video sale mal.

> **Lo más importante (cambio vs el blueprint original):** el texto en pantalla va **HORNEADO en la imagen por Grok**. En cada `image_prompt` METE la frase de `on_screen_text` y **NO pongas** la línea `no text inside the drawing`. El editor NO dibuja texto en este preset.

---

## 1. Idioma
- `image_prompt` y `animation.prompt` → **inglés**.
- `voiceover.text`, `on_screen_text`, `title`, `topic` → **español (es-MX)**, con ñ y tildes reales (UTF-8), nunca ASCII ("años" no "anos").

## 2. Estructura raíz (en este orden)
`project` · `pipeline` · `ingredients` · `scenes[]` · `render_export` · `tts_export`.

## 3. `project`
```json
{
  "title": "…",
  "slug": "titulo_en_snake_case_habitos_finanzas",   // OBLIGATORIO = nombre de archivo y carpeta de medios
  "language": "es-MX",
  "preset": "habitos_finanzas",                        // EXACTO, no cambiar
  "format": "vertical_short",                          // o "horizontal_long"
  "aspect_ratio": "9:16",                              // 9:16 si vertical_short · 16:9 si horizontal_long. OBLIGATORIO
  "orientation": "vertical",                           // o "horizontal"
  "duration_mode": "short",                            // o "long"
  "tone": "calmado, util, aspiracional",
  "scene_count": 6,
  "series": { "id": "…", "part": 1 },                  // opcional (videos por partes)
  "reuse_ingredients": true
}
```

## 4. `pipeline` (fijo para este preset)
```json
{
  "image_generation": { "tool": "grok" },
  "animation": { "tool": "grok_video", "mode": "image_to_video" },
  "audio": { "tool": "elevenlabs", "mode": "continuous_narration" },
  "render": { "tool": "remotion_ffmpeg" }
}
```
> `image_generation.tool` debe ser **`grok`** y `animation.tool` debe **empezar con `grok`** (es lo que enruta el proveedor).

## 5. `ingredients[]` — dos clases

### 5a. Protagonista (PERSISTENTE, pre-hecho — NO se genera)
Va UNA vez. El PNG lo creas tú a mano y lo dejas en disco; el pipeline solo lo adjunta como referencia.
```json
{
  "ingredient_id": "protagonista_base",
  "type": "character",
  "persistent": true,
  "regenerate": false,
  "reference_asset": "assets/characters/protagonista_base.png",
  "generation_prompt": "(creado manualmente — NO regenerar)"
}
```
- `type: "character"` → el loader lo trata como **personaje recurrente**: se adjunta por su `reference_asset` en cada escena donde lo referencies, **sin generarlo ni gastar**.
- **OBLIGATORIO: `reference_asset` debe apuntar a `assets/characters/<id>.png`** (NO `assets/ingredients/`). Es la carpeta que el dev-server sirve para refs de personaje; si el PNG no está exactamente ahí, el SW NO lo adjunta (lo salta con warning). El PNG debe existir en disco antes de correr.
- `ingredient_id` SIEMPRE el mismo entre videos (`protagonista_base`).

### 5b. Props / entornos episódicos (SE GENERAN con Grok)
Uno por objeto/escenario que use el video. `generation_prompt` ultra-detallado en inglés.
```json
{
  "ingredient_id": "alcancia",
  "type": "entity",                 // entity = objeto · location_plate = escenario vacío
  "persistent": false,
  "regenerate": true,
  "reference_asset": "assets/ingredients/alcancia.png",
  "generation_prompt": "Clean flat 2D line-art illustration of a simple ceramic piggy bank … no readable text, no logo, no watermark. Square neutral asset framing."
}
```
- `type` permitido: `character` (solo el protagonista), `entity`, `location_plate`.
- En los `generation_prompt` de props SÍ se mantiene `no readable text` (son objetos, no llevan cartel).

## 6. `scenes[]` (cada escena)
```json
{
  "scene_id": "scene_01",
  "scene_type": "hook",                 // hook | problema | decision | demo | progreso | riesgo | cierre
  "render_mode": "animated",            // "animated" = clip Grok · "static" = imagen quieta. Ver §7
  "references": {
    "ingredients": [
      { "ingredient_id": "protagonista_base" },   // SIEMPRE que aparezca la persona (aunque sea su mano)
      { "ingredient_id": "escritorio" }           // + los props de la escena
    ]
  },
  "image_prompt": "Using the provided protagonist on the provided desk: … <BLOQUE STYLE> … with the short bold caption \"¿A DÓNDE SE FUE TU SUELDO?\" in clean empty space at the top, no other text, no logo, no watermark, no deformed hands, no extra fingers. Keep the provided protagonist EXACTLY as provided. Vertical 9:16.",
  "animation": {                        // SOLO si render_mode = "animated"
    "engine": "grok_video",
    "duration_s": 6,
    "source": "this_scene_image",
    "prompt": "Subtle motion in the first 2s … no new objects, no distortion, no text. Keep everything EXACTLY as provided. Vertical 9:16.",
    "trim_to_audio": true,
    "loop": false,
    "fallback": "static_source_image"
  },
  "on_screen_text": "¿A DÓNDE SE FUE TU SUELDO?",   // metadata; el render lo ignora (va horneado en image_prompt)
  "voiceover": { "text": "[curious] ¿Tu sueldo desaparece y no sabes en qué se fue?", "speaker": "narrador" }
}
```

### Reglas de escena (las valida el pipeline)
- `references.ingredients` debe tener **≥1** ref válida. Si aparece la persona → `protagonista_base` SIEMPRE.
- Si `render_mode: "animated"` → el bloque `animation` con su `prompt` es **obligatorio**. Si `static`, no lleva `animation`.
- El `image_prompt` empieza referenciando con "the provided …" y **cierra** con `Vertical 9:16.` o `Horizontal 16:9.` según el formato.
- **Texto horneado:** la frase de `on_screen_text` va DENTRO del `image_prompt` (como el ejemplo) y se QUITA `no text inside the drawing`. Mantén `no other text, no logo, no watermark`. Plano distinto por escena (close/medio/amplio/cenital), no repitas encuadre consecutivo.

## 7. Animación: 33–50% de las escenas
- `render_mode: "animated"` en **1 de cada 3 como mínimo, ideal la mitad**. Prioriza acción/transformación (la moneda que cae, la alcancía que se llena). El resto `static`.
- La duración la manda la voz (timestamps de `full_script`): el clip de 6s se recorta a la ventana de su voz; si la voz es más larga, congela el último frame; si Grok falla → usa la imagen estática.

## 8. BLOQUE STYLE (pégalo VERBATIM en inglés dentro de CADA `image_prompt`)
```
Clean flat 2D line-art illustration, modern editorial vector style. Even, consistent BLACK ink
outlines with a single medium line weight, smooth confident strokes. Mostly pure white or very
soft warm light-grey background. Flat solid colors used sparingly as SELECTIVE ACCENT only,
everything else stays black-line-on-white. NO heavy shading, NO gradients, NO 3D, NO photorealism,
NOT childish, NOT chibi. Calm, tidy, aspirational, modern-minimal mood. Generous negative space,
uncluttered and orderly composition. Young-adult everyday-life aesthetic.
```
Acento de color: 1–2 por escena, cálido mostaza = progreso/dinero · azul = enfoque/seguridad · verde = ahorro · rojo = alerta (mínimo, solo escenas `riesgo`).

## 9. `render_export`
```json
{ "renderer": "remotion_ffmpeg", "clip_order": ["scene_01","scene_02","scene_03","scene_04","scene_05","scene_06"] }
```
`clip_order` = los `scene_id` en el orden final. Es la autoridad del orden.

## 10. `tts_export` (ElevenLabs, voz continua)
```json
{
  "engine": "elevenlabs",
  "model_id": "eleven_v3",
  "voice_id": "sDh3eviBhiuHKi0MjTNq",
  "voice_settings": { "stability": 0.0, "similarity_boost": 0.75, "style": 0.0 },
  "language_code": "es",
  "output_format": "mp3_44100_192",
  "seed": 777,
  "full_script": "…concatenación EXACTA de todos los voiceover.text, en orden, separados por espacio…"
}
```
- **`full_script` = la concatenación EXACTA (con espacios) de TODOS los `voiceover.text`**, en el orden de `clip_order`. Es lo que posiciona cada imagen por timestamps. Un solo mp3 continuo.
- **Ruteo por largo de `full_script`:**
  - **< 5000 caracteres → `eleven_v3`** (Creative): guion CON tags simples `[curious] [thoughtful] [serious] [in awe]`, ~1 cada 1–2 frases, ANTES de la frase; la 1ª frase nunca `[whispers]`/`[soft]`; pausas con `…`, SIN `<break>`. Settings: `{ stability 0.0, similarity_boost 0.75, style 0.0 }`.
  - **≥ 5000 caracteres → `eleven_multilingual_v2`** (misma voz): guion CON puntuación, **SIN tags** (v2 los pronuncia); pausas por puntuación; `<break time="0.7s"/>` solo 4–8 veces, máx 1.5s. Settings: `{ stability 0.45, similarity_boost 0.75, style 0.25, use_speaker_boost true }` (+ `speed` 0.94–1.0 si corre rápido).

## 11. Campos PROHIBIDOS (no incluir)
`clip_duration_s`, `duration_per_clip_s`, `timeline`, ni `voice_id` a nivel de escena. La duración la decide la voz.

## 12. Honestidad (contenido)
Nada de promesas financieras ("gana $X", "duplica tu dinero", "hazte rico"), nada de humo motivacional, nada de señales de trading. Cripto solo como vida financiera y seguridad. Siempre acciones concretas y aterrizadas.

---

### Diferencia 9:16 vs 16:9
Solo cambian: `format`/`aspect_ratio`/`orientation`/`duration_mode`, el cierre de cada `image_prompt` (`Horizontal 16:9.`), y la composición (16:9 = personaje integrado en el ambiente con profundidad foreground/midground/background; 9:16 = personaje grande, 1–2 props, una idea). El guion largo (16:9) casi siempre cae en `eleven_multilingual_v2` (≥5000 chars). Todo lo demás es idéntico.
