from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
GIF_PATH = ASSETS / 'rzr-demo.gif'
POSTER_PATH = ASSETS / 'rzr-demo-poster.png'

W, H = 960, 600
PAD = 56
WIN_X, WIN_Y = 72, 58
WIN_W, WIN_H = W - WIN_X * 2, H - WIN_Y * 2
TITLE_H = 42
CONTENT_PAD_X = 28
CONTENT_PAD_Y = 20
RADIUS = 22

BG_TOP = (10, 14, 25)
BG_BOTTOM = (19, 27, 42)
WINDOW = (11, 15, 20)
WINDOW_TOP = (28, 35, 46)
TEXT = (227, 232, 239)
MUTED = (145, 157, 175)
GREEN = (94, 214, 114)
CYAN = (108, 217, 255)
AMBER = (255, 198, 109)
RED = (255, 107, 107)
PURPLE = (191, 141, 255)
LINE = (37, 45, 59)

COMMAND = 'rzr run --tunnel --password secret -- codex'
OUTPUT_LINES = [
    ('Session: ', TEXT, 'codex-r3xz', PURPLE),
    ('Port:    ', TEXT, '4317', CYAN),
    ('Token:   ', TEXT, 'b7c1…e9f4', AMBER),
    ('', TEXT, '', TEXT),
    ('Open on your phone:', TEXT, '', TEXT),
    ('  http://192.168.1.20:4317/?token=…', CYAN, '', CYAN),
    ('  https://phone-demo.example.com/?token=…', GREEN, '', GREEN),
    ('', TEXT, '', TEXT),
    ('Notes:', TEXT, '', TEXT),
    ('  - tmux keeps the session alive', MUTED, '', MUTED),
    ('  - password gate enabled · multi-device live view', MUTED, '', MUTED),
]

FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Menlo.ttc',
    '/System/Library/Fonts/Menlo.ttc',
    '/System/Library/Fonts/SFNSMono.ttf',
    '/Library/Fonts/MesloLGS NF Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
]


def load_font(size: int):
    for path in FONT_CANDIDATES:
        p = Path(path)
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


FONT = load_font(24)
FONT_SMALL = load_font(17)
FONT_TITLE = load_font(19)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def make_background():
    img = Image.new('RGBA', (W, H), BG_TOP)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        color = tuple(lerp(BG_TOP[i], BG_BOTTOM[i], t) for i in range(3)) + (255,)
        for x in range(W):
            px[x, y] = color
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-120, -40, 380, 360), fill=(66, 153, 225, 48))
    gd.ellipse((W - 320, H - 240, W + 120, H + 120), fill=(139, 92, 246, 42))
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    return Image.alpha_composite(img, glow)


def draw_shadow(base):
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (WIN_X + 6, WIN_Y + 16, WIN_X + WIN_W + 6, WIN_Y + WIN_H + 16),
        radius=RADIUS,
        fill=(0, 0, 0, 175),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    return Image.alpha_composite(base, shadow)


def segmented(draw, x, y, segments, font=FONT):
    cur_x = x
    for text, color in segments:
        draw.text((cur_x, y), text, font=font, fill=color)
        cur_x += draw.textlength(text, font=font)


def render_frame(fade_t, typed_chars, revealed_lines, cursor_on):
    base = make_background()
    base = draw_shadow(base)
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    alpha = int(255 * fade_t)
    d.rounded_rectangle((WIN_X, WIN_Y, WIN_X + WIN_W, WIN_Y + WIN_H), radius=RADIUS, fill=WINDOW + (alpha,))
    d.rounded_rectangle((WIN_X, WIN_Y, WIN_X + WIN_W, WIN_Y + TITLE_H), radius=RADIUS, fill=WINDOW_TOP + (alpha,))
    d.rectangle((WIN_X, WIN_Y + TITLE_H, WIN_X + WIN_W, WIN_Y + TITLE_H + 18), fill=WINDOW_TOP + (alpha,))
    d.line((WIN_X, WIN_Y + TITLE_H, WIN_X + WIN_W, WIN_Y + TITLE_H), fill=LINE + (alpha,), width=1)

    # traffic lights
    cy = WIN_Y + TITLE_H // 2
    for idx, color in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = WIN_X + 22 + idx * 18
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=color + (alpha,))

    title = 'rzr demo · phone-friendly remote terminal'
    title_w = d.textlength(title, font=FONT_TITLE)
    d.text((WIN_X + WIN_W / 2 - title_w / 2, WIN_Y + 11), title, font=FONT_TITLE, fill=(190, 202, 217, alpha))

    y = WIN_Y + TITLE_H + CONTENT_PAD_Y
    x = WIN_X + CONTENT_PAD_X

    prompt = '$ '
    typed = COMMAND[:typed_chars]
    segmented(d, x, y, [(prompt, GREEN + ()), (typed, TEXT + ())], font=FONT)
    prompt_w = d.textlength(prompt + typed, font=FONT)
    if cursor_on:
        d.rectangle((x + prompt_w + 2, y + 4, x + prompt_w + 16, y + 31), fill=TEXT + (255,))

    line_h = 32
    y += 46
    for i in range(revealed_lines):
        left, left_color, right, right_color = OUTPUT_LINES[i]
        if left == '' and right == '':
            y += 14
            continue
        if right:
            segmented(d, x, y, [(left, left_color), (right, right_color)], font=FONT)
        else:
            d.text((x, y), left, font=FONT, fill=left_color)
        y += line_h

    status_y = WIN_Y + WIN_H - 34
    d.line((WIN_X, status_y - 12, WIN_X + WIN_W, status_y - 12), fill=LINE + (alpha,), width=1)
    d.text((WIN_X + 22, status_y), 'tmux-backed', font=FONT_SMALL, fill=(145, 157, 175, alpha))
    d.text((WIN_X + 180, status_y), 'readme demo asset', font=FONT_SMALL, fill=(145, 157, 175, alpha))
    right_label = 'secure-ish by token'
    right_w = d.textlength(right_label, font=FONT_SMALL)
    d.text((WIN_X + WIN_W - 22 - right_w, status_y), right_label, font=FONT_SMALL, fill=(145, 157, 175, alpha))

    frame = Image.alpha_composite(base, overlay)
    return frame.convert('RGB')


def build_frames():
    frames = []
    fade_frames = 5
    typing_frames = 20
    reveal_frames = len(OUTPUT_LINES) * 2
    hold_frames = 10

    for i in range(fade_frames):
        t = (i + 1) / fade_frames
        frames.append(render_frame(t, 0, 0, False))

    for i in range(typing_frames):
        t = (i + 1) / typing_frames
        typed = max(1, round(len(COMMAND) * t))
        frames.append(render_frame(1, typed, 0, True))

    frames.extend([render_frame(1, len(COMMAND), 0, True)] * 2)

    for i in range(reveal_frames):
        revealed = min(len(OUTPUT_LINES), (i // 2) + 1)
        frames.append(render_frame(1, len(COMMAND), revealed, i % 2 == 0))

    final_visible = len(OUTPUT_LINES)
    for i in range(hold_frames):
        frames.append(render_frame(1, len(COMMAND), final_visible, i % 2 == 0))

    return frames


def save_gif(frames):
    durations = []
    fade_frames = 5
    typing_frames = 20
    reveal_frames = len(OUTPUT_LINES) * 2
    total = len(frames)
    for idx in range(total):
        if idx < fade_frames:
            durations.append(70)
        elif idx < fade_frames + typing_frames:
            durations.append(80)
        elif idx >= total - 10:
            durations.append(140)
        else:
            durations.append(90)

    palette_frames = [f.convert('P', palette=Image.Palette.ADAPTIVE, colors=96) for f in frames]
    palette_frames[0].save(
        GIF_PATH,
        save_all=True,
        append_images=palette_frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    frames = build_frames()
    frames[-1].save(POSTER_PATH)
    save_gif(frames)
    print(GIF_PATH)
    print(POSTER_PATH)


if __name__ == '__main__':
    main()
