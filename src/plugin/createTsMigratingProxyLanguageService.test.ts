import ts from 'typescript/lib/tsserverlibrary';
import { describe, expect, it, vi } from 'vitest';
import { isPluginDiagnostic } from '../api/isPluginDiagnostic';
import { DIRECTIVE } from './constants/DIRECTIVE';
import { createTsMigratingProxyLanguageService } from './createTsMigratingProxyLanguageService';

const sourceFileOf = (fileName: string, content: string): ts.SourceFile =>
  ts.createSourceFile(fileName, content, ts.ScriptTarget.ESNext, true);

const parseDiagnosticsOf = (sourceFile: ts.SourceFile): ts.Diagnostic[] =>
  ((sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ??
    []) as ts.Diagnostic[];

const fakeError = (file: ts.SourceFile): ts.Diagnostic => ({
  category: ts.DiagnosticCategory.Error,
  code: 2304,
  file,
  start: 0,
  length: 1,
  messageText: "Cannot find name 'x'.",
});

/**
 * Builds the proxy with a base (`from`) service that exposes `sourceFile` for
 * `fileName` and reports no plain-TS errors for it — mirroring an Angular-aware
 * service whose `.html` template is in the program — and a secondary (`to`)
 * service that would report `secondaryDiagnostics` for that file.
 */
const buildProxy = ({
  fileName,
  sourceFile,
  secondaryDiagnostics,
}: {
  fileName: string;
  sourceFile: ts.SourceFile;
  secondaryDiagnostics: ts.Diagnostic[];
}): ts.LanguageService => {
  const fromLanguageService = {
    getSemanticDiagnostics: () => [],
    getTodoComments: () => [],
    getProgram: () => ({
      getSourceFile: (f: string) => (f === fileName ? sourceFile : undefined),
    }),
  } as unknown as ts.LanguageService;

  const toLanguageService = {
    getSemanticDiagnostics: (f: string) => (f === fileName ? secondaryDiagnostics : []),
  } as unknown as ts.LanguageService;

  return createTsMigratingProxyLanguageService({ ts, fromLanguageService, toLanguageService });
};

describe('createTsMigratingProxyLanguageService', () => {
  // https://github.com/ycmjason/ts-migrating/issues/14
  it('does not surface diagnostics for non-TS/JS files (e.g. Angular .html templates)', () => {
    const fileName = '/proj/app.component.html';
    const sourceFile = sourceFileOf(fileName, '<div class="title">{{ title }}</div>\n');
    const secondaryDiagnostics = parseDiagnosticsOf(sourceFile);

    // sanity check: parsing the template as TS really does produce errors, so a
    // missing guard would surface them.
    expect(secondaryDiagnostics.length).toBeGreaterThan(0);

    const proxy = buildProxy({ fileName, sourceFile, secondaryDiagnostics });
    const pluginDiagnostics = proxy.getSemanticDiagnostics(fileName).filter(isPluginDiagnostic);

    expect(pluginDiagnostics).toEqual([]);
  });

  it.each([
    '/proj/app.component.ts',
    '/proj/widget.tsx',
    '/proj/legacy.js',
    '/proj/legacy.jsx',
    '/proj/util.mts',
    '/proj/util.cjs',
  ])('still surfaces newly-introduced target-config errors for %s', fileName => {
    const sourceFile = sourceFileOf(fileName, 'export const value = 1;\n');
    const secondaryDiagnostics = [fakeError(sourceFile)];

    const proxy = buildProxy({ fileName, sourceFile, secondaryDiagnostics });
    const pluginDiagnostics = proxy.getSemanticDiagnostics(fileName).filter(isPluginDiagnostic);

    expect(pluginDiagnostics).toHaveLength(1);
  });

  describe('getTsMigratingMarkedDebt', () => {
    const fileName = '/proj/index.ts';
    // Two newly-introduced errors; the directive on the middle line marks the
    // second statement, so only that one is "marked debt".
    const content = ['const a = obj[0];', '// @ts-migrating', 'const b = obj[1];', ''].join('\n');
    const sourceFile = sourceFileOf(fileName, content);

    const errorAt = (needle: string): ts.Diagnostic => ({
      category: ts.DiagnosticCategory.Error,
      code: 18048,
      file: sourceFile,
      start: content.indexOf(needle),
      length: needle.length,
      messageText: `'${needle}' is possibly 'undefined'.`,
    });

    const buildMarkedDebtProxy = () => {
      const fromLanguageService = {
        getSemanticDiagnostics: () => [],
        getTodoComments: () => [
          {
            descriptor: { text: DIRECTIVE, priority: 0 },
            message: DIRECTIVE,
            position: content.indexOf(DIRECTIVE),
          },
        ],
        getProgram: () => ({
          getSourceFile: (f: string) => (f === fileName ? sourceFile : undefined),
        }),
      } as unknown as ts.LanguageService;

      const toLanguageService = {
        getSemanticDiagnostics: () => [errorAt('obj[0]'), errorAt('obj[1]')],
      } as unknown as ts.LanguageService;

      return createTsMigratingProxyLanguageService({ ts, fromLanguageService, toLanguageService });
    };

    it('returns newly-introduced errors on @ts-migrating-marked lines, with codes', () => {
      const marked = buildMarkedDebtProxy().getTsMigratingMarkedDebt(fileName);
      // only `obj[1]` (under the directive) is marked debt; `obj[0]` is unmarked
      expect(marked.map(d => d.start)).toEqual([content.indexOf('obj[1]')]);
      expect(marked[0]?.code).toBe(18048);
    });

    it('exposes exactly what getSemanticDiagnostics hides', () => {
      const proxy = buildMarkedDebtProxy();
      const shownToEditor = proxy.getSemanticDiagnostics(fileName).filter(isPluginDiagnostic);
      const markedDebt = proxy.getTsMigratingMarkedDebt(fileName);

      // the editor/CLI sees only the unmarked error; the marked one is suppressed...
      expect(shownToEditor).toHaveLength(1);
      // ...and surfaced only via getTsMigratingMarkedDebt.
      expect(markedDebt).toHaveLength(1);
    });

    // A later plugin may re-wrap our service by copying its enumerable keys (the
    // TS plugin-wiki pattern); the custom accessor must survive that or
    // `check --reporter json` would crash downstream.
    it('exposes getTsMigratingMarkedDebt to own-key enumeration and copy-wrapping', () => {
      const proxy = buildMarkedDebtProxy();
      expect(Object.keys(proxy)).toContain('getTsMigratingMarkedDebt');

      const rewrapped = Object.fromEntries(
        Object.keys(proxy).map(key => {
          const value = (proxy as unknown as Record<string, unknown>)[key];
          return [key, typeof value === 'function' ? value.bind(proxy) : value];
        }),
      ) as unknown as { getTsMigratingMarkedDebt: (fileName: string) => unknown[] };

      expect(typeof rewrapped.getTsMigratingMarkedDebt).toBe('function');
      expect(rewrapped.getTsMigratingMarkedDebt(fileName).length).toBeGreaterThan(0);
    });
  });

  // https://github.com/ycmjason/ts-migrating/issues/16
  // The secondary service shares the project's document registry, so it must
  // release its documents when the project disposes the (proxied) primary
  // service — otherwise those source files stay ref-counted and accumulate
  // across projects.
  it('disposes the secondary service alongside the primary one', () => {
    const fromLanguageService = { dispose: vi.fn() } as unknown as ts.LanguageService;
    const toLanguageService = { dispose: vi.fn() } as unknown as ts.LanguageService;

    const proxy = createTsMigratingProxyLanguageService({
      ts,
      fromLanguageService,
      toLanguageService,
    });

    proxy.dispose();

    expect(toLanguageService.dispose).toHaveBeenCalledTimes(1);
    expect(fromLanguageService.dispose).toHaveBeenCalledTimes(1);
  });
});
