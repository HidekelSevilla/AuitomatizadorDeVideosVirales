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
  }
}
```

`target_runtime_seconds` es el objetivo elegido y queda dentro de `runtime_range_seconds: [mínimo,máximo]`; el rango mide como máximo 20 s. `beat_order` contiene 8–14 IDs únicos en orden. `location_ids` son IDs puros y `beat_locations` cubre exactamente cada beat. `state_contract` usa claves planas para ubicación, vida/herida, dueño del poder/marca, amenaza/luz, props y ocupantes críticos; cada valor contiene `initial` y `changes[{beat_id,to,caused_by}]`. Los estados son escalares JSON; solo claves terminadas en `.occupants` admiten listas únicas de IDs. El hash usa el contenido exacto de `MONOLOGO_LOCKED`, UTF-8, LF y sin delimitadores externos.

Si hay dialogue, el mismo MACHINE_LOCK añade `"approved_voices": {"narrador":"ID", "sistema":"ID"}` y debe coincidir exactamente con TTS. En single se omite.

```yaml
HANDOFF_NARRATIVO_V5_3:
  handoff_version: "5.3"

  COLD_VIEWER_CONTRACT:
    hook_promise:
    role_known_by_beat:
    immediate_goal_known_by_beat:
    danger_known_by_beat:
    rule_known_by_beat:
    emotional_reason_known_by_beat:
    irreversible_change_known_by_beat:
    terms_first_quarter: []
    assumed_prior_knowledge: none
    deliberately_unanswered: []

  CONTINUITY_LEDGER:
    entities:
      <entity_id>:
        visual_signature:
        initial_location:
        initial_condition:
        owns_or_carries: []
        state_changes:
          - beat_id:
            from:
            to:
            caused_by:
    containers:
      <container_id>:
        location_id:
        initial_state:
        initial_occupants: []
        occupancy_changes:
          - beat_id:
            action:
            occupants_after: []
    powers_and_marks:
      <effect_id>:
        owner:
        first_appears_after_beat:
        visible_state_before:
        visible_state_after:
        forbidden_on_entities: []

  STORY_BEATS:
    - beat_id: B01
      narrative_function:
      monologue_span_exact: |
        <tramo literal y continuo>
      cold_viewer_info:
        new_fact:
        visible_proof:
        must_not_assume:
      location_id:
      present_entities: []
      spatial_truth:
        <entity_id>:
          position_relation:
          inside_container:
          contact_with:
      before_state:
        <entity_id>:
          condition:
          action_status:
      atomic_actions:
        - actor:
          verb:
          target:
          origin:
          trajectory_or_contact:
          destination:
          result:
      after_state:
        <entity_id>:
          condition:
          location:
          owns_or_carries: []
      emotional_contract:
        emotional_trigger:
        emotional_subject:
        required_visible_reaction:
        forbidden_neutral_reaction:
      forbidden_implications: []
      causal_link_next:

  REVEAL_LOCKS:
    revealed_this_part: []
    suspected_only: []
    forbidden_to_confirm: []

  DIRECTOR_BOUNDARY:
    immutable:
      - canon
      - MONOLOGO_LOCKED
      - beat_order
      - entity_identity
      - location_and_container_occupancy
      - before_action_after_states
      - reveal_locks
    director_may_choose:
      - scene_count
      - camera
      - page_layout
      - visual_punctuation
      - prompt_wording
      - asset_and_reference_strategy
    director_must_not_imply: []
```

## Reglas mecánicas

- `STORY_BEATS` tiene 8–14 elementos.
- Cada `monologue_span_exact` es un tramo continuo y literal.
- La concatenación ordenada reconstruye `MONOLOGO_LOCKED`; la card de título se identifica, no se pierde.
- `before_state → atomic_actions → after_state` no contiene saltos sin causa.
- cada acción atómica conserva por separado actor, verbo, objetivo, origen, trayectoria/contacto, destino y resultado; una frase-resumen no cumple
- `forbidden_implications` incluye estados futuros, rescates prematuros, amenaza ya anulada, dueño incorrecto de poder/herida, ocupante equivocado, cambio de escenario, simultaneidad falsa o reacción inversa cuando aplique.
- El Showrunner no prescribe plano, ángulo, layout, prompt, pose ni cuota visual.
