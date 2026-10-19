import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildEnvFiles, derivePassword, SecretsError, WEB_ENV_KEYS } from './local-env';
import { expandHome, runSetupEnv } from './setup-env';

// Fake values, never real credentials. The sentinel strings let the tests grep any output.
const REF = 'abcdefghijklmnopqrst';
const SERVICE_KEY = 'sentinel-service-role-key';
const DB_PASSWORD = 'sentinel-db-password';
const ANON_KEY = 'sentinel-anon-key';
const secrets = {
  SUPABASE_PROJECT_REF: REF,
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SUPABASE_DB_PASSWORD: DB_PASSWORD,
  SUPABASE_ORG_ID: 'sentinel-org',
};

describe('buildEnvFiles', () => {
  it('gives the web file only the URL, the anon key and the port', () => {
    // AC-2
    const built = buildEnvFiles({ secrets });
    const web = parseEnv(built.webEnv);
    expect(Object.keys(web).sort()).toEqual([...WEB_ENV_KEYS].sort());
    expect(built.webEnv).not.toContain(SERVICE_KEY);
    expect(built.webEnv).not.toContain(DB_PASSWORD);
    expect(built.webEnv).not.toContain('sentinel-org');
    expect(web['VITE_SUPABASE_ANON_KEY']).toBe(ANON_KEY);
    expect(web['VITE_API_URL']).toBe('http://localhost:3001');
  });

  it('maps the API variables the config validation expects', () => {
    // AC-2
    const api = parseEnv(buildEnvFiles({ secrets }).apiEnv);
    expect(api['SUPABASE_URL']).toBe(`https://${REF}.supabase.co`);
    expect(api['SUPABASE_JWT_ISSUER']).toBe(`https://${REF}.supabase.co/auth/v1`);
    expect(api['SUPABASE_SERVICE_ROLE_KEY']).toBe(SERVICE_KEY);
    expect(api['WEB_ORIGIN']).toBe('http://localhost:5173');
    expect(api['API_PORT']).toBe('3001');
    expect(api['SUPABASE_ORG_ID']).toBeUndefined();
  });

  it('connects the API as app_user through the transaction pooler and migrations as the owner', () => {
    // AC-3
    const api = parseEnv(buildEnvFiles({ secrets }).apiEnv);
    const app = new URL(api['DATABASE_URL'] as string);
    expect(app.username).toBe(`app_user.${REF}`);
    expect(app.port).toBe('6543');
    expect(decodeURIComponent(app.password)).toBe(derivePassword(DB_PASSWORD, 'app_user'));
    expect(app.password).not.toBe(DB_PASSWORD);
    const owner = new URL(api['MIGRATION_DATABASE_URL'] as string);
    expect(owner.username).toBe(`postgres.${REF}`);
    expect(owner.port).toBe('5432');
    expect(owner.password).toBe(DB_PASSWORD);
  });

  it('url-encodes passwords that contain reserved characters', () => {
    const api = parseEnv(
      buildEnvFiles({ secrets: { ...secrets, SUPABASE_DB_PASSWORD: 'p@ss/w:rd#1' } }).apiEnv,
    );
    const owner = new URL(api['MIGRATION_DATABASE_URL'] as string);
    expect(decodeURIComponent(owner.password)).toBe('p@ss/w:rd#1');
    expect(owner.hostname).toMatch(/pooler\.supabase\.com$/);
  });

  it('derives the same app_user and test passwords in every checkout, and different ones per secret', () => {
    const first = buildEnvFiles({ secrets });
    expect(buildEnvFiles({ secrets }).apiEnv).toBe(first.apiEnv);
    const other = buildEnvFiles({ secrets: { ...secrets, SUPABASE_DB_PASSWORD: 'another' } });
    const appPassword = (env: string) => new URL(parseEnv(env)['DATABASE_URL'] as string).password;
    expect(appPassword(other.apiEnv)).not.toBe(appPassword(first.apiEnv));
    const smoke = parseEnv(first.apiEnv)['SMOKE_OWNER_PASSWORD'];
    expect(smoke).toBe(derivePassword(SERVICE_KEY, 'dev-owner'));
    expect(smoke).not.toBe(derivePassword(SERVICE_KEY, 'app_user'));
  });

  it('honours the port overrides and keeps CORS and the web URL consistent', () => {
    const built = buildEnvFiles({ secrets, apiPort: '3110', webPort: '5210' });
    expect(parseEnv(built.apiEnv)['WEB_ORIGIN']).toBe('http://localhost:5210');
    expect(parseEnv(built.webEnv)['VITE_API_URL']).toBe('http://localhost:3110');
  });

  it('names each missing variable and never a value', () => {
    // AC-2
    const { SUPABASE_SERVICE_ROLE_KEY: _drop, ...incomplete } = secrets;
    expect(() => buildEnvFiles({ secrets: incomplete })).toThrow(
      /does not define: SUPABASE_SERVICE_ROLE_KEY$/,
    );
  });

  it('rejects a URL that does not belong to the project ref, without echoing it', () => {
    let message = '';
    try {
      buildEnvFiles({ secrets: { ...secrets, SUPABASE_URL: 'https://other-project.supabase.co' } });
    } catch (error) {
      expect(error).toBeInstanceOf(SecretsError);
      message = (error as Error).message;
    }
    expect(message).toMatch(/SUPABASE_URL must be/);
    expect(message).not.toContain('other-project');
  });

  it('rejects an anon key that is the service role key, so the web file cannot leak it', () => {
    // AC-2
    expect(() =>
      buildEnvFiles({ secrets: { ...secrets, SUPABASE_ANON_KEY: SERVICE_KEY } }),
    ).toThrow(/must not be the same value/);
  });

  it('rejects a value with a line break instead of writing a broken file', () => {
    expect(() =>
      buildEnvFiles({ secrets: { ...secrets, SUPABASE_SERVICE_ROLE_KEY: 'a\nb' } }),
    ).toThrow(/line break/);
  });
});

describe('runSetupEnv', () => {
  let dir: string;
  let lines: string[];
  let errors: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-env-'));
    lines = [];
    errors = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = (secretsFile: string | undefined) =>
    runSetupEnv({
      secretsFile,
      homeDir: dir,
      apiEnvPath: path.join(dir, 'api', '.env'),
      webEnvPath: path.join(dir, 'web', '.env'),
      log: (line) => lines.push(line),
      logError: (line) => errors.push(line),
    });

  it('exits with a clear error and writes nothing when the secrets file is missing', () => {
    // AC-2
    expect(run(path.join(dir, 'missing.env'))).toBe(1);
    expect(errors.join('\n')).toMatch(/Secrets file not found/);
    expect(fs.existsSync(path.join(dir, 'api', '.env'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'web', '.env'))).toBe(false);
  });

  it('reads the default location under the home directory', () => {
    fs.mkdirSync(path.join(dir, '.mini-market'));
    fs.writeFileSync(
      path.join(dir, '.mini-market', 'supabase-dev.env'),
      Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    expect(run(undefined)).toBe(0);
  });

  it('writes both files, keeps the service role key out of the web file and prints no value', () => {
    // AC-2
    const file = path.join(dir, 'secrets.env');
    fs.writeFileSync(
      file,
      Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    );
    expect(run(file)).toBe(0);
    const api = fs.readFileSync(path.join(dir, 'api', '.env'), 'utf8');
    const web = fs.readFileSync(path.join(dir, 'web', '.env'), 'utf8');
    expect(api).toContain(SERVICE_KEY);
    expect(web).toContain(ANON_KEY);
    expect(web).not.toContain(SERVICE_KEY);
    expect(web).not.toContain(DB_PASSWORD);
    const printed = [...lines, ...errors].join('\n');
    for (const value of [SERVICE_KEY, DB_PASSWORD, ANON_KEY, REF]) {
      expect(printed).not.toContain(value);
    }
    expect(printed).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('reports an incomplete file by variable name only', () => {
    const file = path.join(dir, 'secrets.env');
    fs.writeFileSync(file, `SUPABASE_URL=https://${REF}.supabase.co\n`);
    expect(run(file)).toBe(1);
    expect(errors.join('\n')).toMatch(/SUPABASE_ANON_KEY/);
    expect(errors.join('\n')).not.toContain(REF);
  });
});

describe('expandHome', () => {
  it('expands a leading tilde only', () => {
    expect(expandHome('~/a/b.env', '/home/x')).toBe(path.join('/home/x', '/a/b.env'));
    expect(expandHome('/etc/a~b.env', '/home/x')).toBe('/etc/a~b.env');
  });
});
