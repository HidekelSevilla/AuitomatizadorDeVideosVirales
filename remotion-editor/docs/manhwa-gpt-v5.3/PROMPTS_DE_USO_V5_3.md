# Prompts de uso V5.3

## Crear una serie o futura Parte con Showrunner

```text
MODO AUTO V5.3.

[Pega aquí concepto o el STORY_PACKET/canon anterior si es Parte 2+].

Trabaja solo como Showrunner. Entrega como archivo STORY_PACKET_V5 con handoff_version 5.3, approved_voice_id, STORY_BEATS completos, CONTINUITY_LEDGER y MONOLOGO_LOCKED. Ejecuta todos tus gates y corrige internamente hasta PASS. No hagas JSON, prompts ni planos.
```

## Recrear P1 desde el Story Packet de producción V5.3

En un chat nuevo del Director Visual, adjunta únicamente `STORY_PACKET_P1_PRODUCTION_V5_3.md` y pega:

```text
MODO AUTO V5.3. Este STORY_PACKET es la única fuente narrativa.

Crea desde un JSON vacío una adaptación visual completamente nueva. No solicites ni reconstruyas el JSON anterior. Calcula production_lock desde este archivo real. Si el packet no es handoff_version 5.3 completo, bloquea y envíalo primero al Showrunner; no inventes beats, estados ni voz.

Aplica todas las cuotas independientes V5.3: blancos reales por familias, cards negras, fragmentos humanos, reacciones, TRUE_LONG, rampa de aproximación, approach adicional, TALL_ACTION, geografía y continuidad de estados. Las bases deben ser técnicas y las poses deben actuar.

Escribe visual_plan y continuity estructurados en cada panel. Ejecuta únicamente `python validate_v5_3.py FINAL.json "RUTA_EXACTA_DEL_STORY_PACKET_ADJUNTO.md"`, repara hasta exit code 0 y entrega JSON completo + tabla probatoria. Estado máximo: PROMPT_RELEASE.
```

## Auditoría/reparación del JSON nuevo

En un chat nuevo del Auditor, adjunta el mismo Story Packet y el JSON recién generado:

```text
MODO AUTO_REPAIR_PREFLIGHT V5.3.

Audita este STORY_PACKET y este JSON desde datos brutos. Ignora todos los PASS, scores y conteos declarados por el Director. Conserva MONOLOGO_LOCKED y canon exactos.

Recalcula cada gate V5.3, corrige los metadatos estructurados y sus prompts, repara el JSON completo y repite hasta cero fallos reparables. Ejecuta solo `python validate_v5_3.py FINAL.json "RUTA_EXACTA_DEL_STORY_PACKET_ADJUNTO.md"`. Entrega JSON, manifest de assets, evidencia por scene_id, SHA/comando/exit code y uno de tus estados permitidos. No entregues recomendaciones pendientes.
```

## Parte 2+

1. Showrunner: adjunta Story Packet/canon y pide Parte 2.
2. Director nuevo o chat de la misma serie: adjunta el Story Packet P2 y `EXISTING_ASSET_MANIFEST_V5_3.json`; nunca el JSON P1 como plantilla visual. Solo las rutas del manifest pueden usar `existing`; valida con JSON + packet + manifest.
3. Auditor: adjunta packet P2 + JSON P2 nuevo + el mismo manifest y ejecuta los tres argumentos.
