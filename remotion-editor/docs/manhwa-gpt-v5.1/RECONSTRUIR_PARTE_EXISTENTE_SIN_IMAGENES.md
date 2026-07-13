# Reconstruir una Parte existente en V5.1 sin subir renders

## 1. Migrar el Story Packet en Showrunner

Adjunta o pega el `STORY_PACKET_V5` aprobado y escribe:

```text
MIGRAR STORY_PACKET A V5.1 — SIN REESCRIBIR LA HISTORIA

Conserva carácter por carácter MONOLOGO_LOCKED, canon, revelaciones, personajes, poder, cliffhanger y Parte.

Añade únicamente los campos V5.1 que faltan:

1. firmas visuales completas de cada personaje recurrente;
2. separación visual de personajes similares;
3. ocupación inequívoca dentro/fuera de cápsulas, vehículos y zonas;
4. mapa emocional de 5–8 beats con rostro y cuerpo observables;
5. cadena espacial antes/durante/después de interacciones críticas;
6. cadena de estados de la amenaza: atrapada, carga, impacto y consecuencia;
7. reacciones obligatorias después de detonante, peligro, manifestación y costo;
8. QA_SHOWRUNNER con production_clarity, performance_map, causal_coincidences y audio_tags.

No cambies ninguna palabra, signo o tag del monólogo. Devuelve el STORY_PACKET_V5 completo migrado.
```

## 2. Reconstruir el JSON en Director Visual

Adjunta:

- Story Packet migrado
- JSON anterior
- `AUDITORIA_RENDER_EL_BARRENDERO_P1.md`
- `RETAKE_MANIFEST_EL_BARRENDERO_P1.json`

No adjuntes imágenes. Escribe:

```text
RECONSTRUIR PARTE V5.1 — RETAKE ESTRUCTURAL SIN CAMBIAR EL GUION

Fuentes en este orden:
1. STORY_PACKET_V5 migrado para canon y MONOLOGO_LOCKED.
2. Reglas V5.1 para producción.
3. Auditoría y RETAKE_MANIFEST para fallos observados.
4. JSON anterior solo para rutas, assets, views y escenas aprobadas.

Reconstruye el JSON completo; no entregues parches.

Obligatorio:

- full_script y voz carácter por carácter idénticos;
- conservar series_id, part y slug;
- mantener IDs/rutas de escenas aprobadas cuando su ventana no cambie;
- conservar bases, outfits y views útiles como existing;
- crear como generate performance poses de alerta, rescate, dolor, shock y desafío;
- crear estados del perro: pinned_struggling, charging_pinned, impact_airborne y collapsed_broken;
- resegmentar por duración: acción 2–9 palabras, estándar 5–14, master máximo 18;
- objetivo normal 1.3–4.5 s, master 5 s, composite 6 s;
- usar aproximadamente 38–44 escenas según duración, no por cuota;
- alcanzar 20–28% de respiros reales, normalmente 8–11;
- máximo tres white composites, con layouts distintos;
- describir físicamente cada referencia y su rol espacial dentro del prompt;
- en cápsula: limpiador de pelo corto y overol gris completamente fuera; prisionero de pelo largo, ropa negra y correas blancas como único ocupante interior;
- no mencionar personajes visibles sin referencia;
- cada rostro de peligro usa al menos dos indicios observables;
- ninguna pose neutral en rescate, dolor, ataque o cliffhanger;
- conservar renders aprobados y listar exactamente qué escenas son existing/aprobadas, nuevas o retake;
- status máximo PROMPT_RELEASE; nunca RENDER_RELEASE sin renders.

Entrega JSON completo, assets nuevos, lista de reutilización/retakes y métricas V5.1.
```

## 3. Preflight en Auditor sin imágenes

Adjunta Story Packet migrado y JSON reconstruido:

```text
AUTO_REPAIR_PREFLIGHT

No hay renders en esta etapa. Audita y repara el JSON completo con V5.1.

Comprueba especialmente duración por escena, poses neutrales en acción, estados del perro, firmas descriptivas, ocupación dentro/fuera, personajes mencionados sin referencia, respiros reales, TTS exacto y cola final de 0.45 segundos.

Devuelve JSON completo PROMPT_RELEASE o PROMPT_REPAIR_REQUIRED. No declares RENDER_RELEASE.
```

## Reutilización

No se pierde:

- monólogo y audio `full.mp3`
- bases correctas
- escenarios/views
- cards
- renders aprobados cuyos IDs se conservan

Al cambiar segmentación se reinjectan ventanas/timestamps, pero no se vuelve a generar TTS si `full_script` conserva el mismo hash.
