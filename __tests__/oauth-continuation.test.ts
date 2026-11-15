import { describe, it, expect } from 'vitest';
import { signedOAuthQuery, validConsentDestination } from '@/lib/auth/oauth-continuation';
describe('OAuth continuation transport', () => {
  it('retains signed repeated fields, signature and metadata while excluding page controls', () => {
    const value = signedOAuthQuery('scope=openid&resource=a&resource=b&sig=s&ba_param=scope&ba_param=resource&lang=en&returnTo=https://evil.test');
    expect(new URLSearchParams(value!).getAll('resource')).toEqual(['a', 'b']);
    expect(value).not.toContain('lang'); expect(value).not.toContain('returnTo'); expect(signedOAuthQuery('client_id=spoof')).toBeNull();
  });
  it.each(['javascript:alert(1)', 'https://chatgpt.com.evil.test/callback?code=a', 'https://chatgpt.com/other?code=a', 'https://u:p@chatgpt.com/callback?code=a', '//evil.test/callback'])('refuses unsafe destination %s', value => {
    expect(validConsentDestination(value, 'https://chatgpt.com/callback', 'https://site.test')).toBeNull();
  });
  it('preserves registered callback query and accepts same-site provider continuation', () => {
    expect(validConsentDestination('https://chatgpt.com/callback?registered=changed', 'https://chatgpt.com/callback?registered=one', 'https://site.test')).toBeNull();
    expect(validConsentDestination('/oauth/consent?sig=s', 'https://chatgpt.com/callback', 'https://site.test')).toBe('https://site.test/oauth/consent?sig=s');
  });
});
