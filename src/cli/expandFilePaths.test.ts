import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTmpDirFactory } from '../testUtils/setupTmpDir.ts';
import { expandFilePaths } from './expandFilePaths.ts';

const setupTmpDir = createTmpDirFactory('expand');

describe('expandFilePaths', () => {
  const dir = setupTmpDir({
    'src/a.ts': '',
    'src/b.tsx': '',
    'src/c.js': '',
    'src/e.json': '',
    'src/nested/d.ts': '',
    'node_modules/pkg/index.ts': '',
    'src/node_modules/pkg/index.ts': '',
  });
  const relative = (files: string[]) => files.map(file => path.relative(dir, file)).sort();

  it('expands directories, keeps TS/JS files and skips node_modules', () => {
    expect(relative(expandFilePaths([dir]))).toEqual([
      'src/a.ts',
      'src/b.tsx',
      'src/c.js',
      'src/nested/d.ts',
    ]);
  });

  it('accepts files and globs, without duplicates', () => {
    expect(
      relative(expandFilePaths([path.join(dir, 'src/a.ts'), path.join(dir, 'src/**/*.{ts,js}')])),
    ).toEqual(['src/a.ts', 'src/c.js', 'src/nested/d.ts']);
  });
});
