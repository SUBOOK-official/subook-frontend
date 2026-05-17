"""
SUBOOK OG image 생성 (1200x630 PNG).
Pillow만으로 직접 그려서 외부 SVG/cairo 의존성 없음.

실행:
    python frontend/scripts/generate_og_image.py
출력:
    frontend/apps/public-web/public/og-image.png
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "apps" / "public-web" / "public" / "og-image.png"

WIDTH, HEIGHT = 1200, 630

# 브랜드 컬러
PRIMARY = (27, 58, 92)       # #1B3A5C
ACCENT = (245, 158, 11)      # #F59E0B (포인트)
WHITE = (255, 255, 255)
SOFT_WHITE = (255, 255, 255, 220)
GRID = (255, 255, 255, 18)


def find_font(candidates, size):
    """시스템 폰트 후보 중 첫 번째 사용 가능한 폰트 로드."""
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


# Windows 시스템 폰트 우선
KOREAN_BOLD = [
    "C:/Windows/Fonts/malgunbd.ttf",     # 맑은 고딕 Bold
    "C:/Windows/Fonts/malgun.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]
KOREAN_REGULAR = [
    "C:/Windows/Fonts/malgun.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]


def draw_radial_gradient(img, center, inner_color, outer_color, radius):
    """이미지 위에 방사형 그라데이션 (소프트 글로우)."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    cx, cy = center
    for r in range(radius, 0, -10):
        ratio = 1 - (r / radius)
        a = int((1 - ratio) * outer_color[3] + ratio * inner_color[3])
        rr = int((1 - ratio) * outer_color[0] + ratio * inner_color[0])
        gg = int((1 - ratio) * outer_color[1] + ratio * inner_color[1])
        bb = int((1 - ratio) * outer_color[2] + ratio * inner_color[2])
        od.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(rr, gg, bb, a))
    img.alpha_composite(overlay)


def draw_grid_pattern(img, color, step=40):
    """은은한 격자 패턴 (책장 느낌)."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for x in range(0, img.width, step):
        od.line([(x, 0), (x, img.height)], fill=color, width=1)
    for y in range(0, img.height, step):
        od.line([(0, y), (img.width, y)], fill=color, width=1)
    img.alpha_composite(overlay)


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # 배경 — 짙은 네이비 + 부드러운 그라데이션
    img = Image.new("RGBA", (WIDTH, HEIGHT), PRIMARY + (255,))

    # 우상단 → 좌하단 방향의 그라데이션 (시각적 깊이)
    gradient_overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gradient_overlay)
    for i in range(HEIGHT):
        alpha = int(80 * (i / HEIGHT))  # 위에서 아래로 점점 어두워짐
        gd.line([(0, i), (WIDTH, i)], fill=(0, 0, 0, alpha))
    img.alpha_composite(gradient_overlay)

    # 은은한 격자
    draw_grid_pattern(img, GRID, step=48)

    # 우상단 글로우 (브랜드 강조)
    draw_radial_gradient(
        img,
        center=(WIDTH - 200, 180),
        inner_color=(245, 158, 11, 90),
        outer_color=(245, 158, 11, 0),
        radius=520,
    )

    draw = ImageDraw.Draw(img)

    # ─── 컨텐츠 영역 ────────────────────────────────────────────────
    # 안전 영역: 가장자리에서 80px 여백 (소셜 크롭 대비)
    safe_left = 80

    # 상단 작은 뱃지 "위탁판매 플랫폼"
    badge_font = find_font(KOREAN_BOLD, 22)
    badge_text = "수능 교재 위탁판매 플랫폼"
    badge_padding_x, badge_padding_y = 18, 10
    bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
    bw = bbox[2] - bbox[0]
    bh = bbox[3] - bbox[1]
    badge_top = 130
    badge_box = (
        safe_left,
        badge_top,
        safe_left + bw + badge_padding_x * 2,
        badge_top + bh + badge_padding_y * 2,
    )
    draw.rounded_rectangle(badge_box, radius=999, fill=(255, 255, 255, 24))
    draw.text(
        (safe_left + badge_padding_x, badge_top + badge_padding_y - 2),
        badge_text,
        font=badge_font,
        fill=WHITE,
    )

    # SUBOOK 로고
    logo_font = find_font(KOREAN_BOLD, 130)
    draw.text(
        (safe_left - 4, badge_top + bh + badge_padding_y * 2 + 18),
        "SUBOOK",
        font=logo_font,
        fill=WHITE,
    )
    # 로고 우측에 ® 작게
    reg_font = find_font(KOREAN_BOLD, 32)
    logo_bbox = draw.textbbox(
        (safe_left - 4, badge_top + bh + badge_padding_y * 2 + 18),
        "SUBOOK",
        font=logo_font,
    )
    draw.text(
        (logo_bbox[2] + 6, logo_bbox[1] + 20),
        "®",
        font=reg_font,
        fill=ACCENT,
    )

    # 메인 카피
    title_font = find_font(KOREAN_BOLD, 56)
    title_y = logo_bbox[3] + 30
    draw.text(
        (safe_left, title_y),
        "안 쓰는 수능 교재,",
        font=title_font,
        fill=WHITE,
    )
    draw.text(
        (safe_left, title_y + 78),
        "수북으로 똑똑하게.",
        font=title_font,
        fill=ACCENT,
    )

    # 하단 보조 텍스트
    sub_font = find_font(KOREAN_REGULAR, 28)
    sub_y = title_y + 78 + 90
    draw.text(
        (safe_left, sub_y),
        "CJ 픽업 · 검수 · 안전결제까지 한 번에",
        font=sub_font,
        fill=(255, 255, 255, 200),
    )

    # 우측 하단 도메인
    domain_font = find_font(KOREAN_BOLD, 26)
    domain_text = "subook.kr"
    db = draw.textbbox((0, 0), domain_text, font=domain_font)
    draw.text(
        (WIDTH - safe_left - (db[2] - db[0]), HEIGHT - 80),
        domain_text,
        font=domain_font,
        fill=ACCENT,
    )

    # 우측에 책 모티프 (단순 도형)
    book_x = WIDTH - 360
    book_y = 230
    # 책 등 (4권 쌓인 모양)
    book_colors = [
        (245, 158, 11, 230),
        (255, 255, 255, 200),
        (96, 165, 250, 220),
        (244, 114, 182, 220),
    ]
    book_w_base = 220
    for i, color in enumerate(book_colors):
        bx = book_x + (3 - i) * 8
        by = book_y + i * 56
        bw_book = book_w_base + (i * 12)
        draw.rounded_rectangle(
            (bx, by, bx + bw_book, by + 52),
            radius=8,
            fill=color,
        )
        # 책 등 라인
        draw.line([(bx + 14, by + 10), (bx + 14, by + 42)], fill=(255, 255, 255, 60), width=2)
        draw.line([(bx + bw_book - 14, by + 10), (bx + bw_book - 14, by + 42)], fill=(255, 255, 255, 60), width=2)

    # RGBA → RGB 변환 (PNG 호환)
    final = Image.new("RGB", (WIDTH, HEIGHT), PRIMARY)
    final.paste(img, (0, 0), img)
    final.save(OUT_PATH, "PNG", optimize=True)
    print(f"✓ Generated: {OUT_PATH}")
    print(f"  Size: {WIDTH}x{HEIGHT}")
    print(f"  File size: {OUT_PATH.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
