# Configurar los GPT Manhwa V5.3

V5.3 reemplaza V5.2. Crea chats/GPT nuevos y no mezcles archivos V3, V4, V5.0–V5.2 ni validadores anteriores en Knowledge.

## GPT 1 — Showrunner

Pega en **Instructions**:

- `gpt_1_showrunner/00_INSTRUCCIONES_SHOWRUNNER_V5_3.md`

Sube a **Knowledge**:

- `shared/01_MOTOR_PREMISAS_COMERCIALES_V5_3.md`
- `gpt_1_showrunner/01_CONTRATO_STORY_PACKET_V5_3.md`
- `gpt_1_showrunner/02_REFERENCIA_NARRATIVA_COMERCIAL_V5_3.md`

Responsabilidad: concepto, biblia, Parte, continuidad narrativa y monólogo. Nunca JSON o prompts.

Activa Code Interpreter/Análisis de datos para que entregue el `STORY_PACKET_...md` como archivo estable; no uses una copia parcial del chat como handoff.

## GPT 2 — Director Visual

Pega en **Instructions**:

- `gpt_2_director/00_INSTRUCCIONES_DIRECTOR_VISUAL_V5_3.md`

Sube a **Knowledge**:

- `gpt_2_director/01_GRAMATICA_VISUAL_WEBTOON_V5_3.md`
- `gpt_1_showrunner/01_CONTRATO_STORY_PACKET_V5_3.md`
- `shared/03_CONTRATO_JSON_MANHWA_V5_3.md`
- `scripts/validate_v5_3.py`

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
- `scripts/validate_v5_3.py`

Responsabilidad: auditar y reparar el JSON nuevo del Director. No crea historia ni cambia el monólogo.

Activa Code Interpreter/Análisis de datos.

## Regla del validador

Existe uno solo: `validate_v5_3.py`. No subas `validate_v5.py`, `.mjs` ni copias con otro hash. Verifica su SHA-256 en `MANIFEST_V5_3.md`. En P1 sin assets existentes usa dos argumentos: JSON + Story Packet real. Si aparece cualquier `existing`, añade como tercer argumento el manifest real. Sin packet —o sin manifest cuando corresponde— nunca existe `PROMPT_RELEASE`.

## Flujo limpio para la P1 actual

1. Usa `STORY_PACKET_P1_PRODUCTION_V5_3.md`. Contiene el monólogo aprobado de 339 palabras y ~97 s.
2. No uses para este reinicio el packet legacy de 430–436 palabras: produciría aproximadamente 125 s porque el Director no puede recortarlo.
3. Abre el Director Visual nuevo y adjunta **solo el Story Packet de producción**. No adjuntes JSON ni imágenes anteriores.
4. El Director crea un JSON nuevo con `production_lock`, `visual_plan` y `continuity` verificables y debe terminar en `PROMPT_RELEASE` real.
5. Abre el Auditor nuevo y adjunta el mismo Story Packet **más el JSON nuevo** del Director.
6. El Auditor repara y ejecuta `python /mnt/data/validate_v5_3.py /mnt/data/FINAL.json "/mnt/data/<nombre exacto del packet adjunto>.md"`; devuelve el JSON final solo con `PROMPT_RELEASE`.
7. Ese JSON final entra a generación/Remotion.

El Auditor también entrega `EXISTING_ASSET_MANIFEST_V5_3.json`. Para P2+ adjunta ese manifest al Director; nunca adjuntes el JSON P1 como plantilla. Director y Auditor validan entonces con `python /mnt/data/validate_v5_3.py FINAL.json PACKET.md MANIFEST.json`. La forma está en `EXISTING_ASSET_MANIFEST_TEMPLATE_V5_3.json`.

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
