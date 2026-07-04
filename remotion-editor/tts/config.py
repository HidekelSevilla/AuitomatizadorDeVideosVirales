"""Configuracion del motor de voz ElevenLabs para presets del canal.

Valores VERIFICADOS contra la API/SDK oficial (junio 2026):
- model_id "eleven_v3" es valido en el SDK (README oficial).
- voice_settings.stability es DISCRETA en V3: 0.0=Creative, 0.5=Natural, 1.0=Robust.
- seed es int en [0, 4294967295].
- language_code ISO 639-1 ("es").
- output_format por defecto "mp3_44100_192".
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
VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "8mBRP99B2Ng2QwsJMFQl")
MANHWA_VOICE_ID = os.environ.get("ELEVENLABS_MANHWA_VOICE_ID", "452WrNT9o8dphaYW5YGU")
MANHWA_SYSTEM_VOICE_ID = os.environ.get("ELEVENLABS_MANHWA_SYSTEM_VOICE_ID", "iOeCMakiJ4CctfQaM9yd")
CHANNEL_V3_SPEED = float(os.environ.get("ELEVENLABS_V3_SPEED", "1.2"))
MANHWA_V3_SPEED = float(os.environ.get("ELEVENLABS_MANHWA_V3_SPEED", "1.3"))
MANHWA_DIALOGUE_V3_SPEED = float(os.environ.get("ELEVENLABS_MANHWA_DIALOGUE_V3_SPEED", "1.0"))
MANHWA_DIALOGUE_EDIT_SPEED = float(os.environ.get("MANHWA_DIALOGUE_EDIT_SPEED", "1.30"))
CHANNEL_V2_SPEED = float(os.environ.get("ELEVENLABS_V2_SPEED", "1.15"))
SPEED = float(os.environ.get("ELEVENLABS_SPEED", str(CHANNEL_V2_SPEED)))
OUTPUT_FORMAT = os.environ.get("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_192")
LANGUAGE_CODE = "es"
SEED = int(os.environ.get("ELEVENLABS_SEED", "42"))  # fijo en TODOS los bloques de un mismo video
V3_AUDIO_CLEANUP = os.environ.get("ELEVENLABS_V3_AUDIO_CLEANUP", "1") != "0"
V3_AUDIO_CLEANUP_FILTER = os.environ.get(
    "ELEVENLABS_V3_AUDIO_CLEANUP_FILTER",
    "highpass=f=80,lowpass=f=12000,afftdn=nr=10:nf=-45:tn=1:gs=8,"
    "deesser=i=0.25:m=0.5:f=0.45,"
    "acompressor=threshold=0.08:ratio=1.6:attack=8:release=120,"
    "alimiter=limit=0.95",
)

# --- Chunking (V3 se desestabiliza con textos largos y con <250 chars) --------
CHUNK_MAX_CHARS = int(os.environ.get("ELEVENLABS_CHUNK_MAX", "4800"))  # V3 admite 5000/request; cortar a 4800 = menos seams
CHUNK_MIN_CHARS = int(os.environ.get("ELEVENLABS_CHUNK_MIN", "250"))

# --- Concurrencia / costo / reintentos ----------------------------------------
MAX_CONCURRENCY = int(os.environ.get("ELEVENLABS_MAX_CONCURRENCY", "1"))
USD_PER_1000_CREDITS = 0.10  # 1 credito = 1 caracter; USD ~= creditos * 0.10/1000
MAX_RETRIES = int(os.environ.get("ELEVENLABS_MAX_RETRIES", "5"))
RETRY_BASE_SECONDS = float(os.environ.get("ELEVENLABS_RETRY_BASE", "1.0"))

ENV_API_KEY = "ELEVENLABS_API_KEY"
