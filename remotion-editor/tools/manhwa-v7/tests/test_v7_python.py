from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
VALIDATOR_PATH = ROOT / "tools" / "manhwa-v7" / "validate_v7.py"
FIXTURE_PATH = ROOT / "pruebas" / "manhwa-v7" / "PILOT_10_SCENES_V7.json"
PACKET_PATH = FIXTURE_PATH.with_name("STORY_PACKET_PILOT_V7.md")


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validator = load_module("validate_v7_under_test", VALIDATOR_PATH)


def fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def errors(project: dict) -> list[str]:
    result, _ = validator.validate_project(project)
    return result.errors


def first_panel(project: dict) -> dict:
    return next(scene for scene in project["scenes"] if scene.get("type") == "panel")


def panel(project: dict, index: int) -> dict:
    return [scene for scene in project["scenes"] if scene.get("type") == "panel"][index]


class GrokNativePreflightTests(unittest.TestCase):
    def test_largest_remainder_examples(self) -> None:
        self.assertEqual(validator.largest_remainder_counts(43), {"white": 13, "black": 13, "other": 17})
        self.assertEqual(validator.largest_remainder_counts(10), {"white": 3, "black": 3, "other": 4})

    def test_canonical_fixture_is_clean(self) -> None:
        self.assertEqual(errors(fixture()), [])

    def test_references_v7_has_no_fixed_three_item_cap(self) -> None:
        digests = [f"{index:064x}" for index in range(1, 5)]
        refs = [
            {
                "id": f"ref_{index}",
                "role": "IDENTITY",
                "composition_authority": "IDENTITY_ONLY",
                "source_path": f"assets/ref_{index}.png",
                "sha256": digest,
                "compatible_views": [],
            }
            for index, digest in enumerate(digests, start=1)
        ]
        validation = validator.Validation()
        validator.validate_references(
            refs,
            {"viewpoint": "FRONT"},
            {"approved_reference_hashes": digests},
            validation,
            "scene.references_v7",
        )
        self.assertEqual(validation.errors, [])

    def test_preflight_fixture_with_linked_packet(self) -> None:
        self.assertTrue(validator.validate_preflight(FIXTURE_PATH).startswith("PROMPT_RELEASE_V7"))

    def test_production_packet_cannot_be_downgraded_to_pilot(self) -> None:
        project = fixture()
        self.assertEqual(project["v7_contract"]["mode"], "PILOT")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            packet_rel = project["production_lock"]["story_packet_path"]
            packet_path = root / packet_rel
            packet_path.parent.mkdir(parents=True, exist_ok=True)
            packet_text = PACKET_PATH.read_text(encoding="utf-8")
            packet_text = packet_text.replace("packet_scope: VALIDATOR_FIXTURE", "packet_scope: PRODUCTION_PART")
            packet_path.write_text(packet_text, encoding="utf-8")
            project["production_lock"]["story_packet_sha256"] = hashlib.sha256(packet_path.read_bytes()).hexdigest()
            project_path = root / "project.json"
            project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

            validation, context = validator.validate_project(project)
            self.assertEqual(validation.errors, [])
            with mock.patch.object(validator, "validate_packet", return_value="PACKET_READY_V7"), \
                    mock.patch.object(validator, "validate_obligation_mapping", return_value=None):
                validator.validate_linked_inputs(project_path, context, validation)
            self.assertTrue(any(
                "packet_scope PRODUCTION_PART no autorizado para mode PILOT" in item
                for item in validation.errors
            ))

    def test_generation_mode_is_required(self) -> None:
        project = fixture()
        project["v7_contract"]["generation_mode"] = "LEGACY_MODE"
        self.assertTrue(any("generation_mode" in item for item in errors(project)))

    def test_long_production_runtime_cannot_be_disguised_as_pilot(self) -> None:
        project = fixture()
        project["project"]["target_runtime_seconds"] = 95
        self.assertTrue(any(
            "PILOT contradice project.target_runtime_seconds=95" in item
            for item in errors(project)
        ))

    def test_runtime_adapter_disables_slots(self) -> None:
        project = fixture()
        project["v7_contract"]["runtime_adapter"]["page_blueprint_slots_integrated"] = True
        self.assertTrue(any("page_blueprint_slots_integrated" in item for item in errors(project)))

    def test_visual_contains_only_image_prompt(self) -> None:
        project = fixture()
        first_panel(project)["visual"]["source"] = "images/scene_01.jpg"
        self.assertTrue(any("visual" in item and "exclusivamente" in item for item in errors(project)))

    def test_non_natural_machine_prompt_is_rejected(self) -> None:
        project = fixture()
        first_panel(project)["visual"]["image_prompt"] = "INVALID_MACHINE_PROMPT"
        self.assertTrue(any("image_prompt" in item for item in errors(project)))

    def test_one_source_record_per_scene(self) -> None:
        project = fixture()
        result, context = validator.validate_project(project)
        self.assertEqual(result.errors, [])
        self.assertEqual(len(context["sources"]), 10)
        self.assertEqual([item["scene_id"] for item in context["sources"]], [f"scene_{i:02d}" for i in range(1, 11)])

    def test_white_requires_exact_page_anchor(self) -> None:
        project = fixture()
        scene = next(item for item in project["scenes"] if item.get("visual_plan", {}).get("native_page", {}).get("family") == "WHITE_PAGE")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace("Pure white webtoon page", "White illustration")
        self.assertTrue(any("Pure white webtoon page" in item for item in errors(project)))

    def test_black_requires_exact_page_anchor(self) -> None:
        project = fixture()
        scene = next(item for item in project["scenes"] if item.get("visual_plan", {}).get("native_page", {}).get("family") == "BLACK_PAGE")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace("Matte-black webtoon page", "Dark illustration")
        self.assertTrue(any("Matte-black webtoon page" in item for item in errors(project)))

    def test_white_percentage_must_be_literal(self) -> None:
        project = fixture()
        scene = first_panel(project)
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace("50% of the canvas", "49% of the canvas")
        self.assertTrue(any("50%" in item for item in errors(project)))

    def test_other_cannot_claim_white_page(self) -> None:
        project = fixture()
        scene = next(item for item in project["scenes"] if item.get("visual_plan", {}).get("native_page", {}).get("family") == "OTHER")
        scene["visual"]["image_prompt"] = "Pure white webtoon page. " + scene["visual"]["image_prompt"]
        self.assertTrue(any("OTHER" in item for item in errors(project)))

    def test_seven_machine_blocks_are_rejected_for_scene_prompt(self) -> None:
        project = fixture()
        scene = first_panel(project)
        scene["visual"]["image_prompt"] = "\n".join([
            "CAMERA: machine.", "SUBJECTS: subject.", "ACTION: action.", "ENVIRONMENT: room.",
            "LIGHTING: light.", "STYLE: style.", "NEGATIVE: no readable text.",
        ])
        self.assertTrue(any("siete bloques" in item or "WHITE_PAGE" in item for item in errors(project)))

    def test_negative_tokens_include_no_captions(self) -> None:
        project = fixture()
        scene = first_panel(project)
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace("no captions", "")
        self.assertTrue(any("no captions" in item for item in errors(project)))

    def test_environment_shortcut_is_rejected(self) -> None:
        project = fixture()
        scene = first_panel(project)
        scene["visual"]["image_prompt"] += " Same morgue geometry and materials."
        self.assertTrue(any("atajo ambiental" in item for item in errors(project)))

    def test_character_signature_is_literal_per_fragment(self) -> None:
        project = fixture()
        scene = first_panel(project)
        signature = project["characters"]["cleaner"]["prompt_signature"]
        shot = scene["visual_plan"]["shots"][0]
        replacement = shot["prompt_fragment"].replace(signature, "Mujin")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("nombre no basta" in item for item in errors(project)))

    def test_scenario_root_signature_is_literal_per_fragment(self) -> None:
        project = fixture()
        scene = first_panel(project)
        signature = project["escenarios"]["morgue"]["prompt_signature"]
        shot = scene["visual_plan"]["shots"][0]
        replacement = shot["prompt_fragment"].replace(signature, "a morgue")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("prompt_signature raíz" in item for item in errors(project)))

    def test_view_signature_is_literal_per_fragment(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][0]
        view = project["escenarios"]["morgue"]["views"][shot["view_id"]]["prompt_signature"]
        replacement = shot["prompt_fragment"].replace(view, "another angle")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("views." in item or "prompt_signature de escenarios" in item for item in errors(project)))

    def test_natural_scale_term_is_required(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][0]
        replacement = shot["prompt_fragment"].replace("wide master", "unspecified framing")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("scale=WIDE_MASTER" in item for item in errors(project)))

    def test_natural_elevation_term_is_required(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][0]
        replacement = shot["prompt_fragment"].replace("eye-level", "unspecified height")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("elevation=EYE_LEVEL" in item for item in errors(project)))

    def test_natural_viewpoint_term_is_required(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][0]
        replacement = shot["prompt_fragment"].replace("front view", "unspecified view")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("viewpoint=FRONT" in item for item in errors(project)))

    def test_multi_panel_uses_panel_labels(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][1]
        replacement = shot["prompt_fragment"].replace("Panel B:", "Second image:")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(shot["prompt_fragment"], replacement)
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("Panel B:" in item for item in errors(project)))

    def test_inset_without_exact_image_panel_count_is_rejected(self) -> None:
        project = fixture()
        scene = next(item for item in project["scenes"]
                     if item.get("visual_plan", {}).get("native_page", {}).get("layout") == "BLACK_INSET")
        composition = scene["visual_plan"]["native_page"]["composition"]
        replacement = composition.replace("exactly one image panel; ", "")
        scene["visual_plan"]["native_page"]["composition"] = replacement
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(composition, replacement)
        self.assertTrue(any("exactly one image panel" in item for item in errors(project)))

    def test_multi_panel_requires_material_camera_change(self) -> None:
        project = fixture()
        scene = first_panel(project)
        scene["visual_plan"]["shots"][1]["camera"] = copy.deepcopy(scene["visual_plan"]["shots"][0]["camera"])
        self.assertTrue(any("materialmente distintas" in item for item in errors(project)))

    def test_layout_cardinality_is_exact(self) -> None:
        project = fixture()
        scene = first_panel(project)
        scene["visual_plan"]["native_page"]["panel_count"] = 1
        self.assertTrue(any("WHITE_COMPOSITE_2 exige 2" in item for item in errors(project)))

    def test_white_background_range_is_enforced(self) -> None:
        project = fixture()
        first_panel(project)["visual_plan"]["native_page"]["background_pct"] = 95
        self.assertTrue(any("WHITE_PAGE usa 30..90" in item for item in errors(project)))

    def test_black_background_range_is_enforced(self) -> None:
        project = fixture()
        scene = next(item for item in project["scenes"] if item.get("visual_plan", {}).get("native_page", {}).get("family") == "BLACK_PAGE")
        scene["visual_plan"]["native_page"]["background_pct"] = 80
        self.assertTrue(any("BLACK_PAGE usa 45..75" in item for item in errors(project)))

    def test_other_background_is_zero(self) -> None:
        project = fixture()
        scene = next(item for item in project["scenes"] if item.get("visual_plan", {}).get("native_page", {}).get("family") == "OTHER")
        scene["visual_plan"]["native_page"]["background_pct"] = 5
        self.assertTrue(any("OTHER usa exactamente 0" in item for item in errors(project)))

    def test_page_mix_counts_are_exact(self) -> None:
        project = fixture()
        project["v7_contract"]["page_mix"]["counts"] = {"white": 4, "black": 2, "other": 4}
        self.assertTrue(any("page_mix.counts" in item for item in errors(project)))

    def test_page_mix_basis_is_required(self) -> None:
        project = fixture()
        del project["v7_contract"]["page_mix"]["basis"]
        self.assertTrue(any("page_mix.basis" in item for item in errors(project)))

    def test_natural_lens_phrase_is_required(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][0]
        replacement = shot["prompt_fragment"].replace(", using a 50mm lens", "")
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(
            shot["prompt_fragment"], replacement
        )
        shot["prompt_fragment"] = replacement
        self.assertTrue(any("50mm lens" in item for item in errors(project)))

    def test_geometry_lock_reference_matches_first_shot(self) -> None:
        project = fixture()
        first_panel(project)["references"]["escenario"]["view"] = "view_02"
        self.assertTrue(any("view_id del primer shot" in item for item in errors(project)))

    def test_geometry_lock_primary_camera_must_match_runtime_reference(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][0]
        old_fragment = shot["prompt_fragment"]
        new_fragment = old_fragment.replace("using a 50mm lens", "using a 80mm lens")
        shot["camera"]["lens_mm"] = 80
        shot["prompt_fragment"] = new_fragment
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(old_fragment, new_fragment)
        self.assertTrue(any("camera_signature de la vista no coincide" in item for item in errors(project)))

    def test_secondary_camera_metadata_does_not_block_preflight(self) -> None:
        project = fixture()
        scene = first_panel(project)
        shot = scene["visual_plan"]["shots"][1]
        old_fragment = shot["prompt_fragment"]
        new_fragment = old_fragment.replace("using a 35mm lens", "using a 65mm lens")
        shot["camera"]["lens_mm"] = 65
        shot["prompt_fragment"] = new_fragment
        scene["visual"]["image_prompt"] = scene["visual"]["image_prompt"].replace(old_fragment, new_fragment)
        self.assertEqual(errors(project), [])

    def test_identity_only_requires_reason(self) -> None:
        project = fixture()
        first_panel(project)["references"]["escenario"]["geometry_authority"] = "IDENTITY_ONLY"
        self.assertTrue(any("identity_only_reason" in item for item in errors(project)))

    def test_packet_rejects_legacy_own_source_field(self) -> None:
        text = PACKET_PATH.read_text(encoding="utf-8")
        text = text.replace('"must_be_own_generated_page": true', '"must_be_own_source": true', 1)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "packet.md"
            path.write_text(text, encoding="utf-8")
            with self.assertRaises(validator.ValidationFailure) as raised:
                validator.validate_packet(path)
        self.assertIn("must_be_own_source", str(raised.exception))

    def test_packet_exclusive_page_cannot_be_shareable(self) -> None:
        text = PACKET_PATH.read_text(encoding="utf-8")
        text = text.replace('"may_share_page": false', '"may_share_page": true', 1)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "packet.md"
            path.write_text(text, encoding="utf-8")
            with self.assertRaises(validator.ValidationFailure) as raised:
                validator.validate_packet(path)
        self.assertIn("must_be_own_generated_page", str(raised.exception))

    def test_exclusive_obligation_may_expand_to_multiple_dedicated_pages(self) -> None:
        packet_text = """
## MACHINE_LOCK_V7

```json
{"voice_visual_lock":[{"atom_id":"A001"}]}
```

## visual_obligations

```json
[{"obligation_id":"O001","atom_ids":["A001"],"must_show":["hero","sealed object"],"required_relationship":"hero observes sealed object","must_be_own_generated_page":true,"may_share_page":false}]
```
"""
        context = {
            "root": {
                "obligation_map": [{
                    "obligation_id": "O001",
                    "atom_ids": ["A001"],
                    "must_show": ["hero", "sealed object"],
                    "required_relationship": "hero observes sealed object",
                    "source_shot_ids": ["scene_01", "scene_02"],
                    "prompt_evidence": [
                        {"shot_id": "scene_01", "required_terms": ["hero", "sealed object"]},
                        {"shot_id": "scene_02", "required_terms": ["hero", "sealed object"]},
                    ],
                }],
            },
            "sources": [
                {"shot": {"shot_id": "scene_01"}, "prompt": "hero reaches toward a sealed object"},
                {"shot": {"shot_id": "scene_02"}, "prompt": "hero recoils from the sealed object"},
            ],
        }
        validation = validator.Validation()
        validator.validate_obligation_mapping(context, packet_text, validation)
        self.assertEqual(validation.errors, [])

    def test_no_three_equal_families_in_a_row(self) -> None:
        project = fixture()
        for index in (0, 1, 2):
            scene = panel(project, index)
            scene["visual_plan"]["native_page"]["family"] = "OTHER"
            scene["visual_plan"]["native_page"]["layout"] = ["FULL_BLEED", "SPLASH", "OBJECT_DETAIL"][index]
            scene["visual_plan"]["native_page"]["panel_count"] = 1
            scene["visual_plan"]["native_page"]["background_pct"] = 0
        self.assertTrue(any("máximo dos familias" in item for item in errors(project)))

    def test_adjacent_identical_layout_is_rejected(self) -> None:
        project = fixture()
        scene = panel(project, 1)
        scene["visual_plan"]["native_page"] = copy.deepcopy(panel(project, 0)["visual_plan"]["native_page"])
        self.assertTrue(any("layout idéntico" in item for item in errors(project)))

    def test_multipanel_quota_is_enforced(self) -> None:
        project = fixture()
        # Reduce the three canonical multipanel pages to singles.
        for scene in project["scenes"]:
            if scene.get("type") != "panel" or scene["visual_plan"]["native_page"]["panel_count"] == 1:
                continue
            family = scene["visual_plan"]["native_page"]["family"]
            replacement = "WHITE_ISOLATE" if family == "WHITE_PAGE" else "BLACK_INSET"
            scene["visual_plan"]["native_page"]["layout"] = replacement
            scene["visual_plan"]["native_page"]["panel_count"] = 1
            scene["visual_plan"]["shots"] = scene["visual_plan"]["shots"][:1]
        self.assertTrue(any("multipanel_pct" in item for item in errors(project)))

    def test_triptych_quota_is_enforced(self) -> None:
        project = fixture()
        # Declare a second triptych; other prompt errors are acceptable, the quota must also fire.
        scene = panel(project, 3)
        scene["visual_plan"]["native_page"]["layout"] = "WHITE_TRIPTYCH"
        scene["visual_plan"]["native_page"]["panel_count"] = 3
        scene["visual_plan"]["shots"] = [copy.deepcopy(scene["visual_plan"]["shots"][0]) for _ in range(3)]
        for index, shot in enumerate(scene["visual_plan"]["shots"]):
            shot["panel_id"] = chr(ord("A") + index)
        self.assertTrue(any("triptychs" in item for item in errors(project)))

    def test_white_and_black_are_static(self) -> None:
        project = fixture()
        first_panel(project)["editor_motion"] = {"enabled": True, "preset": "slow_zoom", "zoom": 1.04, "pan": 0}
        self.assertTrue(any("motion static" in item for item in errors(project)))

    def test_tts_dialogue_is_exact(self) -> None:
        project = fixture()
        project["tts_export"]["dialogue"][0]["text"] += " drift"
        self.assertTrue(any("tts_export.dialogue" in item for item in errors(project)))

    def test_visual_panel_may_be_silent_without_changing_locked_monologue(self) -> None:
        project = fixture()
        silent_scene = panel(project, 1)
        del silent_scene["voiceover"]
        del silent_scene["captions"]
        dialogue = [
            {
                "scene_id": scene["id"],
                "speaker": scene["voiceover"]["speaker"],
                "text": scene["voiceover"]["text"],
            }
            for scene in project["scenes"]
            if isinstance(scene.get("voiceover"), dict)
            and isinstance(scene["voiceover"].get("text"), str)
            and scene["voiceover"]["text"].strip()
        ]
        full_script = "\n".join(row["text"] for row in dialogue)
        project["tts_export"]["dialogue"] = dialogue
        project["tts_export"]["full_script"] = full_script
        project["production_lock"]["monologue_sha256"] = validator.canonical_hash(full_script)
        self.assertEqual(errors(project), [])

    def test_silent_visual_panel_must_omit_both_spoken_fields(self) -> None:
        project = fixture()
        del first_panel(project)["captions"]
        self.assertTrue(any("voiceover" in item or "captions" in item for item in errors(project)))


class GrokNativePostflightTests(unittest.TestCase):
    def build_postflight(self, root: Path) -> tuple[Path, Path, Path, Path]:
        contract_root = root / "contract"
        artifact_root = root / "artifacts"
        contract_root.mkdir()
        (artifact_root / "images").mkdir(parents=True)
        project = fixture()
        packet_rel = project["production_lock"]["story_packet_path"]
        packet_destination = contract_root / packet_rel
        packet_destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(PACKET_PATH, packet_destination)
        project_path = contract_root / "project.json"
        project_path.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        project_hash = validator.project_semantic_sha256(project)

        manifest_sources = []
        for scene in project["scenes"]:
            if scene.get("type") != "panel":
                continue
            scene_id = scene["id"]
            output_rel = f"images/{scene_id}.jpg"
            output = artifact_root / output_rel
            Image.new("RGB", (720, 1280), (40, 50, 60)).save(output, quality=94)
            digest = hashlib.sha256(output.read_bytes()).hexdigest()
            prompt = scene["visual"]["image_prompt"]
            manifest_sources.append({
                "shot_id": scene_id,
                "prompt": prompt,
                "model": "factual-test-model",
                "settings": {"aspect_ratio": "9:16", "seed": 101},
                "job_id": f"job-{scene_id}",
                "output_path": output_rel,
                "output_sha256": digest,
                "generation_attempt": 1,
                "status": "APPROVED",
                "attempt_history": [{
                    "attempt": 1,
                    "submitted_at": "2026-07-15T12:00:00Z",
                    "prompt": prompt,
                    "model": "factual-test-model",
                    "settings": {"aspect_ratio": "9:16", "seed": 101},
                    "references": [],
                    "job_id": f"job-{scene_id}",
                    "output_path": output_rel,
                    "output_sha256": digest,
                    "status": "APPROVED",
                }],
                "references": [],
            })
        manifest = {
            "schema": "GENERATION_MANIFEST_V7",
            "version": "7.0",
            "project_sha256": project_hash,
            "generated_at": "2026-07-15T12:10:00Z",
            "sources": manifest_sources,
        }
        manifest_path = contract_root / "GENERATION_MANIFEST_V7.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest()

        audit_sources = []
        generated = {item["shot_id"]: item for item in manifest_sources}
        panels = [scene for scene in project["scenes"] if scene.get("type") == "panel"]
        for scene in panels:
            plan = scene["visual_plan"]["native_page"]
            generated_item = generated[scene["id"]]
            audit_sources.append({
                "shot_id": scene["id"],
                "output_path": generated_item["output_path"],
                "output_sha256": generated_item["output_sha256"],
                "asset_status": "PASS",
                "page_result": "MATCH",
                "observed_page": copy.deepcopy(plan),
                "camera_result": "MATCH",
                "identity_status": "PASS",
                "text_status": "PASS",
                "bubble_status": "PASS",
                "crop_status": "PASS",
                "readability_status": "PASS",
                "observation": {
                    "type": "AUTOMATED",
                    "observer_id": "fixture-observer-v7",
                    "evidence": "Direct JPG inspected for native family, panel count, identity, text, bubbles, crop and camera.",
                },
                "confidence": 0.99,
                "failure_codes": [],
            })
        audit = {
            "schema": "RENDER_AUDIT_V7",
            "version": "7.0",
            "project_sha256": project_hash,
            "generation_manifest_sha256": manifest_hash,
            "sources": audit_sources,
            "sequence_review": {
                "status": "PASS",
                "source_shot_ids": [scene["id"] for scene in panels],
                "checks": {
                    "environment_view_repetition": "PASS",
                    "weather_overlay_repetition": "PASS",
                    "pose_repetition": "PASS",
                    "palette_monotony": "PASS",
                    "equivalent_composition_run": "PASS",
                },
                "evidence": ["All ten direct Grok-native JPG pages reviewed in sequence."],
            },
        }
        audit_path = contract_root / "RENDER_AUDIT_V7.json"
        audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return project_path, manifest_path, audit_path, artifact_root

    def test_full_direct_jpg_postflight_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = self.build_postflight(Path(tmp))
            self.assertTrue(validator.validate_postflight(*paths[:3], artifact_root=paths[3]).startswith("RENDER_RELEASE_V7"))

    def test_acceptable_background_variance_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project_path, manifest_path, audit_path, artifact_root = self.build_postflight(Path(tmp))
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            audit["sources"][0]["observed_page"]["background_pct"] += 10
            audit["sources"][0]["page_result"] = "ACCEPTABLE_VARIANCE"
            audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            self.assertTrue(validator.validate_postflight(project_path, manifest_path, audit_path, artifact_root).startswith("RENDER_RELEASE_V7"))

    def test_wrong_family_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project_path, manifest_path, audit_path, artifact_root = self.build_postflight(Path(tmp))
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            audit["sources"][0]["observed_page"]["family"] = "BLACK_PAGE"
            audit["sources"][0]["page_result"] = "MISS"
            audit["sources"][0]["asset_status"] = "RETAKE"
            audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            with self.assertRaises(validator.ValidationFailure):
                validator.validate_postflight(project_path, manifest_path, audit_path, artifact_root)

    def test_extra_panel_fails(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project_path, manifest_path, audit_path, artifact_root = self.build_postflight(Path(tmp))
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            audit["sources"][0]["observed_page"]["panel_count"] += 1
            audit["sources"][0]["page_result"] = "MISS"
            audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            with self.assertRaises(validator.ValidationFailure):
                validator.validate_postflight(project_path, manifest_path, audit_path, artifact_root)

    def test_bubble_failure_requires_retake(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            project_path, manifest_path, audit_path, artifact_root = self.build_postflight(Path(tmp))
            audit = json.loads(audit_path.read_text(encoding="utf-8"))
            audit["sources"][0]["bubble_status"] = "RETAKE"
            audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            with self.assertRaises(validator.ValidationFailure):
                validator.validate_postflight(project_path, manifest_path, audit_path, artifact_root)


if __name__ == "__main__":
    unittest.main()
