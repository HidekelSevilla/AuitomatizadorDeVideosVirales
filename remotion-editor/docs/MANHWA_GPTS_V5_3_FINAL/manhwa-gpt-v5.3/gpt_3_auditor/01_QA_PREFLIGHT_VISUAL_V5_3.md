# QA canónico de preflight V5.3

## 1. Escalado cuantitativo

| Panels | Blancos | Black cards | BLACK_INSET | Fragmentos | Reacciones | TRUE_LONG | Aproximación | TALL_ACTION | Puntuaciones únicas |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30–37 | 4–5 | 2 | 1–2 | 3–4 | 5–7 | 4–5 | 1 rampa + 1 shot | 1–2 | 30–38% |
| 38–45 | 5–7 | 2–3 | 1–2 | 4–5 | 6–8 | 5–6 | 1 rampa + 1 shot | 2–3 | 32–40% |
| 46–55 | 6–8 | 3–4 | 1–2 | 5–6 | 7–10 | 6–7 | 1–2 rampas + 1 shot | 3–4 | 32–40% |

Los mínimos y máximos son independientes y 30–55 panels es HARD. Una escena puede pertenecer a ejes distintos, pero en la unión de puntuaciones cuenta una sola vez. El porcentaje usa todas las `scenes`, incluidas cards. Prioridad: claridad/canon → causalidad/continuidad → timing → cuotas visuales.

Distribución: blanco antes del detonante, durante presión/vínculo, antes de percepción/poder y después del pico; al menos una card no-título; TRUE_LONG de mundo, amenaza, clímax y consecuencia; nunca tres puntuaciones seguidas ni card/blanco entre trayectoria y contacto. En 30–37 panels, al menos un TRUE_LONG cae en el 40% final; en 38–55, al menos dos.

## 2. Blancos

- `WHITE_INSET`: una viñeta asimétrica, 40–68% ocupada y `white.canvas_pct` 32–60%.
- `WHITE_COMPOSITE_2`: exactamente dos viñetas simples, 35–60% blanco, sin texto/tercera viñeta/acción compleja.
- `WHITE_ISOLATE`: figura o busto expresivo, `white.canvas_pct` 55–90%, sin entorno ni utilería de asset sheet.
- `WHITE_FRAGMENT`: crop de ojos, boca/mandíbula, mano, contacto, herida o marca, `white.canvas_pct` 60–90%.
- `WHITE_ACTION_STRIP_2`: dos microinstantes del mismo eje y `white.canvas_pct` 35–60%, anticipación→trayectoria o consecuencia→reacción; nunca trayectoria→contacto ni sustitución de fases mayores. Si ambas están cargadas conserva cuota de página blanca/puntuación, pero no es descanso de baja densidad.

Composites/strips llevan `subpanels` A/B con momento, plano, elevación, viewpoint, roll, performance y fase propios; el prompt separa `Panel A:`/`Panel B:`. Otros layouts no llevan subpanels.

Para toda Parte de 30–55 panels exige tres familias y dos composiciones espaciales. “White” por cielo, luz, explosión o fondo de asset falla.

Cada `WHITE_*`/`BLACK_INSET` exige motion local desactivado y estático (zoom 1, pan 0) para no recortar márgenes.

## 3. Negro

`BLACK_TEXT_CARD` es `narrative_card` del editor: negro sólido, texto literal de 2–7 palabras, máximo tres líneas. Título + mínimo una card narrativa. `BLACK_INSET`: negro ≥50% con una viñeta/fragmento pequeño; noche común no cuenta. Para 38–45 panels exige uno o dos. No pedir lettering español al generador.

## 4. Fragmento y reacción

Fragmento excluye rostro completo, usa macro/extreme close y cambia decisión/emoción/información. Alterna ojos, mandíbula, agarre, pie/contacto, herida o marca; prop decorativo no cuenta.

Reacción válida combina ojos/cejas, boca/mandíbula y cuerpo/distancia. “Serious”, “neutral” o “looking” no basta. Después de detonante, amenaza, decisión, manifestación, mini-victoria y costo localiza una reacción posterior del personaje correcto.

`performances[]` cubre cada humano visible; sus tres cues aparecen literalmente en el prompt y `reaction_to` apunta a una escena previa. Un personaje no paga la reacción de otro.

Amenaza, decisión, manifestación, acción, payoff, costo, cliffhanger y anticipación→consecuencia fuerzan `high_tension:true`; ningún humano visible puede quedar `NONE`/neutral.

## 5. Escala y aproximación

TRUE_LONG contiene marcador long, cámara 12–30 m, sujeto 8–22%, entorno ≥70%, aire, capas, contactos y `scale_anchor` literal medible. BIRDS_EYE/TOP_DOWN amplios también lo exigen. High-oblique no equivale a cenital; picado a 4 m es master.

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

Cada fase exige evidencia literal, no su etiqueta: geografía con posiciones; anticipación con preparación sin contacto; trayectoria con movimiento/dirección sin resultado; contacto con punto y dirección; consecuencia con cambio de estado físico; reacción con performance y `reaction_to` previos.

El master aparece antes de closes; reancla después de cuatro closes/fragments o cambio de eje/lugar. `TRAJECTORY` y `CONTACT` son ventanas consecutivas distintas, sin card, blanco ni transición entre ellas. Sin voz/efectos se entiende actor, dirección, blanco y resultado.

## 7. Continuidad

Ledger por escena:

`location · time · light · positions/facing · outfit/wetness · injury/marks · power owner/state · creature · prop · container occupant · before→action→after`.

HARD: futuro no aparece temprano; estado persiste; nadie hereda marcas/ropa/poder; rescatado no está seguro antes; luz apagada sigue apagada; criatura caída cambia silueta/contactos; interior no cambia a exterior. Contenedor transparente visible exige clave `.occupants`, ocupante visible/referenciado como única persona dentro y cada otro humano `completely outside`; nadie parece segundo ocupante.

`visual_plan` y `continuity` son obligatorios dentro de cada panel. Recalcula sus enums y porcentajes desde el prompt; luego coteja `state_before → atomic_action/state_change_reason → state_after`, MACHINE_LOCK y la primera declaración posterior de cada clave. Un metadato correcto con prompt contrario falla.

## 8. Identidad, anatomía y referencias

Cada figura referenciada se redescribe por edad, cabello/rostro, outfit, estado, lado/profundidad, verbo y emoción. Máximo tres refs; la del ocupante/objeto decisivo tiene prioridad. Dos similares se contrastan explícitamente.

Cada asset define `prompt_signature` inglesa estable de 6–12 palabras; todo ID visible la repite literalmente en el prompt, incluso heredado mediante scene ref. Nombre/`display_name` sin firma es FAIL.

Con 4+ identidades exige: ancla previa de dos figuras y luego master del mismo `moment_id` con esa `references.scenes` + protagonista + criatura, sin plate; o geografía dividida. Una identidad visible sin ref es FAIL.

Toda scene ref exige la fórmula literal `Same exact moment and same character positions as the scene reference, now seen from ...`, cámara distinta y firmas/estados/límites interior-exterior repetidos.

En full/medium especifica manos visibles, pies/rodillas sobre superficie, cabeza/mirada y contacto. En close no exijas cuerpo fuera del crop. Caída: cuerpo `lying ON TOP of` con puntos de contacto. Falla dos impactos, tres tiempos o actor simultáneamente dentro/fuera.

## 9. Assets

Base contiene el equivalente literal de:

`exactly one character, full body from hair to soles, orthographic front eye-level view, neutral relaxed expression, both open empty hands visible, both feet visible, clean and dry, even studio illumination, seamless neutral medium-gray background`.

Falla escena, hora, lluvia/agua, sudor, suciedad/polvo, sangre/herida, poder/aura, arma/prop, gesto emocional, acción, ángulo dramático o fondo pintado. Derivada humana exige misma cara/cabello/outfit. Peligro/acción usa pose compatible. Criatura usa atrapada→carga→ataque→impacto→colapso según fase; declararlas sin referenciarlas falla.

Todo ingrediente human/creature/prop/container generado, incluso derivado, está aislado en gris sin entorno, clima, extras, texto ni luz de escena. Creature base: completa, reposo, limpia/seca. Prop base: objeto completo `unheld`; container base: completo `empty`; ambos frontales y sin manos/ocupante/efecto. UI oscura sin texto. View: `Empty environment plate, no people, no creatures, no vehicles, no readable text`.

### ASSET_STYLE — gate HARD independiente

Todo elemento con estado `generate` incluye dentro de **su propio prompt** un ancla explícita Korean manhwa/webtoon + 2D compatible con el tipo. `neutral gray background`, `even studio illumination`, “digital art”, “anime” o el estilo de una referencia no sustituyen el ancla.

- Human/creature/pose: equivalente a `Hand-drawn Korean manhwa webtoon asset illustration, 2D flat cel shading, crisp inked lineart, clean high-contrast shapes`.
- Prop/container: el mismo lenguaje como object asset 2D; objeto aislado, completo y legible.
- UI: equivalente a `Korean manhwa webtoon interface asset design, 2D flat cel shading, crisp inked lineart, high contrast`; sin texto inventado.
- View: equivalente a `Hand-drawn Korean manhwa webtoon background illustration, 2D painted environmental detail, crisp inked lineart, cinematic high contrast`, además de plate vacío. Debe tener arquitectura, profundidad y detalle pintado; “gray background” no es una view.

Bases y derivadas de assets excluyen dramatic rim lighting, clima, hora, escenario narrativo, extras y efectos de escena; la luz uniforme y el gris siguen siendo requisitos técnicos. Las views sí conservan iluminación ambiental canónica, pero permanecen sin personas, criaturas, vehículos ni texto legible.

El Auditor entrega tabla `ASSET_STYLE: id | pose/view | type | evidencia del ancla | aislamiento/vacío | PASS/FAIL` para **cada** `generate`. Un solo FAIL bloquea release; debe reparar todos los prompts afectados y repetir la tabla antes de `PROMPT_RELEASE`.

## 10. Prompts, timing y reporte

Orden: sujeto+verbo; firma; emoción; layout; plano+ángulo; posiciones/eje/contactos; escala; lugar+hora; fuente/dirección; paleta/efecto; estilo. Sin pronombres ambiguos, texto inventado, doble ángulo ni neutralidad que contradiga acción.

Prompts: fragment 45–75; white 55–85; composite 75–110; estándar 60–95; complejo 80–115, hasta 120 con 3+ identidades; límites HARD. Imágenes ≤5.2 s; caption máximo 4. Runtime según MACHINE_LOCK; cola 0.45 s.

Beats obligatorios: `HOOK`, `DETONATOR`, `THREAT`, `DECISION`, `MANIFESTATION`, `PAYOFF`, `COST`, `CLIFFHANGER`. La card de título termina ≤8 s y queda en el primer 20% por índice (`index ≤ max(2,floor(total_scenes×0.20))`). `THREAT` inicia ≤25 s; `DECISION` ≤45 s; `MANIFESTATION` ≤60%; `PAYOFF` ≤75%. `payoff_scene_id` apunta al panel PAYOFF y `payoff_start_pct = segundos previos / runtime`, tolerancia ±0.01.

Reporte listas y `scene_id` para cada gate. “Cumple” sin evidencia es inválido.

## 11. Gate factual independiente y reparación sin regresiones

El validador mecánico no sustituye este gate. Congela e ignora primero prompt, `atomic_action`, `visual_plan`, `visible_entities` y refs. La fuente es `MACHINE_LOCK_V5_3.voice_visual_lock`, lista de átomos:

```text
{
  atom_id, text_exact, kind,
  claims:[{
    actor_id, action, receiver_or_target_id, source_id,
    direction, result, causal_participants[], required_visual_tokens[],
    resolved_from_atom_id|null
  }],
  must_show[],
  offscreen_policy:{mode, allowed_ids[], reason}
}
```

Mapea por coincidencia exacta cada span de `voiceover.text` a sus átomos, excluyendo solo tags autorizados conforme al contrato. `continuity.voice_facts` concatena en orden todos los `claims[]` cubiertos y cada claim repite su `atom_id`; `continuity.must_show` es la unión sin duplicados. `continuity.offscreen_policy` no puede ampliar ninguna política atómica.

Después entrega una fila independiente:

`scene_id | atom_id/text_exact | claims del lock | voice_facts panel | required_visual_tokens | must_show unión | offscreen_policy | atomic_action declarado | visible_entities | performances | refs | evidencia literal del prompt | PASS/FAIL`.

La verdad nace de la voz, no del metadato. La fila falla si una cadena `atomic_action → visibles → refs → prompt` es coherente consigo misma pero contradice, omite o sustituye cualquiera de los hechos narrados. Repara metadatos, participantes, refs, poses y prompt; jamás adapta la interpretación de la voz para justificar la imagen existente.

### Tokens físicos no registrados

`required_visual_tokens[]` conserva en cada claim los sustantivos/estados físicos que deben verse aunque no tengan ID registrable: `column`, `floor`, `crack`, `cash`, pared, lluvia, sangre, abertura u otro elemento literal. Audita presencia literal inglesa, sin depender de `atomic_action`, escenario, refs o conocimiento implícito.

El token aparece en la cláusula que demuestra su función: target de impacto/contacto, superficie, objeto sostenido, grieta activa, dinero visible, etc. Mencionarlo como decoración lejana no paga el hecho. Si el lock exige `column`, “capsule opens beside the man” falla; debe mostrar algo equivalente a “the hatch strikes the broken concrete column and opens against it”. Tokens no registrados no consumen una ref, pero sí evidencia inequívoca del prompt.

### Resolución de pronombres, elipsis y causalidad

- Resuelve “él”, “ella”, “lo”, “me”, “antes”, sujeto tácito y posesivos únicamente mediante `resolved_from_atom_id` del lock. Verifica que ese átomo exista y sea antecedente compatible. Si falta o hay dos antecedentes posibles, FAIL; no uses `environment`, `energy`, ropa o una mano como actor sustituto.
- `actor_id` ejecuta la acción; `receiver_or_target_id` la recibe; `source_id` origina objeto, energía o efecto; `direction` expresa `source → receptor/target`; `result` es el cambio visible. `causal_participants[]` incluye actor, receptor/target, fuente separada y testigo requerido por frases como “frente a mí”.
- `must_show[]` contiene todos los participantes sin los cuales el hecho cambia de significado. Cada uno aparece como entidad completa y correctamente ubicada, salvo que la voz/layout pida explícitamente un fragmento.
- `continuity.offscreen_policy` solo puede omitir una entidad no causal especificada por el lock, con razón verificable. Nunca convierte un participante causal en ambiente, efecto sin fuente o consecuencia fuera de cámara.

Ejemplos normativos: “A murió frente a B” exige A muerto/muriendo y B como testigo; rifles sobre B no muestran la muerte. “Pero antes me eligió” hereda A como actor, B como receptor y exige el acto de elección/transferencia con dirección A→B; un aura que surge de pared o pantalla falla.

### Hook factual — literalidad HARD

En las ventanas del hook, la promesa visual es el acontecimiento narrado, no una ilustración temática. Muerte, elección, transferencia, ataque, rescate, captura o revelación requieren actor, target/receptor, fuente, dirección y resultado visibles según `MACHINE_LOCK_V5_3.voice_visual_lock`.

Reacción, amenaza posterior, armas apuntando, aura sin fuente, símbolo, silueta genérica, aftermath, flash de consecuencia o pose del protagonista **no sustituyen** el evento. En hook factual `continuity.offscreen_policy` nunca permite ocultar actor, source o receiver/target causal, aunque otro metadato autodeclarado lo autorice. Si el hecho se reparte en dos ventanas contiguas, cada una conserva los participantes necesarios y juntas muestran causa→transferencia/contacto→resultado sin ambigüedad.

### Identidad y target

- El actor y el target son entidades completas correctas. Una manga, mano, silueta parcial, prenda, sangre o parte corporal no sustituye a una persona/criatura/objeto completo, salvo que voz y layout pidan explícitamente ese fragmento.
- `visible_entities` coincide con todas y solo las identidades descritas visualmente. El actor/target decisivo tiene ref propia o una herencia por scene ref válida; nunca se cambia por otra identidad para cumplir el máximo de tres.
- En composites, cada subpanel declara quién hace qué a quién. El mismo target conserva identidad, estado y posición causal entre A/B.

### Pluralidad, props, views y gramática

- Todo plural significativo fija cantidad mínima visible, disposición y acción individual. Si la voz exige varios actores/armas, un único ejemplar no pasa. Cada prop decisivo se ve, tiene dueño, contacto y estado correctos: sostenido, extendido, abierto, roto, vacío, etc.
- Toda view declarada en JSON/manifest se referencia al menos una vez o se elimina. Masters y reanclajes usan una view compatible con cámara/eje/lugar; describir un fondo genérico no cuenta como usarla.
- El prompt inglés usa cláusulas completas sujeto–verbo–objeto, concordancia y referentes inequívocos. Frases truncadas, verbo aplicado al sustantivo equivocado o pronombres ambiguos fallan aunque longitud y keywords pasen.

### Reparación acotada

Antes de editar registra alcance y snapshot por escena/campo. Después entrega diff `antes -> después` con causa y lista separada de dependencias: nueva pose/view, `voice_facts`, `must_show`, `offscreen_policy`, performance, ref, prompt, manifest o scene-ref. Todo campo fuera del alcance permanece byte-idéntico salvo dependencia enumerada.

Reaudita obligatoriamente escenas modificadas, átomos referidos por `resolved_from_atom_id`, escenas vecinas, scene refs, mismo `moment_id`, assets/manifest afectados y continuidad posterior. Repite la matriz factual **completa**, no solo las filas editadas, para detectar sustituciones y regresiones.

`exit code 0` es necesario pero no suficiente. `PROMPT_RELEASE` requiere: validador 0, todas las filas semánticas PASS, views usadas, diff sin cambios injustificados y cero regresiones. Una afirmación sin matriz/evidencia no habilita release.
