# Validación local V5

Ejecuta desde `remotion-editor`:

```powershell
node docs/manhwa-gpt-v5.0/scripts/validate_v5.mjs ruta/al/proyecto.json
```

El script utiliza el validador real del proyecto y añade métricas V5 de prompts, full_script, rachas de close y tratamientos detectables.

Un `CONTRACT_PASS` no aprueba imágenes no generadas. `render_dependent` permanece `NOT_RUN` hasta inspeccionar renders.

