"""
Вспомогательные функции для отрисовки миниатюр (Pillow/PIL).
Чистая логика, без глобального состояния.
"""
import os
from PIL import Image, ImageDraw, ImageFont


def get_font(font_path: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """
    Загружает шрифт по пути. При ошибке возвращает шрифт по умолчанию.
    """
    try:
        if os.path.isfile(font_path):
            return ImageFont.truetype(font_path, size)
    except (OSError, IOError):
        pass
    return ImageFont.load_default()


def draw_text_centered(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    fill: tuple[int, ...],
) -> None:
    """
    Рисует текст строго по центру переданного box (x1, y1, x2, y2).
    """
    x1, y1, x2, y2 = box
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    cx = (x1 + x2) / 2 - tw / 2
    cy = (y1 + y2) / 2 - th / 2
    draw.text((int(cx), int(cy)), text, font=font, fill=fill)


def create_textured_bar(
    width: int,
    height: int,
    percent: float,
    theme_dir: str,
) -> Image.Image:
    """
    Создаёт изображение бара с текстурами из theme_dir (bg.png, fg.png, mask.png).
    При отсутствии файлов — простой цветной прямоугольник (fallback).
    percent в диапазоне 0.0..1.0.
    """
    percent = max(0.0, min(1.0, percent))
    canvas = Image.new("RGBA", (width, height))

    bg_path = os.path.join(theme_dir, "bg.png")
    fg_path = os.path.join(theme_dir, "fg.png")
    mask_path = os.path.join(theme_dir, "mask.png")

    has_bg = os.path.isfile(bg_path)
    has_fg = os.path.isfile(fg_path)
    has_mask = os.path.isfile(mask_path)

    if not (has_bg and has_fg):
        # Fallback: простой цветной бар
        draw = ImageDraw.Draw(canvas)
        draw.rectangle([0, 0, width - 1, height - 1], fill=(60, 60, 60, 255))
        fill_w = int(width * percent)
        if fill_w > 0:
            draw.rectangle([0, 0, fill_w - 1, height - 1], fill=(76, 175, 80, 255))
        return canvas

    try:
        bg = Image.open(bg_path).convert("RGBA").resize((width, height))
        fg = Image.open(fg_path).convert("RGBA").resize((width, height))
    except (OSError, IOError):
        draw = ImageDraw.Draw(canvas)
        draw.rectangle([0, 0, width - 1, height - 1], fill=(60, 60, 60, 255))
        fill_w = int(width * percent)
        if fill_w > 0:
            draw.rectangle([0, 0, fill_w - 1, height - 1], fill=(76, 175, 80, 255))
        return canvas

    canvas.paste(bg, (0, 0))
    crop_w = max(1, int(width * percent))
    fg_cropped = fg.crop((0, 0, crop_w, height))
    canvas.paste(fg_cropped, (0, 0), fg_cropped)

    if has_mask:
        try:
            mask_im = Image.open(mask_path).convert("L").resize((width, height))
            # composite: canvas (bar) обрезается по маске поверх прозрачного фона
            base = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            canvas = Image.composite(canvas, base, mask_im)
        except (OSError, IOError):
            pass

    return canvas


def apply_rotated_element(
    canvas: Image.Image,
    element: Image.Image,
    x: int,
    y: int,
    angle: int,
) -> None:
    """
    Поворачивает element на angle градусов (expand=True) и вклеивает на canvas
    в позицию (x, y). Использует альфа-канал при вставке. Изменяет canvas in-place.
    """
    if angle == 0:
        rot = element
    else:
        rot = element.rotate(-angle, expand=True)

    if canvas.mode != "RGBA":
        canvas = canvas.convert("RGBA")
    if rot.mode != "RGBA":
        rot = rot.convert("RGBA")

    # Вставляем в прозрачный слой того же размера, затем composite на canvas
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    overlay.paste(rot, (x, y), rot)
    canvas_compat = canvas.convert("RGBA") if canvas.mode != "RGBA" else canvas
    composed = Image.alpha_composite(canvas_compat, overlay)
    canvas.paste(composed)
