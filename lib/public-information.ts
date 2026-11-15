export type InformationKind = 'about' | 'privacy' | 'terms';
export type InformationLocale = 'he' | 'en';
type InformationCopy = { title: string; intro: string; sections: { title: string; paragraphs: string[] }[] };

export const publicInformation: Record<InformationLocale, Record<InformationKind, InformationCopy>> = {
  he: {
    about: {
      title: 'על LiveStocks',
      intro: 'LiveStocks הוא כלי לניהול ומעקב אחר תיק מניות אישי, בעברית ובאנגלית.',
      sections: [
        { title: 'מה אפשר לעשות', paragraphs: ['להזין החזקות ופעולות באופן ידני, לנהל רשימות מעקב, ולראות חישובי תשואה, רווח והפסד והערכות המבוססות על הנתונים שהוזנו ועל מקורות שוק חיצוניים. השירות אינו מתחבר לחשבון המסחר שלך ואינו מבצע קנייה, מכירה או העברת כספים.'] },
        { title: 'חשבון וחיבורים אישיים', paragraphs: ['הכניסה במצב ההשקה מתבצעת באמצעות Google ו־Better Auth. כניסה בסיסמה ומשלוח דוא״ל כבויים כברירת מחדל. נתוני התיק נשמרים לפי חשבון. אפשר להוסיף מפתח Finnhub אישי, לאשר חיבור קריאה בלבד ל־ChatGPT ולהפיק מפתח אישי לווידג׳ט Scriptable. החיבורים אופציונליים וניתנים לביטול בהגדרות.'] },
        { title: 'איך לקרוא את הנתונים', paragraphs: ['נתוני שוק עשויים להתעכב או להיות חסרים. חישובים והצעות תלויים בהנחות ובאיכות המידע; הם אינם ביצוע מסחר ואינם תחליף לבדיקה עצמאית או לייעוץ מקצועי מתאים.'] },
      ],
    },
    privacy: {
      title: 'פרטיות ושימוש במידע',
      intro: 'דף זה מתאר איזה מידע עובר בשירות LiveStocks, למה הוא משמש ואילו אפשרויות שליטה קיימות.',
      sections: [
        { title: 'חשבון וכניסה', paragraphs: ['LiveStocks מנהל התחברות באמצעות Better Auth. במצב ההשקה הכניסה היא עם Google בלבד; אימות בדוא״ל ואיפוס סיסמה זמינים רק אם מצב הסיסמאות מופעל בעתיד. נשמרים מזהה חשבון, שם, כתובת דוא״ל, מצב אימות ונתוני התחברות בסכמה פרטית במסד הנתונים. אם הרשמה עם סיסמה מופעלת, נשמר גיבוב של הסיסמה, ולא הסיסמה המקורית. אם משלוח דוא״ל מופעל, הספק שהוגדר מעבד את כתובת הנמען והודעות האימות ואיפוס הסיסמה. בכניסה עם Google, Google מאמת את הכניסה ומחזיר פרטי פרופיל בסיסיים; LiveStocks אינו מקבל את סיסמת Google. השירות אינו מבקש גישה לדואר Gmail, לקבצי Drive או לאנשי הקשר שלך.'] },
        { title: 'נתוני התיק והמפתחות', paragraphs: ['Supabase שומר את נתוני ההחזקות, רכישות ומכירות, עלויות, רשימות המעקב, ההגדרות ומזהה החשבון. נתונים אלה משמשים להצגת התיק ולחישוב המדדים. מפתח Finnhub שמוסיפים נשמר מוצפן בצד השרת; השרת מפענח אותו לצורך בקשות ל־Finnhub. מפתחות ווידג׳ט נשמרים בשרת כגיבוב, לצד פרטי תוקף ושימוש. נשמר גם מצב החיבור של הפלאגין לצורך אכיפת הרשאות וביטולן.'] },
        { title: 'ספקי שירות ונתוני שוק', paragraphs: ['Supabase מספק אחסון נתונים ו־Vercel משמש לאירוח השירות. Better Auth פועל כחלק מהשירות, וספק דוא״ל מטפל בהודעות החשבון רק אם אפשרות זו מופעלת. תשתיות אלה מעבדות בקשות ומידע טכני כגון כתובת IP, פרטי דפדפן ויומני תפעול או שגיאות. גישה תפעולית של מפעיל השירות עשויה להידרש לתמיכה, תחזוקה וטיפול בבקשות מידע.', 'בקשות לנתוני שוק נשלחות ל־Finnhub ול־Yahoo Finance עם סימולי מניות או טווחי זמן; Finnhub מקבל גם את המפתח האישי שהוגדר. שערי מטבע מתקבלים מספק שערי חליפין. סמלי חברות עשויים להיטען משרתי תמונות חיצוניים. אלה שירותים נפרדים עם תנאים ומדיניות משלהם.'] },
        { title: 'ChatGPT וחיבורים שאישרת', paragraphs: ['אם מאשרים את חיבור LiveStocks ב־ChatGPT, המארח יכול לקרוא מידע מהתיק, לרבות החזקות, סכומים, פעולות, חישובים ותקצירים, לצורך הבקשות המופעלות דרך החיבור. ההרשאה היא לקריאה בלבד ואינה מאפשרת מסחר. אין צורך בחיבור זה כדי להשתמש באתר. המידע שמועבר למארח כפוף גם לתנאים ולהגדרות הפרטיות שלו. ביטול החיבור בהגדרות חוסם גישה עתידית; הוא אינו מוחק מידע שכבר הופיע בשיחה אצל המארח.'] },
        { title: 'שמירה במכשיר', paragraphs: ['האתר משתמש בעוגיית התחברות מוגנת מגישת JavaScript ובהעדפות תצוגה מקומיות. הרשאת מסד הנתונים הזמנית מוחזקת בזיכרון הדפדפן. ניתוק או החלפת חשבון מאפסים את מצב התיק בממשק.', 'בווידג׳ט Scriptable המפתח נשמר ב־Keychain במכשיר. תקציר תיק נשמר במטמון מקומי לתצוגה ללא רשת, למשך עד שעה ובכפוף לתוקף המפתח. ביטול הרשאה שהתקבל מהשרת מנקה את המטמון; מכשיר לא מקוון עשוי עדיין להציג את התקציר השמור בתוך חלון זה.'] },
        { title: 'שליטה, שמירה ובקשות', paragraphs: ['אפשר לערוך ולהסיר נתוני תיק דרך הממשק, להסיר את מפתח Finnhub, לבטל חיבור לפלאגין ולבטל מפתחות ווידג׳ט. התנתקות אינה מחיקת חשבון או נתוני תיק. אפשר להעתיק צילום מצב נבחר דרך ״ייצוא לניתוח״; אין כרגע ייצוא ארכיון מלא או מחיקה אוטומטית של חשבון שלם.', 'לבקשת עותק מהמידע, תיקון או מחיקת חשבון יש לפנות לכתובת התמיכה המופיעה כאן. הטיפול ידני וכפוף לאימות זהות והרשאה. אין למחיקת החשבון תהליך אוטומטי במימוש הנוכחי. נתוני חשבון אינם פוקעים אוטומטית; גיבויים ויומני ספקים עשויים להישמר בנפרד. יש לברר עם התמיכה את היקף הטיפול בבקשה, לרבות עותקים אלה.'] },
      ],
    },
    terms: {
      title: 'תנאי שימוש ומידע על השירות',
      intro: 'המידע הבא מבהיר את תפקיד השירות, מגבלותיו ואחריות המשתמש בניהול החשבון והחיבורים.',
      sections: [
        { title: 'מטרת השירות', paragraphs: ['LiveStocks נועד לתיעוד, מעקב וחישוב מידע על תיק שהמשתמש מזין. הוא אינו ברוקר, אינו מחובר לחשבון המסחר לצורך ביצוע פעולות ואינו מעביר כספים. רישום קנייה או מכירה בממשק מעדכן את הרישום בלבד.'] },
        { title: 'נתונים, חישובים והצעות', paragraphs: ['מחירים, שערי חליפין וחישובים עשויים להיות חלקיים, מושהים או שגויים. תחזיות והצעות לניתוח הן מידע מסייע ואינן הבטחה לתשואה או תחליף לייעוץ השקעות, מס או ייעוץ מקצועי אישי. יש לבדוק נתונים מול מקורות מתאימים לפני קבלת החלטה. האחריות להחלטות ולפעולות מסחר נשארת אצל המשתמש.'] },
        { title: 'חשבון ושימוש מורשה', paragraphs: ['יש להשתמש רק בחשבון ובנתונים שיש לך הרשאה לנהל, להגן על אמצעי הכניסה והמפתחות האישיים, ולא לנסות לגשת לנתוני אחרים או לעקוף מגבלות הרשאה. מפתח Finnhub אישי כפוף גם לתנאי הספק. אין לפרסם מפתחות ווידג׳ט או להעבירם למי שאינו מורשה לקרוא את התקציר.'] },
        { title: 'חיבורים ושירותים חיצוניים', paragraphs: ['החיבור ל־ChatGPT והווידג׳ט הם אפשרויות נוספות הניתנות לביטול. הם מאפשרים קריאה בהיקף שנקבע לחיבור, ללא ביצוע מסחר. שירותים חיצוניים עשויים להגביל זמינות או שימוש בהתאם לתנאים שלהם. ביטול הרשאה אינו מוחק מידע שכבר נשמר או הוצג בשירות חיצוני.'] },
        { title: 'זמינות, מידע ותמיכה', paragraphs: ['אין הבטחה לזמינות רציפה או לנתוני שוק בזמן אמת. יש לשמור גם את המסמכים והרישומים המקוריים שלך. בקשות לקבלת מידע, תיקון או מחיקת חשבון מטופלות דרך התמיכה לאחר אימות מתאים; לא קיים מסלול אוטומטי למחיקת חשבון שלם. פרטי עיבוד המידע מופיעים בדף הפרטיות.'] },
      ],
    },
  },
  en: {
    about: {
      title: 'About LiveStocks',
      intro: 'LiveStocks is a personal stock portfolio tracker available in Hebrew and English.',
      sections: [
        { title: 'What it does', paragraphs: ['Manually record holdings and transactions, manage watchlists, and view returns, profit and loss, and estimates based on your entries and external market data. The service does not connect to your brokerage account or execute purchases, sales or money transfers.'] },
        { title: 'Your account and connections', paragraphs: ['Launch sign-in uses Google and Better Auth. Password sign-in and account email delivery are disabled by default. Portfolio records belong to individual accounts. You can add your own Finnhub key, authorize a read-only ChatGPT connection, and create a personal Scriptable widget key. These connections are optional and can be revoked in settings.'] },
        { title: 'Understanding the information', paragraphs: ['Market data may be delayed or unavailable. Calculations and suggestions depend on assumptions and data quality; they do not execute trades or replace independent checks or appropriate professional advice.'] },
      ],
    },
    privacy: {
      title: 'Privacy and data use',
      intro: 'This page describes the information processed by LiveStocks, its purposes and the controls available to you.',
      sections: [
        { title: 'Account and sign-in', paragraphs: ['LiveStocks manages sign-in using Better Auth. Launch sign-in is Google-only; email verification and password recovery are available only if password mode is enabled later. An account identifier, name, email, verification status and authentication records are stored in a private database schema. If password registration is enabled, it stores a password hash, not the original password. If account email delivery is enabled, the configured provider processes the recipient address and verification and password-reset messages. For Google sign-in, Google verifies the login and returns basic profile information; LiveStocks does not receive your Google password. The service does not request access to Gmail messages, Drive files or your contacts.'] },
        { title: 'Portfolio records and keys', paragraphs: ['Supabase stores holdings, purchases and sales, costs, watchlists, settings and your account identifier. This information is used to display your portfolio and calculate metrics. A Finnhub key you add is stored encrypted on the server and decrypted for requests to Finnhub. Widget keys are stored as hashes on the server, together with expiry and usage metadata. Plugin connection status is stored to enforce access and revocation.'] },
        { title: 'Service providers and market data', paragraphs: ['Supabase supplies database storage and Vercel hosts the service. Better Auth runs as part of the service, and the configured email provider sends account messages. These services process requests and technical information such as IP addresses, browser information and operational or error logs. The operator may require operational access for support, maintenance and information requests.', 'Market-data requests to Finnhub and Yahoo Finance include stock symbols or date ranges; Finnhub also receives your configured personal key. Currency rates come from an exchange-rate provider. Company logos may load from external image servers. These are separate services with their own terms and policies.'] },
        { title: 'ChatGPT and connections you authorize', paragraphs: ['If you authorize the LiveStocks connection in ChatGPT, that host can read portfolio information, including holdings, amounts, transactions, calculations and summaries, for requests made through the connection. Access is read-only and cannot execute trades. This connection is not required to use the website. Information sent to the host is also subject to its terms and privacy settings. Disconnecting in settings prevents future access; it does not delete information already present in a conversation with that host.'] },
        { title: 'Storage on your device', paragraphs: ['The website uses an HttpOnly session cookie and local appearance preferences. Temporary database authorization is held in browser memory. Signing out or switching accounts resets portfolio state in the interface.', 'The Scriptable widget stores its key in the device Keychain. A portfolio summary is cached locally for offline display for up to one hour, limited by the key expiry. An authorization denial received from the server clears the cache; an offline device may still display its saved summary within that window.'] },
        { title: 'Controls, retention and requests', paragraphs: ['You can edit and remove portfolio records through the interface, remove your Finnhub key, disconnect the plugin and revoke widget keys. Signing out does not delete your account or portfolio. You can copy a selected snapshot using Export for research; a complete account archive and automatic whole-account deletion are not currently available.', 'Contact the support address shown here to request a copy, correction or account deletion. Requests are handled manually subject to identity and authorization checks. Whole-account deletion has no automated implementation at present. Account records do not expire automatically; backups and provider logs may be retained separately. Ask support about the scope of your request, including these copies.'] },
      ],
    },
    terms: {
      title: 'Terms and service information',
      intro: 'The following explains the service, its limitations and your responsibilities when using your account and connections.',
      sections: [
        { title: 'Purpose of the service', paragraphs: ['LiveStocks records, tracks and calculates information about a portfolio you enter. It is not a broker, does not connect to your brokerage account to execute orders, and does not transfer money. Recording a purchase or sale in the interface changes your records only.'] },
        { title: 'Data, calculations and suggestions', paragraphs: ['Prices, currency rates and calculations may be incomplete, delayed or incorrect. Forecasts and analytical suggestions are supporting information, not a promise of returns or a substitute for personal investment, tax or other professional advice. Check information against appropriate sources before making decisions. You remain responsible for investment decisions and trading actions.'] },
        { title: 'Account and authorized use', paragraphs: ['Use only accounts and information you are authorized to manage, protect your credentials and personal keys, and do not attempt to access other users’ information or bypass access controls. Your Finnhub key is also subject to that provider’s terms. Do not publish widget keys or share them with anyone who is not authorized to read your summary.'] },
        { title: 'Connections and external services', paragraphs: ['The ChatGPT connection and widget are optional and can be revoked. They permit reading within the connection’s scope and cannot execute trades. External services may limit availability or usage under their own terms. Revocation does not delete information already stored or displayed by another service.'] },
        { title: 'Availability, records and support', paragraphs: ['Continuous availability and real-time market data are not guaranteed. Keep your original financial documents and records. Information, correction and account-deletion requests are handled through support after appropriate verification; there is no automatic whole-account deletion flow. The privacy page describes data processing.'] },
      ],
    },
  },
};
