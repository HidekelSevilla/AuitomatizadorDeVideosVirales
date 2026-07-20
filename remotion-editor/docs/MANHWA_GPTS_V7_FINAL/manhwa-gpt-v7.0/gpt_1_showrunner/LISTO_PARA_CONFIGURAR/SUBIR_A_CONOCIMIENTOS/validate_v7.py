#!/usr/bin/env python3
"""Fail-closed validator for Manhwa GPT V7 Grok-native full-page production."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


VERSION = "7.0"
NARRATION_VISUAL_MODEL = "NARRATION_VISUAL_TRACKS_V1"
NARRATION_CANONICALIZATION = "NFC_LF_UTF8_NO_TRAILING_LF"


CANVAS = (720, 1280)


HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")


SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


SCENE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


JS_MAX_SAFE_INTEGER = 9_007_199_254_740_991


SCALES = {"MACRO", "EXTREME_CLOSE", "CLOSE", "MEDIUM", "FULL", "WIDE_MASTER", "TRUE_LONG"}


VIEW_SCALES = SCALES | {"ENVIRONMENT_WIDE"}


ELEVATIONS = {"EYE_LEVEL", "LOW", "HIGH", "BIRDS_EYE", "TOP_DOWN", "WORMS_EYE", "KNEE_LEVEL", "GROUND_LEVEL"}


VIEWPOINTS = {"FRONT", "THREE_QUARTER_FRONT", "PROFILE", "OTS", "POV", "REAR", "REAR_THREE_QUARTER"}


PAGE_FAMILIES = {"WHITE_PAGE", "BLACK_PAGE", "OTHER"}


LAYOUT_FAMILY = {
    "WHITE_INSET": "WHITE_PAGE",
    "WHITE_COMPOSITE_2": "WHITE_PAGE",
    "WHITE_ISOLATE": "WHITE_PAGE",
    "WHITE_FRAGMENT": "WHITE_PAGE",
    "WHITE_ACTION_STRIP_2": "WHITE_PAGE",
    "WHITE_TRIPTYCH": "WHITE_PAGE",
    "BLACK_INSET": "BLACK_PAGE",
    "BLACK_COMPOSITE_2": "BLACK_PAGE",
    "BLACK_REVEAL_STRIP": "BLACK_PAGE",
    "BLACK_FLOATING_DETAIL": "BLACK_PAGE",
    "BLACK_TRIPTYCH": "BLACK_PAGE",
    "FULL_BLEED": "OTHER",
    "SPLASH": "OTHER",
    "CHARACTER_CLOSEUP": "OTHER",
    "OBJECT_DETAIL": "OTHER",
    "ENVIRONMENT_BREATHER": "OTHER",
    "TALL_ACTION": "OTHER",
}


LAYOUT_PANEL_COUNT = {
    "WHITE_INSET": 1,
    "WHITE_COMPOSITE_2": 2,
    "WHITE_ISOLATE": 1,
    "WHITE_FRAGMENT": 1,
    "WHITE_ACTION_STRIP_2": 2,
    "WHITE_TRIPTYCH": 3,
    "BLACK_INSET": 1,
    "BLACK_COMPOSITE_2": 2,
    "BLACK_REVEAL_STRIP": 1,
    "BLACK_FLOATING_DETAIL": 2,
    "BLACK_TRIPTYCH": 3,
    "FULL_BLEED": 1,
    "SPLASH": 1,
    "CHARACTER_CLOSEUP": 1,
    "OBJECT_DETAIL": 1,
    "ENVIRONMENT_BREATHER": 1,
    "TALL_ACTION": 1,
}


OTHER_PROMPT_ANCHORS = {
    "FULL_BLEED": "Full-bleed vertical webtoon panel",
    "SPLASH": "Full-page vertical manhwa splash panel",
    "CHARACTER_CLOSEUP": "Full-page vertical character close-up",
    "OBJECT_DETAIL": "Full-page vertical object detail",
    "ENVIRONMENT_BREATHER": "Full-page vertical environment breather",
    "TALL_ACTION": "Tall vertical action panel",
}


REQUIRED_NEGATIVE_TOKENS = (
    "no readable text", "no speech bubbles", "no captions", "no watermark", "no logo",
)


ASSET_REQUIRED_NEGATIVE_TOKENS = ("no readable text", "no speech bubbles", "no watermark", "no logo")


CHARACTER_DESCRIPTOR_FIELDS = (
    "age", "build", "face", "hair_or_skin", "wardrobe", "materials", "colors", "marks",
)


POSE_PERFORMANCE_FIELDS = ("emotion", "body", "gaze", "hands")


SCENARIO_DESCRIPTOR_FIELDS = ("architecture", "layout", "materials", "anchors", "palette")


SPATIAL_ROLES = {"PRIMARY", "SECONDARY", "INCIDENTAL"}


SCENARIO_CAMERA_TERMS = re.compile(
    r"\b(?:camera|shot|viewpoint|perspective|azimuth|lens|mm\s+lens|roll|dutch|"
    r"eye[- ]level|low[- ]angle|high[- ]angle|front\s+view|profile(?:\s+view)?|top[- ]down|"
    r"bird['’]?s[- ]eye|worm['’]?s[- ]eye|three[- ]quarter(?:\s+view)?|over[- ]the[- ]shoulder|"
    r"close[- ]up|wide[- ]shot|medium[- ]shot|foreground|background|near\s+plane|far\s+plane|"
    r"frame\s+edge|screen[- ]left|screen[- ]right|depth\s+layers?)\b",
    re.IGNORECASE,
)


SCENARIO_SHORTCUTS = re.compile(
    r"""
    (?:
        \bsame\s+(?:
            as\s+before
            |
            (?:place|location|room|environment|setting|site|facility|morgue|architecture|geometry|materials?)
            (?:\s+as\s+before)?
        )\b
        |
        \b(?:igual\s+que|como)\s+antes\b
        |
        \b(?:el\s+mismo|la\s+misma|los\s+mismos|las\s+mismas)\s+
        (?:lugar|ubicaci[oó]n|sala|entorno|escenario|geometr[ií]a|material(?:es)?)\b
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


REF_ROLES = {"IDENTITY", "POSE", "LOCATION", "STATE", "MOMENT"}


REF_AUTHORITIES = {"IDENTITY_ONLY", "POSE_ONLY", "GEOMETRY_LOCK", "FULL_LOCK"}


RUNTIME_ASSET_MODES = {"generate", "existing"}


RUNTIME_INGREDIENT_TYPES = {"character", "character_edited", "entity", "location_plate", "style_frame"}


FAILURE_CODES = {
    "F_PROVENANCE_MISSING", "F_LAYOUT_GEOMETRY", "F_PANEL_SEMANTICS",
    "F_CAMERA_SIGNATURE", "F_ACTION_SEMANTICS", "F_REFERENCE_CAMERA_CONFLICT",
    "F_REFERENCE_DOMINATED_COMPOSITION", "F_IDENTITY_DRIFT", "F_WARDROBE_DRIFT",
    "F_PROP_STATE_DRIFT", "F_LOCATION_DRIFT", "F_LIGHTING_DRIFT",
    "F_MOMENT_POSITION_DRIFT", "F_FUTURE_STATE_LEAK", "F_SEQUENCE_REPETITION",
    "F_POSE_REPETITION", "F_PALETTE_MONOTONY", "F_CROP_UNSAFE",
    "F_MOBILE_UNREADABLE", "F_TEXT_UNREADABLE", "F_RENDER_ARTIFACT",
    "F_APPROVED_HASH_CHANGED",
}


CAMERA_NATURAL_TERMS = {
    "scale": {
        "MACRO": ("macro",),
        "EXTREME_CLOSE": ("extreme close-up", "extreme closeup"),
        "CLOSE": ("close shot", "close-up", "closeup"),
        "MEDIUM": ("medium shot", "waist-up", "waist up"),
        "FULL": ("full shot", "full-body", "full body"),
        "WIDE_MASTER": ("wide master", "wide shot"),
        "TRUE_LONG": ("true long shot", "long shot", "distant shot", "extreme wide"),
        "ENVIRONMENT_WIDE": ("environment wide", "wide environment", "wide establishing"),
    },
    "elevation": {
        "EYE_LEVEL": ("eye-level", "eye level"),
        "LOW": ("low-angle", "low angle"),
        "HIGH": ("high-angle", "high angle"),
        "BIRDS_EYE": ("bird's-eye", "birds-eye", "bird eye"),
        "TOP_DOWN": ("top-down", "top down"),
        "WORMS_EYE": ("worm's-eye", "worms-eye", "worm eye"),
        "KNEE_LEVEL": ("knee-level", "knee level"),
        "GROUND_LEVEL": ("ground-level", "ground level"),
    },
    "viewpoint": {
        "FRONT": ("front view", "frontal view"),
        "THREE_QUARTER_FRONT": ("three-quarter front", "three quarter front"),
        "PROFILE": ("profile view", "side profile"),
        "OTS": ("over-the-shoulder", "over the shoulder", "ots view"),
        "POV": ("point-of-view", "point of view", "pov view"),
        "REAR": ("rear view", "back view"),
        "REAR_THREE_QUARTER": ("rear three-quarter", "rear three quarter"),
    },
}


LAYOUT_PROMPT_ANCHORS = {
    "WHITE_INSET": "one inset",
    "WHITE_COMPOSITE_2": "two-panel composite",
    "WHITE_ISOLATE": "isolated single panel",
    "WHITE_FRAGMENT": "fragmented single panel",
    "WHITE_ACTION_STRIP_2": "two action strips",
    "WHITE_TRIPTYCH": "three-panel triptych",
    "BLACK_INSET": "one inset",
    "BLACK_COMPOSITE_2": "two-panel composite",
    "BLACK_REVEAL_STRIP": "one reveal strip",
    "BLACK_FLOATING_DETAIL": "one main panel with one floating detail",
    "BLACK_TRIPTYCH": "three-panel triptych",
    **OTHER_PROMPT_ANCHORS,
}


DEFAULT_THRESHOLDS: dict[str, Any] = {
    "min_non_eye_level_pct": 20,
    "min_non_frontal_pct": 35,
    "max_identical_signature_run": 2,
    "min_distinct_page_layouts": 6,
    "max_generation_attempts": 3,
    "min_camera_match_pct": 90,
    "min_distinct_camera_signatures": 6,
    "max_minor_failures_pilot": 1,
    "max_minor_failure_pct_production": 2,
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(encoded)


def _normalize_project_numbers(value: Any) -> Any:
    """Normalize JSON numbers that JavaScript cannot distinguish after parsing."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        if abs(value) > JS_MAX_SAFE_INTEGER:
            raise ValueError(f"project integer is outside JavaScript's safe range: {value}")
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("project contains a non-finite number")
        if value == 0:
            return 0
        if value.is_integer():
            integer = int(value)
            if abs(integer) > JS_MAX_SAFE_INTEGER:
                raise ValueError(f"project integer is outside JavaScript's safe range: {integer}")
            return integer
        return value
    if isinstance(value, list):
        return [_normalize_project_numbers(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_project_numbers(item) for key, item in value.items()}
    raise ValueError(f"project contains a non-JSON value: {type(value).__name__}")


def project_semantic_sha256(project: Any) -> str:
    """Hash parsed project content stably across Python/JavaScript snapshots."""
    return sha256_json(_normalize_project_numbers(project))


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: str) -> str:
    value = unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n"))
    if value.endswith("\n"):
        value = value[:-1]
    return sha256_bytes(value.encode("utf-8"))


def clean_hash(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    if value.lower().startswith("sha256:"):
        value = value[7:]
    return value.lower() if HEX64.fullmatch(value) else None


def is_enum(value: Any, allowed: Iterable[str]) -> bool:
    return isinstance(value, str) and value in allowed


def is_safe_relative(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip() or "\x00" in value:
        return False
    value = value.replace("\\", "/")
    if value.startswith("/") or re.match(r"^[A-Za-z]:", value) or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", value):
        return False
    return all(part not in {"", ".", ".."} for part in value.split("/"))


def resolve_artifact(root: Path, value: str) -> Path | None:
    if not is_safe_relative(value):
        return None
    root = root.resolve()
    candidate = root.joinpath(*value.replace("\\", "/").split("/")).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def json_load(path: Path) -> tuple[Any, bytes]:
    raw = path.read_bytes()
    try:
        return json.loads(raw.decode("utf-8-sig")), raw
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"JSON inválido en {path}: {exc}") from exc


def image_size(path: Path) -> tuple[int, int] | None:
    """Lee dimensiones PNG/JPEG usando solo la biblioteca estándar."""
    try:
        with path.open("rb") as handle:
            head = handle.read(24)
            if head.startswith(b"\x89PNG\r\n\x1a\n") and len(head) >= 24:
                return struct.unpack(">II", head[16:24])
            if head[:2] != b"\xff\xd8":
                return None
            handle.seek(2)
            while True:
                byte = handle.read(1)
                if not byte:
                    return None
                if byte != b"\xff":
                    continue
                while byte == b"\xff":
                    byte = handle.read(1)
                marker = byte[0]
                if marker in {0xD8, 0xD9}:
                    continue
                length_raw = handle.read(2)
                if len(length_raw) != 2:
                    return None
                length = struct.unpack(">H", length_raw)[0]
                if length < 2:
                    return None
                if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                    data = handle.read(5)
                    if len(data) != 5:
                        return None
                    return struct.unpack(">HH", data[1:5])[::-1]
                handle.seek(length - 2, 1)
    except OSError:
        return None


class Validation:
    def __init__(self) -> None:
        self.errors: list[str] = []

    def error(self, location: str, message: str) -> None:
        self.errors.append(f"{location}: {message}")

    def require(self, condition: bool, location: str, message: str) -> bool:
        if not condition:
            self.error(location, message)
            return False
        return True

    def finish(self, token: str, details: str = "") -> str:
        if self.errors:
            lines = [f"VALIDATION_FAILED errors={len(self.errors)}"]
            lines.extend(f"ERROR {item}" for item in self.errors)
            raise ValidationFailure("\n".join(lines))
        return f"{token}{(' ' + details) if details else ''}"


class ValidationFailure(Exception):
    pass


def dict_value(value: Any, v: Validation, location: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        v.error(location, "debe ser un objeto")
        return {}
    return value


def list_value(value: Any, v: Validation, location: str) -> list[Any]:
    if not isinstance(value, list):
        v.error(location, "debe ser una lista")
        return []
    return value


def require_text(obj: dict[str, Any], key: str, v: Validation, location: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        v.error(f"{location}.{key}", "texto requerido")
        return ""
    return value


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def largest_remainder_counts(total: int, ratios: dict[str, Any] | None = None) -> dict[str, int]:
    """Allocate the exact 30/30/40 family mix with deterministic tie breaking."""
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise ValueError("total must be a non-negative integer")
    ratios = ratios or {"white": 30, "black": 30, "other": 40}
    keys = ("white", "black", "other")
    if set(ratios) != set(keys) or any(not finite_number(ratios.get(key)) or ratios[key] < 0 for key in keys):
        raise ValueError("ratios must contain non-negative white, black and other values")
    denominator = sum(float(ratios[key]) for key in keys)
    if not math.isclose(denominator, 100.0, abs_tol=1e-9):
        raise ValueError("ratios must sum to 100")
    quotas = {key: total * float(ratios[key]) / denominator for key in keys}
    result = {key: math.floor(quotas[key]) for key in keys}
    remaining = total - sum(result.values())
    order = sorted(keys, key=lambda key: (-(quotas[key] - result[key]), keys.index(key)))
    for key in order[:remaining]:
        result[key] += 1
    return result


def contains_literal(haystack: str, needle: Any) -> bool:
    return isinstance(needle, str) and bool(needle.strip()) and needle.casefold() in haystack.casefold()


def validate_substantive_profile(
    raw: Any,
    fields: Iterable[str],
    signature: str,
    v: Validation,
    location: str,
) -> dict[str, str]:
    profile = dict_value(raw, v, location)
    clean: dict[str, str] = {}
    for field in fields:
        value = profile.get(field)
        valid = isinstance(value, str) and len(value.strip()) >= 2
        v.require(valid, f"{location}.{field}", "descriptor sustantivo requerido")
        if valid:
            clean[field] = value.strip()
            v.require(contains_literal(signature, value), f"{location.rsplit('.', 1)[0]}.prompt_signature",
                      f"debe contener literalmente descriptor_profile.{field}: {value!r}")
    return clean


def validate_camera_signature(raw: Any, v: Validation, location: str) -> dict[str, Any]:
    camera = dict_value(raw, v, location)
    v.require(is_enum(camera.get("scale"), VIEW_SCALES), f"{location}.scale", "scale invalida")
    v.require(is_enum(camera.get("elevation"), ELEVATIONS), f"{location}.elevation", "elevation inválida")
    v.require(is_enum(camera.get("viewpoint"), VIEWPOINTS), f"{location}.viewpoint", "viewpoint inválido")
    azimuth = camera.get("azimuth_deg")
    lens = camera.get("lens_mm")
    v.require(finite_number(azimuth) and 0 <= float(azimuth) < 360,
              f"{location}.azimuth_deg", "número 0 <= azimuth_deg < 360 requerido")
    v.require(finite_number(lens) and 8 <= float(lens) <= 300,
              f"{location}.lens_mm", "lente físico entre 8 y 300 mm requerido")
    roll_deg = camera.get("roll_deg")
    v.require(finite_number(roll_deg) and -45 <= float(roll_deg) <= 45,
              f"{location}.roll_deg", "roll_deg fisico entre -45 y 45 requerido")
    dominant = camera.get("dominant_subject")
    v.require(isinstance(dominant, str) and SCENE_ID_RE.fullmatch(dominant) is not None,
              f"{location}.dominant_subject", "ID de sujeto dominante requerido")
    occupancy = camera.get("occupancy_pct")
    v.require(finite_number(occupancy) and 0 < float(occupancy) <= 100,
              f"{location}.occupancy_pct", "occupancy_pct 0..100 requerido")
    return camera


def circular_angle_delta(left: Any, right: Any) -> float:
    if not finite_number(left) or not finite_number(right):
        return math.inf
    delta = abs(float(left) - float(right)) % 360
    return min(delta, 360 - delta)


def camera_reference_matches(reference: dict[str, Any], shot: dict[str, Any]) -> bool:
    return (
        reference.get("elevation") == shot.get("elevation")
        and reference.get("viewpoint") == shot.get("viewpoint")
        and circular_angle_delta(reference.get("azimuth_deg"), shot.get("azimuth_deg")) <= 20 + 1e-9
        and finite_number(reference.get("lens_mm"))
        and finite_number(shot.get("lens_mm"))
        and abs(float(reference["lens_mm"]) - float(shot["lens_mm"])) <= 15 + 1e-9
        and finite_number(reference.get("roll_deg"))
        and finite_number(shot.get("roll_deg"))
        and abs(float(reference["roll_deg"]) - float(shot["roll_deg"])) <= 10 + 1e-9
    )


def material_camera_change_count(previous: dict[str, Any], current: dict[str, Any]) -> int:
    changes = sum(previous.get(key) != current.get(key) for key in ("scale", "elevation", "viewpoint"))
    changes += circular_angle_delta(previous.get("azimuth_deg"), current.get("azimuth_deg")) >= 20 - 1e-9
    if finite_number(previous.get("lens_mm")) and finite_number(current.get("lens_mm")):
        changes += abs(float(previous["lens_mm"]) - float(current["lens_mm"])) >= 15 - 1e-9
    if finite_number(previous.get("roll_deg")) and finite_number(current.get("roll_deg")):
        changes += abs(float(previous["roll_deg"]) - float(current["roll_deg"])) >= 10 - 1e-9
    changes += previous.get("dominant_subject") != current.get("dominant_subject")
    return int(changes)


def prompt_number(value: Any) -> str:
    if finite_number(value) and math.isclose(float(value), round(float(value)), abs_tol=1e-9):
        return str(int(round(float(value))))
    return f"{float(value):g}" if finite_number(value) else str(value)


def panel_count_phrase(panel_count: Any) -> str:
    words = {1: "one", 2: "two", 3: "three"}
    count_word = words.get(panel_count, str(panel_count))
    suffix = "panel" if panel_count == 1 else "panels"
    return f"exactly {count_word} image {suffix}"


def validate_natural_camera_language(
    fragment: str,
    camera: dict[str, Any],
    v: Validation,
    location: str,
) -> None:
    folded = fragment.casefold()
    for dimension in ("scale", "elevation", "viewpoint"):
        value = camera.get(dimension)
        terms = CAMERA_NATURAL_TERMS[dimension].get(value, ())
        v.require(any(term in folded for term in terms), f"{location}.{dimension}",
                  f"prompt_fragment no expresa {dimension}={value} con lenguaje natural")
    roll = camera.get("roll_deg")
    if finite_number(roll) and abs(float(roll)) < 10:
        v.require("level camera roll" in folded or "level horizon" in folded,
                  f"{location}.roll_deg", "roll casi nivelado exige 'level camera roll' o 'level horizon'")
    elif finite_number(roll):
        v.require("dutch angle" in folded or "dutch tilt" in folded or "camera roll" in folded,
                  f"{location}.roll_deg", "roll expresivo exige Dutch angle/tilt o camera roll")


def referenced_character_poses(runtime_refs: Any) -> dict[str, str]:
    refs = runtime_refs if isinstance(runtime_refs, dict) else {}
    result: dict[str, str] = {}
    raw_refs: list[Any] = []
    if isinstance(refs.get("characters"), list):
        raw_refs.extend(refs["characters"])
    if isinstance(refs.get("assets"), list):
        raw_refs.extend(refs["assets"])
    for raw_ref in raw_refs:
        ref = {"id": raw_ref} if isinstance(raw_ref, str) else raw_ref if isinstance(raw_ref, dict) else {}
        character_id = ref.get("id", ref.get("character_id", ref.get("asset_id")))
        pose_id = ref.get("pose", "base")
        if isinstance(character_id, str) and isinstance(pose_id, str):
            result[character_id] = pose_id
    return result


def validate_prompt_contract(
    prompt: str,
    native_page: dict[str, Any],
    shots: list[dict[str, Any]],
    runtime_refs: Any,
    graph: dict[str, Any],
    v: Validation,
    location: str,
) -> None:
    folded = prompt.casefold()
    v.require(bool(prompt.strip()), location, "image_prompt natural en ingles requerido")
    v.require(re.match(r"^\s*CAMERA:", prompt, re.IGNORECASE) is None, location,
              "GROK_NATIVE_PAGE prohíbe el formato machine CAMERA/SUBJECTS/ACTION")
    shortcut = SCENARIO_SHORTCUTS.search(prompt)
    if shortcut is not None:
        v.error(location, f"atajo ambiental relativo prohibido {shortcut.group(0)!r}; describe el lugar de forma absoluta")
    for token in REQUIRED_NEGATIVE_TOKENS:
        v.require(token in folded, location, f"token negativo literal obligatorio ausente: {token}")

    family = native_page.get("family")
    layout = native_page.get("layout")
    background_pct = native_page.get("background_pct")
    pct = prompt_number(background_pct)
    if family == "WHITE_PAGE":
        v.require("pure white webtoon page" in folded, location,
                  "WHITE_PAGE exige literalmente 'Pure white webtoon page'")
        valid_pct = (
            f"white space occupying {pct}% of the canvas".casefold() in folded
            or f"{pct}% untouched white space".casefold() in folded
        )
        v.require(valid_pct, location, f"WHITE_PAGE debe expresar el {pct}% de blanco")
    elif family == "BLACK_PAGE":
        v.require("matte-black webtoon page" in folded, location,
                  "BLACK_PAGE exige literalmente 'Matte-black webtoon page'")
        v.require(f"black space occupying {pct}% of the canvas".casefold() in folded,
                  location, f"BLACK_PAGE debe expresar el {pct}% de negro")
    elif family == "OTHER":
        v.require("pure white webtoon page" not in folded and "matte-black webtoon page" not in folded,
                  location, "OTHER no puede fingir una familia WHITE/BLACK")
        v.require(re.search(r"(?:white|black)\s+space\s+occupying", prompt, re.IGNORECASE) is None,
                  location, "OTHER no declara espacio blanco/negro reservado")
    anchor = LAYOUT_PROMPT_ANCHORS.get(str(layout))
    if isinstance(anchor, str):
        v.require(anchor.casefold() in folded, location,
                  f"layout {layout} exige literalmente {anchor!r}")
    composition = native_page.get("composition")
    if isinstance(composition, str) and composition.strip():
        v.require(composition in prompt, location, "native_page.composition debe aparecer literal en image_prompt")
    count_phrase = panel_count_phrase(native_page.get("panel_count"))
    v.require(count_phrase.casefold() in folded, location,
              f"debe declarar literalmente {count_phrase!r}; inset/composite por sí solo es ambiguo")

    pose_by_character = referenced_character_poses(runtime_refs)
    panel_count = native_page.get("panel_count")
    expected_labels = [chr(ord("A") + index) for index in range(len(shots))]
    for index, shot in enumerate(shots):
        sloc = f"{location}.shots[{index}]"
        fragment = shot.get("prompt_fragment", "")
        v.require(isinstance(fragment, str) and bool(fragment.strip()), f"{sloc}.prompt_fragment",
                  "fragmento natural requerido")
        if not isinstance(fragment, str):
            continue
        v.require(fragment in prompt, f"{sloc}.prompt_fragment", "debe aparecer literal en image_prompt")
        if isinstance(panel_count, int) and panel_count > 1:
            expected_prefix = f"Panel {expected_labels[index]}:"
            v.require(fragment.startswith(expected_prefix), f"{sloc}.prompt_fragment",
                      f"página multipanel exige prefijo exacto {expected_prefix!r}")
        camera = shot.get("camera") if isinstance(shot.get("camera"), dict) else {}
        validate_natural_camera_language(fragment, camera, v, f"{sloc}.prompt_fragment")
        visible = shot.get("visible_entities") if isinstance(shot.get("visible_entities"), list) else []
        for character_id in visible:
            signature = graph.get("character_signatures", {}).get(character_id)
            if isinstance(signature, str):
                v.require(signature in fragment, f"{sloc}.prompt_fragment",
                          f"falta prompt_signature física completa de {character_id}; el nombre no basta")
                pose_id = pose_by_character.get(character_id)
                performance = graph.get("character_pose_performances", {}).get((str(character_id), str(pose_id)), {})
                for field in POSE_PERFORMANCE_FIELDS:
                    value = performance.get(field) if isinstance(performance, dict) else None
                    if isinstance(value, str):
                        v.require(value in fragment, f"{sloc}.prompt_fragment",
                                  f"falta performance_signature.{field} de {character_id}/{pose_id}: {value!r}")
                for invariant in graph.get("character_negative_invariants", {}).get(character_id, []):
                    v.require(invariant in prompt, location,
                              f"falta negative_invariant literal de {character_id}: {invariant!r}")
        escenario_id = shot.get("location_id")
        root_signature = graph.get("escenario_signatures", {}).get(escenario_id)
        if isinstance(root_signature, str):
            v.require(root_signature in fragment, f"{sloc}.prompt_fragment",
                      f"falta prompt_signature raíz de escenarios.{escenario_id}")
        view_id = shot.get("view_id")
        view_signature = graph.get("escenario_view_signatures", {}).get((str(escenario_id), str(view_id)))
        if isinstance(view_signature, str):
            v.require(view_signature in fragment, f"{sloc}.prompt_fragment",
                      f"falta prompt_signature de escenarios.{escenario_id}.views.{view_id}")


def validate_runtime_asset_definition(
    raw: Any,
    v: Validation,
    location: str,
    reference_key: str,
) -> dict[str, Any]:
    """Valida una pose/vista que el cargador de produccion puede materializar."""
    asset_def = dict_value(raw, v, location)
    mode = require_text(asset_def, "mode", v, location)
    v.require(mode in RUNTIME_ASSET_MODES, f"{location}.mode", "usa generate o existing")
    asset = require_text(asset_def, "asset", v, location)
    v.require(is_safe_relative(asset), f"{location}.asset", "ruta relativa segura requerida")
    # Incluso existing conserva el prompt canonico: es necesario para regenerar y auditar identidad.
    require_text(asset_def, "prompt", v, location)
    if reference_key in asset_def:
        require_text(asset_def, reference_key, v, location)
    if "reference_assets" in asset_def:
        refs = list_value(asset_def.get("reference_assets"), v, f"{location}.reference_assets")
        for index, ref in enumerate(refs):
            v.require(is_safe_relative(ref), f"{location}.reference_assets[{index}]", "ruta relativa segura requerida")
    return asset_def


def validate_runtime_asset_graph(root: dict[str, Any], v: Validation) -> dict[str, Any]:
    """Comprueba el contrato V2.8 que consume lib/json-loader.js.

    V7 puede anadir metadatos, pero no sustituir poses, vistas ni ingredients[].
    """
    raw_project = root.get("project")
    project = raw_project if isinstance(raw_project, dict) else {}
    raw_series = project.get("series")
    series = raw_series if isinstance(raw_series, dict) else {}
    serie = project.get("serie", series.get("id"))

    characters = dict_value(root.get("characters"), v, "characters")
    v.require(bool(characters), "characters", "mapa no vacio requerido")
    character_poses: dict[str, set[str]] = {}
    character_signatures: dict[str, str] = {}
    character_negative_invariants: dict[str, list[str]] = {}
    character_pose_performances: dict[tuple[str, str], dict[str, str]] = {}
    for character_id, raw_character in characters.items():
        location = f"characters.{character_id}"
        v.require(isinstance(character_id, str) and SCENE_ID_RE.fullmatch(character_id) is not None,
                  location, "ID seguro requerido")
        character = dict_value(raw_character, v, location)
        require_text(character, "display_name", v, location)
        signature = require_text(character, "prompt_signature", v, location)
        if signature:
            character_signatures[str(character_id)] = signature
        validate_substantive_profile(
            character.get("descriptor_profile"), CHARACTER_DESCRIPTOR_FIELDS, signature, v,
            f"{location}.descriptor_profile",
        )
        immutable_traits = character.get("immutable_traits", [])
        v.require(isinstance(immutable_traits, list) and
                  all(isinstance(item, str) and item.strip() for item in immutable_traits),
                  f"{location}.immutable_traits", "lista de descriptores no vacíos requerida si se declara")
        negative_invariants = character.get("negative_invariants", [])
        v.require(isinstance(negative_invariants, list) and bool(negative_invariants) and
                  all(isinstance(item, str) and item.strip() for item in negative_invariants),
                  f"{location}.negative_invariants", "lista de frases no vacías requerida si se declara")
        if isinstance(negative_invariants, list):
            character_negative_invariants[str(character_id)] = [
                item for item in negative_invariants if isinstance(item, str) and item.strip()
            ]
        poses = dict_value(character.get("poses"), v, f"{location}.poses")
        v.require(bool(poses), f"{location}.poses", "mapa no vacio requerido; V7 no puede reemplazarlo por prompt_signature")
        pose_ids = {key for key in poses if isinstance(key, str)}
        character_poses[str(character_id)] = pose_ids
        seen_performances: set[tuple[str, ...]] = set()
        for pose_id, raw_pose in poses.items():
            pose_location = f"{location}.poses.{pose_id}"
            v.require(isinstance(pose_id, str) and SCENE_ID_RE.fullmatch(pose_id) is not None,
                      pose_location, "ID seguro requerido")
            pose = validate_runtime_asset_definition(raw_pose, v, pose_location, "reference_pose")
            performance_raw = dict_value(
                pose.get("performance_signature"), v, f"{pose_location}.performance_signature"
            )
            performance: dict[str, str] = {}
            for field in POSE_PERFORMANCE_FIELDS:
                value = performance_raw.get(field)
                valid = isinstance(value, str) and len(value.strip()) >= 2
                v.require(valid, f"{pose_location}.performance_signature.{field}",
                          "descriptor de actuacion sustantivo requerido")
                if valid:
                    performance[field] = value.strip()
            character_pose_performances[(str(character_id), str(pose_id))] = performance
            performance_key = tuple(performance.get(field, "") for field in POSE_PERFORMANCE_FIELDS)
            v.require(performance_key not in seen_performances,
                      f"{pose_location}.performance_signature", "cada pose requiere performance_signature unica")
            seen_performances.add(performance_key)
            pose_prompt = pose.get("prompt", "") if isinstance(pose.get("prompt"), str) else ""
            if signature:
                v.require(signature in pose_prompt, f"{pose_location}.prompt",
                          "debe incluir prompt_signature raiz exacta")
            for field, value in performance.items():
                v.require(value in pose_prompt, f"{pose_location}.prompt",
                          f"falta performance_signature.{field}: {value!r}")
            for invariant in character_negative_invariants.get(str(character_id), []):
                v.require(invariant in pose_prompt, f"{pose_location}.prompt",
                          f"falta negative_invariant: {invariant!r}")
            for token in ASSET_REQUIRED_NEGATIVE_TOKENS:
                v.require(token in pose_prompt.casefold(), f"{pose_location}.prompt",
                          f"token negativo obligatorio ausente: {token}")
            reference_pose = pose.get("reference_pose")
            if isinstance(reference_pose, str):
                v.require(reference_pose in pose_ids, f"{pose_location}.reference_pose",
                          f"pose inexistente en {location}.poses")

    escenarios = dict_value(root.get("escenarios"), v, "escenarios")
    v.require(bool(escenarios), "escenarios", "mapa no vacio requerido")
    escenario_views: dict[str, set[str]] = {}
    escenario_has_reference: set[str] = set()
    escenario_signatures: dict[str, str] = {}
    escenario_view_signatures: dict[tuple[str, str], str] = {}
    escenario_spatial_roles: dict[str, str] = {}
    escenario_view_cameras: dict[tuple[str, str], dict[str, Any]] = {}
    for escenario_id, raw_escenario in escenarios.items():
        location = f"escenarios.{escenario_id}"
        v.require(isinstance(escenario_id, str) and SCENE_ID_RE.fullmatch(escenario_id) is not None,
                  location, "ID seguro requerido")
        escenario = dict_value(raw_escenario, v, location)
        require_text(escenario, "display_name", v, location)
        signature = require_text(escenario, "prompt_signature", v, location)
        if signature:
            escenario_signatures[str(escenario_id)] = signature
            v.require(SCENARIO_CAMERA_TERMS.search(signature) is None, f"{location}.prompt_signature",
                      "solo arquitectura/materiales/anchors; no debe bloquear términos de cámara")
        validate_substantive_profile(
            escenario.get("descriptor_profile"), SCENARIO_DESCRIPTOR_FIELDS, signature, v,
            f"{location}.descriptor_profile",
        )
        spatial_role = escenario.get("spatial_role")
        v.require(spatial_role in SPATIAL_ROLES, f"{location}.spatial_role",
                  "usa PRIMARY, SECONDARY o INCIDENTAL")
        if isinstance(spatial_role, str):
            escenario_spatial_roles[str(escenario_id)] = spatial_role
        raw_views = escenario.get("views")
        views = raw_views if isinstance(raw_views, dict) else {}
        if raw_views is not None and not isinstance(raw_views, dict):
            v.error(f"{location}.views", "debe ser un objeto")
        reference_asset = escenario.get("reference_asset")
        has_reference_asset = is_safe_relative(reference_asset)
        if reference_asset is not None:
            v.require(has_reference_asset, f"{location}.reference_asset", "ruta relativa segura requerida")
        v.require(bool(views) or has_reference_asset, location,
                  "requiere views no vacio o reference_asset; prompt_signature no es consumible por runtime")
        if has_reference_asset:
            escenario_has_reference.add(str(escenario_id))
        view_ids = {key for key in views if isinstance(key, str)}
        escenario_views[str(escenario_id)] = view_ids
        seen_view_signatures: set[str] = set()
        for view_id, raw_view in views.items():
            view_location = f"{location}.views.{view_id}"
            v.require(isinstance(view_id, str) and SCENE_ID_RE.fullmatch(view_id) is not None,
                      view_location, "ID seguro requerido")
            if isinstance(raw_view, dict):
                v.require("reference_assets" not in raw_view, f"{view_location}.reference_assets",
                          "campo prohibido en V7; runtime lo ignora, usa solo reference_view explicita")
            view = validate_runtime_asset_definition(raw_view, v, view_location, "reference_view")
            view_prompt = view.get("prompt")
            view_signature = require_text(view, "prompt_signature", v, view_location)
            if view_signature:
                v.require(SCENARIO_CAMERA_TERMS.search(view_signature) is None,
                          f"{view_location}.prompt_signature", "la firma de vista debe ser camera-free")
                v.require(view_signature not in seen_view_signatures,
                          f"{view_location}.prompt_signature", "cada vista requiere firma espacial distinta")
                seen_view_signatures.add(view_signature)
                escenario_view_signatures[(str(escenario_id), str(view_id))] = view_signature
            if isinstance(view_prompt, str):
                relative_shortcut = SCENARIO_SHORTCUTS.search(view_prompt)
                if relative_shortcut is not None:
                    v.error(
                        f"{view_location}.prompt",
                        f"atajo espacial relativo prohibido {relative_shortcut.group(0)!r}; "
                        "reitera arquitectura, layout, materiales y anchors absolutos",
                    )
                if signature:
                    v.require(signature in view_prompt, f"{view_location}.prompt",
                              "cada vista debe incluir prompt_signature exacta del escenario")
                if view_signature:
                    v.require(view_signature in view_prompt, f"{view_location}.prompt",
                              "cada vista debe incluir su prompt_signature espacial exacta")
            camera = validate_camera_signature(view.get("camera_signature"), v, f"{view_location}.camera_signature")
            v.require(camera.get("dominant_subject") == "environment",
                      f"{view_location}.camera_signature.dominant_subject", "vista usa environment")
            v.require(camera.get("occupancy_pct") == 100,
                      f"{view_location}.camera_signature.occupancy_pct", "vista usa 100")
            if isinstance(view_prompt, str):
                for token in ASSET_REQUIRED_NEGATIVE_TOKENS:
                    v.require(token in view_prompt.casefold(),
                              f"{view_location}.prompt", f"token obligatorio ausente: {token}")
                for token in ("empty environment", "no characters"):
                    v.require(token in view_prompt.casefold(), f"{view_location}.prompt",
                              f"view de escenario requiere el token literal {token!r}")
                v.require("static identity plate" in view_prompt.casefold(),
                          f"{view_location}.prompt",
                          "view de escenario requiere el token literal 'static identity plate'")
                if signature:
                    v.require(signature in view_prompt, f"{view_location}.prompt",
                              "root signature debe aparecer literal")
                if view_signature:
                    v.require(view_signature in view_prompt, f"{view_location}.prompt",
                              "view signature debe aparecer literal")
                if re.match(r"^\s*CAMERA:", view_prompt, re.IGNORECASE) is None:
                    validate_natural_camera_language(view_prompt, camera, v, f"{view_location}.prompt")
            escenario_view_cameras[(str(escenario_id), str(view_id))] = camera
            reference_view = view.get("reference_view")
            if isinstance(reference_view, str):
                v.require(reference_view in view_ids, f"{view_location}.reference_view",
                          f"vista inexistente en {location}.views")

        # A reference_view is optional and never inferred.  When declared it is
        # geometry evidence, so it must already agree with the requested view.
        for view_id, raw_view in views.items():
            if not isinstance(raw_view, dict) or not isinstance(raw_view.get("reference_view"), str):
                continue
            reference_view = raw_view["reference_view"]
            current_camera = escenario_view_cameras.get((str(escenario_id), str(view_id)))
            reference_camera = escenario_view_cameras.get((str(escenario_id), reference_view))
            v.require(isinstance(reference_camera, dict),
                      f"{location}.views.{view_id}.reference_view", "vista referenciada sin camera_signature valida")
            if isinstance(current_camera, dict) and isinstance(reference_camera, dict):
                v.require(camera_reference_matches(reference_camera, current_camera),
                          f"{location}.views.{view_id}.reference_view",
                          "camera de reference_view incompatible con GEOMETRY_LOCK: "
                          "elevation/viewpoint exactos, azimuth_deg <=20°, lens_mm <=15 mm y roll_deg <=10°")

    ingredients_raw = root.get("ingredients")
    ingredients = list_value(ingredients_raw, v, "ingredients")
    ingredient_types: dict[str, str] = {}
    ingredient_outputs: dict[str, str] = {}
    for index, raw_ingredient in enumerate(ingredients):
        location = f"ingredients[{index}]"
        ingredient = dict_value(raw_ingredient, v, location)
        ingredient_id = ingredient.get("id", ingredient.get("ingredient_id"))
        v.require(isinstance(ingredient_id, str) and SCENE_ID_RE.fullmatch(ingredient_id) is not None,
                  f"{location}.id", "ID seguro requerido")
        ingredient_type = require_text(ingredient, "type", v, location)
        v.require(ingredient_type in RUNTIME_INGREDIENT_TYPES, f"{location}.type",
                  "usa character, character_edited, entity, location_plate o style_frame")
        if isinstance(ingredient_id, str):
            v.require(ingredient_id not in ingredient_types, f"{location}.id", "ID duplicado")
            ingredient_types[ingredient_id] = ingredient_type
        output = ingredient.get("output_file", ingredient.get("reference_asset"))
        v.require(is_safe_relative(output), f"{location}.output_file", "ruta relativa segura requerida")
        if isinstance(output, str) and is_safe_relative(output):
            output_key = output.replace("\\", "/").lower()
            bucket = (
                "characters" if ingredient_type in {"character", "character_edited"}
                else "escenarios" if ingredient_type == "location_plate"
                else "ingredients"
            )
            if isinstance(serie, str) and SCENE_ID_RE.fullmatch(serie):
                expected_prefix = f"assets/{bucket}/{serie}/".lower()
                v.require(output_key.startswith(expected_prefix), f"{location}.output_file",
                          f"debe vivir bajo assets/{bucket}/{serie}/")
            v.require(re.search(r"\.(?:png|jpe?g|webp)$", output_key) is not None,
                      f"{location}.output_file", "extension de imagen requerida: png, jpg, jpeg o webp")
            v.require(output_key not in ingredient_outputs, f"{location}.output_file",
                      f"ruta reutilizada por {ingredient_outputs.get(output_key, '?')}")
            ingredient_outputs[output_key] = str(ingredient_id)
        if ingredient_type == "character":
            # El pre-pass del loader solo necesita el asset preexistente.
            v.require(is_safe_relative(ingredient.get("reference_asset", ingredient.get("output_file"))),
                      f"{location}.reference_asset", "asset de personaje requerido")
        elif ingredient_type == "character_edited":
            base = require_text(ingredient, "base", v, location)
            v.require(base in characters, f"{location}.base", "debe apuntar a characters")
            require_text(ingredient, "edit_prompt", v, location)
        elif ingredient_type in {"entity", "location_plate", "style_frame"}:
            require_text(ingredient, "generation_prompt", v, location)

    return {
        "characters": characters,
        "character_poses": character_poses,
        "character_signatures": character_signatures,
        "character_negative_invariants": character_negative_invariants,
        "character_pose_performances": character_pose_performances,
        "escenarios": escenarios,
        "escenario_views": escenario_views,
        "escenario_has_reference": escenario_has_reference,
        "escenario_signatures": escenario_signatures,
        "escenario_view_signatures": escenario_view_signatures,
        "escenario_spatial_roles": escenario_spatial_roles,
        "escenario_view_cameras": escenario_view_cameras,
        "ingredient_types": ingredient_types,
    }


def validate_runtime_scene_references(
    raw: Any,
    graph: dict[str, Any],
    scene_ids: set[str],
    scene_id: str,
    v: Validation,
    location: str,
    shot: dict[str, Any] | None = None,
    source_usage: dict[str, list[dict[str, Any]]] | None = None,
) -> None:
    """Valida las referencias en la ruta exacta que consume el runtime actual."""
    refs = dict_value(raw, v, location)
    has_usable_reference = False

    characters_raw = refs.get("characters", [])
    if "characters" in refs:
        characters = list_value(characters_raw, v, f"{location}.characters")
        for index, raw_ref in enumerate(characters):
            ref_location = f"{location}.characters[{index}]"
            if isinstance(raw_ref, str):
                character_id, pose = raw_ref, ""
            else:
                ref = dict_value(raw_ref, v, ref_location)
                character_id = ref.get("id", ref.get("character_id"))
                pose = ref.get("pose")
            edited = graph["ingredient_types"].get(character_id) == "character_edited"
            v.require(character_id in graph["characters"] or edited, ref_location,
                      "id no existe en characters ni es character_edited")
            if character_id in graph["characters"]:
                v.require(isinstance(pose, str) and pose in graph["character_poses"].get(character_id, set()),
                          f"{ref_location}.pose", "pose runtime requerida y debe existir")
                if source_usage is not None and isinstance(pose, str):
                    source_usage.setdefault("characters", []).append({
                        "character_id": character_id, "pose": pose, "location": ref_location,
                    })
            has_usable_reference = True

    escenario_raw = refs.get("escenario")
    if escenario_raw is not None:
        escenario = dict_value(escenario_raw, v, f"{location}.escenario")
        escenario_id = escenario.get("id")
        view = escenario.get("view")
        authority = escenario.get("geometry_authority", "GEOMETRY_LOCK")
        v.require(authority in {"GEOMETRY_LOCK", "IDENTITY_ONLY"},
                  f"{location}.escenario.geometry_authority",
                  "usa GEOMETRY_LOCK (default) o IDENTITY_ONLY")
        if authority == "IDENTITY_ONLY":
            require_text(escenario, "identity_only_reason", v, f"{location}.escenario")
        v.require(escenario_id in graph["escenarios"], f"{location}.escenario.id", "escenario inexistente")
        if escenario_id in graph["escenarios"]:
            valid_views = graph["escenario_views"].get(escenario_id, set())
            has_reference = escenario_id in graph["escenario_has_reference"]
            valid_view = view in valid_views or (authority == "IDENTITY_ONLY" and has_reference and view == "base")
            v.require(valid_view, f"{location}.escenario.view", "vista inexistente/incompatible con autoridad")
            if authority != "IDENTITY_ONLY" and isinstance(shot, dict):
                v.require(escenario_id == shot.get("location_id"), f"{location}.escenario.id",
                          "GEOMETRY_LOCK debe apuntar al location_id del primer shot")
                v.require(view == shot.get("view_id"), f"{location}.escenario.view",
                          "GEOMETRY_LOCK debe apuntar al view_id del primer shot; es la referencia primaria del runtime")
                reference_camera = graph.get("escenario_view_cameras", {}).get((str(escenario_id), str(view)))
                v.require(isinstance(reference_camera, dict), f"{location}.escenario.view",
                          "GEOMETRY_LOCK requiere camera_signature en la vista")
                if isinstance(reference_camera, dict):
                    shot_camera = shot.get("camera", {}) if isinstance(shot.get("camera"), dict) else {}
                    v.require(camera_reference_matches(reference_camera, shot_camera),
                              f"{location}.escenario.geometry_authority",
                              "camera_signature de la vista no coincide: elevation/viewpoint exactos, "
                              "azimuth_deg <=20°, lens_mm <=15 mm y roll_deg <=10°")
        has_usable_reference = True
        if source_usage is not None:
            source_usage.setdefault("scenarios", []).append({
                "escenario_id": escenario_id, "view": view, "authority": authority,
                "location": f"{location}.escenario",
            })

    for key in ("ingredients", "assets", "scenes"):
        if key not in refs:
            continue
        values = list_value(refs.get(key), v, f"{location}.{key}")
        for index, raw_ref in enumerate(values):
            ref_location = f"{location}.{key}[{index}]"
            ref = raw_ref if isinstance(raw_ref, str) else dict_value(raw_ref, v, ref_location)
            if key == "ingredients":
                ref_id = ref if isinstance(ref, str) else ref.get("id", ref.get("ingredient_id"))
                v.require(ref_id in graph["ingredient_types"], ref_location, "ingrediente inexistente")
            elif key == "assets":
                ref_id = ref if isinstance(ref, str) else ref.get("id", ref.get("asset_id"))
                pose = "base" if isinstance(ref, str) else ref.get("pose", "base")
                v.require(ref_id in graph["characters"], ref_location, "asset_id inexistente en characters")
                if ref_id in graph["characters"]:
                    v.require(pose in graph["character_poses"].get(ref_id, set()),
                              f"{ref_location}.pose", "pose de asset inexistente")
                    if source_usage is not None and isinstance(pose, str):
                        source_usage.setdefault("characters", []).append({
                            "character_id": ref_id, "pose": pose, "location": ref_location,
                        })
            else:
                ref_id = ref if isinstance(ref, str) else ref.get("scene_id")
                v.require(ref_id in scene_ids and ref_id != scene_id, ref_location,
                          "scene_id inexistente o autorreferencia")
            has_usable_reference = True

    v.require(has_usable_reference, location,
              "panel sin referencias runtime; usa characters, escenario, ingredients, assets o scenes cuando aplique")


def markdown_section(text: str, heading: str) -> str | None:
    match = re.search(rf"^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s|\Z)", text,
                      re.MULTILINE | re.IGNORECASE)
    return match.group(1) if match else None


def fenced_payloads(section: str, language: str | None = None) -> list[str]:
    if language:
        pattern = rf"```{re.escape(language)}[^\n]*\n([\s\S]*?)\n```"
    else:
        pattern = r"```[^\n]*\n([\s\S]*?)\n```"
    return re.findall(pattern, section, re.IGNORECASE)


def monologue_payload(text: str) -> str | None:
    section = markdown_section(text, "MONOLOGO_LOCKED")
    if section is None:
        return None
    blocks = fenced_payloads(section, "text")
    return blocks[0] if blocks else None


def json_block(section: str, predicate: Any) -> Any:
    for payload in fenced_payloads(section, "json"):
        try:
            value = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if predicate(value):
            return value
    return None


def is_high_resolution_9_16(size: tuple[int, int] | None) -> bool:
    """Require a decodable high-resolution vertical 9:16 direct image."""
    if size is None:
        return False
    width, height = size
    return (
        isinstance(width, int) and not isinstance(width, bool)
        and isinstance(height, int) and not isinstance(height, bool)
        and min(width, height) >= 640
        and height > 0
        and abs(width / height - CANVAS[0] / CANVAS[1]) <= 0.04
    )


def validate_packet(path: Path) -> str:
    v = Validation()
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ValidationFailure(f"BLOCKED_INPUT no se pudo leer {path}: {exc}") from exc

    headings = ("META", "MACHINE_LOCK_V7", "MONOLOGO_LOCKED", "PREMISA_COMERCIAL", "CANON_NECESARIO",
                "STORY_BEATS", "visual_obligations", "CONTINUITY_LEDGER", "QA_SHOWRUNNER")
    sections: dict[str, str] = {}
    for heading in headings:
        section = markdown_section(text, heading)
        v.require(section is not None and bool(section.strip()), "packet", f"falta sección no vacía ## {heading}")
        sections[heading] = section or ""
    v.require(re.search(r'handoff_version:\s*["\']?7\.0["\']?', text) is not None,
              "packet.META.handoff_version", "debe ser 7.0")
    for key in ("packet_scope", "series_id", "part_number", "approved_voice_id", "language"):
        v.require(re.search(rf"(?m)^\s*{key}:\s*\S+", sections["META"]) is not None,
                  f"packet.META.{key}", "campo requerido")
    scope_match = re.search(r"(?m)^\s*packet_scope:\s*([A-Z_]+)\s*$", sections["META"])
    packet_scope = scope_match.group(1) if scope_match else ""
    v.require(packet_scope in {"PRODUCTION_PART", "PILOT_FRAGMENT", "VALIDATOR_FIXTURE"},
              "packet.META.packet_scope", "enum inválido")
    expected_packet_status = {
        "PRODUCTION_PART": "PACKET_READY_V7",
        "PILOT_FRAGMENT": "PILOT_PACKET_READY_V7",
        "VALIDATOR_FIXTURE": "FIXTURE_VALID_V7",
    }.get(packet_scope, "")
    v.require(bool(expected_packet_status) and re.search(rf"packet_status:\s*{expected_packet_status}\b", text) is not None,
              "packet.META.packet_status", f"debe ser {expected_packet_status or 'estado válido para scope'}")

    premise = sections["PREMISA_COMERCIAL"]
    v.require(re.search(r"(?m)^\s*narrative_dna:\s*$", premise) is not None,
              "packet.PREMISA_COMERCIAL.narrative_dna", "bloque requerido")
    narrative_dna_keys = (
        "logline", "contradiction", "desire", "wound_or_lie", "transformation_from", "transformation_to",
        "advantage_rule", "cost_or_constraint", "antagonist_agency", "serial_arena", "pleasure_primary",
        "pleasure_secondary", "voice_signature", "signature_symbol", "serial_question", "anti_clone_test",
        "primary_promise_id",
    )
    narrative_values: dict[str, str] = {}
    for key in narrative_dna_keys:
        match = re.search(rf"(?m)^\s+{key}:\s*(.+?)\s*$", premise)
        value = match.group(1).strip() if match else ""
        scalar = value.strip("\"'").strip()
        v.require(bool(scalar) and scalar.lower() not in {"null", "none", "~"},
                  f"packet.PREMISA_COMERCIAL.narrative_dna.{key}", "valor específico no vacío requerido")
        narrative_values[key] = scalar
    primary_promise_id = narrative_values.get("primary_promise_id", "")
    anti_clone_match = re.search(r"(?m)^\s+anti_clone_distinct_axes:\s*\[([^\]]+)\]\s*$", premise)
    anti_clone_axes = {
        item.strip().strip("\"'")
        for item in anti_clone_match.group(1).split(",")
        if item.strip()
    } if anti_clone_match else set()
    v.require(len(anti_clone_axes) >= 4, "packet.PREMISA_COMERCIAL.narrative_dna.anti_clone_distinct_axes",
              "requiere al menos cuatro ejes materiales únicos")

    machine = json_block(sections["MACHINE_LOCK_V7"], lambda value: isinstance(value, dict) and "voice_visual_lock" in value)
    v.require(isinstance(machine, dict), "packet.MACHINE_LOCK_V7", "requiere bloque JSON con voice_visual_lock")
    atoms_raw = machine.get("voice_visual_lock", []) if isinstance(machine, dict) else []
    atoms = list_value(atoms_raw, v, "packet.MACHINE_LOCK_V7.voice_visual_lock")
    v.require(bool(atoms), "packet.MACHINE_LOCK_V7.voice_visual_lock", "no puede estar vacío")
    atom_ids: list[str] = []
    atom_texts: list[str] = []
    for index, atom_raw in enumerate(atoms):
        loc = f"packet.MACHINE_LOCK_V7.voice_visual_lock[{index}]"
        atom = dict_value(atom_raw, v, loc)
        atom_id = require_text(atom, "atom_id", v, loc)
        atom_text = require_text(atom, "text_exact", v, loc)
        atom_ids.append(atom_id)
        atom_texts.append(atom_text)
        require_text(atom, "kind", v, loc)
        claims = list_value(atom.get("claims"), v, f"{loc}.claims")
        v.require(bool(claims), f"{loc}.claims", "cada átomo necesita al menos un claim")
        for claim_index, claim_raw in enumerate(claims):
            claim_loc = f"{loc}.claims[{claim_index}]"
            claim = dict_value(claim_raw, v, claim_loc)
            for key in ("actor_id", "action", "result"):
                require_text(claim, key, v, claim_loc)
            tokens = claim.get("required_visual_tokens")
            v.require(isinstance(tokens, list) and bool(tokens) and all(isinstance(item, str) and item for item in tokens),
                      f"{claim_loc}.required_visual_tokens", "lista no vacía requerida")
        must_show = atom.get("must_show")
        v.require(isinstance(must_show, list) and all(isinstance(item, str) and item for item in must_show),
                  f"{loc}.must_show", "lista requerida")
        policy = dict_value(atom.get("offscreen_policy"), v, f"{loc}.offscreen_policy")
        v.require(is_enum(policy.get("mode"), {"FORBIDDEN", "ALLOWED_FILMABLE"}), f"{loc}.offscreen_policy.mode", "modo inválido")
    v.require(len(set(atom_ids)) == len(atom_ids), "packet.MACHINE_LOCK_V7.voice_visual_lock", "atom_id duplicado")

    payload = monologue_payload(text)
    if payload is None:
        v.error("packet.MONOLOGO_LOCKED", "falta bloque ```text parser-ready")
    else:
        declared = re.search(r"monologue_sha256:\s*([0-9a-fA-F]{64})", text)
        if not declared:
            v.error("packet.MACHINE_LOCK_V7.monologue_sha256", "falta SHA-256 real")
        else:
            actual = canonical_hash(payload)
            v.require(declared.group(1).lower() == actual,
                      "packet.MACHINE_LOCK_V7.monologue_sha256",
                      f"hash no coincide; esperado por bytes canónicos {actual}")
        count = re.search(r"character_count:\s*(\d+)", text)
        canonical = unicodedata.normalize("NFC", payload.replace("\r\n", "\n").replace("\r", "\n"))
        if canonical.endswith("\n"):
            canonical = canonical[:-1]
        if count:
            v.require(int(count.group(1)) == len(canonical), "packet.MACHINE_LOCK_V7.character_count",
                      f"declarado {count.group(1)}, real {len(canonical)}")
        spoken_lines = [line.strip() for line in canonical.split("\n") if line.strip()]
        v.require(spoken_lines == atom_texts, "packet.MACHINE_LOCK_V7.voice_visual_lock",
                  "text_exact debe cubrir cada línea hablada, en orden y sin reescritura")

    beat_matches = re.findall(r"(?ms)^\s*-\s*beat_id:\s*([^\s]+)(.*?)(?=^\s*-\s*beat_id:|\Z)", sections["STORY_BEATS"])
    v.require(bool(beat_matches), "packet.STORY_BEATS", "requiere al menos un beat YAML")
    beat_ids: set[str] = set()
    covered_beat_atoms: set[str] = set()
    beat_functions: set[str] = set()
    pressure_levels: list[int] = []
    promise_ids_opened: set[str] = set()
    promise_ids_paid: set[str] = set()
    for beat_id, block in beat_matches:
        v.require(beat_id not in beat_ids, f"packet.STORY_BEATS.{beat_id}", "beat_id duplicado")
        beat_ids.add(beat_id)
        for key in (
            "function", "atom_ids", "question_opened", "answer_paid", "state_before", "state_after",
            "causal_bridge", "escalation_axis", "pressure_level", "value_shift", "promise_ids_opened",
            "promise_ids_paid", "dramatic_debts_opened", "dramatic_debts_paid",
        ):
            v.require(re.search(rf"(?m)^\s+{key}:\s*.+", block) is not None,
                      f"packet.STORY_BEATS.{beat_id}.{key}", "campo requerido")
        function_line = re.search(r"(?m)^\s+function:\s*(.+)$", block)
        if function_line:
            beat_functions.update(re.findall(r"\b(?:HOOK|DETONATOR|THREAT|DECISION|MANIFESTATION|PAYOFF|COST|CLIFFHANGER|BREATHE|EVIDENCE|OPPORTUNITY)\b", function_line.group(1)))
        pressure_match = re.search(r"(?m)^\s+pressure_level:\s*([0-4])\s*$", block)
        v.require(pressure_match is not None, f"packet.STORY_BEATS.{beat_id}.pressure_level", "entero 0..4 requerido")
        if pressure_match:
            pressure_levels.append(int(pressure_match.group(1)))
        for key, target in (("promise_ids_opened", promise_ids_opened), ("promise_ids_paid", promise_ids_paid)):
            list_match = re.search(rf"(?m)^\s+{key}:\s*\[([^\]]*)\]\s*$", block)
            v.require(list_match is not None, f"packet.STORY_BEATS.{beat_id}.{key}", "lista YAML inline requerida")
            if list_match:
                target.update(item.strip().strip("\"'") for item in list_match.group(1).split(",") if item.strip())
        atom_line = re.search(r"(?m)^\s+atom_ids:\s*\[([^\]]+)\]", block)
        if atom_line:
            ids = {item.strip().strip("\"'") for item in atom_line.group(1).split(",") if item.strip()}
            covered_beat_atoms.update(ids)
            v.require(ids.issubset(set(atom_ids)), f"packet.STORY_BEATS.{beat_id}.atom_ids", "contiene atom_id inexistente")
    v.require(set(atom_ids).issubset(covered_beat_atoms), "packet.STORY_BEATS.atom_ids", "no cubre todos los átomos")
    if packet_scope != "VALIDATOR_FIXTURE":
        required_functions = {"HOOK", "DETONATOR", "THREAT", "DECISION", "PAYOFF", "COST", "CLIFFHANGER", "BREATHE"}
        missing_functions = sorted(required_functions - beat_functions)
        v.require(not missing_functions, "packet.STORY_BEATS.function",
                  f"faltan funciones narrativas: {', '.join(missing_functions)}")
        v.require(primary_promise_id in promise_ids_opened, "packet.STORY_BEATS.promise_ids_opened",
                  "debe abrir primary_promise_id")
        v.require(primary_promise_id in promise_ids_paid, "packet.STORY_BEATS.promise_ids_paid",
                  "el payoff debe pagar primary_promise_id")
        ascent_count = sum(current > previous for previous, current in zip(pressure_levels, pressure_levels[1:]))
        v.require(ascent_count >= 3, "packet.STORY_BEATS.pressure_level", "requiere al menos tres ascensos")
        if pressure_levels:
            maximum = max(pressure_levels)
            v.require(pressure_levels.count(maximum) == 1, "packet.STORY_BEATS.pressure_level", "requiere pico máximo único")

    obligations = json_block(sections["visual_obligations"], lambda value: isinstance(value, list))
    v.require(isinstance(obligations, list) and bool(obligations), "packet.visual_obligations", "requiere array JSON no vacío")
    obligation_ids: set[str] = set()
    covered_obligation_atoms: set[str] = set()
    for index, raw in enumerate(obligations if isinstance(obligations, list) else []):
        loc = f"packet.visual_obligations[{index}]"
        item = dict_value(raw, v, loc)
        obligation_id = require_text(item, "obligation_id", v, loc)
        v.require(obligation_id not in obligation_ids, f"{loc}.obligation_id", "ID duplicado")
        obligation_ids.add(obligation_id)
        v.require(item.get("beat_id") in beat_ids, f"{loc}.beat_id", "beat_id inexistente")
        ids = item.get("atom_ids")
        v.require(isinstance(ids, list) and bool(ids) and all(atom in atom_ids for atom in ids),
                  f"{loc}.atom_ids", "lista no vacía de atom_id existentes requerida")
        if isinstance(ids, list):
            covered_obligation_atoms.update(atom for atom in ids if isinstance(atom, str))
        require_text(item, "required_relationship", v, loc)
        v.require(is_enum(item.get("information_priority"), {"ORIENT", "DISCOVER", "DECIDE", "ACT", "IMPACT", "REACT", "CONSEQUENCE", "BREATHE"}),
                  f"{loc}.information_priority", "enum inválido")
        v.require(is_enum(item.get("density"), {"LOW", "MEDIUM", "HIGH"}), f"{loc}.density", "density inválida")
        v.require(is_enum(item.get("rhythm_function"), {"ACTION", "REACTION", "DETAIL", "BREATHER", "REVEAL", "RELATION"}),
                  f"{loc}.rhythm_function", "función rítmica V7 inválida")
        v.require("must_be_own_source" not in item, f"{loc}.must_be_own_source",
                  "campo legado prohibido; usa must_be_own_generated_page")
        for key in ("must_be_own_generated_page", "may_share_page"):
            v.require(isinstance(item.get(key), bool), f"{loc}.{key}", "booleano requerido")
        if item.get("must_be_own_generated_page") is True:
            v.require(item.get("may_share_page") is False, f"{loc}.may_share_page",
                      "debe ser false cuando must_be_own_generated_page es true")
        v.require(isinstance(item.get("must_show"), list), f"{loc}.must_show", "lista requerida")
        v.require(isinstance(item.get("prohibited_substitution"), list) and bool(item.get("prohibited_substitution")),
                  f"{loc}.prohibited_substitution", "lista no vacía requerida")
    v.require(set(atom_ids).issubset(covered_obligation_atoms), "packet.visual_obligations.atom_ids", "no cubre todos los átomos")

    continuity_blocks = fenced_payloads(sections["CONTINUITY_LEDGER"])
    v.require(bool(continuity_blocks) and any(":" in block for block in continuity_blocks),
              "packet.CONTINUITY_LEDGER", "ledger parser-ready no vacío requerido")
    continuity = sections["CONTINUITY_LEDGER"]
    for key in ("narrative_state", "belief_state", "relationship_states", "knowledge_by_actor", "antagonist_knowledge",
                "accumulated_cost", "open_promises_and_debts"):
        v.require(re.search(rf"(?m)^\s*{key}:\s*.*$", continuity) is not None,
                  f"packet.CONTINUITY_LEDGER.{key}", "campo dramático requerido")
    qa = sections["QA_SHOWRUNNER"]
    for pattern, location in (
        (r"hash_algorithm:\s*UTF-8\s*\+\s*NFC\s*\+\s*LF\s*\+\s*no trailing LF", "hash_algorithm"),
        (r"causal_chain:\s*PASS", "causal_chain"),
    ):
        v.require(re.search(pattern, qa, re.IGNORECASE) is not None, f"packet.QA_SHOWRUNNER.{location}", "valor requerido")
    if packet_scope == "VALIDATOR_FIXTURE":
        v.require(re.search(r"narrative_gate:\s*NOT_APPLICABLE_VALIDATOR_FIXTURE", qa) is not None,
                  "packet.QA_SHOWRUNNER.narrative_gate", "fixture debe declararse no publicable")
    else:
        score_match = re.search(r"narrative_score_total:\s*(\d+)\s*/\s*16", qa)
        v.require(score_match is not None and int(score_match.group(1)) >= 13,
                  "packet.QA_SHOWRUNNER.narrative_score_total", "mínimo 13/16 requerido")
        axis_names = ("singularity", "voice", "human_arc", "hook", "causal_curve", "payoff", "cost_consequence", "serial_continuity")
        axis_scores: list[int] = []
        for axis in axis_names:
            axis_match = re.search(rf"(?m)^\s*narrative_axis_{axis}:\s*([0-2])\s*\|\s*(\S.+?)\s*$", qa)
            v.require(axis_match is not None, f"packet.QA_SHOWRUNNER.narrative_axis_{axis}",
                      "score 0..2 y evidencia localizada requeridos")
            if axis_match:
                axis_scores.append(int(axis_match.group(1)))
        v.require(len(axis_scores) == 8 and all(score > 0 for score in axis_scores),
                  "packet.QA_SHOWRUNNER.narrative_axes", "los ocho ejes deben existir y ninguno puede ser 0")
        if score_match and len(axis_scores) == 8:
            v.require(sum(axis_scores) == int(score_match.group(1)), "packet.QA_SHOWRUNNER.narrative_score_total",
                      f"total declarado {score_match.group(1)}, suma de ejes {sum(axis_scores)}")
        for pattern, location in (
            (r"narrative_zero_axes:\s*0", "narrative_zero_axes"),
            (r"payoff_promise_gate:\s*PASS", "payoff_promise_gate"),
            (r"cost_consequence_gate:\s*PASS", "cost_consequence_gate"),
            (r"narrative_gate:\s*PASS(?:_[A-Z_]+)?", "narrative_gate"),
        ):
            v.require(re.search(pattern, qa) is not None, f"packet.QA_SHOWRUNNER.{location}", "PASS requerido")
    v.require(re.search(rf"packet_status:\s*{expected_packet_status}\b", qa) is not None,
              "packet.QA_SHOWRUNNER.packet_status", f"debe ser {expected_packet_status}")
    result_status = "PACKET_READY_V7" if packet_scope == "PRODUCTION_PART" else expected_packet_status
    return v.finish(result_status, f"file={path.name}")


def thresholds_for(contract: dict[str, Any], mode: str, v: Validation) -> dict[str, Any]:
    result = dict(DEFAULT_THRESHOLDS)
    supplied = contract.get("thresholds", {})
    if not isinstance(supplied, dict):
        v.error("v7_contract.thresholds", "debe ser objeto")
        return result
    result.update(supplied)
    numeric = (
        "min_non_eye_level_pct", "min_non_frontal_pct", "max_identical_signature_run",
        "min_distinct_page_layouts",
        "max_generation_attempts", "min_camera_match_pct", "min_distinct_camera_signatures",
        "max_minor_failures_pilot", "max_minor_failure_pct_production",
    )
    for key in numeric:
        if not isinstance(result.get(key), (int, float)) or isinstance(result.get(key), bool):
            v.error(f"v7_contract.thresholds.{key}", "debe ser numérico")
            result[key] = DEFAULT_THRESHOLDS[key]
    if isinstance(result.get("min_distinct_page_layouts"), (int, float)):
        v.require(0 <= result["min_distinct_page_layouts"] <= 100,
                  "v7_contract.thresholds", "rango de páginas compuestas inválido")

    # El productor puede endurecer gates, nunca rebajarlos para fabricar un PASS.
    minimums = {
        "min_non_eye_level_pct": 20,
        "min_non_frontal_pct": 35,
        "min_distinct_page_layouts": 6,
        "min_camera_match_pct": 90,
        "min_distinct_camera_signatures": 6,
    }
    maximums = {
        "max_identical_signature_run": 2,
        "max_generation_attempts": 3,
        "max_minor_failures_pilot": 1,
        "max_minor_failure_pct_production": 2,
    }
    for key, floor in minimums.items():
        v.require(result[key] >= floor, f"v7_contract.thresholds.{key}", f"no puede rebajarse por debajo de {floor}")
    for key, ceiling in maximums.items():
        v.require(0 <= result[key] <= ceiling, f"v7_contract.thresholds.{key}", f"no puede superar el máximo HARD {ceiling}")
    return result


def signature(shot: dict[str, Any]) -> tuple[Any, ...]:
    values: list[Any] = []
    for key in ("scale", "elevation", "viewpoint", "azimuth_deg", "lens_mm", "roll_deg", "dominant_subject"):
        value = shot.get(key)
        values.append(value if isinstance(value, (str, int, float, bool, type(None))) else repr(value))
    return tuple(values)


def validate_references(refs_raw: Any, shot: dict[str, Any], continuity: dict[str, Any], v: Validation, location: str) -> None:
    refs = list_value(refs_raw, v, location)
    seen: set[str] = set()
    hashes: set[str] = set()
    for index, raw in enumerate(refs):
        loc = f"{location}[{index}]"
        ref = dict_value(raw, v, loc)
        ref_id = require_text(ref, "id", v, loc)
        v.require(ref_id not in seen, f"{loc}.id", "ID duplicado")
        seen.add(ref_id)
        v.require(is_enum(ref.get("role"), REF_ROLES), f"{loc}.role", f"enum inválido; usa {sorted(REF_ROLES)}")
        authority = ref.get("composition_authority")
        v.require(is_enum(authority, REF_AUTHORITIES), f"{loc}.composition_authority", f"enum inválido; usa {sorted(REF_AUTHORITIES)}")
        v.require(is_safe_relative(ref.get("source_path")), f"{loc}.source_path", "ruta relativa segura requerida")
        digest = clean_hash(ref.get("sha256"))
        v.require(digest is not None, f"{loc}.sha256", "SHA-256 real requerido")
        if digest:
            hashes.add(digest)
        views = ref.get("compatible_views")
        if authority != "IDENTITY_ONLY":
            v.require(isinstance(views, list) and bool(views) and all(is_enum(view, VIEWPOINTS) for view in views),
                      f"{loc}.compatible_views", "lista no vacía de viewpoints válidos requerida")
            if isinstance(views, list) and shot.get("viewpoint") not in views:
                v.error(f"{loc}.compatible_views", f"no incluye viewpoint pedido {shot.get('viewpoint')}")
        if ref.get("role") == "LOCATION" and is_enum(authority, {"GEOMETRY_LOCK", "FULL_LOCK"}):
            cam = validate_camera_signature(ref.get("camera_signature"), v, f"{loc}.camera_signature")
            v.require(camera_reference_matches(cam, shot), f"{loc}.camera_signature",
                      "LOCATION lock incompatible: elevation/viewpoint exactos, azimuth_deg <=20°, "
                      "lens_mm <=15 mm y roll_deg <=10°")
        if authority == "FULL_LOCK" and shot.get("change_mode") == "CONTRAST":
            v.error(f"{loc}.composition_authority", "FULL_LOCK está prohibido en CONTRAST")

    approved_raw = continuity.get("approved_reference_hashes", [])
    approved = list_value(approved_raw, v, f"{location.rsplit('.', 1)[0]}.continuity_lock.approved_reference_hashes")
    approved_hashes = {clean_hash(item) for item in approved}
    if None in approved_hashes:
        v.error(f"{location.rsplit('.', 1)[0]}.continuity_lock.approved_reference_hashes", "contiene hash inválido")
    v.require(hashes.issubset(approved_hashes),
              f"{location.rsplit('.', 1)[0]}.continuity_lock.approved_reference_hashes",
              "debe cubrir todos los hashes de references_v7")


def validate_continuity(raw: Any, v: Validation, location: str) -> dict[str, Any]:
    lock = dict_value(raw, v, location)
    require_text(lock, "moment_id", v, location)
    dict_value(lock.get("state_in"), v, f"{location}.state_in")
    dict_value(lock.get("state_out"), v, f"{location}.state_out")
    ids = lock.get("identity_ids")
    v.require(isinstance(ids, list) and all(isinstance(item, str) and item for item in ids),
              f"{location}.identity_ids", "lista de IDs requerida (puede estar vacía)")
    require_text(lock, "location_id", v, location)
    require_text(lock, "lighting_id", v, location)
    approved = lock.get("approved_reference_hashes")
    v.require(isinstance(approved, list) and all(clean_hash(item) is not None for item in approved),
              f"{location}.approved_reference_hashes", "lista de SHA-256 reales requerida")
    return lock


def validate_native_shot(
    raw: Any,
    expected_panel_id: str,
    graph: dict[str, Any],
    v: Validation,
    location: str,
) -> dict[str, Any]:
    shot = dict_value(raw, v, location)
    expected_keys = {
        "panel_id", "content_role", "visible_entities", "location_id", "view_id", "camera", "prompt_fragment",
    }
    v.require(set(shot) == expected_keys, location,
              f"campos exactos requeridos {sorted(expected_keys)}; recibidos {sorted(shot)}")
    v.require(shot.get("panel_id") == expected_panel_id, f"{location}.panel_id",
              f"debe ser {expected_panel_id!r} por reading order")
    require_text(shot, "content_role", v, location)
    fragment = require_text(shot, "prompt_fragment", v, location)
    visible = shot.get("visible_entities")
    known_entities = set(graph.get("characters", {})) | set(graph.get("ingredient_types", {}))
    valid_visible = (
        isinstance(visible, list)
        and len(visible) == len(set(visible))
        and all(isinstance(item, str) and item in known_entities for item in visible)
    )
    v.require(valid_visible, f"{location}.visible_entities",
              "lista única de IDs conocidos de characters/ingredients requerida; puede estar vacía en un breather")
    location_id = require_text(shot, "location_id", v, location)
    view_id = require_text(shot, "view_id", v, location)
    v.require(location_id in graph.get("escenarios", {}), f"{location}.location_id", "escenario inexistente")
    if location_id in graph.get("escenarios", {}):
        v.require(view_id in graph.get("escenario_views", {}).get(location_id, set()),
                  f"{location}.view_id", "view inexistente; no hay fallback implícito")
    camera_raw = shot.get("camera")
    camera = validate_camera_signature(camera_raw, v, f"{location}.camera")
    camera_keys = {
        "scale", "elevation", "viewpoint", "azimuth_deg", "lens_mm", "roll_deg",
        "dominant_subject", "occupancy_pct",
    }
    if isinstance(camera_raw, dict):
        v.require(set(camera_raw) == camera_keys, f"{location}.camera",
                  f"campos exactos requeridos {sorted(camera_keys)}")
    v.require(camera.get("scale") in SCALES, f"{location}.camera.scale",
              "ENVIRONMENT_WIDE es solo para assets; una toma de página usa escala V7 normal")
    if isinstance(fragment, str):
        validate_natural_camera_language(fragment, camera, v, f"{location}.prompt_fragment")
        if finite_number(camera.get("lens_mm")):
            lens_phrase = f"{prompt_number(camera['lens_mm'])}mm lens"
            v.require(lens_phrase.casefold() in fragment.casefold(), f"{location}.prompt_fragment",
                      f"debe expresar literalmente la lente natural {lens_phrase!r}")
    shot["camera"] = camera
    return shot


def validate_project(data: Any) -> tuple[Validation, dict[str, Any]]:
    """Contrato V7 Grok-native: una página completa y un JPG directo por escena panel."""
    v = Validation()
    root = dict_value(data, v, "root")
    contract = dict_value(root.get("v7_contract"), v, "v7_contract")
    v.require(contract.get("version") == VERSION, "v7_contract.version", "debe ser 7.0")
    v.require(contract.get("generation_mode") == "GROK_NATIVE_PAGE", "v7_contract.generation_mode",
              "debe ser GROK_NATIVE_PAGE")
    mode = contract.get("mode")
    v.require(is_enum(mode, {"PILOT", "PRODUCTION"}), "v7_contract.mode", "usa PILOT o PRODUCTION")
    mode = mode if is_enum(mode, {"PILOT", "PRODUCTION"}) else "PILOT"
    timeline_model = contract.get("timeline_model")
    if mode == "PRODUCTION":
        v.require(timeline_model == NARRATION_VISUAL_MODEL, "v7_contract.timeline_model",
                  f"PRODUCTION exige {NARRATION_VISUAL_MODEL}; narraciÃ³n y pÃ¡ginas visuales son pistas separadas")
    decoupled_timeline = timeline_model == NARRATION_VISUAL_MODEL
    canvas = dict_value(contract.get("canvas"), v, "v7_contract.canvas")
    v.require(canvas.get("width") == 720 and canvas.get("height") == 1280,
              "v7_contract.canvas", "debe ser exactamente 720x1280")
    thresholds = thresholds_for(contract, mode, v)
    adapter = dict_value(contract.get("runtime_adapter"), v, "v7_contract.runtime_adapter")
    v.require(adapter.get("grok_native_full_page") is True,
              "v7_contract.runtime_adapter.grok_native_full_page", "debe ser true")
    v.require(adapter.get("page_blueprint_slots_integrated") is False,
              "v7_contract.runtime_adapter.page_blueprint_slots_integrated", "debe ser false")

    production_lock = dict_value(root.get("production_lock"), v, "production_lock")
    v.require(production_lock.get("v7_version") == VERSION, "production_lock.v7_version", "debe ser 7.0")
    v.require(is_safe_relative(production_lock.get("story_packet_path")),
              "production_lock.story_packet_path", "ruta relativa segura al packet requerida")
    v.require(clean_hash(production_lock.get("story_packet_sha256")) is not None,
              "production_lock.story_packet_sha256", "SHA-256 real requerido")
    v.require(clean_hash(production_lock.get("monologue_sha256")) is not None,
              "production_lock.monologue_sha256", "SHA-256 real requerido")
    require_text(production_lock, "approved_voice_id", v, "production_lock")

    pipeline = dict_value(root.get("pipeline"), v, "pipeline")
    for key in ("image_generation", "animation", "tts", "editing"):
        stage = dict_value(pipeline.get(key), v, f"pipeline.{key}")
        require_text(stage, "tool", v, f"pipeline.{key}")
    image_tool = pipeline.get("image_generation", {}).get("tool") if isinstance(pipeline.get("image_generation"), dict) else None
    animation_tool = pipeline.get("animation", {}).get("tool") if isinstance(pipeline.get("animation"), dict) else None
    v.require(image_tool == "grok", "pipeline.image_generation.tool",
              'V7 usa exactamente "grok" en minÃºsculas; Flow no estÃ¡ autorizado')
    v.require(animation_tool == "none", "pipeline.animation.tool",
              'V7 genera pÃ¡ginas estÃ¡ticas con Grok y exige exactamente "none"')
    editing = dict_value(root.get("editing"), v, "editing")
    dict_value(editing.get("caption_style"), v, "editing.caption_style")
    dict_value(editing.get("panel_motion"), v, "editing.panel_motion")

    tts_export = dict_value(root.get("tts_export"), v, "tts_export")
    require_text(tts_export, "language", v, "tts_export")
    v.require(tts_export.get("mode") == "dialogue", "tts_export.mode", "debe ser dialogue")
    require_text(tts_export, "model_id", v, "tts_export")
    for speed_key in ("elevenlabs_speed", "edit_speed"):
        speed = tts_export.get(speed_key)
        v.require(finite_number(speed) and float(speed) > 0, f"tts_export.{speed_key}", "número positivo requerido")
    v.require("voice_id" not in tts_export, "tts_export.voice_id",
              "usa tts_export.voices.narrador o pipeline.tts.voice_id")
    voices = dict_value(tts_export.get("voices"), v, "tts_export.voices")
    v.require(bool(voices), "tts_export.voices", "objeto no vacío requerido")
    dialogue_raw = tts_export.get("dialogue")
    v.require(isinstance(dialogue_raw, list), "tts_export.dialogue", "array requerido")
    pipeline_tts = pipeline.get("tts") if isinstance(pipeline.get("tts"), dict) else {}
    narrator_voice = voices.get("narrador")
    pipeline_voice = pipeline_tts.get("voice_id")
    v.require(
        (isinstance(narrator_voice, str) and bool(narrator_voice.strip()))
        or (isinstance(pipeline_voice, str) and bool(pipeline_voice.strip())),
        "tts_export.voices.narrador", "voz requerida aquí o en pipeline.tts.voice_id",
    )
    v.require("full_script" not in root, "full_script", "usa tts_export.full_script")
    full_script = tts_export.get("full_script")
    v.require(isinstance(full_script, str) and bool(full_script.strip()),
              "tts_export.full_script", "texto contractual requerido")
    if isinstance(full_script, str):
        expected_monologue = canonical_hash(full_script)
        v.require(clean_hash(production_lock.get("monologue_sha256")) == expected_monologue,
                  "production_lock.monologue_sha256", f"no coincide con tts_export.full_script; esperado {expected_monologue}")

    narration_units: list[dict[str, str]] = []
    narration_ids: set[str] = set()
    if decoupled_timeline:
        narration_track = dict_value(root.get("narration_track"), v, "narration_track")
        expected_track_keys = {"version", "canonicalization", "join", "unit_count", "units"}
        v.require(set(narration_track) == expected_track_keys, "narration_track",
                  f"campos exactos requeridos {sorted(expected_track_keys)}")
        v.require(narration_track.get("version") == "1.0", "narration_track.version", "debe ser 1.0")
        v.require(narration_track.get("canonicalization") == NARRATION_CANONICALIZATION,
                  "narration_track.canonicalization", f"debe ser {NARRATION_CANONICALIZATION}")
        v.require(narration_track.get("join") == "LF", "narration_track.join", "debe ser LF")
        units_raw = list_value(narration_track.get("units"), v, "narration_track.units")
        v.require(narration_track.get("unit_count") == len(units_raw), "narration_track.unit_count",
                  f"debe coincidir con units ({len(units_raw)})")
        for unit_index, unit_raw in enumerate(units_raw):
            uloc = f"narration_track.units[{unit_index}]"
            unit = dict_value(unit_raw, v, uloc)
            v.require(set(unit) == {"id", "speaker", "text"}, uloc,
                      "campos exactos requeridos: id, speaker, text")
            unit_id = require_text(unit, "id", v, uloc)
            speaker = require_text(unit, "speaker", v, uloc)
            text_value = require_text(unit, "text", v, uloc)
            v.require(SCENE_ID_RE.fullmatch(unit_id) is not None, f"{uloc}.id", "ID seguro requerido")
            v.require(unit_id not in narration_ids, f"{uloc}.id", "ID duplicado")
            v.require("\n" not in text_value and "\r" not in text_value, f"{uloc}.text",
                      "cada unidad representa exactamente una lÃ­nea y no puede contener CR/LF")
            narration_ids.add(unit_id)
            narration_units.append({"id": unit_id, "speaker": speaker, "text": text_value})
        reconstructed = "\n".join(unit["text"] for unit in narration_units)
        if isinstance(full_script, str):
            v.require(full_script == reconstructed, "tts_export.full_script",
                      "debe ser el join LF byte-exacto de narration_track.units[].text")

    runtime_graph = validate_runtime_asset_graph(root, v)
    project = dict_value(root.get("project"), v, "project")
    for key in ("title", "serie", "language"):
        require_text(project, key, v, "project")
    v.require(project.get("preset") == "manhwa", "project.preset", "debe ser manhwa")
    slug = project.get("slug")
    v.require(isinstance(slug, str) and SAFE_SLUG.fullmatch(slug) is not None,
              "project.slug", "slug seguro requerido")
    v.require(project.get("aspect_ratio") == "9:16", "project.aspect_ratio", "debe ser 9:16")
    v.require(project.get("fps") == 30, "project.fps", "debe ser 30")
    v.require(isinstance(project.get("part"), int) and not isinstance(project.get("part"), bool)
              and project.get("part", 0) >= 1, "project.part", "entero >=1 requerido")
    target_runtime = project.get("target_runtime_seconds")
    if mode == "PILOT" and finite_number(target_runtime):
        v.require(float(target_runtime) < 60, "v7_contract.mode",
                  f"PILOT contradice project.target_runtime_seconds={target_runtime}; "
                  "una entrega de 60 s o más debe usar PRODUCTION con 30-55 escenas panel")

    scenes = list_value(root.get("scenes"), v, "scenes")
    declared_scene_ids = {
        scene.get("id") for scene in scenes
        if isinstance(scene, dict) and isinstance(scene.get("id"), str)
    }
    scene_ids: set[str] = set()
    panel_scenes: list[dict[str, Any]] = []
    source_records: list[dict[str, Any]] = []
    camera_records: list[dict[str, Any]] = []
    page_families: list[str] = []
    layouts: list[str] = []
    narration_pages: dict[str, list[str]] = {unit_id: [] for unit_id in narration_ids}
    source_usage: dict[str, list[dict[str, Any]]] = {"characters": [], "scenarios": []}
    prior_continuity: dict[str, Any] | None = None

    for scene_index, scene_raw in enumerate(scenes):
        sloc = f"scenes[{scene_index}]"
        scene = dict_value(scene_raw, v, sloc)
        scene_id = require_text(scene, "id", v, sloc)
        v.require(SCENE_ID_RE.fullmatch(scene_id) is not None, f"{sloc}.id", "ID seguro requerido")
        v.require(scene_id not in scene_ids, f"{sloc}.id", "ID duplicado")
        scene_ids.add(scene_id)
        scene_type = scene.get("type")
        v.require(is_enum(scene_type, {"panel", "narrative_card"}), f"{sloc}.type", "usa panel o narrative_card")
        if scene_type == "narrative_card":
            for prohibited in ("visual", "visual_plan", "continuity", "render_mode"):
                v.require(prohibited not in scene, sloc, f"narrative_card no puede llevar {prohibited}")
            card = dict_value(scene.get("card"), v, f"{sloc}.card")
            v.require(card.get("mode") == "editor", f"{sloc}.card.mode", "debe ser editor")
            words = str(card.get("text", "")).split()
            v.require(2 <= len(words) <= 7, f"{sloc}.card.text", "card debe contener 2-7 palabras")
            voiceover = dict_value(scene.get("voiceover"), v, f"{sloc}.voiceover")
            captions = dict_value(scene.get("captions"), v, f"{sloc}.captions")
            voice_text = require_text(voiceover, "text", v, f"{sloc}.voiceover")
            require_text(voiceover, "speaker", v, f"{sloc}.voiceover")
            v.require(captions.get("text") == voice_text, f"{sloc}.captions.text", "debe coincidir con voiceover.text")
            require_text(scene, "transition_in", v, sloc)
            continue
        if scene_type != "panel":
            continue

        panel_scenes.append(scene)
        v.require(scene.get("render_mode") == "static", f"{sloc}.render_mode", "debe ser static")
        v.require(not scene.get("animation_prompt"), f"{sloc}.animation_prompt", "V7 no genera animación")
        refs = scene.get("references")

        if decoupled_timeline:
            v.require("voiceover" not in scene and "captions" not in scene, sloc,
                      "NARRATION_VISUAL_TRACKS_V1 mantiene audio/captions en narration_track; la pÃ¡gina visual no los duplica")
            narration_ref = dict_value(scene.get("narration_ref"), v, f"{sloc}.narration_ref")
            v.require(set(narration_ref) == {"unit_id", "timing_weight"}, f"{sloc}.narration_ref",
                      "campos exactos requeridos: unit_id, timing_weight")
            unit_id = require_text(narration_ref, "unit_id", v, f"{sloc}.narration_ref")
            timing_weight = narration_ref.get("timing_weight")
            v.require(unit_id in narration_ids, f"{sloc}.narration_ref.unit_id",
                      "debe apuntar a narration_track.units[].id")
            v.require(finite_number(timing_weight) and float(timing_weight) > 0,
                      f"{sloc}.narration_ref.timing_weight", "nÃºmero positivo requerido")
            if unit_id in narration_pages:
                narration_pages[unit_id].append(scene_id)
        else:
            # Compatibilidad de pilotos V7 anteriores. ProducciÃ³n usa siempre
            # narration_track + narration_ref para desacoplar audio y pÃ¡ginas.
            has_spoken_contract = "voiceover" in scene or "captions" in scene
            if has_spoken_contract:
                voiceover = dict_value(scene.get("voiceover"), v, f"{sloc}.voiceover")
                captions = dict_value(scene.get("captions"), v, f"{sloc}.captions")
                voice_text = require_text(voiceover, "text", v, f"{sloc}.voiceover")
                require_text(voiceover, "speaker", v, f"{sloc}.voiceover")
                v.require(captions.get("text") == voice_text, f"{sloc}.captions.text", "debe coincidir con voiceover.text")
        require_text(scene, "transition_in", v, sloc)

        visual = dict_value(scene.get("visual"), v, f"{sloc}.visual")
        v.require(set(visual) == {"image_prompt"}, f"{sloc}.visual",
                  "runtime V2.8 exige visual exclusivamente con image_prompt")
        image_prompt = require_text(visual, "image_prompt", v, f"{sloc}.visual")

        visual_plan = dict_value(scene.get("visual_plan"), v, f"{sloc}.visual_plan")
        v.require(set(visual_plan) == {"native_page", "shots"}, f"{sloc}.visual_plan",
                  "solo native_page y shots son metadata audit-only")
        native_page = dict_value(visual_plan.get("native_page"), v, f"{sloc}.visual_plan.native_page")
        native_keys = {"family", "layout", "background_pct", "panel_count", "composition"}
        v.require(set(native_page) == native_keys, f"{sloc}.visual_plan.native_page",
                  f"campos exactos requeridos {sorted(native_keys)}")
        family = native_page.get("family")
        layout = native_page.get("layout")
        v.require(family in PAGE_FAMILIES, f"{sloc}.visual_plan.native_page.family", "familia inválida")
        v.require(layout in LAYOUT_FAMILY, f"{sloc}.visual_plan.native_page.layout", "layout Grok-native inválido")
        if isinstance(layout, str):
            v.require(LAYOUT_FAMILY.get(layout) == family, f"{sloc}.visual_plan.native_page.layout",
                      f"{layout} pertenece a {LAYOUT_FAMILY.get(layout)}")
        panel_count = native_page.get("panel_count")
        v.require(isinstance(panel_count, int) and not isinstance(panel_count, bool),
                  f"{sloc}.visual_plan.native_page.panel_count", "entero requerido")
        if isinstance(layout, str):
            v.require(panel_count == LAYOUT_PANEL_COUNT.get(layout), f"{sloc}.visual_plan.native_page.panel_count",
                      f"{layout} exige {LAYOUT_PANEL_COUNT.get(layout)}")
        background_pct = native_page.get("background_pct")
        v.require(finite_number(background_pct), f"{sloc}.visual_plan.native_page.background_pct", "número requerido")
        if finite_number(background_pct):
            if family == "WHITE_PAGE":
                v.require(30 <= float(background_pct) <= 90, f"{sloc}.visual_plan.native_page.background_pct",
                          "WHITE_PAGE usa 30..90")
            elif family == "BLACK_PAGE":
                v.require(45 <= float(background_pct) <= 75, f"{sloc}.visual_plan.native_page.background_pct",
                          "BLACK_PAGE usa 45..75")
            elif family == "OTHER":
                v.require(float(background_pct) == 0, f"{sloc}.visual_plan.native_page.background_pct",
                          "OTHER usa exactamente 0")
        composition = require_text(native_page, "composition", v, f"{sloc}.visual_plan.native_page")
        if isinstance(panel_count, int):
            count_phrase = panel_count_phrase(panel_count)
            v.require(count_phrase.casefold() in composition.casefold(),
                      f"{sloc}.visual_plan.native_page.composition",
                      f"debe declarar literalmente {count_phrase!r}")

        static_motion = {"enabled": False, "preset": "static", "zoom": 1, "pan": 0}
        motion = scene.get("editor_motion")
        if family in {"WHITE_PAGE", "BLACK_PAGE"}:
            v.require(motion == static_motion, f"{sloc}.editor_motion",
                      "WHITE/BLACK ya vienen compuestas por Grok y exigen motion static para no recortar márgenes/paneles")
        elif motion != static_motion:
            safe_motion = (
                isinstance(motion, dict) and motion.get("enabled") is True
                and motion.get("preset") in {"slow_zoom", "slow_pan"}
                and finite_number(motion.get("zoom")) and 1 <= float(motion["zoom"]) <= 1.08
                and finite_number(motion.get("pan")) and 0 <= float(motion["pan"]) <= 0.03
            )
            v.require(safe_motion, f"{sloc}.editor_motion", "motion OTHER inseguro; máximo zoom 1.08/pan 0.03")

        shots_raw = list_value(visual_plan.get("shots"), v, f"{sloc}.visual_plan.shots")
        v.require(isinstance(panel_count, int) and len(shots_raw) == panel_count,
                  f"{sloc}.visual_plan.shots", "length debe coincidir con panel_count")
        shots: list[dict[str, Any]] = []
        for shot_index, shot_raw in enumerate(shots_raw):
            panel_id = chr(ord("A") + shot_index)
            shot = validate_native_shot(shot_raw, panel_id, runtime_graph, v,
                                        f"{sloc}.visual_plan.shots[{shot_index}]")
            shots.append(shot)
            camera_records.append({
                "scene_id": scene_id,
                "panel_id": panel_id,
                "camera": shot.get("camera", {}),
                "visible_entities": shot.get("visible_entities", []),
            })
            authority = "GEOMETRY_LOCK"
            runtime_scenario = refs.get("escenario") if isinstance(refs, dict) else None
            if isinstance(runtime_scenario, dict):
                authority = runtime_scenario.get("geometry_authority", "GEOMETRY_LOCK")
            source_usage["scenarios"].append({
                "escenario_id": shot.get("location_id"), "view": shot.get("view_id"),
                "authority": authority, "location": f"{sloc}.visual_plan.shots[{shot_index}]",
            })
        temp_usage: dict[str, list[dict[str, Any]]] = {"characters": [], "scenarios": []}
        validate_runtime_scene_references(
            refs, runtime_graph, declared_scene_ids, scene_id, v, f"{sloc}.references",
            shot=shots[0] if shots else None, source_usage=temp_usage,
        )
        source_usage["characters"].extend(temp_usage["characters"])
        if isinstance(panel_count, int) and panel_count > 1 and len(shots) > 1:
            materially_distinct = any(
                material_camera_change_count(left.get("camera", {}), right.get("camera", {})) >= 2
                for left_index, left in enumerate(shots)
                for right in shots[left_index + 1:]
            )
            v.require(materially_distinct, f"{sloc}.visual_plan.shots",
                      "página multipanel exige al menos dos cámaras materialmente distintas")
        validate_prompt_contract(image_prompt, native_page, shots, refs, runtime_graph, v,
                                 f"{sloc}.visual.image_prompt")

        continuity = validate_continuity(scene.get("continuity"), v, f"{sloc}.continuity")
        if prior_continuity is not None:
            previous_out = prior_continuity.get("state_out", {})
            current_in = continuity.get("state_in", {})
            if isinstance(previous_out, dict) and isinstance(current_in, dict):
                v.require(current_in == previous_out, f"{sloc}.continuity.state_in",
                          "debe copiar exactamente state_out de la escena panel anterior")
            for key in ("location_id", "lighting_id"):
                if continuity.get(key) != prior_continuity.get(key):
                    v.require(isinstance(continuity.get("continuity_change_reason"), str)
                              and bool(continuity.get("continuity_change_reason", "").strip()),
                              f"{sloc}.continuity.{key}", "cambio exige continuity_change_reason")
        prior_continuity = continuity

        primary_camera = shots[0].get("camera", {}) if shots else {}
        references_v7 = scene.get("references_v7", [])
        v.require(isinstance(references_v7, list), f"{sloc}.references_v7", "lista audit-only requerida si se declara")
        validate_references(references_v7, primary_camera, continuity, v, f"{sloc}.references_v7")
        source_records.append({
            "scene_id": scene_id,
            "source": f"images/{scene_id}.jpg",
            "prompt": image_prompt,
            "shot": {**primary_camera, "shot_id": scene_id},
            "shots": shots,
            "continuity": continuity,
        })
        if isinstance(family, str):
            page_families.append(family)
        if isinstance(layout, str):
            layouts.append(layout)

    panel_count_total = len(panel_scenes)
    scripted_voice_lines = ([unit["text"] for unit in narration_units] if decoupled_timeline else [
        scene["voiceover"]["text"] for scene in scenes
        if isinstance(scene, dict)
        and scene.get("type") in {"panel", "narrative_card"}
        and isinstance(scene.get("voiceover"), dict)
        and isinstance(scene["voiceover"].get("text"), str)
        and bool(scene["voiceover"]["text"].strip())
    ])
    if isinstance(full_script, str):
        v.require(full_script == "\n".join(scripted_voice_lines), "tts_export.full_script",
                  "debe ser join LF exacto de todos los voiceover.text en orden")
    if decoupled_timeline:
        for unit_id, owned_pages in narration_pages.items():
            v.require(bool(owned_pages), f"narration_track.units[{unit_id}]",
                      "cada unidad narrada debe poseer al menos una pÃ¡gina visual")
        expected_dialogue = [
            {"scene_id": narration_pages[unit["id"]][0] if narration_pages.get(unit["id"]) else "",
             "speaker": unit["speaker"], "text": unit["text"]}
            for unit in narration_units
        ]
    else:
        expected_dialogue = [
            {"scene_id": scene.get("id"), "speaker": scene.get("voiceover", {}).get("speaker"),
             "text": scene.get("voiceover", {}).get("text")}
            for scene in scenes
            if isinstance(scene, dict)
            and isinstance(scene.get("voiceover"), dict)
            and isinstance(scene["voiceover"].get("text"), str)
            and bool(scene["voiceover"]["text"].strip())
        ]
    v.require(tts_export.get("dialogue") == expected_dialogue, "tts_export.dialogue",
              "debe copiar exactamente scene_id/speaker/text de todas las escenas con voiceover")
    if mode == "PILOT":
        expected = contract.get("pilot_panel_count", 10)
        v.require(isinstance(expected, int) and panel_count_total == expected, "scenes",
                  f"PILOT requiere {expected} escenas panel; hay {panel_count_total}")
    else:
        v.require(30 <= panel_count_total <= 55, "scenes",
                  f"PRODUCTION requiere 30-55 escenas panel; hay {panel_count_total}")
        declared_production_count = contract.get("production_panel_count")
        v.require(isinstance(declared_production_count, int) and not isinstance(declared_production_count, bool)
                  and 30 <= declared_production_count <= 55,
                  "v7_contract.production_panel_count", "entero 30..55 requerido en PRODUCTION")
        if isinstance(declared_production_count, int) and not isinstance(declared_production_count, bool):
            v.require(panel_count_total == declared_production_count, "scenes",
                      f"debe contener exactamente production_panel_count={declared_production_count}; hay {panel_count_total}")

    if panel_count_total:
        page_mix = dict_value(contract.get("page_mix"), v, "v7_contract.page_mix")
        v.require(page_mix.get("method") == "LARGEST_REMAINDER", "v7_contract.page_mix.method",
                  "debe ser LARGEST_REMAINDER")
        v.require(page_mix.get("basis") == "TYPE_PANEL_ONLY", "v7_contract.page_mix.basis",
                  "debe ser TYPE_PANEL_ONLY")
        ratios = dict_value(page_mix.get("ratios"), v, "v7_contract.page_mix.ratios")
        v.require(ratios == {"white": 30, "black": 30, "other": 40}, "v7_contract.page_mix.ratios",
                  "mezcla exacta 30/30/40 requerida")
        expected_counts = largest_remainder_counts(panel_count_total)
        counts = dict_value(page_mix.get("counts"), v, "v7_contract.page_mix.counts")
        v.require(counts == expected_counts, "v7_contract.page_mix.counts",
                  f"debe ser {expected_counts} para {panel_count_total} escenas")
        actual_counts = {
            "white": page_families.count("WHITE_PAGE"),
            "black": page_families.count("BLACK_PAGE"),
            "other": page_families.count("OTHER"),
        }
        v.require(actual_counts == expected_counts, "scenes.page_mix",
                  f"familias reales {actual_counts}; esperadas {expected_counts}")
        for index in range(2, len(page_families)):
            v.require(len(set(page_families[index - 2:index + 1])) > 1,
                      f"scenes[{index}].visual_plan.native_page.family", "máximo dos familias iguales seguidas")
        for index in range(1, len(layouts)):
            v.require(layouts[index] != layouts[index - 1],
                      f"scenes[{index}].visual_plan.native_page.layout", "layout idéntico no puede ser adyacente")
        minimum_layouts = min(panel_count_total, max(6, int(thresholds["min_distinct_page_layouts"])))
        v.require(len(set(layouts)) >= minimum_layouts, "scenes.layout_diversity",
                  f"solo {len(set(layouts))} layouts; requiere {minimum_layouts}")
        multipanel = sum(LAYOUT_PANEL_COUNT.get(layout, 1) in {2, 3} for layout in layouts)
        multipanel_pct = multipanel * 100 / panel_count_total
        v.require(20 - 1e-9 <= multipanel_pct <= 40 + 1e-9, "scenes.multipanel_pct",
                  f"{multipanel}/{panel_count_total}={multipanel_pct:.1f}% fuera de 20..40%")
        triptychs = sum(LAYOUT_PANEL_COUNT.get(layout) == 3 for layout in layouts)
        v.require(triptychs <= math.floor(0.10 * panel_count_total + 1e-9), "scenes.triptychs",
                  f"{triptychs} triptychs exceden floor(0.10×{panel_count_total})")

    scenario_usage = source_usage["scenarios"]
    identity_only_count = sum(item.get("authority") == "IDENTITY_ONLY" for item in scenario_usage)
    if scenario_usage:
        identity_pct = identity_only_count * 100 / len(scenario_usage)
        v.require(identity_pct <= 10 + 1e-9, "references.scenario.IDENTITY_ONLY",
                  f"{identity_pct:.1f}% excede 10%")
    for escenario_id, declared_views in runtime_graph.get("escenario_views", {}).items():
        role = runtime_graph.get("escenario_spatial_roles", {}).get(escenario_id)
        geometry_refs = [item for item in scenario_usage
                         if item.get("escenario_id") == escenario_id and item.get("authority") == "GEOMETRY_LOCK"]
        used_views = {item.get("view") for item in geometry_refs if isinstance(item.get("view"), str)}
        if role == "PRIMARY":
            minimum = min(6, len(declared_views))
        elif role == "SECONDARY":
            minimum = min(3, len(declared_views))
        else:
            minimum = min(1, len(declared_views))
        v.require(len(used_views) >= minimum, f"escenarios.{escenario_id}.used_views",
                  f"solo {len(used_views)} views usadas; requiere {minimum}")
        if role == "PRIMARY" and len(geometry_refs) >= 6:
            counts_by_view: dict[Any, int] = defaultdict(int)
            run_view: Any = None
            run_length = 0
            for item in geometry_refs:
                view = item.get("view")
                counts_by_view[view] += 1
                run_length = run_length + 1 if view == run_view else 1
                run_view = view
                v.require(run_length <= 2, item.get("location", f"escenarios.{escenario_id}"),
                          "PRIMARY no permite la misma view >2 tomas consecutivas")
            for view, count in counts_by_view.items():
                pct = count * 100 / len(geometry_refs)
                v.require(pct <= 35 + 1e-9, f"escenarios.{escenario_id}.views.{view}.usage",
                          f"{pct:.1f}% excede 35%")

    character_usage = source_usage["characters"]
    for character_id in runtime_graph.get("characters", {}):
        refs_for_character = [item for item in character_usage if item.get("character_id") == character_id]
        if not refs_for_character:
            continue
        required_poses = min(6, len(refs_for_character), math.ceil(math.sqrt(len(refs_for_character))))
        distinct_poses = {item.get("pose") for item in refs_for_character}
        v.require(len(distinct_poses) >= required_poses, f"characters.{character_id}.used_poses",
                  f"solo {len(distinct_poses)} poses; requiere {required_poses}")
        run_pose: Any = None
        run_length = 0
        for item in refs_for_character:
            pose = item.get("pose")
            run_length = run_length + 1 if pose == run_pose else 1
            run_pose = pose
            v.require(run_length <= 3, item.get("location", f"characters.{character_id}"),
                      "misma pose no puede superar 3 escenas consecutivas")

    cameras = [record["camera"] for record in camera_records if isinstance(record.get("camera"), dict)]
    if cameras:
        material_transitions = sum(
            material_camera_change_count(left, right) >= 2 for left, right in zip(cameras, cameras[1:])
        )
        if len(cameras) > 1:
            material_pct = material_transitions * 100 / (len(cameras) - 1)
            v.require(material_pct >= 60 - 1e-9, "camera_transitions.material_contrast",
                      f"{material_pct:.1f}% de cambios materiales <60%")
        signature_run = 0
        previous_signature: tuple[Any, ...] | None = None
        for index, camera in enumerate(cameras):
            current_signature = signature(camera)
            signature_run = signature_run + 1 if current_signature == previous_signature else 1
            previous_signature = current_signature
            v.require(signature_run <= thresholds["max_identical_signature_run"],
                      f"camera_records[{index}]", "firma exacta repetida demasiadas veces")
        human_cameras = [record["camera"] for record in camera_records
                         if any(entity in runtime_graph.get("characters", {})
                                for entity in record.get("visible_entities", []))]
        if human_cameras:
            non_eye = sum(camera.get("elevation") != "EYE_LEVEL" for camera in human_cameras) * 100 / len(human_cameras)
            non_frontal = sum(camera.get("viewpoint") not in {"FRONT", "THREE_QUARTER_FRONT"}
                              for camera in human_cameras) * 100 / len(human_cameras)
            v.require(non_eye >= thresholds["min_non_eye_level_pct"], "camera_quota.non_eye_level",
                      f"{non_eye:.1f}% < {thresholds['min_non_eye_level_pct']}%")
            v.require(non_frontal >= thresholds["min_non_frontal_pct"], "camera_quota.non_frontal",
                      f"{non_frontal:.1f}% < {thresholds['min_non_frontal_pct']}%")
        else:
            v.error("camera_quota", "no hay tomas con personaje conocido visible")
        families = {
            "high": any(camera.get("elevation") in {"HIGH", "BIRDS_EYE", "TOP_DOWN"} for camera in cameras),
            "low": any(camera.get("elevation") in {"LOW", "WORMS_EYE", "GROUND_LEVEL"} for camera in cameras),
            "relation": any(camera.get("viewpoint") in {"OTS", "POV"} for camera in cameras),
            "profile_rear": any(camera.get("viewpoint") in {"PROFILE", "REAR", "REAR_THREE_QUARTER"}
                                for camera in cameras),
        }
        for family_name, present in families.items():
            v.require(present, f"camera_families.{family_name}", "familia obligatoria ausente")
        distinct = len({signature(camera) for camera in cameras})
        v.require(distinct >= thresholds["min_distinct_camera_signatures"], "camera_signatures",
                  f"solo {distinct} firmas distintas; requiere {thresholds['min_distinct_camera_signatures']}")

    context = {
        "root": root, "contract": contract, "mode": mode, "thresholds": thresholds,
        "project": project, "scenes": scenes, "panel_scenes": panel_scenes,
        "sources": source_records, "camera_records": camera_records,
        "decoupled_timeline": decoupled_timeline, "narration_units": narration_units,
        "narration_pages": narration_pages,
    }
    return v, context


def references_for_record(context: dict[str, Any], record: dict[str, Any]) -> list[dict[str, Any]]:
    for scene in context["scenes"]:
        if not isinstance(scene, dict) or scene.get("id") != record["scene_id"]:
            continue
        refs = scene.get("references_v7", [])
        return refs if isinstance(refs, list) else []
    return []


def validate_linked_inputs(
    project_path: Path,
    context: dict[str, Any],
    v: Validation,
    artifact_root: Path | None = None,
) -> None:
    root = project_path.parent.resolve()
    reference_root = (artifact_root if artifact_root is not None else root).resolve()
    lock = context["root"].get("production_lock", {})
    if not isinstance(lock, dict):
        return
    packet_rel = lock.get("story_packet_path")
    packet_path = resolve_artifact(root, packet_rel) if is_safe_relative(packet_rel) else None
    if packet_path is None or not packet_path.is_file():
        v.error("production_lock.story_packet_path", f"Story Packet real ausente: {packet_rel}")
    else:
        expected_packet_hash = clean_hash(lock.get("story_packet_sha256"))
        actual_packet_hash = hash_file(packet_path)
        v.require(expected_packet_hash == actual_packet_hash, "production_lock.story_packet_sha256",
                  f"declarado {expected_packet_hash}, real {actual_packet_hash}")
        try:
            validate_packet(packet_path)
        except ValidationFailure as exc:
            v.error("production_lock.story_packet_path", f"packet enlazado inválido: {exc}")
        try:
            packet_text = packet_path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError) as exc:
            v.error("production_lock.story_packet_path", f"no se pudo leer UTF-8: {exc}")
        else:
            scope_match = re.search(r"(?m)^\s*packet_scope:\s*([A-Z_]+)\s*$", packet_text)
            linked_scope = scope_match.group(1) if scope_match else ""
            allowed_scopes = ({"PRODUCTION_PART"} if context["mode"] == "PRODUCTION"
                              else {"PILOT_FRAGMENT", "VALIDATOR_FIXTURE"})
            v.require(linked_scope in allowed_scopes, "production_lock.story_packet_path",
                      f"packet_scope {linked_scope or 'ausente'} no autorizado para mode {context['mode']}")
            payload = monologue_payload(packet_text)
            if payload is None:
                v.error("production_lock.monologue_sha256", "packet enlazado no contiene MONOLOGO_LOCKED")
            else:
                digest = canonical_hash(payload)
                v.require(clean_hash(lock.get("monologue_sha256")) == digest,
                          "production_lock.monologue_sha256", f"no coincide con packet; esperado {digest}")
                tts_export = context["root"].get("tts_export", {})
                full_script = tts_export.get("full_script") if isinstance(tts_export, dict) else None
                canonical_payload = unicodedata.normalize("NFC", payload.replace("\r\n", "\n").replace("\r", "\n"))
                if canonical_payload.endswith("\n"):
                    canonical_payload = canonical_payload[:-1]
                v.require(full_script == canonical_payload, "tts_export.full_script",
                          "no coincide byte-canonical con MONOLOGO_LOCKED enlazado")
                if context.get("decoupled_timeline"):
                    machine_section = markdown_section(packet_text, "MACHINE_LOCK_V7") or ""
                    machine = json_block(machine_section,
                                         lambda value: isinstance(value, dict) and "voice_visual_lock" in value)
                    atoms = machine.get("voice_visual_lock", []) if isinstance(machine, dict) else []
                    packet_units = [
                        {"id": atom.get("atom_id"), "text": atom.get("text_exact")}
                        for atom in atoms if isinstance(atom, dict)
                    ]
                    project_units = [
                        {"id": unit.get("id"), "text": unit.get("text")}
                        for unit in context.get("narration_units", [])
                    ]
                    v.require(project_units == packet_units, "narration_track.units",
                              "debe copiar atom_id/text_exact del voice_visual_lock enlazado, en orden")
            if linked_scope != "VALIDATOR_FIXTURE":
                validate_obligation_mapping(context, packet_text, v)

    # Las referencias existentes son evidencia, no meros strings hexadecimales.
    checked: set[tuple[str, str]] = set()
    for record in context["sources"]:
        for ref in references_for_record(context, record):
            if not isinstance(ref, dict):
                continue
            rel = ref.get("source_path")
            digest = clean_hash(ref.get("sha256"))
            key = (str(rel), str(digest))
            if key in checked:
                continue
            checked.add(key)
            location = f"references_v7[{ref.get('id', '?')}]"
            path = resolve_artifact(reference_root, rel) if is_safe_relative(rel) else None
            if path is None or not path.is_file():
                v.error(f"{location}.source_path", f"archivo real ausente: {rel}")
            elif digest is not None:
                actual = hash_file(path)
                v.require(actual == digest, f"{location}.sha256", f"declarado {digest}, real {actual}")


def validate_obligation_mapping(context: dict[str, Any], packet_text: str, v: Validation) -> None:
    machine_section = markdown_section(packet_text, "MACHINE_LOCK_V7") or ""
    obligations_section = markdown_section(packet_text, "visual_obligations") or ""
    machine = json_block(machine_section, lambda value: isinstance(value, dict) and "voice_visual_lock" in value)
    obligations_raw = json_block(obligations_section, lambda value: isinstance(value, list))
    if not isinstance(machine, dict) or not isinstance(obligations_raw, list):
        v.error("obligation_map", "no se pudo extraer semántica del Story Packet enlazado")
        return
    packet_atoms = {
        atom.get("atom_id"): atom
        for atom in machine.get("voice_visual_lock", [])
        if isinstance(atom, dict) and isinstance(atom.get("atom_id"), str)
    }
    packet_obligations = {
        item.get("obligation_id"): item
        for item in obligations_raw
        if isinstance(item, dict) and isinstance(item.get("obligation_id"), str)
    }
    mapping_raw = context["root"].get("obligation_map")
    if not isinstance(mapping_raw, list):
        v.error("obligation_map", "lista raíz requerida")
        return
    mapping = records_by_id(mapping_raw, "obligation_id", v, "obligation_map")
    v.require(set(mapping) == set(packet_obligations), "obligation_map", "debe cubrir exactamente todas las obligaciones del packet")
    prompts = {
        record.get("shot", {}).get("shot_id"): record.get("prompt", "")
        for record in context["sources"]
        if isinstance(record.get("shot", {}).get("shot_id"), str)
    }
    mapped_shots: set[str] = set()
    covered_atoms: set[str] = set()
    page_assignments: dict[str, list[tuple[str, bool]]] = {}
    for obligation_id, packet_item in packet_obligations.items():
        loc = f"obligation_map[{obligation_id}]"
        item = mapping.get(obligation_id)
        if item is None:
            continue
        expected_atoms = packet_item.get("atom_ids", [])
        atom_ids = item.get("atom_ids")
        v.require(isinstance(atom_ids, list) and atom_ids == expected_atoms, f"{loc}.atom_ids", "debe copiar atom_ids exactos del packet")
        if isinstance(atom_ids, list):
            covered_atoms.update(atom for atom in atom_ids if isinstance(atom, str))
        v.require(item.get("must_show") == packet_item.get("must_show"), f"{loc}.must_show", "debe copiar must_show exacto del packet")
        v.require(item.get("required_relationship") == packet_item.get("required_relationship"),
                  f"{loc}.required_relationship", "debe copiar relación exacta del packet")
        source_ids = item.get("source_shot_ids")
        valid_sources = (isinstance(source_ids, list) and bool(source_ids) and
                         all(isinstance(shot_id, str) and shot_id in prompts for shot_id in source_ids) and
                         len(set(source_ids)) == len(source_ids))
        v.require(valid_sources, f"{loc}.source_shot_ids", "lista no vacía de shot_id existentes y únicos requerida")
        if isinstance(source_ids, list):
            mapped_shots.update(shot_id for shot_id in source_ids if isinstance(shot_id, str))
            own_page = packet_item.get("must_be_own_generated_page") is True
            may_share = packet_item.get("may_share_page") is True
            for shot_id in source_ids:
                if isinstance(shot_id, str):
                    page_assignments.setdefault(shot_id, []).append(
                        (obligation_id, own_page or not may_share)
                    )
        evidence = list_value(item.get("prompt_evidence"), v, f"{loc}.prompt_evidence")
        evidence_shots: set[str] = set()
        for evidence_index, evidence_raw in enumerate(evidence):
            eloc = f"{loc}.prompt_evidence[{evidence_index}]"
            entry = dict_value(evidence_raw, v, eloc)
            shot_id = entry.get("shot_id")
            v.require(isinstance(shot_id, str) and isinstance(source_ids, list) and shot_id in source_ids,
                      f"{eloc}.shot_id", "debe pertenecer a source_shot_ids")
            if isinstance(shot_id, str):
                evidence_shots.add(shot_id)
            terms = entry.get("required_terms")
            v.require(isinstance(terms, list) and len(terms) >= 2 and all(isinstance(term, str) and term.strip() for term in terms),
                      f"{eloc}.required_terms", "requiere al menos dos términos concretos")
            prompt_lower = str(prompts.get(shot_id, "")).casefold()
            if isinstance(terms, list):
                for term in terms:
                    if isinstance(term, str):
                        v.require(term.casefold() in prompt_lower, f"{eloc}.required_terms", f"término no aparece en prompt real: {term!r}")
        if isinstance(source_ids, list) and all(isinstance(shot_id, str) for shot_id in source_ids):
            v.require(evidence_shots == set(source_ids), f"{loc}.prompt_evidence", "requiere evidencia para cada source_shot_id")
    for shot_id, assignments in page_assignments.items():
        if len(assignments) > 1 and any(exclusive for _, exclusive in assignments):
            obligation_ids = ", ".join(obligation_id for obligation_id, _ in assignments)
            v.error(f"obligation_map.source_shot_ids[{shot_id}]",
                    f"scene/page compartida por {obligation_ids}, pero al menos una obligación exige página exclusiva")
    v.require(set(packet_atoms).issubset(covered_atoms), "obligation_map.atom_ids", "no cubre todos los átomos del packet")
    v.require(set(prompts).issubset(mapped_shots), "obligation_map.source_shot_ids", "cada fuente debe pagar al menos una obligación")


def validate_preflight(path: Path) -> str:
    try:
        data, _ = json_load(path)
    except (OSError, ValueError) as exc:
        raise ValidationFailure(f"BLOCKED_INPUT {exc}") from exc
    v, context = validate_project(data)
    validate_linked_inputs(path, context, v)
    return v.finish("PROMPT_RELEASE_V7", f"mode={context['mode']} panels={len(context['panel_scenes'])} sources={len(context['sources'])}")


def validate_real_file(root: Path, rel: Any, declared_hash: Any, v: Validation, location: str,
                       required_size: tuple[int, int] | None = None,
                       require_master_9_16: bool = False) -> Path | None:
    if not is_safe_relative(rel):
        v.error(f"{location}.path", "ruta relativa segura requerida")
        return None
    path = resolve_artifact(root, rel)
    if path is None:
        v.error(f"{location}.path", "ruta sale de la raíz del proyecto")
        return None
    if not path.is_file():
        v.error(f"{location}.path", f"archivo real ausente: {rel}")
        return path
    expected = clean_hash(declared_hash)
    if expected is None:
        v.error(f"{location}.sha256", "SHA-256 real requerido")
    else:
        actual = hash_file(path)
        v.require(actual == expected, f"{location}.sha256", f"declarado {expected}, real {actual}")
    if required_size and require_master_9_16:
        raise ValueError("required_size and require_master_9_16 are mutually exclusive")
    if required_size or require_master_9_16:
        actual_size = image_size(path)
        if require_master_9_16:
            v.require(
                is_high_resolution_9_16(actual_size),
                f"{location}.dimensions",
                f"fuente debe ser master 9:16 de alta resolucion; real {actual_size}",
            )
        else:
            v.require(actual_size == required_size, f"{location}.dimensions", f"debe ser {required_size[0]}x{required_size[1]}; real {actual_size}")
    return path


def records_by_id(records: Any, key: str, v: Validation, location: str) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(list_value(records, v, location)):
        loc = f"{location}[{index}]"
        record = dict_value(raw, v, loc)
        identifier = record.get(key)
        if not isinstance(identifier, str) or not identifier:
            v.error(f"{loc}.{key}", "ID requerido")
        elif identifier in result:
            v.error(f"{loc}.{key}", "ID duplicado")
        else:
            result[identifier] = record
    return result


def validate_provenance_references(
    raw: Any,
    root: Path,
    v: Validation,
    location: str,
) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    seen: set[str] = set()
    for index, raw_reference in enumerate(list_value(raw, v, location)):
        loc = f"{location}[{index}]"
        reference = dict_value(raw_reference, v, loc)
        path = reference.get("path")
        digest = clean_hash(reference.get("sha256"))
        v.require(is_safe_relative(path), f"{loc}.path", "ruta relativa real requerida")
        v.require(digest is not None, f"{loc}.sha256", "SHA-256 real requerido")
        if isinstance(path, str) and digest is not None:
            key = path.replace("\\", "/")
            v.require(key not in seen, f"{loc}.path", "referencia duplicada")
            seen.add(key)
            validate_real_file(root, path, digest, v, loc)
            result.append((key, digest))
    return result


def validate_failure_codes(raw: Any, v: Validation, location: str) -> tuple[int, bool]:
    minor_unresolved = 0
    hard_unresolved = False
    for index, item_raw in enumerate(list_value(raw, v, location)):
        loc = f"{location}[{index}]"
        item = dict_value(item_raw, v, loc)
        v.require(is_enum(item.get("code"), FAILURE_CODES), f"{loc}.code", "código F_* desconocido")
        severity = item.get("severity")
        v.require(is_enum(severity, {"CRITICAL", "MAJOR", "MINOR"}), f"{loc}.severity", "severidad inválida")
        v.require(isinstance(item.get("resolved"), bool), f"{loc}.resolved", "booleano requerido")
        if item.get("resolved") is False:
            if is_enum(severity, {"CRITICAL", "MAJOR"}):
                hard_unresolved = True
            elif severity == "MINOR":
                minor_unresolved += 1
    return minor_unresolved, hard_unresolved


def validate_postflight(
    project_path: Path,
    manifest_path: Path,
    audit_path: Path,
    artifact_root: Path | None = None,
) -> str:
    """Audita directamente un JPG completo producido por Grok por cada escena."""
    v = Validation()
    try:
        project, _ = json_load(project_path)
        manifest, manifest_raw = json_load(manifest_path)
        audit, _ = json_load(audit_path)
    except (OSError, ValueError) as exc:
        raise ValidationFailure(f"BLOCKED_PROVENANCE_V7 {exc}") from exc
    project = dict_value(project, v, "project_json")
    manifest = dict_value(manifest, v, "generation_manifest")
    audit = dict_value(audit, v, "render_audit")
    preflight, context = validate_project(project)
    v.errors.extend(preflight.errors)
    root = (artifact_root if artifact_root is not None else project_path.parent).resolve()
    validate_linked_inputs(project_path, context, v, artifact_root=root)
    project_digest = project_semantic_sha256(project)
    manifest_digest = sha256_bytes(manifest_raw)

    v.require(manifest.get("schema") == "GENERATION_MANIFEST_V7", "generation_manifest.schema", "schema inválido")
    v.require(manifest.get("version") == VERSION, "generation_manifest.version", "debe ser 7.0")
    v.require(manifest.get("project_sha256") == project_digest, "generation_manifest.project_sha256",
              f"debe ser {project_digest}")
    require_text(manifest, "generated_at", v, "generation_manifest")
    v.require("pages" not in manifest, "generation_manifest.pages", "GROK_NATIVE_PAGE registra cada escena en sources")

    expected_sources = {
        record["scene_id"]: record for record in context["sources"]
        if isinstance(record.get("scene_id"), str)
    }
    generated = records_by_id(manifest.get("sources"), "shot_id", v, "generation_manifest.sources")
    v.require(set(generated) == set(expected_sources), "generation_manifest.sources",
              "debe haber exactamente un registro por scene JPG")
    approved_manifest: dict[str, dict[str, Any]] = {}
    human_review = False

    for scene_id, expected in expected_sources.items():
        loc = f"generation_manifest.sources[{scene_id}]"
        item = generated.get(scene_id, {})
        v.require(item.get("prompt") == expected["prompt"], f"{loc}.prompt",
                  "debe ser el visual.image_prompt exacto enviado a Grok")
        require_text(item, "model", v, loc)
        settings = dict_value(item.get("settings"), v, f"{loc}.settings")
        v.require(settings.get("aspect_ratio") == "9:16", f"{loc}.settings.aspect_ratio", "debe ser 9:16")
        require_text(item, "job_id", v, loc)
        expected_output = expected["source"]
        v.require(item.get("output_path") == expected_output, f"{loc}.output_path",
                  f"debe ser {expected_output}")
        v.require(isinstance(expected_output, str) and expected_output.lower().endswith((".jpg", ".jpeg")),
                  f"{loc}.output_path", "la salida directa debe ser JPG")
        output_hash = clean_hash(item.get("output_sha256"))
        v.require(output_hash is not None, f"{loc}.output_sha256", "SHA-256 real requerido")
        validate_real_file(root, expected_output, output_hash, v, loc, require_master_9_16=True)
        attempt = item.get("generation_attempt")
        v.require(isinstance(attempt, int) and not isinstance(attempt, bool) and 1 <= attempt <= 3,
                  f"{loc}.generation_attempt", "entero 1..3 requerido")
        v.require(item.get("status") == "APPROVED", f"{loc}.status",
                  "postflight release exige APPROVED; RETAKE/HUMAN_REVIEW no se convierten en PASS")
        declared_refs = sorted(
            (str(ref.get("source_path", "")).replace("\\", "/"), clean_hash(ref.get("sha256")))
            for ref in references_for_record(context, expected) if isinstance(ref, dict)
        )
        factual_refs = sorted(validate_provenance_references(item.get("references"), root, v, f"{loc}.references"))
        v.require(factual_refs == declared_refs, f"{loc}.references",
                  "debe coincidir con las referencias realmente declaradas/enviadas")

        history = list_value(item.get("attempt_history"), v, f"{loc}.attempt_history")
        v.require(bool(history) and len(history) <= 3, f"{loc}.attempt_history", "historial append-only de 1..3 intentos requerido")
        expected_attempts = list(range(1, len(history) + 1))
        actual_attempts = [entry.get("attempt") for entry in history if isinstance(entry, dict)]
        v.require(actual_attempts == expected_attempts, f"{loc}.attempt_history", "attempt debe ser secuencial desde 1")
        v.require(attempt == len(history), f"{loc}.generation_attempt", "debe coincidir con el último historial")
        for history_index, raw_history in enumerate(history):
            hloc = f"{loc}.attempt_history[{history_index}]"
            entry = dict_value(raw_history, v, hloc)
            require_text(entry, "submitted_at", v, hloc)
            require_text(entry, "prompt", v, hloc)
            require_text(entry, "model", v, hloc)
            dict_value(entry.get("settings"), v, f"{hloc}.settings")
            require_text(entry, "job_id", v, hloc)
            status = entry.get("status")
            v.require(status in {"REJECTED", "GENERATED", "APPROVED"}, f"{hloc}.status", "estado inválido")
            validate_provenance_references(entry.get("references"), root, v, f"{hloc}.references")
            if status == "REJECTED" and not entry.get("output_path"):
                require_text(entry, "error", v, hloc)
            else:
                v.require(is_safe_relative(entry.get("output_path")), f"{hloc}.output_path", "ruta real requerida")
                v.require(clean_hash(entry.get("output_sha256")) is not None, f"{hloc}.output_sha256", "hash real requerido")
        if history:
            final_history = history[-1] if isinstance(history[-1], dict) else {}
            v.require(final_history.get("prompt") == item.get("prompt"), f"{loc}.attempt_history[-1].prompt",
                      "el último intento debe coincidir con el prompt aprobado")
            v.require(final_history.get("output_path") == item.get("output_path"), f"{loc}.attempt_history[-1].output_path",
                      "el último output debe coincidir con el aprobado")
            v.require(clean_hash(final_history.get("output_sha256")) == output_hash,
                      f"{loc}.attempt_history[-1].output_sha256", "hash final no coincide")
            if len(history) >= 3 and final_history.get("status") != "APPROVED":
                human_review = True
        approved_manifest[scene_id] = item

    v.require(audit.get("schema") == "RENDER_AUDIT_V7", "render_audit.schema", "schema inválido")
    v.require(audit.get("version") == VERSION, "render_audit.version", "debe ser 7.0")
    v.require(audit.get("project_sha256") == project_digest, "render_audit.project_sha256",
              f"debe ser {project_digest}")
    v.require(audit.get("generation_manifest_sha256") == manifest_digest,
              "render_audit.generation_manifest_sha256", f"debe ser {manifest_digest}")
    v.require("pages" not in audit, "render_audit.pages",
              "GROK_NATIVE_PAGE audita cada JPG directo en sources")
    audited = records_by_id(audit.get("sources"), "shot_id", v, "render_audit.sources")
    v.require(set(audited) == set(expected_sources), "render_audit.sources",
              "debe haber exactamente un registro por scene JPG")

    accepted_camera = 0
    minor_unresolved_total = 0
    hard_unresolved = False
    for scene_id, expected in expected_sources.items():
        loc = f"render_audit.sources[{scene_id}]"
        item = audited.get(scene_id, {})
        generated_item = approved_manifest.get(scene_id, {})
        v.require(item.get("output_path") == generated_item.get("output_path"), f"{loc}.output_path",
                  "no coincide con generation manifest")
        v.require(clean_hash(item.get("output_sha256")) == clean_hash(generated_item.get("output_sha256")),
                  f"{loc}.output_sha256", "no coincide con generation manifest")
        v.require(item.get("asset_status") == "PASS", f"{loc}.asset_status",
                  "solo PASS permite RENDER_RELEASE_V7")
        observed_page = dict_value(item.get("observed_page"), v, f"{loc}.observed_page")
        planned = next(
            (scene.get("visual_plan", {}).get("native_page", {}) for scene in context["panel_scenes"]
             if isinstance(scene, dict) and scene.get("id") == scene_id),
            {},
        )
        observed_family = observed_page.get("family")
        observed_layout = observed_page.get("layout")
        observed_panels = observed_page.get("panel_count")
        observed_background = observed_page.get("background_pct")
        family_match = observed_family == planned.get("family")
        panel_match = observed_panels == planned.get("panel_count")
        layout_match = observed_layout == planned.get("layout")
        v.require(observed_family in PAGE_FAMILIES, f"{loc}.observed_page.family", "familia observada inválida")
        v.require(observed_layout in LAYOUT_FAMILY, f"{loc}.observed_page.layout", "layout observado inválido")
        v.require(isinstance(observed_panels, int) and not isinstance(observed_panels, bool),
                  f"{loc}.observed_page.panel_count", "entero requerido")
        v.require(finite_number(observed_background) and 0 <= float(observed_background) <= 100,
                  f"{loc}.observed_page.background_pct", "porcentaje observado 0..100 requerido")
        delta = (abs(float(observed_background) - float(planned.get("background_pct", 0)))
                 if finite_number(observed_background) and finite_number(planned.get("background_pct")) else math.inf)
        page_result = item.get("page_result")
        v.require(page_result in {"MATCH", "ACCEPTABLE_VARIANCE", "MISS"}, f"{loc}.page_result", "enum inválido")
        v.require(family_match, f"{loc}.observed_page.family", "wrong family exige RETAKE")
        v.require(panel_match, f"{loc}.observed_page.panel_count", "panel extra/ausente exige RETAKE")
        v.require(delta <= 15 + 1e-9, f"{loc}.observed_page.background_pct",
                  f"desviación {delta:.1f}pp excede tolerancia ±15pp")
        if family_match and panel_match and delta <= 15:
            if layout_match and delta <= 5:
                v.require(page_result == "MATCH", f"{loc}.page_result", "coincidencia directa debe declararse MATCH")
            else:
                v.require(page_result == "ACCEPTABLE_VARIANCE", f"{loc}.page_result",
                          "variación menor de layout/fondo debe declararse ACCEPTABLE_VARIANCE")

        camera_result = item.get("camera_result")
        v.require(camera_result in {"MATCH", "ACCEPTABLE_VARIANCE", "MISS", "NOT_OBSERVED"},
                  f"{loc}.camera_result", "enum inválido")
        if camera_result in {"MATCH", "ACCEPTABLE_VARIANCE"}:
            accepted_camera += 1
        v.require(camera_result in {"MATCH", "ACCEPTABLE_VARIANCE"}, f"{loc}.camera_result",
                  "cámara MISS/NOT_OBSERVED exige RETAKE o revisión")
        for status_key in ("identity_status", "text_status", "bubble_status", "crop_status", "readability_status"):
            v.require(item.get(status_key) == "PASS", f"{loc}.{status_key}",
                      f"{status_key} distinto de PASS exige RETAKE/HUMAN_REVIEW")
        observation = dict_value(item.get("observation"), v, f"{loc}.observation")
        v.require(observation.get("type") in {"AUTOMATED", "HUMAN"}, f"{loc}.observation.type", "enum inválido")
        require_text(observation, "observer_id", v, f"{loc}.observation")
        require_text(observation, "evidence", v, f"{loc}.observation")
        confidence = item.get("confidence")
        v.require(finite_number(confidence) and 0 <= float(confidence) <= 1, f"{loc}.confidence", "0..1 requerido")
        minor, hard = validate_failure_codes(item.get("failure_codes"), v, f"{loc}.failure_codes")
        minor_unresolved_total += minor
        hard_unresolved = hard_unresolved or hard

    if expected_sources:
        accepted_pct = accepted_camera * 100 / len(expected_sources)
        v.require(accepted_pct >= context["thresholds"]["min_camera_match_pct"], "render_audit.camera_match_pct",
                  f"MATCH+ACCEPTABLE_VARIANCE {accepted_pct:.1f}% < {context['thresholds']['min_camera_match_pct']}%")
    if context["mode"] == "PILOT":
        v.require(minor_unresolved_total <= context["thresholds"]["max_minor_failures_pilot"],
                  "render_audit.failure_codes", "demasiados MINOR abiertos")
    elif expected_sources:
        minor_pct = minor_unresolved_total * 100 / len(expected_sources)
        v.require(minor_pct <= context["thresholds"]["max_minor_failure_pct_production"],
                  "render_audit.failure_codes", "porcentaje MINOR abierto excedido")
    v.require(not hard_unresolved, "render_audit.failure_codes", "hay CRITICAL/MAJOR sin resolver")

    sequence = dict_value(audit.get("sequence_review"), v, "render_audit.sequence_review")
    v.require(sequence.get("status") == "PASS", "render_audit.sequence_review.status", "PASS requerido")
    source_ids = sequence.get("source_shot_ids")
    v.require(isinstance(source_ids, list) and source_ids == list(expected_sources),
              "render_audit.sequence_review.source_shot_ids", "debe cubrir scenes en orden una vez")
    checks = dict_value(sequence.get("checks"), v, "render_audit.sequence_review.checks")
    for key in ("environment_view_repetition", "weather_overlay_repetition", "pose_repetition",
                "palette_monotony", "equivalent_composition_run"):
        v.require(checks.get(key) == "PASS", f"render_audit.sequence_review.checks.{key}", "PASS requerido")
    evidence = sequence.get("evidence")
    v.require(isinstance(evidence, list) and bool(evidence)
              and all(isinstance(item, str) and item.strip() for item in evidence),
              "render_audit.sequence_review.evidence", "evidencia factual no vacía requerida")
    if human_review:
        v.error("generation_manifest.attempt_history", "tercer intento no aprobado: HUMAN_REVIEW_V7")
    return v.finish("RENDER_RELEASE_V7", f"pages={len(expected_sources)} grok_native=true")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Valida Story Packet, preflight y postflight Manhwa GPT V7")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--packet-only", metavar="STORY_PACKET.md", type=Path)
    group.add_argument("--preflight", metavar="PROJECT.json", type=Path)
    group.add_argument("--postflight", nargs=3, metavar=("PROJECT.json", "GENERATION_MANIFEST.json", "RENDER_AUDIT.json"), type=Path)
    parser.add_argument("--artifact-root", type=Path,
                        help="raiz real para images/, assets/ y evidencia postflight; default: carpeta del PROJECT.json")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.packet_only:
            result = validate_packet(args.packet_only)
        elif args.preflight:
            result = validate_preflight(args.preflight)
        else:
            result = validate_postflight(*args.postflight, artifact_root=args.artifact_root)
    except ValidationFailure as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
