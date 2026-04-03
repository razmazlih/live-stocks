#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageColor, ImageDraw, ImageFont


OUT_DIR = Path(__file__).resolve().parent
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 3600, 9800
FULL = OUT_DIR / "livestocks-redesign-board-v3-pro.png"
PREVIEW = OUT_DIR / "livestocks-redesign-board-v3-pro-preview.png"


PALETTE = {
    "bg_top": "#F1F6FF",
    "bg_bottom": "#FBFDFF",
    "ink": "#101D3D",
    "ink_soft": "#4C5D80",
    "line": "#D6E2F6",
    "card": "#FFFFFF",
    "navy": "#152F5A",
    "blue": "#2F67FF",
    "blue_soft": "#EAF1FF",
    "green": "#10A37F",
    "green_soft": "#E9FBF5",
    "amber": "#C67D21",
    "amber_soft": "#FFF6EA",
    "rose": "#D13F5F",
    "rose_soft": "#FFF1F5",
    "panel": "#F4F8FF",
}

ROUTES: List[Tuple[str, str, str]] = [
    ("/", "Dashboard", "Realtime portfolio intelligence and action center"),
    ("/positions", "Positions", "Lot-level execution, plans, and trade controls"),
    ("/portfolio", "Portfolio", "Macro timeline, movers, and performance lens"),
    ("/realized", "Realized P/L", "Closed-trade accounting with tax awareness"),
    ("/watchlist", "Watchlist", "Signal-first market radar across grouped symbols"),
    ("/insights", "Insights", "Weekly narrative with risk and momentum signals"),
    ("/ai-prompts", "AI Prompts", "Structured analyst prompt generation workspace"),
    ("/settings", "Settings", "Language, FX, refresh strategy, and providers"),
    ("/stock/[symbol]", "Stock Detail", "Single-symbol deep analysis and trade context"),
]


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size=size, index=index)
    except Exception:
        return ImageFont.load_default()


FONT_H1 = font("/System/Library/Fonts/Avenir Next.ttc", 66, 1)
FONT_H2 = font("/System/Library/Fonts/Avenir Next.ttc", 34, 1)
FONT_H3 = font("/System/Library/Fonts/Avenir Next.ttc", 26, 1)
FONT_BODY = font("/System/Library/Fonts/Avenir Next.ttc", 22, 0)
FONT_XS = font("/System/Library/Fonts/Avenir Next.ttc", 18, 0)
FONT_HE = font("/System/Library/Fonts/SFHebrew.ttf", 20, 0)


def gradient_background(img: Image.Image) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    top = ImageColor.getrgb(PALETTE["bg_top"])
    bottom = ImageColor.getrgb(PALETTE["bg_bottom"])
    for y in range(H):
        t = y / (H - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        d.line([(0, y), (W, y)], fill=(r, g, b, 255))
    d.ellipse([(-220, -180), (980, 920)], fill=(47, 103, 255, 34))
    d.ellipse([(2600, -200), (3920, 980)], fill=(16, 163, 127, 25))
    d.ellipse([(-350, 7700), (1200, 9400)], fill=(198, 125, 33, 17))


def card(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, r: int = 24, fill: str = PALETTE["card"], outline: str = PALETTE["line"]) -> None:
    # dual shadow for depth
    draw.rounded_rectangle([x + 8, y + 10, x + w + 8, y + h + 10], radius=r, fill=(16, 29, 61, 18))
    draw.rounded_rectangle([x + 3, y + 4, x + w + 3, y + h + 4], radius=r, fill=(16, 29, 61, 10))
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill, outline=outline, width=2)


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, label: str, tone: str = "blue") -> int:
    mapping = {
        "blue": (PALETTE["blue_soft"], "#1D4ED8", "#C9D8FF"),
        "green": (PALETTE["green_soft"], "#047857", "#BEEEDC"),
        "amber": (PALETTE["amber_soft"], "#9A5F15", "#F3DEBF"),
        "rose": (PALETTE["rose_soft"], "#B42346", "#F4C5D3"),
    }
    bg, fg, line = mapping[tone]
    tw = int(draw.textlength(label, font=FONT_XS))
    w = tw + 34
    draw.rounded_rectangle([x, y, x + w, y + 42], radius=21, fill=bg, outline=line, width=1)
    draw.text((x + 17, y + 10), label, fill=fg, font=FONT_XS)
    return w


def stat(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, value: str, sub: str, tone: str = "blue") -> None:
    fills = {
        "blue": "#F6F9FF",
        "green": "#F1FFF9",
        "amber": "#FFFAF2",
        "rose": "#FFF5F7",
    }
    card(draw, x, y, w, h, r=18, fill=fills[tone], outline="#DCE6F7")
    draw.text((x + 16, y + 14), title, fill=PALETTE["ink_soft"], font=FONT_XS)
    draw.text((x + 16, y + 46), value, fill=PALETTE["ink"], font=FONT_H3)
    draw.text((x + 16, y + h - 30), sub, fill="#64748B", font=FONT_XS)


def chart_panel(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, subtitle: str) -> None:
    card(draw, x, y, w, h, r=22, fill=PALETTE["card"])
    draw.text((x + 20, y + 16), title, fill=PALETTE["ink"], font=FONT_H3)
    draw.text((x + 20, y + 52), subtitle, fill="#617394", font=FONT_XS)
    gx1, gy1, gx2, gy2 = x + 20, y + 92, x + w - 20, y + h - 20
    draw.rounded_rectangle([gx1, gy1, gx2, gy2], radius=16, fill=PALETTE["panel"], outline="#CFE0F8", width=1)
    for i in range(1, 5):
        yy = gy1 + int((gy2 - gy1) * i / 5)
        draw.line([(gx1 + 10, yy), (gx2 - 10, yy)], fill="#DCE8FA", width=1)
    pts = []
    seeds = [0.78, 0.71, 0.74, 0.66, 0.63, 0.57, 0.61, 0.49, 0.53, 0.42]
    for i, s in enumerate(seeds):
        px = gx1 + 24 + int((gx2 - gx1 - 48) * i / (len(seeds) - 1))
        py = gy1 + int((gy2 - gy1) * s)
        pts.append((px, py))
    draw.line(pts, fill=PALETTE["blue"], width=6, joint="curve")
    for px, py in pts[::2]:
        draw.ellipse([px - 5, py - 5, px + 5, py + 5], fill=PALETTE["blue"])


def table_panel(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, rows: int = 4) -> None:
    card(draw, x, y, w, h, r=22, fill=PALETTE["card"])
    draw.text((x + 20, y + 16), title, fill=PALETTE["ink"], font=FONT_H3)
    row_h = int((h - 72) / rows)
    for i in range(rows):
        ry = y + 56 + i * row_h
        draw.rounded_rectangle([x + 16, ry, x + w - 16, ry + row_h - 12], radius=12, fill="#F8FBFF", outline="#DCE6F7", width=1)
        draw.text((x + 30, ry + 10), f"Row {i + 1}", fill="#24457B", font=FONT_XS)
        bar_w = 140 + (i * 30)
        draw.rounded_rectangle([x + 130, ry + 15, x + 130 + bar_w, ry + 27], radius=6, fill="#D5E4FF")
        draw.rounded_rectangle([x + 130, ry + 15, x + 130 + int(bar_w * 0.66), ry + 27], radius=6, fill=PALETTE["blue"])
        draw.text((x + w - 190, ry + 9), "Updated now", fill="#64748B", font=FONT_XS)


def draw_shell_desktop(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, route: str, title: str) -> None:
    card(draw, x, y, w, h, r=28, fill="#F8FBFF", outline="#C8D9F3")
    card(draw, x + 16, y + 16, w - 32, 74, r=18, fill="#FFFFFF", outline="#D9E4F6")
    draw.text((x + 36, y + 38), "LiveStocks", fill=PALETTE["ink"], font=FONT_H3)
    nav_x = x + 260
    for i, n in enumerate(["Dashboard", "Positions", "Portfolio", "Watchlist", "Insights", "Settings"]):
        tone = "blue" if n == title else "green" if i % 3 == 1 else "amber" if i % 3 == 2 else "blue"
        nav_x += pill(draw, nav_x, y + 30, n, tone=tone if n == title else "blue") + 10
        if nav_x > x + w - 380:
            break
    pill(draw, x + w - 194, y + 30, "HE / EN • RTL", tone="green")
    draw.text((x + 20, y + 112), route, fill="#1D4ED8", font=FONT_XS)
    draw.text((x + 20, y + 138), title, fill=PALETTE["ink"], font=FONT_H2)


def draw_shell_mobile(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, route: str, title: str) -> None:
    card(draw, x, y, w, h, r=28, fill="#F8FBFF", outline="#C8D9F3")
    card(draw, x + 12, y + 12, w - 24, 62, r=14, fill="#FFFFFF", outline="#D9E4F6")
    draw.text((x + 26, y + 32), "LiveStocks", fill=PALETTE["ink"], font=FONT_XS)
    draw.text((x + w - 138, y + 32), "HE • RTL", fill="#1D4ED8", font=FONT_XS)
    draw.text((x + 18, y + 90), route, fill="#2563EB", font=FONT_XS)
    draw.text((x + 18, y + 116), title, fill=PALETTE["ink"], font=FONT_H3)
    card(draw, x + 12, y + h - 74, w - 24, 58, r=14, fill="#FFFFFF", outline="#D9E4F6")
    draw.text((x + 24, y + h - 52), "Home   Positions   Port   Watch   More", fill="#5C7194", font=FONT_XS)


def desktop_content(draw: ImageDraw.ImageDraw, route: str, title: str, x: int, y: int, w: int, h: int) -> None:
    inner_x, inner_y = x + 20, y + 188
    inner_w = w - 40
    if route in ["/", "/portfolio", "/stock/[symbol]"]:
        stat_w = (inner_w - 3 * 14) // 4
        stat(draw, inner_x, inner_y, stat_w, 126, "Total Value", "$245.2K", "Realtime", "blue")
        stat(draw, inner_x + stat_w + 14, inner_y, stat_w, 126, "Open P/L", "+$18.4K", "+7.8%", "green")
        stat(draw, inner_x + 2 * (stat_w + 14), inner_y, stat_w, 126, "Forecast", "+$26.1K", "12M outlook", "amber")
        stat(draw, inner_x + 3 * (stat_w + 14), inner_y, stat_w, 126, "Risk", "38%", "Concentration", "rose")
        chart_panel(draw, inner_x, inner_y + 142, inner_w, 248, f"{title} Trend Engine", "Performance line with risk overlays")
        table_panel(draw, inner_x, inner_y + 404, inner_w, 190, f"{title} Focus List", rows=3)
    elif route in ["/positions", "/realized"]:
        chart_panel(draw, inner_x, inner_y, int(inner_w * 0.64), 230, f"{title} Controls", "Filters, side, lots, execution mode")
        table_panel(draw, inner_x + int(inner_w * 0.64) + 14, inner_y, inner_w - int(inner_w * 0.64) - 14, 230, "Plans Queue", rows=4)
        table_panel(draw, inner_x, inner_y + 246, inner_w, 348, f"{title} Ledger", rows=6)
    elif route in ["/watchlist", "/insights"]:
        chart_panel(draw, inner_x, inner_y, inner_w, 210, f"{title} Overview", "Prioritized market signals and context")
        table_panel(draw, inner_x, inner_y + 224, int(inner_w * 0.49), 370, "Groups / Themes", rows=6)
        table_panel(draw, inner_x + int(inner_w * 0.49) + 14, inner_y + 224, inner_w - int(inner_w * 0.49) - 14, 370, "Symbols / Notes", rows=6)
    elif route == "/ai-prompts":
        table_panel(draw, inner_x, inner_y, int(inner_w * 0.48), 594, "Prompt Builder", rows=8)
        chart_panel(draw, inner_x + int(inner_w * 0.48) + 14, inner_y, inner_w - int(inner_w * 0.48) - 14, 594, "Generated Prompt + Validation", "Markdown schema, source constraints, and copy-ready output")
    else:  # settings
        left_w = int(inner_w * 0.5)
        table_panel(draw, inner_x, inner_y, left_w, 286, "Localization + FX", rows=4)
        table_panel(draw, inner_x + left_w + 14, inner_y, inner_w - left_w - 14, 286, "Data Providers", rows=4)
        chart_panel(draw, inner_x, inner_y + 300, inner_w, 294, "Preferences & Security", "Refresh cadence, token state, accessibility defaults")


def mobile_content(draw: ImageDraw.ImageDraw, route: str, title: str, x: int, y: int, w: int, h: int) -> None:
    ix, iy, iw = x + 16, y + 166, w - 32
    stat(draw, ix, iy, iw, 94, "Portfolio Pulse", "+2.14%", "Weekly", "blue")
    stat(draw, ix, iy + 104, iw, 94, "Risk/Gap", "3.1%", "Needs review", "amber")
    if route in ["/positions", "/realized", "/watchlist"]:
        table_panel(draw, ix, iy + 208, iw, 274, f"{title} List", rows=4)
    elif route == "/ai-prompts":
        table_panel(draw, ix, iy + 208, iw, 132, "Prompt Blocks", rows=2)
        chart_panel(draw, ix, iy + 352, iw, 130, "Output Preview", "Copy-ready prompt")
    elif route == "/settings":
        table_panel(draw, ix, iy + 208, iw, 132, "Language + FX", rows=2)
        table_panel(draw, ix, iy + 352, iw, 130, "Refresh + Token", rows=2)
    else:
        chart_panel(draw, ix, iy + 208, iw, 274, f"{title} Trend", "Mobile-first insight panel")


def draw_header(draw: ImageDraw.ImageDraw) -> None:
    card(draw, 44, 34, W - 88, 178, r=30, fill="#FFFFFF", outline="#CBDBF3")
    draw.text((78, 64), "LiveStocks Professional Redesign • V3", fill=PALETTE["ink"], font=FONT_H1)
    draw.text((80, 142), "Institutional fintech style, bilingual-ready, and responsive for desktop/mobile", fill="#53698E", font=FONT_BODY)
    pill(draw, W - 630, 84, "Without Figma paid quota", tone="green")
    draw.text((W - 466, 142), "עברית + English", fill="#2A4677", font=FONT_HE)


def main() -> None:
    img = Image.new("RGBA", (W, H), "#FFFFFF")
    draw = ImageDraw.Draw(img, "RGBA")
    gradient_background(img)
    draw_header(draw)

    row_y = 236
    row_h = 1050
    desk_w, desk_h = 2440, 810
    mob_w, mob_h = 940, 810
    gap = 56
    left = 58

    for route, title, subtitle in ROUTES:
        draw.text((left, row_y + 8), f"{route}  |  {title}", fill=PALETTE["ink"], font=FONT_H2)
        draw.text((left, row_y + 52), subtitle, fill="#607596", font=FONT_BODY)
        dx, dy = left, row_y + 96
        mx, my = dx + desk_w + gap, dy

        draw_shell_desktop(draw, dx, dy, desk_w, desk_h, route, title)
        desktop_content(draw, route, title, dx, dy, desk_w, desk_h)

        draw_shell_mobile(draw, mx, my, mob_w, mob_h, route, title)
        mobile_content(draw, route, title, mx, my, mob_w, mob_h)

        row_y += row_h

    img.convert("RGB").save(FULL, optimize=True)

    preview = img.copy()
    preview.thumbnail((1500, 4200))
    preview.convert("RGB").save(PREVIEW, optimize=True)

    # split into 3 readable parts for chat
    w, h = img.size
    chunk = h // 3
    for i in range(3):
        top = i * chunk
        bottom = h if i == 2 else (i + 1) * chunk
        part = img.crop((0, top, w, bottom))
        part.thumbnail((1500, 3300))
        part.convert("RGB").save(OUT_DIR / f"livestocks-redesign-board-v3-pro-part{i+1}.png", optimize=True)

    print(FULL)
    print(PREVIEW)


if __name__ == "__main__":
    main()
