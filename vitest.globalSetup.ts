import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Build the package once before the whole test run.
 *
 * Tests that exercise the plugin load it from `dist/` (via the self-linked
 * `ts-migrating` dependency), so a build must exist. Running this in vitest's
 * `globalSetup` (once, in the main process) rather than a per-file `beforeAll`
 * avoids parallel workers racing to delete and rebuild the shared `dist/`
 * directory at the same time.
 */
export default (): void => {
  rmSync(join(process.cwd(), 'dist'), { recursive: true, force: true });
  execSync('pnpm build', { stdio: 'ignore' });
};
