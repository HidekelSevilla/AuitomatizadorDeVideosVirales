# Spec para el otro chat: voz de Fish CON timestamps por palabra

Objetivo: que la extensión, al generar la voz, además guarde los tiempos de cada palabra
para que el editor Remotion sincronice el karaoke. El editor YA consume estos datos; solo
hay que producirlos.

## 1. Cambiar el endpoint de Fish
Hoy el service-worker llama al TTS normal. Cambiar a:

```
POST https://api.fish.audio/v1/tts/stream/with-timestamp
Authorization: Bearer <FISH_API_KEY>
Content-Type: application/json
```
Body (mantener el mismo voice/modelo que ya usan; solo asegurar `format: "mp3"`):
```json
{
  "text": "<el texto de la escena: scenes[].voiceover.text  (o hook.voiceover)>",
  "reference_id": "<el mismo voice id que ya usan>",
  "format": "mp3",
  "latency": "normal"
}
```

## 2. Respuesta: SSE (text/event-stream)
Cada evento trae UN JSON con:
- `audio_base64` — chunk de audio en base64 (hay que concatenarlos en orden).
- `alignment` — `{ audio_duration, segments: [{ text, start, end }] }`  o `null`.
  - cada `segment` es UNA palabra, con `start`/`end` en **segundos** relativos a ESE chunk.
- `chunk_audio_offset_sec` — offset global del chunk en segundos.

## 3. Qué construir por cada escena (y el hook)
**(a) El mp3** (igual que hoy): decodificar cada `audio_base64`, concatenar los bytes en orden,
y guardar como `public/<slug>/voice/<id>.mp3` (mismo POST /save de siempre).
`<id>` = el id de la escena (`scene_01`, `scene_02`, ...) y `hook` para el hook.

**(b) Los timestamps**: recorrer todos los eventos que traigan `alignment` y, por cada `segment`:
```
{ "word": segment.text.trim(),
  "start": segment.start + chunk_audio_offset_sec,
  "end":   segment.end   + chunk_audio_offset_sec }
```
Acumular todos en UN array y guardarlo como sidecar:
`public/<slug>/voice/<id>.words.json`  (mismo POST /save, pero archivo .json).

Ejemplo de `scene_01.words.json`:
```json
[
  { "word": "Día",    "start": 0.00, "end": 0.34 },
  { "word": "uno",    "start": 0.34, "end": 0.72 },
  { "word": "Llegas", "start": 0.80, "end": 1.21 }
]
```

## 4. Reglas (importante)
- Unidades en **segundos** (no milisegundos), relativas al inicio del mp3 de esa escena.
- NO multiplicar por ninguna velocidad: el editor aplica `voice_rate` por su cuenta.
- `word` sin espacios alrededor (usar `.trim()`); el editor limpia la puntuación.
- Un sidecar por escena + uno `hook.words.json`. Mismo nombre base que el mp3.

## 5. Listo. En el editor (lado de Claude/remotion-editor)
Tras tener los `.words.json`, se corre:
```
node align/inject-words.mjs queue/<proyecto>.json   # mete los words al JSON maestro
node orchestrator/build.mjs                          # renderiza con karaoke sincronizado
```
Si una escena no trae sidecar, el editor cae a karaoke estimado (o se usa whisper como respaldo).
