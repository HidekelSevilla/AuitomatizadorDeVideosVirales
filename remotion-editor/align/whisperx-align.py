#!/usr/bin/env python
# historias VOZ-CONTINUA, alineacion MAXIMA precision: transcribe full.mp3 con faster-whisper y luego
# ALINEA con wav2vec2 (WhisperX) -> timestamps por palabra clavados (~20-50ms), mejor que whisper.cpp.
# Salida: full.words.json [{word,start,end}]. El editor (inject-words buildTiming) matchea el guion contra
# estas palabras -> ventanas e inicio/fin por escena exactos.
#
# Uso: python align/whisperx-align.py <project.json> <full.mp3> <out full.words.json>
import sys, json, os

if len(sys.argv) < 4:
    print("Uso: python whisperx-align.py <project.json> <mp3> <out.json>", file=sys.stderr); sys.exit(1)
json_path, mp3_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
MODEL = os.environ.get("WHISPERX_MODEL", "small")

import torch, whisperx
device = "cuda" if torch.cuda.is_available() else "cpu"
compute = "float16" if device == "cuda" else "int8"
print(f"whisperx: device={device} compute={compute} model={MODEL}", file=sys.stderr)

audio = whisperx.load_audio(mp3_path)

# 1) transcripcion (da limites de segmento). 2) alineacion wav2vec2 -> palabras precisas.
model = whisperx.load_model(MODEL, device, compute_type=compute, language="es")
result = model.transcribe(audio, batch_size=8, language="es")
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
print(f"whisperx ({MODEL}): {len(words)} palabras alineadas -> {out_path}")
