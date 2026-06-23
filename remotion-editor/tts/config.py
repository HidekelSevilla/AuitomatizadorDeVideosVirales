"""Configuracion del motor de voz ElevenLabs V3 (solo preset `historias`).

Valores VERIFICADOS contra la API/SDK oficial (junio 2026):
- model_id "eleven_v3" es valido en el SDK (README oficial).
- voice_settings.stability es DISCRETA en V3: 0.0=Creative, 0.5=Natural, 1.0=Robust.
- seed es int en [0, 4294967295].
- language_code ISO 639-1 ("es").
- output_format por defecto "mp3_44100_128".
- Request Stitching (previous_request_ids) NO esta disponible en eleven_v3 -> bloques independientes.

La API key SIEMPRE sale de la variable de entorno ELEVENLABS_API_KEY (nunca se hardcodea ni se loggea).
"""
from __future__ import annotations

import os
from pathlib import Path

# remotion-editor/ (este archivo vive en remotion-editor/tts/)
ROOT = Path(__file__).resolve().parent.parent
# salida = donde la lee el render actual (igual que fish-voice.mjs): public/<slug>/voice/full.mp3 + full.words.json
PUBLIC_DIR = ROOT / "public"

# --- Modelo / voz -------------------------------------------------------------
MODEL_ID = "eleven_v3"
STABILITY = 0.0          # V3 Creative (discreta: 0.0 Creative / 0.5 Natural / 1.0 Robust)
SIMILARITY_BOOST = 0.75  # voice_settings V3
STYLE = 0                # voice_settings V3
VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "7UB6WMKyZDj19XRGC8Sb")
OUTPUT_FORMAT = os.environ.get("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_192")
LANGUAGE_CODE = "es"
SEED = int(os.environ.get("ELEVENLABS_SEED", "42"))  # fijo en TODOS los bloques de un mismo video

# --- Chunking (V3 se desestabiliza con textos largos y con <250 chars) --------
CHUNK_MAX_CHARS = int(os.environ.get("ELEVENLABS_CHUNK_MAX", "4800"))  # V3 admite 5000/request; cortar a 4800 = menos seams
CHUNK_MIN_CHARS = int(os.environ.get("ELEVENLABS_CHUNK_MIN", "250"))

# --- Concurrencia / costo / reintentos ----------------------------------------
MAX_CONCURRENCY = int(os.environ.get("ELEVENLABS_MAX_CONCURRENCY", "4"))
USD_PER_1000_CREDITS = 0.10  # 1 credito = 1 caracter; USD ~= creditos * 0.10/1000
MAX_RETRIES = int(os.environ.get("ELEVENLABS_MAX_RETRIES", "5"))
RETRY_BASE_SECONDS = float(os.environ.get("ELEVENLABS_RETRY_BASE", "1.0"))

ENV_API_KEY = "ELEVENLABS_API_KEY"
