"""Motor de voz ElevenLabs V3 (modo Creative) para el preset `historias`.

SOLO actua sobre JSON con project.preset == "historias". Cualquier otro preset -> no hace nada
(Huesito y demas siguen con Fish Audio, intactos). Este modulo NO renderiza video: produce
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
import io
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from config import (
    CHUNK_MAX_CHARS, CHUNK_MIN_CHARS, ENV_API_KEY, LANGUAGE_CODE,
    MAX_CONCURRENCY, MAX_RETRIES, MODEL_ID, OUTPUT_FORMAT, PUBLIC_DIR,
    RETRY_BASE_SECONDS, SEED, SIMILARITY_BOOST, STABILITY, STYLE,
    USD_PER_1000_CREDITS, VOICE_ID,
)

log = logging.getLogger("tts_elevenlabs")

_TAG_RE = re.compile(r"\[[^\]]*\]")
# tag "valido V3": 1-2 palabras simples dentro de corchetes (ej. [whispers], [sigh], [long pause]).
_V3_TAG_OK = re.compile(r"^\[[a-zA-Z][a-zA-Z]*(?: [a-zA-Z]+)?\]$")


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


# --------------------------------------------------------------------------- #
# 1. Deteccion de preset / tags
# --------------------------------------------------------------------------- #
def is_historias(doc: dict) -> bool:
    """True solo si el JSON es del preset historias (o pide el modo single_file_from_full_script)."""
    proj = doc.get("project") or {}
    if proj.get("preset") == "historias":
        return True
    return (((doc.get("pipeline") or {}).get("tts") or {}).get("mode")
            == "single_file_from_full_script")


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
    return b"".join(part for part in data)  # iterador de bytes (streaming)


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
                voice_settings={"stability": STABILITY, "similarity_boost": SIMILARITY_BOOST, "style": STYLE})


def _resolve_settings(doc: dict, voice_id_override: Optional[str] = None) -> dict:
    """tts_export del JSON MANDA sobre el config (voice_id, seed, voice_settings, output_format, model_id,
    language_code). --voice (CLI) gana sobre todo. Lo ausente cae al default de config.py."""
    tx = doc.get("tts_export") or {}
    s = _default_settings(voice_id_override or tx.get("voice_id") or VOICE_ID)
    if tx.get("model_id"):
        s["model_id"] = tx["model_id"]
    if tx.get("output_format"):
        s["output_format"] = tx["output_format"]
    if tx.get("language_code"):
        s["language_code"] = tx["language_code"]
    if isinstance(tx.get("seed"), int):
        s["seed"] = tx["seed"]
    vs = tx.get("voice_settings") or {}
    if vs:
        s["voice_settings"] = {
            "stability": vs.get("stability", STABILITY),
            "similarity_boost": vs.get("similarity_boost", SIMILARITY_BOOST),
            "style": vs.get("style", STYLE),
        }
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
                audio_b64 = _get(data, "audio_base64")
                alignment = _get(data, "alignment")
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

    # generar bloques EN PARALELO (independientes), conservando el orden al recolectar
    audios: list[ChunkAudio] = [None] * len(chunks)  # type: ignore
    tmp_dir = voice_dir / ".chunks"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENCY, len(chunks))) as ex:
            futs = {ex.submit(generate_chunk, c.text, c.idx, client=client, settings=settings,
                              tmp_dir=tmp_dir, fs_start=c.fs_start, fs_end=c.fs_end): c.idx
                    for c in chunks}
            for fut in as_completed(futs):
                au = fut.result()  # propaga la excepcion -> aborta (no deja mp3 a medias)
                audios[au.idx] = au
    except Exception:
        log.error("ABORTADO: fallo un bloque; no se escribe mp3 final. Bloques temp en %s", tmp_dir)
        raise

    mp3_out = voice_dir / "full.mp3"
    concat_audio([au.audio_path for au in audios], mp3_out, output_format=settings["output_format"])

    spoken_time, duration_s = compute_spoken_time(full_script, chunks, audios)
    words = build_full_words(full_script, spoken_time)
    words_out = voice_dir / "full.words.json"
    words_out.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")

    total_credits = sum(au.char_cost for au in audios)
    usd = total_credits * USD_PER_1000_CREDITS / 1000.0
    report = {
        "slug": slug, "mp3": str(mp3_out), "words_json": str(words_out),
        "voice_id": settings["voice_id"], "seed": settings["seed"],
        "output_format": settings["output_format"],
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
