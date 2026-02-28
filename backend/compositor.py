import os
import requests
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from backend.models import Actor, MiniatureLayout, DisplayField

RENDER_DIR = "data/render"
os.makedirs(RENDER_DIR, exist_ok=True)

def hex_to_rgb(hex_color: str):
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:
        return (0, 180, 0) # default green
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def draw_display_field(draw: ImageDraw.ImageDraw, field: DisplayField, actor: Actor, x: int, y: int, width: int, font: ImageFont.FreeTypeFont):
    val = actor.stats.get(field.value_path, 0)
    
    if field.type == "text":
        text = f"{field.label + ': ' if field.label else ''}{val}"
        draw.text((x, y), text, fill=(255, 255, 255), font=font)
    elif field.type == "bar":
        max_val = val
        if field.max_value_path:
            max_val = actor.stats.get(field.max_value_path, val if val > 0 else 10)
        if max_val == 0: max_val = 1
        
        pct = max(0, min(1, val / max_val))
        bar_h = 16
        
        color = hex_to_rgb(field.color) if field.color else (0, 180, 0)
        bg_color = (max(0, color[0]-100), max(0, color[1]-100), max(0, color[2]-100))
        
        # Background
        draw.rectangle([x, y, x + width, y + bar_h], fill=bg_color)
        # Foreground
        draw.rectangle([x, y, x + int(width * pct), y + bar_h], fill=color)
        
        # Text
        text = f"{val}/{max_val}"
        # Center text in bar
        # For default font, approximate width
        text_w = len(text) * 6
        draw.text((x + width//2 - text_w//2, y + 2), text, fill=(255, 255, 255), font=font)

def render_miniature(actor: Actor, layout: MiniatureLayout, width: int = 240, height: int = 240) -> str:
    img = Image.new('RGB', (width, height), color=(20, 20, 20))
    draw = ImageDraw.Draw(img)
    
    portrait_height = 160
    if actor.portrait and layout.show_portrait:
        try:
            if actor.portrait.startswith('http'):
                response = requests.get(actor.portrait, timeout=5)
                portrait_img = Image.open(BytesIO(response.content))
            else:
                portrait_img = Image.open(actor.portrait)
            
            portrait_img = portrait_img.convert('RGBA')
            portrait_img = portrait_img.resize((width, portrait_height))
            img.paste(portrait_img, (0, 0))
        except Exception as e:
            print(f"Ошибка загрузки портрета: {e}")
            draw.rectangle([0, 0, width, portrait_height], fill=(50, 50, 50))
            draw.text((width//2 - 40, portrait_height//2), "No Portrait", fill=(255, 255, 255))
    
    font = ImageFont.load_default()
    
    # Base Y for stats area
    stats_y = portrait_height + 5 if layout.show_portrait else 5
    
    # Draw Name
    draw.text((10, stats_y), actor.name, fill=(255, 255, 255), font=font)
    
    # Draw Layout Slots
    slot_y = stats_y + 20
    slot_width = (width - 30) // 2 # Two columns, 10px padding sides, 10px middle
    
    if layout.top1:
        draw_display_field(draw, layout.top1, actor, 10, slot_y, slot_width, font)
    if layout.top2:
        draw_display_field(draw, layout.top2, actor, 20 + slot_width, slot_y, slot_width, font)
        
    slot_y += 25
    
    if layout.bottom1:
        draw_display_field(draw, layout.bottom1, actor, 10, slot_y, slot_width, font)
    if layout.bottom2:
        draw_display_field(draw, layout.bottom2, actor, 20 + slot_width, slot_y, slot_width, font)
    
    # Draw Effects
    if actor.visibility.effects:
        visible_effects = [e.name for e in actor.effects if e.show_on_miniature]
        if visible_effects:
            effects_text = ", ".join(visible_effects)
            if len(effects_text) > 35:
                effects_text = effects_text[:32] + "..."
            draw.text((10, height - 20), f"Fx: {effects_text}", fill=(200, 200, 255), font=font)

    output_path = os.path.join(RENDER_DIR, f"{actor.id}.png")
    img.save(output_path)
    return output_path
