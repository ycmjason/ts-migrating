import { getTSInfoForFile } from '../../api/getTSInfoForFile';
import { expandTSFilePaths } from '../expandTSFilePaths';

export const getPluginEnabledTSFilePaths = (
  inputPaths: string[],
  { verbose }: { verbose: boolean },
): string[] => {
  console.log('🔎  Looking for ts-migrating enabled TypeScript files...');
  const pluginEnabledFiles = expandTSFilePaths(inputPaths.length <= 0 ? ['.'] : inputPaths).filter(
    path => {
      const { pluginEnabled } = getTSInfoForFile(path);
      if (verbose && !pluginEnabled) {
        console.warn(`⚠️ Skipping "${path}" (tsconfig missing ts-migrating plugin).`);
      }
      return pluginEnabled;
    },
  );

  const fileCount = pluginEnabledFiles.length;
  console.log(
    `👀 ${fileCount} file${fileCount === 1 ? '' : 's'} found${!verbose ? ' (use -v or --verbose to list files)' : ':'}`,
  );

  if (verbose && fileCount > 0) {
    for (const file of pluginEnabledFiles) {
      console.log(`  • ${file}`);
    }
  }

  console.log();

  return pluginEnabledFiles;
};
