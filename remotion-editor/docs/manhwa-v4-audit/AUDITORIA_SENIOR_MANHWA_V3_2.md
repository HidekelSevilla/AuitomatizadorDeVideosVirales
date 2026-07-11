# Auditoría senior — Preset Manhwa V3.2

## Veredicto

No faltan reglas. Sobran reglas activas al mismo tiempo y faltan tres sistemas externos al texto:

1. separación real por fase
2. validador mecánico
3. QC visual de assets y renders

La V3.2 contiene conocimiento valioso, pero lo mezcla con changelog, justificaciones, ejemplos de una misma serie, contrato, dirección, guion, audio y postproducción. El modelo puede cumplir muchas señales superficiales y aun fallar la intención.

El JSON real demuestra exactamente eso: todos los prompts nombran plano, ángulo, hora, tres capas y luz; aun así las referencias son incompatibles, los personajes quedan sobredimensionados, no hay respiros reales y 73 de 75 paneles quedan inmóviles.

El validador vigente devuelve `ok: true`, cero errores y solo 17 warnings por `references.scenes`; no detecta ninguna de esas fallas.

## Evidencia de carga y priming

- Guía maestra: 967 líneas y alrededor de 29.300 palabras.
- Anexo de prompts: 347 líneas y alrededor de 6.800 palabras.
- Antes de sumar instrucciones activas, biblia y JSON ya existen más de 36.000 palabras de referencia.
- La guía repite aproximadamente 205 veces `sistema/system`; el anexo añade unas 22.
- `jade` aparece unas 58 veces entre ambos.
- `Lee Han/Han` aparece cerca de 68 veces.
- Las obras usadas como referentes se nombran repetidamente dentro del contexto de producción.

Una negación no obliga por sí sola a copiar un tropo, pero la repetición lo vuelve muy disponible. El problema más fuerte no es solo “no uses X”: el anexo funciona como un few-shot coherente de una misma pseudo-serie — personaje, hospital, túnel/callejón, interfaz, poder y amenaza. Un ejemplo técnico también enseña contenido narrativo.

El contrato de ejemplo agrava el sesgo: lector único, novela que cobra vida, metro e interfaz forman una premisa muy próxima a una obra conocida. Debe conservarse únicamente como fixture técnico o sustituirse por una plantilla neutral.

La documentación oficial de OpenAI recomienda instrucciones explícitas por pasos, formulaciones positivas y concretas, y eliminar reglas duplicadas o contradictorias. También distingue conducta en **Instructions** y material de consulta en **Knowledge**: [Creating and editing GPTs](https://help.openai.com/en/articles/8554397-) y [Troubleshooting GPTs](https://help.openai.com/en/articles/11325361-why-cant-i-download-files-generated-by-my-custom-gpt).

## Problemas de arquitectura de la guía

### Cinco trabajos en un contexto

El GPT actúa simultáneamente como:

- creador de concepto
- guionista
- director de cámara
- diseñador de assets
- compilador y validador JSON

El flujo dice que hay fases, pero todas las reglas siguen presentes y compiten en cada turno. La solución no es solo poner más encabezados: el núcleo activo debe ser corto y los módulos técnicos deben consultarse cuando su condición exista.

### El estilo visual decide el género

La guía describe manhwa mediante progresión, regresión, sistemas, torres y rangos, aunque luego declara que esos elementos son opcionales. Deben separarse:

- `visual_language`: gramática webtoon/manhwa vertical
- `story_engine`: el género y motor de ESTA serie

La estética no debe crear automáticamente el mundo.

### Causalidad en la granularidad incorrecta

La causalidad debe evaluarse por bloques narrativos. Una scene del JSON puede ser un insert, reacción, card, master o pausa. Exigir que cada clip cause el siguiente y abra/pague una pregunta vuelve imposible respirar y empuja a ilustrar literalmente cada frase.

Regla sustituta:

> Cada bloque cambia objetivo, riesgo, información o relación y depende del bloque anterior. Los planos dentro del bloque pueden establecer, enfatizar, reaccionar, mostrar consecuencia o transicionar.

### Reglas condicionales convertidas en universales

R11 pide capas explícitas en secuencias complejas, pero las instrucciones comprimidas perdieron ese alcance. El JSON aplicó foreground/midground/background y mapa de luz a los 75 prompts. Lo mismo ocurre con rim light, fondo pintado, cámara y hora en assets técnicos.

Toda regla especializada necesita condición visible:

- SI hay tres participantes → master y reanclaje.
- SI hay UI → módulo UI.
- SI hay cuerpo tumbado → contactos y cabeza.
- SI hay texto raster → string exacto.
- SI hay master de escala → plano de suelo y ratio.

Si la condición no existe, la regla no participa.

## Contradicciones relevantes

| Conflicto | Efecto |
|---|---|
| Cold open universal vs cuatro modos de voz | El modelo combina fórmulas incompatibles. |
| Dueto 70% en primera persona vs `leyenda_3p` | La excepción termina obedeciendo el default. |
| El poder siempre cobra vs opción sin costo directo | El sistema inventa castigos aunque la serie no los necesite. |
| 570 palabras permitido vs “NO 570” en instrucciones | La salida real se acerca otra vez a 570. |
| Máximo dos cargadas seguidas vs “nunca dos” en el anexo | No existe un criterio único. |
| Extras `blurred` recomendados y luego prohibidos | Los ejemplos pesan tanto como la regla. |
| Eliminar scene refs primero vs conservar la ref del objeto | Prioridad de referencias ambigua. |
| “Ángulo” mezcla close/wide con high/low | El checklist mide categorías diferentes como una sola. |
| Positivos siempre vs múltiples negativos en plantillas | El absoluto no refleja el uso real. |
| Un ancla para todo vs fondo especial por tipo | Los assets reciben luz de escena y las escenas respirables quedan densas. |

## Auditoría del JSON real

Archivo: `segundo_portador_parte_01_CONTRATO_LIMPIO.json`.

### Lo correcto

- JSON válido.
- 76 escenas: 75 paneles y una card.
- IDs secuenciales.
- Ninguna escena supera tres refs.
- Paneles estáticos y sin animation prompts.
- `full_script` y diálogo son espejo exacto.
- 3.294 caracteres: una generación de voz.
- Todos los prompts tienen plano, ángulo y hora.
- 40% de paneles no muestran al protagonista de cuerpo.

### Lo que explica la planitud

- 73/75 paneles tienen `editor_motion.enabled:false`. El override local anula el ciclo global.
- 52/75 son medium o close-up.
- Hay rachas de diez planos cerrados sin reanclaje.
- 75/75 repiten fondo pintado, rim light, alto contraste y tres capas.
- Hay cero paneles blancos, cero negros, cero sepia y una sola card.
- 62 paneles usan el callejón; domina una sola localización, franja nocturna y combinación rojo/azul.
- 63/75 prompts superan 80 palabras; media aproximada 84–85.

Variar el nombre del ángulo no crea variedad si todos los planos tienen la misma densidad, acabado y escala.

### El monólogo

- Alrededor de 533 palabras útiles, aproximadamente 24% sobre el objetivo 430.
- 82 oraciones; cerca de la mitad tienen cinco palabras o menos.
- Hay numerosos pares staccato, aunque el estilo dice reservarlos.
- La mini-victoria principal llega alrededor del 60%, no antes del valle.
- Varias unidades internas se representan con otro close del rostro en vez de una evidencia visual o layout.
- El final vuelve a explicar la premisa del hook.

El guion tiene una premisa legible y una buena consecuencia pública, pero está sobre-rebanado: 75 ilustraciones full-bleed para una historia de una sola noche producen slideshow aun con cámara variada.

### Continuidad y conocimiento

Ejemplos:

- `scene_19`: la voz dice que el aire se dobla antes que el metal; la imagen ya dobla camión y paredes.
- `scene_30`–`scene_32`: tres close-ups similares para una sola conclusión interior.
- `scene_39`: “piensa en su hermana” se ilustra con otra expresión; era mejor usar recuerdo, insert o layout.
- `scene_50`–`scene_58`: diez medium/close para el rechazo de la civil.
- `scene_64` y `scene_67`: la primera persona narra datos del centro de control que no presencia.
- `scene_69`–`scene_70`: aparece una pantalla pública que no estaba fijada en el escenario.
- `scene_75`–`scene_76`: el tableau se repite y el cierre reexplica el hook.

## Por qué falla `scene_01`

La imagen no falla porque “bird's-eye” sea malo. Falla por referencias incompatibles:

- objetivo: wide bird's-eye
- Tae-woo: asset medium low-angle
- civil: asset medium high-angle con suelo y lluvia horneados
- escenario: wide bird's-eye

Aurora recibe dos retratos dominantes y un plate. Conserva la escala de los retratos y negocia el resto. El camión queda recortado, los adultos dominan el mapa y la comparación física pierde credibilidad.

Además, el prompt empieza por los personajes. En un master espacial debe empezar por geometría y escala.

Corrección conceptual:

> Spatial master of the alley, very high oblique wide view with near-orthographic perspective and one shared asphalt ground plane. The complete containment truck spans the lower third. Six meters behind it, two full-body adults occupy at most fifteen percent of frame height, both feet touching the same ground plane. The threat remains twelve meters farther along the established axis. Stable verticals and readable size falloff.

Para ese master usa el plate compatible y, como máximo, bases full-body limpias. Si los personajes son pequeños, descríbelos por ropa y posición; no adjuntes retratos medianos.

## Por qué fallan los ingredientes

El contrato dice que todo personaje tiene base, pero el JSON real no lo cumple:

- 3/5 personajes no tienen `base`.
- `seo_ijun/base` es un medium de perfil dentro de un control room.
- la base de Tae-woo está mojada, sucia y emocionalmente cansada.
- 14/14 prompts dicen `at night` junto a `plain neutral gray background`.
- 0/14 pide expresión neutral.
- solo 1/14 pide manos vacías.
- 9/14 son medium; solo 2 son full.

Los archivos confirman el problema:

- `guardian_anon_advance.jpg` está recortado, bajo lluvia y con dron.
- `civil_woman_trapped.jpg` es un retrato de terror con mano adelantada.
- `civil_woman_crouch.jpg` tiene suelo mojado horneado.
- `seo_ijun_base.jpg` contiene el centro de control y texto de armadura.
- `hayoon_capsule_sleep.jpg` contiene el callejón, guardianes y camión; no contiene a Ha-yoon.

La base correcta necesita su propia ancla técnica, sin rim light dramático ni fondo pintado. Las derivadas deben cambiar estado/outfit, no convertirse en escenas recortadas.

## Posible cruce de resultados en el pipeline

El caso de Ha-yoon es demasiado ajeno al prompt para atribuirlo solo a interpretación visual. Hay una vía plausible en el código:

- al cerrarse el canal, `sendGrokGenerateImage` llama a `COLLECT_IMAGE`
- la recuperación exige estar en alguna ruta `/imagine/post/`
- no exige que el post pertenezca al intento actual
- el resultado recuperado se guarda bajo el ingrediente activo

Esto permite que una imagen anterior visible se asocie con un retry nuevo. La conclusión es de alta probabilidad, no una prueba definitiva sin el log de esa corrida.

El fix necesita correlación por `post_id` o token de intento y rechazo si la ruta no cambió.

## Plates contaminados

Los escenarios también hornean estados narrativos:

- el camión vive en el plate aunque después vuelca
- la Fractura vive brillante en el plate aunque luego se comprime
- una view de hospital incluye la mano de una niña
- views del centro incluyen operadores
- el mapa incluye la mancha narrativa

Un plate debe contener solo arquitectura y props permanentes. Camión, barrera, Fractura, pantallas activas y cuerpos necesitan assets/estados separados. De lo contrario el texto compite con la imagen de referencia y la continuidad se rompe aunque el prompt sea preciso.

## Qué enseñó el PDF válido

`lector-omnisciente-n-01.pdf` no es un capítulo: es una ficha de prensa de una página con la imagen rota. No puede usarse como evidencia visual.

`Ch 040.pdf` sí contiene 37 segmentos verticales y fue revisado completo.

Métricas aproximadas:

- 76 bloques visuales mayores.
- 67% casi full-width; 15% inserts estrechos.
- 32% de bloques muy cortos; solo 12% splashes mayores de una pantalla.
- blanco: 38,3% del área total, 33,4% en pelea y 46,5% en recompensa/reflexión.
- gutter blanco: alrededor de 22% de la altura.
- bird's-eye extremo: dos usos, cerca de 4% de imágenes narrativas.

La gramática dominante es:

> master → detalle → reacción → impacto → consecuencia

El blanco cambia con el beat. No es 40% de clips vacíos. Es layout, distancia y tiempo de lectura.

El doble panel que imaginó el usuario sí aparece: dos imágenes independientes del mismo instante, una arriba-izquierda y otra abajo-derecha sobre lienzo blanco. No es una sola ilustración generada con dos escenas complejas.

## Respuesta sobre paneles blancos y dobles

Sí conviene añadir esa gramática, pero en el editor:

- `full_bleed`
- `floating_single`
- `staggered_duet`
- `detail_strip`
- `white_thought_card`
- `system_stack`

`staggered_duet` debe combinar dos assets/prompts separados, mismo instante/eje, slots opuestos y corredor blanco central. Pedirle a Aurora “two scenes in one image” aumenta fusión de cuerpos, escala errónea y bordes inconsistentes.

Hasta implementar layouts en el contrato, no deben inventarse campos. Como solución temporal, genera dos escenas consecutivas compatibles y compón el recurso manualmente en edición.

## Qué conservar

- biblia aprobada como canon cerrado
- voz y deseo propios del protagonista
- pregunta dramática por parte
- causalidad por bloques
- agencia/payoff temprano
- pico con consecuencia
- cliffhanger con información nueva
- master y eje en secuencias complejas
- canon de props, outfit, efectos y luz
- plate compatible con la cámara
- objeto recurrente anclado
- presupuesto TTS y espejo exacto

## Qué retirar del contexto activo

- changelog completo
- umbrales superseded
- nombres de obras reales
- historial de errores de una serie concreta
- ejemplos recurrentes de un mismo personaje/universo
- listas largas de tropos rechazados
- cold open y nueve beats como plantilla universal
- obligación de pregunta por escena
- una única ancla visual para todo
- cambio de ángulo por cuota
- 40% de respiro como rechazo duro

## Qué convertir a validador

- contrato y campos permitidos
- ids, rutas y orden
- base obligatoria por personaje
- `existing`/`generate`
- refs existentes y máximo de tres
- compatibilidad de cámara
- full script y dialogue espejo
- TTS y bloques
- paneles static y cards limpias
- motion local falso máximo tres
- prompts duplicados y longitud
- rachas de escalas cerradas
- porcentaje de respiros como warning
- continuidad de colores, estados y props

## Arquitectura V4

### Instructions

Un núcleo de aproximadamente 1.000–1.500 palabras con jerarquía, mundo cerrado, fases, reglas HARD y condiciones.

### Knowledge

- herramientas narrativas
- plantillas de assets
- vocabulario de cámara
- contrato o esquema
- ejemplos técnicos neutrales y recuperados solo cuando aplican

### Código

- JSON Schema/validator
- metadata de cámara de assets
- QC visual antes de marcar ingrediente `DONE`
- correlación de resultados Grok
- layouts y overlays en Remotion

### Pruebas

Usar tres pilotos distintos y una matriz común:

- claridad del hook
- originalidad sin dependencia de tropos nombrados
- naturalidad de voz
- agencia temprana
- escala y continuidad
- variedad funcional de planos
- porcentaje de renders útiles al primer intento
- costo por minuto terminado
- retención real después de publicar

## Prioridad

1. Corregir bases y refs compatibles.
2. Corregir los 73 overrides de motion.
3. Eliminar contaminación de plates.
4. Mover conteos al validador.
5. Cambiar ejemplos por fixtures neutrales.
6. Añadir layouts editoriales.
7. Solo después ajustar cuotas finas con datos de retención.

Agregar otra lista de reglas de cámara antes de estas correcciones empeoraría el sistema.
