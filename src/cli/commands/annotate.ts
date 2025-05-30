import fs from 'node:fs/promises';
import { getSemanticDiagnosticsForFile } from '../../api/getSemanticDiagnostics';
import { isPluginDiagnostic } from '../../api/isPluginDiagnostic';
import { getLineNumberGivenPosition } from '../../api/utils/getLineNumberGivenPosition';
import { DIRECTIVE } from '../../plugin/constants/DIRECTIVE';
import { UNUSED_DIRECTIVE_DIAGNOSTIC_CODE } from '../../plugin/constants/UNUSED_DIRECTIVE_DIAGNOSTIC_CODE';
import { ANNOTATE_WARNING } from '../constants/annotate-warning';
import { getPluginEnabledTSFilePaths } from '../ops/getPluginEnabledTSFilePaths';

export const annotate = async ({ verbose }: { verbose: boolean }, ...inputPaths: string[]) => {
  const files = getPluginEnabledTSFilePaths(inputPaths, { verbose });

  console.log(ANNOTATE_WARNING);

  console.log('⏳ Gathering errors introduced in your new tsconfig. This may take a while...');

  console.time('Type checking');
  const filePathAndPluginDiagnostics = files.map(filePath => ({
    filePath,
    diagnostics: getSemanticDiagnosticsForFile(filePath).filter(
      d => isPluginDiagnostic(d) && d.code !== UNUSED_DIRECTIVE_DIAGNOSTIC_CODE,
    ),
  }));
  console.timeEnd('Type checking');

  console.time('Annotation');
  await Promise.all(
    filePathAndPluginDiagnostics.map(async ({ filePath, diagnostics }) => {
      const lines = (await fs.readFile(filePath, 'utf8')).split('\n');
      const lineNumbersToAnnotate = new Set([
        ...diagnostics.map(diagnostic => {
          if (typeof diagnostic.start !== 'number') {
            throw new TypeError('Expect diagnostic.start is a number');
          }

          return getLineNumberGivenPosition(lines, diagnostic.start);
        }),
      ]);

      const modedLines = lines.flatMap((line, lineNumber) => {
        if (!lineNumbersToAnnotate.has(lineNumber)) {
          return [line];
        }
        return [`// ${DIRECTIVE}`, line];
      });

      await fs.writeFile(filePath, modedLines.join('\n'));
      console.log(
        `✅ Annotated ${filePath} (${diagnostics.length} directive${diagnostics.length === 1 ? '' : 's'} added)`,
      );
    }),
  );
  console.timeEnd('Annotation');

  console.log(
    '✨ Annotation complete! Please run your formatter and linter to clean up the code. Manual review may still be required for some files.',
  );
};
