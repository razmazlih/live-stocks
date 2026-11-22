import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SignIn } from '@/components/auth/sign-in';

describe('friendly callback failures', () => {
  it('welcomes Hebrew and English review visitors without authentication warnings', () => {
    render(<SignIn configured reviewEnabled callbackFailed />);
    expect(screen.getByRole('heading', { name: 'תיק ההדגמה של LiveStocks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'פתיחת תיק ההדגמה' })).toHaveAttribute('href', '/');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'LiveStocks sample portfolio' })).toBeInTheDocument();
    expect(screen.getByText(/Portfolio changes are saved in this tab/)).toBeInTheDocument();
    expect(screen.queryByText(/sign-in is currently unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('shows verification guidance in both languages and keeps the login destination safe', () => {
    render(<SignIn passwordEnabled configured callbackFailed returnTo="/\\attacker.example" />);
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
