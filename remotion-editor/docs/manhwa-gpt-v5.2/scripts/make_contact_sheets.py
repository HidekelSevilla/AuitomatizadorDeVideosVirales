#!/usr/bin/env python3
"""Create labelled JPG contact sheets and a machine-readable JSON index.

The utility is intentionally static: it does not create HTML or start a server.
Every source image is fitted inside a 9:16 thumbnail area without stretching.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
except ImportError as exc:  # pragma: no cover - depends on the host environment
    raise SystemExit(
        "Error: Pillow is required. Install it with: python -m pip install Pillow"
    ) from exc


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
THUMB_WIDTH = 540
THUMB_HEIGHT = 960  # Exact 9:16 frame.
LABEL_HEIGHT = 64
MARGIN = 32
GAP = 24
SHEET_PATTERN = "contact_sheet_{number:03d}.jpg"
INDEX_FILENAME = "contact_sheets_index.json"


def natural_key(path: Path) -> list[tuple[int, Any]]:
    """Return a stable natural-sort key (scene_06, scene_06a, scene_07)."""

    parts = re.split(r"(\d+)", path.name.casefold())
    return [(0, int(part)) if part.isdigit() else (1, part) for part in parts]


def find_font(size: int) -> ImageFont.ImageFont:
    """Use a readable system font when available, with a Pillow fallback."""

    candidates = (
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    )
    for candidate in candidates:
        if candidate.is_file():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def fit_into_vertical_frame(image: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    """Fit an image into an exact 9:16 frame without cropping or distortion."""

    converted = ImageOps.exif_transpose(image).convert("RGB")
    fitted = ImageOps.contain(
        converted,
        (THUMB_WIDTH, THUMB_HEIGHT),
        method=Image.Resampling.LANCZOS,
    )
    frame = Image.new("RGB", (THUMB_WIDTH, THUMB_HEIGHT), (18, 18, 21))
    offset = (
        (THUMB_WIDTH - fitted.width) // 2,
        (THUMB_HEIGHT - fitted.height) // 2,
    )
    frame.paste(fitted, offset)
    return frame, offset


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create high-resolution JPG contact sheets from an image directory, "
            "plus a JSON index. Images are naturally sorted and never stretched."
        )
    )
    parser.add_argument(
        "images_dir",
        type=Path,
        help="Directory containing the source images (files are read non-recursively).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Destination directory (default: <images_dir>/contact_sheets).",
    )
    parser.add_argument(
        "--columns",
        type=int,
        default=3,
        help="Number of tile columns per sheet (default: 3).",
    )
    parser.add_argument(
        "--max-per-sheet",
        type=int,
        default=12,
        help="Maximum number of images per sheet (default: 12).",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=92,
        help="JPEG quality from 1 to 100 (default: 92).",
    )
    args = parser.parse_args(argv)

    if args.columns < 1:
        parser.error("--columns must be at least 1")
    if args.max_per_sheet < 1:
        parser.error("--max-per-sheet must be at least 1")
    if args.columns > args.max_per_sheet:
        parser.error("--columns cannot exceed --max-per-sheet")
    if not 1 <= args.quality <= 100:
        parser.error("--quality must be between 1 and 100")
    return args


def list_images(images_dir: Path) -> list[Path]:
    if not images_dir.exists():
        raise ValueError(f"Images directory does not exist: {images_dir}")
    if not images_dir.is_dir():
        raise ValueError(f"Images path is not a directory: {images_dir}")

    images = sorted(
        (
            item
            for item in images_dir.iterdir()
            if item.is_file() and item.suffix.casefold() in IMAGE_EXTENSIONS
        ),
        key=natural_key,
    )
    if not images:
        supported = ", ".join(sorted(IMAGE_EXTENSIONS))
        raise ValueError(
            f"No supported images found in {images_dir}. Supported extensions: {supported}"
        )
    return images


def create_contact_sheets(
    images: list[Path],
    output_dir: Path,
    columns: int,
    max_per_sheet: int,
    quality: int,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = find_font(30)
    tile_width = THUMB_WIDTH
    tile_height = THUMB_HEIGHT + LABEL_HEIGHT
    sheet_records: list[dict[str, Any]] = []

    for sheet_offset in range(0, len(images), max_per_sheet):
        sheet_number = sheet_offset // max_per_sheet + 1
        batch = images[sheet_offset : sheet_offset + max_per_sheet]
        rows = math.ceil(len(batch) / columns)
        sheet_width = (MARGIN * 2) + (columns * tile_width) + ((columns - 1) * GAP)
        sheet_height = (MARGIN * 2) + (rows * tile_height) + ((rows - 1) * GAP)
        canvas = Image.new("RGB", (sheet_width, sheet_height), (31, 31, 36))
        draw = ImageDraw.Draw(canvas)
        tile_records: list[dict[str, Any]] = []

        for local_index, source_path in enumerate(batch):
            row, column = divmod(local_index, columns)
            x = MARGIN + column * (tile_width + GAP)
            y = MARGIN + row * (tile_height + GAP)

            try:
                with Image.open(source_path) as source:
                    original_size = [source.width, source.height]
                    frame, fitted_offset = fit_into_vertical_frame(source)
            except (OSError, UnidentifiedImageError) as exc:
                raise ValueError(f"Could not read image {source_path}: {exc}") from exc

            canvas.paste(frame, (x, y))
            draw.rectangle(
                (x, y, x + THUMB_WIDTH - 1, y + THUMB_HEIGHT - 1),
                outline=(118, 118, 128),
                width=2,
            )
            label = source_path.name
            label_bbox = draw.textbbox((0, 0), label, font=font)
            label_width = label_bbox[2] - label_bbox[0]
            if label_width > THUMB_WIDTH - 16:
                # The full filename remains in JSON; shorten only the visual label.
                max_chars = max(12, int(len(label) * (THUMB_WIDTH - 16) / label_width) - 1)
                label = label[:max_chars] + "…"
                label_bbox = draw.textbbox((0, 0), label, font=font)
                label_width = label_bbox[2] - label_bbox[0]
            label_x = x + max(8, (THUMB_WIDTH - label_width) // 2)
            label_y = y + THUMB_HEIGHT + 13
            draw.text((label_x, label_y), label, fill=(245, 245, 248), font=font)

            fitted_width = THUMB_WIDTH - 2 * fitted_offset[0]
            fitted_height = THUMB_HEIGHT - 2 * fitted_offset[1]
            tile_records.append(
                {
                    "tile": local_index + 1,
                    "global_index": sheet_offset + local_index + 1,
                    "row": row + 1,
                    "column": column + 1,
                    "label": source_path.name,
                    "source": str(source_path.resolve()),
                    "original_size": original_size,
                    "tile_bounds": [x, y, THUMB_WIDTH, tile_height],
                    "thumbnail_frame_bounds": [x, y, THUMB_WIDTH, THUMB_HEIGHT],
                    "fitted_image_bounds": [
                        x + fitted_offset[0],
                        y + fitted_offset[1],
                        fitted_width,
                        fitted_height,
                    ],
                }
            )

        sheet_filename = SHEET_PATTERN.format(number=sheet_number)
        sheet_path = output_dir / sheet_filename
        canvas.save(sheet_path, "JPEG", quality=quality, subsampling=0, optimize=True)
        sheet_records.append(
            {
                "sheet": sheet_number,
                "file": sheet_filename,
                "path": str(sheet_path.resolve()),
                "dimensions": [sheet_width, sheet_height],
                "rows": rows,
                "columns": columns,
                "tile_count": len(batch),
                "tiles": tile_records,
            }
        )

    index: dict[str, Any] = {
        "version": 1,
        "source_directory": str(images[0].parent.resolve()),
        "output_directory": str(output_dir.resolve()),
        "image_count": len(images),
        "sheet_count": len(sheet_records),
        "settings": {
            "columns": columns,
            "max_per_sheet": max_per_sheet,
            "thumbnail_frame": [THUMB_WIDTH, THUMB_HEIGHT],
            "thumbnail_aspect_ratio": "9:16",
            "fit_mode": "contain_no_crop_no_distortion",
            "jpeg_quality": quality,
        },
        "sheets": sheet_records,
    }
    index_path = output_dir / INDEX_FILENAME
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        images_dir = args.images_dir.expanduser().resolve()
        output_dir = (
            args.output_dir.expanduser().resolve()
            if args.output_dir is not None
            else images_dir / "contact_sheets"
        )
        images = list_images(images_dir)
        index = create_contact_sheets(
            images=images,
            output_dir=output_dir,
            columns=args.columns,
            max_per_sheet=args.max_per_sheet,
            quality=args.quality,
        )
    except (OSError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Created {index['sheet_count']} contact sheet(s) for "
        f"{index['image_count']} image(s) in: {index['output_directory']}"
    )
    print(f"JSON index: {Path(index['output_directory']) / INDEX_FILENAME}")
    for sheet in index["sheets"]:
        width, height = sheet["dimensions"]
        print(f"  {sheet['file']}: {width}x{height}, {sheet['tile_count']} tile(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
