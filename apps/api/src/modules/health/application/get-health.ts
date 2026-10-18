export interface HealthStatus {
  readonly status: 'ok';
  readonly version: string;
}

export type GetHealth = () => HealthStatus;

/** Injection token of the use case; `health.module.ts` binds it. */
export const GET_HEALTH = Symbol('GET_HEALTH');

export function getHealth(deps: { readonly version: string }): HealthStatus {
  return { status: 'ok', version: deps.version };
}
