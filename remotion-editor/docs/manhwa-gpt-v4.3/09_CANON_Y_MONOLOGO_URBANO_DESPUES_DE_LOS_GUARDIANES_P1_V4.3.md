# Canon corregido y monólogo urbano V4.3

Este documento sustituye únicamente la localización, anomalía y monólogo de la Parte 1. Conserva el arco general, personajes, Sutura Negra, verdad del Orquestador y mapa de revelaciones.

## Enmienda de canon

### Localización

La Parte 1 ocurre en un callejón urbano de carga detrás de una estación o complejo comercial, recién liberado por los Guardianes. Es exterior, vertical y profundo: fachadas dañadas, cables, tuberías, contenedores, bolardos amarillos, un vehículo de contención completo y asfalto mojado por lluvia.

El lugar sigue siendo una zona de trabajo posterior a una operación, pero ya no es un pasillo interior ni gira alrededor de una puerta.

### Anomalía

Una cicatriz de Fractura cruza el muro trasero y continúa por el asfalto. El Estado la cubrió con sellos verdes y la clasificó como daño residual estable.

Cuando se reactiva, la cicatriz se abre solo unos centímetros, pero dentro aparece una calle imposible que desciende cientos de metros. La profundidad absorbe agua, residuos, luz y cuerpos. La amenaza es el borde completo de la Fractura, no una habitación ni algo situado detrás del muro.

### Lenguaje visual

- Fractura activa: interior negro con borde carmesí de alarma reflejado en lluvia y metal.
- Sutura Negra: negro que absorbe luz; nunca adopta el rojo de la Fractura.
- Precio corporal: grietas blancas bajo la piel.
- Guardianes: blanco, negro y azul cobalto institucional.
- Limpieza: amarillo mostaza, gris azulado y verde petróleo.
- Calma: color local natural y lluvia azul-gris con lámparas ámbar.
- Clímax: máxima separación entre carmesí, negro, blanco, azul y amarillo.

El rojo pertenece a la Fractura, señales de peligro y alarmas. El negro pertenece a la Sutura. No se mezclan.

### Eje

- cicatriz de Fractura: screen-right o background
- Ijun: midground izquierdo
- Ma Sori: entre Ijun y la cicatriz
- salida segura: screen-left
- vehículo de contención: foreground inferior o lateral, completo cuando define escala
- profundidad urbana y cables: background

### Assets nuevos o redefinidos

- `callejon_carga_post_fractura`: escenario principal exterior
- `cicatriz_fractura_sellada`: línea oscura bajo sellos verdes
- `cicatriz_fractura_activa`: borde carmesí, interior negro y profundidad imposible
- `vehiculo_contencion_guardian`: vehículo completo de escala canónica
- `guardian_operativo_generico`: uniforme blanco/negro con luz azul; rostro oculto
- `kang_muyeol_recuerdo`
- `yoon_taegun`
- `centro_mando_guardianes`

Views mínimas:

- `alley_axis_rain_eye`
- `alley_high_oblique_scale`
- `fracture_wall_front_eye`
- `fracture_ground_low_profile`
- `fracture_high_oblique`
- `alley_rear_escape_axis`
- `post_close_wall_rain_eye`
- `drone_pov_35down_rain`

## Monólogo V4.3 por scene_id

1. **scene_01:** `[dark] El poder más odiado de Corea no desapareció cuando cayó el Orquestador.`
2. **scene_02:** `Solo cambió de manos.`
3. **scene_03:** `Y las nuevas manos… eran las de un limpiador que solo quería terminar su turno.`
4. **scene_04:** `Las mías. [pause]`
5. **scene_05:** `[low] La firma del villano. [pause]`
6. **scene_06:** `[low] Una hora antes, la lluvia corría hacia la alcantarilla… excepto la que tocaba una cicatriz sellada.`
7. **scene_07:** `Esa agua subía por el muro y volvía convertida en escarcha.`
8. **scene_08:** `Los Guardianes cerraban Fracturas y retiraban Anomalías. Nosotros limpiábamos lo demás. Al Orquestador lo culpaban de abrirlas.`
9. **scene_09:** `Mi supervisora, Ma Sori, rodeaba la cicatriz con cinta amarilla y maldecía el vidrio que los Guardianes habían dejado. Trabajaba rápido, antes de que alguien importante recordara que existíamos.`
10. **scene_10:** `Yo no miré primero la grieta del muro.`
11. **scene_11:** `Miré lo que caía hacia ella.`
12. **scene_12:** `El polvo venía del asfalto, las paredes y los cables, como si la calle se inclinara hacia la misma línea.`
13. **scene_13:** `El sello verde decía ZONA SEGURA.`
14. **scene_14:** `Debajo, el concreto estaba helado.`
15. **scene_15:** `Mi padre, Kang Muyeol, murió porque nadie le creyó cuando dijo que una Fractura sellada seguía abierta.`
16. **scene_16:** `Levanté una esquina del sello con el raspador. No buscaba heroísmo, sino la mancha que hacía subir el agua.`
17. **scene_17:** `La punta metálica salió negra.`
18. **scene_18:** `Un vidrio me había rasgado el guante.`
19. **scene_19:** `Ma Sori revisó el muro en su tableta y apoyó una mano sobre la cicatriz.`
20. **scene_20:** `—Aquí no queda ninguna Fractura —dijo.`
21. **scene_21:** `Entonces la cicatriz latió.`
22. **scene_22:** `El muro no se partió. Se alejó. Dentro de una grieta estrecha apareció una calle que descendía cientos de metros. Las bolsas patinaron primero.`
23. **scene_23:** `Después, Ma Sori.`
24. **scene_24:** `La vi aferrarse a la cinta amarilla. Sus botas seguían en el asfalto, pero su sombra ya caía por la calle imposible.`
25. **scene_25:** `Corrí hacia ella, pero el suelo se estiró y me devolvió a la misma marca.`
26. **scene_26:** `Así que dejé de mirar a Ma Sori y miré los residuos.`
27. **scene_27:** `La escarcha no corría hacia la abertura.`
28. **scene_28:** `Rodeaba toda la cicatriz.`
29. **scene_29:** `Los Guardianes habían confundido el borde con daño residual. La amenaza no estaba detrás del muro.`
30. **scene_30:** `Era la Fractura.`
31. **scene_31:** `Presioné el raspador contra la línea negra bajo el sello.`
32. **scene_32:** `El metal chilló.`
33. **scene_33:** `Después, las luces se apagaron alrededor de mi mano.`
34. **scene_34:** `No fue una llamarada, sino lo contrario. La oscuridad devoró los reflejos de la lluvia. Bajo el guante, líneas blancas quebraron mi piel.`
35. **scene_35:** `La cicatriz se cerró como una costura. Ma Sori cayó hacia mí y la calle imposible desapareció con un golpe seco.`
36. **scene_36:** `Quedó un muro mojado.`
37. **scene_37:** `Y mi muñeca agrietada.`
38. **scene_38:** `La radio de Ma Sori escupió estática.`
39. **scene_39:** `—Aquí el capitán Yoon Taegun. Firma del Orquestador detectada. Está dentro de alguien. Dron tres, identifícalo.`
40. **scene_40:** `Un zumbido descendió entre la lluvia.`
41. **scene_41:** `La lente me encontró bajo las luces azules.`
42. **scene_42:** `—Identidad confirmada: Kang Ijun.`
43. **scene_43:** `[flat] Me encontraron.`

## Puntuaciones visuales

- scene_05: narrative_card
- scene_15: recuerdo sepia
- scene_20: white inset del escaneo
- scene_26: reacción con espacio negativo
- scene_30: narrative_card `ERA LA FRACTURA.`
- scene_37: white inset de muñeca
- scene_38: device shot de radio

## Paneles ancla

- scene_01: Ijun protege a Ma bajo una cicatriz carmesí gigantesca en el callejón lluvioso
- scene_08: Guardianes salen mientras limpiadores entran
- scene_22: la cicatriz revela una calle imposible
- scene_34: Sutura Negra contra la Fractura, con costo corporal
- scene_43: Ijun identificado bajo el dron y luces azules

## Mapa visual obligatorio

- 01 high-oblique wide: Ijun protege a Ma, Fractura carmesí, vehículo completo y lluvia.
- 02 macro: filamento negro entra por el guante roto.
- 03 full rear: Ijun pequeño empuja carro de limpieza entre restos urbanos.
- 04 face/hand close: reconoce sus manos; negro y grietas blancas, sin raspador.
- 05 card de título.
- 06 plano bajo: agua normal hacia alcantarilla y rama que sube por la cicatriz.
- 07 Ma observa agua ascendente, escarcha y sello en el mismo panel.
- 08 Guardianes salen; limpiadores entran.
- 09 Ma rodea la cicatriz con cinta; Ijun y carro quedan al fondo.
- 10 OTS de Ijun siguiendo el agua, no mirando primero la grieta.
- 11 polvo y lluvia se desvían hacia la cicatriz entre cables.
- 12 high-oblique master del callejón: asfalto, paredes y cables convergen.
- 13 close del sello con solo `ZONA SEGURA`.
- 14 dedos casi tocan concreto helado bajo el sello.
- 15 recuerdo sepia de Muyeol ignorado por Guardianes.
- 16 Ijun levanta el sello con el raspador.
- 17 macro del filamento descubierto.
- 18 vidrio enganchado en el guante; raspador fuera.
- 19 Ma compara tableta y cicatriz en plano medio.
- 20 white inset: el escaneo muestra muro estable mientras su mano toca la línea.
- 21 cicatriz late y activa segmentos carmesí.
- 22 calle imposible dentro de la grieta.
- 23 Ma completa comienza a deslizarse sobre asfalto mojado.
- 24 Ma se aferra a cinta y bolardo; sombra cae por la calle imposible.
- 25 low side full: Ijun corre pero vuelve a la misma marca del asfalto.
- 26 reacción con 55–70% de vacío orientado hacia la cicatriz.
- 27 top-down: escarcha evita la abertura central.
- 28 hielo y línea negra rodean la cicatriz completa por muro y suelo.
- 29 POV: marcas oficiales están sobre daño superficial; el borde vivo queda aparte.
- 30 narrative_card `ERA LA FRACTURA.`
- 31 close de acción: raspador presiona filamento bajo el sello.
- 32 impact panel del metal.
- 33 medium profile: reflejos cercanos se apagan; luces lejanas siguen vivas.
- 34 Sutura Negra contra Fractura, cuerpo y costo visibles.
- 35 Ma cae hacia Ijun mientras la calle imposible se pliega.
- 36 wide silencioso: muro mojado dominante, ambos pequeños en el asfalto.
- 37 white inset: una muñeca agrietada, sin herramienta.
- 38 device shot: radio en mano temblorosa de Ma.
- 39 Yoon en centro de mando recibe firma negra sobre azul cobalto.
- 40 dron desciende entre lluvia, cables y luces hacia figuras pequeñas.
- 41 POV del dron a 35 grados: Ijun aislado por cono azul.
- 42 OTS de Yoon: monitor con Ijun y solo `KANG IJUN`.
- 43 medium-wide low-oblique: Ijun identificado frente al muro sellado.
