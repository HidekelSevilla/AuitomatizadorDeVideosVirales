#!/usr/bin/env python3
"""Deterministically precompose V6 manhwa pages outside Remotion.

The image generator produces one clean image per slot.  This utility crops,
masks, borders, rotates, and composites those sources into the final
720x1280 JPG consumed by the existing editor.  Source files are read-only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Sequence

from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageOps


CANVAS_WIDTH = 720
CANVAS_HEIGHT = 1280
CANVAS_SIZE = (CANVAS_WIDTH, CANVAS_HEIGHT)
MAX_UPSCALE = 1.15
SUPPORTED_FITS = {"cover", "contain"}
SUPPORTED_SHAPES = {"rect", "rounded", "circle", "diagonal_left", "diagonal_right"}
SCENE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
MASK_SCALE = 4
JS_MAX_SAFE_INTEGER = 9_007_199_254_740_991


class CompositionError(ValueError):
    """Raised when a project cannot be composed safely or deterministically."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


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
    try:
        normalized = _normalize_project_numbers(project)
    except ValueError as exc:
        raise CompositionError(str(exc)) from exc
    return sha256_json(normalized)


def _as_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise CompositionError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise CompositionError(f"{label} must be a finite number")
    return result


def _as_nonnegative_int(value: Any, label: str) -> int:
    number = _as_number(value, label)
    if number < 0 or not number.is_integer():
        raise CompositionError(f"{label} must be a non-negative integer")
    return int(number)


def _parse_color(value: Any, label: str) -> tuple[int, int, int, int]:
    if not isinstance(value, str) or not value.strip():
        raise CompositionError(f"{label} must be a Pillow-compatible color string")
    try:
        return ImageColor.getcolor(value.strip(), "RGBA")
    except ValueError as exc:
        raise CompositionError(f"invalid {label}: {value!r}") from exc


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def resolve_safe_source(public_root: Path, raw_path: Any, label: str) -> tuple[str, Path]:
    """Resolve a portable relative source path without permitting traversal."""

    if not isinstance(raw_path, str) or not raw_path.strip() or "\x00" in raw_path:
        raise CompositionError(f"{label} must be a non-empty relative path")
    portable = raw_path.strip().replace("\\", "/")
    posix = PurePosixPath(portable)
    windows = PureWindowsPath(raw_path.strip())
    if posix.is_absolute() or windows.is_absolute() or windows.drive:
        raise CompositionError(f"unsafe absolute source path in {label}: {raw_path!r}")
    if ".." in posix.parts or ".." in windows.parts:
        raise CompositionError(f"unsafe parent traversal in {label}: {raw_path!r}")
    if any(part in {"", "."} for part in posix.parts):
        raise CompositionError(f"unsafe source path in {label}: {raw_path!r}")

    candidate = public_root.joinpath(*posix.parts)
    try:
        resolved = candidate.resolve(strict=True)
    except (FileNotFoundError, OSError) as exc:
        raise CompositionError(f"source does not exist for {label}: {portable}") from exc
    if not _is_relative_to(resolved, public_root):
        raise CompositionError(f"source escapes PROJECT_PUBLIC_DIR in {label}: {raw_path!r}")
    if not resolved.is_file():
        raise CompositionError(f"source is not a file for {label}: {portable}")
    return posix.as_posix(), resolved


def _slot_box(slot: dict[str, Any], label: str) -> tuple[int, int, int, int]:
    x = _as_number(slot.get("x"), f"{label}.x")
    y = _as_number(slot.get("y"), f"{label}.y")
    w = _as_number(slot.get("w"), f"{label}.w")
    h = _as_number(slot.get("h"), f"{label}.h")
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1.0 + 1e-9 or y + h > 1.0 + 1e-9:
        raise CompositionError(f"{label} geometry must stay within normalized canvas coordinates")
    left = round(x * CANVAS_WIDTH)
    top = round(y * CANVAS_HEIGHT)
    right = round((x + w) * CANVAS_WIDTH)
    bottom = round((y + h) * CANVAS_HEIGHT)
    if right <= left or bottom <= top:
        raise CompositionError(f"{label} resolves to an empty pixel rectangle")
    return left, top, right, bottom


def _normalized_geometry(slot: dict[str, Any]) -> dict[str, float]:
    return {key: float(slot[key]) for key in ("x", "y", "w", "h")}


def _requested_revision(scene: dict[str, Any], visual: dict[str, Any], blueprint: dict[str, Any]) -> int:
    raw = blueprint.get("composition_revision", visual.get("composition_revision", scene.get("composition_revision", 1)))
    revision = _as_nonnegative_int(raw, "composition_revision")
    if revision < 1:
        raise CompositionError("composition_revision must be >= 1")
    return revision


def plan_project(
    project: dict[str, Any],
    public_root: Path,
    output_root: Path,
    project_sha256: str,
    scene_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    scenes = project.get("scenes")
    if not isinstance(scenes, list):
        raise CompositionError("project.scenes must be an array")

    project_meta = project.get("project") if isinstance(project.get("project"), dict) else {}
    project_id = project_meta.get("id", project_meta.get("slug", project_meta.get("title")))
    pages: list[dict[str, Any]] = []
    all_sources: set[Path] = set()
    artifact_paths: set[Path] = set()

    for scene_index, scene in enumerate(scenes):
        if not isinstance(scene, dict) or scene.get("type") != "panel":
            continue
        visual = scene.get("visual")
        if not isinstance(visual, dict):
            continue
        blueprint = visual.get("page_blueprint")
        if not isinstance(blueprint, dict):
            continue
        template = blueprint.get("template")
        if template == "FULL_BLEED":
            continue
        if not isinstance(template, str) or not template:
            raise CompositionError(f"scenes[{scene_index}].visual.page_blueprint.template is required")
        required_slots = {"STACKED_2": 2, "ASYM_2": 2, "STACKED_3": 3, "BLACK_INSET": 1, "WHITE_ISOLATE": 1}
        if template not in required_slots:
            raise CompositionError(f"scenes[{scene_index}].visual.page_blueprint.template is unsupported: {template!r}")
        if scene.get("editor_motion") != {"enabled": False, "preset": "static", "zoom": 1, "pan": 0}:
            raise CompositionError(f"{scene.get('id', scene_index)} composed page must use exact static editor_motion")

        scene_id = scene.get("id")
        if not isinstance(scene_id, str) or not SCENE_ID_RE.fullmatch(scene_id):
            raise CompositionError(f"scenes[{scene_index}].id is not a safe output name")
        if scene_ids is not None and scene_id not in scene_ids:
            continue
        final_path = output_root / f"{scene_id}.jpg"
        manifest_path = output_root / f"{scene_id}.composition.json"
        for artifact in (final_path, manifest_path):
            artifact_resolved = artifact.resolve(strict=False)
            if artifact_resolved in artifact_paths:
                raise CompositionError(f"duplicate output artifact for scene {scene_id}: {artifact.name}")
            artifact_paths.add(artifact_resolved)

        background_raw = blueprint.get("background", "#ffffff")
        background_rgba = _parse_color(background_raw, f"{scene_id}.page_blueprint.background")
        reading_order = blueprint.get("reading_order", [])
        if not isinstance(reading_order, list) or not all(isinstance(item, str) for item in reading_order):
            raise CompositionError(f"{scene_id}.page_blueprint.reading_order must be an array of slot IDs")
        slots = blueprint.get("slots")
        if not isinstance(slots, list) or not slots:
            raise CompositionError(f"{scene_id}.page_blueprint.slots must be a non-empty array")
        if len(slots) != required_slots[template]:
            raise CompositionError(f"{scene_id}.{template} requires exactly {required_slots[template]} slot(s)")

        slot_plans: list[dict[str, Any]] = []
        slot_ids: set[str] = set()
        for slot_index, slot in enumerate(slots):
            label = f"{scene_id}.slots[{slot_index}]"
            if not isinstance(slot, dict):
                raise CompositionError(f"{label} must be an object")
            slot_id = slot.get("id")
            if not isinstance(slot_id, str) or not slot_id or slot_id in slot_ids:
                raise CompositionError(f"{label}.id must be a unique non-empty string")
            slot_ids.add(slot_id)
            source_label = f"{label}.source"
            source_rel, source_path = resolve_safe_source(public_root, slot.get("source"), source_label)
            all_sources.add(source_path)

            fit = slot.get("fit", "cover")
            shape = slot.get("shape", "rect")
            if fit not in SUPPORTED_FITS:
                raise CompositionError(f"{label}.fit must be cover or contain")
            if shape not in SUPPORTED_SHAPES:
                raise CompositionError(f"{label}.shape is unsupported: {shape!r}")
            focal = slot.get("focal_point", {"x": 0.5, "y": 0.5})
            if not isinstance(focal, dict):
                raise CompositionError(f"{label}.focal_point must be an object")
            focal_x = _as_number(focal.get("x", 0.5), f"{label}.focal_point.x")
            focal_y = _as_number(focal.get("y", 0.5), f"{label}.focal_point.y")
            if not 0 <= focal_x <= 1 or not 0 <= focal_y <= 1:
                raise CompositionError(f"{label}.focal_point values must be in 0..1")

            box = _slot_box(slot, label)
            try:
                with Image.open(source_path) as source_image:
                    source_image.load()
                    source_size = ImageOps.exif_transpose(source_image).size
            except (OSError, ValueError) as exc:
                raise CompositionError(f"cannot decode source image {source_rel}: {exc}") from exc
            source_aspect = source_size[0] / source_size[1] if source_size[1] else 0
            if min(source_size) < 640 or abs(source_aspect - (CANVAS_WIDTH / CANVAS_HEIGHT)) > 0.04:
                raise CompositionError(
                    f"{label}.source must be a high-resolution 9:16 image; actual {source_size[0]}x{source_size[1]}"
                )
            target_size = (box[2] - box[0], box[3] - box[1])
            if fit == "cover":
                scale_factor = max(target_size[0] / source_size[0], target_size[1] / source_size[1])
            else:
                scale_factor = min(target_size[0] / source_size[0], target_size[1] / source_size[1])
            if scale_factor > MAX_UPSCALE + 1e-9:
                raise CompositionError(f"{label} would upscale source {scale_factor:.3f}x; limit is {MAX_UPSCALE:.2f}x")
            border_px = _as_nonnegative_int(slot.get("border_px", 0), f"{label}.border_px")
            radius_px = _as_nonnegative_int(slot.get("radius_px", 24 if shape == "rounded" else 0), f"{label}.radius_px")
            border_color_raw = slot.get("border_color", "#111111")
            border_rgba = _parse_color(border_color_raw, f"{label}.border_color")
            rotation = _as_number(slot.get("rotation_deg", 0), f"{label}.rotation_deg")
            z = _as_number(slot.get("z", 0), f"{label}.z")
            source_hash = sha256_file(source_path)
            slot_plans.append(
                {
                    "id": slot_id,
                    "source": source_rel,
                    "source_path": source_path,
                    "source_sha256": source_hash,
                    "source_dimensions": {"width": source_size[0], "height": source_size[1]},
                    "scale_factor": scale_factor,
                    "box": box,
                    "geometry": _normalized_geometry(slot),
                    "fit": fit,
                    "focal_point": {"x": focal_x, "y": focal_y},
                    "shape": shape,
                    "z": z,
                    "index": slot_index,
                    "rotation_deg": rotation,
                    "border_px": border_px,
                    "border_color": border_color_raw,
                    "border_rgba": border_rgba,
                    "radius_px": radius_px,
                }
            )

        pages.append(
            {
                "scene_id": scene_id,
                "project": project_id,
                "version": str(blueprint.get("version", "6.0")),
                "project_sha256": project_sha256,
                "blueprint_sha256": sha256_json(blueprint),
                "template": template,
                "background": background_raw,
                "background_rgba": background_rgba,
                "reading_order": list(reading_order),
                "requested_revision": _requested_revision(scene, visual, blueprint),
                "slots": slot_plans,
                "final_path": final_path,
                "manifest_path": manifest_path,
            }
        )

        if len(reading_order) != len(slot_ids) or set(reading_order) != slot_ids:
            raise CompositionError(f"{scene_id}.page_blueprint.reading_order must cover every slot exactly once")

    collisions = sorted(artifact_paths.intersection(all_sources), key=lambda path: str(path).lower())
    if collisions:
        joined = ", ".join(str(path) for path in collisions)
        raise CompositionError(f"refusing to overwrite source with an output artifact: {joined}")
    return pages


def _fit_image(
    source: Image.Image,
    target_size: tuple[int, int],
    fit: str,
    focal_point: dict[str, float],
) -> Image.Image:
    target_width, target_height = target_size
    source = ImageOps.exif_transpose(source).convert("RGBA")
    if source.width < 1 or source.height < 1:
        raise CompositionError("source image has invalid dimensions")

    if fit == "cover":
        scale = max(target_width / source.width, target_height / source.height)
        width = max(target_width, math.ceil(source.width * scale))
        height = max(target_height, math.ceil(source.height * scale))
        resized = source.resize((width, height), Image.Resampling.LANCZOS)
        left = round(focal_point["x"] * width - target_width / 2)
        top = round(focal_point["y"] * height - target_height / 2)
        left = min(max(0, left), width - target_width)
        top = min(max(0, top), height - target_height)
        return resized.crop((left, top, left + target_width, top + target_height))

    scale = min(target_width / source.width, target_height / source.height)
    width = min(target_width, max(1, round(source.width * scale)))
    height = min(target_height, max(1, round(source.height * scale)))
    resized = source.resize((width, height), Image.Resampling.LANCZOS)
    contained = Image.new("RGBA", target_size, (0, 0, 0, 0))
    left = round((target_width - width) * focal_point["x"])
    top = round((target_height - height) * focal_point["y"])
    contained.alpha_composite(resized, (left, top))
    return contained


def _scaled_shape(shape: str, width: int, height: int, radius_px: int) -> tuple[str, Any]:
    """Return a Pillow drawing primitive and supersampled geometry."""

    scaled_width = width * MASK_SCALE
    scaled_height = height * MASK_SCALE
    last_x = scaled_width - 1
    last_y = scaled_height - 1
    if shape == "rounded":
        radius = min(radius_px * MASK_SCALE, scaled_width // 2, scaled_height // 2)
        return "rounded", ((0, 0, last_x, last_y), radius)
    if shape == "circle":
        diameter = min(scaled_width, scaled_height)
        left = (scaled_width - diameter) // 2
        top = (scaled_height - diameter) // 2
        return "ellipse", (left, top, left + diameter - 1, top + diameter - 1)
    cut = max(MASK_SCALE, min(round(scaled_width * 0.14), round(scaled_height * 0.20)))
    if shape == "diagonal_left":
        return "polygon", [(cut, 0), (last_x, 0), (last_x, last_y), (0, last_y)]
    if shape == "diagonal_right":
        return "polygon", [(0, 0), (last_x - cut, 0), (last_x, last_y), (0, last_y)]
    raise CompositionError(f"unsupported shape: {shape}")


def _draw_primitive(draw: ImageDraw.ImageDraw, primitive: str, geometry: Any, **kwargs: Any) -> None:
    if primitive == "rounded":
        box, radius = geometry
        draw.rounded_rectangle(box, radius=radius, **kwargs)
    elif primitive == "ellipse":
        draw.ellipse(geometry, **kwargs)
    else:
        draw.polygon(geometry, **kwargs)


def _shape_mask(shape: str, size: tuple[int, int], radius_px: int) -> Image.Image:
    if shape == "rect":
        return Image.new("L", size, 255)
    width, height = size
    large = Image.new("L", (width * MASK_SCALE, height * MASK_SCALE), 0)
    primitive, geometry = _scaled_shape(shape, width, height, radius_px)
    _draw_primitive(ImageDraw.Draw(large), primitive, geometry, fill=255)
    return large.resize(size, Image.Resampling.LANCZOS)


def _border_overlay(
    shape: str,
    size: tuple[int, int],
    radius_px: int,
    border_px: int,
    color: tuple[int, int, int, int],
    mask: Image.Image,
) -> Image.Image:
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    if border_px <= 0:
        return overlay
    width, height = size
    if shape == "rect":
        line_width = min(border_px, max(1, min(width, height) // 2))
        ImageDraw.Draw(overlay).rectangle((0, 0, width - 1, height - 1), outline=color, width=line_width)
        return overlay

    large = Image.new("RGBA", (width * MASK_SCALE, height * MASK_SCALE), (0, 0, 0, 0))
    primitive, geometry = _scaled_shape(shape, width, height, radius_px)
    line_width = max(1, border_px * MASK_SCALE)
    if primitive == "polygon":
        points = list(geometry)
        ImageDraw.Draw(large).line(points + [points[0]], fill=color, width=line_width, joint="curve")
    else:
        _draw_primitive(ImageDraw.Draw(large), primitive, geometry, outline=color, width=line_width)
    overlay = large.resize(size, Image.Resampling.LANCZOS)
    overlay.putalpha(ImageChops.multiply(overlay.getchannel("A"), mask))
    return overlay


def _render_slot(slot: dict[str, Any]) -> Image.Image:
    left, top, right, bottom = slot["box"]
    size = (right - left, bottom - top)
    try:
        with Image.open(slot["source_path"]) as source:
            source.load()
            tile = _fit_image(source, size, slot["fit"], slot["focal_point"])
    except (OSError, ValueError) as exc:
        raise CompositionError(f"cannot decode source image {slot['source']}: {exc}") from exc

    mask = _shape_mask(slot["shape"], size, slot["radius_px"])
    tile.putalpha(ImageChops.multiply(tile.getchannel("A"), mask))
    border = _border_overlay(
        slot["shape"],
        size,
        slot["radius_px"],
        slot["border_px"],
        slot["border_rgba"],
        mask,
    )
    tile = Image.alpha_composite(tile, border)
    rotation = slot["rotation_deg"] % 360
    if not math.isclose(rotation, 0.0, abs_tol=1e-9):
        # Positive design angles rotate clockwise, matching CSS/editor convention.
        tile = tile.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(0, 0, 0, 0))
    return tile


def render_page(page: dict[str, Any]) -> tuple[Image.Image, list[dict[str, Any]]]:
    canvas = Image.new("RGBA", CANVAS_SIZE, page["background_rgba"])
    draw_order = sorted(page["slots"], key=lambda slot: (slot["z"], slot["index"]))
    for slot in draw_order:
        tile = _render_slot(slot)
        left, top, right, bottom = slot["box"]
        center_x = (left + right) / 2
        center_y = (top + bottom) / 2
        destination = (round(center_x - tile.width / 2), round(center_y - tile.height / 2))
        canvas.alpha_composite(tile, destination)

    # JPG has no alpha.  Transparent colors (including a translucent background)
    # are flattened against white in a deterministic way.
    final = Image.new("RGB", CANVAS_SIZE, "white")
    final.paste(canvas, (0, 0), canvas.getchannel("A"))
    return final, draw_order


def _atomic_save_jpeg(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(prefix=f".{destination.stem}.", suffix=".tmp", dir=destination.parent, delete=False)
    temp_path = Path(handle.name)
    handle.close()
    try:
        image.save(temp_path, format="JPEG", quality=100, subsampling=0, optimize=True)
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)


def _atomic_write_json(payload: dict[str, Any], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        prefix=f".{destination.stem}.",
        suffix=".tmp",
        dir=destination.parent,
        delete=False,
    )
    temp_path = Path(handle.name)
    try:
        with handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)


def _next_revision(page: dict[str, Any]) -> int:
    revision = page["requested_revision"]
    manifest_path = page["manifest_path"]
    if not manifest_path.exists():
        return revision
    try:
        previous = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CompositionError(f"cannot read prior composition manifest {manifest_path}: {exc}") from exc
    prior_revision = previous.get("composition_revision") if isinstance(previous, dict) else None
    if isinstance(prior_revision, bool) or not isinstance(prior_revision, int) or prior_revision < 1:
        raise CompositionError(f"invalid prior composition_revision in {manifest_path}")
    return max(revision, prior_revision + 1)


def _manifest_for_page(
    page: dict[str, Any],
    draw_order: list[dict[str, Any]],
    revision: int,
    final_sha256: str,
) -> dict[str, Any]:
    slots = []
    source_hashes: dict[str, str] = {}
    for slot in page["slots"]:
        source_hashes[slot["id"]] = slot["source_sha256"]
        slots.append(
            {
                "id": slot["id"],
                "source": slot["source"],
                "source_sha256": slot["source_sha256"],
                "source_dimensions": slot["source_dimensions"],
                "scale_factor": slot["scale_factor"],
                **slot["geometry"],
                "fit": slot["fit"],
                "focal_point": slot["focal_point"],
                "shape": slot["shape"],
                "z": slot["z"],
                "rotation_deg": slot["rotation_deg"],
                "border_px": slot["border_px"],
                "border_color": slot["border_color"],
                "radius_px": slot["radius_px"],
            }
        )
    return {
        "manifest_type": "MANHWA_PAGE_COMPOSITION_V6",
        "version": page["version"],
        "project": page["project"],
        "project_sha256": page["project_sha256"],
        "blueprint_sha256": page["blueprint_sha256"],
        "scene_id": page["scene_id"],
        "template": page["template"],
        "canvas": {"width": CANVAS_WIDTH, "height": CANVAS_HEIGHT},
        "background": page["background"],
        "composition_revision": revision,
        "reading_order": page["reading_order"],
        "draw_order": [slot["id"] for slot in draw_order],
        "slots": slots,
        "source_hashes": source_hashes,
        "final_path": page["final_path"].name,
        "final_sha256": final_sha256,
    }


def compose_project(
    project_path: Path,
    project_public_dir: Path,
    output_dir: Path,
    scene_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    project_path = Path(project_path)
    public_root = Path(project_public_dir).resolve(strict=True)
    if not public_root.is_dir():
        raise CompositionError(f"PROJECT_PUBLIC_DIR is not a directory: {public_root}")
    output_root = Path(output_dir).resolve(strict=False)
    if output_root.exists() and not output_root.is_dir():
        raise CompositionError(f"OUTPUT_DIR is not a directory: {output_root}")
    try:
        project_raw = project_path.read_bytes()
        project = json.loads(project_raw.decode("utf-8-sig"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CompositionError(f"cannot read PROJECT.json {project_path}: {exc}") from exc
    if not isinstance(project, dict):
        raise CompositionError("PROJECT.json root must be an object")

    # project_sha256 is intentionally content-addressed instead of byte-addressed.  The
    # runtime composes from an immutable JSON snapshot produced after parsing the queue
    # file, so whitespace and object-key order may differ from the original bytes.  A
    # canonical sorted/compact serialization preserves the parsed document while the
    # numeric normalization mirrors JavaScript (1.0 == 1 and -0.0 == 0).  Integers
    # outside JavaScript's safe range are outside this runtime contract.
    canonical_project_sha256 = project_semantic_sha256(project)

    # Planning resolves every source and checks every collision before the first write.
    pages = plan_project(project, public_root, output_root, canonical_project_sha256, scene_ids)
    if not pages:
        return []
    output_root.mkdir(parents=True, exist_ok=True)
    manifests: list[dict[str, Any]] = []
    staged: list[tuple[dict[str, Any], Path, Path]] = []
    # Render and serialize the complete batch before replacing any published artifact.
    with tempfile.TemporaryDirectory(prefix=".v6-compose-stage-", dir=output_root) as stage_dir_raw:
        stage_dir = Path(stage_dir_raw)
        for page in pages:
            revision = _next_revision(page)
            image, draw_order = render_page(page)
            staged_image = stage_dir / f"{page['scene_id']}.jpg"
            staged_manifest = stage_dir / f"{page['scene_id']}.composition.json"
            _atomic_save_jpeg(image, staged_image)
            final_hash = sha256_file(staged_image)
            manifest = _manifest_for_page(page, draw_order, revision, final_hash)
            _atomic_write_json(manifest, staged_manifest)
            manifests.append(manifest)
            staged.append((page, staged_image, staged_manifest))

        # Prove that no source changed anywhere in the batch before publication begins.
        for page in pages:
            for slot in page["slots"]:
                if sha256_file(slot["source_path"]) != slot["source_sha256"]:
                    raise CompositionError(f"source changed during composition: {slot['source']}")

        for page, staged_image, staged_manifest in staged:
            os.replace(staged_image, page["final_path"])
            os.replace(staged_manifest, page["manifest_path"])
    return manifests


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_json", type=Path, metavar="PROJECT.json")
    parser.add_argument("project_public_dir", type=Path, metavar="PROJECT_PUBLIC_DIR")
    parser.add_argument("--output-dir", type=Path, required=True, metavar="OUTPUT_DIR")
    parser.add_argument(
        "--scene-id",
        action="append",
        default=[],
        metavar="SCENE_ID",
        help="compose only this scene (repeatable); omitted composes every page",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        scene_ids = set(args.scene_id) if args.scene_id else None
        manifests = compose_project(args.project_json, args.project_public_dir, args.output_dir, scene_ids)
    except (CompositionError, OSError) as exc:
        print(f"COMPOSITION_ERROR: {exc}", file=sys.stderr)
        return 2
    for manifest in manifests:
        print(
            "PAGE_COMPOSED "
            f"scene={manifest['scene_id']} revision={manifest['composition_revision']} "
            f"final={manifest['final_path']} sha256={manifest['final_sha256']}"
        )
    print(f"COMPOSITION_COMPLETE pages={len(manifests)} output_dir={Path(args.output_dir)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
