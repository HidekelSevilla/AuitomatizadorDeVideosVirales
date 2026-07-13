# Contrato de traspaso STORY_PACKET_V5

El Showrunner entrega un único Markdown autosuficiente. El Director y el Auditor no necesitan el chat anterior.

## Estructura exacta

```markdown
# STORY_PACKET_V5

## META
- series_title:
- series_id:
- part:
- language: es-419
- target_words:
- market_profile:
- energy_profile:
- speech_register:
- technical_density:
- voice_mode:
- hook_type:

## PREMISA COMERCIAL
- venta:
- contradiccion:
- deseo_humano:
- herida_emocional:
- ventaja:
- precio:
- transformacion_prometida:
- arena_serial:
- loop_de_placer:
- pregunta_serial:

## CANON NECESARIO
- mundo:
- reglas:
- poder_y_progresion:
- costo:
- instituciones:
- personajes:
- relaciones:
- escenarios_recurrentes:
- props_recurrentes:
- vestuario:
- efectos_y_colores:
- simbolo_visual:

## PRESUPUESTO DE REVELACIONES
- verdad_interna:
- sabe_protagonista:
- sabe_publico:
- sospecha_espectador:
- reservado:

## CONTRATO DE LA PARTE
- objetivo_inmediato:
- amenaza:
- reloj_o_presion:
- regla_visible:
- decision_emocional:
- mini_victoria:
- reaccion_externa:
- costo_pagado:
- cambio_irreversible:
- cliffhanger:
- continuidad_temporal:

## DIRECCION VISUAL SEMILLA
- hora:
- escenario_principal:
- eje_general:
- paleta_calma:
- paleta_amenaza:
- paleta_poder:
- paleta_consecuencia:
- cinco_anclas_sugeridas:

## FIRMAS VISUALES Y ROLES
- firmas_personajes: [id: rol, edad, cabello/silueta, outfit/color, rasgo distintivo]
- separacion_de_similares: [quienes podrían confundirse y cómo distinguirlos]
- ocupacion_contenedores: [quién está dentro/fuera de vehículo, cápsula, habitación u otro límite]

## MAPA DE INTERPRETACION Y CONTINUIDAD
- mapa_emocional: [beat: personaje, emoción observable, rostro/cuerpo]
- cadena_espacial: [beat: posiciones relativas y eje]
- cadena_estados_amenaza: [aparición → preparación → ataque/cambio → impacto → consecuencia]
- reacciones_obligatorias: [detonante, peligro, manifestación, costo]

## MONOLOGO_LOCKED
[texto completo exacto]

## QA_SHOWRUNNER
- premise_score:
- hook_score:
- cold_listener:
- word_count:
- character_count:
- technical_terms_new:
- commercial_payoff:
- production_clarity: PASS
- performance_map: PASS
- causal_coincidences: 0
- audio_tags: [lista]
- status: PASS
```

## Reglas

- El monólogo bloqueado no se parafrasea en etapas posteriores.
- El paquete contiene solo canon útil para producir la parte y continuar la serie.
- `status: PASS` exige gates ejecutados, no opinión general.
- Si falta una decisión visual no narrativa, el Director puede elegirla sin alterar canon.
- Si falta o contradice una regla narrativa, el Director devuelve `BLOCKED_CANON`; no inventa.
- Los assets son candidatos hasta que el Director define sus estados y rutas.
- Las firmas visuales se escriben como rasgos visibles; un nombre no enseña al generador quién es quién.
- La cadena espacial manda en interacciones críticas. Nadie cambia de dentro a fuera o de lado de eje sin un beat visible.
- El mapa emocional guía actuación, no obliga a repetir el mismo encuadre.
