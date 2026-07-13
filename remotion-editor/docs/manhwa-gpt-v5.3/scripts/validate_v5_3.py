#!/usr/bin/env python3
"""Validador canónico fail-closed para contratos manhwa V5.3.

Uso:
    python validate_v5_3.py proyecto.json STORY_PACKET.md

No usa dependencias externas. Siempre imprime un reporte JSON. Solo devuelve cero
cuando el contrato completo y todos los gates de preflight producen
``PROMPT_RELEASE``.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable


VALIDATOR_VERSION = "5.3.2"
HANDOFF_VERSION = "5.3"
ROOT_REQUIRED = {
    "project", "pipeline", "characters", "escenarios", "scenes", "editing", "tts_export", "production_lock"
}
ROOT_ALLOWED = ROOT_REQUIRED | {"audio"}
SCENE_TYPES = {"panel", "narrative_card"}
ASSET_TYPES = {"human", "creature", "prop", "container", "ui"}
POSE_ROLES = {"base", "outfit", "performance", "trapped", "charge", "attack", "impact", "collapse", "state"}
CREATURE_ROLES = {"base", "trapped", "charge", "attack", "impact", "collapse"}
PAGE_LAYOUTS = {
    "FULL_BLEED",
    "WHITE_INSET",
    "WHITE_COMPOSITE_2",
    "WHITE_ISOLATE",
    "WHITE_FRAGMENT",
    "WHITE_ACTION_STRIP_2",
    "BLACK_INSET",
    "TALL_ACTION",
}
WHITE_LAYOUTS = {
    "WHITE_INSET",
    "WHITE_COMPOSITE_2",
    "WHITE_ISOLATE",
    "WHITE_FRAGMENT",
    "WHITE_ACTION_STRIP_2",
}
WHITE_COMPOSITIONS = {
    "UPPER_LEFT", "LOWER_RIGHT", "CENTER_HIGH", "SIDE_STRIP", "OPPOSITE_CORNERS", "STACKED_OFFSET",
    "DIAGONAL_STRIP", "LOWER_RIGHT_ISOLATE",
}
SHOT_SCALES = {"MACRO", "EXTREME_CLOSE", "CLOSE", "MEDIUM", "FULL", "WIDE_MASTER", "TRUE_LONG"}
CAMERA_ELEVATIONS = {
    "EYE_LEVEL",
    "LOW",
    "HIGH",
    "BIRDS_EYE",
    "TOP_DOWN",
    "WORMS_EYE",
    "KNEE_LEVEL",
    "GROUND_LEVEL",
}
VIEWPOINTS = {
    "FRONT",
    "THREE_QUARTER_FRONT",
    "OTS",
    "BEHIND",
    "REAR_THREE_QUARTER",
    "PROFILE",
    "SIDE",
    "POV",
}
CAMERA_ROLLS = {"LEVEL", "DUTCH"}
NONFRONTAL_VIEWPOINTS = {"OTS", "BEHIND", "REAR_THREE_QUARTER", "PROFILE", "SIDE", "POV"}
PERFORMANCES = {"NONE", "NEUTRAL_INTENTIONAL", "REACTION", "RELATIONSHIP", "EFFORT", "SHOCK", "COST"}
REACTION_PERFORMANCES = {"REACTION", "SHOCK", "COST"}
ACTION_PHASES = {"NONE", "GEOGRAPHY", "ANTICIPATION", "TRAJECTORY", "CONTACT", "CONSEQUENCE", "REACTION"}
ACTION_ORDER = ["GEOGRAPHY", "ANTICIPATION", "TRAJECTORY", "CONTACT", "CONSEQUENCE", "REACTION"]
APPROACH_STAGES = {"NONE", "SPACE", "BODY", "EMOTION", "FRAGMENT", "ADDITIONAL"}
LONG_ROLES = {"NONE", "WORLD", "THREAT", "GEOGRAPHY", "CLIMAX", "CONSEQUENCE"}
FRAGMENT_SUBJECTS = {"NONE", "EYES", "MOUTH_JAW", "HAND_CONTACT", "FOOT_CONTACT", "WOUND_MARK", "PROP_DECISIVE"}
FRAGMENT_ROLES = {"NONE", "DECISION", "EMOTION", "INFORMATION", "CONTACT", "COST"}
LOW_DENSITY_KINDS = {"NONE", "REACTION", "ENVIRONMENT", "SILENT_LONG"}
THIRDS = {"NONE", "UPPER", "MIDDLE", "LOWER"}
SPACE_TYPES = {"INTERIOR", "EXTERIOR", "ABSTRACT"}
BEATS = {
    "HOOK",
    "WORLD",
    "LACK",
    "NORMALITY",
    "DETONATOR",
    "THREAT",
    "PRESSURE",
    "BOND",
    "DECISION",
    "PERCEPTION",
    "PREPARATION",
    "MANIFESTATION",
    "ACTION",
    "PAYOFF",
    "CONSEQUENCE",
    "COST",
    "CLIFFHANGER",
    "TRANSITION",
}
MANDATORY_BEATS = {"HOOK", "DETONATOR", "THREAT", "DECISION", "MANIFESTATION", "PAYOFF", "COST", "CLIFFHANGER"}
REACTION_TRIGGER_BEATS = {"DETONATOR", "THREAT", "DECISION", "MANIFESTATION", "PAYOFF", "COST"}
ALLOWED_TAGS = {
    "pause",
    "low",
    "serious",
    "urgent",
    "strained",
    "impact",
    "cold",
    "tense",
    "shaken",
    "desperate",
    "gasps",
    "dark",
    "stunned",
    "whispering",
    "angry",
    "sad",
    "excited",
    "fearful",
    "exhausted",
    "sighs",
    "laughs",
    "nervous",
    "calm",
}

GATE_NAMES = (
    "json_parse",
    "root_fields",
    "root_types_allowed",
    "production_lock",
    "asset_manifest",
    "project_contract",
    "pipeline_contract",
    "asset_registry",
    "scenario_registry",
    "scene_structure",
    "panel_card_rules",
    "references_valid_max_three",
    "full_script_exact",
    "tts_contract",
    "editing_contract",
    "shot_present",
    "camera_present",
    "time_present",
    "unique_prompts",
    "prompt_english",
    "prompt_length",
    "prompt_grammar",
    "voice_word_time_limits",
    "beat_coverage",
    "white_page_range",
    "white_page_three_families",
    "white_distribution",
    "black_card_range_roles",
    "fragment_range_diversity",
    "reaction_range_causality",
    "approach_ramp_and_additional",
    "tall_action_range",
    "visual_punctuation_range_distribution",
    "true_long_shots",
    "camera_variety",
    "action_sequences",
    "continuity",
    "transparent_container_has_unique_occupant",
)
CONTRACT_GATES = {
    "root_fields",
    "root_types_allowed",
    "project_contract",
    "pipeline_contract",
    "production_lock",
    "asset_manifest",
    "asset_registry",
    "scenario_registry",
    "scene_structure",
    "panel_card_rules",
    "references_valid_max_three",
    "full_script_exact",
    "tts_contract",
    "editing_contract",
}

SNAKE_RE = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")
SCENE_ID_RE = re.compile(r"^scene_(\d{2,3})([a-z]?)$")
TIME_RE = re.compile(
    r"\b(dawn|sunrise|morning|noon|afternoon|sunset|dusk|evening|night|midnight|"
    r"pre-dawn|daytime|nighttime)\b",
    re.I,
)
STYLE_PARTS = (
    re.compile(r"hand-drawn korean manhwa webtoon illustration", re.I),
    re.compile(r"2d flat cel shading|controlled flat cel shading|controlled cel shading", re.I),
    re.compile(r"crisp inked lineart|crisp lineart", re.I),
    re.compile(r"vertical 9:16 (?:webtoon )?(?:panel )?composition", re.I),
)
SCALE_PATTERNS = {
    "MACRO": re.compile(r"\bmacro(?: shot)?\b", re.I),
    "EXTREME_CLOSE": re.compile(r"\bextreme close-up\b", re.I),
    "CLOSE": re.compile(r"\b(?:tight )?close-up\b|\bclose shot\b", re.I),
    "MEDIUM": re.compile(r"\bmedium(?:-wide|-full)? (?:shot|view)\b|\bmedium close shot\b", re.I),
    "FULL": re.compile(r"\bfull[- ]body (?:shot|view)\b|\bfull shot\b", re.I),
    "WIDE_MASTER": re.compile(r"\bwide (?:master|shot|view)\b|\bwide-master\b", re.I),
    "TRUE_LONG": re.compile(
        r"\b(?:true long shot|extreme[- ]wide(?: shot)?|deep wide(?: shot)?|distant wide(?: shot)?|"
        r"monumental wide(?: shot)?|establishing long shot|long shot)\b",
        re.I,
    ),
}
ELEVATION_PATTERNS = {
    "EYE_LEVEL": re.compile(r"\beye[- ]level(?: angle| view)?\b", re.I),
    "LOW": re.compile(r"\blow[- ]angle\b|\blow oblique angle\b", re.I),
    "HIGH": re.compile(r"\bhigh[- ]angle\b|\bhigh oblique angle\b", re.I),
    "BIRDS_EYE": re.compile(r"\bbird'?s[- ]eye(?: view| angle)?\b", re.I),
    "TOP_DOWN": re.compile(r"\btop[- ]down(?: view| angle)?\b", re.I),
    "WORMS_EYE": re.compile(r"\bworm'?s[- ]eye(?: view| angle)?\b", re.I),
    "KNEE_LEVEL": re.compile(r"\bknee[- ]level(?: view| angle)?\b", re.I),
    "GROUND_LEVEL": re.compile(r"\bground[- ]level(?: view| angle)?\b", re.I),
}
VIEWPOINT_PATTERNS = {
    "FRONT": re.compile(r"\bfront(?:al)? (?:view|shot)\b", re.I),
    "THREE_QUARTER_FRONT": re.compile(r"\bthree[- ]quarter front(?: view| shot)?\b", re.I),
    "OTS": re.compile(r"\bover[- ]the[- ]shoulder(?: view| shot)?\b|\bOTS (?:view|shot)\b", re.I),
    "BEHIND": re.compile(r"\bfrom behind\b|\bbehind view\b", re.I),
    "REAR_THREE_QUARTER": re.compile(r"\brear three[- ]quarter(?: view| angle)?\b", re.I),
    "PROFILE": re.compile(r"\bprofile(?: view| angle| shot)?\b", re.I),
    "SIDE": re.compile(r"\bside (?:view|angle|profile|shot)\b|\bside-angle\b", re.I),
    "POV": re.compile(r"\bPOV(?: shot| view)?\b|\bpoint-of-view shot\b", re.I),
}
ROLL_PATTERNS = {
    "LEVEL": re.compile(r"\blevel camera roll\b|\blevel roll\b", re.I),
    "DUTCH": re.compile(r"\bdutch (?:tilt|angle|roll)\b", re.I),
}
ACTION_VERB_RE = re.compile(
    r"\b(?:advances?|approaches?|arches?|braces?|catches?|clenches?|closes?|collapses?|crawls?|"
    r"crosses?|drives?|drops?|falls?|faces?|fires?|grabs?|holds?|hurls?|kneels?|launches?|leans?|"
    r"lifts?|looks?|lunges?|narrows?|opens?|pulls?|pushes?|reaches?|recognizes?|recoils?|rises?|runs?|shifts?|stands?|"
    r"steps?|strikes?|throws?|tightens?|turns?|watches?|whips?|widens?|wraps?)\b",
    re.I,
)
SPANISH_FUNCTION_RE = re.compile(
    r"\b(?:el|la|los|las|del|una?|unos|unas|que|porque|pero|mientras|hacia|desde|sobre|debajo|"
    r"dentro|fuera|personaje|escena|plano|fondo|noche|lluvia|mano|ojos)\b",
    re.I,
)
GAZE_RE = re.compile(r"\b(?:brows?|eyebrows?|eyes?|pupils?|gaze)\b", re.I)
MOUTH_RE = re.compile(r"\b(?:mouth|lips?|jaw|teeth)\b", re.I)
BODY_RE = re.compile(r"\b(?:shoulders?|hands?|fingers?|neck|torso|weight|posture|knees?|steps? back|leans? back)\b", re.I)
WHITE_PAGE_RE = re.compile(r"\b(?:pure white|white vertical webtoon|white webtoon) page\b", re.I)
WHITE_SPACE_RE = re.compile(r"\b(?:clean|blank|untouched|negative|white) (?:white )?(?:space|field|margins?|canvas)\b", re.I)
BLACK_PAGE_RE = re.compile(r"\b(?:matte[- ]black|pure black|solid black|black webtoon) page\b", re.I)
NO_TEXT_RE = re.compile(r"\bno (?:other )?readable text\b", re.I)
LIGHT_SOURCE_RE = re.compile(r"\b(?:lamp|light|headlight|emergency light|moonlight|sunlight|neon|glow)\b", re.I)
LIGHT_DIRECTION_RE = re.compile(r"\b(?:from (?:screen[- ]?)?(?:left|right|above|below|behind|front)|overhead|backlit|backlight)\b", re.I)
TAG_RE = re.compile(r"\[([^\]]+)\]")


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def nonempty_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def enum_contains(value: Any, choices: set[str]) -> bool:
    return isinstance(value, str) and value in choices


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def strip_tags(value: Any) -> str:
    return TAG_RE.sub("", str(value or "")).strip()


def spoken_words(value: Any) -> int:
    return len(re.findall(r"\b[\wÁÉÍÓÚÜÑáéíóúüñ'-]+\b", strip_tags(value), re.UNICODE))


def prompt_words(value: Any) -> int:
    return len(re.findall(r"\b[\w'-]+\b", str(value or ""), re.UNICODE))


def normalized_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower())).strip()


def scene_sort_key(scene_id: str) -> tuple[int, str] | None:
    match = SCENE_ID_RE.fullmatch(scene_id)
    return (int(match.group(1)), match.group(2)) if match else None


def load_json(path_text: str) -> tuple[Path, Any]:
    path = Path(path_text).expanduser().resolve()
    with path.open("r", encoding="utf-8-sig") as handle:
        return path, json.load(handle)


def add_issue(
    issues: list[dict[str, Any]],
    gate: str,
    code: str,
    message: str,
    scene_id: str | None = None,
) -> None:
    item: dict[str, Any] = {"gate": gate, "code": code, "message": message}
    if scene_id:
        item["scene_id"] = scene_id
    issues.append(item)


def failure_report(file_name: str, code: str, message: str) -> dict[str, Any]:
    gates = {name: False if name == "json_parse" else False for name in GATE_NAMES}
    issue = {"gate": "json_parse", "code": code, "message": message}
    return {
        "file": file_name,
        "status": "FAIL",
        "preflight_status": "PROMPT_REPAIR_REQUIRED",
        "preflight_gates": gates,
        "contract": {"ok": False, "errors": [issue]},
        "errors": [issue],
        "warnings": [],
        "validator_version": VALIDATOR_VERSION,
        "scope": "PROMPT_PREFLIGHT_ONLY",
    }


def sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _packet_section(text: str, heading: str) -> str | None:
    """Devuelve el cuerpo de una sección H2, preservando su contenido."""
    match = re.search(rf"(?m)^##[ \t]+{re.escape(heading)}[ \t]*$", text)
    if not match:
        return None
    start = match.end()
    if start < len(text) and text[start] == "\n":
        start += 1
    tail = text[start:]
    next_heading = re.search(r"(?m)^##[ \t]+[^\n]+$", tail)
    body = tail[: next_heading.start()] if next_heading else tail
    return body.strip("\n")


def parse_story_packet(raw_bytes: bytes, packet_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Extrae locks canónicos del Story Packet sin depender de prosa libre."""
    issues: list[dict[str, Any]] = []
    try:
        text = raw_bytes.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    except UnicodeDecodeError as error:
        add_issue(issues, "production_lock", "PACKET_UTF8_INVALID", f"Story Packet no es UTF-8: {error}.")
        return {}, issues

    machine_body = _packet_section(text, "MACHINE_LOCK_V5_3")
    machine: dict[str, Any] = {}
    if machine_body is None:
        add_issue(issues, "production_lock", "MACHINE_LOCK_SECTION_MISSING", "Falta ## MACHINE_LOCK_V5_3.")
    else:
        fenced = re.fullmatch(r"[ \t]*```json[ \t]*\n([\s\S]*?)\n```[ \t]*", machine_body, re.I)
        if not fenced:
            add_issue(issues, "production_lock", "MACHINE_LOCK_FENCE_INVALID", "MACHINE_LOCK_V5_3 debe contener solo un bloque ```json válido.")
        else:
            try:
                decoded = json.loads(fenced.group(1))
                if isinstance(decoded, dict):
                    machine = decoded
                else:
                    add_issue(issues, "production_lock", "MACHINE_LOCK_NOT_OBJECT", "MACHINE_LOCK_V5_3 debe ser un objeto JSON.")
            except json.JSONDecodeError as error:
                add_issue(issues, "production_lock", "MACHINE_LOCK_JSON_INVALID", f"MACHINE_LOCK_V5_3 no es JSON válido: {error}.")

    monologue_body = _packet_section(text, "MONOLOGO_LOCKED")
    monologue = ""
    if monologue_body is None:
        add_issue(issues, "production_lock", "MONOLOGUE_SECTION_MISSING", "Falta ## MONOLOGO_LOCKED.")
    else:
        fenced = re.fullmatch(r"[ \t]*```(?:text|markdown)?[ \t]*\n([\s\S]*?)\n```[ \t]*", monologue_body, re.I)
        monologue = fenced.group(1) if fenced else monologue_body
        if not monologue:
            add_issue(issues, "production_lock", "MONOLOGUE_EMPTY", "MONOLOGO_LOCKED no puede estar vacío.")

    required_machine = {
        "handoff_version", "packet_id", "approved_voice_id", "monologue_sha256", "monologue_hash_basis",
        "target_runtime_seconds", "runtime_range_seconds", "beat_order", "location_ids", "beat_locations", "state_contract",
    }
    if machine:
        missing = sorted(required_machine - set(machine))
        allowed_machine = required_machine | {"approved_voices"}
        unknown = sorted(set(machine) - allowed_machine)
        if missing:
            add_issue(issues, "production_lock", "MACHINE_LOCK_FIELDS_MISSING", f"MACHINE_LOCK_V5_3 carece de {missing}.")
        if unknown:
            add_issue(issues, "production_lock", "MACHINE_LOCK_FIELDS_UNKNOWN", f"MACHINE_LOCK_V5_3 contiene campos no permitidos: {unknown}.")
        if machine.get("handoff_version") != HANDOFF_VERSION:
            add_issue(issues, "production_lock", "MACHINE_HANDOFF_VERSION", f"handoff_version debe ser {HANDOFF_VERSION!r}.")
        for field in ("packet_id", "approved_voice_id"):
            if not nonempty_text(machine.get(field)):
                add_issue(issues, "production_lock", "MACHINE_TEXT_INVALID", f"MACHINE_LOCK_V5_3.{field} debe ser texto no vacío.")
        if "approved_voices" in machine:
            approved_voices = machine.get("approved_voices")
            if (
                not isinstance(approved_voices, dict)
                or not approved_voices
                or any(not nonempty_text(key) or not nonempty_text(value) for key, value in approved_voices.items())
            ):
                add_issue(issues, "production_lock", "APPROVED_VOICES_INVALID", "approved_voices debe mapear speaker a voice ID no vacío.")
        runtime_target = machine.get("target_runtime_seconds")
        runtime_range = machine.get("runtime_range_seconds")
        runtime_range_valid = (
            isinstance(runtime_range, list)
            and len(runtime_range) == 2
            and all(is_number(value) for value in runtime_range)
            and 30 <= float(runtime_range[0]) < float(runtime_range[1]) <= 180
            and float(runtime_range[1]) - float(runtime_range[0]) <= 20
        )
        if not is_number(runtime_target) or not runtime_range_valid or not float(runtime_range[0]) <= float(runtime_target) <= float(runtime_range[1]):
            add_issue(
                issues,
                "production_lock",
                "RUNTIME_LOCK_INVALID",
                "target_runtime_seconds debe caer dentro de runtime_range_seconds [min,max], rango 30–180 y ancho <=20.",
            )
        beat_order = machine.get("beat_order")
        if (
            not isinstance(beat_order, list)
            or not 8 <= len(beat_order) <= 14
            or any(not isinstance(value, str) or not re.fullmatch(r"B\d{2,3}", value) for value in beat_order)
            or len(beat_order) != len(set(beat_order))
            or beat_order != sorted(beat_order, key=lambda value: int(value[1:]))
        ):
            add_issue(
                issues,
                "production_lock",
                "BEAT_ORDER_INVALID",
                "beat_order debe contener 8–14 IDs únicos B01… en orden numérico estricto.",
            )
            beat_order = []
        expected_basis = (
            "UTF-8 bytes of the exact text between MONOLOGO_LOCKED and HANDOFF_NARRATIVO_V5_3, "
            "excluding the two framing line breaks and preserving LF inside the text"
        )
        if machine.get("monologue_hash_basis") != expected_basis:
            add_issue(issues, "production_lock", "MONOLOGUE_HASH_BASIS_INVALID", "monologue_hash_basis no es la fórmula canónica V5.3.")
        location_ids = machine.get("location_ids")
        if (
            not isinstance(location_ids, list)
            or not location_ids
            or any(not isinstance(value, str) or not SNAKE_RE.fullmatch(value) for value in location_ids)
            or len(location_ids) != len(set(location_ids))
        ):
            add_issue(issues, "production_lock", "LOCATION_IDS_INVALID", "location_ids debe ser lista única de IDs snake_case.")
            location_ids = []
        beat_locations = machine.get("beat_locations")
        if not isinstance(beat_locations, dict) or set(beat_locations) != set(beat_order):
            add_issue(issues, "production_lock", "BEAT_LOCATIONS_COVERAGE", "beat_locations debe cubrir exactamente beat_order.")
        elif any(value not in location_ids for value in beat_locations.values()):
            add_issue(issues, "production_lock", "BEAT_LOCATION_UNKNOWN", "beat_locations contiene una ubicación fuera de location_ids.")

        def state_value_valid(key: str, value: Any) -> bool:
            if isinstance(value, list):
                return (
                    key.endswith(".occupants")
                    and all(nonempty_text(item) for item in value)
                    and len(value) == len(set(value))
                )
            return value is None or isinstance(value, (str, int, float, bool)) and not (
                isinstance(value, float) and not math.isfinite(value)
            )

        state_contract = machine.get("state_contract")
        if not isinstance(state_contract, dict) or not state_contract:
            add_issue(issues, "production_lock", "STATE_CONTRACT_INVALID", "state_contract debe ser un objeto no vacío de claves dotted.")
        else:
            for key, value in state_contract.items():
                label = f"state_contract.{key}"
                if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9_]+(?:\.[a-z0-9_]+)+", key):
                    add_issue(issues, "production_lock", "STATE_KEY_INVALID", f"{label} no es una clave dotted canónica.")
                    continue
                if not isinstance(value, dict) or set(value) != {"initial", "changes"}:
                    add_issue(issues, "production_lock", "STATE_SPEC_INVALID", f"{label} exige solo initial y changes.")
                    continue
                if not state_value_valid(key, value.get("initial")):
                    add_issue(issues, "production_lock", "STATE_INITIAL_INVALID", f"{label}.initial debe ser escalar o lista plana de IDs.")
                changes = value.get("changes")
                if not isinstance(changes, list):
                    add_issue(issues, "production_lock", "STATE_CHANGES_INVALID", f"{label}.changes debe ser lista.")
                    continue
                seen_change_beats: set[str] = set()
                for change_index, change in enumerate(changes):
                    change_label = f"{label}.changes[{change_index}]"
                    if not isinstance(change, dict) or set(change) != {"beat_id", "to", "caused_by"}:
                        add_issue(issues, "production_lock", "STATE_CHANGE_FIELDS_INVALID", f"{change_label} exige beat_id,to,caused_by.")
                        continue
                    beat_id = change.get("beat_id")
                    if beat_id not in beat_order or beat_id in seen_change_beats:
                        add_issue(issues, "production_lock", "STATE_CHANGE_BEAT_INVALID", f"{change_label}.beat_id no existe o está duplicado.")
                    elif isinstance(beat_id, str):
                        seen_change_beats.add(beat_id)
                    if not state_value_valid(key, change.get("to")):
                        add_issue(issues, "production_lock", "STATE_CHANGE_VALUE_INVALID", f"{change_label}.to debe ser escalar o lista plana de IDs.")
                    if not nonempty_text(change.get("caused_by")):
                        add_issue(issues, "production_lock", "STATE_CHANGE_CAUSE_INVALID", f"{change_label}.caused_by debe ser texto no vacío.")

    monologue_hash = sha256_hex(monologue.encode("utf-8")) if monologue else ""
    if machine and machine.get("monologue_sha256") != monologue_hash:
        add_issue(issues, "production_lock", "MACHINE_MONOLOGUE_HASH_MISMATCH", "El hash de MONOLOGO_LOCKED no coincide con MACHINE_LOCK_V5_3.")
    return {
        "path": str(packet_path.resolve()),
        "sha256": sha256_hex(raw_bytes),
        "machine_lock": machine,
        "monologue": monologue,
        "monologue_sha256": monologue_hash,
    }, issues


def parse_asset_manifest(raw_bytes: bytes, manifest_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    try:
        decoded = json.loads(raw_bytes.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        add_issue(issues, "asset_manifest", "MANIFEST_PARSE_ERROR", f"Manifest no es JSON UTF-8 válido: {error}.")
        return {}, issues
    if not isinstance(decoded, dict):
        add_issue(issues, "asset_manifest", "MANIFEST_NOT_OBJECT", "Manifest debe ser objeto JSON.")
        return {}, issues
    if decoded.get("manifest_version") != HANDOFF_VERSION:
        add_issue(issues, "asset_manifest", "MANIFEST_VERSION_INVALID", "manifest_version debe ser '5.3'.")
    if not nonempty_text(decoded.get("series_id")):
        add_issue(issues, "asset_manifest", "MANIFEST_SERIES_INVALID", "series_id debe ser texto no vacío.")
    if not isinstance(decoded.get("source_part"), int) or isinstance(decoded.get("source_part"), bool) or decoded.get("source_part", 0) < 1:
        add_issue(issues, "asset_manifest", "MANIFEST_SOURCE_PART_INVALID", "source_part debe ser entero positivo.")
    asset_map: dict[tuple[str, str], dict[str, Any]] = {}
    assets = decoded.get("assets")
    if not isinstance(assets, list):
        add_issue(issues, "asset_manifest", "MANIFEST_ASSETS_INVALID", "assets debe ser lista.")
        assets = []
    for asset_index, asset in enumerate(assets):
        if (
            not isinstance(asset, dict)
            or not nonempty_text(asset.get("id"))
            or not nonempty_text(asset.get("prompt_signature"))
            or not isinstance(asset.get("poses"), list)
        ):
            add_issue(issues, "asset_manifest", "MANIFEST_ASSET_INVALID", f"assets[{asset_index}] inválido.")
            continue
        for pose_index, pose in enumerate(asset["poses"]):
            if not isinstance(pose, dict) or not all(nonempty_text(pose.get(field)) for field in ("pose", "pose_role", "asset")):
                add_issue(issues, "asset_manifest", "MANIFEST_POSE_INVALID", f"assets[{asset_index}].poses[{pose_index}] inválido.")
                continue
            key = (str(asset["id"]), str(pose["pose"]))
            if key in asset_map:
                add_issue(issues, "asset_manifest", "MANIFEST_POSE_DUPLICATE", f"Pose duplicada {key}.")
            asset_map[key] = {
                "pose_role": pose.get("pose_role"),
                "asset": pose.get("asset"),
                "asset_type": asset.get("asset_type"),
                "prompt_signature": asset.get("prompt_signature"),
            }
    view_map: dict[tuple[str, str], dict[str, Any]] = {}
    scenarios = decoded.get("escenarios")
    if not isinstance(scenarios, list):
        add_issue(issues, "asset_manifest", "MANIFEST_SCENARIOS_INVALID", "escenarios debe ser lista.")
        scenarios = []
    for scenario_index, scenario in enumerate(scenarios):
        if not isinstance(scenario, dict) or not nonempty_text(scenario.get("id")) or not isinstance(scenario.get("views"), list):
            add_issue(issues, "asset_manifest", "MANIFEST_SCENARIO_INVALID", f"escenarios[{scenario_index}] inválido.")
            continue
        for view_index, view in enumerate(scenario["views"]):
            if not isinstance(view, dict) or not all(nonempty_text(view.get(field)) for field in ("view", "view_type", "asset")):
                add_issue(issues, "asset_manifest", "MANIFEST_VIEW_INVALID", f"escenarios[{scenario_index}].views[{view_index}] inválido.")
                continue
            key = (str(scenario["id"]), str(view["view"]))
            if key in view_map:
                add_issue(issues, "asset_manifest", "MANIFEST_VIEW_DUPLICATE", f"View duplicada {key}.")
            view_map[key] = {"view_type": view.get("view_type"), "asset": view.get("asset")}
    return {
        "path": str(manifest_path.resolve()),
        "sha256": sha256_hex(raw_bytes),
        "manifest_version": decoded.get("manifest_version"),
        "series_id": decoded.get("series_id"),
        "asset_map": asset_map,
        "view_map": view_map,
    }, issues


def require_dict(parent: dict[str, Any], key: str, issues: list[dict[str, Any]], gate: str, label: str) -> dict[str, Any]:
    value = parent.get(key)
    if not isinstance(value, dict):
        add_issue(issues, gate, "OBJECT_REQUIRED", f"{label} debe ser un objeto.")
        return {}
    return value


def check_asset_path(path: Any, prefix: str) -> bool:
    if not nonempty_text(path):
        return False
    value = str(path)
    return (
        "\\" not in value
        and not value.startswith(("/", "../"))
        and value.startswith(prefix)
        and bool(re.search(r"\.(?:png|jpe?g|webp)$", value, re.I))
    )


def validate_project(data: dict[str, Any], issues: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    project = data.get("project")
    if not isinstance(project, dict):
        add_issue(issues, "root_types_allowed", "PROJECT_NOT_OBJECT", "project debe ser un objeto.")
        return {}, ""
    expected = {"preset": "manhwa", "language": "es-419", "aspect_ratio": "9:16", "fps": 30}
    for field, wanted in expected.items():
        if project.get(field) != wanted:
            add_issue(issues, "project_contract", "PROJECT_FIELD_INVALID", f"project.{field} debe ser {wanted!r}.")
    for field in ("title", "serie", "slug"):
        if not nonempty_text(project.get(field)):
            add_issue(issues, "project_contract", "PROJECT_FIELD_MISSING", f"project.{field} debe ser texto no vacío.")
    serie = str(project.get("serie") or "")
    if serie and not SNAKE_RE.fullmatch(serie):
        add_issue(issues, "project_contract", "SERIE_NOT_SNAKE_CASE", "project.serie debe usar snake_case.")
    part = project.get("part")
    if not isinstance(part, int) or isinstance(part, bool) or part < 1:
        add_issue(issues, "project_contract", "PART_INVALID", "project.part debe ser entero positivo.")
    elif serie and project.get("slug") != f"{serie}_parte_{part:02d}":
        add_issue(issues, "project_contract", "SLUG_INVALID", "project.slug debe ser serie + '_parte_NN'.")
    return project, serie


def validate_pipeline(data: dict[str, Any], issues: list[dict[str, Any]]) -> dict[str, Any]:
    pipeline = data.get("pipeline")
    if not isinstance(pipeline, dict):
        add_issue(issues, "root_types_allowed", "PIPELINE_NOT_OBJECT", "pipeline debe ser un objeto.")
        return {}
    expected_tools = {
        ("image_generation", "tool"): "grok",
        ("animation", "tool"): "grok",
        ("tts", "tool"): "elevenlabs",
        ("editing", "tool"): "capcut",
    }
    for (section, field), wanted in expected_tools.items():
        actual = as_dict(pipeline.get(section)).get(field)
        if actual != wanted:
            add_issue(issues, "pipeline_contract", "PIPELINE_TOOL_INVALID", f"pipeline.{section}.{field} debe ser {wanted!r}.")
    tts = as_dict(pipeline.get("tts"))
    if tts.get("language") != "es-419":
        add_issue(issues, "pipeline_contract", "PIPELINE_TTS_LANGUAGE", "pipeline.tts.language debe ser 'es-419'.")
    voice_id = tts.get("voice_id")
    if not nonempty_text(voice_id) or re.search(r"(?:aprobado|placeholder|replace|your[_ -]?voice|id_narrador)", str(voice_id), re.I):
        add_issue(issues, "pipeline_contract", "VOICE_ID_INVALID", "pipeline.tts.voice_id debe contener un ID aprobado real.")
    return pipeline


def validate_production_lock(
    data: dict[str, Any],
    pipeline: dict[str, Any],
    packet: dict[str, Any] | None,
    manifest: dict[str, Any] | None,
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    raw = data.get("production_lock")
    if not isinstance(raw, dict):
        add_issue(issues, "production_lock", "PRODUCTION_LOCK_NOT_OBJECT", "production_lock debe ser un objeto.")
        return {}
    lock = raw
    required = {"handoff_version", "packet_id", "source_packet_sha256", "monologue_sha256", "approved_voice_id"}
    allowed = required | {"asset_manifest_sha256"}
    missing = sorted(required - set(lock))
    unknown = sorted(set(lock) - allowed)
    if missing:
        add_issue(issues, "production_lock", "PRODUCTION_LOCK_FIELDS_MISSING", f"production_lock carece de {missing}.")
    if unknown:
        add_issue(issues, "production_lock", "PRODUCTION_LOCK_FIELDS_UNKNOWN", f"production_lock contiene campos no permitidos: {unknown}.")
    if manifest is not None:
        manifest_hash = lock.get("asset_manifest_sha256")
        if manifest_hash != manifest.get("sha256"):
            add_issue(issues, "production_lock", "ASSET_MANIFEST_HASH_MISMATCH", "asset_manifest_sha256 no coincide con el manifest adjunto.")
    elif "asset_manifest_sha256" in lock:
        add_issue(issues, "production_lock", "ASSET_MANIFEST_HASH_WITHOUT_FILE", "asset_manifest_sha256 está prohibido sin manifest adjunto.")
    if lock.get("handoff_version") != HANDOFF_VERSION:
        add_issue(issues, "production_lock", "PRODUCTION_HANDOFF_VERSION", f"production_lock.handoff_version debe ser {HANDOFF_VERSION!r}.")
    for field in ("packet_id", "approved_voice_id"):
        if not nonempty_text(lock.get(field)):
            add_issue(issues, "production_lock", "PRODUCTION_TEXT_INVALID", f"production_lock.{field} debe ser texto no vacío.")
    for field in ("source_packet_sha256", "monologue_sha256"):
        if not isinstance(lock.get(field), str) or not re.fullmatch(r"[0-9a-f]{64}", str(lock.get(field))):
            add_issue(issues, "production_lock", "PRODUCTION_HASH_INVALID", f"production_lock.{field} debe ser SHA-256 hexadecimal minúsculo.")
    if packet is None:
        add_issue(issues, "production_lock", "STORY_PACKET_REQUIRED", "Se requiere el Story Packet exacto como segundo argumento.")
        return lock
    machine = as_dict(packet.get("machine_lock"))
    comparisons = {
        "handoff_version": HANDOFF_VERSION,
        "packet_id": machine.get("packet_id"),
        "source_packet_sha256": packet.get("sha256"),
        "monologue_sha256": packet.get("monologue_sha256"),
        "approved_voice_id": machine.get("approved_voice_id"),
    }
    for field, wanted in comparisons.items():
        if lock.get(field) != wanted:
            add_issue(issues, "production_lock", "PRODUCTION_LOCK_MISMATCH", f"production_lock.{field} no coincide con el Story Packet.")
    if lock.get("monologue_sha256") != machine.get("monologue_sha256"):
        add_issue(issues, "production_lock", "PRODUCTION_MACHINE_MONOLOGUE_MISMATCH", "Hash de monólogo difiere de MACHINE_LOCK_V5_3.")
    pipeline_voice = as_dict(pipeline.get("tts")).get("voice_id")
    if lock.get("approved_voice_id") != pipeline_voice:
        add_issue(issues, "production_lock", "VOICE_LOCK_MISMATCH", "pipeline.tts.voice_id no coincide con approved_voice_id.")
    return lock


def validate_assets(
    data: dict[str, Any], serie: str, issues: list[dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], dict[tuple[str, str], str], set[str]]:
    raw = data.get("characters")
    if not isinstance(raw, dict):
        add_issue(issues, "root_types_allowed", "CHARACTERS_NOT_OBJECT", "characters debe ser un objeto.")
        return {}, {}, set()
    registry: dict[str, dict[str, Any]] = {}
    pose_roles: dict[tuple[str, str], str] = {}
    transparent: set[str] = set()
    prefix = f"assets/characters/{serie}/" if serie else "assets/characters/"
    for item_id, item_raw in raw.items():
        if not isinstance(item_id, str) or not SNAKE_RE.fullmatch(item_id):
            add_issue(issues, "asset_registry", "ASSET_ID_INVALID", f"ID de asset inválido: {item_id!r}.")
            continue
        if not isinstance(item_raw, dict):
            add_issue(issues, "asset_registry", "ASSET_NOT_OBJECT", f"characters.{item_id} debe ser objeto.")
            continue
        item = item_raw
        registry[item_id] = item
        if not nonempty_text(item.get("display_name")):
            add_issue(issues, "asset_registry", "DISPLAY_NAME_MISSING", f"characters.{item_id}.display_name falta.")
        signature = item.get("prompt_signature")
        if (
            not nonempty_text(signature)
            or not 4 <= prompt_words(signature) <= 30
            or SPANISH_FUNCTION_RE.search(str(signature))
        ):
            add_issue(issues, "asset_registry", "PROMPT_SIGNATURE_INVALID", f"characters.{item_id}.prompt_signature exige frase inglesa estable de 4–30 palabras.")
        asset_type = item.get("asset_type")
        if not isinstance(asset_type, str) or asset_type not in ASSET_TYPES:
            add_issue(issues, "asset_registry", "ASSET_TYPE_INVALID", f"characters.{item_id}.asset_type inválido.")
        if asset_type == "container":
            if not isinstance(item.get("transparent"), bool):
                add_issue(issues, "asset_registry", "CONTAINER_TRANSPARENCY_MISSING", f"characters.{item_id}.transparent debe ser booleano.")
            elif item.get("transparent"):
                transparent.add(item_id)
        poses = item.get("poses")
        if not isinstance(poses, dict) or not poses:
            add_issue(issues, "asset_registry", "POSES_INVALID", f"characters.{item_id}.poses debe ser objeto no vacío.")
            continue
        normalized_prompts: dict[str, str] = {}
        roles_seen: set[str] = set()
        for pose_id, pose_raw in poses.items():
            label = f"characters.{item_id}.poses.{pose_id}"
            if not isinstance(pose_id, str) or not SNAKE_RE.fullmatch(pose_id) or not isinstance(pose_raw, dict):
                add_issue(issues, "asset_registry", "POSE_INVALID", f"{label} debe usar ID snake_case y objeto.")
                continue
            mode = pose_raw.get("mode")
            if not isinstance(mode, str) or mode not in {"generate", "existing"}:
                add_issue(issues, "asset_registry", "POSE_MODE_INVALID", f"{label}.mode debe ser generate o existing.")
            if not check_asset_path(pose_raw.get("asset"), prefix):
                add_issue(issues, "asset_registry", "POSE_ASSET_PATH_INVALID", f"{label}.asset debe estar bajo {prefix}.")
            role = pose_raw.get("pose_role")
            if not isinstance(role, str) or role not in POSE_ROLES:
                add_issue(issues, "asset_registry", "POSE_ROLE_INVALID", f"{label}.pose_role inválido.")
            else:
                pose_roles[(item_id, pose_id)] = role
                roles_seen.add(role)
            prompt = pose_raw.get("prompt")
            if mode == "generate" and not nonempty_text(prompt):
                add_issue(issues, "asset_registry", "POSE_PROMPT_MISSING", f"{label}.prompt falta para generate.")
            if nonempty_text(prompt):
                normalized_prompts[pose_id] = normalized_text(prompt)
            reference_pose = pose_raw.get("reference_pose")
            if pose_id != "base" and mode == "generate":
                if not isinstance(reference_pose, str) or reference_pose not in poses or reference_pose == pose_id:
                    add_issue(issues, "asset_registry", "REFERENCE_POSE_INVALID", f"{label}.reference_pose debe apuntar a otra pose existente.")
                if asset_type == "human" and not re.search(r"\bsame face, same hair, same outfit as the reference\b", str(prompt or ""), re.I):
                    add_issue(issues, "asset_registry", "HUMAN_DERIVED_IDENTITY_FORMULA", f"{label}.prompt necesita fórmula canónica de identidad.")
            elif reference_pose is not None and (not isinstance(reference_pose, str) or reference_pose not in poses):
                add_issue(issues, "asset_registry", "REFERENCE_POSE_INVALID", f"{label}.reference_pose no existe.")
            if role == "performance" and nonempty_text(prompt) and re.search(r"\bneutral (?:expression|mouth|posture|pose)\b", str(prompt), re.I):
                add_issue(issues, "asset_registry", "PERFORMANCE_POSE_NEUTRAL", f"{label} contradice actuación con neutralidad.")
        if isinstance(asset_type, str) and asset_type in {"human", "creature", "prop", "container", "ui"} and "base" not in poses:
            add_issue(issues, "asset_registry", "BASE_POSE_MISSING", f"characters.{item_id} necesita poses.base.")
        if asset_type == "human" and isinstance(poses.get("base"), dict):
            base = poses["base"]
            if base.get("pose_role") != "base":
                add_issue(issues, "asset_registry", "HUMAN_BASE_ROLE", f"characters.{item_id}.poses.base debe usar pose_role='base'.")
            if base.get("mode") == "generate":
                prompt = str(base.get("prompt") or "")
                required = {
                    "exactly_one": r"\bexactly one (?:character|person|figure)\b",
                    "full_hair_soles": r"\bfull body from hair to soles\b",
                    "orthographic_front": r"\borthographic front(?:al)?\b",
                    "eye_level": r"\beye[- ]level\b",
                    "neutral_relaxed": r"\bneutral relaxed expression\b",
                    "empty_hands": r"\bboth open empty hands visible\b",
                    "feet": r"\bboth feet visible\b",
                    "clean_dry": r"\bclean and dry\b",
                    "studio": r"\beven studio illumination\b",
                    "gray": r"\bseamless neutral medium[- ]gray background\b",
                }
                missing = [name for name, pattern in required.items() if not re.search(pattern, prompt, re.I)]
                forbidden = re.findall(
                    r"\b(?:rain|wet|water|blood|wound|injury|bruise|dirt|dust|stain|sweat|fire|smoke|aura|power|energy|"
                    r"weapon|holding|carrying|wielding|night|day|midnight|sunset|sunrise|tunnel|street|room|interior|exterior|"
                    r"low|high|dramatic angle|rim|painted)\b",
                    prompt,
                    re.I,
                )
                if missing or forbidden:
                    add_issue(
                        issues,
                        "asset_registry",
                        "HUMAN_BASE_NONCANONICAL",
                        f"Base {item_id} incompleta; faltan {missing}, prohibidos {sorted(set(forbidden))}.",
                    )
        if asset_type == "creature":
            missing_roles = sorted(CREATURE_ROLES - roles_seen)
            if missing_roles:
                add_issue(issues, "asset_registry", "CREATURE_STATES_MISSING", f"Criatura {item_id} carece de roles {missing_roles}.")
            role_prompts = [normalized_prompts.get(pose_id, "") for pose_id, pose in poses.items() if isinstance(pose, dict) and pose.get("pose_role") in CREATURE_ROLES]
            nonempty = [value for value in role_prompts if value]
            if len(nonempty) != len(set(nonempty)):
                add_issue(issues, "asset_registry", "CREATURE_STATE_DUPLICATE", f"Criatura {item_id} repite prompts entre estados.")
    if not any(item.get("asset_type") == "human" for item in registry.values()):
        add_issue(issues, "asset_registry", "HUMAN_ASSET_REQUIRED", "El registro necesita al menos un asset human con base canónica.")
    return registry, pose_roles, transparent


def validate_scenarios(data: dict[str, Any], serie: str, issues: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    raw = data.get("escenarios")
    if not isinstance(raw, dict):
        add_issue(issues, "root_types_allowed", "SCENARIOS_NOT_OBJECT", "escenarios debe ser un objeto.")
        return {}
    registry: dict[str, dict[str, Any]] = {}
    prefix = f"assets/escenarios/{serie}/" if serie else "assets/escenarios/"
    for scenario_id, scenario_raw in raw.items():
        if not isinstance(scenario_id, str) or not SNAKE_RE.fullmatch(scenario_id) or not isinstance(scenario_raw, dict):
            add_issue(issues, "scenario_registry", "SCENARIO_INVALID", f"Escenario inválido: {scenario_id!r}.")
            continue
        registry[scenario_id] = scenario_raw
        if not nonempty_text(scenario_raw.get("display_name")):
            add_issue(issues, "scenario_registry", "SCENARIO_NAME_MISSING", f"escenarios.{scenario_id}.display_name falta.")
        views = scenario_raw.get("views")
        if not isinstance(views, dict) or not views:
            add_issue(issues, "scenario_registry", "VIEWS_INVALID", f"escenarios.{scenario_id}.views debe ser objeto no vacío.")
            continue
        for view_id, view_raw in views.items():
            label = f"escenarios.{scenario_id}.views.{view_id}"
            if not isinstance(view_id, str) or not SNAKE_RE.fullmatch(view_id) or not isinstance(view_raw, dict):
                add_issue(issues, "scenario_registry", "VIEW_INVALID", f"{label} inválida.")
                continue
            mode = view_raw.get("mode")
            if not isinstance(mode, str) or mode not in {"generate", "existing"}:
                add_issue(issues, "scenario_registry", "VIEW_MODE_INVALID", f"{label}.mode inválido.")
            if not check_asset_path(view_raw.get("asset"), prefix):
                add_issue(issues, "scenario_registry", "VIEW_PATH_INVALID", f"{label}.asset debe estar bajo {prefix}.")
            if view_raw.get("view_type") != "plate":
                add_issue(issues, "scenario_registry", "VIEW_TYPE_INVALID", f"{label}.view_type debe ser 'plate'.")
            if mode == "generate" and not nonempty_text(view_raw.get("prompt")):
                add_issue(issues, "scenario_registry", "VIEW_PROMPT_MISSING", f"{label}.prompt falta.")
            reference_view = view_raw.get("reference_view")
            if reference_view is not None and (not isinstance(reference_view, str) or reference_view not in views or reference_view == view_id):
                add_issue(issues, "scenario_registry", "REFERENCE_VIEW_INVALID", f"{label}.reference_view no existe o es autorreferencia.")
    if not registry:
        add_issue(issues, "scenario_registry", "SCENARIO_REQUIRED", "El registro necesita al menos un escenario con view.")
    return registry


def validate_existing_assets(
    data: dict[str, Any], serie: str, manifest: dict[str, Any] | None, issues: list[dict[str, Any]]
) -> bool:
    existing_poses: list[tuple[str, str, dict[str, Any], dict[str, Any]]] = []
    for asset_id, asset in as_dict(data.get("characters")).items():
        if not isinstance(asset_id, str) or not isinstance(asset, dict):
            continue
        for pose_id, pose in as_dict(asset.get("poses")).items():
            if isinstance(pose_id, str) and isinstance(pose, dict) and pose.get("mode") == "existing":
                existing_poses.append((asset_id, pose_id, asset, pose))
    existing_views: list[tuple[str, str, dict[str, Any]]] = []
    for scenario_id, scenario in as_dict(data.get("escenarios")).items():
        if not isinstance(scenario_id, str) or not isinstance(scenario, dict):
            continue
        for view_id, view in as_dict(scenario.get("views")).items():
            if isinstance(view_id, str) and isinstance(view, dict) and view.get("mode") == "existing":
                existing_views.append((scenario_id, view_id, view))
    has_existing = bool(existing_poses or existing_views)
    if has_existing and manifest is None:
        add_issue(issues, "asset_manifest", "MANIFEST_REQUIRED_FOR_EXISTING", "Todo mode=existing exige EXISTING_ASSET_MANIFEST_V5_3.json.")
        return has_existing
    if manifest is None:
        return has_existing
    if manifest.get("manifest_version") != HANDOFF_VERSION or manifest.get("series_id") != serie:
        add_issue(issues, "asset_manifest", "MANIFEST_IDENTITY_MISMATCH", "Manifest version/series_id no coincide con project.serie.")
    asset_map = as_dict(manifest.get("asset_map"))
    for asset_id, pose_id, asset, pose in existing_poses:
        expected = asset_map.get((asset_id, pose_id))
        if not isinstance(expected, dict) or (
            expected.get("pose_role") != pose.get("pose_role")
            or expected.get("asset") != pose.get("asset")
            or expected.get("asset_type") != asset.get("asset_type")
            or expected.get("prompt_signature") != asset.get("prompt_signature")
        ):
            add_issue(issues, "asset_manifest", "EXISTING_POSE_NOT_MANIFESTED", f"Existing {asset_id}.{pose_id} no coincide exactamente con manifest.")
    view_map = as_dict(manifest.get("view_map"))
    for scenario_id, view_id, view in existing_views:
        expected = view_map.get((scenario_id, view_id))
        if not isinstance(expected, dict) or expected.get("view_type") != view.get("view_type") or expected.get("asset") != view.get("asset"):
            add_issue(issues, "asset_manifest", "EXISTING_VIEW_NOT_MANIFESTED", f"Existing {scenario_id}.{view_id} no coincide exactamente con manifest.")
    return has_existing


def prompt_has_scale(prompt: str, scale: str) -> bool:
    pattern = SCALE_PATTERNS.get(scale)
    return bool(pattern and pattern.search(prompt))


def prompt_has_elevation(prompt: str, elevation: str) -> bool:
    pattern = ELEVATION_PATTERNS.get(elevation)
    return bool(pattern and pattern.search(prompt))


def prompt_has_viewpoint(prompt: str, viewpoint: str) -> bool:
    pattern = VIEWPOINT_PATTERNS.get(viewpoint)
    return bool(pattern and pattern.search(prompt))


def prompt_has_roll(prompt: str, roll: str) -> bool:
    pattern = ROLL_PATTERNS.get(roll)
    return bool(pattern and pattern.search(prompt))


def without_quoted_text(prompt: str) -> str:
    return re.sub(r"(['\"])[\s\S]*?\1", " ", prompt)


def prompt_core(prompt: str) -> str:
    value = prompt.lower()
    value = re.sub(r"hand-drawn korean manhwa[\s\S]*?vertical 9:16(?: webtoon)?(?: panel)? composition", " ", value)
    value = re.sub(r"no (?:other )?readable text", " ", value)
    value = re.sub(r"\d+", "#", value)
    return normalized_text(value)


def quota_for_panels(panel_count: int) -> dict[str, Any]:
    if panel_count < 30:
        return {
            "white": (3, 4), "cards": (2, 3), "fragments": (3, 4), "reactions": (4, 6),
            "longs": (3, 4), "tall": (1, 2), "black": (1, 2), "ramps": (1, 1), "additional": (1, 1), "punctuation": (0.32, 0.40),
        }
    if panel_count <= 37:
        return {
            "white": (4, 5), "cards": (2, 2), "fragments": (3, 4), "reactions": (5, 7),
            "longs": (4, 5), "tall": (1, 2), "black": (1, 2), "ramps": (1, 1), "additional": (1, 1), "punctuation": (0.30, 0.38),
        }
    if panel_count <= 45:
        return {
            "white": (5, 7), "cards": (2, 3), "fragments": (4, 5), "reactions": (6, 8),
            "longs": (5, 6), "tall": (2, 3), "black": (1, 2), "ramps": (1, 1), "additional": (1, 1), "punctuation": (0.32, 0.40),
        }
    if panel_count <= 55:
        return {
            "white": (6, 8), "cards": (3, 4), "fragments": (5, 6), "reactions": (7, 10),
            "longs": (6, 7), "tall": (3, 4), "black": (1, 2), "ramps": (1, 2), "additional": (1, 1), "punctuation": (0.32, 0.40),
        }
    return {
        "white": (math.ceil(panel_count * 0.13), math.ceil(panel_count * 0.17)),
        "cards": (3, 4),
        "fragments": (math.ceil(panel_count * 0.10), math.ceil(panel_count * 0.13)),
        "reactions": (math.ceil(panel_count * 0.15), math.ceil(panel_count * 0.20)),
        "longs": (math.ceil(panel_count * 0.12), math.ceil(panel_count * 0.15)),
        "tall": (max(3, math.ceil(panel_count * 0.06)), max(4, math.ceil(panel_count * 0.08))),
        "black": (1, 2),
        "ramps": (1, 2),
        "additional": (1, 1),
        "punctuation": (0.32, 0.40),
    }


def validate_visual_plan(
    record: dict[str, Any],
    registry: dict[str, dict[str, Any]],
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    scene = record["scene"]
    scene_id = record["id"]
    prompt = record["prompt"]
    raw = scene.get("visual_plan")
    if not isinstance(raw, dict):
        add_issue(issues, "panel_card_rules", "VISUAL_PLAN_MISSING", "Panel necesita visual_plan estructurado.", scene_id)
        raw = {}
    plan = dict(raw)
    required_plan_fields = {
        "story_beat_id", "beat", "narrative_function", "page_layout", "shot_scale", "camera_elevation",
        "viewpoint", "camera_roll", "dominant_subject_id", "location_id", "axis_id", "moment_id",
        "subject_pct", "high_tension", "performances", "long_role", "fragment_subject", "fragment_role",
        "low_density_kind", "action", "approach", "white", "black", "long_scale", "subpanels",
    }
    missing_plan_fields = sorted(required_plan_fields - set(plan))
    unknown_plan_fields = sorted(set(plan) - required_plan_fields)
    if missing_plan_fields or unknown_plan_fields:
        add_issue(
            issues,
            "panel_card_rules",
            "VISUAL_PLAN_FIELDS_INVALID",
            f"visual_plan: faltan {missing_plan_fields}; sobran {unknown_plan_fields}.",
            scene_id,
        )
    legacy_fields = sorted({"angle", "nonfrontal", "human_performance", "reaction_to"} & set(plan))
    if legacy_fields:
        add_issue(
            issues,
            "panel_card_rules",
            "LEGACY_VISUAL_PLAN_FIELDS",
            f"Campos V5.2 prohibidos; use cámara separada y performances[]: {legacy_fields}.",
            scene_id,
        )
    enum_fields: tuple[tuple[str, set[str], str], ...] = (
        ("beat", BEATS, "beat_coverage"),
        ("page_layout", PAGE_LAYOUTS, "panel_card_rules"),
        ("shot_scale", SHOT_SCALES, "shot_present"),
        ("camera_elevation", CAMERA_ELEVATIONS, "camera_present"),
        ("viewpoint", VIEWPOINTS, "camera_present"),
        ("camera_roll", CAMERA_ROLLS, "camera_present"),
        ("long_role", LONG_ROLES, "true_long_shots"),
        ("fragment_subject", FRAGMENT_SUBJECTS, "fragment_range_diversity"),
        ("fragment_role", FRAGMENT_ROLES, "fragment_range_diversity"),
        ("low_density_kind", LOW_DENSITY_KINDS, "visual_punctuation_range_distribution"),
    )
    for field, choices, gate in enum_fields:
        value = plan.get(field)
        if not isinstance(value, str) or value not in choices:
            add_issue(issues, gate, "VISUAL_PLAN_ENUM_INVALID", f"visual_plan.{field} inválido.", scene_id)
            plan[field] = None
    for field in ("dominant_subject_id", "location_id", "axis_id", "moment_id", "story_beat_id", "narrative_function"):
        if not nonempty_text(plan.get(field)):
            add_issue(issues, "panel_card_rules", "VISUAL_PLAN_TEXT_MISSING", f"visual_plan.{field} debe ser texto.", scene_id)
            plan[field] = ""
    subject_pct = plan.get("subject_pct")
    if not is_number(subject_pct) or not 0 <= float(subject_pct) <= 100:
        add_issue(issues, "camera_variety", "SUBJECT_PERCENT_INVALID", "visual_plan.subject_pct debe estar entre 0 y 100.", scene_id)
    if not isinstance(plan.get("high_tension"), bool):
        add_issue(issues, "reaction_range_causality", "HIGH_TENSION_BOOL_REQUIRED", "visual_plan.high_tension debe ser booleano.", scene_id)

    dominant = plan.get("dominant_subject_id")
    dominant_known = isinstance(dominant, str) and dominant in registry
    if nonempty_text(dominant) and dominant not in {"environment", "generic_crowd", "none"} and not dominant_known:
        add_issue(issues, "references_valid_max_three", "DOMINANT_SUBJECT_UNKNOWN", f"Sujeto dominante desconocido: {dominant}.", scene_id)
    raw_performances = plan.get("performances")
    performances: list[dict[str, Any]] = []
    if not isinstance(raw_performances, list):
        add_issue(issues, "reaction_range_causality", "PERFORMANCES_LIST_REQUIRED", "visual_plan.performances debe ser una lista.", scene_id)
    else:
        seen_entities: set[str] = set()
        required_performance_fields = {"entity_id", "mode", "eyes_brows", "mouth_jaw", "body_cue", "reaction_to"}
        for index, item in enumerate(raw_performances):
            label = f"visual_plan.performances[{index}]"
            if not isinstance(item, dict):
                add_issue(issues, "reaction_range_causality", "PERFORMANCE_NOT_OBJECT", f"{label} debe ser objeto.", scene_id)
                continue
            perf = dict(item)
            missing = sorted(required_performance_fields - set(perf))
            unknown = sorted(set(perf) - required_performance_fields)
            if missing or unknown:
                add_issue(issues, "reaction_range_causality", "PERFORMANCE_FIELDS_INVALID", f"{label}: faltan {missing}; sobran {unknown}.", scene_id)
            entity_id = perf.get("entity_id")
            mode = perf.get("mode")
            if not isinstance(entity_id, str) or entity_id not in registry or registry[entity_id].get("asset_type") != "human":
                add_issue(issues, "reaction_range_causality", "PERFORMANCE_ENTITY_INVALID", f"{label}.entity_id debe ser humano conocido.", scene_id)
            elif entity_id in seen_entities:
                add_issue(issues, "reaction_range_causality", "PERFORMANCE_ENTITY_DUPLICATE", f"{entity_id} aparece dos veces en performances[].", scene_id)
            else:
                seen_entities.add(entity_id)
            if not isinstance(mode, str) or mode not in PERFORMANCES:
                add_issue(issues, "reaction_range_causality", "PERFORMANCE_MODE_INVALID", f"{label}.mode inválido.", scene_id)
            active = isinstance(mode, str) and mode != "NONE"
            for cue_field in ("eyes_brows", "mouth_jaw", "body_cue"):
                cue = perf.get(cue_field)
                if active and not nonempty_text(cue):
                    add_issue(issues, "reaction_range_causality", "PERFORMANCE_CUE_MISSING", f"{label}.{cue_field} falta.", scene_id)
                elif not active and cue not in {"", None}:
                    add_issue(issues, "reaction_range_causality", "PERFORMANCE_NONE_HAS_CUE", f"{label} con NONE debe dejar cues vacíos.", scene_id)
                elif active and nonempty_text(cue) and normalized_text(cue) not in normalized_text(prompt):
                    add_issue(issues, "reaction_range_causality", "PERFORMANCE_CUE_NOT_IN_PROMPT", f"{label}.{cue_field} no aparece literalmente en prompt.", scene_id)
            reaction_target = perf.get("reaction_to")
            if enum_contains(mode, REACTION_PERFORMANCES):
                if not nonempty_text(reaction_target):
                    add_issue(issues, "reaction_range_causality", "REACTION_TARGET_MISSING", f"{label} necesita reaction_to.", scene_id)
            elif reaction_target is not None:
                add_issue(issues, "reaction_range_causality", "REACTION_TARGET_ON_NONREACTION", f"{label}.reaction_to solo se usa en REACTION/SHOCK/COST.", scene_id)
            performances.append(perf)
    plan["performances"] = performances

    action = plan.get("action")
    if not isinstance(action, dict):
        add_issue(issues, "action_sequences", "ACTION_PLAN_MISSING", "visual_plan.action debe ser objeto.", scene_id)
        action = {}
    else:
        action = dict(action)
    phase = action.get("phase")
    if not isinstance(phase, str) or phase not in ACTION_PHASES:
        add_issue(issues, "action_sequences", "ACTION_PHASE_INVALID", "visual_plan.action.phase inválida.", scene_id)
        action["phase"] = None
    sequence_id = action.get("sequence_id")
    if action.get("phase") == "NONE":
        if sequence_id is not None:
            add_issue(issues, "action_sequences", "ACTION_SEQUENCE_WITH_NONE", "Una fase NONE debe usar sequence_id null.", scene_id)
    elif not nonempty_text(sequence_id):
        add_issue(issues, "action_sequences", "ACTION_SEQUENCE_MISSING", "Una fase activa necesita sequence_id.", scene_id)
    for field in ("vector_pct",):
        if not is_number(action.get(field)) or not 0 <= float(action.get(field)) <= 100:
            add_issue(issues, "tall_action_range", "ACTION_VECTOR_INVALID", f"visual_plan.action.{field} debe estar entre 0 y 100.", scene_id)
    for field in ("origin_third", "destination_third"):
        if action.get(field) not in THIRDS:
            add_issue(issues, "tall_action_range", "ACTION_THIRD_INVALID", f"visual_plan.action.{field} inválido.", scene_id)

    plan["action"] = action
    approach = plan.get("approach")
    if not isinstance(approach, dict):
        add_issue(issues, "approach_ramp_and_additional", "APPROACH_PLAN_MISSING", "visual_plan.approach debe ser objeto.", scene_id)
        approach = {}
    else:
        approach = dict(approach)
    stage = approach.get("stage")
    ramp_id = approach.get("ramp_id")
    direction = approach.get("direction")
    if not isinstance(stage, str) or stage not in APPROACH_STAGES:
        add_issue(issues, "approach_ramp_and_additional", "APPROACH_STAGE_INVALID", "visual_plan.approach.stage inválido.", scene_id)
        approach["stage"] = None
    elif stage == "NONE":
        if ramp_id is not None or direction not in {"", None}:
            add_issue(issues, "approach_ramp_and_additional", "APPROACH_NONE_DIRTY", "Approach NONE usa ramp_id null y direction vacía.", scene_id)
    elif not nonempty_text(ramp_id) or not nonempty_text(direction):
        add_issue(issues, "approach_ramp_and_additional", "APPROACH_METADATA_MISSING", "Approach activo necesita ramp_id y direction.", scene_id)
        approach["ramp_id"] = None
        approach["direction"] = ""

    plan["approach"] = approach
    layout = plan.get("page_layout")
    white = plan.get("white")
    if layout in WHITE_LAYOUTS:
        if not isinstance(white, dict):
            add_issue(issues, "white_page_range", "WHITE_PLAN_MISSING", "Layout blanco necesita visual_plan.white.", scene_id)
            white = {}
        white_pct = white.get("canvas_pct")
        panel_count = white.get("panel_count")
        composition = white.get("composition")
        if not is_number(white_pct):
            add_issue(issues, "white_page_range", "WHITE_PERCENT_INVALID", "white.canvas_pct debe ser numérico.", scene_id)
            white_pct = -1
        if not isinstance(composition, str) or composition not in WHITE_COMPOSITIONS:
            add_issue(issues, "white_page_range", "WHITE_COMPOSITION_INVALID", "white.composition debe usar el enum V5.3.", scene_id)
        expected_panels = 2 if layout in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"} else 1
        if panel_count != expected_panels:
            add_issue(issues, "white_page_range", "WHITE_PANEL_COUNT_INVALID", f"{layout} exige {expected_panels} viñeta(s).", scene_id)
        ranges = {
            "WHITE_INSET": (32, 60),
            "WHITE_COMPOSITE_2": (35, 60),
            "WHITE_ISOLATE": (55, 90),
            "WHITE_FRAGMENT": (60, 90),
            "WHITE_ACTION_STRIP_2": (35, 60),
        }
        low, high = ranges.get(str(layout), (0, 100))
        if not is_number(white_pct) or not low <= float(white_pct) <= high:
            add_issue(issues, "white_page_range", "WHITE_PERCENT_OUT_OF_RANGE", f"{layout} exige blanco {low}–{high}%.", scene_id)
        if not WHITE_PAGE_RE.search(prompt) or not WHITE_SPACE_RE.search(prompt):
            add_issue(issues, "white_page_range", "WHITE_PROMPT_MARKERS_MISSING", "Prompt blanco necesita página blanca y espacio blanco explícitos.", scene_id)
        if re.search(r"\b(?:asset sheet|character sheet|three[- ]panel|3[- ]panel|painted background|universal rim light)\b", prompt, re.I):
            add_issue(issues, "white_page_range", "WHITE_PROMPT_FORBIDDEN", "Prompt blanco contiene asset sheet, tercera viñeta o fondo prohibido.", scene_id)
        if layout == "WHITE_INSET" and not re.search(r"\b(?:one|single)\b[\s\S]{0,90}\b(?:panel|inset|frame)\b", prompt, re.I):
            add_issue(issues, "white_page_range", "WHITE_INSET_MARKER_MISSING", "WHITE_INSET necesita una sola viñeta.", scene_id)
        if layout in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"} and not re.search(r"\bexactly two\b[\s\S]{0,80}\b(?:panels|frames|insets)\b", prompt, re.I):
            add_issue(issues, "white_page_range", "WHITE_TWO_MARKER_MISSING", f"{layout} necesita exactamente dos viñetas.", scene_id)
        if layout == "WHITE_ISOLATE" and not re.search(r"\b(?:isolated|single figure|single bust|single silhouette)\b", prompt, re.I):
            add_issue(issues, "white_page_range", "WHITE_ISOLATE_MARKER_MISSING", "WHITE_ISOLATE necesita figura/busto/silueta aislada.", scene_id)
        if layout == "WHITE_FRAGMENT" and plan.get("fragment_subject") == "NONE":
            add_issue(issues, "fragment_range_diversity", "WHITE_FRAGMENT_NOT_FRAGMENT", "WHITE_FRAGMENT necesita fragment_subject causal.", scene_id)
    elif white is not None:
        add_issue(issues, "white_page_range", "WHITE_PLAN_ON_NONWHITE", "Solo layouts blancos pueden contener visual_plan.white.", scene_id)

    raw_subpanels = plan.get("subpanels")
    composite_layout = layout in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}
    if composite_layout:
        if not isinstance(raw_subpanels, list) or len(raw_subpanels) != 2:
            add_issue(issues, "white_page_range", "SUBPANELS_TWO_REQUIRED", f"{layout} exige subpanels[] con A y B.", scene_id)
            raw_subpanels = []
        normalized_subpanels: list[dict[str, Any]] = []
        required_subpanel_fields = {
            "subpanel_id", "moment_id", "shot_scale", "camera_elevation", "viewpoint", "camera_roll",
            "dominant_subject_id", "performances", "action_phase",
        }
        for index, item in enumerate(raw_subpanels):
            label = f"visual_plan.subpanels[{index}]"
            if not isinstance(item, dict):
                add_issue(issues, "white_page_range", "SUBPANEL_NOT_OBJECT", f"{label} debe ser objeto.", scene_id)
                continue
            subpanel = dict(item)
            missing = sorted(required_subpanel_fields - set(subpanel))
            unknown = sorted(set(subpanel) - required_subpanel_fields)
            if missing or unknown:
                add_issue(issues, "white_page_range", "SUBPANEL_FIELDS_INVALID", f"{label}: faltan {missing}; sobran {unknown}.", scene_id)
            wanted_id = "A" if index == 0 else "B"
            if subpanel.get("subpanel_id") != wanted_id:
                add_issue(issues, "white_page_range", "SUBPANEL_ID_INVALID", f"{label}.subpanel_id debe ser {wanted_id}.", scene_id)
            if not nonempty_text(subpanel.get("moment_id")):
                add_issue(issues, "white_page_range", "SUBPANEL_MOMENT_MISSING", f"{label}.moment_id falta.", scene_id)
            for field, choices in (
                ("shot_scale", SHOT_SCALES),
                ("camera_elevation", CAMERA_ELEVATIONS),
                ("viewpoint", VIEWPOINTS),
                ("camera_roll", CAMERA_ROLLS),
                ("action_phase", ACTION_PHASES),
            ):
                if not isinstance(subpanel.get(field), str) or subpanel.get(field) not in choices:
                    add_issue(issues, "white_page_range", "SUBPANEL_ENUM_INVALID", f"{label}.{field} inválido.", scene_id)
            section_pattern = (
                r"Panel\s+A\s*:\s*([\s\S]*?)(?=Panel\s+B\s*:|$)"
                if wanted_id == "A"
                else r"Panel\s+B\s*:\s*([\s\S]*?)$"
            )
            section_match = re.search(section_pattern, prompt, re.I)
            if not section_match:
                add_issue(issues, "white_page_range", "SUBPANEL_PROMPT_SECTION_MISSING", f"Prompt necesita sección literal Panel {wanted_id}:.", scene_id)
            else:
                section = section_match.group(1)
                camera_checks = (
                    prompt_has_scale(section, str(subpanel.get("shot_scale"))),
                    prompt_has_elevation(section, str(subpanel.get("camera_elevation"))),
                    prompt_has_viewpoint(section, str(subpanel.get("viewpoint"))),
                    prompt_has_roll(section, str(subpanel.get("camera_roll"))),
                )
                if not all(camera_checks):
                    add_issue(issues, "camera_present", "SUBPANEL_CAMERA_PROMPT_MISMATCH", f"Panel {wanted_id} no demuestra escala/elevación/viewpoint/roll.", scene_id)
            dominant_sub = subpanel.get("dominant_subject_id")
            if (
                not nonempty_text(dominant_sub)
                or dominant_sub not in registry | {"environment": {}}
            ):
                add_issue(issues, "white_page_range", "SUBPANEL_SUBJECT_INVALID", f"{label}.dominant_subject_id es desconocido.", scene_id)
            sub_performances = subpanel.get("performances")
            if not isinstance(sub_performances, list):
                add_issue(issues, "reaction_range_causality", "SUBPANEL_PERFORMANCES_INVALID", f"{label}.performances debe ser lista.", scene_id)
                sub_performances = []
            seen_sub_humans: set[str] = set()
            for perf_index, perf in enumerate(sub_performances):
                perf_label = f"{label}.performances[{perf_index}]"
                required_perf = {"entity_id", "mode", "eyes_brows", "mouth_jaw", "body_cue", "reaction_to"}
                if not isinstance(perf, dict) or set(perf) != required_perf:
                    add_issue(issues, "reaction_range_causality", "SUBPANEL_PERFORMANCE_FIELDS", f"{perf_label} no cumple schema.", scene_id)
                    continue
                entity_id, mode = perf.get("entity_id"), perf.get("mode")
                if entity_id in seen_sub_humans or entity_id not in registry or registry[str(entity_id)].get("asset_type") != "human":
                    add_issue(issues, "reaction_range_causality", "SUBPANEL_PERFORMANCE_ENTITY", f"{perf_label}.entity_id inválido/duplicado.", scene_id)
                elif isinstance(entity_id, str):
                    seen_sub_humans.add(entity_id)
                if not enum_contains(mode, PERFORMANCES):
                    add_issue(issues, "reaction_range_causality", "SUBPANEL_PERFORMANCE_MODE", f"{perf_label}.mode inválido.", scene_id)
                active = isinstance(mode, str) and mode != "NONE"
                for cue_field in ("eyes_brows", "mouth_jaw", "body_cue"):
                    cue = perf.get(cue_field)
                    if active and not nonempty_text(cue):
                        add_issue(issues, "reaction_range_causality", "SUBPANEL_PERFORMANCE_CUE", f"{perf_label}.{cue_field} falta.", scene_id)
                    elif active and section_match and normalized_text(cue) not in normalized_text(section_match.group(1)):
                        add_issue(issues, "reaction_range_causality", "SUBPANEL_CUE_NOT_IN_PROMPT", f"{perf_label}.{cue_field} no aparece en Panel {wanted_id}.", scene_id)
                if enum_contains(mode, REACTION_PERFORMANCES) and not nonempty_text(perf.get("reaction_to")):
                    add_issue(issues, "reaction_range_causality", "SUBPANEL_REACTION_TARGET", f"{perf_label} necesita reaction_to.", scene_id)
                elif isinstance(mode, str) and mode not in REACTION_PERFORMANCES and perf.get("reaction_to") is not None:
                    add_issue(issues, "reaction_range_causality", "SUBPANEL_REACTION_TARGET", f"{perf_label}.reaction_to sobra.", scene_id)
            if dominant_sub in registry and registry[str(dominant_sub)].get("asset_type") == "human" and dominant_sub not in seen_sub_humans:
                add_issue(issues, "reaction_range_causality", "SUBPANEL_DOMINANT_PERFORMANCE_MISSING", f"Humano dominante {dominant_sub} debe estar en performances[].", scene_id)
            normalized_subpanels.append(subpanel)
        if len(normalized_subpanels) == 2:
            if normalized_subpanels[0].get("moment_id") == normalized_subpanels[1].get("moment_id"):
                add_issue(issues, "white_page_range", "SUBPANEL_MOMENTS_DUPLICATE", "A y B deben representar instantes distintos.", scene_id)
            if layout == "WHITE_ACTION_STRIP_2":
                phases = [item.get("action_phase") for item in normalized_subpanels]
                if not all(isinstance(phase, str) for phase in phases) or tuple(phases) not in {
                    ("ANTICIPATION", "TRAJECTORY"), ("CONSEQUENCE", "REACTION")
                }:
                    add_issue(issues, "action_sequences", "ACTION_STRIP_PHASE_ORDER", "WHITE_ACTION_STRIP_2 solo admite ANTICIPATION→TRAJECTORY o CONSEQUENCE→REACTION.", scene_id)
                if action.get("phase") in {"TRAJECTORY", "CONTACT"}:
                    add_issue(issues, "action_sequences", "ACTION_STRIP_MAJOR_PHASE", "La tira no puede sustituir TRAJECTORY ni CONTACT del chain exterior.", scene_id)
        plan["subpanels"] = normalized_subpanels
    elif raw_subpanels != []:
        add_issue(issues, "white_page_range", "SUBPANELS_EMPTY_REQUIRED", "Layouts no composite deben declarar subpanels: [].", scene_id)

    black = plan.get("black")
    if layout == "BLACK_INSET":
        if not isinstance(black, dict) or not is_number(black.get("canvas_pct")) or float(black.get("canvas_pct", 0)) < 50:
            add_issue(issues, "visual_punctuation_range_distribution", "BLACK_INSET_PERCENT", "BLACK_INSET necesita black.canvas_pct >= 50.", scene_id)
        if not BLACK_PAGE_RE.search(prompt) or not re.search(r"\b(?:inset|small panel|small frame)\b", prompt, re.I):
            add_issue(issues, "visual_punctuation_range_distribution", "BLACK_INSET_MARKERS", "BLACK_INSET necesita página negra e inset pequeño.", scene_id)
    elif black is not None:
        add_issue(issues, "visual_punctuation_range_distribution", "BLACK_PLAN_ON_OTHER_LAYOUT", "Solo BLACK_INSET puede contener visual_plan.black.", scene_id)

    scale = plan.get("shot_scale")
    if scale in SHOT_SCALES and not prompt_has_scale(prompt, str(scale)):
        add_issue(issues, "shot_present", "SHOT_SCALE_PROMPT_MISMATCH", f"Prompt no demuestra shot_scale {scale}.", scene_id)
    elevation = plan.get("camera_elevation")
    viewpoint = plan.get("viewpoint")
    roll = plan.get("camera_roll")
    if elevation in CAMERA_ELEVATIONS and not prompt_has_elevation(prompt, str(elevation)):
        add_issue(issues, "camera_present", "ELEVATION_PROMPT_MISMATCH", f"Prompt no demuestra camera_elevation {elevation}.", scene_id)
    if viewpoint in VIEWPOINTS and not prompt_has_viewpoint(prompt, str(viewpoint)):
        add_issue(issues, "camera_present", "VIEWPOINT_PROMPT_MISMATCH", f"Prompt no demuestra viewpoint {viewpoint}.", scene_id)
    if roll in CAMERA_ROLLS and not prompt_has_roll(prompt, str(roll)):
        add_issue(issues, "camera_present", "ROLL_PROMPT_MISMATCH", f"Prompt no demuestra camera_roll {roll}.", scene_id)
    if not TIME_RE.search(prompt):
        add_issue(issues, "time_present", "TIME_MISSING", "Prompt necesita hora del día explícita.", scene_id)

    long_scale = plan.get("long_scale")
    if scale == "TRUE_LONG":
        if not isinstance(long_scale, dict):
            add_issue(issues, "true_long_shots", "TRUE_LONG_PLAN_MISSING", "TRUE_LONG necesita visual_plan.long_scale.", scene_id)
            long_scale = {}
        numeric_checks = {"distance_m": (12, 30), "environment_pct": (70, 100)}
        for field, (low, high) in numeric_checks.items():
            value = long_scale.get(field)
            if not is_number(value) or not low <= float(value) <= high:
                add_issue(issues, "true_long_shots", "TRUE_LONG_NUMBER_INVALID", f"long_scale.{field} debe estar entre {low} y {high}.", scene_id)
        if not is_number(subject_pct) or not 8 <= float(subject_pct) <= 22:
            add_issue(issues, "true_long_shots", "TRUE_LONG_SUBJECT_SIZE", "TRUE_LONG exige subject_pct 8–22.", scene_id)
        for field in ("full_body", "air", "ground_contact", "three_layers", "relative_scale"):
            if long_scale.get(field) is not True:
                add_issue(issues, "true_long_shots", "TRUE_LONG_FLAG_MISSING", f"long_scale.{field} debe ser true.", scene_id)
        if plan.get("long_role") == "NONE":
            add_issue(issues, "true_long_shots", "TRUE_LONG_ROLE_MISSING", "TRUE_LONG necesita long_role.", scene_id)
        evidence = (
            re.search(r"\b(?:complete|full)[- ]body\b", prompt, re.I),
            all(re.search(rf"\b{layer}\b", prompt, re.I) for layer in ("foreground", "midground", "background")),
            re.search(r"\b(?:ground plane|feet on|contact with the ground|standing on)\b", prompt, re.I),
            re.search(r"\b(?:air|open space|breathing room)\b", prompt, re.I),
            re.search(r"\b(?:relative scale|dwarfed by|proportion)\b", prompt, re.I),
        )
        if not all(evidence):
            add_issue(issues, "true_long_shots", "TRUE_LONG_PROMPT_EVIDENCE", "TRUE_LONG no expresa cuerpo, capas, suelo, aire y escala relativa.", scene_id)
    else:
        if long_scale is not None or plan.get("long_role") not in {None, "NONE"}:
            add_issue(issues, "true_long_shots", "TRUE_LONG_METADATA_ON_OTHER_SHOT", "Solo TRUE_LONG usa long_scale/long_role.", scene_id)

    if layout == "TALL_ACTION":
        action_phase = action.get("phase")
        if scale not in {"FULL", "WIDE_MASTER", "TRUE_LONG"} or action_phase not in {"TRAJECTORY", "CONTACT"}:
            add_issue(issues, "tall_action_range", "TALL_ACTION_SCALE_PHASE", "TALL_ACTION exige FULL/WIDE/TRUE_LONG y TRAJECTORY/CONTACT.", scene_id)
        if not is_number(action.get("vector_pct")) or float(action.get("vector_pct", 0)) < 60:
            add_issue(issues, "tall_action_range", "TALL_ACTION_VECTOR", "TALL_ACTION exige vector >=60%.", scene_id)
        if action.get("origin_third") == action.get("destination_third") or "NONE" in {action.get("origin_third"), action.get("destination_third")}:
            add_issue(issues, "tall_action_range", "TALL_ACTION_THIRDS", "TALL_ACTION necesita origen y destino en tercios distintos.", scene_id)
        if not re.search(r"\b(?:tall action|full[- ]height action|vertical action)\b", prompt, re.I) or not re.search(r"\b(?:trajectory|movement vector|force vector|motion vector)\b", prompt, re.I):
            add_issue(issues, "tall_action_range", "TALL_ACTION_PROMPT_EVIDENCE", "Prompt TALL_ACTION no demuestra layout y vector.", scene_id)
    elif is_number(action.get("vector_pct")) and float(action.get("vector_pct", 0)) >= 60:
        add_issue(issues, "tall_action_range", "TALL_VECTOR_WITHOUT_LAYOUT", "Vector >=60% requiere page_layout TALL_ACTION.", scene_id)

    fragment_subject = plan.get("fragment_subject")
    fragment_role = plan.get("fragment_role")
    if fragment_subject != "NONE":
        if scale not in {"MACRO", "EXTREME_CLOSE"} or fragment_role == "NONE":
            add_issue(issues, "fragment_range_diversity", "FRAGMENT_STRUCTURE_INVALID", "Fragmento exige MACRO/EXTREME_CLOSE y fragment_role causal.", scene_id)
        if re.search(r"\b(?:full face|entire face|complete face)\b", prompt, re.I):
            add_issue(issues, "fragment_range_diversity", "FRAGMENT_FULL_FACE", "Fragmento no puede mostrar rostro completo.", scene_id)
    elif fragment_role not in {None, "NONE"}:
        add_issue(issues, "fragment_range_diversity", "FRAGMENT_ROLE_WITHOUT_SUBJECT", "fragment_role necesita fragment_subject.", scene_id)

    if plan.get("high_tension") and any(
        enum_contains(performance_item.get("mode"), {"NONE", "NEUTRAL_INTENTIONAL"}) for performance_item in performances
    ):
        add_issue(issues, "reaction_range_causality", "HIGH_TENSION_NEUTRAL", "Alta tensión no puede usar actuación neutral.", scene_id)

    if not NO_TEXT_RE.search(prompt):
        add_issue(issues, "prompt_grammar", "NO_TEXT_DIRECTIVE_MISSING", "Prompt debe cerrar con no readable text/no other readable text.", scene_id)
    if not all(part.search(prompt) for part in STYLE_PARTS):
        add_issue(issues, "prompt_grammar", "STYLE_ANCHOR_INCOMPLETE", "Prompt carece del ancla manhwa V5.3 completa.", scene_id)
    first_sentence = prompt.split(".", 1)[0]
    if re.match(r"\s*(?:he|she|they|it|camera|shot|panel)\b", first_sentence, re.I) or not ACTION_VERB_RE.search(first_sentence):
        add_issue(issues, "prompt_grammar", "SUBJECT_VERB_FIRST", "Prompt debe comenzar con sujeto explícito + verbo de acción.", scene_id)
    if layout not in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"} and re.search(r"\b(?:then|afterward|while also|before and after)\b", prompt, re.I):
        add_issue(issues, "prompt_grammar", "MULTI_MOMENT_PROMPT", "Panel debe representar un solo instante.", scene_id)
    if layout not in WHITE_LAYOUTS and not (LIGHT_SOURCE_RE.search(prompt) and LIGHT_DIRECTION_RE.search(prompt)):
        add_issue(issues, "prompt_grammar", "LIGHTING_INCOMPLETE", "Prompt necesita fuente y dirección de luz.", scene_id)
    language_probe = without_quoted_text(prompt)
    if SPANISH_FUNCTION_RE.search(language_probe):
        add_issue(issues, "prompt_english", "PROMPT_NOT_ENGLISH", "Prompt contiene vocabulario funcional español fuera de texto literal.", scene_id)

    words = prompt_words(prompt)
    complex_prompt = (
        layout == "TALL_ACTION"
        or scale == "TRUE_LONG"
        or action.get("phase") != "NONE"
        or len(as_list(as_dict(scene.get("continuity")).get("visible_entities"))) >= 2
    )
    if fragment_subject != "NONE" or layout == "WHITE_FRAGMENT":
        low, high, band = 45, 75, "fragment"
    elif layout in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}:
        low, high, band = 75, 110, "white_composite"
    elif layout in WHITE_LAYOUTS:
        low, high, band = 55, 85, "white_simple"
    elif complex_prompt:
        low, high, band = 80, 115, "complex"
    else:
        low, high, band = 60, 95, "standard"
    record["prompt_band"] = {"name": band, "minimum": low, "maximum": high, "words": words}
    if words < low or words > high or words > 120:
        add_issue(issues, "prompt_length", "PROMPT_LENGTH_INVALID", f"Prompt {band} tiene {words} palabras; rango {low}–{high}.", scene_id)
    return plan


def validate_continuity_block(
    record: dict[str, Any],
    registry: dict[str, dict[str, Any]],
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    scene = record["scene"]
    scene_id = record["id"]
    plan = record.get("plan", {})
    raw = scene.get("continuity")
    if not isinstance(raw, dict):
        add_issue(issues, "continuity", "CONTINUITY_MISSING", "Panel necesita bloque continuity.", scene_id)
        return {}
    continuity = dict(raw)
    required_continuity_fields = {
        "location_id", "axis_id", "time", "light_state", "space_type", "transition_bridge",
        "light_change_reason", "visible_entities", "state_before", "atomic_action", "state_change_reason", "state_after",
    }
    missing_fields = sorted(required_continuity_fields - set(continuity))
    unknown_fields = sorted(set(continuity) - required_continuity_fields)
    if missing_fields or unknown_fields:
        add_issue(issues, "continuity", "CONTINUITY_FIELDS_INVALID", f"continuity: faltan {missing_fields}; sobran {unknown_fields}.", scene_id)
    for field in ("location_id", "time", "light_state", "axis_id"):
        if not nonempty_text(continuity.get(field)):
            add_issue(issues, "continuity", "CONTINUITY_TEXT_MISSING", f"continuity.{field} debe ser texto.", scene_id)
    if not isinstance(continuity.get("space_type"), str) or continuity.get("space_type") not in SPACE_TYPES:
        add_issue(issues, "continuity", "SPACE_TYPE_INVALID", "continuity.space_type inválido.", scene_id)
        continuity["space_type"] = None
    for field in ("transition_bridge",):
        if not isinstance(continuity.get(field), bool):
            add_issue(issues, "continuity", "CONTINUITY_BOOL_REQUIRED", f"continuity.{field} debe ser booleano.", scene_id)
    for field in ("light_change_reason",):
        if not isinstance(continuity.get(field), str):
            add_issue(issues, "continuity", "CONTINUITY_REASON_TYPE", f"continuity.{field} debe ser texto, aunque esté vacío.", scene_id)
    if continuity.get("location_id") != plan.get("location_id") or continuity.get("axis_id") != plan.get("axis_id"):
        add_issue(issues, "continuity", "PLAN_CONTINUITY_LOCATION_CONFLICT", "location_id/axis_id difieren entre visual_plan y continuity.", scene_id)
    time_value = continuity.get("time")
    if nonempty_text(time_value) and str(time_value).lower() not in record["prompt"].lower():
        add_issue(issues, "time_present", "TIME_PLAN_PROMPT_MISMATCH", "continuity.time no aparece literalmente en el prompt.", scene_id)

    visible = continuity.get("visible_entities")
    if not isinstance(visible, list) or any(not isinstance(value, str) for value in visible) or len(visible) != len(set(visible)):
        add_issue(issues, "continuity", "VISIBLE_ENTITIES_INVALID", "visible_entities debe ser lista única de IDs.", scene_id)
        visible_ids: list[str] = []
    else:
        visible_ids = visible
    continuity["visible_entities"] = visible_ids
    for entity_id in visible_ids:
        if entity_id not in registry:
            add_issue(issues, "continuity", "VISIBLE_ENTITY_UNKNOWN", f"Entidad visible desconocida: {entity_id}.", scene_id)
    dominant = plan.get("dominant_subject_id")
    if dominant in registry and dominant not in visible_ids:
        add_issue(issues, "continuity", "DOMINANT_NOT_VISIBLE", "Sujeto dominante no figura en visible_entities.", scene_id)

    before = continuity.get("state_before")
    after = continuity.get("state_after")
    reasons = continuity.get("state_change_reason")
    if not isinstance(before, dict) or not isinstance(after, dict) or not isinstance(reasons, dict):
        add_issue(issues, "continuity", "STATE_MAP_INVALID", "state_before, state_after y state_change_reason deben ser objetos.", scene_id)
        before, after, reasons = {}, {}, {}
    continuity["state_before"], continuity["state_after"], continuity["state_change_reason"] = before, after, reasons
    if set(before) != set(after):
        add_issue(issues, "continuity", "STATE_MAP_KEYS_MISMATCH", "state_before y state_after deben declarar las mismas claves.", scene_id)
    for state_key in set(before) | set(after):
        changed = before.get(state_key) != after.get(state_key)
        if changed and not nonempty_text(reasons.get(state_key)):
            add_issue(issues, "continuity", "STATE_CHANGE_REASON_MISSING", f"Cambio de {state_key} carece de causa.", scene_id)
        # Un cambio contractual puede reafirmar un invariante (p. ej. mismo ocupante
        # mientras la cápsula se abre); el chequeo global valida esa causa exacta.

    atomic = continuity.get("atomic_action")
    atomic_fields = {"actor_id", "verb", "target_id", "origin", "trajectory_or_contact", "destination", "result"}
    if not isinstance(atomic, dict) or set(atomic) != atomic_fields or any(not nonempty_text(atomic.get(field)) for field in atomic_fields):
        add_issue(issues, "continuity", "ATOMIC_ACTION_INVALID", "atomic_action exige siete campos de texto no vacío.", scene_id)
        continuity["atomic_action"] = {}
    return continuity


def validate_references(
    records: list[dict[str, Any]],
    registry: dict[str, dict[str, Any]],
    pose_roles: dict[tuple[str, str], str],
    scenarios: dict[str, dict[str, Any]],
    issues: list[dict[str, Any]],
) -> int:
    id_map = {record["id"]: record for record in records if record["valid_id"]}
    index_map = {record["id"]: record["index"] for record in records if record["valid_id"]}
    max_references = 0
    scene_ref_run = 0
    for record in records:
        scene = record["scene"]
        scene_id = record["id"]
        if record["type"] != "panel":
            scene_ref_run = 0
            continue
        refs_raw = scene.get("references", {})
        if not isinstance(refs_raw, dict):
            add_issue(issues, "references_valid_max_three", "REFERENCES_NOT_OBJECT", "references debe ser objeto.", scene_id)
            refs = {}
        else:
            refs = refs_raw
        unknown_keys = set(refs) - {"characters", "assets", "escenario", "scenes"}
        if unknown_keys:
            add_issue(issues, "references_valid_max_three", "REFERENCE_KEYS_UNKNOWN", f"Claves de referencia no permitidas: {sorted(unknown_keys)}.", scene_id)
        direct_ids: set[str] = set()
        total = 0
        for group in ("characters", "assets"):
            entries = refs.get(group, [])
            if not isinstance(entries, list):
                add_issue(issues, "references_valid_max_three", "REFERENCE_GROUP_NOT_ARRAY", f"references.{group} debe ser arreglo.", scene_id)
                entries = []
            total += len(entries)
            for ref in entries:
                if not isinstance(ref, dict) or not isinstance(ref.get("id"), str) or not isinstance(ref.get("pose"), str):
                    add_issue(issues, "references_valid_max_three", "REFERENCE_ENTRY_INVALID", f"Entrada inválida en references.{group}.", scene_id)
                    continue
                item_id, pose_id = ref["id"], ref["pose"]
                direct_ids.add(item_id)
                item = registry.get(item_id)
                if item is None:
                    add_issue(issues, "references_valid_max_three", "REFERENCE_ID_UNKNOWN", f"Asset desconocido: {item_id}.", scene_id)
                    continue
                asset_type = item.get("asset_type")
                if group == "characters" and asset_type != "human":
                    add_issue(issues, "references_valid_max_three", "REFERENCE_GROUP_KIND", f"{item_id} no es human y no va en characters.", scene_id)
                if group == "assets" and asset_type == "human":
                    add_issue(issues, "references_valid_max_three", "REFERENCE_GROUP_KIND", f"{item_id} es human y no va en assets.", scene_id)
                if pose_id not in as_dict(item.get("poses")):
                    add_issue(issues, "references_valid_max_three", "REFERENCE_POSE_UNKNOWN", f"Pose desconocida: {item_id}.{pose_id}.", scene_id)
        scenario_ref = refs.get("escenario")
        if scenario_ref is not None:
            total += 1
            if not isinstance(scenario_ref, dict) or not isinstance(scenario_ref.get("id"), str) or not isinstance(scenario_ref.get("view"), str):
                add_issue(issues, "references_valid_max_three", "SCENARIO_REFERENCE_INVALID", "references.escenario debe tener id y view.", scene_id)
            else:
                scenario = scenarios.get(scenario_ref["id"])
                if scenario is None or scenario_ref["view"] not in as_dict(scenario.get("views")):
                    add_issue(issues, "references_valid_max_three", "SCENARIO_REFERENCE_UNKNOWN", "Escenario o view inexistente.", scene_id)
        scene_refs = refs.get("scenes", [])
        if not isinstance(scene_refs, list):
            add_issue(issues, "references_valid_max_three", "SCENE_REFERENCES_NOT_ARRAY", "references.scenes debe ser arreglo.", scene_id)
            scene_refs = []
        total += len(scene_refs)
        inherited: set[str] = set()
        inherited_performance: set[str] = set()
        if scene_refs and not re.search(
            r"\bSame exact moment and same character positions as the scene reference, now seen from\b",
            record.get("prompt", ""),
            re.I,
        ):
            add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_PROMPT_FORMULA", "Prompt con references.scenes necesita fórmula canónica same-moment.", scene_id)
        for ref in scene_refs:
            if not isinstance(ref, dict) or not isinstance(ref.get("scene_id"), str):
                add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_INVALID", "Cada scene reference necesita scene_id.", scene_id)
                continue
            target_id = ref["scene_id"]
            target = id_map.get(target_id)
            if target is None or index_map.get(target_id, record["index"]) >= record["index"]:
                add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_NOT_PRIOR", f"{target_id} no existe o no es anterior.", scene_id)
                continue
            inherited.update(as_list(target.get("continuity", {}).get("visible_entities")))
            target_refs = as_dict(target.get("scene", {}).get("references"))
            for target_character_ref in as_list(target_refs.get("characters")):
                if not isinstance(target_character_ref, dict):
                    continue
                inherited_id = target_character_ref.get("id")
                inherited_pose = target_character_ref.get("pose")
                if (
                    isinstance(inherited_id, str)
                    and isinstance(inherited_pose, str)
                    and pose_roles.get((inherited_id, inherited_pose)) == "performance"
                ):
                    inherited_performance.add(inherited_id)
            current_plan, target_plan = record.get("plan", {}), target.get("plan", {})
            if current_plan.get("moment_id") != target_plan.get("moment_id"):
                add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_MOMENT", "Scene reference debe conservar moment_id.", scene_id)
            camera_fields = ("camera_elevation", "viewpoint", "camera_roll")
            if all(current_plan.get(field) == target_plan.get(field) for field in camera_fields):
                add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_SAME_CAMERA", "Scene reference necesita cambiar elevación, viewpoint o roll.", scene_id)
            if current_plan.get("location_id") != target_plan.get("location_id") or current_plan.get("axis_id") != target_plan.get("axis_id"):
                add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_GEOGRAPHY", "Scene reference debe conservar lugar y eje.", scene_id)
        scene_ref_run = scene_ref_run + 1 if scene_refs else 0
        if scene_ref_run >= 3:
            add_issue(issues, "references_valid_max_three", "SCENE_REFERENCE_CHAIN", "No se permiten tres escenas consecutivas con scene reference.", scene_id)
        max_references = max(max_references, total)
        if total > 3:
            add_issue(issues, "references_valid_max_three", "REFERENCE_LIMIT", f"La escena usa {total} referencias; máximo 3.", scene_id)
        visible = set(as_list(record.get("continuity", {}).get("visible_entities")))
        if not direct_ids.issubset(visible):
            add_issue(issues, "references_valid_max_three", "REFERENCE_NOT_VISIBLE", f"Referencias no visibles: {sorted(direct_ids - visible)}.", scene_id)
        if not visible.issubset(direct_ids | inherited):
            add_issue(issues, "references_valid_max_three", "VISIBLE_ENTITY_UNREFERENCED", f"Entidades visibles sin referencia: {sorted(visible - direct_ids - inherited)}.", scene_id)
        all_performances = list(as_list(record.get("plan", {}).get("performances")))
        for subpanel in as_list(record.get("plan", {}).get("subpanels")):
            if isinstance(subpanel, dict):
                all_performances.extend(as_list(subpanel.get("performances")))
        for performance in all_performances:
            if not isinstance(performance, dict) or not isinstance(performance.get("mode"), str) or performance.get("mode") in {"NONE", "NEUTRAL_INTENTIONAL"}:
                continue
            entity_id = performance.get("entity_id")
            entity_refs = [ref for ref in as_list(refs.get("characters")) if isinstance(ref, dict) and ref.get("id") == entity_id]
            direct_performance = bool(entity_refs) and pose_roles.get((str(entity_id), str(entity_refs[0].get("pose")))) == "performance"
            if not direct_performance and entity_id not in inherited_performance:
                add_issue(issues, "asset_registry", "PERFORMANCE_POSE_REQUIRED", f"Humano activo {entity_id} necesita referencia pose_role=performance.", scene_id)
    return max_references


def build_scene_records(
    data: dict[str, Any],
    registry: dict[str, dict[str, Any]],
    issues: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    raw_scenes = data.get("scenes")
    if not isinstance(raw_scenes, list):
        add_issue(issues, "scene_structure", "SCENES_NOT_ARRAY", "scenes debe ser un arreglo.")
        return []
    records: list[dict[str, Any]] = []
    ids: list[str] = []
    sort_keys: list[tuple[int, str]] = []
    for index, raw in enumerate(raw_scenes):
        if not isinstance(raw, dict):
            add_issue(issues, "scene_structure", "SCENE_NOT_OBJECT", f"scenes[{index}] debe ser objeto.")
            continue
        scene_id_value = raw.get("id")
        valid_id = isinstance(scene_id_value, str) and scene_sort_key(scene_id_value) is not None
        scene_id = scene_id_value if isinstance(scene_id_value, str) else f"<index:{index}>"
        if not valid_id:
            add_issue(issues, "scene_structure", "SCENE_ID_INVALID", "ID debe usar scene_NN o scene_NNa.", scene_id)
        else:
            ids.append(scene_id)
            sort_keys.append(scene_sort_key(scene_id) or (0, ""))
        scene_type = raw.get("type")
        if not isinstance(scene_type, str) or scene_type not in SCENE_TYPES:
            add_issue(issues, "scene_structure", "SCENE_TYPE_INVALID", "type debe ser panel o narrative_card.", scene_id)
            scene_type = None
        voice = raw.get("voiceover")
        if not isinstance(voice, dict) or not nonempty_text(voice.get("text")):
            add_issue(issues, "scene_structure", "VOICEOVER_TEXT_INVALID", "voiceover.text debe ser texto no vacío.", scene_id)
        record = {
            "index": index,
            "scene": raw,
            "id": scene_id,
            "valid_id": valid_id,
            "type": scene_type,
            "prompt": str(as_dict(raw.get("visual")).get("image_prompt") or ""),
        }
        records.append(record)
    duplicates = sorted({value for value in ids if ids.count(value) > 1})
    for scene_id in duplicates:
        add_issue(issues, "scene_structure", "DUPLICATE_SCENE_ID", f"ID duplicado: {scene_id}.", scene_id)
    if sort_keys != sorted(sort_keys):
        add_issue(issues, "scene_structure", "SCENE_IDS_NOT_ORDERED", "Los IDs de scenes no están ordenados.")

    for record in records:
        scene, scene_id = record["scene"], record["id"]
        if record["type"] == "panel":
            if scene.get("render_mode") != "static":
                add_issue(issues, "panel_card_rules", "PANEL_NOT_STATIC", "Panel debe usar render_mode='static'.", scene_id)
            if "animation_prompt" in scene or any("animation_prompt" in value for value in [as_dict(scene.get("visual"))]):
                add_issue(issues, "panel_card_rules", "ANIMATION_PROMPT_FORBIDDEN", "animation_prompt está prohibido.", scene_id)
            if not nonempty_text(record["prompt"]):
                add_issue(issues, "panel_card_rules", "IMAGE_PROMPT_MISSING", "Panel necesita visual.image_prompt.", scene_id)
            record["plan"] = validate_visual_plan(record, registry, issues)
            record["continuity"] = validate_continuity_block(record, registry, issues)
            record["story_beat_id"] = record["plan"].get("story_beat_id")
            visible_humans = {
                entity_id
                for entity_id in as_list(record["continuity"].get("visible_entities"))
                if isinstance(entity_id, str) and entity_id in registry and registry[entity_id].get("asset_type") == "human"
            }
            performance_items = [item for item in as_list(record["plan"].get("performances")) if isinstance(item, dict)]
            performance_entities = {item.get("entity_id") for item in performance_items if isinstance(item.get("entity_id"), str)}
            if visible_humans != performance_entities:
                add_issue(
                    issues,
                    "reaction_range_causality",
                    "PERFORMANCE_VISIBILITY_MISMATCH",
                    f"performances[] debe cubrir exactamente humanos visibles; faltan {sorted(visible_humans - performance_entities)}, sobran {sorted(performance_entities - visible_humans)}.",
                    scene_id,
                )
            if record["plan"].get("high_tension"):
                for item in performance_items:
                    if item.get("entity_id") in visible_humans and enum_contains(item.get("mode"), {"NONE", "NEUTRAL_INTENTIONAL"}):
                        add_issue(issues, "reaction_range_causality", "HIGH_TENSION_HUMAN_NEUTRAL", f"Humano visible {item.get('entity_id')} necesita actuación activa.", scene_id)
            visible_all = set(as_list(record["continuity"].get("visible_entities")))
            prompt_normalized = normalized_text(record["prompt"])
            for entity_id in sorted(value for value in visible_all if isinstance(value, str) and value in registry):
                signature = registry[entity_id].get("prompt_signature")
                if not nonempty_text(signature) or normalized_text(signature) not in prompt_normalized:
                    add_issue(
                        issues,
                        "prompt_grammar",
                        "PROMPT_SIGNATURE_MISSING",
                        f"Prompt no redescribe literalmente prompt_signature de {entity_id}.",
                        scene_id,
                    )
            for subpanel in as_list(record["plan"].get("subpanels")):
                if not isinstance(subpanel, dict):
                    continue
                sub_entities = {
                    subpanel.get("dominant_subject_id"),
                    *(
                        item.get("entity_id")
                        for item in as_list(subpanel.get("performances"))
                        if isinstance(item, dict)
                    ),
                } - {None, "environment", "none"}
                if not sub_entities.issubset(visible_all):
                    add_issue(issues, "continuity", "SUBPANEL_ENTITY_NOT_VISIBLE", f"Subpanel declara entidades no visibles/referenciadas: {sorted(sub_entities - visible_all)}.", scene_id)
            transition = scene.get("transition_in", "cut")
            if not isinstance(transition, str) or transition not in {"cut", "dip_black", "crossfade", "flash"}:
                add_issue(issues, "panel_card_rules", "TRANSITION_INVALID", "transition_in inválida.", scene_id)
            motion = scene.get("editor_motion")
            if motion is not None:
                allowed_motion = {
                    "bottom_to_top", "top_to_bottom", "bottom_left_to_top_right", "bottom_right_to_top_left",
                    "top_left_to_bottom_right", "top_right_to_bottom_left", "slow_push_in", "slow_pull_out",
                    "static", "punch_in", "shake",
                }
                if not isinstance(motion, dict) or not isinstance(motion.get("enabled"), bool) or not isinstance(motion.get("preset"), str) or motion.get("preset") not in allowed_motion:
                    add_issue(issues, "panel_card_rules", "EDITOR_MOTION_INVALID", "editor_motion necesita enabled booleano y preset permitido.", scene_id)
                elif motion.get("preset") in {"punch_in", "shake"} and as_dict(record.get("plan", {}).get("action")).get("phase") != "CONTACT":
                    add_issue(issues, "panel_card_rules", "IMPACT_MOTION_MISUSED", "punch_in/shake solo se permiten en CONTACT.", scene_id)
            if record.get("plan", {}).get("page_layout") in WHITE_LAYOUTS | {"BLACK_INSET"}:
                if (
                    not isinstance(motion, dict)
                    or motion.get("enabled") is not False
                    or motion.get("preset") != "static"
                    or motion.get("zoom") != 1
                    or motion.get("pan") != 0
                ):
                    add_issue(issues, "panel_card_rules", "PUNCTUATION_MOTION_NOT_STATIC", "White/BLACK_INSET exige editor_motion disabled/static, zoom=1, pan=0.", scene_id)
        elif record["type"] == "narrative_card":
            for forbidden in ("render_mode", "visual", "references", "editor_motion", "motion", "animation_prompt", "visual_plan", "continuity"):
                if forbidden in scene:
                    add_issue(issues, "panel_card_rules", "CARD_FIELD_FORBIDDEN", f"Narrative card no puede contener {forbidden}.", scene_id)
            card = scene.get("card")
            if not isinstance(card, dict):
                add_issue(issues, "panel_card_rules", "CARD_OBJECT_MISSING", "Narrative card necesita card.", scene_id)
                card = {}
            role = card.get("role")
            if (
                card.get("mode") != "editor"
                or ("background" in card and card.get("background") != "black")
                or not isinstance(role, str)
                or role not in {"title", "narrative"}
            ):
                add_issue(issues, "black_card_range_roles", "CARD_METADATA_INVALID", "card exige mode=editor, role title|narrative; background, si existe, debe ser black.", scene_id)
            story_beat_id = card.get("story_beat_id")
            if not nonempty_text(story_beat_id):
                add_issue(issues, "production_lock", "CARD_STORY_BEAT_MISSING", "Narrative card necesita card.story_beat_id.", scene_id)
            record["story_beat_id"] = story_beat_id
            card_text = card.get("text")
            if not nonempty_text(card_text) or TAG_RE.search(str(card_text)):
                add_issue(issues, "panel_card_rules", "CARD_TEXT_INVALID", "card.text debe ser texto limpio sin tags.", scene_id)
            else:
                words = spoken_words(card_text)
                if not 2 <= words <= 7 or len(str(card_text).splitlines()) > 3:
                    add_issue(issues, "black_card_range_roles", "CARD_TEXT_LIMIT", "Card necesita 2–7 palabras y máximo tres líneas.", scene_id)
                voice_text = as_dict(scene.get("voiceover")).get("text")
                if strip_tags(voice_text) != str(card_text).strip():
                    add_issue(issues, "panel_card_rules", "CARD_VOICE_NOT_LITERAL", "card.text debe igualar voiceover.text sin tags.", scene_id)
    return records


def validate_story_beats(
    records: list[dict[str, Any]], packet: dict[str, Any] | None, issues: list[dict[str, Any]]
) -> dict[str, Any]:
    if packet is None:
        return {"order": [], "seen": []}
    machine = as_dict(packet.get("machine_lock"))
    beat_order = machine.get("beat_order") if isinstance(machine.get("beat_order"), list) else []
    beat_locations = as_dict(machine.get("beat_locations"))
    positions = {beat_id: index for index, beat_id in enumerate(beat_order) if isinstance(beat_id, str)}
    scene_positions = {record["id"]: record["index"] for record in records}
    last_position = -1
    seen: set[str] = set()
    for record in records:
        scene_id = record["id"]
        beat_id = record.get("story_beat_id")
        if beat_id not in positions:
            add_issue(issues, "production_lock", "STORY_BEAT_UNKNOWN", f"story_beat_id {beat_id!r} no existe en beat_order.", scene_id)
            continue
        position = positions[beat_id]
        if position < last_position:
            add_issue(issues, "production_lock", "STORY_BEAT_BACKTRACK", "Las escenas no pueden retroceder en beat_order.", scene_id)
        last_position = max(last_position, position)
        seen.add(beat_id)
        if record["type"] == "panel":
            location = record.get("continuity", {}).get("location_id")
            if beat_locations.get(beat_id) != location:
                add_issue(issues, "continuity", "BEAT_LOCATION_MISMATCH", f"{beat_id} exige location_id={beat_locations.get(beat_id)!r}.", scene_id)
            performance_groups = [as_list(record.get("plan", {}).get("performances"))]
            for subpanel in as_list(record.get("plan", {}).get("subpanels")):
                if isinstance(subpanel, dict):
                    performance_groups.append(as_list(subpanel.get("performances")))
            for group in performance_groups:
                for performance in group:
                    if not isinstance(performance, dict) or not enum_contains(performance.get("mode"), REACTION_PERFORMANCES):
                        continue
                    target = performance.get("reaction_to")
                    if target not in scene_positions or scene_positions.get(str(target), record["index"]) >= record["index"]:
                        add_issue(issues, "reaction_range_causality", "REACTION_TARGET_NOT_PRIOR", f"reaction_to {target!r} debe apuntar a una escena anterior.", scene_id)
    missing = [beat_id for beat_id in beat_order if beat_id not in seen]
    if missing:
        add_issue(issues, "production_lock", "STORY_BEATS_UNUSED", f"Cada beat del packet debe aparecer; faltan {missing}.")
    return {"order": beat_order, "seen": sorted(seen, key=lambda value: positions.get(value, 9999)), "missing": missing}


def validate_tts_and_editing(
    data: dict[str, Any],
    records: list[dict[str, Any]],
    packet: dict[str, Any] | None,
    issues: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
) -> tuple[str, float, list[dict[str, Any]]]:
    editing = data.get("editing")
    if not isinstance(editing, dict):
        add_issue(issues, "root_types_allowed", "EDITING_NOT_OBJECT", "editing debe ser un objeto.")
        editing = {}
    caption = editing.get("caption_style")
    if not isinstance(caption, dict) or caption.get("enabled") is not True:
        add_issue(issues, "editing_contract", "CAPTION_STYLE_INVALID", "caption_style debe existir y estar enabled.")
    else:
        max_words = caption.get("max_words_on_screen")
        if not isinstance(max_words, int) or isinstance(max_words, bool) or not 1 <= max_words <= 4:
            add_issue(issues, "editing_contract", "CAPTION_WORD_LIMIT", "caption_style.max_words_on_screen debe ser 1–4.")
    card_style = editing.get("narrative_card_style")
    if (
        not isinstance(card_style, dict)
        or not isinstance(card_style.get("max_lines"), int)
        or isinstance(card_style.get("max_lines"), bool)
        or not 1 <= card_style.get("max_lines", 99) <= 3
    ):
        add_issue(issues, "editing_contract", "CARD_STYLE_LINES", "narrative_card_style.max_lines debe ser 1–3.")
    panel_motion = editing.get("panel_motion")
    if not isinstance(panel_motion, dict) or panel_motion.get("enabled") is not True:
        add_issue(issues, "editing_contract", "PANEL_MOTION_INVALID", "panel_motion debe existir y estar enabled.")
    timing_budget = editing.get("timing_budget")
    if not isinstance(timing_budget, dict) or timing_budget.get("final_visual_tail_sec") != 0.45:
        add_issue(issues, "editing_contract", "FINAL_VISUAL_TAIL", "editing.timing_budget.final_visual_tail_sec debe ser exactamente 0.45.")
    audio = data.get("audio")
    if audio is not None:
        if not isinstance(audio, dict):
            add_issue(issues, "root_types_allowed", "AUDIO_NOT_OBJECT", "audio debe ser un objeto.")
        else:
            if "final_visual_tail_sec" in audio and audio.get("final_visual_tail_sec") != 0.45:
                add_issue(issues, "editing_contract", "AUDIO_TAIL_CONFLICT", "audio.final_visual_tail_sec, si existe, debe ser 0.45.")
            cues = audio.get("music_cues", [])
            if not isinstance(cues, list) or len(cues) > 3:
                add_issue(issues, "editing_contract", "MUSIC_CUES_INVALID", "audio.music_cues debe ser arreglo de máximo tres cues.")

    tts = data.get("tts_export")
    if not isinstance(tts, dict):
        add_issue(issues, "root_types_allowed", "TTS_EXPORT_NOT_OBJECT", "tts_export debe ser objeto.")
        tts = {}
    if tts.get("language") != "es-419":
        add_issue(issues, "tts_contract", "TTS_LANGUAGE", "tts_export.language debe ser es-419.")
    if tts.get("model_id") != "eleven_v3":
        add_issue(issues, "tts_contract", "TTS_MODEL", "tts_export.model_id debe ser eleven_v3.")
    edit_speed_raw = tts.get("edit_speed")
    if not is_number(edit_speed_raw) or float(edit_speed_raw) <= 0 or not math.isclose(float(edit_speed_raw), 1.4, rel_tol=0, abs_tol=1e-9):
        add_issue(issues, "tts_contract", "EDIT_SPEED_INVALID", "tts_export.edit_speed debe ser 1.4 finito y positivo.")
        edit_speed = 1.4
    else:
        edit_speed = float(edit_speed_raw)
    if "tts_blocks" in tts:
        add_issue(issues, "tts_contract", "TTS_BLOCKS_FORBIDDEN", "tts_blocks no forma parte del contrato activo.")
    if tts.get("model_id") == "multilingual_v2":
        add_issue(issues, "tts_contract", "MULTILINGUAL_V2_FORBIDDEN", "multilingual_v2 está prohibido.")

    voice_texts: list[str] = []
    for record in records:
        value = as_dict(record["scene"].get("voiceover")).get("text")
        voice_texts.append(value if isinstance(value, str) else "")
    joined_script = "\n".join(voice_texts)
    full_script = tts.get("full_script")
    if not isinstance(full_script, str) or full_script != joined_script:
        add_issue(issues, "full_script_exact", "FULL_SCRIPT_MISMATCH", "full_script debe ser la unión exacta de todos los voiceover.text.")
        full_script_text = full_script if isinstance(full_script, str) else ""
    else:
        full_script_text = full_script
    if packet is not None and full_script_text != packet.get("monologue"):
        add_issue(issues, "full_script_exact", "FULL_SCRIPT_PACKET_MISMATCH", "full_script no coincide byte por byte con MONOLOGO_LOCKED normalizado a LF.")
    tags = TAG_RE.findall(full_script_text)
    unknown_tags = sorted({tag for tag in tags if tag.lower() not in ALLOWED_TAGS})
    if unknown_tags:
        add_issue(issues, "tts_contract", "TTS_TAG_UNKNOWN", f"Tags no autorizados: {unknown_tags}.")
    if len(full_script_text) > 8000:
        warnings.append({"code": "TTS_OVER_8000_CHARACTERS", "message": "full_script supera 8,000 caracteres."})

    mode = tts.get("mode")
    if not isinstance(mode, str) or mode not in {"single", "dialogue"}:
        add_issue(issues, "tts_contract", "TTS_MODE_INVALID", "tts_export.mode debe ser single o dialogue.")
    if mode == "single":
        settings = tts.get("voice_settings")
        if not isinstance(settings, dict) or settings.get("speed") != 1.0:
            add_issue(issues, "tts_contract", "SINGLE_SPEED_INVALID", "Single exige voice_settings.speed=1.0.")
        for forbidden in ("voices", "dialogue", "elevenlabs_speed"):
            if forbidden in tts:
                add_issue(issues, "tts_contract", "SINGLE_FIELD_FORBIDDEN", f"Single no puede contener {forbidden}.")
        for record in records:
            voice = as_dict(record["scene"].get("voiceover"))
            if "speaker" in voice:
                add_issue(issues, "tts_contract", "SINGLE_SPEAKER_FORBIDDEN", "Single no usa voiceover.speaker.", record["id"])
        if any(tag.lower() == "cold" for tag in tags):
            add_issue(issues, "tts_contract", "COLD_WITHOUT_SYSTEM", "[cold] solo pertenece al speaker sistema en dialogue.")
    elif mode == "dialogue":
        if tts.get("elevenlabs_speed") != 1.0 or "voice_settings" in tts:
            add_issue(issues, "tts_contract", "DIALOGUE_SPEED_INVALID", "Dialogue exige elevenlabs_speed=1.0 y no voice_settings.")
        voices = tts.get("voices")
        dialogue = tts.get("dialogue")
        if not isinstance(voices, dict) or not voices or any(not nonempty_text(key) or not nonempty_text(value) for key, value in voices.items()):
            add_issue(issues, "tts_contract", "VOICES_INVALID", "voices debe mapear speakers a IDs reales.")
            voices = {}
        approved_voices = as_dict(as_dict(packet or {}).get("machine_lock")).get("approved_voices")
        if not isinstance(approved_voices, dict) or voices != approved_voices:
            add_issue(issues, "production_lock", "DIALOGUE_VOICES_NOT_APPROVED", "Dialogue exige approved_voices en MACHINE_LOCK y coincidencia exacta con tts_export.voices.")
        if not isinstance(dialogue, list) or len(dialogue) != len(records):
            add_issue(issues, "tts_contract", "DIALOGUE_LENGTH", "dialogue necesita una entrada por escena con voz.")
            dialogue = []
        for index, record in enumerate(records):
            voice = as_dict(record["scene"].get("voiceover"))
            speaker = voice.get("speaker")
            if not isinstance(speaker, str) or speaker not in voices:
                add_issue(issues, "tts_contract", "SPEAKER_INVALID", "voiceover.speaker no existe en voices.", record["id"])
            if index < len(dialogue):
                item = dialogue[index]
                if not isinstance(item, dict) or item.get("scene_id") != record["id"] or item.get("speaker") != speaker or item.get("text") != voice.get("text"):
                    add_issue(issues, "tts_contract", "DIALOGUE_NOT_MIRROR", "dialogue no espeja scene_id, speaker y text.", record["id"])
            scene_tags = [tag.lower() for tag in TAG_RE.findall(str(voice.get("text") or ""))]
            if "cold" in scene_tags and speaker != "sistema":
                add_issue(issues, "tts_contract", "COLD_WRONG_SPEAKER", "[cold] solo puede usar speaker sistema.", record["id"])

    scene_load: list[dict[str, Any]] = []
    for record in records:
        scene, scene_id = record["scene"], record["id"]
        words = spoken_words(as_dict(scene.get("voiceover")).get("text"))
        if record["type"] == "narrative_card":
            kind, minimum, maximum, max_seconds = "card", 2, 7, 2.8
        else:
            plan = record.get("plan", {})
            action = as_dict(plan.get("action"))
            if plan.get("page_layout") in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}:
                kind, minimum, maximum, max_seconds = "composite", 4, 14, 5.2
            elif plan.get("fragment_subject") != "NONE" or any(
                enum_contains(item.get("mode"), REACTION_PERFORMANCES)
                for item in as_list(plan.get("performances"))
                if isinstance(item, dict)
            ):
                kind, minimum, maximum, max_seconds = "fragment_or_reaction", 2, 9, 3.6
            elif action.get("phase") != "NONE" or plan.get("page_layout") == "TALL_ACTION":
                kind, minimum, maximum, max_seconds = "action", 2, 8, 3.0
            elif plan.get("shot_scale") in {"WIDE_MASTER", "TRUE_LONG"}:
                kind, minimum, maximum, max_seconds = "master", 7, 16, 5.0
            else:
                kind, minimum, maximum, max_seconds = "standard", 5, 13, 4.3
        estimated = round(words * 60.0 / (150.0 * edit_speed), 3)
        over = not minimum <= words <= maximum or estimated > max_seconds
        if over:
            add_issue(issues, "voice_word_time_limits", "VOICE_WINDOW_INVALID", f"{kind}: {words} palabras/{estimated}s; exige {minimum}–{maximum} y <={max_seconds}s.", scene_id)
        scene_load.append(
            {
                "scene_id": scene_id,
                "kind": kind,
                "words": words,
                "estimated_seconds": estimated,
                "minimum_words": minimum,
                "maximum_words": maximum,
                "maximum_seconds": max_seconds,
                "pass": not over,
            }
        )
    computed_runtime = round(sum(item["estimated_seconds"] for item in scene_load), 3)
    target = timing_budget.get("runtime_target_sec") if isinstance(timing_budget, dict) else None
    declared_runtime = timing_budget.get("runtime_estimate_sec") if isinstance(timing_budget, dict) else None
    payoff_scene_id = timing_budget.get("payoff_scene_id") if isinstance(timing_budget, dict) else None
    declared_payoff_pct = timing_budget.get("payoff_start_pct") if isinstance(timing_budget, dict) else None
    machine = as_dict(as_dict(packet or {}).get("machine_lock"))
    locked_range = machine.get("runtime_range_seconds")
    if target != locked_range:
        add_issue(issues, "editing_contract", "RUNTIME_TARGET_INVALID", "timing_budget.runtime_target_sec debe copiar runtime_range_seconds del MACHINE_LOCK.")
    if (
        not isinstance(locked_range, list)
        or len(locked_range) != 2
        or not all(is_number(value) for value in locked_range)
        or not float(locked_range[0]) <= computed_runtime <= float(locked_range[1])
    ):
        add_issue(issues, "voice_word_time_limits", "RUNTIME_OUT_OF_RANGE", f"Runtime recomputado {computed_runtime}s queda fuera del rango del packet.")
    if not is_number(declared_runtime) or abs(float(declared_runtime) - computed_runtime) > 0.5:
        add_issue(issues, "editing_contract", "RUNTIME_ESTIMATE_MISMATCH", f"runtime_estimate_sec debe coincidir con {computed_runtime}s (±0.5).")
    payoff_index = next((index for index, record in enumerate(records) if record["id"] == payoff_scene_id), None)
    if payoff_index is None or records[payoff_index].get("plan", {}).get("beat") != "PAYOFF":
        add_issue(issues, "editing_contract", "PAYOFF_SCENE_INVALID", "payoff_scene_id debe apuntar a un panel con beat PAYOFF.")
    else:
        payoff_start = round(sum(item["estimated_seconds"] for item in scene_load[:payoff_index]) / computed_runtime, 4) if computed_runtime else 0.0
        if not is_number(declared_payoff_pct) or abs(float(declared_payoff_pct) - payoff_start) > 0.01:
            add_issue(issues, "editing_contract", "PAYOFF_PERCENT_MISMATCH", f"payoff_start_pct debe coincidir con {payoff_start} (±0.01).")
        if payoff_start > 0.75:
            add_issue(issues, "beat_coverage", "PAYOFF_TOO_LATE", f"PAYOFF inicia en {payoff_start:.3f}; máximo 0.75.")

    starts: list[float] = []
    elapsed = 0.0
    for item in scene_load:
        starts.append(elapsed)
        elapsed += item["estimated_seconds"]
    title_index = next(
        (index for index, record in enumerate(records) if record["type"] == "narrative_card" and as_dict(record["scene"].get("card")).get("role") == "title"),
        None,
    )
    if title_index is not None and starts[title_index] > 8:
        add_issue(issues, "beat_coverage", "TITLE_TOO_LATE", f"Título inicia a {starts[title_index]:.2f}s; máximo 8s.")
    timing_limits = (("THREAT", 25.0, "THREAT_TOO_LATE"), ("DECISION", 45.0, "AGENCY_TOO_LATE"))
    for beat_name, seconds_limit, code in timing_limits:
        beat_index = next((index for index, record in enumerate(records) if record.get("plan", {}).get("beat") == beat_name), None)
        if beat_index is not None and starts[beat_index] > seconds_limit:
            add_issue(issues, "beat_coverage", code, f"{beat_name} inicia a {starts[beat_index]:.2f}s; máximo {seconds_limit:.0f}s.")
    manifestation_index = next((index for index, record in enumerate(records) if record.get("plan", {}).get("beat") == "MANIFESTATION"), None)
    if manifestation_index is not None and computed_runtime and starts[manifestation_index] / computed_runtime > 0.60:
        add_issue(issues, "beat_coverage", "MANIFESTATION_TOO_LATE", "MANIFESTATION debe iniciar antes del 60%.")
    return full_script_text, edit_speed, scene_load


def validate_global_visual_rules(
    records: list[dict[str, Any]], registry: dict[str, dict[str, Any]], issues: list[dict[str, Any]]
) -> dict[str, Any]:
    panels = [record for record in records if record["type"] == "panel"]
    cards = [record for record in records if record["type"] == "narrative_card"]
    quota = quota_for_panels(len(panels))
    if not 30 <= len(panels) <= 55:
        add_issue(issues, "scene_structure", "PANEL_COUNT_HARD_RANGE", f"V5.3 exige 30–55 panels; hay {len(panels)}.")
    id_map = {record["id"]: record for record in records if record["valid_id"]}
    scene_pos = {record["id"]: record["index"] for record in records}

    beats = {record.get("plan", {}).get("beat") for record in panels}
    missing_beats = sorted(MANDATORY_BEATS - beats)
    if missing_beats:
        add_issue(issues, "beat_coverage", "MANDATORY_BEATS_MISSING", f"Faltan beats V5.3: {missing_beats}.")

    white = [record for record in panels if record.get("plan", {}).get("page_layout") in WHITE_LAYOUTS]
    white_families = sorted({record.get("plan", {}).get("page_layout") for record in white})
    white_compositions = sorted(
        {str(as_dict(record.get("plan", {}).get("white")).get("composition")) for record in white if nonempty_text(as_dict(record.get("plan", {}).get("white")).get("composition"))}
    )
    low, high = quota["white"]
    if not low <= len(white) <= high:
        add_issue(issues, "white_page_range", "WHITE_COUNT_RANGE", f"Se requieren {low}–{high} blancos; hay {len(white)}.")
    if len(white_families) < 3 or len(white_compositions) < 2:
        add_issue(issues, "white_page_three_families", "WHITE_DIVERSITY", "Se requieren al menos tres familias blancas y dos composiciones.")
    panel_positions = {record["id"]: index for index, record in enumerate(panels)}
    detonator_positions = [panel_positions[record["id"]] for record in panels if record.get("plan", {}).get("beat") == "DETONATOR"]
    payoff_positions = [panel_positions[record["id"]] for record in panels if record.get("plan", {}).get("beat") == "PAYOFF"]
    white_positions = [panel_positions[record["id"]] for record in white]
    distribution_ok = bool(
        detonator_positions
        and any(position < min(detonator_positions) for position in white_positions)
        and any(record.get("plan", {}).get("beat") in {"PRESSURE", "BOND"} for record in white)
        and any(record.get("plan", {}).get("beat") in {"PERCEPTION", "PREPARATION"} for record in white)
        and payoff_positions
        and any(position > min(payoff_positions) for position in white_positions)
    )
    if not distribution_ok:
        add_issue(issues, "white_distribution", "WHITE_DISTRIBUTION", "Falta blanco antes del detonante, de presión/vínculo, percepción/preparación o posterior al payoff.")

    card_low, card_high = quota["cards"]
    card_roles = [as_dict(record["scene"].get("card")).get("role") for record in cards]
    if not card_low <= len(cards) <= card_high or card_roles.count("title") != 1 or "narrative" not in card_roles:
        add_issue(issues, "black_card_range_roles", "CARD_COUNT_ROLES", f"Se requieren {card_low}–{card_high} cards, un título y una narrativa.")
    title_positions = [record["index"] for record in cards if as_dict(record["scene"].get("card")).get("role") == "title"]
    if title_positions and title_positions[0] > max(2, math.floor(len(records) * 0.20)):
        add_issue(issues, "black_card_range_roles", "TITLE_CARD_TOO_LATE", "La card de título debe estar en el primer 20%.")
    black_insets = [record for record in panels if record.get("plan", {}).get("page_layout") == "BLACK_INSET"]
    black_low, black_high = quota["black"]
    if not black_low <= len(black_insets) <= black_high:
        add_issue(issues, "visual_punctuation_range_distribution", "BLACK_INSET_COUNT", f"Se requieren {black_low}–{black_high} BLACK_INSET; hay {len(black_insets)}.")

    fragments = [record for record in panels if record.get("plan", {}).get("fragment_subject") not in {None, "NONE"}]
    fragment_low, fragment_high = quota["fragments"]
    fragment_subjects = {record.get("plan", {}).get("fragment_subject") for record in fragments}
    if not fragment_low <= len(fragments) <= fragment_high:
        add_issue(issues, "fragment_range_diversity", "FRAGMENT_COUNT_RANGE", f"Se requieren {fragment_low}–{fragment_high} fragmentos; hay {len(fragments)}.")
    if len(panels) >= 38 and not ({"EYES", "MOUTH_JAW"} <= fragment_subjects and fragment_subjects & {"HAND_CONTACT", "FOOT_CONTACT", "WOUND_MARK"}):
        add_issue(issues, "fragment_range_diversity", "FRAGMENT_DIVERSITY", "Fragmentos deben cubrir ojos, boca/mandíbula y mano/pie/herida.")

    reactions = [
        record
        for record in panels
        if any(
            enum_contains(item.get("mode"), REACTION_PERFORMANCES)
            for item in as_list(record.get("plan", {}).get("performances"))
            if isinstance(item, dict)
        )
    ]
    reaction_low, reaction_high = quota["reactions"]
    if not reaction_low <= len(reactions) <= reaction_high:
        add_issue(issues, "reaction_range_causality", "REACTION_COUNT_RANGE", f"Se requieren {reaction_low}–{reaction_high} reacciones; hay {len(reactions)}.")
    covered_trigger_beats: set[str] = set()
    for reaction in reactions:
        for performance in as_list(reaction.get("plan", {}).get("performances")):
            if not isinstance(performance, dict) or not enum_contains(performance.get("mode"), REACTION_PERFORMANCES):
                continue
            target_id = performance.get("reaction_to")
            target = id_map.get(target_id)
            if target is not None and target["index"] < reaction["index"] and target.get("plan", {}).get("beat") in REACTION_TRIGGER_BEATS:
                covered_trigger_beats.add(str(target.get("plan", {}).get("beat")))
    missing_reactions = sorted(REACTION_TRIGGER_BEATS - covered_trigger_beats)
    if missing_reactions:
        add_issue(issues, "reaction_range_causality", "REACTION_CAUSALITY_MISSING", f"Faltan reacciones causales tras: {missing_reactions}.")

    longs = [record for record in panels if record.get("plan", {}).get("shot_scale") == "TRUE_LONG"]
    long_low, long_high = quota["longs"]
    long_roles = {record.get("plan", {}).get("long_role") for record in longs}
    if not long_low <= len(longs) <= long_high:
        add_issue(issues, "true_long_shots", "TRUE_LONG_COUNT_RANGE", f"Se requieren {long_low}–{long_high} TRUE_LONG; hay {len(longs)}.")
    if not {"WORLD", "THREAT", "CLIMAX", "CONSEQUENCE"}.issubset(long_roles):
        add_issue(issues, "true_long_shots", "TRUE_LONG_ROLES", "TRUE_LONG debe cubrir WORLD, THREAT, CLIMAX y CONSEQUENCE.")
    final_start = math.floor(len(panels) * 0.60)
    final_longs = [record for record in longs if panel_positions.get(record["id"], 0) >= final_start]
    final_required = 2 if len(panels) >= 38 else 1 if len(panels) >= 20 else 0
    if len(final_longs) < final_required:
        add_issue(issues, "true_long_shots", "TRUE_LONG_FINAL_DISTRIBUTION", f"Se requieren {final_required} TRUE_LONG en el 40% final.")

    tall = [record for record in panels if record.get("plan", {}).get("page_layout") == "TALL_ACTION"]
    tall_low, tall_high = quota["tall"]
    if not tall_low <= len(tall) <= tall_high:
        add_issue(issues, "tall_action_range", "TALL_ACTION_COUNT_RANGE", f"Se requieren {tall_low}–{tall_high} TALL_ACTION; hay {len(tall)}.")

    punctuation_ids = {
        record["id"]
        for record in panels
        if record.get("plan", {}).get("page_layout") in WHITE_LAYOUTS | {"BLACK_INSET"}
        or record.get("plan", {}).get("fragment_subject") not in {None, "NONE"}
        or record.get("plan", {}).get("low_density_kind") not in {None, "NONE"}
    } | {record["id"] for record in cards}
    ratio = len(punctuation_ids) / len(records) if records else 0.0
    punct_low, punct_high = quota["punctuation"]
    if not punct_low <= ratio <= punct_high:
        add_issue(issues, "visual_punctuation_range_distribution", "PUNCTUATION_RATIO", f"Puntuación {ratio:.3f}; rango {punct_low:.2f}–{punct_high:.2f}.")
    punct_run = 0
    for record in records:
        punct_run = punct_run + 1 if record["id"] in punctuation_ids else 0
        if punct_run >= 3:
            add_issue(issues, "visual_punctuation_range_distribution", "THREE_PUNCTUATIONS_RUN", "No se permiten tres puntuaciones consecutivas.", record["id"])
            break

    ramp_groups: dict[str, list[dict[str, Any]]] = {}
    additional: list[dict[str, Any]] = []
    for record in panels:
        approach = as_dict(record.get("plan", {}).get("approach"))
        stage = approach.get("stage")
        ramp_id = approach.get("ramp_id")
        if stage == "ADDITIONAL":
            additional.append(record)
        elif stage in {"SPACE", "BODY", "EMOTION", "FRAGMENT"} and isinstance(ramp_id, str):
            ramp_groups.setdefault(ramp_id, []).append(record)
    valid_ramps: list[str] = []
    for ramp_id, group in ramp_groups.items():
        group.sort(key=lambda item: item["index"])
        stages = [as_dict(item.get("plan", {}).get("approach")).get("stage") for item in group]
        directions = {as_dict(item.get("plan", {}).get("approach")).get("direction") for item in group}
        subjects = {item.get("plan", {}).get("dominant_subject_id") for item in group}
        axes = {item.get("plan", {}).get("axis_id") for item in group}
        contiguous = all(group[index + 1]["index"] == group[index]["index"] + 1 for index in range(len(group) - 1))
        stage_order_ok = 3 <= len(stages) <= 5 and stages[:3] == ["SPACE", "BODY", "EMOTION"] and all(
            stage == "FRAGMENT" for stage in stages[3:]
        )
        if stage_order_ok and len(directions) == len(subjects) == len(axes) == 1 and contiguous:
            scale_ok = (
                group[0].get("plan", {}).get("shot_scale") in {"TRUE_LONG", "FULL"}
                and is_number(group[0].get("plan", {}).get("subject_pct"))
                and 8 <= float(group[0].get("plan", {}).get("subject_pct")) <= 22
                and group[1].get("plan", {}).get("shot_scale") in {"FULL", "MEDIUM"}
                and is_number(group[1].get("plan", {}).get("subject_pct"))
                and 35 <= float(group[1].get("plan", {}).get("subject_pct")) <= 55
                and group[2].get("plan", {}).get("shot_scale") in {"CLOSE", "EXTREME_CLOSE"}
                and is_number(group[2].get("plan", {}).get("subject_pct"))
                and 65 <= float(group[2].get("plan", {}).get("subject_pct")) <= 90
            )
            if scale_ok:
                valid_ramps.append(ramp_id)
        if ramp_id not in valid_ramps:
            add_issue(issues, "approach_ramp_and_additional", "APPROACH_RAMP_INVALID", f"Rampa {ramp_id} no cumple SPACE→BODY→EMOTION continuo.")
    ramp_beats = {
        record.get("plan", {}).get("story_beat_id")
        for group in ramp_groups.values()
        for record in group
    }
    distinct_additional_beats = {record.get("plan", {}).get("story_beat_id") for record in additional}
    additional_distinct = bool(distinct_additional_beats - ramp_beats)
    ramp_low, ramp_high = quota["ramps"]
    additional_low, additional_high = quota["additional"]
    if (
        not ramp_low <= len(valid_ramps) <= ramp_high
        or not additional_low <= len(additional) <= additional_high
        or not additional_distinct
    ):
        add_issue(
            issues,
            "approach_ramp_and_additional",
            "APPROACH_COVERAGE",
            f"Rampas requeridas {ramp_low}–{ramp_high}; additional {additional_low}–{additional_high} en beat distinto.",
        )

    action_groups: dict[str, list[dict[str, Any]]] = {}
    for record in panels:
        action = as_dict(record.get("plan", {}).get("action"))
        if action.get("phase") != "NONE" and isinstance(action.get("sequence_id"), str):
            action_groups.setdefault(action["sequence_id"], []).append(record)
    if not action_groups:
        add_issue(issues, "action_sequences", "ACTION_SEQUENCE_MISSING", "La Parte necesita al menos una secuencia de acción estructurada.")
    for sequence_id, group in action_groups.items():
        group.sort(key=lambda item: item["index"])
        phases = [as_dict(item.get("plan", {}).get("action")).get("phase") for item in group]
        order_values = [ACTION_ORDER.index(phase) for phase in phases if phase in ACTION_ORDER]
        if phases != ACTION_ORDER or order_values != list(range(len(ACTION_ORDER))):
            add_issue(issues, "action_sequences", "ACTION_PHASE_ORDER", f"Secuencia {sequence_id} debe cubrir exactamente las seis fases en orden.")
        geography = next((item for item in group if as_dict(item.get("plan", {}).get("action")).get("phase") == "GEOGRAPHY"), None)
        if geography and geography.get("plan", {}).get("shot_scale") not in {"WIDE_MASTER", "TRUE_LONG"}:
            add_issue(issues, "action_sequences", "ACTION_GEOGRAPHY_NOT_MASTER", f"Geografía de {sequence_id} necesita master/TRUE_LONG.", geography["id"])
        trajectory = next((item for item in group if as_dict(item.get("plan", {}).get("action")).get("phase") == "TRAJECTORY"), None)
        contact = next((item for item in group if as_dict(item.get("plan", {}).get("action")).get("phase") == "CONTACT"), None)
        if trajectory and contact and trajectory["index"] < contact["index"]:
            if contact["index"] != trajectory["index"] + 1:
                add_issue(issues, "action_sequences", "TRAJECTORY_CONTACT_NOT_CONSECUTIVE", "TRAJECTORY y CONTACT deben ser ventanas consecutivas.", contact["id"])
            between = [item for item in records if trajectory["index"] < item["index"] < contact["index"]]
            if any(item["type"] == "narrative_card" or item.get("plan", {}).get("page_layout") in WHITE_LAYOUTS for item in between):
                add_issue(issues, "action_sequences", "PUNCTUATION_BETWEEN_TRAJECTORY_CONTACT", "No puede haber card/blanco entre trayectoria y contacto.")

    max_runs = {"close": 0, "large_subject": 0, "same_subject": 0, "fragment": 0}
    current = {key: 0 for key in max_runs}
    previous_pair: tuple[str, str, str, str] | None = None
    previous_subject: str | None = None
    human_panels = 0
    nonfrontal_human = 0
    for record in records:
        if record["type"] != "panel":
            current = {key: 0 for key in current}
            previous_pair = None
            previous_subject = None
            continue
        plan = record.get("plan", {})
        scale = plan.get("shot_scale")
        elevation = plan.get("camera_elevation")
        viewpoint = plan.get("viewpoint")
        roll = plan.get("camera_roll")
        subject = plan.get("dominant_subject_id")
        current["close"] = current["close"] + 1 if scale in {"MACRO", "EXTREME_CLOSE", "CLOSE"} else 0
        current["large_subject"] = current["large_subject"] + 1 if is_number(plan.get("subject_pct")) and float(plan.get("subject_pct")) > 45 else 0
        approach_stage = as_dict(plan.get("approach")).get("stage")
        if approach_stage in {"SPACE", "BODY", "EMOTION", "FRAGMENT"}:
            # Una rampa válida conserva deliberadamente al mismo sujeto durante 3–4 ventanas.
            current["same_subject"] = 0
        else:
            current["same_subject"] = current["same_subject"] + 1 if subject == previous_subject and subject not in {None, "environment", "none"} else 1
        current["fragment"] = current["fragment"] + 1 if plan.get("fragment_subject") not in {None, "NONE"} else 0
        for key in current:
            max_runs[key] = max(max_runs[key], current[key])
        pair = (str(scale), str(elevation), str(viewpoint), str(roll))
        if previous_pair == pair:
            add_issue(issues, "camera_variety", "REPEATED_CAMERA_SIGNATURE", "No repitas plano+elevación+viewpoint+roll consecutivo.", record["id"])
        previous_pair = pair
        previous_subject = str(subject)
        if subject in registry and registry[str(subject)].get("asset_type") == "human":
            human_panels += 1
            if viewpoint in NONFRONTAL_VIEWPOINTS:
                nonfrontal_human += 1
    if max_runs["close"] > 2 or max_runs["large_subject"] > 2 or max_runs["same_subject"] > 2 or max_runs["fragment"] > 2:
        add_issue(issues, "camera_variety", "CAMERA_RUN_LIMIT", f"Rachas máximas inválidas: {max_runs}.")
    nonfrontal_ratio = nonfrontal_human / human_panels if human_panels else 1.0
    if nonfrontal_ratio < 0.35:
        add_issue(issues, "camera_variety", "NONFRONTAL_RATIO", f"Tomas humanas no frontales {nonfrontal_ratio:.3f}; mínimo 0.35.")

    return {
        "quota": quota,
        "white_ids": [record["id"] for record in white],
        "white_families": white_families,
        "white_compositions": white_compositions,
        "card_ids": [record["id"] for record in cards],
        "fragment_ids": [record["id"] for record in fragments],
        "reaction_ids": [record["id"] for record in reactions],
        "true_long_ids": [record["id"] for record in longs],
        "tall_action_ids": [record["id"] for record in tall],
        "valid_ramps": valid_ramps,
        "additional_approach_ids": [record["id"] for record in additional],
        "action_sequences": {key: [record["id"] for record in value] for key, value in action_groups.items()},
        "punctuation_ids": sorted(punctuation_ids, key=lambda value: scene_pos.get(value, 0)),
        "punctuation_ratio": round(ratio, 3),
        "max_runs": max_runs,
        "nonfrontal_ratio": round(nonfrontal_ratio, 3),
    }


def validate_continuity_sequence(
    records: list[dict[str, Any]],
    registry: dict[str, dict[str, Any]],
    transparent: set[str],
    packet: dict[str, Any] | None,
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    panels = [record for record in records if record["type"] == "panel"]
    machine = as_dict(as_dict(packet or {}).get("machine_lock"))
    state_contract = as_dict(machine.get("state_contract"))
    current_state = {key: as_dict(spec).get("initial") for key, spec in state_contract.items()}
    transitions: dict[tuple[str, str], dict[str, Any]] = {}
    for key, spec in state_contract.items():
        for change in as_list(as_dict(spec).get("changes")):
            if isinstance(change, dict) and isinstance(change.get("beat_id"), str):
                transitions[(key, change["beat_id"])] = change
    applied: set[tuple[str, str]] = set()
    last_panel: dict[str, Any] | None = None
    mutations: list[dict[str, Any]] = []
    for record in panels:
        scene_id = record["id"]
        beat_id = record.get("story_beat_id")
        continuity = record.get("continuity", {})
        plan = record.get("plan", {})
        before = as_dict(continuity.get("state_before"))
        after = as_dict(continuity.get("state_after"))
        reasons = as_dict(continuity.get("state_change_reason"))
        declared_keys = set(before) | set(after) | set(reasons)
        unknown_keys = sorted(declared_keys - set(state_contract))
        if unknown_keys:
            add_issue(issues, "continuity", "STATE_KEYS_UNKNOWN", f"Claves fuera de MACHINE_LOCK: {unknown_keys}.", scene_id)
        visible_ids = {value for value in as_list(continuity.get("visible_entities")) if isinstance(value, str)}
        relevant_keys = {
            key for key in state_contract if key.split(".", 1)[0] in visible_ids
        }
        if not relevant_keys.issubset(set(before)) or not relevant_keys.issubset(set(after)):
            add_issue(
                issues,
                "continuity",
                "VISIBLE_STATE_COVERAGE",
                f"Faltan claves de estado para entidades visibles: {sorted(relevant_keys - (set(before) & set(after)))}.",
                scene_id,
            )
        for state_key in sorted((set(before) & set(after)) & set(state_contract)):
            if before.get(state_key) != current_state.get(state_key):
                add_issue(
                    issues,
                    "continuity",
                    "STATE_PERSISTENCE_BROKEN",
                    f"{state_key}: state_before {before.get(state_key)!r} no coincide con estado vigente {current_state.get(state_key)!r}.",
                    scene_id,
                )
            transition_key = (state_key, str(beat_id))
            scheduled = transitions.get(transition_key)
            changed = before.get(state_key) != after.get(state_key)
            asserted = state_key in reasons
            if changed or asserted:
                if scheduled is None or transition_key in applied:
                    add_issue(issues, "continuity", "STATE_TRANSITION_NOT_LOCKED", f"Mutación/aserción de {state_key} no existe en este beat del MACHINE_LOCK.", scene_id)
                    continue
                if after.get(state_key) != scheduled.get("to"):
                    add_issue(issues, "continuity", "STATE_TRANSITION_VALUE_MISMATCH", f"{state_key}.state_after no coincide con transition.to.", scene_id)
                if reasons.get(state_key) != scheduled.get("caused_by"):
                    add_issue(issues, "continuity", "STATE_TRANSITION_CAUSE_MISMATCH", f"Causa de {state_key} no coincide exactamente con MACHINE_LOCK.", scene_id)
                applied.add(transition_key)
                current_state[state_key] = scheduled.get("to")
                mutations.append(
                    {
                        "scene_id": scene_id,
                        "story_beat_id": beat_id,
                        "state_key": state_key,
                        "before": before.get(state_key),
                        "after": after.get(state_key),
                        "reason": reasons.get(state_key),
                    }
                )
            elif after.get(state_key) != current_state.get(state_key):
                add_issue(issues, "continuity", "STATE_AFTER_NOT_CURRENT", f"{state_key}.state_after inventa estado sin transición.", scene_id)

        visible_transparent = visible_ids & transparent
        for container_id in sorted(visible_transparent):
            occupants_key = f"{container_id}.occupants"
            occupants = after.get(occupants_key)
            if occupants_key not in state_contract:
                add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_STATE_LOCK_MISSING", f"MACHINE_LOCK carece de {occupants_key}.", scene_id)
            elif not isinstance(occupants, list) or len(occupants) != 1:
                add_issue(issues, "transparent_container_has_unique_occupant", "TRANSPARENT_CONTAINER_NOT_ONE", f"{container_id} visible necesita exactamente un ocupante.", scene_id)
            if not re.search(r"\b(?:only|unique) person inside\b", record["prompt"], re.I):
                add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_INSIDE_PROMPT_MISSING", "Prompt no declara el único ocupante interior.", scene_id)

        if last_panel is not None:
            previous = last_panel.get("continuity", {})
            changed_place = (
                continuity.get("location_id") != previous.get("location_id")
                or continuity.get("space_type") != previous.get("space_type")
                or continuity.get("time") != previous.get("time")
            )
            if changed_place and continuity.get("transition_bridge") is not True:
                add_issue(issues, "continuity", "PLACE_TIME_CHANGE_WITHOUT_BRIDGE", "Cambio de lugar/espacio/hora sin transition_bridge.", scene_id)
            same_place_time = continuity.get("location_id") == previous.get("location_id") and continuity.get("time") == previous.get("time")
            if same_place_time and continuity.get("light_state") != previous.get("light_state") and not nonempty_text(continuity.get("light_change_reason")):
                add_issue(issues, "continuity", "LIGHT_CHANGE_WITHOUT_REASON", "Cambio de luz sin light_change_reason.", scene_id)
            axis_changed = continuity.get("location_id") == previous.get("location_id") and continuity.get("axis_id") != previous.get("axis_id")
            if axis_changed and plan.get("shot_scale") not in {"WIDE_MASTER", "TRUE_LONG"} and continuity.get("transition_bridge") is not True:
                add_issue(issues, "continuity", "AXIS_CHANGE_WITHOUT_REANCHOR", "Cambio de eje necesita master/TRUE_LONG o puente.", scene_id)
        last_panel = record
    missing_transitions = [
        {"state_key": key, "beat_id": beat_id}
        for key, beat_id in transitions
        if (key, beat_id) not in applied
    ]
    if missing_transitions:
        add_issue(issues, "continuity", "MACHINE_TRANSITIONS_UNUSED", f"No se materializaron transiciones MACHINE_LOCK: {missing_transitions}.")
    return {"mutations": mutations, "last_states": current_state, "missing_transitions": missing_transitions}


def validate(
    data: Any,
    absolute: Path,
    packet: dict[str, Any] | None = None,
    packet_issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = list(packet_issues or [])
    warnings: list[dict[str, Any]] = []
    if not isinstance(data, dict):
        return failure_report(str(absolute), "ROOT_NOT_OBJECT", "La raíz JSON debe ser un objeto.")

    missing_roots = sorted(ROOT_REQUIRED - set(data))
    unknown_roots = sorted(set(data) - ROOT_ALLOWED)
    if missing_roots:
        add_issue(issues, "root_fields", "MISSING_ROOT_FIELDS", f"Faltan campos raíz: {missing_roots}.")
    if unknown_roots:
        add_issue(issues, "root_fields", "UNKNOWN_ROOT_FIELDS", f"Campos raíz no permitidos: {unknown_roots}.")

    project, serie = validate_project(data, issues)
    pipeline = validate_pipeline(data, issues)
    validate_production_lock(data, pipeline, packet, issues)
    registry, pose_roles, transparent = validate_assets(data, serie, issues)
    scenarios = validate_scenarios(data, serie, issues)
    records = build_scene_records(data, registry, issues)
    beat_report = validate_story_beats(records, packet, issues)
    max_references = validate_references(records, registry, pose_roles, scenarios, issues)
    full_script, edit_speed, scene_load = validate_tts_and_editing(data, records, packet, issues, warnings)

    prompts = [record["prompt"] for record in records if record["type"] == "panel"]
    normalized_prompts: dict[str, str] = {}
    prompt_cores: dict[str, tuple[str, tuple[Any, ...]]] = {}
    near_duplicates: list[dict[str, Any]] = []
    for record in [item for item in records if item["type"] == "panel"]:
        normalized = normalized_text(record["prompt"])
        if normalized in normalized_prompts:
            add_issue(issues, "unique_prompts", "DUPLICATE_PROMPT", f"Prompt idéntico a {normalized_prompts[normalized]}.", record["id"])
        else:
            normalized_prompts[normalized] = record["id"]
        core = prompt_core(record["prompt"])
        plan = record.get("plan", {})
        signature = (
            plan.get("dominant_subject_id"),
            plan.get("page_layout"),
            plan.get("shot_scale"),
            plan.get("camera_elevation"),
            plan.get("viewpoint"),
            plan.get("camera_roll"),
            as_dict(plan.get("action")).get("phase"),
        )
        for previous_id, (previous_core, previous_signature) in prompt_cores.items():
            if signature != previous_signature:
                continue
            if min(len(core), len(previous_core)) >= 80:
                similarity = SequenceMatcher(None, core, previous_core).ratio()
                if similarity >= 0.985:
                    near_duplicates.append({"scene_id": record["id"], "similar_to": previous_id, "similarity": round(similarity, 3)})
                    add_issue(issues, "unique_prompts", "NEAR_DUPLICATE_PROMPT", f"Prompt casi duplicado de {previous_id} ({similarity:.3f}).", record["id"])
                    break
        prompt_cores[record["id"]] = (core, signature)

    visual_report = validate_global_visual_rules(records, registry, issues)
    continuity_report = validate_continuity_sequence(records, registry, transparent, packet, issues)

    gates = {name: not any(issue["gate"] == name for issue in issues) for name in GATE_NAMES}
    gates["json_parse"] = True
    contract_errors = [issue for issue in issues if issue["gate"] in CONTRACT_GATES]
    contract_ok = not contract_errors
    prompt_release = contract_ok and all(gates.values())
    panel_count = sum(record["type"] == "panel" for record in records)
    card_count = sum(record["type"] == "narrative_card" for record in records)
    return {
        "file": str(absolute),
        "status": "CONTRACT_PASS" if contract_ok else "FAIL",
        "preflight_status": "PROMPT_RELEASE" if prompt_release else "PROMPT_REPAIR_REQUIRED",
        "preflight_gates": gates,
        "contract": {"ok": contract_ok, "errors": contract_errors},
        "errors": issues,
        "warnings": warnings,
        "counts": {
            "scenes": len(records),
            "panels": panel_count,
            "cards": card_count,
            "full_script_characters": len(full_script),
            "max_references": max_references,
        },
        "integrity": {"full_script_exact": gates["full_script_exact"]},
        "prompts": {
            "count": len(prompts),
            "near_duplicates": near_duplicates,
            "bands": [
                {"scene_id": record["id"], **record.get("prompt_band", {})}
                for record in records
                if record["type"] == "panel"
            ],
        },
        "timing": {"method": "estimate_150_raw_wpm", "edit_speed": edit_speed, "scenes": scene_load},
        "visual_grammar_v5_3": visual_report,
        "continuity": continuity_report,
        "story_packet": {
            "path": packet.get("path") if packet else None,
            "sha256": packet.get("sha256") if packet else None,
            "monologue_sha256": packet.get("monologue_sha256") if packet else None,
            "beats": beat_report,
        },
        "tts": {"audio_tags": TAG_RE.findall(full_script)},
        "validator_version": VALIDATOR_VERSION,
        "scope": "PROMPT_PREFLIGHT_ONLY",
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        report = failure_report("", "USAGE", "Uso: python validate_v5_3.py <proyecto.json> <STORY_PACKET.md>")
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
        return 1
    try:
        absolute, data = load_json(argv[1])
        packet_path = Path(argv[2]).expanduser().resolve()
        packet, packet_issues = parse_story_packet(packet_path.read_bytes(), packet_path)
        report = validate(data, absolute, packet, packet_issues)
    except FileNotFoundError:
        report = failure_report(str(Path(argv[1]).expanduser()), "FILE_NOT_FOUND", "No se encontró el JSON o Story Packet.")
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        report = failure_report(str(Path(argv[1]).expanduser()), "JSON_PARSE_ERROR", str(error))
    except OSError as error:
        report = failure_report(str(Path(argv[1]).expanduser()), "FILE_READ_ERROR", str(error))
    except Exception as error:  # fail closed: nunca expone traceback al llamador
        report = failure_report(str(Path(argv[1]).expanduser()), "VALIDATOR_INTERNAL_ERROR", f"{type(error).__name__}: {error}")
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    return 0 if report.get("preflight_status") == "PROMPT_RELEASE" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
