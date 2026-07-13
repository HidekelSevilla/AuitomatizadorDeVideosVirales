# QA narrativo automático Manhwa V5

El Showrunner ejecuta estas pruebas antes de emitir `PASS`. Los fallos se corrigen internamente.

## Gate A — Premisa

Cada criterio 0–2; mínimo 13/16:

- contradicción clara
- deseo humano
- herida emocional
- ventaja visualizable
- precio fértil
- transformación prometida
- arena serial
- loop variable

Fallo automático si la venta necesita más de veinte palabras para entenderse o depende de tres párrafos de lore.

## Gate B — Comercialidad de Parte

Debe existir:

- desigualdad, presión o carencia
- amenaza o prueba reconocible
- decisión emocional
- agencia antes del pico
- progreso, manifestación o mini-victoria
- reacción externa
- costo en otro eje
- cliffhanger causado por la victoria o decisión

Mínimo 7/8. La ausencia de reacción o payoff no se compensa con misterio.

## Gate C — Hook

Puntúa 0–2; mínimo 8/10:

- claridad en primera escucha
- contradicción
- peligro o consecuencia
- promesa del placer serial
- imagen propia de la serie

Primera línea preferente: 5–12 palabras. Pregunta dominante antes de tres segundos; imagen concreta antes de diez. Parte 1: promesa antes que nombre.

## Gate D — Oyente frío

Sin usar la biblia, responde en una frase cada una:

1. ¿Quién actúa y qué lugar ocupa?
2. ¿Qué quiere ahora?
3. ¿Qué lo amenaza?
4. ¿Qué regla inmediata entiende?
5. ¿Qué decisión toma?
6. ¿Qué gana?
7. ¿Qué paga?
8. ¿Qué cambia al final?

Si alguna respuesta exige inferir un hecho no dicho o produce dos interpretaciones incompatibles, reescribe.

## Gate E — Oralidad

- rango de palabras aprobado
- máximo dos términos nuevos con `technical_density: baja`
- nombres propios reducidos y presentados por función/relación
- cero párrafos de manual
- explicación menor que acción/emoción
- frases cortas usadas como golpes
- tags espaciados por cambio interpretativo
- sin `cold` en voz humana

Lee en voz alta mentalmente. Sustituye vocabulario que suena redactado por palabras pronunciables y directas.

## Gate F — Causalidad y retención

- detonante antes del 40%
- ningún bloque de contexto supera aproximadamente ocho segundos sin peligro, deseo, giro o reacción
- cada bloque cambia riesgo, objetivo, información, relación o posición de poder
- el pico es la mayor presión
- la consecuencia no ocupa un epílogo explicativo largo
- el cliffhanger fue sembrado y nace de lo ocurrido

## Reporte

```text
premise_score: N/16
commercial_gate: N/8
hook_score: N/10
cold_listener: PASS|FAIL
word_count: N
character_count: N
technical_terms_new: [lista]
status: PASS|BLOCKED
```

No uses “se siente bien” como validación. Reporta cifras y una lista breve de términos.

