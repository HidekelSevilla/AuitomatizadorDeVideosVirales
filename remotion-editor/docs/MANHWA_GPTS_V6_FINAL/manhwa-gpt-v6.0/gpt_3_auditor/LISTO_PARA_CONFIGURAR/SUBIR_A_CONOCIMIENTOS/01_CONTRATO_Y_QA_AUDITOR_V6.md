# Contrato y QA canónicos del Auditor Manhwa V6

## Jerarquía de verdad

1. Story Packet: `MONOLOGO_LOCKED`, canon, claims, estados y voz.
2. Contrato runtime V2.8: claves que consume la aplicación.
3. Metadata V6: obligaciones, cámara, páginas, referencias tipadas y continuidad.
4. Procedencia: qué prompt/referencias/modelo produjeron cada archivo.
5. Píxeles: prueba final de composición, cámara, identidad, emoción y acción.

Una capa posterior no repara silenciosamente una anterior. Metadata V6 válida no compensa un runtime roto; un prompt correcto no compensa una imagen incorrecta.

## Gate de estructura runtime

Raíz esperada:

```text
project, pipeline, characters, ingredients, escenarios, scenes,
editing, tts_export, v6_contract, production_lock, obligation_map
```

HARD:

- `characters` es objeto; cada personaje recurrente tiene `poses` no vacío;
- cada pose generada tiene `mode`, `asset`, `prompt` y `reference_pose` si deriva;
- `ingredients` es arreglo de tipos runtime; nunca objeto;
- `escenarios` es objeto; cada escenario recurrente tiene `views` no vacío o base existente explícita;
- cada view generada tiene `mode`, `asset`, `prompt` y `reference_view` si deriva;
- cada panel contiene `render_mode`, `references`, `visual.image_prompt`, `voiceover.speaker/text`;
- cada panel y cada slot contiene al menos una referencia runtime resoluble;
- `references_v6` nunca sustituye `references`;
- voz aprobada en `tts_export.voices.narrador` o `pipeline.tts.voice_id`;
- `tts_export.dialogue` cubre escenas y `tts_export.full_script` es el guion completo exacto;
- `full_script` solo en raíz y `tts_export.voice_id` suelto son FAIL;
- `visual.image_prompt` con `Page summary`, nota o placeholder es FAIL.

Ejemplo de referencia ejecutable:

```json
{
  "references": {
    "characters": [{"id": "iseok", "pose": "resolve_action"}],
    "ingredients": [{"ingredient_id": "palm_mouth_open"}],
    "escenario": {"id": "morgue_cleanup_room", "view": "floor_low_profile"},
    "assets": []
  }
}
```

Todo ID/pose/view/ingrediente existe y resuelve a un archivo/generación. SFX o abstracción usa `entity`, `style_frame` o asset explícito, no `references:{}`.

## Gate de suficiencia de recursos

Recalcula lo que la historia necesita:

- protagonista recurrente: base + ≥4 variantes usadas de orientación/emoción/acción/estado;
- secundario recurrente: base + ≥2 variantes usadas;
- estado persistente de herida, ropa, poder o transformación tiene variante desde su causa;
- emoción decisiva tiene pose/referencia compatible y actuación concreta en prompt;
- ubicación principal recurrente: ≥4 views usadas —master, eje/reversa, alta, baja—;
- ubicación secundaria recurrente: ≥2 views usadas;
- props, criaturas, UI, armas, símbolos y states recurrentes tienen `ingredients[]`;
- ninguna pose/view existe solo para cuota ni falta cuando es causal;
- misma combinación perceptiva escenario+view+pose no domina >2 fuentes consecutivas sin MATCH motivado.

Códigos: `F_ASSET_GRAPH_MISSING`, `F_POSE_COVERAGE`, `F_VIEW_COVERAGE`, `F_REFERENCE_RUNTIME_MISSING`.

## Gate narrativo

Antes de mirar score declarado, deriva desde monólogo/beats:

- hook frío y promesa principal;
- deseo, herida/mentira y transformación;
- cadena detonante→amenaza→decisión→manifestación/equivalente→payoff→costo→cliffhanger;
- agencia antagonista;
- anti-clon material;
- costo persistente y deuda serial;
- timeline/snapshot correcto.

Después compara `narrative_dna`, `voice_visual_lock`, `visual_obligations`, continuidad y score. Producción exige ≥13/16, ningún cero, promesa pagada y costo real.

## Gate de cámara y páginas

Cada fuente declara intención, propósito, sujeto, escala, elevación, viewpoint, roll, ocupación, eje, dirección y `START/MATCH/CONTRAST`.

- `CONTRAST` cambia ≥2 dimensiones perceptivas;
- `MATCH` conserva continuidad con razón;
- ≥20% fuentes humanas no-eye-level y ≥35% no-frontales;
- aparecen familias alta, baja, OTS/POV y perfil/espalda con función;
- máximo dos firmas perceptivamente iguales seguidas;
- 25–35% de páginas panel son no-full-bleed y se distribuyen en el episodio;
- al menos tres templates no-full-bleed en producción;
- slots respetan cardinalidad, orden, safe area, dimensiones, crop y legibilidad.

Producción multipanel exige:

```json
{
  "v6_contract": {
    "runtime_adapter": {"page_blueprint_slots_integrated": true}
  }
}
```

Cada slot tiene prompt, source, shot ledger, `references` runtime, `references_v6` y continuidad. La bandera no compensa una capacidad ausente; en ese caso falla cerrado.

## Compatibilidad de referencias V6

Máximo tres referencias materiales por fuente. Roles: `IDENTITY`, `POSE`, `LOCATION`, `STATE`, `MOMENT`. Autoridad: `IDENTITY_ONLY`, `POSE_ONLY`, `GEOMETRY_LOCK`, `FULL_LOCK`.

- `IDENTITY_ONLY` no gobierna pose, cámara, crop, luz o fondo;
- `LOCATION+GEOMETRY_LOCK` requiere camera signature compatible;
- `FULL_LOCK` solo en MATCH, nunca CONTRAST;
- source path/hash deben ser reales;
- la referencia ejecutable equivalente debe estar en `references`;
- una scene ref no sustituye identidad ni debe clonar composición sin motivo.

## Continuidad

Por fuente compara `state_in→state_out`, `moment_id`, identity IDs, location, lighting y hashes aprobados. El siguiente estado inicia donde terminó el anterior. Un cambio exige claim/acción causal. Mismo moment conserva posiciones, ropa, herida, prop, clima y luz.

Futuros leaks, dueño incorrecto de prop, herida desaparecida o iluminación cambiada sin causa son fallos aunque el plano sea atractivo.

## Postflight: observar, no repetir metadata

### Cámara

- LOW/WORMS/GROUND: horizonte bajo, convergencia y volumen ascendente;
- HIGH/BIRDS/TOP_DOWN: suelo/geografía dominan;
- OTS: hombro/cabeza foreground y receptor/eyeline;
- POV: organización desde posición del observador;
- PROFILE/REAR: silueta y orientación inequívocas;
- DUTCH: roll visible; no paga elevación.

Si solo se leyó el prompt, resultado `NOT_OBSERVED`, nunca PASS.

### Actuación e identidad

Comprueba rostro/cabello/proporciones, ropa, emoción observable en ojos/mandíbula/hombros/manos, acción/target/contacto, heridas, poder, props y cardinalidad. Una etiqueta “angry” sin actuación visible es `F_EXPRESSION_MISS`.

### Lugar y continuidad

Compara arquitectura, view, eje, hora, clima, materiales y dirección de luz entre misma página, moment, secuencia y vecinas. Una plate incompatible que arrastra la cámara usa `F_REFERENCE_CAMERA_CONFLICT`.

### Página y secuencia

Comprueba número/orden de slots, fondo, gutters, bordes, crop y lectura al 25%. En contact sheet revisa repetición perceptiva de view, pose, escala, elevación, viewpoint, clima, paleta y layout. Cambiar enums sin diferencia visible no paga.

## Procedencia y retakes

Cada `shot_id` conserva prompt, modelo/settings, referencias/hashes, ruta/hash, timestamp, job, número de intento y `attempt_history` completo. Archivo sin procedencia: `F_PROVENANCE_MISSING`.

No confundas `scene_XX.composition.json` con `GENERATION_MANIFEST_V6`: el primero prueba cómo se armó una página; no prueba el envío a Grok. La integración actual no exporta todavía ese journal append-only. Si no llega un manifiesto factual externo, resultado `BLOCKED_PROVENANCE`; la plantilla de Conocimientos nunca cuenta como evidencia.

Observadores VLM/humano registran evidencia independiente. Discrepancia requiere adjudicación. Confianza <0.60 requiere humano; la confianza nunca compensa fallo crítico.

Congela PASS por SHA-256. Regenera solo FAIL, no la página completa. Reaudita la fuente, su página, moment y vecinas. Máximo tres intentos; después `HUMAN_REVIEW_V6`.

## Códigos mínimos

`F_RUNTIME_SCHEMA`, `F_ASSET_GRAPH_MISSING`, `F_REFERENCE_RUNTIME_MISSING`, `F_POSE_COVERAGE`, `F_VIEW_COVERAGE`, `F_PROVENANCE_MISSING`, `F_LAYOUT_GEOMETRY`, `F_PANEL_SEMANTICS`, `F_CAMERA_SIGNATURE`, `F_ACTION_SEMANTICS`, `F_REFERENCE_CAMERA_CONFLICT`, `F_REFERENCE_DOMINATED_COMPOSITION`, `F_IDENTITY_DRIFT`, `F_EXPRESSION_MISS`, `F_WARDROBE_DRIFT`, `F_PROP_STATE_DRIFT`, `F_LOCATION_DRIFT`, `F_LIGHTING_DRIFT`, `F_FUTURE_STATE_LEAK`, `F_SEQUENCE_REPETITION`, `F_POSE_REPETITION`, `F_PALETTE_MONOTONY`, `F_CROP_UNSAFE`, `F_MOBILE_UNREADABLE`, `F_APPROVED_HASH_CHANGED`.

Cada fallo tiene `CRITICAL`, `MAJOR` o `MINOR`.

## Release

Preflight: exit 0 + `PROMPT_RELEASE_V6`.

Postflight: exit 0, todas las fuentes/páginas PASS, `sequence_review:PASS`, procedencia completa, ≥90% de cámara observada en MATCH, cero críticos/mayores pendientes, continuidad y legibilidad aprobadas = `RENDER_RELEASE_V6`.
