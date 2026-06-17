# remotion-editor

Editor automatico de videos virales con **Remotion 4** + **FFmpeg**.
Carpeta **independiente** de la extension Flow (no toca `content/`, `background/`, etc.).
Lee tu **JSON maestro** y arma el video completo sin edicion manual.

## Estado: verificado funcionando
- Remotion 4.0.477 + FFmpeg 8.1.1. Render de prueba real OK.
- Composicion `ViralVideo` probada end-to-end: hook + carteles + voz + subtitulos + musica.
- La duracion de cada escena se calcula **desde el MP3 de la voz** (sincronia automatica).

## Como renderizar (cero tokens, todo local)
```powershell
cd remotion-editor
npx remotion render ViralVideo out/mi-video.mp4 --props=./data/mi-proyecto.json
```
O abrir el editor visual: `npm run studio`.

## Convencion de archivos (IMPORTANTE)
El motor encuentra los medios por el `slug` del proyecto + el `id` de cada escena.
Pon los archivos asi (ejemplo con `"slug": "energeticas"`):

```
public/
  energeticas/
    clips/
      scene_01.mp4   <- animacion de la escena (la genera Flow)
      scene_02.mp4
      ...
    voice/
      hook.mp3       <- voz del hook (Fish Audio)
      scene_01.mp3   <- 1 MP3 por escena (Fish Audio)
      scene_02.mp3
      ...
    music/
      tenso.mp3      <- musica de fondo
```

## Campos que el motor usa de tu JSON maestro
Tu JSON ya trae casi todo. Lo que el render lee:
- `project.slug` — carpeta de medios (si falta, se deriva del title).
- `project.preset` — nombre del estilo visual (ver Presets abajo). Default: "esqueletos".
- `project.aspect_ratio` (9:16 -> 1080x1920) y `project.fps`.
- `hook.duration_s`, `hook.voiceover`, `hook.montage_sources[]` (scene_id + clip_in_s).
- `scenes[].id`, `scenes[].time_label` (cartel negro tipo "DIA 1"), `scenes[].captions` (text + highlight_words).
- `capcut_export.clip_order` — orden de las escenas.
- `capcut_export.caption_style` (font, size).
- `capcut_export.label_card_duration_s` — duracion del cartel (default 0.6s).
- `audio.music_file` (relativo al slug, ej "music/tenso.mp3") y `audio.music_volume` (default 0.18).
- `audio.clip_volume` — volumen del audio propio de las animaciones (default 0.2).
- `audio.transition_sfx` — whoosh automatico al inicio de cada escena (archivo en `public/sfx/`).
- `scenes[].sfx[]` — efectos puntuales: `{ "file": "lata.mp3", "at_s": 0.2, "volume": 0.9 }` (archivos en `public/sfx/`).

Nota subtitulos: el motor QUITA el `time_label` del subtitulo (ej "Hora 1:") porque ya lo
muestra el cartel negro. En `captions.text` puedes mandar solo la frase.

Los SFX viven en una libreria reutilizable `public/sfx/` (no por proyecto). Pon ahi tus
archivos (whoosh.mp3, lata.mp3, latido.mp3, glitch.mp3...) una vez y el JSON los referencia por nombre.

Campos extra del JSON maestro (image_prompt, references, etc.) se ignoran sin romper.

## Flujo a prueba de tokens
1. Flow llena el JSON y genera las animaciones -> `public/<slug>/clips/scene_XX.mp4`.
2. Fish Audio genera 1 MP3 por escena -> `public/<slug>/voice/scene_XX.mp3` (+ `hook.mp3`).
3. Corres `npx remotion render ViralVideo out/x.mp4 --props=./data/x.json`.
4. Sale el MP4 con voz sincronizada, hook, carteles, subtitulos resaltados y musica.

## Presets (temáticas / looks)
El JSON solo manda el nombre del preset en `project.preset` (ej. `"esqueletos"`,
`"frutinovelas"`). El look vive en `src/viral/presets.ts`, no en el JSON. Cada preset
define: color del subtitulo, color de la caja de la palabra clave, y si muestra el cartel
negro "DIA 1" (`show_label_card`). Para una tematica nueva: agrega una entrada en
`presets.ts` y usa su nombre en el JSON. Si el preset no existe, cae al default "esqueletos".

Mismo TEMA, distinto contenido (energeticas, papas fritas...) = mismo preset, solo cambias
textos/medios. Distinto LOOK = preset distinto. Formato estructuralmente distinto = (futuro)
composicion nueva + campo `format`.

## Archivos del motor
- `src/viral/ViralVideo.tsx` — motor (calculo de duracion + render).
- `src/viral/types.ts` — campos del JSON que se leen.
- `data/test-project.json` — ejemplo basado en el JSON maestro.
- `src/SmokeTest.tsx`, `src/VideoEdit.tsx` — composiciones simples de prueba.
