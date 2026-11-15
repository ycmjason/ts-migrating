import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIST = join(import.meta.dirname, '../dist');

/**
 * Runs in a real Node.js process (not vitest's resolver), because the failure
 * this guards against is Node's ESM resolver rejecting a specifier in the
 * built `.mjs` output.
 */
const runNode = (...args: string[]): string =>
  execFileSync(process.execPath, args, { encoding: 'utf8', stdio: 'pipe' });

const importInNode = (file: string): string =>
  runNode(
    '--input-type=module',
    '--eval',
    `const m = await import(${JSON.stringify(join(DIST, file))}); console.log(Object.keys(m).join(','));`,
  );

describe('built ESM entry points load in Node.js', () => {
  it('ts-migrating/api', () => {
    const exported = importInNode('api/mod.mjs');
    expect(exported).toContain('getTsMigratingReportForFile');
    expect(exported).toContain('getSemanticDiagnosticsForFile');
  });

  it('ts-migrating (plugin)', () => {
    expect(() => importInNode('plugin/mod.mjs')).not.toThrow();
  });

  it('ts-migrating/cli', () => {
    expect(runNode(join(DIST, 'cli/main.mjs'), '--help')).toContain('ts-migrating check');
  });
});
