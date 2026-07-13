# Configurar los tres GPTs V5.1

La documentación oficial de OpenAI recomienda colocar comportamiento, tono y flujo en **Instructions**, y usar **Knowledge** como material de referencia. También recomienda instrucciones positivas, pasos explícitos y ejemplos breves. Esta distribución sigue ese criterio.

## GPT 1 — Manhwa V5.1 Showrunner

**Instructions:** copiar el contenido de:

- `gpt_1_showrunner/00_INSTRUCCIONES_SHOWRUNNER_V5.md`

**Knowledge:**

- `shared/01_MOTOR_PREMISAS_COMERCIALES_V5.md`
- `shared/02_CONTRATO_HANDOFF_STORY_V5.md`
- `gpt_1_showrunner/01_REFERENCIA_NARRATIVA_COMERCIAL_V5.md`
- `gpt_1_showrunner/02_QA_NARRATIVO_AUTOMATICO_V5.md`

**Starter:**

```text
NUEVA SERIE AUTO. Genera y valida una Parte 1 completa.
```

## GPT 2 — Manhwa V5.1 Director visual

**Instructions:**

- `gpt_2_director/00_INSTRUCCIONES_DIRECTOR_VISUAL_V5.md`

**Knowledge:**

- `shared/02_CONTRATO_HANDOFF_STORY_V5.md`
- `shared/03_CONTRATO_JSON_MANHWA_V5.md`
- `shared/04_EJEMPLO_JSON_MECANICO_NEUTRO_V5.json`
- `gpt_2_director/01_DIRECCION_VISUAL_WEBTOON_V5.md`
- `gpt_2_director/02_EJEMPLOS_PROMPTS_V5.md`

Activa **Code Interpreter & Data Analysis**.

**Starter:**

```text
PRODUCIR PARTE AUTO. Usa el STORY_PACKET adjunto y entrega JSON validado.
```

## GPT 3 — Manhwa V5.1 Auditor-reparador

**Instructions:**

- `gpt_3_auditor/00_INSTRUCCIONES_AUDITOR_REPARADOR_V5.md`

**Knowledge:**

- `shared/02_CONTRATO_HANDOFF_STORY_V5.md`
- `shared/03_CONTRATO_JSON_MANHWA_V5.md`
- `gpt_3_auditor/01_QA_NARRATIVO_VISUAL_JSON_V5.md`

Activa **Code Interpreter & Data Analysis** y visión/archivos.

**Starter:**

```text
AUTO_REPAIR_PREFLIGHT. Repara y devuelve JSON completo PROMPT_RELEASE. No declares RENDER_RELEASE sin imágenes.
```

## No subir

No subas a estos GPTs como Knowledge:

- guías V3.2 o V4.x completas
- JSONs de historias anteriores
- rescates específicos de una serie
- listas extensas de prohibiciones
- las 25 premisas con nombres de obras

La V5.1 ya destila lo útil. Subir todas las versiones crea conflictos y favorece clonación o reglas obsoletas.

## Operación

Cada chat del Showrunner es una serie. Los GPTs no dependen de memoria guardada ni de conversaciones anteriores: el Story Packet es la fuente del traspaso. Mantén los archivos por `series_id` y Parte.

## Prueba inicial

Antes de producir muchas series, ejecuta tres pilotos:

1. subestimado + progresión visible
2. poder perseguido/monstruo interior
3. conocimiento o segunda oportunidad

Para cada piloto, usa Auditor y genera solo bases + 6–8 paneles representativos antes de toda la Parte. Tras generar la Parte completa, vuelve al Auditor con los renders; `PROMPT_RELEASE` no sustituye `RENDER_RELEASE`.

## Flujo de estados

```text
Showrunner PASS → Director PROMPT_RELEASE → Auditor PREFLIGHT PROMPT_RELEASE
→ bases/pilotos → Auditor de renders → RETAKES o RENDER_RELEASE
```

Este segundo paso del Auditor es obligatorio: un prompt correcto puede producir identidad mezclada, postura neutral, escala equivocada o personaje dentro del contenedor incorrecto.
