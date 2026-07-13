# Dirección visual Webtoon V5.1

## 1. Objetivo

Combinar la energía gráfica que funcionó en V3.2 con las correcciones de V4.3: espectáculo, color y páginas webtoon sin perder geografía, escala, continuidad ni significado.

La pregunta no es “¿qué ángulo falta?”. Es “¿qué necesita comprender o sentir el espectador en este corte?”.

## 2. Gramática de secuencia

Antes de cámara, asigna a cada panel un `performance_target`: emoción visible, gesto corporal y cambio respecto al panel anterior. La neutralidad solo es una decisión válida en calma, shock congelado deliberado o control intimidante; debe declararse, no aparecer por omisión.

### Establecimiento

Un master presenta participantes, amenaza, salidas, obstáculos, suelo, eje y fuente de luz. Debe sembrar a quien actuará después.

### Aproximación

Medium, OTS o perfil aclara dirección y objetivo. No repite el master con recorte arbitrario.

### Acción

Muestra atacante, trayectoria y blanco. Mantén el eje. Si el entorno cambia, vuelve al master.

### Impacto

Close, detalle, dutch moderado, onomatopeya o `punch_in`. Un impacto es un instante, no una secuencia escrita con “then”.

### Reacción

Rostro, cuerpo, entorno o vacío que expresa qué significó. No todos reaccionan con ojos abiertos.

Escribe anatomía interpretativa concreta: cejas tensas o elevadas, mirada fijada o evasiva, labios separados, mandíbula apretada, cuello retraído, hombros altos, dedos rígidos, peso hacia atrás. El nombre de una emoción sin estos indicios no dirige al generador.

### Consecuencia

Demuestra cambio físico: posición, daño, luz, arquitectura, relación o estatus. El pico sin consecuencia parece pose.

## 3. Cámara y escala

### Master con humanos

Prefiere:

- high-oblique a 2.5–5 m
- medium-wide/wide profundo
- perspectiva de lente media 50–70 mm
- verticales estables
- sujetos completos en midground
- pies, ruedas y contactos sobre un plano de suelo compartido

Declara tamaño relativo mediante un objeto completo. “Camión completo delante, dos figuras legibles detrás” funciona mejor que “escala épica”.

### Cenital puro

Úsalo para mapa, persecución, patrón de multitudes o geometría. El suelo ocupa el cuadro; no hay horizonte ni gran cielo. Acepta que los humanos sean pequeños porque no es su panel emocional.

### Picado oblicuo

Es la alternativa cuando se necesita ver geografía y conservar rostro/cuerpo. No coloques un objeto enorme en primer plano que convierta a los personajes en miniaturas accidentales.

### Contrapicado

Poder, dominio, amenaza y escala vertical. Mantén pies o base del objeto para evitar gigantismo sin referencia.

### Extremos

Worm's-eye, fisheye, dutch extremo y bird's-eye alto son acentos. Máximo uno de cada tipo por secuencia salvo motivo narrativo.

## 4. Eje

Declara en texto:

```text
amenaza screen-right/fondo; protagonista screen-left/midground; protegidos detrás; salida foreground
```

Perfil, OTS, impacto y reacción conservan esa dirección. Cruzar el eje exige un nuevo master que haga visible el cambio.

## 5. Traducción semántica

Una línea puede convertirse en:

- hecho presente
- causa concreta
- consecuencia
- contexto social
- recuerdo
- reacción
- contraste

Ejemplos:

- “Mi padre murió allí” → recuerdo del padre o ausencia concreta, no herramienta del protagonista.
- “Los héroes se marcharon” → salida pública de héroes frente a entrada de limpiadores, no pasillo vacío.
- “El poder más temido” → consecuencia, archivo público o manifestación, no mano cotidiana.
- “Nadie nos miraba” → cámaras siguiendo a otro grupo mientras el equipo queda fuera del foco social, sin pedir personas borrosas.

## 6. Paneles ancla

Cinco mínimos:

1. Hook: pregunta visual inmediata.
2. Mundo/jerarquía: escala social y física.
3. Amenaza: regla y peligro reconocibles.
4. Manifestación/clímax/precio: imagen icónica de la Parte.
5. Cliffhanger: cambia identidad, estatus o amenaza.

Al menos tres medium-wide/wide. Cada ancla define foreground, midground, background, fuente de luz, acento y reflejo.

## 7. Ritmo adaptativo

El respiro no significa detener siempre la historia. Significa reducir información visual, cambiar densidad o dejar una consecuencia entrar.

### Calma e investigación

Usa white inset, detalle, device, transición ambiental, composite blanco y planos con espacio negativo. 30–45% del bloque.

### Preparación y escalada

Usa detalles funcionales y reacciones, pero conserva avance. 20–30%.

### Acción continua

Mantén la cadena setup→ataque→impacto→consecuencia. Respira con master amplio, silencio, reacción o vacío después del impacto. Cards y composites fuera del intercambio. 10–20%.

### Consecuencia/vínculo

Permite white inset, recuerdo, detalle corporal y luz cotidiana que revele el costo. 25–40%.

La Parte suele tener 20–28% de puntuaciones visuales reales en acción comercial. Cuenta escenas, no porcentaje temático del monólogo. Cards, white/black inset, composite, device, body detail, transición ambiental y reacción de baja densidad cuentan; un full bleed cargado no cuenta por llamarse “master”. Para 38–44 escenas suelen resultar 8–11 respiros. La función manda sobre la cifra.

## 7.1 Duración de una imagen

Una imagen estándar funciona mejor entre 1.3 y 4.5 segundos editados. Master máximo 5; composite de dos viñetas máximo 6. Sin audio, estima con `palabras × 60 / (150 × edit_speed)`.

- acción/impacto: 2–9 palabras
- reacción/detalle: 3–10
- estándar: 5–14
- master: máximo 18
- composite: 10–22 entre dos viñetas

Un panel normal con más de 18 palabras es fallo, aunque el prompt sea bueno. Divide en el cambio de sujeto, verbo, información o emoción.

## 8. Tratamientos webtoon

### Full bleed cargado

Panel completo, acción, escenario y profundidad. Usa fondo pintado y luz motivada.

### White inset single

Una viñeta rectangular con borde negro sobre blanco puro. Contenido simple. Sin `painted background` fuera de la viñeta ni rim light universal.

### White composite 2

Una sola imagen: dos viñetas separadas sobre página blanca. Pueden ir apiladas o en esquinas opuestas con gran diagonal blanca. Cada viñeta muestra un sujeto/momento simple. Máximo tres por Parte; transición, comparación, análisis o micro-reacción. No contiene diálogo, texto ni acción compleja.

### Black inset

Una viñeta con borde claro sobre negro para horror, amenaza o giro oscuro. Uno o dos por Parte, cerca de la escalada/pico.

### Narrative card

Texto de editor sobre negro. Título o frase de 2–8 palabras. No genera imagen.

### Body detail

Mano, herida, objeto o fragmento corporal que cambia decisión. No sustituye repetidamente a la persona.

### Device

Interfaz o pantalla como sujeto. Texto exacto y corto.

### Onomatopeya

Lettering protagonista, 3–5 letras, color de la acción. Cero a dos puras y dos a cuatro totales.

## 9. Color e iluminación

Define por bloque:

```text
base neutral + secundario de lugar + acento de conflicto + superficie de reflejo
```

Ejemplo abstracto:

- calma: azul lluvia + verde industrial + ocre humano + lámpara ámbar en charcos
- autoridad: azul cobalto + blanco frío + ámbar de seguridad en metal
- amenaza: negro petróleo + carmesí/violeta canónico en agua y vidrio
- poder: color propio limitado en puntos de contacto y rebotes
- consecuencia: tonos reducidos + marca corporal + fuente cotidiana cálida

No uses gris como paleta completa. Tampoco satures cada escena. El color sube con la presión y desciende después del pico.

La fuente se nombra: faro desde izquierda, baliza desde fondo, neón superior, amanecer detrás. “Dramatic lighting” sin fuente no construye continuidad.

## 10. Assets

### Base

Una figura, cuerpo completo frontal ortográfico eye-level, neutral, manos vacías, pies visibles, ropa limpia y seca, fondo gris medio, estudio uniforme.

### Derivada

Misma identidad, cámara y fondo. Cambia solo outfit o estado. Una pose mojada/dañada no reemplaza la base.

### Performance pose

Deriva de la identidad, pero representa una actuación reusable y concreta: alerta con peso atrás, esfuerzo de rescate, dolor de poder, shock que retrocede o agotamiento desafiante. Puede conservar fondo gris para ser referencia. No escribas `neutral expression` o `neutral posture` en una pose destinada a peligro.

Una criatura necesita cadena de estados: atrapada/esforzándose, preparando pulso, atacando o recibiendo impacto y caída dañada. Referenciar la misma pose de pie en toda una pelea convierte acción en catálogo.

### Prop

Objeto aislado, escala y orientación claras, fondo gris, sin mano salvo que la mano sea parte permanente del diseño.

### Plate

Arquitectura, materiales, props fijos, cámara y luz estable. Sin personas ni elementos móviles. Crea views por posición/ángulo útil, no por emoción.

## 11. Referencias

- identidad importante: character
- objeto/UI/vehículo: asset
- arquitectura compatible: escenario
- mismo instante con nuevo ángulo: scene

Máximo tres. Quita una referencia que contradiga el encuadre aunque quede espacio.

El motor no conoce los nombres ni el lore. Dentro del prompt traduce cada referencia a una firma visible y un rol espacial:

```text
The short-haired young cleaner in the gray reflective coverall stands OUTSIDE the capsule on screen-left, both boots on wet pavement. The long-haired bloodied prisoner in white restraints is the ONLY person INSIDE the capsule on screen-right.
```

Para dos personajes similares declara cabello, ropa, heridas, lado, profundidad y límite físico. “X looks at Y” no basta. Si una persona no tiene referencia disponible, no la pidas en un panel cargado: mantenla fuera de cuadro o usa otro panel. Personajes mencionados sin referencia suelen convertirse en sustitutos incorrectos.

Para continuidad:

```text
Keep [identidad, outfit, positions, object shape]. Change to [new shot/angle/state].
```

No encadenes tres escenas referenciadas; la deriva se acumula.

## 12. Prompts

La primera cláusula siempre declara quién hace qué. Después cámara, posiciones y lugar.

Evita:

- “dynamic epic scene” sin geografía
- múltiples acciones sucesivas
- paisaje que no corresponde a la voz
- plate frontal con orden cenital
- personas desenfocadas
- ángulo extremo solo por cuota
- estilo idéntico en full bleed, base e inset

Controla texto visible con string exacto. Cuerpos caídos: `lying ON TOP of` + contactos + cabeza. Manos: cantidad y posición. En acción, el verbo cambia silueta: `struggles`, `lunges`, `recoils`, `twists airborne`, `collapses`. No uses `stands` para representar ataque, impacto o caída.

Para cada rostro importante incluye al menos dos indicios de actuación. En peligro, la cadena no puede mostrar más de dos paneles humanos neutrales seguidos. Tras detonante, amenaza, manifestación y costo debe existir una reacción legible.

## 13. Gate de bases y piloto

Antes de producción masiva:

1. Genera bases.
2. Rechaza cabeza/pies cortados, manos ocultas, clima, escenario, pose, expresión fuerte o ropa mojada.
3. Genera 6–8 paneles: hook, mundo, master, dos personas, amenaza/poder, tratamiento blanco y cliffhanger.
4. Solo con renders puede aprobarse identidad, anatomía, escala y texto.

El resultado previo a renders se llama `PROMPT_RELEASE`. `RENDER_RELEASE` exige revisar cada archivo real. En pilotos comprueba también emoción, ocupación dentro/fuera, pose de criatura y que ningún personaje haya heredado la cara/outfit de otro.
