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

/**
 * The base `LanguageService` plus ts-migrating's accessor for the *marked* debt:
 * the errors the target config introduces on lines annotated with
 * `@ts-migrating`. These are deliberately suppressed from `getSemanticDiagnostics`
 * (so editors stay quiet), so the report reads them from here.
 */
export type TsMigratingLanguageService = TsServerLibrary.LanguageService & {
  getTsMigratingMarkedDebt: (fileName: string) => TsServerLibrary.Diagnostic[];
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
   * Both `getSemanticDiagnostics` and `getTsMigratingMarkedDebt` build on this.
   * The expensive target-config type-check is cached by the language service, so
   * calling both for a file doesn't re-run it.
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
    // The newly-introduced errors on `@ts-migrating`-annotated lines. They're
    // suppressed from `getSemanticDiagnostics` (so editors stay quiet), so the
    // report reads them from here to surface acknowledged migration debt.
    getTsMigratingMarkedDebt: (fileName: string) => analyzeFile(fileName).plugin?.marked ?? [],
  });
};
