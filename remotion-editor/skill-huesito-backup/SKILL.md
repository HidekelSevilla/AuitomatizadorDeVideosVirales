---
name: huesito-json
description: Genera y valida los JSON del pipeline de shorts virales "Huesito" (esqueleto POV, formato "¿Qué pasaría si...?", español-MX, para Instagram Reels / YouTube Shorts / TikTok) en FORMATO INGREDIENTES. Úsala SIEMPRE que el usuario pida crear, generar, armar, escribir, rehacer, dinamizar, corregir, validar o hacer un outline de un JSON, guion o video de Huesito, o cuando mencione "Huesito", esqueleto POV, "¿qué pasaría si...?", el pipeline de shorts, Grok, Fish Audio, ingredientes / character_edited / location_plate, escenas con voiceover, o cualquier short del personaje — aunque NO diga la palabra "JSON".
---

# Huesito — Generador de JSON (formato INGREDIENTES)

Genera JSON listos para el pipeline: **Claude (JSON) → Grok (imagen+video, clips ~6s, prompts en inglés) → Fish Audio (TTS es-MX) → CapCut**. El editor mide cada audio/clip con ffprobe y arma el video.

**Antes de generar nada:** lee `references/guia_completa.md` (la fuente de verdad, con todo el detalle), **`references/narracion_fish_emociones.md`** (cómo escribir los `voiceover` con emociones cinematográficas), abre un ejemplo validado en `references/examples/` para calcar la estructura, y ten a mano `references/PROMPT_MAXIMO_DETALLE_HUESITO.md`. Las ideas aprobadas + banco están en `references/IDEAS_HUESITO_BACKLOG.md`. **Valida con `scripts/validate.py` hasta ✅ OK** antes de entregar.

**Flujo con el usuario:** primero entrega un OUTLINE / muestra de guion para aprobar; **NO generes el JSON completo hasta que el usuario confirme** que el guion va bien. (El usuario suele revisar un pedazo del guion y luego pedir el JSON.)

## Flujo
1. Lee la guía (índice + secciones relevantes) y abre un ejemplo de `references/examples/`.
2. Idea nueva → primero entrega un **OUTLINE** (pitch + ~18 escenas en una línea + qué fijas + opciones de remate). Cuando el usuario apruebe, arma el JSON.
3. Escribe el JSON en formato ingredientes (abajo). Guárdalo en `/mnt/user-data/outputs/` con slug `tema_huesito_grok.json`.
4. `python3 scripts/validate.py <ruta>` → corrige hasta `✅ OK`.
5. Entrega con `present_files` + resumen corto.

## El modelo INGREDIENTES (lo esencial)
Separa lo que se GENERA de lo que se REFERENCIA:
- **`characters`** = SOLO los base (Huesito, y Sócrates si sale), con `reference_asset`. NO se generan. Cualquier personaje con referencia va como `character_edited` basado en su id, NUNCA como `entity` desde cero (un entity desde cero inventa OTRA persona).
- **`ingredients[]`** = TODO lo que SÍ se genera, una vez, ULTRA-detallado:
  - `character_edited` (el esqueleto/Sócrates ya vestido): `base`, `edit_prompt`, `output_file`.
  - `entity` (criatura/dios/rival/prop recurrente): `generation_prompt`, `output_file`.
  - `location_plate` (fondo/escenario VACÍO): `generation_prompt`, `output_file`.
  - ids y `output_file` únicos; cada ingrediente se usa al menos una vez.
- Por escena, `references`: `characters` = ids de `character_edited` presentes (puede ir `[]` en gags de solo-humanos / planos de ciudad); `ingredients` = ids de `entity`/`location_plate`; **`scenes` = `[]` SIEMPRE**.

## Reglas de oro (v2)
1. **Ingredientes ULTRA-detallados** (son la FUENTE: material/textura/color exacto, cuello/mangas/ribetes, número, patrón, props, piel, pelo, luz). Si el ingrediente sale genérico, todo el video sale genérico. El detalle se MUEVE al ingrediente, no se elimina.
2. **`project.preset: "esqueletos"`** (justo tras `title`) **y `project.slug`** (= nombre del archivo sin `.json`) SIEMPRE.
3. **Prompts COMPLEMENTAN, en inglés:** `image_prompt`/`animation_prompt` nombran los ingredientes con "the provided …", NO repiten outfit/ficha, y aportan cámara propia (una toma distinta por escena), acción/pose, interacción, luz/atmósfera y humanos de relleno. Cada `animation_prompt` arranca con `KEY ACTION (first 2s)` y dice "Keep the provided … EXACTLY as provided".
4. **Narración es-MX 15–23 palabras/escena** (~3–4s a ~6 pal/seg), techo ~70; la última puede variar. **Captions LIMPIOS** (sin tags). Modismos medidos (máx ~1 por escena).
5. **Emociones Fish COMPUESTAS y con MODERACIÓN:** NUNCA tags simples (`[hopeful]`/`[sad]` solos); usa **tags de 3–5 elementos** `[modo de voz, emoción, intención, ritmo/cierre]` (ej. `[whispering, ominous, secretive]`). **Hook y cierre SIEMPRE** con tag compuesto; el resto solo en beats clave (la mayoría sin tag). Banco completo por momento en **`references/narracion_fish_emociones.md`** (léelo). Captions LIMPIOS.
6. **Gente mexicana DIVERSA** (piel morena, cabello negro, mezcla popular + moderna), salvo escenarios no-mexicanos. **SIN menores** ("only adults"/"no minors"; nunca `child`/`kid`/`kids`/`families`/`of all ages`/`teenage`, ni en negación). **SIN gore.** **Sin escudos/logos/sponsors/marcas reales ni jugadores reales nombrados**; solo Huesito y Sócrates con nombre (describe el look; usa trofeos/objetos genéricos).
7. **time_labels (proactivo, sube retención):** EVALÚA SIEMPRE si hay (a) saltos de tiempo/días, (b) fases de torneo o **(c) ETAPAS de la historia** (Primer/Segundo/Último deseo, Antes/Después). Si las hay → pantalla negra + la **VOZ ARRANCA con la 1ª palabra del label** (números escritos igual que la voz: "Año 1810", no "1810") + refléjalo en `capcut_export.title_cards`. NO los fuerces en un momento único continuo; NUNCA títulos temáticos.
8. **HOOK CORTO:** el `hook.voiceover` es SOLO la pregunta *"¿Qué pasaría si [premisa breve]?"* — punchy, <2s, **sin segundas oraciones / colas / spoilers** (con tag compuesto de misterio).
9. **Cierre:** autoconclusivo = REMATE + `ending_card` comment-bait (sin "¿Parte 2?"). Cliffhanger = corta con voz de suspenso y "…", sin anunciar la Parte 2 en la voz (el "¿PARTE 2?" va solo en la `cliffhanger_card`).
10. **NO pongas** `clip_duration_s`, `duration_per_clip_s`, `timeline`, `voice_id`, `strength`, `frame_scope`.
11. ~15–18 escenas dinámicas; el "punch"/acción clave en los primeros 2s, nunca al final del clip.
12. **Los 4 REFUERZOS de Huesito (OBLIGATORIOS, anti-deriva)** — en su `edit_prompt` Y resumidos en cada escena donde sale (detalle exacto en `references/guia_completa.md` §3): **(1) VIVO** (cráneo marfil limpio + ojos café vivos, NO zombi/undead); **(2) VESTIDO** ("FULLY DRESSED… NOT a bare/naked skeleton"); **(3) FOTORREALISTA** ("photoreal semi-realistic cinematic… NOT cartoon/Pixar/3D render"); **(4) ESQUELETO COMPLETO** ("FULL anatomical skeleton with bony hands and finger bones… NOT a person in a skull mask"). El sujeto es *"the skeleton"* (*"dress IT…"*, nunca "a young man"); genéralo PRIMERO y refiérelo. Deporte → *"a modern black-and-white football"*.

## Personaje
**Huesito**: esqueleto semi-realista, hueso marfil envejecido y texturizado con grietas finas, dientes creíbles, **grandes ojos café redondos y muy expresivos**, alto y esbelto, sobreactúa cada emoción. NUNCA Pixar/cartoon/chibi/clínico. **Sócrates** (si sale): anciano griego fotorrealista (barba gris, túnica) o disfrazado según la historia. Todo lo demás = extras anónimos.

## Estructura raíz
`project` (title, **preset**, **slug**, language, aspect_ratio, fps, tone, render_notes, series) · `pipeline` · `characters` · `ingredients[]` · `hook` · `scenes[]` (id, time_label?, references{characters,ingredients,scenes}, visual{image_prompt,animation_prompt}, voiceover{text}, captions{text}) · `capcut_export` (clip_order, title_cards, ending_card **o** cliffhanger_card, caption_style, music_notes, sfx_notes) · `tts_export` (full_script = concatenación de todos los voiceover.text, con tags).

Para el detalle completo, plantilla anotada (§20), validador (§19) y formato legacy (§21), consulta `references/guia_completa.md`.
