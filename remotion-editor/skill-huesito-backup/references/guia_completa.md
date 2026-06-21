# 🎬 GUÍA MAESTRA — Cómo generar los JSON de "Huesito" (v2 · formato INGREDIENTES)

> Pipeline de shorts verticales virales formato **"¿Qué pasaría si…?"** con un esqueleto POV (Huesito) para **Instagram Reels, YouTube Shorts y TikTok**, en **español-MX**.
> Este documento es la **fuente de verdad**. Reúne todo lo aprendido: el **formato de ingredientes**, la mecánica del editor, palabras por escena, referencias, el preset, emociones, estilos de guion y hallazgos del nicho.

---

## 🆕 0. Qué cambió en esta versión (v2)

La diferencia grande respecto a la v1: **migramos al "formato INGREDIENTES"**.

- **Antes (v1, legacy):** cada `image_prompt` repetía VERBATIM el outfit de Huesito y las "fichas fijas" de aliens/naves/rival, y la consistencia del lugar se lograba con **anclaje por locación** (`references.scenes`). Funciona, pero es frágil y verboso.
- **Ahora (v2):** todo lo que se ve se define **UNA sola vez como un "ingrediente"** (una imagen pre-generada: el esqueleto vestido, un personaje, un fondo) y cada escena **lo referencia por id**. Los prompts ya **no repiten** el outfit ni las fichas: solo dicen *"the provided …"* y añaden cámara + acción.

Otras actualizaciones incorporadas:
- **`project.preset: "esqueletos"` es OBLIGATORIO** en todos los JSON (justo después de `title`). El loader lo usa para aplicar el preset visual del esqueleto.
- **Regla de gente mexicana DIVERSA** (no estereotipos): §10.
- **Modo AUTOCONCLUSIVO** (un solo video, remate + ending_card comment-bait) junto al modo cliffhanger por partes: §14.
- En los prompts, para excluir menores usar **"no minors" / "only adults"**, NUNCA la palabra `children`/`kid` (aunque sea en negación, dispara filtros): §15.
- Validador nuevo específico para el formato ingredientes: §19.

> El formato v1 (anclaje por locación + fichas verbatim) sigue documentado en el **Apéndice §21** para mantener los JSON viejos.

---

## 📑 Índice
1. [Reglas de oro (TL;DR)](#1-reglas-de-oro-tldr)
2. [El pipeline](#2-el-pipeline)
3. [Personajes y estilo visual](#3-personajes-y-estilo-visual)
4. [⭐ El formato INGREDIENTES (modelo mental)](#4--el-formato-ingredientes-modelo-mental)
5. [Estructura del JSON (campo por campo)](#5-estructura-del-json-campo-por-campo)
6. [Lo que NO se pone en el JSON](#6-lo-que-no-se-pone-en-el-json)
7. [Ritmo y palabras por escena](#7-ritmo-y-palabras-por-escena-mecánica-del-editor)
8. [Referencias en el formato ingredientes](#8-referencias-en-el-formato-ingredientes)
9. [Los prompts COMPLEMENTAN los ingredientes](#9-los-prompts-complementan-los-ingredientes)
10. [Gente mexicana diversa](#10-gente-mexicana-diversa-regla-visual)
11. [Carteles (time_label)](#11-carteles-time_label)
12. [Idioma de los prompts](#12-idioma-de-los-prompts)
13. [Emociones Fish Audio](#13-emociones-fish-audio)
14. [Cierres: autoconclusivo vs cliffhanger](#14-cierres-autoconclusivo-vs-cliffhanger)
15. [Calidad de prompts (incl. sin menores)](#15-calidad-de-prompts)
16. [Estilos de guion viral](#16-estilos-de-guion-viral)
17. [Hallazgos del nicho](#17-hallazgos-del-nicho)
18. [Checklist final](#18-checklist-final)
19. [Script de validación](#19-script-de-validación-ingredientes)
20. [Plantilla anotada de JSON](#20-plantilla-anotada-de-json-formato-ingredientes)
21. [Apéndice — formato legacy](#21-apéndice--formato-legacy-anclaje-por-locación)

---

## 1. Reglas de oro (TL;DR)

Si solo lees una sección, que sea esta:

1. **Formato INGREDIENTES.** Lo que se ve se define UNA vez como ingrediente (imagen pre-generada) y cada escena lo referencia por id. Los prompts **no repiten** outfit/fichas: dicen *"the provided …"* (§4, §9).
2. **`project.preset: "esqueletos"` y `project.slug` SIEMPRE.** `preset` justo tras `title` (sin esto el loader no aplica el preset del esqueleto); `slug` = nombre del archivo sin `.json` (el loader lo usa para nombrar el proyecto/carpeta de salida).
3. **La narración manda, no el clip.** Cada escena dura lo que dura su voz, a **~6 palabras/seg**. Objetivo: **15–23 palabras/escena (~3–4s)**. Techo Grok ~70 (§7).
4. **Más escenas = más dinámico.** ~**15–18 escenas** con una frase corta y punchy cada una.
5. **La acción clave en los primeros 2–3s.** Cada `animation_prompt` arranca con `KEY ACTION (first 2s)`.
6. **`references.scenes` SIEMPRE vacío.** En este formato la consistencia ya la dan los ingredientes; encadenar escenas clona frames.
7. **`references.characters`** = ids de los `character_edited` (el esqueleto vestido) presentes en la escena. **Puede ir VACÍO** si la escena es solo humanos/ciudad (un gag, un fondo). **`references.ingredients`** = ids de `entity`/`location_plate` presentes.
8. **`characters` = SOLO el base** (Huesito, y Sócrates si aplica). El base **NO se genera**: es la imagen fuente (`reference_asset`). Todo lo que SÍ se genera va en `ingredients`.
9. **Gente mexicana DIVERSA**, no estereotipos (§10). Excepción: escenarios no-mexicanos.
10. **`time_label` = pantalla negra = narración.** El cartel SOLO sale si la voz **ARRANCA con la 1ª palabra del label** (números escritos igual que la voz: "Año 1810", no "1810"). EVALÚA proactivamente: días, fases de torneo o **ETAPAS de la historia** (§11).
11. **Solo Huesito y Sócrates tienen nombre.** Lo demás, extras anónimos. Nada de famosos reales ni IP.
12. **No pongas** `clip_duration_s`, `duration_per_clip_s`, `timeline` ni `voice_id`.
13. **Emociones Fish: COMPUESTAS y con MODERACIÓN.** NUNCA simples (`[hopeful]`/`[sad]`): usa tags de 3–5 elementos (`[whispering, ominous, secretive]`). **Hook y cierre SIEMPRE** llevan tag compuesto; el resto solo en beats clave; captions limpios. Banco por momento: `references/narracion_fish_emociones.md` (§13).
14. **El cierre nunca es cartel "Final".** Es REMATE autoconclusivo (+ ending_card comment-bait) o cliffhanger dramático (§14).
15. **SIN menores.** En los prompts, "only adults"/"no minors"; nunca `child`/`children`/`kid`/`families`/`of all ages` (§15).
16. **Prompts ULTRA-detallados** en lo que el prompt SÍ controla (cámara, acción, luz, atmósfera, interacción entre ingredientes). Lo identitario (outfit, diseño de criatura, fondo) ya vive en el ingrediente (§9).
17. **Los INGREDIENTES se generan con MÁXIMO detalle — son la FUENTE.** El `edit_prompt`/`generation_prompt` define lo que se reusa en TODO el video: describe la playera/criatura/fondo con TODOS sus detalles (tela, textura, cuello, mangas, ribetes, número, material, color exacto, luz). **Un ingrediente genérico = todo el video genérico** (§4, §9.1). NO bajes el detalle "porque ahora hay ingredientes": el detalle se MUEVE al ingrediente, no se elimina.
18. **Personaje con `reference_asset` → `character_edited`, NUNCA `entity` desde cero.** Si Huesito o Sócrates ya tienen ref, vístelos con un `character_edited` basado en su id; generarlos como `entity` desde cero produce OTRA persona distinta a su ref (§3, §4).
19. **HOOK CORTO:** SOLO la pregunta *"¿Qué pasaría si [premisa en pocas palabras]?"* — punchy, <2s. **SIN segundas oraciones, SIN colas, SIN spoilers** (un hook largo pierde a la gente en los primeros 2s). Lleva tag compuesto de misterio.
20. **Los 4 REFUERZOS de Huesito (OBLIGATORIOS)** en su `edit_prompt` Y en cada escena: VIVO (no zombi), VESTIDO (no esqueleto pelón), FOTORREALISTA (no cartoon/Pixar), ESQUELETO COMPLETO (manos de hueso, no persona con máscara). El sujeto es *"the skeleton"*, generado PRIMERO y referenciado (§3).

---

## 2. El pipeline

```
Claude (genera el JSON, formato ingredientes)
        │
        ▼
GROK  → (1) genera cada INGREDIENTE (character_edited / entity / location_plate)
        (2) genera la imagen de cada ESCENA usando los ingredientes referenciados
        (3) anima cada escena a video (clips ~6s)   · prompts en INGLÉS
        │
        ▼
Fish Audio (TTS) — lee SOLO scenes[].voiceover.text (y tts_export.full_script)   · español-MX
        │
        ▼
CapCut / editor — sigue capcut_export.clip_order; mide cada clip con ffprobe
```

- El **loader del usuario** (su Claude Code) lee el JSON, valida, genera los ingredientes y luego las escenas. Usa **`project.preset`** para aplicar el preset visual ("esqueletos").
- El **editor mide el mp3/mp4 real con ffprobe** y ajusta cada clip a la duración de su narración (sobreescribe cualquier duración que viniera en el JSON).
- **Grok**: clip nativo **6s**, prompts en **INGLÉS**, guías `SHOT:` / `ANIMATE:`, techo **~70 palabras/escena**. (Flow/Gemini queda como alternativa legacy: clip 4s, prompts en español, techo ~48 — ver Apéndice.)

> ⚠️ En este formato **no hay img2img "real"**: el `character_edited` se **genera** a partir del `edit_prompt` (apoyado por el `reference_asset` del base y el preset). Por eso el `edit_prompt` debe describir al esqueleto con detalle (cráneo, ojos café grandes, proporción) y el base debe estar bien referenciado: si no, la identidad puede derivar entre ingredientes.

---

## 3. Personajes y estilo visual

### Únicos personajes con nombre: **Huesito** y **Sócrates**
- **Huesito** (protagonista POV, "el tú"): esqueleto **semi-realista y cinematográfico**. Hueso marfil envejecido, texturizado, con poros y grietas finas (fotorrealista). Cráneo y dientes anatómicamente creíbles **PERO con grandes ojos café redondos, vivos y MUY expresivos**. Alto y esbelto. **Sobreactúa cada emoción.**
  - ❌ NO Pixar/cartoon adorable, NO clínico/anatómico, NO chibi/cabezón.
  - Base: `assets/characters/huesito_ref.png` (el **esqueleto pelón**, sin ropa). En el formato ingredientes **NO lo vistes en cada prompt**: creas un `character_edited` (el esqueleto ya vestido) y lo referencias (§4).
- **Sócrates** (excepción del nicho, ragebaiter filosófico / cameo absurdo fuera de época): anciano humano fotorrealista, barba gris, túnica griega (o disfraz de la historia). Base: `assets/characters/socrates_ref.png`.
  - **Si tienes su `reference_asset` (lo normal), va como `character` base + un `character_edited`** cuando se viste distinto (ej. de portero) — así conserva SU cara. **NO lo generes como `entity` desde cero**: el generador inventaría OTRO viejo barbón distinto a tu Sócrates (esto ya pasó). Usa `entity` solo para un cameo de alguien de quien NO tienes ref.

### Todo lo demás = extras anónimos
Reyes, faraones, jarls, daimyos, emperadores, rivales, villanos, multitudes, dioses, aliens, criaturas… se generan como **`entity`** (si recurren y deben verse iguales) o se describen dentro del `image_prompt` (si son extras de fondo). **Nunca** llevan nombre propio ni van en `characters`.

### Prohibido (riesgo de strike)
- Famosos reales (políticos, deportistas, artistas) y **nombres de jugadores reales**.
- IP con dueño (Pokémon, Chapulín, personajes de películas/juegos, **escudos/logos de equipos o marcas**).
- **Inventar personajes originales NOMBRADOS** que nadie conoce.

---

## 4. ⭐ El formato INGREDIENTES (modelo mental)

La idea central: **separa lo que se GENERA de lo que se REFERENCIA.**

### Dos cubetas

**A) `characters` — la(s) FUENTE(S) base (NO se generan).**
Solo Huesito (y Sócrates si aplica). Cada uno con `display_name`, `reference_asset` (la imagen real que ya existe) y `description`. Es la materia prima; el pipeline NO la regenera.

**B) `ingredients[]` — TODO lo que SÍ se genera, una sola vez.** Tres tipos:

| type | qué es | campos clave |
|------|--------|--------------|
| `character_edited` | el **esqueleto base ya vestido/transformado** para este video (jugador, chef, sobreviviente, god-tier…) | `base` (apunta a `huesito`), `edit_prompt`, `output_file` |
| `entity` | un **personaje/criatura/objeto recurrente** que debe verse igual en sus escenas (un dios, un villano, una guajolota, Sócrates de portero, un arma) | `generation_prompt`, `output_file` |
| `location_plate` | una **placa de fondo/escenario** (un estadio, una calle, el Olimpo) **vacía de protagonistas** | `generation_prompt`, `output_file` |

Reglas de los ingredientes:
- **MÁXIMO DETALLE (lo más importante).** El ingrediente es la imagen fuente que se reusa en TODAS sus escenas; si sale genérico, TODO el video sale genérico. Describe outfit/criatura/fondo con detalles concretos: material y textura de la tela, color exacto, cuello/mangas/ribetes, número, patrones, props, luz. Nada de *"plain green jersey"* a secas → *"deep emerald-green technical jersey with ribbed collar and cuffs trimmed white and red, a large bold number, NO crest/logo/sponsor"*.
- **`id` y `output_file` únicos** (sin colisiones).
- `character_edited.edit_prompt` empieza describiendo al esqueleto **con detalle** (cráneo, **ojos café grandes**, proporción alta/esbelta, hueso texturizado) + el outfit detallado, sobre **fondo neutro**, cuerpo completo, sin escena, sin texto. Cierra con *"Keep the EXACT skull, big round brown eyes and tall slim proportions of the provided base"* y *"no scene, no text"*.

  **⭐ Los 4 REFUERZOS OBLIGATORIOS de Huesito** (para que NO derive a zombi, persona con máscara, cartoon o esqueleto pelón). Van en el `edit_prompt` del `character_edited` Y se repiten (resumidos) en cada `image_prompt`/`animation_prompt` donde Huesito sale:
  1. **VIVO:** *"a LIVING expressive skeleton, CLEAN aged ivory-bone skull and big round VIVID brown eyes — NOT a zombie, NOT undead, NOT a yōkai, no rot, no decay."*
  2. **VESTIDO:** *"FULLY DRESSED in [su atuendo clave], wearing the complete outfit like everyone else — NOT a bare or naked skeleton."*
  3. **FOTORREALISTA:** *"photoreal semi-realistic cinematic, realistic aged ivory-bone texture, realistic large expressive brown eyes in the sockets (NOT googly cartoon eyes) — NOT a cartoon / illustration / Pixar / 3D render; matches the realistic scene."*
  4. **ESQUELETO COMPLETO:** *"a FULL anatomical skeleton with bony skeletal hands and visible finger bones, exposed bony neck and ankles, only bone where the clothing doesn't cover — NO human flesh / skin / hands, NOT a person in a skull mask."*
  - **El SUJETO del `edit_prompt` es "the skeleton"**: *"Take the provided base **skeleton** and dress **IT** as…"*, NUNCA *"dress as a young man / person"* (eso le pone carne).
  - **Genera el `character_edited` PRIMERO** y pásalo como referencia (con buen peso) en cada escena donde aparezca.
  - **Si es deporte/fútbol:** añade *"a modern black-and-white football (soccer ball), even if anachronistic"* (Grok tiende a inventar balones raros).
- `entity.generation_prompt`: sujeto único, **fondo neutro gris**, cuerpo completo, sin escenario, sin texto. (Para humanos: "photoreal, realistic human, 9:16".)
- `location_plate.generation_prompt`: el escenario **EMPTY / sin gente en primer plano** (los sujetos se añaden por escena). Termina "no people, no text. Clean wide background plate."

### Cómo se arma una escena
Cada escena **referencia** los ingredientes que aparecen y el `image_prompt` los **combina**:
- `references.characters` = ids de los `character_edited` presentes (p. ej. `["huesito_futbol"]`). **VACÍO** si la escena no tiene al esqueleto (un gag de solo-humanos, un plano de ciudad).
- `references.ingredients` = ids de `entity` y `location_plate` presentes (p. ej. `["plate_azteca"]`, `["socrates_portero","plate_estadio_final"]`).
- `references.scenes` = **SIEMPRE `[]`**.

> Ejemplo real (Mundial): el esqueleto es el **jugador estrella** (`huesito_futbol`), Sócrates es un **entity** portero (`socrates_portero`), y hay 7 placas (`plate_azteca`, `plate_estadio_gdl`, …). Los gags satíricos (baches, inundaciones) son **solo humanos** → esas escenas llevan `references.characters: []` y solo una placa.

### Por qué este formato
- **Consistencia "gratis":** el outfit, el diseño de la criatura y el fondo se fijan en el ingrediente; no dependen de que el prompt los re-describa idéntico cada vez.
- **Prompts más limpios y enfocados** en cámara + acción + luz + interacción.
- **Menos deriva** de identidad y de lugar entre escenas (siempre que el ingrediente base esté bien hecho).

---

## 5. Estructura del JSON (campo por campo)

Campos raíz (formato ingredientes): `project`, `pipeline`, `characters`, `ingredients`, `hook`, `scenes[]`, `capcut_export`, `tts_export`. (Opcional `schema_version`.)

- **`project`**: `title`, **`preset` ("esqueletos") ← obligatorio, justo tras title**, `slug` (= nombre del archivo sin `.json`; lo usa el loader para nombrar el proyecto/carpeta de salida), `language` ("es-MX"), `aspect_ratio` ("9:16"), `fps`, `tone`, `render_notes`, y opcional `series` (`part`, `is_cliffhanger`, `standalone`, `next_part_teaser`).
- **`pipeline`**: `image_generation.tool` ("grok"), `animation.tool` ("grok"), `tts` (tool "fish_audio" + sintaxis de emoción), `editing.tool` ("capcut").
- **`characters`**: SOLO el/los base (Huesito, Sócrates), con `display_name`, `reference_asset`, `description`. **Nunca** un `character_edited` aquí.
- **`ingredients[]`**: los `character_edited`, `entity` y `location_plate` (§4).
- **`hook`**: `type` ("montage_from_generated_clips"), `voiceover` (la pregunta absurda <2s), `caption`, `montage_sources` (pedacitos de qué escenas usar), `edit_notes`. No genera imagen nueva.
  - **HOOK CORTO (crítico para retención):** el `voiceover` del hook es **SOLO la pregunta** *"¿Qué pasaría si [premisa en pocas palabras]?"* — punchy, <2s. **SIN segundas oraciones, SIN colas explicativas, SIN spoilers del final.** Un hook largo pierde a la gente en los primeros 2 segundos. Lleva un tag compuesto de misterio (ej. `[low, mysterious, cinematic narrator tone]`).
- **`scenes[]`** (lo importante), cada escena:
  - `id` (`scene_01`; en Parte 2+ usa prefijo único como `p2_scene_01`),
  - `time_label` (opcional, solo si hay cartel),
  - `location_id` (etiqueta lógica del lugar),
  - `voiceover` (`text` con `[emoción]` + frase corta, `tts_notes`),
  - `visual` (`image_prompt` y `animation_prompt`, en inglés, que **COMPLEMENTAN** los ingredientes),
  - `captions` (`text` limpio sin tags, `highlight_words`),
  - **`references`** (`characters`: ids de character_edited o `[]`; `ingredients`: ids de entity/plate; `scenes`: `[]`),
  - `edit_notes` (opcional).
- **`capcut_export`**: `clip_order` (ids en orden), `title_cards`, `cliffhanger_card` **o** `ending_card`, `caption_style`, `music_notes`, `sfx_notes`.
- **`tts_export`**: `full_script` = concatenación de todos los `voiceover.text` (con tags), para generar la voz de corrido.

---

## 6. Lo que NO se pone en el JSON

El editor los **ignora** o sobran:
- ❌ `clip_duration_s` / `duration_per_clip_s` — el editor mide con ffprobe.
- ❌ `timeline` (`main_start_s`/`main_end_s`) — la duración la define la voz.
- ❌ `voice_id` — la voz de Fish se elige **fuera** del JSON.
- ❌ `strength` / `frame_scope` en referencias — no hacen nada.
- ❌ En el formato ingredientes: **no repitas el outfit ni las fichas en cada `image_prompt`** (ya están en el ingrediente). Repetirlos contradice/“pelea” con la imagen de referencia.

---

## 7. Ritmo y palabras por escena (mecánica del editor)

**La regla más importante para que se vea bien.** El clip es relleno visual que entra en una ventana de tiempo, y **la ventana la define la NARRACIÓN**:
- Clip **más largo** que la voz → se **recorta** (se ve solo el inicio).
- Clip **más corto** → se **ralentiza** hasta 0.5x.
- El editor **mide el mp3/mp4 real con ffprobe**.

Números:
- Voz ≈ **6 palabras/segundo**. → `segundos ≈ palabras / 6`.
- **Objetivo: 15–23 palabras/escena (~3–4s).**
- **Techo Grok: ~70 palabras / 12s** (Flow ~48 / 8s). Pasarse → el video **se congela**.

Para que se sienta dinámico:
- **Más escenas, no más texto.** ~15–18 escenas, una frase punchy cada una.
- **`KEY ACTION (first 2s)`**: la acción/imagen clave en los primeros 2–3s; nunca el "punch" al final.

---

## 8. Referencias en el formato ingredientes

Tres listas por escena, simples y disciplinadas:

- **`references.characters`** — ids de `character_edited` que aparecen. Normalmente `["huesito_xxx"]`. **VACÍO `[]`** cuando la escena no muestra al esqueleto (gag de solo-humanos, plano de ciudad/fondo). *Esto es válido y correcto* (no fuerces al esqueleto donde no toca).
- **`references.ingredients`** — ids de `entity` y `location_plate` presentes. Una placa casi siempre; entities cuando salen (un dios, un villano, Sócrates).
- **`references.scenes`** — **SIEMPRE `[]`**. La consistencia de lugar la da la `location_plate`; encadenar escenas clona frames y mata el dinamismo.

Reglas prácticas:
- Cada `entity`/`plate` definido debe **usarse** al menos una vez (si no, sobra). El validador avisa de ingredientes no usados.
- Un id en `references` debe existir en `ingredients` y ser del tipo correcto (character_edited → `characters`; entity/plate → `ingredients`). El validador lo verifica.
- Reusa placas entre escenas del mismo lugar (p. ej. `plate_estadio_neutral` en octavos, cuartos y semi). No hace falta una placa por escena.

---

## 9. Los prompts COMPLEMENTAN los ingredientes

En v1 el prompt **describía todo**. En v2 el prompt **complementa** lo que ya traen los ingredientes. Cada `image_prompt`:

1. **Nombra los ingredientes que usa con "provided":**
   > *"Using the **provided** Huesito football player on the **provided** Azteca plate: …"*
   > *"Using the **provided** Socrates goalkeeper and the **provided** champion Huesito on the **provided** final stadium plate: …"*
2. **NO repite** el outfit del esqueleto ni el diseño de la criatura ni los detalles del fondo (ya están en el ingrediente). Repetirlos pelea con la imagen.
3. **SÍ aporta lo que el ingrediente no fija:**
   - **Cámara/encuadre** (`Camera:` y, en animación, `SHOT:`): wide épico, low hero, macro, dolly, contrapicado, push-in, persecución… **una toma distinta por escena**.
   - **La acción/pose exacta** y la **emoción** en la cara del esqueleto.
   - **Interacción entre ingredientes** (el esqueleto y Sócrates, el esqueleto sobre la placa, humanos alrededor).
   - **Humanos de relleno** (la afición, los rivales, los vecinos) descritos aquí, con la **regla de gente diversa** (§10) y colores que toquen (jerseys por bandera, etc.).
   - **Luz, hora y atmósfera** si refuerzan el momento (noche bajo reflectores, confeti, polvo).
   - **Guardrails de estilo** al cierre: *"the skeleton semi-realistic (NOT Pixar/cartoonish), humans realistic, NO gore, only adults, 9:16 vertical, no text, plain jerseys with no real crests."*
4. **`animation_prompt`** arranca con `KEY ACTION (first 2s): …`, luego `SHOT:` y `ANIMATE:`, y recuerda **"Keep the provided … EXACTLY as provided"** para no deformar la identidad.

> Regla práctica: lo **identitario** (quién/qué/dónde) → vive en el **ingrediente**. Lo **cinematográfico** (cómo se ve esta toma, qué pasa, con qué luz) → vive en el **prompt**.

### 9.1 Anatomía de un ingrediente ULTRA-detallado

El detalle que en v1 iba en cada `image_prompt` ahora va en el **`edit_prompt`/`generation_prompt` del ingrediente** (una sola vez, pero COMPLETO). Un buen ingrediente lleva:

1. **(character_edited) El esqueleto, descrito:** *"tall slim semi-realistic skeleton, weathered ivory bone with texture/pores/cracks, believable skull and teeth BUT huge round expressive brown eyes"*.
2. **El outfit/criatura con TODOS sus detalles:** tela y textura, color exacto, cuello/mangas/ribetes (en colores que toquen), número, costuras, props. Ej. kit de fútbol: *"deep emerald-green technical jersey, ribbed crew collar and cuffs trimmed white and red, large bold number, NO crest/logo/sponsor, white shorts with green side stripe, high green socks, green-white boots"*.
3. **Fondo neutro y encuadre:** *"plain neutral grey background, full body, centered, studio lighting"*.
4. **Candado de identidad (character_edited):** *"Keep the EXACT skull, big round brown eyes and tall slim proportions of the provided base"*.
5. **Cierre técnico:** *"hyperreal cinematic photography, sharp, no scene, no text"* (placas: *"no people, no text. Clean wide background plate"*).

> **Marcas reales:** describe el **look** (kit verde de selección, copa dorada) pero **sin escudo de federación, logo de marca ni sponsor**, y usa una **copa/objeto genérico** (no el diseño real registrado). Así se ve "del Mundial" sin caer en IP. Si el cliente acepta el riesgo de strike y pide el escudo real, es decisión suya.

---

## 10. Gente mexicana diversa (regla visual)

En las imágenes la gente debe verse **mexicana pero DIVERSA**, no un estereotipo:
- **Mezcla** estilo popular/cotidiano con gente **moderna y a la moda** (tipo Polanco/Roma/Condesa).
- **Evita estereotipos marcados:** que NO todos lleven rebozo/mandil/jersey de fútbol. Un toque popular **ocasional** está bien, no como default.
- **Sí claramente mexicanos/chilangos:** piel morena, cabello negro, rasgos latinos. **NO** look americano-suburbano.
- En los prompts: *"a crowd of **diverse** human Mexican adults (brown skin, dark hair), mixing everyday working-class and modern fashionable styles"*.

**Excepción:** en escenarios **no mexicanos** (el Olimpo griego, Roma, Egipto) esta regla no aplica a los locales — ahí lo mexicano es **la comida o el protagonista**, y los extras son de esa cultura/época.

---

## 11. Carteles (time_label)

- **`time_label` = pantalla negra = narración. El cartel SOLO aparece si la voz de la escena ARRANCA con la PRIMERA palabra del `time_label`** (el renderer compara la 1ª palabra del label contra la 1ª palabra hablada, normalizadas).
  - El `time_label` debe **empezar igual** que el `voiceover` de esa escena (misma 1ª palabra; los tags `[emoción]` se ignoran).
  - **Números: escríbelos igual que los dice la voz.** Si la voz dice *"Año 1810…"* → label `"Año 1810"` (NUNCA `"1810"`). Si dice *"Doscientos años después…"* → label `"Doscientos años después"` (NUNCA `"200 años después"`). `"Día 1"` sí funciona porque la voz arranca con *"Día…"*.
  - ❌ Si la 1ª palabra del label no es la 1ª palabra hablada, **el cartel NO sale** (pasó con `"1810"` y `"200 años después"`).
- **EVALÚA SIEMPRE y de forma PROACTIVA si hay progresión que marcar** (los carteles cortan el video y SUBEN la retención). Tres casos válidos:
  - **(a) Saltos de tiempo / días:** `"Día 1"`, `"Día 7"`, `"Esa noche"`, `"Al amanecer"`.
  - **(b) Fases reales de torneo (fútbol):** Fase de grupos → Octavos → Semifinal → La gran final.
  - **(c) ETAPAS claras de la historia:** `"Primer deseo"`/`"Segundo deseo"`/`"Último deseo"`, `"Antes"`/`"Después"`, `"El plan"`/`"La traición"`, etc.
  - Si las hay → ponlas (pantalla negra), la **voz dice el MISMO texto arrancando con la 1ª palabra del label** (regla de arriba), y **refléjalas en `capcut_export.title_cards`**.
  - Úsalos con medida (solo en los saltos/etapas reales). NO los fuerces en un momento ÚNICO y continuo sin etapas.
  - ❌ NUNCA títulos temáticos ("Tierra extraña", "El gran viaje") — eso no es una etapa, es decoración.
- **El cierre NUNCA es cartel "Final".**
- El **"¿PARTE 2?"** fuerte va como `cliffhanger_card` (texto sobre frame congelado); el remate autoconclusivo va como `ending_card` comment-bait (§14).

---

## 12. Idioma de los prompts

- **`image_prompt` y `animation_prompt` → INGLÉS** (Grok), con guías `Camera:` / `SHOT:` / `ANIMATE:` y `KEY ACTION (first 2s)`. (Flow/Gemini → español con `TOMA:`/`SE ANIMA:`, ver Apéndice.)
- **`voiceover`, `captions` y `tts_export` → SIEMPRE español-MX**, conversacional, con **modismos medidos** (máx ~1 por escena): "se le cae la quijada", "no manchen", "el mero mero", "ándale", "te la rifas", "puro corazón", "con todo"…
- **Grok no acepta negative prompt**: las exclusiones se vuelven afirmaciones (describe lo que SÍ quieres). Aun así cerramos con "9:16, no text" porque ayuda. Para menores, ver §15.

---

## 13. Emociones Fish Audio

- **Sintaxis:** S2-Pro (actual) → `[corchetes]`; S1 (legacy) → `(paréntesis)`. Misma lista; si cambias de modelo, find-replace `[ ]` ↔ `( )`.
- **Etiquetas COMPUESTAS, no simples (estilo documental cinematográfico).** NUNCA una emoción simple sola (`[hopeful]`, `[sad]`, `[happy]`, `[excited]`, `[curious]`…): suena plana o exagerada. Usa **tags de 3–5 elementos** con la forma `[modo de voz, emoción, intención, ritmo/cierre]` — ej. `[whispering, ominous, secretive]`, `[calm, solemn, with restrained hope, voice lowering at the end]`. **El hook y el cierre SIEMPRE llevan tag compuesto.** Pausas con `...` (dramática) y comas (suave); efectos `[break] [long-break]`.
- 📖 **Banco completo de etiquetas por momento (hook, miedo, caos, revelación, épico, cierre) + fórmula del cierre: `references/narracion_fish_emociones.md`. LÉELO antes de escribir los `voiceover`.**
- **Reglas (USAR CON MODERACIÓN — no abusar):**
  - **NO pongas un `[tag]` en cada escena.** Las emociones se usan con moderación: solo en los **momentos clave** (apertura, un giro, el clímax, el remate) — **~4–6 en todo el video**. **La mayoría de las escenas van SIN tag** (la voz fluye natural). Saturar de tags suena forzado y robótico.
  - **Efectos y pausas SOLO en 3–4 momentos clave** del video.
  - Los tags van en `scenes[].voiceover.text` y en `tts_export.full_script` (solo donde toque).
  - **Los `captions` van LIMPIOS, sin tags.**
  - Los tags **no se pronuncian ni cuentan** para el conteo de palabras.
- **Números y años: escríbelos CON LETRAS y bien generados (género) en el `voiceover`.** Fish lee los dígitos y puede equivocar el género: `"1810"` lo dijo *"mil ochocient**as** diez"* (mal). Escribe *"Año mil ochocient**os** diez"*. El `time_label` SÍ puede ir en dígitos (*"Año 1810"* en el cartel) — el cartel es texto aparte; solo importa que la **1ª palabra hablada coincida con la 1ª del label** (aquí "Año"). Igual para horas/cantidades que se pronuncien.

---

## 14. Cierres: autoconclusivo vs cliffhanger

El final **nunca** suena a narración plana. Dos modos:

### A) AUTOCONCLUSIVO (un solo video)
- Cierra con un **REMATE**: el giro final satisfactorio o cómico (god-tier, coronación, gol de campeonato, guardián…).
- Última escena con emoción de remate (`[explosive]` / `[proud]` / `[funny]`) y, si aplica, **congelar el frame final**.
- En `capcut_export` usa **`ending_card`** con **comment-bait** (no "¿Parte 2?"): p. ej. *"¿Tú crees que sí?"*, *"¿Qué harías tú?"*, *"Etiqueta a quien…"*.
- En `project.series` marca `standalone: true`, `is_cliffhanger: false`.

### B) CLIFFHANGER (saga por partes)
- Termina la última línea **en suspenso, con puntos suspensivos "…"** y voz baja/tensa (`[whispering]` o `[tense]`, una sola vez). Usa `[break]`/`[long-break]` alrededor de la revelación si ayuda.
- **La VOZ NUNCA anuncia la parte 2.** Nada de *"lo que sigue en la Parte 2"*, *"continuará"*, *"lo vemos en la parte dos"*. Solo deja la frase colgando con "…".
- Ej.: *"[tense] Con esto sí puedes contra ellos… [break] pero levantas la vista, y vienen muchas más…"* (corta en seco, sin mencionar la parte 2).
- El **"¿PARTE 2?"** vive SOLO en la **`cliffhanger_card`** (texto sobre frame congelado), nunca en la narración.
- En `project.series`: `is_cliffhanger: true`, `next_part_teaser`.

---

## 15. Calidad de prompts

1. **Detalle donde el prompt manda**: cámara, acción, luz/atmósfera, props, interacción, emoción. Lo identitario (outfit, criatura, fondo) ya está en el ingrediente — no lo repitas.
2. **Una toma DISTINTA por escena** (macro, dolly, contrapicado, grúa, push-in, persecución).
3. **El esqueleto sobreactúa la emoción** (ojos enormes, mandíbula, lenguaje corporal).
4. **Humanos realistas y diversos** (§10); rivales con sus colores; nada de famosos/escudos reales.
5. **Realismo**: no inventar banderas falsas; usar lugares/landmarks reales cuando aplica (Ángel, Azteca, Xochimilco, Reforma, metro de CDMX).
6. **Sin gore** donde haya acción/peligro: caídas en destellos de luz, criaturas que se "regeneran" sin sangre, sin bajas gráficas.
7. **Criaturas/aliens de diseño ORIGINAL** (no de ninguna película) y, si recurren, **como `entity`** para que se vean iguales.
8. **SIN menores (regla dura del animador).** En los prompts usa **"only adults" / "no minors"**. **NUNCA** escribas `child`, `children`, `kid`/`kids`, `baby`, `toddler`, `families`, `of all ages`, `teenage` — **ni siquiera en negación** ("no children"), porque el filtro las detecta igual y bloquea/contamina la escena. Para multitudes: *"a crowd of realistic adults"*. El animador **no anima** imágenes con menores.
9. **Guardrail de estilo** al final de cada prompt: *"semi-realistic skeleton (NOT Pixar/cartoonish/clinical), humans realistic, NO gore, only adults, 9:16, no text"*.

---

## 16. Estilos de guion viral

Lo que jala (no reutilizar guiones ya hechos; generar ideas frescas).

**A) Conversacional / relatable (humor)** — tono de cuate contando, 2ª persona presente, frases cortas, **escalada**, **CTA al final** (etiquetar/comentar). Subnicho fuerte: humor hiperlocal mexicano (el codo, el huevón, la quincena…).

**B) Ragebait / dilema** — el protagonista a veces **pierde** o se plantea un **dilema** que detona comentarios.

**C) Molde SERIO / épico (cliffhanger)** — 2ª persona, presente, tensión; contraste tecnología/ingenio vs amenaza; **progresión por días** con escalada; demostración de poder con reacción; **cliffhanger** → Parte 2. ⚠️ Narración causa-efecto: mostrar los pasos intermedios, no saltar a "ya es líder".

**D) Fútbol = crónica con tensión real** — el rival pega primero, remontada al último minuto, el portero héroe. Carteles = fases reales del torneo. (En el del Mundial: la **narración habla solo de México**; el **esqueleto es el jugador estrella** y el resto son humanos — útil cuando el "tú" es el país, no el personaje.)

**E) Comida × historia (núcleo del nicho)** — llevar comida mexicana a otra época/lugar (Roma, Grecia, Egipto, vikingos, China imperial, prehistoria). Arco: llegada → escepticismo → lo aman → escalada → consagración → remate. Variar el arco.

**F) Productos modernos en el pasado** — caer en otra época con objetos modernos (celular, encendedor, linterna) → te creen brujo/mago.

**G) Autoconclusivo "¿y si…?"** — un what-if cerrado en un video (superpoderes menos tú, kaiju de Xochimilco, México campeón): arco completo + remate satisfactorio/cómico + ending_card (§14).

---

## 17. Hallazgos del nicho

- El formato (esqueleto POV "¿Qué pasaría si…?" con IA) **nació en feb 2026**: **@theoretico5** lo originó en TikTok, **@mr_datavisuals** lo viralizó en Instagram. Referente en español: **@skeleton_line_espanol** (fútbol/Mundial).
- **Mecánica:** hook de pregunta absurda **<2s** (open loop) → narración 2ª persona → contraste esqueleto estilizado vs humanos realistas → cortes cortos con escalada → remate que detona comentarios.
- **Duración óptima 35–60s**, **retención meta >70%**, **subtítulos obligatorios** (grandes, palabras clave resaltadas).
- **Subnichos top es-MX/LatAm:** comida mexicana×historia, Mundial 2026, contrafactuales, productos modernos en el pasado, humor hiperlocal.
- **RIESGO:** en enero 2026 YouTube purgó canales por "contenido inauténtico"/AI slop → **variar cada video**, guion y voz cuidados, y **etiquetar como AI-generated**.

---

## 18. Checklist final

Antes de entregar un JSON (formato ingredientes):

- [ ] JSON válido (`json.load`).
- [ ] **`project.preset` == "esqueletos"** (justo tras `title`).
- [ ] **`characters`** = solo el/los base (Huesito/Sócrates), con `reference_asset`; **ningún** `character_edited` ahí.
- [ ] **`ingredients`**: cada uno con su `type`, `id` y `output_file` **únicos**; `character_edited` con `base`+`edit_prompt`; `entity`/`location_plate` con `generation_prompt`.
- [ ] **Ingredientes ULTRA-detallados** (tela/textura/color/cuello/ribetes/número/props/luz); nada de *"plain X"* genérico — el ingrediente es la fuente (§9.1).
- [ ] **Personajes con `reference_asset` (Huesito/Sócrates) van como `character_edited`** basado en su id, NO como `entity` desde cero (§3).
- [ ] Cada `entity`/`plate` **se usa** al menos una vez (sin ingredientes huérfanos).
- [ ] Por escena: `references.characters` ⊆ ids de `character_edited` (o `[]`); `references.ingredients` ⊆ ids de `entity`/`location_plate`; **`references.scenes` == `[]`**.
- [ ] Cada `image_prompt` **nombra los ingredientes con "provided"** y **NO repite** outfit/fichas.
- [ ] ~15–18 escenas; cada `voiceover.text` con **15–23 palabras** (la última puede variar); ninguna pasa **~70**.
- [ ] Cada `voiceover.text` empieza con **`[emoción]`**; efectos/pausas solo en 3–4 momentos; **`captions` sin tags**.
- [ ] Cada `animation_prompt` arranca con **`KEY ACTION (first 2s)`** y dice "keep the provided … as provided".
- [ ] **Gente mexicana diversa** (no estereotipos), salvo escenarios no-mexicanos (§10).
- [ ] **SIN menores**: ningún `child`/`children`/`kid`/`families`/`of all ages`/`teenage` en los prompts; usar "only adults"/"no minors" (§15).
- [ ] **Sin gore**, sin **escudos/logos/marcas reales**, sin **nombres de jugadores reales**; solo **Huesito y Sócrates** con nombre.
- [ ] `time_label` (si existe) **empieza con la 1ª palabra hablada** del voiceover (números escritos igual que la voz: "Año 1810", NO "1810"); solo "Día X" o fases de torneo.
- [ ] **NO** hay `clip_duration_s`, `duration_per_clip_s`, `timeline`, `voice_id`, `strength`, `frame_scope`.
- [ ] Cierre = **remate autoconclusivo (+ ending_card)** o **cliffhanger (+ cliffhanger_card)**, nunca "Final" (§14).
- [ ] `tts_export.full_script` = concatenación de todos los `voiceover.text`.

---

## 19. Script de validación (ingredientes)

Guárdalo como `validar_ing.py` y córrelo: `python3 validar_ing.py archivo.json`

```python
import json, re, sys, unicodedata

NUM = {'Día 1':'uno','Día 2':'dos','Día 3':'tres','Día 4':'cuatro','Día 5':'cinco',
       'Día 7':'siete','Día 10':'diez','Día 15':'quince','Día 30':'treinta',
       'Día 45':'cuarenta y cinco','Día 60':'sesenta'}
# OJO: usar "no minors"/"only adults" en los prompts; estos terminos DISPARAN aunque sea en negacion
KID = ('child','children',' kid',' kids','baby','toddler','infant','famil','of all ages','teenage')

def norm(s): return unicodedata.normalize('NFD', s).encode('ascii','ignore').decode().lower()
def words(t):
    t = re.sub(r'\[[^\]]*\]', ' ', t)            # quita [tags]
    t = re.sub(r'[^\w\sáéíóúñ]', ' ', t, flags=re.I)
    return [w for w in t.split() if w]

p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
ok = True
print(f'== {p} · formato ingredientes ==')
print('escenas:', len(d['scenes']))

# preset obligatorio
if d.get('project', {}).get('preset') != 'esqueletos':
    print('  ❌ project.preset debe ser "esqueletos"'); ok = False

# campos prohibidos (en cualquier nivel)
keys = set()
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items(): keys.add(k); walk(v)
    elif isinstance(o, list):
        for x in o: walk(x)
walk(d)
for bad in ('clip_duration_s','duration_per_clip_s','timeline','voice_id','strength','frame_scope'):
    if bad in keys: print('  ❌ campo prohibido:', bad); ok = False

# characters = solo base
chars = d.get('characters', {})
for cid, c in chars.items():
    if c.get('type') == 'character_edited':
        print(f'  ❌ characters.{cid}: no debe ser character_edited (va en ingredients)'); ok = False
    if not c.get('reference_asset'):
        print(f'  ❌ characters.{cid}: sin reference_asset'); ok = False

# ingredients
ings = {}; outs = {}; ce = set(); ent_plate = set()
for ing in d.get('ingredients', []):
    i = ing.get('id'); t = ing.get('type')
    if i in ings: print(f'  ❌ id duplicado: {i}'); ok = False
    ings[i] = ing
    of = ing.get('output_file')
    if not of: print(f'  ❌ {i}: sin output_file'); ok = False
    elif of in outs: print(f'  ❌ output_file duplicado: {of}'); ok = False
    else: outs[of] = i
    if t == 'character_edited':
        ce.add(i)
        if ing.get('base') not in chars: print(f'  ❌ {i}: base "{ing.get("base")}" no existe en characters'); ok = False
        if not ing.get('edit_prompt'): print(f'  ❌ {i}: sin edit_prompt'); ok = False
    elif t in ('entity','location_plate'):
        ent_plate.add(i)
        if not ing.get('generation_prompt'): print(f'  ❌ {i}: sin generation_prompt'); ok = False
    else:
        print(f'  ❌ {i}: type invalido "{t}"'); ok = False

# por escena
used = set(); n_tag = 0; last = d['scenes'][-1]['id']
for s in d['scenes']:
    sid = s['id']; vo = s['voiceover']['text']; ip = s['visual']['image_prompt']
    n = len(words(vo))
    if vo.strip().startswith('['): n_tag += 1     # emociones con MODERACION (ya NO se exige por escena)
    if any(w in norm(vo) for w in ('parte 2','parte dos','lo que sigue','continuara')):
        print(f'  ⚠️  {sid}: la voz no debe anunciar la Parte 2 (deja "..."; el gancho va en cliffhanger_card)')
    if n > 70: print(f'  ❌ {sid}: {n} palabras (>techo 70)'); ok = False
    elif not (15 <= n <= 23) and sid != last: print(f'  ⚠️  {sid}: {n} palabras (fuera de 15-23)')
    r = s.get('references', {})
    for c in r.get('characters', []):
        used.add(c)
        if c not in ce: print(f'  ❌ {sid}: references.characters "{c}" no es un character_edited'); ok = False
    for g in r.get('ingredients', []):
        used.add(g)
        if g not in ent_plate: print(f'  ❌ {sid}: references.ingredients "{g}" no es entity/location_plate'); ok = False
    if r.get('scenes') not in ([], None): print(f'  ❌ {sid}: references.scenes debe ir vacio'); ok = False
    if 'provided' not in ip.lower():
        print(f'  ⚠️  {sid}: image_prompt no dice "provided" (debe COMPLEMENTAR los ingredientes)')
    blob = (ip + ' ' + s['visual']['animation_prompt']).lower()
    if any(k in blob for k in KID): print(f'  ❌ {sid}: termino que genera menores (usa "no minors"/"only adults")'); ok = False
    if '[' in s['captions']['text']: print(f'  ❌ {sid}: caption con tag de emocion'); ok = False
    tl = s.get('time_label')
    if tl and NUM.get(tl) and NUM[tl] not in norm(vo):
        print(f'  ❌ {sid}: time_label "{tl}" no coincide con la narracion'); ok = False

if n_tag > max(6, len(d['scenes'])//3):
    print(f'  ⚠️  {n_tag}/{len(d["scenes"])} escenas con [emocion]: reduce el uso (solo momentos clave)')
noref = set(ings) - used
if noref: print('  ⚠️  ingredientes definidos pero NO usados:', sorted(noref))
print(f'  ingredients: {len(ce)} character_edited, {len(ent_plate)} entity/plate | usados: {len(used)}')
print('RESULTADO:', '✅ OK' if ok else '❌ revisar arriba')
```

---

## 20. Plantilla anotada de JSON (formato ingredientes)

Las `// notas` son explicativas — quítalas en el JSON real (JSON no admite comentarios).

```jsonc
{
  "project": {
    "title": "Que pasaria si ...",
    "preset": "esqueletos",                       // ← OBLIGATORIO, justo tras title
    "slug": "mi_video_huesito_grok",              // = nombre del archivo sin .json (lo usa el loader)
    "language": "es-MX",
    "aspect_ratio": "9:16",
    "fps": 24,
    "tone": "...",
    "render_notes": "Formato ingredientes; voz ~6 pal/seg; 15-23 palabras/escena; KEY ACTION first 2s; gente diversa; sin menores; sin gore.",
    "series": { "part": 1, "is_cliffhanger": false, "standalone": true }   // o is_cliffhanger:true + next_part_teaser
  },
  "pipeline": {
    "image_generation": { "tool": "grok" },
    "animation": { "tool": "grok" },
    "tts": { "tool": "fish_audio", "emotion_syntax": "S2=[brackets], S1=(parentheses)" },
    "editing": { "tool": "capcut" }
  },
  "characters": {                                  // SOLO el/los base; NO se generan
    "huesito": { "display_name": "Huesito", "reference_asset": "assets/characters/huesito_ref.png", "description": "Esqueleto semi-realista, hueso marfil, grandes ojos cafe expresivos, alto y esbelto. BASE; no se genera." }
    // "socrates": { ... } // opcional, si aparece con su ref
  },
  "ingredients": [                                 // TODO lo que SI se genera, una vez
    { "id": "huesito_rol", "type": "character_edited", "base": "huesito",
      "edit_prompt": "Take the provided base Huesito skeleton and dress it as ... Keep the EXACT skull, big round brown eyes and tall slim proportions. Plain neutral grey background, full body, centered, no scene, no text.",
      "output_file": "assets/ingredients/huesito_rol.png" },
    { "id": "villano", "type": "entity",
      "generation_prompt": "A single ... full body, centered, plain neutral grey background, no scenery, no text. 9:16.",
      "output_file": "assets/ingredients/villano.png" },
    { "id": "plate_lugar", "type": "location_plate",
      "generation_prompt": "Establishing plate of ... EMPTY: no people, no text. Clean wide background plate. Photoreal, 9:16.",
      "output_file": "assets/ingredients/plate_lugar.png" }
  ],
  "hook": {
    "type": "montage_from_generated_clips",
    "voiceover": "¿Qué pasaría si ...?",           // pregunta absurda <2s
    "caption": "...",
    "montage_sources": [ { "scene_id": "scene_02", "clip_in_s": 0.4, "clip_out_s": 1.4 } ]
  },
  "scenes": [
    {
      "id": "scene_01",
      "location_id": "lugar",
      "voiceover": { "text": "[emoción] Frase corta de 15-23 palabras.", "tts_notes": "..." },
      "visual": {
        "image_prompt": "Using the provided Huesito rol on the provided plate_lugar: [accion + interaccion + humanos diversos + camara + luz]. Only adults, no minors. Semi-realistic skeleton (NOT Pixar/cartoonish), humans realistic, NO gore, 9:16 vertical, no text.",
        "animation_prompt": "KEY ACTION (first 2s): [el punch al inicio]. SHOT: ... ANIMATE: ... Keep the provided skeleton EXACTLY as provided; humans realistic."
      },
      "captions": { "text": "frase limpia sin tags", "highlight_words": ["clave"] },
      "references": { "characters": ["huesito_rol"], "ingredients": ["plate_lugar"], "scenes": [] }
    },
    {
      "id": "scene_02",
      "location_id": "lugar",
      "voiceover": { "text": "[funny] Gag de solo-humanos (sin el esqueleto).", "tts_notes": "..." },
      "visual": {
        "image_prompt": "On the provided plate_lugar: [humanos diversos haciendo algo] ... Only adults, no minors. Humans realistic, NO gore, 9:16, no text.",
        "animation_prompt": "KEY ACTION (first 2s): ... SHOT: ... ANIMATE: ... Humans realistic."
      },
      "captions": { "text": "...", "highlight_words": ["..."] },
      "references": { "characters": [], "ingredients": ["plate_lugar"], "scenes": [] }   // characters VACIO: valido
    }
    // ... ~15-18 escenas
  ],
  "capcut_export": {
    "main_timeline_starts_after_hook": true,
    "clip_order": [ "scene_01", "scene_02", "..." ],
    "title_cards": [],                              // o [{ "scene_id":"scene_01","text":"Día 1" }]
    "ending_card": { "after_scene": "scene_18", "text": "¿Tú crees que sí?", "style": "texto grande sobre frame congelado; comment-bait, SIN '¿Parte 2?'" },
    // para saga: "cliffhanger_card": { "after_scene":"scene_18","text":"¿PARTE 2?","style":"..." }
    "caption_style": { "font": "Montserrat ExtraBold", "size": 72, "position": "center_lower", "max_words_on_screen": 5 },
    "music_notes": "...",
    "sfx_notes": "..."
  },
  "tts_export": {
    "full_script": "[emoción] Frase 1. [emoción] Frase 2. ..."   // concatenacion de todos los voiceover.text
  }
}
```

---

## 21. Apéndice — formato LEGACY (anclaje por locación)

Para los JSON viejos (schema `qpasaria_pipeline_v2_grok` / Flow). **No es el estándar actual**, pero sirve para mantenerlos.

- **Sin ingredientes.** Cada `image_prompt` **repite VERBATIM**: (a) el **outfit** completo de Huesito (la ref es el esqueleto pelón), y (b) las **"fichas fijas"** de toda entidad recurrente (aliens, naves, arma, rival) — mismo color/forma/material en todas las escenas.
- **Consistencia del lugar por ANCLA POR LOCACIÓN:** referencia la **escena de establecimiento** de cada locación en las demás de esa locación (`scene_01`→`02-05`, etc.) vía `references.scenes`. Deja sin referencia los establecimientos, transiciones y macros. **Nunca encadenes** N→N-1. ~40-55% de escenas con ancla.
- **`references.characters`**: Huesito SIEMPRE (con `priority`/`use_for`).
- **Anclaje del escenario en texto** en cada prompt (microbuses amarillos, puestos de tacos, landmark famoso: Zócalo+Catedral, Bellas Artes, Torre Latino, Ángel, Xochimilco).
- **Flow/Gemini:** `schema_version` a `..._example`, `tool` "flow", prompts en **español** (`TOMA:`/`SE ANIMA:`), techo **~48 palabras/escena**.
- El resto (ritmo, palabras, KEY ACTION, emociones Fish, carteles, cierres, sin menores, estilos de guion, hallazgos) es **igual** que en v2.

> Migrar un JSON legacy a ingredientes: saca cada outfit/ficha/lugar repetido y conviértelo en un `character_edited`/`entity`/`location_plate`; reemplaza el anclaje por `references.ingredients` + `references.scenes:[]`; recorta los prompts a "the provided …" + cámara/acción.

---

### Notas finales
- **Valida siempre** con §19 antes de entregar.
- **Parte 2+:** usa IDs con prefijo (`p2_scene_01`…) y actualiza `clip_order`, `hook`, y la tarjeta de cierre.
- Lo **identitario** vive en el **ingrediente**; lo **cinematográfico** vive en el **prompt**. Si recuerdas eso, todo lo demás encaja.
