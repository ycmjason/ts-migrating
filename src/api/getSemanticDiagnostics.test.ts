import { rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe } from 'node:test';
import ts from 'typescript/lib/tsserverlibrary';
import { afterAll, expect, it } from 'vitest';
import { getSemanticDiagnosticsForFile } from './getSemanticDiagnostics';
import { isPluginDiagnostic } from './isPluginDiagnostic';

const getTmpDir = (() => {
  const TMP_DIR = join(tmpdir(), 'ts-migrating-test');
  let i = 0;
  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  return () => join(TMP_DIR, (i++).toString());
})();

// `erasableSyntaxOnly` was introduced in TypeScript 5.8. Tests that depend on it
// for producing a diagnostic must be skipped on older TS versions in the matrix.
const supportsErasableSyntaxOnly = (() => {
  const [major, minor] = ts.version.split('.').map(Number) as [number, number];
  return major > 5 || (major === 5 && minor >= 8);
})();
const itIfErasableSyntaxOnly = it.skipIf(!supportsErasableSyntaxOnly);

const setupTmpDir = async (json: Record<string, string>): Promise<string> => {
  const tmpDir = getTmpDir();
  for (const [relativePath, content] of Object.entries(json)) {
    const fullPath = join(tmpDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }

  return tmpDir;
};

describe('@ts-migrating directive', () => {
  itIfErasableSyntaxOnly(
    'should mark enum line as error without the @ts-migrating directive',
    async () => {
      const tmpDir = await setupTmpDir({
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
        './src/index.ts': `enum FRUITS {
  APPLE,
  BANANA,
  KIWI,
}
`,
      });

      const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
      expect(diagnostics).toHaveLength(1);
      // biome-ignore lint/style/noNonNullAssertion: checked in previous assertion
      const diagnostic = diagnostics[0]!;
      expect(isPluginDiagnostic(diagnostic)).toBe(true);
      expect(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n', 2),
      ).toMatchInlineSnapshot(`
      "
          [ts-migrating]
            This syntax is not allowed when 'erasableSyntaxOnly' is enabled."
    `);
    },
  );

  itIfErasableSyntaxOnly('should allow enum if marked with @ts-migrate', async () => {
    const tmpDir = await setupTmpDir({
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
      './src/index.ts': `// @ts-migrating
enum FRUITS {
  APPLE,
  BANANA,
  KIWI,
}
`,
    });

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
    expect(diagnostics).toHaveLength(0);
  });
});

itIfErasableSyntaxOnly('should report unused @ts-migrating', async () => {
  const tmpDir = await setupTmpDir({
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
    './src/index.ts': `// @ts-migrating
enum FRUITS {
  APPLE,
  BANANA,
  // @ts-migrating
  KIWI,
}
`,
  });

  const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
  expect(diagnostics).toHaveLength(1);
  // biome-ignore lint/style/noNonNullAssertion: checked in previous assertion
  const diagnostic = diagnostics[0]!;
  expect(isPluginDiagnostic(diagnostic)).toBe(true);
  expect(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).toMatchInlineSnapshot(`
    "[ts-migrating]
      Unused '@ts-migrating' directive."
  `);
});

describe('ignoring files', () => {
  it('should ignore ts files without any tsconfig that includes them', async () => {
    const tmpDir = await setupTmpDir({
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
        include: ['.'],
        exclude: [
          'node_modules',
          'dist',
          // excluding `ignored` directory!!!
          'ignored',
        ],
      }),
      './src/index.ts': `// @ts-migrating
enum FRUITS {
  APPLE,
  BANANA,
  // @ts-migrating
  KIWI,
}
`,
      './ignored/index.ts': 'laksdjflkj oiwejflaskdjf',
    });

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'ignored/index.ts'));
    expect(diagnostics).toHaveLength(0);
  });

  it('should ignore projects without `ts-migrating` plugin', async () => {
    const tmpDir = await setupTmpDir({
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
            // no plugin!
          ],
          skipLibCheck: true,
        },
        include: ['.'],
        exclude: [
          'node_modules',
          'dist',
          // excluding `ignored` directory!!!
          'ignored',
        ],
      }),
      './src/index.ts': `// @ts-migrating
enum FRUITS {
  APPLE,
  BANANA,
  // @ts-migrating
  KIWI,
}
`,
    });

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
    expect(diagnostics).toHaveLength(0);
  });

  itIfErasableSyntaxOnly('should ignore comments below', async () => {
    const tmpDir = await setupTmpDir({
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
      './src/index.ts': `// @ts-migrating
// whatever here
enum FRUITS {
  APPLE,
  BANANA,
  KIWI,
}
`,
    });

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
    expect(diagnostics).toHaveLength(0);
  });

  it('should handle @ts-migrating directive on last function parameter (issue #8)', async () => {
    const tmpDir = await setupTmpDir({
      './tsconfig.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          outDir: './dist',
          rootDir: './src',
          strict: false,
          noImplicitAny: false,
          esModuleInterop: true,
          forceConsistentCasingInFileNames: true,
          plugins: [
            {
              name: 'ts-migrating',
              compilerOptions: {
                noImplicitAny: true,
              },
            },
          ],
          skipLibCheck: true,
        },
        include: ['src'],
        exclude: ['node_modules', 'dist'],
      }),
      './src/index.ts': `function foo(
  a: string,
  // @ts-migrating
  b
) {
  return a + b;
}
`,
    });

    const diagnostics = getSemanticDiagnosticsForFile(join(tmpDir, 'src/index.ts'));
    expect(diagnostics).toHaveLength(0);
  });
});
