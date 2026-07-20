# Prompts de uso V5.3

## Preflight de archivos para todos los prompts

No confundas **Knowledge**, File Library y archivos montados. Knowledge sirve para consulta/retrieval. Guarda `validate_v5_3.py` una vez en File Library como archivo runtime-only, no como dependencia de Knowledge; en cada chat nuevo debes seleccionarlo otra vez como archivo de conversación para que pueda aparecer en `/mnt/data`. Mantén `MANIFEST_V5_3.md` actualizado en Knowledge y adjúntalo también cuando sea posible para comprobar versión y SHA.

Antes de pegar cualquiera de los prompts siguientes, adjunta:

- **Showrunner:** `validate_v5_3.py` + concepto/canon o packet anterior; para reparación, packet bloqueado + reporte; `MANIFEST_V5_3.md` recomendado.
- **Director:** `validate_v5_3.py` + Story Packet de la Parte; para Parte 2+, asset manifest de entrada `through_pNN`; `MANIFEST_V5_3.md` recomendado.
- **Auditor:** `validate_v5_3.py` + Story Packet + JSON nuevo del Director; si existe cualquier `existing`, asset manifest de entrada; `MANIFEST_V5_3.md` recomendado.

Todos los prompts incluyen el mismo protocolo: listar primero `/mnt/data`, identificar archivos por contenido y usar sus rutas reales. Nunca asumir `Pasted text.txt`, `FINAL.json` ni siquiera que un adjunto conservará exactamente su nombre original. Si falta el Python ejecutable, el packet, el JSON requerido o el asset manifest requerido, devolver `BLOCKED_INPUT` y nombrar la entrada faltante; no reconstruir archivos desde snippets de Knowledge ni emitir un PASS parcial.

## Crear una serie o futura Parte con Showrunner

```text
MODO AUTO V5.3.

[Pega aquí concepto o el STORY_PACKET/canon anterior si es Parte 2+].

Trabaja solo como Showrunner. Primero lista `/mnt/data` e identifica el `validate_v5_3.py` V5.3.7 realmente montado; Knowledge no cuenta como ejecutable. Si falta, devuelve BLOCKED_INPUT. Entrega como archivo STORY_PACKET_V5 con handoff_version 5.3, approved_voice_id, STORY_BEATS completos, CONTINUITY_LEDGER y MONOLOGO_LOCKED. Antes del hash, presegmenta el monólogo en párrafos átomo `\n\n`: cada átomo hablado tiene 2–16 palabras y ≤5 s, sin LF interno; un átomo solo-tag solo usa un tag autorizado. Esto no asigna cámara/layout. Guarda el packet, vuelve a listar `/mnt/data` para descubrir su nombre real y ejecuta `python "<RUTA_REAL_VALIDATE_V5_3>" --packet-only "<RUTA_REAL_PACKET>"`; corrige hasta exit code 0 y PACKET_READY. Reporta rutas, comando, stdout y exit code reales. No hagas JSON, prompts ni planos.
```

## Reparar únicamente un Story Packet bloqueado por segmentación

En el Showrunner, adjunta `validate_v5_3.py`, el packet bloqueado y el reporte del Director; `MANIFEST_V5_3.md` es recomendado:

```text
MODO AUTO V5.3 — REPARACIÓN DE SEGMENTABILIDAD.

Primero lista `/mnt/data` y localiza por contenido el validador, el packet y el reporte; no uses nombres supuestos. Si falta una entrada, devuelve BLOCKED_INPUT. Conserva exactamente palabras, signos, tags autorizados, orden, canon, beats, voz y revelaciones. Modifica únicamente límites de párrafo de MONOLOGO_LOCKED: cada átomo hablado será una línea no vacía de 2–16 palabras separada por `\n\n`; un átomo solo-tag puede conservarse si el tag es autorizado y absorbible por la frase vecina. Después actualiza monologue_sha256, todos los monologue_span_exact afectados, character_count y QA_SHOWRUNNER. Ejecuta `python "<RUTA_REAL_VALIDATE_V5_3>" --packet-only "<RUTA_REAL_PACKET_REPARADO>"` y entrega el packet completo solo con exit code 0 y PACKET_READY; reporta comando y exit code reales. No hagas JSON ni prompts.
```

## Recrear P1 desde el Story Packet de producción V5.3

En un chat nuevo del Director Visual, adjunta `STORY_PACKET_P1_PRODUCTION_V5_3.md`, `validate_v5_3.py` y, recomendado, `MANIFEST_V5_3.md`; no adjuntes un JSON anterior. Después pega:

```text
MODO AUTO V5.3. Este STORY_PACKET es la única fuente narrativa.

Primero lista `/mnt/data`. Identifica por contenido el Story Packet y el `validate_v5_3.py` V5.3.7 montado; no asumas nombres ni uses un snippet de Knowledge como ejecutable. Si falta cualquiera, devuelve BLOCKED_INPUT con la entrada faltante.

Crea desde un JSON vacío una adaptación visual completamente nueva. No solicites ni reconstruyas el JSON anterior. Calcula production_lock desde este archivo real. Si el packet no es handoff_version 5.3 completo, bloquea y envíalo primero al Showrunner; no inventes beats, estados ni voz.

Antes de diseñar, ejecuta `python "<RUTA_REAL_VALIDATE_V5_3>" --packet-only "<RUTA_REAL_STORY_PACKET>"`. Continúa únicamente si devuelve exit code 0 y PACKET_READY.

Respeta los átomos `\n\n` sin aplicar `.strip()`. Al cortar entre átomos, conserva un LF final en el voiceover izquierdo para que la unión contractual con `\n` reproduzca ambos LF. Si el preflight de segmentación falla, no cambies el texto: devuelve reporte al Showrunner.

Aplica todas las cuotas independientes V5.3: blancos reales por familias, cards negras, fragmentos humanos, reacciones, TRUE_LONG, rampa de aproximación, approach adicional, TALL_ACTION, geografía y continuidad de estados. Las bases deben ser técnicas y las poses deben actuar.

Escribe visual_plan y continuity estructurados en cada panel. Guarda el JSON, vuelve a listar `/mnt/data` y usa sus rutas reales: `python "<RUTA_REAL_VALIDATE_V5_3>" "<RUTA_REAL_JSON>" "<RUTA_REAL_STORY_PACKET>"`; si hay cualquier `existing`, añade `"<RUTA_REAL_ASSET_MANIFEST_ENTRADA>"` como tercer argumento. Si ese manifest falta, devuelve BLOCKED_INPUT. Repara hasta exit code 0 y entrega JSON completo + tabla probatoria, incluyendo comando, stdout y exit code reales. Estado máximo: PROMPT_RELEASE.
```

## Auditoría/reparación del JSON nuevo

En un chat nuevo del Auditor, adjunta `validate_v5_3.py`, el mismo Story Packet y el JSON recién generado; añade el asset manifest de entrada si hay `existing` y, recomendado, `MANIFEST_V5_3.md`:

```text
MODO AUTO_REPAIR_PREFLIGHT V5.3.

Primero lista `/mnt/data` e identifica por contenido validador V5.3.7, Story Packet, JSON y asset manifest cuando corresponda. Knowledge no sustituye al Python montado. Si falta una entrada obligatoria, devuelve BLOCKED_INPUT y no entregues una pre-reparación como PROMPT_RELEASE.

Audita este STORY_PACKET y este JSON desde datos brutos. Ignora todos los PASS, scores y conteos declarados por el Director. Conserva MONOLOGO_LOCKED y canon exactos.

Recalcula cada gate V5.3, corrige los metadatos estructurados y sus prompts, repara el JSON completo y repite hasta cero fallos reparables. Guarda el JSON y vuelve a listar `/mnt/data`. Ejecuta solo `python "<RUTA_REAL_VALIDATE_V5_3>" "<RUTA_REAL_JSON>" "<RUTA_REAL_STORY_PACKET>"`; si el JSON contiene cualquier `existing`, añade `"<RUTA_REAL_ASSET_MANIFEST_ENTRADA>"`. Entrega JSON, manifest de assets, evidencia por scene_id, SHA/comando/exit code real y uno de tus estados permitidos. No entregues recomendaciones pendientes.

Antes de mirar metadatos/prompts, mapea cada span a `MACHINE_LOCK_V5_3.voice_visual_lock`. `continuity.voice_facts` concatena sus claims en orden, cada uno con `atom_id,actor_id,action,receiver_or_target_id,source_id,direction,result,causal_participants[],required_visual_tokens[],resolved_from_atom_id|null`; `continuity.must_show[]` es la unión y `continuity.offscreen_policy` no amplía el lock. Entrega matriz `atom_id/text_exact -> claims lock -> hechos/tokens panel -> atomic_action -> visibles -> performances -> refs -> evidencia literal`. Cada required_visual_token físico sin ID (column, floor, crack, cash, etc.) debe aparecer en el prompt unido a su acción/estado; no basta metadata o fondo genérico. Resuelve pronombres solo por `resolved_from_atom_id`; metadata coherente pero falsa frente al lock falla. En hook factual no ocultes actor/fuente/receptor ni sustituyas evento por reacción, rifles, aura, símbolo o consecuencia. `exit code 0` es necesario pero no suficiente.

Ejecuta también el gate independiente `ASSET_STYLE` sobre cada base, pose derivada, creature, prop, container, UI y view con `generate`. Cada prompt debe incluir ancla Korean manhwa/webtoon 2D compatible con su tipo. Gris/luz de estudio son requisitos técnicos, no estilo; assets no llevan rim/clima/escena y las views son fondos manhwa pintados, detallados y vacíos. Entrega `ASSET_STYLE` PASS/FAIL por id/pose/view y repara todos los FAIL antes de aprobar.

Antes de reparar fija alcance y snapshot. Entrega diff por escena/campo y no alteres nada fuera del alcance salvo dependencias enumeradas. Después reaudita escenas cambiadas, vecinas, scene refs, mismo `moment_id`, assets/manifest afectados, continuidad posterior y la matriz completa. Si aparece una regresión, continúa reparando; `PROMPT_RELEASE` exige todas las filas PASS y cero cambios injustificados.

Preserva literalmente los separadores `\n\n` del packet mediante el LF final de la ventana izquierda; nunca uses `.strip()` sobre voiceover.text.
```

## Migrar JSON anterior a V5.3.7

En el Auditor, adjunta `validate_v5_3.py`, packet, JSON y el asset manifest real si usa `existing`; `MANIFEST_V5_3.md` es recomendado:

```text
MODO MIGRATION_VOICE_FACT_LOCK V5.3.7.

Primero lista `/mnt/data` e identifica por contenido el validador V5.3.7, packet, JSON y manifest de entrada cuando corresponda. No uses nombres hardcoded ni ejecutes una copia reconstruida desde Knowledge. Si falta una entrada obligatoria, devuelve BLOCKED_INPUT.

Conserva byte-idénticos MONOLOGO_LOCKED, voiceover.text, full_script, timing, transiciones, IDs y orden. No cambies voz, canon, cards ni cuotas. Migra cada panel, no solo el hook: mapea sus spans a `MACHINE_LOCK_V5_3.voice_visual_lock`; copia los claims exactos en `continuity.voice_facts`, une `must_show` y copia una `offscreen_policy` compatible. Alinea `atomic_action`, visible_entities, performances, referencias y prompt. Si el JSON anterior contradice la voz, la voz y el lock mandan.

Antes de mirar metadatos o prompts, construye una matriz independiente por `atom_id`: texto exacto → actor → acción → receptor/target → fuente → dirección → resultado → causales → tokens físicos. Un evento narrado no se paga con una reacción, símbolo, consecuencia o amenaza posterior. Una persona causal que el lock obliga a mostrar aparece completa en visibles, performance, ref y prompt; no la sustituyas por ambiente, aura, parte corporal u otro personaje. Cada `required_visual_token` aparece unido a la acción/estado correcto.

Mantén byte-idéntica una escena visual si ya satisface el lock. Si falla, puedes cambiar únicamente sus campos visuales y las dependencias necesarias; crea assets solo cuando ninguna pose existente sirve. Repara también cualquier prompt `generate` que no cumpla ASSET_STYLE. Fija snapshot, entrega diff por escena/campo y lista exacta de escenas/assets que deben regenerarse. Guarda el JSON, vuelve a listar `/mnt/data` y ejecuta `python "<RUTA_REAL_VALIDATE_V5_3>" "<RUTA_REAL_JSON>" "<RUTA_REAL_STORY_PACKET>"`, añadiendo `"<RUTA_REAL_ASSET_MANIFEST_ENTRADA>"` si corresponde; solo exit code 0, matriz factual completa PASS y cero regresiones permiten `PROMPT_RELEASE`.
```

## Reparar P1 con el packet factual corregido

En un chat nuevo del Auditor, adjunta el Story Packet canónico, el JSON final actual, `validate_v5_3.py` actualizado y manifest real solo si hay `existing`:

```text
MODO P1_VOICE_FACT_REPAIR V5.3.7 — VOZ BLOQUEADA.

Primero lista `/mnt/data` e identifica por contenido el `validate_v5_3.py` V5.3.7, el Story Packet y el JSON. Si existe cualquier `existing`, localiza también el asset manifest de entrada. Si falta una entrada obligatoria, devuelve BLOCKED_INPUT. No dependas de `Pasted text.txt`, `FINAL.json` ni de fragmentos recuperados desde Knowledge.

Conserva byte-idénticos MONOLOGO_LOCKED, voiceover.text, full_script, timing, transiciones, IDs y orden. No reescribas voz, canon, cards ni cuotas. Añade a todos los paneles `continuity.voice_facts`, `must_show` y `offscreen_policy` desde el lock; no inventes su contenido. Mantén los demás campos byte-idénticos cuando ya representen todos sus hechos. Solo modifica visual_plan, continuity, performances, references, image_prompt y assets de una escena que falle la matriz factual, más sus dependencias enumeradas.

Antes de mirar prompts, deriva desde las voces exactas y `MACHINE_LOCK_V5_3.voice_visual_lock`:
- scene_01, “El villano más grande de Corea murió frente a mí”: entidad factual Kang Muyeol, acción morir/estar recién muerto, testigo Seo Jun; must_show=[kang_muyeol,seo_jun]. Conserva exactamente los campos actor/target/null definidos por el claim canónico. Kang es la única persona dentro de capsule_orchestrator y Seo está completamente fuera. Rifles o amenaza estatal son secundarios y no sustituyen la muerte.
- scene_02, “Pero antes me eligió como heredero”: “me”=Seo Jun y el sujeto elidido hereda Kang desde scene_01. Kang es source/actor, Seo receiver, dirección kang_muyeol→seo_jun; must_show=[kang_muyeol,seo_jun]. Muestra contacto/transferencia rojo-negra naciendo inequívocamente de Kang y entrando en Seo; no desde pared, pantalla, cápsula o ambiente. Kang sigue dentro de la cápsula abierta y Seo fuera.

En todos los paneles, `continuity.voice_facts` concatena los claims del lock y cada claim repite `atom_id`, incluido `required_visual_tokens[]`; scene_02 resuelve el sujeto con `resolved_from_atom_id` del átomo cubierto por scene_01. `continuity.must_show[]` es la unión y `continuity.offscreen_policy` no amplía el lock. Alinea atomic_action, visible_entities, performances, máximo tres refs y prompt literal con esos hechos/tokens. No uses metadata previa como verdad.

Fija snapshot antes de editar. Entrega diff por campo y prueba qué escenas permanecieron byte-idénticas; enumera únicamente dependencias inevitables. Reaudita cada escena cambiada, sus vecinas, scene-ref/moment afectados y la matriz factual completa de A001 a A047. Guarda el JSON, vuelve a listar `/mnt/data` y ejecuta `python "<RUTA_REAL_VALIDATE_V5_3>" "<RUTA_REAL_JSON>" "<RUTA_REAL_STORY_PACKET>"`, añadiendo `"<RUTA_REAL_ASSET_MANIFEST_ENTRADA>"` si aplica. Entrega JSON completo solo con exit code 0, matriz factual PASS y cero regresiones; estado máximo PROMPT_RELEASE. Indica exactamente qué escenas y assets deben regenerarse; nunca prometas que son solo scene_01/02 antes de completar la matriz.
```

## Parte 2+

1. Showrunner: adjunta `validate_v5_3.py` + Story Packet/canon y pide Parte 2; `MANIFEST_V5_3.md` es recomendado.
2. Director: adjunta `validate_v5_3.py` + Story Packet P2 + `<serie>_through_p01_ASSET_MANIFEST_V5_3.json`; nunca el JSON P1. Solo esas rutas usan `existing`; lista `/mnt/data` y valida con las rutas reales de JSON + packet + manifest.
3. Auditor: adjunta `validate_v5_3.py` + packet P2 + JSON P2 + ese mismo manifest de entrada. Tras validar con las rutas reales, crea uno nuevo y fusionado `through_p02`; nunca sobrescribe `through_p01`.
