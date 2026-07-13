# Prompts de uso V5.2

## 1. Nueva serie automática

En Showrunner:

```text
NUEVA SERIE AUTO

Semilla opcional: [una idea en lenguaje normal].

Quiero el perfil comercial predeterminado. Ejecuta todos los gates y entrega únicamente STORY_PACKET_V5 con la Parte 1.
Objetivo editado: 90–100 segundos. Amenaza antes de 25 s, agencia antes de 45 s y comienzo del payoff antes del 75%. No recortes emoción solo para alcanzar una cifra exacta.
```

Sin semilla:

```text
NUEVA SERIE AUTO

Genera internamente cinco premisas comerciales de motores distintos, elige la mejor por gates y entrega STORY_PACKET_V5 con Parte 1. No muestres descartes.
```

## 2. Continuar una serie

En el mismo chat del Showrunner:

```text
SIGUIENTE PARTE AUTO

Continúa desde el cliffhanger vigente. Cobra una promesa del loop, progresa un eje, rota el tipo de apertura y entrega STORY_PACKET_V5 de la nueva Parte.
```

## 3. Producir JSON

Adjunta `STORY_PACKET_V5.md` al Director:

```text
PRODUCIR PARTE AUTO

Usa el Story Packet adjunto. Bloquea el monólogo, ejecuta shot plan y gates internamente y entrega JSON completo más métricas. Motor visual: Grok/Aurora.
Incluye 4–6 TRUE_LONG_SHOT verificables, 20–28% de respiros y ejecuta `validate_v5.py`; no otorgues PROMPT_RELEASE si no termina con código 0.
```

Para reutilizar assets de una Parte previa, adjunta también el JSON anterior:

```text
PRODUCIR SIGUIENTE PARTE AUTO

Usa el Story Packet y el JSON anterior. Conserva como existing las rutas ya generadas y crea solo estados/views nuevos.
```

## 4. Auditoría y reparación

Adjunta Story Packet y JSON al Auditor:

```text
AUTO_REPAIR_PREFLIGHT

Ejecuta todos los gates narrativos, de duración, actuación, referencias, ritmo, contrato y TTS. Repara todo lo permitido y devuelve JSON completo marcado PROMPT_RELEASE. Sin renders no declares RENDER_RELEASE. No entregues parches parciales.
Ejecuta `validate_v5.py`: CONTRACT_PASS solo no basta; exige preflight_status PROMPT_RELEASE y código 0. Si no puede repararse sin cambiar canon/monólogo, devuelve BLOCKED_*.
```

## 5. Auditoría de renders

Adjunta imágenes numeradas o una tira/contact sheet:

```powershell
python scripts/make_contact_sheets.py public\SERIE\images --output-dir public\SERIE\contact-sheets
```

```text
AUDITAR RENDERS

Compara cada archivo, en orden, con Story Packet y JSON. Comprueba significado, identidad, dentro/fuera, emoción, pose/estado, escala, manos y continuidad. Conserva tomas correctas y devuelve RETAKE_MANIFEST + JSON de retakes para las fallidas. Solo si todo pasa usa RENDER_RELEASE.
```

Después de regenerar retakes, vuelve a adjuntar únicamente las imágenes corregidas, el JSON y el manifiesto previo:

```text
REAUDITAR RETAKES

Comprueba que cada fallo observable quedó resuelto y que no apareció deriva nueva. Devuelve un manifiesto adicional o RENDER_RELEASE.
```

## 6. Auditoría del MP4 final

En Codex, sin subir decenas de imágenes:

```text
Usa $llm-council. Audita el MP4, JSON y carpeta local de renders. Puntúa hook, claridad fría, retención, payoff, escala, ritmo y cliffhanger. Decide PUBLICAR, REPARAR o DESCARTAR. No generes HTML.
```

En el GPT Auditor, adjunta el MP4 o contact sheets legibles:

```text
AUDITAR VIDEO FINAL

Revisa a 1×: hitos temporales, captions móviles, identidad, continuidad, TRUE_LONG_SHOT, música/SFX, FPS, último fonema y cola. No declares RENDER_RELEASE por intención del prompt.
```

## 7. Taller opcional

```text
MODO TALLER. Detente después de cada etapa y espera mi OK.
```

El modo taller no es el predeterminado de producción.
