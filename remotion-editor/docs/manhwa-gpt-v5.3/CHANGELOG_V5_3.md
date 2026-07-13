# Changelog V5.3

## Problema corregido

V5.2 permitía aprobar un porcentaje de “respiros” mezclando cards, devices, body details, ambiente, negativos y composites. También limitaba blancos a tres. Eso produjo cumplimiento numérico sin verdadera página webtoon, y dejó pasar planos lejanos nominales, aproximaciones ausentes y continuidad débil.

## Solución

- Cuatro ejes independientes: layout, escala, actuación y fase de acción.
- Cuotas escaladas y distribuidas para blancos, cards, fragmentos, reacciones, TRUE_LONG, approach y TALL_ACTION.
- 32–40% de puntuaciones únicas, sin permitir que esa unión sustituya mínimos de familia.
- Tres o más familias blancas y varios layouts; sin cap artificial.
- Black text cards confiables mediante editor, no lettering largo generado.
- Ledger `before → action → after` y locks de dueño/ocupación/localización.
- Prompt con identidad visible; el nombre del asset nunca basta.
- Bases limpias y neutras; performance poses con silueta/emoción compatible.
- Validador único V5.3 que rechaza el falso cumplimiento de V5.2.
- Separación estricta de autoridad entre Showrunner, Director y Auditor.
- `production_lock` compara hash, monólogo y voz contra el Story Packet adjunto.
- `visual_plan` y `continuity` son datos contractuales por panel, no palabras clave ocultas en el prompt.
- Mínimos y máximos HARD, 1–2 BLACK_INSET y distribución inicio/medio/final.
- Rampas y secuencias major se validan por pasos ordenados; assets y TTS fallan cerrado si faltan campos.
