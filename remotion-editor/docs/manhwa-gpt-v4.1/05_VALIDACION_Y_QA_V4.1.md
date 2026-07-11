# Validación y QA Manhwa V4.1

Este documento distingue tres problemas:

1. Error contractual: el pipeline puede fallar o interpretar otro formato.
2. Error semántico: las referencias o prompts contradicen el estado visual.
3. Warning editorial: puede funcionar, pero merece revisión.

Los errores HARD bloquean entrega. Los warnings se reportan y se justifican.

## 1. Validaciones HARD de contrato

### Estructura

- JSON parsea.
- Campos raíz permitidos.
- project completo y coherente.
- preset manhwa.
- serie y slug correctos.
- IDs de escena únicos y ordenados.

### Paneles

- type panel o narrative_card.
- Panel lleva render_mode static.
- Panel lleva visual.image_prompt.
- Cero animation_prompt.
- Card no lleva render_mode, references, visual ni motion.

### Assets

- mode existing o generate.
- generate lleva prompt.
- existing apunta a ruta.
- reference_pose y reference_view existen.
- rutas pertenecen a la serie.

### Referencias

- ID y pose/view existen.
- Máximo tres imágenes.
- references.characters contiene identidades.
- references.assets contiene props, UI, vehículos, drones u objetos.
- references.scenes apunta hacia atrás.

### TTS

- Sin segunda voz: mode single.
- Con sistema o segunda voz: mode dialogue.
- En single, la voz existe en pipeline.tts.voice_id y tts_export no contiene voice_id.
- cold nunca aparece en voz humana.
- En single no hay dialogue ni voices.
- En dialogue, cada voiceover tiene speaker.
- dialogue refleja scene_id, speaker y text.
- full_script coincide carácter por carácter con la unión de voiceover.text.
- tts_blocks no aparece; el pipeline realiza el chunking automáticamente.
- model_id eleven_v3.
- En single: voice_settings.speed 1.0 y sin elevenlabs_speed.
- En dialogue: elevenlabs_speed 1.0.
- edit_speed 1.4.
- Presupuesto de caracteres correcto.

## 2. Validaciones HARD de prompt

Cada panel:

- prompt no vacío
- prompt en inglés
- prompt único
- plano explícito
- ángulo explícito
- hora o franja temporal
- sujeto y acción identificables
- un instante fotografiable
- texto visible controlado

Rechaza:

- then entre acciones principales
- metáfora visual literalizable
- persona desenfocada
- palabra Manga como ancla
- targeting frame o UI no autorizada
- dos o más paneles pedidos dentro de una imagen

## 3. Validación semántica de assets

### Base

Debe declarar:

- exactamente una figura
- full body
- front u orthographic
- eye-level
- neutral expression
- empty hands
- feet visible
- gray background
- studio illumination

No debe declarar:

- clima
- hora narrativa
- escenario
- acción
- poder
- sangre
- rim light dramático
- painted background

### Derivada

- conserva identidad
- cambia un outfit o estado
- mantiene cámara técnica
- no introduce acción

### Escalera de estados

Para cada escena, el estado referenciado coincide con lo visible:

- ropa
- daño
- prop
- transformación
- consecuencia

Ejemplo de error:

> Referencia con guante intacto + prompt con palma rasgada.

## 4. Validación semántica de views

Comprueba manualmente hasta que exista metadata:

- view y panel comparten tamaño de plano razonable
- ángulo compatible
- altura compatible
- mismo lado del eje
- perspectiva compatible
- arquitectura visible compatible

Error:

> Plate frontal usada en top-down, POV, low-angle o profile.

Si no es compatible, se quita la plate o se usa otra view.

## 5. Validación semántica de participantes

Lee el prompt y enumera:

- personajes visibles
- props visibles
- escenario
- elementos recurrentes

Comprueba:

- cada identidad importante tiene referencia
- cada prop recurrente tiene referencia
- el prompt no introduce una persona secundaria desenfocada
- si excede tres referencias, se simplifica el panel

## 6. Validación de escala

En masters con personas y objetos grandes:

- objeto completo
- proporción relativa declarada
- plano de suelo compartido
- pies y ruedas/contactos
- perspectiva near-orthographic o lente media/larga
- verticales estables
- sin primer plano enorme recortado

Gate visual:

- puerta ligeramente más alta que adulto
- persona no mayor que vehículo
- sujetos del fondo reducen tamaño de forma coherente

## 7. Warnings editoriales

### Racha cerrada

Warning si hay más de cuatro a seis macro/close sin reanclaje, consecuencia o tratamiento respirable.

### Falta de master

Warning si una secuencia de acción empieza con detalles sin orientación.

### Respiración

Reporta conteo, scene_id y clase soportada: narrative_card, white inset, body detail o device shot. Un impacto no cuenta como respiro. La proporción por área queda `NOT_RUN` hasta disponer de renders o metadata real de layout.

### View dominante

Warning si una única view intenta soportar más de 40% de un escenario intensivo o cámaras incompatibles.

### Protagonista constante

Warning si casi todos los paneles muestran al protagonista desde medium/close.

### Monocultivo de estilo

Warning si todos los prompts usan la misma combinación de painted background, dramatic rim light y high contrast, incluidos inserts.

### Voz por escena

Warning si una imagen estática sostiene más de 20–24 palabras y la voz contiene varios estados visuales.

## 8. Reporte obligatorio

La salida de validación declara:

- escenas totales
- panels
- cards
- caracteres full_script
- modo TTS
- referencias máximas
- prompts sin plano
- prompts sin ángulo
- prompts sin hora
- prompts duplicados
- cards con campos prohibidos
- racha más larga sin reanclaje
- tratamientos respirables: conteo, scene_id y clase
- assets nuevos y existentes
- warnings justificados

No se acepta la frase todo validado sin cifras.

## 9. Gate de assets

Si el GPT no recibió los renders, declara `NOT_RUN` para esta sección y las siguientes inspecciones visuales. Nunca aprueba manos, escala, identidad o cámara basándose solo en el prompt.

Antes de escenas:

1. Genera todas las bases.
2. Inspecciona visualmente.
3. Rechaza y regenera si:
   - recorta cabeza o pies
   - oculta manos
   - añade escenario
   - moja ropa o pelo
   - introduce pose dramática
   - cambia identidad
   - genera texto no pedido

Una base aprobada se conserva como existing en partes posteriores.

## 10. Piloto de paneles

Antes de producir toda la parte, genera entre seis y ocho paneles representativos:

- hook
- detalle de prop
- master espacial
- plano con escala humana
- interacción de dos personajes
- efecto o poder
- POV
- cliffhanger

Aprueba:

- identidad
- escala
- cámara
- continuidad
- color
- texto
- composición segura para captions y movimiento

Solo después se genera el resto.

## 11. Validación post-render

Un JSON correcto no garantiza una imagen correcta.

Para cada archivo:

1. ¿Aparece exactamente el sujeto?
2. ¿La identidad coincide?
3. ¿La cámara coincide?
4. ¿La escala es creíble?
5. ¿El estado de ropa, daño y prop es correcto?
6. ¿Existe texto inventado?
7. ¿Hay extremidades o rostros extra?
8. ¿La imagen corresponde a este intento y no a una generación anterior?

El resultado visual manda sobre la autocertificación del GPT.
