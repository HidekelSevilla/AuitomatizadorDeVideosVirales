# Instrucción para el CREADOR DE JSON — preset `historias`
### (que las imágenes se sientan "hechas para la historia" y los cortes naturales)

## Qué se busca
Un documental donde el narrador CUENTA una historia de corrido y las imágenes van cambiando para
ilustrar EXACTAMENTE lo que se dice en cada momento. Como el nicho: se escribe la narración completa
primero, y cada imagen se diseña para el trozo de narración que acompaña.

## El problema actual (a corregir en el JSON)
NO es la cantidad de imágenes (2.5–4 s cada una está bien; deja igual o sube). Es que:
1. La narración tiene demasiadas pausas / frases sueltas → suena cortada, no "pareja".
2. Algunas imágenes son genéricas y no muestran lo que se narra en su segundo → el corte se siente "fuera de lugar".
El editor ya sincroniza voz e imagen con precisión; el arreglo es de GUION + PROMPTS.

## Reglas

### 1. La narración, como UNA historia fluida (lo más importante)
- `tts_export.full_script` = un relato continuo de principio a fin, con hilo: cada frase enlaza con la siguiente.
- Ritmo PAREJO. Usa "..." SOLO en 2–4 remates dramáticos de TODO el video (no en cada frase). El exceso de pausas es lo que rompe el flujo.
- Lenguaje hablado y natural, como alguien narrando — no telegrama ni frases inconexas.
- REQUISITO TÉCNICO: `full_script` debe ser la concatenación EXACTA, en orden, de los `voiceover.text` de cada escena (de eso depende la sincronización del subtítulo).

### 2. Cada escena = un BEAT VISUAL que AVANZA la historia (2.5–4 s)
- ~7–14 palabras por escena. Mantén o aumenta el número de escenas; NO las juntes.
- Cada escena debe mostrar algo VISUALMENTE NUEVO respecto a la anterior (un avance). Si la imagen sería casi igual a la previa, cambia el encuadre o el momento para que el corte se sienta intencional.
- El corte cae cuando la narración pasa a una idea nueva que se puede VER.

### 3. La imagen se diseña PARA lo que se narra en su ventana ("hecha para la historia")
- El `image_prompt` ilustra EXACTAMENTE el sujeto/acción de las palabras de ESA escena. Si la voz dice "le rapaban la cabeza", la imagen ES el rapado, no algo genérico.
- La PRIMERA palabra clave del `voiceover.text` debe ser lo que se ve, para que imagen y voz entren juntas (ej.: imagen del maguey → la voz arranca nombrando/mostrando el maguey).
- Pregúntate por cada escena: "¿qué está viendo el espectador justo cuando escucha esta frase?" → eso es el prompt.

### 4. Continuidad y progresión (que se sienta una secuencia, no stills sueltos)
- Reusa los mismos personajes/objetos/lugares (ingredients) a lo largo del video.
- Progresión lógica: establecer el lugar → acercarse al detalle → mostrar la consecuencia.
- Alterna encuadres entre escenas seguidas (plano general / acercamiento / detalle de un glifo) para que los cortes tengan variedad.

### 5. Tags de emoción: ÚSALOS GENEROSAMENTE (esto es lo que da el drama)
- Los tags `[...]` de Fish marcan el TONO de la narración. Fish los INTERPRETA (no los habla) y mantiene ese tono hasta el siguiente tag.
- PROBLEMA ACTUAL: los JSON traían solo ~6 de 36 escenas con tag → el resto (29) suena en tono NEUTRO y el video se siente plano. El nicho varía el tono constantemente.
- REGLA: pon un tag al INICIO del `voiceover.text` de CADA beat emocional — apunta a tener tag en ~1 de cada 2-3 escenas (mínimo ~12-15 de 36), no solo en 6. Cambia el tono cuando cambia el momento de la historia.
- Los tags van en INGLÉS y COMPUESTOS (2-4 descriptores), ej.: `[low, mysterious, cinematic narrator tone]`, `[grave, documentary narrator tone, quietly dramatic]`, `[serious, intriguing, slow build]`, `[calm, solemn, with restrained hope]`, `[tense, ominous, building suspense]`, `[awed, reverent, hushed]`. NUNCA tags simples en español.
- Arco típico: misterioso al abrir → tensión/intriga creciente → grave/impactante en el clímax → esperanzador/solemne al cerrar. Pero mete matices intermedios en cada giro.
- El tag es parte del `full_script` (va dentro del `voiceover.text`); Fish lo lee y NO se narra ni aparece en el subtítulo (el editor lo limpia).

### 6. Cartelas (`text_overlay`) solo en los giros de tema
- Las palabras-en-piedra van en los 8–12 giros reales de la historia, no en frases cualquiera.

## Checklist antes de entregar el JSON
- [ ] Leo `full_script` en voz alta y FLUYE como un relato (no se siente cortado).
- [ ] Hay ≤ 4 "..." en TODO el guion.
- [ ] Cada `voiceover.text`: 7–14 palabras y conecta con el anterior.
- [ ] Cada `image_prompt` muestra LO QUE se narra en esa escena (no genérico).
- [ ] La 1ª palabra clave de cada escena = lo que se ve en la imagen.
- [ ] Encuadres variados entre escenas consecutivas.
- [ ] ~12–15 escenas (de 36) con tag de emoción COMPUESTO en inglés (no solo 6); el tono varía con la historia.
- [ ] `full_script` == concatenación EXACTA de los `voiceover.text` en orden.

## Ejemplo (antes → después)
ANTES (cortado, imágenes genéricas):
- "El juego era brutal." → cancha vacía
- "Muy brutal." → cancha vacía otra vez
- "La pelota..." → una pelota

DESPUÉS (fluido, imágenes hechas para la historia):
- "Todo giraba en torno a una pelota de hule macizo." → la pelota pesada presentada en la cancha (plano general)
- "Pesaba hasta cuatro kilos, dura como piedra." → acercamiento a la pelota con glifo de peso
- "Un solo golpe podía romperte las costillas." → la pelota impactando al jugador (detalle de impacto)

> Nota: el editor (preset historias) ya hace voz continua, subtítulos alineados con WhisperX, crossfade y
> movimiento suave. No necesita cambios. Todo lo de arriba es exclusivamente cómo escribir el guion y los prompts.
