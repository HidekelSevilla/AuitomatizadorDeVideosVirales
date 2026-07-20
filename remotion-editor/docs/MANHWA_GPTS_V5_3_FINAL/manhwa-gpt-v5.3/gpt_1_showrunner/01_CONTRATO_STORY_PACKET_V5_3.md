# Contrato de handoff narrativo V5.3

V5.3 conserva todos los bloques de `STORY_PACKET_V5` y añade los siguientes. Un paquete previo se marca `LEGACY_V5` y vuelve al Showrunner para migración; el Director solo recibe el handoff completo.

Orden obligatorio de headings:

1. `META`
2. `MACHINE_LOCK_V5_3`
3. `PREMISA COMERCIAL`
4. `CANON NECESARIO`
5. `PRESUPUESTO DE REVELACIONES`
6. `CONTRATO DE LA PARTE`
7. `DIRECCION VISUAL SEMILLA`
8. `FIRMAS VISUALES Y ROLES`
9. `MAPA DE INTERPRETACION Y CONTINUIDAD`
10. `MONOLOGO_LOCKED`
11. `HANDOFF_NARRATIVO_V5_3`
12. `QA_SHOWRUNNER`

En `META` son obligatorios `handoff_version: "5.3"`, `packet_id` único (`serie_parte_NN_v5_3`) y `approved_voice_id`. El ID aprobado por defecto de este preset es `452WrNT9o8dphaYW5YGU`; no se inventan variantes. Si el guion requiere segunda voz, `approved_voices` mapea cada speaker a un ID aprobado; sin mapping se bloquea el modo dialogue.

Inmediatamente después de META escribe un bloque parseable, no una paráfrasis:

## MACHINE_LOCK_V5_3

```json
{
  "handoff_version": "5.3",
  "packet_id": "serie_parte_01_v5_3",
  "approved_voice_id": "452WrNT9o8dphaYW5YGU",
  "target_runtime_seconds": 97,
  "runtime_range_seconds": [90, 100],
  "monologue_sha256": "SHA256_UTF8_DEL_BLOQUE_MONOLOGO_LOCKED",
  "monologue_hash_basis": "UTF-8 bytes of the exact text between MONOLOGO_LOCKED and HANDOFF_NARRATIVO_V5_3, excluding the two framing line breaks and preserving LF inside the text",
  "beat_order": ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08"],
  "location_ids": ["hook_retrospective", "location_main"],
  "beat_locations": {"B01": "hook_retrospective", "B02": "location_main", "B03": "location_main", "B04": "location_main", "B05": "location_main", "B06": "location_main", "B07": "location_main", "B08": "location_main"},
  "state_contract": {
    "protagonista.power": {
      "initial": "none",
      "changes": [{"beat_id": "B07", "to": "inherited", "caused_by": "transfer_contact"}]
    }
  },
  "voice_visual_lock": [
    {
      "atom_id": "A001",
      "text_exact": "El fugitivo cayó frente a mí.",
      "kind": "EVENT",
      "claims": [{
        "actor_id": "fugitivo",
        "action": "falls",
        "receiver_or_target_id": "protagonista",
        "source_id": "fugitivo",
        "direction": "fugitivo->protagonista",
        "result": "protagonista presencia la caída",
        "causal_participants": ["fugitivo", "protagonista"],
        "resolved_from_atom_id": null,
        "required_visual_tokens": ["falling body", "visible witness"]
      }],
      "must_show": ["fugitivo", "protagonista"],
      "offscreen_policy": {"mode": "FORBIDDEN", "allowed_ids": [], "reason": "hecho concreto presenciado"}
    },
    {
      "atom_id": "A002",
      "text_exact": "Antes me entregó su poder.",
      "kind": "EVENT",
      "claims": [{
        "actor_id": "fugitivo",
        "action": "transfers",
        "receiver_or_target_id": "protagonista",
        "source_id": "fugitivo",
        "direction": "fugitivo->protagonista",
        "result": "el poder entra en el protagonista",
        "causal_participants": ["fugitivo", "protagonista"],
        "resolved_from_atom_id": "A001",
        "required_visual_tokens": ["physical contact", "energy entering receiver"]
      }],
      "must_show": ["fugitivo", "protagonista"],
      "offscreen_policy": {"mode": "FORBIDDEN", "allowed_ids": [], "reason": "la fuente debe ser inequívoca"}
    }
  ]
}
```

`target_runtime_seconds` es el objetivo editorial y queda dentro de `runtime_range_seconds: [mínimo,máximo]`; el default general es 95/[90,100], el ejemplo usa 97/[90,100] y el ancho máximo es 20 s. El rango bloqueado define el PASS mecánico; la desviación respecto al target se reporta como dato editorial. Nunca uses `[80,105]` como rango completo. `beat_order` contiene 8–14 IDs únicos en orden. `location_ids` son IDs puros y `beat_locations` cubre exactamente cada beat. `state_contract` usa claves planas para ubicación, vida/herida, dueño del poder/marca, amenaza/luz, props y ocupantes críticos; cada valor contiene `initial` y `changes[{beat_id,to,caused_by}]`. Los estados son escalares JSON; solo claves terminadas en `.occupants` admiten listas únicas de IDs. El hash usa el contenido exacto de `MONOLOGO_LOCKED`, UTF-8, LF y sin delimitadores externos.

`voice_visual_lock` cubre todos los átomos en orden `A001…` y es soberano sobre cualquier interpretación posterior. `text_exact` coincide byte por byte con el átomo, incluidos tags. `kind` es `EVENT`, `STATE`, `EXPOSITION`, `CARD` o `CONTROL`. Cada claim conserva actor, acción, receptor/objetivo, fuente, dirección, resultado, participantes causales, `required_visual_tokens` para objetos/estados físicos sin ID y el átomo del que resolvió un pronombre o sujeto omitido; usa `null` si no hereda. `must_show` contiene la unión de IDs físicos indispensables. `CARD` y `CONTROL` pueden llevar claims/must_show vacíos; los demás no.

`offscreen_policy.mode` es `FORBIDDEN` o `ALLOWED_FILMABLE`. Solo permite offscreen cuando `allowed_ids` y `reason` explican una evidencia filmable inequívoca dentro del panel; no sirve para ahorrar referencias. Un evento concreto presenciado, contacto, transferencia, ataque, rescate, muerte o revelación del hook usa `FORBIDDEN`: no puede sustituirse por rostro reaccionando, amenaza futura, símbolo, consecuencia o efecto sin fuente. Nombres, apodos y pronombres se resuelven a IDs canónicos de `FIRMAS VISUALES Y ROLES`.

Si hay dialogue, el mismo MACHINE_LOCK añade `"approved_voices": {"narrador":"ID", "sistema":"ID"}` y debe coincidir exactamente con TTS. En single se omite.

## Preflight de segmentabilidad narrativa

`MONOLOGO_LOCKED` se termina **antes** de calcular su SHA. Su unidad mínima es el átomo de entrega: un párrafo formado por una sola línea no vacía. Entre átomos existe exactamente `\n\n` (un LF vacío); no hay hard-wrap ni espacios al final.

- Retira tags para contar: cada átomo hablado contiene 2–16 palabras y dura ≤5 s a 150 WPM × `edit_speed:1.4`.
- Un átomo solo-tag se admite únicamente si contiene un tag autorizado por el preset; el Director lo absorberá con un átomo vecino y nunca creará una escena de cero palabras. Título y candidatos de card tienen 2–7 palabras.
- Deben existir el título y al menos otro remate autónomo de 2–7 palabras, sin obligar al Director a elegir su layout.
- `STORY_BEATS.monologue_span_exact` empieza y termina en límites de átomo. Los spans ordenados, con sus separadores literales, reconstruyen byte por byte `MONOLOGO_LOCKED`.

Esto es un preflight oral/caption, no storyboard: no asigna plano, ángulo, layout, pose ni fase visual. Tras guardar el packet real, ejecuta `python /mnt/data/validate_v5_3.py --packet-only "/mnt/data/NOMBRE_PACKET.md"`. Solo exit code 0 y `preflight_status: PACKET_READY` permiten el handoff. El gate se llama `story_packet_segmentability`; bloquea CR/CRLF, hard-wraps, separadores distintos de `\n\n`, espacios finales, controles solo-tag múltiples, átomos hablados >16, tags desconocidos o ausencia de átomos hablados. `QA_SHOWRUNNER` reporta átomos, máximo hablado, comando, exit code y estado real. Si se mueve un salto, vuelve a calcular hash, spans, caracteres y QA.

Escribe el handoff como **headings Markdown reales**, nunca dentro de un fence YAML. Usa exactamente este orden y no dejes ninguna subsección vacía:

## HANDOFF_NARRATIVO_V5_3

- handoff_version: "5.3"

### COLD_VIEWER_CONTRACT

- hook_promise:
- role_known_by_beat:
- immediate_goal_known_by_beat:
- danger_known_by_beat:
- rule_known_by_beat:
- emotional_reason_known_by_beat:
- irreversible_change_known_by_beat:
- terms_first_quarter: []
- assumed_prior_knowledge: none
- deliberately_unanswered: []

### CONTINUITY_LEDGER

- entities: por cada `<entity_id>`, declara `visual_signature`, `initial_location`, `initial_condition` y `owns_or_carries`.
- state_changes: dentro de cada entidad, lista `{beat_id,from,to,caused_by}`.
- containers: por cada `<container_id>`, declara `location_id`, `initial_state`, `initial_occupants` y `occupancy_changes[{beat_id,action,occupants_after}]`.
- powers_and_marks: por cada `<effect_id>`, declara `owner`, `first_appears_after_beat`, `visible_state_before`, `visible_state_after` y `forbidden_on_entities`.

### STORY_BEATS

#### B01 — <función breve>

- beat_id: B01
- narrative_function:
- monologue_span_exact: tramo literal y continuo.
- cold_viewer_info: `new_fact`, `visible_proof`, `must_not_assume`.
- location_id:
- present_entities: []
- spatial_truth: por entidad, `position_relation`, `inside_container`, `contact_with`.
- before_state: por entidad, `condition`, `action_status`.
- atomic_actions: cada una con `actor`, `verb`, `target`, `origin`, `trajectory_or_contact`, `destination`, `result`.
- after_state: por entidad, `condition`, `location`, `owns_or_carries`.
- emotional_contract: `emotional_trigger`, `emotional_subject`, `required_visible_reaction`, `forbidden_neutral_reaction`.
- forbidden_implications: []
- causal_link_next:

Repite un heading `#### BNN` por cada ID de `beat_order`.

### REVEAL_LOCKS

- revealed_this_part: []
- suspected_only: []
- forbidden_to_confirm: []

### DIRECTOR_BOUNDARY

- immutable: canon, `MONOLOGO_LOCKED`, beat_order, identidad, ocupación, estados y reveal locks.
- director_may_choose: scene_count, agrupación de átomos contiguos, cámara, layout, puntuación visual y estrategia de assets/refs.
- director_must_not_imply: []

## Reglas mecánicas

- `STORY_BEATS` tiene 8–14 elementos.
- Cada `monologue_span_exact` es un tramo continuo y literal.
- La concatenación ordenada reconstruye `MONOLOGO_LOCKED`; la card de título se identifica, no se pierde.
- Cada átomo cumple el preflight anterior; un átomo hablado de 17+ palabras o un tag desconocido invalida el handoff aunque el resto del canon pase.
- `before_state → atomic_actions → after_state` no contiene saltos sin causa.
- cada acción atómica conserva por separado actor, verbo, objetivo, origen, trayectoria/contacto, destino y resultado; una frase-resumen no cumple
- `voice_visual_lock` cubre cada átomo exacto; claims, correferencias y `must_show` no contradicen voz, `visible_proof`, entidades presentes ni acciones atómicas
- un hook factual representa el acontecimiento narrado; reacción, tema, amenaza o consecuencia no pagan actor/receptor/fuente ausentes
- `forbidden_implications` incluye estados futuros, rescates prematuros, amenaza ya anulada, dueño incorrecto de poder/herida, ocupante equivocado, cambio de escenario, simultaneidad falsa o reacción inversa cuando aplique.
- El Showrunner no prescribe plano, ángulo, layout, prompt, pose ni cuota visual.
