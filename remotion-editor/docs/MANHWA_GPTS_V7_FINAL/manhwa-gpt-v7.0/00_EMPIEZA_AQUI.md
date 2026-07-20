# Manhwa GPTs V7.0 — empieza aquí

V7 conserva los mismos tres GPTs y corrige la dirección visual para que **Grok dibuje la página de webtoon completa**:

1. Showrunner entrega un `STORY_PACKET_V7`.
2. Director entrega el único JSON productor `PROMPT_RELEASE_V7`.
3. Grok recibe exactamente un `scene.visual.image_prompt` por escena visual y devuelve un JPG completo.

Una parte real usa `packet_scope:PRODUCTION_PART`, `v7_contract.mode:"PRODUCTION"`, `timeline_model:"NARRATION_VISUAL_TRACKS_V1"` y 30–55 escenas visuales; para 90–100 segundos, el estándar es 43. `PILOT` solo existe para una prueba solicitada de menos de 60 segundos. Nueve beats narrativos no significan nueve imágenes: el Director debe desglosarlos en páginas de acción, reacción, detalle, revelación, relación y respiro. Las líneas exactas viven en `narration_track`; cada página Grok las referencia mediante `narration_ref`, sin duplicar audio. El proveedor de imágenes es siempre `pipeline.image_generation.tool:"grok"`, nunca Flow.
4. Auditor revisa el JSON antes de generar y después revisa cada JPG real.

El editor no fabrica los paneles. Solo solicita, guarda y usa `images/scene_XX.jpg`.

## Archivos que se cargan

No mezcles archivos V5, V6 ni otra copia de V7.

### GPT 1 — Showrunner: 3 archivos

1. `SHOWRUNNER_V7_KNOWLEDGE.md`
2. `GUIA_PREMISAS.md`
3. `validate_v7.py`

Pega como instrucciones `gpt_1_showrunner/LISTO_PARA_CONFIGURAR/PEGAR_EN_INSTRUCCIONES.md`.

### GPT 2 — Director: 2 archivos

1. `DIRECTOR_V7_KNOWLEDGE.md`
2. `validate_v7.py`

Pega como instrucciones `gpt_2_director/LISTO_PARA_CONFIGURAR/PEGAR_EN_INSTRUCCIONES.md`.

### GPT 3 — Auditor: 4 archivos

1. `AUDITOR_V7_KNOWLEDGE.md`
2. `validate_v7.py`
3. `GENERATION_MANIFEST_V7.template.json`
4. `RENDER_AUDIT_V7.template.json`

Pega como instrucciones `gpt_3_auditor/LISTO_PARA_CONFIGURAR/PEGAR_EN_INSTRUCCIONES.md`.

Activa Intérprete de código / Análisis de datos en los tres GPTs. Cada GPT localiza `validate_v7.py` por nombre dentro de sus Conocimientos y usa la ruta real que exponga su entorno.

## Flujo exacto

### 0. Pedir premisas al Showrunner — opcional

Usa este paso solo si todavía no tienes una premisa. El Showrunner consulta `GUIA_PREMISAS.md`, pero no inventa nombres en esta fase:

```text
Propón tres premisas originales de manhwa profesional de fantasía seriada.

Vertical: [FORMATO O DURACIÓN]
Tono: [OSCURO / HEROICO / CÓMICO]
Horizonte: [NÚMERO APROXIMADO DE PARTES]
Romance: [SÍ / NO]

Aplica las secciones 0–9 de GUIA_PREMISAS.md desde tus Conocimientos. Interpreta "precio" como presión, restricción o consecuencia amplia, no como sacrificio obligatorio. Al menos dos candidatas deben declarar NO_INTRINSIC_PERSONAL_PRICE y usar familias distintas de presión externa u operativa; como máximo una puede usar sacrificio personal. No repitas familias de presión. Por defecto no uses como pago memoria, recuerdos, olvido de seres queridos, identidad, años de vida, humanidad, cordura ni daño transferido a personas queridas. Prefiere amenazas y enemigos que escalan, gates letales, misiones, deadlines, competencia, exposición, recursos, cooldowns, condiciones, conocimiento incompleto u oportunidad táctica.

No uses nombres propios: describe a cada personaje por oficio, función, vínculo o arquetipo. Para cada candidata muestra intrinsic_personal_price: YES|NO, pressure_family y pressure_mechanic. Entrega los tres candidatos rankeados con logline, motor elegido, diferenciador, primer cliffhanger y puntuación /15. Antes de responder comprueba que haya al menos dos NO, como máximo un YES y tres familias distintas; si falla, regenera. No escribas todavía STORY_PACKET_V7; espera mi elección.
```

Si tú ya proporcionas una premisa, omite este paso: el Showrunner la considera seleccionada y no te obliga a elegir entre otras tres.

Cuando recibas los candidatos, responde:

```text
Elijo la premisa [1, 2 o 3]. Considérala aprobada y crea la Parte 1 como STORY_PACKET_V7. Ahora sí crea nombres originales e IDs estables para el canon.
```

### 1. Pedir la historia al Showrunner

```text
Crea la Parte 1 de una historia original de manhwa profesional.

Premisa elegida o proporcionada: [PREMISA]
Género y tono: [GÉNERO Y TONO]
Alcance: PRODUCTION_PART; no es piloto.
Duración objetivo del video: [por ejemplo, 90–100 segundos]
Idioma: español latino.

Usa GUIA_PREMISAS.md desde tus Conocimientos para reforzar el motor serial sin sustituir la premisa elegida. Si la premisa no exige un coste, usa NO_INTRINSIC_PERSONAL_PRICE: no inventes pagos con memoria, recuerdos, identidad, años de vida, humanidad, cordura o seres queridos. Genera tensión mediante oposición, riesgo, gate, dificultad, enemigos, exposición, competencia, recursos, condiciones o límites operativos. La función COST es una consecuencia o presión, no una tarifa sobrenatural, y PAYOFF es la resolución de una promesa narrativa.

Entrega únicamente STORY_PACKET_V7. Cada obligación lleva una rhythm_function válida: ACTION, REACTION, DETAIL, BREATHER, REVEAL o RELATION, más must_be_own_generated_page y may_share_page coherentes; si la primera es true, la segunda debe ser false. Incluye canon, estados, causalidad, semillas y resoluciones previstas. Crea un MONOLOGO_LOCKED completo para esta Parte. No diseñes cámara, páginas ni prompts. Ejecuta validate_v7.py desde tus Conocimientos y entrega PACKET_READY_V7 solo con exit 0.
```

Para Parte 2 o posterior, adjunta el último packet aprobado:

```text
Continúa con la Parte [N]. Conserva exactamente canon, IDs, estados de salida e hilos pendientes de la Parte anterior. Crea un MONOLOGO_LOCKED nuevo y exclusivo de esta Parte. No reconstruyas continuidad desde la memoria del chat.
```

### 2. Pedir el JSON al Director

Adjunta el `STORY_PACKET_V7` aprobado:

```text
Convierte el STORY_PACKET_V7 adjunto en el único JSON productor V7 para preset manhwa. Es una entrega completa, no un piloto: `packet_scope:PRODUCTION_PART` obliga `v7_contract.mode:"PRODUCTION"`, `timeline_model:"NARRATION_VISUAL_TRACKS_V1"` y `production_panel_count:43` para esta parte de 90–100 segundos. Entrega exactamente 43 escenas `type:"panel"`. No confundas los beats del packet con el número de páginas; desglosa cada beat en acción, reacción, detalle, revelación, relación y respiro.

Copia cada `atom_id/text_exact` a `narration_track.units` con canonicalización `NFC_LF_UTF8_NO_TRAILING_LF`. Cada página omite `voiceover` y `captions`, y declara `narration_ref:{unit_id,timing_weight}`; reparte una o más páginas por unidad sin dejar ninguna unidad o página huérfana. `tts_export.full_script` sigue siendo el join LF exacto de las unidades.

Usa generation_mode GROK_NATIVE_PAGE y `pipeline.image_generation.tool:"grok"`. Cada scene type:"panel" debe llevar un único visual.image_prompt natural en inglés para que Grok dibuje la página completa. Conserva visual exclusivamente con image_prompt; coloca la planificación verificable en scene.visual_plan.native_page y scene.visual_plan.shots. Usa page_mix.basis TYPE_PANEL_ONLY, método LARGEST_REMAINDER y 30% WHITE_PAGE, 30% BLACK_PAGE, 40% OTHER. Repite descripciones físicas completas, emociones, poses y escenario absoluto; nunca dependas solo del nombre Mujin ni uses “Same ... geometry/materials”.

Ejecuta validate_v7.py --preflight y entrega PROMPT_RELEASE_V7 solo con exit 0.
```

### 3. Preflight con Auditor

```text
Audita el STORY_PACKET_V7 y el único JSON productor adjuntos. Antes de todo, exige `PRODUCTION_PART` → `mode:"PRODUCTION"` → `timeline_model:"NARRATION_VISUAL_TRACKS_V1"` → `production_panel_count:43`, y `pipeline.image_generation.tool:"grok"`; rechaza downgrade a `PILOT`, Flow o conteo 1:1 de beats como páginas. Comprueba que `narration_track` copie exactamente los átomos, que cada página tenga `narration_ref` positivo, estructura runtime V2.8, generation_mode GROK_NATIVE_PAGE, page_mix 30/30/40, familias, layouts, prompts naturales, descriptores físicos, emociones, cámaras, views, continuidad y TTS. Puedes reparar solamente el JSON sin cambiar historia ni MONOLOGO_LOCKED. Ejecuta validate_v7.py --preflight. Entrega PROMPT_RELEASE_V7 solo con exit 0; si no, BLOCKED_PREFLIGHT_V7 con errores concretos.
```

### 4. Generación

El automatizador manda una solicitud a Grok por cada escena:

```text
scene.visual.image_prompt → Grok → images/scene_XX.jpg
```

Ese JPG ya contiene el fondo, espacio negativo, paneles, insets, personajes y ángulos pedidos.

### 5. Postflight con Auditor

```text
Audita cada images/scene_XX.jpg directo contra el JSON productor, GENERATION_MANIFEST_V7 y RENDER_AUDIT_V7 poblados con hechos reales. Comprueba familia, layout, número de paneles, porcentaje de fondo con tolerancia ±15 puntos, identidad, emoción, cámara, texto accidental, bocadillos, crop y legibilidad. ACCEPTABLE_VARIANCE permite una desviación menor; familia equivocada, panel extra, bocadillo o identidad incorrecta exigen RETAKE. No inventes modelo, job ID, hash, observación ni procedencia. Solo exit 0 permite RENDER_RELEASE_V7.
```

Comandos:

```text
python "<RUTA_CONOCIMIENTOS>/validate_v7.py" --packet-only "<packet.md>"
python "<RUTA_CONOCIMIENTOS>/validate_v7.py" --preflight "<project.json>"
python "<RUTA_CONOCIMIENTOS>/validate_v7.py" --postflight "<project.json>" "<GENERATION_MANIFEST_V7.json>" "<RENDER_AUDIT_V7.json>" --artifact-root "<artifact_root>"
```

## Contrato visual mínimo

```json
{
  "v7_contract": {
    "version": "7.0",
    "generation_mode": "GROK_NATIVE_PAGE",
    "mode": "PRODUCTION",
    "canvas": { "width": 720, "height": 1280 },
    "runtime_adapter": {
      "grok_native_full_page": true,
      "page_blueprint_slots_integrated": false
    },
    "page_mix": {
      "basis": "TYPE_PANEL_ONLY",
      "method": "LARGEST_REMAINDER",
      "ratios": { "white": 30, "black": 30, "other": 40 },
      "counts": { "white": 13, "black": 13, "other": 17 }
    }
  },
  "scenes": [
    {
      "id": "scene_01",
      "type": "panel",
      "references": {
        "characters": [{ "id": "protagonist", "pose": "worried_hold" }],
        "escenario": {
          "id": "location_01",
          "view": "view_03",
          "geometry_authority": "GEOMETRY_LOCK"
        }
      },
      "visual": {
        "image_prompt": "Natural English prompt sent directly to Grok"
      },
      "visual_plan": {
        "native_page": {
          "family": "WHITE_PAGE",
          "layout": "WHITE_INSET",
          "background_pct": 50,
          "panel_count": 1,
          "composition": "exactly one image panel; one small inset panel containing the complete worried portrait and deliberate white breathing room"
        },
        "shots": [
          {
            "panel_id": "A",
            "content_role": "REACTION",
            "visible_entities": ["protagonist"],
            "location_id": "location_01",
            "view_id": "view_03",
            "camera": {
              "scale": "CLOSE",
              "elevation": "EYE_LEVEL",
              "viewpoint": "PROFILE",
              "azimuth_deg": 90,
              "lens_mm": 70,
              "roll_deg": 0,
              "dominant_subject": "protagonist",
              "occupancy_pct": 65
            },
            "prompt_fragment": "Panel A: close shot, eye-level angle, profile view, level camera roll, using a 70mm lens..."
          }
        ]
      },
      "continuity": {}
    }
  ]
}
```

`visual` contiene únicamente `image_prompt`. `visual_plan` y `continuity` son metadata de dirección y auditoría; el editor no debe tratarlas como instrucciones adicionales. La cola solo bloquea una contradicción de cámara cuando afecta al primer shot con `GEOMETRY_LOCK`, porque esa es la única placa ambiental realmente adjuntada a Grok. Una discrepancia de cámara en shots B/C se conserva como advertencia editorial no bloqueante: sus ángulos efectivos ya viven dentro de `visual.image_prompt`.

No existe un límite local fijo de tres referencias. La extensión elimina duplicados y adjunta todas las referencias resolubles declaradas para la escena; `WAIT_FOR_REFS` exige que Grok confirme la cantidad completa de chips antes de enviar el prompt. Si la interfaz del proveedor rechaza una carga concreta, la escena falla explícitamente: nunca se recortan ingredientes o referencias en silencio.

El validador de cola de Node comprueba que cada pose declarada exista y sea resoluble, pero no bloquea por cuotas artísticas de poses distintas ni por repeticiones consecutivas. Esa variedad pertenece al preflight editorial del Director/Auditor con `validate_v7.py`, no a la capacidad técnica de la extensión para generar.

## Reglas que evitan scene_07/scene_12 defectuosas

- `panel_count:1` exige la frase exacta `exactly one image panel`.
- `panel_count:2` exige `exactly two image panels`, además de `Panel A:` y `Panel B:`.
- `panel_count:3` exige `exactly three image panels`, además de A/B/C.
- Decir solamente `with one inset` no prueba el conteo y falla.
- WHITE incluye literalmente `Pure white webtoon page` y el porcentaje de blanco.
- BLACK incluye literalmente `Matte-black webtoon page` y el porcentaje de negro.
- WHITE y BLACK usan `editor_motion` estático para no recortar lo que ya dibujó Grok.
- Cada personaje visible se describe físicamente; su nombre o ID nunca sustituye la descripción.
- Cada ángulo se expresa tanto en metadata como en lenguaje natural.
- Cada `lens_mm` se expresa también dentro de su fragmento como `using a 70mm lens` o el valor real correspondiente.
- `WHITE_INSET` es un único panel pequeño que contiene toda la acción; no puede pedir retrato principal más otro inset de objeto.
- Para retrato principal más detalle de dinero usa `WHITE_COMPOSITE_2`, `panel_count:2`, `exactly two image panels` y fragmentos `Panel A:`/`Panel B:`.

La prohibición del formato máquina de siete líneas aplica solamente a `scene.visual.image_prompt`. Los prompts generadores de assets `escenarios.<id>.views.<view>.prompt` conservan exactamente las siete líneas `CAMERA/SUBJECTS/ACTION/ENVIRONMENT/LIGHTING/STYLE/NEGATIVE` que exige el runtime.

Con `GEOMETRY_LOCK`, `scene.references.escenario.id/view` coincide exactamente con `visual_plan.shots[0].location_id/view_id` y su cámara es compatible con la `camera_signature` de esa view. El runtime adjunta esa única view como referencia ambiental primaria; los paneles internos restantes deben sostener sus otros ángulos mediante descripciones espaciales absolutas completas.
