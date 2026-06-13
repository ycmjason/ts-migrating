import type TsServerLibrary from 'typescript/lib/tsserverlibrary';
import { DIRECTIVE } from './constants/DIRECTIVE';
import { UNUSED_DIRECTIVE_DIAGNOSTIC_CODE } from './constants/UNUSED_DIRECTIVE_DIAGNOSTIC_CODE';
import { createOverwritingProxy } from './createOverwritingProxy';
import { isCheckableSourceFile } from './isCheckableSourceFile';
import { differenceBy } from './utils/collections';
import {
  brandifyDiagnostic,
  getUnmarkedDiagnostics,
  getUnusedDirectiveComments,
  serializeDiagnostic,
} from './utils/diagnostics';

/** Which config surfaced a diagnostic. */
export type DiagnosticOrigin =
  /** Introduced by the tsconfig you are migrating *to* (the plugin's config). */
  | 'ts-migrating'
  /** Already present under your current tsconfig — would fail `tsc` today. */
  | 'baseline';

/** A single diagnostic, annotated with how ts-migrating sees it. */
export type TsMigratingReportEntry = {
  diagnostic: TsServerLibrary.Diagnostic;
  origin: DiagnosticOrigin;
  /**
   * `true` when this is a `ts-migrating` error sitting on a line marked with a
   * `@ts-migrating` directive — i.e. acknowledged migration debt that `check`
   * deliberately suppresses. Always `false` for `baseline` errors (directives
   * do not suppress those).
   */
  markedWithTsMigratingDirective: boolean;
};

/** The base `LanguageService` plus ts-migrating's own reporting accessor. */
export type TsMigratingLanguageService = TsServerLibrary.LanguageService & {
  getTsMigratingReport: (fileName: string) => TsMigratingReportEntry[];
};

export const createTsMigratingProxyLanguageService = ({
  ts,
  fromLanguageService,
  toLanguageService,
}: {
  ts: typeof TsServerLibrary;
  fromLanguageService: TsServerLibrary.LanguageService;
  toLanguageService: TsServerLibrary.LanguageService;
}): TsMigratingLanguageService => {
  /**
   * Run both configs over `fileName` and split the result into:
   * - `baseline`: errors from the current tsconfig (the `from` service).
   * - `plugin` (only for checkable files): the errors the target tsconfig
   *   *adds*, partitioned into `unmarked`/`marked` by `@ts-migrating` directives,
   *   plus the synthetic `unusedDirectives` warnings.
   *
   * Both `getSemanticDiagnostics` and `getTsMigratingReport` build on this, so
   * the expensive second type-check happens once per call site.
   */
  const analyzeFile = (fileName: string) => {
    const baseline = fromLanguageService.getSemanticDiagnostics(fileName);

    // Other language-service plugins own non-TS/JS files — most notably the
    // Angular Language Service owns `.html` templates. Our secondary service
    // has none of those plugins, so running it over such a file would parse
    // the file as plain TypeScript and surface bogus errors.
    // https://github.com/ycmjason/ts-migrating/issues/14
    if (!isCheckableSourceFile(fileName)) return { baseline, plugin: undefined };

    const sourceFile = fromLanguageService.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) return { baseline, plugin: undefined };

    const getLineNumberByPosition = (position: number): number =>
      sourceFile.getLineAndCharacterOfPosition(position).line;

    const newlyIntroducedDiagnostics = differenceBy(
      toLanguageService.getSemanticDiagnostics(fileName),
      baseline,
      serializeDiagnostic,
    );

    const directiveComments = fromLanguageService
      .getTodoComments(fileName, [{ text: DIRECTIVE, priority: 0 }])
      .filter(({ message }) => new RegExp(`^${DIRECTIVE}(\\s|$)`).test(message));

    const unmarked = getUnmarkedDiagnostics(newlyIntroducedDiagnostics, {
      sourceFile,
      directiveComments,
      getLineNumberByPosition,
    });
    // `unmarked` keeps the original element references, so identity lookup tells
    // us which newly-introduced errors were suppressed by a directive.
    const unmarkedSet = new Set<TsServerLibrary.Diagnostic>(unmarked);
    const marked = newlyIntroducedDiagnostics.filter(d => !unmarkedSet.has(d));

    const unusedDirectives = getUnusedDirectiveComments(directiveComments, {
      sourceFile,
      newlyIntroducedDiagnostics,
      getLineNumberByPosition,
    }).map(({ position, descriptor }) => ({
      category: ts.DiagnosticCategory.Error,
      code: UNUSED_DIRECTIVE_DIAGNOSTIC_CODE,
      file: sourceFile,
      start: position,
      length: descriptor.text.length,
      messageText: `Unused '${descriptor.text}' directive.`,
    }));

    return { baseline, plugin: { unmarked, marked, unusedDirectives } };
  };

  return createOverwritingProxy(fromLanguageService, {
    /**
     * A project only disposes its (proxied) primary language service when it
     * closes, which would leave our secondary service holding references to
     * every source file it acquired from the shared document registry. Those
     * references keep the source files ref-counted — and therefore alive — for
     * the rest of the process, accumulating across projects. Dispose the
     * secondary service too so it releases them. See
     * https://github.com/ycmjason/ts-migrating/issues/16
     */
    dispose: () => {
      toLanguageService.dispose();
      fromLanguageService.dispose();
    },
    getQuickInfoAtPosition: (...attrs) => toLanguageService.getQuickInfoAtPosition(...attrs),
    getSemanticDiagnostics: fileName => {
      const { baseline, plugin } = analyzeFile(fileName);
      if (!plugin) return baseline;

      const pluginDiagnostics = [...plugin.unmarked, ...plugin.unusedDirectives].map(
        brandifyDiagnostic,
      );

      return [...baseline, ...pluginDiagnostics];
    },
    getTsMigratingReport: (fileName: string) => {
      const { baseline, plugin } = analyzeFile(fileName);

      const entries: TsMigratingReportEntry[] = baseline.map(diagnostic => ({
        diagnostic,
        origin: 'baseline' as const,
        markedWithTsMigratingDirective: false,
      }));

      if (plugin) {
        for (const diagnostic of plugin.unmarked) {
          entries.push({
            diagnostic,
            origin: 'ts-migrating',
            markedWithTsMigratingDirective: false,
          });
        }
        for (const diagnostic of plugin.marked) {
          entries.push({
            diagnostic,
            origin: 'ts-migrating',
            markedWithTsMigratingDirective: true,
          });
        }
      }

      return entries;
    },
  });
};
