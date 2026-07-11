# Referencia de assets y prompts V4

## Principio central

Un asset contiene identidad estable. Un panel contiene cinematografía. Cuando una referencia hornea clima, suelo, acción, recorte o ángulo, Aurora intenta conservarlos y compite con la cámara del panel.

## 1. Asset base de personaje

Todo personaje recurrente, incluidos secundarios y niños, empieza con `base`.

Plantilla:

> Character identity reference sheet of [NAME]. Exactly one [human/creature], full body from hair to soles, orthographic front eye-level view, centered at about seventy percent of canvas height. Neutral relaxed face, dry canonical hair and clothing, both open empty hands fully visible beside the hips, both feet fully visible, unobstructed silhouette. Even soft studio illumination, consistent flat colors, seamless medium-gray background. Hand-drawn Korean manhwa character design, crisp inked lineart, 2D flat cel shading, vertical reference-sheet canvas.

La base describe:

- edad aparente y proporción corporal
- forma de rostro
- ojos y pelo canónicos
- outfit limpio de referencia
- un rasgo-firma fácil de repetir

La base no usa lenguaje de escena: clima, hora narrativa, acción, emoción intensa, sangre, suciedad, poderes, escenario, texto visible, gran angular, picado, contrapicado, rim light o fondo pintado.

## 2. Derivadas de personaje

Una derivada cambia outfit o estado, no la identidad ni la cámara.

Plantilla:

> Same character identity as the base reference, same face, hair, body proportions and signature feature. Full-body orthographic front eye-level reference sheet on the same seamless medium-gray background. Change only [OUTFIT OR STATE]. Both hands and both feet visible, even studio illumination, clean silhouette.

Estados útiles: outfit de trabajo, uniforme, vendaje, herida, transformación parcial. La acción concreta se escribe en el panel. Una pose recortada de “corriendo”, “protegiendo” o “gritando” suele ser una mala referencia de identidad para otro ángulo.

## 3. Plates de escenario

Un plate contiene arquitectura y props permanentes. Quedan fuera los estados que cambian durante la escena:

- personas
- vehículos que se desplazan o vuelcan
- puertas que cambian de estado
- barreras
- efectos o fenómenos temporales
- pantallas con datos narrativos
- cuerpos, manos o multitudes

Esos elementos se modelan como assets/estados o se añaden en el prompt del panel.

Cada view declara metadatos conceptuales:

- posición y altura de cámara
- tamaño de plano
- ángulo
- dirección de pantalla
- elementos permanentes visibles
- fuente de luz estable

Una scene solo usa el plate si su cámara es compatible. Si el panel pide otra posición, se usa otra view o se ancla el lugar en texto breve.

## 4. Compatibilidad de referencias

Antes de adjuntar una referencia, pregunta qué intentará conservar el modelo.

| Panel objetivo | Referencia recomendable | Riesgo a evitar |
|---|---|---|
| Close facial | base/estado limpio del personaje | pose con otra emoción o luz extrema |
| Full action | base/estado full-body | asset medium/close recortado |
| Master espacial | plate compatible; 0–1 identidades limpias | dos retratos medianos que agrandan personas |
| Dos personajes | dos bases limpias o una identidad + descripción | poses con cámaras opuestas |
| Mismo instante | escena anterior + delta explícito | referencia antigua de otra fase |
| Objeto recurrente | asset o escena que fijó su forma | redibujarlo desde cero |

Llegar al máximo de tres referencias es un warning: revisa si todas son compatibles y necesarias.

## 5. Plano maestro con escala

Para un vehículo, criatura gigante o arquitectura comparada con personas, la primera cláusula presenta geometría, no un retrato.

Plantilla:

> Spatial master of [PLACE], very high oblique wide view from [HEIGHT], near-orthographic perspective, one shared ground plane. The complete [LARGE OBJECT] spans [FRAME AREA]. [NUMBER] full-body adults stand [DISTANCE/POSITION] and each occupies at most [RELATIVE FRAME SHARE], with feet touching the same ground plane. [THREAT/DESTINATION] remains farther along the established axis. Stable verticals, one vanishing direction, readable size falloff, [TIME AND MOTIVATED LIGHT]. [SCENE STYLE ANCHOR].

Relaciones útiles:

- camión completo, no recortado
- adultos pequeños y de cuerpo completo
- ruedas y pies tocando el mismo suelo
- objeto grande expresado como múltiplo de la altura humana
- distancia relativa entre capas

Para un mapa espacial, evita un objeto enorme cortado en foreground y una perspectiva gran angular agresiva. El picado dramático y el master de geografía son funciones distintas.

## 6. Gramática de cámara

Separa dos decisiones:

- **Tamaño de plano:** macro, close-up, medium, full, wide.
- **Ángulo/perspectiva:** eye-level, profile, rear, OTS, high, low, bird's-eye, POV, dutch.

La cámara se elige por función. No cambies de par solo para cumplir variedad.

Secuencia base útil:

1. master de orientación
2. detalle que anticipa
3. reacción
4. acción/impacto
5. consecuencia

Un extremo bird's-eye es un acento: normalmente cero a dos por parte, reservado a master, reanclaje, consecuencia o cliffhanger.

## 7. Clases de panel y anclas

### `spatial_master` / `action`

Fondo pintado, arquitectura legible, luz motivada. Capas explícitas solo cuando ayudan a mapear varios participantes.

### `reaction`

Fondo tonal o arquitectura simplificada. La expresión y la silueta llevan el plano; no necesita tres capas.

### `body_detail`

Un objeto o fragmento, fondo mínimo o screentone. Sirve para anticipar o absorber un golpe.

### `white_inset`

Ilustración simple dentro de un marco sobre blanco. Tinta limpia, cel shading plano y margen real. Sin `painted background` ni rim light dramático.

### `impact`

Acción muy clara; el SFX y los bordes se añaden en el editor cuando sea posible.

### `device`

UI breve y coherente con la biblia. Texto exacto solo cuando el pipeline aún no pueda superponerlo en edición.

No uses una única ancla de “dramatic rim lighting + painted background” para todas las clases: uniforma el video y contamina assets técnicos.

## 8. Estructura del prompt de escena

Objetivo operativo: 45–70 palabras antes del ancla; 80 como techo diagnóstico.

Orden normal:

1. sujeto y acción
2. tamaño de plano y ángulo
3. posición/dirección
4. lugar y hora
5. luz motivada
6. ancla correspondiente a la clase de panel

Excepción: en masters de escala, geometría y relación de tamaños van primero.

Describe en positivo. Usa exclusiones breves solo para riesgos comprobados, especialmente texto adicional. Evita adjetivos de calidad vacíos.

## 9. Partes corporales

Toda mano, brazo, pie o cabeza aislados declaran propietario, lado, posición y contacto.

Ejemplo:

> The girl's right palm rests flat against the inside surface of the capsule glass; her left hand lies beside her cheek.

Para cuerpos en el suelo, ubica torso, extremidades y cabeza sobre un plano compartido y usa una cámara que separe la silueta del suelo.

## 10. Texto y overlays

Badges, alertas, matrículas, SFX, cajas narrativas, bordes y gutters son más estables como overlays del editor. Si el texto debe generarse dentro de la imagen, usa el string exacto y revisa el render; no conviertas un badge textual en el rasgo principal de identidad.

## 11. Referencia de escena

Úsala solo para continuidad del mismo instante o estado.

Plantilla:

> Same moment and positions as [SCENE], keep [IDENTITIES/OBJECT SHAPE/SCREEN DIRECTION]. Now change to [NEW SHOT AND ANGLE] and reveal [NEW INFORMATION].

Una escena antigua usada solo porque comparte personaje o lugar debe reemplazarse por el asset o plate correspondiente.

## 12. Respiros y composición editorial

El blanco es área de layout, no un clip vacío. Funciones:

- anticipación
- absorción
- pensamiento
- cambio de tiempo/lugar
- comparación causa/efecto
- reacción paralela

Un doble panel sobre blanco funciona mejor con dos imágenes independientes del mismo momento, colocadas por el editor en esquinas opuestas. Hasta que el contrato soporte layouts, no inventes campos y limita los multi-panel generados a inserts simples: ojo, mano y objeto.
