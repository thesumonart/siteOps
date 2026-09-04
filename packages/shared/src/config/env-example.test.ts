import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `.env.example` is the deployment checklist. Every variable the services read
 * has to appear in it, or the first person to deploy discovers the omission as
 * a process that refuses to start — at the least convenient possible moment.
 *
 * Keeping it correct by hand does not work: a variable gets added to a schema
 * during a feature, and the example file is updated later, or never. This test
 * reads the schemas as text and fails the build instead.
 *
 * Text, not imports, because these schemas live in the apps and this package is
 * below them — importing upward would invert the dependency graph to check a
 * documentation file. The tradeoff is that a variable read some other way than
 * a schema key would go unnoticed, which is why `no-restricted-properties`
 * forbids reading `process.env` outside the env modules in the first place.
 */

const repoRoot = new URL('../../../../', import.meta.url);

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, repoRoot)), 'utf8');
}

/** Schema keys, as declared at the top level of a Zod object. */
function schemaKeys(source: string): string[] {
  return [...source.matchAll(/^ {4}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] ?? '');
}

/** Documented names, whether or not the line is commented out. */
function documentedKeys(source: string): Set<string> {
  return new Set([...source.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1] ?? ''));
}

const example = documentedKeys(read('.env.example'));

describe('.env.example', () => {
  it.each([
    ['api', 'apps/api/src/config/env.schema.ts'],
    ['worker', 'apps/worker/src/config/env.schema.ts'],
  ])('documents every variable the %s reads', (_service, schemaPath) => {
    const missing = schemaKeys(read(schemaPath)).filter((key) => !example.has(key));

    expect(missing).toEqual([]);
  });

  it('documents the browser-visible variables the web app reads', () => {
    // Inlined at build time, so a missing one fails the build rather than the
    // boot — but it is still a deployment input and belongs on the checklist.
    const source = read('apps/web/src/lib/env.ts');
    const keys = [...source.matchAll(/(NEXT_PUBLIC_[A-Z0-9_]+):/g)].map((match) => match[1] ?? '');

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !example.has(key))).toEqual([]);
  });

  it('never carries a real secret', () => {
    const source = read('.env.example');

    // A committed example file is public, so the shapes that would matter if
    // one were ever pasted in by accident are worth catching here.
    //
    // A candidate is judged by its alphabet rather than its length: a real key
    // is high-entropy, while `re_xxxxxxxxxxxxxxxxxxxx` is one character
    // repeated. Matching on length alone flags the placeholder that is supposed
    // to be there, and a check that cries wolf gets deleted.
    for (const match of source.matchAll(/re_([A-Za-z0-9]{20,})/g)) {
      const secret = match[1] ?? '';
      expect(new Set(secret).size).toBeLessThan(4);
    }

    // An Atlas URI carrying a password.
    expect(source).not.toMatch(/mongodb\+srv:\/\/[^:\s]+:[^@\s]+@/);
    expect(source).toContain('AUTH_SECRET=replace-me');
  });
});
