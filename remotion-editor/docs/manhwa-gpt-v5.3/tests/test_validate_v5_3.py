from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


VALIDATOR_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_v5_3.py"
SPEC = importlib.util.spec_from_file_location("validate_v5_3", VALIDATOR_PATH)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


ELEVATION_PHRASES = {
    "EYE_LEVEL": "eye-level angle",
    "LOW": "low-angle",
    "HIGH": "high-angle",
    "BIRDS_EYE": "bird's-eye view",
    "TOP_DOWN": "top-down view",
    "WORMS_EYE": "worm's-eye view",
    "KNEE_LEVEL": "knee-level view",
    "GROUND_LEVEL": "ground-level view",
}
VIEWPOINT_PHRASES = {
    "FRONT": "front view",
    "THREE_QUARTER_FRONT": "three-quarter front view",
    "OTS": "over-the-shoulder view",
    "BEHIND": "from behind",
    "REAR_THREE_QUARTER": "rear three-quarter view",
    "PROFILE": "profile view",
    "SIDE": "side view",
    "POV": "POV shot",
}
ROLL_PHRASES = {"LEVEL": "level camera roll", "DUTCH": "dutch camera roll"}
SCALE_PHRASES = {
    "MACRO": "macro shot",
    "EXTREME_CLOSE": "extreme close-up",
    "CLOSE": "close-up",
    "MEDIUM": "medium shot",
    "FULL": "full-body shot",
    "WIDE_MASTER": "wide master",
    "TRUE_LONG": "distant wide shot",
}
STYLE = (
    "Hand-drawn Korean manhwa webtoon illustration, 2D flat cel shading, "
    "crisp inked lineart, vertical 9:16 webtoon panel composition, no readable text."
)
UNIQUE_MOTIFS = [
    "fallen cable sparks", "shattered visor glass", "tilted barrier plates", "dripping warning paint",
    "crushed helmet fragments", "bent rail shadows", "scattered amber flares", "broken wheel tracks",
    "hanging conduit loops", "split concrete seams", "torn safety fabric", "flooded service grooves",
    "buckled support bolts", "dark residue ribbons", "fractured lamp housings", "twisted caution poles",
    "loose gravel circles", "collapsed sign brackets", "burned tire patterns", "floating dust columns",
    "snapped harness clips", "scraped armor flakes", "overturned supply crates", "sparking control cables",
    "warped drainage grates", "cracked inspection lenses", "dented convoy panels", "ripped worker sleeves",
    "scorched tunnel tiles", "fallen sensor tripods", "shivering puddle rings", "split emergency shutters",
    "battered rescue straps", "charred column edges", "scattered metal washers", "flickering violet residue",
    "flattened traffic cones", "fractured glass beads", "severed hydraulic lines", "silent rifle casings",
]


def human_base_prompt() -> str:
    return (
        "Exactly one character, full body from hair to soles, orthographic front eye-level view, "
        "neutral relaxed expression, both open empty hands visible, both feet visible, clean and dry, "
        "even studio illumination, seamless neutral medium-gray background."
    )


def make_registry() -> dict:
    registry: dict = {}
    for item_id, display in (("seo", "Seo Jun"), ("mira", "Park Mira")):
        registry[item_id] = {
            "display_name": display,
            "asset_type": "human",
            "prompt_signature": "short-haired young male tunnel cleaner" if item_id == "seo" else "dark-haired female tunnel worker",
            "poses": {
                "base": {
                    "mode": "generate",
                    "asset": f"assets/characters/serie_prueba/{item_id}_base.png",
                    "pose_role": "base",
                    "prompt": human_base_prompt(),
                },
                "performance": {
                    "mode": "generate",
                    "asset": f"assets/characters/serie_prueba/{item_id}_performance.png",
                    "reference_pose": "base",
                    "pose_role": "performance",
                    "prompt": "Same face, same hair, same outfit as the reference; recoiling with tense brows, rigid jaw, raised shoulders, and open hands.",
                },
            },
        }
    creature_poses = {}
    for role in ("base", "trapped", "charge", "attack", "impact", "collapse"):
        creature_poses[role] = {
            "mode": "generate",
            "asset": f"assets/characters/serie_prueba/dog_{role}.png",
            "pose_role": role,
            "prompt": f"Eyeless black plated dog creature in a physically distinct {role} state with unique limb contacts and silhouette.",
            **({} if role == "base" else {"reference_pose": "base"}),
        }
    registry["dog"] = {
        "display_name": "Plated dog",
        "asset_type": "creature",
        "prompt_signature": "eyeless black plated dog creature",
        "poses": creature_poses,
    }
    return registry


def base_plan(index: int) -> dict:
    subjects = ("seo", "mira", "dog", "environment")
    subject = subjects[index % len(subjects)]
    viewpoint_cycle = ("PROFILE", "FRONT", "SIDE", "THREE_QUARTER_FRONT", "OTS", "BEHIND")
    elevation_cycle = ("EYE_LEVEL", "LOW", "HIGH", "EYE_LEVEL", "KNEE_LEVEL", "EYE_LEVEL")
    scale_cycle = ("MEDIUM", "FULL", "WIDE_MASTER")
    viewpoint = viewpoint_cycle[index % len(viewpoint_cycle)]
    performances = []
    if subject in {"seo", "mira"}:
        performances = [{
            "entity_id": subject, "mode": "NONE", "eyes_brows": "", "mouth_jaw": "", "body_cue": "", "reaction_to": None,
        }]
    return {
        "story_beat_id": f"B{min(11, index * 11 // 40 + 1):02d}",
        "beat": "ACTION",
        "narrative_function": "advance",
        "page_layout": "FULL_BLEED",
        "shot_scale": scale_cycle[index % len(scale_cycle)],
        "camera_elevation": elevation_cycle[index % len(elevation_cycle)],
        "viewpoint": viewpoint,
        "camera_roll": "LEVEL",
        "performances": performances,
        "dominant_subject_id": subject,
        "location_id": "urban_tunnel",
        "axis_id": "main_axis",
        "moment_id": f"moment_{index:02d}",
        "subject_pct": 35,
        "high_tension": False,
        "long_role": "NONE",
        "fragment_subject": "NONE",
        "fragment_role": "NONE",
        "low_density_kind": "NONE",
        "action": {
            "phase": "NONE",
            "sequence_id": None,
            "vector_pct": 0,
            "origin_third": "NONE",
            "destination_third": "NONE",
        },
        "approach": {"stage": "NONE", "ramp_id": None, "direction": ""},
        "white": None,
        "black": None,
        "long_scale": None,
        "subpanels": [],
    }


def configure_plans() -> list[dict]:
    plans = [base_plan(index) for index in range(40)]
    beats = {
        0: "HOOK", 4: "DETONATOR", 6: "THREAT", 8: "BOND", 12: "DECISION",
        16: "PERCEPTION", 17: "MANIFESTATION", 22: "PRESSURE", 27: "PREPARATION",
        29: "PAYOFF", 34: "COST", 35: "CONSEQUENCE", 39: "CLIFFHANGER",
    }
    for index, beat in beats.items():
        plans[index]["beat"] = beat

    white_specs = {
        1: ("WHITE_INSET", 45, 1, "UPPER_LEFT"),
        8: ("WHITE_COMPOSITE_2", 50, 2, "OPPOSITE_CORNERS"),
        16: ("WHITE_FRAGMENT", 65, 1, "CENTER_HIGH"),
        27: ("WHITE_ACTION_STRIP_2", 45, 2, "DIAGONAL_STRIP"),
        35: ("WHITE_ISOLATE", 65, 1, "LOWER_RIGHT"),
    }
    for index, (layout, pct, panels, composition) in white_specs.items():
        plans[index]["page_layout"] = layout
        plans[index]["white"] = {"canvas_pct": pct, "panel_count": panels, "composition": composition}

    fragment_specs = {
        5: ("EYES", "EMOTION"),
        12: ("MOUTH_JAW", "DECISION"),
        16: ("HAND_CONTACT", "CONTACT"),
        33: ("WOUND_MARK", "COST"),
    }
    for index, (subject, role) in fragment_specs.items():
        plans[index]["fragment_subject"] = subject
        plans[index]["fragment_role"] = role
        plans[index]["shot_scale"] = "EXTREME_CLOSE" if subject in {"EYES", "MOUTH_JAW"} else "MACRO"
        plans[index]["subject_pct"] = 80

    reaction_map = {5: 4, 7: 6, 13: 12, 18: 17, 31: 29, 35: 34}
    for index, target in reaction_map.items():
        mode = "SHOCK" if index in {7, 18} else "REACTION"
        plans[index]["high_tension"] = True
        plans[index]["dominant_subject_id"] = "seo" if index % 2 else "mira"
        plans[index]["performances"] = [{
            "entity_id": plans[index]["dominant_subject_id"],
            "mode": mode,
            "eyes_brows": "eyebrows raised and eyes fixed",
            "mouth_jaw": "jaw rigid",
            "body_cue": "shoulders pulling backward",
            "reaction_to_panel": target,
        }]

    long_specs = {0: "WORLD", 6: "THREAT", 15: "GEOGRAPHY", 28: "CLIMAX", 36: "CONSEQUENCE"}
    for index, role in long_specs.items():
        plans[index]["shot_scale"] = "TRUE_LONG"
        plans[index]["long_role"] = role
        plans[index]["subject_pct"] = 15
        plans[index]["long_scale"] = {
            "distance_m": 20,
            "environment_pct": 75,
            "full_body": True,
            "air": True,
            "ground_contact": True,
            "three_layers": True,
            "relative_scale": True,
        }

    ramp_specs = {
        9: ("SPACE", "FULL", 20, "BEHIND"),
        10: ("BODY", "MEDIUM", 45, "SIDE_VIEW"),
        11: ("EMOTION", "CLOSE", 75, "PROFILE"),
    }
    for index, (stage, scale, pct, angle) in ramp_specs.items():
        plans[index]["approach"] = {"stage": stage, "ramp_id": "ramp_main", "direction": "screen-right"}
        plans[index]["shot_scale"] = scale
        plans[index]["subject_pct"] = pct
        plans[index]["viewpoint"] = "SIDE" if angle == "SIDE_VIEW" else angle
        plans[index]["dominant_subject_id"] = "seo"
        plans[index]["performances"] = [{
            "entity_id": "seo", "mode": "NONE", "eyes_brows": "", "mouth_jaw": "", "body_cue": "", "reaction_to": None,
        }]
        plans[index]["axis_id"] = "approach_axis"

    action_specs = {
        20: ("GEOGRAPHY", "WIDE_MASTER"),
        21: ("ANTICIPATION", "MEDIUM"),
        22: ("TRAJECTORY", "FULL"),
        23: ("CONTACT", "FULL"),
        24: ("CONSEQUENCE", "WIDE_MASTER"),
        25: ("REACTION", "MEDIUM"),
    }
    for index, (phase, scale) in action_specs.items():
        plans[index]["action"] = {
            "phase": phase,
            "sequence_id": "fight_main",
            "vector_pct": 70 if index in {22, 23} else 0,
            "origin_third": "UPPER" if index in {22, 23} else "NONE",
            "destination_third": "LOWER" if index in {22, 23} else "NONE",
        }
        plans[index]["shot_scale"] = scale
    for index in (22, 23):
        plans[index]["page_layout"] = "TALL_ACTION"
    plans[22]["approach"] = {"stage": "ADDITIONAL", "ramp_id": "approach_extra", "direction": "screen-left"}
    plans[22]["beat"] = "PRESSURE"

    for index in (3, 14):
        plans[index]["page_layout"] = "BLACK_INSET"
        plans[index]["black"] = {"canvas_pct": 60}
    for index in (18, 31, 38):
        plans[index]["low_density_kind"] = "REACTION" if index in {18, 31} else "ENVIRONMENT"

    for index in (8, 27):
        outer = plans[index]
        phase_pair = ("NONE", "NONE") if index == 8 else ("CONSEQUENCE", "REACTION")
        outer["subpanels"] = []
        for sub_index, subpanel_id in enumerate(("A", "B")):
            sub_performances = copy.deepcopy(outer["performances"])
            outer["subpanels"].append({
                "subpanel_id": subpanel_id,
                "moment_id": f"moment_{index:02d}_{subpanel_id.lower()}",
                "shot_scale": "MEDIUM" if subpanel_id == "A" else "CLOSE",
                "camera_elevation": "EYE_LEVEL" if subpanel_id == "A" else "LOW",
                "viewpoint": "SIDE" if subpanel_id == "A" else "PROFILE",
                "camera_roll": "LEVEL",
                "dominant_subject_id": outer["dominant_subject_id"],
                "performances": sub_performances,
                "action_phase": phase_pair[sub_index],
            })
    return plans


def subject_sentence(plan: dict, index: int) -> str:
    subject = plan["dominant_subject_id"]
    motif = UNIQUE_MOTIFS[index]
    if any(item["mode"] in validator.REACTION_PERFORMANCES for item in plan["performances"]):
        label = "short-haired young male tunnel cleaner" if subject == "seo" else "dark-haired female tunnel worker"
        return f"The {label} recoils beside {motif}, eyebrows raised and eyes fixed, jaw rigid, shoulders pulling backward."
    if subject == "seo":
        return f"The short-haired young male tunnel cleaner advances past {motif}, shoulders tense and both hands visible."
    if subject == "mira":
        return f"The dark-haired female tunnel worker reaches across {motif}, gaze focused and knees firmly planted."
    if subject == "dog":
        return f"The eyeless black plated dog creature lunges across {motif}, claws spread and spine arched."
    return f"The empty urban tunnel opens around {motif}, warning lamps flickering across wet concrete."


def make_prompt(plan: dict, index: int) -> str:
    parts = [subject_sentence(plan, index)]
    layout = plan["page_layout"]
    if layout == "WHITE_INSET":
        parts.append("Pure white webtoon page with one asymmetrical panel in the upper-left and clean white space surrounding the framed instant.")
    elif layout == "WHITE_COMPOSITE_2":
        parts.append("Pure white webtoon page with exactly two panels in opposite corners and clean white space.")
    elif layout == "WHITE_ISOLATE":
        parts.append("Pure white webtoon page with a single figure isolated on the lower-right and clean white field preserving emotional distance.")
    elif layout == "WHITE_FRAGMENT":
        parts.append("Pure white webtoon page with one anatomical fragment frame centered high and clean white field isolating only the contacting hand.")
    elif layout == "WHITE_ACTION_STRIP_2":
        parts.append("Pure white webtoon page with exactly two narrow panels in a diagonal action strip and clean white space.")
    elif layout == "BLACK_INSET":
        parts.append("Matte-black webtoon page with one small inset in the lower-right and silent black space surrounding it.")
    elif layout == "TALL_ACTION":
        parts.append("Full-height tall action layout with one dominant impact instant and a continuous movement vector spanning seventy percent from the upper third to the lower third.")
    elif plan["shot_scale"] != "TRUE_LONG" and plan["fragment_subject"] == "NONE":
        parts.append("One readable instant keeps the subject separated from machinery, debris, and the open route through the tunnel.")

    if layout in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}:
        for subpanel in plan["subpanels"]:
            sub_subject = "The worker advances" if subpanel["dominant_subject_id"] != "environment" else "Tunnel opens"
            parts.append(
                f"Panel {subpanel['subpanel_id']}: {sub_subject} at rainy midnight, "
                f"{ELEVATION_PHRASES[subpanel['camera_elevation']]}, {VIEWPOINT_PHRASES[subpanel['viewpoint']]}, "
                f"{ROLL_PHRASES[subpanel['camera_roll']]}, {SCALE_PHRASES[subpanel['shot_scale']]} with one readable instant."
            )
    parts.append(
        f"{ELEVATION_PHRASES[plan['camera_elevation']]} {VIEWPOINT_PHRASES[plan['viewpoint']]} "
        f"{ROLL_PHRASES[plan['camera_roll']]} {SCALE_PHRASES[plan['shot_scale']]} in the urban tunnel at rainy midnight."
    )
    if plan["shot_scale"] == "TRUE_LONG":
        parts.append(
            "Camera waits twenty meters away; the complete full-body figure occupies fifteen percent and the environment occupies seventy-five percent. "
            "Open air preserves relative scale; foreground barriers, midground subject, and background tunnel stay distinct above one ground plane."
        )
    if layout == "TALL_ACTION":
        parts.append("Complete bodies stay readable as the force trajectory crosses upper and lower thirds beside scale-giving columns.")
    if layout not in validator.WHITE_LAYOUTS:
        parts.append("Amber work light enters from screen-left, balanced by cool blue reflections on wet concrete.")
    if layout not in validator.WHITE_LAYOUTS | {"TALL_ACTION"} and plan["shot_scale"] not in {"TRUE_LONG"} and plan["action"]["phase"] != "NONE":
        parts.append("Screen-left attacker, screen-right target, central obstacle, and foreground exit remain geographically legible without effects hiding contact.")
    parts.append(STYLE)
    return " ".join(parts)


def voice_for(plan: dict, index: int) -> str:
    if plan["page_layout"] in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}:
        return "El peligro cambió de dirección frente a nosotros."
    if plan["fragment_subject"] != "NONE" or any(
        item["mode"] in validator.REACTION_PERFORMANCES for item in plan["performances"]
    ):
        return "Entonces entendí por completo aquel precio."
    if plan["action"]["phase"] != "NONE" or plan["page_layout"] == "TALL_ACTION":
        return "La criatura atacó sin aviso frente a nosotros."
    if plan["shot_scale"] in {"WIDE_MASTER", "TRUE_LONG"}:
        return "El túnel entero se abrió ante nosotros bajo la lluvia."
    return "Yo seguí avanzando solo sin mirar hacia atrás."


def make_valid_data() -> dict:
    plans = configure_plans()
    scenes: list[dict] = []
    panel_to_scene_id: dict[int, str] = {}
    for panel_index, plan in enumerate(plans):
        if panel_index == 1:
            scene_id = f"scene_{len(scenes) + 1:02d}"
            scenes.append(
                {
                    "id": scene_id,
                    "type": "narrative_card",
                    "card": {"text": "EL HÉROE OCULTO", "mode": "editor", "background": "black", "role": "title", "story_beat_id": "B01"},
                    "voiceover": {"text": "EL HÉROE OCULTO [pause]"},
                }
            )
        scene_id = f"scene_{len(scenes) + 1:02d}"
        panel_to_scene_id[panel_index] = scene_id
        scenes.append({"id": scene_id, "type": "panel", "render_mode": "static"})
        if panel_index == 18:
            card_id = f"scene_{len(scenes) + 1:02d}"
            scenes.append(
                {
                    "id": card_id,
                    "type": "narrative_card",
                    "card": {"text": "NO PODÍA SOLTARLOS", "mode": "editor", "background": "black", "role": "narrative", "story_beat_id": plans[18]["story_beat_id"]},
                    "voiceover": {"text": "NO PODÍA SOLTARLOS [pause]"},
                }
            )

    for panel_index, plan in enumerate(plans):
        scene = next(item for item in scenes if item["id"] == panel_to_scene_id[panel_index])
        for performance_item in plan["performances"]:
            if "reaction_to_panel" in performance_item:
                performance_item["reaction_to"] = panel_to_scene_id[performance_item.pop("reaction_to_panel")]
        subject = plan["dominant_subject_id"]
        visible = [] if subject == "environment" else [subject]
        performance = any(item["mode"] not in {"NONE", "NEUTRAL_INTENTIONAL"} for item in plan["performances"])
        if subject in {"seo", "mira"}:
            refs = {"characters": [{"id": subject, "pose": "performance" if performance else "base"}]}
        elif subject == "dog":
            refs = {"assets": [{"id": "dog", "pose": "base"}]}
        else:
            refs = {}
        state_key = {"seo": "seo.zone", "mira": "mira.zone", "dog": "dog.threat"}.get(subject)
        state_before = {state_key: "stable"} if state_key else {}
        scene.update(
            {
                "references": refs,
                "transition_in": "cut",
                "visual": {"image_prompt": make_prompt(plan, panel_index)},
                "visual_plan": plan,
                **({"editor_motion": {"enabled": False, "preset": "static", "zoom": 1, "pan": 0}} if plan["page_layout"] in validator.WHITE_LAYOUTS | {"BLACK_INSET"} else {}),
                "continuity": {
                    "location_id": "urban_tunnel",
                    "space_type": "INTERIOR",
                    "time": "rainy midnight",
                    "light_state": "amber_blue_active",
                    "axis_id": plan["axis_id"],
                    "visible_entities": visible,
                    "state_before": state_before,
                    "state_after": copy.deepcopy(state_before),
                    "state_change_reason": {},
                    "atomic_action": {
                        "actor_id": subject if subject != "environment" else "environment",
                        "verb": "advances",
                        "target_id": "tunnel_route",
                        "origin": "screen_left",
                        "trajectory_or_contact": "across_ground",
                        "destination": "screen_right",
                        "result": "moment_complete",
                    },
                    "transition_bridge": panel_index in {9, 12},
                    "light_change_reason": "",
                },
                "voiceover": {"text": voice_for(plan, panel_index)},
            }
        )

    full_script = "\n".join(item["voiceover"]["text"] for item in scenes)
    scene_seconds = [validator.spoken_words(item["voiceover"]["text"]) * 60 / (150 * 1.4) for item in scenes]
    runtime_estimate = round(sum(scene_seconds), 3)
    payoff_scene_id = panel_to_scene_id[29]
    payoff_index = next(index for index, item in enumerate(scenes) if item["id"] == payoff_scene_id)
    payoff_start_pct = round(sum(scene_seconds[:payoff_index]) / runtime_estimate, 4)
    return {
        "project": {
            "title": "Serie prueba",
            "preset": "manhwa",
            "serie": "serie_prueba",
            "slug": "serie_prueba_parte_01",
            "language": "es-419",
            "aspect_ratio": "9:16",
            "fps": 30,
            "part": 1,
        },
        "pipeline": {
            "image_generation": {"tool": "grok"},
            "animation": {"tool": "grok"},
            "tts": {"tool": "elevenlabs", "voice_id": "voice_real_12345", "language": "es-419"},
            "editing": {"tool": "capcut"},
        },
        "characters": make_registry(),
        "escenarios": {
            "urban_tunnel": {
                "display_name": "Urban tunnel",
                "views": {
                    "front_eye": {
                        "mode": "generate",
                        "asset": "assets/escenarios/serie_prueba/urban_tunnel_front_eye.png",
                        "view_type": "plate",
                        "prompt": "Empty reinforced urban tunnel plate at rainy midnight, front eye-level architecture, no people, no readable text.",
                    }
                },
            }
        },
        "scenes": scenes,
        "editing": {
            "caption_style": {"enabled": True, "max_words_on_screen": 4},
            "narrative_card_style": {"max_lines": 3},
            "panel_motion": {"enabled": True},
            "timing_budget": {
                "runtime_target_sec": [90, 100],
                "runtime_estimate_sec": runtime_estimate,
                "payoff_scene_id": payoff_scene_id,
                "payoff_start_pct": payoff_start_pct,
                "final_visual_tail_sec": 0.45,
            },
        },
        "tts_export": {
            "language": "es-419",
            "mode": "single",
            "model_id": "eleven_v3",
            "voice_settings": {"speed": 1.0},
            "edit_speed": 1.4,
            "full_script": full_script,
        },
    }


def attach_packet(data: dict) -> tuple[dict, list[dict], bytes]:
    monologue = data["tts_export"]["full_script"]
    beat_order = [f"B{index:02d}" for index in range(1, 12)]
    machine = {
        "packet_id": "serie_prueba_parte_01_v5_3",
        "handoff_version": "5.3",
        "approved_voice_id": "voice_real_12345",
        "target_runtime_seconds": 95,
        "runtime_range_seconds": [90, 100],
        "beat_order": beat_order,
        "monologue_sha256": validator.sha256_hex(monologue.encode("utf-8")),
        "monologue_hash_basis": (
            "UTF-8 bytes of the exact text between MONOLOGO_LOCKED and HANDOFF_NARRATIVO_V5_3, "
            "excluding the two framing line breaks and preserving LF inside the text"
        ),
        "location_ids": ["urban_tunnel"],
        "beat_locations": {beat_id: "urban_tunnel" for beat_id in beat_order},
        "state_contract": {
            "seo.zone": {"initial": "stable", "changes": []},
            "mira.zone": {"initial": "stable", "changes": []},
            "dog.threat": {"initial": "stable", "changes": []},
        },
    }
    packet_text = (
        "# STORY_PACKET_V5.3\n\n## MACHINE_LOCK_V5_3\n\n```json\n"
        + json.dumps(machine, ensure_ascii=False, indent=2)
        + "\n```\n\n## MONOLOGO_LOCKED\n\n```text\n"
        + monologue
        + "\n```\n\n## HANDOFF_NARRATIVO_V5_3\n\nLocked.\n"
    )
    raw = packet_text.encode("utf-8")
    packet, packet_issues = validator.parse_story_packet(raw, Path("STORY_PACKET.md"))
    data["production_lock"] = {
        "handoff_version": "5.3",
        "packet_id": machine["packet_id"],
        "source_packet_sha256": validator.sha256_hex(raw),
        "monologue_sha256": machine["monologue_sha256"],
        "approved_voice_id": machine["approved_voice_id"],
    }
    return packet, packet_issues, raw


class ValidatorV53Tests(unittest.TestCase):
    def validate(self, data: dict) -> dict:
        packet, packet_issues, _ = attach_packet(data)
        return validator.validate(data, Path("fixture.json"), packet, packet_issues)

    def test_golden_contract_releases(self) -> None:
        report = self.validate(make_valid_data())
        if report["preflight_status"] != "PROMPT_RELEASE":
            self.fail(json.dumps(report["errors"], ensure_ascii=False, indent=2))

    def test_adversarial_old_keyword_gaming_is_rejected(self) -> None:
        data = make_valid_data()
        first_panel = next(scene for scene in data["scenes"] if scene["type"] == "panel")
        first_panel["visual"]["image_prompt"] = (
            "Escena de tres paneles, asset sheet y solo uno por ciento blanco; medium-gray background, high contrast, night."
        )
        data["pipeline"] = "wrong"
        data["editing"] = "wrong"
        data["tts_export"]["edit_speed"] = -99
        data["forbidden_root"] = True
        report = self.validate(data)
        self.assertEqual(report["preflight_status"], "PROMPT_REPAIR_REQUIRED")
        self.assertEqual(report["status"], "FAIL")
        self.assertFalse(report["preflight_gates"]["root_fields"])
        self.assertFalse(report["preflight_gates"]["root_types_allowed"])
        self.assertFalse(report["preflight_gates"]["tts_contract"])

    def test_high_contrast_does_not_count_as_angle(self) -> None:
        data = make_valid_data()
        panel = next(scene for scene in data["scenes"] if scene["type"] == "panel")
        panel["visual"]["image_prompt"] = panel["visual"]["image_prompt"].replace("profile view", "high contrast")
        report = self.validate(data)
        self.assertFalse(report["preflight_gates"]["camera_present"])

    def test_malformed_reference_returns_report_without_exception(self) -> None:
        data = make_valid_data()
        panel = next(scene for scene in data["scenes"] if scene["type"] == "panel")
        panel["references"] = {"characters": [{"id": [], "pose": "base"}]}
        report = self.validate(data)
        self.assertEqual(report["preflight_status"], "PROMPT_REPAIR_REQUIRED")
        self.assertFalse(report["preflight_gates"]["references_valid_max_three"])

    def test_cli_never_prints_traceback_for_malformed_reference(self) -> None:
        data = make_valid_data()
        panel = next(scene for scene in data["scenes"] if scene["type"] == "panel")
        panel["references"] = {"characters": [{"id": [], "pose": "base"}]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            packet, packet_issues, raw_packet = attach_packet(data)
            self.assertFalse(packet_issues)
            packet_path = Path(directory) / "STORY_PACKET.md"
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            packet_path.write_bytes(raw_packet)
            completed = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(path), str(packet_path)],
                check=False,
                text=True,
                capture_output=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
        self.assertEqual(completed.returncode, 1)
        self.assertNotIn("Traceback", completed.stderr + completed.stdout)
        parsed = json.loads(completed.stdout)
        self.assertEqual(parsed["preflight_status"], "PROMPT_REPAIR_REQUIRED")

    def test_packet_byte_tamper_breaks_production_lock(self) -> None:
        data = make_valid_data()
        _, _, raw = attach_packet(data)
        tampered, packet_issues = validator.parse_story_packet(raw + b"\n", Path("tampered.md"))
        report = validator.validate(data, Path("fixture.json"), tampered, packet_issues)
        self.assertFalse(report["preflight_gates"]["production_lock"])
        self.assertIn("PRODUCTION_LOCK_MISMATCH", {item["code"] for item in report["errors"]})

    def test_full_script_must_equal_locked_monologue(self) -> None:
        data = make_valid_data()
        packet, packet_issues, _ = attach_packet(data)
        data["tts_export"]["full_script"] += "\nTexto no autorizado."
        report = validator.validate(data, Path("fixture.json"), packet, packet_issues)
        self.assertFalse(report["preflight_gates"]["full_script_exact"])
        self.assertIn("FULL_SCRIPT_PACKET_MISMATCH", {item["code"] for item in report["errors"]})

    def test_composite_requires_two_structured_subpanels(self) -> None:
        data = make_valid_data()
        panel = next(
            scene
            for scene in data["scenes"]
            if scene["type"] == "panel" and scene["visual_plan"]["page_layout"] == "WHITE_COMPOSITE_2"
        )
        panel["visual_plan"]["subpanels"] = []
        report = self.validate(data)
        self.assertFalse(report["preflight_gates"]["white_page_range"])
        self.assertIn("SUBPANELS_TWO_REQUIRED", {item["code"] for item in report["errors"]})

    def test_malformed_asset_type_is_reported_without_exception(self) -> None:
        data = make_valid_data()
        data["characters"]["seo"]["asset_type"] = []
        report = self.validate(data)
        self.assertEqual(report["preflight_status"], "PROMPT_REPAIR_REQUIRED")
        self.assertFalse(report["preflight_gates"]["asset_registry"])

    def test_state_not_in_machine_lock_cannot_be_invented(self) -> None:
        data = make_valid_data()
        panel = next(scene for scene in data["scenes"] if scene["type"] == "panel" and scene["visual_plan"]["dominant_subject_id"] == "seo")
        panel["continuity"]["state_after"]["seo.zone"] = "future_state"
        panel["continuity"]["state_change_reason"]["seo.zone"] = "invented"
        report = self.validate(data)
        self.assertFalse(report["preflight_gates"]["continuity"])
        self.assertIn("STATE_TRANSITION_NOT_LOCKED", {item["code"] for item in report["errors"]})

    def test_story_beat_cannot_backtrack(self) -> None:
        data = make_valid_data()
        panels = [scene for scene in data["scenes"] if scene["type"] == "panel"]
        panels[-1]["visual_plan"]["story_beat_id"] = "B01"
        report = self.validate(data)
        self.assertFalse(report["preflight_gates"]["production_lock"])
        self.assertIn("STORY_BEAT_BACKTRACK", {item["code"] for item in report["errors"]})

    def test_production_p1_packet_machine_lock_parses_and_hashes(self) -> None:
        packet_path = VALIDATOR_PATH.parents[1] / "STORY_PACKET_P1_PRODUCTION_V5_3.md"
        packet, issues = validator.parse_story_packet(packet_path.read_bytes(), packet_path)
        self.assertEqual(issues, [])
        self.assertEqual(
            packet["monologue_sha256"],
            packet["machine_lock"]["monologue_sha256"],
        )


if __name__ == "__main__":
    unittest.main()
