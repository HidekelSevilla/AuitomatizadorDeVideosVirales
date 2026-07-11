# Referencia visual, assets y prompts Manhwa V4.1

## Principio central

Un asset contiene identidad estable. Una view contiene arquitectura desde una cámara estable. Un panel contiene cinematografía y acción.

Cuando una referencia hornea clima, suelo, acción, recorte, perspectiva o estado incorrecto, Aurora intenta conservarlo y compite con el prompt.

Antes de adjuntar una referencia, pregunta:

> ¿Qué intentará conservar el modelo de esta imagen?

## 1. Clases de assets

El registro actual usa characters para declarar poses e imágenes reutilizables. Dentro de escenas, la semántica correcta es:

- references.characters: personas o criaturas identificables
- references.assets: props, UI, vehículos, drones y objetos recurrentes
- references.escenario: arquitectura desde una view compatible
- references.scenes: una imagen anterior del mismo instante

## 2. Base técnica de personaje

Todo personaje recurrente empieza con base.

Plantilla:

> Character identity reference sheet of [NAME]. Exactly one [PERSON], full body from hair to soles, orthographic front eye-level view, centered at about seventy percent of canvas height. Neutral relaxed face, dry canonical hair and clean canonical clothing, both open empty hands fully visible beside the hips, both feet fully visible, unobstructed silhouette, minimal foreshortening. Even soft studio illumination, consistent flat colors, seamless medium-gray background. Hand-drawn Korean manhwa character design, crisp inked lineart, 2D flat cel shading, vertical reference-sheet canvas.

La base describe:

- edad aparente y proporción corporal
- rostro, ojos y pelo
- outfit limpio
- rasgo fácil de repetir

La base no contiene:

- clima u hora narrativa
- localización
- agua, sangre o suciedad
- acción
- emoción dramática
- poder o efecto
- texto
- gran angular
- picado o contrapicado
- rim light cinematográfico
- fondo pintado

## 3. Derivadas y escalera de estados

Una derivada cambia outfit o estado, no identidad ni cámara.

Plantilla:

> Same character identity as [BASE], same face, hair, body proportions and signature feature. Full-body orthographic front eye-level reference sheet on the same seamless medium-gray background. Change only [OUTFIT OR STATE]. Both hands and both feet visible, even studio illumination, clean unobstructed silhouette.

Antes del storyboard, crea una escalera de estados cuando exista una transformación:

1. base
2. outfit
3. daño previo sin poder
4. poder o transformación inicial
5. consecuencia posterior

No saltes del outfit intacto a una transformación completa si existen paneles intermedios.

Ejemplo:

- limpieza
- limpieza_guante_roto
- sutura_inicial

La pose de acción pertenece al prompt de escena, no al asset.

## 4. Props y objetos recurrentes

Un prop base:

- muestra un único objeto
- preserva forma, material y proporción
- usa fondo gris
- no incluye mano
- no incluye acción
- controla el texto visible

Los estados derivados cambian únicamente una propiedad:

- sello limpio → esquina levantada
- herramienta limpia → punta contaminada
- dron apagado → lente activa

Cuando un objeto reaparece, la referencia es prioritaria:

> same [OBJECT], same shape, thickness and position, now [CHANGE]

Un objeto central no debe tener asset y después ser redibujado sin referencia durante el pico.

## 5. Plate de escenario

Una plate contiene:

- arquitectura
- materiales
- elementos realmente permanentes
- fuente estable de luz
- una posición y perspectiva de cámara

Quedan fuera:

- personas
- agua o polvo que cambian
- vidrio desplazado
- bolsas y herramientas móviles
- puertas que se abren, desaparecen o deforman
- anomalías
- vehículos móviles
- efectos
- pantallas narrativas

## 6. View significa cámara

Cada view declara conceptualmente:

- tamaño de plano
- ángulo
- altura
- lado del eje
- perspectiva o lente
- dirección de pantalla
- arquitectura visible
- fuente de luz

Nombres recomendados:

- door_front_eye
- corridor_left_oblique
- threshold_floor_profile
- threshold_overhead
- ceiling_corner_high

Nombres como base, peligro o después no bastan para decidir compatibilidad.

Un estado narrativo puede derivarse de una view compatible:

- door_front_eye_clean
- door_front_eye_anomaly
- door_front_eye_post_close

No uses door_front_eye como referencia de un top-down, POV o low-angle. Si no existe una view compatible:

1. omite la plate;
2. describe el lugar en diez a catorce palabras;
3. o genera una view nueva.

## 7. Compatibilidad de referencias

| Panel objetivo | Referencia recomendable | Riesgo |
|---|---|---|
| Close facial | base o estado limpio | pose con otra emoción o luz |
| Mano o herida | estado exacto y prop | guante intacto frente a prompt roto |
| Full action | referencia full-body | asset recortado |
| Master espacial | plate compatible y pocas identidades | retratos que agrandan personas |
| Dos personajes | dos estados limpios | referencias con cámaras opuestas |
| Mismo instante | escena anterior con delta | clonar composición |
| Objeto recurrente | asset o escena que fijó forma | redibujarlo desde cero |

Llegar a tres referencias es un warning. Revisa compatibilidad, no solo cantidad.

## 8. Shot plan

Cada fila decide:

- micro-beat
- función: establecer, anticipar, reacción, acción, impacto, consecuencia o transición
- sujeto
- tamaño de plano
- ángulo
- dirección de pantalla
- línea de atención
- view compatible o ancla textual
- referencias
- estado
- luz
- tratamiento visual

La cámara se elige por función.

Secuencia útil:

1. orientación
2. detalle
3. reacción
4. acción
5. impacto
6. consecuencia

Un bird's-eye extremo es un acento. Normalmente cero a dos por parte, usado para orientación, reanclaje, consecuencia o cliffhanger.

## 9. Plano, ángulo y movimiento

Plano:

- macro
- close-up
- medium
- full
- wide

Ángulo:

- eye-level
- profile
- rear
- OTS
- high-angle
- low-angle
- bird's-eye
- POV
- dutch
- worm's-eye

Tracking describe movimiento de cámara, no sustituye el plano ni el ángulo en una imagen estática.

Evita rachas locales de closes aunque la distribución global parezca correcta. Reancla cuando el espectador ya no pueda responder dónde están los sujetos.

## 10. Masters de escala

Cuando se comparan personas con puertas, vehículos, criaturas o arquitectura:

> Spatial master of [PLACE], [HIGH OR OBLIQUE] wide view, near-orthographic perspective with stable verticals and one shared ground plane. The complete [LARGE OBJECT] is [RELATIVE SIZE]. [PEOPLE] stand [DISTANCE AND POSITION], full body, feet contacting the same floor plane. [AXIS AND LAYERS]. [TIME]. [LIGHT SOURCE AND DIRECTION]. [STYLE].

Datos útiles:

- puerta estándar de aproximadamente 2.1 metros
- adulto ligeramente más bajo que la puerta
- vehículo completo, ruedas sobre el mismo suelo que los pies
- lente aproximada de 50–85 mm
- poco foreshortening
- un solo punto de fuga legible
- objeto grande sin recorte agresivo en foreground

No combines manos en primerísimo plano, pies completos y arquitectura dominante dentro de un close.

## 11. Estructura del prompt

Objetivo normal: 45–70 palabras descriptivas antes del ancla. Ochenta es un techo diagnóstico.

Orden:

1. sujeto y acción
2. plano y ángulo
3. posición, dirección y contacto
4. lugar y hora
5. fuente y dirección de luz
6. ancla de clase

Ejemplo:

> Kang Ijun presses the worn scraper against the same thin black filament along the inner left doorjamb, OTS close-up from his right side, his exposed right palm behind the handle and the frame running screen-right. Early-morning service corridor under cold greenish fluorescent light from upper left, the black filament absorbing light at the contact point. [STYLE]

## 12. Un instante fotografiable

El prompt representa un momento.

Evita:

- checks the tablet, then touches the wall
- runs, stops, understands and attacks
- the room folds, disappears and becomes a wall

Elige el instante culminante:

> Tablet in her right hand, left palm already pressed against the wall, eyebrows tightening.

Si la voz contiene varios cambios irreducibles, divide el micro-beat en varios paneles sin alterar sus palabras.

## 13. Traducción literal de la voz

La voz puede decir:

- la puerta respiró
- el suelo me devolvió
- la habitación se dobló

El prompt traduce:

- metal center bulges outward while both jambs flex symmetrically
- both boot soles slide backward to the same yellow floor mark
- jambs bend inward around a narrowing black vertical seam

No uses comparaciones como like paper, like a chest o porcelain skin si Aurora puede convertirlas en objetos literales.

## 14. Hora, color y luz

Cada prompt declara franja temporal, incluso en interiores.

Ejemplos:

- early-morning interior
- pale overcast afternoon
- deep night under streetlamps

La luz declara fuente y dirección:

- overhead fluorescent light from frame-left
- blue-white institutional light from above
- warm window light entering from screen-right

El mapa de luz se conserva por bloque:

- cotidiano
- amenaza
- activación
- consecuencia

Los efectos usan únicamente colores canónicos.

## 15. Clases de panel

### Full bleed

Arquitectura pintada, acción o consecuencia. Usa luz motivada y profundidad cuando ayude.

Ancla:

> Hand-drawn Korean manhwa webtoon illustration, 2D flat cel shading, crisp inked lineart, high contrast, vertical 9:16 webtoon panel composition, painted background.

### White inset

Ilustración simple dentro de un solo marco sobre blanco. No usa fondo pintado exterior ni rim light obligatorio.

Ancla:

> Korean webtoon inset panel on a clean pure-white page, one rectangular black frame containing [SIMPLE CONTENT], clean white margin, crisp inked lineart, restrained flat cel shading, high contrast, vertical 9:16 composition.

Usa exclusivamente Korean webtoon inset panel como denominación estilística.

### Body detail

Una mano, ojo, herramienta, herida u objeto. Fondo tonal o screentone simple.

### Impact

Una acción clara. SFX y bordes pertenecen al editor siempre que sea posible.

### Device

Pantalla, radio o UI diegética. Texto exacto y breve.

No fuerces dramatic rim lighting y painted background en todas las clases. Eso uniforma y aplana el video.

## 16. Manos y cuerpos

Una parte corporal aislada declara:

- propietario
- lado
- orientación
- número de manos o pies visibles
- contacto

Ejemplo:

> Exactly one right hand, palm up, five fingers visible; the filament loops once around the torn palm and one end enters the tear.

Para un cuerpo en el suelo:

- torso y cabeza claramente por encima del plano
- puntos de contacto enumerados
- preferencia por high-angle o full legible
- evitar cámara a ras con cuerpo horizontal

## 17. Texto e interfaz

Todo texto visible:

- se escribe exacto
- aparece temprano en el prompt
- es corto
- suprime texto adicional

Ejemplo:

> displaying only the exact text 'ZONA SEGURA' in black uppercase letters, no other readable text or labels

Planes, tabletas y radios sin texto narrativo usan formas o líneas abstractas y declaran no readable text.

Retículas, targeting frames, captions, badges, gutters y SFX deben ser overlays del editor cuando sea posible.

## 18. Puesta en escena y eje

Una secuencia compleja declara:

- amenaza o destino
- protagonista
- aliados o protegidos
- obstáculo o salida
- lado de pantalla de cada uno
- fuente de luz

El primer master muestra la relación. Los planos siguientes conservan el eje de 180 grados.

Reancla después de cuatro a seis detalles o cuando cambie la geografía.

Las capas foreground, midground y background son obligatorias en masters complejos; no en cada close.

## 19. Referencia de escena

Úsala solo para el mismo instante:

> Same moment and positions as [SCENE]. Keep faces, outfits, object shape and screen direction. Change to [NEW SHOT AND ANGLE] and reveal [NEW INFORMATION].

No encadenes tres o más escenas referenciando siempre la anterior.

## 20. Respiros y layouts

El blanco es área de composición.

Funciones:

- anticipación
- pensamiento
- comparación
- reacción paralela
- absorción del impacto
- transición

Diagnóstico durante el JSON: reporta el conteo, los scene_id y la clase soportada de cada tratamiento respirable: narrative_card, white inset, body detail o device shot. La proporción por área se evalúa únicamente después de renderizar o cuando el editor disponga de metadata de layout.

Con el contrato actual:

- se permite un white inset simple generado
- no se pide a Aurora una página con dos o tres paneles
- no se inventan campos de layout

Cuando el editor soporte layouts:

- floating_single
- staggered_duet
- detail_strip

Un staggered duet usa dos imágenes independientes del mismo momento colocadas por el editor, nunca una imagen que intente dibujar ambas escenas.

## 21. Movimiento editorial

El movimiento global debe ser leve. Los overrides locales son intencionales:

- enabled false para texto exacto, evidencia geométrica o cliffhanger seco
- punch_in o shake solo en impactos
- slow_push_in en revelaciones
- pan dirigido en geografía

El movimiento no debe recortar manos, texto, bordes del inset ni objetos decisivos.

Transiciones:

- cut por defecto
- dip_black para salto claro de tiempo o lugar
- crossfade para recuerdo
- flash solo cuando la lógica visual lo justifique

## 22. Gate de generación

Antes de producir toda la parte:

1. Genera assets base y derivados.
2. Revisa cabeza, manos, pies, fondo, outfit y estado.
3. Genera una muestra de paneles críticos:
   - hook
   - detalle de objeto
   - master
   - escala humana
   - interacción de dos personajes
   - poder o efecto
   - POV
   - cliffhanger
4. Continúa solo si la muestra conserva identidad, escala y cámara.

Un prompt correcto no garantiza un asset correcto. El render final debe pasar inspección visual. Si no se adjuntaron renders, informa `NOT_RUN`; nunca certifiques identidad, manos, escala o cámara a partir del texto del prompt.
