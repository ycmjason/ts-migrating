import { globSync, statSync } from 'node:fs';
import path from 'node:path';
import { isCheckableSourceFile } from '../engine/isCheckableSourceFile.ts';

const isDirectory = (p: string): boolean =>
  statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;

/**
 * Expand files, directories and globs into absolute TypeScript/JavaScript file
 * paths (see {@link isCheckableSourceFile}), skipping `node_modules`. A
 * directory means every file below it.
 */
export const expandFilePaths = (paths: string[]): string[] => {
  const patterns = paths.map(p => (isDirectory(p) ? path.join(p, '**/*') : p));
  const files = globSync(patterns, {
    // prunes whole `node_modules` directories rather than filtering their files
    exclude: (entry: string | { name: string }) =>
      (typeof entry === 'string' ? entry : entry.name).split(/[\\/]/).includes('node_modules'),
  })
    .filter(isCheckableSourceFile)
    .map(file => path.resolve(file));
  return [...new Set(files)];
};
