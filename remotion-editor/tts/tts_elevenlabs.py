"""Motor de voz ElevenLabs para presets de voz continua.

Actua sobre JSON con presets `historias*`, `criptoclaro*`, `habitos*` o modo
`single_file_from_full_script`. Este modulo NO renderiza video: produce
  audio/{slug}_narracion.mp3      -> un mp3 continuo con la voz V3 leyendo tts_export.full_script
  audio/{slug}_timestamps.json    -> alineamiento char-level global + mapa por escena {scene_id, start_s, end_s}
que consume el script de Remotion + ffmpeg para colocar cada imagen en su ventana de narracion.

Diseno clave:
- Request Stitching NO existe en eleven_v3 -> cada bloque es una peticion independiente con el MISMO
  voice_id, voice_settings, seed y model_id (consistencia de voz). Los bloques se concatenan con ffmpeg.
- Los bloques son CORTES de tts_export.full_script en limites de escena (pausa natural). Su concatenacion
  reproduce full_script TAL CUAL, con sus tags (no se pierde texto).
- Los tags V3 ([whispers], [sigh], ...) se mandan a la API TAL CUAL (NO se borran: V3 los interpreta).
  Solo se ignoran al MAPEAR texto->tiempo por escena (no se pronuncian).

Imports de elevenlabs/red son PEREZOSOS: la logica de chunking/timestamps corre sin instalar el SDK.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from config import (
    CHUNK_MAX_CHARS, CHUNK_MIN_CHARS, ENV_API_KEY, LANGUAGE_CODE,
    CHANNEL_V2_SPEED, CHANNEL_V3_SPEED, MANHWA_DIALOGUE_EDIT_SPEED, MANHWA_DIALOGUE_V3_SPEED,
    MANHWA_MODEL_ID, MANHWA_SYSTEM_VOICE_ID, MANHWA_V2_SIMILARITY_BOOST,
    MANHWA_V2_SPEED, MANHWA_V2_STABILITY, MANHWA_V2_STYLE,
    MANHWA_V2_USE_SPEAKER_BOOST, MANHWA_V3_SPEED,
    MANHWA_VOICE_ID, MAX_CONCURRENCY, MAX_RETRIES, MODEL_ID, OUTPUT_FORMAT, PUBLIC_DIR,
    RETRY_BASE_SECONDS, SEED, SIMILARITY_BOOST, STABILITY, STYLE,
    SPEED, USD_PER_1000_CREDITS, V3_AUDIO_CLEANUP, V3_AUDIO_CLEANUP_FILTER,
    VOICE_ID,
)

log = logging.getLogger("tts_elevenlabs")

_TAG_RE = re.compile(r"\[[^\]]*\]")
# tag V3 valido: simple ([whispers]), frase corta ([long pause]) o compuesto corto ([cold, flat]).
_V3_TAG_OK = re.compile(r"^\[(?:[a-zA-Z]+(?: [a-zA-Z]+)?|[a-zA-Z]+(?:,\s*[a-zA-Z]+){1,2})\]$")
HISTORY_RECOVERY = os.environ.get("ELEVENLABS_HISTORY_RECOVERY", "1") != "0"
HISTORY_LOOKBACK_SECONDS = int(os.environ.get("ELEVENLABS_HISTORY_LOOKBACK_SECONDS", str(6 * 60 * 60)))
DIALOGUE_MAX_CHARS = int(os.environ.get("ELEVENLABS_DIALOGUE_MAX_CHARS", "4800"))


# --------------------------------------------------------------------------- #
# Estructuras
# --------------------------------------------------------------------------- #
@dataclass
class SceneSpan:
    scene_id: str
    fs_start: int  # indice de caracter en full_script (inclusive)
    fs_end: int    # exclusive


@dataclass
class Chunk:
    idx: int
    text: str          # corte EXACTO de full_script (con tags y separadores)
    fs_start: int
    fs_end: int
    scene_ids: list[str]


@dataclass
class ChunkAudio:
    idx: int
    fs_start: int
    fs_end: int
    audio_path: Path
    duration_s: float
    char_cost: int
    request_id: Optional[str]
    mode: str                       # "sent" (tiempos por char ENVIADO, incl. tags) | "spoken" (sin tags)
    char_times: list[tuple[float, float]]  # tiempos LOCALES del bloque (s); offset se suma despues
    path_used: str                  # "with_timestamps" | "forced_alignment"


@dataclass
class DialogueItem:
    idx: int
    scene_id: str
    speaker: str
    voice_id: str
    text: str       # texto fuente del JSON
    api_text: str   # texto enviado a ElevenLabs (puede agregar [cold] al sistema)


@dataclass
class DialogueApiBlock:
    idx: int
    speaker: str
    voice_id: str
    api_text: str
    items: list[DialogueItem]  # escenas originales cubiertas por este input de API


# --------------------------------------------------------------------------- #
# 1. Deteccion de preset / tags
# --------------------------------------------------------------------------- #
def is_historias(doc: dict) -> bool:
    """True si el JSON usa voz continua desde tts_export.full_script."""
    proj = doc.get("project") or {}
    preset = str(proj.get("preset") or "")
    if re.match(r"^(historias|criptoclaro|habitos|pov-historias|manhwa)", preset):
        return True
    return (((doc.get("pipeline") or {}).get("tts") or {}).get("mode")
            == "single_file_from_full_script")


def uses_channel_voice(doc: dict) -> bool:
    """Presets del canal que fuerzan la voz oficial aunque el JSON traiga otra."""
    preset = str(((doc.get("project") or {}).get("preset")) or "")
    return bool(re.match(r"^(historias|criptoclaro|habitos|pov-historias)", preset))


def is_manhwa(doc: dict) -> bool:
    return str(((doc.get("project") or {}).get("preset")) or "") == "manhwa"


def manhwa_narrator_voice(doc: dict) -> str:
    """Voz del narrador manhwa POR SERIE: tts_export.voices.narrador > pipeline.tts.voice_id > voz oficial.
    tts_export.voice_id 'suelto' sigue ignorado (guard anti-voz-accidental del generador de JSON)."""
    tx = doc.get("tts_export") or {}
    voices = tx.get("voices") if isinstance(tx.get("voices"), dict) else {}
    pt = (doc.get("pipeline") or {}).get("tts") or {}
    for v in (voices.get("narrador"), pt.get("voice_id")):
        if isinstance(v, str) and v.strip():
            return v.strip()
    return MANHWA_VOICE_ID


def validate_tags(text: str) -> list[str]:
    """Devuelve WARNINGS (no borra nada). Avisa de tags que NO son del estilo simple de V3
    (p. ej. compuestos largos estilo Fish `[warm, measured, storyteller tone]`)."""
    warnings: list[str] = []
    for m in _TAG_RE.finditer(text):
        tag = m.group(0)
        if not _V3_TAG_OK.match(tag):
            warnings.append(
                f"tag no-V3 (compuesto/largo) {tag!r} en pos {m.start()} -> "
                "corrige el guion a tags simples V3 ([whispers],[sigh],[serious]); NO se borra."
            )
    return warnings


def strip_tags(text: str) -> str:
    """Texto HABLADO (sin tags). SOLO para el transcript de forced-alignment / mapeo, NUNCA para la TTS."""
    return _TAG_RE.sub("", text)


def spoken_mask(text: str) -> list[bool]:
    """Mascara por caracter: True = se pronuncia, False = dentro de un tag [...] (incl. corchetes).
    Usa el MISMO regex que strip_tags -> ambos consistentes ante tags mal formados (un '[' sin cerrar
    NO enmascara el resto del texto)."""
    mask = [True] * len(text)
    for m in _TAG_RE.finditer(text):
        for i in range(m.start(), m.end()):
            mask[i] = False
    return mask


# --------------------------------------------------------------------------- #
# 2. Escenas -> spans en full_script -> bloques
# --------------------------------------------------------------------------- #
def _scene_texts(doc: dict) -> list[tuple[str, str]]:
    """[(scene_id, voiceover.text)] en orden de reproduccion (clip_order si existe, si no el orden del array)."""
    scenes = doc.get("scenes") or []
    # schema nuevo historias: orden en render_export.clip_order; fallback al top-level (legacy capcut).
    order = ((doc.get("render_export") or {}).get("clip_order")) or doc.get("clip_order")
    sid = lambda s: s.get("id") or s.get("scene_id")  # id ?? scene_id (schema nuevo)
    if isinstance(order, list) and order:
        by_id = {sid(s): s for s in scenes}
        scenes = [by_id[i] for i in order if i in by_id]
    out = []
    for s in scenes:
        t = ((s.get("voiceover") or {}).get("text"))
        if isinstance(t, str) and t.strip():
            out.append((sid(s) or f"scene_{len(out)+1}", t.strip()))
    return out


def _scene_speakers(doc: dict) -> dict[str, str]:
    scenes = doc.get("scenes") or []
    out: dict[str, str] = {}
    for s in scenes:
        sid = s.get("id") or s.get("scene_id")
        voiceover = s.get("voiceover") or {}
        speaker = voiceover.get("speaker")
        if isinstance(sid, str) and isinstance(speaker, str) and speaker.strip():
            out[sid] = speaker.strip()
    return out


def is_dialogue_mode(doc: dict) -> bool:
    tx = doc.get("tts_export") or {}
    return str(tx.get("mode") or "").strip().lower() == "dialogue" or isinstance(tx.get("dialogue"), list)


def uses_text_to_dialogue(doc: dict) -> bool:
    """Text to Dialogue es exclusivo de eleven_v3.

    Los JSON manhwa conservan dialogue[] para el mapeo escena->voz incluso cuando usan
    Multilingual v2. En ese caso se sintetiza full_script como narracion continua; enviar
    esas filas al endpoint /text-to-dialogue produciria un fallo antes de generar audio.
    """
    if not is_dialogue_mode(doc):
        return False
    tx = doc.get("tts_export") or {}
    pt = (doc.get("pipeline") or {}).get("tts") or {}
    model_id = str(tx.get("model_id") or pt.get("model_id") or (MANHWA_MODEL_ID if is_manhwa(doc) else MODEL_ID))
    return model_id == "eleven_v3"


def _merge_voice_settings(base: dict, tx: dict) -> dict:
    """Acepta tanto tts_export.voice_settings como tts_export.settings."""
    out = dict(base)
    for src in (tx.get("voice_settings"), tx.get("settings")):
        if not isinstance(src, dict):
            continue
        for k in ("stability", "similarity_boost", "style", "use_speaker_boost", "speed"):
            if k in src:
                out[k] = src[k]
    return out


def _dialogue_settings(doc: dict, voice_id_override: Optional[str] = None) -> dict:
    tx = doc.get("tts_export") or {}
    s = _resolve_settings(doc, voice_id_override)
    s["voice_settings"] = _merge_voice_settings(s.get("voice_settings") or {}, tx)
    explicit_speed = any(
        isinstance(src, dict) and "speed" in src
        for src in (tx.get("voice_settings"), tx.get("settings"))
    ) or "elevenlabs_speed" in tx
    if s.get("model_id") == "eleven_v3" and not explicit_speed:
        s["voice_settings"]["speed"] = MANHWA_DIALOGUE_V3_SPEED if is_manhwa(doc) else 1.0
    elif "elevenlabs_speed" in tx:
        try:
            s["voice_settings"]["speed"] = float(tx["elevenlabs_speed"])
        except (TypeError, ValueError):
            pass
    return s


def _speaker_voice_map(doc: dict, narrador_override: Optional[str] = None) -> dict[str, str]:
    tx = doc.get("tts_export") or {}
    voices = tx.get("voices") if isinstance(tx.get("voices"), dict) else {}
    narr = manhwa_narrator_voice(doc) if is_manhwa(doc) else VOICE_ID
    out = {
        "narrador": narr,
        "voz_general": narr,
        "general": narr,
        "sistema": MANHWA_SYSTEM_VOICE_ID,
        "system": MANHWA_SYSTEM_VOICE_ID,
        "ia": MANHWA_SYSTEM_VOICE_ID,
        "ai": MANHWA_SYSTEM_VOICE_ID,
    }
    for k, v in voices.items():
        if isinstance(k, str) and isinstance(v, str) and k.strip() and v.strip():
            out[k.strip()] = v.strip()
    if narrador_override:
        out["narrador"] = narrador_override
        out["voz_general"] = narrador_override
        out["general"] = narrador_override
    return out


def _is_system_speaker(speaker: str, voice_id: str = "") -> bool:
    s = (speaker or "").strip().lower()
    return s in {"sistema", "system", "ia", "ai"} or voice_id == MANHWA_SYSTEM_VOICE_ID


def _ensure_cold_tag(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    m = re.match(r"^\[([^\]]+)\]\s*", text)
    if not m:
        return f"[cold] {text}"
    parts = [p.strip() for p in m.group(1).split(",") if p.strip()]
    if any(p.lower() == "cold" for p in parts):
        return text
    tag = "[cold" + (", " + ", ".join(parts) if parts else "") + "]"
    return tag + " " + text[m.end(0):]


def build_dialogue_items(doc: dict, voice_id_override: Optional[str] = None) -> tuple[str, list[DialogueItem]]:
    tx = doc.get("tts_export") or {}
    voices = _speaker_voice_map(doc, voice_id_override)
    scene_speakers = _scene_speakers(doc)
    full_script = (tx.get("full_script") or "").strip()
    items: list[DialogueItem] = []

    raw_dialogue = tx.get("dialogue")
    if isinstance(raw_dialogue, list) and raw_dialogue:
        for idx, row in enumerate(raw_dialogue):
            if not isinstance(row, dict):
                continue
            text = str(row.get("text") or "").strip()
            if not text:
                continue
            scene_id = str(row.get("scene_id") or row.get("id") or f"dialogue_{idx+1}").strip()
            speaker = str(row.get("speaker") or scene_speakers.get(scene_id) or "narrador").strip()
            voice_id = str(row.get("voice_id") or voices.get(speaker) or voices.get("narrador") or MANHWA_VOICE_ID).strip()
            api_text = _ensure_cold_tag(text) if _is_system_speaker(speaker, voice_id) else text
            items.append(DialogueItem(idx, scene_id, speaker, voice_id, text, api_text))
    else:
        for idx, (scene_id, text) in enumerate(_scene_texts(doc)):
            speaker = scene_speakers.get(scene_id, "narrador")
            voice_id = voices.get(speaker) or voices.get("narrador") or MANHWA_VOICE_ID
            api_text = _ensure_cold_tag(text) if _is_system_speaker(speaker, voice_id) else text
            items.append(DialogueItem(idx, scene_id, speaker, voice_id, text, api_text))

    if not full_script and items:
        full_script = "\n".join(i.text for i in items)
    return full_script, items


def build_scene_spans(doc: dict) -> tuple[str, list[SceneSpan]]:
    """Localiza cada voiceover.text dentro de full_script y devuelve (full_script, spans).
    Los separadores entre escenas se adjuntan a la escena previa. Si alguna escena no aparece
    verbatim en full_script, reconstruye full_script = join(' ') de las escenas (con WARNING)."""
    full_script = ((doc.get("tts_export") or {}).get("full_script") or "").strip()
    pairs = _scene_texts(doc)
    if not pairs:
        return full_script, []

    spans: list[SceneSpan] = []
    cursor = 0
    ok = bool(full_script)
    if full_script:
        for sid, text in pairs:
            i = full_script.find(text, cursor)
            if i < 0:
                ok = False
                break
            spans.append(SceneSpan(sid, i, i + len(text)))
            cursor = i + len(text)

    if not ok or not full_script:
        # fallback: construir full_script desde las escenas
        rebuilt, spans = "", []
        for sid, text in pairs:
            start = len(rebuilt)
            rebuilt += text
            spans.append(SceneSpan(sid, start, len(rebuilt)))
            rebuilt += " "
        full_script = rebuilt.strip()
        log.warning("full_script no contenia las escenas verbatim -> reconstruido desde scenes[] (join ' ').")

    # extender cada span hasta el inicio del siguiente (los separadores quedan en la escena previa);
    # el ultimo llega hasta el final de full_script.
    for k in range(len(spans)):
        spans[k].fs_end = spans[k + 1].fs_start if k + 1 < len(spans) else len(full_script)
    spans[0].fs_start = 0
    return full_script, spans


def split_into_chunks(doc: dict) -> list[Chunk]:
    """Agrupa escenas consecutivas acumulando texto hasta ~CHUNK_MAX_CHARS, cortando SIEMPRE en
    limite de escena. Si una sola escena excede el max, se parte por oraciones. Un bloque final
    <CHUNK_MIN_CHARS se une al anterior. La concatenacion de chunk.text reproduce full_script TAL CUAL."""
    full_script, spans = build_scene_spans(doc)
    if not full_script:
        return []
    if not spans:  # sin escenas: un solo bloque (o partido por oraciones si excede)
        return _chunks_from_ranges(full_script, _split_oversize(full_script, 0, len(full_script)))

    # rangos [start,end) consecutivos que cubren full_script sin huecos
    ranges: list[tuple[int, int, list[str]]] = []
    cur_start = spans[0].fs_start
    cur_ids: list[str] = []
    for k, sp in enumerate(spans):
        seg_len = sp.fs_end - cur_start
        if cur_ids and seg_len > CHUNK_MAX_CHARS:
            # cerrar antes de esta escena
            ranges.append((cur_start, sp.fs_start, cur_ids))
            cur_start, cur_ids = sp.fs_start, []
        cur_ids.append(sp.scene_id)
        # una sola escena mas larga que el max -> partir por oraciones
        if (sp.fs_end - cur_start) > CHUNK_MAX_CHARS and len(cur_ids) == 1:
            for a, b in _split_oversize(full_script, cur_start, sp.fs_end):
                ranges.append((a, b, [sp.scene_id]))
            cur_start, cur_ids = sp.fs_end, []
    if cur_ids:
        ranges.append((cur_start, spans[-1].fs_end, cur_ids))

    # unir un ultimo bloque demasiado corto al anterior
    if len(ranges) >= 2 and (ranges[-1][1] - ranges[-1][0]) < CHUNK_MIN_CHARS:
        a0, _, ids0 = ranges[-2]
        a1, b1, ids1 = ranges[-1]
        ranges[-2:] = [(a0, b1, ids0 + ids1)]

    return _chunks_from_ranges(full_script, [(a, b) for a, b, _ in ranges],
                               [ids for _, _, ids in ranges])


def _chunks_from_ranges(full_script, ranges, ids_list=None) -> list[Chunk]:
    out = []
    for i, (a, b) in enumerate(ranges):
        ids = ids_list[i] if ids_list else []
        out.append(Chunk(i, full_script[a:b], a, b, ids))
    return out


_SENT_END = re.compile(r"[\.\!\?…](?:[\"'\)\]]+)?\s")


def _split_oversize(text: str, start: int, end: int) -> list[tuple[int, int]]:
    """Parte un tramo demasiado largo en sub-rangos <=CHUNK_MAX_CHARS cortando en fin de oracion."""
    out, a = [], start
    while end - a > CHUNK_MAX_CHARS:
        window_end = a + CHUNK_MAX_CHARS
        cut = None
        for m in _SENT_END.finditer(text, a, window_end):
            cut = m.end()
        if cut is None or cut <= a:  # sin fin de oracion: corte duro (raro)
            cut = window_end
        out.append((a, cut))
        a = cut
    out.append((a, end))
    return out


# --------------------------------------------------------------------------- #
# 3. ffmpeg / ffprobe
# --------------------------------------------------------------------------- #
def _ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def _audio_params(fmt: str = OUTPUT_FORMAT) -> tuple[str, str]:
    """Sample rate + bitrate derivados del output_format (ej 'mp3_44100_192' -> ('44100','192k'))."""
    parts = fmt.split("_")
    rate = parts[1] if len(parts) > 1 and parts[1].isdigit() else "44100"
    kbps = parts[2] if len(parts) > 2 and parts[2].isdigit() else "192"
    return rate, f"{kbps}k"


def concat_audio(paths: list[Path], out_path: Path, output_format: str = OUTPUT_FORMAT) -> Path:
    """Concatena mp3 en orden con ffmpeg, re-encode al MISMO sample-rate/bitrate que output_format
    (no baja la calidad del 192 a 128) para un timeline limpio sin warble."""
    ar, br = _audio_params(output_format)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if len(paths) == 1:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(paths[0]), "-ar", ar,
             "-c:a", "libmp3lame", "-b:a", br, str(out_path)],
            capture_output=True, check=True,
        )
        return out_path
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        listfile = Path(f.name)
        for p in paths:
            escaped = p.as_posix().replace("'", "'\\''")  # escaping del concat demuxer de ffmpeg
            f.write(f"file '{escaped}'\n")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
             "-ar", ar, "-c:a", "libmp3lame", "-b:a", br, str(out_path)],
            capture_output=True, check=True,
        )
    finally:
        listfile.unlink(missing_ok=True)
    return out_path


def postprocess_v3_audio(mp3_path: Path, output_format: str = OUTPUT_FORMAT) -> bool:
    """Limpieza suave para V3/PVC: reduce hiss/aspereza sin cambiar velocidad ni timestamps."""
    if not V3_AUDIO_CLEANUP:
        return False
    ar, br = _audio_params(output_format)
    raw_path = mp3_path.with_name(f"{mp3_path.stem}.raw-v3{mp3_path.suffix}")
    tmp_path = mp3_path.with_name(f"{mp3_path.stem}.cleaning{mp3_path.suffix}")
    shutil.copy2(mp3_path, raw_path)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(raw_path), "-af", V3_AUDIO_CLEANUP_FILTER,
             "-ar", ar, "-c:a", "libmp3lame", "-b:a", br, str(tmp_path)],
            capture_output=True, text=True, check=True,
        )
        tmp_path.replace(mp3_path)
        return True
    except subprocess.CalledProcessError as e:
        tmp_path.unlink(missing_ok=True)
        log.warning("limpieza V3 falló; se conserva audio crudo (%s)", e.returncode)
        shutil.copy2(raw_path, mp3_path)
        return False


# --------------------------------------------------------------------------- #
# 4. Generacion de un bloque (API; import perezoso)
# --------------------------------------------------------------------------- #
def _make_client():
    key = os.environ.get(ENV_API_KEY)
    if not key:
        raise RuntimeError(
            f"Falta la variable de entorno {ENV_API_KEY}. Exportala antes de generar audio "
            "(NUNCA se hardcodea ni se loggea)."
        )
    from elevenlabs.client import ElevenLabs  # import perezoso
    return ElevenLabs(api_key=key)


def _get(obj: Any, key: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _headers_of(raw) -> dict:
    resp = getattr(raw, "_response", None)
    h = getattr(resp, "headers", None) or getattr(raw, "headers", None) or {}
    try:
        return {str(k).lower(): v for k, v in dict(h).items()}
    except Exception:
        return {}


def _cost_and_id(headers: dict, billable: int) -> tuple[int, Optional[str]]:
    rid = headers.get("request-id") or headers.get("x-request-id")
    cost = headers.get("character-cost") or headers.get("x-character-cost")
    try:
        cost = int(cost)
    except (TypeError, ValueError):
        cost = billable  # fallback: 1 credito = 1 caracter enviado
    return cost, rid


def _raw_audio_bytes(raw) -> bytes:
    data = getattr(raw, "data", raw)
    if isinstance(data, (bytes, bytearray)):
        return bytes(data)
    if isinstance(data, str):
        return data.encode("utf-8")
    for attr in ("content", "_content"):
        val = getattr(data, attr, None)
        if isinstance(val, (bytes, bytearray)):
            return bytes(val)
    if hasattr(data, "read"):
        out = data.read()
        return bytes(out) if isinstance(out, (bytes, bytearray)) else b""
    if hasattr(data, "iter_bytes"):
        return b"".join(data.iter_bytes())
    parts = []
    for part in data:  # iterador de bytes/chunks
        if isinstance(part, int):
            return bytes(data)
        if isinstance(part, str):
            part = part.encode("utf-8")
        parts.append(bytes(part))
    return b"".join(parts)


def _alignment_to_times(alignment) -> list[tuple[float, float]]:
    starts = _get(alignment, "character_start_times_seconds") or []
    ends = _get(alignment, "character_end_times_seconds") or []
    return [(float(s), float(e)) for s, e in zip(starts, ends)]


def _forced_chars_to_times(fa) -> list[tuple[float, float]]:
    chars = _get(fa, "characters") or []
    return [(float(_get(c, "start", 0.0)), float(_get(c, "end", 0.0))) for c in chars]


def _retry_sleep(attempt: int, headers: dict | None = None) -> None:
    ra = (headers or {}).get("retry-after")
    try:
        delay = float(ra)
    except (TypeError, ValueError):
        delay = RETRY_BASE_SECONDS * (2 ** attempt)
    time.sleep(min(delay, 60.0))


def _is_unsupported(e: Exception) -> bool:
    """True si el error de with-timestamps indica que V3 NO soporta el endpoint (-> fallback legitimo).
    Errores transitorios (429/5xx/red) devuelven False -> los maneja el retry exterior (sin doble gasto)."""
    if isinstance(e, (NotImplementedError, AttributeError)):
        return True  # el SDK no expone el metodo
    if getattr(e, "status_code", None) in (400, 404, 405, 422, 501):
        return True
    msg = str(e).lower()
    return "not supported" in msg or "unsupported" in msg


def _default_settings(voice_id: str = VOICE_ID) -> dict:
    """Params de la llamada a la API desde config (kwargs de convert/convert_with_timestamps)."""
    return dict(voice_id=voice_id, model_id=MODEL_ID, output_format=OUTPUT_FORMAT,
                language_code=LANGUAGE_CODE, seed=SEED,
                voice_settings={"stability": STABILITY, "similarity_boost": SIMILARITY_BOOST,
                                "style": STYLE, "speed": SPEED})


def _resolve_settings(doc: dict, voice_id_override: Optional[str] = None) -> dict:
    """Resuelve settings. Manhwa: narrador por serie (voices.narrador/pipeline.tts.voice_id) o voz oficial."""
    tx = doc.get("tts_export") or {}
    pt = (doc.get("pipeline") or {}).get("tts") or {}
    force_channel_voice = uses_channel_voice(doc) and not voice_id_override
    default_voice_id = MANHWA_VOICE_ID if is_manhwa(doc) else VOICE_ID
    resolved_voice_id = (voice_id_override or manhwa_narrator_voice(doc)) if is_manhwa(doc) else (VOICE_ID if force_channel_voice else (voice_id_override or tx.get("voice_id") or pt.get("voice_id") or default_voice_id))
    s = _default_settings(resolved_voice_id)
    if tx.get("model_id"):
        s["model_id"] = tx["model_id"]
    elif is_manhwa(doc):
        s["model_id"] = MANHWA_MODEL_ID
    if tx.get("output_format"):
        s["output_format"] = tx["output_format"]
    if tx.get("language_code"):
        s["language_code"] = tx["language_code"]
    if isinstance(tx.get("seed"), int):
        s["seed"] = tx["seed"]
    vs = tx.get("voice_settings") or tx.get("settings") or {}
    manhwa_default_voice = is_manhwa(doc) and resolved_voice_id == MANHWA_VOICE_ID
    if is_manhwa(doc) and s.get("model_id") == "eleven_multilingual_v2":
        s["voice_settings"].update({
            "stability": MANHWA_V2_STABILITY,
            "similarity_boost": MANHWA_V2_SIMILARITY_BOOST,
            "style": MANHWA_V2_STYLE,
            "use_speaker_boost": MANHWA_V2_USE_SPEAKER_BOOST,
            "speed": MANHWA_V2_SPEED,
        })
        if "elevenlabs_speed" in tx:
            try:
                s["voice_settings"]["speed"] = float(tx["elevenlabs_speed"])
            except (TypeError, ValueError):
                pass
    if resolved_voice_id != VOICE_ID and not manhwa_default_voice and not (isinstance(vs, dict) and "speed" in vs):
        s["voice_settings"].pop("speed", None)
    if vs:
        allowed = ("stability", "similarity_boost", "style", "use_speaker_boost", "speed")
        merged = dict(s["voice_settings"])
        merged.update({k: vs[k] for k in allowed if k in vs})
        s["voice_settings"] = merged
    if force_channel_voice:
        if s.get("model_id") == "eleven_v3":
            s["voice_settings"]["stability"] = STABILITY
            s["voice_settings"]["similarity_boost"] = SIMILARITY_BOOST
            s["voice_settings"]["style"] = STYLE
            s["voice_settings"]["speed"] = CHANNEL_V3_SPEED
        else:
            s["voice_settings"]["speed"] = CHANNEL_V2_SPEED
    elif manhwa_default_voice and s.get("model_id") == "eleven_v3" and not (isinstance(vs, dict) and "speed" in vs):
        s["voice_settings"]["speed"] = MANHWA_V3_SPEED
    return s


def generate_chunk(text: str, idx: int, *, client=None, settings: Optional[dict] = None,
                   tmp_dir: Optional[Path] = None, fs_start: int = 0, fs_end: int = 0) -> ChunkAudio:
    """Genera UN bloque: intenta with-timestamps; si V3 no lo SOPORTA, cae a convert + forced-alignment.
    Reintenta con backoff exponencial en red/429. Lanza si falla tras MAX_RETRIES."""
    client = client or _make_client()
    tmp_dir = tmp_dir or Path(tempfile.gettempdir()) / "eleven_chunks"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    common = dict(settings or _default_settings())  # voice_id/model_id/output_format/language_code/seed/voice_settings

    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            # --- camino A: with-timestamps (raw para leer headers de costo) ---
            try:
                raw = client.text_to_speech.with_raw_response.convert_with_timestamps(text=text, **common)
                data = getattr(raw, "data", raw)
                headers = _headers_of(raw)
                audio_b64 = _get(data, "audio_base64") or _get(data, "audio_base_64")
                alignment = _get(data, "alignment") or _get(data, "normalized_alignment")
                if audio_b64 and alignment:
                    audio = base64.b64decode(audio_b64)
                    char_times = _alignment_to_times(alignment)
                    cost, rid = _cost_and_id(headers, billable=len(text))
                    return _persist_chunk(idx, text, audio, char_times, "sent",
                                          "with_timestamps", cost, rid, tmp_dir, fs_start, fs_end)
            except Exception as e:
                if not _is_unsupported(e):
                    raise  # transitorio (red/429/5xx) -> retry exterior, NO doble gasto
                log.info("bloque %d: with-timestamps no soportado (%s) -> forced-alignment",
                         idx, type(e).__name__)

            # --- camino B: convert normal + forced-alignment sobre el texto HABLADO ---
            raw = client.text_to_speech.with_raw_response.convert(text=text, **common)
            audio = _raw_audio_bytes(raw)
            headers = _headers_of(raw)
            cost, rid = _cost_and_id(headers, billable=len(text))
            fa = client.forced_alignment.create(file=io.BytesIO(audio), text=strip_tags(text))
            char_times = _forced_chars_to_times(fa)
            return _persist_chunk(idx, text, audio, char_times, "spoken",
                                  "forced_alignment", cost, rid, tmp_dir, fs_start, fs_end)
        except Exception as e:  # red / 429 / etc.
            last_err = e
            status = getattr(e, "status_code", None)
            if status in (401, 402, 403):
                break
            if isinstance(e, (TypeError, ValueError, KeyError)):
                break
            if attempt < MAX_RETRIES - 1:
                # NO loggear str(e): algunos SDK incluyen la request (y la key) en el repr del error.
                log.warning("bloque %d intento %d fallo (%s%s) -> reintento", idx, attempt + 1,
                            f"{status} " if status else "", type(e).__name__)
                _retry_sleep(attempt, getattr(getattr(e, "response", None), "headers", None))
                continue
            break
    st = getattr(last_err, "status_code", None)
    detail = f"{type(last_err).__name__}" + (f" {st}" if st else "")
    raise RuntimeError(f"bloque {idx} fallo tras {MAX_RETRIES} intentos ({detail})")


def build_dialogue_api_blocks(items: list[DialogueItem], max_chars: int = DIALOGUE_MAX_CHARS) -> list[DialogueApiBlock]:
    """Agrupa escenas consecutivas del mismo speaker/voice en un solo input de Text-to-Dialogue.

    `tts_export.dialogue[]` sigue siendo 1 entrada por escena para mapear subtitulos; este agrupado
    existe solo para la API, evitando que v3 interprete cada escena como turno conversacional.
    Si un bloque excede el limite, se parte en limite de escena.
    """
    blocks: list[DialogueApiBlock] = []
    cur: list[DialogueItem] = []
    cur_speaker = ""
    cur_voice = ""
    cur_len = 0

    def flush() -> None:
        nonlocal cur, cur_speaker, cur_voice, cur_len
        if not cur:
            return
        blocks.append(DialogueApiBlock(
            idx=len(blocks),
            speaker=cur_speaker,
            voice_id=cur_voice,
            api_text="\n".join(it.api_text for it in cur),
            items=cur,
        ))
        cur, cur_speaker, cur_voice, cur_len = [], "", "", 0

    for it in items:
        same_turn = cur and it.speaker == cur_speaker and it.voice_id == cur_voice
        add_len = len(it.api_text) + (1 if cur else 0)  # \n entre escenas dentro del input
        if cur and (not same_turn or (cur_len + add_len > max_chars)):
            flush()
        if not cur:
            cur_speaker, cur_voice, cur_len = it.speaker, it.voice_id, 0
        cur.append(it)
        cur_len += len(it.api_text) + (1 if len(cur) > 1 else 0)
    flush()
    return blocks


def _dialogue_payload(blocks: list[DialogueApiBlock], settings: dict) -> dict:
    return {
        "model_id": settings.get("model_id") or MODEL_ID,
        "language_code": settings.get("language_code") or LANGUAGE_CODE,
        "seed": settings.get("seed") if isinstance(settings.get("seed"), int) else SEED,
        "settings": settings.get("voice_settings") or {},
        "inputs": [{"text": b.api_text, "voice_id": b.voice_id} for b in blocks],
    }


def _post_dialogue_with_timestamps(blocks: list[DialogueApiBlock], settings: dict) -> tuple[bytes, dict, int, Optional[str], str]:
    """ElevenLabs V3 Text to Dialogue en una sola peticion."""
    key = os.environ.get(ENV_API_KEY, "").strip()
    if not key:
        raise RuntimeError(f"Falta la variable de entorno {ENV_API_KEY}.")
    output_format = settings.get("output_format") or OUTPUT_FORMAT
    url = f"https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format={urllib.parse.quote(output_format)}"
    payload = _dialogue_payload(blocks, settings)
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "xi-api-key": key,
                "content-type": "application/json; charset=utf-8",
                "accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                body = json.loads(r.read().decode("utf-8"))
                audio_b64 = body.get("audio_base64") or body.get("audio_base_64")
                if not audio_b64:
                    raise RuntimeError("Text to Dialogue no devolvio audio_base64")
                headers = {str(k).lower(): v for k, v in dict(r.headers).items()}
                cost, rid = _cost_and_id(headers, billable=sum(len(b.api_text) for b in blocks))
                return base64.b64decode(audio_b64), body, cost, rid, "text_to_dialogue+with_timestamps"
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (401, 402, 403):
                break
            if attempt < MAX_RETRIES - 1:
                log.warning("dialogue intento %d fallo (HTTP %s) -> reintento", attempt + 1, e.code)
                _retry_sleep(attempt, e.headers)
                continue
            break
        except Exception as e:
            last_err = e
            if isinstance(e, (TypeError, ValueError, KeyError)):
                break
            if attempt < MAX_RETRIES - 1:
                log.warning("dialogue intento %d fallo (%s) -> reintento", attempt + 1, type(e).__name__)
                _retry_sleep(attempt, None)
                continue
            break
    st = getattr(last_err, "code", None) or getattr(last_err, "status_code", None)
    detail = f"{type(last_err).__name__}" + (f" {st}" if st else "")
    raise RuntimeError(f"dialogue fallo tras {MAX_RETRIES} intentos ({detail})")


def split_dialogue_blocks(blocks: list[DialogueApiBlock], max_chars: int = DIALOGUE_MAX_CHARS) -> list[list[DialogueApiBlock]]:
    """Parte requests por input agrupado; nunca corta un input de API."""
    chunks: list[list[DialogueApiBlock]] = []
    cur: list[DialogueApiBlock] = []
    cur_len = 0
    for block in blocks:
        n = len(block.api_text) + 1
        if cur and cur_len + n > max_chars:
            chunks.append(cur)
            cur = []
            cur_len = 0
        cur.append(block)
        cur_len += n
    if cur:
        chunks.append(cur)
    return chunks


def split_dialogue_items(items: list[DialogueItem], max_chars: int = DIALOGUE_MAX_CHARS) -> list[list[DialogueItem]]:
    """Compat tests/legacy: parte items por escena. La API nueva usa split_dialogue_blocks()."""
    chunks: list[list[DialogueItem]] = []
    cur: list[DialogueItem] = []
    cur_len = 0
    for it in items:
        n = len(it.api_text) + 1
        if cur and cur_len + n > max_chars:
            chunks.append(cur)
            cur = []
            cur_len = 0
        cur.append(it)
        cur_len += n
    if cur:
        chunks.append(cur)
    return chunks


def words_from_dialogue_alignment(alignment: dict) -> list[dict]:
    chars = alignment.get("characters") or []
    starts = alignment.get("character_start_times_seconds") or []
    ends = alignment.get("character_end_times_seconds") or []
    if not chars or not starts or not ends:
        return []
    text = "".join(chars)
    is_tag = [False] * len(chars)
    for m in _TAG_RE.finditer(text):
        for i in range(m.start(), min(m.end(), len(is_tag))):
            is_tag[i] = True
    words, buf = [], []
    def flush():
        nonlocal buf
        if not buf:
            return
        spoken = [i for i in buf if i < len(starts) and i < len(ends) and not is_tag[i]]
        token = _TAG_RE.sub("", "".join(chars[i] for i in buf)).strip()
        if spoken and token:
            words.append({
                "word": token,
                "start": round(float(starts[spoken[0]]), 3),
                "end": round(float(ends[spoken[-1]]), 3),
            })
        buf = []
    for i, ch in enumerate(chars):
        if ch.isspace():
            flush()
        else:
            buf.append(i)
    flush()
    return words


def synthesize_dialogue(json_path: Path, doc: dict, *, voice_id: Optional[str] = None) -> dict:
    slug = (doc.get("project") or {}).get("slug") or json_path.stem
    full_script, items = build_dialogue_items(doc, voice_id)
    if not items:
        raise RuntimeError("tts_export.mode dialogue sin lineas de dialogue/voiceover.")
    if not full_script:
        raise RuntimeError("tts_export.full_script vacio: nada que sintetizar.")

    warnings = validate_tags(full_script)
    for it in items:
        if it.api_text != it.text:
            log.info("dialogue: %s usa tag cold automatico para speaker '%s'", it.scene_id, it.speaker)
        warnings.extend(validate_tags(it.api_text))
    for w in sorted(set(warnings)):
        log.warning("TAGS: %s", w)

    settings = _dialogue_settings(doc, voice_id)
    if settings.get("model_id") != "eleven_v3":
        raise RuntimeError("Text to Dialogue requiere model_id eleven_v3.")

    voice_dir = PUBLIC_DIR / slug / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)
    mp3_out = voice_dir / "full.mp3"
    tmp_dir = voice_dir / ".dialogue_chunks"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    unique_voices = sorted({it.voice_id for it in items})
    api_blocks = build_dialogue_api_blocks(items)
    chunks = split_dialogue_blocks(api_blocks)
    log.info("%s: dialogue ElevenLabs V3 -> %d escena(s), %d input(s) API, %d voz/voces, %d request(s) (%s).",
             slug, len(items), len(api_blocks), len(unique_voices), len(chunks), ", ".join(unique_voices))

    total_credits = 0
    request_ids: list[str] = []
    responses: list[dict] = []
    chunk_paths: list[Path] = []
    fallback_words: list[dict] = []
    offset = 0.0
    try:
        for idx, chunk_blocks in enumerate(chunks):
            audio, response, cost, rid, path_used = _post_dialogue_with_timestamps(chunk_blocks, settings)
            chunk_path = tmp_dir / f"dialogue_{idx:03d}.mp3"
            chunk_path.write_bytes(audio)
            duration = _ffprobe_duration(chunk_path)
            chunk_paths.append(chunk_path)
            responses.append(response)
            total_credits += cost
            if rid:
                request_ids.append(rid)
            local_words = words_from_dialogue_alignment(response.get("alignment") or response.get("normalized_alignment") or {})
            for w in local_words:
                fallback_words.append({
                    "word": w["word"],
                    "start": round(w["start"] + offset, 3),
                    "end": round(w["end"] + offset, 3),
                })
            offset += duration
            scene_count = sum(len(b.items) for b in chunk_blocks)
            char_count = sum(len(b.api_text) for b in chunk_blocks)
            log.info("dialogue bloque %d/%d: %d input(s), %d escena(s), %d chars, %.2fs, costo %d",
                     idx + 1, len(chunks), len(chunk_blocks), scene_count, char_count, duration, cost)
        concat_audio(chunk_paths, mp3_out, output_format=settings["output_format"])
    except Exception:
        log.error("ABORTADO: fallo dialogue; no se escribe mp3 final. Bloques temp en %s", tmp_dir)
        raise
    cleaned_v3_audio = postprocess_v3_audio(mp3_out, output_format=settings["output_format"])

    client = _make_client()
    final_words, duration_s, final_alignment_ok = align_final_audio_words(client, mp3_out, full_script)
    if final_alignment_ok:
        words = final_words
        alignment_source = "final_audio+forced_alignment"
    else:
        words = fallback_words
        duration_s = _ffprobe_duration(mp3_out)
        alignment_source = "dialogue_timestamps"

    words_out = voice_dir / "full.words.json"
    words_out.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    (voice_dir / "full.eleven.words.json").write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    (voice_dir / "full.tts-meta.json").write_text(json.dumps({
        "source": "elevenlabs",
        "mode": "dialogue",
        "voice_id": settings["voice_id"],
        "voices": {it.speaker: it.voice_id for it in items},
        "model_id": settings["model_id"],
        "voice_settings": settings.get("voice_settings"),
        "seed": settings["seed"],
        "output_format": settings["output_format"],
        "script_sha256": hashlib.sha256(full_script.encode("utf-8")).hexdigest(),
        "alignment_source": alignment_source,
        "duration_s": duration_s,
        "words": len(words),
        "v3_audio_cleanup": cleaned_v3_audio,
        "paths_used": ["text_to_dialogue+with_timestamps", alignment_source],
        "dialogue": [{"scene_id": it.scene_id, "speaker": it.speaker, "voice_id": it.voice_id, "text": it.text, "api_text": it.api_text} for it in items],
        "voice_segments": [r.get("voice_segments") for r in responses],
        "dialogue_api_blocks": [
            {
                "idx": b.idx,
                "speaker": b.speaker,
                "voice_id": b.voice_id,
                "scene_ids": [it.scene_id for it in b.items],
                "chars": len(b.api_text),
            }
            for b in api_blocks
        ],
        "dialogue_chunks": [
            {
                "idx": i,
                "api_block_ids": [b.idx for b in chunk],
                "scene_ids": [it.scene_id for b in chunk for it in b.items],
                "chars": sum(len(b.api_text) for b in chunk),
            }
            for i, chunk in enumerate(chunks)
        ],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    usd = total_credits * USD_PER_1000_CREDITS / 1000.0
    report = {
        "slug": slug, "mp3": str(mp3_out), "words_json": str(words_out),
        "mode": "dialogue", "voices": unique_voices,
        "seed": settings["seed"], "output_format": settings["output_format"],
        "v3_audio_cleanup": cleaned_v3_audio,
        "blocks": len(chunks), "words": len(words), "duration_s": duration_s,
        "total_credits": total_credits, "usd_estimate": round(usd, 4),
        "request_ids": request_ids,
        "paths_used": ["text_to_dialogue+with_timestamps", alignment_source], "warnings": sorted(set(warnings)),
        "next_step": f"node align/inject-words.mjs {json_path}",
    }
    log.info("LISTO %s: dialogue full.mp3 (%.3fs, %d palabras) | %d creditos ~ $%.4f USD",
             slug, duration_s, len(words), total_credits, usd)
    shutil.rmtree(tmp_dir, ignore_errors=True)
    return report


def _persist_chunk(idx, text, audio, char_times, mode, path_used, cost, rid,
                   tmp_dir, fs_start, fs_end) -> ChunkAudio:
    if len(audio) < 100:  # mp3 valido minimo; evita pasar un stream drenado/truncado silenciosamente
        raise RuntimeError(f"bloque {idx}: audio vacio o truncado ({len(audio)} bytes)")
    p = tmp_dir / f"block_{idx:03d}.mp3"
    p.write_bytes(audio)
    dur = _ffprobe_duration(p)
    log.info("bloque %d: %d chars, %.2fs, costo %d, via %s, req %s",
             idx, len(text), dur, cost, path_used, rid)
    return ChunkAudio(idx, fs_start, fs_end, p, dur, cost, rid, mode, char_times, path_used)


def _history_json(path: str, params: Optional[dict] = None) -> Optional[dict]:
    key = os.environ.get(ENV_API_KEY, "").strip()
    if not key:
        return None
    qs = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v not in (None, "")})
    url = f"https://api.elevenlabs.io/v1{path}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, headers={"xi-api-key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        log.warning("historial ElevenLabs: no pude consultar (%s)", type(e).__name__)
        return None


def _history_audio(history_item_id: str) -> Optional[bytes]:
    key = os.environ.get(ENV_API_KEY, "").strip()
    if not key:
        return None
    url = f"https://api.elevenlabs.io/v1/history/{urllib.parse.quote(history_item_id)}/audio"
    req = urllib.request.Request(url, headers={"xi-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            audio = r.read()
            return audio if len(audio) >= 1024 else None
    except Exception as e:
        log.warning("historial ElevenLabs: no pude descargar %s (%s)", history_item_id, type(e).__name__)
        return None


def _same_text(a: str, b: str) -> bool:
    return (a or "").strip() == (b or "").strip()


def _history_item_texts(item: dict) -> list[str]:
    out = []
    if isinstance(item.get("text"), str) and item["text"].strip():
        out.append(item["text"].strip())
    dialogue = item.get("dialogue")
    if isinstance(dialogue, list):
        for row in dialogue:
            if isinstance(row, dict) and isinstance(row.get("text"), str) and row["text"].strip():
                out.append(row["text"].strip())
    return out


def _history_item_voice(item: dict) -> str:
    if isinstance(item.get("voice_id"), str) and item["voice_id"]:
        return item["voice_id"]
    dialogue = item.get("dialogue")
    if isinstance(dialogue, list):
        for row in dialogue:
            if isinstance(row, dict) and isinstance(row.get("voice_id"), str) and row["voice_id"]:
                return row["voice_id"]
    return ""


def recover_chunk_from_history(text: str, idx: int, *, client, settings: dict,
                               tmp_dir: Path, fs_start: int, fs_end: int) -> Optional[ChunkAudio]:
    """Recupera audio ya cobrado en ElevenLabs History. No genera TTS nuevo.
    Oficial: GET /v1/history lista items y GET /v1/history/:id/audio descarga el audio."""
    if not HISTORY_RECOVERY:
        return None
    date_after = int(time.time()) - max(60, HISTORY_LOOKBACK_SECONDS)
    data = _history_json("/history", {
        "page_size": 100,
        "voice_id": settings.get("voice_id"),
        "source": "TTS",
        "date_after_unix": date_after,
        "sort_direction": "desc",
    })
    for item in data.get("history", []) if data else []:
        hid = item.get("history_item_id")
        if not hid:
            continue
        detail = item
        if not _history_item_texts(detail) or not _history_item_voice(detail):
            detail = _history_json(f"/history/{hid}") or item
        item_voice = _history_item_voice(detail)
        if item_voice and item_voice != settings.get("voice_id"):
            continue
        item_model = detail.get("model_id") or item.get("model_id")
        if item_model and item_model != settings.get("model_id"):
            continue
        if not any(_same_text(t, text) for t in _history_item_texts(detail)):
            continue
        audio = _history_audio(hid)
        if not audio:
            continue
        try:
            fa = client.forced_alignment.create(file=io.BytesIO(audio), text=strip_tags(text))
            char_times = _forced_chars_to_times(fa)
            log.info("bloque %d: recuperado desde historial ElevenLabs (%s), sin regenerar TTS", idx, hid)
            return _persist_chunk(idx, text, audio, char_times, "spoken",
                                  "history+forced_alignment", 0, f"history:{hid}",
                                  tmp_dir, fs_start, fs_end)
        except Exception as e:
            log.warning("historial ElevenLabs: audio %s recuperado pero alignment fallo (%s)", hid, type(e).__name__)
            return None
    return None


# --------------------------------------------------------------------------- #
# 5. Timeline global -> full.words.json (mismo formato que fish-voice.mjs)
# --------------------------------------------------------------------------- #
def compute_spoken_time(full_script: str, chunks: list[Chunk],
                        audios: list[ChunkAudio]) -> tuple[dict[int, tuple[float, float]], float]:
    """Suma a cada bloque el offset = duracion acumulada de los previos y arma un timeline unico:
    {idx_caracter_full_script -> (start,end) global} SOLO para caracteres hablados (ignora tags)."""
    mask = spoken_mask(full_script)
    spoken_time: dict[int, tuple[float, float]] = {}
    offset = 0.0
    for ch, au in zip(chunks, audios):
        a, b = ch.fs_start, ch.fs_end
        spoken_idx = [k for k in range(a, b) if mask[k]]
        ct = au.char_times
        if au.mode == "sent":
            if len(ct) == (b - a):
                for j in range(b - a):
                    if mask[a + j]:
                        spoken_time[a + j] = (ct[j][0] + offset, ct[j][1] + offset)
            else:  # mismatch (V3 alpha): reparto proporcional por la duracion del bloque
                log.warning("bloque %d: tiempos 'sent' no calzan (ct=%d vs chars=%d) -> proporcional",
                            ch.idx, len(ct), b - a)
                _proportional(spoken_idx, au.duration_s, offset, spoken_time)
        else:  # "spoken": ct alineado 1:1 con los chars hablados
            if len(ct) == len(spoken_idx):
                for n, k in enumerate(spoken_idx):
                    spoken_time[k] = (ct[n][0] + offset, ct[n][1] + offset)
            else:
                log.warning("bloque %d: tiempos 'spoken' no calzan (ct=%d vs hablados=%d) -> proporcional",
                            ch.idx, len(ct), len(spoken_idx))
                _proportional(spoken_idx, au.duration_s, offset, spoken_time)
        offset += au.duration_s
    return spoken_time, round(offset, 3)


def build_full_words(full_script: str, spoken_time: dict[int, tuple[float, float]]) -> list[dict]:
    """Agrupa caracteres hablados en palabras (split por whitespace) -> [{word,start,end}] en segundos
    absolutos, MISMO formato que produce fish-voice.mjs. Los tags [..] se descartan del token y del tiempo,
    para que align/inject-words.mjs construya scene._window y los captions igual que con Fish."""
    words: list[dict] = []
    start_i: Optional[int] = None
    n = len(full_script)
    for i in range(n + 1):
        is_space = i == n or full_script[i].isspace()
        if is_space:
            if start_i is not None:
                idxs = [k for k in range(start_i, i) if k in spoken_time]
                token = strip_tags(full_script[start_i:i]).strip()
                if idxs and token:
                    words.append({
                        "word": token,
                        "start": round(min(spoken_time[k][0] for k in idxs), 3),
                        "end": round(max(spoken_time[k][1] for k in idxs), 3),
                    })
                start_i = None
        elif start_i is None:
            start_i = i
    return words


def align_final_audio_words(client, mp3_path: Path, full_script: str) -> tuple[list[dict], float, bool]:
    """Fuente oficial para captions: alinea el MP3 final ya limpiado contra el guion real."""
    duration_s = _ffprobe_duration(mp3_path)
    try:
        fa = client.forced_alignment.create(file=io.BytesIO(mp3_path.read_bytes()), text=strip_tags(full_script))
        ct = _forced_chars_to_times(fa)
        chunk = Chunk(0, full_script, 0, len(full_script), [])
        au = ChunkAudio(0, 0, len(full_script), mp3_path, duration_s, 0,
                        "final_audio_forced_alignment", "spoken", ct,
                        "final_audio+forced_alignment")
        spoken_time, _ = compute_spoken_time(full_script, [chunk], [au])
        words = build_full_words(full_script, spoken_time)
        if words:
            return words, duration_s, True
    except Exception as e:
        log.warning("forced alignment del MP3 final fallo (%s); uso timestamps de TTS", type(e).__name__)
    return [], duration_s, False


def _proportional(spoken_idx, duration_s, offset, out) -> None:
    """Fallback: reparte la duracion del bloque de forma uniforme entre sus chars hablados."""
    n = len(spoken_idx)
    if n == 0:
        return
    step = duration_s / n
    for i, k in enumerate(spoken_idx):
        out[k] = (offset + i * step, offset + (i + 1) * step)


# --------------------------------------------------------------------------- #
# 6. Orquestador
# --------------------------------------------------------------------------- #
def synthesize_historias(json_path: str | Path, *, voice_id: Optional[str] = None) -> Optional[dict]:
    """Genera public/<slug>/voice/full.mp3 + full.words.json (drop-in de fish-voice.mjs). Devuelve un
    reporte (costo, warnings, request-ids) o None si el JSON NO es de historias (no hace nada).
    DESPUES correr `node align/inject-words.mjs <json>` para armar scene._window + captions y renderizar."""
    json_path = Path(json_path)
    doc = json.loads(json_path.read_text(encoding="utf-8-sig"))
    if not is_historias(doc):
        log.info("%s no es preset historias -> el modulo ElevenLabs no hace nada.", json_path.name)
        return None

    slug = (doc.get("project") or {}).get("slug") or json_path.stem
    if uses_text_to_dialogue(doc):
        return synthesize_dialogue(json_path, doc, voice_id=voice_id)

    full_script, spans = build_scene_spans(doc)
    if not full_script:
        raise RuntimeError("tts_export.full_script vacio: nada que sintetizar.")

    warnings = validate_tags(full_script)
    for w in warnings:
        log.warning("TAGS: %s", w)

    chunks = split_into_chunks(doc)
    # robustez (seccion 8): la concatenacion de bloques debe reproducir full_script TAL CUAL
    rebuilt = "".join(c.text for c in chunks)
    if rebuilt != full_script:
        log.warning("la concatenacion de bloques (%d) != full_script (%d chars): posible texto perdido.",
                    len(rebuilt), len(full_script))
    for c in chunks:
        if not (CHUNK_MIN_CHARS <= len(c.text) <= CHUNK_MAX_CHARS) and len(chunks) > 1:
            log.warning("bloque %d fuera de [%d,%d]: %d chars.", c.idx, CHUNK_MIN_CHARS,
                        CHUNK_MAX_CHARS, len(c.text))
    log.info("%s: %d escena(s) -> %d bloque(s) (%d chars total).",
             slug, len(spans), len(chunks), len(full_script))

    client = _make_client()
    settings = _resolve_settings(doc, voice_id)  # tts_export del JSON manda; --voice gana sobre todo
    _warn_if_pvc(client, settings["voice_id"])

    # salida = donde la lee el render actual (igual que fish-voice.mjs): public/<slug>/voice/
    voice_dir = PUBLIC_DIR / slug / "voice"
    voice_dir.mkdir(parents=True, exist_ok=True)

    # generar bloques EN PARALELO (independientes), conservando el orden al recolectar.
    # Antes intenta recuperar desde ElevenLabs History: si Chrome ya gasto creditos pero murio antes
    # de guardar full.mp3, reutilizamos ese audio y evitamos cobrar otra TTS.
    audios: list[ChunkAudio] = [None] * len(chunks)  # type: ignore
    tmp_dir = voice_dir / ".chunks"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        recovered = 0
        for c in chunks:
            au = recover_chunk_from_history(c.text, c.idx, client=client, settings=settings,
                                            tmp_dir=tmp_dir, fs_start=c.fs_start, fs_end=c.fs_end)
            if au:
                audios[au.idx] = au
                recovered += 1
        if recovered:
            log.info("historial ElevenLabs: %d/%d bloque(s) recuperados sin regenerar TTS.", recovered, len(chunks))

        with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENCY, len(chunks))) as ex:
            futs = {ex.submit(generate_chunk, c.text, c.idx, client=client, settings=settings,
                              tmp_dir=tmp_dir, fs_start=c.fs_start, fs_end=c.fs_end): c.idx
                    for c in chunks if audios[c.idx] is None}
            for fut in as_completed(futs):
                au = fut.result()  # propaga la excepcion -> aborta (no deja mp3 a medias)
                audios[au.idx] = au
    except Exception:
        log.error("ABORTADO: fallo un bloque; no se escribe mp3 final. Bloques temp en %s", tmp_dir)
        raise

    mp3_out = voice_dir / "full.mp3"
    concat_audio([au.audio_path for au in audios], mp3_out, output_format=settings["output_format"])
    cleaned_v3_audio = False
    if settings.get("model_id") == "eleven_v3":
        cleaned_v3_audio = postprocess_v3_audio(mp3_out, output_format=settings["output_format"])

    spoken_time, duration_s = compute_spoken_time(full_script, chunks, audios)
    words = build_full_words(full_script, spoken_time)
    final_words, final_duration_s, final_alignment_ok = align_final_audio_words(client, mp3_out, full_script)
    if final_alignment_ok:
        words = final_words
        duration_s = final_duration_s
    words_out = voice_dir / "full.words.json"
    words_out.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    (voice_dir / "full.eleven.words.json").write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    (voice_dir / "full.tts-meta.json").write_text(json.dumps({
        "source": "elevenlabs",
        "voice_id": settings["voice_id"],
        "model_id": settings["model_id"],
        "voice_settings": settings.get("voice_settings"),
        "seed": settings["seed"],
        "output_format": settings["output_format"],
        "script_sha256": hashlib.sha256(full_script.encode("utf-8")).hexdigest(),
        "alignment_source": "final_audio+forced_alignment" if final_alignment_ok else "tts_timestamps",
        "duration_s": duration_s,
        "words": len(words),
        "paths_used": sorted({au.path_used for au in audios}),
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    total_credits = sum(au.char_cost for au in audios)
    usd = total_credits * USD_PER_1000_CREDITS / 1000.0
    report = {
        "slug": slug, "mp3": str(mp3_out), "words_json": str(words_out),
        "voice_id": settings["voice_id"], "seed": settings["seed"],
        "output_format": settings["output_format"],
        "v3_audio_cleanup": cleaned_v3_audio,
        "blocks": len(chunks), "words": len(words), "duration_s": duration_s,
        "total_credits": total_credits, "usd_estimate": round(usd, 4),
        "request_ids": [au.request_id for au in audios],
        "paths_used": sorted({au.path_used for au in audios}), "warnings": warnings,
        "next_step": f"node align/inject-words.mjs {json_path}  (arma scene._window + captions)",
    }
    log.info("LISTO %s: full.mp3 (%.3fs, %d palabras) | %d creditos ~ $%.4f USD | via %s | reqs %s",
             slug, duration_s, len(words), total_credits, usd,
             ",".join(report["paths_used"]), report["request_ids"])
    log.info("SIGUIENTE: %s", report["next_step"])
    if warnings:
        log.warning("%d warning(s) de tags: revisa el guion (no se borro nada).", len(warnings))

    shutil.rmtree(tmp_dir, ignore_errors=True)  # limpieza solo en exito
    return report


def _warn_if_pvc(client, voice_id: str) -> None:
    """V3 NO esta optimizado para PVC (Professional Voice Cloning). Aviso si la voz es PVC."""
    try:
        v = client.voices.get(voice_id)
        cat = _get(v, "category")
        if cat == "professional":
            log.warning("la voz %s es PVC (professional): V3 no esta optimizado para PVC; "
                        "usa una voz de biblioteca, Voice Design o IVC para mejor calidad.", voice_id)
    except Exception:
        pass  # best-effort; no bloquea


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description="ElevenLabs V3 (Creative) para el preset historias.")
    ap.add_argument("json", help="ruta al JSON de historias")
    ap.add_argument("--voice", default=None,
                    help="fuerza un voice_id (gana sobre tts_export.voice_id del JSON y el default de config)")
    args = ap.parse_args(argv)
    try:
        report = synthesize_historias(args.json, voice_id=args.voice)
    except RuntimeError as e:
        log.error("%s", e)
        return 1
    if report is None:
        print("No-op: el JSON no es del preset historias.")
        return 0
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
