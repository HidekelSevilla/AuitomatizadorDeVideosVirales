# Referencia visual, assets y prompts Manhwa V4.3

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

- street_axis_eye
- wall_left_oblique
- ground_mark_profile
- exterior_overhead
- ceiling_corner_high

Nombres como base, peligro o después no bastan para decidir compatibilidad.

Un estado narrativo puede derivarse de una view compatible:

- wall_front_eye_clean
- wall_front_eye_active
- wall_front_eye_post_event

No uses wall_front_eye como referencia de un top-down, POV o low-angle. Si no existe una view compatible:

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

## 8. Dirección visual antes de elegir cámara

El panel debe expresar el significado dramático de la voz, no copiar automáticamente el sustantivo mencionado. Para cada micro-beat elige una estrategia:

- acontecimiento visible
- causa
- consecuencia
- contexto de mundo
- recuerdo
- reacción
- contraste

Una imagen puede ser literalmente correcta y narrativamente inútil. Si la voz habla de una institución, una pérdida o una leyenda pública, un detalle de herramienta asociada no basta para comunicarla.

Errores diagnosticados:

- “murió mi padre” convertido en otro close del utensilio heredado
- “los defensores cerraban portales” convertido en un pasillo vacío
- “el poder más temido” convertido en una mano trabajando

Soluciones:

- la pérdida usa recuerdo, ausencia, fotografía, expediente o consecuencia humana
- la institución usa escala, personal, huella de operación o contraste social
- la leyenda usa memoria pública, propaganda visual o consecuencias reconocibles

El prop close se reserva para una pista, una manipulación o un símbolo ya establecido. El mismo prop no protagoniza más de dos paneles dentro de cualquier ventana de ocho, salvo una acción continua imposible de comprender de otro modo.

### Paneles ancla

Antes del shot plan declara cinco imágenes que deben funcionar como fotogramas promocionales:

1. promesa visual del hook
2. escala o contradicción del mundo
3. revelación de la amenaza
4. clímax o precio
5. cliffhanger

Cada ancla tiene acción dominante, jerarquía visual, luz dramática y una silueta legible. Al menos tres son medium-wide o wide con foreground, midground y background. Un ancla no puede ser un prop aislado, un pasillo vacío ni alguien quieto mirando.

Una plate apoya la acción; nunca la sustituye. Si la geometría, escala o estado del lugar cambia radicalmente, omite la plate normal o usa una referencia compatible con la transformación. Una plate estática no sirve para una revelación que altera toda la arquitectura.

### Shot plan

Cada fila decide:

- micro-beat
- estrategia semántica: acontecimiento, causa, consecuencia, contexto, recuerdo, reacción o contraste
- función: establecer, anticipar, reacción, acción, impacto, consecuencia o transición
- ancla: sí/no y cuál
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

No encadenes más de dos close/macro ni dos paneles con el mismo sujeto principal. Un master sigue mostrando el acontecimiento que narra la voz; “reorientar” no autoriza reemplazar la amenaza por personajes posando.

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

Cuando se comparan personas con vehículos, criaturas o arquitectura:

> Spatial master of [PLACE], [HIGH OR OBLIQUE] wide view, near-orthographic perspective with stable verticals and one shared ground plane. The complete [LARGE OBJECT] is [RELATIVE SIZE]. [PEOPLE] stand [DISTANCE AND POSITION], full body, feet contacting the same floor plane. [AXIS AND LAYERS]. [TIME]. [LIGHT SOURCE AND DIRECTION]. [STYLE].

Datos útiles:

- vehículo completo, ruedas sobre el mismo suelo que los pies
- adulto situado junto al vehículo, no en otro plano de profundidad
- lente aproximada de 50–85 mm
- poco foreshortening
- un solo punto de fuga legible
- objeto grande sin recorte agresivo en foreground

No combines manos en primerísimo plano, pies completos y arquitectura dominante dentro de un close.

## 11. Estructura del prompt

Longitud según función, antes del ancla estilística:

- detalle simple: 45–70 palabras
- panel estándar: 60–90
- ancla, master o transformación compleja: 80–120

La longitud no sustituye la dirección. Un ancla necesita acción, composición, escala, capas, atmósfera y luz; un detalle necesita precisión y aire.

Orden:

1. sujeto y acción
2. plano y ángulo
3. posición, dirección y contacto
4. lugar y hora
5. fuente y dirección de luz
6. ancla de clase

Ejemplo:

> The field technician anchors the same black cable against cracked wet pavement, OTS medium close-up from the right side, both hands behind the insulated handle and the cable running screen-right toward a damaged structure. Rainy early morning under amber work light from frame-left, cobalt emergency light reflecting in the puddle. [STYLE]

## 12. Un instante fotografiable

El prompt representa un momento.

Evita:

- checks the tablet, then touches the wall
- runs, stops, understands and attacks
- the street bends, collapses and becomes flat

Elige el instante culminante:

> Tablet in her right hand, left palm already pressed against the wall, eyebrows tightening.

Si la voz contiene varios cambios irreducibles, divide el micro-beat en varios paneles sin alterar sus palabras.

## 13. Traducción visual de la voz

La correspondencia es semántica, no palabra por palabra. La imagen puede mostrar causa, contexto, recuerdo, reacción, contraste o consecuencia si comunica mejor la idea y la secuencia conserva claridad.

La primera mención de un rol, lugar o concepto inventado recibe una imagen orientadora. Debe permitir que un espectador nuevo entienda su función sin conocer la biblia.

La voz puede decir:

- el suelo me devolvió
- el edificio se inclinó hacia mí
- la calle se tragó la distancia

El prompt traduce:

- both boot soles slide backward to the same yellow floor mark
- stable vertical walls converge toward one vanishing point above the subject
- successive streetlamps shrink too rapidly inside a narrow spatial seam

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

### Guion cromático por bloque

El ambiente industrial puede tener base neutral, pero no una salida enteramente gris. Antes del shot plan define para cada bloque:

- base neutral dominante, aproximadamente 60–70%
- color secundario local, aproximadamente 20–30%
- acento saturado, aproximadamente 5–10%
- superficie que recibe su rebote: agua, metal, vidrio, piel o humo

Una Parte usa al menos tres regímenes cromáticos ligados a su progresión, por ejemplo cotidiano → amenaza → autoridad. No coloques todos los colores en cada panel; cambia cuál domina.

Cada panel ancla nombra un acento saturado y dónde se refleja. El gris puede organizar la imagen, pero no ser su única información cromática.

Separa color de efecto y color ambiental. Un rojo de alarma puede iluminar paredes sin convertir el poder en rojo; una luz azul institucional puede rebotar en el personaje sin cambiar su identidad.

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

En una parte de 35–50 escenas planifica de cinco a ocho puntuaciones visuales y mezcla al menos tres clases: narrative_card, white inset, reacción con espacio negativo, recuerdo sepia, device shot o transición ambiental. Un impact panel y un close ordinario no cuentan como respiro.

Reporta conteo, scene_id, clase y función. La proporción por área se evalúa únicamente después del render o cuando el editor disponga de metadata de layout.

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
   - las cinco anclas
   - un respiro
   - una interacción de dos personajes
   - un detalle decisivo
4. Comprueba sin audio que la muestra comunica promesa, mundo, amenaza, clímax y cliffhanger.
5. Continúa solo si conserva identidad, escala, cámara y fuerza dramática.

Un prompt correcto no garantiza un asset correcto. El render final debe pasar inspección visual. Si no se adjuntaron renders, informa `NOT_RUN`; nunca certifiques identidad, manos, escala o cámara a partir del texto del prompt.
