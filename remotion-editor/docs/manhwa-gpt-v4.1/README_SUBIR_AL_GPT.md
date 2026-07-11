# Paquete Manhwa GPT V4.1

Este directorio contiene el paquete de producción que debe usar el GPT. Sustituye, para uso activo, a la guía V3.2 y a sus ejemplos narrativos.

## Qué colocar en el GPT

### Campo Instructions

Copiar únicamente el contenido de:

- 00_INSTRUCCIONES_GPT_MANHWA_V4.1.md

Versión compacta verificada: 7,411 caracteres, por debajo del límite de 8,000.

### Archivos Knowledge

Subir:

- 01_REFERENCIA_NARRATIVA_V4.1.md
- 02_REFERENCIA_VISUAL_ASSETS_PROMPTS_V4.1.md
- 03_CONTRATO_JSON_MANHWA_V4.1.md
- 04_EJEMPLO_JSON_MECANICO_NEUTRO_V4.1.json

Los archivos 05 y 06 son operativos para el creador y no necesitan permanecer como Knowledge:

- 05_VALIDACION_Y_QA_V4.1.md
- 06_CORRECCION_DESPUES_DE_LOS_GUARDIANES_P1.md

## Qué retirar del GPT activo

No mantener simultáneamente como Knowledge:

- GUIA_MAESTRA_MANHWA_2_generador_json_V3.2.md
- EJEMPLOS_PROMPTS_GROK_manhwa_V3.2.md
- EJEMPLO_CONTRATO_JSON_MANHWA_V2_8_LIMPIO
- capítulos o PDF de obras comerciales
- informes de auditoría

Esos documentos contienen ejemplos de sistema, lectores, cazadores, términos de manga y decisiones antiguas que el modelo puede reutilizar aunque una instrucción diga que no lo haga.

Pueden conservarse fuera del GPT como archivo histórico, pero V4.1 debe ser la única autoridad de producción.

## Autoridad

1. Petición explícita reciente del usuario.
2. Canon y entregables aprobados en el chat.
3. 00_INSTRUCCIONES_GPT_MANHWA_V4.1.md.
4. 03_CONTRATO_JSON_MANHWA_V4.1.md.
5. Referencias 01 y 02.
6. Ejemplo mecánico 04.

El ejemplo demuestra forma, nunca contenido creativo.

## Flujo nuevo

1. Concepto.
2. Biblia.
3. Monólogo.
4. Shot plan visible.
5. JSON completo.
6. Validación.
7. Generación piloto de assets y paneles críticos.
8. Producción completa.

La nueva compuerta de shot plan evita que el GPT intente inventar historia, cámaras, assets, continuidad, prompts y contrato en una sola pasada.

## Nota sobre layouts

Los paneles dobles, gutters y composiciones como floating_single, staggered_duet o detail_strip pertenecen al editor. No deben aparecer como campos JSON hasta que Remotion los soporte.
