#!/usr/bin/env python3
"""Generate the TenLing app icon set from the brand mark.

Primary path: rasterize assets/icon/master-source.png (the soft 3D mark)
through a squircle mask into PNG / ICO / ICNS for Tauri, public/, and docs/.

With no master file, paint the flat fallback: a white page, markdown `#`,
and a coral stroke on an ink-teal squircle. Pass --source to use other art.

Usage:
  python3 scripts/generate-icon.py
  python3 scripts/generate-icon.py --source path/to/art.jpg
"""

from __future__ import annotations

import argparse
import math
import os
import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src-tauri" / "icons"
ASSETS_DIR = ROOT / "assets" / "icon"
PUBLIC = ROOT / "public"
DOCS_ASSETS = ROOT / "docs" / "assets"
DEFAULT_MASTER = ASSETS_DIR / "master-source.png"


def squircle_mask(size: int, n: float = 4.6) -> Image.Image:
    """Smooth iOS-style superellipse alpha mask."""
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    cx = cy = (size - 1) / 2.0
    r = size / 2.0 * 0.992
    for y in range(size):
        for x in range(size):
            nx = abs((x - cx) / r)
            ny = abs((y - cy) / r)
            d = nx**n + ny**n
            if d <= 0.88:
                px[x, y] = 255
            elif d <= 1.0:
                t = (1.0 - d) / 0.12
                px[x, y] = max(0, min(255, int(255 * (t**0.65))))
    return mask


def soft_vignette(size: int) -> Image.Image:
    """Subtle edge darkening to ground the icon on light wallpapers."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(12):
        a = int(10 * (i / 11) ** 1.6)
        inset = int(size * 0.01 * i)
        draw.rounded_rectangle(
            [inset, inset, size - 1 - inset, size - 1 - inset],
            radius=int(size * 0.22),
            outline=(0, 0, 0, a),
            width=max(1, size // 400),
        )
    return layer.filter(ImageFilter.GaussianBlur(radius=max(1, size // 80)))


def load_master(path: Path, size: int = 2048) -> Image.Image:
    img = Image.open(path).convert("RGB")
    # Center-crop to square if needed
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    # Gentle polish
    img = ImageEnhance.Color(img).enhance(1.06)
    img = ImageEnhance.Contrast(img).enhance(1.04)
    img = ImageEnhance.Sharpness(img).enhance(1.08)
    return img.convert("RGBA")


def thick_line(draw: ImageDraw.ImageDraw, p0, p1, width: int, fill) -> None:
    """Line with rounded caps (PIL lines have none)."""
    draw.line([p0, p1], fill=fill, width=width)
    r = width / 2.0
    for p in (p0, p1):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def vertical_gradient(size: tuple[int, int], stops: list[tuple[float, tuple[int, int, int, int]]]) -> Image.Image:
    """Multi-stop vertical gradient. stops: [(pos 0..1, RGBA), ...]"""
    w, h = size
    img = Image.new("RGBA", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1:
                u = (t - t0) / max(1e-6, t1 - t0)
                px[0, y] = tuple(int(c0[k] + (c1[k] - c0[k]) * u) for k in range(4))
                break
    return img.resize((w, h))


def radial_glow(size: int, center: tuple[float, float], radius: float, color, peak_alpha: int) -> Image.Image:
    """Soft radial light, composited to add depth to the background."""
    small = 128
    layer = Image.new("RGBA", (small, small), (0, 0, 0, 0))
    px = layer.load()
    cx, cy = center[0] * small, center[1] * small
    r = radius * small
    for y in range(small):
        for x in range(small):
            d = math.hypot(x - cx, y - cy) / r
            if d < 1.0:
                px[x, y] = (*color, int(peak_alpha * (1.0 - d) ** 1.8))
    return layer.resize((size, size), Image.Resampling.BICUBIC)


def paint_hash(size: int, center: tuple[float, float], half: float, bar: int) -> Image.Image:
    """The markdown `#` as a standalone layer filled with a teal gradient."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    cx, cy = center
    slant = half * 0.22  # vertical bars lean right, like a pen stroke
    for dx in (-half * 0.40, half * 0.40):
        thick_line(md, (cx + dx + slant, cy - half), (cx + dx - slant, cy + half), bar, 255)
    for dy in (-half * 0.36, half * 0.36):
        thick_line(md, (cx - half * 1.08, cy + dy), (cx + half * 1.08, cy + dy), bar, 255)
    fill = vertical_gradient(
        (size, size),
        [
            (0.0, (23, 138, 122, 255)),  # #178A7A
            (1.0, (10, 74, 68, 255)),  # #0A4A44
        ],
    )
    layer.paste(fill, (0, 0), mask)
    return layer


def paint_master(size: int) -> Image.Image:
    """The TenLing mark: white page, markdown #, coral signature stroke."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Background: deep ink teal, warmly lit from the top-left
    img = vertical_gradient(
        (size, size),
        [
            (0.0, (21, 122, 110, 255)),  # #157A6E
            (0.55, (14, 94, 86, 255)),  # #0E5E56
            (1.0, (9, 56, 53, 255)),  # #093835
        ],
    )
    img = Image.alpha_composite(
        img, radial_glow(size, (0.22, 0.14), 0.95, (255, 238, 214), 40)
    )
    img = Image.alpha_composite(img, radial_glow(size, (0.9, 1.0), 1.1, (4, 26, 24), 46))

    # Page geometry (page-local coordinates, rotated into place at the end)
    pw, ph = int(size * 0.50), int(size * 0.60)
    px0, py0 = int((size - pw) / 2), int(size * 0.215)
    radius = int(pw * 0.09)

    # Drop shadow
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [px0, py0 + size * 0.02, px0 + pw, py0 + ph + size * 0.02],
        radius=radius,
        fill=(6, 34, 30, 82),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(4, size // 55)))
    img = Image.alpha_composite(img, shadow)

    # Page body + folded corner, clipped to the rounded silhouette
    page = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(page)
    pd.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=radius, fill=(253, 253, 255, 255))
    fold = int(pw * 0.20)
    pd.polygon(
        [(px0 + pw - fold, py0), (px0 + pw, py0 + fold), (px0 + pw - fold, py0 + fold)],
        fill=(221, 216, 206, 255),
    )
    pd.polygon(
        [(px0 + pw - fold, py0), (px0 + pw, py0), (px0 + pw, py0 + fold)],
        fill=(240, 237, 229, 255),
    )
    clip = Image.new("L", (size, size), 0)
    ImageDraw.Draw(clip).rounded_rectangle(
        [px0, py0, px0 + pw, py0 + ph], radius=radius, fill=255
    )
    page.putalpha(clip)

    # Page content: markdown #, two text lines, coral signature stroke
    content = paint_hash(size, (px0 + pw * 0.47, py0 + ph * 0.36), pw * 0.185, max(6, size // 44))
    cd = ImageDraw.Draw(content)
    line_h = max(6, size // 72)
    for i, frac_w in enumerate((0.52, 0.38)):
        lw = pw * frac_w
        lx = px0 + (pw - lw) / 2
        ly = py0 + ph * (0.62 + i * 0.11)
        cd.rounded_rectangle(
            [lx, ly, lx + lw, ly + line_h],
            radius=line_h / 2,
            fill=(196, 205, 201, 255),
        )
    # Coral signature: a loose pen curve under the text
    coral = (255, 107, 74, 255)
    y_base = py0 + ph * 0.86
    pts = []
    for i in range(48):
        u = i / 47
        x = px0 + pw * (0.16 + 0.68 * u)
        y = y_base + ph * 0.045 * math.sin(u * math.pi * 1.7) - ph * 0.02 * u
        pts.append((x, y))
    sw = max(4, size // 110)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(pts, fill=(255, 107, 74, 70), width=sw * 3, joint="curve")
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, size // 220)))
    content = Image.alpha_composite(content, glow)
    cd = ImageDraw.Draw(content)
    cd.line(pts, fill=coral, width=sw, joint="curve")
    for p in (pts[0], pts[-1]):
        r = sw / 2.0
        cd.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=coral)

    page = Image.alpha_composite(page, content)
    page = page.rotate(-7, resample=Image.Resampling.BICUBIC, center=(size / 2, size * 0.51))
    img = Image.alpha_composite(img, page)
    return img


def apply_squircle(src: Image.Image, *, vignette: bool = True) -> Image.Image:
    size = src.size[0]
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rgba = src.convert("RGBA")
    # The painted mark needs an edge vignette. A rendered master already has its own light.
    if vignette:
        rgba = Image.alpha_composite(rgba, soft_vignette(size))
    out.paste(rgba, (0, 0), mask=squircle_mask(size))
    return out


def write_svg() -> None:
    """Vector companion matching the painted mark (page, #, coral stroke)."""
    svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0%" stop-color="#157A6E"/>
      <stop offset="55%" stop-color="#0E5E56"/>
      <stop offset="100%" stop-color="#093835"/>
    </linearGradient>
    <linearGradient id="hash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#178A7A"/>
      <stop offset="100%" stop-color="#0A4A44"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.22" cy="0.14" r="0.95">
      <stop offset="0%" stop-color="#FFEED6" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#FFEED6" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2.4" stdDeviation="2.6" flood-color="#06221E" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect x="2" y="2" width="124" height="124" rx="28" ry="28" fill="url(#bg)"/>
  <rect x="2" y="2" width="124" height="124" rx="28" ry="28" fill="url(#glow)"/>
  <g transform="rotate(-7 64 65)" filter="url(#soft)">
    <path d="M41.5 32 h36 l9.5 9.5 v47 a6.5 6.5 0 0 1 -6.5 6.5 h-32.5 a6.5 6.5 0 0 1 -6.5 -6.5 v-50 a6.5 6.5 0 0 1 6.5 -6.5 z" fill="#FDFDFF"/>
    <path d="M77.5 32 L87 41.5 L77.5 41.5 Z" fill="#DDD8CE"/>
    <path d="M77.5 32 L87 32 L87 41.5 Z" fill="#F0EDE5"/>
    <g stroke="url(#hash)" stroke-width="4.6" stroke-linecap="round">
      <path d="M57.2 47 L54.8 73" fill="none"/>
      <path d="M70.2 47 L67.8 73" fill="none"/>
      <path d="M50.5 55.5 L77.5 55.5" fill="none"/>
      <path d="M49.5 64.5 L76.5 64.5" fill="none"/>
    </g>
    <rect x="50" y="79" width="29" height="3.4" rx="1.7" fill="#C4CDC9"/>
    <rect x="54.5" y="86" width="20" height="3.4" rx="1.7" fill="#C4CDC9"/>
    <path d="M46 96 C55 99 62 93.5 71 95.5 C76 96.6 80 95.8 83 93.8" fill="none"
          stroke="#FF6B4A" stroke-width="3.1" stroke-linecap="round"/>
  </g>
</svg>
"""
    (PUBLIC / "icon.svg").write_text(svg)


def write_icns(master: Image.Image, path: Path) -> None:
    def png_bytes(s: int) -> bytes:
        buf = BytesIO()
        master.resize((s, s), Image.Resampling.LANCZOS).save(buf, format="PNG")
        return buf.getvalue()

    mapping = [
        (b"icp4", 16),
        (b"icp5", 32),
        (b"icp6", 64),
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
    ]
    chunks = []
    for ostype, s in mapping:
        data = png_bytes(s)
        chunks.append(ostype + struct.pack(">I", len(data) + 8) + data)
    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate TenLing icon set")
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="Master artwork (jpg/png). Defaults to assets/icon/master-source.jpg",
    )
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    DOCS_ASSETS.mkdir(parents=True, exist_ok=True)

    source = args.source
    if source is None and DEFAULT_MASTER.exists():
        source = DEFAULT_MASTER

    if source is not None and source.exists():
        print(f"Using master art: {source}")
        base = load_master(source, 2048)
        rendered = True
    else:
        print("Painting the TenLing mark (page, #, coral stroke)")
        base = paint_master(2048)
        rendered = False

    hi = apply_squircle(base, vignette=not rendered)
    master = hi.resize((1024, 1024), Image.Resampling.LANCZOS)
    master.save(ASSETS_DIR / "icon-1024.png")

    # Preview card
    preview = Image.new("RGBA", (1200, 1200), (245, 245, 247, 255))
    sh = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([140, 170, 1060, 1110], radius=220, fill=(0, 0, 0, 38))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=42))
    preview = Image.alpha_composite(preview, sh)
    icon = master.resize((1000, 1000), Image.Resampling.LANCZOS)
    preview.paste(icon, (100, 80), icon)
    preview.save(ASSETS_DIR / "icon-preview.png")

    targets = {
        OUT_DIR / "icon.png": 512,
        OUT_DIR / "32x32.png": 32,
        OUT_DIR / "128x128.png": 128,
        OUT_DIR / "128x128@2x.png": 256,
        OUT_DIR / "Square30x30Logo.png": 30,
        OUT_DIR / "Square44x44Logo.png": 44,
        OUT_DIR / "Square71x71Logo.png": 71,
        OUT_DIR / "Square89x89Logo.png": 89,
        OUT_DIR / "Square107x107Logo.png": 107,
        OUT_DIR / "Square142x142Logo.png": 142,
        OUT_DIR / "Square150x150Logo.png": 150,
        OUT_DIR / "Square284x284Logo.png": 284,
        OUT_DIR / "Square310x310Logo.png": 310,
        OUT_DIR / "StoreLogo.png": 50,
        PUBLIC / "icon.png": 512,
        DOCS_ASSETS / "icon.png": 512,
        DOCS_ASSETS / "logo.png": 256,
    }
    for path, s in targets.items():
        master.resize((s, s), Image.Resampling.LANCZOS).save(path)

    ico_sizes = [256, 128, 64, 48, 32, 24, 16]
    icos = [master.resize((s, s), Image.Resampling.LANCZOS) for s in ico_sizes]
    icos[0].save(OUT_DIR / "icon.ico", format="ICO", append_images=icos[1:])
    write_icns(master, OUT_DIR / "icon.icns")
    # A rendered master is the icon. The flat SVG is only the procedural fallback.
    if not rendered:
        write_svg()

    # Keep a copy of the processed master for reference
    master.save(ASSETS_DIR / "icon-master.png")
    print(f"Wrote TenLing icons under {OUT_DIR}, {ASSETS_DIR}, {PUBLIC}, {DOCS_ASSETS}")


if __name__ == "__main__":
    main()
