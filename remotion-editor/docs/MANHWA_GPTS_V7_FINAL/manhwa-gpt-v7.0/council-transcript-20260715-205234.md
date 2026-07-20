# LLM Council — narración bloqueada y 43 páginas Grok

Fecha: 2026-07-15

## Pregunta neutral

¿Cómo debe representar y temporizar Manhwa V7 43 páginas de webtoon generadas exclusivamente con Grok sobre un monólogo español bloqueado de 95 segundos y 24 líneas LF, sin cambiar su hash, romper subtítulos ni introducir Flow?

Opciones evaluadas:

- A: 24 escenas habladas + 19 páginas visuales sin voz, repartiendo cada intervalo hablado.
- B: dividir algunas líneas en fragmentos y reconstruir el monólogo mediante separadores declarados.
- C: reducir producción a 24 páginas y depender de multipaneles.
- D: separar unidades inmutables de narración y páginas visuales, vinculándolas con propietario y peso temporal.

Restricciones: 30–55 páginas de producción; para esta entrega, exactamente 43; mezcla 13 WHITE, 13 BLACK y 17 OTHER; audio y subtítulos continuos; monólogo byte-canónico intacto; proveedor de imagen Grok.

## Cinco asesores independientes

### Contrarian

La opción A es estructuralmente engañosa: esas páginas no son silenciosas, pues aparecen mientras continúa una línea hablada. Recomendó D: 24 `utterances` inmutables y 43 páginas con `utteranceId`, orden y peso o fracción temporal. Tras alinear audio, el runtime divide cada intervalo entre sus páginas. Los captions derivan de la unidad original. El reparto igual solo debe ser fallback; el Director debe aportar pesos.

### First Principles

El objetivo real no es añadir escenas con voz, sino desacoplar dos ritmos: narración y paginación. Recomendó una `narrationTrack` de 24 líneas canónicas y una `visualTrack` de 43 páginas con `narrationLineId`, orden y peso. El scheduler divide intervalos, cuantiza rangos semiabiertos y entrega el residuo de redondeo a la última página. Los captions permanecen ligados a la narración.

### Expansionist

Recomendó D por su valor futuro: `narrationUnits` inmutables y `visualPages` entre 30 y 55, cada una con unidad propietaria, peso, posición del beat y transición. Para este JSON, 43 páginas se distribuyen sobre 24 unidades, normalmente una o dos por línea. Director y Auditor pueden optimizar y verificar densidad visual sin tocar jamás el texto.

### Outsider

Un usuario entiende “24 líneas narradas emparejadas con 43 páginas temporizadas”; no debería aprender la ficción interna de “escenas silenciosas” ni reconstrucciones ocultas. Recomendó unidades byte-preservadas y páginas con propietario/peso, validando 24 unidades, 43 páginas, 13/13/17, rangos contiguos y cierre exacto. B expone demasiada maquinaria frágil y C incumple producción.

### Executor

Recomendó introducir primero una representación normalizada: unidades con ID/texto/alineación y páginas con propietario/peso/transición. Después: alineación de narración, partición determinista, absorción de residuo en la última página y gates duros de hash, conteos, mezcla, pesos, continuidad temporal, variedad visual y Grok exclusivo. Director y Auditor deben producir/verificar este mismo contrato.

## Anonimización para peer review

- A = Outsider
- B = Contrarian
- C = Executor
- D = Expansionist
- E = First Principles

## Peer review 1

Eligió A como la respuesta más completa por proteger texto, hash, 43 páginas, mezcla, captions y cierre de 2850 frames. Señaló que los pesos deben normalizarse dentro de cada intervalo, no globalmente. Consideró D la más incompleta por relajar 43 a un rango. Detectó como omisión común el contrato reproducible: versión de schema, UTF-8/canonicalización, IDs estables y pruebas round-trip fail-closed.

## Peer review 2

También eligió A. Valoró especialmente la propiedad explícita y los boundaries. Marcó como mayor vacío de D la falta de cuantización, Grok-only y hash explícito. Añadió que el contrato debe decir exactamente qué bytes se hashean: UTF-8, NFC, LF, orden y trailing newline; además necesita pruebas parsear → migrar → serializar.

## Peer review 3

Volvió a elegir A por cubrir todos los invariantes. Su hallazgo nuevo: el schedule derivado debe persistirse o ser reproducible de forma hashable; usar enteros o racionales, mínimo un frame por página, semántica explícita de solapes y prueba dorada de los 43 rangos semiabiertos.

## Where the Council Agrees

Los cinco asesores y los tres revisores coinciden: narración y páginas visuales son pistas distintas. El monólogo debe conservarse como unidades inmutables; las 43 páginas Grok deben referenciar esas unidades y recibir una fracción determinista de sus intervalos. Flow no participa.

## Where the Council Clashes

No hubo desacuerdo sobre la arquitectura. El único matiz fue si almacenar pesos o fracciones explícitas. La síntesis adopta pesos positivos declarados y un schedule derivado determinista; las fracciones/rangos materializados se validan como artefacto de runtime.

## Blind Spots the Council Caught

- “Página silenciosa” era un nombre incorrecto para una página mostrada durante habla.
- El alineador actual falla cuando la escena siguiente no tiene tokens.
- Un reparto global de pesos sería incorrecto; se normaliza por unidad de narración.
- Los floats no bastan como contrato reproducible; los frames deben formar rangos enteros, contiguos y semiabiertos.
- El hash debe declarar NFC + LF + UTF-8 + sin LF final.
- Hace falta una versión explícita del modelo y una prueba dorada round-trip.

## The Recommendation

Adoptar `NARRATION_VISUAL_TRACKS_V1` dentro de V7, sin crear otro flujo de usuario:

- `narration_track.units`: las 24 líneas exactas, con ID y speaker.
- `scenes`: las 43 páginas Grok existentes como pista visual.
- cada página declara `narration_ref.unit_id` y `timing_weight` positivo;
- el alineador calcula los intervalos de las 24 unidades y los divide entre sus páginas;
- captions y audio permanecen ligados a las unidades, no se duplican en las páginas;
- el contrato declara y verifica 43 páginas, mezcla 13/13/17 y proveedor `grok`.

## The One Thing to Do First

Implementar y probar la separación `narration_track` / `scenes[].narration_ref` antes de reconstruir los 43 prompts, porque el JSON correcto debe funcionar también en el editor y no solo aprobar preflight.
