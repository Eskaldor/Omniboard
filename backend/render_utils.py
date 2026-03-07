"""
Вспомогательные функции для отрисовки миниатюр (Pillow/PIL).
Чистая логика, без глобального состояния.
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFont
from PIL.Image import Resampling

from backend.models import BarProfileConfig
from backend.paths import ASSETS_DIR

RESAMPLE = Resampling.LANCZOS


def _resolve_bar_texture_path(bar_id: str, system_name: str | None, filename: str) -> str | None:
    """
    Asset Override для текстур бара: сначала systems/{system_name}/bars/{bar_id}/{filename},
    затем default/bars/{bar_id}/{filename}. Возвращает путь или None.
    """
    if not bar_id or ".." in bar_id or "/" in bar_id or "\\" in bar_id:
        return None
    if system_name and system_name.strip() and ".." not in system_name and "/" not in system_name and "\\" not in system_name:
        sys_path = ASSETS_DIR / "systems" / system_name.strip() / "bars" / bar_id / filename
        if sys_path.is_file():
            return str(sys_path)
    default_path = ASSETS_DIR / "default" / "bars" / bar_id / filename
    if default_path.is_file():
        return str(default_path)
    return None


def hex_to_rgba(hex_str: str | None, default: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    """
    Парсит строку "#RRGGBB" или "#RRGGBBAA" в (R, G, B, A).
    При ошибке или пустой строке возвращает default.
    """
    if not hex_str or not isinstance(hex_str, str):
        return default
    s = hex_str.strip()
    if not s.startswith("#"):
        return default
    s = s[1:]
    if len(s) == 6:
        try:
            r = int(s[0:2], 16)
            g = int(s[2:4], 16)
            b = int(s[4:6], 16)
            return (r, g, b, 255)
        except ValueError:
            return default
    if len(s) == 8:
        try:
            r = int(s[0:2], 16)
            g = int(s[2:4], 16)
            b = int(s[4:6], 16)
            a = int(s[6:8], 16)
            return (r, g, b, a)
        except ValueError:
            return default
    return default


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
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    draw.text((cx, cy), text, font=font, fill=fill, anchor="mm")


def create_textured_bar(
    width: int,
    height: int,
    percent: float,
    bar_id: str,
    system_name: str | None,
    config: BarProfileConfig | None = None,
) -> Image.Image:
    """
    Создаёт изображение бара. Если config не передан — используется BarProfileConfig(id="default", name="default").
    Если config.mode == "solid": фон (bg_color), заливка (fg_color или градиент), скругления, рамка.
    Если config.mode == "textured" — послойный рендер с Asset Override (systems -> default):
      Слой 1: bg.png (фон). Слой 2: fg.png с маской по percent и опционально mask.png (ImageChops.darker).
      Слой 3: overlay.png (стекло/блики). Все загрузки в try/except, ресайз RGBA с Resampling.LANCZOS.
    """
    if config is None:
        config = BarProfileConfig(id="default", name="default")
    percent = max(0.0, min(1.0, percent))
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    default_bg = (50, 50, 50, 255)
    default_fg = (0, 200, 0, 255)
    bg_rgba = hex_to_rgba(config.bg_color, default_bg)
    fg_rgba = hex_to_rgba(config.fg_color, default_fg)
    fg_end_rgba = hex_to_rgba(config.fg_color_end, fg_rgba) if config.fg_color_end else None
    fg_mid_rgba = hex_to_rgba(getattr(config, "fg_color_mid", None) or None, fg_rgba) if getattr(config, "fg_color_mid", None) else None
    gradient_stop = max(0.01, min(1.0, getattr(config, "gradient_stop", None) or 1.0))
    gradient_mid_stop = max(0.01, min(0.99, getattr(config, "gradient_mid_stop", None) or 0.5))
    border_rgba = hex_to_rgba(config.border_color, (0, 0, 0, 255))
    radius = max(0, getattr(config, "border_radius", 0))

    if config.mode == "solid":
        draw = ImageDraw.Draw(canvas)
        box_bg = [0, 0, width - 1, height - 1]
        if radius > 0:
            draw.rounded_rectangle(box_bg, radius=radius, fill=bg_rgba)
        else:
            draw.rectangle(box_bg, fill=bg_rgba)

        fill_w = max(0, int(width * percent))
        if fill_w > 0:
            use_three = fg_mid_rgba is not None and fg_end_rgba is not None
            use_gradient = use_three or (fg_end_rgba is not None and fg_end_rgba != fg_rgba)
            if use_three:
                # Трёхточечный градиент: start → mid → end
                grad_pixels = []
                for y in range(height):
                    for x in range(fill_w):
                        t = x / max(1, fill_w - 1)
                        # Позиция перехода ограничена gradient_stop
                        t_eff = t / gradient_stop if gradient_stop < 1 else t
                        t_eff = min(1.0, t_eff)
                        mid = gradient_mid_stop
                        if t_eff <= mid:
                            s = t_eff / max(1e-6, mid)
                            r = int(fg_rgba[0] + (fg_mid_rgba[0] - fg_rgba[0]) * s)
                            g = int(fg_rgba[1] + (fg_mid_rgba[1] - fg_rgba[1]) * s)
                            b = int(fg_rgba[2] + (fg_mid_rgba[2] - fg_rgba[2]) * s)
                            a = int(fg_rgba[3] + (fg_mid_rgba[3] - fg_rgba[3]) * s)
                        else:
                            s = (t_eff - mid) / max(1e-6, 1 - mid)
                            r = int(fg_mid_rgba[0] + (fg_end_rgba[0] - fg_mid_rgba[0]) * s)
                            g = int(fg_mid_rgba[1] + (fg_end_rgba[1] - fg_mid_rgba[1]) * s)
                            b = int(fg_mid_rgba[2] + (fg_end_rgba[2] - fg_mid_rgba[2]) * s)
                            a = int(fg_mid_rgba[3] + (fg_end_rgba[3] - fg_mid_rgba[3]) * s)
                        grad_pixels.append((r, g, b, a))
                grad_img = Image.new("RGBA", (fill_w, height))
                grad_img.putdata(grad_pixels)
                if radius > 0:
                    mask = Image.new("L", (fill_w, height), 0)
                    draw_mask = ImageDraw.Draw(mask)
                    draw_mask.rounded_rectangle([0, 0, fill_w - 1, height - 1], radius=radius, fill=255)
                    canvas.paste(grad_img, (0, 0), mask)
                else:
                    canvas.paste(grad_img, (0, 0))
            elif use_gradient:
                # Двухточечный градиент с опциональным gradient_stop
                grad_pixels = []
                for y in range(height):
                    for x in range(fill_w):
                        t_raw = x / max(1, fill_w - 1)
                        t = min(1.0, t_raw / gradient_stop) if gradient_stop < 1 else t_raw
                        r = int(fg_rgba[0] + (fg_end_rgba[0] - fg_rgba[0]) * t)
                        g = int(fg_rgba[1] + (fg_end_rgba[1] - fg_rgba[1]) * t)
                        b = int(fg_rgba[2] + (fg_end_rgba[2] - fg_rgba[2]) * t)
                        a = int(fg_rgba[3] + (fg_end_rgba[3] - fg_rgba[3]) * t)
                        grad_pixels.append((r, g, b, a))
                grad_img = Image.new("RGBA", (fill_w, height))
                grad_img.putdata(grad_pixels)
                if radius > 0:
                    mask = Image.new("L", (fill_w, height), 0)
                    draw_mask = ImageDraw.Draw(mask)
                    draw_mask.rounded_rectangle([0, 0, fill_w - 1, height - 1], radius=radius, fill=255)
                    canvas.paste(grad_img, (0, 0), mask)
                else:
                    canvas.paste(grad_img, (0, 0))
            else:
                box_fill = [0, 0, fill_w - 1, height - 1]
                if radius > 0:
                    draw.rounded_rectangle(box_fill, radius=radius, fill=fg_rgba)
                else:
                    draw.rectangle(box_fill, fill=fg_rgba)

        if config.border_width > 0:
            draw = ImageDraw.Draw(canvas)
            if radius > 0:
                draw.rounded_rectangle(
                    box_bg,
                    radius=radius,
                    outline=border_rgba,
                    width=config.border_width,
                )
            else:
                for i in range(config.border_width):
                    draw.rectangle(
                        [i, i, width - 1 - i, height - 1 - i],
                        outline=border_rgba,
                    )
        return canvas

    # mode == "textured" — Asset Override: systems/{system_name}/bars/{bar_id}/ затем default/bars/{bar_id}/
    # Слой 1: bg.png (фон)
    try:
        bg_path = _resolve_bar_texture_path(bar_id, system_name, "bg.png")
        if bg_path:
            bg = Image.open(bg_path).convert("RGBA").resize((width, height), resample=RESAMPLE)
            canvas.paste(bg, (0, 0))
        else:
            draw = ImageDraw.Draw(canvas)
            draw.rectangle([0, 0, width - 1, height - 1], fill=bg_rgba)
    except (OSError, IOError):
        draw = ImageDraw.Draw(canvas)
        draw.rectangle([0, 0, width - 1, height - 1], fill=bg_rgba)

    # Слой 2: fg.png (жидкость) + маска заполнения по percent; при наличии mask.png — объединение через ImageChops.darker
    try:
        fg_path = _resolve_bar_texture_path(bar_id, system_name, "fg.png")
        if not fg_path:
            raise FileNotFoundError("fg.png not found")
        fg = Image.open(fg_path).convert("RGBA").resize((width, height), resample=RESAMPLE)

        crop_w = max(1, int(width * percent))
        percent_mask = Image.new("L", (width, height), 0)
        ImageDraw.Draw(percent_mask).rectangle((0, 0, crop_w - 1, height - 1), fill=255)

        mask_path = _resolve_bar_texture_path(bar_id, system_name, "mask.png")
        if mask_path:
            shape_mask = Image.open(mask_path).convert("L").resize((width, height), resample=RESAMPLE)
            final_mask = ImageChops.darker(percent_mask, shape_mask)
        else:
            fg_alpha = fg.split()[3]
            final_mask = ImageChops.darker(percent_mask, fg_alpha)

        canvas.paste(fg, (0, 0), final_mask)
    except (OSError, IOError, FileNotFoundError):
        pass

    # Слой 3: overlay.png (стекло/блики) поверх всего
    try:
        overlay_path = _resolve_bar_texture_path(bar_id, system_name, "overlay.png")
        if overlay_path:
            overlay = Image.open(overlay_path).convert("RGBA").resize((width, height), resample=RESAMPLE)
            canvas.paste(overlay, (0, 0), overlay)
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
