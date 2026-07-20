# Consejo LLM — contrato visual Manhwa V7

Fecha: 2026-07-15

## Decisión planteada

Diseñar Manhwa GPT V7 para que el pipeline local con Grok produzca una gramática profesional y verificable: aproximadamente 30% de páginas con lienzo blanco, 30% con lienzo negro mate y 40% de otras familias —full bleed, splash, acercamientos, inserts de objetos y respiraciones ambientales—. Todo prompt enviado al proveedor debe describir físicamente a cada personaje o criatura en lugar de depender de nombres propios, y los cambios de cámara deben ser materiales.

Evidencia observada:

- en 43 imágenes, el lenguaje directo de página produjo 5 blancas (11.6%) y 1 negra (2.3%);
- `scene_12` pidió un inset y 60% de negro, pero produjo dos regiones, aproximadamente 43.9% de negro y un ojo violeta en una criatura declarada sin ojos;
- `scene_09` pidió plano bajo lateral, pero adjuntó una placa `three_quarter_front` y repitió la geometría de `scene_08`;
- V6 ya posee compositor determinista, aunque solo 10 de 37 páginas lo usaban.

Opciones:

- A: pedir a Grok la página completa mediante prosa;
- B: generar fuentes limpias y componer determinísticamente todas las páginas;
- C: mezclar páginas directas de Grok y composición determinista.

## Respuestas independientes

### Contrarian

Reject A. The evidence already falsifies the premise that Grok reliably obeys page-layout percentages: “matte black” produced 43.9% black, extra regions, continuity corruption, and wasted regeneration. C preserves the same stochastic failure path unless direct-page generations are excluded from quota-critical white/black slots. V7 should adopt B.

Essential V7 gates:

- Preallocate the complete episode’s 30/30/40 mix before image generation using deterministic integer rounding. White and black compositions must be blueprint-owned, not prompt-inferred.
- Measure final rendered pixels, not prompt labels. Gate white/black coverage, connected-region count, inset count, margins, and unintended full-bleed leakage against blueprint-specific numeric tolerances.
- Generate crop-safe source cells with explicit subject placement and safe zones. Reject cells with baked-in borders, pseudo-panels, text, or incompatible aspect geometry.
- Every provider prompt must repeat a canonical visual identity block for every visible character or creature. Proper names may exist only as metadata. Immutable traits—especially “no eyes/no visible ocular structures”—need automated visual auditing and fail-closed regeneration.
- Encode camera as a machine-checkable signature: shot scale, azimuth, elevation, lens class, subject facing, horizon position, and composition axis. Consecutive scenes must differ across at least two material dimensions; textual camera instructions override conflicting reference geometry.
- Compare perceptual geometry with adjacent accepted frames to catch scene_08/09-style repetition.
- Validate schemas, asset counts, dimensions, compositor output, and fallback behavior before runtime. Never silently substitute direct generation when composition fails.

The fatal risk is treating probabilistic prompt compliance as production infrastructure. It degrades quality, continuity, quotas, and runtime simultaneously.

### First Principles

The real objective is not “persuade Grok to make 30/30/40 pages.” It is to guarantee the delivered distribution while using Grok only for what it does reliably: generating source imagery. Choose B. Reject A outright. Direct-page prompting has already failed both statistically and semantically; more prompt emphasis will only spend retries on an uncontrollable layout model. C should be limited to the 40% expressive category, never used to satisfy white/black quotas.

V7 needs these non-negotiable rules:

- Compile a deterministic page manifest before generation: exactly 30% white blueprints, 30% matte-black blueprints, 40% other grammar, with rounding resolved globally.
- Route every white/black page through `page_blueprint`; composition cannot be optional. Generate full-bleed, marginless source cells, then place them deterministically.
- Validate final pixels, not prompt wording: minimum white/black occupancy thresholds, expected panel count, inset bounds, gutter/background color, and absence of unintended visual regions.
- Expand every provider prompt from canonical visual identity fields: anatomy, face, hair, clothing, silhouette, scale, materials, and immutable creature traits. Proper names may remain as metadata but never substitute for description.
- Encode forbidden mutations explicitly and gate them visually: “eyeless” must produce no eye, socket, iris, or glowing eye-like mark.
- Assign each scene a camera signature—azimuth, elevation, distance, lens feel, subject placement, and motion axis—and reject adjacent signatures that are materially equivalent.
- Attach references only when their viewpoint supports the requested camera; otherwise identity references must be separated from composition references.
- Localize retries to failed source cells, cap them, and never regenerate an already-valid composed page.

What is at stake is converting aesthetic intent into enforceable runtime behavior. V6 had the right compositor but treated it as an exception; V7 must make it the production contract.

### Expansionist

Choose B and turn V7 into a provider-agnostic storyboard compiler: Grok illustrates cells; V7 owns page design. Reject A outright. The observed 11.6% white and 2.3% black proves prompt prose is not a layout control system. Option C retains the same unreliable failure surface for the pages where composition matters most.

Essential V7 rules and gates:

- Build a deterministic quota ledger before generation. For 43 deliverables, allocate 13 white, 13 black, and 17 other, with adjacency/run-length rules. Count only final composed outputs.
- Make `page_blueprint` mandatory for every scene, including full bleed and splash pages. The renderer—not Grok—must own canvas color, margins, gutters, panel count, inset position, and occupied-area percentages.
- Generate source cells edge-to-edge, then crop/place them. A failed cell triggers one-cell repair, never whole-page regeneration.
- Compile provider prompts from canonical visual manifests. Every character or creature mention must expand into anatomy, clothing, silhouette, palette, age, and invariant traits. Proper names may exist internally but must fail provider-prompt validation if not accompanied by the full descriptor.
- Add immutable negative invariants: “no eyes/eye sockets/glow” for the eyeless creature, with visual audit failure if violated.
- Represent camera as a numeric signature: shot scale, azimuth, elevation, lens, roll, and subject screen position. Adjacent scenes must differ on at least two dimensions; reference images that conflict with the requested geometry must be rejected.
- Post-render gates must verify background coverage, connected visual regions/panel count, blueprint geometry, and quota compliance.

The larger upside is a reusable visual grammar engine: changing providers no longer changes composition reliability, and regeneration becomes targeted, cheap, and predictable.

### Outsider

Choose B. Reject A outright. The evidence already proves that prompting for page design is not a control system: “white page” produced 11.6%, “black page” 2.3%, and scene_12 failed its own 60% black-space instruction while inventing a forbidden eye. A cold viewer sees the pixels, not the prompt label.

V7 needs these hard gates:

- Allocate final outputs deterministically: for 43 images, 13 white, 13 black, 17 other. Count rendered files only—not metadata or intent.
- White/black quota pages must use `page_blueprint`. Validate canvas-color occupancy against declared bounds, slot count, slot geometry, crop safety, and absence of unintended visual regions before release.
- Grok generates clean source cells, not gutters, insets, or negative-space architecture. Direct page generation may be experimental, but must not satisfy quotas.
- Expand every provider-facing ID into a visual description on every prompt occurrence. Proper names cannot carry appearance. Immutable traits need explicit positives and negatives: “smooth eyeless head; no eyes, sockets, pupils, or glowing facial marks.”
- Camera approval must be perceptual, not lexical. Adjacent shots require material changes in framing geometry—subject placement/size, elevation, viewpoint, or horizon—not merely different camera words. A `CONTRAST` shot must reject any reference whose geometry lock conflicts with its requested camera.
- Audit continuity after generation: identity, creature anatomy, props, damage state, screen direction, lighting, and entity count.
- Preflight every blueprint source path, reference, bounds, output dimensions, and final render.

V6’s compositor is already the reliable mechanism; its mistake was making composition optional. V7 should make it authoritative. This protects visible professionalism and stops paying regeneration costs for constraints Grok has demonstrated it does not reliably obey.

### Executor

Choose B. Make layout a deterministic runtime responsibility; Grok should generate clean full-bleed source cells, never the final white/black page.

V7’s essential execution rules:

- Allocate page grammar by batch using exact quotas, not probabilities: 30% white, 30% matte-black, 40% other, with deterministic rounding and sequence rules preventing repeated grammar.
- Port V6’s `page_blueprint` compositor into the mandatory render path. Every scene must receive a blueprint before provider prompting.
- Validate the composed pixels, not prompt wording: background coverage thresholds, inset count, safe margins, cell occupancy, output dimensions, and successful file creation. Fail locally before regeneration.
- Expand every character and creature name into a locked visual descriptor inside every provider prompt. Proper names may remain as metadata only. Explicitly encode invariants such as “no eyes, no iris, no glowing eye-like marks.”
- Give references narrow roles: identity/style continuity only. Do not let an environment or character reference silently dictate camera geometry.
- Represent camera as a comparable signature: shot scale, azimuth, elevation, lens character, subject position, and horizon. Adjacent scenes must differ materially in at least two high-impact fields; text-label changes alone do not pass.
- Gate prompt/reference contradictions before provider submission and gate visual continuity afterward.
- Keep retries surgical: regenerate a source cell for content failure; recompose locally for layout failure.

Reject A outright. The measured results show Grok does not reliably obey negative-space percentages, region counts, anatomy constraints, or camera declarations when also responsible for page design. Continuing that approach spends provider calls on a problem already solved deterministically. The first concrete action is to make blueprint assignment and composition mandatory for all scenes, then add quota and camera-signature validation before any image request.

## Anonimización para revisión

- A = Expansionist
- B = Contrarian
- C = Outsider
- D = First Principles
- E = Executor

## Revisiones anónimas

### Revisor 1

La respuesta B es la más fuerte porque convierte la recomendación en contrato medible: redondeo determinista, regiones/píxeles, identidad, cámara y ausencia de fallback silencioso. D tiene el mayor punto ciego por no precisar cuotas, umbrales ni política de fallo. Todas omitieron calibración, benchmark representativo, regresión V6/V7, canary y escalamiento humano.

### Revisor 2

B es la más implementable por sus checks de render, identidad, cámara, crop y fallback. C deja una ambigüedad sobre la obligatoriedad del compositor. Todas omiten umbrales cuantitativos, benchmark, rollout y el resultado terminal cuando se agotan los reintentos.

### Revisor 3

C conecta mejor el fallo con lo visible, incluye 13/13/17, limita Grok a celdas y cubre layout, identidad, cámara y continuidad. D es demasiado abstracta. Todas omiten calibración de validadores, política terminal, costo, latencia, observabilidad y riesgo de migración.

## Síntesis del presidente

### Donde coincide el consejo

- Opción B: Grok ilustra fuentes; el runtime diseña todas las páginas.
- La cuota 30/30/40 se calcula antes de generar y se valida sobre salidas compuestas.
- Cada prompt de proveedor expande descriptores visuales e invariantes; un nombre propio nunca sustituye apariencia.
- Cámara y referencia deben ser compatibles; una placa frontal no puede gobernar un plano bajo lateral.
- Los reintentos son por celda y los fallos de layout solo recomponen localmente.

### Donde discrepa

La única diferencia real es si la familia “otros” puede usar páginas directas del proveedor. Se rechaza esa excepción: incluso full bleed, splash, close-up, insert y breather tendrán un blueprint de un slot. Así existe un solo camino de producción y ninguna caída silenciosa.

### Puntos ciegos detectados

- hacen falta umbrales de ocupación calibrados y no simples etiquetas;
- se necesita una suite de regresión con `scene_07`, `scene_08`, `scene_09` y `scene_12` como casos negativos/positivos;
- después de tres intentos se debe detener en `HUMAN_REVIEW_V7`, nunca aceptar una imagen incorrecta;
- composición determinista garantiza geometría, no actuación ni narrativa: el Auditor conserva el gate perceptivo.

### Recomendación

Crear V7 como compilador visual determinista. Todas las escenas editoriales llevan `page_blueprint`. El episodio distribuye, con redondeo determinista, 30% `WHITE_PAGE`, 30% `BLACK_PAGE` y 40% `OTHER`. Las fuentes enviadas a Grok son siempre full-bleed y prohíben lenguaje de página, borde, inset, margen o porcentaje de vacío. El compositor crea el fondo, los paneles y el espacio negativo. El validador compara descriptores, cámara, referencias, geometría, cuotas y manifiestos; el Auditor compara los píxeles.

### Lo primero que se debe hacer

Hacer obligatorio el blueprint para toda escena y añadir antes de cualquier llamada al proveedor los gates de cuota 30/30/40, descriptor visual y compatibilidad cámara↔referencia.
