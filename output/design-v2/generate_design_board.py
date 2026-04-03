#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image, ImageColor, ImageDraw, ImageFont


WIDTH = 3300
HEIGHT = 8600

OUT_DIR = Path(__file__).resolve().parent
OUT_IMAGE = OUT_DIR / "livestocks-redesign-board-v2.png"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        ("/System/Library/Fonts/Supplemental/Futura.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Supplemental/GillSans.ttc", 1 if bold else 0),
        ("/System/Library/Fonts/Supplemental/Arial.ttf", 0),
    ]
    for path, index in candidates:
        try:
            return ImageFont.truetype(path, size=size, index=index)
        except Exception:
            continue
    return ImageFont.load_default()


FONT_XS = load_font(20)
FONT_SM = load_font(26)
FONT_MD = load_font(34, bold=True)
FONT_LG = load_font(54, bold=True)
FONT_HERO = load_font(72, bold=True)

PALETTE = {
    "ink": "#0B1739",
    "ink_soft": "#334155",
    "sky": "#2E6BFF",
    "sky_soft": "#EAF1FF",
    "mint": "#16A085",
    "mint_soft": "#EAFBF7",
    "amber": "#C97921",
    "amber_soft": "#FFF7EC",
    "rose": "#D34444",
    "rose_soft": "#FFF0F2",
    "paper": "#F7FAFF",
    "card": "#FFFFFF",
    "line": "#D7E2F5",
    "panel": "#EDF4FF",
}

ROUTES: List[Tuple[str, str, str]] = [
    ("/", "Dashboard", "Pulse view for portfolio health, trends, and immediate actions"),
    ("/positions", "Positions", "Active and closed holdings with lot-level controls"),
    ("/portfolio", "Portfolio", "Total timeline, movers, and aggregate performance"),
    ("/realized", "Realized P/L", "Closed trades ledger with tax and expected-vs-actual"),
    ("/watchlist", "Watchlist", "Grouped tickers with live movement and mini-charts"),
    ("/insights", "Insights", "Weekly narrative, risk signals, and next actions"),
    ("/ai-prompts", "AI Prompts", "Prompt templates with strict output policy"),
    ("/settings", "Settings", "Language, FX, refresh cadence, and API credentials"),
    ("/stock/[symbol]", "Stock Detail", "Deep symbol analysis with candles and transactions"),
]


def draw_gradient_background(img: Image.Image) -> None:
    draw = ImageDraw.Draw(img, "RGBA")
    top = ImageColor.getrgb("#EEF4FF")
    bottom = ImageColor.getrgb("#F9FCFF")
    for y in range(HEIGHT):
        t = y / max(1, HEIGHT - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

    # ambient glows
    draw.ellipse([(-250, -180), (900, 860)], fill=(48, 111, 255, 36))
    draw.ellipse([(2350, -260), (3560, 920)], fill=(18, 197, 164, 30))
    draw.ellipse([(-280, 6200), (980, 7600)], fill=(211, 120, 33, 20))


def rounded_shadow_rect(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[int, int, int, int],
    radius: int = 28,
    fill: str = "#FFFFFF",
    outline: str | None = None,
    shadow_alpha: int = 35,
    shadow_offset: int = 8,
) -> None:
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(
        [x1 + shadow_offset, y1 + shadow_offset, x2 + shadow_offset, y2 + shadow_offset],
        radius=radius,
        fill=(11, 23, 57, shadow_alpha),
    )
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline or fill, width=2 if outline else 1)


def draw_badge(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, tone: str = "sky") -> None:
    fill = {
        "sky": PALETTE["sky_soft"],
        "mint": PALETTE["mint_soft"],
        "amber": PALETTE["amber_soft"],
        "rose": PALETTE["rose_soft"],
    }.get(tone, PALETTE["sky_soft"])
    color = {
        "sky": "#1D4ED8",
        "mint": "#047857",
        "amber": "#9A5A0F",
        "rose": "#B91C1C",
    }.get(tone, "#1D4ED8")
    tw = draw.textlength(text, font=FONT_XS)
    w = int(tw + 34)
    draw.rounded_rectangle([x, y, x + w, y + 46], radius=23, fill=fill, outline=PALETTE["line"], width=1)
    draw.text((x + 17, y + 11), text, fill=color, font=FONT_XS)


def metric_card(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    value: str,
    subtitle: str,
    tone: str = "sky",
) -> None:
    fill = {
        "sky": "#F5F9FF",
        "mint": "#F1FFFB",
        "amber": "#FFF9F2",
        "rose": "#FFF5F6",
    }.get(tone, "#F7FAFF")
    rounded_shadow_rect(draw, (x, y, x + w, y + h), radius=20, fill=fill, outline=PALETTE["line"], shadow_alpha=18, shadow_offset=4)
    draw.text((x + 18, y + 16), title, fill=PALETTE["ink_soft"], font=FONT_XS)
    draw.text((x + 18, y + 52), value, fill=PALETTE["ink"], font=FONT_MD)
    draw.text((x + 18, y + h - 38), subtitle, fill="#5B6F93", font=FONT_XS)


def chart_placeholder(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, subtitle: str) -> None:
    rounded_shadow_rect(draw, (x, y, x + w, y + h), radius=22, fill=PALETTE["card"], outline=PALETTE["line"], shadow_alpha=20, shadow_offset=5)
    draw.text((x + 20, y + 16), title, fill=PALETTE["ink"], font=FONT_SM)
    draw.text((x + 20, y + 56), subtitle, fill="#64748B", font=FONT_XS)
    grid_x1, grid_y1 = x + 20, y + 96
    grid_x2, grid_y2 = x + w - 20, y + h - 24
    draw.rounded_rectangle([grid_x1, grid_y1, grid_x2, grid_y2], radius=16, fill=PALETTE["panel"], outline="#C7D8F1", width=1)
    for i in range(1, 5):
        gy = int(grid_y1 + (grid_y2 - grid_y1) * i / 5)
        draw.line([(grid_x1 + 10, gy), (grid_x2 - 10, gy)], fill="#D7E5FA", width=1)
    points = []
    for i in range(9):
        px = int(grid_x1 + 24 + i * (grid_x2 - grid_x1 - 48) / 8)
        wave = [0.86, 0.78, 0.81, 0.65, 0.61, 0.67, 0.52, 0.58, 0.47][i]
        py = int(grid_y1 + (grid_y2 - grid_y1) * wave)
        points.append((px, py))
    draw.line(points, fill=PALETTE["sky"], width=6, joint="curve")
    for p in points[::2]:
        draw.ellipse([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6], fill=PALETTE["sky"])


def list_panel(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, title: str, rows: int = 4) -> None:
    rounded_shadow_rect(draw, (x, y, x + w, y + h), radius=22, fill=PALETTE["card"], outline=PALETTE["line"], shadow_alpha=20, shadow_offset=5)
    draw.text((x + 20, y + 16), title, fill=PALETTE["ink"], font=FONT_SM)
    row_h = int((h - 70) / rows)
    for i in range(rows):
        ry = y + 56 + i * row_h
        rounded_shadow_rect(
            draw,
            (x + 16, ry, x + w - 16, ry + row_h - 10),
            radius=14,
            fill="#F8FBFF",
            outline="#DFE8F8",
            shadow_alpha=0,
            shadow_offset=0,
        )
        draw.text((x + 34, ry + 14), f"Item {i + 1}", fill="#274374", font=FONT_XS)
        draw.text((x + w - 180, ry + 14), "Action", fill="#64748B", font=FONT_XS)


def draw_screen_header(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, page_title: str, route: str, mobile: bool) -> None:
    nav_h = 78 if not mobile else 62
    rounded_shadow_rect(
        draw,
        (x + 18, y + 18, x + w - 18, y + 18 + nav_h),
        radius=20 if not mobile else 16,
        fill="#FFFFFF",
        outline=PALETTE["line"],
        shadow_alpha=14,
        shadow_offset=4,
    )
    draw.text((x + 40, y + 38), "LiveStocks", fill=PALETTE["ink"], font=FONT_SM if not mobile else FONT_XS)
    draw_badge(draw, x + w - (205 if not mobile else 156), y + 34 if not mobile else y + 28, "HE / EN • RTL", "sky")
    draw.text((x + 24, y + (114 if not mobile else 90)), route, fill="#1D4ED8", font=FONT_XS)
    draw.text((x + 24, y + (142 if not mobile else 118)), page_title, fill=PALETTE["ink"], font=FONT_MD if not mobile else FONT_SM)


def draw_desktop_screen(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, route: str, title: str, desc: str) -> None:
    rounded_shadow_rect(draw, (x, y, x + w, y + h), radius=30, fill=PALETTE["paper"], outline="#CBDBF5", shadow_alpha=26, shadow_offset=8)
    draw_screen_header(draw, x, y, w, title, route, mobile=False)

    metric_y = y + 198
    gap = 16
    metric_w = (w - 40 - gap * 3) // 4
    metric_card(draw, x + 20, metric_y, metric_w, 132, "Total Value", "$245.2K", "Live", tone="sky")
    metric_card(draw, x + 20 + (metric_w + gap), metric_y, metric_w, 132, "Open P/L", "+$18.4K", "+7.8%", tone="mint")
    metric_card(draw, x + 20 + 2 * (metric_w + gap), metric_y, metric_w, 132, "Forecast", "+$26.1K", "12M estimate", tone="amber")
    metric_card(draw, x + 20 + 3 * (metric_w + gap), metric_y, metric_w, 132, "Risk", "38%", "Concentration", tone="rose")

    chart_placeholder(
        draw,
        x + 20,
        y + 350,
        w - 40,
        248,
        f"{title} Analytics",
        desc,
    )
    list_panel(draw, x + 20, y + 612, w - 40, 196, f"{title} Action Layer", rows=3)


def draw_mobile_screen(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, route: str, title: str) -> None:
    rounded_shadow_rect(draw, (x, y, x + w, y + h), radius=30, fill=PALETTE["paper"], outline="#CBDBF5", shadow_alpha=26, shadow_offset=8)
    draw_screen_header(draw, x, y, w, title, route, mobile=True)

    metric_card(draw, x + 16, y + 170, w - 32, 108, "Portfolio Pulse", "+2.14%", "Weekly move", tone="sky")
    metric_card(draw, x + 16, y + 288, w - 32, 108, "Forecast Gap", "3.1%", "Needs attention", tone="amber")
    chart_placeholder(draw, x + 16, y + 406, w - 32, 192, "Trend", "Mobile summary with key signal")
    list_panel(draw, x + 16, y + 608, w - 32, 134, "Next Actions", rows=2)
    rounded_shadow_rect(draw, (x + 16, y + h - 74, x + w - 16, y + h - 16), radius=16, fill="#FFFFFF", outline=PALETTE["line"], shadow_alpha=10, shadow_offset=3)
    draw.text((x + 32, y + h - 52), "Home   Positions   Portfolio   Watch   More", fill="#4C627F", font=FONT_XS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(img, "RGBA")

    draw_gradient_background(img)

    rounded_shadow_rect(
        draw,
        (44, 36, WIDTH - 44, 206),
        radius=34,
        fill="#FFFFFF",
        outline="#CFE0FC",
        shadow_alpha=28,
        shadow_offset=9,
    )
    draw.text((80, 68), "LiveStocks — Responsive Redesign V2", fill=PALETTE["ink"], font=FONT_HERO)
    draw.text(
        (82, 146),
        "Alternative deliverable without Figma MCP paid quota • Full product flow for Desktop + Mobile",
        fill="#516789",
        font=FONT_SM,
    )
    draw_badge(draw, WIDTH - 540, 86, "Code-first Visual Board", "mint")

    row_y = 240
    row_h = 900
    desktop_w = 2320
    mobile_w = 770
    gap_x = 54

    for route, title, subtitle in ROUTES:
        draw.text((60, row_y + 6), f"{route}  |  {title}", fill=PALETTE["ink"], font=FONT_MD)
        draw.text((64, row_y + 56), subtitle, fill="#536A8F", font=FONT_XS)

        desk_x = 60
        desk_y = row_y + 96
        draw_desktop_screen(draw, desk_x, desk_y, desktop_w, 760, route, title, subtitle)

        mob_x = desk_x + desktop_w + gap_x
        mob_y = desk_y
        draw_mobile_screen(draw, mob_x, mob_y, mobile_w, 760, route, title)

        row_y += row_h

    img.convert("RGB").save(OUT_IMAGE, "PNG", optimize=True)
    print(f"Saved: {OUT_IMAGE}")


if __name__ == "__main__":
    main()
