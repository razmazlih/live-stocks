import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignIn } from '@/components/auth/sign-in';

describe('friendly callback failures', () => {
  it('shows verification guidance in both languages and keeps the login destination safe', () => {
    render(<SignIn configured callbackFailed returnTo="/\\attacker.example" />);
    expect(screen.getByRole('alert')).toHaveTextContent('יש לבדוק את הדוא״ל ולאמת את הכתובת');
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute('href', '/auth/login?returnTo=%2F&ui_locales=he');
    expect(screen.getByRole('link', { name: 'יצירת חשבון' })).toHaveAttribute('href', '/auth/login?returnTo=%2F&ui_locales=he&screen_hint=signup');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('alert')).toHaveTextContent('check your email and verify your address');
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login?returnTo=%2F&ui_locales=en');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/auth/login?returnTo=%2F&ui_locales=en&screen_hint=signup');
  });
});
