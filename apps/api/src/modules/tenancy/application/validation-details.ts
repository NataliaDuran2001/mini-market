import type { ZodError } from 'zod';

/** Same `details` shape as the global exception filter: `{ issues: [{ path, message }] }`. */
export function validationDetails(error: ZodError): {
  issues: { path: string; message: string }[];
} {
  return {
    issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  };
}
