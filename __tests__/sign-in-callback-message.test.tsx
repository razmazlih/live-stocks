import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignIn } from '@/components/auth/sign-in';

describe('friendly callback failures', () => {
  it('shows verification guidance in both languages and keeps the login destination safe', () => {
    render(<SignIn configured callbackFailed returnTo="/\\attacker.example" />);
    expect(screen.getByRole('alert')).toHaveTextContent('לבקש קישור אימות חדש');
    expect(screen.getByRole('button', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'יצירת חשבון' })).toHaveAttribute('href', '/sign-up?lang=he&returnTo=%2F');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('alert')).toHaveTextContent('request a new verification link');
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('main')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/sign-up?lang=en&returnTo=%2F');
  });
});
