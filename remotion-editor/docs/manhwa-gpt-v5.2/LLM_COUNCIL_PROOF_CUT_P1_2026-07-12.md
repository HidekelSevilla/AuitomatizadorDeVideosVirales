# LLM Council — Proof Cut P1 (2026-07-12)

## Pregunta

¿El archivo `el_barrendero_de_la_ruina_parte_01_PROOF_CUT_V5_2_AUTO_REPAIR_PROMPT_RELEASE.json` está listo para producción completa?

## Evidencia reproducible

- SHA-256 del JSON: `B04251E4C9889E6323DE32D726E175157E0D1DDA5C19B8CD78EB017ACB3D2437`.
- SHA-256 de `validate_v5.py`: `CC6492C148F9EB2C6B9DDDFB64BFAFD791BBAEBF40BF64D9CF5446E4169997A0`.
- SHA-256 de `validate_v5.mjs`: `3515E4FEFD4439A6CC191A516EF9C4F529254B86C0B2610C26A17F04E869E5E6`.
- Ambos validadores locales terminan con código `1`: contrato estructural `PASS`, preflight `PROMPT_REPAIR_REQUIRED`.
- El código `0` declarado por el Auditor no pudo reproducirse con los validadores V5.2 del repositorio.

## Cinco lentes independientes

### Lente contraria

Rechaza la producción completa. Señala que el sello de release no es reproducible, ninguna supuesta toma larga cumple la definición completa, faltan respiros, hay prompts saturados y referencias incompletas en la cápsula. Recomienda una reparación antes de cualquier lote.

### Lente de primeros principios

Separa el guion de la implementación. El arco comercial ya funciona: hook, peligro, decisión, transferencia, payoff y cliffhanger están bien ordenados. Los problemas restantes están en prompts, poses, referencias y evidencia de validación. Recomienda conservar el monólogo y reparar antes de un piloto.

### Lente expansionista

Considera que el proyecto merece continuar por su estructura comercial, pero no financiar 41 imágenes sin probar los planos de mayor riesgo. Propone reparar y probar hook, monstruo, cápsula, transferencia, poder, impacto y círculo de rifles.

### Lente externa

Advierte que el Auditor optimizó etiquetas como `TRUE LONG SHOT` sin lograr composiciones realmente amplias. Identifica como riesgos principales la cápsula sin Kang referenciado, la reutilización de poses y prompts de 100–132 palabras. Distingue correctamente assets JPG existentes y resultados viejos de audio/video.

### Lente ejecutora

Propone la secuencia operativa: reparación acotada, validación reproducible, TTS nuevo, piloto de ocho escenas y producción completa solo tras criterios de GO. No recomienda reescribir P1.

## Revisión anónima

Los tres revisores coincidieron en la misma decisión. También corrigieron excesos del validador:

- Algunos `shot missing` son falsos positivos ante expresiones como `body-detail`, `reaction shot` y `side-profile`.
- La métrica de 150 palabras por minuto es una estimación; el timing definitivo debe venir del TTS nuevo alineado.
- El 9.3% automático subcuenta algunos tratamientos; una revisión generosa ronda 14%, todavía bajo el 20% buscado.
- El nombre de Park Mira usado solo para excluirla del encuadre no demuestra que deba referenciarse.
- Exigir tokens literales o porcentajes es un proxy; la composición debe comunicar escala en lenguaje natural.
- Los assets sí existen como JPG y el resolver flexible los admite.
- FPS, duración y cola del audio/video anterior no deben juzgar este proof cut.

## Bloqueos reales

1. `scene_19` y `scene_19a` describen a Kang dentro de una cápsula transparente, pero no incluyen su referencia de personaje.
2. Cinco prompts superan 120 palabras: `scene_19`, `scene_24a`, `scene_25`, `scene_28`, `scene_31`; dieciséis exceden su límite por tipo.
3. Cero de cinco candidatos cumplen por completo la definición de toma ambiental larga. Faltan tamaño relativo, dominio del entorno y capas de profundidad; `scene_10` y `scene_28` además usan menos de doce metros.
4. Los respiros visuales reales se estiman cerca de 14%, no 24.42%; faltan al menos tres tratamientos inequívocos.
5. Poses de actuación se reutilizan entre emociones y acciones incompatibles: Kang moribundo nueve veces, Seo Jun en dolor nueve, Seo agotado ocho, niño en terror ocho y Mira en pánico siete.
6. `[cold]` se usa en narración humana en `scene_39`, aunque el contrato V5 lo reserva al sistema.
7. Algunos paneles, especialmente `scene_31`, intentan mostrar varios instantes sucesivos en una sola imagen.

## Veredicto del Chairman

No producir todavía las 41 imágenes y no rehacer la P1. Ruta aprobada:

`reparación visual acotada → TTS nuevo y alineado → piloto de ocho escenas → producción completa`.

Confianza aproximada: 90%.

Puntuaciones:

- Potencial narrativo/viral: 84/100 ±5.
- Preparación visual actual: 58/100 ±8.
- Preparación para producción completa: 60/100.
- Potencial tras reparación y piloto aprobado: 86–90/100.

## Piloto recomendado

- `scene_03`: escala del cerco de ejecución.
- `scene_10`: monstruo y plano ambiental.
- `scene_17`: interacción física de tres personajes.
- `scene_19`: cápsula transparente con Kang como único ocupante.
- `scene_24a`: Kang dentro, Seo Jun fuera y contacto exacto.
- `scene_28`: manifestación amplia.
- `scene_31`: ataque, movimiento e impacto.
- `scene_35`: miedo/rechazo legible de Mira.

## Criterios de GO

- Ambos validadores auténticos sobre el mismo SHA en código 0, o excepciones documentadas solo para falsos positivos conocidos.
- Al menos 7/8 pilotos utilizables a la primera.
- `scene_19` y `scene_24a` deben pasar obligatoriamente.
- Cero swaps de identidad u ocupación de cápsula.
- Emoción y acción legibles en al menos 6/8.
- Los planos amplios deben mostrar personas pequeñas dentro de un escenario dominante y coherente.
- TTS real de 90–100 segundos, payoff antes del 75% y cola final de 0.8–1.0 segundos sin voz truncada.
- Render definitivo a 30 fps.
