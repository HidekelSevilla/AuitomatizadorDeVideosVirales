# Configurar los GPT Manhwa V5.3

V5.3 reemplaza V5.2. Crea chats/GPT nuevos y no mezcles archivos V3, V4, V5.0–V5.2 ni validadores anteriores en Knowledge.

Si ya tenías los tres GPT configurados, sigue primero `ACTUALIZAR_A_V5_3_7.md`.

## Knowledge no es el sistema de archivos del chat

Los archivos cargados en **Knowledge** sirven como referencia recuperable. El GPT puede leer fragmentos indexados, pero eso **no garantiza** que el archivo exista como ejecutable dentro de `/mnt/data` en un chat nuevo. Por eso `validate_v5_3.py` es **runtime-only**: no lo uses como dependencia de Knowledge. Súbelo una vez a File Library y vuelve a seleccionarlo como **archivo adjunto de la conversación en cada chat** que vaya a validar. No hace falta volver a subirlo desde el disco, pero sí adjuntarlo al mensaje del chat.

`MANIFEST_V5_3.md` puede permanecer actualizado en Knowledge. También se recomienda adjuntarlo a cada chat para verificar visualmente versión, bytes y SHA sin depender del retrieval. Su ausencia en `/mnt/data` no bloquea por sí sola si la versión canónica se puede comprobar en Knowledge; la ausencia del Python ejecutable sí bloquea.

Antes de ejecutar cualquier gate, el GPT debe listar los archivos reales de `/mnt/data`, identificar cada entrada por contenido y nombre real, y construir el comando con esas rutas. Nunca debe asumir que el packet se llama `Pasted text.txt`, `FINAL.json` o cualquier otro nombre fijo.

## GPT 1 — Showrunner

Pega en **Instructions**:

- `gpt_1_showrunner/00_INSTRUCCIONES_SHOWRUNNER_V5_3.md`

Sube a **Knowledge**:

- `shared/01_MOTOR_PREMISAS_COMERCIALES_V5_3.md`
- `gpt_1_showrunner/01_CONTRATO_STORY_PACKET_V5_3.md`
- `gpt_1_showrunner/02_REFERENCIA_NARRATIVA_COMERCIAL_V5_3.md`
- `MANIFEST_V5_3.md`

En **cada chat nuevo del Showrunner**, adjunta como archivos de conversación:

- `validate_v5_3.py` V5.3.7, obligatorio;
- el concepto/canon solicitado o el Story Packet anterior para Parte 2+;
- `MANIFEST_V5_3.md`, recomendado para comprobar el hash.

En una reparación, añade también el packet bloqueado y su reporte. Si el validador no aparece como archivo real en `/mnt/data`, el Showrunner devuelve `BLOCKED_INPUT`; no lo reconstruye desde snippets de Knowledge ni declara `PACKET_READY`.

Responsabilidad: concepto, biblia, Parte, continuidad narrativa y monólogo. Nunca JSON o prompts.

Activa Code Interpreter/Análisis de datos para que entregue el `STORY_PACKET_...md` como archivo estable; no uses una copia parcial del chat como handoff.

Antes de `PASS`, el Showrunner ejecuta `validate_v5_3.py --packet-only` sobre su archivo real. `MONOLOGO_LOCKED` queda en párrafos átomo separados por `\n\n`; cada átomo hablado tiene 2–16 palabras, y un átomo solo-tag solo puede contener un tag autorizado. Los átomos son cortes de interpretación, no decisiones de cámara. El handoff exige exit code 0 y `PACKET_READY`.

## GPT 2 — Director Visual

Pega en **Instructions**:

- `gpt_2_director/00_INSTRUCCIONES_DIRECTOR_VISUAL_V5_3.md`

Sube a **Knowledge**:

- `gpt_2_director/01_GRAMATICA_VISUAL_WEBTOON_V5_3.md`
- `gpt_1_showrunner/01_CONTRATO_STORY_PACKET_V5_3.md`
- `shared/03_CONTRATO_JSON_MANHWA_V5_3.md`
- `EXISTING_ASSET_MANIFEST_TEMPLATE_V5_3.json`
- `MANIFEST_V5_3.md`

En **cada chat nuevo del Director**, adjunta como archivos de conversación:

- el Story Packet completo de esa Parte;
- `validate_v5_3.py` V5.3.7, obligatorio;
- `MANIFEST_V5_3.md`, recomendado;
- para Parte 2+, el asset manifest de entrada `through_pNN`; en P1 sin `existing`, no se adjunta.

No adjuntes el JSON de la Parte anterior ni un JSON viejo cuando el Director debe crear desde cero. Si falta packet, validador montado o asset manifest requerido por `existing`, devuelve `BLOCKED_INPUT`.

Responsabilidad: crear un JSON completo **desde cero** a partir del Story Packet. No recibe JSON anterior.

Solo acepta handoff V5.3 completo. Un packet legacy vuelve al Showrunner para migración antes de dirigirlo.

Activa Code Interpreter/Análisis de datos para que pueda ejecutar el validador.

## GPT 3 — Auditor-reparador

Pega en **Instructions**:

- `gpt_3_auditor/00_INSTRUCCIONES_AUDITOR_REPARADOR_V5_3.md`

Sube a **Knowledge**:

- `gpt_3_auditor/01_QA_PREFLIGHT_VISUAL_V5_3.md`
- `gpt_2_director/01_GRAMATICA_VISUAL_WEBTOON_V5_3.md`
- `gpt_1_showrunner/01_CONTRATO_STORY_PACKET_V5_3.md`
- `shared/03_CONTRATO_JSON_MANHWA_V5_3.md`
- `EXISTING_ASSET_MANIFEST_TEMPLATE_V5_3.json`
- `MANIFEST_V5_3.md`

En **cada chat nuevo del Auditor**, adjunta como archivos de conversación:

- el mismo Story Packet usado por el Director;
- el JSON nuevo que se va a auditar;
- `validate_v5_3.py` V5.3.7, obligatorio;
- `MANIFEST_V5_3.md`, recomendado;
- el asset manifest de entrada real si el JSON contiene cualquier `existing`.

Si falta una entrada obligatoria, devuelve `BLOCKED_INPUT` y enumera exactamente cuál falta. No corrige hashes ni entrega un JSON prevalidado como si fuera `PROMPT_RELEASE` sin poder ejecutar el Python real.

Responsabilidad: auditar y reparar el JSON nuevo del Director. No crea historia ni cambia el monólogo.

Activa Code Interpreter/Análisis de datos.

## Regla del validador 5.3.7

Existe uno solo: `validate_v5_3.py`. No subas `validate_v5.py`, `.mjs` ni copias con otro hash. Verifica su versión y SHA-256 contra `MANIFEST_V5_3.md`. Tenerlo en Knowledge no basta: el Python debe figurar como archivo montado en `/mnt/data` durante ese chat. El Showrunner usa `--packet-only PACKET.md` y exige `PACKET_READY`. En P1 sin assets existentes, Director/Auditor usan JSON + Story Packet real; si aparece cualquier `existing`, añaden como tercer argumento el asset manifest real. Sin packet —o sin asset manifest cuando corresponde— nunca existe `PROMPT_RELEASE`.

El preflight de runtime es obligatorio:

1. Lista `/mnt/data` y registra los nombres reales.
2. Identifica el validador montado, el packet, el JSON y, cuando corresponda, el asset manifest por su contenido; no por un nombre supuesto.
3. Comprueba que el validador sea V5.3.7 y coincida con el SHA del manifest canónico.
4. Ejecuta el comando con las rutas exactas descubiertas y reporta comando, stdout, stderr y exit code reales.

Si `validate_v5_3.py` solo aparece como referencia de Knowledge/File Library pero no en `/mnt/data`, el estado es `BLOCKED_INPUT`. El GPT debe pedir que se adjunte desde File Library al chat actual; no puede copiar un fragmento indexado, fingir su ejecución ni sustituirlo por otro validador.

El validador 5.3.7 bloquea también desalineación actor/verbo/target, identidad sustituida, props simulados, pluralidad insuficiente, views y poses derivadas sin uso, reanclajes ausentes y cualquier ingrediente `generate` sin ancla manhwa 2D tipada. Además enlaza cada átomo de voz con `voice_visual_lock`: actor, acción, receptor, fuente, dirección, resultado, participantes, tokens físicos, `must_show` y política offscreen. `exit code 0` es necesario, pero el Auditor todavía debe completar su matriz semántica y control de regresiones.

El hecho narrado manda sobre una composición atractiva. Si la voz dice “Kang murió frente a Seo”, Kang muerto y Seo testigo deben verse; rifles, una reacción de Seo o una cápsula vacía no pagan ese hecho. Si la voz dice “Kang me eligió”, el sujeto elidido se resuelve al átomo anterior y la transferencia debe leerse `Kang → Seo`, nunca pared/ambiente → Seo.

## Flujo limpio para la P1 actual

1. Usa el `STORY_PACKET_P1_PRODUCTION_V5_3.md` incluido en este mismo paquete V5.3.7. Contiene el monólogo aprobado de 339 palabras, ~97 s, `voice_visual_lock` completo y preflight `PACKET_READY`.
2. No uses para este reinicio el packet legacy de 430–436 palabras: produciría aproximadamente 125 s porque el Director no puede recortarlo.
3. Abre el Director Visual nuevo y adjunta el Story Packet de producción, `validate_v5_3.py` como archivo de conversación y, preferentemente, `MANIFEST_V5_3.md`. No adjuntes JSON ni imágenes anteriores.
4. El Director crea un JSON nuevo con `production_lock`, `visual_plan` y `continuity` verificables y debe terminar en `PROMPT_RELEASE` real.
5. Abre el Auditor nuevo y adjunta el mismo Story Packet, el JSON nuevo del Director, `validate_v5_3.py` y, preferentemente, `MANIFEST_V5_3.md`.
6. El Auditor lista `/mnt/data`, fija snapshot, repara, entrega diff, reaudita cambios y escenas vecinas, completa la matriz `voz → actor/verbo/target → visibles → refs → prompt` y ejecuta el validador usando las rutas reales descubiertas; devuelve el JSON final solo con `PROMPT_RELEASE`.
7. Ese JSON final entra a generación/Remotion. Un JSON producido con el packet anterior no se mezcla con este packet: vuelve al Director desde cero o usa el modo de migración V5.3.7 del Auditor y regenera todas las escenas que el diff marque.

Si el Director detecta segmentación imposible, no cambies el JSON ni el monólogo a mano. Devuelve packet + reporte al Showrunner: este solo recoloca límites `\n\n`, corrige tags inválidos y recalcula SHA, spans, caracteres y QA; después repite `--packet-only` y el Director reinicia desde ese packet corregido.

El Auditor P1 entrega `<serie>_through_p01_ASSET_MANIFEST_V5_3.json`. Para P2 adjunta ese archivo al Director; nunca el JSON P1. Director y Auditor listan `/mnt/data` y validan usando las rutas reales descubiertas de validador + JSON + packet + asset manifest de entrada. El Auditor P2 no sobrescribe la entrada: entrega un manifest fusionado nuevo `through_p02` para P3. `production_lock` hashea solo el manifest de entrada. La forma está en `EXISTING_ASSET_MANIFEST_TEMPLATE_V5_3.json`.

El Auditor necesita el JSON recién creado porque su trabajo es verificarlo. “Desde cero” significa que el Director no recibe el JSON viejo; no significa saltarse la auditoría del archivo nuevo.

## Qué cambió

- Desapareció el contador genérico de “respiros”.
- Blancos, negros, fragmentos, reacciones, escala, aproximación y acción vertical tienen gates independientes.
- No existe el cap de tres blancos.
- Cards no pagan blancos; devices/props/close-ups no pagan respiro automáticamente.
- Un TRUE_LONG exige porcentajes, distancia y capas.
- Cada acción exige geografía, trayectoria, contacto, consecuencia y reacción.
- Los estados futuros, dueños de poder, ocupantes y escenarios se verifican en ledger.
- Bases neutrales y poses de actuación se separan estrictamente.
- El Auditor recalcula todo; no cree los scores del Director.
- El validador compara el guion y la voz contra el packet adjunto, valida mínimos y máximos, y falla cerrado ante datos ausentes o mal tipados.
- Actor, verbo y target narrados deben coincidir con metadatos, visibles, referencias y prompt; no se sacrifica una identidad para cuadrar tres refs.
- Toda view declarada se usa y todo master con cupo reancla el escenario.
- Bases y poses siguen limpias y grises, pero cada prompt lleva su propia ancla Korean manhwa/webtoon 2D; las views usan ancla de background pintado vacío.
- Reparar una escena no permite romper otra: el Auditor entrega diff y reaudita dependencias antes de aprobar.
- Cada átomo hablado queda ligado a hechos visuales canónicos; una cadena de metadatos internamente coherente ya no puede aprobar si contradice la voz.
- Pronombres y sujetos omitidos conservan actor/fuente mediante `resolved_from_atom_id`; la energía o el ambiente no pueden apropiarse de una acción humana narrada.
