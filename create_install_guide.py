#!/usr/bin/env python3
"""สร้างคู่มือติดตั้ง Summit Calendar App (PWA) — PDF"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# ─── Config ──────────────────────────────────────────────────────
OUTPUT = "/sessions/zealous-clever-albattani/mnt/Calendar/คู่มือติดตั้ง_Summit_Calendar_App.pdf"
W, H = A4  # 595.27 x 841.89 pt

# Colors
PRIMARY = HexColor('#1e3a5f')
PRIMARY_LIGHT = HexColor('#2d5a8e')
ACCENT = HexColor('#c9a84c')
BG_DARK = HexColor('#0a1628')
TEXT_DARK = HexColor('#1a2332')
TEXT_MID = HexColor('#4a5568')
LIGHT_BG = HexColor('#f0f4f8')
BORDER = HexColor('#e2e8f0')

# Try to register a Thai-compatible font, fallback to Helvetica
FONT = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'

# Check for Sarabun or other Thai fonts
thai_font_paths = [
    '/usr/share/fonts/truetype/thai/Sarabun-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansThai-Regular.ttf',
]
thai_bold_paths = [
    '/usr/share/fonts/truetype/thai/Sarabun-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansThai-Bold.ttf',
]

for p in thai_font_paths:
    if os.path.exists(p):
        try:
            pdfmetrics.registerFont(TTFont('Thai', p))
            FONT = 'Thai'
            break
        except:
            pass

for p in thai_bold_paths:
    if os.path.exists(p):
        try:
            pdfmetrics.registerFont(TTFont('ThaiBold', p))
            FONT_BOLD = 'ThaiBold'
            break
        except:
            pass

# If no dedicated Thai font, try Noto Sans CJK or DejaVu
if FONT == 'Helvetica':
    fallbacks = [
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuBold'),
    ]
    for reg_path, reg_name, bold_path, bold_name in fallbacks:
        if os.path.exists(reg_path):
            try:
                pdfmetrics.registerFont(TTFont(reg_name, reg_path))
                FONT = reg_name
                if os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont(bold_name, bold_path))
                    FONT_BOLD = bold_name
                break
            except:
                pass


def draw_rounded_rect(c, x, y, w, h, r, fill=None, stroke=None, stroke_width=1):
    """Draw a rounded rectangle."""
    p = c.beginPath()
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    p.arcTo(x + w - r, y, x + w, y + r, r)
    p.lineTo(x + w, y + h - r)
    p.arcTo(x + w, y + h - r, x + w - r, y + h, r)
    p.lineTo(x + r, y + h)
    p.arcTo(x + r, y + h, x, y + h - r, r)
    p.lineTo(x, y + r)
    p.arcTo(x, y + r, x + r, y, r)
    p.close()
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(stroke_width)
    if fill and stroke:
        c.drawPath(p, fill=1, stroke=1)
    elif fill:
        c.drawPath(p, fill=1, stroke=0)
    elif stroke:
        c.drawPath(p, fill=0, stroke=1)


def draw_circle_number(c, x, y, num, size=24):
    """Draw a numbered circle."""
    c.setFillColor(PRIMARY)
    c.circle(x, y, size / 2, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont(FONT_BOLD, 13)
    c.drawCentredString(x, y - 4.5, str(num))


def draw_phone_mockup(c, x, y, w, h):
    """Draw a simple phone outline."""
    r = 16
    # Phone body
    draw_rounded_rect(c, x, y, w, h, r, stroke=PRIMARY, stroke_width=2.5)
    # Screen area
    margin = 8
    screen_y = y + 20
    screen_h = h - 44
    draw_rounded_rect(c, x + margin, screen_y, w - 2 * margin, screen_h, 6, fill=LIGHT_BG)
    # Home indicator
    bar_w = 40
    c.setStrokeColor(TEXT_MID)
    c.setLineWidth(3)
    c.setLineCap(1)
    c.line(x + w / 2 - bar_w / 2, y + 10, x + w / 2 + bar_w / 2, y + 10)
    return (x + margin, screen_y, w - 2 * margin, screen_h)


# ─── Build PDF ───────────────────────────────────────────────────
c = canvas.Canvas(OUTPUT, pagesize=A4)
c.setTitle("Summit Calendar - Install Guide")
c.setAuthor("Summit Auto Body Industry")

margin = 40
content_w = W - 2 * margin

# ════════════════════════ PAGE 1: COVER ════════════════════════

# Full background gradient (approximate with rectangles)
steps = 20
for i in range(steps):
    frac = i / steps
    r_val = int(10 + (30 - 10) * frac)
    g_val = int(22 + (58 - 22) * frac)
    b_val = int(40 + (95 - 40) * frac)
    color = HexColor(f'#{r_val:02x}{g_val:02x}{b_val:02x}')
    c.setFillColor(color)
    c.rect(0, H - (i + 1) * H / steps, W, H / steps + 1, fill=1, stroke=0)

# Decorative circles
c.setFillColor(HexColor('#ffffff08'))
c.circle(W - 80, H - 120, 200, fill=1, stroke=0)
c.circle(60, 150, 120, fill=1, stroke=0)

# Title section
y = H - 200
c.setFillColor(ACCENT)
c.setFont(FONT_BOLD, 14)
c.drawCentredString(W / 2, y, "SUMMIT AUTO BODY INDUSTRY")

y -= 50
c.setFillColor(white)
c.setFont(FONT_BOLD, 32)
c.drawCentredString(W / 2, y, "Summit Calendar")

y -= 35
c.setFont(FONT, 18)
c.drawCentredString(W / 2, y, "Install Guide")

y -= 15
# Accent line
c.setStrokeColor(ACCENT)
c.setLineWidth(3)
line_w = 80
c.line(W / 2 - line_w, y, W / 2 + line_w, y)

y -= 50
c.setFillColor(HexColor('#ffffff'))
c.setFont(FONT, 14)
lines = [
    "How to install Summit Calendar on your device",
    "Android / iPhone / iPad / PC",
]
for line in lines:
    c.drawCentredString(W / 2, y, line)
    y -= 22

# Phone mockup illustration at bottom
phone_w, phone_h = 120, 210
phone_x = W / 2 - phone_w / 2
phone_y = 120
# Phone shadow
c.setFillColor(HexColor('#00000030'))
draw_rounded_rect(c, phone_x + 4, phone_y - 4, phone_w, phone_h, 16, fill=HexColor('#00000020'))
# Phone body
draw_rounded_rect(c, phone_x, phone_y, phone_w, phone_h, 16, fill=HexColor('#0d1f35'), stroke=HexColor('#3d6a9e'), stroke_width=2)
# Screen
sx, sy = phone_x + 8, phone_y + 20
sw, sh = phone_w - 16, phone_h - 44
draw_rounded_rect(c, sx, sy, sw, sh, 6, fill=HexColor('#1a3454'))
# Calendar grid on screen
c.setFont(FONT, 7)
c.setFillColor(HexColor('#6ba3d6'))
c.drawCentredString(sx + sw / 2, sy + sh - 14, "Summit Calendar")
# Grid lines
c.setStrokeColor(HexColor('#2a4f78'))
c.setLineWidth(0.5)
for row in range(5):
    gy = sy + 15 + row * 25
    c.line(sx + 6, gy, sx + sw - 6, gy)
# Colored event blocks
colors_mock = [ACCENT, HexColor('#3b82f6'), HexColor('#10b981')]
for i, col in enumerate(colors_mock):
    ey = sy + 22 + i * 25
    draw_rounded_rect(c, sx + 10, ey, sw * 0.6, 12, 3, fill=col)

# Footer
c.setFillColor(HexColor('#ffffff80'))
c.setFont(FONT, 9)
c.drawCentredString(W / 2, 60, "v2.0 | April 2026")

c.showPage()

# ════════════════════════ PAGE 2: ANDROID ════════════════════════

# Header bar
c.setFillColor(PRIMARY)
c.rect(0, H - 70, W, 70, fill=1, stroke=0)
c.setFillColor(white)
c.setFont(FONT_BOLD, 20)
c.drawString(margin, H - 48, "Android / PC (Chrome)")
# Accent underline
c.setFillColor(ACCENT)
c.rect(margin, H - 72, 120, 3, fill=1, stroke=0)

y = H - 110
c.setFillColor(TEXT_DARK)
c.setFont(FONT, 13)
c.drawString(margin, y, "Follow these steps to install Summit Calendar on your Android phone or PC (Chrome browser):")

y -= 50

# Step 1
draw_circle_number(c, margin + 14, y, 1)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, "Open Chrome Browser")
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, "Go to your Summit Calendar URL")
y -= 16
c.drawString(margin + 36, y - 5, "https://summit-calendar.xxx.workers.dev")

y -= 50

# Step 2
draw_circle_number(c, margin + 14, y, 2)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, 'Tap "Install" Banner')
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, "A banner will appear at the bottom of the screen")
y -= 16
c.drawString(margin + 36, y - 5, 'Tap the golden "Install" button')

# Draw banner mockup
y -= 50
banner_x = margin + 36
banner_w = content_w - 50
banner_h = 52
draw_rounded_rect(c, banner_x, y, banner_w, banner_h, 12, fill=PRIMARY, stroke=HexColor('#3d6a9e'), stroke_width=1)
# Icon
c.setFillColor(HexColor('#ffffff25'))
draw_rounded_rect(c, banner_x + 12, y + 10, 32, 32, 8, fill=HexColor('#ffffff20'))
c.setFillColor(white)
c.setFont(FONT, 18)
c.drawCentredString(banner_x + 28, y + 18, "C")  # Calendar icon placeholder
# Text
c.setFillColor(white)
c.setFont(FONT_BOLD, 11)
c.drawString(banner_x + 54, y + 32, "Install Summit Calendar")
c.setFont(FONT, 9)
c.setFillColor(HexColor('#ffffffcc'))
c.drawString(banner_x + 54, y + 18, "Open faster, like a real app")
# Install button
btn_w, btn_h = 62, 30
btn_x = banner_x + banner_w - btn_w - 50
btn_y = y + 11
draw_rounded_rect(c, btn_x, btn_y, btn_w, btn_h, 8, fill=ACCENT)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 11)
c.drawCentredString(btn_x + btn_w / 2, btn_y + 10, "Install")
# X button
c.setFillColor(HexColor('#ffffff60'))
c.setFont(FONT, 14)
c.drawCentredString(banner_x + banner_w - 18, y + 22, "x")

# Arrow pointing to Install button
c.setStrokeColor(ACCENT)
c.setLineWidth(2)
arrow_start_x = btn_x + btn_w / 2
arrow_start_y = btn_y - 8
c.line(arrow_start_x, arrow_start_y, arrow_start_x, arrow_start_y - 25)
# Arrowhead
c.setFillColor(ACCENT)
p = c.beginPath()
p.moveTo(arrow_start_x - 6, arrow_start_y - 18)
p.lineTo(arrow_start_x + 6, arrow_start_y - 18)
p.lineTo(arrow_start_x, arrow_start_y - 6)
p.close()
c.drawPath(p, fill=1, stroke=0)
c.setFont(FONT_BOLD, 10)
c.drawCentredString(arrow_start_x, arrow_start_y - 35, "Tap here!")

y -= 90

# Step 3
draw_circle_number(c, margin + 14, y, 3)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, 'Confirm "Install"')
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, 'A popup dialog will appear. Tap "Install" to confirm.')

y -= 50

# Step 4
draw_circle_number(c, margin + 14, y, 4)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, "Done! Open from Home Screen")
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, "Summit Calendar icon will appear on your home screen.")
y -= 16
c.drawString(margin + 36, y - 5, "Tap to open — no browser needed!")

# Tip box at bottom
y -= 60
draw_rounded_rect(c, margin, y, content_w, 55, 10, fill=HexColor('#fef3c7'), stroke=HexColor('#f59e0b'), stroke_width=1)
c.setFillColor(HexColor('#92400e'))
c.setFont(FONT_BOLD, 12)
c.drawString(margin + 16, y + 32, "TIP (PC / Desktop)")
c.setFont(FONT, 11)
c.drawString(margin + 16, y + 14, 'On PC Chrome, look for the install icon  (arrow-down)  in the address bar,')

# Footer
c.setFillColor(TEXT_MID)
c.setFont(FONT, 9)
c.drawCentredString(W / 2, 30, "Summit Calendar Install Guide — Page 2/3")

c.showPage()

# ════════════════════════ PAGE 3: iOS ════════════════════════

# Header bar
c.setFillColor(PRIMARY)
c.rect(0, H - 70, W, 70, fill=1, stroke=0)
c.setFillColor(white)
c.setFont(FONT_BOLD, 20)
c.drawString(margin, H - 48, "iPhone / iPad (Safari)")
# Accent underline
c.setFillColor(ACCENT)
c.rect(margin, H - 72, 120, 3, fill=1, stroke=0)

y = H - 110
c.setFillColor(TEXT_DARK)
c.setFont(FONT, 13)
c.drawString(margin, y, "Follow these steps to install Summit Calendar on your iPhone or iPad:")
y -= 10
c.setFont(FONT_BOLD, 12)
c.setFillColor(HexColor('#dc2626'))
c.drawString(margin, y - 12, "* Important: Must use Safari browser (not Chrome or LINE browser)")

y -= 60

# Step 1
draw_circle_number(c, margin + 14, y, 1)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, "Open Safari")
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, "Open Safari and go to your Summit Calendar URL")

y -= 50

# Step 2
draw_circle_number(c, margin + 14, y, 2)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, 'Tap the "Share" button')
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, "Tap the Share icon (square with arrow up) at the bottom of Safari")

# Draw share icon illustration
y -= 40
icon_x = margin + 80
icon_size = 36
draw_rounded_rect(c, icon_x, y, icon_size, icon_size, 6, stroke=PRIMARY, stroke_width=2)
# Arrow up inside
c.setStrokeColor(PRIMARY)
c.setLineWidth(2)
cx = icon_x + icon_size / 2
c.line(cx, y + 8, cx, y + 28)
# Arrow head
p = c.beginPath()
p.moveTo(cx - 6, y + 22)
p.lineTo(cx, y + 30)
p.lineTo(cx + 6, y + 22)
c.drawPath(p, fill=0, stroke=1)

c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 11)
c.drawString(icon_x + icon_size + 14, y + 16, '<-- Share button (bottom of Safari)')

y -= 50

# Step 3
draw_circle_number(c, margin + 14, y, 3)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, '"Add to Home Screen"')
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, 'Scroll down in the share menu and tap "Add to Home Screen"')

# Draw menu item mockup
y -= 40
menu_x = margin + 36
menu_w = 280
menu_h = 36
draw_rounded_rect(c, menu_x, y, menu_w, menu_h, 8, fill=white, stroke=BORDER, stroke_width=1)
# Plus icon
c.setFillColor(PRIMARY)
c.setFont(FONT_BOLD, 18)
c.drawString(menu_x + 12, y + 10, "+")
c.setFont(FONT_BOLD, 12)
c.setFillColor(TEXT_DARK)
c.drawString(menu_x + 36, y + 12, "Add to Home Screen")

y -= 50

# Step 4
draw_circle_number(c, margin + 14, y, 4)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, 'Tap "Add"')
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, 'Tap "Add" in the top-right corner. Done!')

y -= 50

# Step 5
draw_circle_number(c, margin + 14, y, 5)
c.setFillColor(TEXT_DARK)
c.setFont(FONT_BOLD, 14)
c.drawString(margin + 36, y - 5, "Open from Home Screen")
y -= 22
c.setFont(FONT, 12)
c.setFillColor(TEXT_MID)
c.drawString(margin + 36, y - 5, "Summit Calendar icon is now on your home screen!")
y -= 16
c.drawString(margin + 36, y - 5, "Tap to open — fullscreen, no browser bar!")

# Success box
y -= 60
draw_rounded_rect(c, margin, y, content_w, 65, 10, fill=HexColor('#d1fae5'), stroke=HexColor('#10b981'), stroke_width=1)
c.setFillColor(HexColor('#065f46'))
c.setFont(FONT_BOLD, 13)
c.drawString(margin + 16, y + 40, "Installation Complete!")
c.setFont(FONT, 11)
c.drawString(margin + 16, y + 22, "The app opens in fullscreen mode — looks and feels like a real app.")
c.drawString(margin + 16, y + 8, "Data syncs live from the server. No updates needed!")

# Footer
c.setFillColor(TEXT_MID)
c.setFont(FONT, 9)
c.drawCentredString(W / 2, 30, "Summit Calendar Install Guide — Page 3/3")

c.showPage()
c.save()
print(f"PDF created: {OUTPUT}")
