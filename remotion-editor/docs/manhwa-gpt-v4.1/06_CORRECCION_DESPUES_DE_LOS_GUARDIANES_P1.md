# Corrección de Después de los Guardianes — Parte 1

Usa este documento después de instalar V4.1 en el GPT.

Adjunta:

- la biblia aprobada
- el monólogo aprobado
- despues_de_los_guardianes_parte_01_la_firma_del_villano.json

No adjuntes las guías V3.2.

## Mensaje 1 — Shot plan corregido

Copia y envía:

---

FASE 4A — REPLANIFICACIÓN VISUAL DEL JSON ADJUNTO.

El concepto, la biblia, las revelaciones y las 450 palabras habladas están APROBADOS Y BLOQUEADOS. No reescribas, resumas ni parafrasees la narración. Los únicos cambios de voz autorizados son tags y estructura TTS.

No generes todavía el JSON corregido ni los image_prompts finales.

Entrega exclusivamente:

1. Assets que se conservan, eliminan o añaden.
2. Escalera de estados de Ijun.
3. Mapa de views definidas por cámara real.
4. Eje espacial y mapa de luz.
5. Shot plan con una fila por scene_id:
   micro-beat · función · sujeto · plano · ángulo · dirección de pantalla y mirada · view compatible o sin plate · referencias · estado · tratamiento visual · luz.
6. Lista de cambios de TTS, movimiento y transición.

Decisiones obligatorias:

VOZ

- No hay sistema: mode single.
- Eliminar dialogue, voices y speaker.
- Conservar la voz aprobada en pipeline.tts.voice_id; tts_export no lleva voice_id.
- Mantener eleven_v3, voice_settings.speed 1.0 y edit_speed 1.4.
- Reemplazar los tags humanos incorrectos:
  - scene_01: dark
  - scene_05: low
  - scene_43: flat
- cold no aparece en ninguna línea humana.
- No cambiar palabras ni puntuación hablada.

ASSETS

- Conservar las bases técnicas de Ijun y Ma, reforzando full body from hair to soles, orthographic front eye-level y minimal foreshortening.
- Añadir kang_ijun/limpieza_guante_roto: mismo outfit de limpieza, solo guante derecho rasgado, sin grietas ni poder.
- Usar limpieza_guante_roto en scene_18, scene_31 y scene_33.
- Usar sutura_inicial desde scene_34.
- Posponer yoon_taegun/base y guardian porque Yoon no aparece físicamente.
- Usar sello_zona_segura/levantado en scene_16.
- Conservar el filamento negro como objeto recurrente durante su descubrimiento y uso.

ESCENARIOS Y VIEWS

- Las plates base contienen arquitectura, materiales y luz estable.
- Eliminar de las plates base agua, vidrio móvil, bolsas deslizándose, herramientas móviles y anomalía activa.
- Separar cámara de estado.
- Definir views por cámara, por ejemplo:
  - corridor_axis_eye
  - door_front_eye
  - threshold_floor_profile
  - threshold_overhead
  - corridor_left_oblique
  - ceiling_corner_high
- Si un panel pide una cámara incompatible, omitir la plate y anclar el pasillo en texto.

EJE

- Puerta y anomalía screen-right.
- Ijun screen-left o midground.
- Ma Sori entre Ijun y la puerta.
- Luz cotidiana: fluorescente verdosa desde arriba y frame-left.
- Anomalía: luz del pasillo doblándose hacia screen-right.
- Sutura: ausencia de luz; grietas blancas como único punto brillante.
- Final: luz azul-blanca del dron desde arriba.

REFERENCIAS

- Personas y criaturas en references.characters.
- Raspador, sello, filamento y dron en references.assets.
- Máximo tres en total.
- Una referencia debe ser compatible con el plano.
- El objeto recurrente tiene prioridad.
- Eliminar personas desenfocadas y entidades visuales no referenciadas.

SHOT PLAN

- scene_01 abre con evidencia física de que el poder sobrevivió: residuo negro absorbiendo luz sobre el raspador o el guante, sin mostrar ni inventar la apariencia del Orquestador.
- scene_02 muestra la transferencia al guante.
- scene_03 establece a Ijun como limpiador.
- scene_04 paga Las mías con cara y mano.
- scene_05 conserva la narrative_card.
- scene_06 marca el rewind y tendrá transition_in dip_black.
- scene_16 usa Ijun con guante roto, raspador y sello levantado.
- scene_21 traduce la puerta respirando a geometría literal.
- scene_22 es el master: puerta screen-right, Ma junto al marco, Ijun detrás a screen-left, bolsas en foreground, suelo compartido, puerta estándar de 2.1 metros, perspectiva 55–70 mm.
- scene_24 es high-oblique full shot; cuerpo completo de Ma, manos y botas sobre el mismo plano, sin close ni gran angular.
- scene_25 muestra ambos pies de Ijun deslizándose hasta la misma marca amarilla.
- scene_27 conserva un top-down útil sin forzar personajes gigantes.
- scene_30 es wide OTS de reanclaje desde detrás de Ijun.
- scene_33 elimina a Ma desenfocada y referencia el raspador.
- scene_35 muestra un instante: Ma cae hacia Ijun mientras el marco se comprime en una línea negra.
- scene_41 es POV del dron a 2.5 metros, treinta y cinco grados hacia abajo, sin retícula, UI ni Ma desenfocada.
- scene_43 muestra solamente Ijun, dron y pared posterior; elimina Ma y raspador.

PROMPTS

- Un instante fotografiable.
- Sujeto y acción primero.
- Plano y ángulo explícitos.
- Hora explícita.
- Dirección de mirada y pantalla.
- Fuente y dirección de luz.
- Geometría literal, sin like a chest, like paper o porcelain skin.
- Cero then entre acciones principales.
- Cero blurred people.
- Usa exclusivamente terminología Korean webtoon o Korean manhwa.
- Cero layout doble dentro de una sola imagen.

RITMO

- Conservar el título como card.
- Tratar scene_28 como body detail breve y scene_37 como white inset respirable.
- Tratar scene_32 como impacto, fuera del conteo de respiros.
- Usar Korean webtoon inset panel como única denominación del inset.
- No inventar panel_layout ni campos que Remotion aún no soporte.
- Reanclar la secuencia antes de otra racha de closes.

MOVIMIENTO

- Movimiento global leve.
- scene_13, scene_36 y scene_43 fijas.
- scene_32 puede usar punch_in o shake.
- scene_35 usa shake leve.
- Ningún movimiento recorta texto, mano, grieta o borde de inset.

Espera mi aprobación del shot plan.

---

## Mensaje 2 — Compilar el JSON

Después de aprobar el shot plan, copia y envía:

---

SHOT PLAN APROBADO.

Ejecuta ahora la Fase 4B y devuelve el JSON completo corregido.

Conserva exactamente las 450 palabras y su puntuación. Aplica únicamente los cambios de tags aprobados. Mantén las 43 escenas siempre que el shot plan no haya justificado una división; cualquier cambio de línea conserva todas las palabras.

Compila:

- assets y views aprobados
- referencias semánticamente correctas
- image_prompts finales
- editor_motion y transition_in
- TTS single
- full_script exacto

Después ejecuta la validación V4.1.

La entrega debe incluir:

1. JSON completo válido.
2. Resumen de tres a cinco líneas.
3. ASSETS NUEVOS.
4. Conteos:
   - escenas
   - panels
   - cards
   - palabras
   - caracteres con tags
   - referencias máximas
   - prompts sin plano
   - prompts sin ángulo
   - prompts sin hora
   - racha máxima sin reanclaje
   - tratamientos respirables con scene_id y clase

No declares validación si algún conteo no fue realizado.

---

## Gate posterior

No generes las 42 imágenes de inmediato.

Primero genera:

- todas las bases y estados
- scene_01
- scene_06
- scene_22
- scene_24
- scene_31
- scene_35
- scene_41
- scene_43

Revisa identidad, fondo, escala, cámara, manos, texto, continuidad y correspondencia con el prompt. Solo después produce el resto.
