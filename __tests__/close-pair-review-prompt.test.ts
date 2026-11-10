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
});
