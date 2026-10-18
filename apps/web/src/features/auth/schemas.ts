import { z } from 'zod';

// Form schemas for the Supabase auth flows (login and password are not API endpoints, so they are
// not in @mini-market/contracts). Messages are i18n keys, translated by <FormMessage>.
export const MIN_PASSWORD_LENGTH = 8;

const emailField = z
  .string()
  .trim()
  .min(1, 'auth:validation.emailRequired')
  .pipe(z.email('auth:validation.emailInvalid'));

const newPasswordField = z.string().min(MIN_PASSWORD_LENGTH, 'auth:validation.passwordTooShort');

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'auth:validation.passwordRequired'),
});

export const forgotPasswordSchema = z.object({ email: emailField });

export const setPasswordSchema = z
  .object({ password: newPasswordField, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'auth:validation.passwordsDontMatch',
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
