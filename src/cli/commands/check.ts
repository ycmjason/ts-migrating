import ts from 'typescript/lib/tsserverlibrary';
import { getSemanticDiagnosticsForFile } from '../../api/getSemanticDiagnostics';
import { isPluginDiagnostic } from '../../api/isPluginDiagnostic';
import { expandTSFilePaths } from '../expandTSFilePaths';

export const check = async ({ verbose }: { verbose: boolean }, ...inputPaths: string[]) => {
  const files = expandTSFilePaths(inputPaths);
  console.log(
    `🔎 Type checking ${files.length} file${files.length === 1 ? '' : 's'}...${!verbose ? ' (use -v or --verbose to list all files)' : ''}`,
  );
  if (verbose) {
    console.log('Files to check:');
    console.log(files.map(file => `  • ${file}`).join('\n'));
  }

  let diagnosticCount = 0;

  console.time('Type checking duration');
  for (const file of files) {
    const diagnostics = getSemanticDiagnosticsForFile(file);
    diagnosticCount += diagnostics.filter(d => isPluginDiagnostic(d)).length;

    if (diagnostics.length > 0) {
      console.log(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: fileName => fileName,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => ts.sys.newLine,
        }),
      );
    }
  }
  console.timeEnd('Type checking duration');

  if (diagnosticCount > 0) {
    console.error(`❌ ${diagnosticCount} unmarked error${diagnosticCount === 1 ? '' : 's'} found.`);
    process.exit(1);
  } else {
    console.log('✅ No unmarked errors found.');
    process.exit(0);
  }
};
