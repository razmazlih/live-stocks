import { describe, expect, it } from 'vitest';
import { buildClosePairReviewPrompt } from '@/lib/close-pair-review-prompt';

describe('short binary pair review contract', () => {
  it('requires deep, independent research but caps only the Hebrew final answer', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('העמק במחקר ככל שנדרש');
    expect(prompt).toContain('מגבלת האורך חלה רק על התשובה הסופית');
    expect(prompt).toContain('אל תניח שההצעה טובה');
    expect(prompt).toContain('עד 80 מילים לכל זוג');
    expect(prompt).toContain('עד שני משפטים מבוססי ראיות');
    expect(prompt).toContain('הטיעון הנגדי החזק ביותר');
    expect(prompt).toContain('1–3 קישורים ישירים');
  });

  it('limits Hebrew recommendations to the full proposed exit or no exit', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('״למכור את שתיהן״ או ״לא למכור״');
    expect(prompt).toContain('אם אינך תומך בסגירה המלאה של אפילו אחת מהן');
    expect(prompt).toContain('אל תציע מניות חלופיות');
    expect(prompt).toContain('מכירה של מניה אחת בלבד, מכירה חלקית, שינוי כמויות');
    expect(prompt).toContain('הגבול הוא על הפעולות המומלצות בתשובה, לא על הניתוח');
    expect(prompt).not.toContain('הוסף שלב מחקר למניות חלופיות');
    expect(prompt).not.toContain('לפחות שלושה נימוקים');
  });

  it('preserves accounting and honest uncertainty without a third decision', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('realizedProfitUsd מכל המכירות הקודמות');
    expect(prompt).toContain('יעד הרווח של כל הסבבים');
    expect(prompt).toContain('עד המכירה לחלק שנמכר');
    expect(prompt).toContain('הפסדי עבר גם אינם סיבה להמשיך להחזיק');
    expect(prompt).toContain('אין אפשרות לאמת עצמאית');
    expect(prompt).toContain('בחר ״לא למכור״ כעת, בביטחון נמוך');
    expect(prompt).toContain('אל תציג ״להמתין״, ״תלוי״ או בקשה לפרטים כאפשרות שלישית');
  });

  it('keeps the same short, evidence-based binary contract in English', () => {
    const prompt = buildClosePairReviewPrompt([], 'en');
    expect(prompt).toContain('Research EACH company separately');
    expect(prompt).toContain('length limit applies only to the final answer');
    expect(prompt).toContain('At most 80 words per pair');
    expect(prompt).toContain('SELL BOTH or DO NOT SELL');
    expect(prompt).toContain('Do not propose replacement stocks');
    expect(prompt).toContain('limits recommended actions, not analysis');
    expect(prompt).toContain('Choose DO NOT SELL now, with low confidence');
    expect(prompt).toContain('Never omit prior losses');
    expect(prompt).toContain('The document generation time is not a quote timestamp');
    expect(prompt).toContain('1–3 direct links');
    expect(prompt).toContain('Do not execute trades');
    expect(prompt).not.toContain('add replacement-stock research');
    expect(prompt).not.toContain('Follow with deep analysis');
  });
});
