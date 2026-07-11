# Kit de auditoría y propuesta Manhwa V4

Este directorio no sustituye ni sobrescribe la V3.2. Es una propuesta de migración para probar en paralelo.

## Qué poner en el GPT

1. Copia únicamente `00_INSTRUCCIONES_GPT_MANHWA_V4.md` en el campo **Instructions** del GPT.
2. Sube como **Knowledge** los archivos de referencia técnicos que realmente vaya a consultar:
   - `01_REFERENCIA_NARRATIVA_V4.md`
   - `02_REFERENCIA_ASSETS_Y_PROMPTS_V4.md`
   - el contrato JSON vigente o su esquema mecánico
3. No subas el changelog de la V3.2, el informe de auditoría ni capítulos de obras reales como instrucciones de producción.
4. Conserva el validador del pipeline como autoridad del contrato. Los conteos mecánicos no deben depender de que el GPT “recuerde” una casilla.

La separación sigue la recomendación oficial de OpenAI: las instrucciones definen conducta y flujo; los archivos de conocimiento aportan material de consulta. El comportamiento crítico no debe quedar escondido solo en un archivo de Knowledge.

## Archivos

- `AUDITORIA_SENIOR_MANHWA_V3_2.md`: diagnóstico con evidencia del material entregado.
- `00_INSTRUCCIONES_GPT_MANHWA_V4.md`: núcleo activo compacto.
- `01_REFERENCIA_NARRATIVA_V4.md`: herramientas narrativas condicionales, sin contrato ni cámara.
- `02_REFERENCIA_ASSETS_Y_PROMPTS_V4.md`: plantillas técnicas y gramática visual.
- `03_PLAN_DE_VALIDACION_V4.md`: qué mover al validador y qué medir como aviso.

## Orden de migración recomendado

1. Duplicar el GPT actual para conservar un control V3.2.
2. Instalar solo el núcleo V4 y los archivos de referencia.
3. Probar tres pilotos deliberadamente distintos: conflicto social sin UI, acción sobrenatural y comedia/OP.
4. Usar la misma ficha de evaluación para comparar V3.2 contra V4.
5. No añadir una regla nueva por cada render fallido: clasificar primero si fue error creativo, de prompt, de referencia, del generador, del guardado o del editor.

## Estado de las ideas de layout

`staggered_duet`, gutters blancos, bordes, SFX y paneles dobles son recomendaciones para el editor. No deben añadirse como campos al JSON hasta que el pipeline los soporte. Mientras tanto, el GPT puede diseñar dos escenas consecutivas compatibles, pero no debe inventar `panel_layout` dentro del contrato actual.
