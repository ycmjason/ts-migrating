import ts from 'typescript/lib/tsserverlibrary';
import { getSemanticDiagnosticsForFile } from '../../api/getSemanticDiagnostics';
import { isPluginDiagnostic } from '../../api/isPluginDiagnostic';
import { getPluginEnabledTSFilePaths } from '../ops/getPluginEnabledTSFilePaths';

export const check = async (
  { verbose, allTypeErrors: isCheckingAllTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
) => {
  const pluginEnabledFiles = getPluginEnabledTSFilePaths(inputPaths, { verbose });

  console.log(
    `⏳ Checking for ${isCheckingAllTypeErrors ? 'all TypeScript errors' : '[ts-migrating] plugin errors only'}...`,
  );

  console.log();

  const allDiagnostics: ts.Diagnostic[] = [];

  console.time('Type checking duration');
  for (const file of pluginEnabledFiles) {
    const diagnostics = getSemanticDiagnosticsForFile(file);
    allDiagnostics.push(...diagnostics);

    if (diagnostics.length > 0) {
      console.log(
        ts.formatDiagnosticsWithColorAndContext(
          diagnostics.filter(d => {
            if (isCheckingAllTypeErrors) return true;
            return isPluginDiagnostic(d);
          }),
          {
            getCanonicalFileName: fileName => fileName,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => ts.sys.newLine,
          },
        ),
      );
    }
  }
  console.timeEnd('Type checking duration');

  if (isCheckingAllTypeErrors) {
    if (allDiagnostics.length > 0) {
      console.error(
        `❌ ${allDiagnostics.length} type error${allDiagnostics.length === 1 ? '' : 's'} found.`,
      );
    } else {
      console.log('✅ No type errors found.');
    }
  }

  const pluginDiagnostics = allDiagnostics.filter(diagnostics => isPluginDiagnostic(diagnostics));

  if (pluginDiagnostics.length > 0) {
    console.error(
      `❌ ${pluginDiagnostics.length} unmarked plugin error${pluginDiagnostics.length === 1 ? '' : 's'} found. Run \`npx ts-migrating annotate\` to automatically mark them!`,
    );
  } else {
    console.log('✅ No unmarked plugin errors found.');
  }

  process.exit(Math.min((isCheckingAllTypeErrors ? allDiagnostics : pluginDiagnostics).length, 1));
};
