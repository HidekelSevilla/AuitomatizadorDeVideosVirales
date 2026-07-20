# Changelog V5.3

## Ajuste operativo V5.3.7 — validador montado por conversación

- Knowledge se usa como referencia/retrieval y ya no se trata como un sistema de archivos ejecutable.
- `validate_v5_3.py` se guarda una vez en File Library y se adjunta a cada chat de Showrunner, Director o Auditor que deba validar.
- Cada rol lista `/mnt/data`, identifica los archivos por contenido y usa las rutas reales; desaparece la dependencia de `Pasted text.txt` o `FINAL.json`.
- `MANIFEST_V5_3.md` permanece en Knowledge como autoridad de versión/SHA; su falta en `/mnt/data` no bloquea si el contenido canónico se recupera sin conflicto.
- Validador ausente/no ejecutable produce `BLOCKED_INPUT`; versión, SHA o manifest contradictorios producen `BLOCKED_VALIDATOR`.
- Se eliminó `validate_v5_3.py` de las listas de Knowledge para evitar recuperar una copia obsoleta como si fuera la ejecutada.

## Validador 5.3.7 — fidelidad factual voz → imagen

- El Showrunner produce `MACHINE_LOCK_V5_3.voice_visual_lock` para cada átomo exacto del monólogo.
- Cada claim conserva actor, acción, receptor/target, fuente, dirección, resultado, participantes causales, tokens físicos y resolución de pronombres/elipsis.
- Cada panel copia esos claims en `continuity.voice_facts`, une `must_show` y respeta una política offscreen cerrada.
- El hook factual ya no puede sustituir muerte, elección, transferencia, rescate o ataque por reacción, rifles, aura, símbolo o consecuencia.
- Un personaje narrado obligatorio debe existir en `visible_entities`, performances, referencias y prompt con su firma visual completa.
- `environment` no puede apropiarse de una acción atribuida por la voz a un personaje; la dirección `source→receiver` es contractual.
- Objetos físicos sin ID propio se verifican mediante `required_visual_tokens` unidos al evento correcto.
- El Auditor reconstruye primero una matriz factual independiente y no confía en metadatos previos aunque sean coherentes entre sí.
- La P1 canónica corrige el hook: Kang Muyeol muerto frente a Seo y la transferencia inequívoca `Kang→Seo` son visualmente obligatorios.
- Suite canónica: `46/46 PASS`; `py_compile`: `PASS`; packet P1: `PACKET_READY`.

## Validador 5.3.6 — semántica visual y estilo de ingredientes

- La cadena `voiceover → atomic_action → visible_entities → references → prompt` es ahora un gate mecánico.
- Actor y target físicos registrados deben conservar identidad completa; una manga, parte corporal, efecto u otro actor no los sustituyen.
- El verbo y los objetos físicos de `atomic_action` necesitan evidencia visible en el prompt.
- Pluralidad, formación espacial y armas/dispositivos reales ya no pasan con un actor singular o una pose `as if`.
- Toda view `generate` se utiliza; TRUE_LONG/WIDE_MASTER reanclan con plate cuando existe cupo de referencias.
- Toda pose derivada `generate` tiene consumidor real o se elimina.
- Reparaciones acotadas exigen snapshot, diff y reauditoría de escenas vecinas para impedir regresiones laterales.
- Cada base, pose, criatura, prop, contenedor, UI y view `generate` incluye ancla Korean manhwa/webtoon 2D tipada en su propio prompt.
- Fondo gris e iluminación uniforme siguen siendo requisitos técnicos de assets, pero ya no se confunden con estilo artístico.
- Se añadieron regresiones automáticas para target ausente, fuente oculta, contenedor ambiguo, props simulados, views sin uso y estilo faltante.
- Suite canónica ampliada a `40/40 PASS`.

## Validador 5.3.4 — segmentabilidad antes del Director

- El Showrunner ejecuta `validate_v5_3.py --packet-only STORY_PACKET.md` antes del handoff.
- `MONOLOGO_LOCKED` usa átomos separados por `\n\n`; cada átomo hablado debe caber completo en al menos una ventana contractual.
- El gate rechaza LF internos, separadores distintos de `\n\n`, espacios finales y controles solo-tag con más de un tag.
- El manifest rechaza IDs superiores de asset o escenario duplicados; sus poses/views deben agruparse en una entrada.
- Un control solo-tag autorizado puede existir, pero Director y Auditor deben absorberlo con una ventana hablada.
- `PACKET_READY` exige estructura, hash, spans, voz, estados, tags y segmentabilidad válidos.
- Director y Auditor preservan byte por byte los separadores; nunca recortan `voiceover.text` con `.strip()`.
- La P1 fue corregida sin cambiar palabras: el bloque de 18 palabras quedó en dos átomos de 11 y 7.

## Problema corregido

V5.2 permitía aprobar un porcentaje de “respiros” mezclando cards, devices, body details, ambiente, negativos y composites. También limitaba blancos a tres. Eso produjo cumplimiento numérico sin verdadera página webtoon, y dejó pasar planos lejanos nominales, aproximaciones ausentes y continuidad débil.

## Solución

- Cuatro ejes independientes: layout, escala, actuación y fase de acción.
- Cuotas escaladas y distribuidas para blancos, cards, fragmentos, reacciones, TRUE_LONG, approach y TALL_ACTION.
- 32–40% de puntuaciones únicas, sin permitir que esa unión sustituya mínimos de familia.
- Tres o más familias blancas y varios layouts; sin cap artificial.
- Black text cards confiables mediante editor, no lettering largo generado.
- Ledger `before → action → after` y locks de dueño/ocupación/localización.
- Prompt con identidad visible; el nombre del asset nunca basta.
- Bases limpias y neutras; performance poses con silueta/emoción compatible.
- Validador único V5.3 que rechaza el falso cumplimiento de V5.2.
- Separación estricta de autoridad entre Showrunner, Director y Auditor.
- `production_lock` compara hash, monólogo y voz contra el Story Packet adjunto.
- `visual_plan` y `continuity` son datos contractuales por panel, no palabras clave ocultas en el prompt.
- Mínimos y máximos HARD, 1–2 BLACK_INSET y distribución inicio/medio/final.
- Rampas y secuencias major se validan por pasos ordenados; assets y TTS fallan cerrado si faltan campos.
