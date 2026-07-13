# Validación local V5.2

Ejecuta desde `remotion-editor`:

```powershell
node docs/manhwa-gpt-v5.2/scripts/validate_v5.mjs ruta/al/proyecto.json
```

En Custom GPT/Code Interpreter usa el validador autónomo subido como Knowledge:

```bash
python validate_v5.py proyecto.json
```

El `.mjs` integra además el validador real del repositorio; el `.py` no depende de rutas locales.

El script usa el validador real del proyecto y añade:

- integridad exacta de `full_script`
- plano, ángulo, hora y duplicados
- palabras y duración estimada por escena
- paneles normales con más de 18 palabras
- respiros reales y proporción 20–28%
- tags de audio
- margen entre última palabra y final del audio; exige cola de timeline cuando es insuficiente
- poses usadas tres o más veces
- poses neutrales usadas en acción
- personajes nombrados sin referencia
- riesgos de ocupación dentro/fuera
- `TRUE_LONG_SHOT` por ocupación/distancia/capas y cuota de clímax
- gramática rota y prompts >120 palabras
- contenedor transparente visible sin ocupante referenciado
- FPS declarado versus MP4 final cuando existe

El resultado separa:

- `status: CONTRACT_PASS|FAIL` para mecánica
- `preflight_status: PROMPT_RELEASE|PROMPT_REPAIR_REQUIRED` para generación
- `render_dependent: RENDER_PENDING` hasta inspeccionar imágenes

`CONTRACT_PASS` no significa que convenga generar. `PROMPT_REPAIR_REQUIRED` termina con código distinto de cero. Solo código 0 + `PROMPT_RELEASE` autoriza generar; solo auditoría visual produce `RENDER_RELEASE`.
