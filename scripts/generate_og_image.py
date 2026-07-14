# -*- coding: utf-8 -*-
"""
SUBOOK OG image 생성 (1200x630 PNG).
새 브랜드 로고(logo-full.png — 심볼+태그라인+워드마크 lockup)를 흰 배경 중앙에 배치한다.
2026-07 로고 리뉴얼 이전 버전은 Pillow로 직접 그리는 방식이었음 (git history 참조).

실행:
    python frontend/scripts/generate_og_image.py
출력:
    frontend/apps/public-web/public/og-image.png
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO_PATH = ROOT / "apps" / "public-web" / "src" / "assets" / "brand" / "logo-full.png"
OUT_PATH = ROOT / "apps" / "public-web" / "public" / "og-image.png"

WIDTH, HEIGHT = 1200, 630
LOGO_TARGET_WIDTH = 880  # 좌우 여백 160px씩


def main():
    logo = Image.open(LOGO_PATH).convert("RGBA")

    # 투명 여백 제거 후 목표 폭으로 리사이즈
    bbox = logo.getchannel("A").getbbox()
    logo = logo.crop(bbox)
    target_h = round(logo.size[1] * LOGO_TARGET_WIDTH / logo.size[0])
    logo = logo.resize((LOGO_TARGET_WIDTH, target_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (255, 255, 255, 255))
    canvas.paste(
        logo,
        ((WIDTH - LOGO_TARGET_WIDTH) // 2, (HEIGHT - target_h) // 2),
        logo,
    )
    canvas.convert("RGB").save(OUT_PATH, optimize=True)
    print(f"saved: {OUT_PATH} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
