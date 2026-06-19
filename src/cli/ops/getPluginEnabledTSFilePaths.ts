import { getTSInfoForFile } from '../../api/getTSInfoForFile';
import { expandTSFilePaths } from '../expandTSFilePaths';

export const getPluginEnabledTSFilePaths = (
  inputPaths: string[],
  // `log` lets the JSON reporter divert progress chatter to stderr so stdout
  // stays a clean JSON document. Defaults to stdout for the human reporters.
  { verbose, log = console.log }: { verbose: boolean; log?: (...args: unknown[]) => void },
): string[] => {
  log('🔎  Looking for ts-migrating enabled TypeScript files...');
  const pluginEnabledFiles = expandTSFilePaths(inputPaths.length <= 0 ? ['.'] : inputPaths)
    .flatMap(path => {
      const { pluginEnabled, tsconfigPath } = getTSInfoForFile(path);
      if (!pluginEnabled) {
        if (verbose) {
          console.warn(`⚠️ Skipping "${path}" (tsconfig missing ts-migrating plugin).`);
        }
        return [];
      }
      return [{ path, tsconfigPath }];
    })
    // Group files by their tsconfig so that consecutive files share a project.
    // `getSemanticDiagnosticsForFile` tears down and rebuilds the underlying
    // TypeScript project (both language services) whenever the next file belongs
    // to a different project. Processing files grouped by tsconfig keeps that to
    // one build per project instead of one per file, which would otherwise blow
    // up both time and memory on repos with multiple tsconfigs interleaved in
    // glob order. See https://github.com/ycmjason/ts-migrating/issues/16
    .sort((a, b) => a.tsconfigPath.localeCompare(b.tsconfigPath))
    .map(({ path }) => path);

  const fileCount = pluginEnabledFiles.length;
  log(
    `👀 ${fileCount} file${fileCount === 1 ? '' : 's'} found${!verbose ? ' (use -v or --verbose to list files)' : ':'}`,
  );

  if (verbose && fileCount > 0) {
    for (const file of pluginEnabledFiles) {
      log(`  • ${file}`);
    }
  }

  log();

  return pluginEnabledFiles;
};
