#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageColor, ImageDraw, ImageFont


OUT_DIR = Path(__file__).resolve().parent / "screens"
OUT_DIR.mkdir(parents=True, exist_ok=True)

W, H = 2600, 1080

PALETTE = {
    "bg_top": "#F3F7FF",
    "bg_bottom": "#FAFCFF",
    "ink": "#0F1F45",
    "ink_soft": "#4B5E83",
    "line": "#D8E3F5",
    "card": "#FFFFFF",
    "blue": "#2E66FF",
    "blue_soft": "#EDF3FF",
    "green": "#11A97A",
    "green_soft": "#E9FBF4",
    "amber": "#C67A1C",
    "amber_soft": "#FFF7EC",
    "rose": "#D44A68",
    "rose_soft": "#FFF0F5",
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


FONT_H1 = font("/System/Library/Fonts/Avenir Next.ttc", 46, 1)
FONT_H2 = font("/System/Library/Fonts/Avenir Next.ttc", 32, 1)
FONT_H3 = font("/System/Library/Fonts/Avenir Next.ttc", 24, 1)
FONT_BODY = font("/System/Library/Fonts/Avenir Next.ttc", 20, 0)
FONT_XS = font("/System/Library/Fonts/Avenir Next.ttc", 16, 0)


def gradient(img: Image.Image) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    top = ImageColor.getrgb(PALETTE["bg_top"])
    bottom = ImageColor.getrgb(PALETTE["bg_bottom"])
    for y in range(H):
        t = y / (H - 1)
        r = int(top[0] * (1 - t) + bottom[0] * t)
        g = int(top[1] * (1 - t) + bottom[1] * t)
        b = int(top[2] * (1 - t) + bottom[2] * t)
        d.line([(0, y), (W, y)], fill=(r, g, b, 255))
    d.ellipse([(-120, -80), (680, 630)], fill=(47, 103, 255, 32))
    d.ellipse([(1900, -120), (2760, 700)], fill=(16, 169, 122, 26))


def card(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, r: int = 22, fill: str = PALETTE["card"], line: str = PALETTE["line"]) -> None:
    d.rounded_rectangle([x + 6, y + 8, x + w + 6, y + h + 8], radius=r, fill=(15, 30, 69, 18))
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=fill, outline=line, width=2)


def pill(d: ImageDraw.ImageDraw, x: int, y: int, t: str, tone: str = "blue") -> int:
    mp = {
        "blue": (PALETTE["blue_soft"], "#1D4ED8", "#C9D8FF"),
        "green": (PALETTE["green_soft"], "#047857", "#C1EEDC"),
        "amber": (PALETTE["amber_soft"], "#9A5F12", "#F3E0C3"),
        "rose": (PALETTE["rose_soft"], "#B42346", "#F1CBDA"),
    }
    bg, fg, ln = mp[tone]
    tw = int(d.textlength(t, font=FONT_XS))
    w = tw + 28
    d.rounded_rectangle([x, y, x + w, y + 34], radius=17, fill=bg, outline=ln, width=1)
    d.text((x + 14, y + 8), t, fill=fg, font=FONT_XS)
    return w


def stat(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, t: str, v: str, s: str, tone: str = "blue") -> None:
    fill = {
        "blue": "#F6F9FF",
        "green": "#F1FFF8",
        "amber": "#FFFAF1",
        "rose": "#FFF4F7",
    }[tone]
    card(d, x, y, w, h, r=14, fill=fill, line="#DDE7F7")
    d.text((x + 12, y + 10), t, fill=PALETTE["ink_soft"], font=FONT_XS)
    d.text((x + 12, y + 36), v, fill=PALETTE["ink"], font=FONT_H3)
    d.text((x + 12, y + h - 26), s, fill="#667A9B", font=FONT_XS)


def chart(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, t: str, s: str) -> None:
    card(d, x, y, w, h, r=16, fill="#FFFFFF")
    d.text((x + 14, y + 12), t, fill=PALETTE["ink"], font=FONT_H3)
    d.text((x + 14, y + 42), s, fill="#607394", font=FONT_XS)
    gx1, gy1, gx2, gy2 = x + 14, y + 74, x + w - 14, y + h - 14
    d.rounded_rectangle([gx1, gy1, gx2, gy2], radius=12, fill=PALETTE["panel"], outline="#CFE0F8", width=1)
    for i in range(1, 5):
        yy = gy1 + int((gy2 - gy1) * i / 5)
        d.line([(gx1 + 8, yy), (gx2 - 8, yy)], fill="#DCE8FA", width=1)
    vals = [0.78, 0.74, 0.76, 0.68, 0.64, 0.58, 0.61, 0.49, 0.52, 0.44]
    pts = []
    for i, v in enumerate(vals):
        px = gx1 + 16 + int((gx2 - gx1 - 32) * i / (len(vals) - 1))
        py = gy1 + int((gy2 - gy1) * v)
        pts.append((px, py))
    d.line(pts, fill=PALETTE["blue"], width=4, joint="curve")
    for px, py in pts[::2]:
        d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=PALETTE["blue"])


def table(d: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, t: str, rows: int = 4) -> None:
    card(d, x, y, w, h, r=16, fill="#FFFFFF")
    d.text((x + 14, y + 12), t, fill=PALETTE["ink"], font=FONT_H3)
    rh = int((h - 52) / rows)
    for i in range(rows):
        ry = y + 44 + i * rh
        d.rounded_rectangle([x + 12, ry, x + w - 12, ry + rh - 8], radius=10, fill="#F8FBFF", outline="#DEE8F8", width=1)
        d.text((x + 24, ry + 8), f"Row {i + 1}", fill="#27477B", font=FONT_XS)
        bw = 82 + i * 24
        d.rounded_rectangle([x + 104, ry + 12, x + 104 + bw, ry + 20], radius=4, fill="#D4E3FF")
        d.rounded_rectangle([x + 104, ry + 12, x + 104 + int(bw * 0.68), ry + 20], radius=4, fill=PALETTE["blue"])
        d.text((x + w - 118, ry + 8), "Now", fill="#6A7F9F", font=FONT_XS)


def desktop(d: ImageDraw.ImageDraw, route: str, title: str, subtitle: str, x: int, y: int, w: int, h: int) -> None:
    card(d, x, y, w, h, r=24, fill="#F8FBFF", line="#C8D9F3")
    card(d, x + 12, y + 12, w - 24, 58, r=14, fill="#FFFFFF")
    d.text((x + 26, y + 28), "LiveStocks", fill=PALETTE["ink"], font=FONT_XS)
    px = x + 160
    for n in ["Dashboard", "Positions", "Portfolio", "Watchlist", "Insights", "Settings"]:
        px += pill(d, px, y + 24, n, "blue") + 6
        if px > x + w - 220:
            break
    pill(d, x + w - 134, y + 24, "RTL", "green")
    d.text((x + 16, y + 82), route, fill="#1D4ED8", font=FONT_XS)
    d.text((x + 16, y + 108), title, fill=PALETTE["ink"], font=FONT_H2)
    d.text((x + 16, y + 146), subtitle, fill=PALETTE["ink_soft"], font=FONT_BODY)

    ix, iy, iw = x + 16, y + 182, w - 32
    sw = (iw - 24) // 4
    stat(d, ix, iy, sw, 106, "Value", "$245.2K", "Realtime", "blue")
    stat(d, ix + sw + 8, iy, sw, 106, "Open P/L", "+$18.4K", "+7.8%", "green")
    stat(d, ix + 2 * (sw + 8), iy, sw, 106, "Forecast", "+$26.1K", "12M", "amber")
    stat(d, ix + 3 * (sw + 8), iy, sw, 106, "Risk", "38%", "Exposure", "rose")

    if route in ["/positions", "/realized"]:
        chart(d, ix, iy + 116, int(iw * 0.6), 174, f"{title} Controls", "Filters and execution context")
        table(d, ix + int(iw * 0.6) + 10, iy + 116, iw - int(iw * 0.6) - 10, 174, "Plans Queue", 3)
        table(d, ix, iy + 300, iw, 186, f"{title} Ledger", 4)
        chart(d, ix, iy + 496, int(iw * 0.5), 168, "Execution Heatmap", "Symbols by activity")
        table(d, ix + int(iw * 0.5) + 10, iy + 496, iw - int(iw * 0.5) - 10, 168, "Alerts / Flags", 3)
    elif route in ["/watchlist", "/insights"]:
        chart(d, ix, iy + 116, iw, 152, f"{title} Overview", "Signals and directional context")
        table(d, ix, iy + 278, int(iw * 0.48), 194, "Groups", 3)
        table(d, ix + int(iw * 0.48) + 10, iy + 278, iw - int(iw * 0.48) - 10, 194, "Symbols", 3)
        chart(d, ix, iy + 482, iw, 182, "Momentum Board", "Winners, losers, and confidence")
    elif route == "/ai-prompts":
        table(d, ix, iy + 116, int(iw * 0.45), 548, "Prompt Builder", 6)
        chart(d, ix + int(iw * 0.45) + 10, iy + 116, iw - int(iw * 0.45) - 10, 268, "Generated Prompt", "Validation and copy-ready output")
        table(d, ix + int(iw * 0.45) + 10, iy + 394, iw - int(iw * 0.45) - 10, 270, "Source Checklist", 4)
    elif route == "/settings":
        table(d, ix, iy + 116, int(iw * 0.5), 172, "Language + FX", 3)
        table(d, ix + int(iw * 0.5) + 10, iy + 116, iw - int(iw * 0.5) - 10, 172, "Providers", 3)
        chart(d, ix, iy + 298, iw, 176, "Security + Defaults", "Refresh, token health, accessibility")
        table(d, ix, iy + 484, iw, 180, "Notification Rules", 3)
    else:
        chart(d, ix, iy + 116, iw, 214, f"{title} Trend Engine", "Performance curve with confidence bands")
        table(d, ix, iy + 340, iw, 148, f"{title} Action List", 2)
        chart(d, ix, iy + 498, int(iw * 0.58), 166, "Allocation View", "Sector/region split with overlays")
        table(d, ix + int(iw * 0.58) + 10, iy + 498, iw - int(iw * 0.58) - 10, 166, "Priority Queue", 3)


def mobile(d: ImageDraw.ImageDraw, route: str, title: str, x: int, y: int, w: int, h: int) -> None:
    card(d, x, y, w, h, r=24, fill="#F8FBFF", line="#C8D9F3")
    card(d, x + 10, y + 10, w - 20, 54, r=12, fill="#FFFFFF")
    d.text((x + 20, y + 24), "LiveStocks", fill=PALETTE["ink"], font=FONT_XS)
    d.text((x + w - 78, y + 24), "RTL", fill="#1D4ED8", font=FONT_XS)
    d.text((x + 14, y + 76), route, fill="#1D4ED8", font=FONT_XS)
    d.text((x + 14, y + 98), title, fill=PALETTE["ink"], font=FONT_H3)

    ix, iy, iw = x + 14, y + 136, w - 28
    stat(d, ix, iy, iw, 86, "Pulse", "+2.14%", "weekly", "blue")
    stat(d, ix, iy + 94, iw, 86, "Gap", "3.1%", "forecast", "amber")
    if route in ["/ai-prompts", "/settings"]:
        table(d, ix, iy + 188, iw, 112, "Blocks", 2)
        chart(d, ix, iy + 308, iw, 136, "Preview", "mobile output")
        table(d, ix, iy + 452, iw, 114, "Quick Toggles", 2)
    elif route in ["/positions", "/realized", "/watchlist"]:
        table(d, ix, iy + 188, iw, 220, f"{title} List", 3)
        chart(d, ix, iy + 416, iw, 150, "Signal Snapshot", "what needs attention")
    else:
        chart(d, ix, iy + 188, iw, 220, f"{title} Trend", "mobile signal view")
        table(d, ix, iy + 416, iw, 150, "Next Actions", 3)

    card(d, x + 10, y + h - 62, w - 20, 50, r=12, fill="#FFFFFF")
    d.text((x + 18, y + h - 44), "Home  Pos  Port  Watch  More", fill="#5C7094", font=FONT_XS)


def render_screen(route: str, title: str, subtitle: str) -> Path:
    img = Image.new("RGBA", (W, H), "#FFFFFF")
    d = ImageDraw.Draw(img, "RGBA")
    gradient(img)
    card(d, 30, 20, W - 60, 112, r=22, fill="#FFFFFF")
    d.text((56, 44), f"LiveStocks • {title} Redesign", fill=PALETTE["ink"], font=FONT_H1)
    d.text((58, 96), subtitle, fill=PALETTE["ink_soft"], font=FONT_BODY)
    pill(d, W - 338, 56, "Desktop + Mobile", "green")

    desktop(d, route, title, subtitle, 34, 138, 1760, 900)
    mobile(d, route, title, 1830, 138, 736, 900)

    filename = f"{title.lower().replace(' ', '-').replace('/', '-')}.png"
    out = OUT_DIR / filename
    img.convert("RGB").save(out, optimize=True)
    return out


def main() -> None:
    created = []
    for route, title, subtitle in ROUTES:
        created.append(render_screen(route, title, subtitle))
    index = OUT_DIR / "index.txt"
    index.write_text("\n".join(str(p) for p in created), encoding="utf-8")
    print(f"Created {len(created)} screens")
    print(index)


if __name__ == "__main__":
    main()
