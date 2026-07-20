#!/usr/bin/env python3
"""Validador ejecutable del contrato Manhwa GPT V6.

Tres modos deliberadamente separados:

* ``--packet-only`` comprueba el handoff narrativo bloqueado.
* ``--preflight`` comprueba intención, geometría, cámara y continuidad antes de generar.
* ``--postflight`` comprueba procedencia, recompone páginas y valida observaciones de archivos ya generados.

Packet/preflight usan solo biblioteca estándar. Postflight invoca el compositor hermano,
que requiere Pillow, en un directorio temporal. Ningún modo importa ni modifica Remotion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import struct
import sys
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


VERSION = "6.0"
CANVAS = (720, 1280)
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")
SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
SCENE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$")
JS_MAX_SAFE_INTEGER = 9_007_199_254_740_991

PURPOSES = {
    "MASTER", "DISCOVERY", "POV", "RELATION", "REACTION", "INSERT",
    "ANTICIPATION", "TRAJECTORY", "CONTACT", "IMPACT", "CONSEQUENCE",
    "ISOLATION", "PUNCTUATION",
}
SCALES = {"MACRO", "EXTREME_CLOSE", "CLOSE", "MEDIUM", "FULL", "WIDE_MASTER", "TRUE_LONG"}
ELEVATIONS = {"EYE_LEVEL", "LOW", "HIGH", "BIRDS_EYE", "TOP_DOWN", "WORMS_EYE", "KNEE_LEVEL", "GROUND_LEVEL"}
VIEWPOINTS = {"FRONT", "THREE_QUARTER_FRONT", "PROFILE", "OTS", "POV", "REAR", "REAR_THREE_QUARTER"}
ROLLS = {"LEVEL", "DUTCH"}
CHANGE_MODES = {"START", "MATCH", "CONTRAST"}
TEMPLATES = {"FULL_BLEED", "STACKED_2", "ASYM_2", "STACKED_3", "BLACK_INSET", "WHITE_ISOLATE"}
SHAPES = {"rect", "rounded", "circle", "diagonal_left", "diagonal_right"}
FITS = {"cover", "contain"}
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
    "F_APPROVED_HASH_CHANGED", "F_HUMAN_PREFERENCE",
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
    """Lee dimensiones PNG/JPEG sin Pillow."""
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

    V6 puede anadir metadatos, pero no sustituir poses, vistas ni ingredients[].
    """
    raw_project = root.get("project")
    project = raw_project if isinstance(raw_project, dict) else {}
    raw_series = project.get("series")
    series = raw_series if isinstance(raw_series, dict) else {}
    serie = project.get("serie", series.get("id"))

    characters = dict_value(root.get("characters"), v, "characters")
    v.require(bool(characters), "characters", "mapa no vacio requerido")
    character_poses: dict[str, set[str]] = {}
    for character_id, raw_character in characters.items():
        location = f"characters.{character_id}"
        v.require(isinstance(character_id, str) and SCENE_ID_RE.fullmatch(character_id) is not None,
                  location, "ID seguro requerido")
        character = dict_value(raw_character, v, location)
        require_text(character, "display_name", v, location)
        poses = dict_value(character.get("poses"), v, f"{location}.poses")
        v.require(bool(poses), f"{location}.poses", "mapa no vacio requerido; V6 no puede reemplazarlo por prompt_signature")
        pose_ids = {key for key in poses if isinstance(key, str)}
        character_poses[str(character_id)] = pose_ids
        for pose_id, raw_pose in poses.items():
            pose_location = f"{location}.poses.{pose_id}"
            v.require(isinstance(pose_id, str) and SCENE_ID_RE.fullmatch(pose_id) is not None,
                      pose_location, "ID seguro requerido")
            pose = validate_runtime_asset_definition(raw_pose, v, pose_location, "reference_pose")
            reference_pose = pose.get("reference_pose")
            if isinstance(reference_pose, str):
                v.require(reference_pose in pose_ids, f"{pose_location}.reference_pose",
                          f"pose inexistente en {location}.poses")

    escenarios = dict_value(root.get("escenarios"), v, "escenarios")
    v.require(bool(escenarios), "escenarios", "mapa no vacio requerido")
    escenario_views: dict[str, set[str]] = {}
    escenario_has_reference: set[str] = set()
    for escenario_id, raw_escenario in escenarios.items():
        location = f"escenarios.{escenario_id}"
        v.require(isinstance(escenario_id, str) and SCENE_ID_RE.fullmatch(escenario_id) is not None,
                  location, "ID seguro requerido")
        escenario = dict_value(raw_escenario, v, location)
        require_text(escenario, "display_name", v, location)
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
        for view_id, raw_view in views.items():
            view_location = f"{location}.views.{view_id}"
            v.require(isinstance(view_id, str) and SCENE_ID_RE.fullmatch(view_id) is not None,
                      view_location, "ID seguro requerido")
            view = validate_runtime_asset_definition(raw_view, v, view_location, "reference_view")
            reference_view = view.get("reference_view")
            if isinstance(reference_view, str):
                v.require(reference_view in view_ids, f"{view_location}.reference_view",
                          f"vista inexistente en {location}.views")

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
        "escenarios": escenarios,
        "escenario_views": escenario_views,
        "escenario_has_reference": escenario_has_reference,
        "ingredient_types": ingredient_types,
    }


def validate_runtime_scene_references(
    raw: Any,
    graph: dict[str, Any],
    scene_ids: set[str],
    scene_id: str,
    v: Validation,
    location: str,
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
            has_usable_reference = True

    escenario_raw = refs.get("escenario")
    if escenario_raw is not None:
        escenario = dict_value(escenario_raw, v, f"{location}.escenario")
        escenario_id = escenario.get("id")
        view = escenario.get("view", "base")
        v.require(escenario_id in graph["escenarios"], f"{location}.escenario.id", "escenario inexistente")
        if escenario_id in graph["escenarios"]:
            valid_views = graph["escenario_views"].get(escenario_id, set())
            has_reference = escenario_id in graph["escenario_has_reference"]
            v.require(view in valid_views or (has_reference and view == "base"),
                      f"{location}.escenario.view", "vista inexistente")
        has_usable_reference = True

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
    """Mirror the compositor's source-master gate without relaxing final pages."""
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

    headings = ("META", "MACHINE_LOCK_V6", "MONOLOGO_LOCKED", "PREMISA_COMERCIAL", "CANON_NECESARIO",
                "STORY_BEATS", "visual_obligations", "CONTINUITY_LEDGER", "QA_SHOWRUNNER")
    sections: dict[str, str] = {}
    for heading in headings:
        section = markdown_section(text, heading)
        v.require(section is not None and bool(section.strip()), "packet", f"falta sección no vacía ## {heading}")
        sections[heading] = section or ""
    v.require(re.search(r'handoff_version:\s*["\']?6\.0["\']?', text) is not None,
              "packet.META.handoff_version", "debe ser 6.0")
    for key in ("packet_scope", "series_id", "part_number", "approved_voice_id", "language"):
        v.require(re.search(rf"(?m)^\s*{key}:\s*\S+", sections["META"]) is not None,
                  f"packet.META.{key}", "campo requerido")
    scope_match = re.search(r"(?m)^\s*packet_scope:\s*([A-Z_]+)\s*$", sections["META"])
    packet_scope = scope_match.group(1) if scope_match else ""
    v.require(packet_scope in {"PRODUCTION_PART", "PILOT_FRAGMENT", "VALIDATOR_FIXTURE"},
              "packet.META.packet_scope", "enum inválido")
    expected_packet_status = {
        "PRODUCTION_PART": "PACKET_READY_V6",
        "PILOT_FRAGMENT": "PILOT_PACKET_READY_V6",
        "VALIDATOR_FIXTURE": "FIXTURE_VALID_V6",
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

    machine = json_block(sections["MACHINE_LOCK_V6"], lambda value: isinstance(value, dict) and "voice_visual_lock" in value)
    v.require(isinstance(machine, dict), "packet.MACHINE_LOCK_V6", "requiere bloque JSON con voice_visual_lock")
    atoms_raw = machine.get("voice_visual_lock", []) if isinstance(machine, dict) else []
    atoms = list_value(atoms_raw, v, "packet.MACHINE_LOCK_V6.voice_visual_lock")
    v.require(bool(atoms), "packet.MACHINE_LOCK_V6.voice_visual_lock", "no puede estar vacío")
    atom_ids: list[str] = []
    atom_texts: list[str] = []
    for index, atom_raw in enumerate(atoms):
        loc = f"packet.MACHINE_LOCK_V6.voice_visual_lock[{index}]"
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
    v.require(len(set(atom_ids)) == len(atom_ids), "packet.MACHINE_LOCK_V6.voice_visual_lock", "atom_id duplicado")

    payload = monologue_payload(text)
    if payload is None:
        v.error("packet.MONOLOGO_LOCKED", "falta bloque ```text parser-ready")
    else:
        declared = re.search(r"monologue_sha256:\s*([0-9a-fA-F]{64})", text)
        if not declared:
            v.error("packet.MACHINE_LOCK_V6.monologue_sha256", "falta SHA-256 real")
        else:
            actual = canonical_hash(payload)
            v.require(declared.group(1).lower() == actual,
                      "packet.MACHINE_LOCK_V6.monologue_sha256",
                      f"hash no coincide; esperado por bytes canónicos {actual}")
        count = re.search(r"character_count:\s*(\d+)", text)
        canonical = unicodedata.normalize("NFC", payload.replace("\r\n", "\n").replace("\r", "\n"))
        if canonical.endswith("\n"):
            canonical = canonical[:-1]
        if count:
            v.require(int(count.group(1)) == len(canonical), "packet.MACHINE_LOCK_V6.character_count",
                      f"declarado {count.group(1)}, real {len(canonical)}")
        spoken_lines = [line.strip() for line in canonical.split("\n") if line.strip()]
        v.require(spoken_lines == atom_texts, "packet.MACHINE_LOCK_V6.voice_visual_lock",
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
        for key in ("must_be_own_source", "may_share_page"):
            v.require(isinstance(item.get(key), bool), f"{loc}.{key}", "booleano requerido")
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
    result_status = "PACKET_READY_V6" if packet_scope == "PRODUCTION_PART" else expected_packet_status
    return v.finish(result_status, f"file={path.name}")


DEFAULT_THRESHOLDS: dict[str, Any] = {
    "min_non_eye_level_pct": 20,
    "min_non_frontal_pct": 35,
    "max_identical_signature_run": 2,
    "min_composed_page_pct": 25,
    "max_composed_page_pct": 35,
    "min_distinct_composed_templates": 3,
    "max_generation_attempts": 3,
    "min_camera_match_pct": 90,
    "min_distinct_camera_signatures": 6,
    "max_minor_failures_pilot": 1,
    "max_minor_failure_pct_production": 2,
    "human_ab_required": True,
    "human_ab_reviewers": 5,
    "human_ab_pairs": 10,
    "human_ab_min_v6_votes": 33,
    "human_ab_min_pair_wins": 7,
}


def thresholds_for(contract: dict[str, Any], mode: str, v: Validation) -> dict[str, Any]:
    result = dict(DEFAULT_THRESHOLDS)
    if mode == "PILOT":
        result["min_composed_page_pct"] = 40
        result["max_composed_page_pct"] = 60
    supplied = contract.get("thresholds", {})
    if not isinstance(supplied, dict):
        v.error("v6_contract.thresholds", "debe ser objeto")
        return result
    result.update(supplied)
    numeric = (
        "min_non_eye_level_pct", "min_non_frontal_pct", "max_identical_signature_run",
        "min_composed_page_pct", "max_composed_page_pct", "min_distinct_composed_templates",
        "max_generation_attempts", "min_camera_match_pct", "min_distinct_camera_signatures",
        "max_minor_failures_pilot", "max_minor_failure_pct_production", "human_ab_reviewers",
        "human_ab_pairs", "human_ab_min_v6_votes", "human_ab_min_pair_wins",
    )
    for key in numeric:
        if not isinstance(result.get(key), (int, float)) or isinstance(result.get(key), bool):
            v.error(f"v6_contract.thresholds.{key}", "debe ser numérico")
            result[key] = DEFAULT_THRESHOLDS[key]
    if isinstance(result.get("min_composed_page_pct"), (int, float)) and isinstance(result.get("max_composed_page_pct"), (int, float)):
        v.require(0 <= result["min_composed_page_pct"] <= result["max_composed_page_pct"] <= 100,
                  "v6_contract.thresholds", "rango de páginas compuestas inválido")
    v.require(result.get("human_ab_required") is True,
              "v6_contract.thresholds.human_ab_required", "gate HARD: debe ser true")

    # El productor puede endurecer gates, nunca rebajarlos para fabricar un PASS.
    minimums = {
        "min_non_eye_level_pct": 20,
        "min_non_frontal_pct": 35,
        "min_composed_page_pct": 40 if mode == "PILOT" else 25,
        "min_distinct_composed_templates": 3,
        "min_camera_match_pct": 90,
        "min_distinct_camera_signatures": 6,
        "human_ab_reviewers": 5,
        "human_ab_pairs": 10,
    }
    maximums = {
        "max_identical_signature_run": 2,
        "max_composed_page_pct": 60 if mode == "PILOT" else 35,
        "max_generation_attempts": 3,
        "max_minor_failures_pilot": 1,
        "max_minor_failure_pct_production": 2,
    }
    for key, floor in minimums.items():
        v.require(result[key] >= floor, f"v6_contract.thresholds.{key}", f"no puede rebajarse por debajo de {floor}")
    for key, ceiling in maximums.items():
        v.require(0 <= result[key] <= ceiling, f"v6_contract.thresholds.{key}", f"no puede superar el máximo HARD {ceiling}")
    reviewers = max(1, int(result["human_ab_reviewers"]))
    pairs = max(1, int(result["human_ab_pairs"]))
    minimum_votes = math.ceil(reviewers * pairs * 0.66)
    minimum_wins = math.ceil(pairs * 0.70)
    v.require(result["human_ab_min_v6_votes"] >= minimum_votes,
              "v6_contract.thresholds.human_ab_min_v6_votes", f"requiere al menos 66%: {minimum_votes}")
    v.require(result["human_ab_min_pair_wins"] >= minimum_wins,
              "v6_contract.thresholds.human_ab_min_pair_wins", f"requiere al menos 70%: {minimum_wins}")
    return result


def signature(shot: dict[str, Any]) -> tuple[Any, ...]:
    values: list[Any] = []
    for key in ("scale", "elevation", "viewpoint", "roll", "dominant_subject"):
        value = shot.get(key)
        values.append(value if isinstance(value, (str, int, float, bool, type(None))) else repr(value))
    return tuple(values)


def validate_references(refs_raw: Any, shot: dict[str, Any], continuity: dict[str, Any], v: Validation, location: str) -> None:
    refs = list_value(refs_raw, v, location)
    v.require(len(refs) <= 3, location, "máximo tres referencias por fuente")
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
        v.require(isinstance(views, list) and bool(views) and all(is_enum(view, VIEWPOINTS) for view in views),
                  f"{loc}.compatible_views", "lista no vacía de viewpoints válidos requerida")
        if isinstance(views, list) and shot.get("viewpoint") not in views:
            v.error(f"{loc}.compatible_views", f"no incluye viewpoint pedido {shot.get('viewpoint')}")
        if ref.get("role") == "LOCATION" and is_enum(authority, {"GEOMETRY_LOCK", "FULL_LOCK"}):
            cam = dict_value(ref.get("camera_signature"), v, f"{loc}.camera_signature")
            v.require(cam.get("elevation") == shot.get("elevation") and cam.get("viewpoint") == shot.get("viewpoint"),
                      f"{loc}.camera_signature", "LOCATION lock incompatible con shot_ledger")
        if authority == "FULL_LOCK" and shot.get("change_mode") == "CONTRAST":
            v.error(f"{loc}.composition_authority", "FULL_LOCK está prohibido en CONTRAST")

    approved_raw = continuity.get("approved_reference_hashes", [])
    approved = list_value(approved_raw, v, f"{location.rsplit('.', 1)[0]}.continuity_lock.approved_reference_hashes")
    approved_hashes = {clean_hash(item) for item in approved}
    if None in approved_hashes:
        v.error(f"{location.rsplit('.', 1)[0]}.continuity_lock.approved_reference_hashes", "contiene hash inválido")
    v.require(hashes.issubset(approved_hashes),
              f"{location.rsplit('.', 1)[0]}.continuity_lock.approved_reference_hashes",
              "debe cubrir todos los hashes de references_v6")


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


def validate_shot(raw: Any, v: Validation, location: str) -> dict[str, Any]:
    shot = dict_value(raw, v, location)
    for key in ("shot_id", "sequence_id", "dominant_subject", "camera_intent", "change_reason", "axis_id", "screen_direction"):
        require_text(shot, key, v, location)
    v.require(is_enum(shot.get("purpose"), PURPOSES), f"{location}.purpose", "purpose inválido")
    v.require(is_enum(shot.get("scale"), SCALES), f"{location}.scale", "scale inválida")
    v.require(is_enum(shot.get("elevation"), ELEVATIONS), f"{location}.elevation", "elevation inválida")
    v.require(is_enum(shot.get("viewpoint"), VIEWPOINTS), f"{location}.viewpoint", "viewpoint inválido")
    v.require(is_enum(shot.get("roll"), ROLLS), f"{location}.roll", "roll inválido")
    v.require(is_enum(shot.get("change_mode"), CHANGE_MODES), f"{location}.change_mode", "change_mode inválido")
    occupancy = shot.get("occupancy_pct")
    v.require(isinstance(occupancy, (int, float)) and not isinstance(occupancy, bool) and 0 < occupancy <= 100,
              f"{location}.occupancy_pct", "debe estar entre 0 y 100")
    band = shot.get("occupancy_range_pct")
    valid_band = (isinstance(band, list) and len(band) == 2 and
                  all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in band) and
                  0 <= band[0] <= band[1] <= 100)
    v.require(valid_band, f"{location}.occupancy_range_pct", "banda [min,max] inválida")
    if valid_band and isinstance(occupancy, (int, float)):
        v.require(band[0] <= occupancy <= band[1], f"{location}.occupancy_pct", "fuera de occupancy_range_pct")
    for key in ("human_subject_visible", "quota_eligible"):
        v.require(isinstance(shot.get(key), bool), f"{location}.{key}", "booleano requerido")
    return shot


def rect_intersection(a: dict[str, Any], b: dict[str, Any]) -> float:
    left = max(a["x"], b["x"])
    top = max(a["y"], b["y"])
    right = min(a["x"] + a["w"], b["x"] + b["w"])
    bottom = min(a["y"] + a["h"], b["y"] + b["h"])
    return max(0.0, right - left) * max(0.0, bottom - top)


def rect_distance_px(a: dict[str, Any], b: dict[str, Any]) -> float:
    ax1, ay1, ax2, ay2 = a["x"] * 720, a["y"] * 1280, (a["x"] + a["w"]) * 720, (a["y"] + a["h"]) * 1280
    bx1, by1, bx2, by2 = b["x"] * 720, b["y"] * 1280, (b["x"] + b["w"]) * 720, (b["y"] + b["h"]) * 1280
    dx = max(0.0, max(ax1, bx1) - min(ax2, bx2))
    dy = max(0.0, max(ay1, by1) - min(ay2, by2))
    return math.hypot(dx, dy)


def validate_slot(slot_raw: Any, safe: dict[str, float], v: Validation, location: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    slot = dict_value(slot_raw, v, location)
    require_text(slot, "id", v, location)
    source = slot.get("source")
    source_portable = source.replace("\\", "/") if isinstance(source, str) else ""
    valid_cell_source = (
        is_safe_relative(source)
        and re.fullmatch(r"images/cells/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp)", source_portable, re.IGNORECASE)
        is not None
    )
    v.require(valid_cell_source, f"{location}.source", "ruta segura requerida bajo images/cells/")
    prompt = require_text(slot, "prompt", v, location)
    forbidden = re.search(r"\b(panel(?:es)?|gutter|collage|página blanca|white page|slot [abc])\b", prompt, re.IGNORECASE)
    v.require(forbidden is None, f"{location}.prompt", "describe arte, no layout/panel/gutter/collage")
    numbers_ok = True
    for key in ("x", "y", "w", "h"):
        value = slot.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            v.error(f"{location}.{key}", "número normalizado requerido")
            numbers_ok = False
    if numbers_ok:
        x, y, w, h = (float(slot[key]) for key in ("x", "y", "w", "h"))
        v.require(0 <= x < 1 and 0 <= y < 1 and 0 < w <= 1 and 0 < h <= 1 and x + w <= 1 and y + h <= 1,
                  location, "slot fuera del canvas normalizado")
        v.require(x + 1e-9 >= safe["left"] and y + 1e-9 >= safe["top"] and
                  x + w <= 1 - safe["right"] + 1e-9 and y + h <= 1 - safe["bottom"] + 1e-9,
                  location, "slot invade safe_area")
        v.require(w * 720 >= 260, f"{location}.w", "ancho efectivo menor a 260 px")
        v.require(h * 1280 >= 240, f"{location}.h", "alto efectivo menor a 240 px")
        v.require(w * h >= 0.12, location, "área menor a 12% del canvas")
    v.require(is_enum(slot.get("fit"), FITS), f"{location}.fit", "usa cover o contain")
    focal = dict_value(slot.get("focal_point"), v, f"{location}.focal_point")
    v.require(all(isinstance(focal.get(key), (int, float)) and not isinstance(focal.get(key), bool) and 0 <= focal[key] <= 1 for key in ("x", "y")),
              f"{location}.focal_point", "x/y deben estar entre 0 y 1")
    v.require(is_enum(slot.get("shape"), SHAPES), f"{location}.shape", "shape inválida")
    v.require(isinstance(slot.get("z"), (int, float)) and not isinstance(slot.get("z"), bool), f"{location}.z", "número requerido")
    rotation = slot.get("rotation_deg")
    v.require(isinstance(rotation, (int, float)) and not isinstance(rotation, bool) and math.isfinite(rotation),
              f"{location}.rotation_deg", "número finito requerido")
    for key in ("border_px", "radius_px"):
        value = slot.get(key)
        v.require(isinstance(value, int) and not isinstance(value, bool) and value >= 0,
                  f"{location}.{key}", "entero no negativo requerido")
    border_color = require_text(slot, "border_color", v, location)
    v.require(HEX_COLOR.fullmatch(border_color) is not None, f"{location}.border_color", "usa #RRGGBB o #RRGGBBAA")
    if numbers_ok and isinstance(rotation, (int, float)) and not isinstance(rotation, bool) and math.isfinite(rotation):
        width_px, height_px = w * 720, h * 1280
        radians = math.radians(rotation)
        rotated_w = abs(width_px * math.cos(radians)) + abs(height_px * math.sin(radians))
        rotated_h = abs(width_px * math.sin(radians)) + abs(height_px * math.cos(radians))
        center_x, center_y = (x + w / 2) * 720, (y + h / 2) * 1280
        v.require(center_x - rotated_w / 2 >= safe["left"] * 720 - 1e-6 and
                  center_x + rotated_w / 2 <= (1 - safe["right"]) * 720 + 1e-6 and
                  center_y - rotated_h / 2 >= safe["top"] * 1280 - 1e-6 and
                  center_y + rotated_h / 2 <= (1 - safe["bottom"]) * 1280 + 1e-6,
                  f"{location}.rotation_deg", "bounding box rotado invade safe_area")
    shot = validate_shot(slot.get("shot_ledger"), v, f"{location}.shot_ledger")
    continuity = validate_continuity(slot.get("continuity_lock"), v, f"{location}.continuity_lock")
    validate_references(slot.get("references_v6"), shot, continuity, v, f"{location}.references_v6")
    return slot, shot, continuity


def validate_project(data: Any) -> tuple[Validation, dict[str, Any]]:
    v = Validation()
    root = dict_value(data, v, "root")
    contract = dict_value(root.get("v6_contract"), v, "v6_contract")
    v.require(contract.get("version") == VERSION, "v6_contract.version", "debe ser 6.0")
    mode = contract.get("mode")
    v.require(is_enum(mode, {"PILOT", "PRODUCTION"}), "v6_contract.mode", "usa PILOT o PRODUCTION")
    mode = mode if is_enum(mode, {"PILOT", "PRODUCTION"}) else "PILOT"
    canvas = dict_value(contract.get("canvas"), v, "v6_contract.canvas")
    v.require(canvas.get("width") == 720 and canvas.get("height") == 1280,
              "v6_contract.canvas", "debe ser exactamente 720x1280")
    thresholds = thresholds_for(contract, mode, v)

    scenes_preview = root.get("scenes") if isinstance(root.get("scenes"), list) else []
    has_composed_pages = any(
        isinstance(scene, dict)
        and isinstance(scene.get("visual"), dict)
        and scene["visual"].get("page_blueprint") is not None
        for scene in scenes_preview
    )
    if has_composed_pages:
        runtime_adapter = dict_value(contract.get("runtime_adapter"), v, "v6_contract.runtime_adapter")
        v.require(runtime_adapter.get("page_blueprint_slots_integrated") is True,
                  "v6_contract.runtime_adapter.page_blueprint_slots_integrated",
                  "debe ser true para usar page_blueprint; sin adaptador el runtime enviaria Page summary e ignoraria slots")

    production_lock = dict_value(root.get("production_lock"), v, "production_lock")
    v.require(production_lock.get("v6_version") == VERSION, "production_lock.v6_version", "debe ser 6.0")
    v.require(is_safe_relative(production_lock.get("story_packet_path")),
              "production_lock.story_packet_path", "ruta relativa segura al packet requerido")
    v.require(clean_hash(production_lock.get("story_packet_sha256")) is not None,
              "production_lock.story_packet_sha256", "SHA-256 real requerido")
    v.require(clean_hash(production_lock.get("monologue_sha256")) is not None,
              "production_lock.monologue_sha256", "SHA-256 real requerido")
    require_text(production_lock, "approved_voice_id", v, "production_lock")

    pipeline = dict_value(root.get("pipeline"), v, "pipeline")
    for key in ("image_generation", "animation", "tts", "editing"):
        stage = dict_value(pipeline.get(key), v, f"pipeline.{key}")
        require_text(stage, "tool", v, f"pipeline.{key}")
    editing = dict_value(root.get("editing"), v, "editing")
    dict_value(editing.get("caption_style"), v, "editing.caption_style")
    dict_value(editing.get("panel_motion"), v, "editing.panel_motion")
    tts_export = dict_value(root.get("tts_export"), v, "tts_export")
    require_text(tts_export, "provider", v, "tts_export")
    require_text(tts_export, "language", v, "tts_export")
    v.require("voice_id" not in tts_export, "tts_export.voice_id",
              "ruta no consumida por manhwa; usa tts_export.voices.narrador o pipeline.tts.voice_id")
    voices_raw = tts_export.get("voices")
    voices = voices_raw if isinstance(voices_raw, dict) else {}
    if voices_raw is not None and not isinstance(voices_raw, dict):
        v.error("tts_export.voices", "debe ser un objeto")
    pipeline_tts = pipeline.get("tts") if isinstance(pipeline.get("tts"), dict) else {}
    narrator_voice = voices.get("narrador")
    pipeline_voice = pipeline_tts.get("voice_id")
    v.require(
        (isinstance(narrator_voice, str) and bool(narrator_voice.strip()))
        or (isinstance(pipeline_voice, str) and bool(pipeline_voice.strip())),
        "tts_export.voices.narrador",
        "voz requerida aqui o en pipeline.tts.voice_id",
    )
    v.require("full_script" not in root, "full_script",
              "ruta raiz prohibida; el runtime consume tts_export.full_script")
    full_script = tts_export.get("full_script")
    v.require(isinstance(full_script, str) and bool(full_script.strip()),
              "tts_export.full_script", "texto contractual requerido")
    if isinstance(full_script, str):
        expected_monologue = canonical_hash(full_script)
        v.require(clean_hash(production_lock.get("monologue_sha256")) == expected_monologue,
                  "production_lock.monologue_sha256", f"no coincide con tts_export.full_script; esperado {expected_monologue}")

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
    v.require(isinstance(project.get("part"), int) and not isinstance(project.get("part"), bool) and project.get("part", 0) >= 1,
              "project.part", "entero >=1 requerido")

    scenes = list_value(root.get("scenes"), v, "scenes")
    declared_scene_ids = {
        scene.get("id")
        for scene in scenes
        if isinstance(scene, dict) and isinstance(scene.get("id"), str)
    }
    scene_ids: set[str] = set()
    source_records: list[dict[str, Any]] = []
    panel_scenes: list[dict[str, Any]] = []
    composed_positions: list[int] = []
    composed_templates: list[str] = []
    stacked3 = 0
    for scene_index, scene_raw in enumerate(scenes):
        sloc = f"scenes[{scene_index}]"
        scene = dict_value(scene_raw, v, sloc)
        scene_id = require_text(scene, "id", v, sloc)
        v.require(SCENE_ID_RE.fullmatch(scene_id) is not None, f"{sloc}.id", "ID seguro requerido: letras/números/_/-")
        v.require(scene_id not in scene_ids, f"{sloc}.id", "ID duplicado")
        scene_ids.add(scene_id)
        scene_type = scene.get("type")
        v.require(is_enum(scene_type, {"panel", "narrative_card"}), f"{sloc}.type", "usa panel o narrative_card")
        if scene_type == "narrative_card":
            for prohibited in ("visual", "render_mode", "shot_ledger", "page_blueprint", "editor_motion"):
                v.require(prohibited not in scene, sloc, f"narrative_card no puede llevar {prohibited}")
            card = dict_value(scene.get("card"), v, f"{sloc}.card")
            v.require(card.get("mode") == "editor", f"{sloc}.card.mode", "debe ser editor")
            words = str(card.get("text", "")).split()
            v.require(2 <= len(words) <= 7, f"{sloc}.card.text", "card debe contener 2-7 palabras")
            voiceover = dict_value(scene.get("voiceover"), v, f"{sloc}.voiceover")
            captions = dict_value(scene.get("captions"), v, f"{sloc}.captions")
            voice_text = require_text(voiceover, "text", v, f"{sloc}.voiceover")
            v.require(captions.get("text") == voice_text, f"{sloc}.captions.text", "debe coincidir con voiceover.text")
            require_text(scene, "transition_in", v, sloc)
            continue
        if scene_type != "panel":
            continue
        panel_position = len(panel_scenes)
        panel_scenes.append(scene)
        v.require(scene.get("render_mode") == "static", f"{sloc}.render_mode", "debe ser static")
        v.require(not scene.get("animation_prompt"), f"{sloc}.animation_prompt", "V6 no genera animación")
        validate_runtime_scene_references(
            scene.get("references"), runtime_graph, declared_scene_ids, scene_id, v, f"{sloc}.references"
        )
        voiceover = dict_value(scene.get("voiceover"), v, f"{sloc}.voiceover")
        captions = dict_value(scene.get("captions"), v, f"{sloc}.captions")
        voice_text = require_text(voiceover, "text", v, f"{sloc}.voiceover")
        v.require(captions.get("text") == voice_text, f"{sloc}.captions.text", "debe coincidir con voiceover.text")
        require_text(scene, "transition_in", v, sloc)
        visual = dict_value(scene.get("visual"), v, f"{sloc}.visual")
        image_prompt = require_text(visual, "image_prompt", v, f"{sloc}.visual")
        v.require("page summary" not in image_prompt.casefold(), f"{sloc}.visual.image_prompt",
                  "debe ser un prompt visual generable, nunca Page summary")
        expected_final_source = f"images/{scene_id}.jpg"
        v.require(visual.get("source") == expected_final_source, f"{sloc}.visual.source",
                  f"JPG final debe ser {expected_final_source}")
        page = visual.get("page_blueprint")
        if page is None:
            v.require(is_safe_relative(visual.get("source")), f"{sloc}.visual.source", "ruta relativa segura requerida")
            prompt = image_prompt
            shot = validate_shot(visual.get("shot_ledger"), v, f"{sloc}.visual.shot_ledger")
            continuity = validate_continuity(visual.get("continuity_lock"), v, f"{sloc}.visual.continuity_lock")
            validate_references(visual.get("references_v6"), shot, continuity, v, f"{sloc}.visual.references_v6")
            source_records.append({"scene_id": scene_id, "slot_id": None, "source": visual.get("source"), "prompt": prompt,
                                   "shot": shot, "continuity": continuity, "composed": False})
        else:
            composed_positions.append(panel_position)
            p = dict_value(page, v, f"{sloc}.visual.page_blueprint")
            v.require(p.get("version") == VERSION, f"{sloc}.visual.page_blueprint.version", "debe ser 6.0")
            revision = p.get("composition_revision")
            v.require(isinstance(revision, int) and not isinstance(revision, bool) and revision >= 1,
                      f"{sloc}.visual.page_blueprint.composition_revision", "entero >=1 requerido")
            template = p.get("template")
            v.require(is_enum(template, TEMPLATES - {"FULL_BLEED"}), f"{sloc}.visual.page_blueprint.template", "template compuesto inválido")
            if isinstance(template, str):
                composed_templates.append(template)
                if template == "STACKED_3":
                    stacked3 += 1
            motion = scene.get("editor_motion")
            v.require(motion == {"enabled": False, "preset": "static", "zoom": 1, "pan": 0},
                      f"{sloc}.editor_motion", "página compuesta debe ser estática exactamente")
            background = require_text(p, "background", v, f"{sloc}.visual.page_blueprint")
            v.require(HEX_COLOR.fullmatch(background) is not None,
                      f"{sloc}.visual.page_blueprint.background", "usa #RRGGBB o #RRGGBBAA")
            gutter = p.get("gutter_px")
            v.require(isinstance(gutter, int) and not isinstance(gutter, bool) and gutter >= 0,
                      f"{sloc}.visual.page_blueprint.gutter_px", "entero >=0 requerido")
            safe_raw = dict_value(p.get("safe_area"), v, f"{sloc}.visual.page_blueprint.safe_area")
            safe: dict[str, float] = {}
            for key in ("left", "right", "top", "bottom"):
                value = safe_raw.get(key)
                if isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value < 0.5:
                    safe[key] = float(value)
                else:
                    v.error(f"{sloc}.visual.page_blueprint.safe_area.{key}", "debe estar entre 0 y 0.5")
                    safe[key] = 0.0
            slots_raw = list_value(p.get("slots"), v, f"{sloc}.visual.page_blueprint.slots")
            v.require(1 <= len(slots_raw) <= 3, f"{sloc}.visual.page_blueprint.slots", "requiere 1-3 slots")
            required_slots = {"STACKED_2": 2, "ASYM_2": 2, "STACKED_3": 3, "BLACK_INSET": 1, "WHITE_ISOLATE": 1}
            if template in required_slots:
                v.require(len(slots_raw) == required_slots[template], f"{sloc}.visual.page_blueprint.slots",
                          f"{template} requiere exactamente {required_slots[template]} slot(s)")
            slots: list[dict[str, Any]] = []
            slot_ids: list[str] = []
            for slot_index, slot_raw in enumerate(slots_raw):
                loc = f"{sloc}.visual.page_blueprint.slots[{slot_index}]"
                slot, shot, continuity = validate_slot(slot_raw, safe, v, loc)
                validate_runtime_scene_references(
                    slot.get("references"), runtime_graph, declared_scene_ids, scene_id, v, f"{loc}.references"
                )
                slots.append(slot)
                slot_ids.append(str(slot.get("id", "")))
                source_records.append({"scene_id": scene_id, "slot_id": slot.get("id"), "source": slot.get("source"), "prompt": slot.get("prompt", ""),
                                       "shot": shot, "continuity": continuity, "composed": True})
            v.require(len(set(slot_ids)) == len(slot_ids), f"{sloc}.visual.page_blueprint.slots", "IDs de slot duplicados")
            order = p.get("reading_order")
            v.require(isinstance(order, list) and len(order) == len(slot_ids) and set(order) == set(slot_ids),
                      f"{sloc}.visual.page_blueprint.reading_order", "debe enumerar cada slot exactamente una vez")
            if all(all(isinstance(slot.get(k), (int, float)) for k in ("x", "y", "w", "h")) for slot in slots):
                for left_index, left in enumerate(slots):
                    for right in slots[left_index + 1:]:
                        intersection = rect_intersection(left, right)
                        smaller = min(left["w"] * left["h"], right["w"] * right["h"])
                        overlap = intersection / smaller if smaller else 1.0
                        overlap_limit = 0.35 if template == "ASYM_2" else 0.15
                        v.require(overlap <= overlap_limit + 1e-9, f"{sloc}.visual.page_blueprint.slots",
                                  f"superposición mayor a {overlap_limit * 100:.0f}%")
                        if template == "ASYM_2" and overlap > 0.15:
                            v.require(isinstance(p.get("overlap_intent"), str) and bool(p.get("overlap_intent", "").strip()),
                                      f"{sloc}.visual.page_blueprint.overlap_intent",
                                      "superposición ASYM_2 >15% requiere intención narrativa")
                        if intersection == 0 and isinstance(gutter, (int, float)):
                            v.require(rect_distance_px(left, right) + 1e-6 >= gutter,
                                      f"{sloc}.visual.page_blueprint.slots", "distancia entre slots menor a gutter_px")

    panel_count = len(panel_scenes)
    scripted_voice_lines = [
        scene.get("voiceover", {}).get("text", "")
        for scene in scenes
        if isinstance(scene, dict) and is_enum(scene.get("type"), {"panel", "narrative_card"})
    ]
    if isinstance(full_script, str):
        full_script_lines = [line.strip() for line in full_script.split("\n") if line.strip()]
        v.require(full_script_lines == scripted_voice_lines, "tts_export.full_script",
                  "cada línea hablada no vacía debe coincidir con voiceover.text en orden")
    if mode == "PILOT":
        expected = contract.get("pilot_panel_count", 10)
        v.require(isinstance(expected, int) and panel_count == expected, "scenes", f"PILOT requiere {expected} escenas panel; hay {panel_count}")
    else:
        v.require(30 <= panel_count <= 55, "scenes", f"PRODUCTION requiere 30-55 escenas panel; hay {panel_count}")
    v.require(stacked3 <= 2, "scenes", "máximo dos páginas STACKED_3 por Parte")

    if panel_count:
        composed_pct = len(composed_positions) * 100 / panel_count
        v.require(thresholds["min_composed_page_pct"] <= composed_pct <= thresholds["max_composed_page_pct"],
                  "scenes.page_rhythm", f"páginas compuestas {composed_pct:.1f}% fuera de {thresholds['min_composed_page_pct']}-{thresholds['max_composed_page_pct']}%")
        v.require(len(set(composed_templates)) >= thresholds["min_distinct_composed_templates"],
                  "scenes.page_rhythm", f"solo {len(set(composed_templates))} templates compuestos distintos")
        if composed_positions:
            thirds = {min(2, int(position * 3 / panel_count)) for position in composed_positions}
            v.require(thirds == {0, 1, 2}, "scenes.page_rhythm", "las páginas compuestas deben aparecer al inicio, medio y final")

    # Transiciones, continuidad y variedad se comprueban en orden de fuentes.
    planned_paths: dict[str, str] = {}
    composed_artifacts = {
        artifact
        for scene in panel_scenes
        if isinstance(scene, dict) and isinstance(scene.get("visual"), dict) and scene["visual"].get("page_blueprint") is not None
        for artifact in (
            scene["visual"].get("source"),
            f"images/{scene.get('id')}.composition.json",
        )
        if isinstance(artifact, str)
    }
    for index, record in enumerate(source_records):
        source = record.get("source")
        shot_id = record.get("shot", {}).get("shot_id", f"source_{index}")
        if isinstance(source, str):
            if record.get("composed"):
                v.require(source not in composed_artifacts, f"sources[{index}].source",
                          "fuente de celda colisiona con JPG/manifiesto final")
            if source in planned_paths:
                v.error(f"sources[{index}].source", f"ruta reutilizada por {planned_paths[source]}; cada shot_id requiere fuente propia")
            else:
                planned_paths[source] = str(shot_id)
    prior_by_sequence: dict[str, dict[str, Any]] = {}
    prior_continuity: dict[str, dict[str, Any]] = {}
    run_by_sequence: dict[str, tuple[tuple[Any, ...], int]] = {}
    shot_ids: set[str] = set()
    for index, record in enumerate(source_records):
        shot = record["shot"]
        loc = f"sources[{index}]({record['scene_id']}{('/' + str(record['slot_id'])) if record['slot_id'] else ''})"
        shot_id = shot.get("shot_id")
        v.require(isinstance(shot_id, str) and shot_id not in shot_ids, f"{loc}.shot_ledger.shot_id", "shot_id duplicado")
        if isinstance(shot_id, str):
            shot_ids.add(shot_id)
        sequence_raw = shot.get("sequence_id")
        sequence = sequence_raw if isinstance(sequence_raw, str) and sequence_raw else f"__invalid_sequence_{index}"
        previous = prior_by_sequence.get(sequence)
        if previous is None:
            v.require(shot.get("change_mode") == "START", f"{loc}.shot_ledger.change_mode", "primera fuente de secuencia debe ser START")
            v.require(shot.get("change_from_shot_id") is None, f"{loc}.shot_ledger.change_from_shot_id", "START requiere null")
        else:
            v.require(is_enum(shot.get("change_mode"), {"MATCH", "CONTRAST"}), f"{loc}.shot_ledger.change_mode", "fuente posterior usa MATCH o CONTRAST")
            v.require(shot.get("change_from_shot_id") == previous.get("shot_id"), f"{loc}.shot_ledger.change_from_shot_id",
                      f"debe apuntar a {previous.get('shot_id')}")
            if shot.get("change_mode") == "CONTRAST":
                changes = sum(shot.get(key) != previous.get(key) for key in ("scale", "elevation", "viewpoint", "roll", "dominant_subject"))
                v.require(changes >= 2, f"{loc}.shot_ledger", f"CONTRAST cambia solo {changes}/5 campos; requiere >=2")
        prior_by_sequence[sequence] = shot

        sig = signature(shot)
        previous_sig, previous_run = run_by_sequence.get(sequence, ((), 0))
        current_run = previous_run + 1 if sig == previous_sig else 1
        run_by_sequence[sequence] = (sig, current_run)
        if current_run > thresholds["max_identical_signature_run"]:
            v.require(bool(shot.get("repeat_exception")), f"{loc}.shot_ledger.repeat_exception",
                      f"firma idéntica repetida {current_run} veces sin excepción narrativa")

        continuity = record["continuity"]
        previous_lock = prior_continuity.get(sequence)
        if previous_lock is not None:
            out_state = previous_lock.get("state_out", {})
            in_state = continuity.get("state_in", {})
            if isinstance(out_state, dict) and isinstance(in_state, dict):
                v.require(in_state == out_state, f"{loc}.continuity_lock.state_in",
                          "debe ser copia exacta del state_out previo; no se permiten claves omitidas")
            for key in ("location_id", "lighting_id"):
                if continuity.get(key) != previous_lock.get(key):
                    v.require(isinstance(continuity.get("continuity_change_reason"), str) and
                              bool(continuity.get("continuity_change_reason", "").strip()),
                              f"{loc}.continuity_lock.{key}", "cambio requiere continuity_change_reason")
        prior_continuity[sequence] = continuity

    eligible = [record["shot"] for record in source_records if record["shot"].get("quota_eligible")]
    human = [shot for shot in eligible if shot.get("human_subject_visible")]
    if human:
        non_eye = sum(shot.get("elevation") != "EYE_LEVEL" for shot in human) * 100 / len(human)
        non_frontal = sum(not is_enum(shot.get("viewpoint"), {"FRONT", "THREE_QUARTER_FRONT"}) for shot in human) * 100 / len(human)
        v.require(non_eye >= thresholds["min_non_eye_level_pct"], "camera_quota.non_eye_level", f"{non_eye:.1f}% < {thresholds['min_non_eye_level_pct']}%")
        v.require(non_frontal >= thresholds["min_non_frontal_pct"], "camera_quota.non_frontal", f"{non_frontal:.1f}% < {thresholds['min_non_frontal_pct']}%")
    else:
        v.error("camera_quota", "no hay fuentes humanas quota_eligible para medir variedad")
    families = {
        "high": any(is_enum(shot.get("elevation"), {"HIGH", "BIRDS_EYE", "TOP_DOWN"}) for shot in eligible),
        "low": any(is_enum(shot.get("elevation"), {"LOW", "WORMS_EYE", "GROUND_LEVEL"}) for shot in eligible),
        "relation": any(is_enum(shot.get("viewpoint"), {"OTS", "POV"}) for shot in eligible),
        "profile_rear": any(is_enum(shot.get("viewpoint"), {"PROFILE", "REAR", "REAR_THREE_QUARTER"}) for shot in eligible),
    }
    for family, present in families.items():
        v.require(present, f"camera_families.{family}", "familia obligatoria ausente")
    distinct = len({signature(shot) for shot in eligible})
    v.require(distinct >= thresholds["min_distinct_camera_signatures"], "camera_signatures",
              f"solo {distinct} firmas distintas; requiere {thresholds['min_distinct_camera_signatures']}")

    context = {
        "root": root, "contract": contract, "mode": mode, "thresholds": thresholds,
        "project": project, "scenes": scenes, "panel_scenes": panel_scenes,
        "sources": source_records,
    }
    return v, context


def references_for_record(context: dict[str, Any], record: dict[str, Any]) -> list[dict[str, Any]]:
    for scene in context["scenes"]:
        if not isinstance(scene, dict) or scene.get("id") != record["scene_id"]:
            continue
        visual = scene.get("visual", {})
        if not isinstance(visual, dict):
            return []
        if record["slot_id"] is None:
            refs = visual.get("references_v6", [])
            return refs if isinstance(refs, list) else []
        page = visual.get("page_blueprint", {})
        if not isinstance(page, dict):
            return []
        for slot in page.get("slots", []):
            if isinstance(slot, dict) and slot.get("id") == record["slot_id"]:
                refs = slot.get("references_v6", [])
                return refs if isinstance(refs, list) else []
    return []


def validate_linked_inputs(project_path: Path, context: dict[str, Any], v: Validation) -> None:
    root = project_path.parent.resolve()
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
            allowed_scopes = {"PRODUCTION_PART"} if context["mode"] == "PRODUCTION" else {"PRODUCTION_PART", "PILOT_FRAGMENT"}
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
            location = f"references_v6[{ref.get('id', '?')}]"
            path = resolve_artifact(root, rel) if is_safe_relative(rel) else None
            if path is None or not path.is_file():
                v.error(f"{location}.source_path", f"archivo real ausente: {rel}")
            elif digest is not None:
                actual = hash_file(path)
                v.require(actual == digest, f"{location}.sha256", f"declarado {digest}, real {actual}")


def validate_obligation_mapping(context: dict[str, Any], packet_text: str, v: Validation) -> None:
    machine_section = markdown_section(packet_text, "MACHINE_LOCK_V6") or ""
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
    v.require(set(packet_atoms).issubset(covered_atoms), "obligation_map.atom_ids", "no cubre todos los átomos del packet")
    v.require(set(prompts).issubset(mapped_shots), "obligation_map.source_shot_ids", "cada fuente debe pagar al menos una obligación")


def validate_preflight(path: Path) -> str:
    try:
        data, _ = json_load(path)
    except (OSError, ValueError) as exc:
        raise ValidationFailure(f"BLOCKED_INPUT {exc}") from exc
    v, context = validate_project(data)
    validate_linked_inputs(path, context, v)
    return v.finish("PROMPT_RELEASE_V6", f"mode={context['mode']} panels={len(context['panel_scenes'])} sources={len(context['sources'])}")


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


def validate_human_ab(raw: Any, thresholds: dict[str, Any], root: Path,
                      audited_pages: dict[str, dict[str, Any]], v: Validation, location: str) -> None:
    record = dict_value(raw, v, location)
    required = bool(thresholds.get("human_ab_required", True))
    v.require(record.get("required") is required, f"{location}.required", f"debe ser {str(required).lower()}")
    if not required:
        return
    v.require(record.get("status") == "PASS", f"{location}.status", "A/B obligatorio debe estar PASS")
    reviewers_raw = list_value(record.get("reviewers"), v, f"{location}.reviewers")
    reviewer_ids = [item.get("reviewer_id") if isinstance(item, dict) else item for item in reviewers_raw]
    reviewer_ids = [item for item in reviewer_ids if isinstance(item, str) and item]
    expected_reviewers = int(thresholds["human_ab_reviewers"])
    v.require(len(reviewer_ids) == expected_reviewers and len(set(reviewer_ids)) == expected_reviewers,
              f"{location}.reviewers", f"requiere {expected_reviewers} IDs únicos")
    pairs = list_value(record.get("pair_results"), v, f"{location}.pair_results")
    expected_pairs = int(thresholds["human_ab_pairs"])
    v.require(len(pairs) == expected_pairs, f"{location}.pair_results", f"requiere {expected_pairs} pares")
    total_votes = 0
    v6_votes = 0
    v6_pair_wins = 0
    pair_ids: set[str] = set()
    pair_scene_ids: set[str] = set()
    v5_hashes: set[str] = set()
    for index, pair_raw in enumerate(pairs):
        loc = f"{location}.pair_results[{index}]"
        pair = dict_value(pair_raw, v, loc)
        pair_id = pair.get("pair_id")
        v.require(isinstance(pair_id, str) and pair_id and pair_id not in pair_ids, f"{loc}.pair_id", "ID único requerido")
        if isinstance(pair_id, str):
            pair_ids.add(pair_id)
        require_text(pair, "randomization_id", v, loc)
        scene_id = pair.get("v6_scene_id")
        v.require(isinstance(scene_id, str) and scene_id in audited_pages and scene_id not in pair_scene_ids,
                  f"{loc}.v6_scene_id", "página V6 auditada y no repetida requerida")
        if isinstance(scene_id, str):
            pair_scene_ids.add(scene_id)
        page = audited_pages.get(scene_id, {}) if isinstance(scene_id, str) else {}
        v.require(pair.get("v6_path") == page.get("final_output_path"), f"{loc}.v6_path", "no coincide con página V6 auditada")
        v.require(clean_hash(pair.get("v6_sha256")) == clean_hash(page.get("final_output_sha256")),
                  f"{loc}.v6_sha256", "no coincide con página V6 auditada")
        validate_real_file(root, pair.get("v6_path"), pair.get("v6_sha256"), v, f"{loc}.v6_asset", CANVAS)
        validate_real_file(root, pair.get("v5_3_path"), pair.get("v5_3_sha256"), v, f"{loc}.v5_3_asset", CANVAS)
        v5_digest = clean_hash(pair.get("v5_3_sha256"))
        v.require(v5_digest is not None and v5_digest not in v5_hashes, f"{loc}.v5_3_sha256", "comparador V5.3 repetido o inválido")
        if v5_digest:
            v5_hashes.add(v5_digest)
        order = pair.get("randomized_order")
        v.require(isinstance(order, list) and len(order) == 2 and set(order) == {"V5_3", "V6"}
                  if isinstance(order, list) and all(isinstance(item, str) for item in order) else False,
                  f"{loc}.randomized_order", "debe registrar V5_3 y V6")
        votes = list_value(pair.get("votes"), v, f"{loc}.votes")
        seen_reviewers: set[str] = set()
        pair_v6 = 0
        for vote_index, vote_raw in enumerate(votes):
            vote_loc = f"{loc}.votes[{vote_index}]"
            vote = dict_value(vote_raw, v, vote_loc)
            reviewer_id = vote.get("reviewer_id")
            v.require(reviewer_id in reviewer_ids and reviewer_id not in seen_reviewers, f"{vote_loc}.reviewer_id", "revisor ausente o duplicado en el par")
            if isinstance(reviewer_id, str):
                seen_reviewers.add(reviewer_id)
            preferred = vote.get("preferred_version")
            v.require(is_enum(preferred, {"V5_3", "V6"}), f"{vote_loc}.preferred_version", "usa V5_3 o V6")
            require_text(vote, "cause", v, vote_loc)
            v.require(isinstance(vote.get("critical_error"), bool), f"{vote_loc}.critical_error", "booleano requerido")
            total_votes += 1
            if preferred == "V6":
                v6_votes += 1
                pair_v6 += 1
        v.require(len(seen_reviewers) == expected_reviewers, f"{loc}.votes", "cada revisor debe emitir exactamente un voto")
        if pair_v6 > expected_reviewers / 2:
            v6_pair_wins += 1
            v.require(not any(isinstance(item, dict) and item.get("critical_error") is True for item in votes),
                      loc, "un par ganado por V6 contiene error crítico declarado")
    v.require(record.get("total_votes") == total_votes, f"{location}.total_votes", f"declarado {record.get('total_votes')}, calculado {total_votes}")
    v.require(record.get("v6_votes") == v6_votes, f"{location}.v6_votes", f"declarado {record.get('v6_votes')}, calculado {v6_votes}")
    v.require(record.get("v6_pair_wins") == v6_pair_wins, f"{location}.v6_pair_wins", f"declarado {record.get('v6_pair_wins')}, calculado {v6_pair_wins}")
    v.require(v6_votes >= thresholds["human_ab_min_v6_votes"], f"{location}.v6_votes", f"{v6_votes} < {thresholds['human_ab_min_v6_votes']}")
    v.require(v6_pair_wins >= thresholds["human_ab_min_pair_wins"], f"{location}.v6_pair_wins", f"{v6_pair_wins} < {thresholds['human_ab_min_pair_wins']}")


def validate_composition_evidence(
    comp: Any,
    canonical_project_digest: str,
    scene: dict[str, Any],
    expected_records: list[dict[str, Any]],
    generated: dict[str, dict[str, Any]],
    page_audit: dict[str, Any],
    v: Validation,
    location: str,
) -> None:
    comp = dict_value(comp, v, location)
    scene_id = scene.get("id")
    blueprint = scene.get("visual", {}).get("page_blueprint", {})
    v.require(comp.get("manifest_type") == "MANHWA_PAGE_COMPOSITION_V6", f"{location}.manifest_type", "tipo inválido")
    v.require(comp.get("version") == VERSION, f"{location}.version", "debe ser 6.0")
    v.require(comp.get("project_sha256") == canonical_project_digest, f"{location}.project_sha256", "no corresponde al contenido canónico del JSON productor")
    v.require(comp.get("blueprint_sha256") == sha256_json(blueprint), f"{location}.blueprint_sha256", "no corresponde al page_blueprint")
    v.require(comp.get("scene_id") == scene_id, f"{location}.scene_id", "no corresponde a la página")
    v.require(comp.get("template") == blueprint.get("template"), f"{location}.template", "no coincide con blueprint")
    v.require(comp.get("canvas") == {"width": 720, "height": 1280}, f"{location}.canvas", "debe ser 720x1280")
    v.require(comp.get("background") == blueprint.get("background"), f"{location}.background", "no coincide con blueprint")
    v.require(comp.get("composition_revision") == page_audit.get("composition_revision"),
              f"{location}.composition_revision", "no coincide con audit")
    v.require(comp.get("reading_order") == blueprint.get("reading_order"), f"{location}.reading_order", "no coincide con blueprint")
    expected_slot_ids = [slot.get("id") for slot in blueprint.get("slots", []) if isinstance(slot, dict)]
    draw_order = comp.get("draw_order")
    valid_draw_order = (isinstance(draw_order, list) and all(isinstance(item, str) for item in draw_order) and
                        len(draw_order) == len(expected_slot_ids) and set(draw_order) == set(expected_slot_ids))
    v.require(valid_draw_order,
              f"{location}.draw_order", "debe cubrir cada slot exactamente una vez")
    v.require(clean_hash(comp.get("final_sha256")) == clean_hash(page_audit.get("final_output_sha256")),
              f"{location}.final_sha256", "no coincide con JPG final auditado")
    v.require(Path(str(comp.get("final_path", ""))).name == Path(str(page_audit.get("final_output_path", ""))).name,
              f"{location}.final_path", "nombre final no coincide")

    comp_slots = records_by_id(comp.get("slots"), "id", v, f"{location}.slots")
    expected_slots = {slot.get("id"): slot for slot in blueprint.get("slots", []) if isinstance(slot, dict)}
    v.require(set(comp_slots) == set(expected_slots), f"{location}.slots", "cobertura de slots no es 100%")
    expected_hash_map: dict[str, str | None] = {}
    for record in expected_records:
        slot_id = record.get("slot_id")
        shot_id = record.get("shot", {}).get("shot_id")
        if isinstance(slot_id, str):
            expected_hash_map[slot_id] = clean_hash(generated.get(shot_id, {}).get("output_sha256"))
    for slot_id, expected_slot in expected_slots.items():
        loc = f"{location}.slots[{slot_id}]"
        actual = comp_slots.get(slot_id, {})
        for key in ("source", "x", "y", "w", "h", "fit", "focal_point", "shape", "z", "rotation_deg", "border_px", "border_color", "radius_px"):
            v.require(actual.get(key) == expected_slot.get(key), f"{loc}.{key}", "no coincide con blueprint")
        v.require(clean_hash(actual.get("source_sha256")) == expected_hash_map.get(slot_id),
                  f"{loc}.source_sha256", "no coincide con generation manifest")
        dimensions = actual.get("source_dimensions")
        source_width = dimensions.get("width") if isinstance(dimensions, dict) else None
        source_height = dimensions.get("height") if isinstance(dimensions, dict) else None
        master_9_16 = (
            isinstance(source_width, int) and not isinstance(source_width, bool)
            and isinstance(source_height, int) and not isinstance(source_height, bool)
            and min(source_width, source_height) >= 640
            and source_height > 0
            and abs(source_width / source_height - 720 / 1280) <= 0.04
        )
        v.require(master_9_16, f"{loc}.source_dimensions", "fuente debe ser master 9:16 de alta resolucion")
        scale_factor = actual.get("scale_factor")
        v.require(isinstance(scale_factor, (int, float)) and not isinstance(scale_factor, bool) and scale_factor <= 1.15 + 1e-9,
                  f"{loc}.scale_factor", "upscaling mayor a 1.15x")
    source_hashes = comp.get("source_hashes")
    v.require(isinstance(source_hashes, dict) and {key: clean_hash(value) for key, value in source_hashes.items()} == expected_hash_map,
              f"{location}.source_hashes", "mapa no coincide con fuentes generadas")


def validate_deterministic_recomposition(
    project_path: Path,
    root: Path,
    expected_pages: dict[str, dict[str, Any]],
    audited_pages: dict[str, dict[str, Any]],
    v: Validation,
) -> None:
    composed_ids = [
        scene_id
        for scene_id, scene in expected_pages.items()
        if isinstance(scene.get("visual"), dict) and isinstance(scene["visual"].get("page_blueprint"), dict)
    ]
    if not composed_ids:
        return
    compositor = Path(__file__).resolve().with_name("compose_pages_v6.py")
    if not compositor.is_file():
        v.error("render_audit.recomposition", f"compositor canónico ausente: {compositor.name}")
        return
    with tempfile.TemporaryDirectory(prefix="manhwa-v6-recompose-") as directory:
        output = Path(directory) / "pages"
        try:
            result = subprocess.run(
                [sys.executable, str(compositor), str(project_path), str(root), "--output-dir", str(output)],
                capture_output=True,
                text=True,
                check=False,
                timeout=120,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            v.error("render_audit.recomposition", f"no se pudo ejecutar compositor: {exc}")
            return
        if result.returncode != 0:
            evidence = (result.stderr or result.stdout).strip()
            v.error("render_audit.recomposition", f"compositor exit {result.returncode}: {evidence}")
            return
        for scene_id in composed_ids:
            rendered = output / f"{scene_id}.jpg"
            loc = f"render_audit.pages[{scene_id}].deterministic_recomposition"
            v.require(rendered.is_file(), loc, "el compositor no produjo la página")
            if rendered.is_file():
                expected_hash = clean_hash(audited_pages.get(scene_id, {}).get("final_output_sha256"))
                actual_hash = hash_file(rendered)
                v.require(actual_hash == expected_hash, loc,
                          f"JPG final no corresponde a blueprint+fuentes; recompuesto {actual_hash}, audit {expected_hash}")


def validate_postflight(project_path: Path, manifest_path: Path, audit_path: Path) -> str:
    try:
        project_data, project_raw = json_load(project_path)
        manifest, manifest_raw = json_load(manifest_path)
        audit, _ = json_load(audit_path)
    except (OSError, ValueError) as exc:
        raise ValidationFailure(f"BLOCKED_RENDER_INPUT {exc}") from exc

    v, context = validate_project(project_data)
    validate_linked_inputs(project_path, context, v)
    manifest = dict_value(manifest, v, "generation_manifest")
    audit = dict_value(audit, v, "render_audit")
    # Every field named project_sha256 uses the canonical parsed JSON content.
    # generation_manifest_sha256 below remains byte-exact because it binds the
    # audit to one concrete manifest file rather than to a reserialized project.
    try:
        project_digest = project_semantic_sha256(project_data)
    except ValueError as exc:
        raise ValidationFailure(f"BLOCKED_RENDER_INPUT {exc}") from exc
    manifest_digest = sha256_bytes(manifest_raw)
    v.require(manifest.get("schema") == "GENERATION_MANIFEST_V6", "generation_manifest.schema", "schema inválido")
    v.require(manifest.get("version") == VERSION, "generation_manifest.version", "debe ser 6.0")
    v.require(manifest.get("project_sha256") == project_digest, "generation_manifest.project_sha256", f"debe ser {project_digest}")
    require_text(manifest, "generated_at", v, "generation_manifest")

    expected_sources = {record["shot"].get("shot_id"): record for record in context["sources"] if isinstance(record["shot"].get("shot_id"), str)}
    generated = records_by_id(manifest.get("sources"), "shot_id", v, "generation_manifest.sources")
    v.require(set(generated) == set(expected_sources), "generation_manifest.sources", "cobertura de shot_id debe ser exactamente 100%")
    root = project_path.parent
    generated_paths: dict[str, str] = {}
    generated_hashes: dict[str, str] = {}
    for shot_id, expected in expected_sources.items():
        loc = f"generation_manifest.sources[{shot_id}]"
        item = generated.get(shot_id, {})
        v.require(item.get("prompt") == expected["prompt"], f"{loc}.prompt", "no coincide byte a byte con JSON productor")
        require_text(item, "model", v, loc)
        v.require(isinstance(item.get("settings"), dict), f"{loc}.settings", "objeto requerido (incluye seed/job_id si existen)")
        job_id = require_text(item, "job_id", v, loc)
        attempt = item.get("generation_attempt")
        v.require(isinstance(attempt, int) and not isinstance(attempt, bool) and 1 <= attempt <= context["thresholds"]["max_generation_attempts"],
                  f"{loc}.generation_attempt", "fuera del límite por shot_id")
        v.require(is_enum(item.get("status"), {"GENERATED", "APPROVED"}), f"{loc}.status", "usa GENERATED o APPROVED")
        output = item.get("output_path")
        v.require(output == expected["source"], f"{loc}.output_path", f"debe coincidir con source {expected['source']}")
        validate_real_file(root, output, item.get("output_sha256"), v, loc, require_master_9_16=True)
        digest = clean_hash(item.get("output_sha256"))
        if isinstance(output, str):
            if output in generated_paths:
                v.error(f"{loc}.output_path", f"ruta reutilizada por {generated_paths[output]}")
            else:
                generated_paths[output] = shot_id
        if digest:
            if digest in generated_hashes:
                v.error(f"{loc}.output_sha256", f"imagen byte-idéntica a {generated_hashes[digest]}; no prueba una toma distinta")
            else:
                generated_hashes[digest] = shot_id

        history = list_value(item.get("attempt_history"), v, f"{loc}.attempt_history")
        if isinstance(attempt, int) and not isinstance(attempt, bool):
            v.require(len(history) == attempt, f"{loc}.attempt_history", "debe conservar un registro por intento, sin reiniciar contador")
        history_jobs: set[str] = set()
        for history_index, history_raw in enumerate(history):
            hloc = f"{loc}.attempt_history[{history_index}]"
            entry = dict_value(history_raw, v, hloc)
            v.require(entry.get("attempt") == history_index + 1, f"{hloc}.attempt", "historial debe ser 1..generation_attempt")
            require_text(entry, "submitted_at", v, hloc)
            require_text(entry, "prompt", v, hloc)
            require_text(entry, "model", v, hloc)
            v.require(isinstance(entry.get("settings"), dict), f"{hloc}.settings", "objeto exacto de ese intento requerido")
            history_refs = entry.get("reference_hashes")
            v.require(isinstance(history_refs, list) and all(clean_hash(value) is not None for value in history_refs),
                      f"{hloc}.reference_hashes", "hashes de referencias de ese intento requeridos")
            hjob = require_text(entry, "job_id", v, hloc)
            v.require(hjob not in history_jobs, f"{hloc}.job_id", "job_id duplicado")
            history_jobs.add(hjob)
            v.require(is_safe_relative(entry.get("output_path")), f"{hloc}.output_path", "ruta relativa segura requerida")
            v.require(clean_hash(entry.get("output_sha256")) is not None, f"{hloc}.output_sha256", "SHA-256 real requerido")
            v.require(is_enum(entry.get("status"), {"REJECTED", "GENERATED", "APPROVED"}), f"{hloc}.status", "status inválido")
        if history:
            last = history[-1]
            v.require(last.get("job_id") == job_id and last.get("output_path") == output and
                      clean_hash(last.get("output_sha256")) == digest and last.get("status") == item.get("status") and
                      last.get("prompt") == item.get("prompt") and last.get("model") == item.get("model") and
                      last.get("settings") == item.get("settings") and last.get("reference_hashes") == item.get("reference_hashes"),
                      f"{loc}.attempt_history", "último intento debe coincidir con el registro fuente actual")
        # La cobertura real se deriva de references_v6 en el JSON productor.
        refs = references_for_record(context, expected)
        declared_refs = {clean_hash(ref.get("sha256")) for ref in refs if isinstance(ref, dict)}
        manifest_refs_raw = item.get("reference_hashes")
        v.require(isinstance(manifest_refs_raw, list) and all(clean_hash(value) is not None for value in manifest_refs_raw),
                  f"{loc}.reference_hashes", "lista de hashes requerida")
        manifest_refs = {clean_hash(value) for value in manifest_refs_raw} if isinstance(manifest_refs_raw, list) else set()
        v.require(manifest_refs == declared_refs, f"{loc}.reference_hashes", "no coincide con references_v6 del productor")

    v.require(audit.get("schema") == "RENDER_AUDIT_V6", "render_audit.schema", "schema inválido")
    v.require(audit.get("version") == VERSION, "render_audit.version", "debe ser 6.0")
    v.require(audit.get("project_sha256") == project_digest, "render_audit.project_sha256", f"debe ser {project_digest}")
    v.require(audit.get("generation_manifest_sha256") == manifest_digest, "render_audit.generation_manifest_sha256", f"debe ser {manifest_digest}")
    sequence = dict_value(audit.get("sequence_review"), v, "render_audit.sequence_review")
    v.require(sequence.get("status") == "PASS", "render_audit.sequence_review.status", "PASS requerido")
    require_text(sequence, "reviewer_id", v, "render_audit.sequence_review")
    validate_real_file(root, sequence.get("contact_sheet_path"), sequence.get("contact_sheet_sha256"), v,
                       "render_audit.sequence_review.contact_sheet")
    validate_real_file(root, sequence.get("inventory_path"), sequence.get("inventory_sha256"), v,
                       "render_audit.sequence_review.inventory")
    sequence_shots = sequence.get("source_shot_ids")
    v.require(isinstance(sequence_shots, list) and all(isinstance(item, str) for item in sequence_shots) and
              len(sequence_shots) == len(set(sequence_shots)) and set(sequence_shots) == set(expected_sources),
              "render_audit.sequence_review.source_shot_ids", "debe cubrir cada fuente exactamente una vez")
    expected_page_ids = {scene.get("id") for scene in context["panel_scenes"] if isinstance(scene.get("id"), str)}
    sequence_pages = sequence.get("page_scene_ids")
    v.require(isinstance(sequence_pages, list) and all(isinstance(item, str) for item in sequence_pages) and
              len(sequence_pages) == len(set(sequence_pages)) and set(sequence_pages) == expected_page_ids,
              "render_audit.sequence_review.page_scene_ids", "debe cubrir cada página final exactamente una vez")
    sequence_checks = dict_value(sequence.get("checks"), v, "render_audit.sequence_review.checks")
    for key in ("environment_view_repetition", "weather_overlay_repetition", "pose_repetition",
                "palette_monotony", "equivalent_composition_run"):
        v.require(sequence_checks.get(key) == "PASS", f"render_audit.sequence_review.checks.{key}", "PASS requerido")
    sequence_evidence = sequence.get("evidence")
    v.require(isinstance(sequence_evidence, list) and bool(sequence_evidence) and
              all(isinstance(item, str) and item.strip() for item in sequence_evidence),
              "render_audit.sequence_review.evidence", "evidencia visual concreta requerida")
    audited_sources = records_by_id(audit.get("sources"), "shot_id", v, "render_audit.sources")
    v.require(set(audited_sources) == set(expected_sources), "render_audit.sources", "cobertura de shot_id debe ser exactamente 100%")
    matches = 0
    camera_total = 0
    unresolved_minor = 0
    hard_unresolved = False
    manifest_by_shot = generated
    for shot_id, expected in expected_sources.items():
        loc = f"render_audit.sources[{shot_id}]"
        item = audited_sources.get(shot_id, {})
        generated_item = manifest_by_shot.get(shot_id, {})
        v.require(item.get("output_path") == generated_item.get("output_path"), f"{loc}.output_path", "no coincide con manifest")
        v.require(clean_hash(item.get("output_sha256")) == clean_hash(generated_item.get("output_sha256")), f"{loc}.output_sha256", "no coincide con manifest")
        validate_real_file(root, item.get("output_path"), item.get("output_sha256"), v, loc,
                           require_master_9_16=True)
        v.require(item.get("asset_status") == "PASS", f"{loc}.asset_status", "toda fuente debe estar PASS")
        camera = item.get("camera_result")
        v.require(is_enum(camera, {"MATCH", "ACCEPTABLE_VARIANCE", "MISS", "NOT_OBSERVED"}), f"{loc}.camera_result", "enum inválido")
        if is_enum(camera, {"MISS", "NOT_OBSERVED"}):
            v.error(f"{loc}.camera_result", f"{camera} bloquea release")
        if is_enum(camera, {"MATCH", "ACCEPTABLE_VARIANCE"}):
            camera_total += 1
        if camera == "MATCH":
            matches += 1
        observed = dict_value(item.get("observed"), v, f"{loc}.observed")
        v.require(is_enum(observed.get("scale"), SCALES), f"{loc}.observed.scale", "observación inválida")
        v.require(is_enum(observed.get("elevation"), ELEVATIONS), f"{loc}.observed.elevation", "observación inválida")
        v.require(is_enum(observed.get("viewpoint"), VIEWPOINTS), f"{loc}.observed.viewpoint", "observación inválida")
        v.require(is_enum(observed.get("roll"), ROLLS), f"{loc}.observed.roll", "observación inválida")
        require_text(observed, "dominant_subject", v, f"{loc}.observed")
        v.require(isinstance(observed.get("occupancy_pct"), (int, float)) and
                  not isinstance(observed.get("occupancy_pct"), bool) and 0 <= observed.get("occupancy_pct", -1) <= 100,
                  f"{loc}.observed.occupancy_pct", "observación 0-100 requerida")
        if camera == "MATCH":
            shot = expected["shot"]
            for key in ("scale", "elevation", "viewpoint", "roll", "dominant_subject"):
                v.require(observed.get(key) == shot.get(key), f"{loc}.observed.{key}", "MATCH contradice firma esperada")
            occupancy = observed.get("occupancy_pct")
            band = shot.get("occupancy_range_pct", [])
            v.require(isinstance(occupancy, (int, float)) and len(band) == 2 and band[0] <= occupancy <= band[1],
                      f"{loc}.observed.occupancy_pct", "MATCH fuera de banda")
        observers = dict_value(item.get("observers"), v, f"{loc}.observers")
        vlm = dict_value(observers.get("vlm"), v, f"{loc}.observers.vlm")
        human_observer = dict_value(observers.get("human"), v, f"{loc}.observers.human")
        vlm_id = require_text(vlm, "reviewer_id", v, f"{loc}.observers.vlm")
        human_id = require_text(human_observer, "reviewer_id", v, f"{loc}.observers.human")
        v.require(vlm_id != human_id, f"{loc}.observers", "VLM y humano deben ser observadores independientes")
        for observer_name, observer in (("vlm", vlm), ("human", human_observer)):
            v.require(is_enum(observer.get("camera_result"), {"MATCH", "ACCEPTABLE_VARIANCE", "MISS", "NOT_OBSERVED"}),
                      f"{loc}.observers.{observer_name}.camera_result", "resultado inválido")
            require_text(observer, "evidence", v, f"{loc}.observers.{observer_name}")
        observer_results = {vlm.get("camera_result"), human_observer.get("camera_result")}
        if len(observer_results) == 1:
            v.require(camera in observer_results, f"{loc}.camera_result", "no coincide con observadores independientes")
        else:
            adjudicator = dict_value(observers.get("adjudicator"), v, f"{loc}.observers.adjudicator")
            adjudicator_id = require_text(adjudicator, "reviewer_id", v, f"{loc}.observers.adjudicator")
            v.require(adjudicator_id not in {vlm_id, human_id}, f"{loc}.observers.adjudicator.reviewer_id", "adjudicador debe ser independiente")
            v.require(adjudicator.get("camera_result") == camera, f"{loc}.observers.adjudicator.camera_result", "debe resolver camera_result final")
            require_text(adjudicator, "evidence", v, f"{loc}.observers.adjudicator")
        for key in ("identity_status", "continuity_status", "crop_status", "readability_status"):
            v.require(item.get(key) == "PASS", f"{loc}.{key}", "debe ser PASS")
        confidence = item.get("confidence")
        adjudicated = item.get("adjudicated_by")
        v.require((isinstance(confidence, (int, float)) and not isinstance(confidence, bool) and confidence >= 0.85) or
                  (isinstance(adjudicated, str) and bool(adjudicated.strip())),
                  f"{loc}.confidence", "requiere confidence>=0.85 o adjudicated_by")
        minor, hard = validate_failure_codes(item.get("failure_codes"), v, f"{loc}.failure_codes")
        unresolved_minor += minor
        hard_unresolved = hard_unresolved or hard

    match_pct = matches * 100 / camera_total if camera_total else 0
    v.require(match_pct >= context["thresholds"]["min_camera_match_pct"], "render_audit.camera_match_pct",
              f"{match_pct:.1f}% < {context['thresholds']['min_camera_match_pct']}%")
    v.require(not hard_unresolved, "render_audit.failure_codes", "hay fallos CRITICAL/MAJOR sin resolver")

    pages = records_by_id(audit.get("pages"), "scene_id", v, "render_audit.pages")
    expected_pages = {scene.get("id"): scene for scene in context["panel_scenes"] if isinstance(scene, dict)}
    v.require(set(pages) == set(expected_pages), "render_audit.pages", "debe haber una página final por cada escena panel")
    final_paths: dict[str, str] = {}
    final_hashes: dict[str, str] = {}
    for scene_id, scene in expected_pages.items():
        loc = f"render_audit.pages[{scene_id}]"
        item = pages.get(scene_id, {})
        for key in ("asset_status", "geometry_status", "semantics_status", "mobile_readability_status"):
            v.require(item.get(key) == "PASS", f"{loc}.{key}", "debe ser PASS")
        revision = item.get("composition_revision")
        v.require(isinstance(revision, int) and not isinstance(revision, bool) and revision >= 0,
                  f"{loc}.composition_revision", "entero >=0 requerido")
        final_output = item.get("final_output_path")
        expected_final = scene.get("visual", {}).get("source")
        v.require(final_output == expected_final, f"{loc}.final_output_path", f"debe ser el JPG contractual {expected_final}")
        validate_real_file(root, final_output, item.get("final_output_sha256"), v, loc, CANVAS)
        final_digest = clean_hash(item.get("final_output_sha256"))
        if isinstance(final_output, str):
            if final_output in final_paths:
                v.error(f"{loc}.final_output_path", f"ruta final reutilizada por {final_paths[final_output]}")
            else:
                final_paths[final_output] = scene_id
        if final_digest:
            if final_digest in final_hashes:
                v.error(f"{loc}.final_output_sha256", f"página byte-idéntica a {final_hashes[final_digest]}")
            else:
                final_hashes[final_digest] = scene_id
        visual = scene.get("visual", {})
        page = visual.get("page_blueprint") if isinstance(visual, dict) else None
        expected_shots = [record for record in context["sources"] if record["scene_id"] == scene_id]
        expected_ids = [record["shot"].get("shot_id") for record in expected_shots]
        v.require(item.get("source_shot_ids") == expected_ids, f"{loc}.source_shot_ids", "orden/cobertura no coincide con productor")
        expected_hashes = [clean_hash(generated.get(shot, {}).get("output_sha256")) for shot in expected_ids]
        actual_hashes_raw = item.get("source_hashes")
        actual_hashes = [clean_hash(value) for value in actual_hashes_raw] if isinstance(actual_hashes_raw, list) else []
        v.require(actual_hashes == expected_hashes, f"{loc}.source_hashes", "orden/cobertura no coincide con manifest")
        if page is None:
            v.require(revision == 0, f"{loc}.composition_revision", "FULL_BLEED usa revisión 0")
            v.require(item.get("final_output_path") == generated.get(expected_ids[0], {}).get("output_path"), f"{loc}.final_output_path", "FULL_BLEED debe usar la fuente final")
            v.require(clean_hash(item.get("final_output_sha256")) == expected_hashes[0], f"{loc}.final_output_sha256", "FULL_BLEED debe conservar hash de fuente")
        else:
            manifest_rel = item.get("composition_manifest_path")
            v.require(is_safe_relative(manifest_rel), f"{loc}.composition_manifest_path", "ruta segura al manifiesto real requerida")
            if is_safe_relative(manifest_rel):
                comp_path = resolve_artifact(root, manifest_rel)
                v.require(comp_path is not None and comp_path.is_file(), f"{loc}.composition_manifest_path", "manifiesto de composición ausente")
                if comp_path and comp_path.is_file():
                    try:
                        comp, comp_raw = json_load(comp_path)
                        v.require(clean_hash(item.get("composition_manifest_sha256")) == sha256_bytes(comp_raw),
                                  f"{loc}.composition_manifest_sha256", "no coincide con archivo real")
                        validate_composition_evidence(comp, project_digest, scene, expected_shots, generated, item, v,
                                                      f"{loc}.composition_manifest")
                    except ValueError as exc:
                        v.error(f"{loc}.composition_manifest_path", str(exc))
        minor, hard = validate_failure_codes(item.get("failure_codes", []), v, f"{loc}.failure_codes")
        unresolved_minor += minor
        hard_unresolved = hard_unresolved or hard

    if context["mode"] == "PILOT":
        v.require(unresolved_minor <= context["thresholds"]["max_minor_failures_pilot"], "render_audit.minor_failures",
                  f"{unresolved_minor} > {context['thresholds']['max_minor_failures_pilot']}")
    else:
        denominator = max(1, len(expected_sources) + len(expected_pages))
        pct = unresolved_minor * 100 / denominator
        v.require(pct <= context["thresholds"]["max_minor_failure_pct_production"], "render_audit.minor_failures",
                  f"{pct:.1f}% > {context['thresholds']['max_minor_failure_pct_production']}%")
    v.require(not hard_unresolved, "render_audit.failure_codes", "hay fallos CRITICAL/MAJOR sin resolver")
    validate_deterministic_recomposition(project_path, root, expected_pages, pages, v)
    validate_human_ab(audit.get("human_ab"), context["thresholds"], root, pages, v, "render_audit.human_ab")
    return v.finish("RENDER_RELEASE_V6", f"mode={context['mode']} camera_match={match_pct:.1f}% pages={len(expected_pages)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Valida Story Packet, preflight y postflight Manhwa GPT V6")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--packet-only", metavar="STORY_PACKET.md", type=Path)
    group.add_argument("--preflight", metavar="PROJECT.json", type=Path)
    group.add_argument("--postflight", nargs=3, metavar=("PROJECT.json", "GENERATION_MANIFEST.json", "RENDER_AUDIT.json"), type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.packet_only:
            result = validate_packet(args.packet_only)
        elif args.preflight:
            result = validate_preflight(args.preflight)
        else:
            result = validate_postflight(*args.postflight)
    except ValidationFailure as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
