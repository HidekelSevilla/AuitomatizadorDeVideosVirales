# QA narrativo automático Manhwa V5.2

El Showrunner ejecuta todas las pruebas y reescribe internamente cualquier fallo.

## Gate A — Premisa

Puntúa 0–2; mínimo 13/16:

- contradicción clara
- deseo humano
- herida emocional
- ventaja visualizable
- precio fértil
- transformación prometida
- arena serial
- loop variable

Fallo si la venta necesita más de veinte palabras o tres párrafos de lore.

## Gate B — Comercialidad

Exige: presión/carencia, amenaza reconocible, decisión emocional, agencia, manifestación/progreso, mini-victoria, reacción externa y costo/cliffhanger causado. Mínimo 7/8; reacción o payoff ausentes no se compensan con misterio.

## Gate C — Hook

Puntúa 0–2: claridad, contradicción, consecuencia, promesa serial e imagen propia. Mínimo 8/10. Primera línea preferente 5–12 palabras; pregunta dominante antes de tres segundos; imagen concreta antes de diez; Parte 1 promete antes del nombre.

## Gate D — Oyente frío

Sin biblia responde en una frase: quién actúa, qué quiere, qué amenaza, qué regla entiende, qué decide, qué gana, qué paga y qué cambia. Si una respuesta exige inventar un hecho o admite dos interpretaciones incompatibles, FAIL.

## Gate E — Oralidad y prosodia

- palabras dentro del objetivo
- máximo dos términos nuevos con densidad baja
- nombres reducidos y presentados por función
- cero párrafos de manual
- explicación menor que acción/emoción
- vocabulario pronunciable y directo
- 5–8 tags para 320–380 palabras, solo en inglés y por cambio real
- `[cold]` prohibido en humanos

## Gate F — Causalidad y retención

- pregunta dominante ≤3 s; promesa completa ≤6 s; título terminado ≤8 s
- amenaza concreta ≤25 s; primera agencia ≤45 s
- manifestación parcial ≤60%; payoff principal ≤75% y nunca >80%
- contexto nunca supera ocho segundos sin deseo, peligro, giro o reacción
- cada bloque cambia riesgo, objetivo, información, relación o poder
- el pico contiene la mayor presión
- consecuencia breve pero visible
- cliffhanger sembrado y causado
- ninguna coincidencia importante sin causa explícita
- máximo un peligro dominante y una complicación derivada por momento

El Showrunner anota el segundo estimado y porcentaje de cada hito. Un hook flash-forward no compensa un valle posterior. Con voz no calibrada, `target_runtime_seconds` predeterminado es 80–105 s y `target_words` aproximado 320–380; la duración explícita del usuario manda.

## Gate G — Claridad de producción

Para cada evento crítico debe existir una respuesta inequívoca:

1. ¿Quién inicia la acción?
2. ¿A quién o qué afecta?
3. ¿Dónde está cada participante?
4. ¿Quién está dentro y fuera de contenedores/vehículos?
5. ¿Qué cambia físicamente al terminar?

Fallo si un personaje aparece sin presentación, dos hombres similares no tienen firmas visuales separables, una amenaza actúa antes de verse o una frase mete tres tiempos incompatibles en un único momento.

## Gate H — Interpretación y estados

El `mapa_emocional` contiene 5–8 cambios. Cada uno especifica personaje, emoción observable y gesto corporal/facial. Debe haber reacción después de detonante, peligro, manifestación y costo.

La `cadena_estados_amenaza` muestra al menos tres estados físicamente distintos. Fallo si la criatura permanece posando, si todos responden neutrales durante peligro o si la emoción solo existe en adjetivos.

## Gate I — Caption móvil

- cada oración puede dividirse en unidades orales de 2–5 palabras
- pausa y puntuación impiden unir el final de una oración con el principio de otra
- cero fragmentos ambiguos al perder signos, por ejemplo `murió con él antes`
- título y términos propios siguen legibles en pantalla pequeña

## Reporte

```text
premise_score: N/16
commercial_payoff: N/8
hook_score: N/10
cold_listener: PASS|FAIL
production_clarity: PASS|FAIL
performance_map: PASS|FAIL
causal_coincidences: N
word_count: N
character_count: N
audio_tags: N [lista]
technical_terms_new: [lista]
target_runtime_seconds: N
timing_budget: {question_s, promise_s, title_end_s, threat_s, agency_s, manifestation_pct, payoff_pct, cliffhanger_s}
retention_timing: PASS|FAIL
caption_phrasing: PASS|FAIL
status: PASS|BLOCKED
```

No uses “se siente bien” ni otorgues máximos sin demostrar cada gate.
