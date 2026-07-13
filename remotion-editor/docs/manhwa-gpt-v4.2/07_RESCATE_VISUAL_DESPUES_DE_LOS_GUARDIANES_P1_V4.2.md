# Rescate visual V4.2 — Después de los Guardianes, Parte 1

Usa este documento con las Instrucciones V4.2 y las referencias actualizadas. En un chat nuevo adjunta la biblia aprobada, el monólogo, el JSON V4.1 rechazado y el archivo 08. No adjuntes la guía V3.2.

## Diagnóstico ya confirmado

- 42 paneles y una card.
- 31 prompts repiten el pasillo.
- 25 prompts son close o macro.
- El raspador protagoniza nueve prompts.
- Ningún prompt muestra a Kang Muyeol ni a Yoon Taegun.
- La explicación de los Guardianes se convirtió en un pasillo vacío.
- Los 42 prompts miden entre 55 y 64 palabras: plantilla uniforme, no dirección por función.
- Scene 22 perdió la transformación de la puerta porque el master describió personas posando y una plate normal.
- Había pausas técnicas, pero no se percibían: el inset de scene 15 volvió a mostrar el raspador.

## Mensaje 1 — Replanificar, sin JSON

Copia desde aquí:

---

FASE 4A — RESCATE VISUAL V4.2.

El JSON adjunto es mecánicamente válido, pero su dirección visual está rechazada. Desecha su shot plan y sus image_prompts. Conserva canon, orden causal y escenas, salvo los dos cambios de claridad autorizados abajo. No escribas todavía el JSON ni prompts finales.

CAMBIOS DE VOZ AUTORIZADOS

- scene_06: `[low] Esa mañana, empujé agua limpia bajo la puerta del pasillo de mantenimiento… y volvió convertida en escarcha.`
- scene_07: `En limpieza, eso significaba una cosa: el cierre había fallado.`
- El resto de palabras y puntuación queda bloqueado, salvo los tags ya aprobados.

OBJETIVO

La Parte debe vender escala de mundo, oficio, misterio espacial, rescate y persecución. Un panel comunica la idea dramática; no sustituye persona, institución o mito por el objeto asociado. El raspador solo protagoniza cuando se descubre, se usa o impacta.

PANELES ANCLA OBLIGATORIOS

1. scene_01 — HOOK/PROMESA: visualización de propaganda pública, no escena presente. Una figura negra anónima y sin rostro asociada por el Estado con una Fractura gigantesca sobre un distrito coreano parcialmente evacuado; Guardianes y luces institucionales diminutos abajo. Escala mítica, capas y forma dominante. Sin raspador, mano ni identidad real del Orquestador.
2. scene_08 — MUNDO/CONTRASTE: Guardianes con siluetas tácticas salen de un área urbana dañada bajo luz azul-blanca mientras limpiadores con carros entran en sentido contrario bajo fluorescente verdoso. Una gran cicatriz de cierre y residuos muestran lo ocurrido. Ijun es pequeño, no protagonista frontal.
3. scene_22 — AMENAZA: master dinámico sin plate normal. La puerta estándar se prolonga veinte metros hacia un espacio imposible; jambas estiradas, luz doblada, bolsas deslizándose, Ma junto al umbral e Ijun detrás. Suelo común y escala legible, pero el acontecimiento domina.
4. scene_34 — CLÍMAX/PRECIO: Ijun se afirma contra el marco; la oscuridad absorbe varias lámparas de cerca a lejos, filamentos negros tensan el raspador y grietas blancas suben por su brazo. Ma sigue en peligro al fondo. Low-angle medium-wide, no close de mano.
5. scene_43 — CLIFFHANGER: Ijun completo bajo el cono azul del dron; su mano agrietada visible al costado, el dron a 2.5 metros y la pared lisa detrás. Composición triangular, institucional y opresiva. Sin raspador como protagonista.

GUIÓN DE COLOR OBLIGATORIO

No satures todas las escenas. El color cambia con la dramaturgia:

- scenes 01–02, mito/peligro público: navy y carbón dominantes, alerta carmesí reflejada en lluvia/metal y azul-blanco de Guardianes. El negro sigue siendo la firma; el rojo pertenece a alarmas y propaganda.
- scenes 03–14, normalidad e investigación: verde petróleo y gris industrial suaves, chaleco/cinta amarillo mostaza y una lámpara ámbar. Agua y suelo mojado recogen reflejos. La escena 06 es clara y legible, no épica.
- scene 15, recuerdo: sepia cálido y blanco amplio.
- scenes 16–20, descubrimiento: la paleta cotidiana se enfría; entra cian de escarcha en metal, tableta y piel.
- scenes 21–30, amenaza: verde fluorescente debilitado, cian helado, amarillo de cinta y negro creciente. La saturación aumenta en 22 y baja en la card 30.
- scenes 31–37, Sutura: negro dominante, grietas blancas y chaleco amarillo como ancla humana; las últimas lámparas verdes desaparecen progresivamente. Scene 36 cae a gris azulado silencioso y scene 37 vuelve a blanco.
- scenes 38–43, Estado: cobalto/azul-blanco institucional, pequeñas alertas rojas solo en el centro de mando, amarillo del chaleco y grietas blancas. El final queda frío, no monocromo.

Cada ancla reporta base, secundario, acento y superficie de rebote. Los paneles de calma pueden ser más naturales y desaturados; los acentos máximos se reservan para hook, amenaza, clímax y cliffhanger.

PUNTUACIÓN VISUAL OBLIGATORIA

Reporta estas siete y no cuentes impactos ni closes normales:

- scene_05: narrative_card de título.
- scene_15: recuerdo sepia de Muyeol.
- scene_20: white inset de Ma y el plano imposible.
- scene_26: reacción con al menos 55% de espacio negativo.
- scene_30: convertir a narrative_card con texto visual `ERA LA PUERTA.`; conserva su voiceover.
- scene_37: white inset de una sola muñeca agrietada.
- scene_38: device shot de la radio en la mano temblorosa de Ma.

ASSETS NUEVOS

- `kang_muyeol_recuerdo`: identidad de padre limpiador, ropa laboral antigua; base técnica y pose de recuerdo separadas.
- `yoon_taegun`: base técnica y uniforme de capitán Guardián.
- `centro_mando_guardianes`: views `console_profile_blue` y `wall_monitor_ots_blue`.

El Orquestador de scene_01 es una representación propagandística anónima, no un asset de identidad. Los Guardianes genéricos de scene_08 son siluetas de uniforme con rostros ocultos, no personajes recurrentes.

MAPA VISUAL OBLIGATORIO

- 01 propaganda pública épica del Orquestador y una Fractura urbana; sin herramientas.
- 02 macro del filamento entrando por el guante roto.
- 03 Ijun pequeño, cuerpo completo, empujando carro de limpieza por el pasillo de mantenimiento.
- 04 face/hand close: reconoce que las manos son suyas; oscuridad residual, sin texto inventado.
- 05 card.
- 06 plano bajo medio: Ijun empuja agua clara con jalador; una corriente entra y otra vuelve congelada. Puerta y origen del agua visibles.
- 07 Ma se agacha junto a la doble corriente; hielo, sello y reacción en el mismo encuadre.
- 08 ancla Guardianes versus limpiadores.
- 09 Ma extiende cinta amarilla entre vidrio; Ijun y carro al fondo.
- 10 OTS de Ijun ignorando la puerta y siguiendo una marca del suelo.
- 11 detalle atmosférico de polvo moviéndose contra la gravedad en haces de luz.
- 12 high-oblique master: techo, paredes y botas envían residuos al mismo marco; Ijun pequeño.
- 13 close del sello con solo `ZONA SEGURA`.
- 14 dedos de Ijun casi tocando condensación helada bajo el sello; reacción térmica visible.
- 15 memoria sepia: Muyeol intenta detener una reapertura mientras figuras oficiales se alejan; raspador secundario en el cinturón.
- 16 Ijun levanta el sello con el raspador; acción legible.
- 17 macro del filamento negro descubierto; último close de herramienta antes del clímax.
- 18 fragmento de vidrio enganchado en el guante rasgado, sin raspador.
- 19 Ma sostiene la tableta y ya tiene una palma en la pared; plano medio.
- 20 white inset: el plano termina en una pared, rostro de Ma en perfil; nada más.
- 21 la puerta “respira”: metal abombado, jambas flexionadas y reflejo de lámpara curvado; sin pose estática.
- 22 ancla de amenaza.
- 23 Ma completa comienza a deslizarse, cuerpo inclinado y botas perdiendo agarre.
- 24 high-oblique full: dedos enganchados bajo la cinta, piernas arrastradas, sombra ya dentro del espacio negro.
- 25 low side full: Ijun corre hacia ella, pero ambos talones vuelven a la misma marca amarilla; Ma al fondo.
- 26 rostro de Ijun abajo a la izquierda siguiendo la escarcha; 55–70% de vacío oscuro hacia el marco.
- 27 top-down: la escarcha evita el centro y forma un circuito alrededor del marco.
- 28 detalle del borde completo: hielo blanco y línea negra rodean jambas y dintel, no solo el suelo.
- 29 POV de Ijun: marcas oficiales de “daño estructural” están en la hoja, pero el borde vivo está en el marco; su dedo señala el error. Sin raspador.
- 30 narrative_card `ERA LA PUERTA.`
- 31 close de acción: el raspador presiona la línea negra.
- 32 impact panel del choque metálico, sin contarlo como respiro.
- 33 medium profile: alrededor de la mano las lámparas cercanas están apagadas y las lejanas aún encendidas; el efecto avanza por el pasillo.
- 34 ancla de clímax/precio.
- 35 wide consequence: Ma cae dentro del alcance de Ijun mientras la habitación se pliega en una costura vertical; bolsas salen despedidas hacia afuera.
- 36 wide silencioso: pared lisa dominante; Ijun y Ma pequeños en el suelo inferior. Transición ambiental.
- 37 white inset: una sola muñeca de Ijun, guante roto y grietas blancas; sin segunda mano ni herramienta.
- 38 device shot de radio en la mano de Ma, pequeña luz azul y estática; sin cuerpo genérico cortado.
- 39 CORTE AL CENTRO DE MANDO: Yoon en perfil recibe la firma del Orquestador en una pantalla abstracta negra/azul; él habla por comunicador.
- 40 vuelta al pasillo: dron desciende desde las tuberías; Ijun y Ma son siluetas pequeñas abajo.
- 41 POV del dron a 35 grados: Ijun queda aislado en el cono de luz, Ma fuera del centro; sin retícula ni texto.
- 42 OTS de Yoon ante monitor grande con imagen en vivo de Ijun y solo el texto exacto `KANG IJUN`; botón de captura encendido.
- 43 ancla de cliffhanger.

REGLAS DE COMPOSICIÓN

- Máximo dos close/macro consecutivos.
- El mismo prop no protagoniza más de dos escenas en cualquier ventana de ocho.
- Los masters narran el acontecimiento; nadie posa para “reorientar”.
- Las transformaciones geométricas no usan la plate normal.
- Panel estándar: 60–90 palabras descriptivas antes del ancla; ancla/master: 80–120; detalle: 45–70.
- La longitud varía según función. Rechaza otra vez si todos los prompts caen en una banda uniforme de diez palabras.
- Cada ancla declara foreground, midground, background, escala relativa, forma dominante y conflicto de luz.
- Evita `stands`, `looks` o `faces` como acción central en anclas.

Entrega exclusivamente:

1. assets conservados/nuevos/pospuestos;
2. cinco anclas desarrolladas;
3. siete puntuaciones visuales;
4. guion de color por bloque;
5. tabla de shot plan de 43 filas;
6. conteos: closes consecutivos, repetición máxima de prop, distribución de planos, escenas fuera del pasillo y longitud prevista por función.

Espera mi aprobación. No escribas JSON ni prompts finales.

---

## Mensaje 2 — Compilar después del OK

Copia después de aprobar el shot plan:

---

SHOT PLAN V4.2 APROBADO.

Compila el JSON completo. Aplica solo los cambios de voz autorizados en scene_06 y scene_07 y actualiza full_script exactamente. Conserva las demás palabras y el orden causal.

Usa los assets, anclas, puntuaciones, referencias y views aprobados. Devuelve el JSON completo, no un parche.

Los prompts de scenes 01, 06, 08, 15, 21, 22, 24, 30, 34, 35, 39 y 43 deben conservar la ambición y composición de 08; solo adapta continuidad o nombres de referencia.

Antes de entregar ejecuta:

- validador contractual;
- prueba semántica voz↔imagen;
- prueba silenciosa de las cinco anclas;
- conteo de puntuaciones;
- racha máxima de close/macro;
- repetición máxima de prop en ventana de ocho;
- promedio y rango de palabras de prompts por función;
- compatibilidad de plates en transformaciones.
- guion cromático: tres o más regímenes y acento/reflejo de cada ancla.

Entrega JSON, resumen, ASSETS NUEVOS y conteos. Si una ancla puede describirse como “objeto aislado”, “pasillo vacío” o “persona posando”, no entregues: corrígela.

Después del JSON no generes todas las imágenes. Genera primero solo scenes 01, 06, 08, 15, 21, 22, 24, 34, 35, 39 y 43, y verifica aparte la card de scene_30. La producción completa requiere aprobación visual de esa muestra.

---
