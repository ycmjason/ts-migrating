import { readFileSync } from 'node:fs';

/**
 * This package's package.json. Read at runtime rather than imported, so the
 * emitted `dist/` doesn't need its own copy (`src/` and `dist/` sit at the same
 * depth below the package root).
 */
export const packageJson: { name: string; version: string } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
