# LLM Council — Rediseño Manhwa V5.3

## Pregunta

¿Cómo rediseñar Showrunner, Director Visual y Auditor como tres Custom GPT separados para que, partiendo de un Story Packet y sin integrar Render QA en Remotion, generen desde cero un JSON de manhwa vertical con verdadera gramática de página, escala, emoción, acción legible y continuidad; evitando el falso PASS de V5.2 y respetando 8.000 caracteres máximos en Instructions?

## Consejeros

### Contrarian

El fallo fatal es confiar en el cumplimiento autodeclarado. GPT 1 debe poseer solo verdad narrativa; GPT 2, traducción visual; GPT 3, validación y reparación acotadas. El Auditor debe recomputar todo desde escenas y prompts y devolver `REGENERATE_DIRECTOR` si reparar exige reinterpretar canon. Las categorías deben tener exclusiones: un fondo blanco no es página blanca, un wide no es escala, un close no es fragmento y un composite cuenta una vez. Recomendó mínimos independientes de páginas, cards, isolates, fragmentos, reacciones, lejanos y approaches. Advirtió que el preflight puede garantizar arquitectura de prompt, no obediencia perfecta del generador.

### First Principles

Propuso tratar V5.3 como compilador. El Showrunner emite beats, estados, emociones y hechos; no cámaras. El Director traduce cada beat a shots usando una gramática tipada. El Auditor recomputa cobertura, continuidad, duración y especificidad. Recomendó gates por cadencia: páginas de baja densidad distribuidas, escala recurrente, reacción por giro y cadena geografía→dirección→consecuencia para acción. Definiciones geométricas: blanco/negro dominantes y long shot medido, no nominal. Instructions guardan orquestación; Knowledge contiene esquemas, ejemplos y contraejemplos.

### Expansionist

Sugirió `coverage_manifest`, `continuity_manifest` y `geography_manifest`. Recomendó mínimos independientes escalados por número de shots: blancos, negros, lejanos, reacciones, fragmentos variados, approach, acción vertical y geografía. El Auditor debe mostrar prueba antes/después. Las definiciones combinan geometría y semántica: reacción implica cambio visible; fragmento recorta intencionalmente; geografía mantiene atacante, blanco, dirección y consecuencia.

### Outsider

Pidió que cada beat declare qué debe entender un espectador nuevo. El Director debe mapear shots a beats y el Auditor detectar labels no sustentados, framing genérico repetido, contradicciones de estado, reacciones sin detonante y escala falsa. Recomendó una matriz de evidencia por scene ID. La continuidad narrativa debe proteger también lo que la imagen no puede insinuar: estado futuro, ocupante incorrecto o dueño equivocado de efectos.

### Executor

Recomendó un handoff versionado y schema-first. Showrunner: monólogo, canon, estados y timing. Director: JSON vacío, layouts, prompts, cámara y referencias. Auditor: recalcular, reparar y volver a ejecutar gates. Las cuotas deben distribuirse en inicio, medio y final; los composites declaran límites y orden de lectura. Primera acción concreta: un único validador canónico antes de reescribir Instructions.

## Mapeo anónimo

- A: First Principles
- B: Contrarian
- C: Expansionist
- D: Outsider
- E: Executor

## Peer review 1

Eligió A por combinar propiedad clara, auditoría determinista, definiciones geométricas y cadencia. Señaló el riesgo de optimizar para el validador en vez del impacto. Añadió que el resultado generado puede desviarse del prompt, asunto fuera del alcance fijado para este rediseño.

## Peer review 2

Eligió A por la arquitectura completa y la acción causal. Criticó imponer una sola categoría global por shot porque layout, escala, emoción y fase son propiedades ortogonales. Recomendó ejes independientes.

## Peer review 3

Eligió A. Detectó que faltaba resolver conflictos cuando las cuotas superan tiempo disponible. Propuso prioridad determinista: comprensión, canon/continuidad, timing y después estilo; mínimos escalados por duración.

## Síntesis del presidente

### Acuerdo

- Los tres GPT deben tener autoridad no solapada.
- El Auditor no puede creer métricas del Director.
- “Respiro” agregado debe desaparecer como gate único.
- Las definiciones deben ser observables y contener exclusiones.
- Acción y continuidad se validan como secuencia, no panel aislado.
- Instructions breves; detalle y ejemplos en Knowledge.

### Choques

La exclusividad total de categorías simplifica el conteo pero destruye propiedades simultáneas válidas. La solución adoptada usa cuatro ejes independientes con un valor por eje. Una escena puede ser `WHITE_FRAGMENT + EXTREME_CLOSE + REACTION`, pero no dos layouts o dos escalas principales a la vez. La unión de puntuaciones cuenta IDs únicos, mientras cada eje conserva su mínimo.

### Puntos ciegos detectados

- Conflictos entre cuotas y tiempo.
- Labels autodeclarados sin evidencia.
- Cards contabilizadas como blancos.
- Bases técnicas confundidas con actuación.
- Estados futuros adelantados o efectos transferidos al actor equivocado.
- Narrativa clara pero geografía visual incompleta.

## Recomendación

Adoptar V5.3 como pipeline de contratos: Story Packet con beats/estados; Director desde JSON vacío con cuatro ejes y cuotas distribuidas; Auditor independiente con un único validador Python que recalcula cada gate. Para 38–45 panels: 5–7 blancos, 2–3 black cards, 4–5 fragmentos, 6–8 reacciones, 5–6 TRUE_LONG, una rampa+otro approach, 2–3 TALL_ACTION y 32–40% de puntuaciones únicas.

## Lo primero

Reemplazar el validador de V5.2 por `validate_v5_3.py` y usarlo como único archivo tanto en Director como Auditor. Completado en este paquete.
