from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ICO_PATH = ASSETS / "drawing_app.ico"

SIZES = [16, 24, 32, 48, 64, 128, 256]


def rounded_rect_mask(x: int, y: int, size: int, radius: float) -> bool:
    left = radius
    right = size - radius - 1
    top = radius
    bottom = size - radius - 1
    if left <= x <= right or top <= y <= bottom:
        return True
    corners = (
        (left, top),
        (right, top),
        (left, bottom),
        (right, bottom),
    )
    return any((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 for cx, cy in corners)


def put_pixel(buf: bytearray, size: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < size and 0 <= y < size:
        idx = (y * size + x) * 4
        buf[idx:idx + 4] = bytes(color)


def draw_disc(buf: bytearray, size: int, cx: float, cy: float, radius: float, color: tuple[int, int, int, int]) -> None:
    min_x = max(0, int(cx - radius - 1))
    max_x = min(size - 1, int(cx + radius + 1))
    min_y = max(0, int(cy - radius - 1))
    max_y = min(size - 1, int(cy + radius + 1))
    r2 = radius * radius
    for y in range(min_y, max_y + 1):
      for x in range(min_x, max_x + 1):
        dx = x + 0.5 - cx
        dy = y + 0.5 - cy
        if dx * dx + dy * dy <= r2:
          put_pixel(buf, size, x, y, color)


def draw_line(buf: bytearray, size: int, x1: float, y1: float, x2: float, y2: float, thickness: float, color: tuple[int, int, int, int]) -> None:
    min_x = max(0, int(min(x1, x2) - thickness - 1))
    max_x = min(size - 1, int(max(x1, x2) + thickness + 1))
    min_y = max(0, int(min(y1, y2) - thickness - 1))
    max_y = min(size - 1, int(max(y1, y2) + thickness + 1))
    vx = x2 - x1
    vy = y2 - y1
    denom = vx * vx + vy * vy or 1.0
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            px = x + 0.5
            py = y + 0.5
            t = ((px - x1) * vx + (py - y1) * vy) / denom
            t = max(0.0, min(1.0, t))
            proj_x = x1 + t * vx
            proj_y = y1 + t * vy
            dx = px - proj_x
            dy = py - proj_y
            if dx * dx + dy * dy <= thickness * thickness:
                put_pixel(buf, size, x, y, color)


def draw_ring(buf: bytearray, size: int, cx: float, cy: float, radius: float, thickness: float, color: tuple[int, int, int, int]) -> None:
    min_x = max(0, int(cx - radius - thickness - 1))
    max_x = min(size - 1, int(cx + radius + thickness + 1))
    min_y = max(0, int(cy - radius - thickness - 1))
    max_y = min(size - 1, int(cy + radius + thickness + 1))
    inner = max(0.0, radius - thickness)
    outer = radius + thickness
    inner2 = inner * inner
    outer2 = outer * outer
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            d2 = dx * dx + dy * dy
            if inner2 <= d2 <= outer2:
                put_pixel(buf, size, x, y, color)


def render_icon(size: int) -> bytes:
    buf = bytearray(size * size * 4)
    bg_top = (12, 88, 120)
    bg_bottom = (15, 118, 110)
    radius = size * 0.22

    for y in range(size):
        t = y / max(1, size - 1)
        r = int(bg_top[0] * (1 - t) + bg_bottom[0] * t)
        g = int(bg_top[1] * (1 - t) + bg_bottom[1] * t)
        b = int(bg_top[2] * (1 - t) + bg_bottom[2] * t)
        for x in range(size):
            if rounded_rect_mask(x, y, size, radius):
                put_pixel(buf, size, x, y, (r, g, b, 255))
            else:
                put_pixel(buf, size, x, y, (0, 0, 0, 0))

    grid_color = (255, 255, 255, 58)
    major_grid = max(2, size // 8)
    minor_grid = max(2, size // 16)
    inset = int(size * 0.14)

    for x in range(inset, size - inset, minor_grid):
        alpha = 88 if ((x - inset) // minor_grid) % 2 == 0 else 52
        draw_line(buf, size, x, inset, x, size - inset, 0.55, (255, 255, 255, alpha))
    for y in range(inset, size - inset, minor_grid):
        alpha = 88 if ((y - inset) // minor_grid) % 2 == 0 else 52
        draw_line(buf, size, inset, y, size - inset, y, 0.55, (255, 255, 255, alpha))
    for x in range(inset, size - inset, major_grid):
        draw_line(buf, size, x, inset, x, size - inset, 0.9, grid_color)
    for y in range(inset, size - inset, major_grid):
        draw_line(buf, size, inset, y, size - inset, y, 0.9, grid_color)

    white = (255, 255, 255, 255)
    gold = (234, 179, 8, 255)
    purple = (196, 181, 253, 255)

    draw_ring(buf, size, size * 0.64, size * 0.37, size * 0.16, max(1.0, size * 0.022), white)
    draw_line(buf, size, size * 0.23, size * 0.68, size * 0.47, size * 0.54, max(1.1, size * 0.028), gold)
    draw_line(buf, size, size * 0.47, size * 0.54, size * 0.64, size * 0.37, max(1.0, size * 0.022), purple)
    draw_disc(buf, size, size * 0.47, size * 0.54, max(1.6, size * 0.038), white)
    draw_disc(buf, size, size * 0.23, size * 0.68, max(1.2, size * 0.024), gold)
    draw_disc(buf, size, size * 0.64, size * 0.37, max(1.2, size * 0.022), purple)

    return encode_png_rgba(size, size, bytes(buf))


def encode_png_rgba(width: int, height: int, rgba: bytes) -> bytes:
    stride = width * 4
    raw = b"".join(b"\x00" + rgba[y * stride:(y + 1) * stride] for y in range(height))
    compressed = zlib.compress(raw, 9)
    parts = [
        b"\x89PNG\r\n\x1a\n",
        png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
        png_chunk(b"IDAT", compressed),
        png_chunk(b"IEND", b""),
    ]
    return b"".join(parts)


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(chunk_type)
    crc = zlib.crc32(data, crc) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def build_ico() -> bytes:
    images = [render_icon(size) for size in SIZES]
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = []
    offset = 6 + 16 * len(images)
    for size, image in zip(SIZES, images, strict=True):
        width = 0 if size >= 256 else size
        height = 0 if size >= 256 else size
        entries.append(struct.pack("<BBBBHHII", width, height, 0, 0, 1, 32, len(image), offset))
        offset += len(image)
    return header + b"".join(entries) + b"".join(images)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    ICO_PATH.write_bytes(build_ico())
    print(f"Wrote {ICO_PATH}")


if __name__ == "__main__":
    main()
