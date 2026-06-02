import { describe, expect, it } from 'vitest';
import { isCheckableSourceFile } from './isCheckableSourceFile';

describe('isCheckableSourceFile', () => {
  it.each([
    'app.component.ts',
    'app.component.tsx',
    'module.mts',
    'module.cts',
    'legacy.js',
    'legacy.jsx',
    'module.mjs',
    'module.cjs',
    '/abs/path/to/File.TS',
  ])('is true for TS/JS source file %s', fileName => {
    expect(isCheckableSourceFile(fileName)).toBe(true);
  });

  it.each([
    'app.component.html',
    'styles.css',
    'data.json',
    'component.vue',
    'README.md',
    'logo.svg',
    'noextension',
    'archive.ts.bak',
  ])('is false for non-source file %s', fileName => {
    expect(isCheckableSourceFile(fileName)).toBe(false);
  });
});
