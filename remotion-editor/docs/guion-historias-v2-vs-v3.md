# Historias — ruteo de modelo TTS y reglas de guion (V3 vs V2)

> Pégale TODO esto a tu creador de JSONs. Al final hay una instrucción para que investigue más y lo guarde en SU memoria.

## 1. Regla de ruteo (decídelo por el largo del `full_script`)

Mide los caracteres del `full_script` (con todo, tags incluidos):

- **< 5000 caracteres → modelo `eleven_v3`** (mismo voz). Cabe en 1 request → sin cortes. Es el modo más expresivo (audio-tags por beat). **Es el preferido siempre que el guion quepa.**
- **≥ 5000 caracteres → modelo `eleven_multilingual_v2`** (misma voz). v3 tendría que partirse y deja un salto de tono audible que v3 NO puede evitar. v2 acepta ~10000 chars en 1 request (sin corte) y, si pasa de eso, la extensión ya lo parte con `previous_text`/`next_text` (v2 sí soporta continuidad).

## 2. Qué cambia en el JSON (NO necesitas un tag nuevo)

El diferenciador YA existe: `tts_export.model_id`. Solo ponlo según el ruteo:

```json
"tts_export": {
  "engine": "elevenlabs",
  "model_id": "eleven_v3",                  // o "eleven_multilingual_v2"
  "voice_id": "...",                        // v3 -> 7UB6WMKyZDj19XRGC8Sb ; v2 -> sDh3eviBhiuHKi0MjTNq
  "language_code": "es",
  "output_format": "mp3_44100_192",
  "seed": 778899,
  "voice_settings": { ... },                // ver abajo, distinto por modelo
  "full_script": "..."                       // estilo distinto por modelo, ver abajo
}
```

`voice` y `voice_settings` por modelo:
- **v3** (corto): voz `7UB6WMKyZDj19XRGC8Sb`, `{ "stability": 0.0, "similarity_boost": 0.75, "style": 0.0 }` (Creative).
- **v2** (largo): voz `sDh3eviBhiuHKi0MjTNq` (respeta mejor la puntuación que 7UB6 en v2), `{ "stability": 0.4, "similarity_boost": 0.75, "style": 0.65, "use_speaker_boost": true }` (style 0.65 = más expresivo; aprobado por oído).

## 3. El GUION se escribe distinto según el modelo

### Si va a v3 (corto): tags de emoción
- Audio-tags simples por beat: `[curious] [dramatic] [ominous] [in awe] [marveling] [thoughtful] [serious] [sigh] [tense, urgent]`. ~1 cada 1-2 frases.
- **NO abrir con tag de susurro**; la 1ª frase puede ir sin tag o con uno neutro. Puntuación ligera.
- (Esto ya estaba afinado y aprobado.)

### Si va a v2 (largo): PUNTUACIÓN, NO tags
v2 **no entiende audio-tags** (los pronuncia/rompe). En v2 **cada signo de puntuación = una pausa**, así que la puntuación ES el control de prosodia. Reglas (confirmadas con doc oficial de ElevenLabs):

- **La puntuación debe seguir el RITMO NATURAL de la narración, no la gramática.** Pausa SOLO donde el narrador realmente respiraría. NO sobre-puntuar (suena entrecortado).
- **Coma (,)** = pausa corta (respiro). **Punto (.)** = pausa larga (fin de idea). NO termines cada fragmento en punto; encadena ideas relacionadas con coma + minúscula. Puntuación NATURAL (la voz correcta la respeta bien; ver nota de voz abajo).
- **Dos puntos (:)** solo para revelaciones DELIBERADAS con suspenso ("y entonces vio algo: un templo de oro"). NO para explicaciones que van de corrido.
- **Signos de exclamación `¡!` y de pregunta `¿?`** SÍ influyen la emoción/entonación en v2 (úsalos para enganchar/enfatizar). Las preguntas retóricas funcionan muy bien.
- **Pausa larga garantizada (cambio de TEMA)**: usa SSML `<break time="0.7s" />` justo en la transición. Máx 3s. **Úsalo poco: 4-6 en todo el guion**, solo en los saltos de tema grandes. Abusar de `<break>` desestabiliza v2 (acelera/mete ruido).
- **Pausa corta o suspenso**: raya `—` (deja la frase en suspenso); puntos suspensivos `...` dan tono de DUDA/vacilación (úsalos para emoción, no como pausa neutra).
- **Números y símbolos: escríbelos como PALABRAS** ("mil novecientos cincuenta y cinco", "quinientos años", "por ciento"), no dígitos ni %.
- **MAYÚSCULAS para énfasis NO son fiables en v2** (eso es de v3). Para enfatizar, reescribe/estructura la frase o usa `¡!`.
- La emoción en v2 sale del CONTEXTO del texto (palabras, signos), no de tags.

## 4. Ritmo / palabras por minuto (para calzar imágenes)
- **v2 ≈ 123 palabras/min** (~2.05 palabras/seg) a velocidad normal. El editor luego acelera el video a 1.15x → **≈ 142 wpm**.
- **v3 ≈ 143 wpm** a velocidad normal.
- Para una ventana de imagen de ~3s en v2 base ≈ 6 palabras habladas.

## 5. Requisito técnico (NO romper la sincronización)
- `full_script` == concatenación EXACTA y en orden de los `voiceover.text` de las escenas (de eso depende el karaoke/ventanas). La puntuación y los `<break>` NO cuentan como palabras, pero las PALABRAS deben ser idénticas entre `full_script` y la suma de escenas.

## 6. INSTRUCCIÓN PARA TI (creador de JSONs)
Investiga MÁS sobre cómo optimizar la narración en `eleven_multilingual_v2` (doc oficial de ElevenLabs, foros de audiolibros/locución, ejemplos reales): control fino de pausas con puntuación y `<break>`, longitud de oración ideal, cómo transmitir emoción sin tags, manejo de nombres propios/números. **Guarda en TU memoria** un bloque de "reglas de guion para v2" con lo que confirmes, para aplicarlo en cada JSON largo sin volver a investigar. Mantén separadas las reglas de v3 (tags) y v2 (puntuación).
