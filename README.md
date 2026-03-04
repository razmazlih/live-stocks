# LiveStocks

אפליקציית ווב לניהול ומעקב תיק מניות בזמן אמת, עם תמיכה מלאה בעברית/אנגלית (RTL/LTR), חישובי ביצועים, רשימות מעקב, תובנות שבועיות, ותשתית נתונים מבוססת Supabase.

## מה הפרויקט כולל
- ניהול פוזיציות פתוחות וסגורות (כולל lots, עמלות ומיקום תיק)
- תוכניות קנייה/מכירה עתידיות (`position_plans`) עם עיבוד אוטומטי
- דשבורד עם מדדי ביצועים, פער מול תחזית וגרפים
- Watchlist עם קבוצות, כרטיסי מניות, היסטוריית מחירים וגרירה למיון
- עמוד Insights שבועי
- עמוד AI Prompts ליצירת קונטקסט מוכן לניתוח חיצוני
- המרות USD/ILS בזמן אמת + שערים היסטוריים
- API פנימי ב-Next.js לציטוטים, נרות, פורטפוליו ותחזיות

## Stack טכנולוגי
- `Next.js 16` (App Router)
- `React 18` + `TypeScript`
- `Tailwind CSS` + `Radix UI`
- `Supabase` (Postgres + RLS)
- `Vitest` + `Testing Library`
- ספקי נתונים:
  - `Finnhub` למחירי מניות
  - `Yahoo Finance chart API` לנתוני נרות/היסטוריה
  - `open.er-api.com` לשערי מטבע

## מבנה תיקיות
```text
app/
  api/                          # API routes פנימיים
  ai-prompts/                   # יצירת פרומפטים חכמים
  insights/                     # תובנות שבועיות
  portfolio/                    # מבט תיק וגרפים
  positions/                    # ניהול פוזיציות, lots, plans
  realized/                     # ביצועים ממומשים
  settings/                     # הגדרות שפה/מטבע/Token
  stock/[symbol]/               # דף מניה
  stock/[symbol]/forecast/      # תחזית למניה (אופציונלי)
  watchlist/                    # רשימות מעקב

components/
  dashboard/ portfolio/ watchlist/ charts/ ui/

hooks/
  use-portfolio-data.ts         # טעינת נתוני תיק וחישובי ציר זמן
  use-watchlist.ts              # לוגיקת watchlist

lib/
  calculations.ts               # חישובים פיננסיים
  context.tsx                   # AppProvider: שפה/הגדרות/רענון/Plans
  plans.ts                      # עיבוד position plans
  services/                     # Finnhub, exchange-rate, historical-fx
  supabase.ts                   # יצירת Supabase client וטייפים

supabase/
  migrations/                   # כל המיגרציות
  seed.sql                      # seed מקומי
  config.toml                   # קונפיגורציית Supabase CLI
```

## מסכים מרכזיים באפליקציה
- `/` דשבורד ראשי: תמונת מצב, ביצועים, פעולות מהירות וגרפים
- `/positions` ניהול פוזיציות, פעולות BUY/SELL, lot history, plans
- `/portfolio` מבט תיק מרוכז וציר זמן
- `/realized` רווח/הפסד ממומש וחבות מס מחושבת
- `/watchlist` קבוצות מעקב, סימבולים וגרפים קצרים
- `/insights` סיכום שבועי אוטומטי
- `/ai-prompts` הפקת פרומפטים מובנים ל-AI
- `/settings` הגדרות שפה, מטבע, אינטרוול רענון ו-Finnhub token
- `/stock/[symbol]` פירוט מניה
- `/stock/[symbol]/forecast` תחזית ממקור חיצוני (אם הופעל)

## API פנימי (Next.js Route Handlers)
- `GET /api/quote?symbol=...` ציטוט למניה אחת (עם cache קצר בזיכרון)
- `GET /api/quotes?symbols=AAPL,MSFT` ציטוטים מרובים
- `GET /api/candles?symbol=...&from=...&to=...&resolution=D|60|W|M` נרות מחיר
- `GET /api/exchange-rate` שער USD→ILS
- `POST /api/portfolio` חישוב summary + metrics + realized מול Supabase
- `GET /api/portfolio/combined-pnl` סיכום משולב לתיק
- `GET /api/forecast/[horizon]/[symbol]` proxy לשירות תחזיות חיצוני

## בסיס נתונים (Supabase)
טבלאות עיקריות:
- `positions` פוזיציות בסיס
- `position_lots` פעולות BUY/SELL בפועל
- `position_plans` תוכניות עתידיות (pending/triggered/expired/cancelled)
- `settings` שורת הגדרות גלובלית (singleton)
- `watchlist_groups` קבוצות watchlist
- `watchlist_tickers` ניירות בתוך כל קבוצה

הערות חשובות:
- קיימת תמיכה בעמלות ב-`position_lots` ו-`position_plans`
- `positions.location` ו-`position_plans.location` משתמשים ב-enum `position_location`
- ב-local המיגרציות מגדירות מדיניות RLS פתוחה לפיתוח

## משתני סביבה
העתיקו:
```bash
cp .env.exemple .env.local
```

משתנים:
- `NEXT_PUBLIC_SUPABASE_URL` חובה
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` חובה
- `FINNHUB_TOKEN` אופציונלי אך מומלץ מאוד
- `DEFAULT_GROWTH_RATE` אופציונלי (ברירת מחדל חישובית)
- `DEFAULT_USD_TO_ILS_RATE` אופציונלי (fallback)
- `EXCHANGE_RATE_URL` אופציונלי
- `NEXT_PUBLIC_FORECAST_URL` אופציונלי
  - ערך `1` מפעיל ברירת מחדל: `http://localhost:8080`
  - ערך ריק מכבה פיצ'ר forecast
- `OPENAI_API_KEY` אופציונלי (כרגע לא קריטי ל-core flow)

## התקנה והרצה מקומית
### 1) התקנת תלויות
```bash
npm install
```

### 2) העלאת Supabase מקומי
```bash
npx supabase start
```

### 3) החלת סכימה + seed
```bash
npx supabase db reset
```

### 4) הרצת האפליקציה
```bash
npm run dev
```

האפליקציה תהיה זמינה ב-`http://localhost:3000`.

## פקודות שימושיות
- `npm run dev` הרצת פיתוח
- `npm run build` בנייה לפרודקשן
- `npm run start` הרצת build
- `npm run lint` בדיקות ESLint
- `npm run typecheck` בדיקת TypeScript
- `npm test` הרצת בדיקות Vitest

## בדיקות
תיקיית `__tests__/` כוללת בדיקות עבור:
- חישובים (`calculations`)
- FX היסטורי
- watchlist
- plans
- weekly insights

להרצה:
```bash
npm test
```

## זרימת נתונים בקצרה
1. נתונים נשמרים ב-Supabase (`positions`, `lots`, `plans`, `settings`, `watchlist`).
2. `use-portfolio-data` טוען נתונים, משלב ציטוטים חיים ושערי מטבע, ומחשב metrics/summary.
3. מסכי UI צורכים את ה-state המחושב ומציגים KPIs, גרפים ותובנות.
4. `AppProvider` מעבד plans אוטומטית כל דקה ומבצע refresh כשיש טריגרים.

## דגשים לפיתוח שוטף
- הפרויקט תלוי בהגדרת Supabase env vars; בלעדיהם ייזרק error בעלייה.
- ללא `FINNHUB_TOKEN` המערכת תעבוד חלקית (פחות נתונים חיים).
- קבצי `tmp/` ו-`output/` הם ארטיפקטים מקומיים ולא חלק מה-runtime הקריטי.
- `seed.sql` קיים אך מינימלי, מומלץ להרחיב אותו ל-onboarding מהיר.

## Troubleshooting מהיר
- `Supabase client is not configured`:
  - לבדוק `NEXT_PUBLIC_SUPABASE_URL` ו-`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- אין ציטוטים חיים:
  - לבדוק `FINNHUB_TOKEN` ב-`.env.local` ובטבלת `settings`.
- forecast מחזיר 503:
  - להגדיר `NEXT_PUBLIC_FORECAST_URL` או לכבות את הפיצ'ר.
- שגיאות טיפוסים/בנייה:
  - להריץ `npm run typecheck` ואז `npm run build`.
