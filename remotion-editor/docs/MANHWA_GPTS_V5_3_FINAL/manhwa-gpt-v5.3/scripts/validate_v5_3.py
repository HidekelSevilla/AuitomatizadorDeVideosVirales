#!/usr/bin/env python3
"""Validador canónico fail-closed para contratos manhwa V5.3.

Uso:
    python validate_v5_3.py proyecto.json STORY_PACKET.md [EXISTING_ASSET_MANIFEST.json]
    python validate_v5_3.py --packet-only STORY_PACKET.md

No usa dependencias externas. Siempre imprime un reporte JSON. Solo devuelve cero
cuando el preflight solicitado produce ``PACKET_READY`` en modo packet-only o
``PROMPT_RELEASE`` al validar el contrato completo.
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


VALIDATOR_VERSION = "5.3.7"
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
FORCED_TENSION_BEATS = {"THREAT", "DECISION", "MANIFESTATION", "ACTION", "PAYOFF", "COST", "CLIFFHANGER"}
FORCED_TENSION_PHASES = {"ANTICIPATION", "TRAJECTORY", "CONTACT", "CONSEQUENCE"}
ALLOWED_TAGS = {
    "pause",
    "low",
    "urgent",
    "strained",
    "impact",
    "cold",
    "tense",
    "shaken",
}

# Los mismos límites se usan al revisar el MONOLOGO_LOCKED y al validar las
# escenas terminadas. Mantener una sola tabla evita que el Showrunner apruebe
# un bloque que después ningún tipo de panel pueda alojar.
VOICE_WINDOW_LIMITS = {
    "card": (2, 7, 2.8),
    "fragment_or_reaction": (2, 9, 3.6),
    "action": (2, 8, 3.0),
    "standard": (5, 13, 4.3),
    "composite": (4, 14, 5.2),
    "master": (7, 16, 5.0),
}

GATE_NAMES = (
    "json_parse",
    "root_fields",
    "root_types_allowed",
    "production_lock",
    "story_packet_segmentability",
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
    "semantic_alignment",
    "voice_visual_lock",
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
    "story_packet_segmentability",
    "asset_manifest",
    "asset_registry",
    "scenario_registry",
    "scene_structure",
    "panel_card_rules",
    "references_valid_max_three",
    "full_script_exact",
    "tts_contract",
    "editing_contract",
    "voice_visual_lock",
}

VOICE_FACT_KINDS = {"EVENT", "STATE", "EXPOSITION", "CARD", "CONTROL"}
OFFSCREEN_MODES = {"FORBIDDEN", "ALLOWED_FILMABLE"}
VOICE_FACT_FIELDS = {
    "atom_id", "actor_id", "action", "receiver_or_target_id", "source_id",
    "direction", "result", "causal_participants", "required_visual_tokens", "resolved_from_atom_id",
}
PACKET_VOICE_CLAIM_FIELDS = VOICE_FACT_FIELDS - {"atom_id"}
OFFSCREEN_POLICY_FIELDS = {"mode", "allowed_ids", "reason"}
VOICE_LOCK_FIELDS = {"atom_id", "text_exact", "kind", "claims", "must_show", "offscreen_policy"}
SPECIAL_SEMANTIC_IDS = {"environment", "none"}

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
KOREAN_MANHWA_WEBTOON_RE = re.compile(
    r"\bkorean\b[\s\S]{0,40}\b(?:manhwa|webtoon)\b|"
    r"\b(?:manhwa|webtoon)\b[\s\S]{0,40}\bkorean\b",
    re.I,
)
TWO_D_RE = re.compile(r"\b2d\b|\b2-d\b|\btwo-dimensional\b", re.I)
CEL_SHADING_RE = re.compile(r"\b(?:flat |controlled |clean )?cel shading\b", re.I)
INKED_LINEART_RE = re.compile(
    r"\b(?:crisp|clean|controlled) (?:inked )?line ?art\b|\binked line ?art\b",
    re.I,
)
PAINTED_ENVIRONMENT_RE = re.compile(r"\bpainted (?:environment|background|scenery)\b", re.I)
PROP_DESIGN_RE = re.compile(
    r"\b(?:prop|object|container|device|weapon) (?:asset )?design\b|"
    r"\bdesign (?:for|of) (?:a |an )?(?:prop|object|container|device|weapon)\b",
    re.I,
)
INTERFACE_DESIGN_RE = re.compile(
    r"\b(?:interface|ui|system ui|hud) (?:asset )?design\b|"
    r"\bdesign (?:for|of) (?:an? )?(?:interface|ui|hud)\b",
    re.I,
)
BACKGROUND_ILLUSTRATION_RE = re.compile(
    r"\b(?:background|environment|scenery) illustration\b|"
    r"\billustrated (?:background|environment|scenery)\b",
    re.I,
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
    r"chooses?|crosses?|dies?|drives?|drops?|falls?|faces?|fires?|grabs?|holds?|hurls?|kneels?|launches?|leans?|lies?|"
    r"lifts?|looks?|lunges?|narrows?|opens?|pulls?|pushes?|reaches?|recognizes?|recoils?|rises?|runs?|shifts?|stands?|"
    r"remains?|steps?|strikes?|throws?|tightens?|turns?|watches?|whips?|widens?|wraps?)\b",
    re.I,
)
SPANISH_FUNCTION_RE = re.compile(
    r"\b(?:el|la|los|las|del|una?|unos|unas|que|porque|pero|mientras|hacia|desde|sobre|debajo|"
    r"dentro|fuera|personaje|escena|plano|fondo|noche|lluvia|mano|ojos)\b",
    re.I,
)
PROMPT_SIGNATURE_FORBIDDEN_RE = re.compile(
    r"\b(?:angry|afraid|fearful|scared|terrified|shocked|stunned|surprised|sad|happy|smiling|frowning|"
    r"crying|screaming|shouting|injured|wounded|bleeding|bloody|bruised|dirty|dusty|wet|soaked|"
    r"burned|burning|collapsed|fallen|trapped|charging|attacking|lunging|running|jumping|fighting|"
    r"striking|impact|recoiling|kneeling|lying|standing|sitting|holding|carrying|wielding|looking|"
    r"night|day|morning|evening|rain|snow|storm|tunnel|street|room|inside|outside|foreground|background)\b",
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
HIDDEN_SOURCE_RE = re.compile(
    r"\b(?:hidden|unseen|invisible|off[- ]frame) (?:source|origin)\b|"
    r"\b(?:source|origin) (?:is |remains? )?(?:hidden|unseen|invisible|off[- ]frame)\b",
    re.I,
)
CONTAINER_PREPOSITION_MISSING_RE = re.compile(
    r"\b(?:arches?|stands?|kneels?|recoils?|leans?|waits?|remains?)\s+"
    r"(?:an?\s+|the\s+)?(?:open\s+)?transparent\s+"
    r"(?:reinforced\s+|cylindrical\s+|containment\s+)*"
    r"(?:capsule|container)\b",
    re.I,
)
IMPLIED_PROP_RE = re.compile(
    r"\bas if\s+(?:he |she |they |the figure )?"
    r"(?:is |were |was )?(?:holding|gripping|aiming|wielding|carrying|using)\b",
    re.I,
)
PROP_ACTION_RE = re.compile(
    r"\b(?:holds?|holding|grips?|gripping|aims?|aiming|wields?|wielding|carries?|carrying|uses?|using)\b[\s\S]{0,50}"
    r"\b(?:rifle|gun|weapon|scanner|device)\b",
    re.I,
)
VISIBLE_PROP_RE = re.compile(
    r"\b(?:visible|physical|clearly shown)\b[\s\S]{0,30}\b(?:rifle|gun|weapon|scanner|device)\b|"
    r"\b(?:rifle|gun|weapon|scanner|device)\b[\s\S]{0,30}\b(?:is )?(?:visible|physical|clearly shown)\b",
    re.I,
)

PHYSICAL_TARGET_VERB_RE = re.compile(
    r"\b(?:pulls?|pushes?|grabs?|grips?|holds?|touches?|hits?|strikes?|slams?|"
    r"catches?|carries?|drags?|throws?|hurls?|bites?|shields?|surrounds?|encircles?|"
    r"pins?|presses?|kicks?|punches?|aims?)\b",
    re.I,
)
PHYSICAL_CONTACT_RE = re.compile(
    r"\b(?:physical contact|hand contact|body contact|grips?|pulls?|pushes?|hits?|impact|"
    r"touches?|presses?|against|into (?:his|her|their|the) (?:body|chest|arm|hand|shoulder))\b",
    re.I,
)
NONPHYSICAL_TARGET_RE = re.compile(
    r"\b(?:line of sight|without physical contact|without touch|voice|direct address|"
    r"viewer|off[- ]screen|offscreen|reflection|memory|screen result)\b",
    re.I,
)
GROUP_ACTION_RE = re.compile(
    r"\b(?:surrounds?|encircles?|circles?|forms? (?:a |the )?(?:ring|circle)|"
    r"closes? (?:a |the )?ring|swarms?|gathers? around)\b",
    re.I,
)
GROUP_NUMBER_PATTERN = r"(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve|[3-9]|1[0-2])"
GROUP_NOUN_PATTERN = r"(?:people|persons?|figures?|agents?|guards?|soldiers?|workers?|creatures?|monsters?)"
GROUP_COUNT_RE = re.compile(
    rf"\b{GROUP_NUMBER_PATTERN}\b(?:\s+[A-Za-z'-]+){{0,5}}\s+\b{GROUP_NOUN_PATTERN}\b|"
    rf"\b{GROUP_NOUN_PATTERN}\b[\s,]+(?:numbering\s+|counting\s+)?\b{GROUP_NUMBER_PATTERN}\b",
    re.I,
)
GROUP_FORMATION_RE = re.compile(
    r"\b(?:distinct|separate|individual)\b[\s\S]{0,35}\b(?:people|persons?|figures?|agents?|"
    r"guards?|soldiers?|workers?|creatures?|monsters?)\b|"
    r"\b(?:people|persons?|figures?|agents?|guards?|soldiers?|workers?|creatures?|monsters?)\b"
    r"[\s\S]{0,35}\b(?:ring|circle|around|surrounding|encircling)\b",
    re.I,
)
SPANISH_INHERITED_SUBJECT_RE = re.compile(
    r"^(?:\[[^\]]+\]\s*)?(?:pero|y|entonces|antes|luego|despu[eé]s)\b[\s\S]{0,80}"
    r"\b(?:me|nos|lo|la|los|las|le|les)\b",
    re.I,
)

ATOMIC_ID_NOISE = {
    "a", "an", "the", "state", "damaged", "damage", "connected", "copied", "inheritance",
    "purple", "violet", "red", "black", "active", "main", "new", "same", "future", "cost",
}
ATOMIC_CONCRETE_NOUNS = {
    "column", "wall", "door", "floor", "vehicle", "truck", "convoy", "car", "capsule", "container",
    "rifle", "weapon", "scanner", "device", "creature", "monster", "dog", "child", "boy", "girl",
    "person", "agent", "worker", "commander", "broom", "tape", "barrier", "building", "street",
}
VERB_EVIDENCE_ALIASES: dict[str, tuple[str, ...]] = {
    "dies": (r"\bdies?\b", r"\bdead\b", r"\bdeath\b", r"\bslumps? lifeless\b", r"\bstops? breathing\b"),
    "die": (r"\bdies?\b", r"\bdead\b", r"\bdeath\b", r"\bslumps? lifeless\b", r"\bstops? breathing\b"),
    "chooses": (
        r"\bchooses?\b", r"\bselects?\b", r"\bappoints?\b", r"\bnames?\b[\s\S]{0,30}\bheir\b",
        r"\btransfers?\b[\s\S]{0,40}\b(?:inheritance|power)\b",
    ),
    "chooses as heir": (
        r"\bchooses?\b[\s\S]{0,30}\bheir\b", r"\bselects?\b[\s\S]{0,30}\bheir\b",
        r"\btransfers?\b[\s\S]{0,40}\b(?:inheritance|power)\b",
    ),
    "transfers": (r"\btransfers?\b", r"\bpasses?\b[\s\S]{0,25}\b(?:power|inheritance)\b"),
    "enters": (
        r"\benters?\b",
        r"\b(?:advances?|moves?|rolls?|steps?)\s+into\b",
        r"\b(?:streams?|travels?|flows?)\b[\s\S]{0,35}\binto\b",
    ),
    "leads": (r"\bleads?\b", r"\b(?:at|from) the front\b", r"\bahead of\b"),
    "lies": (r"\bl(?:ie|ies|ying)\b", r"\bremains? (?:trapped|collapsed|on the ground)\b"),
    "coils": (r"\bcoils?\b", r"\barches?\b", r"\bgathers? force\b"),
    "sends": (r"\bsends?\b", r"\b(?:drives?|releases?|launches?)\b"),
    "drives": (r"\bdrives?\b", r"\battacks?\b", r"\b(?:pulse|force)\b[\s\S]{0,30}\b(?:into|toward|through)\b"),
    "flies": (r"\bfl(?:y|ies|ying)\b", r"\bfalls?\b", r"\bairborne\b", r"\b(?:thrown|hurled)\b"),
    "breaks": (r"\bbreaks?\b", r"\bbroken\b", r"\bsnaps?\b", r"\bshatters?\b"),
    "touches": (r"\btouches?\b", r"\breaches?\b[\s\S]{0,45}\b(?:chest|body|hand)\b"),
    "identifies": (r"\bidentif(?:y|ies)\b", r"\brecognizes?\b", r"\bmaps?\b", r"\bsees?\b"),
    "travels": (r"\btravels?\b", r"\b(?:moves?|streams?|rises?|arcs?|flows?)\b", r"\bpulls?\b[\s\S]{0,40}\btoward\b"),
    "grips": (r"\bgrips?\b", r"\bcatches?\b", r"\bholds?\b"),
    "stops": (r"\bstops?\b", r"\bhalts?\b", r"\bfrozen\b"),
    "strikes": (r"\bstrikes?\b", r"\bhits?\b", r"\bblasted\b", r"\bimpact\b"),
    "breathes": (r"\bbreathes?\b", r"\bbreathing\b", r"\brelie(?:f|ved)\b"),
    "raises": (r"\braises?\b", r"\blifts?\b"),
    "displays": (
        r"\bdisplays?\b",
        r"\bshows?\b",
        r"\bscreen\b[\s\S]{0,35}\b(?:text|result|words?)\b",
        r"\b(?:screen|device|scanner)\b[\s\S]{0,35}\bholds? exactly\b",
        r"\bholds? exactly\b[\s\S]{0,50}\bscreen\b",
    ),
    "surround": (r"\bsurrounds?\b", r"\bencircles?\b", r"\b(?:ring|circle)\b"),
}


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


def voice_window_eligibility(words: int, edit_speed: float = 1.4) -> list[str]:
    """Devuelve las ventanas que admiten un bloque sin cambiar su texto."""
    estimated = words * 60.0 / (150.0 * edit_speed)
    return [
        kind
        for kind, (minimum, maximum, max_seconds) in VOICE_WINDOW_LIMITS.items()
        if minimum <= words <= maximum and estimated <= max_seconds
    ]


def analyze_monologue_segmentability(monologue: str) -> dict[str, Any]:
    """Audita cada átomo separado por una línea en blanco.

    Un átomo no se puede partir en escenas sin introducir un LF nuevo en
    ``full_script``. Por eso debe caber completo en al menos una ventana legal.
    Un bloque compuesto solo por tags V3 autorizados es control prosódico y se
    absorbe junto al bloque vecino; nunca cuenta como escena hablada autónoma.
    """
    atoms: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if "\r" in monologue:
        failures.append({"atom": None, "code": "MONOLOGUE_NEWLINE_NOT_LF"})
    if re.search(r"[ \t]+(?=\n|$)", monologue):
        failures.append({"atom": None, "code": "MONOLOGUE_TRAILING_WHITESPACE"})

    # El contrato no admite hard-wrap ni separadores elásticos: cada átomo es
    # una sola línea y el único límite legal es exactamente dos bytes LF.
    raw_blocks = monologue.split("\n\n")
    separator_invalid = (
        monologue.startswith("\n")
        or monologue.endswith("\n")
        or any(not block or "\n" in block for block in raw_blocks)
    )
    if separator_invalid:
        failures.append({"atom": None, "code": "MONOLOGUE_SEPARATOR_INVALID"})

    cursor = 0
    for raw_index, raw_block in enumerate(raw_blocks, start=1):
        start = monologue.find(raw_block, cursor)
        if start < 0:  # defensa fail-closed ante una normalización inesperada
            start = cursor
        cursor = start + len(raw_block) + 2
        text = raw_block
        if not text:
            continue
        line_start = monologue.count("\n", 0, start) + 1
        line_end = line_start + raw_block.count("\n")
        words = spoken_words(text)
        tags = TAG_RE.findall(text)
        unknown_tags = sorted({tag for tag in tags if tag.lower() not in ALLOWED_TAGS})
        residue = TAG_RE.sub("", text).strip()
        tag_only_candidate = bool(tags) and not residue
        tag_only = tag_only_candidate and len(tags) == 1 and not unknown_tags
        eligible = voice_window_eligibility(words) if words else []
        estimated = round(words * 60.0 / (150.0 * 1.4), 3)
        passed = tag_only or (not unknown_tags and bool(eligible))
        atom = {
            "atom": len(atoms) + 1,
            "source_block": raw_index,
            "line_start": line_start,
            "line_end": line_end,
            "text": text,
            "words": words,
            "estimated_seconds": estimated,
            "tags": tags,
            "tag_only_control": tag_only,
            "eligible_windows": eligible,
            "pass": passed,
        }
        atoms.append(atom)
        if unknown_tags:
            failures.append({
                "atom": atom["atom"],
                "line_start": line_start,
                "line_end": line_end,
                "code": "MONOLOGUE_ATOM_TAG_UNKNOWN",
                "unknown_tags": unknown_tags,
            })
        elif tag_only_candidate and len(tags) != 1:
            failures.append({
                "atom": atom["atom"],
                "line_start": line_start,
                "line_end": line_end,
                "code": "MONOLOGUE_ATOM_TAG_ONLY_MULTIPLE",
                "tag_count": len(tags),
            })
        elif not passed:
            failures.append({
                "atom": atom["atom"],
                "line_start": line_start,
                "line_end": line_end,
                "code": "MONOLOGUE_ATOM_UNSEGMENTABLE",
                "words": words,
                "estimated_seconds": estimated,
            })

    spoken_atoms = [atom for atom in atoms if not atom["tag_only_control"]]
    if not spoken_atoms:
        failures.append({"atom": None, "code": "MONOLOGUE_NO_SPOKEN_ATOMS"})
    return {
        "segmentable": not failures,
        "delimiter": "blank_line_LF",
        "join_contract": "full_script == '\\n'.join(voiceover.text)",
        "reconstruction_note": (
            "Al cortar sobre un separador en blanco, uno de los voiceover.text adyacentes conserva "
            "el LF adicional; el LF de join reconstruye el otro byte sin alterar MONOLOGO_LOCKED."
        ),
        "legal_windows": {
            kind: {"minimum_words": minimum, "maximum_words": maximum, "maximum_seconds": max_seconds}
            for kind, (minimum, maximum, max_seconds) in VOICE_WINDOW_LIMITS.items()
        },
        "atom_count": len(atoms),
        "spoken_atom_count": len(spoken_atoms),
        "tag_only_atom_count": sum(atom["tag_only_control"] for atom in atoms),
        "max_atom_words": max((atom["words"] for atom in spoken_atoms), default=0),
        "atoms": atoms,
        "failures": failures,
    }


def _semantic_id_valid(value: Any) -> bool:
    return isinstance(value, str) and (value in SPECIAL_SEMANTIC_IDS or bool(SNAKE_RE.fullmatch(value)))


def _visual_tokens_valid(value: Any) -> bool:
    return bool(
        isinstance(value, list)
        and len(value) == len(set(value))
        and all(
            isinstance(token, str)
            and token == token.strip()
            and bool(re.fullmatch(r"[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*(?: [A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*){0,9}", token))
            for token in value
        )
    )


def _visual_token_evidenced(token: str, prompt: str) -> bool:
    alternatives = [part.strip() for part in re.split(r"\s+or\s+", token) if part.strip()]
    if len(alternatives) > 1:
        return any(_visual_token_evidenced(part, prompt) for part in alternatives)
    token_words = normalized_text(token).split()
    prompt_value = normalized_text(prompt)
    if normalized_text(token) in prompt_value:
        return True
    aliases: dict[str, tuple[str, ...]] = {
        "column": ("pillar", "support"),
        "floor": ("ground", "pavement", "asphalt", "concrete"),
        "crack": ("fissure", "seam", "fracture"),
        "cash": ("money", "bill", "bills", "banknote", "banknotes"),
        "wound": ("injury", "gash", "cut"),
        "blood": ("bleeding", "bloody"),
        "rifle": ("weapon", "gun"),
        "energy": ("power", "glow", "force"),
    }
    for word in token_words:
        candidates = (word, *aliases.get(word, ()))
        if not any(re.search(rf"\b{re.escape(candidate)}(?:s|es)?\b", prompt_value) for candidate in candidates):
            return False
    return bool(token_words)


def _ordered_unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def validate_voice_visual_lock(
    raw_lock: Any,
    segmentability: dict[str, Any],
    issues: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validate the packet's atom-level source of truth before any image plan exists."""
    if not isinstance(raw_lock, list):
        add_issue(issues, "voice_visual_lock", "VOICE_VISUAL_LOCK_NOT_ARRAY", "voice_visual_lock debe ser una lista.")
        return []
    atoms = [item for item in as_list(segmentability.get("atoms")) if isinstance(item, dict)]
    if len(raw_lock) != len(atoms):
        add_issue(
            issues,
            "voice_visual_lock",
            "VOICE_VISUAL_LOCK_ATOM_COUNT",
            f"voice_visual_lock debe cubrir exactamente {len(atoms)} átomos; recibió {len(raw_lock)}.",
        )
    atom_positions = {f"A{index:03d}": index for index in range(1, len(atoms) + 1)}
    prior_participants: dict[str, set[str]] = {}
    validated: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_item in enumerate(raw_lock):
        label = f"voice_visual_lock[{index}]"
        expected_id = f"A{index + 1:03d}"
        if not isinstance(raw_item, dict) or set(raw_item) != VOICE_LOCK_FIELDS:
            add_issue(issues, "voice_visual_lock", "VOICE_VISUAL_LOCK_FIELDS", f"{label} no cumple el schema exacto V5.3.7.")
            continue
        item = dict(raw_item)
        atom_id = item.get("atom_id")
        if atom_id != expected_id or atom_id in seen_ids:
            add_issue(issues, "voice_visual_lock", "VOICE_ATOM_ID_INVALID", f"{label}.atom_id debe ser {expected_id} y único.")
        elif isinstance(atom_id, str):
            seen_ids.add(atom_id)
        atom = atoms[index] if index < len(atoms) else {}
        if item.get("text_exact") != atom.get("text"):
            add_issue(issues, "voice_visual_lock", "VOICE_ATOM_TEXT_MISMATCH", f"{label}.text_exact no coincide byte por byte con MONOLOGO_LOCKED.")
        kind = item.get("kind")
        if kind not in VOICE_FACT_KINDS:
            add_issue(issues, "voice_visual_lock", "VOICE_ATOM_KIND_INVALID", f"{label}.kind inválido.")
        if bool(atom.get("tag_only_control")) != (kind == "CONTROL"):
            add_issue(issues, "voice_visual_lock", "VOICE_CONTROL_KIND_MISMATCH", f"{label}: CONTROL debe corresponder exactamente a un átomo solo-tag.")

        claims = item.get("claims")
        if not isinstance(claims, list):
            add_issue(issues, "voice_visual_lock", "VOICE_CLAIMS_NOT_ARRAY", f"{label}.claims debe ser lista.")
            claims = []
        if kind not in {"CARD", "CONTROL"} and not claims:
            add_issue(issues, "voice_visual_lock", "VOICE_CLAIMS_REQUIRED", f"{label} hablado no-card necesita al menos un claim.")
        if kind in {"CARD", "CONTROL"} and claims:
            add_issue(issues, "voice_visual_lock", "VOICE_NONVISUAL_CLAIMS_FORBIDDEN", f"{label} CARD/CONTROL no admite claims visuales.")

        claim_participants: list[str] = []
        current_participants: set[str] = set()
        for claim_index, raw_claim in enumerate(claims):
            claim_label = f"{label}.claims[{claim_index}]"
            if not isinstance(raw_claim, dict) or set(raw_claim) != PACKET_VOICE_CLAIM_FIELDS:
                add_issue(issues, "voice_visual_lock", "VOICE_CLAIM_FIELDS", f"{claim_label} no cumple el schema exacto.")
                continue
            claim = raw_claim
            for field in ("actor_id", "receiver_or_target_id", "source_id"):
                if not _semantic_id_valid(claim.get(field)):
                    add_issue(issues, "voice_visual_lock", "VOICE_CLAIM_ID_INVALID", f"{claim_label}.{field} debe ser ID snake_case, environment o none.")
            for field in ("action", "direction", "result"):
                if not nonempty_text(claim.get(field)):
                    add_issue(issues, "voice_visual_lock", "VOICE_CLAIM_TEXT_INVALID", f"{claim_label}.{field} debe ser texto no vacío.")
            participants = claim.get("causal_participants")
            if (
                not isinstance(participants, list)
                or any(not _semantic_id_valid(value) or value in SPECIAL_SEMANTIC_IDS for value in participants)
                or len(participants) != len(set(participants))
            ):
                add_issue(issues, "voice_visual_lock", "VOICE_CAUSAL_PARTICIPANTS_INVALID", f"{claim_label}.causal_participants debe ser lista única de IDs físicos.")
                participants = []
            required_participants = {
                value
                for value in (claim.get("actor_id"), claim.get("receiver_or_target_id"), claim.get("source_id"))
                if isinstance(value, str) and value not in SPECIAL_SEMANTIC_IDS
            }
            if not required_participants.issubset(set(participants)):
                add_issue(
                    issues,
                    "voice_visual_lock",
                    "VOICE_CAUSAL_PARTICIPANT_MISSING",
                    f"{claim_label} omite actor/source/receiver físicos: {sorted(required_participants - set(participants))}.",
                )
            if not _visual_tokens_valid(claim.get("required_visual_tokens")):
                add_issue(
                    issues,
                    "voice_visual_lock",
                    "VOICE_REQUIRED_VISUAL_TOKENS_INVALID",
                    f"{claim_label}.required_visual_tokens debe ser lista única de frases inglesas compactas (1-10 palabras).",
                )
            source_id, receiver_id = claim.get("source_id"), claim.get("receiver_or_target_id")
            if (
                isinstance(source_id, str)
                and isinstance(receiver_id, str)
                and source_id not in SPECIAL_SEMANTIC_IDS
                and receiver_id not in SPECIAL_SEMANTIC_IDS
                and source_id != receiver_id
                and claim.get("direction") != f"{source_id}->{receiver_id}"
            ):
                add_issue(
                    issues,
                    "voice_visual_lock",
                    "VOICE_DIRECTION_NOT_CANONICAL",
                    f"{claim_label}.direction debe ser {source_id}->{receiver_id}.",
                )
            resolved = claim.get("resolved_from_atom_id")
            if resolved is not None:
                if not isinstance(resolved, str) or resolved not in atom_positions or atom_positions[resolved] >= index + 1:
                    add_issue(issues, "voice_visual_lock", "VOICE_RESOLUTION_NOT_PRIOR", f"{claim_label}.resolved_from_atom_id debe apuntar a un átomo anterior.")
                elif claim.get("actor_id") not in prior_participants.get(resolved, set()):
                    add_issue(issues, "voice_visual_lock", "VOICE_RESOLUTION_ACTOR_MISMATCH", f"{claim_label} hereda un actor que no aparece en {resolved}.")
            elif not (resolved is None):
                add_issue(issues, "voice_visual_lock", "VOICE_RESOLUTION_TYPE", f"{claim_label}.resolved_from_atom_id debe ser null o A###.")
            for participant in participants:
                claim_participants.append(participant)
                current_participants.add(participant)

        must_show = item.get("must_show")
        if (
            not isinstance(must_show, list)
            or any(not _semantic_id_valid(value) or value in SPECIAL_SEMANTIC_IDS for value in must_show)
            or len(must_show) != len(set(must_show))
        ):
            add_issue(issues, "voice_visual_lock", "VOICE_MUST_SHOW_INVALID", f"{label}.must_show debe ser lista única de IDs físicos.")
            must_show = []
        policy = item.get("offscreen_policy")
        if not isinstance(policy, dict) or set(policy) != OFFSCREEN_POLICY_FIELDS:
            add_issue(issues, "voice_visual_lock", "VOICE_OFFSCREEN_POLICY_FIELDS", f"{label}.offscreen_policy no cumple schema.")
            policy = {}
        mode = policy.get("mode")
        allowed_ids = policy.get("allowed_ids")
        reason = policy.get("reason")
        if mode not in OFFSCREEN_MODES:
            add_issue(issues, "voice_visual_lock", "VOICE_OFFSCREEN_MODE_INVALID", f"{label}.offscreen_policy.mode inválido.")
        if (
            not isinstance(allowed_ids, list)
            or any(not _semantic_id_valid(value) or value in SPECIAL_SEMANTIC_IDS for value in allowed_ids)
            or len(allowed_ids) != len(set(allowed_ids))
        ):
            add_issue(issues, "voice_visual_lock", "VOICE_OFFSCREEN_IDS_INVALID", f"{label}.offscreen_policy.allowed_ids debe ser lista única de IDs físicos.")
            allowed_ids = []
        if not isinstance(reason, str) or (mode == "ALLOWED_FILMABLE" and not reason.strip()):
            add_issue(issues, "voice_visual_lock", "VOICE_OFFSCREEN_REASON_INVALID", f"{label}.offscreen_policy.reason debe justificar ALLOWED_FILMABLE.")
        if mode == "FORBIDDEN" and allowed_ids:
            add_issue(issues, "voice_visual_lock", "VOICE_OFFSCREEN_FORBIDDEN_HAS_IDS", f"{label}: FORBIDDEN exige allowed_ids vacío.")
        if not set(allowed_ids).issubset(set(claim_participants)):
            add_issue(issues, "voice_visual_lock", "VOICE_OFFSCREEN_NONPARTICIPANT", f"{label} permite fuera de cuadro IDs que no son participantes causales.")
        required_must_show = set(claim_participants) - set(allowed_ids)
        if not required_must_show.issubset(set(must_show)):
            add_issue(
                issues,
                "voice_visual_lock",
                "VOICE_MUST_SHOW_UNION_MISMATCH",
                f"{label}.must_show debe incluir la unión causal menos allowed_ids: {sorted(required_must_show)}.",
            )
        if kind in {"CARD", "CONTROL"} and (must_show or allowed_ids or mode != "FORBIDDEN"):
            add_issue(issues, "voice_visual_lock", "VOICE_NONVISUAL_POLICY_INVALID", f"{label} CARD/CONTROL exige must_show/allowed_ids vacíos y FORBIDDEN.")
        if isinstance(atom_id, str):
            prior_participants[atom_id] = current_participants
        validated.append(item)
    return validated


def prompt_words(value: Any) -> int:
    return len(re.findall(r"\b[\w'-]+\b", str(value or ""), re.UNICODE))


def normalized_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower())).strip()


def atomic_id_tokens(value: Any) -> list[str]:
    """Return concrete identity tokens from a machine ID, excluding modifiers."""
    if not isinstance(value, str):
        return []
    return [
        token
        for token in re.findall(r"[a-z0-9]+", value.lower().replace("_", " "))
        if len(token) >= 3 and token not in ATOMIC_ID_NOISE
    ]


def atomic_target_requires_presence(atomic: dict[str, Any]) -> bool:
    """Physical interactions require their registered target in the same frame."""
    evidence = " ".join(
        str(atomic.get(field) or "")
        for field in ("verb", "trajectory_or_contact", "result")
    )
    if NONPHYSICAL_TARGET_RE.search(evidence):
        return False
    return bool(PHYSICAL_TARGET_VERB_RE.search(str(atomic.get("verb") or "")) or PHYSICAL_CONTACT_RE.search(evidence))


def atomic_verb_evidenced(verb: Any, prompt: Any) -> bool:
    """Lightweight English action entailment without pretending to be an LLM."""
    if not nonempty_text(verb) or not nonempty_text(prompt):
        return False
    verb_value = normalized_text(verb)
    prompt_value = str(prompt)
    aliases = VERB_EVIDENCE_ALIASES.get(verb_value)
    if aliases and any(re.search(pattern, prompt_value, re.I) for pattern in aliases):
        return True
    tokens = re.findall(r"[a-z]+", verb_value)
    if not tokens:
        return False
    token = tokens[0]
    irregular = {
        "fell": "fall", "fallen": "fall", "flies": "fly", "lying": "lie", "lies": "lie",
        "threw": "throw", "thrown": "throw", "caught": "catch", "held": "hold",
    }
    stem = irregular.get(token, token)
    for suffix in ("ing", "ied", "ed", "es", "s"):
        if len(stem) > len(suffix) + 2 and stem.endswith(suffix):
            stem = stem[:-len(suffix)]
            break
    return bool(re.search(rf"\b{re.escape(stem)}[a-z]*\b", prompt_value, re.I))


def reference_count(refs: Any) -> int:
    refs_dict = as_dict(refs)
    return (
        len(as_list(refs_dict.get("characters")))
        + len(as_list(refs_dict.get("assets")))
        + len(as_list(refs_dict.get("scenes")))
        + (1 if isinstance(refs_dict.get("escenario"), dict) else 0)
    )


def generated_asset_style_valid(prompt: Any, asset_type: Any) -> bool:
    """Assets need a self-contained style anchor; scene prompts cannot repair them later."""
    if not nonempty_text(prompt) or not isinstance(asset_type, str):
        return False
    value = str(prompt)
    common = (
        KOREAN_MANHWA_WEBTOON_RE.search(value)
        and TWO_D_RE.search(value)
        and CEL_SHADING_RE.search(value)
        and INKED_LINEART_RE.search(value)
    )
    if not common:
        return False
    if asset_type in {"human", "creature"}:
        return True
    if asset_type in {"prop", "container"}:
        return bool(PROP_DESIGN_RE.search(value))
    if asset_type == "ui":
        return bool(INTERFACE_DESIGN_RE.search(value))
    return False


def generated_view_style_valid(prompt: Any) -> bool:
    """Scenario plates use a background anchor, never only a generic scene style."""
    if not nonempty_text(prompt):
        return False
    value = str(prompt)
    return bool(
        KOREAN_MANHWA_WEBTOON_RE.search(value)
        and BACKGROUND_ILLUSTRATION_RE.search(value)
        and TWO_D_RE.search(value)
        and CEL_SHADING_RE.search(value)
        and (INKED_LINEART_RE.search(value) or PAINTED_ENVIRONMENT_RE.search(value))
    )


def prompt_signature_valid(signature: Any, display_name: Any = None, asset_type: Any = None) -> bool:
    """Acepta solo una identidad visual compacta y estable, nunca actuación/estado."""
    if not nonempty_text(signature):
        return False
    value = str(signature).strip()
    if not 6 <= prompt_words(value) <= 12:
        return False
    if SPANISH_FUNCTION_RE.search(value) or PROMPT_SIGNATURE_FORBIDDEN_RE.search(value):
        return False
    if not re.fullmatch(r"[A-Za-z][A-Za-z' -]*[A-Za-z]", value):
        return False
    if asset_type == "human" and nonempty_text(display_name):
        original_name_tokens = re.findall(r"\b[A-Za-z][A-Za-z'-]*\b", str(display_name))
        proper_tokens = [token.lower() for token in original_name_tokens if len(token) >= 2 and token[:1].isupper()]
        proper_name = " ".join(proper_tokens)
        if len(proper_tokens) >= 2 and proper_name in normalized_text(value):
            return False
    return True


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
        decoded_text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        add_issue(issues, "production_lock", "PACKET_UTF8_INVALID", f"Story Packet no es UTF-8: {error}.")
        return {}, issues
    if b"\r" in raw_bytes:
        add_issue(
            issues,
            "production_lock",
            "PACKET_NEWLINE_NOT_LF",
            "Story Packet debe usar LF; CRLF o CR alteran los bytes canónicos y no se normalizan silenciosamente.",
        )
    text = decoded_text.replace("\r\n", "\n").replace("\r", "\n")

    canonical_headings = [
        "META",
        "MACHINE_LOCK_V5_3",
        "PREMISA COMERCIAL",
        "CANON NECESARIO",
        "PRESUPUESTO DE REVELACIONES",
        "CONTRATO DE LA PARTE",
        "DIRECCION VISUAL SEMILLA",
        "FIRMAS VISUALES Y ROLES",
        "MAPA DE INTERPRETACION Y CONTINUIDAD",
        "MONOLOGO_LOCKED",
        "HANDOFF_NARRATIVO_V5_3",
        "QA_SHOWRUNNER",
    ]
    packet_headings = re.findall(r"(?m)^##[ \t]+([^\n]+?)[ \t]*$", text)
    missing_headings = [heading for heading in canonical_headings if heading not in packet_headings]
    duplicate_headings = sorted({heading for heading in packet_headings if packet_headings.count(heading) > 1})
    unknown_headings = [heading for heading in packet_headings if heading not in canonical_headings]
    if missing_headings or duplicate_headings or unknown_headings or packet_headings != canonical_headings:
        add_issue(
            issues,
            "production_lock",
            "PACKET_HEADINGS_INVALID",
            f"Story Packet exige 12 headings canonicos en orden; faltan {missing_headings}, duplicados {duplicate_headings}, sobran {unknown_headings}.",
        )
    handoff_body = _packet_section(text, "HANDOFF_NARRATIVO_V5_3")
    required_handoff_sections = [
        "COLD_VIEWER_CONTRACT",
        "CONTINUITY_LEDGER",
        "STORY_BEATS",
        "REVEAL_LOCKS",
        "DIRECTOR_BOUNDARY",
    ]
    handoff_sections = re.findall(r"(?m)^###[ \t]+([^\n]+?)[ \t]*$", handoff_body or "")
    if handoff_sections != required_handoff_sections:
        add_issue(
            issues,
            "production_lock",
            "HANDOFF_SECTIONS_INVALID",
            f"HANDOFF_NARRATIVO_V5_3 exige subsecciones en orden: {required_handoff_sections}.",
        )
    for section_name in required_handoff_sections:
        section_match = re.search(
            rf"(?ms)^###[ \t]+{re.escape(section_name)}[ \t]*\n(.*?)(?=^###[ \t]+|\Z)",
            handoff_body or "",
        )
        if section_match is None or not section_match.group(1).strip():
            add_issue(issues, "production_lock", "HANDOFF_SECTION_EMPTY", f"{section_name} no puede estar vacÃ­o.")
    handoff_bodies: dict[str, str] = {}
    for section_name in required_handoff_sections:
        section_match = re.search(
            rf"(?ms)^###[ \t]+{re.escape(section_name)}[ \t]*\n(.*?)(?=^###[ \t]+|\Z)",
            handoff_body or "",
        )
        handoff_bodies[section_name] = section_match.group(1) if section_match else ""
    required_handoff_markers = {
        "COLD_VIEWER_CONTRACT": ("hook_promise:", "danger_known_by_beat:"),
        "CONTINUITY_LEDGER": ("entities:", "state_changes:"),
        "REVEAL_LOCKS": ("revealed_this_part:", "suspected_only:", "forbidden_to_confirm:"),
        "DIRECTOR_BOUNDARY": ("immutable:", "director_may_choose:", "director_must_not_imply:"),
    }
    for section_name, markers in required_handoff_markers.items():
        body = handoff_bodies.get(section_name, "")
        if any(marker not in body for marker in markers):
            add_issue(issues, "production_lock", "HANDOFF_MARKERS_MISSING", f"{section_name} carece de marcadores canÃ³nicos.")
    handoff_beat_ids = re.findall(r"(?m)^-[ \t]+beat_id:[ \t]*(B\d{2,3})[ \t]*$", handoff_bodies.get("STORY_BEATS", ""))
    if not 8 <= len(handoff_beat_ids) <= 14 or len(handoff_beat_ids) != len(set(handoff_beat_ids)):
        add_issue(issues, "production_lock", "HANDOFF_STORY_BEATS_INVALID", "STORY_BEATS exige 8-14 beat_id Ãºnicos.")

    meta_body = _packet_section(text, "META") or ""
    meta_values: dict[str, str] = {}
    for field in ("handoff_version", "packet_id", "approved_voice_id"):
        match = re.search(rf"(?m)^-[ \t]+{field}:[ \t]*(.+?)[ \t]*$", meta_body)
        if match:
            meta_values[field] = match.group(1).strip().strip("\"'")
        else:
            add_issue(issues, "production_lock", "META_LOCK_FIELD_MISSING", f"META carece de {field}.")

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
    segmentability: dict[str, Any] = analyze_monologue_segmentability("")
    if monologue_body is None:
        add_issue(issues, "production_lock", "MONOLOGUE_SECTION_MISSING", "Falta ## MONOLOGO_LOCKED.")
    else:
        fenced = re.fullmatch(r"[ \t]*```(?:text|markdown)?[ \t]*\n([\s\S]*?)\n```[ \t]*", monologue_body, re.I)
        monologue = fenced.group(1) if fenced else monologue_body
        if not monologue:
            add_issue(issues, "production_lock", "MONOLOGUE_EMPTY", "MONOLOGO_LOCKED no puede estar vacío.")
        else:
            segmentability = analyze_monologue_segmentability(monologue)
            for failure in segmentability["failures"]:
                code = failure["code"]
                if code == "MONOLOGUE_ATOM_TAG_UNKNOWN":
                    message = (
                        f"Átomo {failure['atom']} (líneas {failure['line_start']}–{failure['line_end']}) "
                        f"usa tags no autorizados: {failure['unknown_tags']}."
                    )
                elif code == "MONOLOGUE_ATOM_UNSEGMENTABLE":
                    message = (
                        f"Átomo {failure['atom']} (líneas {failure['line_start']}–{failure['line_end']}): "
                        f"{failure['words']} palabras/{failure['estimated_seconds']}s no caben completos en ninguna "
                        "ventana legal (el mayor techo de palabras es master: 16 y <=5.0s). El Showrunner debe insertar "
                        "el salto canónico y recalcular el hash; el Director no puede cambiar MONOLOGO_LOCKED."
                    )
                elif code == "MONOLOGUE_ATOM_TAG_ONLY_MULTIPLE":
                    message = (
                        f"Átomo {failure['atom']} (líneas {failure['line_start']}–{failure['line_end']}) "
                        f"contiene {failure['tag_count']} tags sin texto; un control solo-tag admite exactamente uno."
                    )
                elif code == "MONOLOGUE_SEPARATOR_INVALID":
                    message = "Cada átomo debe ocupar una sola línea y separarse por exactamente \\n\\n."
                elif code == "MONOLOGUE_TRAILING_WHITESPACE":
                    message = "MONOLOGO_LOCKED contiene espacios o tabuladores finales; debe conservar bytes LF limpios."
                elif code == "MONOLOGUE_NEWLINE_NOT_LF":
                    message = "MONOLOGO_LOCKED debe usar exclusivamente saltos LF."
                else:
                    message = "MONOLOGO_LOCKED no contiene ningún átomo hablado segmentable."
                add_issue(issues, "story_packet_segmentability", code, message)

    required_machine = {
        "handoff_version", "packet_id", "approved_voice_id", "monologue_sha256", "monologue_hash_basis",
        "target_runtime_seconds", "runtime_range_seconds", "beat_order", "location_ids", "beat_locations", "state_contract",
        "voice_visual_lock",
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
        for field in ("handoff_version", "packet_id", "approved_voice_id"):
            if meta_values.get(field) != machine.get(field):
                add_issue(issues, "production_lock", "META_MACHINE_MISMATCH", f"META.{field} no coincide con MACHINE_LOCK_V5_3.")
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
        if handoff_beat_ids != beat_order:
            add_issue(issues, "production_lock", "HANDOFF_BEAT_ORDER_MISMATCH", "STORY_BEATS.beat_id debe coincidir exactamente con beat_order.")
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

        machine["voice_visual_lock"] = validate_voice_visual_lock(
            machine.get("voice_visual_lock"),
            segmentability,
            issues,
        )

    monologue_hash = sha256_hex(monologue.encode("utf-8")) if monologue else ""
    if machine and machine.get("monologue_sha256") != monologue_hash:
        add_issue(issues, "production_lock", "MACHINE_MONOLOGUE_HASH_MISMATCH", "El hash de MONOLOGO_LOCKED no coincide con MACHINE_LOCK_V5_3.")
    return {
        "path": str(packet_path.resolve()),
        "sha256": sha256_hex(raw_bytes),
        "machine_lock": machine,
        "monologue": monologue,
        "monologue_sha256": monologue_hash,
        "segmentability": segmentability,
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
    required_root = {"manifest_id", "manifest_version", "series_id", "through_part", "assets", "escenarios"}
    missing_root = sorted(required_root - set(decoded))
    unknown_root = sorted(set(decoded) - required_root)
    if missing_root or unknown_root:
        add_issue(
            issues,
            "asset_manifest",
            "MANIFEST_ROOT_FIELDS_INVALID",
            f"Manifest: faltan {missing_root}; sobran {unknown_root}.",
        )
    if not nonempty_text(decoded.get("manifest_id")) or not SNAKE_RE.fullmatch(str(decoded.get("manifest_id") or "")):
        add_issue(issues, "asset_manifest", "MANIFEST_ID_INVALID", "manifest_id debe ser snake_case no vacio.")
    if decoded.get("manifest_version") != HANDOFF_VERSION:
        add_issue(issues, "asset_manifest", "MANIFEST_VERSION_INVALID", "manifest_version debe ser '5.3'.")
    if not nonempty_text(decoded.get("series_id")):
        add_issue(issues, "asset_manifest", "MANIFEST_SERIES_INVALID", "series_id debe ser texto no vacío.")
    if not isinstance(decoded.get("through_part"), int) or isinstance(decoded.get("through_part"), bool) or decoded.get("through_part", -1) < 0:
        add_issue(issues, "asset_manifest", "MANIFEST_THROUGH_PART_INVALID", "through_part debe ser entero mayor o igual a cero.")
    asset_map: dict[tuple[str, str], dict[str, Any]] = {}
    assets = decoded.get("assets")
    if not isinstance(assets, list):
        add_issue(issues, "asset_manifest", "MANIFEST_ASSETS_INVALID", "assets debe ser lista.")
        assets = []
    seen_asset_ids: set[str] = set()
    for asset_index, asset in enumerate(assets):
        if isinstance(asset, dict) and nonempty_text(asset.get("id")):
            asset_id = str(asset["id"])
            if asset_id in seen_asset_ids:
                add_issue(
                    issues,
                    "asset_manifest",
                    "MANIFEST_ASSET_ID_DUPLICATE",
                    f"assets[{asset_index}].id repite el ID superior {asset_id!r}; todas sus poses deben vivir en una sola entrada.",
                )
            seen_asset_ids.add(asset_id)
        if (
            not isinstance(asset, dict)
            or not nonempty_text(asset.get("id"))
            or not isinstance(asset.get("asset_type"), str)
            or asset.get("asset_type") not in ASSET_TYPES
            or not prompt_signature_valid(asset.get("prompt_signature"), asset.get("display_name"), asset.get("asset_type"))
            or not isinstance(asset.get("poses"), list)
        ):
            add_issue(issues, "asset_manifest", "MANIFEST_ASSET_INVALID", f"assets[{asset_index}] inválido.")
            continue
        if asset.get("asset_type") == "container" and not isinstance(asset.get("transparent"), bool):
            add_issue(issues, "asset_manifest", "MANIFEST_CONTAINER_TRANSPARENCY_INVALID", f"assets[{asset_index}].transparent debe ser booleano.")
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
                "transparent": asset.get("transparent"),
            }
    view_map: dict[tuple[str, str], dict[str, Any]] = {}
    scenarios = decoded.get("escenarios")
    if not isinstance(scenarios, list):
        add_issue(issues, "asset_manifest", "MANIFEST_SCENARIOS_INVALID", "escenarios debe ser lista.")
        scenarios = []
    seen_scenario_ids: set[str] = set()
    for scenario_index, scenario in enumerate(scenarios):
        if isinstance(scenario, dict) and nonempty_text(scenario.get("id")):
            scenario_id = str(scenario["id"])
            if scenario_id in seen_scenario_ids:
                add_issue(
                    issues,
                    "asset_manifest",
                    "MANIFEST_SCENARIO_ID_DUPLICATE",
                    f"escenarios[{scenario_index}].id repite el ID superior {scenario_id!r}; todas sus views deben vivir en una sola entrada.",
                )
            seen_scenario_ids.add(scenario_id)
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
        "manifest_id": decoded.get("manifest_id"),
        "manifest_version": decoded.get("manifest_version"),
        "series_id": decoded.get("series_id"),
        "through_part": decoded.get("through_part"),
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
    project = as_dict(data.get("project"))
    if nonempty_text(project.get("serie")) and isinstance(project.get("part"), int) and not isinstance(project.get("part"), bool):
        expected_packet_id = f"{project['serie']}_parte_{project['part']:02d}_v5_3"
        if lock.get("packet_id") != expected_packet_id:
            add_issue(issues, "production_lock", "PACKET_ID_PROJECT_MISMATCH", f"packet_id debe ser {expected_packet_id!r}.")
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
        asset_type = item.get("asset_type")
        signature = item.get("prompt_signature")
        if not prompt_signature_valid(signature, item.get("display_name"), asset_type):
            add_issue(issues, "asset_registry", "PROMPT_SIGNATURE_INVALID", f"characters.{item_id}.prompt_signature exige identidad inglesa estable de 6-12 palabras, sin nombre, estado, accion ni emocion.")
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
            if mode == "generate" and not generated_asset_style_valid(prompt, asset_type):
                add_issue(
                    issues,
                    "asset_registry",
                    "ASSET_STYLE_ANCHOR_MISSING",
                    f"{label}.prompt necesita ancla Korean manhwa/webtoon + 2D cel shading + inked lineart"
                    + (
                        " + prop/container design."
                        if isinstance(asset_type, str) and asset_type in {"prop", "container"}
                        else " + interface design."
                        if asset_type == "ui"
                        else "."
                    ),
                )
            if nonempty_text(prompt):
                normalized_prompts[pose_id] = normalized_text(prompt)
            if mode == "generate" and nonempty_text(prompt) and (
                not nonempty_text(signature) or normalized_text(signature) not in normalized_text(prompt)
            ):
                add_issue(issues, "asset_registry", "POSE_PROMPT_SIGNATURE_MISSING", f"{label}.prompt debe incluir literalmente prompt_signature.")
            if mode == "generate" and asset_type != "ui" and nonempty_text(prompt):
                shared_markers = (
                    r"\bisolated on a seamless neutral medium[- ]gray background\b",
                    r"\bno environment\b",
                    r"\bno additional characters\b",
                    r"\bno readable text\b",
                )
                if any(not re.search(pattern, str(prompt), re.I) for pattern in shared_markers):
                    add_issue(issues, "asset_registry", "POSE_STUDIO_ISOLATION_MISSING", f"{label}.prompt carece de aislamiento de asset canonico.")
                if re.search(r"\b(?:rain|snow|storm|wind|fog|tunnel|street|road|room|interior|exterior|city|forest|battlefield|midnight|sunset|sunrise)\b", str(prompt), re.I):
                    add_issue(issues, "asset_registry", "POSE_ENVIRONMENT_FORBIDDEN", f"{label}.prompt hornea clima o escenario.")
            reference_pose = pose_raw.get("reference_pose")
            if pose_id != "base" and mode == "generate":
                if not isinstance(reference_pose, str) or reference_pose not in poses or reference_pose == pose_id:
                    add_issue(issues, "asset_registry", "REFERENCE_POSE_INVALID", f"{label}.reference_pose debe apuntar a otra pose existente.")
                if asset_type == "human" and not re.search(r"\bsame face, same hair, same outfit as the reference\b", str(prompt or ""), re.I):
                    add_issue(issues, "asset_registry", "HUMAN_DERIVED_IDENTITY_FORMULA", f"{label}.prompt necesita fórmula canónica de identidad.")
                if asset_type == "creature" and not re.search(r"\bsame anatomy, same markings, same colors as the reference\b", str(prompt or ""), re.I):
                    add_issue(issues, "asset_registry", "CREATURE_DERIVED_IDENTITY_FORMULA", f"{label}.prompt necesita formula canonica de identidad.")
                if isinstance(asset_type, str) and asset_type in {"prop", "container"} and not re.search(r"\bsame shape, same materials, same colors as the reference\b", str(prompt or ""), re.I):
                    add_issue(issues, "asset_registry", "OBJECT_DERIVED_IDENTITY_FORMULA", f"{label}.prompt necesita formula canonica de identidad.")
            elif reference_pose is not None and (not isinstance(reference_pose, str) or reference_pose not in poses):
                add_issue(issues, "asset_registry", "REFERENCE_POSE_INVALID", f"{label}.reference_pose no existe.")
            if role == "performance" and nonempty_text(prompt) and re.search(r"\bneutral (?:expression|mouth|posture|pose)\b", str(prompt), re.I):
                add_issue(issues, "asset_registry", "PERFORMANCE_POSE_NEUTRAL", f"{label} contradice actuación con neutralidad.")
            if asset_type == "human" and pose_id != "base" and mode == "generate" and nonempty_text(prompt):
                if IMPLIED_PROP_RE.search(str(prompt)):
                    add_issue(
                        issues,
                        "asset_registry",
                        "HUMAN_POSE_IMPLIED_PROP",
                        f"{label} pantomima un prop con 'as if'; use un objeto visible real o una mano inequívocamente vacía.",
                    )
                if PROP_ACTION_RE.search(str(prompt)) and not VISIBLE_PROP_RE.search(str(prompt)):
                    add_issue(
                        issues,
                        "asset_registry",
                        "HUMAN_POSE_PROP_NOT_VISIBLE",
                        f"{label} usa arma/dispositivo sin declarar el objeto visible o físico.",
                    )
        if isinstance(asset_type, str) and asset_type in {"human", "creature", "prop", "container", "ui"} and "base" not in poses:
            add_issue(issues, "asset_registry", "BASE_POSE_MISSING", f"characters.{item_id} necesita poses.base.")
        if isinstance(poses.get("base"), dict) and poses["base"].get("pose_role") != "base":
            add_issue(issues, "asset_registry", "BASE_ROLE_INVALID", f"characters.{item_id}.poses.base debe usar pose_role='base'.")
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
                    r"low[- ]angle|high[- ]angle|low oblique|high oblique|dramatic angle|rim|painted)\b",
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
        if asset_type == "creature" and isinstance(poses.get("base"), dict) and poses["base"].get("mode") == "generate":
            prompt = str(poses["base"].get("prompt") or "")
            required = {
                "exactly_one": r"\bexactly one creature\b",
                "complete_body": r"\bcomplete body fully visible\b",
                "resting": r"\bneutral resting state\b",
                "limbs": r"\ball limbs visible\b",
                "clean_dry": r"\bclean and dry\b",
                "studio": r"\beven studio illumination\b",
                "gray": r"\bseamless neutral medium[- ]gray background\b",
            }
            missing = [name for name, pattern in required.items() if not re.search(pattern, prompt, re.I)]
            scrubbed = re.sub(r"\bno (?:environment|additional characters|readable text)\b", " ", prompt, flags=re.I)
            forbidden = re.findall(
                r"\b(?:rain|snow|storm|fog|blood|wound|injury|bruise|burn|broken|cracked|impact|attack|charge|"
                r"collapse|lunge|run|jump|aura|power|energy|fire|smoke|tunnel|street|room|city|forest|night|day)\w*\b",
                scrubbed,
                re.I,
            )
            if missing or forbidden:
                add_issue(issues, "asset_registry", "CREATURE_BASE_NONCANONICAL", f"Base {item_id}: faltan {missing}, prohibidos {sorted(set(forbidden))}.")
        if isinstance(asset_type, str) and asset_type in {"prop", "container"} and isinstance(poses.get("base"), dict) and poses["base"].get("mode") == "generate":
            prompt = str(poses["base"].get("prompt") or "")
            required = {
                "exactly_one": r"\bexactly one object\b",
                "complete_object": r"\bcomplete object fully visible\b",
                "isolated": r"\bisolated\b",
                "clean_dry": r"\bclean and dry\b",
                "orthographic": r"\borthographic front eye[- ]level view\b",
                "studio": r"\beven studio illumination\b",
                "gray": r"\bseamless neutral medium[- ]gray background\b",
            }
            required["unheld" if asset_type == "prop" else "empty"] = r"\bunheld\b" if asset_type == "prop" else r"\bempty\b"
            missing = [name for name, pattern in required.items() if not re.search(pattern, prompt, re.I)]
            scrubbed = re.sub(r"\bno (?:environment|additional characters|readable text|people|creatures|occupants?|hands?|effects?)\b", " ", prompt, flags=re.I)
            forbidden = re.findall(
                r"\b(?:hands?|persons?|people|characters?|occupants?|rain(?:y|ing)?|snow(?:y|ing)?|storms?|fog(?:gy)?|"
                r"blood(?:y)?|wounds?|auras?|powers?|energy|fires?|smoke|tunnels?|streets?|rooms?|cities|city|forests?|"
                r"nights?|days?|lettering|captions?)\b",
                scrubbed,
                re.I,
            )
            if missing or forbidden:
                add_issue(issues, "asset_registry", "OBJECT_BASE_NONCANONICAL", f"Base {item_id}: faltan {missing}, prohibidos {sorted(set(forbidden))}.")
        if asset_type == "ui" and isinstance(poses.get("base"), dict) and poses["base"].get("mode") == "generate":
            prompt = str(poses["base"].get("prompt") or "")
            required = {
                "one_frame": r"\bexactly one interface frame\b",
                "no_text": r"\bno text\b",
                "dark": r"\bdark neutral background\b",
                "no_people": r"\bno (?:people|characters)\b",
                "no_environment": r"\bno (?:environment|scene)\b",
            }
            missing = [name for name, pattern in required.items() if not re.search(pattern, prompt, re.I)]
            if missing:
                add_issue(issues, "asset_registry", "UI_BASE_NONCANONICAL", f"Base UI {item_id}: faltan {missing}.")
        if asset_type == "creature":
            missing_roles = sorted(CREATURE_ROLES - roles_seen)
            if missing_roles:
                add_issue(issues, "asset_registry", "CREATURE_STATES_MISSING", f"Criatura {item_id} carece de roles {missing_roles}.")
            role_prompts = [
                normalized_prompts.get(pose_id, "")
                for pose_id, pose in poses.items()
                if isinstance(pose, dict)
                and isinstance(pose.get("pose_role"), str)
                and pose.get("pose_role") in CREATURE_ROLES
            ]
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
            if mode == "generate" and not generated_view_style_valid(view_raw.get("prompt")):
                add_issue(
                    issues,
                    "scenario_registry",
                    "VIEW_STYLE_ANCHOR_MISSING",
                    f"{label}.prompt necesita Korean manhwa webtoon background illustration + 2D cel shading + crisp lineart/painted environment.",
                )
            if mode == "generate" and nonempty_text(view_raw.get("prompt")):
                prompt = str(view_raw.get("prompt"))
                plate_formula = "Empty environment plate, no people, no creatures, no vehicles, no readable text"
                if normalized_text(plate_formula) not in normalized_text(prompt):
                    add_issue(issues, "scenario_registry", "VIEW_EMPTY_PLATE_FORMULA", f"{label}.prompt necesita la formula literal de plate vacio.")
                if not any(pattern.search(prompt) for pattern in SCALE_PATTERNS.values()):
                    add_issue(issues, "scenario_registry", "VIEW_CAMERA_SCALE_MISSING", f"{label}.prompt carece de escala de camara.")
                if not any(pattern.search(prompt) for pattern in ELEVATION_PATTERNS.values()):
                    add_issue(issues, "scenario_registry", "VIEW_CAMERA_ELEVATION_MISSING", f"{label}.prompt carece de elevacion de camara.")
                if not any(pattern.search(prompt) for pattern in VIEWPOINT_PATTERNS.values()):
                    add_issue(issues, "scenario_registry", "VIEW_CAMERA_VIEWPOINT_MISSING", f"{label}.prompt carece de viewpoint.")
                if not TIME_RE.search(prompt):
                    add_issue(issues, "scenario_registry", "VIEW_TIME_MISSING", f"{label}.prompt carece de hora.")
                if not LIGHT_SOURCE_RE.search(prompt) or not LIGHT_DIRECTION_RE.search(prompt):
                    add_issue(issues, "scenario_registry", "VIEW_LIGHTING_MISSING", f"{label}.prompt necesita fuente y direccion de luz.")
            reference_view = view_raw.get("reference_view")
            if reference_view is not None and (not isinstance(reference_view, str) or reference_view not in views or reference_view == view_id):
                add_issue(issues, "scenario_registry", "REFERENCE_VIEW_INVALID", f"{label}.reference_view no existe o es autorreferencia.")
    if not registry:
        add_issue(issues, "scenario_registry", "SCENARIO_REQUIRED", "El registro necesita al menos un escenario con view.")
    return registry


def validate_existing_assets(
    data: dict[str, Any], serie: str, part: Any, manifest: dict[str, Any] | None, issues: list[dict[str, Any]]
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
    expected_through = part - 1 if isinstance(part, int) and not isinstance(part, bool) else None
    if expected_through is None or manifest.get("through_part") != expected_through:
        add_issue(issues, "asset_manifest", "MANIFEST_THROUGH_PART_MISMATCH", "Manifest through_part debe ser exactamente project.part - 1.")
    if not has_existing:
        add_issue(issues, "asset_manifest", "MANIFEST_WITHOUT_EXISTING", "No adjunte manifest si el JSON no contiene mode=existing.")
    asset_map = as_dict(manifest.get("asset_map"))
    for asset_id, pose_id, asset, pose in existing_poses:
        expected = asset_map.get((asset_id, pose_id))
        if not isinstance(expected, dict) or (
            expected.get("pose_role") != pose.get("pose_role")
            or expected.get("asset") != pose.get("asset")
            or expected.get("asset_type") != asset.get("asset_type")
            or expected.get("prompt_signature") != asset.get("prompt_signature")
            or expected.get("transparent") != asset.get("transparent")
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
        "low_density_kind", "action", "approach", "white", "black", "long_scale", "scale_anchor", "subpanels",
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

    scale_anchor = plan.get("scale_anchor")
    anchor_required = plan.get("shot_scale") == "TRUE_LONG" or (
        plan.get("camera_elevation") in {"BIRDS_EYE", "TOP_DOWN"}
        and plan.get("shot_scale") in {"FULL", "WIDE_MASTER", "TRUE_LONG"}
    )
    if not isinstance(scale_anchor, str):
        add_issue(issues, "camera_variety", "SCALE_ANCHOR_TEXT_REQUIRED", "visual_plan.scale_anchor debe ser string; use '' cuando no aplica.", scene_id)
        plan["scale_anchor"] = ""
    elif anchor_required:
        comparison = re.search(r"\b(?:(?:one|two|three|four|five|six|seven|eight|nine)[- ](?:tenth|tenths|fifth|fifths|quarter|quarters|third|thirds)|half|twice|same height|same body scale|same size)\b", scale_anchor, re.I)
        dimension = re.search(r"\b(?:height|length|width|size|scale)\b", scale_anchor, re.I)
        entity_groups = sum(
            bool(pattern.search(scale_anchor))
            for pattern in (
                re.compile(r"\b(?:adult|human|worker|person|body)\b", re.I),
                re.compile(r"\b(?:creature|monster|anomaly|threat)\b", re.I),
                re.compile(r"\b(?:vehicle|truck|convoy|car|bus)\b", re.I),
                re.compile(r"\b(?:building|wall|door|column|support|tunnel|architecture)\b", re.I),
                re.compile(r"\b(?:scanner|prop|object|tool|device)\b", re.I),
            )
        )
        if (
            not 5 <= prompt_words(scale_anchor) <= 18
            or SPANISH_FUNCTION_RE.search(scale_anchor)
            or normalized_text(scale_anchor) not in normalized_text(prompt)
            or not comparison
            or not dimension
            or entity_groups < 2
        ):
            add_issue(issues, "camera_variety", "SCALE_ANCHOR_INVALID", "TRUE_LONG/BIRDS_EYE/TOP_DOWN exige ancla medible inglesa de 5-18 palabras, literal en prompt y entre dos clases de escala.", scene_id)
    elif scale_anchor != "":
        add_issue(issues, "camera_variety", "SCALE_ANCHOR_UNEXPECTED", "scale_anchor debe ser '' cuando el plano no lo exige.", scene_id)

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
    if HIDDEN_SOURCE_RE.search(prompt):
        add_issue(
            issues,
            "prompt_grammar",
            "AMBIGUOUS_HIDDEN_SOURCE",
            "Un efecto no puede provenir de una fuente/origen oculto; nombre y muestre su cuerpo emisor.",
            scene_id,
        )
    if CONTAINER_PREPOSITION_MISSING_RE.search(prompt):
        add_issue(
            issues,
            "prompt_grammar",
            "CONTAINER_RELATION_PREPOSITION_MISSING",
            "La postura junto al contenedor carece de relación espacial (inside/outside/beside/against).",
            scene_id,
        )
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
        visible_count = len(as_list(as_dict(scene.get("continuity")).get("visible_entities")))
        low, high, band = 80, 120 if visible_count >= 3 else 115, "complex"
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
        "voice_facts", "must_show", "offscreen_policy",
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

    voice_facts = continuity.get("voice_facts")
    if not isinstance(voice_facts, list) or not voice_facts:
        add_issue(issues, "voice_visual_lock", "SCENE_VOICE_FACTS_REQUIRED", "Panel necesita continuity.voice_facts no vacío.", scene_id)
        voice_facts = []
    validated_facts: list[dict[str, Any]] = []
    causal_union: list[str] = []
    for fact_index, raw_fact in enumerate(voice_facts):
        label = f"continuity.voice_facts[{fact_index}]"
        if not isinstance(raw_fact, dict) or set(raw_fact) != VOICE_FACT_FIELDS:
            add_issue(issues, "voice_visual_lock", "SCENE_VOICE_FACT_FIELDS", f"{label} no cumple schema V5.3.7.", scene_id)
            continue
        fact = raw_fact
        if not isinstance(fact.get("atom_id"), str) or not re.fullmatch(r"A\d{3}", fact["atom_id"]):
            add_issue(issues, "voice_visual_lock", "SCENE_VOICE_FACT_ATOM", f"{label}.atom_id debe ser A###.", scene_id)
        for field in ("actor_id", "receiver_or_target_id", "source_id"):
            value = fact.get(field)
            if not isinstance(value, str) or (value not in SPECIAL_SEMANTIC_IDS and value not in registry):
                add_issue(issues, "voice_visual_lock", "SCENE_VOICE_FACT_ID", f"{label}.{field} debe existir en el registry o ser environment/none.", scene_id)
        for field in ("action", "direction", "result"):
            if not nonempty_text(fact.get(field)):
                add_issue(issues, "voice_visual_lock", "SCENE_VOICE_FACT_TEXT", f"{label}.{field} debe ser texto no vacío.", scene_id)
        participants = fact.get("causal_participants")
        if (
            not isinstance(participants, list)
            or any(not isinstance(value, str) or value not in registry for value in participants)
            or len(participants) != len(set(participants))
        ):
            add_issue(issues, "voice_visual_lock", "SCENE_CAUSAL_PARTICIPANTS", f"{label}.causal_participants debe ser lista única de IDs registrados.", scene_id)
            participants = []
        required_participants = {
            value
            for value in (fact.get("actor_id"), fact.get("receiver_or_target_id"), fact.get("source_id"))
            if isinstance(value, str) and value in registry
        }
        if not required_participants.issubset(set(participants)):
            add_issue(issues, "voice_visual_lock", "SCENE_CAUSAL_PARTICIPANT_MISSING", f"{label} omite actor/source/receiver registrados.", scene_id)
        if not _visual_tokens_valid(fact.get("required_visual_tokens")):
            add_issue(issues, "voice_visual_lock", "SCENE_REQUIRED_VISUAL_TOKENS_INVALID", f"{label}.required_visual_tokens es inválido.", scene_id)
        source_id, receiver_id = fact.get("source_id"), fact.get("receiver_or_target_id")
        if (
            isinstance(source_id, str)
            and isinstance(receiver_id, str)
            and source_id in registry
            and receiver_id in registry
            and source_id != receiver_id
            and fact.get("direction") != f"{source_id}->{receiver_id}"
        ):
            add_issue(issues, "voice_visual_lock", "SCENE_DIRECTION_NOT_CANONICAL", f"{label}.direction debe ser {source_id}->{receiver_id}.", scene_id)
        resolved = fact.get("resolved_from_atom_id")
        if resolved is not None and (not isinstance(resolved, str) or not re.fullmatch(r"A\d{3}", resolved)):
            add_issue(issues, "voice_visual_lock", "SCENE_RESOLUTION_INVALID", f"{label}.resolved_from_atom_id debe ser null o A###.", scene_id)
        causal_union.extend(participants)
        validated_facts.append(dict(fact))
    continuity["voice_facts"] = validated_facts

    must_show = continuity.get("must_show")
    if (
        not isinstance(must_show, list)
        or any(not isinstance(value, str) or value not in registry for value in must_show)
        or len(must_show) != len(set(must_show))
    ):
        add_issue(issues, "voice_visual_lock", "SCENE_MUST_SHOW_INVALID", "continuity.must_show debe ser lista única de IDs registrados.", scene_id)
        must_show = []
    continuity["must_show"] = must_show
    policy = continuity.get("offscreen_policy")
    if not isinstance(policy, dict) or set(policy) != OFFSCREEN_POLICY_FIELDS:
        add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_POLICY_FIELDS", "continuity.offscreen_policy no cumple schema.", scene_id)
        policy = {}
    mode = policy.get("mode")
    allowed_ids = policy.get("allowed_ids")
    reason = policy.get("reason")
    if mode not in OFFSCREEN_MODES:
        add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_MODE_INVALID", "continuity.offscreen_policy.mode inválido.", scene_id)
    if (
        not isinstance(allowed_ids, list)
        or any(not isinstance(value, str) or value not in registry for value in allowed_ids)
        or len(allowed_ids) != len(set(allowed_ids))
    ):
        add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_IDS_INVALID", "continuity.offscreen_policy.allowed_ids debe ser lista única de IDs registrados.", scene_id)
        allowed_ids = []
    if not isinstance(reason, str) or (mode == "ALLOWED_FILMABLE" and not reason.strip()):
        add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_REASON_INVALID", "ALLOWED_FILMABLE necesita una razón no vacía.", scene_id)
    if mode == "FORBIDDEN" and allowed_ids:
        add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_FORBIDDEN_HAS_IDS", "FORBIDDEN exige allowed_ids vacío.", scene_id)
    if not set(allowed_ids).issubset(set(causal_union)):
        add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_NONPARTICIPANT", "allowed_ids solo puede contener participantes causales.", scene_id)
    required_must_show = set(causal_union) - set(allowed_ids)
    if not required_must_show.issubset(set(must_show)):
        add_issue(issues, "voice_visual_lock", "SCENE_MUST_SHOW_UNION_MISMATCH", f"must_show debe incluir {sorted(required_must_show)}.", scene_id)
    continuity["offscreen_policy"] = {
        "mode": mode,
        "allowed_ids": allowed_ids,
        "reason": reason if isinstance(reason, str) else "",
    }
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
    performance_pose_uses: dict[tuple[str, str, str], list[str]] = {}
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
                if group == "characters" and pose_roles.get((item_id, pose_id)) == "performance":
                    beat_id = str(record.get("story_beat_id") or "")
                    performance_pose_uses.setdefault((item_id, pose_id, beat_id), []).append(scene_id)
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
    for (entity_id, pose_id, beat_id), scene_ids in performance_pose_uses.items():
        if len(scene_ids) > 3:
            add_issue(
                issues,
                "asset_registry",
                "PERFORMANCE_POSE_OVERUSED_IN_BEAT",
                f"{entity_id}.{pose_id} se reutiliza {len(scene_ids)} veces en {beat_id}; maximo 3: {scene_ids}.",
            )
    return max_references


def validate_semantic_alignment(
    records: list[dict[str, Any]],
    registry: dict[str, dict[str, Any]],
    issues: list[dict[str, Any]],
) -> None:
    """Bind machine actions to visible, referenced and literally prompted evidence."""
    id_map = {record["id"]: record for record in records if record.get("valid_id")}
    for record in records:
        if record.get("type") != "panel":
            continue
        scene_id = record["id"]
        continuity = as_dict(record.get("continuity"))
        atomic = as_dict(continuity.get("atomic_action"))
        if not atomic:
            continue
        prompt = str(record.get("prompt") or "")
        prompt_normalized = normalized_text(prompt)
        visible = {
            entity_id
            for entity_id in as_list(continuity.get("visible_entities"))
            if isinstance(entity_id, str)
        }
        refs = as_dict(record.get("scene", {}).get("references"))
        referenced = {
            ref.get("id")
            for group in ("characters", "assets")
            for ref in as_list(refs.get(group))
            if isinstance(ref, dict) and isinstance(ref.get("id"), str)
        }
        for scene_ref in as_list(refs.get("scenes")):
            if not isinstance(scene_ref, dict) or not isinstance(scene_ref.get("scene_id"), str):
                continue
            inherited = id_map.get(scene_ref["scene_id"])
            if inherited:
                referenced.update(
                    entity_id
                    for entity_id in as_list(as_dict(inherited.get("continuity")).get("visible_entities"))
                    if isinstance(entity_id, str)
                )

        actor_id = atomic.get("actor_id")
        actor_registered = isinstance(actor_id, str) and actor_id in registry
        if actor_registered:
            if actor_id not in visible:
                add_issue(issues, "semantic_alignment", "ATOMIC_ACTOR_NOT_VISIBLE", f"atomic_action.actor_id {actor_id} no figura en visible_entities.", scene_id)
            if actor_id not in referenced:
                add_issue(issues, "semantic_alignment", "ATOMIC_ACTOR_NOT_REFERENCED", f"atomic_action.actor_id {actor_id} carece de referencia visual.", scene_id)
            signature = registry[actor_id].get("prompt_signature")
            if not nonempty_text(signature) or normalized_text(signature) not in prompt_normalized:
                add_issue(issues, "semantic_alignment", "ATOMIC_ACTOR_NOT_IN_PROMPT", f"El prompt no identifica literalmente al actor {actor_id}.", scene_id)
        elif isinstance(actor_id, str) and actor_id not in {"environment", "none"}:
            concrete_tokens = [token for token in atomic_id_tokens(actor_id) if token in ATOMIC_CONCRETE_NOUNS]
            if concrete_tokens and not any(re.search(rf"\b{re.escape(token)}s?\b", prompt, re.I) for token in concrete_tokens):
                add_issue(
                    issues,
                    "semantic_alignment",
                    "ATOMIC_ACTOR_NOUN_NOT_IN_PROMPT",
                    f"El actor físico/sintético {actor_id} no tiene sustantivo identificable en el prompt.",
                    scene_id,
                )

        target_id = atomic.get("target_id")
        target_required = atomic_target_requires_presence(atomic)
        if target_required and isinstance(target_id, str) and target_id in registry:
            if target_id not in visible:
                add_issue(issues, "semantic_alignment", "ATOMIC_TARGET_NOT_VISIBLE", f"El objetivo físico {target_id} no figura en visible_entities.", scene_id)
            if target_id not in referenced:
                add_issue(issues, "semantic_alignment", "ATOMIC_TARGET_NOT_REFERENCED", f"El objetivo físico {target_id} carece de referencia visual.", scene_id)
            signature = registry[target_id].get("prompt_signature")
            if not nonempty_text(signature) or normalized_text(signature) not in prompt_normalized:
                add_issue(issues, "semantic_alignment", "ATOMIC_TARGET_NOT_IN_PROMPT", f"El prompt no identifica literalmente al objetivo físico {target_id}.", scene_id)

        if actor_id not in {"environment", "none"} and not atomic_verb_evidenced(atomic.get("verb"), prompt):
            add_issue(
                issues,
                "semantic_alignment",
                "ATOMIC_VERB_NOT_EVIDENCED",
                f"La acción {atomic.get('verb')!r} de atomic_action no aparece ni tiene equivalente visible en el prompt.",
                scene_id,
            )

        group_evidence = " ".join(
            str(atomic.get(field) or "")
            for field in ("verb", "trajectory_or_contact", "result")
        )
        if GROUP_ACTION_RE.search(group_evidence):
            if not GROUP_COUNT_RE.search(prompt):
                add_issue(
                    issues,
                    "semantic_alignment",
                    "GROUP_CARDINALITY_MISSING",
                    "Una acción grupal envolvente exige cantidad explícita de tres a doce sujetos en el prompt.",
                    scene_id,
                )
            if not GROUP_FORMATION_RE.search(prompt):
                add_issue(
                    issues,
                    "semantic_alignment",
                    "GROUP_FORMATION_NOT_EVIDENCED",
                    "El prompt no demuestra individuos distintos organizados como grupo/ring/circle.",
                    scene_id,
                )


def _record_referenced_ids(record: dict[str, Any], id_map: dict[str, dict[str, Any]]) -> set[str]:
    refs = as_dict(as_dict(record.get("scene")).get("references"))
    referenced = {
        ref.get("id")
        for group in ("characters", "assets")
        for ref in as_list(refs.get(group))
        if isinstance(ref, dict) and isinstance(ref.get("id"), str)
    }
    for scene_ref in as_list(refs.get("scenes")):
        if not isinstance(scene_ref, dict) or not isinstance(scene_ref.get("scene_id"), str):
            continue
        inherited = id_map.get(scene_ref["scene_id"])
        if inherited:
            referenced.update(
                value
                for value in as_list(as_dict(inherited.get("continuity")).get("visible_entities"))
                if isinstance(value, str)
            )
    return referenced


def _scene_atom_assignments(
    records: list[dict[str, Any]],
    packet: dict[str, Any],
    issues: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Map exact MONOLOGO_LOCKED atoms to scene voice ranges without normalizing bytes."""
    monologue = str(packet.get("monologue") or "")
    atoms = [item for item in as_list(as_dict(packet.get("segmentability")).get("atoms")) if isinstance(item, dict)]
    lock_by_id = {
        item.get("atom_id"): item
        for item in as_list(as_dict(packet.get("machine_lock")).get("voice_visual_lock"))
        if isinstance(item, dict) and isinstance(item.get("atom_id"), str)
    }
    atom_spans: list[tuple[str, int, int]] = []
    search_cursor = 0
    for index, atom in enumerate(atoms, start=1):
        atom_id = f"A{index:03d}"
        text = str(atom.get("text") or "")
        start = monologue.find(text, search_cursor)
        if start < 0:
            add_issue(issues, "voice_visual_lock", "VOICE_ATOM_RANGE_NOT_FOUND", f"No se localizó {atom_id} en MONOLOGO_LOCKED.")
            continue
        atom_spans.append((atom_id, start, start + len(text)))
        search_cursor = start + len(text)

    result: dict[str, list[dict[str, Any]]] = {record["id"]: [] for record in records}
    scene_cursor = 0
    mapped_atoms: set[str] = set()
    for record_index, record in enumerate(records):
        voice_text = str(as_dict(as_dict(record.get("scene")).get("voiceover")).get("text") or "")
        scene_start = scene_cursor
        scene_end = scene_start + len(voice_text)
        for atom_id, atom_start, atom_end in atom_spans:
            if scene_start <= atom_start and atom_end <= scene_end:
                lock = lock_by_id.get(atom_id)
                if lock is not None:
                    result[record["id"]].append(lock)
                mapped_atoms.add(atom_id)
        scene_cursor = scene_end + (1 if record_index < len(records) - 1 else 0)
    missing = sorted({atom_id for atom_id, _, _ in atom_spans} - mapped_atoms)
    if missing:
        add_issue(issues, "voice_visual_lock", "VOICE_ATOMS_UNMAPPED", f"Átomos sin escena exacta: {missing}.")
    return result


def validate_voice_visual_alignment(
    records: list[dict[str, Any]],
    registry: dict[str, dict[str, Any]],
    packet: dict[str, Any] | None,
    issues: list[dict[str, Any]],
) -> None:
    """Prove voice -> locked facts -> visible/reference/prompt, including causal direction."""
    if packet is None:
        return
    assignments = _scene_atom_assignments(records, packet, issues)
    id_map = {record["id"]: record for record in records if record.get("valid_id")}
    atom_order = {
        item.get("atom_id"): index
        for index, item in enumerate(as_list(as_dict(packet.get("machine_lock")).get("voice_visual_lock")))
        if isinstance(item, dict)
    }
    lock_by_atom = {
        item.get("atom_id"): item
        for item in as_list(as_dict(packet.get("machine_lock")).get("voice_visual_lock"))
        if isinstance(item, dict) and isinstance(item.get("atom_id"), str)
    }
    for record in records:
        scene_id = record["id"]
        locks = assignments.get(scene_id, [])
        if not locks:
            add_issue(issues, "voice_visual_lock", "SCENE_WITHOUT_VOICE_ATOM", "La escena no quedó ligada a ningún atom_id exacto.", scene_id)
            continue
        kinds = {item.get("kind") for item in locks}
        if record.get("type") == "narrative_card":
            if not kinds.issubset({"CARD", "CONTROL"}) or "CARD" not in kinds:
                add_issue(issues, "voice_visual_lock", "CARD_ATOM_KIND_MISMATCH", "Narrative card solo admite CARD y CONTROL, con al menos un CARD.", scene_id)
            continue
        if record.get("type") != "panel":
            continue
        if "CARD" in kinds or not (kinds & {"EVENT", "STATE", "EXPOSITION"}):
            add_issue(issues, "voice_visual_lock", "PANEL_ATOM_KIND_MISMATCH", "Panel necesita al menos un átomo EVENT/STATE/EXPOSITION y no admite CARD.", scene_id)

        expected_claims = [
            {"atom_id": item.get("atom_id"), **claim}
            for item in locks
            for claim in as_list(item.get("claims"))
            if isinstance(claim, dict)
        ]
        expected_must_show = _ordered_unique(
            value
            for item in locks
            for value in as_list(item.get("must_show"))
            if isinstance(value, str)
        )
        continuity = as_dict(record.get("continuity"))
        actual_claims = as_list(continuity.get("voice_facts"))
        actual_must_show = as_list(continuity.get("must_show"))
        if actual_claims != expected_claims:
            add_issue(
                issues,
                "voice_visual_lock",
                "SCENE_VOICE_FACTS_LOCK_MISMATCH",
                "continuity.voice_facts no es copia exacta de los claims de los átomos asignados.",
                scene_id,
            )
        if actual_must_show != expected_must_show:
            add_issue(
                issues,
                "voice_visual_lock",
                "SCENE_MUST_SHOW_LOCK_MISMATCH",
                f"continuity.must_show debe ser exactamente {expected_must_show}.",
                scene_id,
            )
        content_locks = [item for item in locks if item.get("kind") not in {"CONTROL", "CARD"}]
        expected_policies = [item.get("offscreen_policy") for item in content_locks]
        if expected_policies and any(policy != expected_policies[0] for policy in expected_policies[1:]):
            add_issue(issues, "voice_visual_lock", "SCENE_MULTI_ATOM_POLICY_CONFLICT", "Átomos agrupados en un panel tienen offscreen_policy incompatibles.", scene_id)
        elif expected_policies and continuity.get("offscreen_policy") != expected_policies[0]:
            add_issue(issues, "voice_visual_lock", "SCENE_OFFSCREEN_LOCK_MISMATCH", "offscreen_policy no coincide con el lock del átomo.", scene_id)

        visible = {
            value
            for value in as_list(continuity.get("visible_entities"))
            if isinstance(value, str)
        }
        referenced = _record_referenced_ids(record, id_map)
        prompt = str(record.get("prompt") or "")
        prompt_normalized = normalized_text(prompt)
        for entity_id in expected_must_show:
            if entity_id not in registry:
                add_issue(issues, "voice_visual_lock", "VOICE_LOCK_ENTITY_UNKNOWN", f"must_show contiene ID no registrado: {entity_id}.", scene_id)
                continue
            if entity_id not in visible:
                add_issue(issues, "voice_visual_lock", "VOICE_ENTITY_NOT_VISIBLE", f"La voz obliga a mostrar {entity_id}, pero falta en visible_entities.", scene_id)
            if entity_id not in referenced:
                add_issue(issues, "voice_visual_lock", "VOICE_ENTITY_NOT_REFERENCED", f"La voz obliga a mostrar {entity_id}, pero falta su referencia.", scene_id)
            signature = registry[entity_id].get("prompt_signature")
            if not nonempty_text(signature) or normalized_text(signature) not in prompt_normalized:
                add_issue(issues, "voice_visual_lock", "VOICE_ENTITY_NOT_IN_PROMPT", f"La voz obliga a mostrar {entity_id}, pero el prompt no lo identifica.", scene_id)

        voice_text = "\n\n".join(str(item.get("text_exact") or "") for item in locks)
        voice_normalized = normalized_text(strip_tags(voice_text))
        expected_participants = {
            value
            for claim in expected_claims
            for value in as_list(claim.get("causal_participants"))
            if isinstance(value, str)
        }
        for entity_id, entity in registry.items():
            display_name = normalized_text(entity.get("display_name"))
            id_words = normalized_text(entity_id.replace("_", " "))
            explicitly_named = (
                bool(display_name and len(display_name.split()) >= 2 and display_name in voice_normalized)
                or bool(id_words and len(id_words.split()) >= 2 and id_words in voice_normalized)
            )
            if explicitly_named and entity_id not in expected_participants:
                add_issue(issues, "voice_visual_lock", "VOICE_NAMED_ENTITY_OMITTED", f"La voz nombra {entity_id}, pero ningún claim lo declara participante causal.", scene_id)

        atomic = as_dict(continuity.get("atomic_action"))
        registered_claim_actors = {
            claim.get("actor_id")
            for claim in expected_claims
            if claim.get("actor_id") in registry
        }
        if atomic.get("actor_id") == "environment" and registered_claim_actors:
            add_issue(
                issues,
                "voice_visual_lock",
                "VOICE_ACTOR_REPLACED_BY_ENVIRONMENT",
                f"atomic_action usa environment aunque la voz atribuye la acción a {sorted(registered_claim_actors)}.",
                scene_id,
            )
        matching_atomic_claim = False
        for claim in expected_claims:
            actor_id = claim.get("actor_id")
            action = claim.get("action")
            kind = lock_by_atom.get(claim.get("atom_id"), {}).get("kind")
            for token in as_list(claim.get("required_visual_tokens")):
                if isinstance(token, str) and not _visual_token_evidenced(token, prompt):
                    add_issue(
                        issues,
                        "voice_visual_lock",
                        "VOICE_REQUIRED_VISUAL_TOKEN_NOT_IN_PROMPT",
                        f"El prompt no muestra el token físico requerido {token!r} de {claim.get('atom_id')}.",
                        scene_id,
                    )
            action_evidenced = atomic_verb_evidenced(action, prompt)
            if kind == "EVENT" and not action_evidenced:
                add_issue(
                    issues,
                    "voice_visual_lock",
                    "VOICE_EVENT_NOT_IN_PROMPT",
                    f"El prompt no demuestra la acción narrativa {action!r} de {claim.get('atom_id')}.",
                    scene_id,
                )
            actor_matches = atomic.get("actor_id") == actor_id
            action_matches = atomic_verb_evidenced(action, atomic.get("verb")) or atomic_verb_evidenced(atomic.get("verb"), action)
            if actor_matches and action_matches:
                matching_atomic_claim = True
                target_id = claim.get("receiver_or_target_id")
                if target_id in registry and atomic.get("target_id") != target_id:
                    add_issue(
                        issues,
                        "voice_visual_lock",
                        "VOICE_TARGET_ATOMIC_MISMATCH",
                        f"atomic_action.target_id debe conservar el receptor/objetivo {target_id}.",
                        scene_id,
                    )
            resolved = claim.get("resolved_from_atom_id")
            if resolved is not None:
                prior = lock_by_atom.get(resolved, {})
                prior_participants = {
                    value
                    for prior_claim in as_list(prior.get("claims"))
                    if isinstance(prior_claim, dict)
                    for value in as_list(prior_claim.get("causal_participants"))
                    if isinstance(value, str)
                }
                if actor_id not in prior_participants or atom_order.get(resolved, 10**6) >= atom_order.get(claim.get("atom_id"), -1):
                    add_issue(issues, "voice_visual_lock", "VOICE_PRONOUN_RESOLUTION_BROKEN", f"{claim.get('atom_id')} no resuelve su actor desde un átomo previo válido.", scene_id)
            elif actor_id in registry and SPANISH_INHERITED_SUBJECT_RE.search(strip_tags(voice_text)):
                actor_name = normalized_text(registry[actor_id].get("display_name"))
                if actor_name not in voice_normalized:
                    add_issue(issues, "voice_visual_lock", "VOICE_PRONOUN_RESOLUTION_MISSING", f"La voz elide el sujeto {actor_id}; resolved_from_atom_id es obligatorio.", scene_id)

        if expected_claims and not matching_atomic_claim:
            add_issue(
                issues,
                "voice_visual_lock",
                "VOICE_ATOMIC_ACTION_SUBSTITUTED",
                "atomic_action sustituye actor/acción narrados por una reacción, consecuencia o evento distinto.",
                scene_id,
            )
        if record.get("plan", {}).get("beat") == "HOOK" and any(
            item.get("kind") == "EVENT" for item in content_locks
        ):
            policy = as_dict(continuity.get("offscreen_policy"))
            if policy.get("mode") != "FORBIDDEN" or as_list(policy.get("allowed_ids")):
                add_issue(issues, "voice_visual_lock", "HOOK_EVENT_OFFSCREEN_FORBIDDEN", "El hook debe representar literalmente sus eventos; no admite participantes causales fuera de cuadro.", scene_id)


def validate_declared_asset_usage(
    data: dict[str, Any],
    records: list[dict[str, Any]],
    scenarios: dict[str, dict[str, Any]],
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    """Reject generation cost that has no consumer and require available re-anchors."""
    used_poses: set[tuple[str, str]] = set()
    used_views: set[tuple[str, str]] = set()
    for record in records:
        if record.get("type") != "panel":
            continue
        refs = as_dict(record.get("scene", {}).get("references"))
        for group in ("characters", "assets"):
            for ref in as_list(refs.get(group)):
                if isinstance(ref, dict) and isinstance(ref.get("id"), str) and isinstance(ref.get("pose"), str):
                    used_poses.add((ref["id"], ref["pose"]))
        scenario_ref = refs.get("escenario")
        if isinstance(scenario_ref, dict) and isinstance(scenario_ref.get("id"), str) and isinstance(scenario_ref.get("view"), str):
            used_views.add((scenario_ref["id"], scenario_ref["view"]))

        plan = as_dict(record.get("plan"))
        continuity = as_dict(record.get("continuity"))
        if (
            plan.get("shot_scale") in {"WIDE_MASTER", "TRUE_LONG"}
            and plan.get("page_layout") not in WHITE_LAYOUTS | {"BLACK_INSET"}
            and continuity.get("space_type") != "ABSTRACT"
            and scenario_ref is None
            and reference_count(refs) < 3
            and scenarios
        ):
            add_issue(
                issues,
                "continuity",
                "MASTER_SCENARIO_REANCHOR_REQUIRED",
                "WIDE_MASTER/TRUE_LONG tiene cupo de referencia y debe usar una view de escenario como reanclaje.",
                record["id"],
            )

    # A derived pose can also be a genuine generation dependency of another pose.
    dependency_poses: set[tuple[str, str]] = set()
    for asset_id, asset in as_dict(data.get("characters")).items():
        if not isinstance(asset_id, str) or not isinstance(asset, dict):
            continue
        poses = as_dict(asset.get("poses"))
        for pose in poses.values():
            if isinstance(pose, dict) and isinstance(pose.get("reference_pose"), str):
                dependency_poses.add((asset_id, pose["reference_pose"]))
        for pose_id, pose in poses.items():
            if (
                isinstance(pose_id, str)
                and pose_id != "base"
                and isinstance(pose, dict)
                and pose.get("mode") == "generate"
                and (asset_id, pose_id) not in used_poses | dependency_poses
            ):
                add_issue(
                    issues,
                    "asset_registry",
                    "GENERATED_DERIVED_POSE_UNUSED",
                    f"Pose derivada generate sin consumidor: {asset_id}.{pose_id}.",
                )

    for scenario_id, scenario in scenarios.items():
        for view_id, view in as_dict(scenario.get("views")).items():
            if isinstance(view, dict) and view.get("mode") == "generate" and (scenario_id, view_id) not in used_views:
                add_issue(
                    issues,
                    "scenario_registry",
                    "GENERATED_SCENARIO_VIEW_UNUSED",
                    f"View generate declarada pero nunca referenciada: {scenario_id}.{view_id}.",
                )
    return {
        "used_poses": sorted(f"{asset_id}.{pose_id}" for asset_id, pose_id in used_poses),
        "used_views": sorted(f"{scenario_id}.{view_id}" for scenario_id, view_id in used_views),
    }


def validate_creature_progression(
    records: list[dict[str, Any]],
    registry: dict[str, dict[str, Any]],
    pose_roles: dict[tuple[str, str], str],
    packet: dict[str, Any] | None,
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    """Impide reutilizar una criatura estÃ¡tica durante una cadena de acciÃ³n."""
    creatures = {item_id for item_id, item in registry.items() if item.get("asset_type") == "creature"}
    phase_role = {
        "GEOGRAPHY": {"trapped", "base"},
        "ANTICIPATION": {"charge"},
        "TRAJECTORY": {"attack"},
        "CONTACT": {"attack"},
        "CONSEQUENCE": {"impact"},
        "REACTION": {"collapse"},
    }
    evidence = {
        "trapped": re.compile(r"\b(?:trapped|pinned|immobilized)\b", re.I),
        "charge": re.compile(r"\b(?:charges?|coils?|braces?|gathers?|prepares?)\b", re.I),
        "attack": re.compile(r"\b(?:attacks?|lunges?|leaps?|strikes?|claws?|bites?)\b", re.I),
        "impact": re.compile(r"\b(?:impact|hit|struck|blasted|cracked|thrown)\b", re.I),
        "collapse": re.compile(r"\b(?:collapses?|fallen|broken|defeated|lies|lying)\b", re.I),
    }
    groups: dict[str, list[dict[str, Any]]] = {}
    first_role: dict[str, tuple[str, str]] = {}
    for record in records:
        if record.get("type") != "panel":
            continue
        action = as_dict(record.get("plan", {}).get("action"))
        sequence_id = action.get("sequence_id")
        phase = action.get("phase")
        refs = as_dict(record.get("scene", {}).get("references"))
        direct_roles: dict[str, str] = {}
        for ref in as_list(refs.get("assets")):
            if not isinstance(ref, dict) or ref.get("id") not in creatures:
                continue
            creature_id = str(ref["id"])
            role = pose_roles.get((creature_id, str(ref.get("pose"))))
            if isinstance(role, str):
                direct_roles[creature_id] = role
                first_role.setdefault(creature_id, (role, record["id"]))
        record["creature_roles"] = direct_roles
        if nonempty_text(sequence_id) and phase in phase_role:
            groups.setdefault(str(sequence_id), []).append(record)

    progress_report: dict[str, Any] = {}
    for sequence_id, group in groups.items():
        sequence_creatures = {
            creature_id
            for record in group
            for creature_id in as_dict(record.get("creature_roles"))
        }
        for creature_id in sorted(sequence_creatures):
            used: list[str] = []
            for record in group:
                phase = as_dict(record.get("plan", {}).get("action")).get("phase")
                role = as_dict(record.get("creature_roles")).get(creature_id)
                allowed = phase_role.get(str(phase), set())
                if role not in allowed:
                    add_issue(
                        issues,
                        "action_sequences",
                        "CREATURE_PHASE_ROLE_MISMATCH",
                        f"{sequence_id}/{creature_id}: fase {phase} exige pose_role {sorted(allowed)}, no {role!r}.",
                        record["id"],
                    )
                    continue
                used.append(str(role))
                role_evidence = evidence.get(str(role))
                if role_evidence and not role_evidence.search(record.get("prompt", "")):
                    add_issue(
                        issues,
                        "action_sequences",
                        "CREATURE_ROLE_PROMPT_EVIDENCE_MISSING",
                        f"Prompt no dramatiza el estado {role} de {creature_id}.",
                        record["id"],
                    )
            required_roles = {"charge", "attack", "impact", "collapse"}
            if not required_roles.issubset(set(used)):
                add_issue(
                    issues,
                    "action_sequences",
                    "CREATURE_ACTION_STATES_UNUSED",
                    f"{sequence_id}/{creature_id} debe usar charge, attack, impact y collapse; faltan {sorted(required_roles - set(used))}.",
                )
            progress_report[f"{sequence_id}:{creature_id}"] = used

    state_contract = as_dict(as_dict(as_dict(packet or {}).get("machine_lock")).get("state_contract"))
    for creature_id, (role, scene_id) in first_role.items():
        initial_values = [
            as_dict(spec).get("initial")
            for key, spec in state_contract.items()
            if isinstance(key, str) and key.split(".", 1)[0] == creature_id
        ]
        if any("trapped" in normalized_text(value) for value in initial_values) and role != "trapped":
            add_issue(issues, "continuity", "CREATURE_INITIAL_ROLE_MISMATCH", f"{creature_id} inicia trapped pero su primera pose es {role}.", scene_id)
    return progress_report


def validate_action_phase_evidence(records: list[dict[str, Any]], issues: list[dict[str, Any]]) -> None:
    """Coteja que las fases describan instantes distintos, no solo metadata distinta."""
    anticipation_re = re.compile(r"\b(?:braces?|draws? back|coils?|raises?|prepares?|before impact|gathers? force)\b", re.I)
    trajectory_re = re.compile(r"\b(?:toward|across|through|midair|charges?|lunges?|flies|arcs?|rushes?|dives?)\b", re.I)
    contact_re = re.compile(r"\b(?:hits?|strikes?|collides?|touches?|grips?|catches?|slams?|bites?|claws?\s+(?:at|into|across))\b", re.I)
    contact_point_re = re.compile(r"\b(?:hand|palm|fist|claw|jaw|shoulder|chest|ground|floor|column|wall|surface|armor|body)\b[\s\S]{0,45}\b(?:against|into|on|at|from|toward|meets?)\b|\b(?:against|into|on|at)\b[\s\S]{0,45}\b(?:hand|palm|fist|claw|jaw|shoulder|chest|ground|floor|column|wall|surface|armor|body)\b", re.I)
    consequence_re = re.compile(r"\b(?:breaks?|cracks?|falls?|collapses?|extinguishes?|is hurled|debris|shatters?|splits?|buckles?)\b", re.I)
    completed_contact_re = re.compile(r"\b(?:hits?|strikes?|collides?|touches?|grips?|catches?|slams?|impact|after the hit|already struck)\b", re.I)
    for record in records:
        if record.get("type") != "panel":
            continue
        plan = record.get("plan", {})
        phase = as_dict(plan.get("action")).get("phase")
        if phase not in set(ACTION_ORDER):
            continue
        prompt = record.get("prompt", "")
        scene_id = record["id"]
        if phase == "GEOGRAPHY":
            spatial_tokens = {
                token
                for token in ("screen-left", "screen-right", "foreground", "midground", "background", "upper third", "middle third", "lower third")
                if token in prompt.lower()
            }
            if plan.get("shot_scale") not in {"WIDE_MASTER", "TRUE_LONG"} or len(spatial_tokens) < 2 or not re.search(r"\b(?:attacker|actor|creature|worker|protagonist)\b", prompt, re.I) or not re.search(r"\b(?:target|victim|opponent|child|worker|creature)\b", prompt, re.I):
                add_issue(issues, "action_sequences", "GEOGRAPHY_PROMPT_EVIDENCE_MISSING", "GEOGRAPHY exige master y posiciones legibles de actor/objetivo en dos capas o tercios.", scene_id)
        elif phase == "ANTICIPATION":
            if not anticipation_re.search(prompt) or contact_re.search(prompt):
                add_issue(issues, "action_sequences", "ANTICIPATION_PROMPT_EVIDENCE_INVALID", "ANTICIPATION exige preparacion antes del contacto y prohíbe contacto consumado.", scene_id)
        elif phase == "TRAJECTORY":
            if not trajectory_re.search(prompt) or completed_contact_re.search(prompt):
                add_issue(issues, "action_sequences", "TRAJECTORY_PROMPT_EVIDENCE_INVALID", "TRAJECTORY exige movimiento direccional sin contacto ya consumado.", scene_id)
        elif phase == "CONTACT":
            if not contact_re.search(prompt) or not contact_point_re.search(prompt):
                add_issue(issues, "action_sequences", "CONTACT_PROMPT_EVIDENCE_MISSING", "CONTACT exige verbo de choque y punto/direccion de contacto explícitos.", scene_id)
        elif phase == "CONSEQUENCE":
            continuity = record.get("continuity", {})
            before = as_dict(continuity.get("state_before"))
            after = as_dict(continuity.get("state_after"))
            reasons = as_dict(continuity.get("state_change_reason"))
            changed = {key for key in set(before) & set(after) if before.get(key) != after.get(key)}
            if not changed or not changed.issubset(set(reasons)) or not consequence_re.search(prompt):
                add_issue(issues, "action_sequences", "CONSEQUENCE_STATE_EVIDENCE_MISSING", "CONSEQUENCE exige cambio físico visible y mutación de estado causada.", scene_id)
        elif phase == "REACTION":
            reaction_performances = [
                item
                for item in as_list(plan.get("performances"))
                if isinstance(item, dict) and item.get("mode") in REACTION_PERFORMANCES and nonempty_text(item.get("reaction_to"))
            ]
            no_human_punctuation = not as_list(plan.get("performances")) and plan.get("low_density_kind") != "NONE"
            if not reaction_performances and not no_human_punctuation:
                add_issue(issues, "action_sequences", "REACTION_CAUSAL_EVIDENCE_MISSING", "REACTION exige actuacion humana causal o consecuencia silenciosa de baja densidad.", scene_id)


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
            action_phase = as_dict(record["plan"].get("action")).get("phase")
            subpanel_phases = {
                subpanel.get("action_phase")
                for subpanel in as_list(record["plan"].get("subpanels"))
                if isinstance(subpanel, dict)
            }
            forced_tension = (
                record["plan"].get("beat") in FORCED_TENSION_BEATS
                or action_phase in FORCED_TENSION_PHASES
                or bool(subpanel_phases & FORCED_TENSION_PHASES)
            )
            if visible_humans and forced_tension and record["plan"].get("high_tension") is not True:
                add_issue(issues, "reaction_range_causality", "HIGH_TENSION_SEMANTIC_REQUIRED", "Beat/fase de peligro con humano visible exige high_tension=true.", scene_id)
            if visible_humans and forced_tension:
                for item in performance_items:
                    if item.get("entity_id") in visible_humans and enum_contains(item.get("mode"), {"NONE", "NEUTRAL_INTENTIONAL"}):
                        add_issue(issues, "reaction_range_causality", "FORCED_TENSION_HUMAN_NEUTRAL", f"Humano visible {item.get('entity_id')} necesita actuacion activa por beat/fase.", scene_id)
            for subpanel in as_list(record["plan"].get("subpanels")):
                if not isinstance(subpanel, dict) or subpanel.get("action_phase") not in FORCED_TENSION_PHASES | {"REACTION"}:
                    continue
                for item in as_list(subpanel.get("performances")):
                    if isinstance(item, dict) and enum_contains(item.get("mode"), {"NONE", "NEUTRAL_INTENTIONAL"}):
                        add_issue(issues, "reaction_range_causality", "SUBPANEL_ACTION_HUMAN_NEUTRAL", f"Subpanel activo no admite actuacion neutral para {item.get('entity_id')}.", scene_id)
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
    for index, text in enumerate(voice_texts):
        scene_id = records[index]["id"]
        if text.startswith("\n"):
            add_issue(
                issues,
                "full_script_exact",
                "VOICEOVER_LEADING_LF",
                "voiceover.text no puede comenzar con LF; el LF adicional del separador pertenece al bloque izquierdo.",
                scene_id,
            )
        if index < len(voice_texts) - 1:
            if not text.endswith("\n") or text.endswith("\n\n"):
                add_issue(
                    issues,
                    "full_script_exact",
                    "VOICEOVER_BOUNDARY_LF_INVALID",
                    "Cada voiceover.text no final debe terminar en exactamente un LF para reconstruir el separador canónico.",
                    scene_id,
                )
        elif text.endswith("\n"):
            add_issue(
                issues,
                "full_script_exact",
                "VOICEOVER_FINAL_LF_FORBIDDEN",
                "El último voiceover.text no puede terminar en LF.",
                scene_id,
            )
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
            kind = "card"
        else:
            plan = record.get("plan", {})
            action = as_dict(plan.get("action"))
            if plan.get("page_layout") in {"WHITE_COMPOSITE_2", "WHITE_ACTION_STRIP_2"}:
                kind = "composite"
            elif plan.get("fragment_subject") != "NONE" or any(
                enum_contains(item.get("mode"), REACTION_PERFORMANCES)
                for item in as_list(plan.get("performances"))
                if isinstance(item, dict)
            ):
                kind = "fragment_or_reaction"
            elif action.get("phase") != "NONE" or plan.get("page_layout") == "TALL_ACTION":
                kind = "action"
            elif plan.get("shot_scale") in {"WIDE_MASTER", "TRUE_LONG"}:
                kind = "master"
            else:
                kind = "standard"
        minimum, maximum, max_seconds = VOICE_WINDOW_LIMITS[kind]
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
    if title_index is not None and starts[title_index] + scene_load[title_index]["estimated_seconds"] > 8:
        title_end = starts[title_index] + scene_load[title_index]["estimated_seconds"]
        add_issue(issues, "beat_coverage", "TITLE_TOO_LATE", f"Título termina a {title_end:.2f}s; máximo 8s.")
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

    valid_low_density_ids: set[str] = set()
    for record in panels:
        plan = record.get("plan", {})
        kind = plan.get("low_density_kind")
        if kind in {None, "NONE"}:
            continue
        visible_humans = {
            entity_id
            for entity_id in as_list(record.get("continuity", {}).get("visible_entities"))
            if isinstance(entity_id, str) and registry.get(entity_id, {}).get("asset_type") == "human"
        }
        valid = False
        if kind == "REACTION":
            has_reaction = any(
                isinstance(item, dict) and item.get("mode") in REACTION_PERFORMANCES
                for item in as_list(plan.get("performances"))
            )
            has_air = bool(re.search(r"\b(?:negative space|empty space|visual breathing room|isolated|open white space)\b", record.get("prompt", ""), re.I))
            valid = has_reaction and has_air
        elif kind == "ENVIRONMENT":
            valid = plan.get("dominant_subject_id") == "environment" and not visible_humans
        elif kind == "SILENT_LONG":
            valid = (
                plan.get("shot_scale") == "TRUE_LONG"
                and plan.get("beat") in {"CONSEQUENCE", "TRANSITION"}
                and is_number(plan.get("subject_pct"))
                and float(plan.get("subject_pct")) <= 20
            )
        if valid:
            valid_low_density_ids.add(record["id"])
        else:
            add_issue(issues, "visual_punctuation_range_distribution", "LOW_DENSITY_SEMANTICS_INVALID", f"{kind} no cumple semantica visual y no cuenta como respiro.", record["id"])

    punctuation_ids = {
        record["id"]
        for record in panels
        if record.get("plan", {}).get("page_layout") in WHITE_LAYOUTS | {"BLACK_INSET"}
        or record.get("plan", {}).get("fragment_subject") not in {None, "NONE"}
    } | valid_low_density_ids | {record["id"] for record in cards}
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
            occupants_before = before.get(occupants_key)
            occupants = after.get(occupants_key)
            if occupants_key not in state_contract:
                add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_STATE_LOCK_MISSING", f"MACHINE_LOCK carece de {occupants_key}.", scene_id)
            elif occupants_key not in before or occupants_key not in after:
                add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_OCCUPANTS_STATE_MISSING", f"{container_id} visible exige occupants en state_before y state_after.", scene_id)
            elif not isinstance(occupants, list) or len(occupants) != 1:
                add_issue(issues, "transparent_container_has_unique_occupant", "TRANSPARENT_CONTAINER_NOT_ONE", f"{container_id} visible necesita exactamente un ocupante.", scene_id)
            elif occupants_before != occupants and not nonempty_text(reasons.get(occupants_key)):
                add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_OCCUPANT_SWAP_UNCAUSED", f"{container_id} cambia ocupante sin causa MACHINE.", scene_id)
            if isinstance(occupants, list) and len(occupants) == 1:
                occupant_id = occupants[0]
                if occupant_id not in visible_ids or occupant_id not in registry or registry.get(str(occupant_id), {}).get("asset_type") != "human":
                    add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_OCCUPANT_NOT_VISIBLE_HUMAN", f"Ocupante {occupant_id!r} debe ser humano visible y referenciado.", scene_id)
                occupant_signature = registry.get(str(occupant_id), {}).get("prompt_signature")
                inside_formula = f"{occupant_signature} is the only person inside the transparent container"
                if not nonempty_text(occupant_signature) or normalized_text(inside_formula) not in normalized_text(record["prompt"]):
                    add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_OCCUPANT_IDENTITY_PROMPT_MISSING", f"Prompt debe enlazar la firma de {occupant_id} con el unico interior.", scene_id)
                other_visible_humans = {
                    value
                    for value in visible_ids
                    if value != occupant_id and registry.get(value, {}).get("asset_type") == "human"
                }
                for outside_id in sorted(other_visible_humans):
                    outside_signature = registry[outside_id].get("prompt_signature")
                    outside_formula = f"{outside_signature} remains completely outside the transparent container"
                    if not nonempty_text(outside_signature) or normalized_text(outside_formula) not in normalized_text(record["prompt"]):
                        add_issue(issues, "transparent_container_has_unique_occupant", "CONTAINER_OUTSIDE_IDENTITY_PROMPT_MISSING", f"Prompt debe declarar a {outside_id} completamente fuera.", scene_id)

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
    manifest: dict[str, Any] | None = None,
    manifest_issues: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = list(packet_issues or []) + list(manifest_issues or [])
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
    validate_production_lock(data, pipeline, packet, manifest, issues)
    registry, pose_roles, transparent = validate_assets(data, serie, issues)
    scenarios = validate_scenarios(data, serie, issues)
    has_existing = validate_existing_assets(data, serie, project.get("part"), manifest, issues)
    records = build_scene_records(data, registry, issues)
    beat_report = validate_story_beats(records, packet, issues)
    max_references = validate_references(records, registry, pose_roles, scenarios, issues)
    validate_semantic_alignment(records, registry, issues)
    validate_voice_visual_alignment(records, registry, packet, issues)
    asset_usage_report = validate_declared_asset_usage(data, records, scenarios, issues)
    creature_progression = validate_creature_progression(records, registry, pose_roles, packet, issues)
    validate_action_phase_evidence(records, issues)
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
        "creature_progression": creature_progression,
        "story_packet": {
            "path": packet.get("path") if packet else None,
            "sha256": packet.get("sha256") if packet else None,
            "monologue_sha256": packet.get("monologue_sha256") if packet else None,
            "segmentability": packet.get("segmentability") if packet else None,
            "beats": beat_report,
        },
        "asset_manifest": {
            "required": has_existing,
            "path": manifest.get("path") if manifest else None,
            "sha256": manifest.get("sha256") if manifest else None,
        },
        "asset_usage": asset_usage_report,
        "tts": {"audio_tags": TAG_RE.findall(full_script)},
        "validator_version": VALIDATOR_VERSION,
        "scope": "PROMPT_PREFLIGHT_ONLY",
    }


def packet_only_report(packet: dict[str, Any], issues: list[dict[str, Any]], packet_path: Path) -> dict[str, Any]:
    """Reporte ejecutable por el Showrunner antes del handoff al Director."""
    ready = not issues
    return {
        "file": str(packet_path.resolve()),
        "status": "PACKET_READY" if ready else "BLOCKED_CANON",
        "preflight_status": "PACKET_READY" if ready else "BLOCKED_CANON",
        "errors": issues,
        "story_packet": {
            "sha256": packet.get("sha256"),
            "packet_id": as_dict(packet.get("machine_lock")).get("packet_id"),
            "monologue_sha256": packet.get("monologue_sha256"),
            "segmentability": packet.get("segmentability"),
        },
        "validator_version": VALIDATOR_VERSION,
        "scope": "STORY_PACKET_PREFLIGHT_ONLY",
    }


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "--packet-only":
        packet_path = Path(argv[2]).expanduser().resolve()
        try:
            packet, packet_issues = parse_story_packet(packet_path.read_bytes(), packet_path)
            report = packet_only_report(packet, packet_issues, packet_path)
        except FileNotFoundError:
            report = {
                "file": str(packet_path),
                "status": "BLOCKED_CANON",
                "preflight_status": "BLOCKED_CANON",
                "errors": [{
                    "gate": "production_lock",
                    "code": "FILE_NOT_FOUND",
                    "message": "No se encontró el Story Packet.",
                }],
                "validator_version": VALIDATOR_VERSION,
                "scope": "STORY_PACKET_PREFLIGHT_ONLY",
            }
        except OSError as error:
            report = {
                "file": str(packet_path),
                "status": "BLOCKED_CANON",
                "preflight_status": "BLOCKED_CANON",
                "errors": [{
                    "gate": "production_lock",
                    "code": "FILE_READ_ERROR",
                    "message": str(error),
                }],
                "validator_version": VALIDATOR_VERSION,
                "scope": "STORY_PACKET_PREFLIGHT_ONLY",
            }
        except Exception as error:  # fail closed sin traceback
            report = {
                "file": str(packet_path),
                "status": "BLOCKED_CANON",
                "preflight_status": "BLOCKED_CANON",
                "errors": [{
                    "gate": "story_packet_segmentability",
                    "code": "VALIDATOR_INTERNAL_ERROR",
                    "message": f"{type(error).__name__}: {error}",
                }],
                "validator_version": VALIDATOR_VERSION,
                "scope": "STORY_PACKET_PREFLIGHT_ONLY",
            }
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
        return 0 if report.get("preflight_status") == "PACKET_READY" else 1

    if len(argv) not in {3, 4}:
        report = failure_report(
            "",
            "USAGE",
            "Uso: python validate_v5_3.py <proyecto.json> <STORY_PACKET.md> [EXISTING_ASSET_MANIFEST.json] "
            "o python validate_v5_3.py --packet-only <STORY_PACKET.md>",
        )
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
        return 1
    try:
        absolute, data = load_json(argv[1])
        packet_path = Path(argv[2]).expanduser().resolve()
        packet, packet_issues = parse_story_packet(packet_path.read_bytes(), packet_path)
        manifest = None
        manifest_issues: list[dict[str, Any]] = []
        if len(argv) == 4:
            manifest_path = Path(argv[3]).expanduser().resolve()
            manifest, manifest_issues = parse_asset_manifest(manifest_path.read_bytes(), manifest_path)
        report = validate(data, absolute, packet, packet_issues, manifest, manifest_issues)
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
