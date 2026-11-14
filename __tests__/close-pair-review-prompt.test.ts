import { describe, expect, it } from 'vitest';
import type { ClosePairLeg, ClosePairProposal } from '@/lib/close-pair-proposals';
import { buildClosePairReviewPrompt } from '@/lib/close-pair-review-prompt';

describe('short binary pair review contract', () => {
  it('requires deep, independent research but caps only the Hebrew final answer', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('העמק במחקר ככל שנדרש');
    expect(prompt).toContain('מגבלת האורך חלה רק על התשובה הסופית');
    expect(prompt).toContain('אל תניח שההצעה טובה');
    expect(prompt).toContain('עד 120 מילים לכל קבוצת סגירה');
    expect(prompt).toContain('עד שני משפטים מבוססי ראיות');
    expect(prompt).toContain('הטיעון הנגדי החזק ביותר');
    expect(prompt).toContain('קישור ישיר שנבדק לכל חברה לפחות');
  });

  it('limits Hebrew recommendations to the full proposed exit or no exit', () => {
    const prompt = buildClosePairReviewPrompt([], 'he');
    expect(prompt).toContain('״למכור את כולן״ או ״לא למכור״');
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
    expect(prompt).toContain('At most 120 words per group');
    expect(prompt).toContain('SELL ALL or DO NOT SELL');
    expect(prompt).toContain('Do not propose replacement stocks');
    expect(prompt).toContain('limits recommended actions, not analysis');
    expect(prompt).toContain('Choose DO NOT SELL now, with low confidence');
    expect(prompt).toContain('Never omit prior losses');
    expect(prompt).toContain('The document generation time is not a quote timestamp');
    expect(prompt).toContain('at least one verified direct source for EACH company');
    expect(prompt).toContain('Do not execute trades');
    expect(prompt).not.toContain('add replacement-stock research');
    expect(prompt).not.toContain('Follow with deep analysis');
  });
});


it('exports every group member and includes historical results from the extra loser', () => {
  const makeLeg = (symbol: string, realized: number, unrealized: number): ClosePairLeg => ({
    position: { symbol, display: symbol, entryDate: '2026-01-01T00:00:00Z', entryPrice: 100, quantity: 10, location: 'bank_one' },
    quantity: 10, currentPrice: (1000 + unrealized) / 10, costBasisUsd: 1000,
    proceedsUsd: 1000 + unrealized, realizedPnlUsd: realized, unrealizedPnlUsd: unrealized,
    pnlUsd: realized + unrealized, targetProfitUsd: 20, surplusUsd: realized + unrealized - 20,
  });
  const winner = makeLeg('WIN', 100, 800), first = makeLeg('LOSS1', -50, -100), extra = makeLeg('LOSS2', -200, -150);
  const proposal: ClosePairProposal = { winner, loser: first, losers: [first, extra], profitUsd: 900, lossUsd: 500,
    netProfitUsd: 400, proceedsUsd: 3550, targetProfitUsd: 60, surplusUsd: 340,
    annualGrowthRate: 0.05, targetAsOf: Date.parse('2026-11-14T00:00:00Z'), coveredShortfallUsd: 540, excessProfitUsd: 880 };
  const prompt = buildClosePairReviewPrompt([proposal], 'he');
  const payload = JSON.parse(prompt.slice(prompt.indexOf('\n\n{') + 2));
  expect(payload.pairs[0].legs.map((leg: { symbol: string }) => leg.symbol)).toEqual(['WIN', 'LOSS1', 'LOSS2']);
  expect(payload.pairs[0].combinedRealizedProfitUsd).toBe(-150);
  expect(payload.pairs[0].combinedUnrealizedProfitUsd).toBe(550);
  expect(payload.pairs[0].combinedProfitUsd).toBe(400);
});
