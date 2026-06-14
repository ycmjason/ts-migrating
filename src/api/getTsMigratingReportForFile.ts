import type { TsMigratingReportEntry } from '../plugin/createTsMigratingProxyLanguageService';
import { withLanguageServiceForFile } from './typescript/withLanguageServiceForFile';

/**
 * Returns every semantic diagnostic for a file, each annotated with its
 * {@link TsMigratingReportEntry.origin} (`ts-migrating` vs `baseline`) and
 * whether it is suppressed by a `@ts-migrating` directive.
 *
 * Unlike `getSemanticDiagnosticsForFile`, this also includes the errors that are
 * *marked* with a directive (i.e. the migration debt), which the language
 * service otherwise hides.
 *
 * Returns `[]` if the tsconfig for the file does not list `ts-migrating` in the plugin.
 */
export function getTsMigratingReportForFile(targetFile: string): TsMigratingReportEntry[] {
  return (
    withLanguageServiceForFile(targetFile, (languageService, file) =>
      languageService.getTsMigratingReport(file),
    ) ?? []
  );
}
