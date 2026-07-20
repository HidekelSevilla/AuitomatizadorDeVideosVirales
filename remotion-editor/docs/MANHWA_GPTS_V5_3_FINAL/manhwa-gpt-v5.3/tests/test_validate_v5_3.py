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
SIGNATURES = {
    "seo": "short-haired young Korean male industrial cleanup worker",
    "mira": "dark-haired Korean female industrial cleanup supervisor",
    "dog": "eyeless black plated canine anomaly with violet chest fissure",
}
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


def asset_style(kind: str = "character") -> str:
    role = {
        "character": "character illustration",
        "creature": "creature illustration",
        "prop": "prop design",
        "container": "container prop design",
        "ui": "interface design",
    }[kind]
    return f"Korean manhwa webtoon {role}, 2D flat cel shading, crisp inked lineart."


def studio_isolation(kind: str = "character") -> str:
    return (
        "Isolated on a seamless neutral medium-gray background, no environment, no additional characters, "
        f"no readable text. {asset_style(kind)}"
    )


def human_base_prompt(signature: str) -> str:
    return (
        f"Exactly one character, {signature}, full body from hair to soles, orthographic front eye-level view, "
        "neutral relaxed expression, both open empty hands visible, both feet visible, clean and dry, "
        f"even studio illumination. {studio_isolation()}"
    )


def make_registry() -> dict:
    registry: dict = {}
    for item_id, display in (("seo", "Seo Jun"), ("mira", "Park Mira")):
        registry[item_id] = {
            "display_name": display,
            "asset_type": "human",
            "prompt_signature": SIGNATURES[item_id],
            "poses": {
                "base": {
                    "mode": "generate",
                    "asset": f"assets/characters/serie_prueba/{item_id}_base.png",
                    "pose_role": "base",
                    "prompt": human_base_prompt(SIGNATURES[item_id]),
                },
                "performance": {
                    "mode": "generate",
                    "asset": f"assets/characters/serie_prueba/{item_id}_performance.png",
                    "reference_pose": "base",
                    "pose_role": "performance",
                    "prompt": f"{SIGNATURES[item_id]}. Same face, same hair, same outfit as the reference; recoiling with tense brows, rigid jaw, raised shoulders, and open hands. {studio_isolation()}",
                },
            },
        }
    creature_poses = {}
    for role in ("base", "trapped", "charge", "attack", "impact", "collapse"):
        if role == "base":
            pose_prompt = (
                f"Exactly one creature, {SIGNATURES['dog']}, complete body fully visible, neutral resting state, "
                f"all limbs visible, clean and dry, even studio illumination. {studio_isolation('creature')}"
            )
        else:
            pose_prompt = (
                f"{SIGNATURES['dog']}. Same anatomy, same markings, same colors as the reference; "
                f"a physically distinct {role} state with unique limb contacts and silhouette. {studio_isolation('creature')}"
            )
        creature_poses[role] = {
            "mode": "generate",
            "asset": f"assets/characters/serie_prueba/dog_{role}.png",
            "pose_role": role,
            "prompt": pose_prompt,
            **({} if role == "base" else {"reference_pose": "base"}),
        }
    registry["dog"] = {
        "display_name": "Plated dog",
        "asset_type": "creature",
        "prompt_signature": SIGNATURES["dog"],
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
        "beat": "NORMALITY",
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
        "scale_anchor": "",
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
        plans[index]["scale_anchor"] = "the worker height is one-third of the tunnel support height"

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
        plans[index]["beat"] = "ACTION"
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
    plans[25]["high_tension"] = True
    plans[25]["performances"] = [{
        "entity_id": "mira",
        "mode": "REACTION",
        "eyes_brows": "eyebrows raised and eyes fixed",
        "mouth_jaw": "jaw rigid",
        "body_cue": "shoulders pulling backward",
        "reaction_to_panel": 23,
    }]

    for index in (3, 14):
        plans[index]["page_layout"] = "BLACK_INSET"
        plans[index]["black"] = {"canvas_pct": 60}
    for index in (18, 31, 38):
        plans[index]["low_density_kind"] = "REACTION" if index in {18, 31} else "ENVIRONMENT"
    plans[38]["dominant_subject_id"] = "environment"
    plans[38]["performances"] = []

    for plan in plans:
        phase = plan["action"]["phase"]
        forced = plan["beat"] in validator.FORCED_TENSION_BEATS or phase in validator.FORCED_TENSION_PHASES
        if plan["dominant_subject_id"] in {"seo", "mira"} and forced:
            plan["high_tension"] = True
            performance = plan["performances"][0]
            if performance["mode"] in {"NONE", "NEUTRAL_INTENTIONAL"}:
                performance.update({
                    "mode": "EFFORT",
                    "eyes_brows": "eyebrows tightened and eyes fixed",
                    "mouth_jaw": "jaw clenched",
                    "body_cue": "shoulders braced forward",
                    "reaction_to": None,
                })

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
        label = SIGNATURES[subject]
        return f"The {label} recoils beside {motif}, eyebrows raised and eyes fixed, jaw rigid, shoulders pulling backward."
    if subject == "seo":
        if plan["performances"] and plan["performances"][0]["mode"] == "EFFORT":
            return f"The {SIGNATURES['seo']} advances past {motif}, eyebrows tightened and eyes fixed, jaw clenched, shoulders braced forward."
        return f"The {SIGNATURES['seo']} advances past {motif}, shoulders steady and both hands visible."
    if subject == "mira":
        if plan["performances"] and plan["performances"][0]["mode"] == "EFFORT":
            return f"The {SIGNATURES['mira']} reaches across {motif}, eyebrows tightened and eyes fixed, jaw clenched, shoulders braced forward."
        return f"The {SIGNATURES['mira']} reaches across {motif}, gaze focused and knees firmly planted."
    if subject == "dog":
        if plan["action"]["phase"] == "TRAJECTORY":
            return f"The {SIGNATURES['dog']} lunges toward {motif}, claws spread and body airborne."
        if index >= 24:
            return f"The {SIGNATURES['dog']} lies collapsed beside {motif}, all limbs contacting the ground."
        return f"The {SIGNATURES['dog']} remains trapped beside {motif}, limbs pinned and silhouette readable."
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
        parts.append("Pure white webtoon page with one fragment frame centered high and clean white field isolating only the contacting hand.")
    elif layout == "WHITE_ACTION_STRIP_2":
        parts.append("Pure white webtoon page with exactly two narrow panels in a diagonal action strip and clean white space.")
    elif layout == "BLACK_INSET":
        parts.append("Matte-black webtoon page with one small inset in the lower-right and silent black space surrounding it.")
    elif layout == "TALL_ACTION":
        instant = "movement instant" if plan["action"]["phase"] == "TRAJECTORY" else "contact instant"
        parts.append(f"Full-height tall action layout with one dominant {instant} and a continuous movement vector spanning seventy percent from the upper third to the lower third.")
    elif plan["shot_scale"] != "TRUE_LONG" and plan["fragment_subject"] == "NONE":
        parts.append("One instant separates subject, debris, machinery, and exit.")

    if layout in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}:
        for subpanel in plan["subpanels"]:
            sub_subject = "The worker advances" if subpanel["dominant_subject_id"] != "environment" else "Tunnel opens"
            parts.append(
                f"Panel {subpanel['subpanel_id']}: {sub_subject} at rainy midnight, "
                f"{ELEVATION_PHRASES[subpanel['camera_elevation']]}, {VIEWPOINT_PHRASES[subpanel['viewpoint']]}, "
                f"{ROLL_PHRASES[subpanel['camera_roll']]}, {SCALE_PHRASES[subpanel['shot_scale']]} with one readable instant."
            )
    phase = plan["action"]["phase"]
    if phase == "GEOGRAPHY":
        parts.append(f"The {SIGNATURES['dog']} remains trapped screen-right; the worker target waits screen-left between foreground barrier and background exit.")
    elif phase == "ANTICIPATION":
        parts.append(f"The {SIGNATURES['dog']} coils and prepares before impact, facing its screen-left target without touching.")
    elif phase == "TRAJECTORY":
        parts.append(f"The {SIGNATURES['dog']} lunges through midair from screen-right toward its lower-third target without contact.")
    elif phase == "CONTACT":
        parts.append(f"The {SIGNATURES['dog']} strikes; its right claw hits the worker's shoulder into the ground.")
    elif phase == "CONSEQUENCE":
        parts.append(f"The {SIGNATURES['dog']} takes the impact; plates crack, debris falls, and its body is hurled backward.")
    elif phase == "REACTION":
        parts.append(f"The {SIGNATURES['dog']} collapses broken behind the recoiling worker after the hit.")
    parts.append(
        f"{ELEVATION_PHRASES[plan['camera_elevation']]} {VIEWPOINT_PHRASES[plan['viewpoint']]} "
        f"{ROLL_PHRASES[plan['camera_roll']]} {SCALE_PHRASES[plan['shot_scale']]} in the urban tunnel at rainy midnight."
    )
    if plan["shot_scale"] == "TRUE_LONG":
        parts.append(
            "Camera waits twenty meters away; the complete full-body figure occupies fifteen percent and the environment occupies seventy-five percent. "
            "Open air preserves relative scale; foreground barriers, midground subject, and background tunnel stay distinct above one ground plane."
        )
        parts.append(plan["scale_anchor"] + ".")
    if layout not in validator.WHITE_LAYOUTS:
        parts.append("Amber work light enters from screen-left over cool concrete.")
    if plan["low_density_kind"] == "REACTION":
        parts.append("Open negative space creates a clear visual breathing room around the reaction.")
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
        refs: dict = {}
        if subject in {"seo", "mira"}:
            refs = {"characters": [{"id": subject, "pose": "performance" if performance else "base"}]}
        elif subject == "dog":
            refs = {"assets": [{"id": "dog", "pose": "trapped" if panel_index < 24 else "collapse"}]}
        action_role = {
            "GEOGRAPHY": "trapped",
            "ANTICIPATION": "charge",
            "TRAJECTORY": "attack",
            "CONTACT": "attack",
            "CONSEQUENCE": "impact",
            "REACTION": "collapse",
        }.get(plan["action"]["phase"])
        if action_role:
            if "dog" not in visible:
                visible.append("dog")
            refs.setdefault("assets", [])
            refs["assets"] = [{"id": "dog", "pose": action_role}]
        if (
            plan["shot_scale"] in {"WIDE_MASTER", "TRUE_LONG"}
            and plan["page_layout"] not in validator.WHITE_LAYOUTS | {"BLACK_INSET"}
        ):
            refs["escenario"] = {"id": "urban_tunnel", "view": "front_eye"}
        if any(item["mode"] in validator.REACTION_PERFORMANCES for item in plan["performances"]):
            atomic_verb = "recoils"
        elif subject == "seo":
            atomic_verb = "advances"
        elif subject == "mira":
            atomic_verb = "reaches"
        elif subject == "dog":
            atomic_verb = "lunges" if plan["action"]["phase"] == "TRAJECTORY" else ("lies" if panel_index >= 24 else "remains")
        else:
            atomic_verb = "opens"
        state_before: dict = {}
        state_after: dict = {}
        state_reasons: dict = {}
        if "seo" in visible:
            state_before["seo.zone"] = state_after["seo.zone"] = "stable"
        if "mira" in visible:
            state_before["mira.zone"] = state_after["mira.zone"] = "stable"
        if "dog" in visible:
            dog_before = "trapped" if panel_index <= 24 else "collapsed"
            dog_after = "collapsed" if panel_index >= 24 else "trapped"
            state_before["dog.threat"] = dog_before
            state_after["dog.threat"] = dog_after
            if panel_index == 24:
                state_reasons["dog.threat"] = "the impact breaks its plated body and ends the attack"
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
                    "state_after": state_after,
                    "state_change_reason": state_reasons,
                    "atomic_action": {
                        "actor_id": subject if subject != "environment" else "environment",
                        "verb": atomic_verb,
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

    # V5.3.4 escribe cada átomo del packet como párrafo. El LF conservado al
    # final del voiceover izquierdo más el LF del join reconstruyen exactamente
    # el separador en blanco de MONOLOGO_LOCKED.
    for item in scenes[:-1]:
        item["voiceover"]["text"] += "\n"
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
                        "prompt": "Empty environment plate, no people, no creatures, no vehicles, no readable text. Reinforced urban tunnel at rainy midnight, wide master, eye-level angle, front view; amber work light from screen-left. Korean manhwa webtoon background illustration, 2D flat cel shading, crisp inked lineart, painted environment.",
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


def make_literal_hook_data() -> dict:
    """Golden hook: the narrated death and inheritance are both physically shown."""
    data = make_valid_data()
    kang_signature = "pale Korean man with long black hair dark prison outfit"
    data["characters"]["kang"] = {
        "display_name": "Kang Muyeol",
        "asset_type": "human",
        "prompt_signature": kang_signature,
        "poses": {
            "base": {
                "mode": "generate",
                "asset": "assets/characters/serie_prueba/kang_base.png",
                "pose_role": "base",
                "prompt": human_base_prompt(kang_signature),
            },
            "dead": {
                "mode": "generate",
                "asset": "assets/characters/serie_prueba/kang_dead.png",
                "reference_pose": "base",
                "pose_role": "performance",
                "prompt": (
                    f"{kang_signature}. Same face, same hair, same outfit as the reference; slumped lifeless with "
                    f"closed eyes, slack jaw, collapsed neck, and both empty hands visible. {studio_isolation()}"
                ),
            },
            "transfer": {
                "mode": "generate",
                "asset": "assets/characters/serie_prueba/kang_transfer.png",
                "reference_pose": "base",
                "pose_role": "performance",
                "prompt": (
                    f"{kang_signature}. Same face, same hair, same outfit as the reference; reaching forward with "
                    f"pain-tightened eyes, clenched teeth, rigid shoulders, and one empty hand extended. {studio_isolation()}"
                ),
            },
        },
    }
    panels = [scene for scene in data["scenes"] if scene["type"] == "panel"]
    death, inheritance = panels[:2]
    death["voiceover"]["text"] = "[low] El villano más grande de Corea murió frente a mí.\n"
    death["visual_plan"].update({
        "dominant_subject_id": "kang",
        "high_tension": True,
        "performances": [
            {
                "entity_id": "kang", "mode": "EFFORT", "eyes_brows": "closed eyes",
                "mouth_jaw": "slack jaw", "body_cue": "collapsed neck", "reaction_to": None,
            },
            {
                "entity_id": "seo", "mode": "RELATIONSHIP", "eyes_brows": "fixed gaze",
                "mouth_jaw": "tight lips", "body_cue": "rigid shoulders", "reaction_to": None,
            },
        ],
    })
    death["references"] = {
        "characters": [{"id": "kang", "pose": "dead"}, {"id": "seo", "pose": "performance"}],
        "escenario": {"id": "urban_tunnel", "view": "front_eye"},
    }
    death["continuity"].update({
        "visible_entities": ["kang", "seo"],
        "atomic_action": {
            "actor_id": "kang", "verb": "dies", "target_id": "seo", "origin": "open_capsule",
            "trajectory_or_contact": "dies directly before the witness", "destination": "seo_line_of_sight",
            "result": "kang_is_dead_before_seo",
        },
    })
    death["visual"]["image_prompt"] = (
        f"{kang_signature} dies before {SIGNATURES['seo']}; closed eyes, slack jaw, collapsed neck; "
        "witness: fixed gaze, tight lips, rigid shoulders. "
        "eye-level angle profile view level camera roll distant wide shot in the urban tunnel at rainy midnight. "
        "At twenty meters, full-body figures occupy fifteen percent; environment occupies seventy-five percent. "
        "Open air and relative scale separate foreground, midground, and background on one ground plane. "
        "the worker height is one-third of the tunnel support height. Amber work light enters from screen-left over cool concrete. "
        + STYLE
    )

    inheritance["voiceover"]["text"] = "Pero antes me eligió como heredero.\n"
    inheritance["visual_plan"].update({
        "beat": "HOOK",
        "dominant_subject_id": "kang",
        "high_tension": True,
        "performances": [
            {
                "entity_id": "kang", "mode": "EFFORT", "eyes_brows": "pain eyes",
                "mouth_jaw": "teeth clenched", "body_cue": "rigid body", "reaction_to": None,
            },
            {
                "entity_id": "seo", "mode": "SHOCK", "eyes_brows": "wide eyes",
                "mouth_jaw": "open jaw", "body_cue": "body recoils", "reaction_to": death["id"],
            },
        ],
    })
    inheritance["references"] = {
        "characters": [{"id": "kang", "pose": "transfer"}, {"id": "seo", "pose": "performance"}],
    }
    inheritance["continuity"].update({
        "visible_entities": ["kang", "seo"],
        "state_before": {"seo.zone": "stable"},
        "state_after": {"seo.zone": "stable"},
        "state_change_reason": {},
        "atomic_action": {
            "actor_id": "kang", "verb": "chooses", "target_id": "seo", "origin": "kang_hand",
            "trajectory_or_contact": "red-black inheritance travels hand to chest", "destination": "seo_chest",
            "result": "seo_becomes_heir",
        },
    })
    inheritance["visual"]["image_prompt"] = (
        f"{kang_signature} chooses {SIGNATURES['seo']} as heir, transferring red-black inheritance from hand into chest; "
        "pain eyes, teeth clenched, rigid body; wide eyes, open jaw, body recoils. Pure white webtoon page with one inset "
        "and white space. low-angle front view level camera roll full-body shot in the urban tunnel at rainy midnight. " + STYLE
    )
    data["tts_export"]["full_script"] = "\n".join(scene["voiceover"]["text"] for scene in data["scenes"])
    seconds = [validator.spoken_words(scene["voiceover"]["text"]) * 60 / (150 * 1.4) for scene in data["scenes"]]
    runtime = round(sum(seconds), 3)
    payoff_id = data["editing"]["timing_budget"]["payoff_scene_id"]
    payoff_index = next(index for index, scene in enumerate(data["scenes"]) if scene["id"] == payoff_id)
    data["editing"]["timing_budget"]["runtime_estimate_sec"] = runtime
    data["editing"]["timing_budget"]["payoff_start_pct"] = round(sum(seconds[:payoff_index]) / runtime, 4)
    return data


def build_voice_visual_lock(data: dict) -> list[dict]:
    result: list[dict] = []
    registry = data["characters"]
    last_actor_atom: dict[str, str] = {}
    for index, scene in enumerate(data["scenes"], start=1):
        atom_id = f"A{index:03d}"
        text_exact = scene["voiceover"]["text"].rstrip("\n")
        tag_only = bool(validator.TAG_RE.findall(text_exact)) and not validator.TAG_RE.sub("", text_exact).strip()
        if tag_only:
            kind = "CONTROL"
            claims: list[dict] = []
        elif scene["type"] == "narrative_card":
            kind = "CARD"
            claims = []
        else:
            kind = "EVENT"
            atomic = scene["continuity"]["atomic_action"]
            actor_id = atomic["actor_id"] if atomic["actor_id"] in registry or atomic["actor_id"] in validator.SPECIAL_SEMANTIC_IDS else "none"
            receiver_id = atomic["target_id"] if atomic["target_id"] in registry else "none"
            source_id = actor_id if actor_id in registry else ("environment" if actor_id == "environment" else "none")
            participants = []
            for value in (actor_id, source_id, receiver_id):
                if value in registry and value not in participants:
                    participants.append(value)
            direction = f"{source_id}->{receiver_id}" if source_id in registry and receiver_id in registry and source_id != receiver_id else "none"
            resolved_from = (
                last_actor_atom.get(actor_id)
                if actor_id in registry and validator.SPANISH_INHERITED_SUBJECT_RE.search(validator.strip_tags(text_exact))
                else None
            )
            claims = [{
                "atom_id": atom_id,
                "actor_id": actor_id,
                "action": atomic["verb"],
                "receiver_or_target_id": receiver_id,
                "source_id": source_id,
                "direction": direction,
                "result": atomic["result"],
                "causal_participants": participants,
                "required_visual_tokens": [],
                "resolved_from_atom_id": resolved_from,
            }]
        must_show = validator._ordered_unique(
            value
            for claim in claims
            for value in claim["causal_participants"]
        )
        policy = {
            "mode": "FORBIDDEN",
            "allowed_ids": [],
            "reason": "all causal participants are visible" if claims else "",
        }
        packet_claims = [
            {key: copy.deepcopy(value) for key, value in claim.items() if key != "atom_id"}
            for claim in claims
        ]
        result.append({
            "atom_id": atom_id,
            "text_exact": text_exact,
            "kind": kind,
            "claims": packet_claims,
            "must_show": must_show,
            "offscreen_policy": policy,
        })
        if scene["type"] == "panel":
            scene["continuity"]["voice_facts"] = copy.deepcopy(claims)
            scene["continuity"]["must_show"] = list(must_show)
            scene["continuity"]["offscreen_policy"] = copy.deepcopy(policy)
        for claim in claims:
            if claim["actor_id"] in registry:
                last_actor_atom[claim["actor_id"]] = atom_id
    return result


def attach_packet(data: dict, extra_state_contract: dict | None = None) -> tuple[dict, list[dict], bytes]:
    monologue = data["tts_export"]["full_script"]
    voice_visual_lock = build_voice_visual_lock(data)
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
            "dog.threat": {
                "initial": "trapped",
                "changes": [{
                    "beat_id": "B07",
                    "to": "collapsed",
                    "caused_by": "the impact breaks its plated body and ends the attack",
                }],
            },
        },
        "voice_visual_lock": voice_visual_lock,
    }
    if extra_state_contract:
        machine["state_contract"].update(copy.deepcopy(extra_state_contract))
    story_beats_text = "\n".join(f"- beat_id: {beat_id}" for beat_id in beat_order)
    packet_text = (
        "# STORY_PACKET_V5.3\n\n## META\n\n- handoff_version: \"5.3\"\n- packet_id: serie_prueba_parte_01_v5_3\n"
        "- approved_voice_id: voice_real_12345\n\n## MACHINE_LOCK_V5_3\n\n```json\n"
        + json.dumps(machine, ensure_ascii=False, indent=2)
        + "\n```\n\n## PREMISA COMERCIAL\n\nFixture premise.\n\n## CANON NECESARIO\n\nFixture canon.\n\n"
        + "## PRESUPUESTO DE REVELACIONES\n\nFixture reveals.\n\n## CONTRATO DE LA PARTE\n\nFixture part contract.\n\n"
        + "## DIRECCION VISUAL SEMILLA\n\nFixture visual direction.\n\n## FIRMAS VISUALES Y ROLES\n\nFixture signatures.\n\n"
        + "## MAPA DE INTERPRETACION Y CONTINUIDAD\n\nFixture continuity.\n\n## MONOLOGO_LOCKED\n\n```text\n"
        + monologue
        + "\n```\n\n## HANDOFF_NARRATIVO_V5_3\n\nLocked.\n\n### COLD_VIEWER_CONTRACT\n\n- hook_promise: fixture\n- danger_known_by_beat: B03\n\n"
        + "### CONTINUITY_LEDGER\n\n- entities: fixture\n- state_changes: fixture\n\n### STORY_BEATS\n\n"
        + story_beats_text
        + "\n\n### REVEAL_LOCKS\n\n- revealed_this_part: fixture\n- suspected_only: fixture\n- forbidden_to_confirm: fixture\n\n"
        + "### DIRECTOR_BOUNDARY\n\n- immutable: fixture\n- director_may_choose: fixture\n- director_must_not_imply: fixture\n\n## QA_SHOWRUNNER\n\nPASS.\n"
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


def build_manifest(data: dict, asset_id: str, pose_id: str) -> tuple[dict, list[dict], bytes]:
    asset = data["characters"][asset_id]
    pose = asset["poses"][pose_id]
    manifest_data = {
        "manifest_id": "serie_prueba_through_p00_asset_manifest_v5_3",
        "manifest_version": "5.3",
        "series_id": "serie_prueba",
        "through_part": 0,
        "assets": [{
            "id": asset_id,
            "asset_type": asset["asset_type"],
            "prompt_signature": asset["prompt_signature"],
            **({"transparent": asset["transparent"]} if "transparent" in asset else {}),
            "poses": [{
                "pose": pose_id,
                "pose_role": pose["pose_role"],
                "asset": pose["asset"],
            }],
        }],
        "escenarios": [],
    }
    raw = json.dumps(manifest_data, ensure_ascii=False, indent=2).encode("utf-8")
    manifest, issues = validator.parse_asset_manifest(raw, Path("EXISTING_ASSET_MANIFEST_V5_3.json"))
    return manifest, issues, raw


class ValidatorV53Tests(unittest.TestCase):
    def validate(self, data: dict) -> dict:
        packet, packet_issues, _ = attach_packet(data)
        return validator.validate(data, Path("fixture.json"), packet, packet_issues)

    def test_golden_contract_releases(self) -> None:
        report = self.validate(make_valid_data())
        self.assertEqual(report["validator_version"], "5.3.7")
        if report["preflight_status"] != "PROMPT_RELEASE":
            self.fail(json.dumps(report["errors"], ensure_ascii=False, indent=2))

    def test_golden_literal_hook_death_and_inheritance_releases(self) -> None:
        report = self.validate(make_literal_hook_data())
        if report["preflight_status"] != "PROMPT_RELEASE":
            self.fail(json.dumps(report["errors"], ensure_ascii=False, indent=2))

    def test_hook_cannot_replace_narrated_villain_and_inheritance_with_reaction(self) -> None:
        data = make_literal_hook_data()
        packet, packet_issues, _ = attach_packet(data)
        self.assertEqual(packet_issues, [])
        panels = [scene for scene in data["scenes"] if scene["type"] == "panel"]
        death, inheritance = panels[:2]
        death["continuity"].update({
            "visible_entities": ["seo"],
            "atomic_action": {
                "actor_id": "seo", "verb": "faces", "target_id": "state_threat", "origin": "screen_front",
                "trajectory_or_contact": "line of sight", "destination": "seo", "result": "seo_reacts",
            },
            "voice_facts": [{
                "atom_id": "A001", "actor_id": "seo", "action": "faces", "receiver_or_target_id": "none",
                "source_id": "seo", "direction": "none", "result": "seo_reacts", "causal_participants": ["seo"],
                "required_visual_tokens": [], "resolved_from_atom_id": None,
            }],
            "must_show": ["seo"],
            "offscreen_policy": {"mode": "FORBIDDEN", "allowed_ids": [], "reason": ""},
        })
        death["references"] = {"characters": [{"id": "seo", "pose": "performance"}], "escenario": {"id": "urban_tunnel", "view": "front_eye"}}
        death["visual_plan"].update({
            "dominant_subject_id": "seo", "high_tension": False,
            "performances": [{"entity_id": "seo", "mode": "NONE", "eyes_brows": "", "mouth_jaw": "", "body_cue": "", "reaction_to": None}],
        })
        death["visual"]["image_prompt"] = make_prompt(death["visual_plan"], 0)

        inheritance["continuity"].update({
            "visible_entities": ["seo"],
            "atomic_action": {
                "actor_id": "environment", "verb": "enters", "target_id": "inheritance_glow", "origin": "hidden_source",
                "trajectory_or_contact": "red-black glow enters chest", "destination": "seo", "result": "seo_recoils",
            },
            "voice_facts": [{
                "atom_id": "A003", "actor_id": "environment", "action": "enters", "receiver_or_target_id": "seo",
                "source_id": "environment", "direction": "none", "result": "seo_recoils", "causal_participants": ["seo"],
                "required_visual_tokens": [], "resolved_from_atom_id": None,
            }],
            "must_show": ["seo"],
            "offscreen_policy": {"mode": "FORBIDDEN", "allowed_ids": [], "reason": ""},
        })
        inheritance["references"] = {"characters": [{"id": "seo", "pose": "performance"}]}
        inheritance["visual_plan"].update({
            "dominant_subject_id": "seo", "high_tension": False,
            "performances": [{"entity_id": "seo", "mode": "NONE", "eyes_brows": "", "mouth_jaw": "", "body_cue": "", "reaction_to": None}],
        })
        inheritance["visual"]["image_prompt"] = make_prompt(inheritance["visual_plan"], 1)
        report = validator.validate(data, Path("bad_hook.json"), packet, packet_issues)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("SCENE_VOICE_FACTS_LOCK_MISMATCH", codes)
        self.assertIn("SCENE_MUST_SHOW_LOCK_MISMATCH", codes)
        self.assertIn("VOICE_ENTITY_NOT_VISIBLE", codes)
        self.assertIn("VOICE_ENTITY_NOT_REFERENCED", codes)
        self.assertIn("VOICE_ENTITY_NOT_IN_PROMPT", codes)
        self.assertIn("VOICE_ACTOR_REPLACED_BY_ENVIRONMENT", codes)
        self.assertIn("VOICE_ATOMIC_ACTION_SUBSTITUTED", codes)
        self.assertEqual(report["preflight_status"], "PROMPT_REPAIR_REQUIRED")

    def test_elided_subject_requires_prior_atom_resolution(self) -> None:
        data = make_literal_hook_data()
        packet, packet_issues, _ = attach_packet(data)
        second_panel = [scene for scene in data["scenes"] if scene["type"] == "panel"][1]
        claim = packet["machine_lock"]["voice_visual_lock"][2]["claims"][0]
        self.assertEqual(claim["resolved_from_atom_id"], "A001")
        claim["resolved_from_atom_id"] = None
        second_panel["continuity"]["voice_facts"][0]["resolved_from_atom_id"] = None
        report = validator.validate(data, Path("missing_resolution.json"), packet, packet_issues)
        self.assertIn("VOICE_PRONOUN_RESOLUTION_MISSING", {item["code"] for item in report["errors"]})

    def test_unregistered_physical_token_is_required_in_prompt(self) -> None:
        data = make_valid_data()
        packet, packet_issues, _ = attach_packet(data)
        panel = next(scene for scene in data["scenes"] if scene["type"] == "panel")
        atom_id = panel["continuity"]["voice_facts"][0]["atom_id"]
        packet_claim = next(
            item["claims"][0]
            for item in packet["machine_lock"]["voice_visual_lock"]
            if item["atom_id"] == atom_id
        )
        packet_claim["required_visual_tokens"] = ["falling column"]
        panel["continuity"]["voice_facts"][0]["required_visual_tokens"] = ["falling column"]
        report = validator.validate(data, Path("missing_column.json"), packet, packet_issues)
        self.assertIn("VOICE_REQUIRED_VISUAL_TOKEN_NOT_IN_PROMPT", {item["code"] for item in report["errors"]})

    def test_packet_rejects_reversed_source_receiver_direction(self) -> None:
        data = make_literal_hook_data()
        packet, packet_issues, _ = attach_packet(data)
        self.assertEqual(packet_issues, [])
        lock = copy.deepcopy(packet["machine_lock"]["voice_visual_lock"])
        inheritance = next(item for item in lock if item["text_exact"] == "Pero antes me eligió como heredero.")
        inheritance["claims"][0]["direction"] = "seo->kang"
        issues: list[dict] = []
        validator.validate_voice_visual_lock(lock, packet["segmentability"], issues)
        self.assertIn("VOICE_DIRECTION_NOT_CANONICAL", {item["code"] for item in issues})

    def test_explicit_registered_name_cannot_be_omitted_from_claims(self) -> None:
        data = make_valid_data()
        signature = "pale Korean man with long black hair dark prison outfit"
        data["characters"]["kang"] = {
            "display_name": "Kang Muyeol",
            "asset_type": "human",
            "prompt_signature": signature,
            "poses": {
                "base": {
                    "mode": "generate", "asset": "assets/characters/serie_prueba/kang_base.png",
                    "pose_role": "base", "prompt": human_base_prompt(signature),
                }
            },
        }
        first = next(scene for scene in data["scenes"] if scene["type"] == "panel")
        first["voiceover"]["text"] = "Kang Muyeol murió frente a Seo Jun.\n"
        data["tts_export"]["full_script"] = "\n".join(scene["voiceover"]["text"] for scene in data["scenes"])
        seconds = [validator.spoken_words(scene["voiceover"]["text"]) * 60 / (150 * 1.4) for scene in data["scenes"]]
        runtime = round(sum(seconds), 3)
        payoff_id = data["editing"]["timing_budget"]["payoff_scene_id"]
        payoff_index = next(index for index, scene in enumerate(data["scenes"]) if scene["id"] == payoff_id)
        data["editing"]["timing_budget"]["runtime_estimate_sec"] = runtime
        data["editing"]["timing_budget"]["payoff_start_pct"] = round(sum(seconds[:payoff_index]) / runtime, 4)
        report = self.validate(data)
        self.assertIn("VOICE_NAMED_ENTITY_OMITTED", {item["code"] for item in report["errors"]})

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

    def test_stripping_voiceover_breaks_locked_blank_line_reconstruction(self) -> None:
        data = make_valid_data()
        packet, packet_issues, _ = attach_packet(data)
        for scene in data["scenes"]:
            scene["voiceover"]["text"] = scene["voiceover"]["text"].strip()
        data["tts_export"]["full_script"] = "\n".join(
            scene["voiceover"]["text"] for scene in data["scenes"]
        )
        report = validator.validate(data, Path("fixture.json"), packet, packet_issues)
        self.assertIn("FULL_SCRIPT_PACKET_MISMATCH", {item["code"] for item in report["errors"]})

    def test_blank_line_lf_must_stay_on_left_voiceover_boundary(self) -> None:
        data = make_valid_data()
        packet, packet_issues, _ = attach_packet(data)
        left = data["scenes"][0]["voiceover"]
        right = data["scenes"][1]["voiceover"]
        self.assertTrue(left["text"].endswith("\n"))
        left["text"] = left["text"][:-1]
        right["text"] = "\n" + right["text"]
        data["tts_export"]["full_script"] = "\n".join(
            scene["voiceover"]["text"] for scene in data["scenes"]
        )
        self.assertEqual(data["tts_export"]["full_script"], packet["monologue"])
        report = validator.validate(data, Path("fixture.json"), packet, packet_issues)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("VOICEOVER_BOUNDARY_LF_INVALID", codes)
        self.assertIn("VOICEOVER_LEADING_LF", codes)

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

    def test_existing_pose_requires_exact_manifest_and_hash(self) -> None:
        data = make_valid_data()
        data["characters"]["seo"]["poses"]["base"]["mode"] = "existing"
        packet, packet_issues, _ = attach_packet(data)
        missing = validator.validate(data, Path("fixture.json"), packet, packet_issues)
        self.assertIn("MANIFEST_REQUIRED_FOR_EXISTING", {item["code"] for item in missing["errors"]})

        manifest, manifest_issues, raw = build_manifest(data, "seo", "base")
        self.assertFalse(manifest_issues)
        data["production_lock"]["asset_manifest_sha256"] = validator.sha256_hex(raw)
        passed = validator.validate(data, Path("fixture.json"), packet, packet_issues, manifest, manifest_issues)
        if passed["preflight_status"] != "PROMPT_RELEASE":
            self.fail(json.dumps(passed["errors"], ensure_ascii=False, indent=2))

        data["production_lock"]["asset_manifest_sha256"] = "0" * 64
        mismatch = validator.validate(data, Path("fixture.json"), packet, packet_issues, manifest, manifest_issues)
        self.assertIn("ASSET_MANIFEST_HASH_MISMATCH", {item["code"] for item in mismatch["errors"]})

    def test_asset_manifest_rejects_duplicate_top_level_asset_id(self) -> None:
        data = make_valid_data()
        _, _, raw = build_manifest(data, "seo", "base")
        manifest_data = json.loads(raw)
        manifest_data["assets"].append({
            "id": "seo",
            "asset_type": "human",
            "prompt_signature": "middle aged Korean man silver hair black formal coat",
            "poses": [{
                "pose": "performance",
                "pose_role": "performance",
                "asset": "assets/characters/serie_prueba/seo/performance.png",
            }],
        })
        duplicate_raw = json.dumps(manifest_data, ensure_ascii=False).encode("utf-8")
        _, issues = validator.parse_asset_manifest(duplicate_raw, Path("duplicate_asset.json"))
        self.assertIn("MANIFEST_ASSET_ID_DUPLICATE", {item["code"] for item in issues})

    def test_asset_manifest_rejects_duplicate_top_level_scenario_id(self) -> None:
        data = make_valid_data()
        _, _, raw = build_manifest(data, "seo", "base")
        manifest_data = json.loads(raw)
        manifest_data["escenarios"] = [
            {
                "id": "tunnel",
                "views": [{"view": "front", "view_type": "master", "asset": "assets/scenarios/front.png"}],
            },
            {
                "id": "tunnel",
                "views": [{"view": "rear", "view_type": "reverse", "asset": "assets/scenarios/rear.png"}],
            },
        ]
        duplicate_raw = json.dumps(manifest_data, ensure_ascii=False).encode("utf-8")
        _, issues = validator.parse_asset_manifest(duplicate_raw, Path("duplicate_scenario.json"))
        self.assertIn("MANIFEST_SCENARIO_ID_DUPLICATE", {item["code"] for item in issues})

    def test_forced_tension_cannot_be_declared_neutral(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene["type"] == "panel" and scene["visual_plan"]["beat"] == "DECISION"
        )
        panel["visual_plan"]["high_tension"] = False
        panel["visual_plan"]["performances"][0].update({
            "mode": "NONE", "eyes_brows": "", "mouth_jaw": "", "body_cue": "", "reaction_to": None,
        })
        panel["references"]["characters"][0]["pose"] = "base"
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("HIGH_TENSION_SEMANTIC_REQUIRED", codes)
        self.assertIn("FORCED_TENSION_HUMAN_NEUTRAL", codes)

    def test_creature_cannot_reuse_trapped_pose_through_action(self) -> None:
        data = make_valid_data()
        for panel in data["scenes"]:
            if panel.get("type") != "panel" or panel["visual_plan"]["action"]["phase"] == "NONE":
                continue
            for ref in panel.get("references", {}).get("assets", []):
                if ref.get("id") == "dog":
                    ref["pose"] = "trapped"
        report = self.validate(data)
        self.assertIn("CREATURE_PHASE_ROLE_MISMATCH", {item["code"] for item in report["errors"]})

    def test_static_prompt_cannot_fake_action_phase(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel" and scene["visual_plan"]["action"]["phase"] == "ANTICIPATION"
        )
        panel["visual"]["image_prompt"] = panel["visual"]["image_prompt"].replace("coils and prepares before impact", "stands still")
        report = self.validate(data)
        self.assertIn("ANTICIPATION_PROMPT_EVIDENCE_INVALID", {item["code"] for item in report["errors"]})

    def test_true_long_requires_literal_measurable_scale_anchor(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel" and scene["visual_plan"]["shot_scale"] == "TRUE_LONG"
        )
        anchor = panel["visual_plan"]["scale_anchor"]
        panel["visual_plan"]["scale_anchor"] = ""
        panel["visual"]["image_prompt"] = panel["visual"]["image_prompt"].replace(anchor + ".", "")
        report = self.validate(data)
        self.assertIn("SCALE_ANCHOR_INVALID", {item["code"] for item in report["errors"]})

    def test_asset_base_and_plate_cannot_bake_scene(self) -> None:
        data = make_valid_data()
        data["characters"]["seo"]["poses"]["base"]["prompt"] += " Rain inside a tunnel."
        data["escenarios"]["urban_tunnel"]["views"]["front_eye"]["prompt"] = "A tunnel with several workers at night."
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("POSE_ENVIRONMENT_FORBIDDEN", codes)
        self.assertIn("VIEW_EMPTY_PLATE_FORMULA", codes)

    def test_generate_asset_and_view_require_self_contained_manhwa_style(self) -> None:
        data = make_valid_data()
        data["characters"]["seo"]["poses"]["base"]["prompt"] = data["characters"]["seo"]["poses"]["base"]["prompt"].replace(
            asset_style("character"),
            "",
        )
        data["escenarios"]["urban_tunnel"]["views"]["front_eye"]["prompt"] = data["escenarios"]["urban_tunnel"]["views"]["front_eye"]["prompt"].replace(
            "Korean manhwa webtoon background illustration, 2D flat cel shading, crisp inked lineart, painted environment.",
            "",
        )
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("ASSET_STYLE_ANCHOR_MISSING", codes)
        self.assertIn("VIEW_STYLE_ANCHOR_MISSING", codes)

    def test_style_anchor_variants_are_type_specific_including_ui(self) -> None:
        self.assertTrue(validator.generated_asset_style_valid(asset_style("character"), "human"))
        self.assertTrue(validator.generated_asset_style_valid(asset_style("creature"), "creature"))
        self.assertTrue(validator.generated_asset_style_valid(asset_style("prop"), "prop"))
        self.assertTrue(validator.generated_asset_style_valid(asset_style("container"), "container"))
        self.assertTrue(validator.generated_asset_style_valid(asset_style("ui"), "ui"))
        self.assertFalse(validator.generated_asset_style_valid(asset_style("character"), "prop"))
        self.assertFalse(validator.generated_asset_style_valid(asset_style("prop"), "ui"))
        self.assertTrue(
            validator.generated_view_style_valid(
                "Hand-drawn Korean manhwa webtoon background illustration, 2D controlled cel shading, painted environment."
            )
        )

    def test_prop_handle_is_not_misread_as_a_human_hand(self) -> None:
        data = make_valid_data()
        signature = "compact red industrial scanner with one cracked black handle"
        data["characters"]["scanner"] = {
            "display_name": "Industrial Scanner",
            "asset_type": "prop",
            "prompt_signature": signature,
            "poses": {
                "base": {
                    "mode": "generate",
                    "asset": "assets/characters/serie_prueba/scanner_base.png",
                    "pose_role": "base",
                    "prompt": (
                        f"{signature}. Exactly one object, complete object fully visible, unheld, clean and dry, "
                        f"orthographic front eye-level view, even studio illumination. {studio_isolation('prop')} No hands, no people, no effects."
                    ),
                }
            },
        }
        report = self.validate(data)
        if report["preflight_status"] != "PROMPT_RELEASE":
            self.fail(json.dumps(report["errors"], ensure_ascii=False, indent=2))

    def test_transparent_container_binds_exact_occupant_identity(self) -> None:
        data = make_valid_data()
        capsule_signature = "transparent reinforced cylindrical containment capsule with steel collar"
        data["characters"]["capsule"] = {
            "display_name": "Containment Capsule",
            "asset_type": "container",
            "transparent": True,
            "prompt_signature": capsule_signature,
            "poses": {
                "base": {
                    "mode": "generate",
                    "asset": "assets/characters/serie_prueba/capsule_base.png",
                    "pose_role": "base",
                    "prompt": (
                        f"Exactly one object, {capsule_signature}, complete object fully visible, isolated and empty, clean and dry, "
                        f"orthographic front eye-level view, even studio illumination. {studio_isolation('container')}"
                    ),
                }
            },
        }
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel"
            and scene["visual_plan"]["dominant_subject_id"] == "seo"
            and scene["visual_plan"]["shot_scale"] not in {"TRUE_LONG"}
        )
        panel["references"].setdefault("assets", []).append({"id": "capsule", "pose": "base"})
        panel["continuity"]["visible_entities"].append("capsule")
        panel["continuity"]["state_before"]["capsule.occupants"] = ["seo"]
        panel["continuity"]["state_after"]["capsule.occupants"] = ["seo"]
        panel["visual"]["image_prompt"] += f" The {capsule_signature} stands nearby. {SIGNATURES['mira']} is the only person inside the transparent container."
        packet, packet_issues, _ = attach_packet(data, {
            "capsule.occupants": {"initial": ["seo"], "changes": []},
        })
        report = validator.validate(data, Path("fixture.json"), packet, packet_issues)
        self.assertIn("CONTAINER_OCCUPANT_IDENTITY_PROMPT_MISSING", {item["code"] for item in report["errors"]})

    def test_atomic_registered_physical_target_must_be_visible_referenced_and_prompted(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel"
            and scene["continuity"]["atomic_action"]["actor_id"] == "seo"
            and "mira" not in scene["continuity"]["visible_entities"]
        )
        panel["continuity"]["atomic_action"].update({
            "verb": "pulls",
            "target_id": "mira",
            "trajectory_or_contact": "hand contact pulls her arm",
        })
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertTrue({
            "ATOMIC_TARGET_NOT_VISIBLE",
            "ATOMIC_TARGET_NOT_REFERENCED",
            "ATOMIC_TARGET_NOT_IN_PROMPT",
        }.issubset(codes))
        self.assertFalse(report["preflight_gates"]["semantic_alignment"])

    def test_atomic_registered_actor_must_be_visible_referenced_and_prompted(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel"
            and scene["continuity"]["atomic_action"]["actor_id"] == "seo"
            and "mira" not in scene["continuity"]["visible_entities"]
        )
        panel["continuity"]["atomic_action"].update({"actor_id": "mira", "verb": "reaches"})
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertTrue({
            "ATOMIC_ACTOR_NOT_VISIBLE",
            "ATOMIC_ACTOR_NOT_REFERENCED",
            "ATOMIC_ACTOR_NOT_IN_PROMPT",
        }.issubset(codes))

    def test_atomic_action_verb_and_unregistered_actor_noun_need_prompt_evidence(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel" and scene["visual_plan"]["shot_scale"] == "MEDIUM"
        )
        panel["continuity"]["atomic_action"].update({
            "actor_id": "damaged_column",
            "verb": "falls",
            "target_id": "floor",
            "trajectory_or_contact": "concrete drops toward the floor",
        })
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("ATOMIC_ACTOR_NOUN_NOT_IN_PROMPT", codes)
        self.assertIn("ATOMIC_VERB_NOT_EVIDENCED", codes)

    def test_generated_view_must_be_used_and_master_reanchors_when_slot_exists(self) -> None:
        data = make_valid_data()
        data["escenarios"]["urban_tunnel"]["views"]["unused_high"] = {
            "mode": "generate",
            "asset": "assets/escenarios/serie_prueba/urban_tunnel_unused_high.png",
            "view_type": "plate",
            "prompt": (
                "Empty environment plate, no people, no creatures, no vehicles, no readable text. "
                "Reinforced urban tunnel at rainy midnight, wide master, high-angle, side view; "
                "amber work light from screen-left. Korean manhwa webtoon background illustration, "
                "2D flat cel shading, crisp inked lineart, painted environment."
            ),
        }
        master = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel"
            and scene["visual_plan"]["shot_scale"] in {"WIDE_MASTER", "TRUE_LONG"}
            and scene["references"].get("escenario")
            and validator.reference_count(scene["references"]) < 3
        )
        del master["references"]["escenario"]
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("GENERATED_SCENARIO_VIEW_UNUSED", codes)
        self.assertIn("MASTER_SCENARIO_REANCHOR_REQUIRED", codes)

    def test_human_pose_cannot_pantomime_or_hide_required_weapon(self) -> None:
        data = make_valid_data()
        pose = data["characters"]["seo"]["poses"]["performance"]
        pose["prompt"] += " He raises one empty hand as if holding a rifle."
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("HUMAN_POSE_IMPLIED_PROP", codes)
        self.assertIn("HUMAN_POSE_PROP_NOT_VISIBLE", codes)

    def test_group_surround_action_requires_count_and_distinct_formation(self) -> None:
        data = make_valid_data()
        panel = next(
            scene for scene in data["scenes"]
            if scene.get("type") == "panel"
            and {"seo", "dog"}.issubset(set(scene["continuity"]["visible_entities"]))
        )
        panel["continuity"]["atomic_action"].update({
            "actor_id": "seo",
            "verb": "surround",
            "target_id": "dog",
            "trajectory_or_contact": "agents form a ring around the target",
            "result": "target is enclosed by a circle",
        })
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("GROUP_CARDINALITY_MISSING", codes)
        self.assertIn("GROUP_FORMATION_NOT_EVIDENCED", codes)

    def test_unused_generated_derived_pose_is_rejected(self) -> None:
        data = make_valid_data()
        unused = copy.deepcopy(data["characters"]["seo"]["poses"]["performance"])
        unused["asset"] = "assets/characters/serie_prueba/seo_unused_pose.png"
        data["characters"]["seo"]["poses"]["unused_pose"] = unused
        report = self.validate(data)
        self.assertIn("GENERATED_DERIVED_POSE_UNUSED", {item["code"] for item in report["errors"]})

    def test_severe_prompt_ambiguities_are_rejected(self) -> None:
        data = make_valid_data()
        panels = [scene for scene in data["scenes"] if scene.get("type") == "panel"]
        panels[0]["visual"]["image_prompt"] += " Violet force leaks from a hidden source."
        panels[1]["visual"]["image_prompt"] += " The worker arches transparent capsule."
        report = self.validate(data)
        codes = {item["code"] for item in report["errors"]}
        self.assertIn("AMBIGUOUS_HIDDEN_SOURCE", codes)
        self.assertIn("CONTAINER_RELATION_PREPOSITION_MISSING", codes)

    def test_packet_requires_complete_heading_and_handoff_structure(self) -> None:
        data = make_valid_data()
        _, _, raw = attach_packet(data)
        broken = raw.replace(b"## QA_SHOWRUNNER", b"## UNKNOWN")
        _, issues = validator.parse_story_packet(broken, Path("broken.md"))
        self.assertIn("PACKET_HEADINGS_INVALID", {item["code"] for item in issues})

    def test_production_p1_packet_machine_lock_parses_and_hashes(self) -> None:
        packet_path = VALIDATOR_PATH.parents[1] / "STORY_PACKET_P1_PRODUCTION_V5_3.md"
        packet, issues = validator.parse_story_packet(packet_path.read_bytes(), packet_path)
        self.assertEqual(issues, [])
        self.assertEqual(
            packet["monologue_sha256"],
            packet["machine_lock"]["monologue_sha256"],
        )
        self.assertTrue(packet["segmentability"]["segmentable"])
        self.assertEqual(packet["segmentability"]["max_atom_words"], 15)
        self.assertEqual(packet["segmentability"]["tag_only_atom_count"], 1)

    def test_story_packet_rejects_crlf_instead_of_normalizing_it_silently(self) -> None:
        packet_path = VALIDATOR_PATH.parents[1] / "STORY_PACKET_P1_PRODUCTION_V5_3.md"
        raw = packet_path.read_bytes()
        crlf = raw.replace(b"\n", b"\r\n")
        _, issues = validator.parse_story_packet(crlf, Path("packet_crlf.md"))
        self.assertIn("PACKET_NEWLINE_NOT_LF", {item["code"] for item in issues})

    def test_story_packet_blocks_an_18_word_atom_before_director(self) -> None:
        packet_path = VALIDATOR_PATH.parents[1] / "STORY_PACKET_P1_PRODUCTION_V5_3.md"
        raw = packet_path.read_bytes()
        broken = raw.replace(
            "columna.\n\nUna grieta morada".encode("utf-8"),
            "columna. Una grieta morada".encode("utf-8"),
            1,
        )
        packet, issues = validator.parse_story_packet(broken, Path("broken_segment.md"))
        codes = {item["code"] for item in issues}
        self.assertIn("MONOLOGUE_ATOM_UNSEGMENTABLE", codes)
        failed = [
            item
            for item in packet["segmentability"]["atoms"]
            if item["words"] == 18
        ]
        self.assertEqual(len(failed), 1)
        self.assertEqual(failed[0]["eligible_windows"], [])
        self.assertFalse(packet["segmentability"]["segmentable"])

    def test_segmentability_accepts_authorized_tag_only_control_but_not_unknown_tag(self) -> None:
        valid = validator.analyze_monologue_segmentability("Dos palabras.\n\n[pause]\n\nOtras dos.")
        self.assertTrue(valid["segmentable"])
        self.assertEqual(valid["tag_only_atom_count"], 1)
        invalid = validator.analyze_monologue_segmentability("Dos palabras.\n\n[misterioso]\n\nOtras dos.")
        self.assertFalse(invalid["segmentable"])
        self.assertEqual(invalid["failures"][0]["code"], "MONOLOGUE_ATOM_TAG_UNKNOWN")

    def test_segmentability_enforces_exact_lf_atoms_and_one_tag_only_control(self) -> None:
        internal_lf = validator.analyze_monologue_segmentability("Dos palabras.\nOtras dos.")
        self.assertIn("MONOLOGUE_SEPARATOR_INVALID", {item["code"] for item in internal_lf["failures"]})

        extra_lf = validator.analyze_monologue_segmentability("Dos palabras.\n\n\nOtras dos.")
        self.assertIn("MONOLOGUE_SEPARATOR_INVALID", {item["code"] for item in extra_lf["failures"]})

        multiple_tags = validator.analyze_monologue_segmentability(
            "Dos palabras.\n\n[pause][low]\n\nOtras dos."
        )
        self.assertIn(
            "MONOLOGUE_ATOM_TAG_ONLY_MULTIPLE",
            {item["code"] for item in multiple_tags["failures"]},
        )

        trailing_space = validator.analyze_monologue_segmentability("Dos palabras. \n\nOtras dos.")
        self.assertIn("MONOLOGUE_TRAILING_WHITESPACE", {item["code"] for item in trailing_space["failures"]})

    def test_packet_only_cli_is_fail_closed_on_unsegmentable_monologue(self) -> None:
        packet_path = VALIDATOR_PATH.parents[1] / "STORY_PACKET_P1_PRODUCTION_V5_3.md"
        broken = packet_path.read_bytes().replace(
            "columna.\n\nUna grieta morada".encode("utf-8"),
            "columna. Una grieta morada".encode("utf-8"),
            1,
        )
        with tempfile.TemporaryDirectory() as directory:
            broken_path = Path(directory) / "broken_packet.md"
            broken_path.write_bytes(broken)
            completed = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), "--packet-only", str(broken_path)],
                check=False,
                text=True,
                capture_output=True,
                encoding="utf-8",
                env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
        self.assertEqual(completed.returncode, 1)
        self.assertNotIn("Traceback", completed.stderr + completed.stdout)
        report = json.loads(completed.stdout)
        self.assertEqual(report["preflight_status"], "BLOCKED_CANON")
        self.assertIn("MONOLOGUE_ATOM_UNSEGMENTABLE", {item["code"] for item in report["errors"]})


if __name__ == "__main__":
    unittest.main()
