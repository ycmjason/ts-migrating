import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTmpDirFactory, tsconfigWith } from '../testUtils/setupTmpDir.ts';
import type { TsMigratingReportEntry } from './mod.ts';
import { getTsMigratingReportForFile, getTsMigratingReportForFiles } from './mod.ts';

const setupTmpDir = createTmpDirFactory('report');

/** A compact, snapshot-friendly view of a report. */
const summarize = (entries: readonly TsMigratingReportEntry[]) =>
  entries.map(({ diagnostic, origin, markedWithTsMigratingDirective }) => ({
    origin,
    marked: markedWithTsMigratingDirective,
    code: diagnostic.code,
    line: (diagnostic.startPosition?.line ?? -1) + 1,
  }));

const erasableSyntaxOnlyTsconfig = tsconfigWith(
  { outDir: './dist', rootDir: './src', esModuleInterop: true },
  { erasableSyntaxOnly: true },
);

const noImplicitAnyTsconfig = tsconfigWith({ noImplicitAny: false }, { noImplicitAny: true });

describe('@ts-migrating directive', () => {
  it('reports an error introduced by the target config', () => {
    const dir = setupTmpDir({
      './tsconfig.json': erasableSyntaxOnlyTsconfig,
      './src/index.ts': 'enum FRUITS {\n  APPLE,\n  BANANA,\n  KIWI,\n}\n',
    });

    const report = getTsMigratingReportForFile(join(dir, 'src/index.ts'));
    expect(summarize(report)).toEqual([
      { origin: 'ts-migrating', marked: false, code: 1294, line: 1 },
    ]);
    expect(report[0]?.diagnostic.text).toBe(
      "This syntax is not allowed when 'erasableSyntaxOnly' is enabled.",
    );
  });

  it('marks the error on the line after the directive as debt', () => {
    const dir = setupTmpDir({
      './tsconfig.json': erasableSyntaxOnlyTsconfig,
      './src/index.ts': '// @ts-migrating\nenum FRUITS {\n  APPLE,\n  BANANA,\n  KIWI,\n}\n',
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual([
      { origin: 'ts-migrating', marked: true, code: 1294, line: 2 },
    ]);
  });

  it('reports an unused @ts-migrating directive', () => {
    const dir = setupTmpDir({
      './tsconfig.json': erasableSyntaxOnlyTsconfig,
      './src/index.ts':
        '// @ts-migrating\nenum FRUITS {\n  APPLE,\n  BANANA,\n  // @ts-migrating\n  KIWI,\n}\n',
    });

    const report = getTsMigratingReportForFile(join(dir, 'src/index.ts'));
    expect(summarize(report)).toEqual([
      { origin: 'ts-migrating', marked: false, code: 555, line: 5 },
      { origin: 'ts-migrating', marked: true, code: 1294, line: 2 },
    ]);
    expect(report[0]?.diagnostic.text).toBe("Unused '@ts-migrating' directive.");
    expect(report[0]?.diagnostic.startPosition).toEqual({ line: 4, character: 5 });
  });

  it('skips comment lines between the directive and the marked line', () => {
    const dir = setupTmpDir({
      './tsconfig.json': erasableSyntaxOnlyTsconfig,
      './src/index.ts': '// @ts-migrating\n// whatever here\nenum FRUITS {\n  APPLE,\n}\n',
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual([
      { origin: 'ts-migrating', marked: true, code: 1294, line: 3 },
    ]);
  });

  it('handles a directive on the last function parameter (issue #8)', () => {
    const dir = setupTmpDir({
      './tsconfig.json': noImplicitAnyTsconfig,
      './src/index.ts':
        'function foo(\n  a: string,\n  // @ts-migrating\n  b\n) {\n  return a + b;\n}\n',
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual([
      { origin: 'ts-migrating', marked: true, code: 7006, line: 4 },
    ]);
  });

  it('accepts block comments and JSX comments, but not lookalikes', () => {
    const dir = setupTmpDir({
      './tsconfig.json': tsconfigWith(
        { noImplicitAny: false, jsx: 'preserve' },
        { noImplicitAny: true },
      ),
      './src/jsx.d.ts':
        'declare namespace JSX { interface IntrinsicElements { [name: string]: any } }\ndeclare function g(callback: unknown): null;\n',
      './src/index.tsx': `/* @ts-migrating */
const a = (x) => x;
/**
 * @ts-migrating
 */
const b = (x) => x;
// @ts-migrating-abc
const c = (x) => x;
const s = '// @ts-migrating';
const d = (x) => x;
const t = \`
// @ts-migrating\`;
const e = (x) => x;
// @TS-MIGRATING
const f = (x) => x;
const j = (
  <div>
    // @ts-migrating
    {g((x) => x)}
    {/* @ts-migrating */}
    {g((x) => x)}
  </div>
);
`,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.tsx')))).toEqual([
      { origin: 'ts-migrating', marked: false, code: 7006, line: 8 },
      { origin: 'ts-migrating', marked: false, code: 7006, line: 10 },
      { origin: 'ts-migrating', marked: false, code: 7006, line: 13 },
      { origin: 'ts-migrating', marked: false, code: 7006, line: 15 },
      { origin: 'ts-migrating', marked: false, code: 7006, line: 19 },
      { origin: 'ts-migrating', marked: true, code: 7006, line: 2 },
      { origin: 'ts-migrating', marked: true, code: 7006, line: 6 },
      { origin: 'ts-migrating', marked: true, code: 7006, line: 21 },
    ]);
  });

  it('reports positions in UTF-16 code units', () => {
    const dir = setupTmpDir({
      './tsconfig.json': noImplicitAnyTsconfig,
      './src/index.ts': 'const s = "日本語🎉"; function foo(a) {}\n',
    });

    const [entry] = getTsMigratingReportForFile(join(dir, 'src/index.ts'));
    const text = 'const s = "日本語🎉"; function foo(a) {}\n';
    expect(entry?.diagnostic.pos).toBe(text.indexOf('a)'));
    expect(entry?.diagnostic.startPosition).toEqual({ line: 0, character: text.indexOf('a)') });
  });
});

describe('report', () => {
  it('reports unmarked errors, marked debt and baseline errors', () => {
    const dir = setupTmpDir({
      './tsconfig.json': noImplicitAnyTsconfig,
      // `foo`'s param is an unmarked noImplicitAny error; `bar`'s is the same error
      // but suppressed by a `@ts-migrating` directive (acknowledged debt).
      './src/index.ts': `function foo(a) {
  return a;
}

// @ts-migrating
function bar(b) {
  return b;
}

const n: number = 'not a number';
`,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual([
      { origin: 'baseline', marked: false, code: 2322, line: 10 },
      { origin: 'ts-migrating', marked: false, code: 7006, line: 1 },
      { origin: 'ts-migrating', marked: true, code: 7006, line: 6 },
    ]);
  });

  it('only reports errors the target config adds on top of the same baseline error', () => {
    const dir = setupTmpDir({
      './tsconfig.json': tsconfigWith({}, { strict: true }),
      './src/index.ts': "const f = (x) => x;\nconst n: number = 'a';\n",
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual([
      { origin: 'baseline', marked: false, code: 2322, line: 2 },
      { origin: 'ts-migrating', marked: false, code: 7006, line: 1 },
    ]);
  });
});

describe('ignoring files', () => {
  it('returns [] for files no tsconfig includes', () => {
    const dir = setupTmpDir({
      './tsconfig.json': tsconfigWith(
        {},
        { erasableSyntaxOnly: true },
        { include: ['.'], exclude: ['ignored'] },
      ),
      './src/index.ts': 'enum A { B }\n',
      './ignored/index.ts': 'laksdjflkj oiwejflaskdjf',
    });

    expect(getTsMigratingReportForFile(join(dir, 'ignored/index.ts'))).toEqual([]);
  });

  it('returns [] for a project without the ts-migrating plugin', () => {
    const dir = setupTmpDir({
      './tsconfig.json': JSON.stringify({
        compilerOptions: { noImplicitAny: true, skipLibCheck: true, plugins: [] },
        include: ['src'],
      }),
      './src/index.ts': '// @ts-migrating\nfunction foo(a) {\n  return a;\n}\n',
    });

    expect(getTsMigratingReportForFile(join(dir, 'src/index.ts'))).toEqual([]);
  });

  // https://github.com/ycmjason/ts-migrating/issues/14
  it('returns [] for non-TS/JS files such as Angular templates', () => {
    const dir = setupTmpDir({
      './tsconfig.json': tsconfigWith({}, { strict: true }),
      './src/app.component.ts': "export class AppComponent {\n  title = 'hello';\n}\n",
      './src/app.component.html':
        '<div class="title">{{ title }}</div>\n<span>{{ undefinedVariable }}</span>\n',
    });

    expect(getTsMigratingReportForFile(join(dir, 'src/app.component.html'))).toEqual([]);
  });

  it.each([
    'widget.tsx',
    'legacy.js',
    'legacy.jsx',
    'util.mts',
    'util.cts',
    'util.mjs',
    'util.cjs',
  ])('still reports target-config errors for %s', fileName => {
    const dir = setupTmpDir({
      './tsconfig.json': tsconfigWith(
        { allowJs: true, checkJs: true, jsx: 'preserve', module: 'nodenext' },
        { strict: true },
      ),
      [`./src/${fileName}`]: 'export const f = (x) => x;\n',
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src', fileName)))).toEqual([
      { origin: 'ts-migrating', marked: false, code: 7006, line: 1 },
    ]);
  });
});

describe('target compiler options', () => {
  const source = '// @ts-migrating\nconst f = (x) => x;\nconst g = (y) => y;\n';
  const expected = [
    { origin: 'ts-migrating', marked: false, code: 7006, line: 3 },
    { origin: 'ts-migrating', marked: true, code: 7006, line: 2 },
  ];

  it('reads the plugin entry from a relatively extended config', () => {
    const dir = setupTmpDir({
      './configs/base.json': tsconfigWith({}, { strict: true }),
      './tsconfig.json': JSON.stringify({ extends: './configs/base', include: ['src'] }),
      './src/index.ts': source,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual(expected);
  });

  it('reads the plugin entry from a package config', () => {
    const dir = setupTmpDir({
      './node_modules/@acme/tsconfig/package.json': JSON.stringify({ name: '@acme/tsconfig' }),
      './node_modules/@acme/tsconfig/tsconfig.json': tsconfigWith({}, { strict: true }),
      './tsconfig.json': JSON.stringify({ extends: '@acme/tsconfig', include: ['src'] }),
      './src/index.ts': source,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual(expected);
  });

  it('lets the later config of an `extends` array win', () => {
    const dir = setupTmpDir({
      './a.json': tsconfigWith({}, { noUnusedLocals: true }),
      './b.json': tsconfigWith({}, { strict: true }),
      './tsconfig.json': JSON.stringify({ extends: ['./a.json', './b.json'], include: ['src'] }),
      './src/index.ts': source,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual(expected);
  });

  it('lets the nearest config that defines `plugins` win', () => {
    const dir = setupTmpDir({
      './base.json': tsconfigWith({}, { noUnusedLocals: true }),
      './tsconfig.json': JSON.stringify({
        extends: './base.json',
        compilerOptions: {
          plugins: [{ name: 'ts-migrating', compilerOptions: { strict: true } }],
        },
        include: ['src'],
      }),
      './src/index.ts': source,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'src/index.ts')))).toEqual(expected);
  });
});

describe('project references', () => {
  it('does not report spurious errors for code imported from a referenced project', () => {
    const dir = setupTmpDir({
      './lib/tsconfig.json': JSON.stringify({
        compilerOptions: { composite: true, strict: false, outDir: 'dist', rootDir: 'src' },
        include: ['src'],
      }),
      // would fail `strict`, but lib is a different project
      './lib/src/index.ts':
        'export function id(x) {\n  return x;\n}\nexport const greet = (name: string) => name;\n',
      './app/tsconfig.json': tsconfigWith(
        { rootDir: 'src', outDir: 'dist' },
        { strict: true },
        { references: [{ path: '../lib' }] },
      ),
      './app/src/index.ts': `import { greet, id } from '../../lib/src/index';
export const a = id(1);
export const b = greet('hi');
export const c = greet(undefined);
`,
    });

    expect(summarize(getTsMigratingReportForFile(join(dir, 'app/src/index.ts')))).toEqual([
      { origin: 'ts-migrating', marked: false, code: 2345, line: 4 },
    ]);
  });
  // TypeScript 7.1.0-beta's native process crashes when such a file is opened,
  // see ../engine/isOutsideReferencedProjects.ts
  it('skips files outside every project of a solution-style tsconfig', () => {
    const dir = setupTmpDir({
      './tsconfig.json': JSON.stringify({
        files: [],
        references: [{ path: './tsconfig.app.json' }],
      }),
      './tsconfig.app.json': tsconfigWith({ composite: true }, { strict: true }),
      './src/index.ts': 'export const f = (x) => x;\n',
      './vitest.config.ts': 'export default (x) => x;\n',
    });

    const reports = [
      ...getTsMigratingReportForFiles([join(dir, 'vitest.config.ts'), join(dir, 'src/index.ts')]),
    ];
    expect(
      reports.map(({ fileName, entries }) => [fileName.slice(dir.length), summarize(entries)]),
    ).toEqual([
      ['/src/index.ts', [{ origin: 'ts-migrating', marked: false, code: 7006, line: 1 }]],
    ]);
  });
});

describe('getTsMigratingReportForFiles', () => {
  it('reports files across projects, skipping the ones without the plugin', () => {
    const dir = setupTmpDir({
      './a/tsconfig.json': noImplicitAnyTsconfig,
      './a/src/index.ts': 'export const f = (x) => x;\n',
      './b/tsconfig.json': erasableSyntaxOnlyTsconfig,
      './b/src/index.ts': 'export enum E { A }\n',
      './b/src/other.ts': 'export const ok = 1;\n',
      './c/tsconfig.json': JSON.stringify({ compilerOptions: { strict: true }, include: ['src'] }),
      './c/src/index.ts': 'export const f = (x) => x;\n',
    });

    const reports = [
      ...getTsMigratingReportForFiles([
        join(dir, 'a/src/index.ts'),
        join(dir, 'b/src/index.ts'),
        join(dir, 'c/src/index.ts'),
        join(dir, 'b/src/other.ts'),
      ]),
    ];

    expect(
      reports.map(({ fileName, entries }) => [fileName.slice(dir.length), summarize(entries)]),
    ).toEqual([
      ['/a/src/index.ts', [{ origin: 'ts-migrating', marked: false, code: 7006, line: 1 }]],
      ['/b/src/index.ts', [{ origin: 'ts-migrating', marked: false, code: 1294, line: 1 }]],
      ['/b/src/other.ts', []],
    ]);
  });
});
