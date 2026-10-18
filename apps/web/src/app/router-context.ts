import type { GuardContext } from '@/features/auth';

/**
 * Services every route can reach through `context` (route guards, loaders). Built once by
 * `createAppServices`; tests build their own with fakes.
 */
export type RouterContext = GuardContext;
