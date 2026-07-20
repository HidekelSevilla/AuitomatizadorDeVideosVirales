# Conocimiento canónico del Showrunner Manhwa V6

## Frontera de rol

El Showrunner entrega `STORY_PACKET_V6.md`. No entrega JSON runtime, prompts, cámara, poses de asset, views, layouts ni rutas. Su única aportación visual son obligaciones narrativas observables: qué hecho debe verse, no cómo filmarlo.

## Encabezado obligatorio

```yaml
STORY_PACKET_V6:
  handoff_version: "6.0"
  packet_status: PACKET_READY_V6
  packet_scope: PRODUCTION_PART
  series_id: slug_estable
  part_number: 1
  approved_voice_id: voz_real
  language: es-MX
  target_runtime_seconds: 95
  runtime_range_seconds: [90, 100]
```

`PRODUCTION_PART` es una Parte real. `PILOT_FRAGMENT` solo se usa cuando el usuario pide explícitamente una prueba. `VALIDATOR_FIXTURE` nunca es salida de producción.

## Narrative DNA comercial

Debe declarar valores específicos y no vacíos:

```yaml
narrative_dna:
  logline: ""
  contradiction: ""
  desire: ""
  wound_or_lie: ""
  transformation_from: ""
  transformation_to: ""
  advantage_rule: ""
  cost_or_constraint: ""
  antagonist_agency: ""
  serial_arena: ""
  pleasure_primary: ""
  pleasure_secondary: ""
  voice_signature: ""
  signature_symbol: ""
  serial_question: ""
  anti_clone_test: ""
  anti_clone_distinct_axes: [role, desire, rule, cost, arena, symbol]
  primary_promise_id: PROMISE_P1_MAIN
```

Una premisa profesional combina deseo humano, contradicción, ventaja deseable, costo que cierre opciones, antagonista con agencia y arena que pueda producir nuevas Partes. El anti-clon exige al menos cuatro diferencias materiales; cambiar nombres, color o país no cuenta.

## Beats causales

Cada beat declara función, átomos, pregunta/answer, estado antes/después, puente causal, eje de escalada, presión 0–4, cambio de valor, promesas/deudas, timeline y snapshot.

```yaml
- beat_id: B04
  function: [DECISION]
  atom_ids: [A017, A018]
  question_opened: "¿cruzará el límite?"
  answer_paid: "la amenaza alcanza a otra persona"
  state_before: {}
  state_after: {}
  causal_bridge: "el peligro obliga la decisión"
  escalation_axis: "riesgo personal"
  pressure_level: 3
  value_shift: "protegido->expuesto"
  promise_ids_opened: []
  promise_ids_paid: [PROMISE_P1_MAIN]
  dramatic_debts_opened: [DEBT_AUTHORITY_NOTICE]
  dramatic_debts_paid: []
  timeline_id: PRESENT_MAIN
  chronological_event_id: EVT_004
  narrative_order: 4
  state_snapshot_ref: STATE_AFTER_EVT_003
  replay_of_event_id: null
```

En producción aparecen `HOOK`, `DETONATOR`, `THREAT`, `DECISION`, `PAYOFF`, `COST` y `CLIFFHANGER`. Si la premisa promete poder/ventaja observable, incluye `MANIFESTATION`; otros géneros usan un equivalente táctico, social, relacional o de conocimiento. El hook abre la promesa principal y el payoff la paga. El costo debe persistir o cerrar una opción real.

## Monólogo y lock de máquina

`MONOLOGO_LOCKED` es inmutable al aprobar. Un átomo hablado ocupa una línea y tiene 2–16 palabras. Se divide cuando cambia actor, acción causal, target, tiempo o resultado.

Cada átomo tiene una entrada `voice_visual_lock`:

```json
{
  "atom_id": "A017",
  "text_exact": "La columna empezó a caer.",
  "kind": "EVENT",
  "claims": [{
    "actor_id": "environment",
    "action": "drops damaged column",
    "receiver_or_target_id": "rescue_zone",
    "source_id": "damaged_column",
    "direction": "above->rescue_zone",
    "result": "the column visibly descends",
    "causal_participants": [],
    "required_visual_tokens": ["damaged column visibly falling", "concrete dust"],
    "resolved_from_atom_id": null
  }],
  "must_show": [],
  "offscreen_policy": {"mode": "FORBIDDEN", "allowed_ids": [], "reason": "literal event"}
}
```

Pronombres y sujetos tácitos se resuelven. Plurales conservan cardinalidad. Un evento físico narrado no puede pagarse solo con reacción. Offscreen se permite únicamente cuando la ausencia es filmable y está autorizada.

### Hash canónico

Toma solo el payload exacto de `MONOLOGO_LOCKED`, normaliza Unicode NFC, CRLF/CR a LF, elimina un único LF final, codifica UTF-8 y calcula SHA-256 lowercase. No uses `.strip()`.

## Visual obligations sin cámara

```yaml
obligation_id: VO_B07_01
beat_id: B07
atom_ids: [A029, A030]
must_show: [kang_muyeol, seo_jun]
required_relationship: la mano rota de Kang toca el pecho de Seo y la corriente nace en Kang
information_priority: ACT
density: HIGH
must_be_own_source: true
may_share_page: false
continuity_changes:
  - seo_jun.power: absent -> inherited
prohibited_substitution:
  - aura ambiental sin fuente
  - solo reacción de Seo
```

Prioridades: `ORIENT`, `DISCOVER`, `DECIDE`, `ACT`, `IMPACT`, `REACT`, `CONSEQUENCE`, `BREATHE`. Densidad `LOW`, `MEDIUM`, `HIGH`.

Una obligación prueba actor, acción, target, contacto/dirección/distancia/límite, estado antes/después y sustituciones insuficientes. `must_be_own_source:true` para contacto, decisión irreversible, revelación, cambio de estado o geografía compleja. `may_share_page:true` permite compartir página, no mezclar instantes en una imagen.

Prohibido en obligaciones: close-up, low angle, lente, panel A/B, layout, fondo blanco, color decorativo o prompt inglés.

## Continuidad

Por entidad recurrente registra firma visual, vestuario, heridas, poder, marcas, props/dueño/estado, lugar, contacto, luz/hora/clima y causa autorizada de cada cambio.

Incluye:

```yaml
narrative_state:
  belief_state: ""
  relationship_states: {}
  knowledge_by_actor: {}
  antagonist_knowledge: ""
  accumulated_cost: ""
  open_promises_and_debts: []
```

P2+ inicia exactamente desde el último estado aprobado y cobra una consecuencia del cliffhanger anterior dentro del primer 15%.

## Scorecard y gate

Puntúa 0–2 con evidencia localizada:

1. hook/curiosidad;
2. claridad causal;
3. motor humano/arco;
4. singularidad/anti-clon;
5. escalada;
6. payoff/promesa;
7. costo/consecuencia;
8. cliffhanger/serialidad.

Producción exige total ≥13/16 y ningún cero. El score no sustituye evidencia en monólogo/beats/ledger.

## Orden de entrega

1. `META`/encabezado;
2. `MACHINE_LOCK_V6`;
3. `PREMISA_COMERCIAL`;
4. `CANON_NECESARIO`;
5. `STORY_BEATS`;
6. `visual_obligations`;
7. `CONTINUITY_LEDGER`;
8. `MONOLOGO_LOCKED`;
9. `QA_SHOWRUNNER`.

Solo `validate_v6.py --packet-only` con exit 0 permite `PACKET_READY_V6`.
