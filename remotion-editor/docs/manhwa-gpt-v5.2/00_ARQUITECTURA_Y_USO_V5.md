# Manhwa V5.2 — arquitectura de producción escalable

## Decisión

La V5.2 usa tres GPTs especializados. El Auditor trabaja en preflight, renders y MP4 final. `llm-council` vive en Codex para decisiones de publicar/reparar/descartar; no se sube como Knowledge.

1. **Showrunner:** premisa, biblia compacta, Parte y monólogo bloqueado.
2. **Director visual:** shot plan interno, assets, prompts y JSON.
3. **Auditor-reparador:** narrativa, semántica visual, contrato y, cuando recibe renders, retakes.

Los GPTs personalizados no se llaman entre sí. En modo no-code el usuario traslada los artefactos, pero no realiza la evaluación creativa: cada GPT lleva gates medibles. La versión totalmente automática requiere orquestación por API.

## Por qué esta división

- El Showrunner no ve reglas de Grok, JSON, plates ni TTS mientras escribe. Así conserva emoción, oralidad y energía comercial.
- El Director no cambia una palabra aprobada. Traduce significado a puesta en escena y compila.
- El Auditor no inventa la historia. Detecta fallos, repara y devuelve el artefacto completo.
- Un GPT exclusivo de hooks tendería a producir aperturas espectaculares desconectadas del arco.
- Un GPT exclusivo de claridad podría sobreexplicar. La prueba de oyente frío debe ocurrir dentro del Showrunner.

## Modos

### AUTO — predeterminado

Cada GPT ejecuta sus pases internos, corrige hasta superar los gates y entrega el paquete de traspaso. No espera aprobaciones intermedias.

### TALLER — opcional

Detiene concepto, biblia, monólogo y shot plan para revisión humana. Se usa al desarrollar un formato nuevo, no para producción cotidiana.

## Flujo no-code

1. Abrir un chat nuevo en **Manhwa V5.2 — Showrunner**.
2. Escribir `NUEVA SERIE AUTO` y una semilla opcional.
3. Guardar su `STORY_PACKET_V5.md`.
4. Abrir **Manhwa V5.2 — Director visual** y adjuntar ese paquete.
5. Escribir `PRODUCIR PARTE AUTO`.
6. Guardar el JSON completo.
7. Abrir **Manhwa V5.2 — Auditor-reparador**, adjuntar Story Packet y JSON.
8. Escribir `AUTO_REPAIR_PREFLIGHT`; conservar el JSON `PROMPT_RELEASE`.
9. Generar bases y 6–8 pilotos. Adjuntarlos al Auditor con `AUDITAR RENDERS`.
10. Si hay `RETAKES`, regenerar solo esas escenas. Si los pilotos pasan, generar la Parte completa.
11. Volver a `AUDITAR RENDERS` con todos los archivos numerados.
12. Crear proof cut dentro de `target_runtime_seconds`, auditar MP4/captions/audio y usar como final únicamente `RENDER_RELEASE`.

## Qué valida automáticamente y qué no

Puede automatizarse sin juicio humano:

- fuerza de premisa, hook, promesa emocional y loop
- claridad del monólogo y densidad técnica
- conteos, contrato, referencias y TTS
- cámara declarada, anclas, ritmo y color planificados
- correspondencia semántica entre voz y prompt

No puede certificarse sin ver el render:

- identidad real
- manos y anatomía
- escala producida por el modelo
- texto inventado
- continuidad visual efectiva

El Auditor debe escribir `RENDER_PENDING` para esas áreas hasta recibir imágenes. Ningún prompt garantiza por sí solo el resultado. `PROMPT_RELEASE` autoriza generar; no certifica el render.

## Configuración de los GPTs

En cada GPT, el contenido de `00_INSTRUCCIONES_*.md` se copia en el campo **Instructions**. Los archivos enumerados en su README se suben como **Knowledge**. Las reglas y el flujo viven en Instructions; los archivos de conocimiento son referencias, contratos y ejemplos.

Activa Code Interpreter & Data Analysis para el Director y el Auditor. El contrato admite como máximo veinte archivos de conocimiento por GPT; esta arquitectura utiliza menos.

## Principios V5.2

- Acción comercial es el perfil predeterminado, no una prohibición de tropos populares.
- Sistema, academia, portales, rangos, regresión, monstruo interior y protagonista subestimado están permitidos cuando cumplen una promesa emocional y tienen precio.
- Originalidad significa contradicción específica + herida + ventaja + costo + transformación, no evitar todo lo que vende.
- La biblia puede ser técnica. La voz debe ser oral y comprensible en una escucha.
- La imagen conserva la espectacularidad de V3.2 y adopta la continuidad, escala y semántica de V4.3.
- La cámara se diseña como secuencia legible, no como cuota de ángulos extremos.
- Los respiros son adaptativos: nunca cortan arbitrariamente una cadena de acción.
- Las bases conservan neutralidad; la actuación usa performance poses y gestos observables.
- El prompt describe visualmente cada referencia y su ubicación; el nombre no enseña identidad al motor.
- La duración objetivo manda sobre una cuota fija de palabras; Parte 1 entrega amenaza ≤25 s, agencia ≤45 s y payoff ≤75%.
- `TRUE_LONG_SHOT` se mide por ocupación, no por escribir `wide`.
- Ningún panel normal supera 18 palabras ni aproximadamente 5 segundos editados.
- Captions respetan fronteras de oración y el MP4 conserva el FPS declarado.
- `RENDER_RELEASE` exige inspección real escena por escena.
