// The two test tenants of the local run (issue #97). Shared by `setup:tenants`, `wipe:dev-data` and
// `smoke:local`. Emails use example.com, which never receives mail: the accounts are created with a
// password and are already confirmed, so Supabase sends no email for them.
export interface DevTenant {
  readonly key: 'a' | 'b';
  readonly name: string;
  readonly slug: string;
  readonly preset: 'minimarket' | 'farmacia';
  readonly ownerEmail: string;
}

export const DEV_TENANTS: readonly DevTenant[] = [
  {
    key: 'a',
    name: 'Dev Minimarket A',
    slug: 'dev-minimarket-a',
    preset: 'minimarket',
    ownerEmail: 'owner.a@example.com',
  },
  {
    key: 'b',
    name: 'Dev Farmacia B',
    slug: 'dev-farmacia-b',
    preset: 'farmacia',
    ownerEmail: 'owner.b@example.com',
  },
];

export const tenantByKey = (key: DevTenant['key']): DevTenant => {
  const tenant = DEV_TENANTS.find((entry) => entry.key === key);
  if (!tenant) throw new Error(`unknown dev tenant ${key}`);
  return tenant;
};
