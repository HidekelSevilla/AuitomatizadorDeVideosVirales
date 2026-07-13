# Validación local V5.1

Ejecuta desde `remotion-editor`:

```powershell
node docs/manhwa-gpt-v5.1/scripts/validate_v5.mjs ruta/al/proyecto.json
```

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

El resultado separa:

- `status: CONTRACT_PASS|FAIL` para mecánica
- `preflight_status: PROMPT_RELEASE|PROMPT_REPAIR_REQUIRED` para generación
- `render_dependent: RENDER_PENDING` hasta inspeccionar imágenes

`CONTRACT_PASS` no significa que convenga generar. Corrige primero `PROMPT_REPAIR_REQUIRED`. Solo una auditoría visual puede producir `RENDER_RELEASE`.
