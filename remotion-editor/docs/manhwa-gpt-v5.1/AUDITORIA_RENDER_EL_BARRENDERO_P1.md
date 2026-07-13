# Auditoría de renders — El Barrendero de la Ruina, Parte 1

Fecha: 2026-07-12  
Fuente: `done/el_barrendero_de_la_ruina_parte_01_RELEASE_STRICT_V2.json`  
Renders: `public/el_barrendero_de_la_ruina_parte_01/images/`

## Veredicto

El acabado gráfico, color y arquitectura son buenos. El episodio no pasa `RENDER_RELEASE` porque identidad, actuación, ocupación espacial y estados de la criatura fallan en escenas críticas. El contrato JSON correcto no evitó fallos del render.

Problemas sistémicos:

1. Las bases neutrales son correctas, pero también los estados `barrendero_lluvia`, `heredero_marcado`, `barrendera_lluvia` y `atrapado_lluvia` ordenan expresión/postura neutral. Grok conserva esa neutralidad en peligro.
2. Los prompts usan nombres como Seo Jun/Kang Muyeol, pero el motor solo ve imágenes. Sin firmas visibles y límites `inside/outside`, mezcla identidades.
3. Se mencionan personas sin referencia para conservarlas; Grok inventa sustitutos.
4. El perro usa casi siempre la misma pose activa de pie. No existe cadena de poses atrapada→carga→impacto→caída.
5. El Auditor consolidó demasiado: varias imágenes duran 6–10 segundos.
6. Los respiros visuales conservadores son 5/34 = 14.7%, por debajo del objetivo V5.1 de 20–28%.
7. `RELEASE` fue incorrecto con `Renders: NOT_RUN`; el estado correcto era `PROMPT_RELEASE`.
8. El MP4 no deja una cola perceptible tras “confirmado”: el source termina apenas 0.04 s después del último timestamp y el timeline cerraba prácticamente pegado al audio.

## Duración real después de edit_speed 1.40

Audio raw: 173.12 s. Video narrado estimado: 123.66 s.

| Escena | Duración editada | Diagnóstico |
|---|---:|---|
| 06 | 6.63 s | master demasiado largo; dividir jerarquía y trabajo posterior |
| 07 | 9.51 s | crítico; convoy + regla institucional necesitan dos imágenes |
| 10 | 9.04 s | crítico; descripción del perro, condición atrapada y regla del pulso deben separarse |
| 11 | 5.69 s | master de rescate demasiado largo y emocionalmente plano |
| 18 | 6.10 s | revelación larga; dividir rostro/heridas y correas/collar o usar inset |

`scene_20` no es larga en tiempo: dura aproximadamente 1.23 s. Se percibe larga porque la imagen es estática, vacía de acción y no representa “la columna cedió”.

El timeline V5.1 añade 0.45 s de cola visual después del audio, manteniendo `scene_33`, para que el último fonema y el remate respiren sin alterar el TTS.

## Revisión imagen por imagen

| ID | Estado | Observación real | Reparación recomendada |
|---|---|---|---|
| 01 | Parcial | Hook atractivo y escala correcta; Seo Jun mira casi neutral. | Pose `agotado_alarmado`; cejas/mandíbula/manos visibles. |
| 02 | RETAKE | Ambos hombres aparecen dentro de la cápsula. | Limpiador de pelo corto completamente fuera, botas en pavimento; prisionero de pelo largo único ocupante interior. |
| 03 | Parcial | Círculo claro y espectacular; protagonista inexpresivo. | Pose `rodeado_desafiante` o miedo contenido observable. |
| 04 | PASS | Card de título; no genera imagen. | Conservar. |
| 05 | PASS | Composite blanco limpio y legible. El panel superior parece ficha de asset, pero funciona como presentación. | Opcional: mirada cansada en vez de neutral perfecta. |
| 06 | Parcial | Jerarquía se entiende y color funciona; rostros neutros y 6.63 s. | Dividir salida de combatientes / entrada de Barrenderos; añadir esfuerzo o resignación. |
| 07 | RETAKE | Convoy y stop legibles, pero Seo está quieto y dura 9.51 s. | Dos paneles: orden de detener + camión ignorándolo; reacción frustrada/alarmada. |
| 08 | PASS | Buen respiro blanco, contraste trabajo/hogar y 5.70 s sostenibles por dos viñetas. | Conservar. |
| 09 | RETAKE | Perro está de pie y libre; no parece atrapado bajo columna. Seo neutral. | Pose `pinned_struggling`; parte trasera bajo concreto, garras raspando; Seo alerta. |
| 10 | RETAKE | El perro queda parcialmente atrapado, pero el panel sostiene 9.04 s y Seo explica con calma. | Dividir anatomía/regla y pulso recorriendo contactos; pose `charging_pinned`. |
| 11 | RETAKE | Mira y niño están casi serenos; peligro poco urgente. | Mira protegiendo con mandíbula tensa; niño encogido/llorando; columna baja y perro atrapado. |
| 12 | Parcial | Close potente de la grieta, pero criatura sigue rígida. | Espina arqueada, patas braceadas y placas tensándose antes del pulso. |
| 13 | RETAKE | Mira/niño están de pie al lado del perro y la columna; no se siente el impacto. | Cuerpos agachados, Mira cubriendo cabeza del niño, columna inclinándose y escombros en caída. |
| 14 | Parcial | Seo por fin muestra esfuerzo; Mira y niño siguen neutrales. | Conservar staging y aumentar miedo/esfuerzo en ambos secundarios. |
| 15 | RETAKE | La voz dice que el pulso levantó concreto, pero las tres personas posan inmóviles. | Geográfico sin rostros: losas elevándose y cuerpos perdiendo equilibrio. |
| 16 | PASS | Camión elevado, escala e impacto claros. | Conservar. |
| 17a | PASS | Cápsula expulsada con trayectoria clara. | Conservar; reflejos deben seguir ocultando identidad. |
| 17b | Parcial | Cápsula abierta legible; impacto podría sentirse más. | Más contacto lateral, fragmentos y giro detenido; sin ocupante reconocible. |
| 18 | Parcial | Buen Orquestador, cápsula y heridas; 6.10 s es excesivo. | Dividir revelación del rostro / detalle de correas y collar con white o black inset. |
| 19 | RETAKE CRÍTICO | El Orquestador hereda pelo corto, uniforme y gafete del protagonista. Identidades fusionadas. | Firma completa de ambos; prisionero largo cabello/negro/restricciones dentro; trabajador corto/gris fuera. |
| 20 | RETAKE | Imagen muestra a Mira y niño quietos; no muestra que la columna cede. | Columna descendiendo con motion debris; ambos cubriéndose. Duración real 1.23 s. |
| 21 | Parcial | Posición dentro/fuera correcta y transferencia visible; expresiones demasiado contenidas. | Orquestador con dolor/urgencia; Seo reculando, ojos abiertos y pecho contraído. |
| 22 | RETAKE | Daño rojo visible, pero Seo posa neutral y aparecen figuras/objetos diminutos incoherentes. | Panel de percepción centrado en Seo; omitir actores sin referencia; pose de shock/dolor. |
| 23 | RETAKE | Extracción se lee; aparecen dos personas sustitutas no referenciadas y Seo está neutro. | Solo Seo + líneas + perro/entorno referenciados; rostro y manos bajo esfuerzo. |
| 24 | Parcial | Protección y poder se entienden, pero todos actúan con calma. | Seo sufriendo; Mira abrazando al niño con miedo y mirando el poder. Puede ser respiro emocional. |
| 25 | RETAKE | Descarga vistosa; aparecen mujer y bebé incorrectos, y perro sigue posando. | Omitir protegidos fuera de cuadro; Seo `power_strain`; perro `charging/recoiling`. |
| 26 | PASS | Impacto fuerte y criatura en el aire; buen instante. | Conservar. |
| 27 | RETAKE | Perro parece sentado, no destruido; Seo vuelve a pose neutral. Color azul inconsistente. | Pose `collapsed_broken` ON TOP of pavement, patas extendidas, placas partidas, grieta apagada; Seo agotado. |
| 28 | PASS/PARCIAL | Excelente layout blanco y continuidad; emociones todavía suaves. | Mantener composición; aumentar shock y retroceso de Mira. |
| 29 | PASS | Buen detalle del Orquestador agonizando. | Conservar. |
| 30 | Parcial | Scanner y tensión legibles; ambos rostros contenidos. | Capitana rígida/decidida; Seo desorientado y respiración visible. |
| 31 | PASS | Card de alerta; no genera imagen. | Conservar. |
| 32 | Parcial alto | Círculo y rifles muy buenos; protagonista completamente neutro. | Cambiar solo performance pose por miedo contenido o desafío. |
| 33 | RETAKE | Remate carece de emoción: Seo posa neutral y el rostro de la capitana no se ve. | Primer plano/OTS con reacción de Seo y perfil parcial de Ryu dando la orden. |

## Renders que pueden conservarse

Seguros: 04, 05, 08, 16, 17a, 26, 29, 31.  
Con retoque opcional: 01, 03, 06, 12, 14, 17b, 18, 21, 24, 28, 30, 32.  
Retake recomendado/obligatorio: 02, 07, 09, 10, 11, 13, 15, 19, 20, 22, 23, 25, 27, 33.

La regeneración final debe decidirse después de crear performance poses y estados del perro; regenerar con los mismos ingredientes neutrales repetirá el problema.
