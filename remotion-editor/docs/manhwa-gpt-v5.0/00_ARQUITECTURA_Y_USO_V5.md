# Manhwa V5 — arquitectura de producción escalable

## Decisión

La V5 usa tres GPTs especializados. No crea un GPT separado para hooks, otro para claridad y otro para premisas: esas tareas necesitan el contexto completo de la historia y viven como compuertas internas del Showrunner.

1. **Showrunner:** premisa, biblia compacta, Parte y monólogo bloqueado.
2. **Director visual:** shot plan interno, assets, prompts y JSON.
3. **Auditor-reparador:** narrativa, semántica visual, contrato y, cuando recibe renders, retakes.

Los GPTs personalizados no se llaman entre sí. En modo no-code el usuario realiza dos traspasos de archivos, pero no decide si cada etapa está bien: cada GPT lleva gates medibles y reescribe antes de entregar. La versión totalmente automática requiere un orquestador por API; el contrato `STORY_PACKET_V5` ya sirve para ese futuro.

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

1. Abrir un chat nuevo en **Manhwa V5 — Showrunner**.
2. Escribir `NUEVA SERIE AUTO` y una semilla opcional.
3. Guardar su `STORY_PACKET_V5.md`.
4. Abrir **Manhwa V5 — Director visual** y adjuntar ese paquete.
5. Escribir `PRODUCIR PARTE AUTO`.
6. Guardar el JSON completo.
7. Abrir **Manhwa V5 — Auditor-reparador**, adjuntar Story Packet y JSON.
8. Escribir `AUTO_REPAIR`.
9. Usar únicamente el JSON marcado `RELEASE`.
10. Tras generar imágenes, adjuntar renders o una tira/contact sheet al Auditor y escribir `AUDITAR RENDERS`.

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

El Auditor debe escribir `NOT_RUN` para esas áreas hasta recibir imágenes. Ningún prompt garantiza por sí solo el resultado.

## Configuración de los GPTs

En cada GPT, el contenido de `00_INSTRUCCIONES_*.md` se copia en el campo **Instructions**. Los archivos enumerados en su README se suben como **Knowledge**. Las reglas y el flujo viven en Instructions; los archivos de conocimiento son referencias, contratos y ejemplos.

Activa Code Interpreter & Data Analysis para el Director y el Auditor. El contrato admite como máximo veinte archivos de conocimiento por GPT; esta arquitectura utiliza menos.

## Principios V5

- Acción comercial es el perfil predeterminado, no una prohibición de tropos populares.
- Sistema, academia, portales, rangos, regresión, monstruo interior y protagonista subestimado están permitidos cuando cumplen una promesa emocional y tienen precio.
- Originalidad significa contradicción específica + herida + ventaja + costo + transformación, no evitar todo lo que vende.
- La biblia puede ser técnica. La voz debe ser oral y comprensible en una escucha.
- La imagen conserva la espectacularidad de V3.2 y adopta la continuidad, escala y semántica de V4.3.
- La cámara se diseña como secuencia legible, no como cuota de ángulos extremos.
- Los respiros son adaptativos: nunca cortan arbitrariamente una cadena de acción.

