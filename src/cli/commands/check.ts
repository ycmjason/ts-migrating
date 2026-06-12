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

  // Keep running counts only. Holding on to every diagnostic for the whole run
  // pins each one's `SourceFile` and message chain, which adds up to a lot of
  // memory on large repos. See https://github.com/ycmjason/ts-migrating/issues/16
  let totalErrorCount = 0;
  let pluginErrorCount = 0;

  console.time('Type checking duration');
  for (const file of pluginEnabledFiles) {
    const diagnostics = getSemanticDiagnosticsForFile(file);
    totalErrorCount += diagnostics.length;

    const pluginDiagnostics = diagnostics.filter(isPluginDiagnostic);
    pluginErrorCount += pluginDiagnostics.length;

    const diagnosticsToReport = isCheckingAllTypeErrors ? diagnostics : pluginDiagnostics;
    if (diagnosticsToReport.length > 0) {
      console.log(
        ts.formatDiagnosticsWithColorAndContext(diagnosticsToReport, {
          getCanonicalFileName: fileName => fileName,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => ts.sys.newLine,
        }),
      );
    }
  }
  console.timeEnd('Type checking duration');

  if (isCheckingAllTypeErrors) {
    if (totalErrorCount > 0) {
      console.error(`❌ ${totalErrorCount} type error${totalErrorCount === 1 ? '' : 's'} found.`);
    } else {
      console.log('✅ No type errors found.');
    }
  }

  if (pluginErrorCount > 0) {
    console.error(
      `❌ ${pluginErrorCount} unmarked plugin error${pluginErrorCount === 1 ? '' : 's'} found. Run \`npx ts-migrating annotate\` to automatically mark them!`,
    );
  } else {
    console.log('✅ No unmarked plugin errors found.');
  }

  process.exit(Math.min(isCheckingAllTypeErrors ? totalErrorCount : pluginErrorCount, 1));
};
