import { rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { getTsMigratingReportForFile } from './getTsMigratingReportForFile';

const getTmpDir = (() => {
  const TMP_DIR = join(tmpdir(), 'ts-migrating-report-test');
  let i = 0;
  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  return () => join(TMP_DIR, (i++).toString());
})();

const setupTmpDir = async (files: Record<string, string>): Promise<string> => {
  const tmpDir = getTmpDir();
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(tmpDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
  return tmpDir;
};

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'commonjs',
    strict: false,
    noImplicitAny: false,
    skipLibCheck: true,
    plugins: [{ name: 'ts-migrating', compilerOptions: { noImplicitAny: true } }],
  },
  include: ['src'],
  exclude: ['node_modules', 'dist'],
});

it('reports unmarked errors, marked debt and their codes', async () => {
  const tmpDir = await setupTmpDir({
    './tsconfig.json': tsconfig,
    // `foo`'s param is an unmarked noImplicitAny error; `bar`'s is the same error
    // but suppressed by a `@ts-migrating` directive (acknowledged debt).
    './src/index.ts': `function foo(a) {
  return a;
}

// @ts-migrating
function bar(b) {
  return b;
}
`,
  });

  const report = getTsMigratingReportForFile(join(tmpDir, 'src/index.ts'));

  const unmarked = report.filter(
    e => e.origin === 'ts-migrating' && !e.markedWithTsMigratingDirective,
  );
  const marked = report.filter(
    e => e.origin === 'ts-migrating' && e.markedWithTsMigratingDirective,
  );

  expect(unmarked).toHaveLength(1);
  expect(marked).toHaveLength(1);
  // both are the same implicit-any error code (7006), including the marked one,
  // which the plain language service hides.
  expect(unmarked[0]?.diagnostic.code).toBe(7006);
  expect(marked[0]?.diagnostic.code).toBe(7006);
  // a clean baseline tsconfig (noImplicitAny: false) introduces no baseline errors
  expect(report.filter(e => e.origin === 'baseline')).toHaveLength(0);
});

it('returns [] for a project without the ts-migrating plugin', async () => {
  const tmpDir = await setupTmpDir({
    './tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        noImplicitAny: true,
        skipLibCheck: true,
      },
      include: ['src'],
    }),
    './src/index.ts': 'function foo(a) {\n  return a;\n}\n',
  });

  expect(getTsMigratingReportForFile(join(tmpDir, 'src/index.ts'))).toEqual([]);
});
