# QA canónico de preflight V5.3

## 1. Escalado cuantitativo

| Panels | Blancos | Black cards | BLACK_INSET | Fragmentos | Reacciones | TRUE_LONG | Aproximación | TALL_ACTION | Puntuaciones únicas |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30–37 | 4–5 | 2 | 1–2 | 3–4 | 5–7 | 4–5 | 1 rampa + 1 shot | 1–2 | 30–38% |
| 38–45 | 5–7 | 2–3 | 1–2 | 4–5 | 6–8 | 5–6 | 1 rampa + 1 shot | 2–3 | 32–40% |
| 46–55 | 6–8 | 3–4 | 1–2 | 5–6 | 7–10 | 6–7 | 1–2 rampas + 1 shot | 3–4 | 32–40% |

Los mínimos y máximos son independientes y 30–55 panels es HARD. Una escena puede pertenecer a ejes distintos, pero en la unión de puntuaciones cuenta una sola vez. El porcentaje usa todas las `scenes`, incluidas cards. Prioridad: claridad/canon → causalidad/continuidad → timing → cuotas visuales.

Distribución: blanco antes del detonante, durante presión/vínculo, antes de percepción/poder y después del pico; al menos una card no-título; TRUE_LONG de mundo, amenaza, clímax y consecuencia; nunca tres puntuaciones seguidas ni card/blanco entre trayectoria y contacto.

## 2. Blancos

- `WHITE_INSET`: una viñeta asimétrica, 40–68% ocupada, blanco limpio alrededor.
- `WHITE_COMPOSITE_2`: exactamente dos viñetas simples, 35–60% blanco, sin texto/tercera viñeta/acción compleja.
- `WHITE_ISOLATE`: figura o busto expresivo, ≥55% blanco, sin entorno ni utilería de asset sheet.
- `WHITE_FRAGMENT`: crop de ojos, boca/mandíbula, mano, contacto, herida o marca, ≥60% blanco.
- `WHITE_ACTION_STRIP_2`: dos microinstantes del mismo eje, anticipación→trayectoria o consecuencia→reacción; nunca trayectoria→contacto ni sustitución de fases mayores. No cuenta como respiro si ambas están cargadas.

Composites/strips llevan `subpanels` A/B con momento, plano, elevación, viewpoint, roll, performance y fase propios; el prompt separa `Panel A:`/`Panel B:`. Otros layouts no llevan subpanels.

Para 38+ panels exige tres familias y dos composiciones espaciales. “White” por cielo, luz, explosión o fondo de asset falla.

Cada `WHITE_*`/`BLACK_INSET` exige motion local desactivado y estático (zoom 1, pan 0) para no recortar márgenes.

## 3. Negro

`BLACK_TEXT_CARD` es `narrative_card` del editor: negro sólido, texto literal de 2–7 palabras, máximo tres líneas. Título + mínimo una card narrativa. `BLACK_INSET`: negro ≥50% con una viñeta/fragmento pequeño; noche común no cuenta. Para 38–45 panels exige uno o dos. No pedir lettering español al generador.

## 4. Fragmento y reacción

Fragmento excluye rostro completo, usa macro/extreme close y cambia decisión/emoción/información. Alterna ojos, mandíbula, agarre, pie/contacto, herida o marca; prop decorativo no cuenta.

Reacción válida combina ojos/cejas, boca/mandíbula y cuerpo/distancia. “Serious”, “neutral” o “looking” no basta. Después de detonante, amenaza, decisión, manifestación, mini-victoria y costo localiza una reacción posterior del personaje correcto.

`performances[]` cubre cada humano visible; sus tres cues aparecen literalmente en el prompt y `reaction_to` apunta a una escena previa. Un personaje no paga la reacción de otro.

## 5. Escala y aproximación

TRUE_LONG contiene marcador long, cámara 12–30 m, sujeto completo 8–22%, entorno ≥70%, aire, tres capas, contactos y proporción relativa. High-oblique no equivale a cenital. Picado a 4 m es master.

Audita por separado `camera_elevation`, `viewpoint` y `camera_roll`; HIGH+PROFILE, OTS+LEVEL o LOW+DUTCH son combinaciones, no un solo “ángulo”.

Rampa: long/full 8–22% con destino → medium 35–55% con acción → close/fragment 65–90% con cambio emocional. Cada paso añade dato y cambia postura; no card entre pasos críticos. Otro approach shot usa beat distinto.

## 6. Acción vertical y geografía

TALL_ACTION: un instante, vector ≥60% de altura, origen/destino en tercios distintos, cuerpos ubicables, fondo de escala y dirección. No pasa retrato con aura, humo o copias.

Por secuencia:

1. `GEOGRAPHY`: actores, amenaza, protegidos, obstáculos, salida.
2. `ANTICIPATION`: intención y dirección.
3. `TRAJECTORY`: desplazamiento previo al contacto.
4. `CONTACT`: punto único.
5. `CONSEQUENCE`: cambio físico.
6. `REACTION`: significado humano/social.

El master aparece antes de closes; reancla después de cuatro closes/fragments o cambio de eje/lugar. `TRAJECTORY` y `CONTACT` son ventanas consecutivas distintas, sin card, blanco ni transición entre ellas. Sin voz/efectos se entiende actor, dirección, blanco y resultado.

## 7. Continuidad

Ledger por escena:

`location · time · light · positions/facing · outfit/wetness · injury/marks · power owner/state · creature · prop · container occupant · before→action→after`.

HARD: futuro no aparece temprano; estado persiste; nadie hereda marcas/ropa/poder; rescatado no está seguro antes; luz apagada sigue apagada; criatura caída cambia silueta/contactos; interior no cambia a exterior; contenedor mantiene ocupante; prompt distingue dentro/fuera; no hay asiento/reflejo/cuerpo que parezca segundo ocupante.

`visual_plan` y `continuity` son obligatorios dentro de cada panel. Recalcula sus enums y porcentajes desde el prompt; luego coteja `state_before → atomic_action/state_change_reason → state_after`, MACHINE_LOCK y la primera declaración posterior de cada clave. Un metadato correcto con prompt contrario falla.

## 8. Identidad, anatomía y referencias

Cada figura referenciada se redescribe por edad, cabello/rostro, outfit, estado, lado/profundidad, verbo y emoción. Máximo tres refs; la del ocupante/objeto decisivo tiene prioridad. Dos similares se contrastan explícitamente.

Cada asset define `prompt_signature` inglesa estable de 4–30 palabras; todo ID visible la repite literalmente en el prompt, incluso heredado mediante scene ref. Nombre/`display_name` sin firma es FAIL.

Con 4+ identidades exige: ancla previa de dos figuras y luego master del mismo `moment_id` con esa `references.scenes` + protagonista + criatura, sin plate; o geografía dividida. Una identidad visible sin ref es FAIL.

En full/medium especifica manos visibles, pies/rodillas sobre superficie, cabeza/mirada y contacto. En close no exijas cuerpo fuera del crop. Caída: cuerpo `lying ON TOP of` con puntos de contacto. Falla dos impactos, tres tiempos o actor simultáneamente dentro/fuera.

## 9. Assets

Base contiene el equivalente literal de:

`exactly one character, full body from hair to soles, orthographic front eye-level view, neutral relaxed expression, both open empty hands visible, both feet visible, clean and dry, even studio illumination, seamless neutral medium-gray background`.

Falla escena, hora, lluvia/agua, sudor, suciedad/polvo, sangre/herida, poder/aura, arma/prop, gesto emocional, acción, ángulo dramático o fondo pintado. Derivada humana exige misma cara/cabello/outfit. Peligro/acción usa pose compatible. Criatura: atrapada, carga, ataque, impacto y colapso separados.

## 10. Prompts, timing y reporte

Orden: sujeto+verbo; firma; emoción; layout; plano+ángulo; posiciones/eje/contactos; escala; lugar+hora; fuente/dirección; paleta/efecto; estilo. Sin pronombres ambiguos, texto inventado, doble ángulo ni neutralidad que contradiga acción.

Prompts: fragment/WHITE_FRAGMENT 45–75; white simple 55–85; composite/strip 75–110; estándar 60–95; complejo 80–115; ambos límites son HARD y >120 falla. Imágenes ≤5.2 s; caption máximo 4 palabras. El runtime cae dentro de `MACHINE_LOCK.runtime_range_seconds`; cola final 0.45 s.

Reporte listas y `scene_id` para cada gate. “Cumple” sin evidencia es inválido.
