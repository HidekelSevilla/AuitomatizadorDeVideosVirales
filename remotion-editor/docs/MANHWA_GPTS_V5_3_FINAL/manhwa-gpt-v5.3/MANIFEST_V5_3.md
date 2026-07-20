# Manifest canónico Manhwa V5.3

Paquete final de configuración para tres GPT separados: Showrunner, Director Visual y Auditor-reparador. Remotion conserva únicamente la función de edición; este paquete no añade Render QA al proyecto.

## Validador único

- archivo: `scripts/validate_v5_3.py`
- `VALIDATOR_VERSION`: `5.3.7`
- bytes: `257021`
- SHA-256: `97be928cd5bda122b6f83cccd6cf89ead4102785e84ee9d267b05653ed5b59f8`

Showrunner, Director y Auditor deben usar exactamente este archivo. Un hash distinto significa copia antigua, archivo modificado o validador no canónico; en ese caso no existen `PACKET_READY` ni `PROMPT_RELEASE`.

`validate_v5_3.py` es **runtime-only**. No dependas de su copia indexada en Knowledge: guárdalo una vez en File Library y adjúntalo como archivo de conversación en cada chat que deba validar. El GPT lista `/mnt/data`, descubre la ruta montada y ejecuta esa copia. `MANIFEST_V5_3.md` permanece en Knowledge como autoridad de versión/SHA y puede adjuntarse también; no necesita estar montado si su contenido canónico se recupera sin conflicto.

## Verificación local

PowerShell:

```powershell
(Get-FileHash -Algorithm SHA256 .\scripts\validate_v5_3.py).Hash.ToLower()
```

Python:

```text
python -c "from pathlib import Path; import hashlib; p=Path('scripts/validate_v5_3.py'); print(hashlib.sha256(p.read_bytes()).hexdigest())"
```

El resultado debe ser exactamente el SHA-256 publicado arriba.

## Instructions: límite de 8.000 caracteres

| GPT | Archivo | Caracteres | Bytes UTF-8 |
|---|---|---:|---:|
| Showrunner | `gpt_1_showrunner/00_INSTRUCCIONES_SHOWRUNNER_V5_3.md` | 7.806 | 7.948 |
| Director Visual | `gpt_2_director/00_INSTRUCCIONES_DIRECTOR_VISUAL_V5_3.md` | 7.781 | 7.968 |
| Auditor-reparador | `gpt_3_auditor/00_INSTRUCCIONES_AUDITOR_REPARADOR_V5_3.md` | 7.799 | 7.903 |

Los tres archivos cumplen el límite solicitado, tanto por caracteres como por bytes UTF-8.

## Story Packet P1 de producción

- archivo: `STORY_PACKET_P1_PRODUCTION_V5_3.md`
- SHA-256 del archivo: `e3902ef8abc1c857b9198925aa9fa9a7538eb6bad605ac35403bd25bb500ccd8`
- SHA-256 de `MONOLOGO_LOCKED`: `9a3e199a985889351b1bc50147142980eef701da04b7674fc365fee881cda028`
- palabras habladas sin tags: `339`
- caracteres del monólogo con tags: `2053`
- objetivo: `97 s`
- rango contractual: `[90,100] s`
- preflight: `PACKET_READY`
- segmentabilidad: `47` átomos, `46` hablados, `1` control `[pause]`, máximo `15` palabras
- fidelidad factual: `47/47` entradas `voice_visual_lock`, con pronombres/elipsis y dirección causal resueltos

## Verificación final

- suite canónica: `46/46 PASS`
- compilación Python: `PASS`
- manifest de assets de ejemplo: `PASS`
- Story Packet P1: estructura, spans, voz, tags, estados, hashes y segmentabilidad `PASS`
- regresiones semánticas: actor/target/fuente ausente, dirección invertida, sujeto elíptico roto, acción no visible, hook sustituido, pluralidad/props simulados, views/poses sin uso y reparaciones laterales quedan bloqueadas
- estilo de ingredientes: toda pose/view `generate` exige ancla manhwa 2D tipada y autosuficiente
- documentación y validador: sin bloqueos reproducibles

Desde la raíz del repositorio:

```powershell
python -m unittest discover -s .\tests -p "test_*.py" -v
```

## Ejecución dentro de los GPT

Los comandos siguientes son formas lógicas. Sustituye cada ruta por el nombre real descubierto tras listar `/mnt/data`; no supongas `Pasted text.txt`, `FINAL.json` ni que Knowledge montó el Python. Si el validador no está adjunto y ejecutable en ese chat, el estado es `BLOCKED_INPUT`.

Preflight obligatorio del Showrunner:

```text
python /mnt/data/validate_v5_3.py --packet-only "/mnt/data/NOMBRE_EXACTO_DEL_PACKET.md"
```

P1 sin assets `existing`:

```text
python /mnt/data/validate_v5_3.py "/mnt/data/FINAL.json" "/mnt/data/NOMBRE_EXACTO_DEL_PACKET.md"
```

P2+ o cualquier JSON que use `existing`:

```text
python /mnt/data/validate_v5_3.py "/mnt/data/FINAL.json" "/mnt/data/NOMBRE_EXACTO_DEL_PACKET.md" "/mnt/data/NOMBRE_EXACTO_DEL_MANIFEST.json"
```

No edites ni renombres el Story Packet o el manifest antes de calcular `production_lock`: el validador enlaza los bytes reales mediante SHA-256.
