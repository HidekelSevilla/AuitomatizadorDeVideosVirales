# Auditoría senior del video final — El Barrendero de la Ruina P1 V5.1

## Veredicto

La mejora frente a `STRICT_V2` es real y grande. El video ya posee acabado profesional, mejor actuación facial, acción más fragmentada, identidades estables y una transferencia mucho más clara. Sí se reconoce como un webtoon de acción narrado.

Todavía no merece `RENDER_RELEASE` definitivo. Su principal límite no es la cantidad de imágenes, sino la falta de contraste de escala: casi todos los encuadres siguen siendo retratos verticales medios o enteros dentro del mismo túnel. También hay nueve imágenes que no representan correctamente el hecho narrado.

Valoración del resultado:

| Área | Nota | Diagnóstico |
|---|---:|---|
| Hook | 9/10 | Villano, herencia y ejecución quedan claros antes de 10 s. |
| Narración y claridad | 8/10 | Premisa fácil de entender, pero el pago prometido llega tarde. |
| Ritmo de montaje | 8/10 | Mucho mejor; ya no hay paneles de 6–10 s durante la acción. |
| Emoción | 7.5/10 | Gran avance, aunque las poses de referencia aún se reutilizan demasiado. |
| Calidad de ilustración | 8/10 | Línea, lluvia, reflejos y color tienen acabado profesional. |
| Continuidad | 7/10 | Mejoró la identidad, pero fallan cápsula, columna y estados del perro. |
| Cámara y escala | 5.5/10 | Cero extreme-wides reales; predominan composiciones centradas. |
| Sensación webtoon | 7/10 | Sí parece webtoon, pero aún se siente parcialmente como una colección de pósteres. |
| Cliffhanger | 9/10 | Detección, círculo de rifles y sentencia forman un cierre fuerte. |

## Lo que sí mejoró

- Las escenas subieron de 34 a 48.
- La duración media bajó de 3.63 s a 2.57 s.
- La escena máxima bajó de 9.51 s a 5.70 s.
- Solo quedan dos ventanas por encima de 4.5 s.
- `scene_20` dura 1.23 s; si se percibe lenta es por repetición visual, no por duración.
- Seo Jun ya no aparece dentro de la cápsula en lugar de Kang Muyeol.
- Mira, el niño, Seo Jun y Kang muestran miedo, esfuerzo, dolor o autoridad con mucha más claridad.
- El bloque `scene_14`–`scene_17b` y el bloque `scene_24a`–`scene_26` poseen una progresión de acción más agradable.
- `scene_15`, `scene_16`, `scene_24`, `scene_26`, `scene_32` y `scene_33` son puntos fuertes.
- El cierre de audio quedó arreglado: la última palabra termina aproximadamente en 123.514 s y el video en 124.208 s, con 0.694 s de cola visible.

## Hook, narración y retención

El hook funciona:

- 2.99 s: se completa que murió el villano más grande de Corea.
- 4.24 s: sabemos que su poder sobrevivió.
- 7.03 s: sabemos que eligió al protagonista.
- 9.51 s: aparece la amenaza de ejecución.
- 11.16–13.23 s: título.

El problema está después del título:

| Hito | Tiempo aproximado |
|---|---:|
| Fin del título | 13.23 s |
| Aparición del perro | 39.79 s |
| Primera decisión activa de Seo Jun | 63.47 s |
| Aparición física del Orquestador | 75.31 s |
| Transferencia | 88.20–90.77 s |
| Manifestación del poder | 90.77 s |
| Ataque prometido | 101.79 s |

Hay 26.56 s de exposición después del título y casi 50 s antes de que Seo Jun actúe. El hook promete herencia y poder, pero el pago principal llega al 82% del video. Éste es el mayor riesgo de abandono.

La narración corre a unas 212 palabras por minuto después del `edit_speed: 1.40`. Rescate y poder alcanzan 232–238 ppm. La velocidad da energía, pero deja poco tiempo para procesar al mismo tiempo voz, subtítulos, composición y efectos.

Solo existen dos tags de interpretación: `[low]` y `[pause]`. La puntuación ayuda, pero faltan cambios controlados para urgencia, dolor, revelación y sentencia. No deben llenarse todas las frases de tags; bastan cambios por bloque emocional.

## Ritmo visual y respiros

Respiros explícitos detectados:

- Composites blancos: `scene_05`, `scene_08`, `scene_28`.
- Inset blanco: `scene_10b`.
- Inset negro: `scene_18a`.
- Cards: `scene_04`, `scene_31`.

Son 7 de 48 ventanas, 14.6%. La meta profesional para esta duración debería ser 10–12 ventanas, aproximadamente 21–25%, sin insertar un respiro entre lanzamiento e impacto.

Los composites actuales están bien y tienen layouts distintos. Faltan dos o tres pausas perceptibles adicionales: un pulso en panel pequeño sobre blanco, la caída de la cabeza de Kang en un panel aislado con gran margen negativo y un detalle silencioso antes de la card del escáner.

## Por qué faltan tomas lejanas aunque el JSON diga “wide”

El archivo contiene muchas palabras `wide`, pero ninguna toma `extreme-wide` y solo una `deep wide`. Visualmente apenas 3–5 imágenes se sienten realmente lejanas. La mayoría de los personajes ocupan entre 45% y 75% de la altura.

Los ejemplos aportados no funcionan únicamente por sus efectos. Usan una escalera de escala:

1. Geografía lejana y siluetas pequeñas.
2. Preparación media.
3. Trayectoria diagonal.
4. Impacto cerrado.
5. Consecuencia lejana.
6. Reacción emocional.

También reservan la mayor parte del cuadro para entorno, vacío, amenaza o energía. El personaje no siempre es el objeto más grande.

Regla verificable recomendada:

```text
TRUE LONG SHOT:
- subject occupies only 10–25% of frame height;
- complete body with empty space on every side;
- environment occupies at least 65% of the image;
- camera 12–25 meters away;
- foreground, midground and background all visible;
- no portrait crop;
- never combine wide with tight, close or medium.
```

Para unas 46 imágenes deben existir como mínimo seis planos lejanos reales: dos durante el clímax, uno antes de la amenaza, uno de geografía de rescate, uno de manifestación y uno de consecuencia. No deben resolverse todos con picado: conviene alternar eye-level distant, low-angle distant y solo dos high-oblique geográficos.

Escenas idóneas para aumentar la escala:

- `scene_06`: trabajadores de 8–10% de altura; túnel ocupando 80%.
- `scene_07`: Seo Jun menor de 12%; ruta y columna completas.
- `scene_11a`: geografía del triángulo Mira–niño–perro.
- `scene_20`: masa completa de la columna cayendo y víctimas pequeñas.
- `scene_22`: Seo Jun pequeño dentro de una red enorme de daño.
- `scene_25`: protagonista y perro en tercios opuestos, cada uno de 12–18%.
- `scene_32`: círculo completo, Seo Jun menor de 10%.

## Emoción y referencias

Los prompts ya no piden expresiones neutras. El problema restante es que una misma pose alimenta emociones distintas:

| Pose | Usos |
|---|---:|
| `seo_jun/dolor_poder` | 10 |
| `kang_muyeol/moribundo_intenso` | 9 |
| `park_mira/proteccion_panico` | 8 |
| `nino_atrapado/terror_agachado` | 7 |
| `seo_jun/agotado_desafiante` | 7 |
| `seo_jun/alerta_lluvia` | 6 |

Una performance pose no debería cubrir más de tres escenas del mismo beat ni emociones diferentes. Hacen falta estados situacionales: reconocimiento, romper correa, contacto de transferencia, percepción, intento confuso, extracción, resolución de ataque, abrazo de alivio y retroceso de miedo.

El perro también necesita cambios físicos, no solo nuevos nombres: comprimido bajo escombro, garra raspando, espalda arqueada, liberación del pulso, retroceso, vuelo sin contacto y colapso con luz apagada.

## Auditoría escena por escena

| Escena | Estado | Observación |
|---|---|---|
| `01` | PASS | Hook claro; cápsula ocupada y Seo fuera. |
| `02` | PASS | Transferencia expresiva y legible. |
| `03` | PASS | Círculo fuerte, aunque puede ser más lejano. |
| `05` | PASS | Buen composite blanco. |
| `06` | PARCIAL | No llega a ser deep wide. |
| `06a` | PASS | Oficio y acción concretos. |
| `07` | PARCIAL | Master frontal y demasiado centrado. |
| `07a` | PASS | Buena relación de escala con el convoy. |
| `07b` | PARCIAL | El convoy parece estacionario. |
| `08` | PASS | Buen respiro y motivo económico. Dura 5.70 s. |
| `09` | PARCIAL | El perro no parece claramente atrapado. |
| `10` | RETAKE | Repite `09`; perro sentado, no aplastado. |
| `10a` | PASS | Detalle de grieta efectivo. |
| `10b` | PASS | Regla visual clara y buen margen blanco. |
| `11` | PASS | Urgencia de Mira visible. |
| `11a` | RETAKE | Perro intacto y sentado junto al niño. |
| `12` | PARCIAL | Pulso legible, silueta aún estática. |
| `13` | PASS | Recorrido del daño claro. |
| `13a` | RETAKE | Miedo fuerte, pero no se ve doblarse la columna. |
| `14` | PASS | Movimiento corporal claro. |
| `14a` | PASS | Rescate legible y expresivo. |
| `15` | PASS | Excelente geografía y desequilibrio. |
| `16` | PASS | Golpe al convoy potente. |
| `17a` | RETAKE | Cápsula posada, no sale despedida. |
| `17b` | RETAKE CRÍTICO | Cápsula vacía; Kang aparece sin continuidad en `18`. |
| `18` | PASS | Revelación limpia del Orquestador. |
| `18a` | PASS | Buen inset y detalle del collar. |
| `19` | PASS | Dentro/fuera e identidades correctas. |
| `20` | RETAKE | No domina la caída; repite Mira y niño. |
| `21` | RETAKE | No se entiende que rompe la mano contra la correa. |
| `21a` | PASS | Contacto claro; Seo fuera y Kang dentro. |
| `21b` | PASS | Transferencia fuerte. |
| `22` | PARCIAL | Debe ser mucho más lejano e icónico. |
| `23` | PASS | Confusión y miedo visibles. |
| `23a` | PARCIAL | Las cintas no nacen de puntos visibles del suelo. |
| `24` | PASS | El split panel aumenta la sensación webtoon. |
| `24a` | PASS | Poder y dolor corporal claros. |
| `25` | RETAKE CRÍTICO | Perro de pie antes del impacto, aunque debía seguir atrapado. |
| `26` | PASS | Excelente trayectoria, impacto y cuerpo en el aire. |
| `27` | RETAKE CRÍTICO | La grieta morada continúa encendida cuando la voz dice que se apagó. |
| `28` | PASS | Buen respiro y alivio. |
| `28a` | PARCIAL | Mira observa, pero no retrocede con miedo. |
| `29` | PASS | Buena consecuencia silenciosa. |
| `30` | PASS | Ryu posee identidad y autoridad propias. |
| `32` | PASS | Cliffhanger visual fuerte. |
| `33` | PASS | Orden final clara. |

Balance: 29 PASS, 8 PARCIALES y 9 RETAKE.

## Retomas mínimas

No hace falta rehacer el JSON completo ni volver a generar las 46 imágenes. Regenerar:

```text
scene_10
scene_11a
scene_13a
scene_17a
scene_17b
scene_20
scene_21
scene_25
scene_27
```

Las tres urgentes son `17b`, `25` y `27`, porque contradicen hechos explícitos. `20` debe aprovecharse como plano lejano monumental.

## Fallos del Auditor y del Director

El JSON se etiquetó como `PROMPT_RELEASE`, pero el validador local devuelve:

```text
CONTRACT_PASS
PROMPT_REPAIR_REQUIRED
```

El Auditor no debe poder declarar RELEASE si el validador no devuelve PASS. También dejó pasar:

- Cero extreme-wides reales.
- Solo 14.6% de respiros explícitos.
- Prompts de 102–161 palabras, promedio 130, con demasiadas prioridades.
- Reutilización excesiva de performance poses.
- Pose de referencia incompatible con la emoción o postura pedida.
- Cápsula transparentemente vacía pese a estar ocupada en canon.
- Genitivos rotos: `boots's chest`, `boots's arms`, `chest crack's purple chest crack`.
- Cuatro prompts sin plano o ángulo completos: `10b`, `18a`, `21`, `24a`.

Nuevos gates necesarios:

1. RELEASE bloqueado si `validate_v5.mjs` no devuelve PASS total.
2. Contar planos lejanos por ocupación del sujeto, no por la palabra `wide`.
3. Exigir 4–6 long/extreme-wides y al menos dos en el clímax.
4. Limitar una performance pose a tres usos por beat.
5. Validar postura y ubicación: de pie, acostado, dentro y fuera.
6. Mantener ocupante en objetos transparentes; ocultarlo con reflejo o silueta, nunca vaciando el objeto.
7. Medir por separado páginas blancas, espacio negativo, cards y reacciones.
8. Prohibir prompts de más de 95 palabras salvo interacción espacial compleja justificada.
9. Detectar frases posesivas rotas y datos incompatibles con el crop.
10. Exigir referencias de escena para continuar interacciones complejas.

## Reglas narrativas futuras

Para videos de esta duración:

- Amenaza antes de 25–30 s.
- Primera decisión antes de 40–45 s.
- Manifestación parcial o mini-victoria antes del 45–55%.
- Pago principal antes del 75–80%.
- Separar densidad de voz: exposición más calmada y acción rápida, sin mantener 1.40 uniforme si se pierde comprensión.

Con la voz actual, unas 430 palabras generan cerca de 124 s. Como referencia práctica, alrededor de 315–325 palabras producirían unos 90 s y 365–375 palabras unos 105 s, manteniendo una velocidad similar.

## Conclusión final

El video no retrocedió: mejoró de forma clara y ya contiene escenas profesionales. El siguiente salto no exige más reglas indiscriminadas ni más cortes. Exige reglas verificables de escala, estados físicos, emoción y tiempo narrativo.

Con nueve retomas y los nuevos gates, esta parte puede quedar mucho más cerca del objetivo sin perder el trabajo ya generado.
