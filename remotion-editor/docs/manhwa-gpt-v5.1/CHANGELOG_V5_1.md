# Cambios V5.1

Esta revisión nace de auditar los 32 renders de `El Barrendero de la Ruina — Parte 1`.

## Showrunner

- Gate de causalidad contra coincidencias acumuladas.
- Firmas visuales para que nombres similares no sean ambiguos.
- Mapa emocional con gestos observables.
- Cadena espacial con ocupación dentro/fuera.
- Cadena de estados de amenaza.
- 5–8 audio tags en inglés para monólogos de 410–460 palabras.

## Director visual

- Separación entre base neutral, outfit state y performance pose.
- Poses expresivas para peligro, esfuerzo, dolor, shock y desafío.
- Estados distintos de criatura: atrapada, carga, impacto y caída.
- Mapa descriptivo de cada referencia dentro del prompt; nunca solo nombres.
- Regla estricta de ocupación para cápsulas, vehículos y habitaciones.
- Prohibición de pedir personajes identificables sin referencia en paneles cargados.
- Límites de palabras y duración por imagen; objetivo habitual de 38–44 escenas para 410–460 palabras.
- Respiros visuales contados realmente: 20–28%, normalmente 8–11.

## Auditor

- Estados separados: `PROMPT_RELEASE`, `RETAKES` y `RENDER_RELEASE`.
- Prohibido declarar final con `Renders: NOT_RUN`.
- Auditoría de duración, neutralidad, poses repetidas y role maps.
- Auditoría de renders archivo por archivo con identidad, ocupación, emoción y estado.
- El resultado observable gana al texto del prompt.

## Herramientas

- Validador local ampliado con carga/duración, respiros, tags, poses y señales de neutralidad.
- Eval específico para dos hombres junto a una cápsula y otro para criatura con cuatro estados.
- El timeline manhwa sostiene 0.45 s el último plano tras el audio para no cortar la liberación de la última sílaba.
