import { describe, expect, it } from 'vitest';
import common from '@/locales/es/common.json';
import { createI18n } from '../i18n/create-i18n';
import { ApiError } from './api-error';
import { apiErrorMessage } from './api-error-message';

describe('apiErrorMessage', () => {
  const i18n = createI18n();

  it('translates a known error code to Spanish, ignoring the server message', () => {
    const error = new ApiError({ status: 403, code: 'NOT_A_MEMBER', message: 'Not a member' });
    expect(apiErrorMessage(i18n, error)).toBe(common.errors.codes.NOT_A_MEMBER);
  });

  it('falls back to the generic Spanish message for an unknown code', () => {
    const error = new ApiError({ status: 500, code: 'SOMETHING_NEW', message: 'English text' });
    expect(apiErrorMessage(i18n, error)).toBe(common.errors.generic);
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(apiErrorMessage(i18n, new Error('boom'))).toBe(common.errors.generic);
  });
});
