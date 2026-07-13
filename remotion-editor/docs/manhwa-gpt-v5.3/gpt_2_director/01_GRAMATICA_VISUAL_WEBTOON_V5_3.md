# Gramática visual Webtoon V5.3

## 1. Objetivo

No ilustres frases sueltas: construye una secuencia de webtoon narrado. Cada ventana debe ayudar a comprender espacio, anticipar, actuar, impactar, reaccionar, cobrar una consecuencia o respirar. Las cuotas evitan monotonía; nunca sustituyen claridad, canon o causalidad.

Prioridad cuando dos gates compiten:

1. significado para oyente frío;
2. canon, identidad y continuidad;
3. causalidad y geografía;
4. timing del monólogo;
5. gramática visual y variedad.

## 2. Cuotas escaladas

Cuenta `panels`; las `narrative_card` van aparte. Las bandas se determinan solo por el número final de panels.

| Panels | Blancos reales | Black cards | BLACK_INSET | Fragmentos | Reacciones | TRUE_LONG | Aproximación | TALL_ACTION | Puntuaciones únicas |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30–37 | 4–5 | 2 | 1–2 | 3–4 | 5–7 | 4–5 | 1 rampa + 1 shot | 1–2 | 30–38% |
| 38–45 | 5–7 | 2–3 | 1–2 | 4–5 | 6–8 | 5–6 | 1 rampa + 1 shot | 2–3 | 32–40% |
| 46–55 | 6–8 | 3–4 | 1–2 | 5–6 | 7–10 | 6–7 | 1–2 rampas + 1 shot | 3–4 | 32–40% |

Todos los rangos tienen mínimo y máximo HARD. El rango total 30–55 panels también es HARD.

Una puntuación única puede ser blanco, black card/inset, fragmento, reacción de baja densidad, transición ambiental simple o long silencioso de consecuencia. En la unión cuenta una vez, pero **cada familia mantiene su mínimo independiente**. El porcentaje usa como denominador todas las `scenes`, incluidas cards.

Distribución obligatoria:

- blanco antes del detonante;
- blanco de presión/vínculo;
- blanco de percepción/preparación;
- blanco posterior al pico para reacción/costo;
- una black card es título y otra es regla, decisión, giro o sentencia;
- TRUE_LONG de mundo, amenaza, geografía, dos de clímax y consecuencia cuando el rango lo permite;
- fragmentos distintos: ojos, boca/mandíbula y mano/herida/contacto;
- no tres puntuaciones seguidas ni todas agrupadas;
- no card o blanco entre trayectoria y contacto.

## 3. Qué cuenta

Un respiro baja densidad o cambia la forma de leer para que entre emoción, regla o consecuencia.

Sí: página blanca diseñada, card negra, black inset, fragmento causal, reacción con espacio negativo, long silencioso después del impacto, transición ambiental simple.

No: close cargado; master con muchos actores; fondo oscuro común; cielo/explosión blanca; dos viñetas saturadas; ficha de personaje; herramienta decorativa; la misma imagen recortada; device sin función; full bleed llamado “respiro”.

## 4. Tratamientos blancos

### WHITE_INSET

Página blanca pura con una viñeta narrativa asimétrica que ocupa 40–68% del lienzo. El blanco exterior permanece limpio. Variar posición: superior izquierda, inferior derecha, centrada alta o franja lateral. Nunca figura frontal neutral con props ordenados.

### WHITE_COMPOSITE_2

Exactamente dos viñetas con bordes negros y 35–60% de blanco limpio. Cada viñeta contiene un sujeto o instante simple. Usos: mirada→descubrimiento, reacción A→reacción B, antes→consecuencia, ojos→mano, separación emocional. Sin tercera viñeta, ficha frontal, duplicado ni acción compleja.

### WHITE_ISOLATE

Figura, busto o silueta expresiva aislada; ≥55% de blanco. La postura y expresión cargan el significado. Sin entorno pintado, clima, halo genérico o utilería de catálogo.

### WHITE_FRAGMENT

Ojos, boca/mandíbula, mano, contacto, herida o marca; ≥60% de blanco y crop anatómico claro. El fragmento cambia emoción, decisión o información. Máximo dos consecutivos.

### WHITE_ACTION_STRIP_2

Dos microinstantes secuenciales compatibles con una sola fase exterior: anticipación→trayectoria o consecuencia→reacción. Mismos actores, eje, dirección y luz. Nunca combina trayectoria→contacto ni sustituye ventanas de la cadena mayor. Máximo una por secuencia. Si ambas están saturadas, es action strip pero no respiro.

`WHITE_COMPOSITE_2` y `WHITE_ACTION_STRIP_2` escriben `subpanels` A/B. Cada uno declara momento, plano, elevación, viewpoint, roll, performance y fase. El prompt separa literalmente `Panel A:` y `Panel B:`. En otros layouts `subpanels` queda vacío.

Usa al menos tres familias blancas y dos layouts espaciales en una Parte de 38+ panels. No existe cap de tres blancos.

Todos los `WHITE_*` y `BLACK_INSET` desactivan movimiento por escena (`enabled:false`, `preset:static`, zoom 1, pan 0); un Ken Burns no puede cortar el blanco, bordes o inset.

## 5. Negro y texto

### BLACK_TEXT_CARD

Es `narrative_card` del editor: negro sólido, texto blanco literal del monólogo, 2–7 palabras y máximo tres líneas. El título cuenta como una; exige otra no-título. No encargues párrafos ni letras españolas a Grok/Aurora.

### BLACK_INSET

Página negra mate con una viñeta o fragmento pequeño iluminado; negro ≥50%. Sirve para amenaza, presencia, revelación o silencio. Para 38–45 panels exige uno o dos. Un escenario nocturno normal no cuenta.

## 6. Fragmentos y emoción

`FRAGMENT_INSERT` usa macro/extreme close-up, excluye el rostro completo y muestra un cambio causal. Alterna ojos, mandíbula, agarre, pie/contacto, herida, marca o prop decisivo. Un raspador, teléfono o reloj decorativo no cuenta.

Actuación observable combina:

- cejas y ojos con objetivo de mirada;
- boca o mandíbula;
- hombros, manos, cuello, peso o distancia.

Ejemplos: miedo = ojos abiertos + labios separados + torso atrás; esfuerzo = cejas tensas + dientes apretados + hombros altos; determinación = mirada fija + mandíbula cerrada + peso adelante; shock congelado = pupilas fijas + boca inmóvil + cuerpo rígido.

“Serious expression”, “neutral face” o “looking” no bastan. Tras detonante, amenaza, decisión, manifestación, mini-victoria y costo existe reacción visible. En peligro/acción, ≥75% de rostros visibles reaccionan. No repitas siempre ojos y boca abiertos: progresa atención→duda→alarma→esfuerzo→desesperación→shock→alivio incompleto→miedo social.

`visual_plan.performances[]` registra cada humano visible por `entity_id`, modo, ojos/cejas, boca/mandíbula, cuerpo y `reaction_to`. Los tres cues aparecen literalmente en el prompt; un actor no paga la reacción de otro.

## 7. TRUE_LONG y escala

Pasa solo con todo:

- `long/extreme-wide/deep-wide/distant-wide`;
- cámara a 12–30 m;
- sujeto completo 8–22% de altura;
- entorno ≥70%;
- aire alrededor;
- foreground, midground y background;
- contactos con el mismo suelo;
- proporción relativa explícita.

Un picado desde 3–5 m es `WIDE_MASTER`, no TRUE_LONG. Para amenaza monumental coloca humano y amenaza en tercios distintos con espacio central; el efecto nunca tapa siluetas. Evita objeto gigante en foreground que convierta personas en miniaturas accidentales.

Declara cámara con tres campos independientes: `camera_elevation` (altura/picado), `viewpoint` (frente/perfil/OTS/espalda) y `camera_roll` (LEVEL/DUTCH). Ninguno sustituye a otro.

Máximo dos escenas **seguidas** con sujeto humano >45%, máximo dos CLOSE/MACRO seguidos y máximo dos apariciones seguidas del mismo sujeto dominante. Al menos 35% de tomas humanas usan perfil, side, OTS, espalda o rear three-quarter. No repitas el mismo plano+ángulo consecutivo.

## 8. Aproximación cinematográfica

Una rampa completa tiene 3–5 ventanas y añade información en cada corte:

```text
TRUE_LONG rear/profile: sujeto 8–22%, destino visible
→ FULL/MEDIUM: acción corporal y distancia reducida
→ CLOSE: decisión o reconocimiento
→ FRAGMENT opcional: ojos, boca o mano cambian
```

No son zooms del mismo pose/momento. Además de la rampa, usa otro approach shot en un beat distinto: personaje avanza, cae, se incorpora, acecha o enfrenta un destino visible, con lead room y vector claros.

Introducción de amenaza:

```text
anomalía ambiental → TRUE_LONG con amenaza pequeña → preparación media → reacción
```

Revelación de poder:

```text
silencio/fragmento → percepción → TRUE_LONG transformado → TALL_ACTION
→ contacto → wide consecuencia → reacción/costo
```

## 9. TALL_ACTION

Panel full bleed vertical para caída, salto, embestida, descarga, persecución o choque. Debe tener:

- un instante dominante;
- trayectoria ≥60% de la altura;
- origen y destino en tercios distintos;
- cuerpos completos cuando la geografía lo exige;
- amenaza y objetivo ubicables;
- fondo que demuestre altura/distancia;
- dirección mediante ropa, escombros o líneas;
- fuente y destino de la fuerza.

No pasa un retrato vertical con aura, un close alargado, humo sin desplazamiento, varias copias del actor o la mera relación 9:16.

## 10. Geografía de acción

Antes de acción con tres o más participantes escribe una oración espacial:

```text
amenaza screen-right/background; protagonista screen-left/midground;
protegidos detrás; salida foreground-left; obstáculo en eje central
```

Cadena:

```text
GEOGRAPHY → ANTICIPATION → TRAJECTORY → CONTACT → CONSEQUENCE → REACTION
```

Puede compactarse voz y duración, pero no las seis ventanas visuales. Cada prompt representa una fase; evita `then`, `while also` y tres verbos sucesivos. Atacante, trayectoria y blanco se leen sin efectos. Contacto declara extremidad/objeto, punto y dirección. Reancla al cambiar lugar/eje o tras cuatro closes/fragments. Cruzar eje exige master nuevo. La consecuencia modifica posición, arquitectura, luz, daño, distancia o estatus.

Prueba silenciosa: sin voz, captions ni efectos todavía se entiende quién actúa, hacia dónde, contra quién y qué cambió.

## 11. Continuidad por estados

Antes de prompts crea un ledger:

```text
scene_id · beat · location/time/light · positions/facing · outfit/wetness
injuries/marks · prop · creature · container occupant · before → action → after · axis
```

HARD:

- `after_state` es el siguiente `before_state`;
- marca, herida o poder nunca aparece antes de su causa;
- rescate no aparece completado antes del contacto;
- nadie hereda poder, ropa, heridas o efectos ajenos;
- luz neutralizada permanece apagada;
- interior no se vuelve exterior sin puente;
- hora, lluvia y fuentes persisten;
- contenedor conserva ocupante;
- prompt declara ÚNICO interior y COMPLETAMENTE exterior;
- criatura cambia contactos, silueta y dirección entre atrapada, carga, ataque, impacto y colapso;
- renombrar una pose sin cambio físico no cuenta.

Cada panel escribe estos datos en `visual_plan` y `continuity` según el contrato JSON. No son notas libres. Los porcentajes son números; fases, layouts y escalas usan enums. `state_before`/`state_after` son mapas planos; toda mutación cita `atomic_action` y `state_change_reason`. El validador coteja cadena, MACHINE_LOCK, referencias y prompt.

## 12. Assets

Base humana canónica:

```text
Exactly one character, full body from hair to soles, orthographic front eye-level view,
neutral relaxed expression, both open empty hands visible, both feet visible,
clean and dry, even studio illumination, seamless neutral medium-gray background.
```

No escena, hora, lluvia, suciedad, sangre, poder, aura, arma/prop, emoción fuerte, pose de ataque, perspectiva dramática ni rim light. Derivadas humanas incluyen `same face, same hair, same outfit as the reference`; objetos/criaturas conservan forma y color. Acción, esfuerzo, dolor, miedo, transferencia y colapso usan performance poses compatibles. Una pose no cubre más de tres panels del mismo beat ni emociones incompatibles.

Cada registro define `prompt_signature`: descripción inglesa estable de identidad, 4–30 palabras, sin nombre, acción, emoción ni estado. Se repite literalmente en cada prompt donde ese ID es visible, incluso heredado; después se añade estado, verbo y posición.

Criatura recurrente: base legible más estados separados de atrapada, carga, ataque, impacto y colapso.

## 13. Identidad y referencias

Máximo tres. El motor no conoce nombres. Empieza con la `prompt_signature` literal y completa cada figura visible con:

```text
edad + cabello/rostro + outfit + estado + verbo + emoción
+ lado/profundidad + contacto/límite físico
```

Para dos similares contrasta cabello, ropa, herida y posición. No menciones actor identificable sin referencia en panel cargado. En cápsula transparente conserva referencia del ocupante; ocúltalo con reflejo/silueta, nunca asiento vacío. No encadenes tres scene references.

Una scene ref conserva instante/posiciones y abre con `Same exact moment and same character positions as the scene reference, now seen from ...`; luego repite firmas y límites dentro/fuera. No basta `same scene`.

Con 4+ identidades, primero ancla dos figuras. Luego usa esa escena como una referencia heredada del mismo `moment_id`, más protagonista y criatura; omite la plate y describe el escenario. Si no caben, divide la geografía en dos paneles causales. Nunca hagas un master ambiguo con identidades sin referencia.

## 14. Prompts y estilo

Orden:

```text
sujeto+verbo → actuación → layout → plano+ángulo+distancia+ocupación
→ roles/eje/contactos → lugar+hora → luz/paleta/rebote → style anchor
```

Rangos HARD: fragment/WHITE_FRAGMENT 45–75; white simple 55–85; composite/strip 75–110; estándar 60–95; interacción/ancla 80–115; nunca >120. No se aprueba por debajo. Un instante salvo composite/strip. Especifica manos solo si el crop las incluye; caídos `lying ON TOP of` con contactos y cabeza. Por defecto `no other readable text`.

Full bleed estándar:

```text
Hand-drawn Korean manhwa webtoon illustration, 2D flat cel shading,
crisp inked lineart, motivated dramatic lighting, high contrast,
vertical 9:16 webtoon panel composition.
```

Blancos usan tinta/cel sobrios sin `painted background` ni rim light universal. Bases usan iluminación de estudio. Color: 3–5 regímenes con base, secundario, acento, fuente y superficie de rebote; gris no domina toda la Parte.

## 15. Ejemplos de formulación

### WHITE_INSET emocional

```text
The short-haired young cleaner turns toward the rescued child, eyebrows pinched, lips parted, one trembling hand against his chest. Pure white webtoon page with one narrow upper-left panel occupying 55% of the canvas and untouched white margins. Eye-level angle, three-quarter front close shot, level camera roll, at rainy midnight. Restrained gray-blue color and one fading red accent. Hand-drawn Korean manhwa webtoon illustration, controlled flat cel shading, crisp inked lineart, vertical 9:16 composition, no readable text.
```

### WHITE_COMPOSITE_2 de relación

```text
The exhausted female worker reaches for the frightened child as the young cleaner watches their hands connect. Pure white webtoon page with exactly two black-bordered panels in opposite corners and 50% untouched white space at rainy midnight. Panel A: profile close shot, eye-level angle, level camera roll; her softened eyes and lowered shoulders release tension. Panel B: macro side view, eye-level angle, level camera roll; her gloved hand closes around the child's sleeve. Hand-drawn Korean manhwa webtoon illustration, controlled flat cel shading, crisp inked lineart, vertical 9:16 composition, no readable text.
```

### WHITE_ISOLATE de reacción

```text
The short-haired young cleaner recoils from the frightened worker, eyebrows lifted, jaw rigid, both hands lowering as his weight shifts backward. Pure white webtoon page with his isolated full-body figure lower-right and 65% blank white field. Eye-level angle, side view, full-body shot, level camera roll, at rainy midnight. Restrained gray workwear carries one red-black mark accent. Hand-drawn Korean manhwa webtoon illustration, controlled flat cel shading, crisp inked lineart, vertical 9:16 composition, no readable text.
```

### Fragmento de ojos

```text
The young cleaner's eyes tighten as he recognizes the forbidden power, brows pulling inward while rain crosses his temple. Pure white webtoon page with only eyebrows, eyes and upper cheeks inside a frame; 65% white space isolates the fragment. Eye-level angle, profile extreme close-up, level camera roll, at rainy midnight. One red reflection crosses his pupils. Hand-drawn Korean manhwa webtoon illustration, controlled flat cel shading, crisp lineart, vertical 9:16 composition, no readable text.
```

### Aproximación lejana

```text
The short-haired cleaner advances alone toward the fractured tunnel, shoulders rigid and fists lowered beside his wet gray coverall. Eye-level angle, from behind true long shot, level camera roll, from 20 meters away; his complete full body occupies 15% while the environment occupies 75%. Open air preserves relative scale and ground contact. Foreground puddles, midground figure and background threat remain distinct. At rainy midnight, amber work light enters from behind and violet light faces him ahead. Hand-drawn Korean manhwa webtoon illustration, controlled cel shading, crisp inked lineart, vertical 9:16 composition, no readable text.
```

### TALL_ACTION

```text
The cleaner hurls the plated black creature downward while anchoring above, one red-black force ribbon connecting them. Full-height tall action panel, high-angle wide master, side view, level camera roll; both complete bodies occupy separate upper and lower thirds while the movement vector spans 70% of the canvas. Tunnel columns and falling debris prove scale without hiding either silhouette. At rainy midnight, red emergency light enters from screen-left and white concrete sparks rebound from below. Hand-drawn Korean manhwa webtoon illustration, controlled cel shading, crisp inked lineart, vertical 9:16 composition, no readable text.
```

### Master de acción

```text
The young cleaner braces screen-left while the plated dog charges from screen-right; the exhausted worker remains behind him near the exit. Eye-level angle, three-quarter front wide master, level camera roll, from fourteen meters, with complete bodies on one wet ground plane and open attack space. Broken column foreground, convoy midground and tunnel mouth background remain distinct. At rainy midnight, violet chest light enters from right and amber work lamps from left. Hand-drawn Korean manhwa webtoon illustration, controlled cel shading, crisp inked lineart, vertical 9:16 composition, no readable text.
```

### BLACK_INSET de amenaza

```text
The eyeless plated creature arches its spine and opens the violet chest seam, foreclaws digging into concrete before the pulse. Matte-black webtoon page with one small lower-right inset and black space occupying 60% of the canvas. Low-angle profile close shot, level camera roll, inside the inset at rainy midnight. Violet chest light travels from screen-right across nearby dust. Hand-drawn Korean manhwa webtoon illustration, controlled flat cel shading, crisp inked lineart, high contrast, vertical 9:16 composition, no readable text.
```

## 16. Anti-gaming

Rechaza: “white” que solo es luz/cielo; blanco con pose frontal de asset; composite de 3+; duplicar momento; close cargado como respiro; `wide` con sujeto >22% como TRUE_LONG; noche común como BLACK_INSET; emoción sin cuerpo; actor inmóvil rodeado de efectos; pose renombrada; tall action sin origen/destino; consecuencia sin cambio; estado futuro anticipado; card entre trayectoria/contacto; referencia contraria al estado.

El reporte prueba cada gate con `scene_id`, no con frases como “se optimizó”.
