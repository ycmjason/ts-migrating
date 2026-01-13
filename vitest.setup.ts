import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll } from 'vitest';

beforeAll(() => {
  rmSync(join(__dirname, 'dist'), { recursive: true, force: true });
  execSync('pnpm build', { stdio: 'ignore' });
});
