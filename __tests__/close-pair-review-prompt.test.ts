import { describe, expect, it } from 'vitest';
import { buildClosePairReviewPrompt } from '@/lib/close-pair-review-prompt';

describe('pair research verdict instructions', () => {
  it('requires research of both stocks and an evidence-backed side in Hebrew', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('תומך בסגירת שתיהן / מתנגד לסגירת שתיהן');
    expect(prompt).toContain('הדוח הכספי האחרון');
    expect(prompt).toContain('לפחות שלושה נימוקים מבוססי ראיות');
    expect(prompt).toContain('הטיעון הנגדי החזק ביותר');
    expect(prompt).toContain('מה עשוי להפוך את ההכרעה');
    expect(prompt).toContain('אל תעמיד פנים שנעשה מחקר עמוק');
  });
  it('preserves the research, verdict and uncertainty requirements in English', () => {
    const prompt = buildClosePairReviewPrompt([], 'en');
    expect(prompt).toContain('SUPPORT closing both / OPPOSE closing both');
    expect(prompt).toContain('Research EACH company separately');
    expect(prompt).toContain('three evidence-backed reasons');
    expect(prompt).toContain('evidence that would reverse your verdict');
    expect(prompt).toContain('OPPOSE executing now due to missing verification');
    expect(prompt).toContain('Do not execute trades');
  });
  it('requests replacement research only for supported exits and uses their gross proceeds', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('רק אם אתה תומך בסגירת זוג אחד או יותר');
    expect(prompt).toContain('אל תשתמש ברווח או ביתרה מעל היעד כתקציב');
    expect(prompt).toContain('אל תכלול תמורה מזוג שהתנגדת לסגירתו');
    expect(prompt).toContain('חקור לעומק כל מועמדת סופית');
    expect(prompt).toContain('מניה אחת, כמה מניות או מזומן בינתיים');
    expect(prompt).toContain('אין לבצע מכירה או קנייה');
  });
  it('preserves conditional alternatives, budget boundaries and cash comparison in English', () => {
    const prompt = buildClosePairReviewPrompt([], 'en');
    expect(prompt).toContain('ONLY if you support closing one or more pairs');
    expect(prompt).toContain('exclude proceeds from pairs you opposed');
    expect(prompt).toContain('Deeply research EACH finalist');
    expect(prompt).toContain('one stock, several stocks, or cash for now');
    expect(prompt).toContain('do not exceed 100%');
    expect(prompt).toContain('Do not execute sales or purchases');
  });

});
