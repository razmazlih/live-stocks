/** Balance-only snapshots cannot establish the execution history needed for targets. */
export const SCREENSHOT_RECONCILIATION_RETIRED = 'התאמת יתרה מצילום אינה זמינה. יש לרשום קנייה או מכירה רגילה עם תאריך ביצוע, מחיר, כמות ועמלה מאושרים, בדיוק כמו באתר. אין להמציא עסקאות מתוך יתרה מצטברת.';
export class ScreenshotReconciliationRetiredError extends Error {
  constructor() { super(SCREENSHOT_RECONCILIATION_RETIRED); }
}
export function rejectScreenshotReconciliation(): void {
  throw new ScreenshotReconciliationRetiredError();
}
