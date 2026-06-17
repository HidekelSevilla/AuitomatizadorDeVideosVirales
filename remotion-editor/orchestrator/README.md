# Orquestador

Vigila la cola, verifica que cada trabajo tenga TODOS sus medios y dispara el render.
**No toca la extension.** Solo lee carpetas y llama a Remotion. Sin dependencias externas.

## Como se usa
1. Pon un trabajo en `queue/<nombre>/project.json` (el JSON maestro).
2. Los medios deben ir, por `slug`, a:
   - `public/<slug>/clips/scene_XX.mp4`  (los deja Flow)
   - `public/<slug>/voice/scene_XX.mp3` + `hook.mp3`  (los deja Fish)
   - `public/<slug>/music/...` y `public/sfx/...`
3. Corre el orquestador.

## Karaoke sincronizado (opcional, antes de renderizar)
Para que el subtitulo karaoke quede clavado a la voz, genera los timestamps por palabra
con whisper.cpp (local, gratis, una sola descarga ~600MB la primera vez):
```powershell
npm run align queue/mi-proyecto.json   # inyecta voiceover.words / hook.words en el JSON
```
Si no lo corres, el karaoke usa reparto uniforme (aproximado). Ver align/whisper-align.mjs.

## Comandos
```powershell
cd remotion-editor

# Ver que falta en cada trabajo (no renderiza)
node orchestrator/build.mjs --status

# Renderiza todos los trabajos que ya esten completos (una vez)
node orchestrator/build.mjs

# Daemon: revisa la cola cada 5s y renderiza lo que se complete
node orchestrator/build.mjs --watch

# Un JSON puntual
node orchestrator/build.mjs ./data/test-project.json
```

## Que hace con cada trabajo
- Si faltan medios -> lista exactamente que archivos faltan y lo deja pendiente.
- Si esta completo -> renderiza a `out/<slug>.mp4` y mueve el trabajo a `done/<nombre>/`.

## Donde encaja
Esta es la pieza que cierra el ciclo entre Flow (clips), Fish (audios) y el render.
Cuando exista el puente extension<->dev-server, el flujo sera: sueltas el JSON en la cola,
Flow y Fish dejan sus archivos en `public/<slug>/`, y el orquestador en modo `--watch`
detecta que el trabajo quedo completo y lo renderiza solo.

Pendiente (no construido aun): la integracion con Fish por API y el puente con la extension.
