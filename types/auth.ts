export type AuthPublicOptions = {
  configured: boolean;
  googleEnabled: boolean;
  emailDeliveryConfigured: boolean;
};

export type AuthScreenMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' | 'verify-email';
