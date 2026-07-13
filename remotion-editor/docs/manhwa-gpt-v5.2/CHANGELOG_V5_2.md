# Cambios V5.2

Esta revisión nace de auditar el MP4 completo de `El Barrendero de la Ruina — Parte 1` y someter la decisión a `llm-council`.

## Showrunner

- `target_runtime_seconds` manda sobre una cuota fija; predeterminado 80–105 s y 320–380 palabras sin calibración.
- Pregunta ≤3 s, título terminado ≤8 s, amenaza ≤25 s, agencia ≤45 s, manifestación ≤60% y payoff ≤75%.
- QA móvil de captions y fronteras de oración.

## Director

- 4–6 `TRUE_LONG_SHOT` por 40–50 ventanas con ocupación verificable; dos en clímax.
- Escalera geografía → anticipación → trayectoria → impacto → consecuencia → reacción.
- Performance pose limitada por beat; estados físicos reales de criatura.
- Contenedores transparentes conservan ocupante referenciado.
- Prompts ≤110 normalmente y HARD >120; pase de gramática/crop.
- 20–28% de respiros reales; 10–12 en 48 ventanas.

## Auditor y herramientas

- No puede otorgar release si el validador devuelve `PROMPT_REPAIR_REQUIRED`.
- Auditoría temporal, captions, audio móvil, FPS y MP4 final.
- Viralidad 0–100 por dimensiones, siempre como predicción.
- Finalizer conserva el FPS solicitado y captions no cruzan fronteras de oración.
- `llm-council` se usa en Codex, sin HTML, para decisiones de alto costo.
