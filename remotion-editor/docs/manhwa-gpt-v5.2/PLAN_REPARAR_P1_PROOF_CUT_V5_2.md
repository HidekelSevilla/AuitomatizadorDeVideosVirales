# Plan V5.2 — reparar P1 antes de producir P2

## Decisión

No publicar el corte actual, no descartar la historia y no iniciar P2 todavía. Crear una P1 proof cut de 90–100 s conservando canon, hook, rescate, transferencia y círculo de rifles.

La reparación es estructural: requiere monólogo más corto, nueva voz/alineación y algunas retomas. No basta sustituir nueve JPG si el ataque continúa al segundo 102.

## Timing objetivo

| Bloque | Tiempo |
|---|---:|
| Hook: villano → herencia → ejecución | 0–6 s |
| Título | 6–8 s |
| Oficio + necesidad humana | 8–20 s |
| Perro/regla/niño | 20–30 s |
| Decisión y rescate | 30–43 s |
| Pulso, convoy y cápsula | 43–58 s |
| Orquestador y transferencia | 58–72 s |
| Manifestación, ataque y derrota | 72–87 s |
| Reacción, firma y ejecución | 87–100 s |

Con la voz actual a `edit_speed: 1.40`, apunta aproximadamente a 320–350 palabras. La duración es un objetivo flexible: una versión clara de 96–100 s es preferible a mutilar emoción para llegar a 90. Los gates duros son título ≤8 s, amenaza ≤25 s, agencia ≤45 s y comienzo del payoff ≤75%.

## Qué conservar

- Canon, premisa, hermana/renta, oficio de Barrendero y verdad del Orquestador.
- Imágenes fuertes: hook/contacto, círculo de rifles, limpieza activa, rescate legible, convoy levantado, revelación de Kang, transferencia, `scene_15`, `16`, `24`, `26`, `30`, `32`, `33` cuando encajen con la nueva ventana.
- Bases e identidades correctas como `existing`.

## Qué rehacer

- Audio completo, timestamps, captions y segmentación por el monólogo reducido.
- `scene_10`, `11a`, `13a`, `17a`, `17b`, `20`, `21`, `25`, `27` o sus equivalentes en el nuevo montaje.
- Cuatro o cinco `TRUE_LONG_SHOT`: mundo, rescate/geografía, columna, manifestación/ataque y consecuencia.
- Performance poses que separen atrapada/carga/impacto/colapso y reconocimiento/rotura/contacto/muerte.
- Al menos 20% de respiros con función, sin hojas de assets en medio del clímax.

## Prompt para el Showrunner

```text
REPARAR PARTE 1 EN V5.2 — REESCRITURA AUTORIZADA DEL MONÓLOGO

Usa el Story Packet anterior como canon. Conserva premisa, causalidad, decisión de salvar al niño, transferencia del Orquestador, primera victoria y orden de ejecución.

Reescribe únicamente la Parte 1 y MONOLOGO_LOCKED para un proof cut de 90–100 segundos, 320–350 palabras aproximadas. Pregunta ≤3 s, promesa ≤6 s, título terminado ≤8 s, amenaza ≤22–25 s, agencia ≤40–45 s, transferencia alrededor de 60–72 s y comienzo del ataque/pago antes del 75% del runtime.

Reduce terminología y explicación. Mantén 5–7 tags en inglés, captions divisibles sin cruzar oraciones, cinco anclas y scale_plan. Ejecuta todos los gates y entrega STORY_PACKET_V5 completo PASS. No escribas prompts ni JSON.
```

## Prompt para el Director

Adjunta Story Packet V5.2 nuevo y JSON anterior:

```text
PRODUCIR P1 PROOF CUT V5.2 REUTILIZANDO ASSETS

El nuevo MONOLOGO_LOCKED manda. Reutiliza como existing identidades, escenarios y renders que todavía representen exactamente la nueva voz; no fuerces una imagen vieja si cambia el significado.

Diseña 4–5 TRUE_LONG_SHOT medibles, dos dentro del clímax. Usa escalera geografía→anticipación→trayectoria→impacto→consecuencia→reacción. Contenedor transparente siempre conserva al ocupante. Performance pose máximo tres usos por beat. Prompts dentro de límites V5.2.

Ejecuta validate_v5.py. Solo entrega PROMPT_RELEASE con código 0; si no puede, repara antes de responder.
```

## Prompt para el Auditor

```text
AUTO_REPAIR_PREFLIGHT V5.2 — P1 PROOF CUT

Comprueba monólogo exacto, runtime objetivo 90–100 s, timing budget, captions, TRUE_LONG_SHOT, poses, estados de criatura, ocupación de cápsula, respiros y prompts. La duración puede variar dentro de 80–105 s si los hitos pasan; no aceptes payoff después del 75%. Ejecuta validate_v5.py. Repara hasta código 0 + PROMPT_RELEASE o devuelve BLOCKED_*; nunca selles por optimismo.
```

Después de generar, auditar renders y MP4. P2 comienza únicamente cuando la proof cut supera `RENDER_RELEASE` o una prueba fría demuestra que la reparación ya no es rentable.
