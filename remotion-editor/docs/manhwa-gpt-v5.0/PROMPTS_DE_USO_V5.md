# Prompts de uso V5

## 1. Nueva serie automática

En Showrunner:

```text
NUEVA SERIE AUTO

Semilla opcional: [una idea en lenguaje normal].

Quiero el perfil comercial predeterminado. Ejecuta todos los gates y entrega únicamente STORY_PACKET_V5 con la Parte 1.
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
```

Para reutilizar assets de una Parte previa, adjunta también el JSON anterior:

```text
PRODUCIR SIGUIENTE PARTE AUTO

Usa el Story Packet y el JSON anterior. Conserva como existing las rutas ya generadas y crea solo estados/views nuevos.
```

## 4. Auditoría y reparación

Adjunta Story Packet y JSON al Auditor:

```text
AUTO_REPAIR

Ejecuta todos los gates narrativos, visuales, contractuales y TTS. Repara todo lo permitido y devuelve un JSON completo marcado RELEASE. No entregues parches parciales.
```

## 5. Auditoría de renders

Adjunta imágenes numeradas o una tira/contact sheet:

```text
AUDITAR RENDERS

Compara cada render con Story Packet y JSON. Aprueba tomas correctas y devuelve RETAKE_MANIFEST con prompts completos para las fallidas. Evalúa también la secuencia en orden.
```

## 6. Taller opcional

```text
MODO TALLER. Detente después de cada etapa y espera mi OK.
```

El modo taller no es el predeterminado de producción.

