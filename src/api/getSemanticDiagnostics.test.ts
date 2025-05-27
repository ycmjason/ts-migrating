import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe } from 'node:test';
import { afterAll, expect, it } from 'vitest';
import { DIRECTIVE } from '../plugin/constants/DIRECTIVE';
import { getSemanticDiagnosticsForFile } from './getSemanticDiagnostics';
import { isPluginDiagnostic } from './isPluginDiagnostic';

const writeJsonFsTree = (json: Record<string, string>, cwd: string) => {
  for (const [relativePath, content] of Object.entries(json)) {
    const fullPath = join(cwd, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
  }
};

const getTmpDir = (() => {
  const TMP_DIR = join(tmpdir(), 'ts-migrating-test');
  let i = 0;
  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true });
  });

  return () => join(TMP_DIR, (i++).toString());
})();

describe('erasableSyntaxOnly', () => {
  it('Using enum without directive should result in error', () => {
    const tmpDir = getTmpDir();
    const indexTs = `enum FRUITS {
  APPLE,
  BANANA,
  KIWI,
}
`;
    writeJsonFsTree(
      {
        './tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            outDir: './dist',
            rootDir: './src',
            strict: false,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,
            plugins: [
              {
                // ts will look up from the node_modules that the ts server is running from. e.g. ../../node_modules/ts-migrating
                // this is why we add `ts-migrating` as dev dependency of itself.
                name: 'ts-migrating',
                compilerOptions: {
                  erasableSyntaxOnly: true,
                },
              },
            ],
            skipLibCheck: true,
          },
          include: ['src'],
          exclude: ['node_modules', 'dist'],
        }),
        './src/index.ts': indexTs,
      },
      tmpDir,
    );

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
    expect(diagnostics).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: checked in previous assertion
    const diagnostic = diagnostics[0]!;
    expect(isPluginDiagnostic(diagnostic)).toBe(true);
    expect(diagnostic).toMatchObject({
      length: 'FRUITS'.length,
      start: indexTs.indexOf('F'),
    });
  });

  it('erasableSyntaxOnly', () => {
    const tmpDir = getTmpDir();
    const indexTs = `// @ts-migrating
enum FRUITS {
  APPLE,
  BANANA,
  KIWI,
}
`;
    writeJsonFsTree(
      {
        './tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'commonjs',
            outDir: './dist',
            rootDir: './src',
            strict: false,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,
            plugins: [
              {
                // ts will look up from the node_modules that the ts server is running from. e.g. ../../node_modules/ts-migrating
                // this is why we add `ts-migrating` as dev dependency of itself.
                name: 'ts-migrating',
                compilerOptions: {
                  erasableSyntaxOnly: true,
                },
              },
            ],
            skipLibCheck: true,
          },
          include: ['src'],
          exclude: ['node_modules', 'dist'],
        }),
        './src/index.ts': indexTs,
      },
      tmpDir,
    );

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
    expect(diagnostics).toHaveLength(0);
  });
});

it('should report unused @ts-migrating', () => {
  const tmpDir = getTmpDir();
  const indexTs = `// @ts-migrating
enum FRUITS {
  APPLE,
  BANANA,
  // @ts-migrating
  KIWI,
}
`;
  writeJsonFsTree(
    {
      './tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          outDir: './dist',
          rootDir: './src',
          strict: false,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          plugins: [
            {
              // ts will look up from the node_modules that the ts server is running from. e.g. ../../node_modules/ts-migrating
              // this is why we add `ts-migrating` as dev dependency of itself.
              name: 'ts-migrating',
              compilerOptions: {
                erasableSyntaxOnly: true,
              },
            },
          ],
          skipLibCheck: true,
        },
        include: ['src'],
        exclude: ['node_modules', 'dist'],
      }),
      './src/index.ts': indexTs,
    },
    tmpDir,
  );

  const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
  expect(diagnostics).toHaveLength(1);
  // biome-ignore lint/style/noNonNullAssertion: checked in previous assertion
  const diagnostic = diagnostics[0]!;
  expect(isPluginDiagnostic(diagnostic)).toBe(true);
  expect(diagnostic).toMatchObject({
    length: DIRECTIVE.length,
    start: indexTs.lastIndexOf('@'),
  });
});
