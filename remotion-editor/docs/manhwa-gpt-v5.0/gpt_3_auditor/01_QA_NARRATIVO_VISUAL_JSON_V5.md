# QA integrado Manhwa V5

## 1. Severidades

- **HARD:** contrato roto, monólogo alterado, referencia inexistente, escena imposible o canon contradicho. Bloquea.
- **REPAIR:** puede corregirse sin cambiar canon. El Auditor repara automáticamente.
- **WARNING:** decisión válida con riesgo; se cuantifica y justifica.
- **NOT_RUN:** requiere renders no recibidos.

## 2. Narrativa

### Integridad

- Story Packet y JSON coinciden en serie/Parte.
- Unión de voiceover = `MONOLOGO_LOCKED` exacto.
- `full_script` = unión de voiceover con `\n`.
- Palabras y caracteres dentro del presupuesto aprobado.

### Comercialidad

Comprueba ocho funciones:

1. desigualdad/presión
2. amenaza/prueba
3. decisión emocional
4. agencia temprana
5. manifestación/progreso
6. mini-victoria
7. reacción externa
8. costo/desafío

Mínimo 7/8 para `shonen_manhwa`.

### Hook

0–2: claridad, contradicción, peligro/consecuencia, promesa serial, identidad. Mínimo 8/10. Parte 1 promete antes del nombre.

### Oyente frío

Debe explicar quién, deseo, amenaza, regla inmediata, decisión, ganancia, costo y cambio final sin consultar biblia.

### Oralidad

Con densidad baja: máximo dos términos nuevos. Nombres presentados por función/relación. Sin manual técnico, exposición histórica o metáforas que oscurezcan acción.

## 3. Correspondencia semántica

Clasifica cada panel:

- acontecimiento
- causa
- consecuencia
- contexto
- recuerdo
- reacción
- contraste

Falla si solo muestra un objeto asociado y pierde el significado. La imagen puede ampliar la voz con canon ya aprobado, pero no inventar revelaciones.

## 4. Anclas

Exige hook, mundo/jerarquía, amenaza, clímax/manifestación y cliffhanger.

Para cada una reporta:

- scene_id
- plano/ángulo
- sujeto/acción
- capas
- fuente de luz
- acento/reflejo
- prueba silenciosa PASS/FAIL

Tres o más medium-wide/wide. Ninguna es prop aislado, arquitectura vacía o pose.

## 5. Cámara y staging

- acción 3+ participantes tiene master previo
- eje declarado y respetado
- participantes sembrados
- reanclaje tras cambio geográfico o 4–6 closes
- máximo dos close/macro consecutivos
- máximo dos paneles consecutivos con mismo sujeto dominante
- prop protagonista máximo dos en ventana de ocho
- cambios de cámara motivados

Top-down: geografía, suelo dominante, sin horizonte/cielo grande. Master humano: high-oblique/wide, cuerpos legibles, suelo compartido. Poder/relación no se vende con personajes miniatura.

## 6. Escala

En panels con objeto grande y humanos:

- objeto completo
- proporción relativa descrita
- pies/ruedas/contactos
- mismo plano de suelo
- perspectiva media estable
- verticales razonables
- sin foreground enorme que deforme jerarquía

Sin render, esto valida intención y queda `NOT_RUN` para resultado.

## 7. Ritmo

Clasifica tratamiento de cada escena y bloque.

- calma/investigación: 30–45%
- preparación: 20–30%
- acción continua: 10–20%
- consecuencia/vínculo: 25–40%
- total habitual: 22–35%

Warning fuera de rango; HARD solo si rompe causalidad, deja monotonía prolongada o inserta card/composite entre ataque e impacto.

White composite: exactamente dos viñetas simples, sin texto, máximo tres por Parte, no acción compleja.

## 8. Color y luz

- tres a cinco regímenes
- cada uno: base, secundario, acento, superficie de rebote
- fuente y dirección de luz
- efectos según canon
- anclas con acento/reflejo
- calma no usa clímax permanente
- Parte no dominada únicamente por gris
- inserts/bases no heredan `painted background + rim light` por plantilla

## 9. Assets

### Base HARD

Debe decir: una figura, full body, front/orthographic, eye-level, neutral expression, empty hands, feet visible, gray background, studio illumination, clean/dry.

No dice: escena, clima, hora narrativa, acción, sangre, poder, perspectiva dramática o rim light.

### Derivada

Conserva identidad/cámara/fondo y cambia solo outfit/estado.

### View

Arquitectura/cámara/luz/props fijos. Sin personas o elementos móviles. Compatible con panel; si no, retirar plate o crear view.

## 10. Referencias

- IDs/poses/views existen
- máximo tres totales
- categories correctas
- scene ref apunta atrás
- mismo instante y `keep/change`
- no tres encadenadas
- objeto recurrente conserva forma/estado
- state visual coincide con ropa, daño y prop

## 11. Prompts

Cada panel:

- inglés y único
- sujeto+acción primero
- plano y ángulo explícitos
- posiciones/eje
- lugar/hora
- luz/paleta
- tratamiento/style apropiado
- instante único
- texto controlado

Rangos orientativos antes del style anchor: detalle 45–70, estándar 60–90, ancla 80–120. Uniformidad extrema produce warning de plantilla.

## 12. Contrato

Aplica `03_CONTRATO_JSON_MANHWA_V5.md` sin reinterpretar:

- campos raíz permitidos
- project/pipeline completos
- IDs únicos/ordenados
- assets existing/generate y rutas
- panels/cards
- render static, cero animation_prompt
- referencias
- editing/audio
- TTS single/dialogue
- `cold` solo sistema
- dialogue espejo
- full_script exacto
- sin tts_blocks

## 13. Renders

Por archivo:

1. sujeto correcto
2. identidad
3. cámara
4. escala
5. estado
6. manos/anatomía
7. texto inventado
8. luz/color

Por secuencia:

1. mapa espacial entendible
2. eje estable
3. entradas sembradas
4. objeto recurrente consistente
5. densidad visual variable
6. clímax superior a preparación

## 14. AUTO_REPAIR

Corrige todo REPAIR, vuelve a ejecutar gates y entrega JSON completo. No entrega parches parciales. Si una corrección exige cambiar monólogo/canon, marca BLOCKED con el cambio mínimo.

