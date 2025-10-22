# Live Stocks — סטטוס מניות בזמן אמת

תיעוד זה מרכז את כל המידע הנדרש כדי להבין, להפעיל ולתחזק את הפרויקט. האפליקציה מספקת לוח מחוונים מתקדם לניהול ומעקב אחר תיק מניות עם ניתוחים, הדמיות ותמיכה מלאה בעברית ובאנגלית.

## תוכן העניינים
- [טכנולוגיות מרכזיות](#טכנולוגיות-מרכזיות)
- [מבנה הפרויקט](#מבנה-הפרויקט)
- [זרימת נתונים ולוגיקה עסקית](#זרימת-נתונים-ולוגיקה-עסקית)
- [עמודים וחוויית משתמש](#עמודים-וחוויית-משתמש)
- [שכבת ה-API](#שכבת-ה-api)
- [בסיס הנתונים (Supabase)](#בסיס-הנתונים-supabase)
- [קבצי תצורה עיקריים](#קבצי-תצורה-עיקריים)
- [התקנה והרצה מקומית](#התקנה-והרצה-מקומית)
- [משתני סביבה](#משתני-סביבה)
- [סקריפטים שימושיים](#סקריפטים-שימושיים)
- [עקרונות עיצוב ופיתוח](#עקרונות-עיצוב-ופיתוח)
- [בדיקות וצעדי וידוא](#בדיקות-וצעדי-וידוא)
- [נושאים להמשך פיתוח](#נושאים-להמשך-פיתוח)

## טכנולוגיות מרכזיות
- **Next.js 13 (App Router)** – אפליקציית צד-לקוח עם ניהול מטמון ו-API מובנים. 【F:app/layout.tsx†L1-L26】【F:app/page.tsx†L1-L134】
- **TypeScript** – הגדרות טייפים מלאות לנתוני פוזיציות, מדדים ותרחישים. 【F:types/index.ts†L1-L170】
- **Tailwind CSS + Radix UI** – עיצוב רכיבים נגישים וניתנים להתאמה אישית. 【F:tailwind.config.ts†L1-L79】【F:components/ui/button.tsx†L1-L62】
- **Supabase (Postgres + Auth + Realtime)** – אחסון הפוזיציות, מדיניות RLS וסינכרון. 【F:supabase/config.toml†L1-L160】【F:supabase/migrations/20241003120000_create_positions_and_settings.sql†L1-L80】
- **Finnhub API** – משיכת מחירי מניות חיים ושינויים יומיים. 【F:app/api/portfolio/route.ts†L56-L116】
- **Open Exchange Rates API (ברירת מחדל)** – המרת מטבע USD→ILS עם מנגנון גיבוי. 【F:app/api/exchange-rate/route.ts†L1-L40】

## מבנה הפרויקט
```
app/
  ├─ layout.tsx             # מעטפת כללית, ספק הקשר ו-Toaster
  ├─ globals.css            # סגנונות בסיס ו-RTL
  ├─ page.tsx               # דף הבית – תקציר תיק, כרטיסי פוזיציות ופעולות מהירות
  ├─ portfolio/             # סקירת התיק הכולל והיסטוריית PnL
  ├─ positions/, realized/  # דפי פירוט לפוזיציות פתוחות וסגורות
  ├─ settings/              # הגדרות משתמש: שפה, מטבע, טוקן Finnhub ועוד
  ├─ watchlist/             # רשימת צפייה עם קבוצות, כרטיסי מניות וגרפים
  └─ api/                   # מסלולי API לנתונים חיים (quote, candles, exchange-rate, portfolio)
components/
  ├─ dashboard/             # Hero, פעולות מהירות, מצבי ריק וגריד סיכומים
  ├─ portfolio/             # כרטיסי פוזיציה והדמיות תיק
  ├─ charts/                # גרפים משותפים (Sparkline, Portfolio Overview)
  ├─ watchlist/             # רכיבי Watchlist (בחירת קבוצות, כרטיס מניה, טווחי זמן)
  └─ ui/                    # רכיבי בסיס (Button, Card, Table, Sonner וכו')
hooks/
  ├─ use-portfolio-data.ts  # קריאת Supabase, הבאת נתונים חיצוניים וחישוב מדדים
  └─ use-watchlist.ts       # ניהול קבוצות רשימת צפייה ומניות דרך Supabase
lib/
  ├─ http.ts                # עטיפת fetch עם מנגנון retry/backoff אחיד
  ├─ services/              # שירותי נתונים חיצוניים (Finnhub, שערי מטבע)
  │   ├─ exchange-rate.ts   # טעינת שערי USD→ILS עם fallback חכם
  │   └─ finnhub.ts         # משיכת ציטוטים והפרשי יום מ-Finnhub
  ├─ utils/
  │   ├─ numbers.ts         # עזרי מספרים (isFiniteNumber, toFixedNumber)
  │   └─ trading-hours.ts   # חישובי זמני מסחר
  ├─ calculations.ts        # פונקציות חישוב לרווח/הפסד, מדדים מצטברים, גרפים
  ├─ context.tsx            # AppProvider: שפה, הגדרות, טריגר רענון
  ├─ positions.ts           # מיפוי תוצאות Supabase ל-Position + lots
  ├─ watchlist.ts           # מיפוי רשימות מעקב ופריטי מניה מ-Supabase ל-Typescript
  ├─ supabase.ts            # יצירת לקוח Supabase בדפדפן
  └─ translations.ts        # מילון דו-לשוני (עברית/אנגלית)
supabase/
  ├─ config.toml            # תצורת Supabase CLI, יציאות ושירותים
  ├─ migrations/            # סכמת בסיס נתונים ו-RLS
  └─ seed.sql               # קובץ זרעים (placeholder)
```

## זרימת נתונים ולוגיקה עסקית
1. **הקשר גלובלי (`AppProvider`)** שומר שפה, הגדרות (מטבע, קצב רענון, יעד צמיחה שנתי, טוקן Finnhub) וזיכרון מקומי. 【F:lib/context.tsx†L1-L66】
2. **`usePortfolioData`** מושך פוזיציות וטבלאות בתתי-שאילתות מ-Supabase, מביא שער דולר וגרף נרות לכל מניה, מחשב מדדים ויוצר ציר זמן של PnL. 【F:hooks/use-portfolio-data.ts†L1-L119】【F:hooks/use-portfolio-data.ts†L119-L210】
3. **חישובי ביצועים** מתבצעים ב-`lib/calculations.ts`, כולל המרת מטבע, תשואות ונתוני עזר להדמיות. 【F:lib/calculations.ts†L1-L200】
4. **תרגומים** נלקחים מ-`lib/translations.ts` לכל רכיב ועמוד, עם פונקציות דינמיות לטקסטים מורכבים. 【F:lib/translations.ts†L1-L170】
5. **רכיבים חזותיים** משתמשים במידע המחושב להצגת כרטיסי פוזיציה, גרפים (Recharts, Embla), סיכומים ופעולות. 【F:components/portfolio/portfolio-visualizations.tsx†L1-L160】

## עמודים וחוויית משתמש
- **דף הבית (`/`)**: תצוגת מצב מהירה, כרטיסי תקציר, פעולות מהירות וקישורים למסכים ייעודיים. 【F:app/page.tsx†L1-L200】
- **Portfolio (`/portfolio`)**: גרף PnL מצטבר, סטטיסטיקות כלליות, מובילים/נגררים וניתוח שינוי יומי. 【F:app/portfolio/page.tsx†L1-L200】
- **Positions / Realized**: פירוט מלא של פוזיציות פעילות ולוגים היסטוריים עם פילוחים לפי lots. 【F:app/positions/page.tsx†L1-L160】【F:app/realized/page.tsx†L1-L160】
- **Settings (`/settings`)**: שליטה בשפה, מטבע יעד, קצב רענון, טוקן Finnhub ואיפוס נתונים מקומיים. 【F:app/settings/page.tsx†L1-L180】
- **Stock (`/stock/[symbol]`)**: דף מניה בודדת עם היסטוריית מחירים, תחזיות וניתוח משלים. 【F:app/stock/[symbol]/page.tsx†L1-L200】
- **Watchlist (`/watchlist`)**: ניהול קבוצות רשימת צפייה, הוספה/עריכה של מניות וגרפים רספונסיביים לפי טווחי זמן. 【F:app/watchlist/page.tsx†L1-L360】

## שכבת ה-API
- `GET /api/quote` – מחזיר מחיר חי ושינוי יומי מממשק Finnhub עם מנגנון retry. 【F:app/api/quote/route.ts†L1-L80】
- `GET /api/candles` – נרות מסחר (Finnhub), משמש לגרפי sparkline וניתוח היסטורי. 【F:app/api/candles/route.ts†L1-L120】
- `GET /api/exchange-rate` – שער USD→ILS עם retry וגיבוי לתרחיש כשל. 【F:app/api/exchange-rate/route.ts†L1-L40】
- `POST /api/portfolio` – יוצר תקציר משוקלל, מחירים נוכחיים/חזויים ומדדים לכל פוזיציה. 【F:app/api/portfolio/route.ts†L1-L240】
- `GET /api/portfolio/combined-pnl` – מחזיר את הרווח/הפסד נטו של התיק כפי שמוצג בדף הסקירה. 【F:app/api/portfolio/combined-pnl/route.ts†L1-L125】

כל המסלולים משתמשים במנגנון **backoff מעריכי** מתוך `lib/http.ts` יחד עם שירותי `lib/services` כדי להבטיח קוד נטול כפילויות, כותרות Cache מתאימות והמרות TypeScript קפדניות. 【F:lib/http.ts†L1-L52】【F:lib/services/finnhub.ts†L1-L42】【F:lib/services/exchange-rate.ts†L1-L66】

## בסיס הנתונים (Supabase)
- **טבלאות**
  - `positions`: נתוני בסיס לכל מניה בתיק (סמל, מחיר כניסה, כמות, תאריך וכו'). 【F:supabase/migrations/20241003120000_create_positions_and_settings.sql†L5-L44】
  - `position_lots`: תיעוד קניות/מכירות חלקיות, עם טריגר לסנכרון `updated_at`. 【F:supabase/migrations/20241015100000_add_position_lots.sql†L1-L33】
  - `settings`: תצורה גלובלית (קצב צמיחה, מטבע, טוקן Finnhub). 【F:supabase/migrations/20241003120000_create_positions_and_settings.sql†L46-L74】
  - `watchlist_groups`: קבוצות רשימת צפייה עם שם, תיאור ומועדי יצירה/עדכון. 【F:supabase/migrations/20241020110000_create_watchlist_tables.sql†L1-L36】
  - `watchlist_tickers`: פריטי רשימת צפייה לכל קבוצה (סימול, שם תצוגה, הערות, סדר הצגה). 【F:supabase/migrations/20241020110000_create_watchlist_tables.sql†L38-L74】
- **מדיניות RLS**: כל הטבלאות פתוחות לקריאה/כתיבה לצרכי סביבה מקומית, עם טריגרים לעדכון `updated_at`. 【F:supabase/migrations/20241003120000_create_positions_and_settings.sql†L18-L80】【F:supabase/migrations/20241015100000_add_position_lots.sql†L17-L36】
- **תצורה מקומית**: הפורטים והשרותים (API, DB, Studio, Realtime) מוגדרים ב-`supabase/config.toml`, כולל הפעלת זרעים ואימות מקומי. 【F:supabase/config.toml†L1-L160】

## קבצי תצורה עיקריים
- `next.config.js` – התאמות ל-Next.js במידת הצורך (ברירת מחדל). 【F:next.config.js†L1-L9】
- `tailwind.config.ts` – הגדרות נושא, אנימציות ונתיבי תוכן. 【F:tailwind.config.ts†L1-L79】
- `postcss.config.js` – הפעלת Tailwind ו-Autoprefixer. 【F:postcss.config.js†L1-L9】
- `tsconfig.json` – הגדרות נתיבים (aliases עם `@/`), Strict Mode והרכבת TypeScript. 【F:tsconfig.json†L1-L33】

## התקנה והרצה מקומית
1. התקנת תלויות:
   ```bash
   npm install
   ```
2. הגדרת קובץ `.env.local` (ראו [משתני סביבה](#משתני-סביבה)).
3. הפעלת Supabase מקומית (אופציונלי אך מומלץ):
   ```bash
   npx supabase start
   ```
4. הרצת שרת פיתוח Next.js:
   ```bash
   npm run dev
   ```
5. ביקור ב-[http://localhost:3000](http://localhost:3000) והתחברות לסביבת Supabase Studio ב-[http://127.0.0.1:54323](http://127.0.0.1:54323) לניהול נתונים.

### סנכרון סכמת בסיס הנתונים
- להריץ מיגרציות:
  ```bash
  npx supabase db reset
  ```
  פעולה זו תיצור מחדש את הטבלאות ותפעיל את `seed.sql` (כרגע קובץ placeholder).

## משתני סביבה

### משתני חובה
המשתנים הבאים חייבים להיות מוגדרים כדי שהאפליקציה תתחבר ל-Supabase:

| שם משתנה | שימוש |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | חיבור Supabase מהדפדפן |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח אנון Supabase |

### משתנים אופציונליים וברירות מחדל
ניתן להשאיר את המשתנים הבאים ריקים. הם עוקפים ברירות מחדל או מאפשרים יכולות נוספות במידת הצורך:

| שם משתנה | שימוש | ברירת מחדל / הערות |
| --- | --- | --- |
| `FINNHUB_TOKEN` | טוקן API להצגת נתוני שוק חיים | מומלץ לספק טוקן כדי להסיר מגבלות קצב |
| `DEFAULT_GROWTH_RATE` | קצב צמיחה שנתי לחיזוי | `0.05` |
| `DEFAULT_USD_TO_ILS_RATE` | שער דולר-שקל fallback | `3.7` |
| `EXCHANGE_RATE_URL` | מקור חלופי לשערי מטבע | `https://open.er-api.com/v6/latest/USD` |
| `NEXT_PUBLIC_FORECAST_URL` | בסיס API לשרות החיזוי | `http://localhost:8080` (השאר ריק כדי לכבות) |
| `OPENAI_API_KEY` | לשימוש ב-Supabase Studio | אופציונלי בלבד |

> **הערה**: ניתן להזין טוקן Finnhub גם מתוך מסך ההגדרות – הערך נשמר בטבלת `settings`.

## סקריפטים שימושיים
כל הסקריפטים מנוהלים ב-`package.json`:
- `npm run dev` – הפעלת שרת פיתוח.
- `npm run build` – בניית האפליקציה לפרודקשן.
- `npm run start` – הרצת הבילד שנוצר.
- `npm run lint` – בדיקת תקינות ESLint.
- `npm run typecheck` – בדיקות TypeScript ללא פליטה. 【F:package.json†L1-L48】
- `npm test` – הרצת בדיקות יחידה וקומפוננטה עם Vitest. 【F:package.json†L1-L52】

## עקרונות עיצוב ופיתוח
- **RTL ו-LTR**: שינוי שפה מעדכן את כיוון המסמך, שומר במקומי ומחיל תרגומים דינמיים. 【F:lib/context.tsx†L29-L44】
- **מנגנון רענון**: הכפתור בדפים המרכזיים מפעיל `triggerRefresh` שמטמיע נתונים חדשים. 【F:lib/context.tsx†L48-L60】【F:app/page.tsx†L24-L40】
- **שמירת הגדרות**: נתוני משתמש נשמרים ב-localStorage ומסתנכרנים עם Supabase להגדרות גלובליות. 【F:lib/context.tsx†L15-L66】【F:app/settings/page.tsx†L1-L180】
- **התמודדות עם מגבלות API**: עטיפת `fetchWithRetry` ב-`lib/http.ts` מעניקה retry/backoff אחיד, והשירותים ב-`lib/services` מונעים כפילויות בעת גישה ל-Finnhub ולשערי מטבע. 【F:lib/http.ts†L1-L52】【F:lib/services/finnhub.ts†L1-L42】【F:lib/services/exchange-rate.ts†L1-L66】
- **נגישות ו-UI קונסיסטנטי**: רכיבי `components/ui` מבוססי Radix + Tailwind עם מצבי Keyboard ו-Focus מובנים. 【F:components/ui/button.tsx†L1-L62】

## בדיקות וצעדי וידוא
- הרצת `npm run lint` ו-`npm run typecheck` לפני PR.
- הרצת `npm test` כדי לוודא שרכיבי ה-Watchlist וה-utilים החדשים עוברים בדיקות יחידה.
- בדיקת ניווט בין מסכים בשתי שפות, כולל מצבי RTL.
- אימות שה-API החיצוניים מגיבים כמצופה (כולל תרחישי כשל והודעות שגיאה למשתמש).
- ווידוא שהמיגרציות והזרעים של Supabase נטענים בהצלחה אחרי `supabase db reset`.

## נושאים להמשך פיתוח
- השלמת seed נתונים לדוגמה עבור onboarding מהיר.
- הרחבת כיסוי בדיקות (unit + e2e) לרכיבי חישוב וזרימת נתונים.
- תמיכה במטבעות נוספים והרחבת סימולציות (`What-if`) לדינמיקת ריביות ומסים.
- אינטגרציה עם שירותי ניתוח נוספים (למשל Alpha Vantage) וריבוי טוקנים למשתמשים שונים.
