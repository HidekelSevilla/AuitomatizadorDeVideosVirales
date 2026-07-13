#!/usr/bin/env python3
"""Validador V5.2 autocontenido para JSON manhwa.

Uso:
    python validate_v5.py proyecto.json

No depende del repositorio ni de paquetes externos, por lo que puede subirse como
Knowledge y ejecutarse en Code Interpreter. El proceso devuelve 0 unicamente
cuando el resultado es PROMPT_RELEASE; cualquier otro resultado devuelve 1.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Any


ROOT_FIELDS = ("project", "pipeline", "characters", "escenarios", "scenes", "editing", "tts_export")
SCENE_TYPES = {"panel", "narrative_card"}

SHOT_RE = re.compile(
    r"\b(extreme close-up|close-up|macro|medium(?:-wide|-full)?|full-body|full body|"
    r"wide(?: establishing)?|extreme-wide|device shot|deep wide|distant wide|long shot|monumental wide)\b",
    re.I,
)
ANGLE_RE = re.compile(
    r"\b(eye-level|low(?:-oblique)?(?: angle)?|high(?:-oblique)?(?: angle)?|bird'?s-eye|"
    r"top-down|over-the-shoulder|OTS|from behind|rear(?: view)?|profile|side(?: angle| view|-profile)?|"
    r"POV|dutch tilt|worm'?s-eye|knee-level|ground-level)\b",
    re.I,
)
TIME_RE = re.compile(
    r"\b(dawn|sunrise|morning|noon|afternoon|sunset|dusk|evening|night|midnight|"
    r"pre-dawn|daytime|nighttime)\b",
    re.I,
)
CLOSE_RE = re.compile(r"\b(extreme close-up|close-up|macro)\b", re.I)
COMPOSITE_RE = re.compile(
    r"\b(exactly two|two (?:separate |tall )?(?:rectangular |vertical )?panels|two-panel|two panel)\b",
    re.I,
)
BREATH_RE = re.compile(
    r"\b(pure white|white page|manga page|white background|solid pure black|black inset|"
    r"sepia-toned|device shot|interface occupies|body detail|onomatopoeia|negative space|"
    r"environmental transition)\b",
    re.I,
)
ACTION_RE = re.compile(
    r"\b(strikes?|hits?|lunges?|attacks?|impact|recoils?|launches?|throws?|pulls?|pushes?|"
    r"grabs?|rescues?|explodes?|breaks?|collapses?|falls?|drops?|twists? airborne|discharges?|"
    r"extracts?|aims?|turns? every rifle)\b",
    re.I,
)
REACTION_RE = re.compile(
    r"\b(reaction|stares?|gasps?|recoils?|trembl|tears?|jaw|brows?|eyes? wide|lips? parted|"
    r"shaken|terrified|fear|shock|exhausted|defiant)\b",
    re.I,
)
MASTER_RE = re.compile(r"\b(master|anchor)\b", re.I)
TRUE_LONG_RE = re.compile(
    r"\b(extreme[- ]wide|very wide|deep wide|distant wide|panoramic wide|ultra[- ]wide|"
    r"long shot|establishing long shot|monumental wide)\b",
    re.I,
)
LONG_NUMBER = (
    r"(?:1[2-9]|2[0-5]|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|"
    r"twenty(?:[- ](?:one|two|three|four|five))?)"
)
DISTANCE_RE = re.compile(
    rf"\b(?:camera (?:is |placed |positioned )?(?:at least )?{LONG_NUMBER}(?:\.[0-9]+)? meters? "
    rf"(?:away|back)|{LONG_NUMBER}(?:\.[0-9]+)?-meter distance|from {LONG_NUMBER} meters? away)\b",
    re.I,
)
PERCENT_RE = re.compile(r"(\d{1,3})(?:\s*[\u2013-]\s*(\d{1,3}))?\s*(?:%|percent)", re.I)
SUBJECT_RE = re.compile(
    r"\b(subject|human|person|character|figure|protagonist|cleaner|worker|prisoner|captain|"
    r"child|boy|girl|creature|monster|dog|trio|pair)\b",
    re.I,
)
ENVIRONMENT_RE = re.compile(
    r"\b(environment|setting|architecture|tunnel|street|city|landscape|surroundings|background)\b",
    re.I,
)
BROKEN_POSSESSIVE_RE = re.compile(r"\b[a-z][a-z-]*s's\b", re.I)
DUPLICATE_CHEST_RE = re.compile(
    r"\b(?:single\s+)?(?:electric[- ]?)?(?:purple\s+)?chest crack(?:'s)?\s+"
    r"(?:single\s+)?(?:electric[- ]?)?(?:purple\s+)?chest crack\b",
    re.I,
)
CONTAINER_RE = re.compile(r"\b(capsule|capsula|c[aá]psula|container|contenedor|chamber|cell|cockpit|cradle)\b", re.I)
TRANSPARENT_CONTAINER_RE = re.compile(
    r"(?:\b(?:transparent|transparente|clear (?:polycarbonate|canopy|shell)|see-through)\b[\s\S]{0,80}"
    r"\b(?:capsule|capsula|c[aá]psula|container|contenedor|chamber|cell|cockpit|cradle)\b|"
    r"\b(?:capsule|capsula|c[aá]psula|container|contenedor|chamber|cell|cockpit|cradle)\b[\s\S]{0,80}"
    r"\b(?:transparent|transparente|clear (?:polycarbonate|canopy|shell)|see-through)\b)",
    re.I,
)
SPANISH_TAG_RE = re.compile(
    r"\[(pausa|grave|urgente|tenso|agitado|desesperado|sorprendido|susurrando|"
    r"serio|fr[ií]o|oscuro|asustado|agotado)\]",
    re.I,
)


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def prompt_of(scene: dict[str, Any]) -> str:
    return str(as_dict(scene.get("visual")).get("image_prompt") or "")


def strip_tags(text: Any) -> str:
    return re.sub(r"<[^>]*>", " ", re.sub(r"\[[^\]]*\]", " ", str(text or "")))


def spoken_words(text: Any) -> int:
    return len(strip_tags(text).split())


def percentage_near(prompt: str, noun_re: re.Pattern[str], predicate: Any) -> bool:
    for noun in noun_re.finditer(prompt):
        fragment = prompt[max(0, noun.start() - 90) : min(len(prompt), noun.end() + 90)]
        for match in PERCENT_RE.finditer(fragment):
            start = int(match.group(1))
            end = int(match.group(2) or match.group(1))
            if predicate(start, end):
                return True
    return False


def ref_count(refs: dict[str, Any]) -> int:
    return (
        len(as_list(refs.get("characters")))
        + len(as_list(refs.get("assets")))
        + (1 if isinstance(refs.get("escenario"), dict) else 0)
        + len(as_list(refs.get("scenes")))
    )


def contains_key(value: Any, target: str) -> bool:
    if isinstance(value, dict):
        return target in value or any(contains_key(child, target) for child in value.values())
    if isinstance(value, list):
        return any(contains_key(child, target) for child in value)
    return False


def add_error(errors: list[dict[str, Any]], code: str, message: str, scene_id: str | None = None) -> None:
    item: dict[str, Any] = {"code": code, "message": message}
    if scene_id is not None:
        item["scene_id"] = scene_id
    errors.append(item)


def load_json(path_text: str) -> tuple[Path, Any]:
    path = Path(path_text).expanduser().resolve()
    with path.open("r", encoding="utf-8-sig") as handle:
        return path, json.load(handle)


def failure_report(file_name: str, code: str, message: str) -> dict[str, Any]:
    return {
        "file": file_name,
        "status": "FAIL",
        "preflight_status": "PROMPT_REPAIR_REQUIRED",
        "preflight_gates": {"json_parse": False},
        "contract": {"ok": False, "errors": [{"code": code, "message": message}]},
    }


def validate(data: Any, absolute: Path) -> dict[str, Any]:
    contract_errors: list[dict[str, Any]] = []
    if not isinstance(data, dict):
        return failure_report(str(absolute), "ROOT_NOT_OBJECT", "La raiz JSON debe ser un objeto.")

    missing_roots = [field for field in ROOT_FIELDS if field not in data]
    for field in missing_roots:
        add_error(contract_errors, "MISSING_ROOT_FIELD", f"Falta el campo raiz '{field}'.")

    project = as_dict(data.get("project"))
    project_expectations = {"preset": "manhwa", "aspect_ratio": "9:16", "fps": 30}
    project_checks: dict[str, bool] = {}
    for field, expected in project_expectations.items():
        actual = project.get(field)
        ok = actual == expected
        project_checks[field] = ok
        if not ok:
            add_error(contract_errors, "PROJECT_FIELD_INVALID", f"project.{field} debe ser {expected!r}; recibido {actual!r}.")

    characters = as_dict(data.get("characters"))
    escenarios = as_dict(data.get("escenarios"))
    raw_scenes = data.get("scenes")
    if not isinstance(raw_scenes, list):
        add_error(contract_errors, "SCENES_NOT_ARRAY", "scenes debe ser un arreglo.")
    scenes = [scene for scene in as_list(raw_scenes) if isinstance(scene, dict)]
    if len(scenes) != len(as_list(raw_scenes)):
        add_error(contract_errors, "SCENE_NOT_OBJECT", "Cada elemento de scenes debe ser un objeto.")

    ids: list[str] = []
    panel_rule_errors: list[dict[str, Any]] = []
    card_rule_errors: list[dict[str, Any]] = []
    reference_errors: list[dict[str, Any]] = []
    max_references = 0

    for index, scene in enumerate(scenes):
        scene_id = scene.get("id")
        if not isinstance(scene_id, str) or not scene_id.strip():
            scene_id = f"<index:{index}>"
            add_error(contract_errors, "SCENE_ID_INVALID", "Cada escena necesita un id de texto no vacio.", scene_id)
        else:
            ids.append(scene_id)

        scene_type = scene.get("type")
        if scene_type not in SCENE_TYPES:
            add_error(contract_errors, "SCENE_TYPE_INVALID", "type debe ser panel o narrative_card.", scene_id)
            continue

        if not isinstance(as_dict(scene.get("voiceover")).get("text"), str):
            add_error(contract_errors, "VOICEOVER_TEXT_MISSING", "voiceover.text debe ser texto.", scene_id)

        if scene_type == "panel":
            if scene.get("render_mode") != "static":
                add_error(panel_rule_errors, "PANEL_NOT_STATIC", "Todo panel debe usar render_mode='static'.", scene_id)
            if contains_key(scene, "animation_prompt"):
                add_error(panel_rule_errors, "ANIMATION_PROMPT_FORBIDDEN", "Un panel estatico no puede contener animation_prompt.", scene_id)
            if not prompt_of(scene).strip():
                add_error(panel_rule_errors, "IMAGE_PROMPT_MISSING", "El panel necesita visual.image_prompt.", scene_id)
        else:
            for forbidden in ("render_mode", "visual", "references", "editor_motion"):
                if forbidden in scene:
                    add_error(card_rule_errors, "CARD_FIELD_FORBIDDEN", f"Una narrative_card no puede contener '{forbidden}'.", scene_id)
            if contains_key(scene, "animation_prompt"):
                add_error(card_rule_errors, "ANIMATION_PROMPT_FORBIDDEN", "Una narrative_card no puede contener animation_prompt.", scene_id)
            if not isinstance(as_dict(scene.get("card")).get("text"), str):
                add_error(card_rule_errors, "CARD_TEXT_MISSING", "La narrative_card necesita card.text.", scene_id)

        refs_raw = scene.get("references")
        refs = as_dict(refs_raw)
        total_refs = ref_count(refs)
        max_references = max(max_references, total_refs)
        if total_refs > 3:
            add_error(reference_errors, "REFERENCE_LIMIT", f"La escena usa {total_refs} referencias; maximo 3.", scene_id)

        for group in ("characters", "assets"):
            entries = refs.get(group, [])
            if entries is not None and not isinstance(entries, list):
                add_error(reference_errors, "REFERENCE_GROUP_INVALID", f"references.{group} debe ser un arreglo.", scene_id)
            for ref in as_list(entries):
                if not isinstance(ref, dict):
                    add_error(reference_errors, "REFERENCE_INVALID", f"Cada references.{group} debe ser objeto.", scene_id)
                    continue
                ref_id, pose = ref.get("id"), ref.get("pose")
                entry = as_dict(characters.get(ref_id))
                if ref_id not in characters:
                    add_error(reference_errors, "REFERENCE_ID_UNKNOWN", f"No existe characters.{ref_id}.", scene_id)
                elif pose not in as_dict(entry.get("poses")):
                    add_error(reference_errors, "REFERENCE_POSE_UNKNOWN", f"No existe characters.{ref_id}.poses.{pose}.", scene_id)

        scenario_ref = refs.get("escenario")
        if scenario_ref is not None:
            if not isinstance(scenario_ref, dict):
                add_error(reference_errors, "SCENARIO_REFERENCE_INVALID", "references.escenario debe ser objeto.", scene_id)
            else:
                ref_id, view = scenario_ref.get("id"), scenario_ref.get("view")
                entry = as_dict(escenarios.get(ref_id))
                if ref_id not in escenarios:
                    add_error(reference_errors, "SCENARIO_ID_UNKNOWN", f"No existe escenarios.{ref_id}.", scene_id)
                elif view not in as_dict(entry.get("views")):
                    add_error(reference_errors, "SCENARIO_VIEW_UNKNOWN", f"No existe escenarios.{ref_id}.views.{view}.", scene_id)

        for ref in as_list(refs.get("scenes")):
            if not isinstance(ref, dict) or not isinstance(ref.get("scene_id"), str):
                add_error(reference_errors, "SCENE_REFERENCE_INVALID", "Cada references.scenes necesita scene_id.", scene_id)

    duplicate_ids = sorted({scene_id for scene_id in ids if ids.count(scene_id) > 1})
    for scene_id in duplicate_ids:
        add_error(contract_errors, "DUPLICATE_SCENE_ID", f"El id '{scene_id}' esta duplicado.", scene_id)
    id_set = set(ids)
    for scene in scenes:
        scene_id = str(scene.get("id") or "")
        for ref in as_list(as_dict(scene.get("references")).get("scenes")):
            ref_id = ref.get("scene_id") if isinstance(ref, dict) else None
            if isinstance(ref_id, str) and ref_id not in id_set:
                add_error(reference_errors, "SCENE_REFERENCE_UNKNOWN", f"No existe la escena referenciada '{ref_id}'.", scene_id)

    contract_errors.extend(panel_rule_errors)
    contract_errors.extend(card_rule_errors)
    contract_errors.extend(reference_errors)
    contract_ok = not contract_errors

    panels = [scene for scene in scenes if scene.get("type") == "panel"]
    cards = [scene for scene in scenes if scene.get("type") == "narrative_card"]
    prompts = [prompt_of(scene) for scene in panels]

    voice_texts = [str(as_dict(scene.get("voiceover")).get("text")) for scene in scenes if as_dict(scene.get("voiceover")).get("text")]
    joined_script = "\n".join(voice_texts)
    full_script = str(as_dict(data.get("tts_export")).get("full_script") or "")
    full_script_exact = joined_script == full_script

    missing = {
        "shot": [scene.get("id") for scene in panels if not SHOT_RE.search(prompt_of(scene))],
        "angle": [scene.get("id") for scene in panels if not ANGLE_RE.search(prompt_of(scene))],
        "time": [scene.get("id") for scene in panels if not TIME_RE.search(prompt_of(scene))],
    }
    normalized = [re.sub(r"\s+", " ", prompt.strip().lower()) for prompt in prompts]
    seen: set[str] = set()
    duplicate_prompts: list[str] = []
    for index, prompt in enumerate(normalized):
        if prompt and prompt in seen:
            duplicate_prompts.append(str(panels[index].get("id")))
        seen.add(prompt)

    edit_speed_value = as_dict(data.get("tts_export")).get("edit_speed", 1.4)
    try:
        edit_speed = float(edit_speed_value) or 1.4
    except (TypeError, ValueError):
        edit_speed = 1.4

    scene_load: list[dict[str, Any]] = []
    for scene in scenes:
        prompt = prompt_of(scene)
        words = spoken_words(as_dict(scene.get("voiceover")).get("text"))
        is_card = scene.get("type") == "narrative_card"
        is_composite = bool(COMPOSITE_RE.search(prompt))
        is_action = bool(ACTION_RE.search(prompt))
        is_reaction = bool(REACTION_RE.search(prompt) or CLOSE_RE.search(prompt))
        if is_card:
            kind = "card"
        elif is_composite:
            kind = "composite"
        elif is_action:
            kind = "action"
        elif is_reaction:
            kind = "reaction"
        elif MASTER_RE.search(prompt):
            kind = "master"
        else:
            kind = "standard"
        max_words = {"card": 8, "composite": 22, "action": 9, "reaction": 10, "master": 18, "standard": 14}[kind]
        max_seconds = {"card": 3.0, "composite": 6.0, "action": 3.0, "reaction": 4.0, "master": 5.0, "standard": 4.5}[kind]
        estimated = round(words * 60.0 / (150.0 * edit_speed), 2)
        scene_load.append(
            {
                "id": scene.get("id"),
                "kind": kind,
                "words": words,
                "estimated_seconds": estimated,
                "max_words": max_words,
                "max_seconds": max_seconds,
                "over_words": words > max_words,
                "over_seconds": estimated > max_seconds,
                "hard_over_18_normal": not is_card and not is_composite and words > 18,
            }
        )
    overlong = [entry for entry in scene_load if entry["over_words"] or entry["over_seconds"]]

    prompt_lengths: list[dict[str, Any]] = []
    for scene, prompt in zip(panels, prompts):
        words = len(prompt.split())
        refs = as_dict(scene.get("references"))
        complex_prompt = bool(
            COMPOSITE_RE.search(prompt)
            or ACTION_RE.search(prompt)
            or len(as_list(refs.get("characters"))) >= 2
            or len(as_list(refs.get("assets"))) >= 2
        )
        limit = 110 if complex_prompt else 90
        prompt_lengths.append(
            {
                "scene_id": scene.get("id"),
                "words": words,
                "complexity": "complex" if complex_prompt else "standard",
                "type_limit": limit,
                "over_type_limit": words > limit,
                "over_hard_limit_120": words > 120,
            }
        )
    prompt_length_reports = [entry for entry in prompt_lengths if entry["over_type_limit"]]

    broken_language: list[dict[str, Any]] = []
    for scene, prompt in zip(panels, prompts):
        issues: list[dict[str, Any]] = []
        possessives = BROKEN_POSSESSIVE_RE.findall(prompt)
        duplicated_cracks = DUPLICATE_CHEST_RE.findall(prompt)
        if possessives:
            issues.append({"type": "broken_plural_possessive", "matches": possessives})
        if duplicated_cracks:
            issues.append({"type": "duplicated_chest_crack", "matches": duplicated_cracks})
        if issues:
            broken_language.append({"scene_id": scene.get("id"), "issues": issues})

    display_names: dict[str, str] = {}
    pose_prompts: dict[tuple[str, str], str] = {}
    for item_id, item_raw in characters.items():
        item = as_dict(item_raw)
        display_names[item_id] = str(item.get("display_name") or item_id)
        for pose_name, pose_raw in as_dict(item.get("poses")).items():
            pose_prompts[(item_id, pose_name)] = str(as_dict(pose_raw).get("prompt") or "")

    transparent_without_occupant: list[str] = []
    for scene in panels:
        refs = as_dict(scene.get("references"))
        identities: list[str] = []
        for ref in as_list(refs.get("assets")):
            if not isinstance(ref, dict):
                continue
            item_id, pose = str(ref.get("id") or ""), str(ref.get("pose") or "")
            identity = f"{item_id} {display_names.get(item_id, '')} {pose_prompts.get((item_id, pose), '')}"
            if CONTAINER_RE.search(identity):
                identities.append(identity)
        combined = f"{prompt_of(scene)} {' '.join(identities)}"
        if identities and TRANSPARENT_CONTAINER_RE.search(combined) and not as_list(refs.get("characters")):
            transparent_without_occupant.append(str(scene.get("id")))

    true_long_required = 1 if len(panels) < 20 else 2 if len(panels) < 30 else 3 if len(panels) < 40 else 4 if len(panels) <= 50 else math.ceil(len(panels) * 0.10)
    final_required = 2 if len(panels) >= 40 else 1 if len(panels) >= 20 else 0
    final_start = math.floor(len(panels) * 0.60)
    long_checks: list[dict[str, Any]] = []
    for index, scene in enumerate(panels):
        prompt = prompt_of(scene)
        checks = {
            "long_shot_marker": bool(TRUE_LONG_RE.search(prompt)),
            "subject_occupancy_10_25": percentage_near(prompt, SUBJECT_RE, lambda start, end: start >= 10 and end <= 25),
            "environment_occupancy_65plus": percentage_near(prompt, ENVIRONMENT_RE, lambda start, end: max(start, end) >= 65),
            "explicit_camera_distance_12_25m": bool(DISTANCE_RE.search(prompt)),
            "foreground_midground_background": all(re.search(rf"\b{layer}\b", prompt, re.I) for layer in ("foreground", "midground", "background")),
        }
        long_checks.append(
            {
                "scene_id": scene.get("id"),
                "panel_index": index,
                "in_final_40_percent": index >= final_start,
                **checks,
                "qualifies": all(checks.values()),
            }
        )
    qualifying_longs = [entry for entry in long_checks if entry["qualifies"]]
    qualifying_final = [entry for entry in qualifying_longs if entry["in_final_40_percent"]]
    true_long_pass = len(qualifying_longs) >= true_long_required and len(qualifying_final) >= final_required

    close_run = 0
    max_close_run = 0
    for prompt in prompts:
        close_run = close_run + 1 if CLOSE_RE.search(prompt) else 0
        max_close_run = max(max_close_run, close_run)

    breaths = [str(scene.get("id")) for scene in panels if BREATH_RE.search(prompt_of(scene))]
    counted_breaths = set(breaths + [str(scene.get("id")) for scene in cards])
    breath_ratio = round(len(counted_breaths) / len(scenes), 3) if scenes else 0.0

    tags = re.findall(r"\[[^\]]+\]", full_script)
    non_english_tags = [tag for tag in tags if SPANISH_TAG_RE.fullmatch(tag)]

    gates = {
        "json_parse": True,
        "root_fields": not missing_roots,
        "project_preset_aspect_fps": all(project_checks.values()),
        "scene_structure": not any(error["code"] in {"SCENES_NOT_ARRAY", "SCENE_NOT_OBJECT", "SCENE_ID_INVALID", "DUPLICATE_SCENE_ID", "SCENE_TYPE_INVALID", "VOICEOVER_TEXT_MISSING"} for error in contract_errors),
        "panel_card_rules": not panel_rule_errors and not card_rule_errors,
        "references_valid_max_three": not reference_errors,
        "full_script_exact": full_script_exact,
        "shot_present": not missing["shot"],
        "angle_present": not missing["angle"],
        "time_present": not missing["time"],
        "unique_prompts": not duplicate_prompts,
        "voice_word_time_limits": not overlong,
        "breath_ratio_minimum_20_percent": breath_ratio >= 0.20,
        "true_long_shots": true_long_pass,
        "prompt_length_90_standard_110_complex_hard_120": not prompt_length_reports,
        "prompt_language_integrity": not broken_language,
        "transparent_container_has_occupant_reference": not transparent_without_occupant,
        "tts_tags_english": not non_english_tags,
        "close_macro_run_max_two": max_close_run <= 2,
    }
    mechanical_pass = contract_ok and full_script_exact and not duplicate_prompts
    prompt_release = mechanical_pass and all(gates.values())

    return {
        "file": str(absolute),
        "status": "CONTRACT_PASS" if mechanical_pass else "FAIL",
        "preflight_status": "PROMPT_RELEASE" if prompt_release else "PROMPT_REPAIR_REQUIRED",
        "preflight_gates": gates,
        "contract": {"ok": contract_ok, "errors": contract_errors},
        "counts": {
            "scenes": len(scenes),
            "panels": len(panels),
            "cards": len(cards),
            "full_script_characters": len(full_script),
            "max_references": max_references,
        },
        "integrity": {"full_script_exact": full_script_exact},
        "prompts": {
            "missing": missing,
            "duplicates": duplicate_prompts,
            "max_close_macro_run": max_close_run,
            "length_gate": {
                "standard_limit_words": 90,
                "complex_limit_words": 110,
                "hard_limit_words": 120,
                "reports": prompt_length_reports,
                "hard_blocks": [entry for entry in prompt_lengths if entry["over_hard_limit_120"]],
            },
            "true_long_shots": {
                "definition": "Long/extreme/deep/distant/monumental + subject 10-25% + environment >=65% + camera 12-25m + foreground/midground/background.",
                "required_total": true_long_required,
                "required_in_final_40_percent": final_required,
                "final_40_percent_begins_at_panel_index": final_start,
                "qualifying_count": len(qualifying_longs),
                "qualifying_in_final_40_percent": len(qualifying_final),
                "candidates": [entry for entry in long_checks if entry["long_shot_marker"]],
                "qualifying": qualifying_longs,
                "pass": true_long_pass,
            },
            "broken_language": broken_language,
            "transparent_container_without_character_occupant_reference": transparent_without_occupant,
        },
        "timing": {
            "method": "estimate_150_raw_wpm",
            "edit_speed": edit_speed,
            "scenes": scene_load,
            "overlong": overlong,
        },
        "rhythm": {
            "detected_breath_panels": breaths,
            "narrative_cards": [scene.get("id") for scene in cards],
            "detected_breath_count": len(counted_breaths),
            "detected_breath_ratio": breath_ratio,
            "minimum_ratio_gate": 0.20,
            "pass": breath_ratio >= 0.20,
        },
        "tts": {"audio_tags": tags, "non_english_tag_risks": non_english_tags},
        "render_dependent": "RENDER_PENDING",
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        report = failure_report("", "USAGE", "Uso: python validate_v5.py <proyecto.json>")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    try:
        absolute, data = load_json(argv[1])
        report = validate(data, absolute)
    except FileNotFoundError:
        report = failure_report(str(Path(argv[1]).expanduser()), "FILE_NOT_FOUND", "No se encontro el archivo JSON.")
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        report = failure_report(str(Path(argv[1]).expanduser()), "JSON_PARSE_ERROR", str(error))
    except OSError as error:
        report = failure_report(str(Path(argv[1]).expanduser()), "FILE_READ_ERROR", str(error))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("preflight_status") == "PROMPT_RELEASE" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
