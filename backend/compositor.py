"""
Композитор миниатюр: строго 172x320 px, послойный RGBA-сэндвич.
Использует backend.render_utils и backend.models.
"""
import os
import hashlib
from PIL import Image, ImageDraw
from backend.models import Actor, MiniatureLayout, DisplayField
from backend.paths import ASSETS_DIR
from backend.render_utils import (
    get_font,
    draw_text_centered,
    create_textured_bar,
    apply_rotated_element,
)

RENDER_DIR = "data/render"
os.makedirs(RENDER_DIR, exist_ok=True)

CANVAS_WIDTH = 172
CANVAS_HEIGHT = 320

# Отступы и размеры для слотов UI
PAD = 10
SLOT_HEIGHT_VERT = 80  # высота вертикальных слотов (left1, right1)


def get_asset_path(
    category: str,
    filename: str,
    system_name: str | None = None,
) -> str | None:
    """
    Asset Override: сначала systems/<system_name>/<category>/<filename>,
    затем default/<category>/<filename>. Возвращает путь строкой или None.
    """
    if system_name:
        sys_path = ASSETS_DIR / "systems" / system_name / category / filename
        if sys_path.is_file():
            return str(sys_path)
    default_path = ASSETS_DIR / "default" / category / filename
    if default_path.is_file():
        return str(default_path)
    return None


def draw_display_field(
    canvas: Image.Image,
    field: DisplayField,
    actor: Actor,
    x: int,
    y: int,
    width: int,
    height: int,
    font,
    system_name: str | None,
) -> None:
    """
    Рисует одно поле (бар или текст) на canvas в прямоугольнике (x, y, width, height).
    Учитывает rotation и theme_id для баров.
    """
    val = actor.stats.get(field.value_path, 0)

    if field.type == "bar":
        max_val = actor.stats.get(field.max_value_path, val) if field.max_value_path else val
        if isinstance(max_val, (int, float)):
            max_val = max(1, max_val)
        else:
            max_val = 1
        try:
            num_val = float(val) if val is not None else 0
            num_max = float(max_val)
            percent = num_val / num_max if num_max else 0
        except (TypeError, ValueError):
            percent = 0
        percent = max(0.0, min(1.0, percent))

        theme_dir = str(ASSETS_DIR / "default" / "bars" / (field.theme_id or "default"))
        bar_img = create_textured_bar(width, height, percent, theme_dir)

        if field.rotation in (90, 270):
            apply_rotated_element(canvas, bar_img, x, y, field.rotation)
        else:
            canvas.paste(bar_img, (x, y), bar_img)

    else:  # text
        text = f"{field.label + ': ' if field.label else ''}{val}"
        fill = (255, 255, 255)
        box = (x, y, x + width, y + height)

        if field.rotation in (90, 270):
            layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            draw_layer = ImageDraw.Draw(layer)
            draw_text_centered(draw_layer, (0, 0, width, height), text, font, fill)
            apply_rotated_element(canvas, layer, x, y, field.rotation)
        else:
            draw = ImageDraw.Draw(canvas)
            draw_text_centered(draw, box, text, font, fill)


def render_miniature(
    actor: Actor,
    layout: MiniatureLayout,
    system_name: str,
) -> str:
    """
    Рендер миниатюры 172x320: base → effects → frame → UI overlay.
    Сохраняет JPEG в RENDER_DIR, возвращает путь к файлу.
    """
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 255))

    # —— СЛОЙ 1: Base (портрет) ——
    if layout.show_portrait and actor.portrait:
        portrait_path = get_asset_path(
            "portraits",
            os.path.basename(actor.portrait),
            system_name,
        ) or (actor.portrait if os.path.isfile(actor.portrait) else None)
        if portrait_path:
            try:
                portrait = Image.open(portrait_path).convert("RGBA")
                portrait = portrait.resize((CANVAS_WIDTH, CANVAS_HEIGHT))
                canvas.paste(portrait, (0, 0), portrait)
            except (OSError, IOError):
                pass

    # —— СЛОЙ 2: Effects ——
    for effect in actor.effects:
        if not effect.render_on_mini:
            continue
        path = get_asset_path("effects", f"{effect.id}.png", system_name)
        if not path:
            continue
        try:
            eff_img = Image.open(path).convert("RGBA")
            if eff_img.size != (CANVAS_WIDTH, CANVAS_HEIGHT):
                eff_img = eff_img.resize((CANVAS_WIDTH, CANVAS_HEIGHT))
            canvas = Image.alpha_composite(canvas, eff_img)
        except (OSError, IOError):
            pass

    # —— СЛОЙ 3: Frame ——
    frame_path = get_asset_path("frames", "default_frame.png", system_name)
    if frame_path:
        try:
            frame_img = Image.open(frame_path).convert("RGBA")
            if frame_img.size != (CANVAS_WIDTH, CANVAS_HEIGHT):
                frame_img = frame_img.resize((CANVAS_WIDTH, CANVAS_HEIGHT))
            canvas = Image.alpha_composite(canvas, frame_img)
        except (OSError, IOError):
            pass

    # —— СЛОЙ 4: UI Overlay ——
    font_path = str(ASSETS_DIR / "default" / "fonts" / layout.font_id)
    font = get_font(font_path, layout.font_size)
    bh = layout.bar_height
    slot_w = CANVAS_WIDTH - 2 * PAD

    # Горизонтальные слоты
    if layout.top1:
        draw_display_field(
            canvas, layout.top1, actor,
            PAD, PAD, slot_w, bh,
            font, system_name,
        )
    if layout.top2:
        draw_display_field(
            canvas, layout.top2, actor,
            PAD, PAD + bh + 4, slot_w, bh,
            font, system_name,
        )
    if layout.bottom1:
        draw_display_field(
            canvas, layout.bottom1, actor,
            PAD, CANVAS_HEIGHT - PAD - 2 * (bh + 4), slot_w, bh,
            font, system_name,
        )
    if layout.bottom2:
        draw_display_field(
            canvas, layout.bottom2, actor,
            PAD, CANVAS_HEIGHT - PAD - (bh + 4), slot_w, bh,
            font, system_name,
        )

    # Вертикальные слоты (боковые)
    vert_y = (CANVAS_HEIGHT - SLOT_HEIGHT_VERT) // 2
    if layout.left1:
        draw_display_field(
            canvas, layout.left1, actor,
            0, vert_y, bh, SLOT_HEIGHT_VERT,
            font, system_name,
        )
    if layout.right1:
        draw_display_field(
            canvas, layout.right1, actor,
            CANVAS_WIDTH - bh, vert_y, bh, SLOT_HEIGHT_VERT,
            font, system_name,
        )

    # —— ЭКСПОРТ ——
    out_path = os.path.join(RENDER_DIR, f"{actor.id}.jpg")
    canvas.convert("RGB").save(out_path, "JPEG", quality=85)
    return out_path
