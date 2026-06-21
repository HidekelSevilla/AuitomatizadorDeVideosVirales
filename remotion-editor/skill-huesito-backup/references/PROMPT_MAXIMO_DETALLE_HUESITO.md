# 🎯 Prompt para pegar al aprobar una idea (modo MÁXIMO DETALLE — Huesito)

> Copia y pega este bloque cuando ya aprobamos la idea y quieres que genere el JSON. Le recuerda TODO el contrato y lo obliga a no bajar el detalle.

---

**Aprobada la idea. Genérame ya el JSON completo en formato INGREDIENTES, y sé ABSOLUTAMENTE detallado en TODO — cada detalle importa. No bajes el nivel de detalle por ninguna razón. Acuérdate de TODO esto y cúmplelo sin que tenga que repetirlo:**

1. **Ingredientes ULTRA-detallados (son la FUENTE).** Cada `edit_prompt`/`generation_prompt` describe su sujeto con TODO el detalle: material y textura de la tela, color exacto, cuello/mangas/ribetes, número, patrones, props, armadura, piel, pelo, luz. Nada genérico tipo "plain green jersey". Si el ingrediente sale genérico, todo el video sale genérico.

2. **`project` completo:** `preset: "esqueletos"` (justo tras `title`) y `slug` (= nombre del archivo sin `.json`). Más `language`, `aspect_ratio`, `fps`, `tone`, `render_notes`, `series`.

3. **Personajes:** `characters` = solo los base (Huesito, y Sócrates si sale), con `reference_asset`; NO se generan. Cualquier personaje con referencia (Huesito, Sócrates) va como `character_edited` basado en su id — **NUNCA como `entity` desde cero** (inventaría otra persona). Lo demás que se genera (criaturas, dioses, rivales, props, fondos) va en `ingredients` como `character_edited` / `entity` / `location_plate`, con `id` y `output_file` únicos.

4. **Prompts que COMPLEMENTAN, en inglés:** `image_prompt`/`animation_prompt` nombran los ingredientes con "the provided …", NO repiten el outfit/ficha (ya está en el ingrediente), y aportan cámara propia (una toma distinta por escena), acción/pose exacta, interacción, luz/atmósfera y humanos de relleno. Cada `animation_prompt` arranca con `KEY ACTION (first 2s)` y dice "Keep the provided … EXACTLY as provided".
   - **HUESITO — los 4 refuerzos OBLIGATORIOS** (en su `edit_prompt` Y resumidos en cada escena): **VIVO** (cráneo marfil limpio + ojos café vivos, NO zombi/undead), **VESTIDO** ("FULLY DRESSED… NOT a bare or naked skeleton"), **FOTORREALISTA** ("photoreal semi-realistic cinematic… NOT cartoon/illustration/Pixar/3D render"), **ESQUELETO COMPLETO** ("FULL anatomical skeleton with bony skeletal hands and visible finger bones… NO human flesh/skin/hands, NOT a person in a skull mask"). Sujeto = *"the skeleton"* (*"dress IT…"*, nunca "a young man"); genéralo PRIMERO y refiérelo. Deporte → *"a modern black-and-white football (soccer ball), even if anachronistic"*.

5. **Referencias por escena:** `references.characters` = ids de `character_edited` presentes (puede ir `[]` en gags de solo-humanos/ciudad); `references.ingredients` = ids de `entity`/`location_plate`; `references.scenes` = `[]` SIEMPRE.

6. **Narración es-MX:** `voiceover`/`captions`/`tts_export` en español-MX, 15–23 palabras por escena (~3–4s a 6 palabras/seg), techo ~70. Captions limpios (sin tags). Modismos medidos.
   - **HOOK CORTO:** el `hook.voiceover` es SOLO la pregunta *"¿Qué pasaría si [premisa breve]?"* — punchy, <2s, **sin segundas oraciones / colas / spoilers**.
   - **time_labels (proactivo):** evalúa días / fases de torneo / **ETAPAS de la historia** (Primer/Segundo/Último deseo, Antes/Después). Si las hay → pantalla negra + la voz **arranca con la 1ª palabra del label** (números igual que la voz: "Año 1810", no "1810") + reflejado en `title_cards`.

7. **Emociones Fish COMPUESTAS y con MODERACIÓN:** NUNCA tags simples (`[hopeful]`/`[sad]` solos); usa **tags de 3–5 elementos** `[modo de voz, emoción, intención, ritmo/cierre]` (ej. `[whispering, ominous, secretive]`, `[calm, solemn, with restrained hope, voice lowering at the end]`). **Hook y cierre SIEMPRE**; el resto solo en beats clave (la mayoría sin tag). Banco por momento: `references/narracion_fish_emociones.md`.

8. **Gente mexicana DIVERSA** (piel morena, cabello negro, mezcla popular + moderna), salvo escenarios no-mexicanos. **SIN menores** ("only adults"/"no minors", nunca `child`/`kid`/`families`). **SIN gore.** **SIN escudos/logos/sponsors reales, sin nombres de jugadores reales**; solo Huesito y Sócrates con nombre. Marcas: describe el look sin el escudo/logo, usa trofeos/objetos genéricos.

9. **Cierre:** autoconclusivo = REMATE + `ending_card` comment-bait (no "¿Parte 2?"). Cliffhanger = corta con voz de suspenso y "…", **sin** anunciar la parte 2 en la voz (el "¿PARTE 2?" va solo en la `cliffhanger_card`).

10. **NO pongas** `clip_duration_s`, `duration_per_clip_s`, `timeline`, `voice_id`, `strength`, `frame_scope`.

11. **Valida** con el validador de ingredientes y **no me lo entregues hasta que dé ✅ OK**. Incluye el bloque `references` en cada escena desde el inicio.

**En resumen: máximo detalle en cada prompt, ingredientes como fuente, narración México en es-MX, pocas emociones, sin menores/gore/IP, y validado. No te saltes nada.**
