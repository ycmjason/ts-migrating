import type ts from 'typescript/lib/tsserverlibrary';
import { withLanguageServiceForFile } from './typescript/withLanguageServiceForFile';

/**
 * Returns a list of {@link ts.Diagnostic} of a given file.
 *
 * This function returns `[]` if the tsconfig for the file does not list `ts-migrating` in the plugin.
 */
export function getSemanticDiagnosticsForFile(targetFile: string): ts.Diagnostic[] {
  return (
    withLanguageServiceForFile(targetFile, (languageService, file) =>
      languageService.getSemanticDiagnostics(file),
    ) ?? []
  );
}
