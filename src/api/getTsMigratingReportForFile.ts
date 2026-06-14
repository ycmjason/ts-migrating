import type ts from 'typescript/lib/tsserverlibrary';
import { unbrandDiagnostic } from '../plugin/utils/diagnostics';
import { isPluginDiagnostic } from './isPluginDiagnostic';
import { withLanguageServiceForFile } from './typescript/withLanguageServiceForFile';

/** Which config surfaced a diagnostic. */
export type DiagnosticOrigin =
  /** Introduced by the tsconfig you are migrating *to* (the plugin's config). */
  | 'ts-migrating'
  /**
   * Already present in your project before the migration — i.e. from your current
   * tsconfig (and any other language-service plugins), not the target config.
   */
  | 'baseline';

/** A single diagnostic, annotated with how ts-migrating sees it. */
export type TsMigratingReportEntry = {
  diagnostic: ts.Diagnostic;
  origin: DiagnosticOrigin;
  /**
   * `true` when this is a `ts-migrating` error on a line marked with a
   * `@ts-migrating` directive — acknowledged migration debt that `check`
   * suppresses. Always `false` for `baseline` errors.
   */
  markedWithTsMigratingDirective: boolean;
};

/**
 * Returns every diagnostic for a file, annotated with its {@link DiagnosticOrigin}
 * and whether a `@ts-migrating` directive marks it.
 *
 * The active diagnostics come from the project's *full* language-service chain,
 * so errors from other plugins are included too — ts-migrating's own are tagged
 * `ts-migrating`, everything else `baseline`. The *marked* debt (errors the
 * target config introduces but `@ts-migrating` suppresses) is read separately,
 * since it's deliberately hidden from `getSemanticDiagnostics`.
 *
 * Returns `[]` if the tsconfig for the file does not list `ts-migrating` in the plugin.
 */
export function getTsMigratingReportForFile(targetFile: string): TsMigratingReportEntry[] {
  return (
    withLanguageServiceForFile(targetFile, (languageService, file) => {
      const entries: TsMigratingReportEntry[] = [];

      for (const diagnostic of languageService.getSemanticDiagnostics(file)) {
        const isTsMigrating = isPluginDiagnostic(diagnostic);
        entries.push({
          diagnostic: isTsMigrating ? unbrandDiagnostic(diagnostic) : diagnostic,
          origin: isTsMigrating ? 'ts-migrating' : 'baseline',
          markedWithTsMigratingDirective: false,
        });
      }

      for (const diagnostic of languageService.getTsMigratingMarkedDebt(file)) {
        entries.push({ diagnostic, origin: 'ts-migrating', markedWithTsMigratingDirective: true });
      }

      return entries;
    }) ?? []
  );
}
