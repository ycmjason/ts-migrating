import ts from 'typescript/lib/tsserverlibrary';
import { describe, expect, it } from 'vitest';
import { isPluginDiagnostic } from '../api/isPluginDiagnostic';
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
});
