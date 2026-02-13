from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

OUT = 'output/pdf/livestocks-summary-he-visual.pdf'
FONT_PATH = '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
FONT = 'ArialUnicode'

pdfmetrics.registerFont(TTFont(FONT, FONT_PATH))

W, H = A4
MARGIN_X = 40
TOP = H - 36
BOTTOM = 36
RIGHT = W - MARGIN_X
LEFT = MARGIN_X

c = canvas.Canvas(OUT, pagesize=A4)

def rtl_lines(text, max_width, font_name, font_size):
    words = text.split(' ')
    lines = []
    cur = ''
    for w in words:
        cand = w if not cur else f'{cur} {w}'
        if pdfmetrics.stringWidth(cand, font_name, font_size) <= max_width:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def draw_rtl_text(y, text, size=10, color='#0f172a', leading=14, max_width=None):
    c.setFont(FONT, size)
    c.setFillColor(HexColor(color))
    width = max_width if max_width is not None else (RIGHT - LEFT)
    for line in rtl_lines(text, width, FONT, size):
        c.drawRightString(RIGHT, y, line)
        y -= leading
    return y

def draw_rtl_bullets(y, bullets, size=10, color='#111827', leading=13):
    c.setFont(FONT, size)
    c.setFillColor(HexColor(color))
    for item in bullets:
        lines = rtl_lines(item, RIGHT - LEFT - 24, FONT, size)
        first = True
        for line in lines:
            if first:
                c.drawRightString(RIGHT - 12, y, line)
                c.drawRightString(RIGHT, y, '- ')
                first = False
            else:
                c.drawRightString(RIGHT - 12, y, line)
            y -= leading
        y -= 1
    return y

def section_title(y, title):
    c.setFillColor(HexColor('#0b3b66'))
    c.roundRect(LEFT, y-15, RIGHT-LEFT, 18, 5, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff'))
    c.setFont(FONT, 11)
    c.drawRightString(RIGHT-8, y-3, title)
    return y - 24

def card(y, title, lines, bg='#f8fafc', border='#dbeafe'):
    h = 18 + 13*len(lines)
    c.setFillColor(HexColor(bg))
    c.setStrokeColor(HexColor(border))
    c.roundRect(LEFT, y-h, RIGHT-LEFT, h, 8, fill=1, stroke=1)
    c.setFillColor(HexColor('#0f172a'))
    c.setFont(FONT, 10.5)
    c.drawRightString(RIGHT-10, y-13, title)
    yy = y-27
    c.setFont(FONT, 9.3)
    for line in lines:
        c.drawRightString(RIGHT-10, yy, line)
        yy -= 12
    return y - h - 10

def ensure_space(y, needed):
    if y - needed < BOTTOM:
        c.showPage()
        return TOP
    return y

# Header
c.setFillColor(HexColor('#0a2540'))
c.rect(0, H-86, W, 86, fill=1, stroke=0)
c.setFillColor(HexColor('#ffffff'))
c.setFont(FONT, 20)
c.drawRightString(RIGHT, H-36, 'Live Stocks - סיכום מערכת מפורט')
c.setFont(FONT, 10)
c.drawRightString(RIGHT, H-56, 'מבוסס על ראיות מהמאגר בלבד: app, hooks, lib, supabase, README, package.json')

# quick stats row
stats_y = H - 98
box_w = (RIGHT-LEFT-12)/3
for i, (title, value) in enumerate([
    ('עמודי UI מרכזיים', '8+'),
    ('נתיבי API', '6'),
    ('ישויות נתונים מרכזיות', '4+')
]):
    x = LEFT + i*(box_w+6)
    c.setFillColor(HexColor('#e2e8f0'))
    c.roundRect(x, stats_y-40, box_w, 38, 7, fill=1, stroke=0)
    c.setFillColor(HexColor('#0f172a'))
    c.setFont(FONT, 9)
    c.drawString(x+8, stats_y-15, value)
    c.setFont(FONT, 8)
    c.drawString(x+8, stats_y-30, title)

y = stats_y - 52

y = section_title(y, '1) מה המערכת ומה הערך שלה')
y = draw_rtl_text(y, 'האפליקציה היא לוח בקרה לניהול תיק מניות בזמן אמת, עם חישובי רווח והפסד, מעקב היסטורי והצגת מגמות בתצוגה גרפית.', size=10)
y = draw_rtl_text(y, 'היא משלבת ממשק Next.js, שכבת API פנימית, שירותי שוק חיצוניים ובסיס נתונים Supabase לניהול נתונים והגדרות.', size=10)
y -= 4

y = section_title(y, '2) למי זה מיועד')
y = draw_rtl_bullets(y, [
    'משקיע פרטי שרוצה לראות מצב תיק, שינוי יומי, ורווח מצטבר במבט אחד.',
    'משתמש שעובד גם בעברית וגם באנגלית עם תמיכה בכיוון RTL/LTR.',
    'משתמש שרוצה לשלב נתוני שוק חיים עם ניהול ידני של פוזיציות, לוטים ותוכניות יציאה.'
], size=10)

y = ensure_space(y, 210)
y = section_title(y, '3) מה הפרויקט יכול לעשות בפועל (יכולות מרכזיות)')
y = draw_rtl_bullets(y, [
    'ניהול פוזיציות פתוחות וסגורות, כולל עסקאות חלקיות ולוגיקת realized PnL.',
    'ניהול Watchlist לפי קבוצות עם גרירה ושינוי סדר לטיקרים בכרטיסים ייעודיים.',
    'משיכת Quote ו-Candles דרך API פנימי והצגה בגרפים וספארקליינים.',
    'חישובי מטבע USD/ILS, כולל שער חי, fallback, ושילוב FX היסטורי בחישובים.',
    'תצוגות עומק לכל מניה במסלול דינמי /stock/[symbol] כולל אזור תחזיות.',
    'מסך הגדרות לשפה, מטבע, טוקן Finnhub וקצב רענון נתונים.',
    'בדיקות אוטומטיות עם Vitest לתחומי חישוב, Watchlist, FX ולוגיקת תוכניות.'
], size=9.8)

# page 2
c.showPage()

# Header page 2
c.setFillColor(HexColor('#0a2540'))
c.rect(0, H-74, W, 74, fill=1, stroke=0)
c.setFillColor(HexColor('#ffffff'))
c.setFont(FONT, 17)
c.drawRightString(RIGHT, H-33, 'ארכיטקטורה וזרימת נתונים')
c.setFont(FONT, 9.5)
c.drawRightString(RIGHT, H-52, 'תרשים קומפקטי - מבוסס קבצי app/api, hooks, lib/services ו-Supabase migrations')

y = H - 94

# flow boxes
flow_y = y - 40
box_h = 46
gap = 12
flow_w = (RIGHT-LEFT-3*gap)/4
flow_titles = ['UI Pages', 'Hooks + Context', 'API + Services', 'Data Sources']
flow_desc = [
    'app/page, portfolio, positions, watchlist, settings, stock/[symbol]',
    'use-portfolio-data, use-watchlist, AppProvider, translations',
    '/api/quote, /candles, /portfolio, /exchange-rate, /forecast',
    'Supabase tables + Finnhub + Exchange Rate providers'
]
for i in range(4):
    x = LEFT + i*(flow_w+gap)
    c.setFillColor(HexColor('#f8fafc'))
    c.setStrokeColor(HexColor('#94a3b8'))
    c.roundRect(x, flow_y, flow_w, box_h, 8, fill=1, stroke=1)
    c.setFillColor(HexColor('#0f172a'))
    c.setFont(FONT, 8.6)
    c.drawString(x+6, flow_y+30, flow_titles[i])
    c.setFont(FONT, 7.7)
    txt = rtl_lines(flow_desc[i], flow_w-12, FONT, 7.7)
    yy = flow_y+19
    for line in txt[:2]:
        c.drawString(x+6, yy, line)
        yy -= 9
    if i < 3:
        c.setStrokeColor(HexColor('#475569'))
        c.line(x+flow_w+2, flow_y+23, x+flow_w+gap-2, flow_y+23)
        c.line(x+flow_w+gap-6, flow_y+26, x+flow_w+gap-2, flow_y+23)
        c.line(x+flow_w+gap-6, flow_y+20, x+flow_w+gap-2, flow_y+23)

y = flow_y - 16
y = section_title(y, '4) פירוק רכיבים ושירותים')
y = card(y, 'שכבת ממשק (Frontend)', [
    'תיקיות app ו-components מגדירות את כל המסכים, הכרטיסים, הטפסים והגרפים.',
    'layout.tsx מגדיר AppProvider + Toaster + html dir=rtl כברירת מחדל.'
], bg='#eff6ff', border='#bfdbfe')
y = card(y, 'שכבת לוגיקה (Domain)', [
    'lib/calculations.ts מבצע חישובי ביצועים, המרות מטבע ומדדי תיק.',
    'lib/positions.ts ו-lib/watchlist.ts ממפים נתוני DB למודלים אחידים לשימוש ב-UI.'
], bg='#f0fdf4', border='#bbf7d0')
y = card(y, 'שכבת אינטגרציה (API)', [
    'נתיבי app/api מספקים מעטפת אחידה מול ספקי מידע חיצוניים.',
    'lib/http.ts מוסיף retry/backoff לשיפור יציבות הקריאות.'
], bg='#fff7ed', border='#fed7aa')

y = ensure_space(y, 210)
y = section_title(y, '5) מפת יכולות ויזואלית')

# capability matrix 2x2
mx_left = LEFT
mx_top = y
cell_w = (RIGHT-LEFT-10)/2
cell_h = 70
caps = [
    ('אנליטיקה', ['PnL שוטף וממומש', 'סיכום תיק', 'מדדי ביצועים']),
    ('מעקב שוק', ['ציטוטים חיים', 'נרות היסטוריים', 'כרטיסי Watchlist']),
    ('תפעול נתונים', ['CRUD על פוזיציות', 'CRUD על Watchlist', 'הגדרות גלובליות']),
    ('תחזית ותכנון', ['עמודי Forecast', 'Position Plans', 'פערי מחיר נוכחי מול צפוי'])
]
for idx, (title, lines) in enumerate(caps):
    row = idx // 2
    col = idx % 2
    x = mx_left + col*(cell_w+10)
    yy = mx_top - row*(cell_h+10)
    c.setFillColor(HexColor('#f8fafc'))
    c.setStrokeColor(HexColor('#cbd5e1'))
    c.roundRect(x, yy-cell_h, cell_w, cell_h, 8, fill=1, stroke=1)
    c.setFillColor(HexColor('#0f172a'))
    c.setFont(FONT, 9.5)
    c.drawString(x+8, yy-14, title)
    c.setFont(FONT, 8.4)
    ly = yy-28
    for ln in lines:
        c.drawString(x+10, ly, '- ' + ln)
        ly -= 12

y = mx_top - 2*(cell_h+10) - 6

# page 3
c.showPage()

c.setFillColor(HexColor('#0a2540'))
c.rect(0, H-74, W, 74, fill=1, stroke=0)
c.setFillColor(HexColor('#ffffff'))
c.setFont(FONT, 17)
c.drawRightString(RIGHT, H-33, 'הפעלה מהירה + גבולות ידועים מהמאגר')
c.setFont(FONT, 9.5)
c.drawRightString(RIGHT, H-52, 'צעדי התחלה מינימליים והבהרת פריטים שלא הופיעו במפורש בקוד/README')

y = H - 96
y = section_title(y, '6) איך מתחילים (Minimal Getting Started)')
y = draw_rtl_bullets(y, [
    'npm install - התקנת תלויות.',
    'cp .env.exemple .env.local - יצירת קובץ סביבה.',
    'npx supabase start ואז npx supabase db reset - הפעלת שירותים ומיגרציות.',
    'npm run dev - הרצה מקומית ב-http://localhost:3000.',
    'בדיקות בסיס: npm run lint, npm run typecheck, npm test.'
], size=10)

y = section_title(y, '7) רשימת עמודים ונתיבי API שנמצאו')
y = draw_rtl_bullets(y, [
    'עמודים: /, /portfolio, /positions, /realized, /watchlist, /settings, /ai-prompts, /stock/[symbol], /stock/[symbol]/forecast.',
    'API: /api/quote, /api/candles, /api/exchange-rate, /api/portfolio, /api/portfolio/combined-pnl, /api/forecast/[horizon]/[symbol].'
], size=9.7)

y = section_title(y, '8) פריטים שלא נמצאו במפורש במאגר')
y = draw_rtl_bullets(y, [
    'הגדרת פרסונה עסקית רשמית יחידה (מוגדרת רק משתמע מהפיצרים).',
    'מסמך SLA/יעדי ביצועים כמותיים לפרודקשן.',
    'תיעוד פריסה ענני סופי לסביבה ספציפית אחת.'
], size=10)

c.setStrokeColor(HexColor('#cbd5e1'))
c.line(LEFT, 24, RIGHT, 24)
c.setFillColor(HexColor('#64748b'))
c.setFont(FONT, 8.3)
c.drawRightString(RIGHT, 14, 'נוצר אוטומטית בתאריך 2026-02-13 | קובץ מסכם בעברית - מפורט וויזואלי')

c.save()
print(OUT)
