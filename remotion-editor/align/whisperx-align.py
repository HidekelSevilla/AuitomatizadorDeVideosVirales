#!/usr/bin/env python
# historias VOZ-CONTINUA, alineacion MAXIMA precision:
# usa el GUION del JSON como transcripcion fuente y solo alinea con wav2vec2 (WhisperX).
# No transcribe libremente el audio: eso cambia palabras ("La lluvia" -> "De alluvia") y rompe subtitulos.
# Salida: full.words.json [{word,start,end}].
#
# Uso: python align/whisperx-align.py <project.json> <full.mp3> <out full.words.json>
import sys, json, os, re

if len(sys.argv) < 4:
    print("Uso: python whisperx-align.py <project.json> <mp3> <out.json>", file=sys.stderr); sys.exit(1)
json_path, mp3_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
MODEL = os.environ.get("WHISPERX_MODEL", "small")

def strip_tags(text):
    return re.sub(r"\[[^\]]*\]|<[^>]*>", " ", text or "")

def scene_id(scene):
    return scene.get("id") or scene.get("scene_id")

def source_text(project):
    full = ((project.get("tts_export") or {}).get("full_script") or "").strip()
    if full:
        return strip_tags(full)
    scenes = project.get("scenes") or []
    order = ((project.get("render_export") or {}).get("clip_order")
             or (project.get("capcut_export") or {}).get("clip_order")
             or [scene_id(s) for s in scenes])
    by_id = {scene_id(s): s for s in scenes}
    parts = []
    for sid in order:
        sc = by_id.get(sid) or {}
        txt = ((sc.get("voiceover") or {}).get("text") or "").strip()
        if txt:
            parts.append(txt)
    return strip_tags(" ".join(parts))

import torch, whisperx
device = "cuda" if torch.cuda.is_available() else "cpu"
compute = "float16" if device == "cuda" else "int8"
BATCH_SIZE = int(os.environ.get("WHISPERX_BATCH_SIZE", "16" if device == "cuda" else "8"))
if device == "cuda":
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
print(f"whisperx: device={device} compute={compute} model={MODEL} batch={BATCH_SIZE}", file=sys.stderr)

audio = whisperx.load_audio(mp3_path)
with open(json_path, "r", encoding="utf-8-sig") as f:
    project = json.load(f)
transcript = re.sub(r"\s+", " ", source_text(project)).strip()
if not transcript:
    print("whisperx: el JSON no trae tts_export.full_script/voiceover.text", file=sys.stderr)
    sys.exit(2)

# Alineacion contra fuente. Segmento unico con duracion aproximada del audio cargado por WhisperX (16 kHz).
duration = float(len(audio)) / 16000.0
result = {"segments": [{"text": transcript, "start": 0.0, "end": duration}]}
model_a, metadata = whisperx.load_align_model(language_code="es", device=device)
aligned = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

words = []
for seg in aligned.get("segments", []):
    for w in seg.get("words", []):
        s, e = w.get("start"), w.get("end")
        wd = (w.get("word") or "").strip()
        if wd and s is not None and e is not None:
            words.append({"word": wd, "start": round(float(s), 3), "end": round(float(e), 3)})

words.sort(key=lambda x: (x["start"], x["end"]))
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(words, f, ensure_ascii=False)
print(f"whisperx source-align ({MODEL}): {len(words)} palabras alineadas -> {out_path}")
