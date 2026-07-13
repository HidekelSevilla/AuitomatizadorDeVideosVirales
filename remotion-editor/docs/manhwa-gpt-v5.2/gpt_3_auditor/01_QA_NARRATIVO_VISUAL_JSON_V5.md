# QA integrado Manhwa V5.2

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

### Retención temporal HARD

Con timestamps reales, o estimados si aún no existen, reporta:

- pregunta ≤3 s; promesa ≤6 s; título terminado ≤8 s
- amenaza concreta ≤25 s; primera agencia ≤45 s
- manifestación parcial ≤60%; payoff principal ≤75%
- payoff >80% bloquea; un flash-forward no lo compensa

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

## 3.1 Duración y carga por imagen

Cuenta palabras habladas y estima segundos con `palabras × 60 / (150 × edit_speed)`; reemplaza estimación por timestamps reales cuando existan.

| Tipo | Palabras | Máximo editado |
|---|---:|---:|
| acción/impacto | 2–9 | 3.0 s |
| reacción/detalle | 3–10 | 4.0 s |
| estándar | 5–14 | 4.5 s |
| master/ancla | hasta 18 | 5.0 s |
| composite 2 | 10–22 | 6.0 s |
| card | 2–8 | 3.0 s |

Panel normal >18 palabras es REPAIR. No consolides escenas si el resultado sostiene una sola imagen durante 6–10 segundos o exige tres tiempos.

## 3.2 Actuación

- 70% o más de rostros visibles en peligro/acción tienen respuesta no neutral.
- Máximo dos paneles humanos neutrales consecutivos.
- Emoción en prompt incluye al menos dos indicios: cejas/ojos/boca/mandíbula/hombros/manos/peso/distancia.
- Hay reacción tras detonante, peligro, manifestación y costo.
- Shock neutral deliberado debe declararse con cuerpo congelado; no cuenta como omisión.

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

Dos o más anclas tienen contraste monumental o `TRUE_LONG_SHOT`. Ninguna es prop aislado, arquitectura vacía o pose.

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

`TRUE_LONG_SHOT` no se valida por la palabra `wide`: sujeto completo 10–25% de altura, entorno ≥65%, aire alrededor, cámara 12–25 m y tres capas. En 40–50 ventanas exige 4–6, dos dentro del clímax, uno antes de amenaza y uno de consecuencia.

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
- total habitual de tratamientos visuales reales: 20–28%

Warning fuera de rango; HARD solo si rompe causalidad, deja monotonía prolongada o inserta card/composite entre ataque e impacto.

White composite: exactamente dos viñetas simples, sin texto, máximo tres por Parte, no acción compleja.

Reporta `breaths: N/total` y desglose por tipo. No conviertas porcentaje de texto “calmo” en porcentaje de respiros. Un full bleed cargado no cuenta. Para 38–44 escenas suelen esperarse 8–11 tratamientos; para 45–50, 10–12. Un blanco con apariencia de hoja de assets no cuenta sin función narrativa.

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

### Performance pose

La base neutral no actúa. Peligro, esfuerzo, dolor, shock o desafío usan pose derivada con emoción/cuerpo concretos. Si una pose usada en acción contiene `neutral expression`, `neutral mouth` o `posture remains neutral`, REPAIR.

Criatura activa debe tener estados separados de atrapada, carga/ataque, impacto y caída. Misma pose neutral usada en tres paneles de acción: REPAIR.

Una performance pose usada para emociones/posturas incompatibles o más de tres escenas del mismo beat es REPAIR. El estado de criatura cambia contactos y silueta, no solo nombre.

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
- cada humano referenciado se describe por firma visible, acción y ubicación; el nombre solo no basta
- dos personas similares se separan por cabello, outfit, heridas y lado/profundidad
- cápsula/vehículo/habitación declara único ocupante interior, persona exterior y distancia
- contenedor transparente ocupado conserva la referencia del ocupante mientras el interior sea visible; nunca muestra asiento vacío
- ningún personaje con identidad aparece en prompt cargado sin referencia disponible

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
- emoción corporal observable
- mapa descriptivo de roles para referencias
- verbo que cambia postura (`lunges/recoils/collapses`, no `stands`)

Rangos totales: detalle 45–70, estándar 55–90, interacción/ancla compleja ≤110; >120 HARD. Detecta genitivos rotos (`boots's chest`), sustantivos duplicados, pronombres ambiguos y crop incompatible.

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
- cola final de composición 0.35–0.60 s después de la última palabra; última imagen sostenida
- no reescalar timestamps para fabricar esa cola ni terminar el MP4 en el último fonema
- `project.fps` coincide con el MP4 final
- el validador termina con código 0 y `preflight_status: PROMPT_RELEASE`; `CONTRACT_PASS` solo no basta

## 13. Renders

Por archivo:

1. significado de la voz
2. sujeto e identidad
3. dentro/fuera y posiciones
4. emoción observable
5. cámara/escala
6. pose/estado
7. manos/anatomía
8. texto/luz/color

Por secuencia:

1. mapa espacial entendible
2. eje estable
3. entradas sembradas
4. objeto recurrente consistente
5. densidad visual variable
6. clímax superior a preparación

Con MP4 revisa captions a tamaño móvil y a 1×: ninguna ventana une oraciones hasta formar una lectura falsa. Comprueba también inteligibilidad, silencios, impactos/SFX, dinámica musical, loudness, FPS y cola final.

Estados:

- sin renders: `PROMPT_RELEASE`, `renders: RENDER_PENDING`
- fallos observables: `RETAKES`
- todos los archivos y secuencia aprobados: `RENDER_RELEASE`

Prohibido emitir `RELEASE` final con `NOT_RUN`.

## 14. AUTO_REPAIR_PREFLIGHT

Corrige todo REPAIR, vuelve a ejecutar gates y entrega JSON completo. No entrega parches parciales. Si una corrección exige cambiar monólogo/canon, marca BLOCKED con el cambio mínimo.
