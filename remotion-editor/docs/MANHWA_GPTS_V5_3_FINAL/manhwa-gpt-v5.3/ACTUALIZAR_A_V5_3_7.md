# Actualizar los tres GPT a V5.3.7

V5.3.7 corrige el fallo por el que una narración factual podía terminar ilustrada con una reacción o una imagen temática. El hecho hablado ahora queda bloqueado desde el Story Packet hasta el prompt final.

## Qué reemplazar

En los tres GPT elimina primero cualquier copia anterior de `validate_v5_3.py` de Knowledge y reemplaza `MANIFEST_V5_3.md`. El validador V5.3.7 es runtime-only: súbelo una vez a File Library y adjúntalo a cada chat que vaya a validar. No mezcles V5.3.6 ni packets anteriores.

### Showrunner

- Instructions: `gpt_1_showrunner/00_INSTRUCCIONES_SHOWRUNNER_V5_3.md`
- Knowledge: contrato y referencia del Showrunner, `shared/01_MOTOR_PREMISAS_COMERCIALES_V5_3.md` y `MANIFEST_V5_3.md`

### Director Visual

- Instructions: `gpt_2_director/00_INSTRUCCIONES_DIRECTOR_VISUAL_V5_3.md`
- Knowledge: gramática visual, contratos Story Packet/JSON, template de manifest y `MANIFEST_V5_3.md`

### Auditor-reparador

- Instructions: `gpt_3_auditor/00_INSTRUCCIONES_AUDITOR_REPARADOR_V5_3.md`
- Knowledge: QA visual, gramática visual, contratos Story Packet/JSON, template de manifest y `MANIFEST_V5_3.md`

Los tres Instructions permanecen por debajo de 8.000 caracteres y bytes UTF-8. El validador correcto dice `VALIDATOR_VERSION = "5.3.7"` y su SHA está en el manifest.

## Cambio operativo obligatorio: Knowledge no monta ejecutables

Knowledge, File Library y `/mnt/data` son capas distintas. Knowledge permite recuperar instrucciones o fragmentos. File Library permite guardar el validador para reutilizarlo. Ninguna de las dos garantiza que `validate_v5_3.py` esté disponible como archivo ejecutable en la sandbox del chat hasta que lo adjuntes al mensaje. En **cada chat nuevo**, selecciona `validate_v5_3.py` desde File Library; debe aparecer realmente en `/mnt/data` antes de validar.

Mantén `MANIFEST_V5_3.md` actualizado en Knowledge y, de preferencia, adjúntalo también al chat. El manifest permite confirmar versión, bytes y SHA; no reemplaza al Python ejecutable. Si el manifest no está montado pero su versión canónica se comprueba en Knowledge, eso no bloquea por sí solo. Si no se puede comprobar su versión/hash, el GPT debe bloquear.

Archivos de conversación exactos por rol:

- **Showrunner:** concepto/canon o packet anterior de Parte 2+, `validate_v5_3.py`; recomendado `MANIFEST_V5_3.md`. Para reparación, añade packet bloqueado y reporte.
- **Director:** Story Packet de la Parte, `validate_v5_3.py`; recomendado `MANIFEST_V5_3.md`; en Parte 2+ añade el asset manifest `through_pNN` que permite `existing`. No adjuntes un JSON anterior al flujo desde cero.
- **Auditor:** Story Packet real, JSON nuevo del Director, `validate_v5_3.py`; recomendado `MANIFEST_V5_3.md`; añade el asset manifest de entrada si existe cualquier `existing`.

Cada rol debe listar `/mnt/data` al inicio, usar los nombres reales montados y mostrar el comando exacto ejecutado. No debe depender de `/mnt/data/Pasted text.txt`, `/mnt/data/FINAL.json` ni otro nombre hardcoded: ChatGPT puede renombrar archivos, añadir sufijos o montar un `.txt` con nombre genérico.

Estado de bloqueo:

- validador no montado o no ejecutable: `BLOCKED_INPUT`;
- versión, SHA o manifest contradictorio: `BLOCKED_VALIDATOR`;
- packet ausente: `BLOCKED_INPUT`;
- JSON ausente en Auditor: `BLOCKED_INPUT`;
- asset manifest ausente cuando el JSON usa `existing`: `BLOCKED_INPUT`.

Un validador visible solo como snippet de Knowledge no se reconstruye ni se considera ejecutado. Ningún rol puede emitir `PACKET_READY` o `PROMPT_RELEASE` sin comando y exit code reales.

## Reiniciar esta P1

1. No uses el JSON V5.3.6 ni el Story Packet anterior: ambos tienen otro hash y carecen de `voice_visual_lock` canónico.
2. Abre un chat nuevo del Director y adjunta `STORY_PACKET_P1_PRODUCTION_V5_3.md`, `validate_v5_3.py` y, recomendado, `MANIFEST_V5_3.md`. No adjuntes JSON ni imágenes viejas.
3. El Director debe devolver `PROMPT_RELEASE` real con el validador V5.3.7.
4. Abre un chat nuevo del Auditor y adjunta el mismo packet, el JSON nuevo del Director, `validate_v5_3.py` y, recomendado, `MANIFEST_V5_3.md`.
5. Produce únicamente el JSON que el Auditor devuelva con exit code 0, matriz factual completa PASS y cero warnings.

La ruta de rescate del JSON anterior existe en `PROMPTS_DE_USO_V5_3.md`, pero para esta P1 se recomienda reconstruir desde el Director: el packet cambió en varias escenas y no solo añadió campos técnicos.

## Prueba visible obligatoria en esta P1

- A001: Kang Muyeol muerto o muriendo dentro de la cápsula abierta; Seo Jun fuera, presenciándolo. Rifles o una reacción sola no sustituyen la muerte.
- A002: Kang elige/transfiere; su mano contacta el pecho de Seo y la herencia rojo-negra viaja inequívocamente `Kang → Seo`. La pared, la cápsula o el ambiente no pueden ser la fuente.
- A007: se ven dos o tres combatientes alejándose, restos del monstruo y Seo limpiando después; una toma solitaria de Seo no demuestra la jerarquía narrada.
- Cada átomo posterior conserva su actor, acción, receptor, fuente, dirección, resultado y objetos físicos mencionados.

## Gate esperado

- packet-only: `PACKET_READY`
- suite canónica: `46/46 PASS`
- estado final Director/Auditor: `PROMPT_RELEASE`
- estados prohibidos como entrega: `RELEASE`, `RENDER_READY` o un PASS declarado sin comando, SHA y exit code reales
