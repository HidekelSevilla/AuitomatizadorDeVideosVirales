# TTS ElevenLabs V3 — preset `historias`

Motor de voz alterno para el preset **historias** usando **ElevenLabs V3 (modo Creative)**. Es un
**reemplazo directo de `tools/fish-voice.mjs`**: produce los mismos archivos que el render ya consume,
así que el resto del pipeline (alineación + Remotion) no cambia. Solo toca JSON con
`project.preset == "historias"`; cualquier otro preset (Huesito, etc.) sigue con Fish Audio, intacto.

## Qué genera

```
public/<slug>/voice/full.mp3          ← un mp3 continuo, voz V3 leyendo tts_export.full_script
public/<slug>/voice/full.words.json   ← [{word,start,end}] en segundos absolutos (mismo formato que Fish)
```

Más un reporte por consola: costo total (créditos + USD estimado), `request-id`, y warnings de tags.

## Flujo (idéntico al de Fish, solo cambia el paso de voz)

```bash
# 0) instalar una vez:  python -m venv .venv-eleven && .venv-eleven/Scripts/pip install -r tts/requirements.txt
# 1) exportar la API key (NUNCA se hardcodea ni se loggea)
export ELEVENLABS_API_KEY=sk_...        # PowerShell: $env:ELEVENLABS_API_KEY="sk_..."
# 2) generar la voz (en vez de fish-voice.mjs)  -- desde remotion-editor/
python tts/tts_elevenlabs.py done/la_atlantida_sin_marco.json [--voice yWfbPEQeQJoED3Z5ujWN]
# 3) alinear (igual que hoy): arma scene._window + captions desde full.words.json
node align/inject-words.mjs done/la_atlantida_sin_marco.json
# 4) renderizar (igual que hoy)
npx remotion render ViralVideo out/la_atlantida_sin_marco.mp4 --props=done/la_atlantida_sin_marco.json
```

## Cómo funciona (decisiones clave)

- **Chunking obligatorio** (V3 se desestabiliza con textos largos y con <250 chars): el `full_script`
  se parte en bloques de **250–3000 chars** cortando **siempre en límite de escena** (pausa natural).
  Los bloques son cortes exactos de `full_script` → su concatenación lo reproduce TAL CUAL.
- **Sin Request Stitching** (no existe en `eleven_v3`): cada bloque es una petición independiente con
  el **mismo** `voice_id`, `voice_settings`, `seed` (42) y `model_id` → voz consistente entre cortes.
  Si un bloque sale raro, regeneras **solo ese** (barato).
- **Bloques en paralelo** (`MAX_CONCURRENCY`, default 4), se concatenan con ffmpeg en orden.
- **Tags V3** (`[whispers]`, `[sigh]`, `[serious]`): se mandan a la API **TAL CUAL** (V3 los interpreta;
  no se pronuncian). **No se borran.** Al construir `full.words.json` se descartan (no son palabras ni
  consumen tiempo). Si el guion trae un tag compuesto estilo Fish (`[warm, measured, storyteller tone]`),
  el script **no lo borra** pero deja un **WARNING** para corregirlo en el JSON.
- **Timestamps**: intenta `convert_with_timestamps`; si V3 (alpha) no lo soporta, cae a `convert` +
  **Forced Alignment API**. Al concatenar, suma a cada bloque el offset = duración acumulada de los
  previos (medida con ffprobe) → timeline único; de ahí salen las palabras absolutas.
- **Voz**: default `yWfbPEQeQJoED3Z5ujWN`. ⚠️ Para V3 usa voz de biblioteca, **Voice Design** o **IVC**;
  **no PVC** (no optimizado para V3). Si la voz es PVC, el log lo avisa.

## Configuración

Todo en `config.py` (override por variable de entorno): `MODEL_ID`, `STABILITY=0.0` (Creative),
`VOICE_ID`, `OUTPUT_FORMAT`, `LANGUAGE_CODE="es"`, `SEED`, `CHUNK_MAX_CHARS`, `CHUNK_MIN_CHARS`,
`MAX_CONCURRENCY`.

## Tests

```bash
python tts/test_tts_elevenlabs.py     # offline: A (chunking), offsets, tags/words, D (no-op), JSONs reales
```

Tests B/C (red real) se saltan si no hay `ELEVENLABS_API_KEY`.

> Nota: `full.words.json` queda en el formato exacto que produce Fish, así que `align/inject-words.mjs`
> arma `scene._window` y el karaoke igual que siempre. No hace falta ningún adaptador.
