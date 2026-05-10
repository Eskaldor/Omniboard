"""Image post-processing for AI-generated portraits.

The Omnimini display is a hard 172x320 panel (CLAUDE.md). Whatever the LLM
returns has to be reshaped to that exact ratio and resolution before it can
land on disk as a portrait. The crop is biased upward (faces stay) when the
source is taller than the target ratio; symmetric horizontal crop when wider.

All functions are sync — call from a thread (``asyncio.to_thread``) when
invoking from the FastAPI event loop. Pillow's decoder + LANCZOS resampling
are CPU-bound and noticeable on large images.
"""
from __future__ import annotations

import io
import logging
from typing import Final

from PIL import Image

_log = logging.getLogger(__name__)

# Omnimini display geometry. Do not change without coordinating with firmware
# and the compositor pipeline (CLAUDE.md → ESP32 section).
TARGET_W: Final[int] = 172
TARGET_H: Final[int] = 320

# When the source is taller than the target (portrait orientation, common for
# DALL-E 1024x1024), bias the crop upward so heads/faces survive. Cut a small
# slice from the top, the rest from the bottom.
_TOP_BIAS: Final[float] = 0.10


def smart_crop_and_resize(
    image_bytes: bytes,
    target_w: int = TARGET_W,
    target_h: int = TARGET_H,
) -> bytes:
    """Crop ``image_bytes`` to the ``target_w/target_h`` aspect, then LANCZOS-resize.

    Crop strategy:
      * If the source aspect is **wider** than target → symmetric horizontal crop
        (cut equal slivers from left and right).
      * If **taller** → vertical crop biased upward: keep ``_TOP_BIAS`` of the
        excess at the top, take the rest off the bottom.
      * Exactly matching aspect → just resize.

    Returns PNG bytes. RGBA is preserved so transparent generations stay
    transparent over the tracker UI.
    """
    if target_w <= 0 or target_h <= 0:
        raise ValueError("target dimensions must be positive")

    with Image.open(io.BytesIO(image_bytes)) as src:
        # Force decode + normalize palette/CMYK images to a mode that LANCZOS
        # handles correctly. Preserve RGBA so generated transparency survives.
        if src.mode not in ("RGB", "RGBA"):
            src = src.convert("RGBA" if "A" in src.getbands() else "RGB")

        sw, sh = src.size
        if sw <= 0 or sh <= 0:
            raise ValueError("source image has zero dimension")

        target_ratio = target_w / target_h
        source_ratio = sw / sh

        if abs(source_ratio - target_ratio) < 1e-3:
            box = (0, 0, sw, sh)
        elif source_ratio > target_ratio:
            # Wider than target -> symmetric horizontal crop.
            new_w = int(round(sh * target_ratio))
            new_w = max(1, min(new_w, sw))
            offset = (sw - new_w) // 2
            box = (offset, 0, offset + new_w, sh)
        else:
            # Taller than target -> head-preserving vertical crop.
            new_h = int(round(sw / target_ratio))
            new_h = max(1, min(new_h, sh))
            excess = sh - new_h
            top = int(round(excess * _TOP_BIAS))
            top = max(0, min(top, excess))
            box = (0, top, sw, top + new_h)

        cropped = src.crop(box)
        resized = cropped.resize((target_w, target_h), resample=Image.Resampling.LANCZOS)

        out = io.BytesIO()
        # PNG keeps RGBA losslessly. Optimize=True trims trailing chunks; minor
        # CPU cost, meaningful disk savings on a long campaign of generations.
        resized.save(out, format="PNG", optimize=True)
        return out.getvalue()
