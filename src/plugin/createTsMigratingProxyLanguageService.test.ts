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

  describe('getTsMigratingReport', () => {
    const fileName = '/proj/index.ts';
    // Two newly-introduced errors; the directive on the middle line marks the
    // second statement, so it should come back as `marked` migration debt.
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

    const buildReportProxy = ({ baseline }: { baseline: ts.Diagnostic[] }) => {
      const fromLanguageService = {
        getSemanticDiagnostics: () => baseline,
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
        getSemanticDiagnostics: () => [...baseline, errorAt('obj[0]'), errorAt('obj[1]')],
      } as unknown as ts.LanguageService;

      return createTsMigratingProxyLanguageService({ ts, fromLanguageService, toLanguageService });
    };

    it('partitions diagnostics into baseline, unmarked and marked', () => {
      const baseline = [errorAt('const a')];
      const report = buildReportProxy({ baseline }).getTsMigratingReport(fileName);

      const summarise = (origin: 'baseline' | 'ts-migrating', marked: boolean) =>
        report
          .filter(e => e.origin === origin && e.markedWithTsMigratingDirective === marked)
          .map(e => e.diagnostic.start);

      // baseline error passes through untouched
      expect(summarise('baseline', false)).toEqual([content.indexOf('const a')]);
      // `obj[0]` has no directive -> unmarked (this is what `check` fails on)
      expect(summarise('ts-migrating', false)).toEqual([content.indexOf('obj[0]')]);
      // `obj[1]` sits under the directive -> marked debt, and it keeps its code
      expect(summarise('ts-migrating', true)).toEqual([content.indexOf('obj[1]')]);
      expect(report.find(e => e.markedWithTsMigratingDirective)?.diagnostic.code).toBe(18048);
    });

    it('marked entries are exactly the ones hidden from getSemanticDiagnostics', () => {
      const proxy = buildReportProxy({ baseline: [] });

      const reportedToEditor = proxy.getSemanticDiagnostics(fileName).filter(isPluginDiagnostic);
      const marked = proxy
        .getTsMigratingReport(fileName)
        .filter(e => e.markedWithTsMigratingDirective);

      // the editor/CLI sees only the single unmarked error...
      expect(reportedToEditor).toHaveLength(1);
      // ...while the report additionally exposes the suppressed (marked) one.
      expect(marked).toHaveLength(1);
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
