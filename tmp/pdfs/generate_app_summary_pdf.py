from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

out_path = 'output/pdf/livestocks-app-summary.pdf'

c = canvas.Canvas(out_path, pagesize=LETTER)
width, height = LETTER

left = 46
right = width - 46
y = height - 42

TITLE = 'LiveStocks App Summary'

c.setFillColor(HexColor('#0f172a'))
c.setFont('Helvetica-Bold', 16)
c.drawString(left, y, TITLE)
y -= 18
c.setFont('Helvetica', 9)
c.setFillColor(HexColor('#475569'))
c.drawString(left, y, 'Source: repository evidence only (README, app/, lib/, hooks/, supabase/, package.json)')
y -= 16


def h(text):
    global y
    c.setFillColor(HexColor('#111827'))
    c.setFont('Helvetica-Bold', 11)
    c.drawString(left, y, text)
    y -= 12


def p(text, size=9):
    global y
    c.setFillColor(HexColor('#1f2937'))
    c.setFont('Helvetica', size)
    c.drawString(left, y, text)
    y -= 11


def b(text, size=9):
    global y
    c.setFillColor(HexColor('#1f2937'))
    c.setFont('Helvetica', size)
    c.drawString(left + 10, y, '- ' + text)
    y -= 10

h('What it is')
p('A Next.js 16 + TypeScript stock portfolio dashboard with Supabase persistence and API routes for market data.')
p('It supports bilingual UI (Hebrew/English), portfolio analytics, watchlists, and USD/ILS-aware calculations.')
y -= 3

h('Who it\'s for')
b('Primary user/persona: Not found in repo.')
y -= 3

h('What it does')
b('Tracks stock positions, lots, realized sales, and portfolio plans with persisted settings (Supabase).')
b('Shows dashboard summaries: total value, current/projected PnL, daily change, and portfolio visualizations.')
b('Provides watchlist groups with drag-and-drop ordering and per-ticker cards.')
b('Fetches live quotes/candles via Finnhub-backed API routes with retry/error handling.')
b('Applies FX conversion and historical FX logic for USD-to-ILS analytics and tax-oriented calculations.')
b('Includes per-stock detail and forecast views under dynamic symbol routes.')
y -= 3

h('How it works (repo-backed architecture)')
b('Frontend: Next.js App Router pages in app/* with reusable UI components in components/* and client hooks.')
b('State layer: lib/context.tsx stores locale/settings/refresh state; hooks/use-portfolio-data.ts loads and derives metrics.')
b('Data/API: app/api/quote, /candles, /portfolio, /exchange-rate call lib/services/* (Finnhub + exchange-rate providers).')
b('Persistence: lib/supabase.ts + hooks/use-watchlist.ts CRUD against Supabase tables (positions, settings, watchlist_*).')
b('DB schema: supabase/migrations/* define tables, indices, triggers, and RLS policies used by the app.')
b('Flow: Browser UI -> Next API routes/hooks -> service clients/Supabase -> computed metrics -> rendered cards/charts.')
y -= 3

h('How to run (minimal)')
b('Install deps: npm install')
b('Configure env: create .env.local (from .env.exemple) with Supabase URL/key; add FINNHUB_TOKEN if available.')
b('Start local backend: npx supabase start (then npx supabase db reset for migrations/seed).')
b('Run app: npm run dev  (open http://localhost:3000)')

c.setStrokeColor(HexColor('#cbd5e1'))
c.line(left, 24, right, 24)
c.setFont('Helvetica', 8)
c.setFillColor(HexColor('#64748b'))
c.drawRightString(right, 14, 'Generated on 2026-02-13')

c.save()
print(out_path)
