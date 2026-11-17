export type AuthPublicOptions = {
  configured: boolean;
  demoEnabled?: boolean;
  passwordEnabled: boolean;
  googleEnabled: boolean;
  emailDeliveryConfigured: boolean;
};

export type AuthScreenMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' | 'verify-email';
