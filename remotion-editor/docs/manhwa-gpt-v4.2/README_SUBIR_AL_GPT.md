# Paquete Manhwa GPT V4.2

V4.2 corrige el fallo visual detectado en la primera salida de Después de los Guardianes. El JSON anterior era válido, pero confundía correspondencia narrativa con traducción palabra por palabra.

## Campo Instructions

Copiar únicamente:

- 00_INSTRUCCIONES_GPT_MANHWA_V4.2.md

Verificado: 7,278 caracteres, por debajo del límite de 8,000.

## Archivos Knowledge

Retirar las versiones V4.1 y subir:

- 01_REFERENCIA_NARRATIVA_V4.2.md
- 02_REFERENCIA_VISUAL_ASSETS_PROMPTS_V4.2.md
- 03_CONTRATO_JSON_MANHWA_V4.2.md
- 04_EJEMPLO_JSON_MECANICO_NEUTRO_V4.2.json

No subir como Knowledge los archivos 05–08. Son herramientas operativas:

- 05_VALIDACION_Y_QA_V4.2.md
- 06_CORRECCION_V4.1_RETIRADA.md
- 07_RESCATE_VISUAL_DESPUES_DE_LOS_GUARDIANES_P1_V4.2.md
- 08_PROMPTS_PILOTO_DESPUES_DE_LOS_GUARDIANES_V4.2.md

## Corrección de la Parte 1

Después de actualizar el GPT:

1. Abre un chat nuevo y adjunta la biblia aprobada, el monólogo, el JSON V4.1 rechazado y el archivo 08 de prompts piloto.
2. Copia el Mensaje 1 de 07.
3. Aprueba el shot plan solamente si cumple las cinco anclas y siete puntuaciones.
4. Usa 08 como patrón obligatorio de los prompts piloto.
5. Copia el Mensaje 2 de 07.
6. Genera primero once imágenes piloto y verifica la card de scene_30; no produzcas las 42 de inmediato.

## Qué cambió

- significado dramático en lugar de copiar sustantivos
- cinco paneles ancla obligatorios
- cinco a ocho puntuaciones visuales medibles
- máximo dos close/macro consecutivos
- límite de repetición del mismo prop
- prompts con longitud distinta según función
- transformaciones sin plates normales incompatibles
- prueba silenciosa antes de producir toda la Parte
- presentación cotidiana de lugares técnicos

## Qué retirar del GPT activo

- guía V3.2 y ejemplos antiguos
- archivos V4.1
- capítulos o PDF comerciales
- informes de auditoría

V4.2 debe ser la única autoridad activa. El ejemplo 04 demuestra contrato, nunca ambición ni contenido creativo.
