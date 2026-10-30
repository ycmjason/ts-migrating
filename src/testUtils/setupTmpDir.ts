import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll } from 'vitest';

/**
 * Returns a function that writes `files` (relative path → content) into a fresh
 * temp directory and returns its path. All directories are removed after the
 * test file finishes.
 */
export const createTmpDirFactory = (name: string) => {
  const root = join(tmpdir(), `ts-migrating-test-${name}-${process.pid}`);
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  let counter = 0;

  return (files: Record<string, string>): string => {
    const dir = join(root, (counter++).toString());
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(dir, relativePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }
    return dir;
  };
};

/** A tsconfig.json enabling ts-migrating with `targetCompilerOptions`. */
export const tsconfigWith = (
  compilerOptions: Record<string, unknown>,
  targetCompilerOptions: Record<string, unknown>,
  rest: Record<string, unknown> = {},
): string =>
  JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      strict: false,
      skipLibCheck: true,
      ...compilerOptions,
      plugins: [{ name: 'ts-migrating', compilerOptions: targetCompilerOptions }],
    },
    include: ['src'],
    ...rest,
  });
