import 'server-only';
import nodemailer from 'nodemailer';
import { getAuthPublicOptions } from './better-auth-config';

export class AuthEmailUnavailable extends Error {
  constructor() { super('Email delivery is unavailable'); this.name = 'AuthEmailUnavailable'; }
}

export function requireAuthEmailConfiguration(): void {
  if (!getAuthPublicOptions().emailDeliveryConfigured) throw new AuthEmailUnavailable();
}

/** Provider-agnostic SMTP. Neither mail URLs nor credentials are logged. */
export async function sendAuthEmail(to: string, url: string, purpose: 'verify' | 'reset'): Promise<void> {
  requireAuthEmailConfiguration();
  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AuthEmailUnavailable();
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!, port, secure, requireTLS: !secure,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    tls: { rejectUnauthorized: true }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM!, to,
      subject: purpose === 'verify' ? 'LiveStocks — אימות כתובת האימייל' : 'LiveStocks — איפוס סיסמה',
      text: purpose === 'verify'
        ? `כדי לאמת את כתובת האימייל שלך ב-LiveStocks, פתחו את הקישור:\n${url}\nאם לא ביקשתם להירשם, אפשר להתעלם מהודעה זו.`
        : `כדי לבחור סיסמה חדשה ל-LiveStocks, פתחו את הקישור:\n${url}\nאם לא ביקשתם איפוס סיסמה, אפשר להתעלם מהודעה זו.`,
    });
  } catch { throw new AuthEmailUnavailable(); }
  finally { transport.close(); }
}
